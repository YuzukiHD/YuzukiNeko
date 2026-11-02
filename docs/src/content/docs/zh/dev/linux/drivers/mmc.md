---
title: "SMHC - microSD 卡"
---

F101 有两个 SD/MMC 主机控制器，简称 SMHC。第一个接在 `PF0`-`PF5` 上的 microSD 卡座，卡检测走 `PF6`，供电固定 3.3 V；第二个是 eMMC 控制器，板子没用，它的焊盘还和 SPI Flash 共用。Linux 用 `sunxi-mmc` 驱动两者，卡会作为一个普通块设备出现。

microSD 卡座和 NOR Flash 是互相独立的：根文件系统在 Flash 上，卡是额外的存储，需要手动挂载。本章讲控制器的寄存器和 IDMA 引擎、两个控制器的设备树、探测路径和 F101 特有的时序配置，以及 BusyBox 里能用什么。

| 项目 | 内容 |
| --- | --- |
| 驱动 | `drivers/mmc/host/sunxi-mmc.c` |
| Compatible | `allwinner,sun252i-f101-mmc`（SMHC0）、`allwinner,sun252i-f101-emmc`（SMHC2） |
| 基地址 | `0x04020000`（SMHC0）、`0x04022000`（SMHC2） |
| 寄存器窗口 | `0x1000` 字节 |
| 中断 | PLIC 40（SMHC0）、PLIC 42（SMHC2） |
| 时钟 | `ahb`（`CLK_BUS_SMHC0/2`）、`mmc`（`CLK_SMHC0/2`） |
| 复位 | `RST_BUS_SMHC0/2`，复位名 `ahb` |
| Kconfig | `CONFIG_MMC`、`CONFIG_MMC_BLOCK`、`CONFIG_MMC_SUNXI` |
| 用户态 | `/dev/mmcblk0`、`/dev/mmcblk0p1`、`/sys/class/mmc_host/mmc0` |

## 主机控制器的工作原理

SMHC 是一个命令/响应引擎，带 16 字节数据 FIFO 和自己的基于描述符的 DMA，驱动里叫 IDMAC。一次请求就是写一次命令寄存器；控制器驱动 CMD，必要时用 IDMAC 搬数据，收集响应，然后产生一个中断。驱动的活是构造 IDMA 描述符链、配置时钟和总线位宽，并在中断到来时结束或中止请求。

寄存器来自 `sunxi-mmc.c` 顶部的定义：

| 偏移 | 寄存器 | 用途 |
| --- | --- | --- |
| `0x00` | GCTRL | 软复位/FIFO/DMA 复位、中断使能、DMA 使能、DDR 模式、访问完成 |
| `0x04` | CLKCR | 卡时钟开关、低功耗、内部分频、`MASK_DATA0` |
| `0x08` | TMOUT | 数据超时，写的是 `0xffffffff` |
| `0x0c` | WIDTH | 总线位宽：1、4 或 8 位 |
| `0x10` | BLKSZ | 块大小 |
| `0x14` | BCNTR | 字节计数 |
| `0x18` | CMDR | 命令号、响应类型、数据方向、自动停止、启动 |
| `0x1c` | CARG | 命令参数 |
| `0x20`-`0x2c` | RESP0-3 | 响应寄存器，各 32 位 |
| `0x30` | IMASK | 中断掩码 |
| `0x34` | MISTA | 掩码后的中断状态 |
| `0x38` | RINTR | 原始中断状态；写 1 清除 |
| `0x3c` | STAS | 状态：FIFO 深度、卡在位、卡忙 |
| `0x40` | FTRGL | FIFO 阈值和突发长度 |
| `0x44` | FUNS | 功能选择、CEATA 和 SDIO 控制 |
| `0x48` | CBCR | CIU 字节计数 |
| `0x4c` | BBCR | BIU 字节计数 |
| `0x50` | DBGC | 调试寄存器，写 `0xdeb` |
| `0x80` | DMAC | IDMAC 控制：软复位、固定突发、IDMA 开启 |
| `0x84` | DLBA | IDMA 描述符链表基地址，带移位 |
| `0x88` | IDST | IDMAC 状态 |
| `0x8c` | IDIE | IDMAC 中断使能 |
| `0x5c` | NTSR | 新时序模式和命令/数据相位 |
| `0x140` | DRV_DL | 驱动延时：命令和数据相位位 |
| `0x144` | SAMP_DL | 采样延时和校准 |

`sunxi_mmc_init_host()` 复位整个模块，往 `FTRGL` 写 `0x20070008`（突发 8，接收触发 7，发送触发 8），把超时设成最大值，清掉所有中断，写调试值，打开 CEATA，并编程 `DLBA`。描述符基地址右移两位存放（F101 的 `idma_des_shift`），所以寄存器里是字地址而不是字节地址。

### 命令与响应

`sunxi_mmc_request()` 从 `mmc_command` 构造 `CMDR`：bit 5:0 是命令号，有响应时置 `RESP_EXPIRE`，136 位响应置 `LONG_RESPONSE`，命令要求时置 `CHECK_RESPONSE_CRC`，数据命令置 `DATA_EXPIRE` 和 `WAIT_PRE_OVER`，写操作置 `WRITE`，请求带停止命令时置 `SEND_AUTO_STOP`，CMD0 置 `SEND_INIT_SEQUENCE`。数据命令还会编程 `BLKSZ` 和 `BCNTR` 并启动 IDMAC。

响应在 `sunxi_mmc_finalize_request()` 里读取：136 位响应从 RESP3 到 RESP0 拼起来，短响应只读 RESP0。中断处理 `sunxi_mmc_irq()` 累积掩码状态，响应超时时会等 `COMMAND_DONE` 让错误转储拿到最终状态，然后在错误位出现、或者完成位出现且 IDMAC 已静下来时结束请求。

### IDMA 描述符

每个描述符是四个 32 位字：

| 字 | 字段 | 含义 |
| --- | --- | --- |
| 0 | Config | 链模式、own 位、完成时不中断、first/last/end-of-ring 标志 |
| 1 | Buffer size | 本段的字节数；零表示最大值 8192 |
| 2 | Buffer address 1 | 段地址，右移两位 |
| 3 | Buffer address 2 | 下一段描述符的地址，最后一段为零 |

F101 的配置是 `idma_des_size_bits = 13`，所以一段描述符最多搬 8 KiB；`idma_des_shift = 2`，所以两个地址都按字地址存。`sunxi_mmc_init_idma_des()` 给每段置 `CH | OWN`，除最后一段外都置 `DIC`，第一段置 `FD`，最后一段置 `LD | ER`，并把下一段指针写成前一段加 16 字节再移位。

链表放在一页一致性内存里（`dma_alloc_coherent(PAGE_SIZE)`），一页是 256 个 16 字节的描述符。主机上限就来自这里：`max_segs = PAGE_SIZE / 16 = 256`、`max_seg_size = 8 KiB`、`max_req_size = 2 MiB`，加上 `max_blk_count = 8192` 和 `max_blk_size = 4096`。更大的请求由 MMC 核心拆成多次。

驱动要求每个 scatterlist 项的偏移和长度都按 4 字节对齐（`sunxi_mmc_map_dma()`），因为缓冲地址和块大小都是移位存放的。不对齐的项会以 "unaligned scatterlist" 拒绝。块层通常给的就是对齐的页，所以这是保险而不是常见故障。

### 时钟与固定相位

卡时钟来自 CCU 的 `0x0830` 处的 `CLK_SMHC0`。这个时钟是在 `dcxo24M`、`pll-peri-1x`、`pll-peri-2x` 和一个音频分频之间的 mux，后面是 `M` 分频、`P` 分频，以及一个**固定的二分频后分频器**；描述用的是 `SUNXI_CCU_MP_WITH_MUX_GATE_POSTDIV(..., 2, 0)`。时钟框架会为这个后分频器做补偿，把分频链按请求速率的两倍编程，所以 `clk_set_rate()` 收到的是驱动想要的卡速率，`clk_get_rate()` 报告的则是控制器真正看到的速率。从时钟描述里去掉这个后分频器会改变这层关系，所以驱动和时钟描述必须一致。

控制器自己在 `CLKCR` 的 bit 7:0 里有一个内部分频，只在 DDR52 下使用，那时模块时钟加倍再分回来。SDR 下分频是一。新时序模式由 `NTSR` 的 bit 31 表示，F101 的配置带 `needs_new_timings`，所以驱动无条件打开这个模式，而不是请 CCU 切换。

F101 还置了 `fixed_phase`，用一张根据卡时钟推导的固定表取代后续 SoC 的延迟线调优：

| 卡时钟 | 命令驱动相位 | 数据驱动相位 | NTSR 采样相位 |
| --- | --- | --- | --- |
| 26 MHz 以下 | 移位 | 不移位 | 0 |
| 26 到 52 MHz | 移位 | 移位 | 1 |
| 52 MHz 以上 | 不可达 | 不可达 | 不可达 |

`sunxi_mmc_clk_set_phase()` 直接实现这张表。没有校准：`can_calibrate` 为假，所以 `sunxi_mmc_calibrate()` 立刻返回，采样延时寄存器不动。同一块板上厂商的 HAL 用的是同一条规则，这是个有用的交叉验证。

主机声明 400 kHz 到 52 MHz，设备树的 `max-frequency = <50000000>` 经 `mmc_of_parse()` 把上限压到 50 MHz。识别阶段跑 400 kHz，传输阶段跑 50 MHz、4 位、SD high speed。

### 卡检测与供电

`cd-gpios = <&pio 5 6 GPIO_ACTIVE_LOW>` 指定 `PF6`；低电平表示卡在位。`mmc_of_parse()` 按默认 200 ms 去抖申请它，`mmc_gpiod_request_cd_irq()` 通过 pio 控制器的端口中断把它变成线程化中断。如果这个引脚拿不到中断，核心会置 `MMC_CAP_NEEDS_POLL` 改用轮询。

供电没有开关：`vmmc-supply` 和 `vqmmc-supply` 都指向 3.3 V 的常开固定稳压器，所以核心看到的是一路关不掉的电源，就不去动它。节点里的 `no-1-8-v` 清掉 UHS 和 1.8 V 能力，这和接线一致：没有电平转换，也没有 1.8 V 电源。

## 设备树

SoC 设备树里的 SMHC0：

```text
sdc0: mmc@4020000 {
	compatible = "allwinner,sun252i-f101-mmc";
	reg = <0x0 0x04020000 0x0 0x1000>;
	interrupts-extended = <&plic 40 IRQ_TYPE_LEVEL_HIGH>;
	clocks = <&ccu CLK_BUS_SMHC0>, <&ccu CLK_SMHC0>;
	clock-names = "ahb", "mmc";
	resets = <&ccu RST_BUS_SMHC0>;
	reset-names = "ahb";
	pinctrl-names = "default";
	pinctrl-0 = <&sdc0_pf_pins>;
	bus-width = <4>;
	max-frequency = <50000000>;
	cap-sd-highspeed;
	no-1-8-v;
	no-mmc;
	no-sdio;
	status = "disabled";
};
```

SMHC2 是 eMMC 控制器。它的节点带 eMMC 的 compatible 和 `non-removable`，并且是禁用的：

```text
sdc2: mmc@4022000 {
	compatible = "allwinner,sun252i-f101-emmc";
	reg = <0x0 0x04022000 0x0 0x1000>;
	interrupts-extended = <&plic 42 IRQ_TYPE_LEVEL_HIGH>;
	clocks = <&ccu CLK_BUS_SMHC2>, <&ccu CLK_SMHC2>;
	clock-names = "ahb", "mmc";
	resets = <&ccu RST_BUS_SMHC2>;
	reset-names = "ahb";
	pinctrl-names = "default";
	pinctrl-0 = <&sdc2_pc_pins>;
	bus-width = <4>;
	max-frequency = <50000000>;
	cap-mmc-highspeed;
	no-1-8-v;
	no-sd;
	no-sdio;
	non-removable;
	status = "disabled";
};
```

| 标签 | 基地址 | PLIC | 焊盘 | 板级状态 |
| --- | --- | --- | --- | --- |
| `sdc0` | `0x04020000` | 40 | `PF0`-`PF5`，卡检测在 `PF6` | 使能，microSD |
| `sdc2` | `0x04022000` | 42 | `PC0`-`PC5` | 禁用，eMMC |

板级文件使能 SMHC0，给两路电源都接 3.3 V，并指定卡检测引脚：

```text
&sdc0 {
	vmmc-supply = <&reg_vcc_3v3>;
	vqmmc-supply = <&reg_vcc_3v3>;
	cd-gpios = <&pio 5 6 GPIO_ACTIVE_LOW>; /* PF6 */
	status = "okay";
};
```

引脚组在 SoC 文件里：

```text
sdc0_pf_pins: sdc0-pf-pins {
	pins = "PF0", "PF1", "PF2", "PF3", "PF4", "PF5";
	function = "sdc0";
	drive-strength = <40>;
	bias-pull-up;
};
```

这六个引脚承载时钟、命令和四条数据线；组里设置了 40 Ω 驱动强度和全部上拉，这正是卡不驱动总线时 SD 总线需要的。

绑定文件是 `Documentation/devicetree/bindings/mmc/allwinner,sun4i-a10-mmc.yaml`。F101 的 compatible 既作为独立项列出，也出现在一组兜底对里，绑定说明了 `bus-width`、`max-frequency`、`cd-gpios`、`vmmc-supply`、`vqmmc-supply`、`no-1-8-v`、`cap-sd-highspeed`、`cap-mmc-highspeed`、`no-sd`、`no-mmc`、`no-sdio`、`non-removable` 以及时序属性。

### alias 与设备名

SoC 设备树里有 `mmc0 = &sdc0;` 和 `mmc1 = &sdc2;`。MMC 核心按 `mmcN` alias 给主机编号，所以 microSD 卡座是 `mmc0`，块设备是 `mmcblk0`；被禁用的 eMMC 本来会是 `mmcblk1`。和 I²C、SPI 的情况不同，这里没有意外，因为 alias 是存在的。

## Kconfig

```text
CONFIG_MMC=y
CONFIG_MMC_BLOCK=y
CONFIG_MMC_SUNXI=y
```

`CONFIG_MMC` 是核心，`CONFIG_MMC_BLOCK` 加上块设备，`CONFIG_MMC_SUNXI` 是主机驱动（依赖 `ARCH_SUNXI` 和 `SUNXI_CCU`）。板级 defconfig 三项都设了，另外还有给 FAT 卡用的 `CONFIG_VFAT_FS`、`CONFIG_NLS_CODEPAGE_437`、`CONFIG_NLS_ISO8859_1`，以及给设备节点用的 `CONFIG_DEVTMPFS`。它没有开 `CONFIG_PARTITION_ADVANCED`，所以用的是默认分区解析器：MBR（`CONFIG_MSDOS_PARTITION`）和 GPT（`CONFIG_EFI_PARTITION`）都编进去了，BSD 和 Solaris 的没有。ext4 和 exFAT 文件系统支持都没有编。

## 驱动内部

### 探测路径

`sunxi_mmc_probe()` 用 `devm_mmc_alloc_host()` 分配主机，然后 `sunxi_mmc_resource_request()`：

1. 按 compatible 读取变体配置。
2. `mmc_regulator_get_supply()` 解析 `vmmc` 和 `vqmmc`。
3. 映射寄存器，取 `ahb` 和 `mmc` 时钟；只有带 `clk_delays` 的变体才取 `output` 和 `sample` 时钟。F101 没有，所以跳过这两次查找。
4. 取名为 `"ahb"` 的可选复位并让控制器上电：复位、开时钟、打开 `GCTRL` 中断使能。
5. 申请线程化中断（硬处理 `sunxi_mmc_irq`，线程 `sunxi_mmc_handle_manual_stop`）。

回到 probe，它分配描述符页，因为 F101 配置需要而把 `use_new_timings` 置真，填好主机操作和上限，应用 `mmc_of_parse()`，在有 `no-1-8-v` 时屏蔽 UHS 和 HS200/HS400，初始化控制器寄存器并调用 `mmc_add_host()`。

### 上限与能力

| 属性 | 值 | 来源 |
| --- | --- | --- |
| `f_min` | 400 kHz | 驱动 |
| `f_max` | 50 MHz | 驱动 52 MHz，被 `max-frequency` 压低 |
| `max_seg_size` | 8 KiB | `1 << idma_des_size_bits` |
| `max_segs` | 256 | 一页 16 字节描述符 |
| `max_req_size` | 2 MiB | `max_seg_size × max_segs` |
| `max_blk_size` | 4096 | 驱动 |
| `max_blk_count` | 8192 | 驱动 |
| SD high speed | 是 | `cap-sd-highspeed` 和驱动能力 |
| MMC high speed | 是 | 驱动能力，因为 `no-mmc` 无所谓 |
| 1.8 V / UHS | 否 | `no-1-8-v` |
| SDIO IRQ | 是 | 驱动能力，因为 `no-sdio` 无所谓 |

### 初始化

`sunxi_mmc_init_host()` 做一次硬件复位，最多等 250 ms 让复位的位清掉，然后写 FIFO 阈值、最大超时、中断掩码，清原始中断，写调试寄存器，打开 CEATA，编程 `DLBA` 并打开全局中断。

### set_ios 与时钟变化

`sunxi_mmc_set_ios()` 处理电源、总线位宽、时序和时钟。时钟路径是 `sunxi_mmc_clk_set_rate()`：先关掉卡时钟，DDR52 时把请求加倍，取整并设置模块时钟，编程内部分频，为新时序设置 `NTSR`，应用上面那张表的固定相位，再把卡时钟打开。`CLKCR` 里的 `MASK_DATA0` 让时钟变化期间 DATA0 不乱跳，这也是 F101 配置置 `mask_data0` 的原因。

最后一次 `set_ios` 的结果存在 `host->ferror`；如果失败了，`sunxi_mmc_request()` 会用那个错误让每个请求直接失败，而不是去编程控制器。

### 中断与错误

`sunxi_mmc_irq()` 在主机自旋锁下运行。它读 `IDST` 和 `MISTA`，累积状态，在传输完成或错误位置位时结束请求。响应超时比较特殊：处理函数会继续开着 `COMMAND_DONE` 中断，好让转储拿到完整信息。出错时 `sunxi_mmc_dump_errinfo()` 打印命令、参数、状态寄存器和 IDMA 描述符链，请求被标记为 `-ETIMEDOUT`。如果有数据，请求会存进 `manual_stop_mrq`，由线程处理函数发一条显式停止命令（CMD12）把卡带回传输状态。硬处理结束、线程收尾这个分工，就是驱动申请线程化中断的原因。

### 缓存一致性

SoC 总线是 `dma-noncoherent`。数据缓冲区在构造 IDMA 描述符之前用 `dma_map_sg()` 映射，在 `sunxi_mmc_finalize_request()` 里解除映射；方向由 `mmc_get_dma_dir()` 给出。描述符页来自 `dma_alloc_coherent()`。启动 IDMAC 之前，`sunxi_mmc_init_idma_des()` 最后有一个 `wmb()`，保证描述符的写入在控制器取指之前可见。

### 运行时电源管理

主机空闲 50 ms 后自动挂起。resume 重新打开时钟和复位并重新初始化控制器；suspend 反过来。卡不会被断电，因为稳压器是常开的，所以主机挂起再恢复后卡还保持原状态。

## 用户态接口

| 路径 | 含义 |
| --- | --- |
| `/dev/mmcblk0` | 作为块设备的卡 |
| `/dev/mmcblk0p1` … | 来自卡上分区表的分区 |
| `/sys/block/mmcblk0/` | 大小、队列和分区项 |
| `/sys/class/mmc_host/mmc0/` | 主机；`mmc0:xxxx` 是卡，带 `type`、`name`、`cid`、`csd`、`scr` |
| `/sys/kernel/debug/mmc0/ios` | 挂载 debugfs 后的当前总线模式 |
| `/proc/partitions` | 所有块设备及其大小 |

卡的 sysfs 目录名是 `mmc0:` 加上它四位十六进制的 RCA，所以换卡就会变。`/sys/class/mmc_host/mmc0/mmc0:*/type` 对 SD 卡读出 `SD`，eMMC 是 `MMC`，SDIO 设备是 `SDIO`。

根文件系统里没有 `mmc` 工具。有用的 BusyBox applet 是 `fdisk`（分区表）、`blkid`（文件系统类型）、`mkdosfs`（建 FAT 文件系统）、`mount`、`df` 和 `fsck`。`ext4`、`exfat` 和 `mmc-utils` 软件包都没有安装。

### 挂载卡

文件系统必须是内核认识的。`CONFIG_VFAT_FS` 覆盖 FAT16 和 FAT32；exFAT 和 ext4 没有编。根文件系统是只读 SquashFS，所以挂载点必须在可写文件系统上——overlay 让 `/mnt` 可写，因此 `/mnt/sd` 可用。

```sh
mkdir -p /mnt/sd
mount -t vfat /dev/mmcblk0p1 /mnt/sd
```

不带 `-t` 的 `mount` 会先用 `blkid` 探测文件系统；写明类型可以避免探测，卡不是 FAT 时错误也更清楚。带 MBR 或 GPT 分区表的卡会出现 `mmcblk0p1`、`p2` 等等；没有分区表、直接格式化的卡就用 `/dev/mmcblk0` 挂载。

## 工作示例

### 示例 1：协商出来的总线模式

插着一张高速 SD 卡、并且挂好 debugfs 之后：

```sh
mount -t debugfs none /sys/kernel/debug
grep -v 'actual clock' /sys/kernel/debug/mmc0/ios
```

代表性输出：

```text
clock:		50000000 Hz
vdd:		21 (3.3 ~ 3.4 V)
bus mode:	2 (push-pull)
chip select:	0 (don't care)
power mode:	2 (on)
bus width:	2 (4 bits)
timing spec:	2 (sd high-speed)
signal voltage:	1 (3.30 V)
driver type:	0 (invalid)
```

`clock` 是核心按 `max-frequency` 请求的速率；`actual clock` 被故意过滤掉了，因为它是 CCU 能把请求取整成的速率，取决于 bootloader 留下的 PLL 设置。`timing spec: 2` 是 `include/linux/mmc/mmc.h` 里的 `MMC_TIMING_SD_HS`，`bus width: 2` 是四位。只支持标准速度的卡会显示 timing spec 1 和 25 MHz。

### 示例 2：插卡与拔卡

卡检测接在 `PF6` 上，启动后插卡会触发检测事件，核心开始扫描：

```sh
dmesg | grep mmc0
```

代表性输出，依赖卡本身的字段放在尖括号里：

```text
mmc0: new high speed SDHC card at address <rca>
mmcblk0: mmc0:<rca> <name> <capacity>
mmc0: card <rca> removed
```

前两行来自 `mmc_add_card()` 和 `mmc_blk_probe()`，第三行来自移除路径。`<rca>` 是识别阶段分配的、四位十六进制的相对卡地址，`<name>` 是 CID 里的产品名，`<capacity>` 由 `string_get_size()` 打印。没卸载就拔卡会让挂载点返回 I/O 错误；先卸载。

## 限制

| 限制 | 说明 |
| --- | --- |
| 只有一个卡座 | 只有 SMHC0 接了线；SMHC2 是 eMMC 控制器，而且是禁用的 |
| 只有 3.3 V | `no-1-8-v`；没有 UHS、SDR50、SDR104 或 DDR50 |
| 50 MHz 上限 | SD high speed、4 位；控制器声称 52 MHz，但板级节点要的是 50 |
| 没有调优 | `fixed_phase` 取代延迟线校准；没有相位调优循环 |
| 只支持 FAT | exFAT 和 ext4 没有编进内核 |
| 没有 mmc-utils | 没有 `mmc extcsd`、`mmc-utils` 或卡健康命令 |
| 不是启动设备 | 系统从 NOR 启动；卡只是数据存储 |
| SMHC2 的 `PC` 焊盘共享 | 使能 eMMC 会从 SPI0/SPIF 手里拿走 `PC0`-`PC5` |

## 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `dmesg` 里没有 `mmc0` | 节点被禁用，或时钟/复位查找失败 | 检查 `&sdc0` 是 `okay`，看 `dmesg` 的探测错误 |
| 插了卡但没有 `/dev/mmcblk0` | 卡检测没工作，或卡没有应答 CMD0 | 检查 `PF6` 和上拉；换一张卡试 |
| 出现 "mmc0: error -110 whilst initialising SD card" | 卡没完成识别：时钟太快或信号完整性 | 降低 `max-frequency`；检查 `PF` 引脚和卡 |
| 卡被识别但没有分区 | 卡上没有分区表，或者分区表不常见 | 用 MBR 或 GPT 重新分区；用 `fdisk -l` 检查 |
| `mount: wrong fs type` | 卡是 exFAT 或 ext4 | 用 FAT，或者给内核加上对应文件系统 |
| 挂载期间拔卡 | 挂载点开始返回 I/O 错误 | 拔卡前先卸载；重新插入后再挂载 |
| 使能 `&sdc2` 后 Flash 坏了 | SMHC2、SPI0 和 SPIF 共用 `PC0`-`PC5` | 只使能其中一个 |

## 相关页面

- [SPI 与 DMA](spi.md) 与 [SPIF - SPI NOR Flash](spif-nor.md)：系统真正启动所用的存储。
- [引脚复用与 GPIO](pinctrl-gpio.md)：`PF` 引脚组和 `PF6` 卡检测线。
- [Linux 开发](../index.md)：内核配置和启动链。
- [常用命令](../apps/linux-commands.md)：板子上能用的 shell 命令，包括这里用到的工具。
