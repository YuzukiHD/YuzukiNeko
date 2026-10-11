---
title: "引脚排布"
---

下表视角为<strong>元件面朝上，USB-C 接口在顶部</strong>，行号从 USB-C 一端向 microSD 一端递增。

:::caution
本文的“实际 SoC GPIO”列适用于所有版本。如果你用的是 <strong>V1.3</strong>，丝印从 `PD10` 起比真实 GPIO 小 2，务必先看[勘误](errata.md#v13pd-丝印编号错误)再配置引脚复用。
:::

## 排针总表

下表中 <strong>V1.3 丝印</strong> 是 V1.3 板子上印的名字；<strong>实际 GPIO / V1.4 丝印</strong> 才是 SoC 的真实引脚名，pinmux、软件和原理图都用这一列。加粗的是与 V1.3 丝印不同的项。

| 行 | 左：V1.3 丝印 | 左：实际 GPIO / V1.4 丝印 | 右：V1.3 丝印 | 右：实际 GPIO / V1.4 丝印 |
| ---: | --- | --- | --- | --- |
| 1 | `3V3` | `3V3` | `5V` | `5V` |
| 2 | `PD6` | `PD6` | `GND` | `GND` |
| 3 | `PD7` | `PD7` | `PD5` | `PD5` |
| 4 | `PD8` | `PD8` | `PD4` | `PD4` |
| 5 | `PD9` | `PD9` | `PD3` | `PD3` |
| 6 | `PD10` | <strong>`PD12`</strong> | `PD2` | `PD2` |
| 7 | `PD11` | <strong>`PD13`</strong> | `PD1` | `PD1` |
| 8 | `PD12` | <strong>`PD14`</strong> | `PD0` | `PD0` |
| 9 | `PD13` | <strong>`PD15`</strong> | `PD20` | <strong>`PD22`</strong> |
| 10 | `PD14` | <strong>`PD16`</strong> | `PB0` | `PB0` |
| 11 | `PD15` | <strong>`PD17`</strong> | `PB1` | `PB1` |
| 12 | `PD16` | <strong>`PD18`</strong> | `PB2` | `PB2` |
| 13 | `PD17` | <strong>`PD19`</strong> | `PB3` | `PB3` |
| 14 | `PD18` | <strong>`PD20`</strong> | `GPADC` | `GPADC` |
| 15 | `PD19` | <strong>`PD21`</strong> | `PE5` | `PE5` |
| 16 | `PE0` | `PE0` | `PE6` | `PE6` |
| 17 | `PE1` | `PE1` | `PE7` | `PE7` |
| 18 | `PE2` | `PE2` | `PE8` | `PE8` |
| 19 | `PE3` | `PE3` | `PE9` | `PE9` |
| 20 | `PE4` | `PE4` | `PE10` | `PE10` |

`3V3`、`5V`、`GND` 是电源脚，不是 GPIO。`GPADC` 是模拟输入脚，其通道、输入范围和基准电压请以原理图和 SoC 文档为准。

## 速查：按功能找引脚

| 我要… | 可用引脚 |
| --- | --- |
| 普通 GPIO | 任何带 `P` 前缀的脚（Function0 输入，Function1 输出） |
| 外部中断 | 所有 GPIO 的 Function14（`PD-EINTn` / `PE-EINTn` / `PB-EINTn`） |
| 模拟输入 | `GPADC` |
| 控制台串口 | 视软件而定，见[板卡概览](overview.md#软件常见的引脚约定) |
| 显示输出 | `PD0`–`PD9`、`PD12`–`PD22` 及部分 `PE` 脚 |
| 红外接收 | `PD5` / `PD7` / `PD22` / `PE5` / `PE6` / `PB1` / `PB3`（IR-RX） |

每个脚的全部复用功能见[引脚复用 (MUX)](mux.md)。

## 注意

- 同一时刻一个脚只能选择一种功能；同一行里列出的功能互斥。
- 显示、LVDS、MIPI DSI、USB 和 XIP Flash 属于高速或启动关键资源，接扩展硬件前请先核对你所用 BSP 的 pinctrl 设置、设备树和启动日志。
- CAN 控制器只引出逻辑电平信号，接真实 CAN 总线需要外置收发器和正确的终端电阻。
- 所有排针引脚均为 3.3 V 逻辑。
