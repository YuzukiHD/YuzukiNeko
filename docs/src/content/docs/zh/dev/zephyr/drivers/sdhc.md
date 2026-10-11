---
title: "SDHC 主机控制器"
---

F101 有两个 SD/MMC 主机控制器（SMHC）：`smhc0` 接板上的 TF 卡槽，`smhc2` 接 WiFi 模块的 SDIO。Zephyr 里的驱动是 `drivers/sdhc/sdhc_sunxi.c`，实现的是 SD 主机控制器接口 `<zephyr/drivers/sdhc.h>`。

这一层只管“控制器”：发命令、收响应、搬数据块、设时钟和总线宽度、检测卡。卡的识别流程、磁盘接口和文件系统是在它上面的另一层，不属于这个驱动（后面由单独的 Zephyr 组件提供）。所以本文的演示不用磁盘和文件系统，而是直接用 SD 规范里的命令把卡一步步初始化起来。

| 项目 | 内容 |
| --- | --- |
| 设备 | `smhc0`（TF 卡槽）、`smhc2`（WiFi SDIO） |
| 总线宽度 | 1 位、4 位、8 位由设备树 `bus-width` 决定；`yuzukineko` 的卡槽是 4 位 |
| 时钟 | 400 kHz（识别）…50 MHz（高速模式） |
| 电压 | 3.3 V；不支持 1.8 V 的 UHS 模式（SDR50、DDR50 都是 0） |
| 卡检测 | `cd-gpios`，`yuzukineko` 用 PF6，低电平表示有卡 |
| 传输 | DMA（内部描述符），不对齐的缓冲区经过驱动里的弹跳缓冲区 |
| 卡类型 | SD 卡（本文演示）；`smhc2` 接 SDIO 的 WiFi 芯片；不支持 SPI 模式 |

## 设备树

| 文件 | 作用 |
| --- | --- |
| `dts/bindings/sdhc/allwinner,sunxi-smhc.yaml` | 绑定 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 设备树：`smhc0`、`smhc2`，默认 `disabled` |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | 板级设备树：引脚组、`bus-width`、`cd-gpios` |

### SoC 设备树：sun252i_f101.dtsi

```c
smhc0: mmc@4020000 {
	/* 匹配驱动 sdhc_sunxi.c 里的 DT_DRV_COMPAT allwinner_sunxi_smhc */
	compatible = "allwinner,sunxi-smhc";

	/* 寄存器窗口：基址 0x04020000，长度 0x1000 */
	reg = <0x04020000 0x1000>;

	/* 中断：PLIC 的 40 号，优先级 1 */
	interrupts = <40 1>;
	interrupt-parent = <&plic>;

	/* 模块时钟（产生卡时钟）和总线时钟，顺序和 clock-names 对应 */
	clocks = <&cctl CLK_SMHC0>, <&cctl CLK_BUS_SMHC0>;
	clock-names = "mod", "bus";
	resets = <&rctl RST_BUS_SMHC0>;

	/* 模块时钟寄存器在 CCU 里的偏移：时钟源、分频和门控 */
	clock-reg = <0x830>;

	/* 主机能跑的最高时钟 */
	max-bus-freq = <50000000>;

	status = "disabled";
};
```

| 节点 | 标签 | 寄存器 | PLIC 中断号 | `clock-reg` | 用途 |
| --- | --- | --- | --- | --- | --- |
| `mmc@4020000` | `smhc0` | `0x04020000` | 40 | `0x830` | TF 卡槽 |
| `mmc@4022000` | `smhc2` | `0x04022000` | 42 | `0x838` | WiFi（AIC8800D40）SDIO |

### 板级设备树：yuzukineko.dts

```c
&pio {
	/* TF 卡槽在 PF0…PF5，复用功能 2：PF2 是 CLK，PF3 是 CMD，PF1/PF0/PF5/PF4 是 D0…D3。
	 * 和 JTAG 共用这组脚。 */
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

	/* 4 位数据线 */
	bus-width = <4>;

	/* 卡检测：PF6，有卡时为低电平 */
	cd-gpios = <&gpiof 6 GPIO_ACTIVE_LOW>;
	status = "okay";

	/* 磁盘：这个子节点是上层磁盘接口用的，让 Zephyr 的磁盘子系统出现一个名叫 "SD" 的磁盘。
	 * 本文的演示不用它，直接操作控制器 */
	sdmmc {
		compatible = "zephyr,sdmmc-disk";
		disk-name = "SD";
		status = "okay";
	};
};
```

`smhc2` 的写法一样，只是 `non-removable;` 代替 `cd-gpios`，下面不挂磁盘节点，挂的是 WiFi 芯片的节点。

### 绑定：allwinner,sunxi-smhc.yaml

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

| 属性 | 必填 | 含义 |
| --- | --- | --- |
| `reg`、`interrupts` | 是 | 寄存器窗口、中断 |
| `clocks`、`clock-names` | 是 | 模块时钟 `mod` 和总线时钟 `bus` |
| `resets` | 是 | 总线复位 |
| `clock-reg` | 是 | 模块时钟寄存器在 CCU 里的偏移 |
| `max-bus-freq` | 来自 `sdhc.yaml` | 主机支持的最高时钟 |
| `bus-width` | 否，4 | 接线的数据线数：1、4 或 8 |
| `cd-gpios` | 否 | 卡检测引脚；有卡时是低电平就写 `GPIO_ACTIVE_LOW` |
| `pwr-gpios` | 否 | 开关卡供电的 GPIO |
| `non-removable` | 否 | 卡焊死在板上（eMMC、SDIO 模块），始终存在 |
| `pinctrl-0`、`pinctrl-names` | 否 | 引脚，见 [GPIO 页的 pinctrl 一节](gpio.md#引脚复用pinctrl) |

## Kconfig

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `CONFIG_SDHC` | 应用里设为 `y` | 打开 SD 主机控制器子系统 |
| `CONFIG_SDHC_SUNXI` | `y`（依赖 `DT_HAS_ALLWINNER_SUNXI_SMHC_ENABLED`） | 编译这个驱动，并选中 `PINCTRL`、`GPIO`、`CACHE_MANAGEMENT` |
| `CONFIG_SDHC_SUNXI_MAX_DESC` | 128 | DMA 描述符个数，每个描述符搬运最多 8 KiB，所以这个值限制一次 DMA 传输的大小（128 个是 1 MiB）；更大的请求由 CPU 传输 |
| `CONFIG_SDHC_SUNXI_BOUNCE_KB` | 64 | 弹跳缓冲区大小（KiB）。DMA 要缓存行对齐的内存，其他内存经过这块缓冲区，由 CPU 拷贝，第一次用时从内核堆里分配；更大的请求只用 CPU 传输。0 关闭弹跳缓冲区 |

## 接口详解

演示在 `yuzukineko` 上，卡槽里有一张 SDHC 卡，直接用 `sdhc_*` 函数操作控制器。每个接口一个小标题，下面是它的原型、行为和一个完整的示例函数。

演示里重复用到的两个全局变量和辅助函数：

```c
static const struct device *const sdhc = DEVICE_DT_GET(DT_NODELABEL(smhc0));

static uint32_t rca;		/* 卡的相对地址，来自 CMD3 */
static bool block_addressed;	/* SDHC、SDXC 卡：读命令的参数是块号 */

/* 发一条没有数据的命令 */
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

读控制器的能力：时钟范围、总线宽度、电压、速度模式，以及上电延时。

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

读卡检测：有卡返回 1，没有返回 0。控制器节点有 `non-removable` 或没有 `cd-gpios` 时一直返回 1。

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

复位控制器，卡本身的状态不变。

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

设置供电、时钟、总线宽度和时序。卡上电后是 1 位总线，时钟不能超过 400 kHz，识别完以后才提高。

| `sdhc_io` 的字段 | 驱动的行为 |
| --- | --- |
| `clock` | 0，或者在 `f_min`…`f_max`（400 kHz…50 MHz）之间；超出范围返回 `-EINVAL`，并在日志里打印 `unsupported clock` |
| `power_mode` | `SDHC_POWER_ON` / `SDHC_POWER_OFF`；节点有 `pwr-gpios` 时同时切换这个 GPIO，关电源时时钟清零 |
| `bus_width` | 1、4、8；别的值返回 `-EINVAL` |
| `timing` | `SDHC_TIMING_DDR50`、`DDR52` 打开双沿采样，其余是单沿 |
| `signal_voltage` | 3.3 V；1.8 V、1.2 V 返回 `-ENOTSUP` |

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

发一条命令，需要数据的话带上 `data`。`struct sdhc_command` 填命令号、参数、期望的响应类型（`SD_RSP_TYPE_R1` 等，在 `<zephyr/sd/sd_spec.h>`）、重试次数和超时；响应在 `cmd->response[]` 里返回，R2 响应是 4 个字。`struct sdhc_data` 填起始块、块大小、块数、缓冲区和超时，传完后 `bytes_xfered` 是实际传输的字节数。

| 情况 | 返回 |
| --- | --- |
| 成功 | 0 |
| 带 `data` 但块大小、块数是 0 或缓冲区是 NULL | `-EINVAL` |
| 命令超时、数据超时 | `-ETIMEDOUT` |
| 响应或数据校验错误 | `-EIO`，驱动会按 `retries` 重试 |

读写数据用 DMA，缓冲区要对齐到缓存行（64 字节），否则经过驱动的弹跳缓冲区。多块读写（CMD18、CMD25）由控制器自己在最后发 CMD12，应用不要再发。

下面分几个示例。

#### 示例：识别卡

不带数据的命令。顺序是 SD 规范规定的：CMD0 复位，CMD8 检查电压，CMD55 加 ACMD41 反复询问直到卡上电完成，CMD2 读卡标识，CMD3 要相对地址，CMD9 读卡的特性数据，CMD7 选中卡。

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

`OCR c0ff8000`：最高位表示上电完成，第二位（CCS）表示是块寻址的 SDHC/SDXC 卡。

#### 示例：切到 4 位总线

ACMD6 通知卡，`sdhc_set_io` 通知控制器，同时把时钟提到 25 MHz。

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

#### 示例：读一个块

CMD17，带 `sdhc_data`。块 0 的最后两个字节是启动签名 `55 aa`。

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

#### 示例：读多个块

CMD18 一次读 8 块（4096 字节），不需要再发 CMD12。第一个块和 CMD17 读到的一样。

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

#### 示例：读卡状态

CMD13 的响应是卡的状态寄存器，第 9…12 位是卡的状态，4 表示传输状态。

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

#### 示例：出错的请求

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

读 DAT0 线：卡正忙（写入或编程中，DAT0 被拉低）返回 1，空闲返回 0。

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

采样点调谐，只有 1.8 V 的 UHS 模式（SDR50、SDR104）需要。这个控制器不支持这些模式，所以返回 `-ENOTSUP`。

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

注册回调。`sources` 可以是：

| 取值 | 含义 |
| --- | --- |
| `SDHC_INT_INSERTED` | 卡插入（卡检测引脚上的边沿，驱动用 GPIO 中断实现） |
| `SDHC_INT_REMOVED` | 卡拔出 |
| `SDHC_INT_SDIO` | SDIO 卡的中断（DAT1 线） |

回调的 `reason` 是上面某个值。演示把卡留在槽里 100 毫秒，没有事件；拔出或插入卡时回调会被调用。

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

关掉指定的事件；关掉最后一个卡检测事件时，同时关掉卡检测引脚的 GPIO 中断。

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

## 完整演示程序

上面所有示例和日志都来自这一个程序。建一个目录，放进下面的文件，就可以像其他 Zephyr 应用一样编译。

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

### 编译和运行

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/sdhc-api sdhc_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-sdhc/build.cast" data-speed="6"></div>

下载运行的方法见[编译与运行](../zephyr-build-run.md)。运行前把 TF 卡插进卡槽。控制台 UART1 上的完整输出：

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

两行 `<err> sdhc_sunxi: unsupported clock ...` 是 `sdhc_set_io` 拒绝超范围时钟时驱动打的日志，延迟输出，排在程序输出后面。

驱动自己的压力测试示例是 `samples/drivers/sdhc_sunxi`：多种缓冲区对齐的原始读写，加一个 1 MiB 伪随机文件的写入、读回和比较。
