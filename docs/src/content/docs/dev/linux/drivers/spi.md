---
title: "SPI and DMA"
---

The general-purpose SPI controllers of the F101 are the classic Allwinner design: a 64-byte FIFO in each direction, a programmable clock divider, quad and dual mode, and a pair of DMA request lines. Two controllers exist. The board uses the first one to reach the 16 MiB NOR flash that holds the whole system, and because the flash is read constantly, those transfers are moved by the `sun6i-dma` engine rather than by the CPU.

This chapter covers the register set and the transfer path, the devicetree for both controllers and the DMA engine, the probe and DMA code paths, and the way the flash shows up in user space through MTD. The dedicated flash controller (SPIF) that can drive the same flash on the same pads is described in [SPIF - SPI NOR flash](spif-nor.md).

| Item | Content |
| --- | --- |
| Driver | `drivers/spi/spi-sun6i.c`, DMA engine `drivers/dma/sun6i-dma.c` |
| Compatible | `allwinner,sun252i-f101-spi`, `allwinner,sun50i-r329-spi` |
| Base | `0x04025000` (SPI0), `0x04026000` (SPI1) |
| Register window | `0x1000` bytes |
| Interrupts | PLIC 15 (SPI0), PLIC 16 (SPI1) |
| DMA requests | 22 (SPI0), 23 (SPI1), one line per controller for both directions |
| Clocks | `ahb` (`CLK_BUS_SPI0/1`), `mod` (`CLK_SPI0/1`) |
| Reset | `RST_BUS_SPI0/1` |
| Kconfig | `CONFIG_SPI`, `CONFIG_SPI_SUN6I`, `CONFIG_DMADEVICES`, `CONFIG_DMA_SUN6I` |
| Userspace | None directly; the flash appears as `/dev/mtd*` |

## How the controller works

The controller is a byte-oriented engine with separate transmit and receive FIFOs. A transfer is set up by writing the transfer control register, the FIFO trigger levels and the counts, pushing the first bytes into the transmit FIFO, and setting the exchange bit. The controller then shifts bits out on SCK according to the clock phase and polarity, and fills the receive FIFO with whatever came back. Completion raises the transfer-complete interrupt; the FIFO interrupts keep the pipeline fed and drained.

The registers, from `spi-sun6i.c`:

| Offset | Register | Purpose |
| --- | --- | --- |
| `0x04` | GBL_CTL | Bus enable (bit 0), master mode (bit 1), transmit pause (bit 7), soft reset (bit 31) |
| `0x08` | TFR_CTL | CPHA, CPOL, CS polarity and level, LSB first, dummy-byte mode, sample mode, exchange start |
| `0x10` | INT_CTL | Receive-ready, transmit-empty, receive-overflow and transfer-complete enables |
| `0x14` | INT_STA | The same four bits as status; write one to clear |
| `0x18` | FIFO_CTL | Receive and transmit trigger levels, DMA request enables, FIFO resets |
| `0x1c` | FIFO_STA | Receive FIFO count in bits 7:0, transmit FIFO count in bits 23:16 |
| `0x24` | CLK_CTL | CDR1/CDR2 divider and DRS select; not used on the F101 variant |
| `0x30` | BURST_CNT | Number of bursts, written with the transfer length |
| `0x34` | XMIT_CNT | Number of bytes to transmit |
| `0x38` | BURST_CTL_CNT | Burst control: single count, dual or quad enable |
| `0x200` | TXDATA | Transmit FIFO |
| `0x300` | RXDATA | Receive FIFO |

The transfer control register is where the bus mode lives. `CPHA` (bit 0) and `CPOL` (bit 1) come from the `spi_device` mode. `SPOL` (bit 2) inverts the chip-select polarity, `FBS` (bit 12) selects LSB-first, `CS_MANUAL` (bit 6) lets the driver drive `CS_LEVEL` (bit 7) itself, and `XCH` (bit 31) starts the transfer. `DHB` (bit 8) discards the received bytes so a transmit-only transfer does not fill the receive FIFO with junk; the driver sets it when `tfr->rx_buf` is NULL.

`SDM` (bit 13) and `SDC` (bit 11) select the sample point. This is the part that matters at high frequency, because the controller has no delay line: it can only sample on the normal clock edge, half a cycle later, or a whole cycle later. With `has_clk_ctl` false, which is the F101 configuration, the driver sets it from the clock it actually got:

| Effective SCK | `SDM` | `SDC` | Sampling |
| --- | --- | --- | --- |
| up to 24 MHz | 1 | 0 | Normal sample mode |
| 24 to 80 MHz | 0 | 0 | Delay half-cycle sample mode |
| 80 MHz and above | 0 | 1 | Delay one-cycle sample mode |

The names are the driver's own. The board asks for 100 MHz, so if the CCU can produce that rate the one-cycle setting is used; the flash's output delay and the board's trace length are what make that the right choice, which is why `spi-max-frequency` is a board property.

The chip select is driven by the controller. `num_chipselect` is 4 and `use_gpio_descriptors` makes the core look for `cs-gpios` first; the board declares none, so the native CS output is used. `sun6i_spi_set_cs()` only selects the chip-select number and raises or lowers `CS_LEVEL`; it does not toggle a GPIO. `XCH` is set once per transfer, so CS stays asserted for the whole message, address and dummy phases included.

### FIFO and interrupt behaviour

The FIFO depth is 64 bytes for the F101 variant (`SUN8I_FIFO_DEPTH`, the same value as the H3 and R329). The trigger level depends on the path:

- **PIO.** The driver sets the trigger to three quarters of the depth, 48 bytes, and enables the receive-ready and transmit-empty interrupts only when the transfer is longer than the FIFO. A short transfer is completely contained in the FIFO and completes on the single transfer-complete interrupt.
- **DMA.** The trigger is half the depth, 32 bytes, and that value doubles as the DMA burst length. Both DMA request enables are set according to the direction.

The interrupt handler is `sun6i_spi_handler()`. On transfer complete it clears the bit and completes `sspi->done`. On receive-ready it drains the whole receive FIFO with `sun6i_spi_drain_fifo()` and clears the bit afterwards, so a byte arriving between the drain and the clear does not get lost. On transmit-empty it refills from the buffer with `sun6i_spi_fill_fifo()` and disables the interrupt once nothing is left. The order — service first, clear after — is deliberate and is repeated in the comments.

### Clocking

The module clock `mod` is produced by the CCU at `0x0940` for SPI0 and `0x0944` for SPI1. It is a mux over `dcxo24M`, `pll-peri-1x`, `pll-peri-2x` and two audio PLL dividers, followed by an `M` divider (1 to 16) and a `P` divider (1, 2, 4, 8), with a gate in bit 31. The driver does not touch the divider register at all: `has_clk_ctl = false` means it calls `clk_set_rate(sspi->mclk, tfr->speed_hz)` and then reads back `clk_get_rate()` into `tfr->effective_speed_hz`. The clock framework picks the parent and dividers, and the sample mode is chosen from the rate that came back, not from the rate that was asked for.

The driver advertises `max_speed_hz = 100 MHz` and `min_speed_hz = 3 kHz`, eight bits per word only, four chip selects, and the quad and dual mode bits from the variant configuration.

The `clock-frequency = <100000000>` property in the node is not read by `spi-sun6i`; the host ceiling is the constant in the driver, and the per-transfer rate comes from `spi-max-frequency` on the child device. The property is kept for documentation and for other consumers of the node, not as a driver input.

Because the rate is set per transfer, two devices on the same controller with different `spi-max-frequency` values change the CCU clock between messages, and the sample mode is recomputed each time. That is why the mode is derived from `effective_speed_hz` rather than cached at probe.

A single transfer is limited to `SUN6I_MAX_XFER_SIZE - 1`, that is 16 MiB minus one byte.

## The DMA engine

The `sun6i-dma` block at `0x03002000` is a descriptor-based engine with 12 channel registers and 64 request lines, of which the devicetree exposes eight channels:

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

Only channels 0 to 7 raise their interrupt; the block has registers for 12, but the upper four cannot report completion, so `sun252i_f101_dma_cfg` is used with `dma-channels = <8>` to limit the driver to the usable ones. The probe comment in `sun6i-dma.c` says so explicitly.

The F101 configuration differs from the H3 in two ways, both in `sun6i_enable_clock_autogate_f101()`:

- It writes `0x7` to the gate register at `0x28`. That is the three automatic clock-gating bits, and setting them turns the automatic gating off, as the vendor setup does. A gated channel would never complete a transfer.
- It writes all channel bits to the secure register at `0x20`, marking every channel non-secure, again matching the vendor setup.

The capabilities the driver registers are memory-to-memory copy, slave SG and cyclic transfers; `copy_align` is 4 bytes, the maximum segment is 32 MiB minus one, and the supported address widths are 1, 2, 4 and 8 bytes with burst lengths of 1, 4, 8 and 16.

### How SPI uses it

`spi-sun6i.c` requests the `"rx"` and `"tx"` channels by name in probe. Both DT entries point at request 22 for SPI0, and 23 for SPI1: one request line per controller, used for either direction. `sun6i_spi_can_dma()` hands a transfer to the engine only when `xfer->len > fifo_depth`, so anything up to 64 bytes stays in PIO mode.

`sun6i_spi_prepare_dma()` builds the slave scatter-gather descriptors. The receive side is configured for `DMA_DEV_TO_MEM` from `RXDATA`, with a 4-byte bus width when `dma_rx_word` is set and every scatterlist entry is 4-byte aligned in both address and length; otherwise it falls back to 1-byte accesses. The transmit side is always 4-byte wide from the buffer to `TXDATA`. Both use a maximum burst of 8. The receive descriptor gets a callback that completes `sspi->dma_rx_done`, because the SPI transfer-complete interrupt can arrive while the last receive burst is still in flight; `sun6i_spi_transfer_one()` waits for that second completion before returning.

If either descriptor cannot be prepared, the driver terminates the receive channel if it had already been submitted, returns an error, and `transfer_one()` logs "prepare DMA failed". If the wait times out it logs the transfer size, rate and elapsed milliseconds, terminates both channels and returns `-ETIMEDOUT`.

### Cache coherency

The SoC bus is declared `dma-noncoherent`, so the buffer mappings matter. The SPI core maps the transfer buffers with `dma_map_sg()` before the driver is called, and unmaps them afterwards; the mapping calls are what perform the cache maintenance on this part. The DMA engine's descriptor list lives in memory from a DMA pool, and the SPI controller's own register accesses are posted writes; the driver does not need a flush between writing FIFO data and setting `XCH`. When changing the DMA setup, keep the descriptor submission before `dma_async_issue_pending()`, which is what the existing code does.

## Devicetree

The two controllers are the same template:

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

| Label | Node | Base | PLIC | DRQ | Pins | Board |
| --- | --- | --- | --- | --- | --- | --- |
| `spi0` | `spi@4025000` | `0x04025000` | 15 | 22 | `PC0`-`PC5` | Enabled, NOR flash |
| `spi1` | `spi@4026000` | `0x04026000` | 16 | 23 | `PD0`-`PD3` | Disabled |

The board file enables SPI0 and puts the flash on chip select 0:

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

The pin group covers all six `PC` pads:

```text
spi0_pc_pins: spi0-pc-pins {
	pins = "PC0", "PC1", "PC2", "PC3", "PC4", "PC5";
	function = "spi0";
};
```

`spi1` has its own group on `PD0`-`PD3` (`spi1_pd_pins`, function `spi1`), but the board never enables it. The `PC` pads are shared between SPI0, the SPIF controller and the SMHC2 eMMC controller; all three groups list the same six pins, and only one function can be routed at a time. The devicetree variant `sun252i-f101-yuzukineko-spif.dts` disables SPI0 and enables SPIF on the same pads.

The flash node is `jedec,spi-nor`, and the six partitions are included from `sun252i-f101-nor-partitions.dtsi`:

| MTD | Label | Offset | Size | Access |
| --- | --- | --- | --- | --- |
| `mtd0` | `bootloader` | `0x000000` | 64 KiB | read-only |
| `mtd1` | `dtb` | `0x010000` | 256 KiB | read-only |
| `mtd2` | `opensbi` | `0x050000` | 512 KiB | read-only |
| `mtd3` | `kernel` | `0x0d0000` | 6 MiB | read-only |
| `mtd4` | `rootfs` | `0x6d0000` | 8 MiB plus 192 KiB | read-only |
| `mtd5` | `overlay` | `0xf00000` | 1 MiB | writable |

The bindings are `Documentation/devicetree/bindings/spi/allwinner,sun6i-a31-spi.yaml` for the controller and `Documentation/devicetree/bindings/mtd/jedec,spi-nor.yaml` for the flash. The controller binding requires `reg`, `interrupts`, `clocks` and `clock-names`, and the F101 compatible is listed together with `allwinner,sun50i-r329-spi` as its fallback.

## Kconfig

```text
CONFIG_SPI=y
CONFIG_SPI_SUN6I=y
CONFIG_DMADEVICES=y
CONFIG_DMA_SUN6I=y
```

`CONFIG_SPI` is the bus core, `CONFIG_SPI_SUN6I` the controller (it depends on `ARCH_SUNXI` and `RESET_CONTROLLER`), `CONFIG_DMADEVICES` the DMA engine framework and `CONFIG_DMA_SUN6I` the sun6i engine, which selects `DMA_ENGINE` and `DMA_VIRTUAL_CHANNELS`. The board defconfig sets all four, and also `CONFIG_MTD`, `CONFIG_MTD_BLOCK`, `CONFIG_MTD_OF_PARTS` and `CONFIG_MTD_SPI_NOR` for the flash side.

`CONFIG_SPI_SPIDEV` is *not* enabled, so there is no `/dev/spidev*` even if a node had a spidev-compatible string.

## Driver internals

### Probe path

`sun6i_spi_probe()`:

1. `devm_spi_alloc_host()` and `spi_controller_get_devdata()` allocate the host and the driver state.
2. Maps the register window and requests the interrupt with `devm_request_irq()`, handler `sun6i_spi_handler()`.
3. Selects the variant configuration from the compatible, then fills in the host template: `max_speed_hz`, `min_speed_hz`, `use_gpio_descriptors`, `set_cs`, `transfer_one`, `num_chipselect = 4`, `mode_bits`, `bits_per_word_mask = SPI_BPW_MASK(8)`, `auto_runtime_pm` and `max_transfer_size`.
4. Gets the `ahb` and `mod` clocks and the exclusive reset.
5. Requests the `tx` channel first and the `rx` channel second. A `-EPROBE_DEFER` from either is propagated; any other error only logs a warning and leaves that channel NULL.
6. If both channels exist, it records the FIFO addresses (`mem->start + 0x200` and `+ 0x300`) and installs `can_dma`.
7. Brings the device up with `sun6i_spi_runtime_resume()`, sets a two-second autosuspend delay and registers the controller.

The `use_gpio_descriptors` flag means the core looks for `cs-gpios`; the board declares none, so the controller's native chip-select output is used and `sun6i_spi_set_cs()` drives `CS_LEVEL` in the transfer control register.

### Transfer path

`sun6i_spi_transfer_one()` is the whole data path. It clears pending interrupts, resets both FIFOs, programs the trigger levels, sets the mode bits, programs the counts, fills the FIFO or prepares DMA, enables the interrupts, and starts with `XCH`. It then waits on `sspi->done` for a timeout computed by `spi_controller_xfer_timeout()`. On completion it drains the FIFO (PIO) or waits for the receive DMA callback (DMA), disables the interrupts, and returns.

The clock is set inside the same function: either `clk_set_rate()` plus the sample-mode bits, or the CDR1/CDR2 divider when `has_clk_ctl` is true. The F101 uses the first branch.

### Error paths

A transfer longer than 16 MiB minus one is rejected with `-EINVAL` before anything is programmed. A DMA preparation failure logs a warning and returns the error; the caller sees a failed SPI message. A timeout logs the size, rate and duration, terminates any DMA channels and returns `-ETIMEDOUT`; the SPI core then fails the message. `sun6i_spi_runtime_suspend()` asserts the reset and disables both clocks, and resume reverses the order, so a device that fails to resume fails the next transfer rather than touching an unclocked block.

The driver does not perform a controller reset on a failed transfer. The next `transfer_one()` starts by writing both FIFO resets, so a retried message begins from a clean FIFO; if the failure was a bus problem rather than a FIFO problem, the retry will fail the same way.

### Runtime power management

The controller is autosuspended after two seconds of idleness. The first transfer after a suspend goes through `sun6i_spi_runtime_resume()`, which re-enables both clocks, deasserts the reset and writes `GBL_CTL` with master mode and transmit pause set. The FIFO and transfer registers are programmed afresh for every transfer, so nothing else needs restoring.

## Userspace interface

There is no character device for the bus itself. The flash is an MTD device and the useful interfaces are:

| Path | Meaning |
| --- | --- |
| `/dev/mtd0` … `/dev/mtd5` | Character devices for the partitions, for `mtd_debug` and `flash_erase` |
| `/dev/mtdblock0` … `/dev/mtdblock5` | Block devices; `mtdblock4` is the mounted root filesystem |
| `/proc/mtd` | Partition table: size, erase size and label |
| `/sys/bus/spi/devices/spi0.0` | The flash as an SPI device |
| `/sys/class/spi_master/spi0` | The controller; `spi0` comes from the `spi0` alias |

`spi0` is the bus number because the SoC devicetree has `spi0 = &spi0;` in the aliases. The device name is the controller name plus the chip select, hence `spi0.0`. The same alias is why the MTD master is named `spi0.0`.

## Worked examples

### Example 1: the partition table at boot

```sh
dmesg | grep -A7 'MTD partitions'
cat /proc/mtd
```

Representative output:

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

The first block comes from `add_mtd_partitions()` in `drivers/mtd/mtdpart.c`, which prints each partition's offset and label as it registers it. The second is `/proc/mtd`, formatted by `mtd_proc_show()` as label, size and erase size. The erase size is 4 KiB because `CONFIG_MTD_SPI_NOR_USE_4K_SECTORS` defaults to yes and the P25Q128H supports the 4 KiB sector erase.

### Example 2: inspect and read a partition

```sh
mtd_debug info /dev/mtd5
mtd_debug read /dev/mtd0 0 4096 /tmp/head.bin
```

Representative output:

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

`mtd_debug` prints sizes with its own quirk: `printsize()` divides until the value falls below 1024 and prints the last quotient with a binary suffix, so one megabyte shows as `1048576 (1K)` and 4096 as `4096 (4K)`. The flags line says `MTD_CAP_NORFLASH` because `mtd5` is the one partition without the `read-only` property. Reading `mtd0` works the same way; the content is whatever the SyterKit image starts with, and the command's own output is the "Copied" line.

### Example 3: where the controller and device live in sysfs

```sh
ls /sys/bus/spi/devices/
cat /sys/bus/spi/devices/spi0.0/modalias
```

Representative output:

```text
spi0.0
spi:spi-nor
```

The device directory name is `spi0.0`, controller 0 chip select 0. The `modalias` is `spi:spi-nor`, derived from the `jedec,spi-nor` compatible, which is how the MTD driver binds to it.

## Limitations

| Limitation | Detail |
| --- | --- |
| No spidev | `CONFIG_SPI_SPIDEV` is not enabled, so there is no `/dev/spidev*` |
| One chip select wired | Only CS0 reaches the flash; `num_chipselect` is 4 but the other pins are not routed |
| Shared `PC` pads | SPI0, SPIF and SMHC2 all use `PC0`-`PC5`; only one can be active |
| SPI1 unused | Its pins are on `PD0`-`PD3` and the board never enables it |
| Eight-bit words only | `bits_per_word_mask` is `SPI_BPW_MASK(8)` |
| 16 MiB transfer cap | A single transfer is limited to `0xffffff - 1` bytes |
| Quad TX not used on the flash | The stock flash node declares `spi-tx-bus-width = <1>`, so quad-address reads are not offered |
| PIO below 65 bytes | Transfers of at most 64 bytes never use DMA |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `spi0.0` missing from `/sys/bus/spi/devices` | The controller or flash node is disabled, or a clock/reset is missing | Check `&spi0` is `okay` and `dmesg` for probe errors |
| "timeout transferring N bytes@Hz" in `dmesg` | The clock is too fast for the board, or the flash is not responding | Lower `spi-max-frequency`; check the sample mode derived from the clock |
| "prepare DMA failed" | A DMA channel could not be obtained or configured | Check `dma` node status and that `CONFIG_DMA_SUN6I` is on |
| Flash reads work, writes fail | The partition is declared `read-only` | Write only to `overlay`, or remove `read-only` from the partition |
| `/dev/spidev0.0` does not exist | `CONFIG_SPI_SPIDEV` is off | Enable it in the kernel config and add a spidev node on a free chip select |
| Garbage from the flash at 100 MHz | Sample mode or board timing | Reduce the frequency to 50 MHz and compare |
| SPI0 works but SPIF does not | Both pin groups claim `PC0`-`PC5` | Enable exactly one of `&spi0` and `&spif` |

## Related pages

- [SPIF - SPI NOR flash](spif-nor.md): the dedicated controller and the sample-point tuning.
- [Flash layout](../../../boot/flash-layout.md): what the partitions contain and how they are written.
- [Linux development](../index.md): the kernel configuration that enables these drivers.
- [Common commands](../apps/linux-commands.md): the shell commands that work on the board, including the tools used here.
