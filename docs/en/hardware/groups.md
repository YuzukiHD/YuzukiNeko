# Common Peripheral Pin Groups

The table below gives **complete, typical** peripheral combinations built from the pins on the headers. It is not the board's default wiring; before choosing one, check whether it conflicts with the enabled display, debug, power management or onboard peripherals.

| Purpose | One usable pin group | Notes |
| --- | --- | --- |
| UART0 | `PE0` F6 TX, `PE1` F6 RX | Basic serial pair |
| UART1 | `PB0` F4 TX, `PB1` F4 RX, `PB2` F4 RTS, `PB3` F4 CTS | UART1 signals can also be selected on other MUX groups |
| UART2 | `PD2` F4 TX, `PD3` F4 RX, `PD4` F4 RTS, `PD5` F4 CTS | `PE6` F3 / `PE7` F3 also provide TX / RX |
| UART3 | `PD0` F5 TX, `PD1` F5 RX, `PD3` F5 RTS, `PD4` F5 CTS | `PE8` F6 / `PE9` F6 and other pins offer alternate mappings |
| UART4 | `PD6` F5 TX, `PD7` F5 RX, `PD8` F5 RTS, `PD9` F5 CTS | `PE2`–`PE5` F6 provide the corresponding alternate signals |
| UART5 | `PD17` F5 TX, `PD18` F5 RX, `PD19` F5 RTS, `PD20` F5 CTS | Avoids the lower-numbered PD pins |
| I²C / TWI0 | `PE2` F4 SCK, `PE3` F4 SDA | Other mappings such as `PD0` F6 SCK + `PD2` F5 SDA are also possible |
| I²C / TWI1 | `PD8` F3 SCK, `PD9` F3 SDA | TWI1 can also use `PE0` F4 / `PE1` F4 |
| I²C / TWI2 | `PB2` F3 SCK, `PB3` F3 SDA | `PE4` F4 / `PE5` F4 are alternate TWI2 pins |
| SPI1 | `PD0` F3 CS0, `PD1` F3 CLK, `PD2` F3 MOSI, `PD3` F3 MISO, `PD4` F3 HOLD, `PD5` F3 WP, `PD6` F3 CS1 | Usable as SPI or DBI; an alternate group on PE pins also exists |
| I2S0 | `PD6` F4 MCLK, `PD7` F4 BCLK, `PD8` F4 LRCK, `PD9` F4 DOUT0; `PE4` F5 DIN0 | Choose signals according to recording/playback needs |
| CAN0 | `PE0` F7 TX, `PE1` F7 RX | Alternatives: `PB2` F6 / `PB3` F6, `PE6` F5 / `PE7` F5; needs an external transceiver |
| CAN1 | `PE2` F7 TX, `PE3` F7 RX | Alternatives: `PB0` F6 / `PB1` F6, `PE8` F5 / `PE9` F5; needs an external transceiver |
| PWM0 | CH0: `PB0` F7 / `PD1` F6 / `PD6` F6 / `PE2` F10 / `PE8` F7; CH1: `PB1` F7 / `PD7` F6 / `PE3` F10 / `PE9` F7; CH2: `PB2` F7 / `PD8` F6 / `PE4` F10 / `PE10` F7; CH3: `PB3` F7 / `PD9` F6 / `PE5` F10 | Pick one suitable MUX pin for each channel |
| RGB / LVDS / DSI | Mainly `PD0`–`PD9` and `PD12`–`PD22`, plus some `PE` pins | See [Pin Multiplexing](mux.md) for the exact F2–F7 selection. High-speed display signals need short traces, impedance control and a suitable reference design |

## Checklist when choosing a combination

1. Confirm the `F<n>` of each signal in [Pin Multiplexing](mux.md).
2. Make sure no two peripherals occupy the same pin at the same time.
3. Check for conflicts with the [pins already used on the board](overview.md#pins-already-used-on-the-board) (SD card, USB VBUS, display, etc.).
4. For UART/I²C/SPI and the like, make sure the pinctrl in your software matches the `F<n>` you chose.

## Two easy-to-hit conflicts

- **Display and DBI/SPI1 share `PD0`–`PD5`**: the LCD data lines occupy these pins, so only one of the two can be used at a time.
- **I2S0 and SDC2 share `PE0`–`PE4`**, and `PE2` is also the VBUS switch in USB host mode; in configurations that use USB host, I2S0 has no usable pins.
