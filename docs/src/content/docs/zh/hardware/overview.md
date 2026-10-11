---
title: "板卡概览"
---

## 主要器件

| 项目 | 说明 |
| --- | --- |
| SoC | F101S3（QFN68，7 mm × 7 mm），单核 XuanTie C907，rv32imacfdv，同时支持 64 位；有 MMU 但常见软件不启用 |
| 缓存 | 32 KB I-cache + 16 KB D-cache（缓存行 64 字节） |
| PSRAM | SiP 16 位 PSRAM，本板 16 MiB；V1.5 面向 32 MiB 配置（F101S4） |
| NOR Flash | 16 MiB，支持 XIP；板载 Flash 是系统资源，存放启动加载器 |
| USB | USB-C，1 路 USB 2.0 DRD；该口同时是 FEL 下载口 |
| 存储卡 | microSD 卡座，SMHC0，引脚 `PF0`–`PF5`，卡检测 `PF6` |
| 按键 | `FEL`：上电/复位时按住进入下载模式 |
| 排针 | 2 × 20，Pico 外形，见[引脚排布](pinout.md) |

## 板上已被占用的引脚

下面这些引脚在板上有固定用途，做扩展时要避开或确认没有冲突。

| 引脚 | 板上用途 | 说明 |
| --- | --- | --- |
| `PF0`–`PF5` | microSD（SMHC0） | 与 JTAG（`PF0/1/3/5` mux 4）复用，调试 JTAG 时 SD 不可用 |
| `PF6` | microSD 卡检测（CD） | V1.4 及更早需要调低驱动强度，见[勘误](errata.md) |
| `PC0`–`PC5` | SPI NOR Flash | 不在排针上，属于系统资源 |
| `FEL` 键 | 进入下载模式 | 板上按键，不在排针上 |

## 软件常见的引脚约定

下面是现有软件对排针引脚的用法，<strong>不是硬件固定连接</strong>，但如果你直接使用这些软件镜像，它们就是默认配置：

| 引脚 | 约定 | 来源 |
| --- | --- | --- |
| `PB0` / `PB1` | UART1 TX / RX，Zephyr 的 `yuzukineko` 板控制台 | Zephyr 板级配置 |
| `PE2` | USB 主机模式下的 VBUS 开关 | Zephyr USB 主机驱动 |
| `PE10` | 板载音频的喇叭功放使能（有功放的配置） | Zephyr 音频 |
| `PD5` | UF2 下载器按键（接地有效，内部上拉）：上电时按住进入 `F101BOOT` | UF2 加载器，见 [UF2](../dev/zephyr/zephyr-uf2.md) |
| `PD0`–`PD22` | RGB LCD 数据/时序线 | 显示栈，启用显示后占用 |

:::caution
控制台串口究竟接在哪组脚上，随所用软件而定（Zephyr `yuzukineko`：UART1 `PB0/PB1`）。接线前以[原理图](files.md)和你所刷固件的说明为准。
:::

## 电源

- `5V`：来自 USB-C（VBUS）或外部输入，在排针第 1 行右侧。
- `3V3`：板载稳压输出，排针第 1 行左侧。
- 所有 GPIO 为 3.3 V 逻辑。具体电气极限、ADC 量程、基准电压请以 F101S3 数据手册和原理图为准。

## 版本

当前最新为 <strong>V1.5</strong>，版本间的差异（PD 丝印、`R11`、PSRAM LDO）见[勘误与版本差异](errata.md)。
