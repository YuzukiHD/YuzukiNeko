# YuzukiCube-M Base Board

`04_BaseBoard/V1.0/` is the base board (carrier board) for YuzukiNeko. There is no SoC on it: the YuzukiNeko module itself is fitted as `U1` (listed in the BOM as `YuzukiNeko-SMT`, 49 pads), and the base board routes the module's MIPI DSI, SDIO, UART, TWI and CAN signals to actual devices and connectors.

?> The EDA project is named `YuzukiCube-M`, while the schematic title block still reads `YuzukiNeko` (`REV: V1.0`, 2026-10-09). Both refer to the same base board.

!> The pin assignments on this page were read from the netlist of the base-board schematic `04_BaseBoard/V1.0/01_SCH/SCH_Schematic2_2026-10-10.pdf`; check that schematic before wiring. Net names use the **actual GPIO names of the module**, so on a V1.3 module translate the silkscreen labels using the [errata](hardware/errata.md#v13-pd-silkscreen-numbering-error).

## Onboard devices

| Designator | Device | Function |
| --- | --- | --- |
| `U1` | YuzukiNeko-SMT | The module itself, 49 pads; the rest of the base board hangs off it |
| `U3` | AIC8800D80 | Wi-Fi / Bluetooth module (LGA-44), antenna via `RF1` |
| `U5` | TJA1051T/3/1J | CAN transceiver on CAN0, bringing out `CANH` / `CANL` |
| `U2` | LPA4890MSF | Audio power amplifier, input from `HPOUT`, output `SPKR+` / `SPKR-` |
| `U4` | RY3730 | Backlight boost (`L1` 4.7 µH, `D1` B5819WS), output `VLED-A` / `VLED-K` |
| `U10` | MT3520B | Buck converter, `VSYS-5V` → `VCC-3V3` (`L2` 2.2 µH) |
| `FPC1` | FPC-05F-40PH20 | 40-pin 0.5 mm FPC: MIPI DSI + backlight + capacitive touch |
| `CN1` | HC-1.25-2PLT | 2-pin 1.25 mm, `HPOUT` analog audio |
| `CN2` | 1.25-5P WT | 5-pin 1.25 mm, brings out `UART1-RX`/`UART1-TX` and `UART4-RX`/`UART4-TX` |
| `CN3` | HC-1.25-2PLT | 2-pin 1.25 mm, `SPKR+` / `SPKR-` speaker |
| `RF1` | BWIPX-1-001E | IPEX / u.FL antenna connector (Wi-Fi / Bluetooth) |
| `H1` | 2.54 mm 2-pin header | Brings out `VSYS-5V` and `GND` |
| `SW1` | TC-6615-5-260G | Tactile switch on `PD5` (net `DOWN`) |

## Module pins used

| Module pin | Base-board net | Function |
| --- | --- | --- |
| `PD0` / `PD1` | `CTP-SCK` / `CTP-SDA` | TWI1 for capacitive touch (F4) |
| `PD2` / `PD3` | `CTP-INT` / `CTP-RST` | Touch interrupt and reset |
| `PD4` | `PA-SHDN` | Audio amplifier enable |
| `PD5` | `DOWN` | Switch `SW1`; the same pin as the module's UF2 downloader button |
| `PD6` / `PD7` | `UART4-TX` / `UART4-RX` | Serial port, brought out on `CN2` (F5) |
| `PD8` | `BT-RST-N` | Bluetooth reset |
| `PD9` | `DSI-RST` | Display reset |
| `PD12`–`PD21` | `DSI-D0P/N`, `DSI-D1P/N`, `DSI-CKP/N`, `DSI-D2P/N`, `DSI-D3P/N` | MIPI DSI, four data lanes plus clock (F4) |
| `PD22` | `DSI-PWM` | Backlight dimming (F4 PWM0-2) |
| `PB0` / `PB1` | `UART1-TX` / `UART1-RX` | Serial port, brought out on `CN2` (F4) |
| `PB2` / `PB3` | `CAN-TX` / `CAN-RX` | CAN0, connected to `U5` (F6) |
| `PE0`–`PE5` | `SDC2-D1`, `SDC2-D0`, `SDC2-CLK`, `SDC2-CMD`, `SDC2-D3`, `SDC2-D2` | SDIO for Wi-Fi (F9) |
| `PE6`–`PE9` | `UART2-TX`, `UART2-RX`, `UART2-RTS`, `UART2-CTS` | Bluetooth HCI serial (F3) |
| `PE10` | `WL-REG-ON` | Wi-Fi module power enable |

?> `PB0` / `PB1` are also the console UART1 of the module's Zephyr `yuzukineko` board, so connecting `CN2` on the base board gives you console output.

## Display and touch

A single 40-pin `FPC1` ribbon carries three signal groups:

- **MIPI DSI**: `DSI-D0P/N`, `DSI-D1P/N`, `DSI-CKP/N`, `DSI-D2P/N`, `DSI-D3P/N`, with reset on `PD9` (`DSI-RST`).
- **Backlight**: `VLED-A` from the `U4` boost output, return through `VLED-K`, brightness set by `DSI-PWM` on `PD22`.
- **Capacitive touch**: `CTP-SCK` / `CTP-SDA` on TWI1, with `CTP-INT` / `CTP-RST` for interrupt and reset.

## Power

- `VSYS-5V`: comes from the module's `5V` pin (USB-C VBUS). The buck `U10`, the CAN transceiver `U5`, the audio amplifier `U2` and `H1` all draw from this rail.
- `VCC-3V3`: produced by `U10` from `VSYS-5V`.
- `VSYS-3V3`: the module's `3V3` output.
- `VLED-A` / `VLED-K`: the `U4` boost, dedicated to the backlight.

The base board has no battery or charging circuit; `VSYS-5V` comes entirely from the module's USB-C.

## Pin conflicts once the module is fitted

- `PE0`–`PE5` are taken by the Wi-Fi SDIO, and `PD6`–`PD9` are taken by `UART4`, `BT-RST-N` and `DSI-RST`, so **I2S0 is not available on the base board** (the module's I2S0 needs `PE4` and `PD6`–`PD9`).
- In the module documentation `PE10` is the onboard audio amplifier enable; the base board drives its amplifier from `PD4` (`PA-SHDN`) instead and gives `PE10` to `WL-REG-ON`.
- `PD0`–`PD3` are ordinary GPIO or SPI1 on the module, and drive the touch panel here.

## Files

`04_BaseBoard/V1.0/` has the same seven items as `01_Hardware/`: `01_SCH`, `02_PCB`, `03_Gerber`, `04_3D`, `05_BOM`, `06_PickAndPlace`, `07_Project`. Besides the PCB model, `04_3D/` also holds an enclosure, `3DShell_PCB2.zip`, which is separate from the [module's 3D-printed enclosure](shell.md).

For the directory overview see [Hardware Files](hardware/files.md); for licensing see [License](license.md).
