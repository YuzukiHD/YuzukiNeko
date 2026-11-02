---
title: "SPIF - SPI NOR Flash"
---

除了两个通用 SPI 控制器，F101 还有一个只为 SPI Flash 而生的控制器。它没有中断线，没有给软件用的 FIFO 接口，也没有时钟分频：每条 Flash 命令都变成一小段描述符，由控制器自己的 DMA 取回，命令的地址、空周期和数据阶段都写在这段描述符里。CPU 写八个字、启动引擎，然后轮询结束。

控制器在 `0x0c000000`，与 SPI0 和 eMMC 控制器共用六个 `PC` 焊盘。出厂板的镜像把 Flash 留在 SPI0 上；`sun252i-f101-yuzukineko-spif.dts` 是把它搬过来的变体。本章讲两边：控制器和它的采样点调优，以及两个控制器都得打交道的 Puya P25Q128H。

| 项目 | 内容 |
| --- | --- |
| 驱动 | `drivers/spi/spi-sunxi-spif.c` |
| Compatible | `allwinner,sun252i-f101-spif` |
| 基地址 | `0x0c000000`，`0x1000` 字节 |
| 中断 | 设备树里没有；完成靠轮询 |
| 时钟 | `ahb`（`CLK_BUS_SPIF`）、`mod`（`CLK_SPIF`） |
| 复位 | `RST_BUS_SPIF` |
| DMA | 只有内部的描述符取指器，不走 `sun6i-dma` 引擎 |
| Kconfig | `CONFIG_SPI_SUNXI_SPIF`、`CONFIG_MTD_SPI_NOR` |
| 用户态 | `/dev/mtd0` … `/dev/mtd5`、`/dev/mtdblock0` … `/dev/mtdblock5` |

## 控制器的工作原理

一次传输就是一条命令。驱动填一段八字描述符：

| 字 | 字段 | 含义 |
| --- | --- | --- |
| 0 | Burst | 最后一段描述符、读方向、突发长度（16 拍递增） |
| 1 | Block length | 64 字节块标志和数据长度 |
| 2 | Data address | DMA 缓冲区地址，按字计（`>> 2`） |
| 3 | Next descriptor | 零：这是最后一段 |
| 4 | Phase | 命令包含哪些阶段：命令、地址、空周期、接收、发送 |
| 5 | Flash address | 地址阶段的值 |
| 6 | TCS | 操作码、地址位宽、数据位宽 |
| 7 | TNM | 数据长度、空周期数、地址长度减一、正常模式 |

描述符放在一致性内存里；`sunxi_spif_xfer()` 写好它，用 `dma_wmb()` 保证写序，把 `desc_dma >> 2` 写进 `0x44` 的描述符寄存器，再把描述符长度和启动位写进 `0x40` 的 DMA 控制寄存器。控制器自己取回描述符，驱动 CS、SCK 和数据线，结束时置 `0x18` 状态寄存器里的 DMA 完成位。因为没有中断，驱动用 `readl_poll_timeout_atomic()` 轮询这个寄存器，最长等一秒。

寄存器组：

| 偏移 | 寄存器 | 用途 |
| --- | --- | --- |
| `0x00` | VERSION | 控制器版本；要求 `0x10002` 或更高 |
| `0x04` | GCR | DMA 模式、无数据启动、DTR、CPHA、CPOL、片选选择与极性 |
| `0x08` | GAR | FIFO 复位、软复位、DMA 复位 |
| `0x0c` | TCR | 采样延时与模式、采样使能、DTR 时钟输出选择 |
| `0x14` | IER | 中断使能；写零，这根线不用 |
| `0x18` | ISR | DMA 完成（bit 24）和错误位（10:8） |
| `0x1c` | CSD | 片选的建立、保持和撤销时序 |
| `0x20` | PHC | 无数据路径的阶段寄存器 |
| `0x24` | TCF | 无数据路径的 Flash 地址 |
| `0x28` | TCS | 无数据路径的位宽和操作码 |
| `0x2c` | TNM | 无数据路径的计数 |
| `0x40` | DMA_CTL | 描述符长度和启动 |
| `0x44` | DMA_DESC | 描述符地址，按字计 |

有数据时走描述符路径，`PHC`/`TCF`/`TCS`/`TNM` 被忽略。没有数据时——擦除、读状态、写使能——同样的值直接写进这些寄存器并置 `GCR_NORMAL_EN`；完成就是硬件把这个位清掉，驱动同样轮询。

### 线路上的一条命令

Flash 核心发下来的每个操作都是几种固定形状之一，描述符字段由它推导：

| 操作 | 操作码 | 地址 | 空周期 | 数据 | 描述符形状 |
| --- | --- | --- | --- | --- | --- |
| 读 JEDEC ID | `0x9f` | 无 | 无 | 3 字节入，1 线 | Command + RX |
| 读状态 | `0x05` | 无 | 无 | 1 字节入，1 线 | Command + RX |
| 四线输出读 | `0x6b` | 3 或 4 字节，1 线 | 8 时钟 | 1 或 4 线入 | Command + ADDR + DUMMY + RX |
| 四线 DTR 读 | `0xed` | 4 字节，4 线，DTR | 4 字节，DTR | 4 线入，DTR | Command + ADDR + DUMMY + RX，DTR |
| 页编程 | `0x02` | 3 字节，1 线 | 无 | 1 线出 | Command + ADDR + TX |
| 四线页编程 | `0x32` | 3 字节，1 线 | 无 | 4 线出 | Command + ADDR + TX |
| 4 KiB 擦除 | `0x20` | 3 字节，1 线 | 无 | 无 | 无数据路径 |

操作码是 `include/linux/mtd/spi-nor.h` 里的标准值；实际用哪一种读变体取决于 Flash 节点里的位宽，见 [Flash 芯片](#flash-芯片)。擦除和写使能没有数据阶段，所以走寄存器路径（`GCR_NORMAL_EN`）而不是 DMA 描述符。

### 阶段与位宽

阶段字一个阶段一位：`CMD`（bit 28）、`ADDR`（bit 24）、`DUMMY`（bit 16）、`TX`（bit 12）、`RX`（bit 8）。地址阶段和数据阶段各自用 0、1、2 表示一、二、四线；命令阶段永远是一线。DTR 位把地址、空周期和数据阶段都扩到两个时钟沿，而驱动只在三者全是 DTR 时才接受 DTR 操作。这正是 Flash 四线 DTR 读的形状：操作码单线、地址四线、一个空周期、数据四线，全部双沿。

空周期按时钟数计，不按字节：`sunxi_spif_dummy_cycles()` 算的是 `字节 × 8 / 位宽`，DTR 再减半，结果必须放进八位。地址长度存的是字节数减一，最多四字节。

控制器还提供一个线性（XIP）窗口：厂商驱动把起始地址、结束地址和对应的 Flash 地址写进 `0x34`、`0x38`、`0x3c`，把一段 32 MiB 窗口映射到 `0x0e000000`。Linux 驱动不碰这些寄存器，所以每次访问都走描述符路径。走 XIP 窗口会绕过驱动依赖的采样点逻辑，而且这个窗口在设备树里没有描述。

### 时钟与 DTR

模块时钟是 CCU 在 `0x0980` 的 `spif` 时钟：在 `dcxo24M`、`pll-peri-1x`、`pll-peri-2x`、`pll-peri-800m` 之间选择，后面是 5 位的 `M` 分频和 3 位的 `P` 分频。驱动用 `clk_set_rate()` 编程它。DTR 模式下它请求两倍于 SCK 的速率，因为每个时钟过两位；读回来的时钟高于请求时以 `-ERANGE` 拒绝。SDR 与 DTR 之间切换还需要一次软复位，因为控制器在复位时锁存时钟模式：`sunxi_spif_set_mode()` 设置 `SCKOUT_SEL`，跑一次 `sunxi_spif_reset()`，再把 TCR 连同采样点一起恢复。

驱动声明 100 MHz。那只是上限，不是承诺：50 MHz 以上数据眼图取决于板子，只有能调优时驱动才去那里。

## 采样点与调优

控制器有一个可编程的接收采样点：三种模式、64 个延时步，由 `TCR` 的 bit 5:0（延时）、6（软件延时使能）、18:16（模式）和 20（采样使能）选择。驱动不硬编码某个只在一块板上成立的点，而是去测量它。

调优在第一次 50 MHz 以上的批量读时开始。数据入操作至少 256 字节，或者是任意 DTR 读，就算"批量"。`sunxi_spif_tune_run()` 里的过程：

1. 把采样点置零，用 `SPIF_IDENT_SPEED`（24 MHz）从 `allwinner,tune-offset` 指定的偏移读 4 KiB。这是参考值。如果这段区域读出来不像真实数据——不同字节值少于 32 个——驱动打警告并放弃。
2. 在请求的速率下，对三种模式和 64 个延时中的每一个，把同一段 4 KiB 读两遍并与参考比较。只有两遍都一致才算好。
3. 找出最长的连续好延时段，要求至少六个（`SPIF_TUNE_MIN_WINDOW`）。选中的点是这段的中点。
4. 把这个点连同由操作码、地址与数据位宽、地址长度、空周期长度、DTR 标志和速率组成的键一起存起来。之后同样键和速率的操作直接复用，不再调优。

一次调优是 3 种模式 × 64 个延时 × 2 遍，共 384 次 4 KiB 读。这就是结果要按键和速率缓存、失败结果也要缓存的原因。

成功时驱动打印一行：`%u MHz%s: sample mode %u, delay %u (window %u..%u)`，DTR 读会附加 `DTR`。失败时警告 `no sample point at %u MHz (%d), using %u MHz`，这条操作降到 50 MHz 跑。失败会按该键和速率记住，所以调不出来的板子不会每次读都付这个代价。

`allwinner,tune-offset` 必须指向一段每次都读出相同内容、且不是空白的 4 KiB 区域。板级文件用的是 `0x6d1000`，在根文件系统里偏移 4 KiB 处（它的第二个 4 KiB 扇区）：那里的 SquashFS 镜像是压缩数据，稳定且字节多样。没有这个属性时驱动把 `can_tune` 置假，永远不超过 50 MHz。

## Flash 芯片

这颗芯片是 Puya P25Q128H，16 MiB，JEDEC ID `85 20 18`。它的 SFDP 是 JESD216 的第一版：它说支持 DTR 时钟，但没有描述四线 DTR 读，所以 `drivers/mtd/spi-nor/puya.c` 在 late-init 修正里按数据手册补上：1-4-4 DTR，操作码 `0xed`，一个模式字节，七个等待周期。

这个修正只在 Flash 已经声明 `SNOR_HWCAPS_READ_1_4_4` 时生效。这个能力来自 Flash 自己的 SFDP 与节点声明的 SPI 模式的组合：

- SPIF 变体声明 `spi-rx-bus-width = <4>` 和 `spi-tx-bus-width = <4>`。两个方向都是四线，于是提供 1-4-4，修正加上 DTR 读，它就成为所有读使用的形式。
- 出厂 SPI0 节点声明 `spi-rx-bus-width = <4>`，但 `spi-tx-bus-width = <1>`。地址阶段是发送的，所以核心拒绝 1-4-4，DTR 读永远不会被选中；剩下的最好选择是 1-1-4。

比较两块板时这点值得记住：把 Flash 搬到 SPIF 不只是换控制器，它还打开了更快的读。MTD 分区布局、分区名和上面的文件系统在两种情况下都一样，因为两边都引入 `sun252i-f101-nor-partitions.dtsi`。

| 分区 | 偏移 | 大小 | 内容 |
| --- | --- | --- | --- |
| `bootloader` | `0x000000` | 64 KiB | SyterKit |
| `dtb` | `0x010000` | 256 KiB | 设备树 |
| `opensbi` | `0x050000` | 512 KiB | `fw_jump` |
| `kernel` | `0x0d0000` | 6 MiB | Linux Image |
| `rootfs` | `0x6d0000` | 8 MiB 加 192 KiB | SquashFS |
| `overlay` | `0xf00000` | 1 MiB | JFFS2 上层 |

## 设备树

控制器节点在 SoC 设备树里：

```text
spif: spi@c000000 {
	#address-cells = <1>;
	#size-cells = <0>;
	compatible = "allwinner,sun252i-f101-spif";
	reg = <0x0 0x0c000000 0x0 0x1000>;
	clocks = <&ccu CLK_BUS_SPIF>,
		 <&ccu CLK_SPIF>;
	clock-names = "ahb", "mod";
	resets = <&ccu RST_BUS_SPIF>;
	status = "disabled";
};
```

SPIF 板级变体关掉 SPI0，把 Flash 搬到专用控制器上：

```text
&spi0 {
	status = "disabled";
};

&spif {
	pinctrl-names = "default";
	pinctrl-0 = <&spif0_pc_pins>;
	allwinner,tune-offset = <0x6d1000>;
	status = "okay";

	flash@0 {
		compatible = "jedec,spi-nor";
		reg = <0>;
		spi-max-frequency = <100000000>;
		spi-rx-bus-width = <4>;
		spi-tx-bus-width = <4>;

		#include "sun252i-f101-nor-partitions.dtsi"
	};
};
```

引脚组和 SPI0 是同样六个焊盘，功能不同：

```text
spif0_pc_pins: spif0-pc-pins {
	pins = "PC0", "PC1", "PC2", "PC3", "PC4", "PC5";
	function = "spif0";
};
```

SPI0、SPIF 和 SMHC2 都占用 `PC0`-`PC5`。`sun252i-f101-yuzukineko-spif.dts` 通过关掉 SPI0 解决冲突，而 SMHC2 在 SoC 文件里本来就是禁用的，所以在这块板上启用 SPIF 不牺牲别的东西。

绑定文件是 `Documentation/devicetree/bindings/spi/allwinner,sun252i-f101-spif.yaml`。它要求 `compatible`、`reg`、`clocks`、`clock-names` 和 `resets`，并定义了一个额外属性 `allwinner,tune-offset`，说明就是"50 MHz 以上用来找采样点的一段 4 KiB 非空白区域的偏移"。

### 总线号是 2

SPIF 节点没有 `spiN` alias。`spi_register_controller()` 查 `of_alias_get_id(dev->of_node, "spi")` 得到 -1，然后从 `of_alias_get_highest_id("spi") + 1` 开始动态分配。SoC 设备树有 `spi0` 和 `spi1` 两个 alias，最高是 1，于是 SPIF 控制器拿到 2 号总线，即使在 SPI0 被关掉的变体上也是如此。它的 Flash 设备是 `spi2.0`，MTD 主设备名叫 `spi2.0`，sysfs 路径是 `/sys/bus/spi/devices/spi2.0`。切了设备树之后去 `spi0.0` 找东西的人常在这里栽跟头。

## Kconfig

```text
CONFIG_SPI=y
CONFIG_SPI_SUNXI_SPIF=y
CONFIG_MTD=y
CONFIG_MTD_BLOCK=y
CONFIG_MTD_SPI_NOR=y
CONFIG_MTD_OF_PARTS=y
```

`CONFIG_SPI_SUNXI_SPIF` 依赖 `ARCH_SUNXI` 和 `RESET_CONTROLLER`，并选中 `SPI_MEM`，正是它让驱动能把 `spi_mem_op` 结构交给 Flash 核心。MTD 侧需要四个 `CONFIG_MTD*` 选项；`CONFIG_MTD_OF_PARTS` 才是把 `fixed-partitions` 子节点变成 `mtd0` 到 `mtd5` 的那一环。板级 defconfig 全都设了，Buildroot 片段 `linux-nor.fragment` 又重复了一遍 MTD 那组，好让别的基础配置也能得到可启动的 Flash 栈。

注意两个 Flash 控制器是二选一而不是互补：`CONFIG_SPI_SUN6I` 和 `CONFIG_SPI_SUNXI_SPIF` 可以同时编进去，由设备树决定谁占用焊盘。

## 驱动内部

### 探测路径

`drivers/spi/spi-sunxi-spif.c` 里的 `sunxi_spif_probe()`：

1. `devm_spi_alloc_host()`，然后用 `devm_platform_ioremap_resource()` 映射寄存器。
2. 取 `ahb` 和 `mod` 时钟以及独占复位。
3. 设置 32 位 DMA 掩码。
4. 用 `dmam_alloc_coherent()` 分配描述符，用 `devm_kmalloc()` 分配 64 KiB 数据缓冲区。缓冲区在两个方向上共用，没有分散聚集，也没有按传输分配。
5. 打开时钟，注册一个负责关时钟的清理动作，解除复位。
6. 往 `IER` 写零，复位控制器，`VERSION` 低于 `0x10002` 时以 `-ENODEV` 拒绝。
7. 往 `TCR` 写零，往 `CSD` 写厂商默认值 `(5 << 16) | (6 << 8) | 6`。
8. 如果有 `allwinner,tune-offset`，分配参考和调优缓冲区并置 `can_tune`。
9. 用 `devm_spi_register_controller()` 注册控制器，内存操作是 `supports_op`、`adjust_op_size` 和 `exec_op`。

`supports_op` 拒绝不是单字节单线的命令、超过四字节或大于 `U32_MAX` 的地址、超过 255 个空时钟周期，以及任何不是"地址、空周期、数据全是 DTR"的 DTR 组合。`adjust_op_size` 把数据长度限制在 64 KiB，也就是内部缓冲区的大小。

### 传输路径

`sunxi_spif_exec_op()` 为每个操作决定速率：设备的 `max_speed_hz`，再被 Flash 核心可能设置的 `op->max_freq` 限制，且不超过 100 MHz。速率高于 50 MHz 时它检查这个操作能不能调优；不能就降到 50 MHz。能的话它查调优键，要么复用缓存点，要么重新调优，要么（对已经失败的键和速率）直接降到 50 MHz。然后设置采样点并调用 `sunxi_spif_xfer()`。

`sunxi_spif_xfer()` 构造描述符，用 `dma_map_single()` 映射缓冲区，长度向上取整到 64 字节——DMA 搬运整块 64 字节——启动引擎或无数据命令，轮询，解除映射，读操作再从内部缓冲区复制到 `op->data.buf.in`。发送操作在映射之前先复制进内部缓冲区。

只有一个缓冲区这一点，才是 64 KiB 操作上限的来源，而不是硬件限制：控制器的 DMA 能寻址更多，但只有一个缓冲区、没有分散聚集，所以更大的操作由 Flash 核心切开。发送操作先复制进来，是因为 Flash 核心的缓冲区是普通内核分配，而控制器必须从它那里读整数个 64 字节块；把复制和取整放在一处，映射逻辑才简单。

### 错误路径

轮询超时或状态寄存器错误位让 `sunxi_spif_xfer()` 返回 `-EIO`。如果之后控制器连软复位也失败，驱动关掉时钟并置 `spif->failed`，之后每个操作立刻返回 `-EIO`，而不是把 DMA 缓冲区交给一个卡死的控制器。调优失败不致命：该操作降到 50 MHz 重试，失败本身被记住。

### 运行时电源管理

没有。时钟在探测时打开一次，由 devm 清理动作在移除时关掉。控制器从不自动挂起，对一个承载根文件系统的设备来说这是合理的。

## 用户态接口

控制器自己没有任何字符设备；Flash 通过 MTD 出现，和 SPI0 上完全一样：

| 路径 | 含义 |
| --- | --- |
| `/dev/mtd0` … `/dev/mtd5` | 给 `mtd_debug`、`mtdinfo`、`flash_erase` 用的分区 |
| `/dev/mtdblock4` | SquashFS 根，只读挂载 |
| `/proc/mtd` | 分区表 |
| `/sys/bus/spi/devices/spi2.0` | 作为 SPI 设备的 Flash |
| `/sys/class/spi_master/spi2` | 控制器，叫 `spi2` 的原因见上 |

因为控制器没有中断，`dmesg` 里不会有常见的中断消息。运行时消息只有调优那行，以及调优失败时的警告。

## 工作示例

### 示例 1：SPIF 变体上的启动日志

```sh
dmesg | grep -E 'MTD partitions|spi@c000000|spi2'
```

代表性输出，分区部分有删节：

```text
Creating 6 MTD partitions on "spi2.0":
0x000000000000-0x000000010000 : "bootloader"
0x000000010000-0x000000050000 : "dtb"
0x000000050000-0x0000000d0000 : "opensbi"
0x0000000d0000-0x0000006d0000 : "kernel"
0x0000006d0000-0x000000f00000 : "rootfs"
0x000000f00000-0x000001000000 : "overlay"
```

主设备名 `spi2.0` 就是 SPIF 在用的标志：SPI0 变体上同一段会写 `spi0.0`。调优那行只在 100 MHz 下第一次批量读之后出现，正常启动时就是第一次访问根文件系统的时刻；它的形状是 `100 MHz: sample mode M, delay D (window A..B)`。具体的模式和延时是板子的属性，这里不引用；被调优的操作是 DTR 读时会附加 `DTR`。

### 示例 2：查看一个分区

```sh
mtdinfo /dev/mtd0
ls /sys/bus/spi/devices/
```

代表性输出：

```text
mtd0
Name:                           bootloader
Type:                           nor
Eraseblock size:                4096 bytes, 4.0 KiB
Amount of eraseblocks:          16 (65536 bytes, 64.0 KiB)
Minimum input/output unit size: 1 byte
Sub-page size:                  1 byte
Character device major/minor:   90:0
Bad blocks are allowed:         false
Device is writable:             false
spi2.0
```

`mtdinfo` 全部从 sysfs 读：类型 `nor`、4 KiB 擦除块（4 KiB 扇区的默认选择）、64 KiB bootloader 分区的 16 个块，以及 `Device is writable: false`，因为分区带 `read-only`。`ls` 确认控制器注册成 2 号总线。

### 示例 3：改调优区域

如果换了布局让根文件系统挪了位置，调优偏移也得跟着走，否则调优会去读空白 Flash。属性在板级文件里：

```text
&spif {
	allwinner,tune-offset = <0x6d1000>;
};
```

选一个落在被写过、非空白区域里的偏移——内核分区也可以，例如 `0x0d1000`。重新构建设备树、启动，然后找调优那行；如果驱动警告 `no usable data at the tune offset`，说明那段区域是空白或内容单一，偏移得换。删掉这个属性是安全的退路：控制器会停在 50 MHz，不做任何调优。

### 两个控制器之间怎么选

| 方面 | SPI0（`spi-sun6i`） | SPIF |
| --- | --- | --- |
| 完成方式 | PLIC 中断 | 轮询状态寄存器 |
| 数据搬运 | FIFO 或 `sun6i-dma` 通道 | 内部描述符取指器，64 KiB 缓冲区 |
| 采样点 | 按速率从三个固定设置里选 | 三种模式、64 个延时，按板子实测 |
| 四线发送 | 控制器支持；出厂节点写的是 `spi-tx-bus-width = <1>` | 变体节点写 4，所以 1-4-4 DTR 读可用 |
| 焊盘 | `PC0`-`PC5` | `PC0`-`PC5` |
| 总线名 | `spi0.0` | `spi2.0` |

时序未知的板子上 SPI0 是更稳的选择：它有中断，50 MHz 下不需要任何调优，也是预编译镜像的配置。采样点测出来之后 SPIF 是更快的选择，而且它把通用控制器和它的 DMA 通道让给别的设备。

## 限制

| 限制 | 说明 |
| --- | --- |
| 没有中断 | 完成和错误靠轮询；一次长操作会让 CPU 忙等最多一秒 |
| 50 MHz 以下不调优 | 没有 `allwinner,tune-offset` 时控制器永远不超过 50 MHz |
| 一次一条命令 | 一段描述符一条命令；没有排队或预取 |
| 操作上限 64 KiB | `adjust_op_size` 把数据长度限制在内部缓冲区大小 |
| 调优区域 4 KiB | 调优参考是单次 4 KiB 读；数据贫乏的区域会让调优失败 |
| 总线号是 2 | 没有 `spiN` alias，所以即使只使能了它也显示成 `spi2` |
| 焊盘共享 | SPI0、SPIF 和 SMHC2 都用 `PC0`-`PC5`；设备树变体必须关掉其他 |
| 写和擦除慢 | 每次擦除都是轮询命令；大批 JFFS2 写入比 NAND 上慢得多 |
| 没有 XIP 窗口 | 线性窗口寄存器没动；所有读都走描述符 |

## 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 探测时报 "unsupported controller version 0x…" | 版本寄存器低于 `0x10002` | 这个驱动不支持那个控制器；改用 SPI0 |
| 出现 "no usable data at the tune offset" | `allwinner,tune-offset` 处的区域空白或内容单一 | 指到写过的数据上，例如 `0x0d1000`，或者删掉该属性 |
| `dmesg` 里出现 "no sample point at 100 MHz" | 板子在这个速率下时序收不拢 | 降低 `spi-max-frequency`，或者接受退回 50 MHz |
| Flash 消失、`spi2.0` 不在 | SPI0 和 SPIF 都占用焊盘，或者节点被禁用 | `&spi0`/`&spif` 只用其一，检查引脚组功能 |
| 根文件系统挂不上 | `mtd4` 没建出来，或者 squashfs 损坏 | 看 `/proc/mtd` 和 `mtd_debug info /dev/mtd4` |
| 一次失败之后每次访问都返回 `-EIO` | 复位失败，驱动锁定了 `failed` | 重启；控制器会一直禁用，直到下一次探测 |
| 读比预期慢很多 | 1-4-4 DTR 读没被选中 | 检查 Flash 节点里的 `spi-tx-bus-width = <4>` |
| 能读，但调优从不运行 | 所有读都小于 256 字节且是 SDR | 没有出错；批量读出现之前驱动就停在 50 MHz |

## 相关页面

- [SPI 与 DMA](spi.md)：通用控制器和 DMA 引擎。
- [Flash 布局](../../../boot/flash-layout.md)：偏移、大小和镜像的写入方式。
- [Linux 开发](../index.md)：这个驱动背后的内核与 Buildroot 配置。
- [常用命令](../apps/linux-commands.md)：板子上能用的 shell 命令，包括这里用到的工具。
