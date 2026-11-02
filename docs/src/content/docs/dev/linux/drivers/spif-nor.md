---
title: "SPIF - SPI NOR flash"
---

Besides the two general-purpose SPI controllers, the F101 has a controller built only for SPI flash. It has no interrupt line, no FIFO interface for software, and no clock divider: every flash command becomes a small descriptor that the controller's own DMA fetches, and the command's address, dummy and data phases are all described in that descriptor. The CPU writes eight words, starts the engine and polls for the end.

The controller sits at `0x0c000000` and shares the six `PC` pads with SPI0 and the eMMC controller. The stock board image keeps the flash on SPI0; `sun252i-f101-yuzukineko-spif.dts` is the variant that moves it here. This chapter describes both sides: the controller and its sample-point tuning, and the Puya P25Q128H flash that either controller has to talk to.

| Item | Content |
| --- | --- |
| Driver | `drivers/spi/spi-sunxi-spif.c` |
| Compatible | `allwinner,sun252i-f101-spif` |
| Base | `0x0c000000`, `0x1000` bytes |
| Interrupts | None in the devicetree; completion is polled |
| Clocks | `ahb` (`CLK_BUS_SPIF`), `mod` (`CLK_SPIF`) |
| Reset | `RST_BUS_SPIF` |
| DMA | Internal descriptor fetcher only, not the `sun6i-dma` engine |
| Kconfig | `CONFIG_SPI_SUNXI_SPIF`, `CONFIG_MTD_SPI_NOR` |
| Userspace | `/dev/mtd0` … `/dev/mtd5`, `/dev/mtdblock0` … `/dev/mtdblock5` |

## How the controller works

A transfer is a single command. The driver fills an eight-word descriptor:

| Word | Field | Meaning |
| --- | --- | --- |
| 0 | Burst | Last descriptor, read direction, burst length (16-beat increment) |
| 1 | Block length | 64-byte block flag and the data length |
| 2 | Data address | DMA buffer address, in words (`>> 2`) |
| 3 | Next descriptor | Zero: this is the last one |
| 4 | Phase | Which phases the command has: command, address, dummy, receive, transmit |
| 5 | Flash address | The address phase value |
| 6 | TCS | Opcode, address bus width, data bus width |
| 7 | TNM | Data length, dummy cycles, address length minus one, normal mode |

The descriptor lives in coherent memory; `sunxi_spif_xfer()` writes it, orders the writes with `dma_wmb()`, writes `desc_dma >> 2` to the DMA descriptor register at `0x44`, and writes the descriptor length plus the start bit to the DMA control register at `0x40`. The controller fetches the descriptor itself, drives CS, SCK and the data lines, and sets the DMA-done bit in the status register at `0x18` when it is over. Because there is no interrupt, the driver polls that register with `readl_poll_timeout_atomic()` for up to one second.

The register set:

| Offset | Register | Purpose |
| --- | --- | --- |
| `0x00` | VERSION | Controller revision; `0x10002` or later is required |
| `0x04` | GCR | DMA mode, normal (no-data) start, DTR, CPHA, CPOL, CS select and polarity |
| `0x08` | GAR | FIFO reset, soft reset, DMA reset |
| `0x0c` | TCR | Sample delay and mode, sample enable, DTR clock output select |
| `0x14` | IER | Interrupt enable; written zero, the line is not used |
| `0x18` | ISR | DMA done (bit 24) and error bits (10:8) |
| `0x1c` | CSD | Chip-select setup, hold and deselect timing |
| `0x20` | PHC | Phase register for the no-data path |
| `0x24` | TCF | Flash address for the no-data path |
| `0x28` | TCS | Bus widths and opcode for the no-data path |
| `0x2c` | TNM | Counts for the no-data path |
| `0x40` | DMA_CTL | Descriptor length and start |
| `0x44` | DMA_DESC | Descriptor address, in words |

With data, the descriptor path is used and `PHC`/`TCF`/`TCS`/`TNM` are ignored. Without data — an erase, a status read, a write-enable — the same values are written directly to those registers and `GCR_NORMAL_EN` is set; completion is the hardware clearing that bit, which the driver also polls.

### A command on the wire

Every operation the flash core sends is one of a handful of shapes, and the descriptor fields follow from it:

| Operation | Opcode | Address | Dummy | Data | Descriptor shape |
| --- | --- | --- | --- | --- | --- |
| Read JEDEC ID | `0x9f` | none | none | 3 bytes in, 1 line | Command + RX |
| Read status | `0x05` | none | none | 1 byte in, 1 line | Command + RX |
| Quad output read | `0x6b` | 3 or 4 bytes, 1 line | 8 clocks | 1 or 4 lines in | Command + ADDR + DUMMY + RX |
| Quad DTR read | `0xed` | 4 bytes, 4 lines, DTR | 4 bytes, DTR | 4 lines in, DTR | Command + ADDR + DUMMY + RX, DTR |
| Page program | `0x02` | 3 bytes, 1 line | none | 1 line out | Command + ADDR + TX |
| Quad page program | `0x32` | 3 bytes, 1 line | none | 4 lines out | Command + ADDR + TX |
| 4 KiB erase | `0x20` | 3 bytes, 1 line | none | none | No-data path |

The opcodes are the standard ones from `include/linux/mtd/spi-nor.h`; which of the read variants is actually used depends on the bus widths in the flash node, as described under [the flash](#the-flash). An erase or a write-enable has no data phase, so it takes the register path (`GCR_NORMAL_EN`) rather than a DMA descriptor.

### Phases and bus widths

The phase word has one bit per phase: `CMD` (bit 28), `ADDR` (bit 24), `DUMMY` (bit 16), `TX` (bit 12), `RX` (bit 8). The widths are coded 0, 1 and 2 for one, two and four lines for the address and data phases separately; the command phase is always one line. The DTR bit expands the address, dummy and data phases to both clock edges, and the driver only accepts a DTR operation when all three of them are DTR. This is exactly the shape of the flash's quad DTR read: opcode on one line, address on four, a dummy phase, data on four, all on both edges.

The controller also exposes a linear (XIP) window: the vendor driver programs a start address, an end address and the matching flash address into registers `0x34`, `0x38` and `0x3c`, and maps a 32 MiB window at `0x0e000000`. The Linux driver leaves those registers alone, so every access goes through the descriptor path. Reading through the XIP window would bypass the sample-point logic the driver relies on, and the window is not described in the devicetree.

Dummy time is counted in clock cycles, not bytes: `sunxi_spif_dummy_cycles()` computes `bytes × 8 / buswidth`, halved for DTR, and the result must fit in eight bits. The address length is stored as the number of bytes minus one, and four bytes is the maximum.

### Clocking and DTR

The module clock is the CCU's `spif` clock at `0x0980`: a mux over `dcxo24M`, `pll-peri-1x`, `pll-peri-2x` and `pll-peri-800m`, a 5-bit `M` divider and a 3-bit `P` divider. The driver programs it with `clk_set_rate()`. In DTR mode it asks for twice the SCK rate, because two bits cross per clock, and it rejects a clock that comes back above the request with `-ERANGE`. Changing between SDR and DTR also requires a soft reset, because the controller latches the clocking mode at reset: `sunxi_spif_set_mode()` sets `SCKOUT_SEL`, runs `sunxi_spif_reset()`, then restores the TCR value with the sample point.

The driver advertises 100 MHz. That is a ceiling, not a promise: above 50 MHz the data eye depends on the board, and the driver only goes there when it can tune.

## Sampling point and tuning

The controller has a programmable receive sample point: three modes and 64 delay steps, selected by `TCR` bits 5:0 (delay), 6 (software delay enable), 18:16 (mode) and 20 (sample enable). Rather than hard-code a point that only works on one board, the driver measures it.

Tuning starts on the first bulk read above 50 MHz. A read is "bulk" when it is a data-in operation of at least 256 bytes or any DTR read. The procedure, in `sunxi_spif_tune_run()`:

1. Set the sample point to zero and read 4 KiB at `SPIF_IDENT_SPEED` (24 MHz) from the offset named by `allwinner,tune-offset`. That is the reference. If the region does not read like real data — fewer than 32 distinct byte values — the driver warns and gives up.
2. At the requested speed, for each of the three modes and each of the 64 delays, read the same 4 KiB twice and compare with the reference. A setting is good only if both passes match.
3. Find the longest run of consecutive good delays and require at least six (`SPIF_TUNE_MIN_WINDOW`). The chosen point is the middle of that run.
4. Store the point together with a key built from the opcode, the address and data bus widths, the address length, the dummy length and the DTR flag, and the speed. A later operation with the same key and speed reuses it without retuning.

A tuning run is 3 modes by 64 delays by 2 passes, 384 reads of 4 KiB. That is why the result is cached per key and speed and why a failed result is cached too.

On success the driver prints one line: `%u MHz%s: sample mode %u, delay %u (window %u..%u)`, with `DTR` appended for a DTR read. On failure it warns `no sample point at %u MHz (%d), using %u MHz` and runs that operation at 50 MHz. The failure is remembered for that key and speed, so a board that cannot tune does not pay the cost on every read.

`allwinner,tune-offset` must name a 4 KiB region that reads the same every time and is not blank. The board file uses `0x6d1000`, 4 KiB into the root filesystem (its second 4 KiB sector): the SquashFS image is compressed data there, so it is stable and diverse. Without the property the driver sets `can_tune = false` and never exceeds 50 MHz.

## The flash

The part is a Puya P25Q128H, 16 MiB, JEDEC ID `85 20 18`. Its SFDP is the first JESD216 revision: it reports that DTR clocking is supported but does not describe the quad DTR read, so `drivers/mtd/spi-nor/puya.c` adds it from the datasheet in a late-init fixup: 1-4-4 DTR, opcode `0xed`, one mode byte and seven wait states.

The fixup only applies when the flash already advertises `SNOR_HWCAPS_READ_1_4_4`. That capability comes from the combination of the flash's own SFDP and the SPI mode the node declares:

- The SPIF variant declares `spi-rx-bus-width = <4>` and `spi-tx-bus-width = <4>`. Both directions are quad, so 1-4-4 is offered, the fixup adds the DTR read, and it becomes the read used for everything.
- The stock SPI0 node declares `spi-rx-bus-width = <4>` but `spi-tx-bus-width = <1>`. The address phase is transmitted, so the SPI memory layer (`spi_mem_default_supports_op()`) refuses 1-4-4 and the DTR read is never selected; the best remaining read is 1-1-4.

This is worth remembering when comparing the two boards: moving the flash to SPIF is not only a different controller, it also unlocks the faster read. The MTD partition layout, the partition names and the filesystem on top are identical either way, because both include `sun252i-f101-nor-partitions.dtsi`.

| Partition | Offset | Size | Contents |
| --- | --- | --- | --- |
| `bootloader` | `0x000000` | 64 KiB | SyterKit |
| `dtb` | `0x010000` | 256 KiB | Device tree |
| `opensbi` | `0x050000` | 512 KiB | `fw_jump` |
| `kernel` | `0x0d0000` | 6 MiB | Linux Image |
| `rootfs` | `0x6d0000` | 8 MiB plus 192 KiB | SquashFS |
| `overlay` | `0xf00000` | 1 MiB | JFFS2 upper layer |

## Devicetree

The controller node is in the SoC devicetree:

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

The SPIF board variant disables SPI0 and moves the flash onto the dedicated controller:

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

The pin group is the same six pads as SPI0, with a different function:

```text
spif0_pc_pins: spif0-pc-pins {
	pins = "PC0", "PC1", "PC2", "PC3", "PC4", "PC5";
	function = "spif0";
};
```

SPI0, SPIF and SMHC2 all claim `PC0`-`PC5`. `sun252i-f101-yuzukineko-spif.dts` resolves the conflict by disabling SPI0, and SMHC2 is disabled in the SoC file anyway, so enabling SPIF costs nothing else on this board.

The binding is `Documentation/devicetree/bindings/spi/allwinner,sun252i-f101-spif.yaml`. It requires `compatible`, `reg`, `clocks`, `clock-names` and `resets`, and defines one extra property, `allwinner,tune-offset`, documented exactly as the offset of a 4 KiB non-blank region used to find the sample point above 50 MHz.

### The bus number is 2

The SPIF node has no `spiN` alias. `spi_register_controller()` looks up `of_alias_get_id(dev->of_node, "spi")`, gets -1, and then starts dynamic allocation at `of_alias_get_highest_id("spi") + 1`. The SoC devicetree has `spi0` and `spi1` aliases, so the highest is 1 and the SPIF controller takes bus number 2, even on the variant where SPI0 is disabled. Its flash device is `spi2.0`, the MTD master is named `spi2.0`, and the sysfs path is `/sys/bus/spi/devices/spi2.0`. This trips people up when they look for `spi0.0` after switching the devicetree.

## Kconfig

```text
CONFIG_SPI=y
CONFIG_SPI_SUNXI_SPIF=y
CONFIG_MTD=y
CONFIG_MTD_BLOCK=y
CONFIG_MTD_SPI_NOR=y
CONFIG_MTD_OF_PARTS=y
```

`CONFIG_SPI_SUNXI_SPIF` depends on `ARCH_SUNXI` and `RESET_CONTROLLER` and selects `SPI_MEM`, which is what lets the driver hand `spi_mem_op` structures to the flash core. The MTD side needs the four `CONFIG_MTD*` options; `CONFIG_MTD_OF_PARTS` is what turns the `fixed-partitions` child into `mtd0` to `mtd5`. The board defconfig sets all of them, and the Buildroot fragment `linux-nor.fragment` repeats the MTD set so a different base config still gets a bootable flash stack.

Note that the two flash controllers are alternative, not complementary: `CONFIG_SPI_SUN6I` and `CONFIG_SPI_SUNXI_SPIF` can both be built, and only the devicetree decides which one owns the pads.

## Driver internals

### Probe path

`sunxi_spif_probe()` in `drivers/spi/spi-sunxi-spif.c`:

1. `devm_spi_alloc_host()`, then maps the registers with `devm_platform_ioremap_resource()`.
2. Gets `ahb` and `mod` clocks and the exclusive reset.
3. Sets a 32-bit DMA mask.
4. Allocates the descriptor with `dmam_alloc_coherent()` and a 64 KiB data buffer with `devm_kmalloc()`. The buffer is used for every transfer, in both directions; there is no scatter-gather and no per-transfer allocation.
5. Enables the clocks, registers a cleanup action that disables them, and deasserts the reset.
6. Writes zero to `IER`, resets the controller, and rejects a `VERSION` below `0x10002` with `-ENODEV`.
7. Writes zero to `TCR` and the vendor default `(5 << 16) | (6 << 8) | 6` to `CSD`.
8. If `allwinner,tune-offset` is present, allocates the reference and tuning buffers and sets `can_tune`.
9. Registers the controller with `devm_spi_register_controller()`, its memory operations being `supports_op`, `adjust_op_size` and `exec_op`.

`supports_op` rejects a command that is not one byte on one line, an address longer than four bytes or above `U32_MAX`, more than 255 dummy clock cycles, and any DTR combination that is not "address, dummy and data all DTR". `adjust_op_size` caps the data length at 64 KiB, which is the size of the internal buffer.

### The transfer path

`sunxi_spif_exec_op()` decides the speed for each operation: the device's `max_speed_hz`, further limited by `op->max_freq` if the flash core set one, and never above 100 MHz. If the speed is above 50 MHz it checks whether this operation can be tuned; if not, it drops to 50 MHz. If it can, it looks up the tuning key and either reuses a cached point, retunes, or (for a key and speed that already failed) goes straight to 50 MHz. It then programs the sample point and calls `sunxi_spif_xfer()`.

`sunxi_spif_xfer()` builds the descriptor, maps the buffer with `dma_map_single()` over a length rounded up to 64 bytes — the DMA moves whole 64-byte blocks — starts the engine or the no-data command, polls, unmaps, and for a read copies from the internal buffer into `op->data.buf.in`. A transmit operation is copied into the internal buffer before the mapping.

The single buffer is what makes the operation size cap 64 KiB rather than a hardware limit: the controller's DMA can address more, but there is only one buffer and no scatter-gather, so a larger operation is split by the flash core. A transmit operation is copied in first because the flash core's buffer is an ordinary kernel allocation and the controller must read a whole number of 64-byte blocks from it; doing the copy and the rounding in one place keeps the mapping simple.

### Error paths

A poll timeout or a status register error bit makes `sunxi_spif_xfer()` return `-EIO`. If the controller also fails to soft-reset afterwards, the driver disables the clocks and sets `spif->failed`, and every later operation returns `-EIO` immediately rather than handing a DMA buffer to a wedged controller. A failed tuning run is not fatal: the operation is retried at 50 MHz and the failure is remembered.

### Runtime power management

There is none. The clocks are enabled once at probe and disabled by the devm cleanup action at remove. The controller is never autosuspended, which is reasonable for a device that holds the root filesystem.

## Userspace interface

The controller has no character device of its own; the flash surfaces through MTD exactly as it does on SPI0:

| Path | Meaning |
| --- | --- |
| `/dev/mtd0` … `/dev/mtd5` | Partitions for `mtd_debug`, `mtdinfo`, `flash_erase` |
| `/dev/mtdblock4` | The SquashFS root, mounted read-only |
| `/proc/mtd` | Partition table |
| `/sys/bus/spi/devices/spi2.0` | The flash as an SPI device |
| `/sys/class/spi_master/spi2` | The controller, named `spi2` for the reason above |

Because the controller has no interrupt, none of the usual `dmesg` interrupt messages appear. The only runtime messages are the tuning line and a warning when tuning fails.

## Worked examples

### Example 1: the boot log on the SPIF variant

```sh
dmesg | grep -E 'MTD partitions|spi@c000000|spi2'
```

Representative output, with the partition dump shortened:

```text
Creating 6 MTD partitions on "spi2.0":
0x000000000000-0x000000010000 : "bootloader"
0x000000010000-0x000000050000 : "dtb"
0x000000050000-0x0000000d0000 : "opensbi"
0x0000000d0000-0x0000006d0000 : "kernel"
0x0000006d0000-0x000000f00000 : "rootfs"
0x000000f00000-0x000001000000 : "overlay"
```

The master name `spi2.0` is the giveaway that SPIF is in use: on the SPI0 variant the same block says `spi0.0`. The tuning line appears only once the first bulk read at 100 MHz happens, which on a normal boot is when the root filesystem is first accessed; its shape is `100 MHz: sample mode M, delay D (window A..B)`. The exact mode and delay are properties of the board, so they are not quoted here; `DTR` is appended when the operation being tuned is a DTR read.

### Example 2: inspect a partition

```sh
mtdinfo /dev/mtd0
ls /sys/bus/spi/devices/
```

Representative output:

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

`mtdinfo` reads everything from sysfs: the type `nor`, the 4 KiB erase block (the default 4 KiB sector selection), 16 blocks for the 64 KiB bootloader partition, and `Device is writable: false` because the partition carries `read-only`. The `ls` confirms the controller registered as bus 2.

### Example 3: change the tuning region

If a different layout moves the root filesystem, the tuning offset has to follow it, or tuning reads blank flash. The property is in the board file:

```text
&spif {
	allwinner,tune-offset = <0x6d1000>;
};
```

Choose an offset inside a region that is written and non-blank — the kernel partition works too, for example `0x0d1000`. Rebuild the devicetree, boot, and look for the tuning line; if the driver warns `no usable data at the tune offset`, the region was blank or uniform and the offset needs moving. Removing the property is the safe fallback: the controller then stays at 50 MHz and no tuning is attempted.

### Choosing between the two controllers

| Aspect | SPI0 (`spi-sun6i`) | SPIF |
| --- | --- | --- |
| Completion | PLIC interrupt | Polled status register |
| Data movement | FIFO or `sun6i-dma` channels | Internal descriptor fetcher, 64 KiB buffer |
| Sample point | Three fixed settings chosen from the rate | Three modes and 64 delays, measured per board |
| Quad transmit | Supported by the controller; the stock node sets `spi-tx-bus-width = <1>` | The variant node sets 4, so the 1-4-4 DTR read is usable |
| Pads | `PC0`-`PC5` | `PC0`-`PC5` |
| Bus name | `spi0.0` | `spi2.0` |

SPI0 is the safer choice on a board whose timing is unknown: it has an interrupt, works at 50 MHz without any tuning, and is the configuration the prebuilt images ship. SPIF is the faster choice once the sample point has been measured, and it frees the general-purpose controller and its DMA channels for other devices.

## Limitations

| Limitation | Detail |
| --- | --- |
| No interrupt | Completion and errors are polled; a long operation holds the CPU in a busy loop for up to one second |
| No tuning below 50 MHz | Without `allwinner,tune-offset` the controller never exceeds 50 MHz |
| One command in flight | One descriptor, one command; there is no queued or prefetched command |
| 64 KiB operation cap | `adjust_op_size` limits the data length to the internal buffer |
| 4 KiB tuning region | The tuning reference is a single 4 KiB read; a region with poor data makes tuning fail |
| Bus number 2 | No `spiN` alias, so the controller is `spi2` even when it is the only one enabled |
| Shared pads | SPI0, SPIF and SMHC2 all use `PC0`-`PC5`; the devicetree variant must disable the others |
| Write and erase slow | Every erase is a polled command; a large JFFS2 write is much slower than on a NAND |
| No XIP window | The linear window registers are left alone; all reads go through descriptors |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "unsupported controller version 0x…" at probe | The revision register is below `0x10002` | This driver does not support that controller; use SPI0 |
| "no usable data at the tune offset" | The region at `allwinner,tune-offset` is blank or uniform | Point it at written data, for example `0x0d1000`, or remove the property |
| "no sample point at 100 MHz" in `dmesg` | The board cannot close timing at that rate | Lower `spi-max-frequency`, or leave the fallback to 50 MHz |
| Flash missing and `spi2.0` absent | Both SPI0 and SPIF claim the pads, or the node is disabled | Use exactly one of `&spi0`/`&spif` and check the pin group function |
| Root filesystem does not mount | `mtd4` was not created, or the squashfs is corrupt | Check `/proc/mtd` and `mtd_debug info /dev/mtd4` |
| Every access returns `-EIO` after a failure | A reset failed and the driver latched `failed` | Reboot; the controller is disabled until the next probe |
| Reads are much slower than expected | The 1-4-4 DTR read was not selected | Check `spi-tx-bus-width = <4>` in the flash node |
| Reads work but tuning never runs | Every read is under 256 bytes and SDR | Nothing is wrong; the driver stays at 50 MHz until a bulk read appears |

## Related pages

- [SPI and DMA](spi.md): the general-purpose controller and the DMA engine.
- [Flash layout](../../../boot/flash-layout.md): offsets, sizes and how the image is written.
- [Linux development](../index.md): the kernel and Buildroot configuration behind this driver.
- [Common commands](../apps/linux-commands.md): the shell commands that work on the board, including the tools used here.
