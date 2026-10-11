---
title: "SDHC host controller"
---

The F101 has two SD/MMC host controllers (SMHC): `smhc0` connects to the TF card slot on the board, `smhc2` connects to the SDIO of the WiFi module. The driver in Zephyr is `drivers/sdhc/sdhc_sunxi.c`, which implements the SD host controller interface `<zephyr/drivers/sdhc.h>`.

This layer only deals with the "controller": issuing commands, receiving responses, moving data blocks, setting the clock and the bus width, detecting the card. The card identification flow, the disk interface and the filesystem are another layer above it and do not belong to this driver (they are provided later by a separate Zephyr component). So the demo in this page uses no disk and no filesystem, and instead brings the card up step by step with the commands of the SD specification.

| Item | Description |
| --- | --- |
| Device | `smhc0` (TF card slot), `smhc2` (WiFi SDIO) |
| Bus width | 1 bit, 4 bit and 8 bit are decided by the devicetree `bus-width`; the slot on `yuzukineko` is 4 bit |
| Clock | 400 kHz (identification) … 50 MHz (high speed mode) |
| Voltage | 3.3 V; the 1.8 V UHS modes are not supported (SDR50 and DDR50 are both 0) |
| Card detection | `cd-gpios`; `yuzukineko` uses PF6, a low level means a card is present |
| Transfer | DMA (internal descriptors); unaligned buffers go through the bounce buffer in the driver |
| Card type | SD cards (the demo in this page); `smhc2` connects to an SDIO WiFi chip; SPI mode is not supported |

## Devicetree

| File | Role |
| --- | --- |
| `dts/bindings/sdhc/allwinner,sunxi-smhc.yaml` | Binding |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree: `smhc0`, `smhc2`, `disabled` by default |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | Board devicetree: pin groups, `bus-width`, `cd-gpios` |

### SoC devicetree: sun252i_f101.dtsi

```c
smhc0: mmc@4020000 {
	/* Matches DT_DRV_COMPAT allwinner_sunxi_smhc in the driver sdhc_sunxi.c */
	compatible = "allwinner,sunxi-smhc";

	/* Register window: base address 0x04020000, length 0x1000 */
	reg = <0x04020000 0x1000>;

	/* Interrupt: PLIC number 40, priority 1 */
	interrupts = <40 1>;
	interrupt-parent = <&plic>;

	/* The module clock (which produces the card clock) and the bus clock, in the order of clock-names */
	clocks = <&cctl CLK_SMHC0>, <&cctl CLK_BUS_SMHC0>;
	clock-names = "mod", "bus";
	resets = <&rctl RST_BUS_SMHC0>;

	/* Offset of the module clock register in the CCU: clock source, divider and gate */
	clock-reg = <0x830>;

	/* The highest clock the host can run at */
	max-bus-freq = <50000000>;

	status = "disabled";
};
```

| Node | Label | Registers | PLIC interrupt number | `clock-reg` | Use |
| --- | --- | --- | --- | --- | --- |
| `mmc@4020000` | `smhc0` | `0x04020000` | 40 | `0x830` | TF card slot |
| `mmc@4022000` | `smhc2` | `0x04022000` | 42 | `0x838` | WiFi (AIC8800D40) SDIO |

### Board devicetree: yuzukineko.dts

```c
&pio {
	/* The TF card slot is on PF0…PF5, multiplexing function 2: PF2 is CLK, PF3 is CMD, and PF1/PF0/PF5/PF4 are D0…D3.
	 * It shares these pins with JTAG. */
	smhc0_pins: smhc0_pins {
		smhc0_clk {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PF, 2, 2)>;
			bias-disable;
		};
		smhc0_cmd_data {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PF, 3, 2)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PF, 1, 2)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PF, 0, 2)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PF, 5, 2)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PF, 4, 2)>;
			bias-pull-up;
		};
	};
};

&smhc0 {
	pinctrl-0 = <&smhc0_pins>;
	pinctrl-names = "default";

	/* 4 data lines */
	bus-width = <4>;

	/* Card detection: PF6, a low level when a card is present */
	cd-gpios = <&gpiof 6 GPIO_ACTIVE_LOW>;
	status = "okay";

	/* Disk: this child node is used by the disk interface above and makes a disk named "SD" appear in the Zephyr disk subsystem.
	 * The demo in this page does not use it and drives the controller directly */
	sdmmc {
		compatible = "zephyr,sdmmc-disk";
		disk-name = "SD";
		status = "okay";
	};
};
```

`smhc2` is written the same way, except that `non-removable;` takes the place of `cd-gpios`, and no disk node hangs below it — instead the node of the WiFi chip does.

### Binding: allwinner,sunxi-smhc.yaml

```yaml
description: Allwinner sunxi SD/MMC host controller (SMHC)

compatible: "allwinner,sunxi-smhc"

include: [sdhc.yaml, pinctrl-device.yaml]

properties:
  reg:
    required: true
  interrupts:
    required: true
  clocks:
    required: true
  clock-names:
    required: true
  resets:
    type: phandle-array
    required: true
  clock-reg:
    type: int
    required: true
  bus-width:
    type: int
    default: 4
    enum: [1, 4, 8]
  cd-gpios:
    type: phandle-array
  pwr-gpios:
    type: phandle-array
  non-removable:
    type: boolean
```

| Property | Required | Meaning |
| --- | --- | --- |
| `reg`, `interrupts` | yes | Register window, interrupt |
| `clocks`, `clock-names` | yes | The module clock `mod` and the bus clock `bus` |
| `resets` | yes | Bus reset |
| `clock-reg` | yes | Offset of the module clock register in the CCU |
| `max-bus-freq` | from `sdhc.yaml` | The highest clock the host supports |
| `bus-width` | no, 4 | Number of data lines wired: 1, 4 or 8 |
| `cd-gpios` | no | Card detect pin; write `GPIO_ACTIVE_LOW` if it is low when a card is present |
| `pwr-gpios` | no | GPIO that switches the power of the card |
| `non-removable` | no | The card is soldered to the board (eMMC, SDIO module) and is always present |
| `pinctrl-0`, `pinctrl-names` | no | Pins, see the [pinctrl section of the GPIO page](gpio.md#pin-multiplexing-pinctrl) |

## Kconfig

| Option | Default | Meaning |
| --- | --- | --- |
| `CONFIG_SDHC` | set to `y` in the application | Enables the SD host controller subsystem |
| `CONFIG_SDHC_SUNXI` | `y` (depends on `DT_HAS_ALLWINNER_SUNXI_SMHC_ENABLED`) | Builds this driver and selects `PINCTRL`, `GPIO`, `CACHE_MANAGEMENT` |
| `CONFIG_SDHC_SUNXI_MAX_DESC` | 128 | Number of DMA descriptors; each descriptor moves at most 8 KiB, so this value limits the size of one DMA transfer (128 of them is 1 MiB); larger requests are transferred by the CPU |
| `CONFIG_SDHC_SUNXI_BOUNCE_KB` | 64 | Bounce buffer size (KiB). DMA needs cache-line aligned memory, so other memory goes through this buffer and is copied by the CPU; it is allocated from the kernel heap on first use. Larger requests are transferred by the CPU only. 0 disables the bounce buffer |

## Interface details

The demo runs on `yuzukineko` with an SDHC card in the slot and drives the controller directly with the `sdhc_*` functions. Each interface gets its own heading, with its prototype, its behaviour and a complete example function below it.

The two global variables and the helper function used repeatedly in the demo:

```c
static const struct device *const sdhc = DEVICE_DT_GET(DT_NODELABEL(smhc0));

static uint32_t rca;		/* relative card address, from CMD3 */
static bool block_addressed;	/* SDHC and SDXC cards: the argument of a read command is a block number */

/* issue one command without data */
static int send(uint32_t opcode, uint32_t arg, uint32_t response_type, struct sdhc_command *cmd)
{
	memset(cmd, 0, sizeof(*cmd));
	cmd->opcode = opcode;
	cmd->arg = arg;
	cmd->response_type = response_type;
	cmd->retries = 2;
	cmd->timeout_ms = 200;
	return sdhc_request(sdhc, cmd, NULL);
}
```

### sdhc_get_host_props

```c
int sdhc_get_host_props(const struct device *dev, struct sdhc_host_props *props);
```

Reads the capabilities of the controller: clock range, bus width, voltage, speed modes, and the power-up delay.

```c
/* sdhc_get_host_props: what the controller can do */
static void demo_get_host_props(void)
{
	struct sdhc_host_props props;
	int ret = sdhc_get_host_props(sdhc, &props);

	printk("[props] sdhc_get_host_props = %s: clock %u..%u Hz, power-up delay %u ms\n", err(ret),
	       props.f_min, props.f_max, props.power_delay);
	printk("[props] 4 bit bus %d, 8 bit bus %d, high speed %d, 3.3 V %d, 3.0 V %d, 1.8 V %d, SDR50 %d, DDR50 %d, SPI mode %d\n",
	       props.host_caps.bus_4_bit_support, props.host_caps.bus_8_bit_support,
	       props.host_caps.high_spd_support, props.host_caps.vol_330_support,
	       props.host_caps.vol_300_support, props.host_caps.vol_180_support,
	       props.host_caps.sdr50_support, props.host_caps.ddr50_support, props.is_spi);
	printk("[props] SDIO card interrupt %d, max current at 3.3 V %u mA\n",
	       props.host_caps.sdio_async_interrupt_support, props.max_current_330);
}
```

```text
[props] sdhc_get_host_props = 0: clock 400000..50000000 Hz, power-up delay 500 ms
[props] 4 bit bus 1, 8 bit bus 0, high speed 1, 3.3 V 1, 3.0 V 0, 1.8 V 0, SDR50 0, DDR50 0, SPI mode 0
[props] SDIO card interrupt 1, max current at 3.3 V 200 mA
```

### sdhc_card_present

```c
int sdhc_card_present(const struct device *dev);
```

Reads the card detection: returns 1 if a card is present, 0 if not. It always returns 1 when the controller node has `non-removable` or has no `cd-gpios`.

```c
/* sdhc_card_present: the card detect line (cd-gpios) */
static void demo_card_present(void)
{
	int ret = sdhc_card_present(sdhc);

	printk("[present] sdhc_card_present = %d\n", ret);
}
```

```text
[present] sdhc_card_present = 1
```

### sdhc_hw_reset

```c
int sdhc_hw_reset(const struct device *dev);
```

Resets the controller; the state of the card itself is unchanged.

```c
/* sdhc_hw_reset: reset the controller, the card keeps its state */
static void demo_hw_reset(void)
{
	int ret = sdhc_hw_reset(sdhc);

	printk("[reset] sdhc_hw_reset = %s\n", err(ret));
}
```

```text
[reset] sdhc_hw_reset = 0
```

### sdhc_set_io

```c
int sdhc_set_io(const struct device *dev, struct sdhc_io *io);
```

Sets the power, the clock, the bus width and the timing. After power-up a card is on a 1-bit bus and the clock must not exceed 400 kHz; it is raised only after identification.

| Field of `sdhc_io` | Driver behaviour |
| --- | --- |
| `clock` | 0, or between `f_min`…`f_max` (400 kHz…50 MHz); out of range returns `-EINVAL` and prints `unsupported clock` in the log |
| `power_mode` | `SDHC_POWER_ON` / `SDHC_POWER_OFF`; when the node has `pwr-gpios` it also toggles this GPIO, and the clock is cleared when the power is switched off |
| `bus_width` | 1, 4, 8; any other value returns `-EINVAL` |
| `timing` | `SDHC_TIMING_DDR50` and `DDR52` enable sampling on both edges; the rest sample on a single edge |
| `signal_voltage` | 3.3 V; 1.8 V and 1.2 V return `-ENOTSUP` |

```c
/* sdhc_set_io: power, clock, bus width and timing. A card starts in 1 bit mode at 400 kHz or less. */
static void demo_set_io(void)
{
	struct sdhc_io io = {
		.clock = 400000,
		.bus_mode = SDHC_BUSMODE_PUSHPULL,
		.power_mode = SDHC_POWER_ON,
		.bus_width = SDHC_BUS_WIDTH1BIT,
		.timing = SDHC_TIMING_LEGACY,
		.signal_voltage = SD_VOL_3_3_V,
	};
	int ret;

	ret = sdhc_set_io(sdhc, &io);
	printk("[io] power on, 400 kHz, 1 bit, legacy timing    = %s\n", err(ret));
	k_msleep(10);

	io.clock = 25000000;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] 25 MHz                                   = %s\n", err(ret));

	io.clock = 50000000;
	io.timing = SDHC_TIMING_HS;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] 50 MHz, high speed timing                = %s\n", err(ret));

	io.clock = 100000000;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] 100 MHz (above the maximum)               = %s\n", err(ret));

	io.clock = 100000;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] 100 kHz (below the minimum)               = %s\n", err(ret));

	io.clock = 400000;
	io.timing = SDHC_TIMING_LEGACY;
	io.signal_voltage = SD_VOL_1_8_V;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] 1.8 V signalling                          = %s\n", err(ret));

	io.signal_voltage = SD_VOL_3_3_V;
	io.bus_width = 3;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] a bus width of 3                          = %s\n", err(ret));

	io.bus_width = SDHC_BUS_WIDTH1BIT;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] back to 400 kHz, 1 bit, 3.3 V             = %s\n", err(ret));
}
```

```text
[io] power on, 400 kHz, 1 bit, legacy timing    = 0
[io] 25 MHz                                   = 0
[io] 50 MHz, high speed timing                = 0
[io] 100 MHz (above the maximum)               = -EINVAL
[io] 100 kHz (below the minimum)               = -EINVAL
[io] 1.8 V signalling                          = -ENOTSUP
[io] a bus width of 3                          = -EINVAL
[io] back to 400 kHz, 1 bit, 3.3 V             = 0
```

### sdhc_request

```c
int sdhc_request(const struct device *dev, struct sdhc_command *cmd, struct sdhc_data *data);
```

Issues one command, with `data` if data is needed. `struct sdhc_command` is filled with the command number, the argument, the expected response type (`SD_RSP_TYPE_R1` and so on, in `<zephyr/sd/sd_spec.h>`), the retry count and the timeout; the response comes back in `cmd->response[]`, and an R2 response is 4 words. `struct sdhc_data` is filled with the start block, the block size, the number of blocks, the buffer and the timeout; after the transfer `bytes_xfered` is the number of bytes actually transferred.

| Case | Return |
| --- | --- |
| Success | 0 |
| `data` given but the block size or the block count is 0, or the buffer is NULL | `-EINVAL` |
| Command timeout, data timeout | `-ETIMEDOUT` |
| Response or data CRC error | `-EIO`, and the driver retries according to `retries` |

Reading and writing data uses DMA; the buffer must be aligned to the cache line (64 bytes), otherwise it goes through the bounce buffer in the driver. For multi-block reads and writes (CMD18, CMD25) the controller issues the final CMD12 itself, so the application must not send one.

A few examples follow.

#### Example: identifying the card

Commands without data. The order is prescribed by the SD specification: CMD0 resets, CMD8 checks the voltage, CMD55 plus ACMD41 ask repeatedly until the card has finished powering up, CMD2 reads the card identification, CMD3 asks for the relative address, CMD9 reads the characteristic data of the card, CMD7 selects the card.

```c
/* sdhc_request without data: the identification of the card. Every step prints the response. */
static int bring_up_card(void)
{
	struct sdhc_command cmd;
	int ret;

	ret = send(SD_GO_IDLE_STATE, 0, SD_RSP_TYPE_NONE, &cmd);
	printk("[card] CMD0  go idle                       = %s\n", err(ret));

	/* CMD8: 2.7..3.6 V and a check pattern that the card repeats */
	ret = send(SD_SEND_IF_COND, SD_IF_COND_VHS_3V3 | SD_IF_COND_CHECK, SD_RSP_TYPE_R7, &cmd);
	printk("[card] CMD8  interface condition           = %s: R7 %08x\n", err(ret), cmd.response[0]);
	if (ret != 0) {
		return ret;
	}

	/* ACMD41: CMD55 first, then the operating condition, until the card says it is powered up */
	for (int i = 0; i < 100; i++) {
		ret = send(SD_APP_CMD, 0, SD_RSP_TYPE_R1, &cmd);
		if (ret == 0) {
			ret = send(SD_APP_SEND_OP_COND, SD_OCR_HOST_CAP_FLAG | 0x00ff8000, SD_RSP_TYPE_R3, &cmd);
		}
		if (ret != 0 || (cmd.response[0] & SD_OCR_PWR_BUSY_FLAG)) {
			break;
		}
		k_msleep(10);
	}
	block_addressed = (cmd.response[0] & SD_OCR_CARD_CAP_FLAG) != 0;
	printk("[card] ACMD41 operating condition          = %s: OCR %08x, %s\n", err(ret), cmd.response[0],
	       block_addressed ? "block addressed (SDHC/SDXC)" : "byte addressed");
	if (ret != 0) {
		return ret;
	}

	ret = send(SD_ALL_SEND_CID, 0, SD_RSP_TYPE_R2, &cmd);
	printk("[card] CMD2  CID                           = %s: %08x %08x %08x %08x\n", err(ret),
	       cmd.response[0], cmd.response[1], cmd.response[2], cmd.response[3]);

	ret = send(SD_SEND_RELATIVE_ADDR, 0, SD_RSP_TYPE_R6, &cmd);
	rca = cmd.response[0] >> 16;
	printk("[card] CMD3  relative address              = %s: RCA %04x\n", err(ret), rca);

	ret = send(SD_SEND_CSD, rca << 16, SD_RSP_TYPE_R2, &cmd);
	printk("[card] CMD9  CSD                           = %s: %08x %08x %08x %08x\n", err(ret),
	       cmd.response[0], cmd.response[1], cmd.response[2], cmd.response[3]);

	ret = send(SD_SELECT_CARD, rca << 16, SD_RSP_TYPE_R1b, &cmd);
	printk("[card] CMD7  select the card               = %s\n", err(ret));
	return ret;
}
```

```text
[card] CMD0  go idle                       = 0
[card] CMD8  interface condition           = 0: R7 000001aa
[card] ACMD41 operating condition          = 0: OCR c0ff8000, block addressed (SDHC/SDXC)
[card] CMD2  CID                           = 0: 7f01a775 2200006e 73646667 05000c61
[card] CMD3  relative address              = 0: RCA 0001
[card] CMD9  CSD                           = 0: 0a404023 3bff7f80 5b590000 400e0032
[card] CMD7  select the card               = 0
```

`OCR c0ff8000`: the top bit means power-up is complete, and the second bit (CCS) means it is a block-addressed SDHC/SDXC card.

#### Example: switching to a 4-bit bus

ACMD6 tells the card and `sdhc_set_io` tells the controller, while the clock is raised to 25 MHz.

```c
/* switch to 4 data lines: ACMD6 tells the card, sdhc_set_io tells the controller */
static void bus_width_4(void)
{
	struct sdhc_command cmd;
	struct sdhc_io io = {
		.clock = 25000000,
		.bus_mode = SDHC_BUSMODE_PUSHPULL,
		.power_mode = SDHC_POWER_ON,
		.bus_width = SDHC_BUS_WIDTH4BIT,
		.timing = SDHC_TIMING_LEGACY,
		.signal_voltage = SD_VOL_3_3_V,
	};
	int ret = send(SD_APP_CMD, rca << 16, SD_RSP_TYPE_R1, &cmd);

	if (ret == 0) {
		ret = send(SD_APP_SET_BUS_WIDTH, 2, SD_RSP_TYPE_R1, &cmd);	/* 2 = 4 bit bus */
	}
	if (ret == 0) {
		ret = sdhc_set_io(sdhc, &io);
	}
	printk("[card] ACMD6 4 bit bus, 25 MHz            = %s\n", err(ret));
}
```

```text
[card] ACMD6 4 bit bus, 25 MHz            = 0
```

#### Example: reading one block

CMD17, with `sdhc_data`. The last two bytes of block 0 are the boot signature `55 aa`.

```c
static void demo_request_read_one(void)
{
	struct sdhc_command cmd = { .opcode = SD_READ_SINGLE_BLOCK, .response_type = SD_RSP_TYPE_R1,
				    .retries = 2, .timeout_ms = 200 };
	struct sdhc_data data = { .block_addr = 0, .block_size = 512, .blocks = 1, .data = blocks,
				  .timeout_ms = 500 };
	int ret;

	cmd.arg = block_addressed ? 0 : 0 * 512;
	ret = sdhc_request(sdhc, &cmd, &data);
	printk("[read1] CMD17 block 0                      = %s: %u bytes, R1 %08x, signature %02x %02x\n",
	       err(ret), data.bytes_xfered, cmd.response[0], blocks[510], blocks[511]);
}
```

```text
[read1] CMD17 block 0                      = 0: 512 bytes, R1 00000900, signature 55 aa
```

#### Example: reading several blocks

CMD18 reads 8 blocks (4096 bytes) at once and no CMD12 needs to be sent. The first block is the same as the one CMD17 read.

```c
/* CMD18 reads several blocks; the controller ends the transfer itself, no CMD12 is needed. */
static void demo_request_read_many(void)
{
	struct sdhc_command cmd = { .opcode = SD_READ_MULTIPLE_BLOCK, .response_type = SD_RSP_TYPE_R1,
				    .retries = 2, .timeout_ms = 200 };
	struct sdhc_data data = { .block_addr = 0, .block_size = 512, .blocks = 8, .data = blocks,
				  .timeout_ms = 1000 };
	static uint8_t first[512];
	int ret;

	memcpy(first, blocks, sizeof(first));
	memset(blocks, 0, sizeof(blocks));
	cmd.arg = block_addressed ? 0 : 0;
	ret = sdhc_request(sdhc, &cmd, &data);
	printk("[readN] CMD18 8 blocks from 0               = %s: %u bytes, first block %s\n", err(ret),
	       data.bytes_xfered, memcmp(first, blocks, 512) == 0 ? "same as CMD17" : "DIFFERENT");
}
```

```text
[readN] CMD18 8 blocks from 0               = 0: 4096 bytes, first block same as CMD17
```

#### Example: reading the card status

The response to CMD13 is the status register of the card; bits 9…12 are the card state, and 4 means the transfer state.

```c
/* the card state after all this: CMD13 returns the status register */
static void demo_request_status(void)
{
	struct sdhc_command cmd;
	int ret = send(SD_SEND_STATUS, rca << 16, SD_RSP_TYPE_R1, &cmd);

	printk("[status] CMD13 card status                 = %s: R1 %08x, state %u (4 = transfer)\n",
	       err(ret), cmd.response[0], (cmd.response[0] >> 9) & 0xf);
}
```

```text
[status] CMD13 card status                 = 0: R1 00000900, state 4 (4 = transfer)
```

#### Example: requests that fail

```c
/* requests the controller or the card refuses */
static void demo_request_errors(void)
{
	struct sdhc_command cmd = { .opcode = SD_READ_SINGLE_BLOCK, .response_type = SD_RSP_TYPE_R1,
				    .retries = 0, .timeout_ms = 200 };
	struct sdhc_data data = { .block_addr = 0, .block_size = 512, .blocks = 1, .data = NULL,
				  .timeout_ms = 500 };
	int ret;

	ret = sdhc_request(sdhc, &cmd, &data);
	printk("[request] data without a buffer            = %s\n", err(ret));

	data.data = blocks;
	data.blocks = 0;
	ret = sdhc_request(sdhc, &cmd, &data);
	printk("[request] zero blocks                      = %s\n", err(ret));

	/* the card has RCA 0x0001; a command addressed to another RCA is ignored by it, so no response comes */
	ret = send(SD_SEND_STATUS, 0x1234 << 16, SD_RSP_TYPE_R1, &cmd);
	printk("[request] CMD13 to an address nobody has   = %s\n", err(ret));

	/* a block far beyond the end of the card: the card does not send the data */
	cmd.opcode = SD_READ_SINGLE_BLOCK;
	cmd.arg = 0xfffffff0;
	cmd.response_type = SD_RSP_TYPE_R1;
	data.blocks = 1;
	ret = sdhc_request(sdhc, &cmd, &data);
	printk("[request] CMD17 beyond the end of the card  = %s\n", err(ret));
}
```

```text
[request] data without a buffer            = -EINVAL
[request] zero blocks                      = -EINVAL
[request] CMD13 to an address nobody has   = -ETIMEDOUT
[request] CMD17 beyond the end of the card  = -ETIMEDOUT
```

### sdhc_card_busy

```c
int sdhc_card_busy(const struct device *dev);
```

Reads the DAT0 line: returns 1 while the card is busy (during a write or a programming step, DAT0 is held low) and 0 when it is idle.

```c
/* sdhc_card_busy: 1 while the card holds DAT0 low (during a write or a programming step) */
static void demo_card_busy(void)
{
	int ret = sdhc_card_busy(sdhc);

	printk("[busy] sdhc_card_busy = %d\n", ret);
}
```

```text
[busy] sdhc_card_busy = 0
```

### sdhc_execute_tuning

```c
int sdhc_execute_tuning(const struct device *dev);
```

Sampling-point tuning, needed only by the 1.8 V UHS modes (SDR50, SDR104). This controller does not support those modes, so it returns `-ENOTSUP`.

```c
/* sdhc_execute_tuning: only the UHS modes at 1.8 V need it, which this controller does not do */
static void demo_execute_tuning(void)
{
	int ret = sdhc_execute_tuning(sdhc);

	printk("[tuning] sdhc_execute_tuning = %s\n", err(ret));
}
```

```text
[tuning] sdhc_execute_tuning = -ENOTSUP
```

### sdhc_enable_interrupt

```c
int sdhc_enable_interrupt(const struct device *dev, sdhc_interrupt_cb_t callback, int sources, void *user_data);
```

Registers a callback. `sources` can be:

| Value | Meaning |
| --- | --- |
| `SDHC_INT_INSERTED` | Card inserted (an edge on the card detect pin; the driver implements it with a GPIO interrupt) |
| `SDHC_INT_REMOVED` | Card removed |
| `SDHC_INT_SDIO` | Interrupt of an SDIO card (the DAT1 line) |

The `reason` of the callback is one of the values above. The demo leaves the card in the slot for 100 milliseconds and no event occurs; the callback is called when the card is removed or inserted.

```c
static volatile int events;

static void on_card_event(const struct device *dev, int reason, const void *user_data)
{
	events++;
}

static void demo_enable_interrupt(void)
{
	int ret = sdhc_enable_interrupt(sdhc, on_card_event, SDHC_INT_INSERTED | SDHC_INT_REMOVED, NULL);

	printk("[irq] sdhc_enable_interrupt(inserted | removed) = %s\n", err(ret));
	k_msleep(100);
	printk("[irq] events in 100 ms with the card left alone = %d\n", events);
}
```

```text
[irq] sdhc_enable_interrupt(inserted | removed) = 0
[irq] events in 100 ms with the card left alone = 0
```

### sdhc_disable_interrupt

```c
int sdhc_disable_interrupt(const struct device *dev, int sources);
```

Switches off the given events; when the last card detect event is switched off, the GPIO interrupt of the card detect pin is switched off as well.

```c
/* sdhc_disable_interrupt: switch the events off again */
static void demo_disable_interrupt(void)
{
	int ret = sdhc_disable_interrupt(sdhc, SDHC_INT_INSERTED | SDHC_INT_REMOVED);

	printk("[irq] sdhc_disable_interrupt                   = %s\n", err(ret));
}
```

```text
[irq] sdhc_disable_interrupt                   = 0
```

## Complete demo program

All the examples and logs above come from this single program. Create a directory, put the files below in it, and it builds like any other Zephyr application.

```text
sdhc_api/
├── CMakeLists.txt
├── prj.conf
└── src/
    └── main.c
```

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(sdhc_api)

target_sources(app PRIVATE src/main.c)
```

### prj.conf

```ini
CONFIG_SDHC=y
CONFIG_PRINTK=y
CONFIG_MAIN_STACK_SIZE=4096
CONFIG_SHELL=n
CONFIG_DEVMEM_SHELL=n
CONFIG_LOG_PRINTK=n
```

### src/main.c

```c
/*
 * Calls every function of <zephyr/drivers/sdhc.h> on SMHC0 (the TF card slot of the YuzukiNeko). There is no disk
 * or file system layer here: the card is brought up by hand with the commands of the SD
 * specification, and a block is read with CMD17 and CMD18.
 */
#include <errno.h>
#include <string.h>
#include <zephyr/device.h>
#include <zephyr/drivers/sdhc.h>
#include <zephyr/kernel.h>
#include <zephyr/sd/sd_spec.h>
#include <zephyr/sys/printk.h>

static const struct device *const sdhc = DEVICE_DT_GET(DT_NODELABEL(smhc0));

static uint32_t rca;		/* relative card address, from CMD3 */
static bool block_addressed;	/* SDHC and SDXC cards: the address of a read is a block number */

static const char *err(int ret)
{
	switch (ret) {
	case 0:		return "0";
	case -EIO:	return "-EIO";
	case -EINVAL:	return "-EINVAL";
	case -ENOTSUP:	return "-ENOTSUP";
	case -ETIMEDOUT: return "-ETIMEDOUT";
	case -ENOSYS:	return "-ENOSYS";
	default:	return "?";
	}
}

/* one command without data */
static int send(uint32_t opcode, uint32_t arg, uint32_t response_type, struct sdhc_command *cmd)
{
	memset(cmd, 0, sizeof(*cmd));
	cmd->opcode = opcode;
	cmd->arg = arg;
	cmd->response_type = response_type;
	cmd->retries = 2;
	cmd->timeout_ms = 200;
	return sdhc_request(sdhc, cmd, NULL);
}

/* sdhc_get_host_props: what the controller can do */
static void demo_get_host_props(void)
{
	struct sdhc_host_props props;
	int ret = sdhc_get_host_props(sdhc, &props);

	printk("[props] sdhc_get_host_props = %s: clock %u..%u Hz, power-up delay %u ms\n", err(ret),
	       props.f_min, props.f_max, props.power_delay);
	printk("[props] 4 bit bus %d, 8 bit bus %d, high speed %d, 3.3 V %d, 3.0 V %d, 1.8 V %d, SDR50 %d, DDR50 %d, SPI mode %d\n",
	       props.host_caps.bus_4_bit_support, props.host_caps.bus_8_bit_support,
	       props.host_caps.high_spd_support, props.host_caps.vol_330_support,
	       props.host_caps.vol_300_support, props.host_caps.vol_180_support,
	       props.host_caps.sdr50_support, props.host_caps.ddr50_support, props.is_spi);
	printk("[props] SDIO card interrupt %d, max current at 3.3 V %u mA\n",
	       props.host_caps.sdio_async_interrupt_support, props.max_current_330);
}

/* sdhc_card_present: the card detect line (cd-gpios) */
static void demo_card_present(void)
{
	int ret = sdhc_card_present(sdhc);

	printk("[present] sdhc_card_present = %d\n", ret);
}

/* sdhc_hw_reset: reset the controller, the card keeps its state */
static void demo_hw_reset(void)
{
	int ret = sdhc_hw_reset(sdhc);

	printk("[reset] sdhc_hw_reset = %s\n", err(ret));
}

/* sdhc_set_io: power, clock, bus width and timing. A card starts in 1 bit mode at 400 kHz or less. */
static void demo_set_io(void)
{
	struct sdhc_io io = {
		.clock = 400000,
		.bus_mode = SDHC_BUSMODE_PUSHPULL,
		.power_mode = SDHC_POWER_ON,
		.bus_width = SDHC_BUS_WIDTH1BIT,
		.timing = SDHC_TIMING_LEGACY,
		.signal_voltage = SD_VOL_3_3_V,
	};
	int ret;

	ret = sdhc_set_io(sdhc, &io);
	printk("[io] power on, 400 kHz, 1 bit, legacy timing    = %s\n", err(ret));
	k_msleep(10);

	io.clock = 25000000;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] 25 MHz                                   = %s\n", err(ret));

	io.clock = 50000000;
	io.timing = SDHC_TIMING_HS;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] 50 MHz, high speed timing                = %s\n", err(ret));

	io.clock = 100000000;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] 100 MHz (above the maximum)               = %s\n", err(ret));

	io.clock = 100000;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] 100 kHz (below the minimum)               = %s\n", err(ret));

	io.clock = 400000;
	io.timing = SDHC_TIMING_LEGACY;
	io.signal_voltage = SD_VOL_1_8_V;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] 1.8 V signalling                          = %s\n", err(ret));

	io.signal_voltage = SD_VOL_3_3_V;
	io.bus_width = 3;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] a bus width of 3                          = %s\n", err(ret));

	io.bus_width = SDHC_BUS_WIDTH1BIT;
	ret = sdhc_set_io(sdhc, &io);
	printk("[io] back to 400 kHz, 1 bit, 3.3 V             = %s\n", err(ret));
}

/* sdhc_request without data: the identification of the card. Every step prints the response. */
static int bring_up_card(void)
{
	struct sdhc_command cmd;
	int ret;

	ret = send(SD_GO_IDLE_STATE, 0, SD_RSP_TYPE_NONE, &cmd);
	printk("[card] CMD0  go idle                       = %s\n", err(ret));

	/* CMD8: 2.7..3.6 V and a check pattern that the card repeats */
	ret = send(SD_SEND_IF_COND, SD_IF_COND_VHS_3V3 | SD_IF_COND_CHECK, SD_RSP_TYPE_R7, &cmd);
	printk("[card] CMD8  interface condition           = %s: R7 %08x\n", err(ret), cmd.response[0]);
	if (ret != 0) {
		return ret;
	}

	/* ACMD41: CMD55 first, then the operating condition, until the card says it is powered up */
	for (int i = 0; i < 100; i++) {
		ret = send(SD_APP_CMD, 0, SD_RSP_TYPE_R1, &cmd);
		if (ret == 0) {
			ret = send(SD_APP_SEND_OP_COND, SD_OCR_HOST_CAP_FLAG | 0x00ff8000, SD_RSP_TYPE_R3, &cmd);
		}
		if (ret != 0 || (cmd.response[0] & SD_OCR_PWR_BUSY_FLAG)) {
			break;
		}
		k_msleep(10);
	}
	block_addressed = (cmd.response[0] & SD_OCR_CARD_CAP_FLAG) != 0;
	printk("[card] ACMD41 operating condition          = %s: OCR %08x, %s\n", err(ret), cmd.response[0],
	       block_addressed ? "block addressed (SDHC/SDXC)" : "byte addressed");
	if (ret != 0) {
		return ret;
	}

	ret = send(SD_ALL_SEND_CID, 0, SD_RSP_TYPE_R2, &cmd);
	printk("[card] CMD2  CID                           = %s: %08x %08x %08x %08x\n", err(ret),
	       cmd.response[0], cmd.response[1], cmd.response[2], cmd.response[3]);

	ret = send(SD_SEND_RELATIVE_ADDR, 0, SD_RSP_TYPE_R6, &cmd);
	rca = cmd.response[0] >> 16;
	printk("[card] CMD3  relative address              = %s: RCA %04x\n", err(ret), rca);

	ret = send(SD_SEND_CSD, rca << 16, SD_RSP_TYPE_R2, &cmd);
	printk("[card] CMD9  CSD                           = %s: %08x %08x %08x %08x\n", err(ret),
	       cmd.response[0], cmd.response[1], cmd.response[2], cmd.response[3]);

	ret = send(SD_SELECT_CARD, rca << 16, SD_RSP_TYPE_R1b, &cmd);
	printk("[card] CMD7  select the card               = %s\n", err(ret));
	return ret;
}

/* switch to 4 data lines: ACMD6 tells the card, sdhc_set_io tells the controller */
static void bus_width_4(void)
{
	struct sdhc_command cmd;
	struct sdhc_io io = {
		.clock = 25000000,
		.bus_mode = SDHC_BUSMODE_PUSHPULL,
		.power_mode = SDHC_POWER_ON,
		.bus_width = SDHC_BUS_WIDTH4BIT,
		.timing = SDHC_TIMING_LEGACY,
		.signal_voltage = SD_VOL_3_3_V,
	};
	int ret = send(SD_APP_CMD, rca << 16, SD_RSP_TYPE_R1, &cmd);

	if (ret == 0) {
		ret = send(SD_APP_SET_BUS_WIDTH, 2, SD_RSP_TYPE_R1, &cmd);	/* 2 = 4 bit bus */
	}
	if (ret == 0) {
		ret = sdhc_set_io(sdhc, &io);
	}
	printk("[card] ACMD6 4 bit bus, 25 MHz            = %s\n", err(ret));
}

/* sdhc_request with data: CMD17 reads one block. The buffer is 64 byte aligned for the DMA. */
static uint8_t blocks[8 * 512] __aligned(64);

static void demo_request_read_one(void)
{
	struct sdhc_command cmd = { .opcode = SD_READ_SINGLE_BLOCK, .response_type = SD_RSP_TYPE_R1,
				    .retries = 2, .timeout_ms = 200 };
	struct sdhc_data data = { .block_addr = 0, .block_size = 512, .blocks = 1, .data = blocks,
				  .timeout_ms = 500 };
	int ret;

	cmd.arg = block_addressed ? 0 : 0 * 512;
	ret = sdhc_request(sdhc, &cmd, &data);
	printk("[read1] CMD17 block 0                      = %s: %u bytes, R1 %08x, signature %02x %02x\n",
	       err(ret), data.bytes_xfered, cmd.response[0], blocks[510], blocks[511]);
}

/* CMD18 reads several blocks; the controller ends the transfer itself, no CMD12 is needed. */
static void demo_request_read_many(void)
{
	struct sdhc_command cmd = { .opcode = SD_READ_MULTIPLE_BLOCK, .response_type = SD_RSP_TYPE_R1,
				    .retries = 2, .timeout_ms = 200 };
	struct sdhc_data data = { .block_addr = 0, .block_size = 512, .blocks = 8, .data = blocks,
				  .timeout_ms = 1000 };
	static uint8_t first[512];
	int ret;

	memcpy(first, blocks, sizeof(first));
	memset(blocks, 0, sizeof(blocks));
	cmd.arg = block_addressed ? 0 : 0;
	ret = sdhc_request(sdhc, &cmd, &data);
	printk("[readN] CMD18 8 blocks from 0               = %s: %u bytes, first block %s\n", err(ret),
	       data.bytes_xfered, memcmp(first, blocks, 512) == 0 ? "same as CMD17" : "DIFFERENT");
}

/* the card state after all this: CMD13 returns the status register */
static void demo_request_status(void)
{
	struct sdhc_command cmd;
	int ret = send(SD_SEND_STATUS, rca << 16, SD_RSP_TYPE_R1, &cmd);

	printk("[status] CMD13 card status                 = %s: R1 %08x, state %u (4 = transfer)\n",
	       err(ret), cmd.response[0], (cmd.response[0] >> 9) & 0xf);
}

/* requests the controller or the card refuses */
static void demo_request_errors(void)
{
	struct sdhc_command cmd = { .opcode = SD_READ_SINGLE_BLOCK, .response_type = SD_RSP_TYPE_R1,
				    .retries = 0, .timeout_ms = 200 };
	struct sdhc_data data = { .block_addr = 0, .block_size = 512, .blocks = 1, .data = NULL,
				  .timeout_ms = 500 };
	int ret;

	ret = sdhc_request(sdhc, &cmd, &data);
	printk("[request] data without a buffer            = %s\n", err(ret));

	data.data = blocks;
	data.blocks = 0;
	ret = sdhc_request(sdhc, &cmd, &data);
	printk("[request] zero blocks                      = %s\n", err(ret));

	/* the card has RCA 0x0001; a command addressed to another RCA is ignored by it, so no response comes */
	ret = send(SD_SEND_STATUS, 0x1234 << 16, SD_RSP_TYPE_R1, &cmd);
	printk("[request] CMD13 to an address nobody has   = %s\n", err(ret));

	/* a block far beyond the end of the card: the card does not send the data */
	cmd.opcode = SD_READ_SINGLE_BLOCK;
	cmd.arg = 0xfffffff0;
	cmd.response_type = SD_RSP_TYPE_R1;
	data.blocks = 1;
	ret = sdhc_request(sdhc, &cmd, &data);
	printk("[request] CMD17 beyond the end of the card  = %s\n", err(ret));
}

/* sdhc_card_busy: 1 while the card holds DAT0 low (during a write or a programming step) */
static void demo_card_busy(void)
{
	int ret = sdhc_card_busy(sdhc);

	printk("[busy] sdhc_card_busy = %d\n", ret);
}

/* sdhc_execute_tuning: only the UHS modes at 1.8 V need it, which this controller does not do */
static void demo_execute_tuning(void)
{
	int ret = sdhc_execute_tuning(sdhc);

	printk("[tuning] sdhc_execute_tuning = %s\n", err(ret));
}

/* sdhc_enable_interrupt: a callback for card insertion and removal (the card detect line) */
static volatile int events;

static void on_card_event(const struct device *dev, int reason, const void *user_data)
{
	events++;
}

static void demo_enable_interrupt(void)
{
	int ret = sdhc_enable_interrupt(sdhc, on_card_event, SDHC_INT_INSERTED | SDHC_INT_REMOVED, NULL);

	printk("[irq] sdhc_enable_interrupt(inserted | removed) = %s\n", err(ret));
	k_msleep(100);
	printk("[irq] events in 100 ms with the card left alone = %d\n", events);
}

/* sdhc_disable_interrupt: switch the events off again */
static void demo_disable_interrupt(void)
{
	int ret = sdhc_disable_interrupt(sdhc, SDHC_INT_INSERTED | SDHC_INT_REMOVED);

	printk("[irq] sdhc_disable_interrupt                   = %s\n", err(ret));
}

int main(void)
{
	if (!device_is_ready(sdhc)) {
		printk("sdhc not ready\n");
		return 0;
	}

	demo_get_host_props();
	demo_card_present();
	demo_hw_reset();
	demo_set_io();
	if (bring_up_card() == 0) {
		bus_width_4();
		demo_request_read_one();
		demo_request_read_many();
		demo_request_status();
		demo_request_errors();
		demo_card_busy();
	}
	demo_execute_tuning();
	demo_enable_interrupt();
	demo_disable_interrupt();

	printk("sdhc_api done\n");
	return 0;
}
```

### Build and run

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/sdhc-api sdhc_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-sdhc/build.cast" data-speed="6"></div>

For how to download and run it, see [Build and run](../zephyr-build-run.md). Insert the TF card into the slot before running. The complete output on the UART1 console:

```text
[props] sdhc_get_host_props = 0: clock 400000..50000000 Hz, power-up delay 500 ms
[props] 4 bit bus 1, 8 bit bus 0, high speed 1, 3.3 V 1, 3.0 V 0, 1.8 V 0, SDR50 0, DDR50 0, SPI mode 0
[props] SDIO card interrupt 1, max current at 3.3 V 200 mA
[present] sdhc_card_present = 1
[reset] sdhc_hw_reset = 0
[io] power on, 400 kHz, 1 bit, legacy timing    = 0
[io] 25 MHz                                   = 0
[io] 50 MHz, high speed timing                = 0
[io] 100 MHz (above the maximum)               = -EINVAL
[io] 100 kHz (below the minimum)               = -EINVAL
[io] 1.8 V signalling                          = -ENOTSUP
[io] a bus width of 3                          = -EINVAL
[io] back to 400 kHz, 1 bit, 3.3 V             = 0
[card] CMD0  go idle                       = 0
[card] CMD8  interface condition           = 0: R7 000001aa
[card] ACMD41 operating condition          = 0: OCR c0ff8000, block addressed (SDHC/SDXC)
[card] CMD2  CID                           = 0: 7f01a775 2200006e 73646667 05000c61
[card] CMD3  relative address              = 0: RCA 0001
[card] CMD9  CSD                           = 0: 0a404023 3bff7f80 5b590000 400e0032
[card] CMD7  select the card               = 0
[card] ACMD6 4 bit bus, 25 MHz            = 0
[read1] CMD17 block 0                      = 0: 512 bytes, R1 00000900, signature 55 aa
[readN] CMD18 8 blocks from 0               = 0: 4096 bytes, first block same as CMD17
[status] CMD13 card status                 = 0: R1 00000900, state 4 (4 = transfer)
[request] data without a buffer            = -EINVAL
[request] zero blocks                      = -EINVAL
[request] CMD13 to an address nobody has   = -ETIMEDOUT
[request] CMD17 beyond the end of the card  = -ETIMEDOUT
[busy] sdhc_card_busy = 0
[tuning] sdhc_execute_tuning = -ENOTSUP
[irq] sdhc_enable_interrupt(inserted | removed) = 0
[irq] events in 100 ms with the card left alone = 0
[irq] sdhc_disable_interrupt                   = 0
sdhc_api done
```

The two lines `<err> sdhc_sunxi: unsupported clock ...` are log messages the driver prints when `sdhc_set_io` rejects an out-of-range clock; they are emitted later and appear after the program output.

The driver's own stress test example is `samples/drivers/sdhc_sunxi`: raw reads and writes with various buffer alignments, plus the writing, reading back and comparison of a 1 MiB pseudo-random file.
