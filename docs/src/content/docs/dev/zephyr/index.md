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
| [ncnn - 神经网络推理](apps/ncnn.md) | ncnn 推理库 + RVV，benchmark |
| [Doom - 游戏](apps/doom.md) | doomgeneric，触摸屏按键 |
| [mGBA - GBA 模拟器](apps/mgba.md) | 缩放输出、触摸屏按键、声音 |
| [NES - FC 模拟器](apps/nes.md) | nofrendo，触摸屏按键 |
| [HTML 渲染器 - litehtml](apps/html.md) | HTML/CSS 渲染到 RGB565 |
| [安卓投屏](apps/android-mirror.md) | ADB + scrcpy，H.264 硬解 |
| [iOS 投屏 - AirPlay](apps/ios-mirror.md) | AirPlay 接收端，H.264 硬解 |
| [Win95 - Bochs x86 模拟](apps/win95.md) | Bochs 486 模拟器 |
| [LVGL - 图形界面](apps/lvgl.md) | 显示、触摸接入，demo 与帧率 |
| [USB 副屏 - 电脑扩展屏](apps/usb-display.md) | 电脑把 USB 当副屏用 |
| [UF2 拖放烧录](zephyr-uf2.md) | 制作 `.uf2` 与 Flash 布局 |
| [RVV - RISC-V 向量扩展](zephyr-riscv-vector.md) | 向量扩展的配置、接口和示例 |

驱动页（每页都有设备树、Kconfig、每个接口一个完整示例、上板输出和完整演示程序）：

| 页面 | 说明 |
| --- | --- |
| [GPIO](drivers/gpio.md) | 输入输出、整组操作、中断 |
| [I2C](drivers/i2c.md) | 读写、重复起始、扫描总线 |
| [SPI](drivers/spi.md) | 命令加数据、全双工、DMA、模式 |
| [PWM](drivers/pwm.md) | 周期和占空比、极性、设备树引用 |
| [PWM-BL - 模拟背光](drivers/pwm-bl.md) | 背光专用模块，用灌电流调亮度 |
| [显示](drivers/display.md) | 流水线、RGB 屏和 MIPI DSI 屏的适配、显示接口 |
| [SDHC 主机控制器](drivers/sdhc.md) | 直接用 SD 命令操作控制器 |
| [AUDIO - 音频](drivers/audio.md) | 片上 codec、I2S0、S/PDIF |
| [UART](drivers/uart.md) | 轮询、中断、配置 |
| [USB](drivers/usb.md) | CherryUSB 设备模式，CDC ACM 回显 |
| [G2D 2D 加速器](drivers/g2d.md) | 填充、搬运、旋转、YUV、混合 |
| [视频引擎 vdec](drivers/vdec.md) | JPEG、PNG、MJPEG、H.264 解码 |

组件页（同样的规格，讲协议栈和库，每页都有架构图、数据流图和上板日志）：

| 页面 | 内容 |
| --- | --- |
| [CherryUSB - USB 协议栈](components/cherryusb.md) | 设备栈、主机栈、CDC ACM、MSC |
| [SD - SD 卡协议栈](components/sd.md) | SD 子系统、磁盘访问、FAT 文件系统 |
| [AIC8800 WIFI - 无线网卡驱动](components/aic8800-wifi.md) | SDIO、固件下载、扫描、连接 |
| [AIC8800 蓝牙 - 蓝牙驱动](components/aic8800-bt.md) | HCI、广播、扫描、连接 |
| [AAC - AAC 解码器](components/aac.md) | OpenCORE AAC 解码 |
| [MP4 - MP4 解封装](components/mp4.md) | moov 解析、sample 读取、seek |

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
