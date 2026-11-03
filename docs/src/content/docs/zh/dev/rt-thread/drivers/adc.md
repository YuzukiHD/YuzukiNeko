---
title: "GPADC 采样"
---

`drivers/adc/adc-sun252i.c` 注册原生 `adc0`：12 个 12 位通道，每次选择一个通道，硬件连续转换、软件轮询完成。控制器使用 24 MHz 时钟和配置为 1 MHz 的采样分频，这不等于应用读取吞吐率。

## 配置与接口

开启 `CONFIG_RT_USING_ADC`，启用 compatible 为 `allwinner,sun252i-gpadc` 的 SoC 节点，保留时钟及复位资源。按原理图确认模拟引脚和允许电压，通道序号不是排针编号。驱动选择通道、清除完成位、最多等待 10000 µs，返回值屏蔽到 `0xfff`。

| 调用 | 契约 |
| --- | --- |
| `rt_adc_enable(adc, channel)` | 校验 0–11 通道，硬件保持连续开启 |
| `rt_adc_read(adc, channel)` | 返回无符号样本的便捷接口，不能完整表达错误 |
| `adc->ops->convert(adc, channel, &raw)` | 带显式超时/错误返回的原生驱动操作 |
| `rt_adc_disable(adc, channel)` | 校验通道，不关闭本控制器电源 |
| `rt_adc_voltage()` | 依赖本 BSP 未提供的分辨率/参考电压回调 |

## 完整带错误检查的采样示例

```c
#include <rtthread.h>
#include <rtdevice.h>
static int demo_adc(int argc, char **argv)
{
    rt_adc_device_t adc = (void *)rt_device_find("adc0");
    rt_uint32_t raw = 0;
    rt_err_t ret;
    if (!adc) return -RT_ENOSYS;
    ret = rt_adc_enable(adc, 0);
    if (ret) return ret;
    ret = adc->ops->convert(adc, 0, &raw);
    rt_adc_disable(adc, 0);
    if (!ret) rt_kprintf("ADC0 raw=%u / 4095\n", raw);
    return ret;
}
MSH_CMD_EXPORT(demo_adc, Read GPADC channel zero with explicit status);
```

## 流程与测量限制

```mermaid
flowchart LR
    SEL["Select channel"] --> CLEAR["Clear pending completion"]
    CLEAR --> WAIT["Poll for conversion / timeout"]
    WAIT --> RAW["Read 12-bit sample"]
    RAW --> SCALE["Application calibration and voltage scaling"]
```

保存为 `applications/demo_adc.c`，运行 `demo_adc`。硬件通道选择器共享，驱动没有独立转换队列，应串行执行转换。使用实际参考电压与板级分压换算毫伏：约为 `raw * Vref_mV / 4095`，再考虑分压及校准。`test_adc` 检查通道访问和原始值范围，不代表通过了校准电源的模拟精度验证。
