---
title: "GPIO and pinctrl"
---

The native pin API is provided by `drivers/pinctrl/pinctrl-sun252i.c`. Pin numbers are `bank * 32 + index`: PA0 is 0, PB0 is 32 and PE5 is 133. Six banks are represented; a numeric slot does not prove a pad is bonded out. Check the [board pinout](../../../hardware/pinout.md) and [multiplexing table](../../../hardware/mux.md).

## Configuration and wiring

Enable `CONFIG_RT_USING_PIN`, `CONFIG_RT_USING_PINCTRL`, `CONFIG_RT_USING_DM` and OFW. The PIO compatible is `allwinner,sun252i-pio`. Peripheral nodes select pinctrl groups; applications use the native pin API only for pads they own. UART1 PB0/PB1, I2C1 PD0/PD1, touch PD2/PD3, DSI PD12–PD21, backlight PD22, NOR PC0–PC5 and SD PF0–PF5 are occupied.

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

The group belongs inside `&pio`; the `&uart1` override is at file scope. `bias-pull-up`, `bias-pull-down`, `bias-disable` and `drive-strength` configure pad properties. Drive strength is the controller level, not a current in mA.

## Interfaces

| Call | Behavior |
| --- | --- |
| `rt_pin_mode(pin, mode)` | Input, pull-up/down, output; changes the mux for GPIO |
| `rt_pin_write(pin, value)` / `rt_pin_read(pin)` | Set/read a logic level |
| `rt_pin_attach_irq(pin, mode, callback, arg)` | Install rising, falling, both-edge or level handler |
| `rt_pin_irq_enable(pin, enable)` | Mask/unmask an installed handler |
| `rt_pin_detach_irq(pin)` | Remove callback after disabling the IRQ |

## Complete example: an unused pad

Run with PE5 physically unconnected and unused by the application. The internal pulls produce the test edge; the callback only releases a semaphore. Save as `applications/demo_gpio.c` and invoke `demo_gpio`.

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

## Interrupt flow and checks

```mermaid
flowchart LR
    PAD["Pad edge"] --> PIO["PIO status / PLIC"]
    PIO --> ISR["Clear pending, invoke callback"]
    ISR --> SEM["Release semaphore"]
    SEM --> TASK["Thread consumes event"]
```

Use `test_gpio` for levels, pulls and both edge directions. A repeating level IRQ usually means the external source remains asserted. A wrong pinmux can disconnect a peripheral even when GPIO readback looks correct. Restore the original device ownership after a test.
