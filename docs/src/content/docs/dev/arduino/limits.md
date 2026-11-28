---
title: "Status and known limits"
---

The recorded board tests are on the F101 EVB. The core builds for YuzukiNeko as well, but its panel and console path are not in the recorded test list. This page separates what ran from what only builds, and lists the API limits that are easy to trip over.

## Verified examples

| Example | Result |
| --- | --- |
| `SelfTest` | String, timing, math, GPIO, ADC, PWM, I²C and SPI pass |
| `AnalogSerial` | ADC read and PWM fade run |
| `DisplayBasics` | The panel draws and the backlight fades |
| Flash boot | The board runs the sketch at power-up |
| `upload.cmd` | Upload from Windows with xfel works |

On an earlier per-peripheral core, `I2S` loopback ran with 180k frames and zero mismatches, `SD` passed mkdir/read/seek/rename/remove, `Watchdog` reset the CPU, `G2D` returned 0 for every call and `VideoDecoder` decoded a 320×240 JPEG in 4 ms.

## Library status

| Library | Builds | Ran on the board |
| --- | --- | --- |
| `Display` | Yes | `DisplayBasics` |
| `DBI` | Yes | No panel attached in the recorded tests |
| `G2D` | Yes | Earlier core only |
| `Audio` | Yes | Not on the current core |
| `I2S` | Yes | Loopback on the EVB |
| `SPDIF` | Yes | TX not on the current core; RX unusable |
| `AACDecoder` | Yes | Not on the current core |
| `MP4` | Yes | Not on the current core |
| `MP4Player` | Yes | Not on the current core |
| `SD` | Yes | mkdir, read, seek, rename, remove |
| `USBDevice` | Yes | Not on the current core |
| `USBHost` | Yes | Not on the current core |
| `VideoDecoder` | Yes | JPEG on an earlier core; PNG and H.264 not |
| `Wire` | Yes | `SelfTest`, `I2CScan` |
| `SPI` | Yes | `SelfTest` |
| `Watchdog` | Yes | `WatchdogDemo` |

## API limits

- `Wire.endTransmission(false)` still ends with a STOP; there is no repeated start and no peripheral mode.
- `Serial.print` is synchronous and polled. The shell and log backends are disabled so `Serial` owns the console UART.
- `analogWrite` on a pin that is not one of PD6, PD7, PD8 or PB3 is a digital 50 % output. With `Display` active, the four PWM pins belong to the panel.
- `pulseIn()` is a software busy-wait; it blocks the main thread.
- `random()` is a 32-bit xorshift, not a cryptographic source.
- A sketch is limited to 2 MiB of code and data. The core is about 0.9 MB and is not counted.
- `USBDevice` and `USBHost` cannot be used in the same sketch; the board has one USB controller.
- `Display` and `DBI` cannot be included together; they share PD0..PD5.
- There is no `Servo`, `EEPROM` or `WiFi` library.
- The loader's own log is on UART3 even on YuzukiNeko; the sketch's `Serial` follows the board console.

## Known issues

- A sketch built against another core stops with `the sketch was built for another core`. Recompile after every core update.
- The YuzukiNeko variant builds, but the recorded tests do not cover its MIPI DSI panel or its UART1 console. Treat the first run as bring-up.
- The `pins_arduino.h` comment in the YuzukiNeko variant still says UART3; the core actually uses the board console, UART1. Trust the board devicetree and `Serial`, not the comment.
- `MP4Player` takes the LCD pins and turns the PWM block off; a sketch cannot use `analogWrite` while it runs.

## Checklist

Before treating a failure as a core bug:

- Confirm the selected board matches the hardware (EVB or YuzukiNeko).
- Confirm the console UART and 115200 baud rate.
- Recompile the sketch after a core update.
- Check the example's required hardware in [the example list](examples.md).
- Check the pin conflicts above before using a pin that a library owns.
- For USB, use one role per sketch and power-cycle after changing it.
