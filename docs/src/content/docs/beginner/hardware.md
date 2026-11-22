---
title: "Meet the boards: core board and base board"
---

YuzukiNeko has two hardware levels: the core board and the base board. The core board is a complete SoC module that can be powered and flashed on its own; the base board is the YuzukiCube-M carrier, which carries the soldered core board and brings out display, audio, wireless and serial connectors. Identify both before wiring, and confirm the board revision.

## How the core board and base board relate

The core board uses the Pico 2×20 form factor and carries the F101 SoC, PSRAM, NOR Flash, USB-C, `FEL` button, microSD socket and headers. It can be connected to a host on its own for FEL download and flashing; the base board is not required.

The base board carries the core board as `U1` and adds the Wi-Fi/Bluetooth module, audio amplifier, CAN transceiver, display FPC connector, button and sockets. The base board has no battery or charging circuit; power still comes from the core board's USB-C port.

:::caution
The core board on the base board is surface-mount soldered and cannot be removed. The core board can be used on its own; the base board only brings out peripheral connectors.
:::

The bare parts include 49 pads that require surface-mount soldering. This package is not suitable for hand soldering with a normal iron; use reflow or a rework station, or buy the assembled version.

## Choosing the core board or base board

| Need | Recommendation |
| --- | --- |
| Flash images and learn FEL only | The core board is sufficient; no base board needed |
| Need display, audio, Wi-Fi or CAN | Use the YuzukiCube-M base board |
| Design a custom carrier | Refer to the `01_Hardware` schematics and the 49-pad module |

## Core board and base board connection methods

| Method | Use case | Connection |
| --- | --- | --- |
| Core board standalone | Flashing, FEL, header experiments | USB-C power; headers connect peripherals |
| Core board soldered to base board | Display, audio, Wi-Fi, CAN | 49-pad surface-mount soldering; base board brings out the connectors |

## Core board parts

![The front and back of the core board, labelled USB-C, FEL, NOR, F101, CARD and the headers](figures/board-render.webp)

| Part | Location | Identification | Function |
| --- | --- | --- | --- |
| USB-C port | One end of the board | Oval connector | Power, USB data and FEL download share it |
| `FEL` button | Between the NOR chip and the microSD socket | Small round button labelled `FEL` | Hold during power-up to enter FEL download mode |
| F101 SoC | Centre of the board | QFN68 package, 7 mm × 7 mm | CPU, memory controller and peripheral controllers |
| NOR Flash | Beside the SoC | Black package labelled `NOR` | 16 MiB SPI NOR holding the bootloader and system |
| PSRAM | Same package as the SoC (SiP) | Not visible on the board surface | 16 MiB run-time memory; some V1.5 boards have 32 MiB |
| microSD socket | Other end of the board | Metal socket labelled `CARD` | microSD card interface, optional |
| 2×20 headers | Both sides | 20 pins per side | Bring out GPIO, 3.3 V, 5 V and GND |
| GPIO | Signal pins on the headers | Silkscreen `PDx`, `PBx`, `PEx` | 3.3 V logic input or output |

## Core board headers

The headers use the Pico 2×20 layout. With the component side up and USB-C at the top, row 1 is `3V3` on the left and `5V` on the right, and row 2 has `GND` on the right. See [Pinout](../hardware/pinout.md) for the complete pin table.

| Pin | Position | Function | Note |
| --- | --- | --- | --- |
| `3V3` | Row 1, left | On-board 3.3 V regulator output | Do not feed power into this pin |
| `5V` | Row 1, right | USB VBUS 5 V | Power only; do not connect a 5 V signal |
| `GND` | Row 2, right | Signal ground | Share ground with external devices |
| GPIO | Remaining pins | 3.3 V logic input or output | Do not connect 5 V signals or power the board from the headers |

## Common core board pin functions

| Function | Example pins | Description |
| --- | --- | --- |
| UART1 console | `PB0` / `PB1` | 115200 8N1; default console for Zephyr, Linux and RustSBI |
| UART0 | `PE0` / `PE1` | Secondary serial port |
| TWI0 | `PE2` / `PE3` | I²C bus |
| TWI1 | `PD8` / `PD9` | Touch or external I²C devices |
| SPI1 | `PD0`–`PD6` | External SPI devices |
| PWM0 | `PB0`–`PB3`, `PD6`–`PD9`, etc. | Multiple PWM outputs |
| CAN0 | `PE0` / `PE1` or `PB2` / `PB3` | Requires an external transceiver |
| `GPADC` | `GPADC` | Single-channel analog input |

A pin can select only one alternate function at a time. See [Pinout](../hardware/pinout.md) and [Pin multiplexing](../hardware/mux.md) for the complete tables.

## Base board devices and connectors

:::note[Photo pending]
A photo of the whole base board, with `FPC1`, `CN2`, `CN3`, `CN1`, `RF1`, `H1`, `SW1` and `U1` marked.
:::

| Designator | Device or connector | Function | Note |
| --- | --- | --- | --- |
| `U1` | YuzukiNeko-SMT module | Core board, 49 pads | Surface-mount soldered, not removable |
| `U3` | AIC8800D80 | Wi-Fi/Bluetooth module | Antenna routed to `RF1` |
| `U5` | TJA1051T/3 | CAN transceiver on CAN0 | A real bus still needs CANH/CANL wiring and termination |
| `U2` | LPA4890MSF | Audio amplifier fed from `HPOUT` | Output to `CN3` |
| `U4` | RY3730 | Display backlight boost | Outputs `VLED-A` / `VLED-K` |
| `U10` | MT3520B | 5 V to 3.3 V buck | Supplies the base board's 3.3 V devices |
| `FPC1` | 40-pin, 0.5 mm FPC | MIPI DSI, backlight and capacitive touch | Thin cable; insert with the power off |
| `CN1` | 2-pin, 1.25 mm | Analog audio `HPOUT` | Do not connect the speaker |
| `CN2` | 5-pin, 1.25 mm | UART1 and UART4 | The console uses UART1 |
| `CN3` | 2-pin, 1.25 mm | Speaker `SPKR+` / `SPKR-` | Do not connect audio input |
| `RF1` | IPEX / u.FL | Wi-Fi/Bluetooth antenna | Press straight down; do not pull the cable |
| `H1` | 2.54 mm 2-pin female header | `VSYS-5V` and `GND` | Do not power the base board from here |
| `SW1` | Tactile button | `PD5` / `DOWN` | Not a reset button |

## Base board connector quick reference

| Need | Connector | Description |
| --- | --- | --- |
| Display and touch | `FPC1` | 40-pin 0.5 mm FPC, also carries backlight and touch |
| Console serial | `CN2` pins 1/2/5 | UART1 RX/TX/GND |
| Second serial port | `CN2` pins 3/4 | UART4 RX/TX |
| Speaker | `CN3` | `SPKR+` / `SPKR-` |
| Analog audio | `CN1` | `HPOUT` |
| Wi-Fi/Bluetooth antenna | `RF1` | IPEX / u.FL |

## Connector electrical characteristics

| Connector | Level or type | Note |
| --- | --- | --- |
| GPIO | 3.3 V digital | Must not receive 5 V signals |
| `GPADC` | Analog input | Input range is in the SoC documentation |
| `CN1` / `CN3` | Analog audio | Do not connect to power or ground |
| `CN2` | 3.3 V UART | Cross `TX`/`RX` |
| `FPC1` | MIPI DSI, backlight and touch | Insert and remove with the power off |

## Power

| Rail | Source | Use | Note |
| --- | --- | --- | --- |
| `VSYS-5V` | Core board USB-C VBUS | Base board buck, CAN transceiver, audio amplifier, `H1` | Do not feed power back through `H1` |
| `VCC-3V3` | `U10` buck from `VSYS-5V` | Base board 3.3 V devices | 3.3 V logic |
| `VSYS-3V3` | Core board 3.3 V output | 3.3 V reference for the module and base board | Do not supply externally |
| `VLED-A` / `VLED-K` | `U4` boost | Display backlight | Brightness controlled by `DSI-PWM` |

The base board has no battery and no charging circuit. All external interfaces use 3.3 V logic; the `5V` pin is power only.

## Power-up order

- Connect the display, antenna, audio and serial first, then plug in USB.
- Do not insert or remove FPC cables, 1.25 mm connectors or the antenna while powered.
- After power-up, check the display and serial output first, then test touch, audio and wireless functions.
- After power-off, wait a few seconds before powering up again so residual power does not affect detection.
- Do not cut power during flashing, and do not connect or remove peripherals during a write.

## Revision identification

Look for the `V1.3`, `V1.4` or `V1.5` silkscreen near the edge of the board. Revision differences mainly affect header silkscreen and microSD detection; USB power and FEL flashing are not affected.

| Revision | Main difference | Impact on wiring and flashing |
| --- | --- | --- |
| V1.3 | From `PD10` onwards, silkscreen is 2 lower than the actual GPIO; `R11` is 10 kΩ | Convert pin names before using the headers; microSD detection may be unstable; USB flashing is unaffected |
| V1.4 | PD silkscreen corrected; `R11` remains 10 kΩ | microSD detection may be unstable |
| V1.5 | PD silkscreen corrected; `R11` changed to 1 kΩ; dedicated PSRAM LDO added | microSD detection improved; some versions have 32 MiB PSRAM |

See [Errata and revision differences](../hardware/errata.md) when converting pin names.

## Usage limits

- The core board on the base board is not removable; do not pry it up or resolder it.
- `PE0`–`PE5` are occupied by Wi-Fi SDIO, so I2S0 is not available on the base board.
- `PD0`–`PD3` are used for capacitive touch, `PD5` for the button, and `PD6`–`PD9` for UART4, Bluetooth reset and DSI reset.
- `H1` only exposes USB 5 V; do not use it as a base board power input, and do not connect motors, relays or other high-current loads.
- The CAN controller only exposes logic-level signals; `U5` is the transceiver. A real bus still requires CANH/CANL wiring and termination resistors.
- All header pins use 3.3 V logic and must not be connected directly to 5 V signals.

## References

- Pinout and pin multiplexing: [Pinout](../hardware/pinout.md)
- Schematics and hardware files: [Hardware files](../hardware/files.md)
- Base board devices and power: [YuzukiCube-M base board](../baseboard.md)
- Revision differences and known issues: [Errata and revision differences](../hardware/errata.md)

---

Next page: [Core board wiring](core-board.md)
