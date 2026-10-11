---
title: "SPI"
---

F101 有 2 个 SPI 控制器，在 Zephyr 里是 `spi0` 和 `spi1`，接口是标准的 `<zephyr/drivers/spi.h>`，驱动是 `drivers/spi/spi_sunxi.c`，另外有一个扩展头文件 `<zephyr/drivers/spi/spi_sunxi.h>`。

| 项目 | 内容 |
| --- | --- |
| 设备 | `spi0`（PC0…PC5，板载 SPI NOR）、`spi1`（PD0…PD5，和 LCD 引脚共用） |
| 角色 | 只做主机 |
| 字长 | 8 位 |
| 模式 | 4 种 SPI 模式（CPOL、CPHA），可选低位在前 |
| 片选 | 硬件片选 0…3，或者设备树里的 `cs-gpios` |
| 数据线 | 单线；打开 `CONFIG_SPI_EXTENDED_MODES` 后读数据阶段可以用四线 |
| 频率 | 3 kHz 以下返回 `-EINVAL`；24 MHz 以内用控制器自己的分频；更高的由 PLL 分频得到 |
| 传输方式 | 轮询；256 字节及以上、64 字节（缓存行）对齐的读缓冲走 DMA |
| 不支持 | 从机模式、环回（`SPI_MODE_LOOP`）、`SPI_HOLD_ON_CS`、非 8 位字长 |

## 设备树

| 文件 | 作用 |
| --- | --- |
| `dts/bindings/spi/allwinner,sunxi-spi.yaml` | 绑定：规定 `allwinner,sunxi-spi` 节点的属性 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 设备树：`spi0`、`spi1`，默认 `disabled` |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | 板级设备树：引脚组，打开 `spi0` |

### SoC 设备树：sun252i_f101.dtsi

`spi0` 和 `spi1` 只有寄存器、时钟、复位、DMA 通道不同。下面是 `spi0`：

```c
spi0: spi@4025000 {
	/* 匹配驱动 spi_sunxi.c 里的 DT_DRV_COMPAT allwinner_sunxi_spi */
	compatible = "allwinner,sunxi-spi";

	/* 子节点（从设备）用 1 个格子的地址，也就是片选号 */
	#address-cells = <1>;
	#size-cells = <0>;

	/* 寄存器窗口：基址 0x04025000，长度 0x400 */
	reg = <0x04025000 0x400>;

	/* 模块时钟和总线时钟，顺序和 clock-names 对应 */
	clocks = <&cctl CLK_SPI0>, <&cctl CLK_BUS_SPI0>;
	clock-names = "mod", "bus";

	/* 总线复位 */
	resets = <&rctl RST_BUS_SPI0>;

	/* 初始化时使用的时钟频率 */
	clock-frequency = <10000000>;

	/* 模块时钟寄存器在 CCU 里的偏移 */
	clock-reg = <0x940>;

	/* 接收 DMA：DMA 控制器的 7 号通道，SPI 接收 FIFO 的请求线是 22 */
	dmas = <&dma 7>;
	dma-names = "rx";
	dma-slot = <22>;

	status = "disabled";
};
```

| 节点 | 标签 | 寄存器 | 模块时钟 | `clock-reg` | DMA 通道 | 请求线 |
| --- | --- | --- | --- | --- | --- | --- |
| `spi@4025000` | `spi0` | `0x04025000` | `CLK_SPI0` | `0x940` | 7 | 22 |
| `spi@4026000` | `spi1` | `0x04026000` | `CLK_SPI1` | `0x944` | 8 | 23 |

### 板级设备树：yuzukineko.dts

```c
&pio {
	/* SPI0 在 PC0…PC5，复用功能 3。板载 NOR 闪存和 SPIF 控制器用的是同一组脚 */
	spi0_pins: spi0_pins {
		spi0_data {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PC, 0, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PC, 4, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PC, 2, 3)>;
			bias-disable;
		};
		spi0_control {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PC, 1, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PC, 3, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PC, 5, 3)>;
			bias-pull-up;
		};
	};

	/* SPI1 在 PD0…PD5，复用功能 3：PD0 CS0，PD1 CLK，PD2 MOSI，PD3 MISO，PD4 HOLD，PD5 WP */
	spi1_pins: spi1_pins {
		spi1_data {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 1, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 2, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 3, 3)>;
			bias-disable;
		};
		spi1_control {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 0, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 4, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 5, 3)>;
			bias-pull-up;
		};
	};
};

&spi0 {
	status = "okay";
	pinctrl-0 = <&spi0_pins>;
	pinctrl-names = "default";
};
```

`spi1` 在本板没有打开：PD0…PD5 被触摸屏的 I2C、复位、中断脚和 LED、功放使能占用了。

### 接一个 SPI 设备

给一个从设备写一个子节点，`reg` 是片选号，`spi-max-frequency` 是它能接受的最高频率。例如把一个 SPI NOR 接在 `spi0` 的片选 0 上：

```c
&spi0 {
	status = "okay";
	pinctrl-0 = <&spi0_pins>;
	pinctrl-names = "default";

	flash0: flash@0 {
		compatible = "jedec,spi-nor";
		reg = <0>;
		spi-max-frequency = <24000000>;
		jedec-id = [85 20 18];
		size = <DT_SIZE_M(128)>;	/* 以位为单位：16 MiB */
	};
};
```

使用硬件片选就不要写 `cs-gpios`。要用 GPIO 当片选，在控制器节点里写 `cs-gpios = <&gpiod 4 GPIO_ACTIVE_LOW>;`，子节点的 `reg` 是它在列表里的序号，驱动就用软件控制这个脚。

### 绑定：allwinner,sunxi-spi.yaml

```yaml
# Copyright (c) 2026 Yuzuki Tsuru
# SPDX-License-Identifier: Apache-2.0

description: Allwinner sunxi SPI controller

compatible: "allwinner,sunxi-spi"

include: [spi-controller.yaml, pinctrl-device.yaml]

properties:
  reg:
    required: true

  clocks:
    required: true

  clock-names:
    required: true

  resets:
    type: phandle-array
    required: true

  clock-frequency:
    type: int
    required: true

  clock-reg:
    type: int
    required: true

  dmas:
    description: |
      Optional DMA channel for the receive data of long reads ("rx"). The
      FIFO is drained by the DMA in 32 bit units; what is left below the
      FIFO trigger level at the end of a transfer is read by the CPU.

  dma-names:
    description: '"rx"'

  dma-slot:
    type: int
    description: request line (DRQ) of the SPI receive FIFO
```

| 属性 | 必填 | 含义 |
| --- | --- | --- |
| `reg` | 是 | 寄存器窗口 |
| `clocks`、`clock-names` | 是 | 模块时钟 `mod` 和总线时钟 `bus` |
| `resets` | 是 | 总线复位 |
| `clock-frequency` | 是 | 初始化时的时钟频率 |
| `clock-reg` | 是 | 模块时钟寄存器在 CCU 里的偏移 |
| `dmas`、`dma-names`、`dma-slot` | 否 | 接收 DMA；不写则所有读都由 CPU 完成 |
| `cs-gpios` | 否 | 来自 `spi-controller.yaml`，用 GPIO 做片选 |
| `pinctrl-0`、`pinctrl-names` | 否 | 引脚，见 [GPIO 页的 pinctrl 一节](gpio.md#引脚复用pinctrl) |

## Kconfig

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `CONFIG_SPI` | 板级 defconfig 里是 `y` | 打开 SPI 子系统 |
| `CONFIG_SPI_SUNXI` | `y`（依赖 `DT_HAS_ALLWINNER_SUNXI_SPI_ENABLED`） | 编译这个驱动，并选中 `CONFIG_PINCTRL` |
| `CONFIG_SPI_SUNXI_INIT_PRIORITY` | 81 | 驱动的初始化优先级 |
| `CONFIG_SPI_SUNXI_DMA` | `y`（依赖 `DMA`） | 长读用 DMA |
| `CONFIG_SPI_SUNXI_DMA_MIN_LEN` | 256 | 至少读多少字节才用 DMA |
| `CONFIG_SPI_EXTENDED_MODES` | 否 | 打开后 `SPI_LINES_QUAD` 可用：命令走一根线，读数据走四根线 |

## 接口详解

下面每个接口一个小标题：原型、驱动的行为、示例函数和它在板子上的输出。演示在 `spi0` 上读板载的 SPI NOR 闪存（16 MiB，JEDEC ID `85 20 18`）；闪存里放着启动加载器，所以只发读命令，不发写和擦除。示例来自文末的[完整演示程序](#完整演示程序)，里面的 `err()` 把返回值转成名字。

所有示例用同一个函数生成 `struct spi_config`：片选 0（硬件片选脚），8 位字，高位在前。

```c
/* chip select 0 (the hardware CS pin), mode 0, 8 bit words, most significant bit first */
static struct spi_config cfg_at(uint32_t hz, uint32_t mode)
{
	return (struct spi_config){
		.frequency = hz,
		.operation = SPI_OP_MODE_MASTER | SPI_WORD_SET(8) | mode,
		.slave = 0,
	};
}
```

### spi_transceive

```c
int spi_transceive(const struct device *dev, const struct spi_config *config,
                   const struct spi_buf_set *tx_bufs, const struct spi_buf_set *rx_bufs);
```

`tx_bufs` 和 `rx_bufs` 总长度是否相等，决定驱动怎么走：

| tx 总长度 | rx 总长度 | 传输 |
| --- | --- | --- |
| 等于 | 等于 | 全双工：每发出一个字节就收进一个字节，两边一一对应 |
| 不等于 | 不等于 | 命令加数据：先发 tx，发 tx 的同时收到的字节丢掉；`rx` 里是发完 tx 之后的 rx 个字节 |

SPI NOR 一类“发命令、读数据”的器件用第二种，一次调用完成，片选在整个过程里保持有效。一次调用最多传 16777215（0xFFFFFF）个字节，超过返回 `-EMSGSIZE`。

#### 示例：命令加数据

```c
/*
 * spi_transceive with a command phase: tx is 1 byte, rx is 3 bytes. When the two lengths differ the
 * driver throws away what comes in while the tx bytes go out, so rx[0] is the first byte after the
 * command. (With the same length on both sides it is a plain full duplex transfer, see below.)
 */
static void demo_command_read(void)
{
	struct spi_config cfg = cfg_at(1000000, 0);
	uint8_t cmd = CMD_JEDEC_ID;
	uint8_t id[3] = { 0 };
	struct spi_buf tx_buf = { .buf = &cmd, .len = 1 };
	struct spi_buf rx_buf = { .buf = id, .len = sizeof(id) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	int ret;

	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[command] JEDEC ID (tx 1 byte, rx 3 bytes)   = %s: %02x %02x %02x\n", err(ret), id[0],
	       id[1], id[2]);
}
```

```text
[command] JEDEC ID (tx 1 byte, rx 3 bytes)   = 0: 85 20 18
```

#### 示例：全双工

收发长度相等，`rx[0]` 是发命令时收到的字节，不是数据。要读状态寄存器这样的 1 个字节，就双向各发 2 个字节，答案在第二个。

```c
/*
 * spi_transceive with equal lengths is a plain full duplex transfer: every tx byte clocks one rx
 * byte in, so the byte received while the command goes out is not data.
 */
static void demo_full_duplex(void)
{
	struct spi_config cfg = cfg_at(1000000, 0);
	uint8_t out[4] = { CMD_JEDEC_ID, 0, 0, 0 };
	uint8_t in[4] = { 0xaa, 0xaa, 0xaa, 0xaa };
	struct spi_buf tx_buf = { .buf = out, .len = sizeof(out) };
	struct spi_buf rx_buf = { .buf = in, .len = sizeof(in) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	int ret;

	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[duplex] JEDEC ID (4 bytes both ways)         = %s: %02x %02x %02x %02x\n", err(ret),
	       in[0], in[1], in[2], in[3]);

	/* a command and one byte of answer: two bytes both ways, the answer is the second one */
	out[0] = CMD_READ_STATUS;
	out[1] = 0;
	tx_buf.len = 2;
	rx_buf.len = 2;
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[duplex] status register (2 bytes both ways)  = %s: 0x%02x\n", err(ret), in[1]);
}
```

```text
[duplex] JEDEC ID (4 bytes both ways)         = 0: ff 85 20 18
[duplex] status register (2 bytes both ways)  = 0: 0x00
```

#### 示例：长读和 DMA

读缓冲至少 `CONFIG_SPI_SUNXI_DMA_MIN_LEN`（256）字节、地址按 64 字节（缓存行）对齐时，数据由 DMA 搬运；否则由 CPU 从接收 FIFO 里读。两种方式读到的数据一样。下面读 4 KiB，并换几个时钟频率看耗时。

```c
/* A longer read: the first 16 bytes of the flash, and the speed at several clocks.
 * Reads of 256 bytes or more into a 64 byte (cache line) aligned buffer go through the DMA controller.
 */
static void demo_read_flash(void)
{
	static uint8_t page[4096] __aligned(64);
	static uint8_t first[4096];
	struct spi_config cfg = cfg_at(1000000, 0);
	uint8_t cmd[4] = { CMD_READ_DATA, 0, 0, 0 };		/* 24 bit address 0 */
	struct spi_buf tx_buf = { .buf = cmd, .len = sizeof(cmd) };
	struct spi_buf rx_buf = { .buf = page, .len = sizeof(page) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	static const uint32_t rates[] = { 1000000, 6000000, 24000000, 48000000 };
	int ret;

	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[read] 4096 bytes at address 0 at 1 MHz        = %s\n", err(ret));
	printk("[read] first 16 bytes:");
	for (int i = 0; i < 16; i++) {
		printk(" %02x", page[i]);
	}
	printk("\n");
	memcpy(first, page, sizeof(page));

	for (int i = 0; i < ARRAY_SIZE(rates); i++) {
		cfg = cfg_at(rates[i], 0);
		memset(page, 0, sizeof(page));
		int64_t t0 = k_uptime_ticks();

		ret = spi_transceive(spi, &cfg, &tx, &rx);
		int64_t us = k_ticks_to_us_near64(k_uptime_ticks() - t0);

		printk("[read] 4096 bytes at %2u MHz = %s, %lld us, %s\n", rates[i] / 1000000, err(ret),
		       us, memcmp(first, page, sizeof(page)) == 0 ? "same data" : "DIFFERENT data");
	}

	/* a buffer that is not 64 byte aligned is read by the CPU */
	static uint8_t odd[1 + 512] __aligned(64);

	rx_buf.buf = odd + 1;
	rx_buf.len = 512;
	cfg = cfg_at(24000000, 0);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[read] 512 bytes into an unaligned buffer      = %s, %s\n", err(ret),
	       memcmp(first, odd + 1, 512) == 0 ? "same data" : "DIFFERENT data");
}
```

```text
[read] 4096 bytes at address 0 at 1 MHz        = 0
[read] first 16 bytes: ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff
[read] 4096 bytes at  1 MHz = 0, 87500 us, same data
[read] 4096 bytes at  6 MHz = 0, 21900 us, same data
[read] 4096 bytes at 24 MHz = 0, 1400 us, same data
[read] 4096 bytes at 48 MHz = 0, 800 us, same data
[read] 512 bytes into an unaligned buffer      = 0, same data
```

闪存起始地址是空的（全 `ff`），启动加载器在后面的地址。频率超过 24 MHz 时驱动不再用控制器自己的分频，改用 PLL 分频；超过 60 MHz 时回来的数据要延迟采样，见 `sunxi_spi_set_sample`。

#### 示例：SPI 模式

`spi_config.operation` 里的 `SPI_MODE_CPOL`、`SPI_MODE_CPHA` 组合出 4 种模式，`SPI_TRANSFER_LSB` 选低位在前。

```c
/* SPI mode 0 (CPOL 0, CPHA 0) and mode 3 (CPOL 1, CPHA 1) both work with a NOR flash */
static void demo_modes(void)
{
	uint8_t cmd = CMD_JEDEC_ID;
	uint8_t id[3];
	struct spi_buf tx_buf = { .buf = &cmd, .len = 1 };
	struct spi_buf rx_buf = { .buf = id, .len = sizeof(id) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	static const struct {
		const char *name;
		uint32_t mode;
	} modes[] = {
		{ "mode 0 (CPOL 0, CPHA 0)", 0 },
		{ "mode 1 (CPOL 0, CPHA 1)", SPI_MODE_CPHA },
		{ "mode 2 (CPOL 1, CPHA 0)", SPI_MODE_CPOL },
		{ "mode 3 (CPOL 1, CPHA 1)", SPI_MODE_CPOL | SPI_MODE_CPHA },
	};

	for (int i = 0; i < ARRAY_SIZE(modes); i++) {
		struct spi_config cfg = cfg_at(1000000, modes[i].mode);
		int ret;

		memset(id, 0, sizeof(id));
		ret = spi_transceive(spi, &cfg, &tx, &rx);
		printk("[mode] %s = %s: %02x %02x %02x\n", modes[i].name, err(ret), id[0], id[1], id[2]);
	}
}
```

```text
[mode] mode 0 (CPOL 0, CPHA 0) = 0: 85 20 18
[mode] mode 1 (CPOL 0, CPHA 1) = 0: 85 20 18
[mode] mode 2 (CPOL 1, CPHA 0) = 0: ff ff ff
[mode] mode 3 (CPOL 1, CPHA 1) = 0: 85 20 18
```

SPI NOR 只规定模式 0 和模式 3，模式 2 读不到数据是器件的原因。

#### 示例：驱动拒绝的配置

```c
/* what the driver refuses */
static void demo_unsupported(void)
{
	uint8_t cmd = CMD_JEDEC_ID;
	uint8_t id[3];
	struct spi_buf tx_buf = { .buf = &cmd, .len = 1 };
	struct spi_buf rx_buf = { .buf = id, .len = sizeof(id) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	struct spi_config cfg;
	int ret;

	cfg = cfg_at(1000000, 0);
	cfg.operation = SPI_OP_MODE_MASTER | SPI_WORD_SET(16);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] 16 bit words                        = %s\n", err(ret));

	cfg = cfg_at(1000000, SPI_MODE_LOOP);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] SPI_MODE_LOOP                       = %s\n", err(ret));

	cfg = cfg_at(1000000, SPI_HOLD_ON_CS);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] SPI_HOLD_ON_CS                      = %s\n", err(ret));

	cfg = cfg_at(1000000, 0);
	cfg.operation = SPI_OP_MODE_SLAVE | SPI_WORD_SET(8);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] slave mode                          = %s\n", err(ret));

	cfg = cfg_at(1000000, 0);
	cfg.slave = 4;
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] chip select 4                       = %s\n", err(ret));

	cfg = cfg_at(1000, 0);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] 1 kHz                               = %s\n", err(ret));

	/* nothing to send or receive */
	struct spi_buf_set none = { .buffers = NULL, .count = 0 };

	cfg = cfg_at(1000000, 0);
	ret = spi_transceive(spi, &cfg, &none, &none);
	printk("[refuse] empty transfer                      = %s\n", err(ret));

}
```

```text
[refuse] 16 bit words                        = -ENOTSUP
[refuse] SPI_MODE_LOOP                       = -ENOTSUP
[refuse] SPI_HOLD_ON_CS                      = -ENOTSUP
[refuse] slave mode                          = -ENOTSUP
[refuse] chip select 4                       = -ENOTSUP
[refuse] 1 kHz                               = -EINVAL
[refuse] empty transfer                      = 0
```

### spi_write

```c
int spi_write(const struct device *dev, const struct spi_config *config, const struct spi_buf_set *tx_bufs);
```

只发送，等于 rx 为空的 `spi_transceive`，每次调用有自己的片选周期。

```c
/* spi_write: only sends. A write of the command alone and then a separate read is not what a NOR flash
 * wants (it needs the command and the read in the same chip select), but it is what spi_write does.
 */
static void demo_spi_write(void)
{
	struct spi_config cfg = cfg_at(1000000, 0);
	uint8_t cmd = CMD_JEDEC_ID;
	struct spi_buf tx_buf = { .buf = &cmd, .len = 1 };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	int ret = spi_write(spi, &cfg, &tx);

	printk("[split] spi_write(command)                    = %s\n", err(ret));
}
```

```text
[split] spi_write(command)                    = 0
```

### spi_read

```c
int spi_read(const struct device *dev, const struct spi_config *config, const struct spi_buf_set *rx_bufs);
```

只接收，tx 为空。闪存要求命令和读数据在同一次片选里，所以先 `spi_write` 命令再单独 `spi_read`，读到的是 `ff ff ff`：

```c
/* spi_read: only receives, the chip select is a new one, so the flash has not seen a command */
static void demo_spi_read(void)
{
	struct spi_config cfg = cfg_at(1000000, 0);
	uint8_t id[3] = { 0 };
	struct spi_buf rx_buf = { .buf = id, .len = sizeof(id) };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	int ret = spi_read(spi, &cfg, &rx);

	printk("[split] spi_read(3 bytes), chip select again  = %s: %02x %02x %02x\n", err(ret), id[0],
	       id[1], id[2]);
}
```

```text
[split] spi_read(3 bytes), chip select again  = 0: ff ff ff
```

### spi_release

```c
int spi_release(const struct device *dev, const struct spi_config *config);
```

`operation` 里带 `SPI_LOCK_ON` 的传输结束后总线仍然被这个配置占着，别的线程的传输要等；`spi_release` 释放它。

```c
/* spi_release unlocks the bus that a spi_config with SPI_LOCK_ON holds. */
static void demo_release(void)
{
	struct spi_config cfg = cfg_at(1000000, SPI_LOCK_ON);
	uint8_t cmd = CMD_JEDEC_ID;
	uint8_t id[3] = { 0 };
	struct spi_buf tx_buf = { .buf = &cmd, .len = 1 };
	struct spi_buf rx_buf = { .buf = id, .len = sizeof(id) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	int ret;

	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[release] transfer with SPI_LOCK_ON            = %s: %02x %02x %02x\n", err(ret), id[0],
	       id[1], id[2]);
	ret = spi_release(spi, &cfg);
	printk("[release] spi_release                          = %s\n", err(ret));
}
```

```text
[release] transfer with SPI_LOCK_ON            = 0: 85 20 18
[release] spi_release                          = 0
```

### sunxi_spi_set_sample

```c
int sunxi_spi_set_sample(const struct device *dev, uint8_t mode, uint8_t delay);
```

头文件 `<zephyr/drivers/spi/spi_sunxi.h>`，是这个驱动自己的扩展。选采样点：`mode` 是采样延后的半周期数（0…6），`delay` 是在此之上再加的延迟线级数（0…63），下一次传输起生效。不调用的话 60 MHz 以上自动延后一个周期。参数超范围返回 `-EINVAL`。

```c
/* sunxi_spi_set_sample: choose the sample point of the returning data (mode 0..6, delay 0..63) */
static void demo_set_sample(void)
{
	int ret;

	ret = sunxi_spi_set_sample(spi, 7, 0);
	printk("[sample] sunxi_spi_set_sample(mode 7)        = %s\n", err(ret));
	ret = sunxi_spi_set_sample(spi, 0, 64);
	printk("[sample] sunxi_spi_set_sample(delay 64)      = %s\n", err(ret));
	ret = sunxi_spi_set_sample(spi, 0, 0);
	printk("[sample] sunxi_spi_set_sample(mode 0, delay 0) = %s\n", err(ret));
}
```

```text
[sample] sunxi_spi_set_sample(mode 7)        = -EINVAL
[sample] sunxi_spi_set_sample(delay 64)      = -EINVAL
[sample] sunxi_spi_set_sample(mode 0, delay 0) = 0
```

## 完整演示程序

上面所有示例和日志都来自这一个程序。建一个目录，放进下面的文件，就可以像其他 Zephyr 应用一样编译。

```text
spi_api/
├── CMakeLists.txt
├── prj.conf
└── src/
    └── main.c
```

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(spi_api)

target_sources(app PRIVATE src/main.c)
```

### prj.conf

```ini
CONFIG_SPI=y
CONFIG_PRINTK=y
CONFIG_MAIN_STACK_SIZE=4096
CONFIG_SHELL=n
CONFIG_DEVMEM_SHELL=n
CONFIG_LOG_PRINTK=n
```

### src/main.c

```c
/*
 * Calls the functions of <zephyr/drivers/spi.h> on SPI0 of the YuzukiNeko, where the 16 MiB SPI NOR flash
 * of the board sits on PC0..PC5. Only read commands are sent, the flash holds the boot loader.
 */
#include <errno.h>
#include <string.h>
#include <zephyr/device.h>
#include <zephyr/drivers/spi.h>
#include <zephyr/drivers/spi/spi_sunxi.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

static const struct device *const spi = DEVICE_DT_GET(DT_NODELABEL(spi0));

/* SPI NOR commands */
#define CMD_READ_STATUS	0x05
#define CMD_READ_DATA	0x03
#define CMD_JEDEC_ID	0x9f

/* chip select 0 (the hardware CS pin), mode 0, 8 bit words, most significant bit first */
static struct spi_config cfg_at(uint32_t hz, uint32_t mode)
{
	return (struct spi_config){
		.frequency = hz,
		.operation = SPI_OP_MODE_MASTER | SPI_WORD_SET(8) | mode,
		.slave = 0,
	};
}

static const char *err(int ret)
{
	switch (ret) {
	case 0:		return "0";
	case -ENOTSUP:	return "-ENOTSUP";
	case -EINVAL:	return "-EINVAL";
	case -EIO:	return "-EIO";
	case -ETIMEDOUT: return "-ETIMEDOUT";
	default:	return "?";
	}
}

/*
 * spi_transceive with a command phase: tx is 1 byte, rx is 3 bytes. When the two lengths differ the
 * driver throws away what comes in while the tx bytes go out, so rx[0] is the first byte after the
 * command. (With the same length on both sides it is a plain full duplex transfer, see below.)
 */
static void demo_command_read(void)
{
	struct spi_config cfg = cfg_at(1000000, 0);
	uint8_t cmd = CMD_JEDEC_ID;
	uint8_t id[3] = { 0 };
	struct spi_buf tx_buf = { .buf = &cmd, .len = 1 };
	struct spi_buf rx_buf = { .buf = id, .len = sizeof(id) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	int ret;

	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[command] JEDEC ID (tx 1 byte, rx 3 bytes)   = %s: %02x %02x %02x\n", err(ret), id[0],
	       id[1], id[2]);
}

/*
 * spi_transceive with equal lengths is a plain full duplex transfer: every tx byte clocks one rx
 * byte in, so the byte received while the command goes out is not data.
 */
static void demo_full_duplex(void)
{
	struct spi_config cfg = cfg_at(1000000, 0);
	uint8_t out[4] = { CMD_JEDEC_ID, 0, 0, 0 };
	uint8_t in[4] = { 0xaa, 0xaa, 0xaa, 0xaa };
	struct spi_buf tx_buf = { .buf = out, .len = sizeof(out) };
	struct spi_buf rx_buf = { .buf = in, .len = sizeof(in) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	int ret;

	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[duplex] JEDEC ID (4 bytes both ways)         = %s: %02x %02x %02x %02x\n", err(ret),
	       in[0], in[1], in[2], in[3]);

	/* a command and one byte of answer: two bytes both ways, the answer is the second one */
	out[0] = CMD_READ_STATUS;
	out[1] = 0;
	tx_buf.len = 2;
	rx_buf.len = 2;
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[duplex] status register (2 bytes both ways)  = %s: 0x%02x\n", err(ret), in[1]);
}

/* spi_write: only sends. A write of the command alone and then a separate read is not what a NOR flash
 * wants (it needs the command and the read in the same chip select), but it is what spi_write does.
 */
static void demo_spi_write(void)
{
	struct spi_config cfg = cfg_at(1000000, 0);
	uint8_t cmd = CMD_JEDEC_ID;
	struct spi_buf tx_buf = { .buf = &cmd, .len = 1 };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	int ret = spi_write(spi, &cfg, &tx);

	printk("[split] spi_write(command)                    = %s\n", err(ret));
}

/* spi_read: only receives, the chip select is a new one, so the flash has not seen a command */
static void demo_spi_read(void)
{
	struct spi_config cfg = cfg_at(1000000, 0);
	uint8_t id[3] = { 0 };
	struct spi_buf rx_buf = { .buf = id, .len = sizeof(id) };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	int ret = spi_read(spi, &cfg, &rx);

	printk("[split] spi_read(3 bytes), chip select again  = %s: %02x %02x %02x\n", err(ret), id[0],
	       id[1], id[2]);
}

/* A longer read: the first 16 bytes of the flash, and the speed at several clocks.
 * Reads of 256 bytes or more into a 64 byte (cache line) aligned buffer go through the DMA controller.
 */
static void demo_read_flash(void)
{
	static uint8_t page[4096] __aligned(64);
	static uint8_t first[4096];
	struct spi_config cfg = cfg_at(1000000, 0);
	uint8_t cmd[4] = { CMD_READ_DATA, 0, 0, 0 };		/* 24 bit address 0 */
	struct spi_buf tx_buf = { .buf = cmd, .len = sizeof(cmd) };
	struct spi_buf rx_buf = { .buf = page, .len = sizeof(page) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	static const uint32_t rates[] = { 1000000, 6000000, 24000000, 48000000 };
	int ret;

	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[read] 4096 bytes at address 0 at 1 MHz        = %s\n", err(ret));
	printk("[read] first 16 bytes:");
	for (int i = 0; i < 16; i++) {
		printk(" %02x", page[i]);
	}
	printk("\n");
	memcpy(first, page, sizeof(page));

	for (int i = 0; i < ARRAY_SIZE(rates); i++) {
		cfg = cfg_at(rates[i], 0);
		memset(page, 0, sizeof(page));
		int64_t t0 = k_uptime_ticks();

		ret = spi_transceive(spi, &cfg, &tx, &rx);
		int64_t us = k_ticks_to_us_near64(k_uptime_ticks() - t0);

		printk("[read] 4096 bytes at %2u MHz = %s, %lld us, %s\n", rates[i] / 1000000, err(ret),
		       us, memcmp(first, page, sizeof(page)) == 0 ? "same data" : "DIFFERENT data");
	}

	/* a buffer that is not 64 byte aligned is read by the CPU */
	static uint8_t odd[1 + 512] __aligned(64);

	rx_buf.buf = odd + 1;
	rx_buf.len = 512;
	cfg = cfg_at(24000000, 0);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[read] 512 bytes into an unaligned buffer      = %s, %s\n", err(ret),
	       memcmp(first, odd + 1, 512) == 0 ? "same data" : "DIFFERENT data");
}

/* SPI mode 0 (CPOL 0, CPHA 0) and mode 3 (CPOL 1, CPHA 1) both work with a NOR flash */
static void demo_modes(void)
{
	uint8_t cmd = CMD_JEDEC_ID;
	uint8_t id[3];
	struct spi_buf tx_buf = { .buf = &cmd, .len = 1 };
	struct spi_buf rx_buf = { .buf = id, .len = sizeof(id) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	static const struct {
		const char *name;
		uint32_t mode;
	} modes[] = {
		{ "mode 0 (CPOL 0, CPHA 0)", 0 },
		{ "mode 1 (CPOL 0, CPHA 1)", SPI_MODE_CPHA },
		{ "mode 2 (CPOL 1, CPHA 0)", SPI_MODE_CPOL },
		{ "mode 3 (CPOL 1, CPHA 1)", SPI_MODE_CPOL | SPI_MODE_CPHA },
	};

	for (int i = 0; i < ARRAY_SIZE(modes); i++) {
		struct spi_config cfg = cfg_at(1000000, modes[i].mode);
		int ret;

		memset(id, 0, sizeof(id));
		ret = spi_transceive(spi, &cfg, &tx, &rx);
		printk("[mode] %s = %s: %02x %02x %02x\n", modes[i].name, err(ret), id[0], id[1], id[2]);
	}
}

/* what the driver refuses */
static void demo_unsupported(void)
{
	uint8_t cmd = CMD_JEDEC_ID;
	uint8_t id[3];
	struct spi_buf tx_buf = { .buf = &cmd, .len = 1 };
	struct spi_buf rx_buf = { .buf = id, .len = sizeof(id) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	struct spi_config cfg;
	int ret;

	cfg = cfg_at(1000000, 0);
	cfg.operation = SPI_OP_MODE_MASTER | SPI_WORD_SET(16);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] 16 bit words                        = %s\n", err(ret));

	cfg = cfg_at(1000000, SPI_MODE_LOOP);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] SPI_MODE_LOOP                       = %s\n", err(ret));

	cfg = cfg_at(1000000, SPI_HOLD_ON_CS);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] SPI_HOLD_ON_CS                      = %s\n", err(ret));

	cfg = cfg_at(1000000, 0);
	cfg.operation = SPI_OP_MODE_SLAVE | SPI_WORD_SET(8);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] slave mode                          = %s\n", err(ret));

	cfg = cfg_at(1000000, 0);
	cfg.slave = 4;
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] chip select 4                       = %s\n", err(ret));

	cfg = cfg_at(1000, 0);
	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[refuse] 1 kHz                               = %s\n", err(ret));

	/* nothing to send or receive */
	struct spi_buf_set none = { .buffers = NULL, .count = 0 };

	cfg = cfg_at(1000000, 0);
	ret = spi_transceive(spi, &cfg, &none, &none);
	printk("[refuse] empty transfer                      = %s\n", err(ret));

}

/* sunxi_spi_set_sample: choose the sample point of the returning data (mode 0..6, delay 0..63) */
static void demo_set_sample(void)
{
	int ret;

	ret = sunxi_spi_set_sample(spi, 7, 0);
	printk("[sample] sunxi_spi_set_sample(mode 7)        = %s\n", err(ret));
	ret = sunxi_spi_set_sample(spi, 0, 64);
	printk("[sample] sunxi_spi_set_sample(delay 64)      = %s\n", err(ret));
	ret = sunxi_spi_set_sample(spi, 0, 0);
	printk("[sample] sunxi_spi_set_sample(mode 0, delay 0) = %s\n", err(ret));
}

/* spi_release unlocks the bus that a spi_config with SPI_LOCK_ON holds. */
static void demo_release(void)
{
	struct spi_config cfg = cfg_at(1000000, SPI_LOCK_ON);
	uint8_t cmd = CMD_JEDEC_ID;
	uint8_t id[3] = { 0 };
	struct spi_buf tx_buf = { .buf = &cmd, .len = 1 };
	struct spi_buf rx_buf = { .buf = id, .len = sizeof(id) };
	struct spi_buf_set tx = { .buffers = &tx_buf, .count = 1 };
	struct spi_buf_set rx = { .buffers = &rx_buf, .count = 1 };
	int ret;

	ret = spi_transceive(spi, &cfg, &tx, &rx);
	printk("[release] transfer with SPI_LOCK_ON            = %s: %02x %02x %02x\n", err(ret), id[0],
	       id[1], id[2]);
	ret = spi_release(spi, &cfg);
	printk("[release] spi_release                          = %s\n", err(ret));
}

int main(void)
{
	if (!device_is_ready(spi)) {
		printk("spi not ready\n");
		return 0;
	}

	demo_command_read();
	demo_full_duplex();
	demo_spi_write();
	demo_spi_read();
	demo_read_flash();
	demo_modes();
	demo_unsupported();
	demo_set_sample();
	demo_release();

	printk("spi_api done\n");
	return 0;
}
```

### 编译和运行

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/spi-api spi_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-spi/build.cast" data-speed="6"></div>

下载运行的方法见[编译与运行](../zephyr-build-run.md)。控制台 UART1 上的完整输出：

```text
[command] JEDEC ID (tx 1 byte, rx 3 bytes)   = 0: 85 20 18
[duplex] JEDEC ID (4 bytes both ways)         = 0: ff 85 20 18
[duplex] status register (2 bytes both ways)  = 0: 0x00
[split] spi_write(command)                    = 0
[split] spi_read(3 bytes), chip select again  = 0: ff ff ff
[read] 4096 bytes at address 0 at 1 MHz        = 0
[read] first 16 bytes: ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff
[read] 4096 bytes at  1 MHz = 0, 87600 us, same data
[read] 4096 bytes at  6 MHz = 0, 22000 us, same data
[read] 4096 bytes at 24 MHz = 0, 1500 us, same data
[read] 4096 bytes at 48 MHz = 0, 800 us, same data
[read] 512 bytes into an unaligned buffer      = 0, same data
[mode] mode 0 (CPOL 0, CPHA 0) = 0: 85 20 18
[mode] mode 1 (CPOL 0, CPHA 1) = 0: 85 20 18
[mode] mode 2 (CPOL 1, CPHA 0) = 0: ff ff ff
[mode] mode 3 (CPOL 1, CPHA 1) = 0: 85 20 18
[refuse] 16 bit words                        = -ENOTSUP
[refuse] SPI_MODE_LOOP                       = -ENOTSUP
[refuse] SPI_HOLD_ON_CS                      = -ENOTSUP
[refuse] slave mode                          = -ENOTSUP
[refuse] chip select 4                       = -ENOTSUP
[refuse] 1 kHz                               = -EINVAL
[refuse] empty transfer                      = 0
[sample] sunxi_spi_set_sample(mode 7)        = -EINVAL
[sample] sunxi_spi_set_sample(delay 64)      = -EINVAL
[sample] sunxi_spi_set_sample(mode 0, delay 0) = 0
[release] transfer with SPI_LOCK_ON            = 0: 85 20 18
[release] spi_release                          = 0
spi_api done
```
