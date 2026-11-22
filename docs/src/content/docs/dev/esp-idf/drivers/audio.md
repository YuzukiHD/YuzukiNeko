---
title: "I2S and the on-chip codec"
---

F101 integrates the DAC, ADC and analog front end on chip; they work through I2S0 FIFOs and cyclic DMA. The ESP-IDF side uses the standard `driver/i2s_std.h`, with no external I2S pins and no MCLK/BCLK/WS configuration.

## Codec and I2S

The codec register block is at `0x02030000`; the DAC is the I2S TX channel and the ADC is the RX channel. Each channel owns a ring of `dma_desc_num` periods moved by cyclic DMA, with an event at every period boundary. TX periods are zeroed after playback, so an unfed stream plays silence; RX periods are handed to the reader one period late, so the last bytes cannot be overwritten while still on the bus.

Sample rates fall into two families that share one PLL group:

| Family | Sample rates |
| --- | --- |
| 48 kHz family | 8, 12, 16, 24, 32, 48, 96, 192 kHz |
| 44.1 kHz family | 11.025, 22.05, 44.1, 88.2, 176.4 kHz |

DAC and ADC must be in the same family because PLL_AUDIO1 has only one current setting. Disable both channels before changing the sample rate and reconfigure them afterwards.

## Channel setup

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

`i2s_new_channel()` accepts only `I2S_NUM_0` or `I2S_NUM_AUTO`, and the latter also resolves to 0. The pin fields of `gpio_cfg` are ignored; `i2s_channel_reconfig_std_gpio()` returns `ESP_ERR_NOT_SUPPORTED`. Data widths are 16 or 32 bits, mono or stereo.

## Playback and recording

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

`i2s_channel_write()` returns once the data is in the DMA ring; `portMAX_DELAY` waits indefinitely for space. Before playback, call `i2s_f101_codec_set_pa_gpio()` to name the amplifier enable; enabling the channel drives it to the active level, and disabling the channel drives it inactive.

## Analog controls

```c
i2s_f101_codec_set_pa_gpio(GPIO_NUM_PD(4), true);
i2s_f101_codec_set_volume(80);
i2s_f101_codec_set_hp_gain(5);
i2s_f101_codec_set_mute(false);
i2s_f101_codec_select_input(I2S_F101_INPUT_MIC);
i2s_f101_codec_set_mic_gain(8);
```

Digital volume ranges from 0 to 100, headphone gain from 0 to 7, microphone PGA gain from 0 to 15, and the input can be `I2S_F101_INPUT_MIC`, `FMIN`, `LINEIN` or `NONE`. `set_mute()` mutes the output without stopping the I2S stream.

## Board wiring

On YuzukiNeko, `HPOUT` is an on-board net connected through C10 to the `+IN` of the `U2` amplifier, whose output goes to the `CN3` speaker connector; the amplifier enable is PD4, active high. The `f101_evb` amplifier enable is PE10. The headphone and speaker paths are controlled by the TX channel enable, with no separate GPIO operation.

The audio code only cross-compiled and linked in this session; nothing was played or recorded on hardware. On the first board run, check the PD4 level and the `CN3` load first, then start with 48 kHz stereo.
