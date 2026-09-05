# YuzukiNeko Pico Development Board

> CC0-1.0 open-source hardware · Raspberry Pi Pico-style 2 × 20 pin layout · RISC-V multimedia SoC

<img width="380" height="409" alt="3D_PCB1_2026-09" src="https://github.com/user-attachments/assets/650270c6-b822-48ad-bceb-6358ae01c4cd" />

This compact development board is based on the **F101S3**. It follows the Raspberry Pi Pico form factor with two 20-pin rows, and includes 16 MiB of PSRAM plus 16 MiB of NOR Flash with XIP (execute-in-place) support. It is a capable hardware platform for RISC-V graphics, display, audio, and general-purpose I/O projects.

> The *multiplexed functions* in this document are functions the SoC **can select** on a pin. They are not simultaneous functions, nor do they imply that every function is routed, enabled, or used by default on this board. Configure one function per pin in pinctrl/pinmux software.

## Board Features

| Item | Specification |
| --- | --- |
| SoC | F101S3 with XuanTie C907 RISC-V CPU, QFN68 (7 mm × 7 mm) |
| CPU cache | 32 KB I-cache + 16 KB D-cache |
| RAM | SiP 16-bit PSRAM, up to 16 MiB; 16 MiB fitted on this board |
| Storage | 16 MiB external NOR Flash with XIP support |
| Expansion headers | Pico-style 2 × 20 pin layout |
| USB | USB-C connector; the SoC provides one USB 2.0 DRD controller |
| Other visible hardware | microSD card socket and a button labelled `FEL` |
| Open-hardware license | [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) |

> The onboard NOR Flash are system resources.

## SoC Capabilities

| Block | Capability |
| --- | --- |
| Image decoding | JPEG up to 16384 × 16384; PNG up to 2048 × 2048 |
| Image/video encoding | JPEG/MJPEG up to 720p@30 fps; maximum resolution 8192 × 8192 |
| Display processing | de-interlace up to 720p@60 fps; G2D rotation and mixing accelerator |
| Video output | RGB888 up to 1280 × 720@60 fps; single-link LVDS up to 1366 × 768@60 fps; 4-lane MIPI DSI up to 1280 × 800@60 fps |
| Audio | One DAC (DACOUT), I2S/PCM, OWA OUT |
| Security | 512-bit eFuse |
| Connectivity and peripherals | USB 2.0 DRD × 1, SDIO 2.0, SPI × 2, UART × 6, TWI × 3, CAN × 2, PWM, IR_RX, GPADC, TPADC |

## Pinout

The view below is from the **component side with the USB-C connector at the top**. Rows progress from the USB-C end towards the microSD socket.

### V1.3 errata: PD pin-numbering error

F101S3 has no `PD10` or `PD11`. On the V1.3 PCB, the PD silkscreen was numbered consecutively after `PD9`; this makes every PD label from `PD10` onwards **two lower than the actual SoC GPIO number**. This is an identification error in the V1.3 silkscreen. V1.4 corrects the labels; use the **actual F101S3 GPIO / V1.4 silkscreen** column below for pinmux, software, and schematics.

| V1.3 silkscreen | Actual F101S3 GPIO / V1.4 silkscreen | Effect |
| --- | --- | --- |
| `PD10` | `PD12` | MUX selection must use `PD12` |
| `PD11` | `PD13` | MUX selection must use `PD13` |
| `PD12`–`PD20` | `PD14`–`PD22` | Each corresponding label is offset by +2 |

| Header row | Left: V1.3 silkscreen | Left: actual SoC GPIO / V1.4 silkscreen | Right: V1.3 silkscreen | Right: actual SoC GPIO / V1.4 silkscreen |
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

`3V3`, `5V`, and `GND` are power pins, not GPIO; design external interfaces for 3.3V logic. `GPADC` is the analog-input pin. Its exact channel, input range, and reference voltage must be confirmed from the schematic and SoC documentation.

## Pin Multiplexing (MUX)

Every GPIO in the following tables can be used as ordinary GPIO: **Function0 is input and Function1 is output**. Functions11–13 are reserved; **EINT is Function14**. `F<n>` below is the pinmux functions, sheet **2 GPIO Multiplex Function**. Functions in a single row are mutually exclusive.

### Left header — actual SoC GPIO

| Pin | Available alternate functions | EINT |
| --- | --- | --- |
| `PD6` | F2 LCD0-D10; F3 SPI1-CS1; F4 I2S0-MCLK; F5 UART4-TX; F6 PWM0-0 | F14 PD-EINT6 |
| `PD7` | F2 LCD0-D11; F3 IR-RX; F4 I2S0-BCLK; F5 UART4-RX; F6 PWM0-1 | F14 PD-EINT7 |
| `PD8` | F2 LCD0-D12; F3 TWI1-SCK; F4 I2S0-LRCK; F5 UART4-RTS; F6 PWM0-2 | F14 PD-EINT8 |
| `PD9` | F2 LCD0-D13; F3 TWI1-SDA; F4 I2S0-DOUT0; F5 UART4-CTS; F6 PWM0-3; F7 LCD0-VSYNC | F14 PD-EINT9 |
| `PD12` | F2 LCD0-D18; F3 LVDS0-D0P; F4 DSI-D0P; F5 UART3-RX; F6 TWI0-SDA | F14 PD-EINT12 |
| `PD13` | F2 LCD0-D19; F3 LVDS0-D0N; F4 DSI-D0N; F5 UART2-TX | F14 PD-EINT13 |
| `PD14` | F2 LCD0-D20; F3 LVDS0-D1P; F4 DSI-D1P; F5 UART2-RX | F14 PD-EINT14 |
| `PD15` | F2 LCD0-D21; F3 LVDS0-D1N; F4 DSI-D1N; F5 UART2-RTS | F14 PD-EINT15 |
| `PD16` | F2 LCD0-D22; F3 LVDS0-D2P; F4 DSI-CKP; F5 UART2-CTS | F14 PD-EINT16 |
| `PD17` | F2 LCD0-D23; F3 LVDS0-D2N; F4 DSI-CKN; F5 UART5-TX | F14 PD-EINT17 |
| `PD18` | F2 LCD0-CLK; F3 LVDS0-CKP; F4 DSI-D2P; F5 UART5-RX | F14 PD-EINT18 |
| `PD19` | F2 LCD0-HSYNC; F3 LVDS0-CKN; F4 DSI-D2N; F5 UART5-RTS; F6 UART4-TX | F14 PD-EINT19 |
| `PD20` | F2 LCD0-VSYNC; F3 LVDS0-D3P; F4 DSI-D3P; F5 UART5-CTS; F6 UART4-RX | F14 PD-EINT20 |
| `PD21` | F2 LCD0-DE; F3 LVDS0-D3N; F4 DSI-D3N; F5 UART1-TX; F6 UART4-RTS | F14 PD-EINT21 |
| `PE0` | F3 LCD0-D0; F4 TWI1-SCK; F5 I2S0-MCLK; F6 UART0-TX; F7 CAN0_TX0; F8 SPI1-CS0/DBI-CSX; F9 SDC2-D1; F10 CLK-FANOUT0 | F14 PE-EINT0 |
| `PE1` | F3 LCD0-D1; F4 TWI1-SDA; F5 I2S0-BCLK; F6 UART0-RX; F7 CAN0_RX0; F8 SPI1-CLK/DBI-SCLK; F9 SDC2-D0 | F14 PE-EINT1 |
| `PE2` | F3 LCD0-D8; F4 TWI0-SCK; F5 I2S0-LRCK; F6 UART4-TX; F7 CAN1_TX0; F8 SPI1-MOSI/DBI-SDO; F9 SDC2-CLK; F10 PWM0-0 | F14 PE-EINT2 |
| `PE3` | F3 LCD0-D9; F4 TWI0-SDA; F5 I2S0-DOUT0; F6 UART4-RX; F7 CAN1_RX0; F8 SPI1-MISO/DBI-SDI/DBI-TE/DBI-DCX; F9 SDC2-CMD; F10 PWM0-1 | F14 PE-EINT3 |
| `PE4` | F3 LCD0-D16; F4 TWI2-SCK; F5 I2S0-DIN0; F6 UART4-RTS; F7 UART5-TX; F8 SPI1-HOLD/DBI-DCX/DBI-WRX; F9 SDC2-D3; F10 PWM0-2 | F14 PE-EINT4 |

### Right header — actual SoC GPIO

| Pin | Available alternate functions | EINT |
| --- | --- | --- |
| `PD5` | F2 LCD0-D7; F3 SPI1-WP/DBI-TE; F4 UART2-CTS; F5 IR-RX; F6 TWI0-SDA | F14 PD-EINT5 |
| `PD4` | F2 LCD0-D6; F3 SPI1-HOLD/DBI-DCX/DBI-WRX; F4 UART2-RTS; F5 UART3-CTS; F6 TWI0-SCK | F14 PD-EINT4 |
| `PD3` | F2 LCD0-D5; F3 SPI1-MISO/DBI-SDI/DBI-TE/DBI-DCX; F4 UART2-RX; F5 UART3-RTS; F6 UART1-RX; F7 RJTAG-CK | F14 PD-EINT3 |
| `PD2` | F2 LCD0-D4; F3 SPI1-MOSI/DBI-SDO; F4 UART2-TX; F5 TWI0-SDA; F6 UART1-TX; F7 RJTAG-DO | F14 PD-EINT2 |
| `PD1` | F2 LCD0-D3; F3 SPI1-CLK/DBI-SCLK; F4 TWI1-SDA; F5 UART3-RX; F6 PWM0-0; F7 RJTAG-DI | F14 PD-EINT1 |
| `PD0` | F2 LCD0-D2; F3 SPI1-CS0/DBI-CSX; F4 TWI1-SCK; F5 UART3-TX; F6 TWI0-SCK; F7 RJTAG-MS | F14 PD-EINT0 |
| `PD22` | F2 OWA-OUT; F3 IR-RX; F4 PWM0-2; F5 UART1-RX; F6 UART4-CTS | F14 PD-EINT22 |
| `PB0` | F2 BOOST1-PWM; F3 TWI1-SCK; F4 UART1-TX; F5 UART2-RTS; F6 CAN1_TX0; F7 PWM0-0; F8 SPIF0-CS1 | F14 PB-EINT0 |
| `PB1` | F2 BOOST1-FB; F3 TWI1-SDA; F4 UART1-RX; F5 UART2-CTS; F6 CAN1_RX0; F7 PWM0-1; F8 IR-RX | F14 PB-EINT1 |
| `PB2` | F2 BOOST0-PWM; F3 TWI2-SCK; F4 UART1-RTS; F5 UART2-TX; F6 CAN0_TX0; F7 PWM0-2; F8 SPI0-CS1 | F14 PB-EINT2 |
| `PB3` | F2 BOOST0-FB; F3 TWI2-SDA; F4 UART1-CTS; F5 UART2-RX; F6 CAN0_RX0; F7 PWM0-3; F8 IR-RX | F14 PB-EINT3 |
| `GPADC` | Analog input (one-channel GPADC; board-level channel assignment needs schematic confirmation) | — |
| `PE5` | F3 LCD0-D17; F4 TWI2-SDA; F5 IR-RX; F6 UART4-CTS; F7 UART5-RX; F8 SPI1-WP/DBI-TE; F9 SDC2-D2; F10 PWM0-3 | F14 PE-EINT5 |
| `PE6` | F3 UART2-TX; F4 LCD0-D14; F5 CAN0_TX0; F6 OWA-OUT; F7 IR-RX; F8 SPI1-CS1 | F14 PE-EINT6 |
| `PE7` | F3 UART2-RX; F4 LCD0-D15; F5 CAN0_RX0; F8 SPI1-CS0/DBI-CSX; F9 CLK-FANOUT1 | F14 PE-EINT7 |
| `PE8` | F3 UART2-RTS; F4 TWI0-SCK; F5 CAN1_TX0; F6 UART3-TX; F7 PWM0-0; F8 SPI1-CLK/DBI-SCLK; F9 CLK-FANOUT2 | F14 PE-EINT8 |
| `PE9` | F3 UART2-CTS; F4 TWI0-SDA; F5 CAN1_RX0; F6 UART3-RX; F7 PWM0-1; F8 SPI1-MOSI/DBI-SDO | F14 PE-EINT9 |
| `PE10` | F3 UART4-TX; F4 TWI1-SCK; F5 I2S0-MCLK; F6 UART1-TX; F7 PWM0-2; F8 SPI1-MISO/DBI-SDI/DBI-TE/DBI-DCX | F14 PE-EINT10 |

## Common Peripheral Groups

This table is not a list of default board connections. It provides complete, typical combinations using exposed pins. Before selecting one, check for conflicts with enabled display, debug, power-management, or onboard peripherals.

| Purpose | One usable pin group | Notes |
| --- | --- | --- |
| UART0 | `PE0` F6 TX, `PE1` F6 RX | Basic serial-port pair |
| UART1 | `PB0` F4 TX, `PB1` F4 RX, `PB2` F4 RTS, `PB3` F4 CTS | UART1 signals can also be selected on other MUX groups |
| UART2 | `PD2` F4 TX, `PD3` F4 RX, `PD4` F4 RTS, `PD5` F4 CTS | `PE6` F3 / `PE7` F3 also provide TX / RX |
| UART3 | `PD0` F5 TX, `PD1` F5 RX, `PD3` F5 RTS, `PD4` F5 CTS | PE8 F6 / PE9 F6 and other pins offer alternate mappings |
| UART4 | `PD6` F5 TX, `PD7` F5 RX, `PD8` F5 RTS, `PD9` F5 CTS | `PE2`–`PE5` F6 provide corresponding alternate signals |
| UART5 | `PD17` F5 TX, `PD18` F5 RX, `PD19` F5 RTS, `PD20` F5 CTS | Avoids the lower-numbered PD pins |
| I²C / TWI0 | `PE2` F4 SCK, `PE3` F4 SDA | `PD0` F6 SCK + `PD2` F5 SDA and other mappings are also available |
| I²C / TWI1 | `PD8` F3 SCK, `PD9` F3 SDA | `PE0` F4 / `PE1` F4 may also be selected for TWI1 |
| I²C / TWI2 | `PB2` F3 SCK, `PB3` F3 SDA | `PE4` F4 / `PE5` F4 are alternate TWI2 pins |
| SPI1 | `PD0` F3 CS0, `PD1` F3 CLK, `PD2` F3 MOSI, `PD3` F3 MISO, `PD4` F3 HOLD, `PD5` F3 WP, `PD6` F3 CS1 | Usable as SPI or DBI; an alternate PE-pin group exists |
| I2S0 | `PD6` F4 MCLK, `PD7` F4 BCLK, `PD8` F4 LRCK, `PD9` F4 DOUT0; `PE4` F5 DIN0 | Use the signals needed for capture and/or playback |
| CAN0 | `PE0` F7 TX, `PE1` F7 RX | `PB2` F6 / `PB3` F6 and `PE6` F5 / `PE7` F5 are alternate pairs; requires an external transceiver |
| CAN1 | `PE2` F7 TX, `PE3` F7 RX | `PB0` F6 / `PB1` F6 and `PE8` F5 / `PE9` F5 are alternate pairs; requires an external transceiver |
| PWM0 | CH0: `PB0` F7 / `PD1` F6 / `PD6` F6 / `PE2` F10 / `PE8` F7; CH1: `PB1` F7 / `PD7` F6 / `PE3` F10 / `PE9` F7; CH2: `PB2` F7 / `PD8` F6 / `PE4` F10 / `PE10` F7; CH3: `PB3` F7 / `PD9` F6 / `PE5` F10 | Select one suitable MUX pin per channel |
| RGB / LVDS / DSI | Mainly `PD0`–`PD9` and `PD12`–`PD22`, plus selected PE pins | See the per-pin table for the exact F2–F7 selection. High-speed display signals require short, impedance-controlled routing and a suitable reference design |

## Notes and Safety

- A pin can select only one of GPIO, display, UART, SPI, TWI, and other functions at a time. Functions listed on the same row cannot be active together.
- Display, LVDS, MIPI DSI, USB, and XIP Flash are high-speed or boot-critical resources. Check the BSP pinctrl settings, device tree, and boot log before attaching expansion hardware.
- The CAN controllers expose logic-level signals only. A CAN transceiver and correct bus termination are required for a physical CAN bus.
- GPIO electrical limits, ADC range, output drive strength, and `FEL` download behavior must be confirmed by the complete F101S3 datasheet, schematic, and BSP. On a V1.3 board, always translate the affected PD silkscreen labels using the errata table before configuring pinmux; V1.4 silkscreen uses the corrected GPIO names.

## Contributing and License

The hardware design is dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Contributions are welcome: schematics, PCB files, BOMs, BSP support, sample projects, errata, and verified pinout additions.

Unless stated otherwise, hardware design files in this repository are also released under CC0 1.0. Firmware, software, and third-party files follow the licenses specified in their respective directories.
