---
title: "Board overview"
---

## Main components

| Item | Description |
| --- | --- |
| SoC | F101S3 (QFN68, 7 mm × 7 mm), single-core XuanTie C907, rv32imacfdv, also supports 64-bit; it has an MMU, but common software does not enable it |
| Cache | 32 KB I-cache + 16 KB D-cache (64-byte cache line) |
| PSRAM | SiP 16-bit PSRAM, 16 MiB on this board; V1.5 targets the 32 MiB configuration (F101S4) |
| NOR Flash | 16 MiB, XIP support; the onboard Flash is a system resource and holds the boot loader |
| USB | USB-C, 1× USB 2.0 DRD; this port is also the FEL download port |
| Storage card | microSD socket, SMHC0, pins `PF0`–`PF5`, card detect `PF6` |
| Button | `FEL`: hold during power-up/reset to enter download mode |
| Header | 2 × 20, Pico form factor, see [Pinout](pinout.md) |

## Pins already used on the board

These pins have fixed on-board uses; when expanding, avoid them or confirm there is no conflict.

| Pin | On-board use | Notes |
| --- | --- | --- |
| `PF0`–`PF5` | microSD (SMHC0) | Multiplexed with JTAG (`PF0/1/3/5` mux 4); SD is unavailable while debugging over JTAG |
| `PF6` | microSD card detect (CD) | V1.4 and earlier need the drive strength lowered, see [Errata](errata.md) |
| `PC0`–`PC5` | SPI NOR Flash | Not on the header; a system resource |
| `FEL` button | Enter download mode | Onboard button, not on the header |

## Common software pin conventions

The following is how existing software uses the header pins. It is <strong>not a fixed hardware connection</strong>, but if you use those software images directly, it is the default configuration:

| Pin | Convention | Source |
| --- | --- | --- |
| `PB0` / `PB1` | UART1 TX / RX, console for the Zephyr `yuzukineko` board | Zephyr board configuration |
| `PE2` | VBUS switch in USB host mode | Zephyr USB host driver |
| `PE10` | Speaker amplifier enable for the onboard audio (configurations with an amplifier) | Zephyr audio |
| `PD5` | UF2 downloader button (active low, internal pull-up): hold during power-up to enter `F101BOOT` | UF2 loader, see [UF2](../dev/zephyr/zephyr-uf2.md) |
| `PD0`–`PD22` | RGB LCD data/timing lines | Display stack, occupied once display is enabled |

:::caution
Which header pins the console serial port is on depends on the software in use (Zephyr `yuzukineko`: UART1 `PB0/PB1`). Before wiring, go by the [schematic](files.md) and the documentation for the firmware you flashed.
:::

## Power

- `5V`: from USB-C (VBUS) or an external input, on the right of header row 1.
- `3V3`: onboard regulator output, on the left of header row 1.
- All GPIOs are 3.3 V logic. For the exact electrical limits, ADC range and reference voltage, go by the F101S3 datasheet and schematic.

## Revisions

The current latest is <strong>V1.5</strong>; for the differences between revisions (PD silkscreen, `R11`, PSRAM LDO), see [Errata and revision differences](errata.md).
