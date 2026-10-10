# Writing Sketches and APIs

## Writing Sketches

The usual Arduino API is used: `pinMode`, `digitalWrite`, `analogRead`, `analogWrite`, `Serial`, `Wire`, `SPI`, `String`, `millis`, `delay`, and so on.

- Pin names are `PA0` … `PF31` (port letter + number), and analog inputs are `A0`..`A11`.
- `Serial.begin(115200)` is all the initialization the console needs; the other UARTs are `Serial1`..`Serial5`, and `Serial1.setPins(rx, tx)` selects the pins (the console pins come from the board configuration and are not re-routed).
- Peripherals are provided as libraries; `#include` what you use: `<SD.h>`, `<Display.h>`, `<Audio.h>`, `<MP4Player.h>`, etc. The examples demonstrate each library.

Two notes:

- `Display` and `DBI` use the same pins (`PD0`-`PD5`), so a sketch can use only one of them.
- A sketch can have up to **2 MiB** of code and data; the system (Zephyr, drivers, all libraries, about 0.9 MB) is part of the prebuilt core and does not count. The size shown by the IDE is only the sketch itself, so it is small.

## Supported APIs

| Arduino API | Implementation |
| --- | --- |
| `pinMode/digitalWrite/digitalRead` | Zephyr GPIO, pin number = port × 32 + pin, names `PA0`..`PF31` |
| `attachInterrupt/detachInterrupt` | GPIO callbacks (`RISING/FALLING/CHANGE/ONHIGH/ONLOW`) |
| `analogRead(A0..A11)` | GPADC, 12-bit, scaled by `analogReadResolution()` (default 10) |
| `analogWrite`, `tone`, `analogWriteFrequency` | PWM0, pins `PD6 PD7 PD8 PB3` (default 500 Hz) |
| `Serial` | The board's console UART, with an RX ring buffer, supports `begin(baud, SERIAL_8N1...)` |
| `Serial1..Serial5` | UART5, UART2, UART1, UART0, UART4 |
| `setPins(rx, tx)` | Routes pins at runtime (no device tree change): UART0 PF4/PF2, UART1 PF1/PF0 or PB1/PB0, UART2 PF5/PF4, UART3 PE9/PE8 or PE1/PE0, UART4 PE3/PE2, UART5 PE5/PE4 (RX/TX). Other pins are rejected. The first pair is the default (Serial2..Serial4 default onto the SD card pins PF0..PF5) |
| `Wire` | I2C1: PE0 (SCL) / PE1 (SDA), controller mode only |
| `SPI` | SPI0: PC0 (SCK) / PC4 (MOSI) / PC2 (MISO), chip select handled by the sketch |
| `millis/micros/delay/delayMicroseconds` | Kernel clock, 24 MHz cycle counter |
| `String`, `Print`, `Stream`, `F()`, `printf` | Own implementation, supports `Serial.printf()` |
| Math functions | Toolchain libm (`sin`, `pow`, etc.) |

`setup()` and `loop()` run in the Zephyr main thread (16 KiB stack); `new` / `malloc` use all the RAM above the image.

## Limitations

- `Wire.endTransmission(false)` (repeated start) still ends with a STOP; there is no slave mode.
- `Serial.print` is synchronous (polled transmit); the shell and logging are disabled so that `Serial` has the console UART to itself.
- On pins without PWM, `analogWrite` falls back to a digital output with a 50% threshold.
- There are no `Servo`, `EEPROM` or `WiFi` libraries yet.
