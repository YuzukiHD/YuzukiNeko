---
title: "SPI"
---

F101 has 2 SPI controllers, `spi0` and `spi1` in Zephyr, with the standard `<zephyr/drivers/spi.h>` API; the driver is `drivers/spi/spi_sunxi.c`, and there is an extension header `<zephyr/drivers/spi/spi_sunxi.h>`.

| Item | Content |
| --- | --- |
| Device | `spi0` (PC0…PC5, onboard SPI NOR), `spi1` (PD0…PD5, shared with the LCD pins) |
| Role | Host only |
| Word length | 8 bits |
| Mode | 4 SPI modes (CPOL, CPHA), optionally least significant bit first |
| Chip select | Hardware chip select 0…3, or `cs-gpios` in the devicetree |
| Data lines | Single line; with `CONFIG_SPI_EXTENDED_MODES` enabled the read data phase can use four lines |
| Frequency | Below 3 kHz returns `-EINVAL`; up to 24 MHz uses the controller's own divider; higher is obtained from the PLL divider |
| Transfer | Polling; reads of 256 bytes or more into a 64 byte (cache line) aligned buffer go through DMA |
| Not supported | Slave mode, loopback (`SPI_MODE_LOOP`), `SPI_HOLD_ON_CS`, word lengths other than 8 bits |

## Devicetree

| File | Purpose |
| --- | --- |
| `dts/bindings/spi/allwinner,sunxi-spi.yaml` | Binding: defines the properties of an `allwinner,sunxi-spi` node |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree: `spi0`, `spi1`, `disabled` by default |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | Board devicetree: pin groups, enables `spi0` |

### SoC devicetree: sun252i_f101.dtsi

`spi0` and `spi1` differ only in registers, clocks, reset and DMA channel. `spi0` is below:

```c
spi0: spi@4025000 {
	/* matches DT_DRV_COMPAT allwinner_sunxi_spi in the driver spi_sunxi.c */
	compatible = "allwinner,sunxi-spi";

	/* child nodes (the devices) use a 1 cell address, which is the chip select number */
	#address-cells = <1>;
	#size-cells = <0>;

	/* register window: base 0x04025000, length 0x400 */
	reg = <0x04025000 0x400>;

	/* module clock and bus clock, in the order of clock-names */
	clocks = <&cctl CLK_SPI0>, <&cctl CLK_BUS_SPI0>;
	clock-names = "mod", "bus";

	/* bus reset */
	resets = <&rctl RST_BUS_SPI0>;

	/* the clock frequency used at initialization */
	clock-frequency = <10000000>;

	/* offset of the module clock register in the CCU */
	clock-reg = <0x940>;

	/* receive DMA: channel 7 of the DMA controller; the request line of the SPI receive FIFO is 22 */
	dmas = <&dma 7>;
	dma-names = "rx";
	dma-slot = <22>;

	status = "disabled";
};
```

| Node | Label | Register | Module clock | `clock-reg` | DMA channel | Request line |
| --- | --- | --- | --- | --- | --- | --- |
| `spi@4025000` | `spi0` | `0x04025000` | `CLK_SPI0` | `0x940` | 7 | 22 |
| `spi@4026000` | `spi1` | `0x04026000` | `CLK_SPI1` | `0x944` | 8 | 23 |

### Board devicetree: yuzukineko.dts

```c
&pio {
	/* SPI0 is on PC0…PC5, multiplexing function 3. The onboard NOR flash and the SPIF controller use the same set of pins */
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

	/* SPI1 is on PD0…PD5, multiplexing function 3: PD0 CS0, PD1 CLK, PD2 MOSI, PD3 MISO, PD4 HOLD, PD5 WP */
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

`spi1` is not enabled on this board: PD0…PD5 are taken by the touchscreen I2C, reset and interrupt pins, and the LED and amplifier enable.

### Connecting an SPI device

Write a child node for a device; `reg` is the chip select number, and `spi-max-frequency` is the highest frequency it accepts. For example, an SPI NOR on chip select 0 of `spi0`:

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
		size = <DT_SIZE_M(128)>;	/* in bits: 16 MiB */
	};
};
```

With hardware chip select, do not write `cs-gpios`. To use a GPIO as chip select, write `cs-gpios = <&gpiod 4 GPIO_ACTIVE_LOW>;` in the controller node; the `reg` of a child node is its index in the list, and the driver drives this pin in software.

### Binding: allwinner,sunxi-spi.yaml

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

| Property | Required | Meaning |
| --- | --- | --- |
| `reg` | Yes | Register window |
| `clocks`, `clock-names` | Yes | Module clock `mod` and bus clock `bus` |
| `resets` | Yes | Bus reset |
| `clock-frequency` | Yes | Clock frequency at initialization |
| `clock-reg` | Yes | Offset of the module clock register in the CCU |
| `dmas`, `dma-names`, `dma-slot` | No | Receive DMA; if absent all reads are done by the CPU |
| `cs-gpios` | No | From `spi-controller.yaml`, use a GPIO as chip select |
| `pinctrl-0`, `pinctrl-names` | No | Pins, see [the pinctrl section of the GPIO page](gpio.md#pin-multiplexing-pinctrl) |

## Kconfig

| Option | Default | Meaning |
| --- | --- | --- |
| `CONFIG_SPI` | `y` in the board defconfig | Enable the SPI subsystem |
| `CONFIG_SPI_SUNXI` | `y` (depends on `DT_HAS_ALLWINNER_SUNXI_SPI_ENABLED`) | Build this driver, and select `CONFIG_PINCTRL` |
| `CONFIG_SPI_SUNXI_INIT_PRIORITY` | 81 | Initialization priority of the driver |
| `CONFIG_SPI_SUNXI_DMA` | `y` (depends on `DMA`) | Use DMA for long reads |
| `CONFIG_SPI_SUNXI_DMA_MIN_LEN` | 256 | Minimum number of bytes to read before DMA is used |
| `CONFIG_SPI_EXTENDED_MODES` | No | When enabled, `SPI_LINES_QUAD` is available: the command goes on one line, the read data on four |

## API reference

Below, each API gets a heading: prototype, the behaviour of the driver, an example function and its output on the board. The demo reads the onboard SPI NOR flash (16 MiB, JEDEC ID `85 20 18`) on `spi0`; the flash holds the boot loader, so only read commands are sent, and no writes or erases. The examples come from the [complete demo program](#complete-demo-program) at the end of the page, where `err()` turns a return value into a name.

All the examples use the same function to build a `struct spi_config`: chip select 0 (the hardware CS pin), 8 bit words, most significant bit first.

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

Whether the total lengths of `tx_bufs` and `rx_bufs` are equal decides how the driver proceeds:

| tx total length | rx total length | Transfer |
| --- | --- | --- |
| equal | equal | Full duplex: every byte sent clocks one byte in, and the two sides correspond one to one |
| unequal | unequal | Command plus data: tx goes out first, and the bytes received while the tx bytes go out are discarded; `rx` holds the rx bytes after the tx has been sent |

Devices such as SPI NOR that "send a command, read data" use the second form; it completes in one call, and the chip select stays active throughout. A single call transfers at most 16777215 (0xFFFFFF) bytes; more than that returns `-EMSGSIZE`.

#### Example: command plus data

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

#### Example: full duplex

With equal transmit and receive lengths, `rx[0]` is the byte received while the command goes out, not data. To read one byte such as a status register, send two bytes in each direction and the answer is the second one.

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

#### Example: long reads and DMA

When the read buffer is at least `CONFIG_SPI_SUNXI_DMA_MIN_LEN` (256) bytes and its address is 64 byte (cache line) aligned, the data is moved by the DMA; otherwise the CPU reads it from the receive FIFO. Both ways read the same data. Below, 4 KiB is read and a few clock frequencies are tried to see the time taken.

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

The start of the flash is empty (all `ff`); the boot loader is at later addresses. Above 24 MHz the driver no longer uses the controller's own divider but a PLL divider; above 60 MHz the returning data needs delayed sampling, see `sunxi_spi_set_sample`.

#### Example: SPI modes

`SPI_MODE_CPOL` and `SPI_MODE_CPHA` in `spi_config.operation` combine into the 4 modes, and `SPI_TRANSFER_LSB` selects least significant bit first.

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

SPI NOR specifies only mode 0 and mode 3; mode 2 reading no data is the device's doing.

#### Example: configurations the driver refuses

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

Sends only, equivalent to `spi_transceive` with an empty rx, and each call has its own chip select cycle.

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

Receives only, with an empty tx. The flash requires the command and the read data in the same chip select, so after a `spi_write` of the command a separate `spi_read` reads `ff ff ff`:

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

After a transfer whose `operation` carries `SPI_LOCK_ON`, the bus is still held by that configuration and transfers from other threads wait; `spi_release` releases it.

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

The header `<zephyr/drivers/spi/spi_sunxi.h>` is this driver's own extension. It chooses the sample point: `mode` is the number of half cycles the sampling is delayed by (0…6), and `delay` is the number of delay line stages added on top of that (0…63); it takes effect from the next transfer. If it is not called, above 60 MHz the sampling is delayed by one cycle automatically. Out-of-range parameters return `-EINVAL`.

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

## Complete demo program

All the examples and logs above come from this one program. Create a directory, put the files below in it, and it builds like any other Zephyr application.

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

### Build and run

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/spi-api spi_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-spi/build.cast" data-speed="6"></div>

For how to download and run, see [Build and run](../zephyr-build-run.md). The full output on console UART1:

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
