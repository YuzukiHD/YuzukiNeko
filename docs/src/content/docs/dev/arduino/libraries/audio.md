---
title: "Audio, I2S and S/PDIF"
---

The audio side has a shared stream engine and three front ends. `Audio` uses the on-chip codec, `I2S` uses I2S0 as a bus master, and `SPDIF` uses the OWA block. All three are built on `AudioEngine`, which owns a ring buffer in each direction, feeds the transmitter in 20 ms blocks (silence when it runs dry) and collects received blocks in a reader thread.

## Audio

`Audio` is a `Stream`. `write()` plays raw little-endian 16-bit PCM, interleaved when stereo; `read()` returns 16-bit mono PCM from the microphone.

| Group | Methods |
| --- | --- |
| Lifetime | `begin(rate, channels, microphone)`, `beginRecord(rate)`, `end`, `active`, `sampleRate` |
| Playback | `write`, `writeSamples`, `availableForWrite`, `flush`, `playTone`, `playSilence`, `speaker`, `setVolume`, `mute` |
| Capture | `available`, `read`, `peek`, `readSamples`, `level`, `levelPercent`, `setInputGain`, `muteInput`, `inputSource`, `dropInput`, `inputOverruns` |

`begin(48000)` opens stereo output; `begin(rate, 1)` opens mono output, which is played on both sides. `beginRecord(16000)` opens the microphone only. `begin(rate, channels, true)` opens both directions at the same rate. The speaker amplifier enable is PE10; `speaker(true)` drives it.

`playTone(frequency, durationMs, amplitude = 12000)` generates a sine tone; `playSilence(durationMs)` writes silence. `setVolume` takes 0..100. `level()` is the peak of the last 20 ms block, 0..32767, and `levelPercent()` scales it to 0..100.

The codec, I2S0 and S/PDIF share one PLL. The 48 kHz family (8000, 16000, 24000, 32000, 48000, ...) and the 44.1 kHz family (11025, 22050, 44100) cannot be used at the same time by different audio blocks. Pick one family for the whole sketch.

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

`AudioEngine` is the shared layer below the three front ends. It is not normally used directly, but its interface explains the behavior:

- `open(dev, rate, bits, txChannels, rxChannels, loopback, format, ringBytes)` opens one device with 16, 24 or 32-bit samples. A 24 or 32-bit sample takes 4 bytes. `txChannels` or `rxChannels` set to 0 leaves that direction off.
- `write()` accepts whole frames and returns the bytes taken; `block = false` writes what fits.
- `read()` waits up to a timeout; `dropInput()` discards what is buffered.
- `rxPeak()` is the peak of the last received block; `rxOverruns()` and the tx/rx recovery counters report stream problems.
- The default ring is 32 KiB per direction; the feeder cuts the TX ring into 20 ms blocks.

## I2S

`I2S` uses I2S0 as a bus master with stereo frames. `begin(mode, sampleRate, bitsPerSample)` opens TX and RX unless `setDirections(tx, rx)` says otherwise. The modes are `I2S_PHILIPS_MODE`, `I2S_LEFT_JUSTIFIED_MODE` and `I2S_RIGHT_JUSTIFIED_MODE`.

`write()` takes raw PCM bytes and whole frames; `writeSample()` writes one sample of the left or right channel and sends the frame with the right one. `readSample()` reads one sample, `available()` and `overruns()` report the receive side.

Without the pin overlay (`libraries/I2S/pins_PE0_PE4.overlay`) no pin is connected. The EVB has no I2S pins, so the default use is `setLoopback(true)`: TX goes into RX inside the chip. `I2SLoopback` sends a counting pattern and checks it.

## SPDIF

`SPDIF` is an S/PDIF (IEC 60958) transmitter on PE6. It supports stereo, 16 or 24-bit samples (24-bit samples are 32-bit words) and the rates 22050, 24000, 32000, 44100, 48000, 88200, 96000, 176400 and 192000 Hz.

`begin(rate, bits, rx, loopback)` starts the transmitter. `write()` accepts raw PCM bytes, whole frames (left, right). `readBytes()` and `available()` are experimental: the receiver sees frames in the internal loopback, but the RX DMA request never arrives, so capture does not return data. `SPDIFTone` sends a 1 kHz tone.

## AACDecoder

`AACDecoder` is a fixed-point AAC-LC decoder in software. It decodes one raw AAC packet, as stored in an MP4 file without an ADTS header, to 16-bit interleaved stereo PCM; a mono stream is duplicated to both channels.

`begin(audioSpecificConfig, len)` takes the `audioExtra()` data of the MP4 audio track. `decode(packet, len, pcm)` returns the number of PCM frames (1024) or a negative decoder error. The PCM buffer needs `MAX_PCM_SAMPLES` (`1024 * 2`) `int16_t` values. `AACToPCM` shows the whole path.

## MP4Player

`MP4Player` plays an MP4 file with H.264 video and AAC audio from the SD card. The video goes to the display video plane through the hardware decoder and the sound to the headphone output of the codec. It needs `Display`, `SD` and the codec, and it takes over the LCD pins PD0..PD22 and PB0..PB3; the PWM block is turned off while it runs.

`begin()` starts the player. `play(path)` blocks until the end; `start(path)` starts it and `update()` advances one step, returning true while playback continues. `stop()`, `playing()`, `setVolume(0..255)`, `mute()`, and the statistics `width`, `height`, `frames`, `durationMs`, `positionMs`, `framesShown`, `framesDropped`, `audioUnderruns`, `avOffsetMs` and `error()` are available. `PlayVideo` is the example.

## Choosing a path

| Need | Use |
| --- | --- |
| Play a tone or PCM on the headphone or speaker output | `Audio` |
| Record from the microphone | `Audio.beginRecord` |
| Send PCM to an external I2S DAC | `I2S` with a pin overlay |
| Send S/PDIF to a receiver | `SPDIF` |
| Decode AAC packets from a container | `AACDecoder` with `MP4` |
| Play an MP4 file with picture and sound | `MP4Player` |

## Status

The I2S loopback ran on the EVB with 180k frames and zero mismatches. `Audio`, `SPDIF`, `AACDecoder` and `MP4Player` build and link, but the current board-test list does not include them. The S/PDIF receiver is not usable because the RX DMA request does not arrive. Test audio with `AudioTone` and `AudioMicLevel` first, then move to the player.
