---
title: "GPTimer, LEDC and GPADC"
---

Timers, PWM and ADC all use standard ESP-IDF driver headers. F101 has fewer hardware resources than ESP32 in some areas: only two GPTimers, a separate period generator per LEDC channel, and only four usable GPADC channels with a fixed 1.8 V full scale.

## GPTimer

Two 56-bit down counters run from the 200 MHz bus clock, and `driver/gptimer.h` presents them as up counters at a user-selected resolution:

```c
#include "driver/gptimer.h"

gptimer_config_t timer_cfg = {
    .clk_src = GPTIMER_CLK_SRC_DEFAULT,
    .direction = GPTIMER_COUNT_UP,
    .resolution_hz = 1000000,
};
gptimer_handle_t timer;
gptimer_new_timer(&timer_cfg, &timer);

gptimer_alarm_config_t alarm_cfg = {
    .alarm_count = 500000,
    .reload_count = 0,
    .flags.auto_reload_on_alarm = true,
};
gptimer_set_alarm_action(timer, &alarm_cfg);
gptimer_enable(timer);
gptimer_start(timer);
```

`resolution_hz` cannot exceed 200 MHz. The callback runs in interrupt context; only count, notify a task or set a flag there. Send time-consuming work to a task through a queue. The alarm can be changed again only after `gptimer_stop()`.

## LEDC PWM

There are four PWM channels, each with its own period generator. `ledc_timer_config()` stores the frequency and duty resolution, and `ledc_channel_config()` binds a timer to a channel and pad:

```c
#include "driver/ledc.h"

ledc_timer_config_t tcfg = {
    .speed_mode = LEDC_LOW_SPEED_MODE,
    .duty_resolution = LEDC_TIMER_10_BIT,
    .timer_num = LEDC_TIMER_2,
    .freq_hz = 1000,
    .clk_cfg = LEDC_AUTO_CLK,
};
ledc_timer_config(&tcfg);

ledc_channel_config_t ccfg = {
    .gpio_num = GPIO_NUM_PD(22),
    .speed_mode = LEDC_LOW_SPEED_MODE,
    .channel = LEDC_CHANNEL_2,
    .timer_sel = LEDC_TIMER_2,
    .duty = 512,
    .hpoint = 0,
    .flags.output_invert = 1,
};
ledc_channel_config(&ccfg);
```

| Channel | Available pads |
| --- | --- |
| LEDC_CHANNEL_0 | PD6 |
| LEDC_CHANNEL_1 | PD7 |
| LEDC_CHANNEL_2 | PD8 or PD22 |
| LEDC_CHANNEL_3 | PB3 |

Duty resolution is 1 to 16 bits. The base board backlight on PD22 is active low, so the example sets `output_invert`. Change the duty with `ledc_set_duty()` followed by `ledc_update_duty()`; both calls are required.

## GPADC

The GPADC is a 12-bit, 1.8 V full-scale successive-approximation converter with only channels 0 through 3 available. The unit is always `ADC_UNIT_1`, and the attenuation setting is ignored:

```c
#include "esp_adc/adc_oneshot.h"

adc_oneshot_unit_handle_t adc;
adc_oneshot_unit_init_cfg_t unit_cfg = { .unit_id = ADC_UNIT_1 };
adc_oneshot_new_unit(&unit_cfg, &adc);

adc_oneshot_chan_cfg_t chan_cfg = {
    .atten = ADC_ATTEN_DB_0,
    .bitwidth = ADC_BITWIDTH_12,
};
adc_oneshot_config_channel(adc, ADC_CHANNEL_0, &chan_cfg);

int raw;
adc_oneshot_read(adc, ADC_CHANNEL_0, &raw);
```

`raw` ranges from 0 to 4095 and maps to 0 to 1.8 V. `adc_oneshot_get_calibrated_result()` returns a linearly converted millivolt value without per-chip calibration. The input must not exceed 1.8 V; for higher voltages add an external divider and keep the divided source impedance low.

`adc_oneshot_io_to_channel()` and its reverse return `ESP_ERR_NOT_SUPPORTED` on F101. Channel numbers do not map to header pin numbers; consult the schematic.
