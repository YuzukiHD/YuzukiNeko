# YuzukiNeko Pico 开发板

<p align="center">
  <img width="380" alt="YuzukiNeko 3D 渲染" src="https://github.com/user-attachments/assets/650270c6-b822-48ad-bceb-6358ae01c4cd">
</p>

YuzukiNeko 是一块基于 <strong>Allwinner F101 系列 SoC</strong> 的开发板，采用 Raspberry Pi Pico 的 2 × 20 针外形。板载 16 MiB PSRAM（F101S3，V1.5 的 32 MiB 配置使用 F101S4）和 16 MiB NOR Flash（支持 XIP，即就地执行），适合做 RISC-V 图形、显示、音频和通用 I/O 项目。硬件设计以 CC0 1.0 发布。

## 这份文档包含什么

| 想做的事 | 去哪里 |
| --- | --- |
| 第一次上电，让板子跑起来 | [上手指南](quickstart.md) |
| 查某个引脚能做什么 | [引脚排布](hardware/pinout.md)、[引脚复用](hardware/mux.md) |
| 接 UART / I²C / SPI / CAN / PWM | [常用外设引脚组合](hardware/groups.md) |
| 搞清楚自己的板子是 V1.3 / V1.4 / V1.5 | [勘误与版本差异](hardware/errata.md) |
| 进入下载模式、安装 xfel / rfel | [FEL 下载模式与工具](boot/fel.md) |
| 刷入现成的固件（RustSBI + Asterinas、Linux + Buildroot） | [RustSBI + Asterinas](dev/asterinas/rustsbi-asterinas.md)、[预编译 Linux 镜像](dev/linux/linux-prebuilt.md) |
| 用底板接显示、Wi-Fi、CAN、音频 | [YuzukiCube-M 底板](baseboard.md) |
| 写程序 | [软件方案总览](dev/overview.md) |
| 打印外壳 | [3D 打印外壳](shell.md) |

## 板卡规格

| 项目 | 规格 |
| --- | --- |
| SoC | F101S3，XuanTie C907 RISC-V CPU（rv32imacfdv，同时支持 64 位），QFN68（7 mm × 7 mm） |
| 缓存 | 32 KB I-cache + 16 KB D-cache |
| 内存 | SiP 16 位 PSRAM，最大 16 MiB（本板 16 MiB；V1.5 面向 32 MiB 配置） |
| 存储 | 16 MiB 外部 NOR Flash，支持 XIP |
| 扩展 | Pico 风格 2 × 20 针排针 |
| USB | USB-C 接口；SoC 提供 1 路 USB 2.0 DRD 控制器 |
| 其他 | microSD 卡座，`FEL` 按键 |
| 开源协议 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)（硬件设计文件） |

!> 板载 NOR Flash 属于系统资源：里面存放启动加载器和固件。随意擦写会让板子无法从 Flash 启动，务必先[备份](boot/flash-layout.md#备份整片-flash)。

## SoC 能力

| 模块 | 能力 |
| --- | --- |
| 图像解码 | JPEG 最大 16384 × 16384；PNG 最大 2048 × 2048 |
| 图像/视频编码 | JPEG/MJPEG 最高 720p@30 fps，最大分辨率 8192 × 8192 |
| 显示处理 | 反交错最高 720p@60 fps；G2D 旋转与混合加速器 |
| 视频输出 | RGB888 最高 1280 × 720@60 fps；单路 LVDS 最高 1366 × 768@60 fps；4 通道 MIPI DSI 最高 1280 × 800@60 fps |
| 音频 | 1 路 DAC（DACOUT）、I2S/PCM、OWA OUT |
| 安全 | 512 位 eFuse |
| 连接与外设 | USB 2.0 DRD × 1、SDIO 2.0、SPI × 2、UART × 6、TWI × 3、CAN × 2、PWM、IR_RX、GPADC、TPADC |

?> 上表是 SoC 的能力上限，不等于开发板上每一项都已引出或有现成软件支持。引出了哪些、软件支持到什么程度，见[引脚排布](hardware/pinout.md)和[软件方案总览](dev/overview.md)。

## 相关项目

- 开发板仓库：<https://github.com/YuzukiHD/YuzukiNeko>
- SyterKit（启动加载器）：<https://github.com/YuzukiHD/SyterKit>
- xfel：<https://github.com/xboot/xfel>　rfel：<https://github.com/rustsbi/allwinner-hal/tree/main/rfel>
