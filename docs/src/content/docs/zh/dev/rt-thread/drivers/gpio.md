---
title: "GPIO 与引脚复用"
---

原生 pin API 由 `drivers/pinctrl/pinctrl-sun252i.c` 提供。编号为 `bank * 32 + index`：PA0 为 0、PB0 为 32、PE5 为 133。驱动表示六个 bank，但编号存在不代表封装引出了该焊盘，应核对[板卡引脚](../../../hardware/pinout.md)与[复用表](../../../hardware/mux.md)。

## 配置与布线

开启 `CONFIG_RT_USING_PIN`、`CONFIG_RT_USING_PINCTRL`、`CONFIG_RT_USING_DM` 和 OFW。PIO compatible 为 `allwinner,sun252i-pio`。外设通过节点选择 pinctrl 组，应用只通过原生 pin API 操作自己拥有的引脚。UART1 PB0/PB1、I2C1 PD0/PD1、触摸 PD2/PD3、DSI PD12–PD21、背光 PD22、NOR PC0–PC5 和 SD PF0–PF5 已有用途。

```c
uart1_pins: uart1-pins {
    pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 0, 4)
              ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 1, 4)>;
};
&uart1 {
    pinctrl-names = "default";
    pinctrl-0 = <&uart1_pins>;
    status = "okay";
};
```

引脚组应放入 `&pio`，`&uart1` 覆盖位于文件顶层。`bias-pull-up`、`bias-pull-down`、`bias-disable` 和 `drive-strength` 配置焊盘属性；驱动强度表示控制器档位，不是毫安数。

## 接口

| 调用 | 行为 |
| --- | --- |
| `rt_pin_mode(pin, mode)` | 输入、上下拉、输出；切换为 GPIO 复用 |
| `rt_pin_write(pin, value)` / `rt_pin_read(pin)` | 设置/读取逻辑电平 |
| `rt_pin_attach_irq(pin, mode, callback, arg)` | 安装上升、下降、双边沿或电平处理函数 |
| `rt_pin_irq_enable(pin, enable)` | 屏蔽/打开已安装的中断 |
| `rt_pin_detach_irq(pin)` | 关闭中断后移除回调 |

## 完整示例：空闲焊盘

确认 PE5 未外接电路且未被应用使用。示例用内部上下拉产生边沿，回调只释放信号量。保存为 `applications/demo_gpio.c`，调用 `demo_gpio`。

```c
#include <rtthread.h>
#include <rtdevice.h>
#define DEMO_PIN (4 * 32 + 5)
static struct rt_semaphore gpio_edge;
static void demo_edge(void *arg) { rt_sem_release(&gpio_edge); }
static int demo_gpio(int argc, char **argv)
{
    rt_err_t ret = rt_sem_init(&gpio_edge, "edge", 0, RT_IPC_FLAG_FIFO);
    if (ret) return ret;
    rt_pin_mode(DEMO_PIN, PIN_MODE_INPUT_PULLDOWN);
    rt_thread_mdelay(5);
    ret = rt_pin_attach_irq(DEMO_PIN, PIN_IRQ_MODE_RISING, demo_edge, RT_NULL);
    if (!ret)
    {
        rt_pin_irq_enable(DEMO_PIN, PIN_IRQ_ENABLE);
        rt_pin_mode(DEMO_PIN, PIN_MODE_INPUT_PULLUP);
        ret = rt_sem_take(&gpio_edge, rt_tick_from_millisecond(100));
        rt_pin_irq_enable(DEMO_PIN, PIN_IRQ_DISABLE);
        rt_pin_detach_irq(DEMO_PIN);
    }
    rt_kprintf("edge=%d level=%d\n", ret, rt_pin_read(DEMO_PIN));
    rt_pin_mode(DEMO_PIN, PIN_MODE_INPUT);
    rt_sem_detach(&gpio_edge);
    return ret;
}
MSH_CMD_EXPORT(demo_gpio, GPIO pull and rising edge example);
```

## 中断流程与检查

```mermaid
flowchart LR
    PAD["Pad edge"] --> PIO["PIO status / PLIC"]
    PIO --> ISR["Clear pending, invoke callback"]
    ISR --> SEM["Release semaphore"]
    SEM --> TASK["Thread consumes event"]
```

用 `test_gpio` 检查电平、上下拉和两个边沿方向。电平中断重复触发通常表示外部源仍在有效电平。错误复用会断开外设，即使 GPIO 读回正常也不代表外设可用；测试后恢复原有设备的引脚所有权。
