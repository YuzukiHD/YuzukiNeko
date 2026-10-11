# Linux 开发

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

### 已支持

设备树里已启用，驱动也编进了内核：

| 外设 | 驱动 | 说明 |
| --- | --- | --- |
| 时钟与复位 | `sunxi-ng` CCU（含 CPU PLL、DDR PLL、RTC 时钟） | 所有外设的时钟来源 |
| 中断与定时器 | PLIC、CLINT | C907 自带 |
| 引脚复用与 GPIO | `pinctrl-sun252i-f101`，GPIO 字符设备 | 提供 `/dev/gpiochip*` |
| UART1 | 8250 DesignWare | 控制台 `ttyS1`，115200 8N1，引脚 `PB0/PB1` |
| I2C2 | `i2c-mv64xxx`，`i2c-dev` | 引脚 `PB2` 组，用户态走 `/dev/i2c-*` |
| SPI0 与板载 NOR | `spi-sun6i`，`spi-nor`，MTD | 16 MiB NOR，按固定分区挂载，见[预编译镜像](linux-prebuilt.md#单独替换某个组件) |
| DMA | `sun6i-dma` | |
| 系统控制与 SRAM | `sunxi_sram` | |

### 没验证

下面这些没有验证过，可能存在问题。

| 外设 | 现状 |
| --- | --- |
| 视频引擎 | Cedrus 驱动（`VIDEO_SUNXI_CEDRUS`，V4L2 staging）已编入，设备树里已启用；没有测试通过，板上内存不够，没法验证 |
| microSD（SMHC0） | `sunxi-mmc` 驱动已编入；板级写了卡检测 `PF6` 和 3.3 V 供电，但状态是 `disabled`；没有测试通过，板上内存不够，没法验证 |
| SMHC2 | `sunxi-mmc` 驱动已编入；SoC 里有节点，板级没有配置；没有测试通过，板上内存不够，没法验证 |
| UART0、UART2～UART5 | 8250 DesignWare 驱动已编入；SoC 里有节点，板级没有启用，也没有配置引脚 |
| I2C0、I2C1 | `i2c-mv64xxx` 驱动已编入；板级没有启用，也没有配置引脚 |
| SPI1 | `spi-sun6i` 驱动已编入；板级没有启用，也没有配置引脚 |
| PWM0 | `pwm-sunxi` 驱动已编入；板级没有启用，也没有配置引脚 |
| 看门狗 | SoC 设备树有节点，但内核没开 `CONFIG_WATCHDOG`，驱动没有编进去 |
| USB（主机 / 设备） | 内核没开 `CONFIG_USB`，设备树里也没有 USB 节点 |
| 显示与 RGB LCD | 没有显示驱动（`CONFIG_DRM` 未开），设备树里没有显示节点 |
| G2D | 设备树里没有节点，内核里也没有驱动 |
| 音频（片上 codec） | 设备树里没有节点，内核里也没有驱动 |
| ADC | 设备树里没有节点，`CONFIG_IIO` 未开 |
| RTC | 只有 RTC 时钟控制器，没有 RTC 设备，`CONFIG_RTC_CLASS` 未开 |

想用设备树里已有节点但没启用的外设，改 `sun252i-f101-yuzukineko-common.dtsi`，把对应节点设成 `okay`、配好引脚，重新构建设备树。

Linux 暂时没有 USB、显示、G2D、音频的驱动；这几类外设在 [Zephyr](../zephyr/index.md) 里有驱动。

## 本章内容

- [预编译镜像](linux-prebuilt.md)
- [手动构建](linux-manual.md)
- [手动构建 RV64I](linux-manual-rv64.md)
- [Linux + Buildroot](linux-buildroot.md)

?> 刷写前请先阅读 [FEL 下载模式与工具](../../boot/fel.md) 和 [SPI NOR 布局与备份](../../boot/flash-layout.md)，并备份板上 Flash。纯 Rust 的系统见 [Asterinas](../asterinas/rustsbi-asterinas.md)。
