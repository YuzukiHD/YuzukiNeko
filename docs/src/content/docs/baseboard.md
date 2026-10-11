---
title: "YuzukiCube-M Base Board"
---

`04_BaseBoard/V1.0/` is the base board (carrier board) for the YuzukiNeko. There is no SoC on the base board: the YuzukiNeko module itself is fitted on the base board as `U1` (`YuzukiNeko-SMT` in the BOM, 49 pads), and the base board routes the module's MIPI DSI, SDIO, UART, TWI, CAN and other signals to the actual devices and connectors.

:::tip
The project file name is `YuzukiCube-M`, while the title block of the schematic still says `YuzukiNeko` (`REV: V1.0`, 2026-10-09). Both refer to the same base board.
:::

:::caution
The pin mapping in this page is read from the netlist of the base board schematic `04_BaseBoard/V1.0/01_SCH/SCH_Schematic2_2026-10-10.pdf`; before wiring anything, treat that schematic as authoritative. The net names use the <strong>module's actual GPIO names</strong>; if you have fitted a V1.3 module, convert the silkscreen labels using the [errata](hardware/errata.md#v13-pd-silkscreen-numbering-error).
:::

## Onboard devices

| Designator | Device | Function |
| --- | --- | --- |
| `U1` | YuzukiNeko-SMT | The module itself, 49 pads; every other circuit on the base board hangs off it |
| `U3` | AIC8800D80 | Wi-Fi / Bluetooth module (LGA-44), antenna via `RF1` |
| `U5` | TJA1051T/3/1J | CAN transceiver, connected to CAN0, with `CANH` / `CANL` broken out |
| `U2` | LPA4890MSF | Audio amplifier, input taken from `HPOUT`, output `SPKR+` / `SPKR-` |
| `U4` | RY3730 | Backlight boost (`L1` 4.7 µH, `D1` B5819WS), output `VLED-A` / `VLED-K` |
| `U10` | MT3520B | Buck converter, `VSYS-5V` → `VCC-3V3` (`L2` 2.2 µH) |
| `FPC1` | FPC-05F-40PH20 | 40-pin 0.5 mm FPC: MIPI DSI + backlight + capacitive touch |
| `CN1` | HC-1.25-2PLT | 2-pin 1.25 mm, `HPOUT` analog audio |
| `CN2` | 1.25-5P WT | 5-pin 1.25 mm, breaks out `UART1-RX` / `UART1-TX` and `UART4-RX` / `UART4-TX` |
| `CN3` | HC-1.25-2PLT | 2-pin 1.25 mm, `SPKR+` / `SPKR-` speaker |
| `RF1` | BWIPX-1-001E | IPEX / u.FL antenna socket (Wi-Fi / Bluetooth) |
| `H1` | 2.54 mm 2-pin header | Breaks out `VSYS-5V` and `GND` |
| `SW1` | TC-6615-5-260G | Tactile switch, connected to `PD5` (`DOWN` net) |

## Module pins used

| Module pin | Base board net | Purpose |
| --- | --- | --- |
| `PD0` / `PD1` | `CTP-SCK` / `CTP-SDA` | TWI1 for capacitive touch (F4) |
| `PD2` / `PD3` | `CTP-INT` / `CTP-RST` | Touch interrupt and reset |
| `PD4` | `PA-SHDN` | Audio amplifier enable |
| `PD5` | `DOWN` | Button `SW1`, the same pin as the module's UF2 downloader button |
| `PD6` / `PD7` | `UART4-TX` / `UART4-RX` | Serial port, brought out to `CN2` (F5) |
| `PD8` | `BT-RST-N` | Bluetooth reset |
| `PD9` | `DSI-RST` | Display reset |
| `PD12`–`PD21` | `DSI-D0P/N`, `DSI-D1P/N`, `DSI-CKP/N`, `DSI-D2P/N`, `DSI-D3P/N` | MIPI DSI, four data lanes plus clock (F4) |
| `PD22` | `DSI-PWM` | Backlight dimming (F4 PWM0-2) |
| `PB0` / `PB1` | `UART1-TX` / `UART1-RX` | Serial port, brought out to `CN2` (F4) |
| `PB2` / `PB3` | `CAN-TX` / `CAN-RX` | CAN0, connected to `U5` (F6) |
| `PE0`–`PE5` | `SDC2-D1`, `SDC2-D0`, `SDC2-CLK`, `SDC2-CMD`, `SDC2-D3`, `SDC2-D2` | SDIO for Wi-Fi (F9) |
| `PE6`–`PE9` | `UART2-TX`, `UART2-RX`, `UART2-RTS`, `UART2-CTS` | Bluetooth HCI serial port (F3) |
| `PE10` | `WL-REG-ON` | Wi-Fi module power enable |

:::tip
`PB0` / `PB1` are also the console UART1 of the Zephyr `yuzukineko` board in the module documentation, so on the base board you can connect `CN2` to see the console output.
:::

## Display and touch

`FPC1` is a single 40-pin ribbon that carries three signal groups at once:

- **MIPI DSI**: `DSI-D0P/N`, `DSI-D1P/N`, `DSI-CKP/N`, `DSI-D2P/N`, `DSI-D3P/N`, with reset controlled by `DSI-RST` on `PD9`.
- **Backlight**: `VLED-A` comes from the `U4` boost output, its return is `VLED-K`, and brightness is dimmed by `DSI-PWM` on `PD22`.
- **Capacitive touch**: `CTP-SCK` / `CTP-SDA` go over TWI1, with interrupt and reset on `CTP-INT` / `CTP-RST`.

## Power

- `VSYS-5V`: comes from the module's `5V` pin (USB-C VBUS). The buck converter `U10`, the CAN transceiver `U5`, the audio amplifier `U2` and `H1` all draw from this rail.
- `VCC-3V3`: produced by `U10` stepping down `VSYS-5V`.
- `VSYS-3V3`: the module's `3V3` output.
- `VLED-A` / `VLED-K`: the `U4` boost, dedicated to the backlight.

The base board has no battery or charging circuit; `VSYS-5V` comes entirely from the module's USB-C.

## Pin conflicts with the base board fitted

- `PE0`–`PE5` are taken by the Wi-Fi SDIO, and the module's I2S0 needs `PE4`, while `PD6`–`PD9` are also taken by `UART4`, `BT-RST-N` and `DSI-RST`, so <strong>I2S0 is unavailable on the base board</strong>.
- In the module documentation `PE10` is the onboard audio amplifier enable; the base board uses `PD4` (`PA-SHDN`) for amplifier enable instead and gives `PE10` to `WL-REG-ON`.
- On the module `PD0`–`PD3` are ordinary GPIO or SPI1; on the base board they are used for touch.

## Files

`04_BaseBoard/V1.0/` has the same structure as the seven entries under `01_Hardware/`: `01_SCH`, `02_PCB`, `03_Gerber`, `04_3D`, `05_BOM`, `06_PickAndPlace`, `07_Project`. Besides the PCB model, `04_3D/` also contains an enclosure, `3DShell_PCB2.zip`, which is a different thing from the [module's 3D-printed enclosure](shell.md).

For an overview of the directories see [Hardware file list](hardware/files.md), and for licensing see [License](license.md).
