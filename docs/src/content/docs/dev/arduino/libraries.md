---
title: "Peripheral libraries"
---

Every library is part of the prebuilt core; a sketch includes its header and calls `begin()`. Devices that own pins or power are not started at boot: the library starts them from `begin()`. A library can bring a Kconfig fragment (`f101.conf`) and a devicetree overlay (`f101.overlay`) into the core build, which is how the display, SD, USB and audio stacks are enabled.

## Library map

| Library | Hardware | Details |
| --- | --- | --- |
| `Display` | DE, TCON, RGB panel | [Display, DBI and G2D](libraries/display.md) |
| `DBI` | MIPI DBI, 4-wire SPI | [Display, DBI and G2D](libraries/display.md) |
| `G2D` | 2D engine | [Display, DBI and G2D](libraries/display.md) |
| `Audio` | On-chip codec | [Audio, I2S and S/PDIF](libraries/audio.md) |
| `I2S` | I2S0 | [Audio, I2S and S/PDIF](libraries/audio.md) |
| `SPDIF` | OWA | [Audio, I2S and S/PDIF](libraries/audio.md) |
| `AACDecoder` | Software AAC-LC | [Audio, I2S and S/PDIF](libraries/audio.md) |
| `MP4` | MP4 demuxer | [Audio, I2S and S/PDIF](libraries/audio.md) |
| `MP4Player` | H.264 + AAC player | [Audio, I2S and S/PDIF](libraries/audio.md) |
| `SD` | SMHC0, FatFs | [SD, USB device and USB host](libraries/storage-usb.md) |
| `USBDevice` | CherryUSB device | [SD, USB device and USB host](libraries/storage-usb.md) |
| `USBHost` | CherryUSB host, MSC, CDC | [SD, USB device and USB host](libraries/storage-usb.md) |
| `VideoDecoder` | Video engine | [Video decoding](libraries/video.md) |
| `Wire` | I2C1 | This page |
| `SPI` | SPI0 | This page |
| `Watchdog` | WDT | This page |

## Wire

`Wire` is I2C1 on PE0 (SCL) and PE1 (SDA), controller mode only. `begin()` starts the bus; `setClock(hz)` changes the rate; `beginTransmission(address)`, `write()`, `endTransmission(sendStop)` and `requestFrom(address, quantity, sendStop)` perform one transaction.

| `endTransmission` result | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Data too long for the buffer |
| 2 | NACK on the address |
| 3 | NACK on the data |
| 4 | Other error |
| 5 | Timeout |

`Wire.endTransmission(false)` still ends with a STOP; repeated-start is not implemented. The transmit and receive buffers are 128 bytes (`BUFFER_LENGTH`). `onReceive()` and `onRequest()` are stored but never called: there is no peripheral mode.

```cpp
#include <Wire.h>

void setup() {
  Serial.begin(115200);
  Wire.begin();
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) Serial.printf("device at 0x%02X\n", addr);
  }
}
```

## SPI

`SPI` is SPI0 on PC0 (SCK), PC4 (MOSI) and PC2 (MISO). The chip select is up to the sketch; `PIN_SPI_SS` is PC1, but the library does not drive it.

`begin()` starts the bus. `beginTransaction(SPISettings(clock, bitOrder, dataMode))` sets the clock, bit order and mode for the next transfers; `endTransaction()` does nothing. `setBitOrder()`, `setDataMode()` and `setClockDivider()` are the older API. `transfer(byte)` exchanges one byte, `transfer16(word)` exchanges two, `transfer(buf, count)` and `transfer(tx, rx, count)` move buffers.

```cpp
#include <SPI.h>

void setup() {
  Serial.begin(115200);
  SPI.begin();
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  uint8_t id = SPI.transfer(0x9F);
  SPI.endTransaction();
  Serial.printf("id 0x%02X\n", id);
}
```

## Watchdog

`Watchdog.begin(timeoutMs)` starts the hardware watchdog; `reset()` feeds it; `end()` stops it. The hardware periods are 1 to 6 s, 8, 10, 12, 14 and 16 s; `begin()` picks the first one that is not shorter than the request. `roundTimeout(ms)` returns the period that would be used, or 0 when the request is too long. `active()` and `timeoutMs()` report the state.

A watchdog reset reboots the SoC and the loader runs the sketch again. `WatchdogDemo` feeds the watchdog for 10 s and then stops, so the board resets and prints its boot messages again.

## Status

The recorded tests cover the core, ADC/PWM, the panel, SD, I2S, Watchdog, G2D and JPEG. The examples that exercise them are `SelfTest`, `AnalogSerial`, `DisplayBasics`, `SDInfo`, `SDReadWrite`, `I2SLoopback`, `WatchdogDemo`, `G2DDemo` and `JPEGShow`; the exceptions are listed on each library page. The remaining libraries build and link; treat their first run as bring-up. The [example list](examples.md) says which hardware each one needs.
