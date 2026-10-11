---
title: "引脚复用 (MUX)"
---

下表中的“复用功能”是 SoC 在该引脚上<strong>可以选择</strong>的功能，<strong>不是同时存在</strong>的功能，也不代表该功能在本板上已接线、已启用或有默认配置。每个引脚在 pinctrl/pinmux 软件中只能选一个功能。

## 通用规则

- 每个 GPIO 都可以当普通 GPIO：<strong>Function0 = 输入，Function1 = 输出</strong>。
- Function11–13 保留；<strong>外部中断 EINT 是 Function14</strong>。
- 表中 `F<n>` 即 pinmux 的 Function 编号，同一行里的功能互斥。
- 在软件中通常用 `port + 引脚号 + mux` 三元组选择，例如 Zephyr 设备树里的 `ALLWINNER_PINMUX(port, num, mux)`。
- 本文使用的是<strong>实际 SoC GPIO 名</strong>。V1.3 板的丝印请先按[勘误](errata.md)换算。

## 左侧排针


| 引脚 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 | 外部中断（F14） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PD6` | LCD0-D10 | SPI1-CS1 | I2S0-MCLK | UART4-TX | PWM0-0 |  |  |  |  | PD-EINT6 |
| `PD7` | LCD0-D11 | IR-RX | I2S0-BCLK | UART4-RX | PWM0-1 |  |  |  |  | PD-EINT7 |
| `PD8` | LCD0-D12 | TWI1-SCK | I2S0-LRCK | UART4-RTS | PWM0-2 |  |  |  |  | PD-EINT8 |
| `PD9` | LCD0-D13 | TWI1-SDA | I2S0-DOUT0 | UART4-CTS | PWM0-3 | LCD0-VSYNC |  |  |  | PD-EINT9 |
| `PD12` | LCD0-D18 | LVDS0-D0P | DSI-D0P | UART3-RX | TWI0-SDA |  |  |  |  | PD-EINT12 |
| `PD13` | LCD0-D19 | LVDS0-D0N | DSI-D0N | UART2-TX |  |  |  |  |  | PD-EINT13 |
| `PD14` | LCD0-D20 | LVDS0-D1P | DSI-D1P | UART2-RX |  |  |  |  |  | PD-EINT14 |
| `PD15` | LCD0-D21 | LVDS0-D1N | DSI-D1N | UART2-RTS |  |  |  |  |  | PD-EINT15 |
| `PD16` | LCD0-D22 | LVDS0-D2P | DSI-CKP | UART2-CTS |  |  |  |  |  | PD-EINT16 |
| `PD17` | LCD0-D23 | LVDS0-D2N | DSI-CKN | UART5-TX |  |  |  |  |  | PD-EINT17 |
| `PD18` | LCD0-CLK | LVDS0-CKP | DSI-D2P | UART5-RX |  |  |  |  |  | PD-EINT18 |
| `PD19` | LCD0-HSYNC | LVDS0-CKN | DSI-D2N | UART5-RTS | UART4-TX |  |  |  |  | PD-EINT19 |
| `PD20` | LCD0-VSYNC | LVDS0-D3P | DSI-D3P | UART5-CTS | UART4-RX |  |  |  |  | PD-EINT20 |
| `PD21` | LCD0-DE | LVDS0-D3N | DSI-D3N | UART1-TX | UART4-RTS |  |  |  |  | PD-EINT21 |
| `PE0` |  | LCD0-D0 | TWI1-SCK | I2S0-MCLK | UART0-TX | CAN0_TX0 | SPI1-CS0/DBI-CSX | SDC2-D1 | CLK-FANOUT0 | PE-EINT0 |
| `PE1` |  | LCD0-D1 | TWI1-SDA | I2S0-BCLK | UART0-RX | CAN0_RX0 | SPI1-CLK/DBI-SCLK | SDC2-D0 |  | PE-EINT1 |
| `PE2` |  | LCD0-D8 | TWI0-SCK | I2S0-LRCK | UART4-TX | CAN1_TX0 | SPI1-MOSI/DBI-SDO | SDC2-CLK | PWM0-0 | PE-EINT2 |
| `PE3` |  | LCD0-D9 | TWI0-SDA | I2S0-DOUT0 | UART4-RX | CAN1_RX0 | SPI1-MISO/DBI-SDI/DBI-TE/DBI-DCX | SDC2-CMD | PWM0-1 | PE-EINT3 |
| `PE4` |  | LCD0-D16 | TWI2-SCK | I2S0-DIN0 | UART4-RTS | UART5-TX | SPI1-HOLD/DBI-DCX/DBI-WRX | SDC2-D3 | PWM0-2 | PE-EINT4 |

## 右侧排针


| 引脚 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 | 外部中断（F14） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PD5` | LCD0-D7 | SPI1-WP/DBI-TE | UART2-CTS | IR-RX | TWI0-SDA |  |  |  |  | PD-EINT5 |
| `PD4` | LCD0-D6 | SPI1-HOLD/DBI-DCX/DBI-WRX | UART2-RTS | UART3-CTS | TWI0-SCK |  |  |  |  | PD-EINT4 |
| `PD3` | LCD0-D5 | SPI1-MISO/DBI-SDI/DBI-TE/DBI-DCX | UART2-RX | UART3-RTS | UART1-RX | RJTAG-CK |  |  |  | PD-EINT3 |
| `PD2` | LCD0-D4 | SPI1-MOSI/DBI-SDO | UART2-TX | TWI0-SDA | UART1-TX | RJTAG-DO |  |  |  | PD-EINT2 |
| `PD1` | LCD0-D3 | SPI1-CLK/DBI-SCLK | TWI1-SDA | UART3-RX | PWM0-0 | RJTAG-DI |  |  |  | PD-EINT1 |
| `PD0` | LCD0-D2 | SPI1-CS0/DBI-CSX | TWI1-SCK | UART3-TX | TWI0-SCK | RJTAG-MS |  |  |  | PD-EINT0 |
| `PD22` | OWA-OUT | IR-RX | PWM0-2 | UART1-RX | UART4-CTS |  |  |  |  | PD-EINT22 |
| `PB0` | BOOST1-PWM | TWI1-SCK | UART1-TX | UART2-RTS | CAN1_TX0 | PWM0-0 | SPIF0-CS1 |  |  | PB-EINT0 |
| `PB1` | BOOST1-FB | TWI1-SDA | UART1-RX | UART2-CTS | CAN1_RX0 | PWM0-1 | IR-RX |  |  | PB-EINT1 |
| `PB2` | BOOST0-PWM | TWI2-SCK | UART1-RTS | UART2-TX | CAN0_TX0 | PWM0-2 | SPI0-CS1 |  |  | PB-EINT2 |
| `PB3` | BOOST0-FB | TWI2-SDA | UART1-CTS | UART2-RX | CAN0_RX0 | PWM0-3 | IR-RX |  |  | PB-EINT3 |
| `GPADC` | | | | | | | | | | |
| `PE5` |  | LCD0-D17 | TWI2-SDA | IR-RX | UART4-CTS | UART5-RX | SPI1-WP/DBI-TE | SDC2-D2 | PWM0-3 | PE-EINT5 |
| `PE6` |  | UART2-TX | LCD0-D14 | CAN0_TX0 | OWA-OUT | IR-RX | SPI1-CS1 |  |  | PE-EINT6 |
| `PE7` |  | UART2-RX | LCD0-D15 | CAN0_RX0 |  |  | SPI1-CS0/DBI-CSX | CLK-FANOUT1 |  | PE-EINT7 |
| `PE8` |  | UART2-RTS | TWI0-SCK | CAN1_TX0 | UART3-TX | PWM0-0 | SPI1-CLK/DBI-SCLK | CLK-FANOUT2 |  | PE-EINT8 |
| `PE9` |  | UART2-CTS | TWI0-SDA | CAN1_RX0 | UART3-RX | PWM0-1 | SPI1-MOSI/DBI-SDO |  |  | PE-EINT9 |
| `PE10` |  | UART4-TX | TWI1-SCK | I2S0-MCLK | UART1-TX | PWM0-2 | SPI1-MISO/DBI-SDI/DBI-TE/DBI-DCX |  |  | PE-EINT10 |

`GPADC` 是模拟输入，板级通道分配需要对照[原理图](files.md)确认。
