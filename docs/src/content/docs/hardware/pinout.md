---
title: "Pinout"
---

The view in the table below is <strong>component side up, with the USB-C connector at the top</strong>; row numbers increase from the USB-C end towards the microSD end.

:::caution
The "actual SoC GPIO" column in this document applies to every revision. If you have a <strong>V1.3</strong> board, the silkscreen is two lower than the real GPIO from `PD10` onwards; always read the [errata](errata.md#v13-pd-silkscreen-numbering-error) before configuring pin multiplexing.
:::

## Header pinout table

In the table below, <strong>V1.3 silkscreen</strong> is the name printed on a V1.3 board, while <strong>Actual SoC GPIO / V1.4 silkscreen</strong> is the real SoC pin name — pinmux, software and schematics all use that column. Entries in bold differ from the V1.3 silkscreen.

| Row | Left: V1.3 silkscreen | Left: actual SoC GPIO / V1.4 silkscreen | Right: V1.3 silkscreen | Right: actual SoC GPIO / V1.4 silkscreen |
| ---: | --- | --- | --- | --- |
| 1 | `3V3` | `3V3` | `5V` | `5V` |
| 2 | `PD6` | `PD6` | `GND` | `GND` |
| 3 | `PD7` | `PD7` | `PD5` | `PD5` |
| 4 | `PD8` | `PD8` | `PD4` | `PD4` |
| 5 | `PD9` | `PD9` | `PD3` | `PD3` |
| 6 | `PD10` | <strong>`PD12`</strong> | `PD2` | `PD2` |
| 7 | `PD11` | <strong>`PD13`</strong> | `PD1` | `PD1` |
| 8 | `PD12` | <strong>`PD14`</strong> | `PD0` | `PD0` |
| 9 | `PD13` | <strong>`PD15`</strong> | `PD20` | <strong>`PD22`</strong> |
| 10 | `PD14` | <strong>`PD16`</strong> | `PB0` | `PB0` |
| 11 | `PD15` | <strong>`PD17`</strong> | `PB1` | `PB1` |
| 12 | `PD16` | <strong>`PD18`</strong> | `PB2` | `PB2` |
| 13 | `PD17` | <strong>`PD19`</strong> | `PB3` | `PB3` |
| 14 | `PD18` | <strong>`PD20`</strong> | `GPADC` | `GPADC` |
| 15 | `PD19` | <strong>`PD21`</strong> | `PE5` | `PE5` |
| 16 | `PE0` | `PE0` | `PE6` | `PE6` |
| 17 | `PE1` | `PE1` | `PE7` | `PE7` |
| 18 | `PE2` | `PE2` | `PE8` | `PE8` |
| 19 | `PE3` | `PE3` | `PE9` | `PE9` |
| 20 | `PE4` | `PE4` | `PE10` | `PE10` |

`3V3`, `5V` and `GND` are power pins, not GPIO. `GPADC` is the analog input pin; its channel, input range and reference voltage must be confirmed from the schematic and the SoC documentation.

## Quick reference: find a pin by function

| I want… | Usable pins |
| --- | --- |
| Plain GPIO | Any pin with a `P` prefix (Function0 input, Function1 output) |
| External interrupt | Function14 on every GPIO (`PD-EINTn` / `PE-EINTn` / `PB-EINTn`) |
| Analog input | `GPADC` |
| Console serial port | Depends on the software, see [Board overview](overview.md#common-software-pin-conventions) |
| Display output | `PD0`–`PD9`, `PD12`–`PD22` and some `PE` pins |
| Infrared receive | `PD5` / `PD7` / `PD22` / `PE5` / `PE6` / `PB1` / `PB3` (IR-RX) |

For every alternate function of each pin, see [Pin multiplexing (MUX)](mux.md).

## Notes

- A pin can select only one function at a time; functions listed in the same row are mutually exclusive.
- Display, LVDS, MIPI DSI, USB and XIP Flash are high-speed or boot-critical resources; before attaching expansion hardware, check the pinctrl settings, device tree and boot log of the BSP you are using.
- The CAN controllers expose logic-level signals only; a real CAN bus needs an external transceiver and correct bus termination.
- All header pins are 3.3 V logic.
