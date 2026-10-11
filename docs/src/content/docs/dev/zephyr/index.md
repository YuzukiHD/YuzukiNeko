---
title: "Zephyr 开发"
---

[Zephyr](https://www.zephyrproject.org) 是一个面向资源受限设备的开源实时操作系统（RTOS）。F101 的 Zephyr 支持是上游 Zephyr 的一个 fork：[`YuzukiHD/zephyr`](https://github.com/YuzukiHD/zephyr)，默认分支 `zephyr-v4.2.2-f101`，基于 Zephyr v4.2.2。

- <strong>SoC</strong>：`sun252i_f101`，一个玄铁 C907 核（`rv32imafdcv`，带向量扩展，可选 Sv32 MMU），片内 SRAM 加 16 MB PSRAM，没有外部 DDR。
- <strong>板级</strong>：`yuzukineko`（本板，控制台为 UART1 的 PB00/PB01）和 `f101_evb`（F101 评估板，控制台为 UART3 的 PE08/PE09）。
- <strong>工具链</strong>：玄铁 900 elf-newlib GCC，通过 `cross-compile` 方式接入，不使用 Zephyr SDK。
- <strong>构建</strong>：用 west 管理源码和依赖模块，用 `west build` 编译。

:::caution
Zephyr 的板级和驱动代码在上面这个 fork 里，不在 YuzukiNeko 硬件仓库中。
:::

## 从哪里开始

按顺序读下面三页，就能把一个程序跑在板子上：

| 步骤 | 说明 |
| --- | --- |
| [配置开发环境](zephyr-setup-env.md) | 主机依赖、Python 虚拟环境、west、玄铁工具链、`env.sh` |
| [获取 Zephyr 代码](zephyr-get-source.md) | `west init` / `west update`、目录结构、Python 依赖、编译 `hello_world` 验证 |
| [编译与运行](zephyr-build-run.md) | 三种运行方式：下载到 RAM、xfel 直接写 NOR、UF2 拖放下载 |

其余页面：

| 页面 | 说明 |
| --- | --- |
| [MP4 播放器](apps/mp4-player.md) | 从 TF 卡播放 MP4：H.264 硬解 + AAC 软解 |
| [UF2 拖放烧录](zephyr-uf2.md) | 制作 `.uf2` 与 Flash 布局 |

## 驱动支持情况

驱动按 Zephyr 自己的 API 编写，设备树 binding 在 `dts/bindings/*/allwinner,sunxi-*.yaml`。

| 类别 | 内容 |
| --- | --- |
| 基础 | 时钟与复位、pinctrl、GPIO、DMA、看门狗、hwinfo（SID 熔丝）、CPU 时钟频率 |
| 总线 | I2C、SPI、PWM（含面板背光）、ADC、SD/MMC（`sdhc`） |
| Flash | SPIF SPI NOR 控制器：100 MHz 四线读、保存采样点参数、XIP 窗口和 XIP 代码段 |
| 音频 | 片上 codec（DAC/ADC 与模拟部分）、I2S0、S/PDIF |
| 显示 | 图层、TCON、RGB/LVDS/DSI 编码器、D-PHY、背光、YUV/RGB 缩放视频层、MIPI DBI |
| 加速器 | G2D 2D 加速器（填充、带格式转换/缩放/旋转的搬运、混合）；视频引擎（H.264、JPEG、PNG 解码） |
| USB | PHY，CherryUSB 设备（CDC ACM、MSC、vendor display 类）和主机（EHCI/OHCI） |
| 输入 | GT967 电容触摸 |
| RISC-V | 向量扩展上下文保存、机器态 Sv32 MMU 与按需分页、`lib/mp4`、AAC 解码 |

SoC 代码在 `soc/allwinner/sun252i_f101`，SoC 设备树在 `dts/riscv/allwinner/sun252i_f101.dtsi`，板级在 `boards/yuzukihd`。

:::tip
基于这套移植的应用（模拟器、WiFi、MicroPython、PocketJS 等）放在 [`YuzukiHD/zephyr-components`](https://github.com/YuzukiHD/zephyr-components) 仓库里，各自的状态不同，用法以各目录的 README 为准。
:::

## 本章内容

- [配置开发环境](zephyr-setup-env.md)
- [获取 Zephyr 代码](zephyr-get-source.md)
- [编译与运行](zephyr-build-run.md)
- [UF2 拖放烧录](zephyr-uf2.md)

:::tip
下载前请先阅读 [FEL 下载模式与工具](../../boot/fel.md) 和 [SPI NOR 布局与备份](../../boot/flash-layout.md)，并备份板上 Flash。要跑 Linux 请看 [Linux 开发](../linux/index.md)。
:::
