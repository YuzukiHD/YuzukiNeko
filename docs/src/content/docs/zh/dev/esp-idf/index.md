---
title: "ESP-IDF 开发"
---

本章介绍 YuzukiNeko 上的 ESP-IDF 6.1 移植，源码维护在 [`YuzukiHD/esp-idf`](https://github.com/YuzukiHD/esp-idf)，分支 `sun252i-f101`。目标名为 `sun252i-f101`，在 ESP-IDF 中属于预览目标，构建时需要 `idf.py --preview`。当前文档基线为提交 `c71329b4d15`（2026-10-19）。

与 Zephyr 和 RT-Thread 不同，ESP-IDF 在这块板子上没有二级引导程序，也不从 SPI NOR 启动。构建产物是一个链接在 PSRAM `0x40000000` 的 RAM 镜像：先由 SyterKit 的 returning eFEX helper 在 FEL 中按板卡选择 S3 或 S4 的 PSRAM 参数并初始化，再由 xfel 通过 USB 写入并执行。所有驱动都使用 ESP-IDF 的标准公开 API，板级差异通过配置结构体和引脚参数传入。

| 项目 | 当前移植 |
| --- | --- |
| CPU | 玄铁 C907，RV32 `rv32imafc`，单核，单精度 FPU，600 MHz 默认 |
| 内存 | 16 MiB PSRAM（S4 可配 32 MiB），`0x40000000` 起，镜像之后全部作为堆 |
| 控制台 | UART1，PB0 TX / PB1 RX，115200 8N1 |
| 构建类型 | `CONFIG_APP_BUILD_TYPE_RAM`，无 bootloader、无 OTA |
| 加载方式 | SyterKit `init_psram_efex_s3.bin` 或 `_s4.bin` 按板卡参数初始化 PSRAM，再 xfel `write`/`exec` 到 `0x40000000` |
| 存储 | SPI NOR 16 MiB，`esp_flash`、`esp_partition`、NVS |
| 显示 | 显示引擎、TCON、RGB 与 MIPI DSI，JD9168S 1024×768 |
| 触摸 | GT967，I2C1，地址 `0x5d` |
| 音频 | 片内 codec，I2S0，DAC/ADC，PD4 功放使能 |
| Wi-Fi | AIC8800，SDIO，仅 station 模式 |

## 阅读顺序

先读[环境与源码](setup.md)，再读[构建、加载与运行](build-run.md)。在添加驱动或应用代码之前读[移植架构](architecture.md)，用[验证与已知限制](testing.md)判断当前移植能做什么、不能做什么。RAM 加载前的 PSRAM 初始化是全局主题，见 [PSRAM 初始化与 RAM 启动](../../boot/psram-init.md)。

## 驱动手册

- [系统、时钟与内存](drivers/system.md)
- [GPIO 与引脚复用](drivers/gpio.md)
- [UART 与控制台](drivers/uart.md)
- [I2C 与 GT967 触摸](drivers/i2c-touch.md)
- [SPI、NOR、分区与 NVS](drivers/spi-storage.md)
- [GPTimer、LEDC 与 GPADC](drivers/timers-adc.md)
- [SD/MMC 与 SDIO](drivers/sdmmc.md)
- [显示与背光](drivers/display.md)
- [I2S 与片内 codec](drivers/audio.md)
- [DMA、PPA 与 JPEG](drivers/dma-accel.md)
- [AIC8800 Wi-Fi](drivers/wifi.md)

## 与 Zephyr、RT-Thread 和 Linux 的关系

三个 RTOS 移植覆盖同一颗 SoC，但软件模型不同。Zephyr 使用 devicetree、Kconfig 和 `DEVICE_DT_GET`；RT-Thread 使用运行时设备模型和内嵌 DTB；ESP-IDF 使用编译期 `sdkconfig`、组件依赖和标准 ESP-IDF 驱动 API，引脚来自每个驱动的配置结构体。三者的 Kconfig 名称、设备名和初始化顺序不能互换。

已经验证过的功能只代表本页列出的范围，不代表与 Zephyr 驱动手册一一对等。显示、音频、SD 卡和存储页的代码都通过交叉编译和链接，但并非每个外设都在实板上执行过；运行验证的范围见[验证与已知限制](testing.md)。

## 范围与限制

- 没有 bootloader，没有从 NOR 启动的流程，不能使用 `idf.py flash`、OTA、secure boot 或 flash encryption。
- 没有 Bluetooth 协议栈；AIC8800 的蓝牙部分未移植，Wi-Fi 只有 station 模式。
- 没有低功耗、deep sleep、动态调频和双核；CPU 只有一颗 C907。
- 没有 RISC-V 向量扩展（RVV）上下文，没有 Sv32 分页。
- `esp_random()` 是软件 xorshift，不是密码学随机源；芯片没有硬件 crypto。
- SPI、I2C、SD/MMC 都是轮询实现，没有 DMA 主机控制器；DMA 只用于内存到内存和 I2S。
- GPIO 没有 GPIO matrix，每个焊盘只有固定的几组复用功能。
