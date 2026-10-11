---
title: "Common peripheral groups"
---

The tables below give <strong>complete, typical</strong> peripheral combinations built from the header pins. They are not the default board connections; before choosing one, check whether it conflicts with an enabled display, debug, power-management or onboard peripheral.

Each cell in the tables is "pin (function number)"; for example, `PE0` (F6) means switching `PE0` to Function6. One row per peripheral, with each signal given side by side in the same row.

### UART

| Peripheral | TX | RX | RTS | CTS | Notes |
| --- | --- | --- | --- | --- | --- |
| UART0 | `PE0` (F6) | `PE1` (F6) |  |  | Basic serial-port pair |
| UART1 | `PB0` (F4) | `PB1` (F4) | `PB2` (F4) | `PB3` (F4) | UART1 signals can also be selected on other MUX groups |
| UART2 | `PD2` (F4) | `PD3` (F4) | `PD4` (F4) | `PD5` (F4) | `PE6` F3 / `PE7` F3 also provide TX / RX |
| UART3 | `PD0` (F5) | `PD1` (F5) | `PD3` (F5) | `PD4` (F5) | `PE8` F6 / `PE9` F6 and other pins offer alternate mappings |
| UART4 | `PD6` (F5) | `PD7` (F5) | `PD8` (F5) | `PD9` (F5) | `PE2`–`PE5` F6 provide the corresponding alternate signals |
| UART5 | `PD17` (F5) | `PD18` (F5) | `PD19` (F5) | `PD20` (F5) | Avoids the lower-numbered PD pins |

### I²C (TWI)

| Peripheral | SCK | SDA | Notes |
| --- | --- | --- | --- |
| TWI0 | `PE2` (F4) | `PE3` (F4) | `PD0` F6 SCK + `PD2` F5 SDA and other mappings are also available |
| TWI1 | `PD8` (F3) | `PD9` (F3) | `PE0` F4 / `PE1` F4 may also be selected for TWI1 |
| TWI2 | `PB2` (F3) | `PB3` (F3) | `PE4` F4 / `PE5` F4 are alternate TWI2 pins |

### SPI

| Peripheral | CS0 | CLK | MOSI | MISO | HOLD | WP | CS1 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SPI1 | `PD0` (F3) | `PD1` (F3) | `PD2` (F3) | `PD3` (F3) | `PD4` (F3) | `PD5` (F3) | `PD6` (F3) | Usable as SPI or DBI; an alternate PE-pin group exists |

### I2S

| Peripheral | MCLK | BCLK | LRCK | DOUT0 | DIN0 | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| I2S0 | `PD6` (F4) | `PD7` (F4) | `PD8` (F4) | `PD9` (F4) | `PE4` (F5) | Use the signals needed for capture and/or playback |

### CAN

| Peripheral | TX | RX | Notes |
| --- | --- | --- | --- |
| CAN0 | `PE0` (F7) | `PE1` (F7) | `PB2` F6 / `PB3` F6 and `PE6` F5 / `PE7` F5 are alternate pairs; requires an external transceiver |
| CAN1 | `PE2` (F7) | `PE3` (F7) | `PB0` F6 / `PB1` F6 and `PE8` F5 / `PE9` F5 are alternate pairs; requires an external transceiver |

### PWM

| Peripheral | Channel | Selectable pins (function) | Notes |
| --- | --- | --- | --- |
| PWM0 | CH0 | `PB0` (F7), `PD1` (F6), `PD6` (F6), `PE2` (F10), `PE8` (F7) | Select one suitable MUX pin per channel |
| PWM0 | CH1 | `PB1` (F7), `PD7` (F6), `PE3` (F10), `PE9` (F7) |  |
| PWM0 | CH2 | `PB2` (F7), `PD8` (F6), `PE4` (F10), `PE10` (F7) |  |
| PWM0 | CH3 | `PB3` (F7), `PD9` (F6), `PE5` (F10) |  |

### RGB / LVDS / DSI

Mainly `PD0`–`PD9`, `PD12`–`PD22`, plus some `PE` pins. For the exact F2–F7 selection see [Pin multiplexing](mux.md). High-speed display signals require short routing, impedance control and a suitable reference design.

## Checklist when choosing a group

1. Confirm the `F<n>` for each signal in [Pin multiplexing](mux.md).
2. Make sure no two peripherals use the same pin at the same time.
3. Check for conflicts with the [pins already used on the board](overview.md#pins-already-used-on-the-board) (SD card, USB VBUS, display, etc.).
4. For UART/I²C/SPI and so on, make sure the pinctrl in the software matches the `F<n>` you chose.

## Two easy-to-hit conflicts

- <strong>Display and DBI/SPI1 share `PD0`–`PD5`</strong>: the LCD data lines occupy these pins, and only one of the two can be selected at a time.
- <strong>I2S0 and SDC2 share `PE0`–`PE4`</strong>, and `PE2` is also the VBUS switch in USB host mode; in configurations that use USB host, I2S0 has no available pins.
