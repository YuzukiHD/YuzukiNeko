---
title: "RT-Thread 开发"
---

本章介绍 **YuzukiNeko** 上的 RT-Thread 5.3 移植，源码位于 [`YuzukiHD/rt-thread`](https://github.com/YuzukiHD/rt-thread) 的 `rtt-5.3.0-f101` 分支，BSP 路径为 `bsp/allwinner-hal/sun252iw2`。单独下载上游仓库不能获得该板移植。本章对应截至 `64c4489708` 的五笔驱动更新，板测日期为 2026-11-03。

| 项目 | 当前 BSP |
| --- | --- |
| CPU | 玄铁 C907，RV32 机器态，`ilp32d`，浮点和缓存 |
| 内存 | 16 MiB PSRAM，起点 `0x40000000`；默认堆 `0x40200000`–`0x40e00000` |
| 控制台 | UART1，PB0 TX / PB1 RX，复用 4，115200 8N1 |
| 屏幕 | JD9168S MIPI DSI，1024×768，四通道，RGB888 |
| 触摸 | Goodix GT967，I2C1 400 kHz，地址 `0x5d` |
| 构建 | SCons + Kconfig + 预处理后由 dtc 编译的 DTS |
| 开发启动 | 可返回的 PSRAM helper，再通过 FEL 下载到 RAM |
| 日志 | 原生 `rtdbg.h` / `LOG_E/W/I/D`，可选 ulog 后端 |

## 阅读顺序

依次阅读[环境与源码](setup.md)、[构建及 RAM 启动](build-run.md)。新增应用前阅读[设备模型与应用接入](architecture.md)，验证时以[回归与已知限制](testing.md)判断 PASS 实际覆盖的范围。

## 驱动手册

- [GPIO 与引脚复用](drivers/gpio.md)
- [UART 控制台与串口](drivers/uart.md)
- [I2C 事务](drivers/i2c.md)
- [GT967 与原生触摸事件](drivers/touch.md)
- [SPI 采样、四线接收与 DMA](drivers/spi.md)
- [SPIF NOR、调谐与 XIP](drivers/spif-nor.md)
- [PWM 与背光](drivers/pwm.md)
- [GPADC 采样](drivers/adc.md)
- [RTC 日历与闹钟](drivers/rtc.md)
- [SD/MMC 与 FAT 文件](drivers/sdmmc.md)
- [显示图层、缩放与日志](drivers/display.md)
- [G2D 加速](drivers/g2d.md)
- [JPEG、PNG 与 H.264 解码](drivers/vdec.md)
- [Codec、I2S 与 S/PDIF](drivers/audio.md)
- [CherryUSB 与 USB 副屏](drivers/usb.md)
- [时钟、DMA、看门狗与系统驱动](drivers/system.md)

## 与 Zephyr 和 Linux 的关系

硬件规格及文档深度参考 [Zephyr 驱动手册](../zephyr/index.md)，[Linux 开发](../linux/index.md)则通过 Linux 子系统说明同类外设。本移植使用 RT-Thread 的设备、输入、音频、SPI 和 RTC 接口。Zephyr 的 `DEVICE_DT_GET`、overlay 和 Kconfig 名称不能直接用于本 BSP。驱动同步参考点为 Zephyr `88344a2dcbfb1bab9a36ceff506d07d079f05832`，不代表已移植 Zephyr 的全部应用。

CPU 能力和本次驱动更新不代表已具备 RVV 上下文、Sv32 按需分页、网络或 NekoBox。启用这些能力前应检查所选 RT-Thread 配置及实际源码。
