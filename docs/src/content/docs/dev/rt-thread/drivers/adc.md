---
title: "GPADC sampling"
---

`drivers/adc/adc-sun252i.c` registers native `adc0`: twelve 12-bit channels, one selected channel at a time, continuous-conversion hardware with a polled completion. The controller uses a 24 MHz clock and a configured 1 MHz sample-rate divider; this is not a guaranteed application read throughput.

## Configuration and interfaces

Enable `CONFIG_RT_USING_ADC` and the SoC node with compatible `allwinner,sun252i-gpadc`. Preserve its clock/reset resources. Confirm the analog pin and voltage limits from the board schematic; channel indices are not header pin numbers. The driver selects a channel, clears completion, waits up to 10000 µs and returns a value masked to `0xfff`.

| Call | Contract |
| --- | --- |
| `rt_adc_enable(adc, channel)` | Validate channel 0–11; hardware remains continuously enabled |
| `rt_adc_read(adc, channel)` | Convenience unsigned sample; not a rich error-return API |
| `adc->ops->convert(adc, channel, &raw)` | Native driver operation with explicit timeout/error result |
| `rt_adc_disable(adc, channel)` | Validates channel; does not power down this controller |
| `rt_adc_voltage()` | Requires resolution/reference callbacks, absent in this BSP |

## Complete sample with error checking

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

## Flow and measurement limits

```mermaid
flowchart LR
    SEL["Select channel"] --> CLEAR["Clear pending completion"]
    CLEAR --> WAIT["Poll for conversion / timeout"]
    WAIT --> RAW["Read 12-bit sample"]
    RAW --> SCALE["Application calibration and voltage scaling"]
```

Save as `applications/demo_adc.c`, invoke `demo_adc`. Serialize conversion calls because the hardware channel selector is shared and the driver does not expose an independent conversion queue. Convert to millivolts only with the actual reference and board divider: approximately `raw * Vref_mV / 4095`, then apply divider/calibration. `test_adc` checks channel access and raw bounds, not analog accuracy against a calibrated source.
