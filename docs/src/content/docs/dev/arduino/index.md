---
title: "Arduino development"
---

This chapter documents the Arduino core for YuzukiHD F101 boards, maintained in [`YuzukiHD/Arduino`](https://github.com/YuzukiHD/Arduino). The documentation baseline is commit `a5287509418eeaad36ee933cfa25334ce1022e15` (2026-10-09), platform version 0.1.1. A sketch is compiled with plain `riscv-none-elf-gcc` and linked against a prebuilt Zephyr core; the Arduino IDE or `arduino-cli` uploads the loader, the core and the sketch to SPI NOR through xfel in FEL mode.

## Boards

| Board | FQBN | Console | Notes |
| --- | --- | --- | --- |
| Allwinner F101 EVB | `yuzuki:f101:f101evb` | UART3, PE08/PE09 | 1024×600 RGB panel |
| YuzukiNeko | `yuzuki:f101:f101neko` | UART1, PB0/PB1 | 1024×768 MIPI DSI panel; S3 or S4 PSRAM |

| Item | Current core |
| --- | --- |
| CPU | XuanTie C907, RV32 `rv32imafdc`, `ilp32d`, single core |
| Core | Zephyr plus the core and all libraries, about 0.9 MB, linked at `0x40000000` |
| Sketch | linked for `0x40e00000`, 2 MiB window for code and data |
| Console | `Serial`: UART3 PE08/PE09 on the EVB, UART1 PB0/PB1 on YuzukiNeko, 115200 8N1 |
| Storage | SPI NOR: loader `0x000000`, core `0x200000`, sketch `0x400000` |
| Upload | xfel in FEL mode, "Upload Using Programmer"; no serial bootloader |
| Toolchain | xPack RISC-V GCC 15.2.0, `riscv-none-elf-` |
| IDE | Arduino IDE 2.x or `arduino-cli`; Boards Manager package |
| Peripherals | GPIO, UART, I²C, SPI, PWM, ADC, display, audio, SD, USB, video decode |

## What the chapter covers

| Page | Content |
| --- | --- |
| [Install and upload sketches](install.md) | Boards Manager, `arduino-cli`, FEL driver, upload, offline install |
| [The prebuilt core and the sketch ABI](core.md) | Memory layout, boot header, sketch header, linking, symbol export |
| [Arduino API and pins](api.md) | Digital I/O, analog, interrupts, serial routing, I²C, SPI, memory |
| [Example sketches](examples.md) | All 27 examples, what they use and what hardware they need |
| [Peripheral libraries](libraries.md) | Overview, `Wire`, `SPI`, `Watchdog`; display, audio, storage/USB and video pages |
| [Building the core and the release](core-build.md) | `tools/build-core`, `tools/package`, CI, adding a board |
| [Status and known limits](limits.md) | Verified examples, library status, API limits, pin conflicts |

## How a sketch runs

The loader is SyterKit's `flash-boot` application. It starts from NOR, initializes PSRAM, reads the core header page at `0x200000` to find the core and the sketch, copies both to PSRAM, and starts Zephyr. The core then looks for the sketch at `0x40e00000`, checks its header and calls `setup()` and `loop()`.

| NOR offset | Content |
| --- | --- |
| `0x000000` | loader, three copies at 64 KiB intervals |
| `0x030000` | UF2 downloader (system program) |
| `0x200000` | core header page and core image |
| `0x400000` | sketch image |

If PD5 is held at power-up or the core header is invalid, the loader starts the UF2 downloader instead. The details of the header pages and the link are in [the prebuilt core and the sketch ABI](core.md).

## First sketch

1. Install the platform and select the board; see [install and upload sketches](install.md).
2. Open **File > Examples > YuzukiHD Boards > Blink**.
3. Put the board into FEL: hold the FEL key while powering or resetting, then release it.
4. Choose **Sketch > Upload Using Programmer** (Ctrl+Shift+U).
5. Open the serial monitor at 115200 on the console UART.

The example uses `LED_BUILTIN`, which is `PA0` on both variants. Neither board has a documented user LED, so wire one to PA0 or change the pin.

```cpp
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("F101 Arduino: Blink");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("on");
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("off");
  delay(500);
}
```

After the upload the board runs the sketch at every power-up. To upload again, put it back into FEL; a board that boots from NOR does not enter FEL by itself.

:::caution
The upload writes SPI NOR. It overwrites the loader at `0x000000`, the core at `0x200000` and the sketch at `0x400000`, so previous firmware in those regions is lost. Back up the whole flash before the first upload; see [SPI NOR layout and backup](../../boot/flash-layout.md).
:::

## Relationship to Zephyr

The core is a Zephyr application: the Arduino API sits on top of Zephyr drivers, and the prebuilt core includes the Zephyr kernel, the drivers and every library. A sketch does not build Zephyr and cannot change Kconfig or devicetree; it links against the symbols exported by `core.elf` and runs in a fixed RAM window. Board differences live in `variants/<name>/` (`pins_arduino.h`, `<name>.overlay`, `<name>.conf`), not in the sketch.
