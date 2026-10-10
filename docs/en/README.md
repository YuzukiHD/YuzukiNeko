# YuzukiNeko Pico Development Board

<p align="center">
  <img width="380" alt="YuzukiNeko 3D render" src="https://github.com/user-attachments/assets/650270c6-b822-48ad-bceb-6358ae01c4cd">
</p>

YuzukiNeko is a development board based on the **Allwinner F101 series SoC**, using the Raspberry Pi Pico 2 × 20 pin form factor. It carries 16 MiB of PSRAM (F101S3; the 32 MiB configuration of V1.5 uses F101S4) and 16 MiB of NOR Flash with XIP (execute-in-place) support, which suits RISC-V graphics, display, audio and general-purpose I/O projects. The hardware design is released under CC0 1.0.

## What this documentation covers

| I want to... | Where to go |
| --- | --- |
| Power up for the first time and get the board running | [Quick Start](quickstart.md) |
| Find out what a pin can do | [Pinout](hardware/pinout.md), [Pin Multiplexing](hardware/mux.md) |
| Connect UART / I²C / SPI / CAN / PWM | [Common Peripheral Pin Groups](hardware/groups.md) |
| Work out whether my board is V1.3 / V1.4 / V1.5 | [Errata and Version Differences](hardware/errata.md) |
| Enter download mode, install xfel / rfel | [FEL Download Mode and Tools](boot/fel.md) |
| Flash a ready-made firmware (RustSBI + Asterinas) | [RustSBI + Asterinas](firmware/rustsbi-asterinas.md) |
| Write programs | [Software Overview](dev/overview.md) |
| Print an enclosure | [3D-Printed Enclosure](shell.md) |

## Board specifications

| Item | Specification |
| --- | --- |
| SoC | F101S3, XuanTie C907 RISC-V CPU (rv32imac), QFN68 (7 mm × 7 mm) |
| Cache | 32 KB I-cache + 16 KB D-cache |
| Memory | SiP 16-bit PSRAM, up to 16 MiB (16 MiB on this board; V1.5 targets a 32 MiB configuration) |
| Storage | 16 MiB external NOR Flash, XIP supported |
| Expansion | Pico-style 2 × 20 pin headers |
| USB | USB-C connector; the SoC provides one USB 2.0 DRD controller |
| Other | microSD card slot, `FEL` button |
| License | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (hardware design files) |

!> The onboard NOR Flash is a system resource: it holds the boot loader and firmware. Careless erasing or writing can leave the board unable to boot from Flash, so always [back it up](boot/flash-layout.md#back-up-the-whole-flash) first.

## SoC capabilities

| Module | Capability |
| --- | --- |
| Image decoding | JPEG up to 16384 × 16384; PNG up to 2048 × 2048 |
| Image/video encoding | JPEG/MJPEG up to 720p@30 fps, maximum resolution 8192 × 8192 |
| Display processing | De-interlacing up to 720p@60 fps; G2D rotation and blending accelerator |
| Video output | RGB888 up to 1280 × 720@60 fps; single-channel LVDS up to 1366 × 768@60 fps; 4-lane MIPI DSI up to 1280 × 800@60 fps |
| Audio | 1 DAC (DACOUT), I2S/PCM, OWA OUT |
| Security | 512-bit eFuse |
| Connectivity and peripherals | USB 2.0 DRD × 1, SDIO 2.0, SPI × 2, UART × 6, TWI × 3, CAN × 2, PWM, IR_RX, GPADC, TPADC |

?> The table above lists the upper limits of the SoC. It does not mean that every item is brought out on the board or has ready-made software support. For what is brought out and how far software support goes, see [Pinout](hardware/pinout.md) and [Software Overview](dev/overview.md).

## Related projects

- Board repository: <https://github.com/YuzukiHD/YuzukiNeko>
- Arduino support: <https://github.com/YuzukiHD/Arduino>
- SyterKit (boot loader): <https://github.com/YuzukiHD/SyterKit>
- xfel: <https://github.com/xboot/xfel>　rfel: <https://github.com/rustsbi/allwinner-hal/tree/main/rfel>
