# Pinout

The tables below are viewed with the **component side up and the USB-C connector at the top**; row numbers increase from the USB-C end toward the microSD end.

!> The "Actual SoC GPIO" column on this page applies to all versions. If you use **V1.3**, the silkscreen from `PD10` on is 2 lower than the real GPIO, so read the [errata](errata.md#v13-pd-silkscreen-numbering-error) before configuring pin multiplexing.

## Header pin table

In the table below, **V1.3 silkscreen** is the name printed on V1.3 boards; **Actual GPIO / V1.4 silkscreen** is the real SoC pin name, which pinmux, software and schematics all use. Bold entries differ from the V1.3 silkscreen.

| Row | Left: V1.3 silkscreen | Left: actual GPIO / V1.4 silkscreen | Right: V1.3 silkscreen | Right: actual GPIO / V1.4 silkscreen |
| ---: | --- | --- | --- | --- |
| 1 | `3V3` | `3V3` | `5V` | `5V` |
| 2 | `PD6` | `PD6` | `GND` | `GND` |
| 3 | `PD7` | `PD7` | `PD5` | `PD5` |
| 4 | `PD8` | `PD8` | `PD4` | `PD4` |
| 5 | `PD9` | `PD9` | `PD3` | `PD3` |
| 6 | `PD10` | **`PD12`** | `PD2` | `PD2` |
| 7 | `PD11` | **`PD13`** | `PD1` | `PD1` |
| 8 | `PD12` | **`PD14`** | `PD0` | `PD0` |
| 9 | `PD13` | **`PD15`** | `PD20` | **`PD22`** |
| 10 | `PD14` | **`PD16`** | `PB0` | `PB0` |
| 11 | `PD15` | **`PD17`** | `PB1` | `PB1` |
| 12 | `PD16` | **`PD18`** | `PB2` | `PB2` |
| 13 | `PD17` | **`PD19`** | `PB3` | `PB3` |
| 14 | `PD18` | **`PD20`** | `GPADC` | `GPADC` |
| 15 | `PD19` | **`PD21`** | `PE5` | `PE5` |
| 16 | `PE0` | `PE0` | `PE6` | `PE6` |
| 17 | `PE1` | `PE1` | `PE7` | `PE7` |
| 18 | `PE2` | `PE2` | `PE8` | `PE8` |
| 19 | `PE3` | `PE3` | `PE9` | `PE9` |
| 20 | `PE4` | `PE4` | `PE10` | `PE10` |

`3V3`, `5V` and `GND` are power pins, not GPIO. `GPADC` is an analog input pin; for its channel, input range and reference voltage, rely on the schematic and the SoC documentation.

## Quick reference: find a pin by function

| I want... | Usable pins |
| --- | --- |
| Plain GPIO | Any pin with a `P` prefix (Function0 input, Function1 output) |
| External interrupt | Function14 of every GPIO (`PD-EINTn` / `PE-EINTn` / `PB-EINTn`) |
| Analog input | `GPADC` |
| Console serial port | Depends on the software, see [Board Overview](overview.md#common-software-pin-conventions) |
| Display output | `PD0`–`PD9`, `PD12`–`PD22` and some `PE` pins |
| IR receive | `PD5` / `PD7` / `PD22` / `PE5` / `PE6` / `PB1` / `PB3` (IR-RX) |

For the full list of multiplexed functions of each pin, see [Pin Multiplexing (MUX)](mux.md).

## Notes

- A pin can select only one function at a time; functions listed in the same row are mutually exclusive.
- Display, LVDS, MIPI DSI, USB and XIP Flash are high-speed or boot-critical resources. Before attaching expansion hardware, check the pinctrl settings, device tree and boot log of the BSP you use.
- The CAN controller only brings out logic-level signals; connecting to a real CAN bus requires an external transceiver and proper termination resistors.
- All header pins use 3.3 V logic.
