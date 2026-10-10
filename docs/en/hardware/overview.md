# Board Overview

## Main components

| Item | Description |
| --- | --- |
| SoC | F101S3 (QFN68, 7 mm × 7 mm), single-core XuanTie C907, rv32imac; has an MMU, but common software does not enable it |
| Cache | 32 KB I-cache + 16 KB D-cache (64-byte cache line) |
| PSRAM | SiP 16-bit PSRAM, 16 MiB on this board; V1.5 targets a 32 MiB configuration (F101S4) |
| NOR Flash | 16 MiB, XIP supported; the onboard Flash is a system resource and holds the boot loader |
| USB | USB-C, one USB 2.0 DRD; this port is also the FEL download port |
| Memory card | microSD slot, SMHC0, pins `PF0`–`PF5`, card detect `PF6` |
| Button | `FEL`: hold it at power-up/reset to enter download mode |
| Headers | 2 × 20, Pico form factor, see [Pinout](pinout.md) |

## Pins already used on the board

The following pins have fixed uses on the board. Avoid them when adding expansions, or confirm there is no conflict.

| Pin | Use on the board | Notes |
| --- | --- | --- |
| `PF0`–`PF5` | microSD (SMHC0) | Shared with JTAG (`PF0/1/3/5` mux 4); the SD card is unavailable while debugging over JTAG |
| `PF6` | microSD card detect (CD) | On V1.4 and earlier the drive strength must be lowered, see [Errata](errata.md) |
| `PC0`–`PC5` | SPI NOR Flash | Not on the headers, system resource |
| `FEL` button | Enter download mode | Onboard button, not on the headers |

## Common software pin conventions

The following is how existing software uses the header pins. It is **not a fixed hardware connection**, but if you use these software images directly, it is the default configuration:

| Pin | Convention | Source |
| --- | --- | --- |
| `PB0` / `PB1` | UART1 TX / RX, console of the Zephyr `yuzukineko` board | Zephyr board configuration |
| `PE2` | VBUS switch in USB host mode | Zephyr USB host driver |
| `PE10` | Speaker amplifier enable for onboard audio (configurations with an amplifier) | Zephyr / Arduino audio |
| `PD5` | UF2 downloader button (active low, internal pull-up): hold it at power-up to enter `F101BOOT` | UF2 loader, see [UF2](../dev/uf2.md) |
| `PD0`–`PD22` | RGB LCD data/timing lines | Display stack, occupied once display is enabled |

!> Which pin group the console serial port actually uses depends on the software (Zephyr `yuzukineko`: UART1 `PB0/PB1`; Arduino `Serial`: as configured by that board's core). Before wiring, rely on the [schematic](files.md) and the notes of the firmware you flashed.

## Power

- `5V`: from USB-C (VBUS) or an external input, on the right side of header row 1.
- `3V3`: onboard regulator output, on the left side of header row 1.
- All GPIO use 3.3 V logic. For exact electrical limits, ADC range and reference voltage, rely on the F101S3 datasheet and the schematic.

## Versions

The latest is **V1.5**. For the differences between versions (PD silkscreen, `R11`, PSRAM LDO) see [Errata and Version Differences](errata.md).
