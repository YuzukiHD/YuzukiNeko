# 软件方案总览

YuzukiNeko 是 RISC-V（rv32imac）单核板，可以跑多种软件。选哪条路取决于你想做什么：

| 方案 | 适合 | 状态与说明 | 文档 |
| --- | --- | --- | --- |
| <strong>Arduino</strong> | 快速写草图、熟悉 Arduino API | 预编译核心（内含 Zephyr），无需自己搭工具链；已在 EVB 上验证多个示例 | [Arduino](arduino/index.md) |
| <strong>Zephyr</strong> | 完整 RTOS，使用显示、音频、USB、G2D、视频解码等 | 板级 `yuzukineko`，外设驱动齐全 | [Zephyr](zephyr/index.md) |
| <strong>UF2 下载器</strong> | 不装工具，拖放 `.uf2` 烧录应用 | 板上运行一个 USB 盘 `F101BOOT` | [UF2 拖放烧录](uf2/index.md) |
| <strong>RustSBI + Asterinas</strong> | 想直接看到 Linux 风格 shell 的系统 | 现成镜像，BusyBox 九个示例 | [RustSBI + Asterinas](asterinas/rustsbi-asterinas.md) |
| <strong>Linux + Buildroot</strong> | 需要完整 Linux、可写且能持久化的根文件系统 | 现成镜像（RV32 / RV64I），SquashFS + JFFS2 overlay | [Linux + Buildroot](linux/linux-buildroot.md) |
| <strong>MicroPython</strong> | 上游 Zephyr 端口作为应用，加 `f101` 模块（G2D、音频、芯片 ID）；REPL 在控制台 | 已在 EVB 上验证：浮点、`machine` Pin/SPI/ADC/PWM/WDT、SD 挂载、显示写入、G2D、音调输出 | [MicroPython](zephyr/micropython/index.md) |
| <strong>RT-Thread</strong> | v5.3.0，BSP `sun252iw2`，完全基于设备模型和内置设备树 | 驱动已迁移并在 EVB 上测试；USB 主机未运行（单口被下载线占用） | [RT-Thread](rt-thread/index.md) |
| <strong>ESP-IDF</strong> | v6.1 移植，目标 `sun252i-f101` | 进行中：gpio/uart/i2c/spi/adc/ledc/sdmmc、esp_lcd RGB 屏、DMA、音频（片上 codec）已通过 EVB 测试，USB 与 WiFi 未做 | [ESP-IDF](esp-idf/index.md) |
| <strong>mGBA</strong> | Game Boy Advance 模拟器移植 | 已运行 | [mGBA](zephyr/mgba/index.md) |
| <strong>NES</strong> | NES 模拟器移植 | 能编译链接，尚未上板运行 | [NES](zephyr/nes/index.md) |
| <strong>Doom</strong> | Doom 移植 | 能编译链接，尚未上板运行 | [Doom](zephyr/doom/index.md) |

## 技术栈

Linux 相关的两条路线分开：

- [Linux 开发](linux/index.md)：C 技术栈，标准 Linux 内核 + Buildroot。
- [Asterinas 开发](asterinas/index.md)：纯 Rust 技术栈，RustSBI + Asterinas。

## 启动方式

两种常见方式：

1. <strong>从 FEL 直接载入运行</strong>（开发时）：板子进入 FEL，主机把程序写进内存并运行，不动 Flash。适合调试 Zephyr 等裸机程序，<strong>每次都要重新上电</strong>。
2. <strong>从 SPI NOR 启动</strong>（部署时）：Flash 里装好 SyterKit 之类的加载器，上电由 BROM 加载，然后加载器把系统载入 PSRAM。Arduino、UF2、RustSBI + Asterinas 都是这条路。

一旦 Flash 里有有效的加载器，板子不会再自己进 FEL，需要按住 <strong>FEL</strong> 键上电。详见 [FEL 下载模式与工具](../boot/fel.md)。

## 几个全局要点

- <strong>板子只有一个 USB-C</strong>：它是电源、FEL 下载口，也是 USB 设备/主机口。要用 USB 设备或主机功能，需要先用线缆下载好程序，再换接外设。
- <strong>控制台串口</strong>取决于软件，接线前对照所用软件的说明。
- <strong>PSRAM 与 Flash</strong>：16 MiB PSRAM 是全部运行内存，程序、图像缓冲、媒体缓冲都要在里面规划。
