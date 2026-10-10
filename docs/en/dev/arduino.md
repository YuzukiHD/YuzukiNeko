# Arduino

Write `.ino` sketches with the Arduino API and upload them through the Arduino IDE or arduino-cli. Underneath is a prebuilt Zephyr core, and sketches are linked onto it with plain gcc, so you only need the Arduino IDE (or arduino-cli), the RISC-V GCC and `xfel`, all of which the board manager installs automatically (about 85 MB).

Repository: <https://github.com/YuzukiHD/Arduino>. Windows 10/11 and Linux x86_64 are supported.

## Requirements

- A YuzukiNeko.
- A data cable for the USB port (it is also the download port).
- A USB-to-serial adapter connected to the console UART (115200), to see `Serial` output.
- **Arduino IDE 2.x** or `arduino-cli`.

## Installation

1. In **File → Preferences**, paste into "Additional boards manager URLs":
   ```
   https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json
   ```
2. Open the **Boards Manager**, search for **YuzukiHD Boards** and install it.
3. **Tools → Board → YuzukiHD Boards**, select **YuzukiNeko**.
4. **Tools → Programmer → xfel (USB FEL)**. The board has no serial bootloader, so the normal "Upload" arrow does not work; only "Upload Using Programmer" does. The choice is remembered.

arduino-cli:

```sh
arduino-cli config add board_manager.additional_urls https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json
arduino-cli core update-index
arduino-cli core install yuzuki:f101
```

?> The index file exists only after a Release has been published; until then, use the Release assets or build it yourself.

### One-time: install the USB driver for FEL

- **Windows**: power up the board while holding the **FEL** button, open <https://zadig.akeo.ie>, select the device `USB Device (VID_1f3a PID_efe8)`, choose the **WinUSB** driver, and click **Install Driver**.
- **Linux**: `sudo apt install libusb-1.0-0`, then grant permissions:
  ```sh
  echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="1f3a", ATTR{idProduct}=="efe8", MODE="0666"' | sudo tee /etc/udev/rules.d/50-allwinner-fel.rules
  sudo udevadm control --reload
  ```

## First Sketch: Blink

1. **File → Examples**, open **Blink** under **YuzukiHD Boards** (it can also be found in `Documents/Arduino/hardware/yuzuki/f101/examples`).
2. Click **Verify** (the check mark); compilation finishes in a few seconds.
3. Put the board into FEL: **hold the FEL button, power up (or reset), release**.
4. **Sketch → Upload Using Programmer** (Ctrl+Shift+U). It writes the loader, core and sketch into the on-board Flash and starts them.
5. Open the console serial port at 115200; you should see `F101 Arduino: Blink` and an `on` / `off` every half second. The LED pin is `PA0` (the EVB has no user LED; you need to wire one).

After that, the board **runs the sketch by itself on every power-up**. To upload again you still need to put it into FEL (power up while holding FEL), because a board that boots from Flash does not enter FEL on its own.

| Symptom | Fix |
| --- | --- |
| `no board in FEL mode` | The board is not in FEL; redo step 3 and check the USB driver |
| `Request 'upload' failed` | "Upload" was chosen instead of "Upload Using Programmer", or no programmer is selected |

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

## Peripheral Libraries

All libraries are part of the prebuilt core; just include them in the sketch. Devices that take over pins or power are started by the library in `begin()`, not at boot.

| Library | Hardware | Notes |
| --- | --- | --- |
| `Display` | DE + TCON + RGB panel | ARGB8888 buffer, drawing/text, `show()`, video layer (`showYuv`), backlight. After `Display.begin()` it occupies PD0..PD22, PE6/7, PB0..PB3. LVGL is not in the core: point the LVGL Arduino library at `Display.buffer()` |
| `G2D` | 2D engine | Fill, blit (convert/scale), blend; rotation/flip must keep format and size |
| `DBI` | MIPI DBI (PD0..PD5) | Mutually exclusive with `Display`: including both gives an `#error` |
| `Audio` | On-chip codec | PCM output, microphone input, tones, volume, speaker amplifier (PE10) |
| `I2S`, `SPDIF` | I2S0, OWA | I2S0 has no pins on the EVB (internal loopback); S/PDIF receive DMA is unresolved |
| `SD` | SMHC0 (PF0..PF6) | Arduino SD API, `File` is a `Stream`; also the `USBDrive` volume |
| `USBDevice` | CherryUSB device | `USBSerial` (CDC ACM) |
| `USBHost` | CherryUSB host | `USBHostMSC` (including FAT mounted as `USBDrive`), `USBHostSerial`; a sketch can pick only one USB role |
| `VideoDecoder` | VE | Hardware JPEG/PNG, H.264 streams |
| `MP4`, `AACDecoder`, `MP4Player` | Demuxer, AAC, full player | The player needs Display, SD and the codec |
| `Watchdog` | WDT | `begin(ms)`, `reset()`, `end()` |

Examples shipped with the libraries: Blink, SelfTest, AnalogSerial, I2CScan, SerialPins, StringDemo, SDInfo, SDListFiles, SDReadWrite, DisplayBasics, DisplayYuvOverlay, G2DDemo, DBIProbe, JPEGShow, H264Frames, MP4Info, PlayVideo, AACToPCM, AudioTone, AudioPlayPCM, AudioMicLevel, I2SLoopback, SPDIFTone, USBSerialEcho, USBSerialBridge, USBMassStorage, WatchdogDemo.

### Verification Status

Only results that can be checked over the serial port are listed; pictures and sound were not judged by a person:

- Verified: SelfTest (String, timing, math, GPIO, ADC, PWM, Wire, SPI, Serial RX echo), AnalogSerial, DisplayBasics, Flash boot, `upload.cmd` on Windows; earlier, on single-peripheral cores, the `I2S` loopback, `SD`, `Watchdog`, `G2D` and `VideoDecoder` JPEG were verified.
- Compiled but **not yet run on the current core**: `DBI`, `G2D`, `VideoDecoder`, `Audio`, `SPDIF`, `USBDevice`, `USBHost`, `MP4*`, H.264, PNG.

## How It Runs

```
SPI NOR   0x000000  Loader (SyterKit, 3 copies every 64 KiB): initializes PSRAM
          0x200000  Core header page + core image (Zephyr, drivers, libraries; linked at 0x40000000)
          0x400000  Sketch image (linked to the window at 0x40e00000)
```

At power-up the BROM starts the loader, which copies the core and sketch into PSRAM and starts the core; the core then calls the sketch's `setup()` and `loop()`. The sketch is compiled and linked with plain gcc against `prebuilt/core/core.elf`.

Uploading uses `xfel` and needs no serial port: power up while holding FEL, then upload. `xfel` writes the loader, core and sketch, then starts the loader.

## Hardware Notes

- `PE2` is the USB VBUS switch and `PF0..PF5` are the SD card; avoid them.
- The pins needed by the display (`PD0..PD22`, `PB0..PB3`) are taken only after `Display` (or `DBI`) is started; PWM and UART pins are routed on first use.
- `LED_BUILTIN` is `PA0`; you need to wire an LED yourself.

## Limitations

- `Wire.endTransmission(false)` (repeated start) still ends with a STOP; there is no slave mode.
- `Serial.print` is synchronous (polled transmit); the shell and logging are disabled so that `Serial` has the console UART to itself.
- On pins without PWM, `analogWrite` falls back to a digital output with a 50% threshold.
- There are no `Servo`, `EEPROM` or `WiFi` libraries yet.

## Offline Installation

Download `yuzukihd-f101-<version>.zip` from the Releases page (<https://github.com/YuzukiHD/Arduino/releases>) and extract it to `<sketchbook>/hardware/yuzuki/f101` (the sketchbook defaults to `Documents/Arduino`). Install `riscv-gcc` and `xfel` from the same page into `<Arduino15>/packages/yuzuki/tools/<name>/<version>` (`Arduino15` is `%LOCALAPPDATA%\Arduino15` on Windows and `~/.arduino15` on Linux), then restart the IDE.
