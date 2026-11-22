---
title: "GPTimer、LEDC 与 GPADC"
---

定时器、PWM 和 ADC 都使用 ESP-IDF 的标准驱动头文件。F101 的硬件限制比 ESP32 少一些功能：GPTimer 只有两个，LEDC 的每个通道有独立的周期发生器，GPADC 只有 4 个可用通道且满量程固定为 1.8 V。

## GPTimer

两个 56 位递减定时器挂在 200 MHz 总线时钟上，`driver/gptimer.h` 把它们转换成用户指定分辨率的递增计数：

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

`resolution_hz` 不能超过 200 MHz。回调在中断上下文执行，只做计数、通知任务或置标志。需要耗时处理时用队列把事件送给任务。`gptimer_stop()` 之后才能重新设置 alarm。

## LEDC PWM

四个 PWM 通道，每通道有独立的周期发生器。`ledc_timer_config()` 保存频率和占空比分辨率，`ledc_channel_config()` 把定时器绑定到通道和焊盘：

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

| 通道 | 可用焊盘 |
| --- | --- |
| LEDC_CHANNEL_0 | PD6 |
| LEDC_CHANNEL_1 | PD7 |
| LEDC_CHANNEL_2 | PD8 或 PD22 |
| LEDC_CHANNEL_3 | PB3 |

占空比分辨率为 1 到 16 位。底板背光在 PD22 上低有效，所以示例设置了 `output_invert`。修改占空比用 `ledc_set_duty()` 加 `ledc_update_duty()`，两者必须成对调用。

## GPADC

GPADC 是 12 位、1.8 V 满量程的逐次逼近转换器，只有通道 0 到 3 可用。单元编号固定为 `ADC_UNIT_1`，衰减配置被忽略：

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

`raw` 的范围是 0 到 4095，对应 0 到 1.8 V。`adc_oneshot_get_calibrated_result()` 返回线性换算后的毫伏值，不做逐芯片校准。输入电压不能超过 1.8 V。需要测量更高电压时在外部加分压电阻，并确认分压后的源阻抗足够低。

`adc_oneshot_io_to_channel()` 和反向接口在 F101 上返回 `ESP_ERR_NOT_SUPPORTED`。通道号与排针编号没有固定对应关系，以原理图为准。
