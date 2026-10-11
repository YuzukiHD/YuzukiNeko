---
title: "YuzukiNeko Pico Development Board"
---

<p align="center">
  <img width="380" alt="YuzukiNeko 3D render" src="assets/figures/yuzukineko-3d-render.webp">
</p>

YuzukiNeko is a development board based on the <strong>Allwinner F101 series SoC</strong>, in the Raspberry Pi Pico 2 × 20 pin form factor. It carries 16 MiB of PSRAM (F101S3; the 32 MiB configuration of V1.5 uses F101S4) and 16 MiB of NOR Flash with XIP (execute-in-place) support, and suits RISC-V graphics, display, audio and general-purpose I/O projects. The hardware design is released under CC0 1.0.

## What this documentation covers

| What you want to do | Where to go |
| --- | --- |
| Power up for the first time and get the board running | [Quickstart](quickstart.md) |
| Look up what a given pin can do | [Pinout](hardware/pinout.md), [Pin multiplexing](hardware/mux.md) |
| Wire up UART / I²C / SPI / CAN / PWM | [Common peripheral pin groups](hardware/groups.md) |
| Work out whether your board is V1.3 / V1.4 / V1.5 | [Errata and revision differences](hardware/errata.md) |
| Enter download mode and install xfel / rfel | [FEL download mode and tools](boot/fel.md) |
| Flash ready-made firmware (RustSBI + Asterinas, Linux + Buildroot) | [RustSBI + Asterinas](dev/asterinas/rustsbi-asterinas.md), [Prebuilt Linux images](dev/linux/linux-prebuilt.md) |
| Use the base board for display, Wi-Fi, CAN and audio | [YuzukiCube-M base board](baseboard.md) |
| Write programs | [Zephyr development](dev/zephyr/index.md), [Linux development](dev/linux/index.md), [RustSBI + Asterinas](dev/asterinas/rustsbi-asterinas.md) |
| Print an enclosure | [3D-printed enclosure](shell.md) |

## Board specifications

| Item | Specification |
| --- | --- |
| SoC | F101S3, XuanTie C907 RISC-V CPU (rv32imacfdv, with 64-bit support), QFN68 (7 mm × 7 mm) |
| Cache | 32 KB I-cache + 16 KB D-cache |
| Memory | SiP 16-bit PSRAM, up to 16 MiB (16 MiB on this board; V1.5 targets the 32 MiB configuration) |
| Storage | 16 MiB external NOR Flash with XIP support |
| Expansion | Pico-style 2 × 20 pin header |
| USB | USB-C connector; the SoC provides one USB 2.0 DRD controller |
| Other | microSD card socket and a button labelled `FEL` |
| Open-source license | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (hardware design files) |

:::caution
The onboard NOR Flash is a system resource: it holds the bootloader and the firmware. Erasing and writing it carelessly will stop the board from booting from Flash, so always [back it up](boot/flash-layout.md#back-up-the-whole-flash) first.
:::

## SoC capabilities

| Block | Capability |
| --- | --- |
| Image decoding | JPEG up to 16384 × 16384; PNG up to 2048 × 2048 |
| Image/video encoding | JPEG/MJPEG up to 720p@30 fps; maximum resolution 8192 × 8192 |
| Display processing | de-interlace up to 720p@60 fps; G2D rotation and mixing accelerator |
| Video output | RGB888 up to 1280 × 720@60 fps; single-link LVDS up to 1366 × 768@60 fps; 4-lane MIPI DSI up to 1280 × 800@60 fps |
| Audio | One DAC (DACOUT), I2S/PCM, OWA OUT |
| Security | 512-bit eFuse |
| Connectivity and peripherals | USB 2.0 DRD × 1, SDIO 2.0, SPI × 2, UART × 6, TWI × 3, CAN × 2, PWM, IR_RX, GPADC, TPADC |

:::tip
The table above is the SoC's capability ceiling; it does not mean that every item is brought out on the development board or has ready-made software support. For what is brought out and how well each software option supports it, see [Pinout](hardware/pinout.md) and the documentation for each software option ([Zephyr](dev/zephyr/index.md), [Linux](dev/linux/index.md)).
:::

## Related projects

- Development board repository: <https://github.com/YuzukiHD/YuzukiNeko>
- SyterKit (bootloader): <https://github.com/YuzukiHD/SyterKit>
- xfel: <https://github.com/xboot/xfel>, rfel: <https://github.com/rustsbi/allwinner-hal/tree/main/rfel>
