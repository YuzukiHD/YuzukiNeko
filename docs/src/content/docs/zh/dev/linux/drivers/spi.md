---
title: "SPI 与 DMA"
---

F101 的通用 SPI 控制器是 Allwinner 的经典设计：收发各一个 64 字节 FIFO、可编程时钟分频、四线和双线模式，以及一对 DMA 请求线。芯片上有两个控制器。板子用第一个访问那颗 16 MiB 的 NOR Flash，整个系统都在里面；由于 Flash 被持续读取，这些传输由 `sun6i-dma` 引擎搬运，而不是 CPU。

本章讲寄存器组和传输路径、两个控制器与 DMA 引擎的设备树、探测和 DMA 代码路径，以及 Flash 在用户态如何通过 MTD 出现。能在同一组焊盘上驱动同一颗 Flash 的专用控制器（SPIF）在 [SPIF - SPI NOR Flash](spif-nor.md) 里。

| 项目 | 内容 |
| --- | --- |
| 驱动 | `drivers/spi/spi-sun6i.c`，DMA 引擎 `drivers/dma/sun6i-dma.c` |
| Compatible | `allwinner,sun252i-f101-spi`、`allwinner,sun50i-r329-spi` |
| 基地址 | `0x04025000`（SPI0）、`0x04026000`（SPI1） |
| 寄存器窗口 | `0x1000` 字节 |
| 中断 | PLIC 15（SPI0）、PLIC 16（SPI1） |
| DMA 请求 | 22（SPI0）、23（SPI1），每个控制器一条线供两个方向共用 |
| 时钟 | `ahb`（`CLK_BUS_SPI0/1`）、`mod`（`CLK_SPI0/1`） |
| 复位 | `RST_BUS_SPI0/1` |
| Kconfig | `CONFIG_SPI`、`CONFIG_SPI_SUN6I`、`CONFIG_DMADEVICES`、`CONFIG_DMA_SUN6I` |
| 用户态 | 没有直接接口；Flash 以 `/dev/mtd*` 出现 |

## 控制器的工作原理

控制器是一个面向字节的引擎，收发 FIFO 分开。一次传输的准备工作是：写传输控制寄存器、FIFO 触发深度和计数，把最初的字节推进发送 FIFO，然后置交换位。接着控制器按时钟相位和极性在 SCK 上移出位，并把回来的数据填进接收 FIFO。传输完成时产生完成中断；FIFO 中断负责让流水线保持进料和排空。

寄存器来自 `spi-sun6i.c`：

| 偏移 | 寄存器 | 用途 |
| --- | --- | --- |
| `0x04` | GBL_CTL | 总线使能（bit 0）、主机模式（bit 1）、发送暂停（bit 7）、软复位（bit 31） |
| `0x08` | TFR_CTL | CPHA、CPOL、CS 极性与电平、LSB first、空字节模式、采样模式、交换开始 |
| `0x10` | INT_CTL | 接收就绪、发送空、接收溢出和传输完成的使能 |
| `0x14` | INT_STA | 同样的四个位作为状态；写 1 清除 |
| `0x18` | FIFO_CTL | 收发触发深度、DMA 请求使能、FIFO 复位 |
| `0x1c` | FIFO_STA | bit 7:0 是接收 FIFO 计数，bit 23:16 是发送 FIFO 计数 |
| `0x24` | CLK_CTL | CDR1/CDR2 分频和 DRS 选择；F101 变体不用 |
| `0x30` | BURST_CNT | 突发数，写入的是传输长度 |
| `0x34` | XMIT_CNT | 要发送的字节数 |
| `0x38` | BURST_CTL_CNT | 突发控制：单线计数、双线或四线使能 |
| `0x200` | TXDATA | 发送 FIFO |
| `0x300` | RXDATA | 接收 FIFO |

总线模式在传输控制寄存器里。`CPHA`（bit 0）和 `CPOL`（bit 1）来自 `spi_device` 的 mode。`SPOL`（bit 2）反转片选极性，`FBS`（bit 12）选择 LSB first，`CS_MANUAL`（bit 6）让驱动自己控制 `CS_LEVEL`（bit 7），`XCH`（bit 31）启动传输。`DHB`（bit 8）丢弃收到的字节，这样只发的传输不会用垃圾填满接收 FIFO；`tfr->rx_buf` 为 NULL 时驱动会置它。

`SDM`（bit 13）和 `SDC`（bit 11）选择采样点。这是高频下最要紧的部分，因为控制器没有延迟线：它只能在正常时钟沿、晚半个周期或晚一个周期采样。`has_clk_ctl` 为假（F101 的配置），驱动根据实际拿到的时钟来设置：

| 实际 SCK | `SDM` | `SDC` | 采样 |
| --- | --- | --- | --- |
| 不超过 24 MHz | 1 | 0 | 正常采样模式 |
| 24 到 80 MHz | 0 | 0 | 延迟半周期采样模式 |
| 80 MHz 及以上 | 0 | 1 | 延迟一周期采样模式 |

这些名字是驱动自己的说法。板子请求 100 MHz，所以只要 CCU 能产生这个速率就会用一周期设置；Flash 的输出延时和板子的走线长度决定了这是对的选择，这也是 `spi-max-frequency` 属于板级属性的原因。

片选由控制器驱动。`num_chipselect` 是 4，`use_gpio_descriptors` 让核心先找 `cs-gpios`；板子没有声明，所以用控制器原生的片选输出。`sun6i_spi_set_cs()` 只选择片选号并拉高或拉低 `CS_LEVEL`，不去拨 GPIO。`XCH` 每次传输只置一次，所以整条消息期间 CS 一直有效，包括地址阶段和空周期。

### FIFO 与中断行为

F101 变体的 FIFO 深度是 64 字节（`SUN8I_FIFO_DEPTH`，与 H3、R329 相同）。触发深度取决于路径：

- **PIO。** 驱动把触发设成深度的四分之三，即 48 字节，并且只在传输长度超过 FIFO 时才使能接收就绪和发送空中断。短传输整体放进 FIFO，只靠一次传输完成中断就结束。
- **DMA。** 触发设成深度的一半，即 32 字节，这个值同时用作 DMA 突发长度。两个方向的 DMA 请求使能按方向设置。

中断处理是 `sun6i_spi_handler()`。传输完成时清位并完成 `sspi->done`。接收就绪时用 `sun6i_spi_drain_fifo()` 把接收 FIFO 排空，然后再清位，这样在排空和清位之间到达的字节不会丢。发送空时用 `sun6i_spi_fill_fifo()` 续填缓冲区，填完就关掉该中断。先服务、后清位的顺序是有意的，注释里也重复说明了。

### 时钟

`mod` 模块时钟由 SPI0 的 `0x0940`、SPI1 的 `0x0944` 处的 CCU 产生。它是在 `dcxo24M`、`pll-peri-1x`、`pll-peri-2x` 和两个音频 PLL 分频之间的 mux，后面跟 `M` 分频（1 到 16）和 `P` 分频（1、2、4、8），bit 31 是门控。驱动完全不碰分频寄存器：`has_clk_ctl = false` 意味着它调用 `clk_set_rate(sspi->mclk, tfr->speed_hz)`，再把 `clk_get_rate()` 读回 `tfr->effective_speed_hz`。父时钟和分频由时钟框架挑选，采样模式根据读回来的速率决定，而不是请求的速率。

驱动声明 `max_speed_hz = 100 MHz`、`min_speed_hz = 3 kHz`，只支持每字 8 位、四个片选，以及变体配置里的四线和双线模式位。

节点里的 `clock-frequency = <100000000>` 属性 `spi-sun6i` 并不读；主机上限是驱动里的常量，每次传输的速率来自子设备的 `spi-max-frequency`。这个属性是留给文档和节点的其他使用者看的，不是驱动的输入。

因为速率按传输设置，同一控制器上两个 `spi-max-frequency` 不同的设备会在消息之间改变 CCU 时钟，采样模式每次都会重算。这也是采样模式从 `effective_speed_hz` 推导、而不是在探测时缓存的原因。

单次传输上限是 `SUN6I_MAX_XFER_SIZE - 1`，即 16 MiB 减一字节。

## DMA 引擎

`0x03002000` 处的 `sun6i-dma` 是一个基于描述符的引擎，有 12 个通道寄存器和 64 条请求线，设备树只暴露八个通道：

```text
dma: dma-controller@3002000 {
	compatible = "allwinner,sun252i-f101-dma",
		     "allwinner,sun20i-d1-dma";
	reg = <0x0 0x03002000 0x0 0x1000>;
	interrupts-extended = <&plic 50 IRQ_TYPE_LEVEL_HIGH>;
	clocks = <&ccu CLK_BUS_DMA>,
		 <&ccu CLK_BUS_DMA_M>;
	clock-names = "bus", "mbus";
	resets = <&ccu RST_BUS_DMA>;
	dma-channels = <8>;
	dma-requests = <64>;
	#dma-cells = <1>;
};
```

只有 0 到 7 号通道会报中断；这个块有 12 个通道的寄存器，但上面四个无法报告完成，所以 `sun252i_f101_dma_cfg` 配 `dma-channels = <8>` 把驱动限制在能用的那些上。`sun6i-dma.c` 里探测处的注释写明了这一点。

F101 的配置与 H3 有两处不同，都在 `sun6i_enable_clock_autogate_f101()` 里：

- 它往 `0x28` 的门控寄存器写 `0x7`。这是三个自动时钟门控位，置位表示关掉自动门控，和厂商的初始化一致。被门控的通道永远完不成传输。
- 它把全部通道位写进 `0x20` 的安全寄存器，把所有通道标成非安全，同样与厂商初始化一致。

驱动注册的能力有内存到内存拷贝、从机 SG 和循环传输；`copy_align` 是 4 字节，最大段是 32 MiB 减一，支持的地址宽度是 1、2、4、8 字节，突发长度是 1、4、8、16。

### SPI 如何使用它

`spi-sun6i.c` 在探测时按名字申请 `"rx"` 和 `"tx"` 通道。两个设备树项对 SPI0 都指向请求 22，对 SPI1 都是 23：每个控制器一条请求线，两个方向共用。只有 `xfer->len > fifo_depth` 时 `sun6i_spi_can_dma()` 才把传输交给引擎，所以 64 字节以内一律走 PIO。

`sun6i_spi_prepare_dma()` 构造从机分散聚集描述符。接收侧配成从 `RXDATA` 做 `DMA_DEV_TO_MEM`，当 `dma_rx_word` 置位且每个 scatterlist 项的地址和长度都按 4 字节对齐时用 4 字节宽度，否则退回 1 字节访问。发送侧始终是缓冲区到 `TXDATA` 的 4 字节宽度。两边最大突发都是 8。接收描述符挂一个完成 `sspi->dma_rx_done` 的回调，因为 SPI 的传输完成中断可能在最后一个接收突发还在路上时就到了；`sun6i_spi_transfer_one()` 在返回前会等这第二个完成。

任一描述符准备失败时，驱动终止已经提交的接收通道，返回错误，`transfer_one()` 打印 "prepare DMA failed"。等待超时则打印传输长度、速率和经过的毫秒数，终止两个通道并返回 `-ETIMEDOUT`。

### 缓存一致性

SoC 总线声明为 `dma-noncoherent`，所以缓冲区的映射很重要。SPI 核心在调用驱动之前用 `dma_map_sg()` 映射传输缓冲区，之后解除映射；在这颗芯片上，缓存维护就是在这些映射调用里做的。DMA 引擎的描述符链表放在来自 DMA 池的内存里，SPI 控制器自己的寄存器访问是 posted write；往 FIFO 写数据和置 `XCH` 之间不需要额外的刷新。改 DMA 设置时，保持描述符提交在 `dma_async_issue_pending()` 之前，现有代码就是这么做的。

## 设备树

两个控制器是同一个模板：

```text
spi0: spi@4025000 {
	#address-cells = <1>;
	#size-cells = <0>;
	compatible = "allwinner,sun252i-f101-spi",
		     "allwinner,sun50i-r329-spi";
	reg = <0x0 0x04025000 0x0 0x1000>;
	interrupts-extended = <&plic 15 IRQ_TYPE_LEVEL_HIGH>;
	clocks = <&ccu CLK_BUS_SPI0>,
		 <&ccu CLK_SPI0>;
	clock-names = "ahb", "mod";
	resets = <&ccu RST_BUS_SPI0>;
	dmas = <&dma 22>, <&dma 22>;
	dma-names = "rx", "tx";
	clock-frequency = <100000000>;
	status = "disabled";
};
```

| 标签 | 节点 | 基地址 | PLIC | DRQ | 引脚 | 板级状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `spi0` | `spi@4025000` | `0x04025000` | 15 | 22 | `PC0`-`PC5` | 使能，NOR Flash |
| `spi1` | `spi@4026000` | `0x04026000` | 16 | 23 | `PD0`-`PD3` | 禁用 |

板级文件使能 SPI0，把 Flash 放在 0 号片选上：

```text
&spi0 {
	pinctrl-names = "default";
	pinctrl-0 = <&spi0_pc_pins>;
	status = "okay";

	flash@0 {
		compatible = "jedec,spi-nor";
		reg = <0>;
		spi-max-frequency = <100000000>;
		spi-rx-bus-width = <4>;
		spi-tx-bus-width = <1>;

		#include "sun252i-f101-nor-partitions.dtsi"
	};
};
```

引脚组覆盖全部六个 `PC` 焊盘：

```text
spi0_pc_pins: spi0-pc-pins {
	pins = "PC0", "PC1", "PC2", "PC3", "PC4", "PC5";
	function = "spi0";
};
```

`spi1` 在 `PD0`-`PD3` 上有自己的组（`spi1_pd_pins`，功能 `spi1`），但板子从不使能它。`PC` 焊盘在 SPI0、SPIF 控制器和 SMHC2 eMMC 控制器之间共享；三个组列的都是同样六个引脚，同一时间只能路由一个功能。设备树变体 `sun252i-f101-yuzukineko-spif.dts` 关掉 SPI0，在同一组焊盘上使能 SPIF。

Flash 节点是 `jedec,spi-nor`，六个分区从 `sun252i-f101-nor-partitions.dtsi` 引入：

| MTD | 标签 | 偏移 | 大小 | 访问 |
| --- | --- | --- | --- | --- |
| `mtd0` | `bootloader` | `0x000000` | 64 KiB | 只读 |
| `mtd1` | `dtb` | `0x010000` | 256 KiB | 只读 |
| `mtd2` | `opensbi` | `0x050000` | 512 KiB | 只读 |
| `mtd3` | `kernel` | `0x0d0000` | 6 MiB | 只读 |
| `mtd4` | `rootfs` | `0x6d0000` | 8 MiB 加 192 KiB | 只读 |
| `mtd5` | `overlay` | `0xf00000` | 1 MiB | 可写 |

绑定文件是控制器的 `Documentation/devicetree/bindings/spi/allwinner,sun6i-a31-spi.yaml` 和 Flash 的 `Documentation/devicetree/bindings/mtd/jedec,spi-nor.yaml`。控制器绑定要求 `reg`、`interrupts`、`clocks` 和 `clock-names`，F101 的 compatible 与 `allwinner,sun50i-r329-spi` 兜底项列在一起。

## Kconfig

```text
CONFIG_SPI=y
CONFIG_SPI_SUN6I=y
CONFIG_DMADEVICES=y
CONFIG_DMA_SUN6I=y
```

`CONFIG_SPI` 是总线核心，`CONFIG_SPI_SUN6I` 是控制器（依赖 `ARCH_SUNXI` 和 `RESET_CONTROLLER`），`CONFIG_DMADEVICES` 是 DMA 引擎框架，`CONFIG_DMA_SUN6I` 是 sun6i 引擎，它会选中 `DMA_ENGINE` 和 `DMA_VIRTUAL_CHANNELS`。板级 defconfig 四项都设了，另外还有 Flash 侧的 `CONFIG_MTD`、`CONFIG_MTD_BLOCK`、`CONFIG_MTD_OF_PARTS` 和 `CONFIG_MTD_SPI_NOR`。

`CONFIG_SPI_SPIDEV` *没有*使能，所以即使某个节点写了 spidev 兼容字符串，也不会有 `/dev/spidev*`。

## 驱动内部

### 探测路径

`sun6i_spi_probe()`：

1. `devm_spi_alloc_host()` 和 `spi_controller_get_devdata()` 分配 host 和驱动状态。
2. 映射寄存器窗口，用 `devm_request_irq()` 申请中断，处理函数是 `sun6i_spi_handler()`。
3. 按 compatible 选变体配置，再填 host 模板：`max_speed_hz`、`min_speed_hz`、`use_gpio_descriptors`、`set_cs`、`transfer_one`、`num_chipselect = 4`、`mode_bits`、`bits_per_word_mask = SPI_BPW_MASK(8)`、`auto_runtime_pm` 和 `max_transfer_size`。
4. 取 `ahb` 和 `mod` 时钟以及独占复位。
5. 先申请 `tx` 通道，再申请 `rx`。任一返回 `-EPROBE_DEFER` 都会向上传递；其他错误只打警告并把该通道留成 NULL。
6. 两个通道都在时，记下 FIFO 地址（`mem->start + 0x200` 和 `+ 0x300`）并装上 `can_dma`。
7. 用 `sun6i_spi_runtime_resume()` 让设备上电，设两秒自动挂起延时，注册控制器。

`use_gpio_descriptors` 标志意味着核心会找 `cs-gpios`；板子没声明，所以用控制器原生的片选输出，由 `sun6i_spi_set_cs()` 驱动传输控制寄存器里的 `CS_LEVEL`。

### 传输路径

`sun6i_spi_transfer_one()` 就是整条数据路径。它清挂起中断、复位两个 FIFO、设置触发深度、设置模式位、设置计数，填 FIFO 或准备 DMA，使能中断，然后置 `XCH` 启动。接着在 `sspi->done` 上等待，超时时间由 `spi_controller_xfer_timeout()` 算出。完成时排空 FIFO（PIO）或等待接收 DMA 回调（DMA），关中断，返回。

时钟也在同一个函数里设置：要么 `clk_set_rate()` 加采样模式位，要么在 `has_clk_ctl` 为真时写 CDR1/CDR2 分频。F101 走第一条分支。

### 错误路径

超过 16 MiB 减一的传输在编程任何寄存器之前就以 `-EINVAL` 拒绝。DMA 准备失败会打警告并返回错误；调用者看到的是一条失败的 SPI 消息。超时会打印长度、速率和时长，终止所有 DMA 通道并返回 `-ETIMEDOUT`；随后 SPI 核心让这条消息失败。`sun6i_spi_runtime_suspend()` 断言复位并关掉两个时钟，resume 反过来，所以恢复失败的设备在下一次传输时失败，而不是去碰一个没时钟的模块。

驱动不会因为一次传输失败而复位控制器。下一次 `transfer_one()` 一上来就写两个 FIFO 复位，所以重试的消息从干净的 FIFO 开始；如果失败是总线问题而不是 FIFO 问题，重试会以同样的方式失败。

### 运行时电源管理

控制器空闲两秒后自动挂起。挂起后的第一次传输经过 `sun6i_spi_runtime_resume()`，它重新打开两个时钟、解除复位，并往 `GBL_CTL` 写主机模式和发送暂停。FIFO 和传输寄存器每次传输都重新编程，所以没有别的东西需要恢复。

## 用户态接口

总线本身没有字符设备。Flash 是一个 MTD 设备，有用的接口是：

| 路径 | 含义 |
| --- | --- |
| `/dev/mtd0` … `/dev/mtd5` | 各分区的字符设备，用于 `mtd_debug` 和 `flash_erase` |
| `/dev/mtdblock0` … `/dev/mtdblock5` | 块设备；`mtdblock4` 是挂载的根文件系统 |
| `/proc/mtd` | 分区表：大小、擦除大小和标签 |
| `/sys/bus/spi/devices/spi0.0` | 作为 SPI 设备的 Flash |
| `/sys/class/spi_master/spi0` | 控制器；`spi0` 来自 `spi0` alias |

总线号是 `spi0`，因为 SoC 设备树的 aliases 里有 `spi0 = &spi0;`。设备名是控制器名加片选号，所以是 `spi0.0`。MTD 主设备叫 `spi0.0` 也是同一个原因。

## 工作示例

### 示例 1：启动时的分区表

```sh
dmesg | grep -A7 'MTD partitions'
cat /proc/mtd
```

代表性输出：

```text
Creating 6 MTD partitions on "spi0.0":
0x000000000000-0x000000010000 : "bootloader"
0x000000010000-0x000000050000 : "dtb"
0x000000050000-0x0000000d0000 : "opensbi"
0x0000000d0000-0x0000006d0000 : "kernel"
0x0000006d0000-0x000000f00000 : "rootfs"
0x000000f00000-0x000001000000 : "overlay"
dev:    size   erasesize  name
mtd0: 00010000 00001000 "bootloader"
mtd1: 00040000 00001000 "dtb"
mtd2: 00080000 00001000 "opensbi"
mtd3: 00600000 00001000 "kernel"
mtd4: 00830000 00001000 "rootfs"
mtd5: 00100000 00001000 "overlay"
```

第一段来自 `drivers/mtd/mtdpart.c` 的 `add_mtd_partitions()`，它在注册每个分区时打印偏移和标签。第二段是 `/proc/mtd`，由 `mtd_proc_show()` 按标签、大小、擦除大小格式化。擦除大小是 4 KiB，因为 `CONFIG_MTD_SPI_NOR_USE_4K_SECTORS` 默认为 yes，而 P25Q128H 支持 4 KiB 扇区擦除。

### 示例 2：查看并读取分区

```sh
mtd_debug info /dev/mtd5
mtd_debug read /dev/mtd0 0 4096 /tmp/head.bin
```

代表性输出：

```text
mtd.type = MTD_NORFLASH
mtd.flags = MTD_CAP_NORFLASH
mtd.size = 1048576 (1K)
mtd.erasesize = 4096 (4K)
mtd.writesize = 1 
mtd.oobsize = 0 
regions = 1

region[0].offset = 0x00000000
region[0].erasesize = 4096 (4K)
region[0].numblocks = 256
region[0].regionindex = 0

Copied 4096 bytes from address 0x00000000 in flash to /tmp/head.bin
```

`mtd_debug` 打印大小有它自己的怪癖：`printsize()` 一直除到值小于 1024，然后用二进制后缀打印最后的商，所以 1 MiB 显示成 `1048576 (1K)`，4096 显示成 `4096 (4K)`。flags 行是 `MTD_CAP_NORFLASH`，因为 `mtd5` 是唯一没有 `read-only` 属性的分区。读 `mtd0` 同理；内容就是 SyterKit 镜像开头的那些字节，命令本身的输出是那行 "Copied"。

### 示例 3：控制器和设备在 sysfs 里的位置

```sh
ls /sys/bus/spi/devices/
cat /sys/bus/spi/devices/spi0.0/modalias
```

代表性输出：

```text
spi0.0
spi:spi-nor
```

设备目录名是 `spi0.0`，即 0 号控制器 0 号片选。`modalias` 是 `spi:spi-nor`，由 `jedec,spi-nor` 兼容字符串推导而来，MTD 驱动就是靠它绑定上的。

## 限制

| 限制 | 说明 |
| --- | --- |
| 没有 spidev | `CONFIG_SPI_SPIDEV` 没开，所以没有 `/dev/spidev*` |
| 只接了一个片选 | 只有 CS0 通到 Flash；`num_chipselect` 是 4，但其余引脚没有引出 |
| `PC` 焊盘共享 | SPI0、SPIF 和 SMHC2 都用 `PC0`-`PC5`；同时只能有一个生效 |
| SPI1 未使用 | 它的引脚在 `PD0`-`PD3`，板子从不使能 |
| 只支持 8 位字 | `bits_per_word_mask` 是 `SPI_BPW_MASK(8)` |
| 单次传输 16 MiB 上限 | 单条传输限制在 `0xffffff - 1` 字节 |
| Flash 上没有四线发送 | 出厂 Flash 节点写的是 `spi-tx-bus-width = <1>`，所以不会提供四线地址读 |
| 65 字节以下走 PIO | 64 字节以内的传输从不使用 DMA |

## 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `/sys/bus/spi/devices` 里没有 `spi0.0` | 控制器或 Flash 节点被禁用，或缺时钟/复位 | 检查 `&spi0` 是 `okay`，看 `dmesg` 的探测错误 |
| `dmesg` 里出现 "timeout transferring N bytes@Hz" | 对这块板子时钟太快，或 Flash 没响应 | 降低 `spi-max-frequency`；检查由时钟推导出的采样模式 |
| 出现 "prepare DMA failed" | DMA 通道拿不到或配不好 | 检查 `dma` 节点状态，确认 `CONFIG_DMA_SUN6I` 已开 |
| 能读 Flash，写失败 | 分区声明为 `read-only` | 只写 `overlay`，或者去掉分区的 `read-only` |
| 没有 `/dev/spidev0.0` | `CONFIG_SPI_SPIDEV` 没开 | 在内核配置里打开，并在空闲片选上加一个 spidev 节点 |
| 100 MHz 下从 Flash 读出乱码 | 采样模式或板级时序 | 把频率降到 50 MHz 对比 |
| SPI0 能用但 SPIF 不能用 | 两个引脚组都占用 `PC0`-`PC5` | `&spi0` 和 `&spif` 只使能一个 |

## 相关页面

- [SPIF - SPI NOR Flash](spif-nor.md)：专用控制器和采样点调优。
- [Flash 布局](../../../boot/flash-layout.md)：分区里是什么，以及怎么写入。
- [Linux 开发](../index.md)：使能这些驱动的内核配置。
- [常用命令](../apps/linux-commands.md)：板子上能用的 shell 命令，包括这里用到的工具。
