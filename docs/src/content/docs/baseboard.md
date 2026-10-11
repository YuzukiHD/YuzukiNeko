---
title: "YuzukiCube-M 底板"
---

`04_BaseBoard/V1.0/` 是 YuzukiNeko 的底板（载板）。底板上没有 SoC：YuzukiNeko 模块本身以 `U1`（BOM 中的 `YuzukiNeko-SMT`，49 个焊盘）装在底板上，底板把模块的 MIPI DSI、SDIO、UART、TWI、CAN 等信号接到实际器件和连接器上。

:::tip
工程文件名为 `YuzukiCube-M`，原理图的标题栏写的还是 `YuzukiNeko`（`REV: V1.0`，2026-10-09）。两者指的是同一块底板。
:::

:::caution
本文的引脚对应是从底板原理图 `04_BaseBoard/V1.0/01_SCH/SCH_Schematic2_2026-10-10.pdf` 的网表读出的，接线前请以该原理图为准。网络名用的是<strong>模块的实际 GPIO 名</strong>；如果你插的是 V1.3 模块，丝印要按[勘误](hardware/errata.md#v13pd-丝印编号错误)换算。
:::

## 板载器件

| 位号 | 器件 | 作用 |
| --- | --- | --- |
| `U1` | YuzukiNeko-SMT | 模块本体，49 个焊盘；底板其余电路都挂在它上面 |
| `U3` | AIC8800D80 | Wi-Fi / 蓝牙模块（LGA-44），天线经 `RF1` |
| `U5` | TJA1051T/3/1J | CAN 收发器，接 CAN0，引出 `CANH` / `CANL` |
| `U2` | LPA4890MSF | 音频功放，输入取自 `HPOUT`，输出 `SPKR+` / `SPKR-` |
| `U4` | RY3730 | 背光升压（`L1` 4.7 µH、`D1` B5819WS），输出 `VLED-A` / `VLED-K` |
| `U10` | MT3520B | 降压，`VSYS-5V` → `VCC-3V3`（`L2` 2.2 µH） |
| `FPC1` | FPC-05F-40PH20 | 40 脚 0.5 mm FPC：MIPI DSI + 背光 + 电容触摸 |
| `CN1` | HC-1.25-2PLT | 2 脚 1.25 mm，`HPOUT` 模拟音频 |
| `CN2` | 1.25-5P WT | 5 脚 1.25 mm，引出 `UART1-RX` / `UART1-TX` 与 `UART4-RX` / `UART4-TX` |
| `CN3` | HC-1.25-2PLT | 2 脚 1.25 mm，`SPKR+` / `SPKR-` 扬声器 |
| `RF1` | BWIPX-1-001E | IPEX / u.FL 天线座（Wi-Fi / 蓝牙） |
| `H1` | 2.54 mm 2 脚排针 | 引出 `VSYS-5V` 与 `GND` |
| `SW1` | TC-6615-5-260G | 轻触开关，接 `PD5`（`DOWN` 网络） |

## 占用的模块引脚

| 模块引脚 | 底板网络 | 用途 |
| --- | --- | --- |
| `PD0` / `PD1` | `CTP-SCK` / `CTP-SDA` | 电容触摸的 TWI1（F4） |
| `PD2` / `PD3` | `CTP-INT` / `CTP-RST` | 触摸中断与复位 |
| `PD4` | `PA-SHDN` | 音频功放使能 |
| `PD5` | `DOWN` | 按键 `SW1`，与模块的 UF2 下载器按键是同一引脚 |
| `PD6` / `PD7` | `UART4-TX` / `UART4-RX` | 串口，引到 `CN2`（F5） |
| `PD8` | `BT-RST-N` | 蓝牙复位 |
| `PD9` | `DSI-RST` | 显示复位 |
| `PD12`–`PD21` | `DSI-D0P/N`、`DSI-D1P/N`、`DSI-CKP/N`、`DSI-D2P/N`、`DSI-D3P/N` | MIPI DSI，4 条数据通道加时钟（F4） |
| `PD22` | `DSI-PWM` | 背光调光（F4 PWM0-2） |
| `PB0` / `PB1` | `UART1-TX` / `UART1-RX` | 串口，引到 `CN2`（F4） |
| `PB2` / `PB3` | `CAN-TX` / `CAN-RX` | CAN0，接 `U5`（F6） |
| `PE0`–`PE5` | `SDC2-D1`、`SDC2-D0`、`SDC2-CLK`、`SDC2-CMD`、`SDC2-D3`、`SDC2-D2` | Wi-Fi 的 SDIO（F9） |
| `PE6`–`PE9` | `UART2-TX`、`UART2-RX`、`UART2-RTS`、`UART2-CTS` | 蓝牙 HCI 串口（F3） |
| `PE10` | `WL-REG-ON` | Wi-Fi 模块上电使能 |

:::tip
`PB0` / `PB1` 也是模块文档里 Zephyr `yuzukineko` 板级的控制台 UART1，所以在底板上接 `CN2` 就能看控制台输出。
:::

## 显示与触摸

`FPC1` 一根 40 脚排线同时带三组信号：

- **MIPI DSI**：`DSI-D0P/N`、`DSI-D1P/N`、`DSI-CKP/N`、`DSI-D2P/N`、`DSI-D3P/N`，复位由 `PD9` 的 `DSI-RST` 控制。
- **背光**：`VLED-A` 取自 `U4` 升压输出，回路为 `VLED-K`，亮度由 `PD22` 的 `DSI-PWM` 调光。
- **电容触摸**：`CTP-SCK` / `CTP-SDA` 走 TWI1，中断与复位是 `CTP-INT` / `CTP-RST`。

## 电源

- `VSYS-5V`：来自模块的 `5V` 脚（USB-C VBUS）。降压 `U10`、CAN 收发器 `U5`、音频功放 `U2` 和 `H1` 都取这条轨道。
- `VCC-3V3`：`U10` 从 `VSYS-5V` 降压得到。
- `VSYS-3V3`：模块的 `3V3` 输出。
- `VLED-A` / `VLED-K`：`U4` 升压，专供背光。

底板没有电池和充电电路，`VSYS-5V` 全部来自模块的 USB-C。

## 装上底板后的引脚冲突

- `PE0`–`PE5` 被 Wi-Fi 的 SDIO 占用，而模块的 I2S0 要用到 `PE4`，`PD6`–`PD9` 也被 `UART4`、`BT-RST-N`、`DSI-RST` 占住，所以<strong>底板上 I2S0 不可用</strong>。
- 模块文档里 `PE10` 是板载音频功放使能；底板的功放使能改用 `PD4`（`PA-SHDN`），`PE10` 让给了 `WL-REG-ON`。
- `PD0`–`PD3` 在模块上是普通 GPIO 或 SPI1，底板上用于触摸。

## 文件

`04_BaseBoard/V1.0/` 的结构与 `01_Hardware/` 的七个条目相同：`01_SCH`、`02_PCB`、`03_Gerber`、`04_3D`、`05_BOM`、`06_PickAndPlace`、`07_Project`。其中 `04_3D/` 除 PCB 模型外还有一份外壳 `3DShell_PCB2.zip`，与[模块的 3D 打印外壳](shell.md)是两回事。

目录总览见[硬件文件说明](hardware/files.md)，协议见[许可证](license.md)。
