---
title: "Base board wiring"
---

The base board (YuzukiCube-M) brings the core board signals out to the display, audio, antenna, button and serial connectors. It contains no SoC: the core board is surface-mount soldered to it as `U1`, and all peripherals operate through the core board. Disconnect USB before wiring and confirm connector orientation before inserting anything.

## Base board function and power

The base board adds the following devices and connectors:

- `U3` AIC8800D80: Wi-Fi/Bluetooth module, with the antenna routed to `RF1`.
- `U5` TJA1051T/3: CAN transceiver on CAN0.
- `U2` LPA4890MSF: audio amplifier fed from `HPOUT`, output to `CN3`.
- `U4` RY3730: display backlight boost, outputs `VLED-A` / `VLED-K`.
- `U10` MT3520B: 5 V to 3.3 V buck.
- `FPC1`, `CN1`, `CN2`, `CN3`, `RF1`, `H1`, `SW1`: external connectors.

The base board has no battery or charging circuit; power comes from the core board's USB-C port.

| Rail | Source | Use | Note |
| --- | --- | --- | --- |
| `VSYS-5V` | Core board USB-C VBUS | Base board buck, CAN transceiver, audio amplifier, `H1` | Do not feed power back through `H1` |
| `VCC-3V3` | `U10` buck from `VSYS-5V` | Base board 3.3 V devices | 3.3 V logic |
| `VSYS-3V3` | Core board 3.3 V output | 3.3 V reference for the module and base board | Do not supply externally |
| `VLED-A` / `VLED-K` | `U4` boost | Display backlight | Brightness controlled by `DSI-PWM` |

:::caution
The core board is surface-mount soldered and cannot be removed. The bare parts include 49 pads and must be assembled with reflow or a rework station; hand soldering with a normal iron is not recommended.
:::

## Connector quick reference

| Need | Connector | Description |
| --- | --- | --- |
| Display and touch | `FPC1` | 40-pin 0.5 mm FPC, also carries backlight and touch |
| Console serial | `CN2` pins 1/2/5 | UART1 RX/TX/GND |
| Second serial port | `CN2` pins 3/4 | UART4 RX/TX |
| Speaker | `CN3` | `SPKR+` / `SPKR-` |
| Analog audio | `CN1` | `HPOUT` |
| Wi-Fi/Bluetooth antenna | `RF1` | IPEX / u.FL |

## Wiring rules

- Disconnect USB before connecting or disconnecting anything.
- Check the orientation, notch and gold contacts; do not insert at an angle.
- If a connector will not go in, stop and check the orientation; do not use force.
- FPC cables and 1.25 mm connectors are thin; do not pull on the cable when inserting or removing.
- See [Hardware files](../hardware/files.md) for the schematic.

## Connector mechanics

| Connector | Latch or insertion method | Note |
| --- | --- | --- |
| `FPC1` | Flip or slide latch | Power off; align the gold contacts |
| `CN1` / `CN2` / `CN3` | 1.25 mm socket | Check orientation and insert gently |
| `RF1` | IPEX / u.FL press-fit | Hold the connector body, not just the cable |
| `H1` | 2.54 mm female header | Do not power the board from here |

## Display: FPC1

`FPC1` is a 40-pin, 0.5 mm FPC (flat ribbon cable) connector. One cable carries MIPI DSI, backlight and capacitive touch.

| Signal group | Contents | Description |
| --- | --- | --- |
| MIPI DSI | `DSI-D0` to `DSI-D3`, clock, `DSI-RST` | Four data lanes plus clock |
| Backlight | `VLED-A` / `VLED-K`, `DSI-PWM` | Boosted by `U4`, dimmed by PWM |
| Touch | `CTP-SCK` / `CTP-SDA`, `CTP-INT`, `CTP-RST` | Capacitive touch on TWI1 |

1. Disconnect USB.
2. Locate the long `FPC1` connector and open its latch according to the connector design.
3. Align the cable's gold contacts with the connector contacts and insert fully in the notch direction.
4. Close the latch and tug the cable gently to confirm it is secure.
5. Do not fold the cable or touch the gold contacts.
6. Power up and check the display and touch.

:::note[Photo pending]
A photo of the base board with the display cable, showing the latch opening and the gold-contact orientation.
:::

See [YuzukiCube-M base board](../baseboard.md) for display and touch details.

## Display troubleshooting

| Check | Description |
| --- | --- |
| Cable orientation | Gold contacts face the socket contacts; follow the notch |
| Latch | Fully closed and the cable is not loose |
| Backlight | Backlight without a picture indicates a DSI signal or firmware problem |
| Firmware | Confirm that the firmware supports this display and resolution |
| Power | Check 5 V, 3.3 V and the backlight boost |

## Serial: CN2

`CN2` is a 5-pin, 1.25 mm connector that brings out UART1 and UART4. The console uses the three UART1 wires.

| Pin | Signal | Connection | Description |
| --- | --- | --- | --- |
| 1 | `UART1-RX` | Adapter `TX` | Board receives |
| 2 | `UART1-TX` | Adapter `RX` | Board transmits |
| 3 | `UART4-RX` | Leave unconnected | Second serial port |
| 4 | `UART4-TX` | Leave unconnected | Second serial port |
| 5 | `GND` | Adapter `GND` | Signal ground |

- Use a **3.3 V** USB-to-TTL adapter only; leave the adapter's `3V3`/`5V` unconnected.
- The board is powered by USB, so the serial adapter connects only `TX`, `RX` and `GND`.
- Use the silkscreen and schematic for pin numbering; if unsure, read [Hardware files](../hardware/files.md).
- Serial parameters are 115200 baud, 8N1, no flow control.

:::note[Photo pending]
A photo of the `CN2` connector and a 1.25 mm 5-pin plug, with pins 1 to 5 marked.
:::

## Audio: CN1 / CN3

`CN1` is the analog audio input connector and `CN3` is the speaker output connector. Both are 2-pin, 1.25 mm, but their functions differ and they must not be swapped.

| Connector | Connection | Description |
| --- | --- | --- |
| `CN1` | Analog audio `HPOUT` | Input to the `U2` audio amplifier |
| `CN3` | Speaker `SPKR+` / `SPKR-` | `U2` amplifier output |

- `U2` is enabled by `PD4` (`PA-SHDN`) and must be turned on by software.
- If polarity is marked, follow the marking; if not, confirm before connecting.
- Disconnect USB before wiring, and power up only after all connections are complete.
- Connect the speaker wires only to `CN3`; do not connect them to power or ground.

:::note[Photo pending]
A photo of the `CN3` speaker connector and the `CN1` audio connector, with arrows showing the difference.
:::

## Audio connection steps

1. Disconnect USB.
2. Connect the speaker to `CN3`, observing the `SPKR+` / `SPKR-` marking.
3. Connect the analog audio source to `CN1`.
4. Check plug orientation and polarity; do not connect to power or ground.
5. After power-up, enable the `PD4` amplifier in software.

## Antenna: RF1

`RF1` is an IPEX / u.FL antenna connector for the Wi-Fi/Bluetooth antenna.

- Align the antenna plug with the connector and press straight down until it is seated.
- Do not pull the antenna cable, and do not cover the antenna with metal.
- Connect the antenna before using Wi-Fi/Bluetooth.
- The connector and cable are delicate; hold the connector body when inserting or removing, not just the cable.

## Antenna installation steps

1. Disconnect USB.
2. Align the antenna plug with the `RF1` connector.
3. Press straight down until it is seated.
4. Tug the cable gently to confirm it is secure.
5. Do not pull the cable, and do not cover the antenna with metal.

## Button: SW1

`SW1` is a tactile button connected to `PD5` / `DOWN`, the same pin as the UF2 loader button.

- It is not a reset button and should not be used as one.
- Holding it during power-up can enter UF2 download mode when the corresponding firmware is installed.
- Pressing the button pulls `PD5` low; the internal pull-up restores the high level when released.

## 5 V header: H1

`H1` is a 2.54 mm 2-pin female header that brings out `VSYS-5V` and `GND`.

- It exposes USB 5 V; do not power the base board from this header.
- Do not connect motors, relays or other high-current loads.
- To measure 5 V, use a multimeter on DC voltage, with the black probe on `GND` and the red probe on `VSYS-5V`.

## CAN / Wi-Fi / Bluetooth

| Function | On-board device | External connection | Description |
| --- | --- | --- | --- |
| Wi-Fi/Bluetooth | `U3` AIC8800D80 | `RF1` antenna | SDIO and UART2 to the core board |
| CAN | `U5` TJA1051T/3 | CANH / CANL | Requires termination and bus wiring |
| Audio amplifier | `U2` LPA4890MSF | `CN3` speaker | Input from `HPOUT` |

- Wi-Fi uses SDIO on `PE0`–`PE5`; Bluetooth uses UART2 on `PE6`–`PE9`; `PE10` enables the Wi-Fi supply.
- The CAN controller only exposes logic-level signals; `U5` is the transceiver. A real bus still requires CANH/CANL wiring and termination resistors.
- These interfaces are advanced and are not needed for first-time flashing.

## Base board to core board signal mapping

| Function | Core board pins | Base board net |
| --- | --- | --- |
| Touch I²C | `PD0` / `PD1` | `CTP-SCK` / `CTP-SDA` |
| Touch interrupt and reset | `PD2` / `PD3` | `CTP-INT` / `CTP-RST` |
| Audio amplifier enable | `PD4` | `PA-SHDN` |
| Button | `PD5` | `DOWN` |
| UART4 | `PD6` / `PD7` | `UART4-TX` / `UART4-RX` |
| Bluetooth reset | `PD8` | `BT-RST-N` |
| Display reset | `PD9` | `DSI-RST` |
| MIPI DSI | `PD12`–`PD21` | `DSI-D0`–`DSI-D3`, clock |
| Backlight dimming | `PD22` | `DSI-PWM` |
| Wi-Fi SDIO | `PE0`–`PE5` | `SDC2-D0`–`SDC2-D3`, `CLK`, `CMD` |
| Bluetooth UART | `PE6`–`PE9` | `UART2-TX/RX/RTS/CTS` |
| Wi-Fi supply enable | `PE10` | `WL-REG-ON` |

These connections are fixed on the base board and cannot be moved to other pins by software. When the base board is used, do not assign the listed pins to other functions.

## Recommended wiring order

1. Disconnect USB.
2. Connect the display cable.
3. Connect the antenna.
4. Connect the speaker or audio.
5. Connect the serial port (optional).
6. Check against the list below.
7. Connect USB last.
8. After power-up, check the display, serial, audio and wireless functions in that order.

## Check before power-up

- USB is disconnected; all wiring was done with the power off.
- The display cable is fully inserted and the latch is closed.
- The antenna is seated and its cable is not under tension.
- `CN3` has the speaker and `CN1` has the audio; they are not swapped.
- The serial adapter is 3.3 V and only `TX`, `RX` and `GND` are connected.
- No loose wire ends touch other pins.
- The board is on a table and not touching a metal surface.
- No external power source is connected to `H1`.
- No motors, relays or other high-current loads are connected.

## Check after power-up

| Symptom | Description | Action |
| --- | --- | --- |
| Display lights up or shows a picture | Cable and backlight are working | Check touch and display orientation |
| Serial output appears | `TX`/`RX`/`GND` are correct | Continue with the boot log |
| Backlight only, no picture | DSI signal or firmware problem | Check cable orientation and display support |
| Display dark and serial silent | Firmware does not support the display, the board is in FEL, or power is abnormal | Return to [Core board wiring](core-board.md) and check |
| Strange smell or heat | Short circuit, reversed power or excessive peripheral current | Disconnect USB immediately and inspect |

## Power-down order

- Disconnect USB first and wait for the system to stop.
- Then remove 1.25 mm audio, serial and 2.54 mm header connections.
- Remove the FPC cable and antenna last.
- Do not connect or remove any peripheral while powered.

## Common problems

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Display shows nothing | Cable reversed, latch not closed, firmware unsupported | Power off, reseat the cable, confirm firmware and display model |
| Touch does not respond | Touch cable not seated, TWI configuration wrong | Check `FPC1` and the firmware touch driver |
| No serial output | `TX`/`RX` not crossed, no ground, wrong baud rate | Check each item in the `CN2` table |
| Speaker silent | `CN3` not connected, amplifier not enabled, volume low | Check `PD4`, the audio file and volume |
| Wi-Fi has no signal | Antenna missing, driver not loaded, power abnormal | Check `RF1`, `PE10` and the firmware |
| CAN does not communicate | CANH/CANL not connected, termination missing | Check the `U5` output and bus wiring |

---

Next page: [Install xfel](xfel.md)
