---
title: "Audio、I2S 与 S/PDIF"
---

音频侧有一个共享流引擎和三个前端。`Audio` 使用片内 codec，`I2S` 把 I2S0 当总线主控，`SPDIF` 使用 OWA 模块。三者都建立在 `AudioEngine` 上：每个方向一个环形缓冲，发送端按 20 ms 块供数（没有数据时补静音），接收端由读取线程收集。

## Audio

`Audio` 是一个 `Stream`。`write()` 播放原始小端 16 位 PCM，立体声时交错排列；`read()` 返回麦克风采集的 16 位单声道 PCM。

| 分组 | 方法 |
| --- | --- |
| 生命周期 | `begin(rate, channels, microphone)`、`beginRecord(rate)`、`end`、`active`、`sampleRate` |
| 播放 | `write`、`writeSamples`、`availableForWrite`、`flush`、`playTone`、`playSilence`、`speaker`、`setVolume`、`mute` |
| 采集 | `available`、`read`、`peek`、`readSamples`、`level`、`levelPercent`、`setInputGain`、`muteInput`、`inputSource`、`dropInput`、`inputOverruns` |

`begin(48000)` 打开立体声输出；`begin(rate, 1)` 打开单声道输出，两侧都会播放。`beginRecord(16000)` 只打开麦克风。`begin(rate, channels, true)` 以同一采样率打开两个方向。功放使能是 PE10，`speaker(true)` 会驱动它。

`playTone(frequency, durationMs, amplitude = 12000)` 生成正弦音；`playSilence(durationMs)` 写静音。`setVolume` 取 0..100。`level()` 是最近 20 ms 块的峰值，0..32767，`levelPercent()` 换算到 0..100。

codec、I2S0 和 S/PDIF 共用一个 PLL。48 kHz 家族（8000、16000、24000、32000、48000 等）和 44.1 kHz 家族（11025、22050、44100）不能同时被不同的音频模块使用。整个 sketch 选一个家族。

```cpp
#include <Audio.h>

void setup() {
  Serial.begin(115200);
  if (!Audio.begin(48000)) {
    Serial.println("Audio.begin failed");
    return;
  }
  Audio.setVolume(70);
  Audio.playTone(440, 500);
}
```

## AudioEngine

`AudioEngine` 是三个前端下面的共享层。通常不直接使用，但它的接口说明了行为：

- `open(dev, rate, bits, txChannels, rxChannels, loopback, format, ringBytes)` 打开一个设备，支持 16、24、32 位采样。24 或 32 位采样占 4 字节。`txChannels` 或 `rxChannels` 为 0 表示关闭该方向。
- `write()` 只接受完整帧，返回写入的字节数；`block = false` 时能写多少写多少。
- `read()` 最多等待一个超时；`dropInput()` 丢弃已缓冲的数据。
- `rxPeak()` 是最近一个接收块的峰值；`rxOverruns()` 和 tx/rx recovery 计数反映流的问题。
- 默认每个方向 32 KiB 环形缓冲；发送端把 TX 环切成 20 ms 块。

## I2S

`I2S` 把 I2S0 当总线主控，使用立体声帧。`begin(mode, sampleRate, bitsPerSample)` 打开 TX 和 RX，除非 `setDirections(tx, rx)` 另有指定。模式有 `I2S_PHILIPS_MODE`、`I2S_LEFT_JUSTIFIED_MODE` 和 `I2S_RIGHT_JUSTIFIED_MODE`。

`write()` 接收原始 PCM 字节，只接受完整帧；`writeSample()` 写左声道或右声道的一个采样，右声道写入时整帧发出。`readSample()` 读一个采样，`available()` 和 `overruns()` 报告接收侧状态。

没有引脚 overlay（`libraries/I2S/pins_PE0_PE4.overlay`）时不会连接任何引脚。EVB 没有引出 I2S 引脚，所以默认用法是 `setLoopback(true)`：TX 在芯片内部回到 RX。`I2SLoopback` 发送计数并检查。

## SPDIF

`SPDIF` 是 PE6 上的 S/PDIF（IEC 60958）发送器。支持立体声、16 或 24 位采样（24 位采样是 32 位字），采样率为 22050、24000、32000、44100、48000、88200、96000、176400 和 192000 Hz。

`begin(rate, bits, rx, loopback)` 启动发送器。`write()` 接收原始 PCM 字节，只接受完整帧（左、右）。`readBytes()` 和 `available()` 是实验性的：内部回环时接收端能看到帧，但 RX DMA 请求不会到来，采集不会返回数据。`SPDIFTone` 发送 1 kHz 音调。

## AACDecoder

`AACDecoder` 是定点软件 AAC-LC 解码器。它解码一个原始 AAC 包（MP4 里的存储形式，没有 ADTS 头），输出 16 位交错立体声 PCM；单声道会复制到两个声道。

`begin(audioSpecificConfig, len)` 接收 MP4 音轨的 `audioExtra()` 数据。`decode(packet, len, pcm)` 返回 PCM 帧数（1024）或负的解码错误。PCM 缓冲需要 `MAX_PCM_SAMPLES`（`1024 * 2`）个 `int16_t`。`AACToPCM` 演示完整流程。

## MP4Player

`MP4Player` 从 SD 卡播放 H.264 视频加 AAC 音频的 MP4 文件。视频通过硬件解码器送到显示视频层，声音送到 codec 的耳机输出。它需要 `Display`、`SD` 和 codec，会占用 LCD 的 PD0..PD22 和 PB0..PB3，运行期间关闭 PWM 模块。

`begin()` 启动播放器。`play(path)` 阻塞到结束；`start(path)` 启动后由 `update()` 推进一步，播放继续时返回 true。还有 `stop()`、`playing()`、`setVolume(0..255)`、`mute()`，以及 `width`、`height`、`frames`、`durationMs`、`positionMs`、`framesShown`、`framesDropped`、`audioUnderruns`、`avOffsetMs` 和 `error()` 等统计。示例是 `PlayVideo`。

## 选择哪条路

| 需求 | 使用 |
| --- | --- |
| 在耳机或扬声器上播放音调或 PCM | `Audio` |
| 从麦克风录音 | `Audio.beginRecord` |
| 把 PCM 送到外部 I2S DAC | `I2S` 加引脚 overlay |
| 把 S/PDIF 送到接收端 | `SPDIF` |
| 解码容器里的 AAC 包 | `AACDecoder` 加 `MP4` |
| 播放带画面和声音的 MP4 | `MP4Player` |

## 状态

I2S 回环在 EVB 上跑过 180k 帧，零个不一致。`Audio`、`SPDIF`、`AACDecoder` 和 `MP4Player` 能构建和链接，但当前板测列表里没有它们。S/PDIF 接收端不可用，因为 RX DMA 请求不会到来。先用 `AudioTone` 和 `AudioMicLevel` 测音频，再上播放器。
