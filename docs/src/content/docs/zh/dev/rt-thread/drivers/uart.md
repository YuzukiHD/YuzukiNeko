---
title: "UART 控制台与串口"
---

本 BSP 使用 `components/drivers/serial/device/8250/` 下的原生 DesignWare 8250 串口驱动。YuzukiNeko 使用 UART1（`0x02500400`），PB0 TX / PB1 RX、复用 4。EVB 的 UART3 PE8/PE9 在 YuzukiNeko 上用于 I2C0。

## 设备树与配置

```c
/ {
    aliases { serial1 = &uart1; };
    chosen { stdout-path = "serial1:115200n8"; };
};
&uart1 { status = "okay"; };
&uart3 { status = "disabled"; };
```

```text
CONFIG_RT_USING_SERIAL=y
CONFIG_RT_USING_SERIAL_V1=y
CONFIG_RT_SERIAL_8250=y
CONFIG_RT_SERIAL_8250_DW=y
CONFIG_RT_CONSOLE_DEVICE_NAME="uart1"
CONFIG_RT_SERIAL_RB_BUFSZ=128
```

DTS stdout-path 与 Kconfig 控制台名称应一致。`board.c` 通过 FDT early-console 缓冲早期输出，不再固定写 UART3 地址。使用合适的 3.3 V 串口适配器交叉连接 TX/RX 并连接 GND。COM4 是测试主机分配的端口号，不是固定接口编号。

## 原生串口调用

| API | 单位 / 用途 |
| --- | --- |
| `rt_device_find(name)` | 查找已注册 UART |
| `RT_DEVICE_CTRL_CONFIG` + `struct serial_configure` | 波特率、字长、校验和停止位 |
| `rt_device_open(..., RT_DEVICE_FLAG_INT_RX)` | 中断接收及原生环形缓冲 |
| `rt_device_set_rx_indicate()` | 接收通知，唤醒线程后再读取 |
| `rt_device_read()` / `rt_device_write()` | 返回字节数，检查短传输 |
| `rt_device_close()` | 释放本调用方持有的引用 |

## 完整发送示例

```c
#include <rtthread.h>
#include <rtdevice.h>
#include <string.h>
static int demo_uart_tx(int argc, char **argv)
{
    const char text[] = "UART1 native device write\r\n";
    rt_device_t uart = rt_device_find("uart1");
    rt_err_t ret;
    if (!uart) return -RT_ENOSYS;
    ret = rt_device_open(uart, RT_DEVICE_OFLAG_WRONLY);
    if (ret) return ret;
    rt_ssize_t sent = rt_device_write(uart, 0, text, strlen(text));
    rt_device_close(uart);
    return sent == (rt_ssize_t)strlen(text) ? 0 : -RT_EIO;
}
MSH_CMD_EXPORT(demo_uart_tx, Transmit through the native UART1 device);
```

保存为 `applications/demo_uart.c`，构建后从现有控制台运行 `demo_uart_tx`。示例增加一次打开引用并发送一行，不替换 FinSH 的 RX 回调。独立 UART 应用应先开启对应 DTS、释放引脚，使用 `RT_SERIAL_CONFIG_DEFAULT` 结构配置，再接入基于信号量的 RX 工作线程。FinSH 和应用不能同时消费 UART1 RX，否则会互相抢走字节。

## 完整中断接收示例

使用前在 DTS 启用并布线另一 UART；示例有意拒绝 UART1 和已打开的设备。保存为 `applications/demo_uart_rx.c`，调用 `demo_uart_rx <uart-name>`，十秒采集期间从另一适配器发送 115200 8N1 数据。回调只通知信号量，工作线程读取并打印。已挂起的信号量可避免读取为空到开始等待之间漏掉通知。

```c
#include <rtthread.h>
#include <rtdevice.h>
#include <string.h>
static struct rt_semaphore uart_demo_ready;
static rt_err_t demo_uart_rx_notify(rt_device_t dev, rt_size_t size)
{
    return rt_sem_release(&uart_demo_ready);
}
static int demo_uart_rx(int argc, char **argv)
{
    struct serial_configure cfg = RT_SERIAL_CONFIG_DEFAULT;
    rt_device_t dev;
    int ret;
    if (argc != 2 || !strcmp(argv[1], RT_CONSOLE_DEVICE_NAME)) return -RT_EINVAL;
    dev = rt_device_find(argv[1]);
    if (!dev || dev->type != RT_Device_Class_Char || dev->ref_count) return -RT_EBUSY;
    cfg.baud_rate = BAUD_RATE_115200;
    cfg.data_bits = DATA_BITS_8; cfg.stop_bits = STOP_BITS_1; cfg.parity = PARITY_NONE;
    ret = rt_device_control(dev, RT_DEVICE_CTRL_CONFIG, &cfg);
    if (ret) return ret;
    ret = rt_sem_init(&uart_demo_ready, "uart-demo", 0, RT_IPC_FLAG_FIFO);
    if (ret) return ret;
    ret = rt_device_open(dev, RT_DEVICE_OFLAG_RDONLY | RT_DEVICE_FLAG_INT_RX);
    if (ret) { rt_sem_detach(&uart_demo_ready); return ret; }
    rt_err_t (*saved)(rt_device_t, rt_size_t) = dev->rx_indicate;
    rt_device_set_rx_indicate(dev, demo_uart_rx_notify);
    rt_tick_t start = rt_tick_get();
    while (rt_tick_get() - start < 10 * RT_TICK_PER_SECOND)
    {
        rt_uint8_t buf[32];
        rt_ssize_t n = rt_device_read(dev, 0, buf, sizeof(buf));
        if (n < 0) { ret = (int)n; break; }
        if (n == 0) { rt_sem_take(&uart_demo_ready, RT_TICK_PER_SECOND); continue; }
        for (rt_ssize_t i = 0; i < n; ++i) rt_kprintf("%02x ", buf[i]);
        rt_kprintf("\n");
    }
    rt_device_set_rx_indicate(dev, saved);
    rt_device_close(dev);
    rt_sem_detach(&uart_demo_ready);
    return ret;
}
MSH_CMD_EXPORT(demo_uart_rx, Capture an exclusively owned non-console UART);
```

## 接收流程与排障

```mermaid
flowchart LR
    RX["RX FIFO IRQ"] --> RB["Serial ring buffer"]
    RB --> CB["rx_indicate: signal worker"]
    CB --> READ["Worker rt_device_read"]
    READ --> PARSE["Protocol parser"]
```

乱码优先检查波特率、时钟及电平。无日志时检查 DTS 身份、PB0/PB1 接线、helper 配置和供电。小接收环在持续流量下可能溢出，增大缓冲不能替代及时读取。本次回归实际观察到 UART1 启动和 shell 工作，不宣称完成了外部 UART 回环测试。
