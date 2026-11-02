---
title: "Linux 开发"
---

F101 上的 Linux 由三部分组成，启动链为 BROM → SyterKit → OpenSBI → Linux → BusyBox：

- <strong>Linux</strong>：开源的操作系统内核，负责进程、内存、文件系统和设备驱动。这里用的是基于主线的内核，来自 [`YuzukiHD/linux-mainline`](https://github.com/YuzukiHD/linux-mainline) 的 `sun252i_f101_7.2` 分支，目前是 7.2。有 RV32（C907）和 RV64I 两种模式的配置，从 SPI NOR 启动，根文件系统是 SquashFS，上面叠一层可写的 JFFS2 overlay。
- <strong>OpenSBI</strong>：开源的 RISC-V SBI（Supervisor Binary Interface）参考实现，运行在最高特权的 M 模式，替内核完成定时器、核间中断、复位等 M 模式才能做的事。这里用的是来自 [`YuzukiHD/opensbi`](https://github.com/YuzukiHD/opensbi) 的 `sun252i-f101` 分支，用 `fw_jump` 形态。SyterKit 把它载入 RAM 的 `0x40f80000`，它初始化完成后跳到 `0x40000000` 的内核，并在内核运行期间提供 SBI 服务。
- <strong>Buildroot</strong>：面向嵌入式 Linux 的开源构建系统，用一份配置自动下载、编译并打包出完整系统。这里用它把工具链、内核、OpenSBI、SyterKit 和 BusyBox 根文件系统一起构建成 16 MiB 镜像。板级配置放在外部树 [`YuzukiHD/buildroot-external-yuzukihd`](https://github.com/YuzukiHD/buildroot-external-yuzukihd) 里，Buildroot 本体直接用官方主线的 [`buildroot/buildroot`](https://github.com/buildroot/buildroot) 仓库。

| 方案 | 说明 |
| --- | --- |
| [预编译镜像](linux-prebuilt.md) | 现成的整片 16 MiB 镜像（RV32 / RV64I）及其烧录、串口和单组件替换 |
| [手动构建](linux-manual.md) | 从 SyterKit、OpenSBI、内核到 BusyBox 根文件系统，逐步构建并拼成 16 MiB 镜像（RV32） |
| [手动构建 RV64I](linux-manual-rv64.md) | 64 位镜像要改的地方 |
| [Linux + Buildroot](linux-buildroot.md) | 用 Buildroot 外部树一条命令构建镜像（RV32 / RV64I） |

## 驱动支持情况

### 已支持并验证

设备树里已启用、驱动编进内核，并且在板上跑通过：

| 外设 | 驱动 | 说明 | 文档 |
| --- | --- | --- | --- |
| 时钟与复位 | `sunxi-ng` CCU | 所有外设的时钟来源，含 C907 与 PSRAM 的 PLL | [CCU](drivers/clock.md) |
| 中断与定时器 | PLIC、CLINT | C907 自带 | |
| 引脚复用与 GPIO | `pinctrl-sun252i-f101` | 六个端口，外部中断，GPIO 字符设备 | [PINCTRL](drivers/pinctrl-gpio.md) |
| 内存总线优先级 | `sun252i-f101-mbus` | 优先级、带宽限制、流量计数器 | [MBUS 与 SRAM](drivers/mbus-sram.md) |
| 片上 SRAM | `sunxi_sram` | VE、显示引擎和 USB FIFO 的分区 | [MBUS 与 SRAM](drivers/mbus-sram.md) |
| UART1 | 8250 DesignWare | 控制台 `ttyS1`，115200 8N1，`PB0`/`PB1` | [UART](drivers/uart.md) |
| I2C2 | `i2c-mv64xxx` | `PB2`/`PB3`，用户态走 `/dev/i2c-0`（编号是动态分配的，见 [I2C](drivers/i2c.md)） | [I2C](drivers/i2c.md) |
| SPI0 与 NOR | `spi-sun6i`、`spi-nor`、MTD | 16 MiB Flash，根文件系统，DMA 传输 | [SPI 与 DMA](drivers/spi.md)、[SPIF](drivers/spif-nor.md) |
| SPI Flash 控制器 | `spi-sunxi-spif` | 同一片 NOR 的另一种控制器，有独立的设备树变体 | [SPIF](drivers/spif-nor.md) |
| DMA | `sun6i-dma` | 八个通道，SPI 使用 | [SPI 与 DMA](drivers/spi.md) |
| microSD | `sunxi-mmc` | SMHC0，4 位，50 MHz，卡检测走 `PF6` | [SMHC](drivers/mmc.md) |
| 显示 | `sun4i-drm`、`sun6i-dsi`、D-PHY、JD9168S 屏 | 1024x768 MIPI DSI 屏，framebuffer 控制台 | [显示](drivers/display.md) |
| G2D | `sun252i-g2d` | V4L2 mem2mem：格式转换、缩放、旋转、翻转 | [G2D](drivers/g2d.md) |
| 视频引擎 | `cedrus` | JPEG 与 H.264 解码，输出线性 NV12 | [VE](drivers/vdec.md) |
| USB | MUSB OTG、EHCI、OHCI、`sun4i-usb-phy` | 设备模式下用 configfs 配 gadget，主机模式起 root hub | [USB](drivers/usb.md) |

### 没启用或没验证

| 外设 | 现状 |
| --- | --- |
| UART0、UART2～UART5 | SoC 设备树里有节点，但都是 `disabled`，板级也没有配引脚 |
| I2C0、I2C1 | 同样是 `disabled` 的节点，板级文件里没有对应的引脚组 |
| SPI1 | `disabled`；和 SPI0、SMHC2、SPIF 共用 `PC` 引脚 |
| eMMC（SMHC2） | `disabled`；共用 `PC` 引脚 |
| 看门狗 | SoC 设备树有节点，但没开 `CONFIG_WATCHDOG`，驱动没有编进去 |
| RTC | 只有 RTC 时钟控制器，没有 RTC 设备驱动，也没有后备电池时钟 |
| 音频（片上 codec） | 没有节点，也没有驱动 |
| ADC | 没有节点，`CONFIG_IIO` 未开 |
| 摄像头（CSI） | 没有节点，也没有驱动 |
| 网络 | 内核没有开 `CONFIG_NET`；USB gadget 可以声明 ECM，但底下没有协议栈 |

想用设备树里已有节点但没启用的外设，改 `sun252i-f101-yuzukineko-common.dtsi`，把对应节点设成 `okay`、配上引脚组，重新构建设备树。

## 本章内容

- [预编译镜像](linux-prebuilt.md)
- [手动构建](linux-manual.md)
- [手动构建 RV64I](linux-manual-rv64.md)
- [Linux + Buildroot](linux-buildroot.md)

## 应用

- [Buildroot 软件包](apps/buildroot-packages.md)：根文件系统里有什么，怎么加软件包
- [BusyBox](apps/busybox.md)：shell、各种小工具、init 与启动脚本
- [常用命令](apps/linux-commands.md)：板上能用的命令，按用途分组

## 驱动

- [CCU](drivers/clock.md)、[MBUS 与 SRAM](drivers/mbus-sram.md)、[PINCTRL](drivers/pinctrl-gpio.md)
- [UART](drivers/uart.md)、[I2C](drivers/i2c.md)、[SPI 与 DMA](drivers/spi.md)、[SPIF](drivers/spif-nor.md)、[SMHC](drivers/mmc.md)
- [显示](drivers/display.md)、[G2D](drivers/g2d.md)、[VE](drivers/vdec.md)、[USB](drivers/usb.md)

## 组件

- [OpenSBI](components/opensbi.md)：M 模式的 SBI 固件
- [SyterKit](components/syterkit.md)：引导程序与 PSRAM 初始化
- [Buildroot 外部树](components/buildroot-external.md)：板级配置与镜像打包脚本

:::tip
刷写前请先阅读 [FEL 下载模式与工具](../../boot/fel.md) 和 [SPI NOR 布局与备份](../../boot/flash-layout.md)，并备份板上 Flash。纯 Rust 的系统见 [Asterinas](../asterinas/rustsbi-asterinas.md)。
:::
