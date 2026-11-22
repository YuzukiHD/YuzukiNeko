---
title: "I2S 与片内 codec"
---

F101 把 DAC、ADC 和模拟前端集成在片内，通过 I2S0 的 FIFO 和循环 DMA 工作。ESP-IDF 侧使用标准 `driver/i2s_std.h`，没有外部 I2S 引脚，也不需要配置 MCLK/BCLK/WS。

## Codec 与 I2S

codec 寄存器块在 `0x02030000`，DAC 是 I2S 的 TX 通道，ADC 是 RX 通道。每个通道拥有一个由 `dma_desc_num` 个周期组成的环形缓冲，循环 DMA 在周期边界产生事件。TX 周期播放后会被清零，应用不喂数据时输出静音；RX 周期晚一个周期交给读者，避免最后一个字还在总线上时被覆盖。

采样率分为两族，共用同一组 PLL：

| 族 | 采样率 |
| --- | --- |
| 48 kHz 族 | 8、12、16、24、32、48、96、192 kHz |
| 44.1 kHz 族 | 11.025、22.05、44.1、88.2、176.4 kHz |

DAC 和 ADC 必须处于同一族，因为 PLL_AUDIO1 只有一个当前设置。切换采样率时先禁用两个通道，再重新配置。

## 通道配置

```c
#include "driver/i2s_std.h"
#include "driver/i2s_f101_codec.h"

i2s_chan_handle_t tx, rx;
i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
i2s_new_channel(&chan_cfg, &tx, &rx);

i2s_std_config_t std_cfg = {
    .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(48000),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
    .gpio_cfg = {
        .mclk = I2S_GPIO_UNUSED,
        .bclk = I2S_GPIO_UNUSED,
        .ws = I2S_GPIO_UNUSED,
        .dout = I2S_GPIO_UNUSED,
        .din = I2S_GPIO_UNUSED,
    },
};
i2s_channel_init_std_mode(tx, &std_cfg);
```

`i2s_new_channel()` 只接受 `I2S_NUM_0` 或 `I2S_NUM_AUTO`，后者也解析到 0。`gpio_cfg` 的引脚字段被忽略；`i2s_channel_reconfig_std_gpio()` 返回 `ESP_ERR_NOT_SUPPORTED`。数据位宽支持 16 位和 32 位，单声道和立体声。

## 播放与录音

```c
uint8_t silence[1024] = {0};
size_t written;
i2s_f101_codec_set_pa_gpio(GPIO_NUM_PD(4), true);
i2s_f101_codec_set_volume(80);
i2s_channel_enable(tx);
i2s_channel_write(tx, silence, sizeof(silence), &written, portMAX_DELAY);

uint8_t record[1024];
size_t got;
i2s_channel_enable(rx);
i2s_channel_read(rx, record, sizeof(record), &got, portMAX_DELAY);
```

`i2s_channel_write()` 在数据进入 DMA 环形缓冲后返回，超时用 `portMAX_DELAY` 表示一直等待空间。播放开始前调用 `i2s_f101_codec_set_pa_gpio()` 指定功放使能脚，通道 enable 时驱动会把它拉到有效电平；disable 时拉回无效电平。

## 模拟控制

```c
i2s_f101_codec_set_pa_gpio(GPIO_NUM_PD(4), true);
i2s_f101_codec_set_volume(80);
i2s_f101_codec_set_hp_gain(5);
i2s_f101_codec_set_mute(false);
i2s_f101_codec_select_input(I2S_F101_INPUT_MIC);
i2s_f101_codec_set_mic_gain(8);
```

数字音量范围 0 到 100，耳机增益 0 到 7，麦克风 PGA 增益 0 到 15，输入可选 `I2S_F101_INPUT_MIC`、`FMIN`、`LINEIN` 或 `NONE`。`set_mute()` 只静音输出，不停止 I2S 流。

## 板上接线

YuzukiNeko 的 `HPOUT` 是板内网络，经 C10 接到 `U2` 功放的 `+IN`，功放输出到 `CN3` 喇叭座；功放使能是 PD4，高有效。`f101_evb` 的功放使能在 PE10。耳机和功放都由 TX 通道的 enable 状态控制，不需要单独 GPIO 操作。

音频代码在本次会话中只做了交叉编译和链接，没有在实板上播放或录音。首次上板时先确认 PD4 电平和 `CN3` 负载，再从 48 kHz 立体声开始测试。
