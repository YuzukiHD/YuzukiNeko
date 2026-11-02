---
title: "SMHC - microSD card"
---

The F101 has two SD/MMC host controllers, called SMHC. The first one is wired to the microSD slot on `PF0`-`PF5`, with card detect on `PF6` and a fixed 3.3 V supply; the second is an eMMC controller that the board does not use and that shares its pads with the SPI flash. Linux drives both with `sunxi-mmc`, and the card appears as an ordinary block device.

The microSD slot is independent of the NOR flash: the root filesystem lives on the flash, and a card is extra storage that has to be mounted by hand. This chapter covers the controller's registers and IDMA engine, the devicetree for both controllers, the probe path and the F101-specific timing configuration, and what works from BusyBox.

| Item | Content |
| --- | --- |
| Driver | `drivers/mmc/host/sunxi-mmc.c` |
| Compatible | `allwinner,sun252i-f101-mmc` (SMHC0), `allwinner,sun252i-f101-emmc` (SMHC2) |
| Base | `0x04020000` (SMHC0), `0x04022000` (SMHC2) |
| Register window | `0x1000` bytes |
| Interrupts | PLIC 40 (SMHC0), PLIC 42 (SMHC2) |
| Clocks | `ahb` (`CLK_BUS_SMHC0/2`), `mmc` (`CLK_SMHC0/2`) |
| Reset | `RST_BUS_SMHC0/2`, reset name `ahb` |
| Kconfig | `CONFIG_MMC`, `CONFIG_MMC_BLOCK`, `CONFIG_MMC_SUNXI` |
| Userspace | `/dev/mmcblk0`, `/dev/mmcblk0p1`, `/sys/class/mmc_host/mmc0` |

## How the host controller works

SMHC is a command/response engine with a 16-byte data FIFO and its own descriptor-based DMA, called IDMAC in the driver. A request is a command register write; the controller drives CMD, optionally moves data with IDMAC, collects the response and raises one interrupt. The driver's job is to build the IDMA descriptor list, program the clock and bus width, and finish or abort the request when the interrupt arrives.

The registers, from the definitions at the top of `sunxi-mmc.c`:

| Offset | Register | Purpose |
| --- | --- | --- |
| `0x00` | GCTRL | Soft/FIFO/DMA reset, interrupt enable, DMA enable, DDR mode, access done |
| `0x04` | CLKCR | Card clock on/off, low power, internal divider, `MASK_DATA0` |
| `0x08` | TMOUT | Data timeout, written as `0xffffffff` |
| `0x0c` | WIDTH | Bus width: 1, 4 or 8 bits |
| `0x10` | BLKSZ | Block size |
| `0x14` | BCNTR | Byte count |
| `0x18` | CMDR | Command index, response type, data direction, auto-stop, start |
| `0x1c` | CARG | Command argument |
| `0x20`-`0x2c` | RESP0-3 | Response registers, 32 bits each |
| `0x30` | IMASK | Interrupt mask |
| `0x34` | MISTA | Masked interrupt status |
| `0x38` | RINTR | Raw interrupt status; write one to clear |
| `0x3c` | STAS | Status: FIFO levels, card present, card busy |
| `0x40` | FTRGL | FIFO threshold and burst length |
| `0x44` | FUNS | Function select, CEATA and SDIO controls |
| `0x48` | CBCR | CIU byte count |
| `0x4c` | BBCR | BIU byte count |
| `0x50` | DBGC | Debug register, written `0xdeb` |
| `0x80` | DMAC | IDMAC control: soft reset, fixed burst, IDMA on |
| `0x84` | DLBA | IDMA descriptor list base address, shifted |
| `0x88` | IDST | IDMAC status |
| `0x8c` | IDIE | IDMAC interrupt enable |
| `0x5c` | NTSR | New timing mode and command/data phases |
| `0x140` | DRV_DL | Drive delay: command and data phase bits |
| `0x144` | SAMP_DL | Sample delay and calibration |

`sunxi_mmc_init_host()` resets the block, writes `0x20070008` to `FTRGL` (burst of 8, receive trigger 7, transmit trigger 8), sets the timeout to its maximum, clears all interrupts, writes the debug value, enables CEATA, and programs `DLBA`. The descriptor base is stored shifted right by two (`idma_des_shift` for the F101), so the register holds a word address rather than a byte address.

### Commands and responses

`sunxi_mmc_request()` builds `CMDR` from the `mmc_command`: the opcode in bits 5:0, `RESP_EXPIRE` for a response, `LONG_RESPONSE` for a 136-bit response, `CHECK_RESPONSE_CRC` when the command asks for it, `DATA_EXPIRE` and `WAIT_PRE_OVER` for a data command, `WRITE` for a write, `SEND_AUTO_STOP` when the request has a stop command, and `SEND_INIT_SEQUENCE` for CMD0. A data command also programs `BLKSZ` and `BCNTR` and starts IDMAC.

The response is read in `sunxi_mmc_finalize_request()`: a 136-bit response is assembled from RESP3 down to RESP0, a short response is just RESP0. The interrupt handler `sunxi_mmc_irq()` accumulates the masked status, waits for `COMMAND_DONE` on a response timeout so the error dump has the final state, and finalizes when either an error bit or a done bit plus a quiet IDMAC is seen.

### The IDMA descriptors

Each descriptor is four 32-bit words:

| Word | Field | Meaning |
| --- | --- | --- |
| 0 | Config | Chain mode, own bit, disable-interrupt-on-complete, first/last/end-of-ring flags |
| 1 | Buffer size | Bytes in this segment; zero means the maximum, 8192 |
| 2 | Buffer address 1 | Segment address, shifted right by 2 |
| 3 | Buffer address 2 | Address of the next descriptor, or zero on the last one |

The F101 configuration sets `idma_des_size_bits = 13`, so one descriptor moves at most 8 KiB, and `idma_des_shift = 2`, so both addresses are stored as word addresses. `sunxi_mmc_init_idma_des()` marks every descriptor `CH | OWN`, sets `DIC` on all but the last, sets `FD` on the first and `LD | ER` on the last, and writes the next-descriptor pointer as the previous one plus 16 bytes, shifted.

The list lives in one page of coherent memory (`dma_alloc_coherent(PAGE_SIZE)`), which is 256 descriptors of 16 bytes. That is where the host limits come from: `max_segs = PAGE_SIZE / 16 = 256`, `max_seg_size = 8 KiB`, `max_req_size = 2 MiB`, with `max_blk_count = 8192` and `max_blk_size = 4096`. A larger request is split by the MMC core into several requests.

The driver requires every scatterlist entry to be 4-byte aligned in offset and length (`sunxi_mmc_map_dma()`), because both the buffer address and the block size are stored shifted. An unaligned entry is rejected with "unaligned scatterlist". The block layer normally supplies aligned pages, so this is a safeguard rather than a common failure.

### Clocking and the fixed phase

The card clock comes from `CLK_SMHC0` in the CCU at `0x0830`. That clock is a mux over `dcxo24M`, `pll-peri-1x`, `pll-peri-2x` and an audio divider, followed by an `M` divider, a `P` divider and a **fixed divide-by-two post-divider**; the description uses `SUNXI_CCU_MP_WITH_MUX_GATE_POSTDIV(..., 2, 0)`. The clock framework compensates for the post-divider by programming the divider chain for twice the requested rate, so `clk_set_rate()` receives the card rate the driver wants, and `clk_get_rate()` reports the rate the controller actually sees. Removing the post-divider from the clock description would change that relationship, which is why the driver and the clock description have to agree.

The controller itself has an internal divider in `CLKCR` bits 7:0, used only for DDR52 where the module clock is doubled and divided back down. For SDR the divider is one. New timing mode is signalled by `NTSR` bit 31, and the F101 configuration sets `needs_new_timings`, so the driver enables the mode unconditionally instead of asking the CCU to switch.

The F101 also sets `fixed_phase`, which replaces the delay-line tuning of later SoCs with a fixed choice derived from the card clock:

| Card clock | Command drive phase | Data drive phase | NTSR sample phase |
| --- | --- | --- | --- |
| up to 26 MHz | shifted | not shifted | 0 |
| 26 to 52 MHz | shifted | shifted | 1 |
| above 52 MHz | not reachable | not reachable | not reachable |

`sunxi_mmc_clk_set_phase()` implements that table directly. There is no calibration: `can_calibrate` is false, so `sunxi_mmc_calibrate()` returns immediately and the sample delay register is left alone. The vendor HAL on the same board uses the same rule, which is a useful cross-check.

The host advertises 400 kHz to 52 MHz, and the devicetree's `max-frequency = <50000000>` lowers the top to 50 MHz through `mmc_of_parse()`. The identification phase runs at 400 kHz and the transfer phase at 50 MHz, 4-bit, SD high speed.

### Card detect and power

`cd-gpios = <&pio 5 6 GPIO_ACTIVE_LOW>` names `PF6`; a low level means a card is present. `mmc_of_parse()` requests it with the default 200 ms debounce and `mmc_gpiod_request_cd_irq()` turns it into a threaded interrupt through the pio controller's bank interrupt. If no interrupt can be obtained for the pin, the core sets `MMC_CAP_NEEDS_POLL` and polls instead.

Power is not switched: both `vmmc-supply` and `vqmmc-supply` point at the always-on 3.3 V fixed regulator, so the core sees a supply that cannot be turned off and leaves it alone. `no-1-8-v` in the node clears the UHS and 1.8 V capabilities, which matches the wiring: there is no level shifter and no 1.8 V rail.

## Devicetree

SMHC0 in the SoC devicetree:

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

SMHC2 is the eMMC controller. Its node carries the eMMC compatible and `non-removable`, and it is disabled:

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

| Label | Base | PLIC | Pads | Board |
| --- | --- | --- | --- | --- |
| `sdc0` | `0x04020000` | 40 | `PF0`-`PF5`, CD on `PF6` | Enabled, microSD |
| `sdc2` | `0x04022000` | 42 | `PC0`-`PC5` | Disabled, eMMC |

The board file enables SMHC0, supplies 3.3 V to both rails and names the card-detect pin:

```text
&sdc0 {
	vmmc-supply = <&reg_vcc_3v3>;
	vqmmc-supply = <&reg_vcc_3v3>;
	cd-gpios = <&pio 5 6 GPIO_ACTIVE_LOW>; /* PF6 */
	status = "okay";
};
```

The pin group is in the SoC file:

```text
sdc0_pf_pins: sdc0-pf-pins {
	pins = "PF0", "PF1", "PF2", "PF3", "PF4", "PF5";
	function = "sdc0";
	drive-strength = <40>;
	bias-pull-up;
};
```

The six pins carry clock, command and the four data lines; the group sets 40 Ω drive strength and pull-ups on all of them, which is what an SD bus needs when the card is not driving.

The binding is `Documentation/devicetree/bindings/mmc/allwinner,sun4i-a10-mmc.yaml`. The F101 compatible is listed both as a standalone entry and in a fallback pair, and the binding documents `bus-width`, `max-frequency`, `cd-gpios`, `vmmc-supply`, `vqmmc-supply`, `no-1-8-v`, `cap-sd-highspeed`, `cap-mmc-highspeed`, `no-sd`, `no-mmc`, `no-sdio`, `non-removable` and the timing properties.

### Aliases and device names

The SoC devicetree has `mmc0 = &sdc0;` and `mmc1 = &sdc2;`. The MMC core numbers hosts from the `mmcN` alias, so the microSD slot is `mmc0` and its block device is `mmcblk0`; the disabled eMMC would have been `mmcblk1`. Unlike the I²C and SPI cases there is no surprise here, because the aliases exist.

## Kconfig

```text
CONFIG_MMC=y
CONFIG_MMC_BLOCK=y
CONFIG_MMC_SUNXI=y
```

`CONFIG_MMC` is the core, `CONFIG_MMC_BLOCK` adds the block device, and `CONFIG_MMC_SUNXI` the host driver (it depends on `ARCH_SUNXI` and `SUNXI_CCU`). The board defconfig sets all three, plus `CONFIG_VFAT_FS`, `CONFIG_NLS_CODEPAGE_437` and `CONFIG_NLS_ISO8859_1` for FAT cards and `CONFIG_DEVTMPFS` for the device nodes. It does not enable `CONFIG_PARTITION_ADVANCED`, so the default partition parsers apply: MBR (`CONFIG_MSDOS_PARTITION`) and GPT (`CONFIG_EFI_PARTITION`) are both built in, while the BSD and Solaris parsers are not. No ext4 or exFAT filesystem support is built.

## Driver internals

### Probe path

`sunxi_mmc_probe()` allocates the host with `devm_mmc_alloc_host()`, then `sunxi_mmc_resource_request()`:

1. Reads the variant configuration from the compatible.
2. `mmc_regulator_get_supply()` resolves `vmmc` and `vqmmc`.
3. Maps the registers, gets the `ahb` and `mmc` clocks, and, only for variants with `clk_delays`, the `output` and `sample` clocks. The F101 has none, so those lookups are skipped.
4. Gets the reset named `"ahb"` optionally and enables the controller: reset, clocks, `GCTRL` interrupt enable.
5. Requests the threaded interrupt (`sunxi_mmc_irq` hard, `sunxi_mmc_handle_manual_stop` threaded).

Back in probe, it allocates the descriptor page, sets `use_new_timings = true` because the F101 configuration needs it, fills in the host operations and limits, applies `mmc_of_parse()`, masks out UHS and HS200/HS400 when `no-1-8-v` is present, initialises the controller registers and calls `mmc_add_host()`.

### Limits and capabilities

| Property | Value | Where it comes from |
| --- | --- | --- |
| `f_min` | 400 kHz | Driver |
| `f_max` | 50 MHz | Driver 52 MHz, lowered by `max-frequency` |
| `max_seg_size` | 8 KiB | `1 << idma_des_size_bits` |
| `max_segs` | 256 | One page of 16-byte descriptors |
| `max_req_size` | 2 MiB | `max_seg_size × max_segs` |
| `max_blk_size` | 4096 | Driver |
| `max_blk_count` | 8192 | Driver |
| SD high speed | yes | `cap-sd-highspeed` and the driver capability |
| MMC high speed | yes | Driver capability, irrelevant because `no-mmc` |
| 1.8 V / UHS | no | `no-1-8-v` |
| SDIO IRQ | yes | Driver capability, irrelevant because `no-sdio` |

### Initialisation

`sunxi_mmc_init_host()` performs a hardware reset, waits up to 250 ms for the reset bits to clear, then writes the FIFO thresholds, the maximum timeout, the interrupt mask, clears raw interrupts, writes the debug register, enables CEATA, programs `DLBA` and enables the global interrupt.

### set_ios and clock changes

`sunxi_mmc_set_ios()` handles power, bus width, timing and clock. The clock path is `sunxi_mmc_clk_set_rate()`: gate the card clock off, double the request for DDR52 if needed, round and set the module clock, program the internal divider, set `NTSR` for new timing, apply the fixed phase from the table above, and gate the clock back on. `MASK_DATA0` in `CLKCR` keeps DATA0 from toggling while the clock changes, which is why the F101 configuration sets `mask_data0`.

The result of the last `set_ios` is stored in `host->ferror`; if it failed, `sunxi_mmc_request()` fails every request with that error instead of programming the controller.

### Interrupts and errors

`sunxi_mmc_irq()` runs under the host spinlock. It reads `IDST` and `MISTA`, accumulates the status, and finalises when the transfer is done or an error bit is set. A response timeout is special: the handler keeps the interrupt enabled for `COMMAND_DONE` so the dump has a complete picture. On an error, `sunxi_mmc_dump_errinfo()` prints the command, argument, status registers and the IDMA descriptor chain, and the request is marked `-ETIMEDOUT`. If there was data, the request is parked in `manual_stop_mrq` and the threaded handler sends an explicit stop command (CMD12) to bring the card back to the transfer state. That split — hard handler finalises, thread cleans up — is why the driver requests a threaded IRQ.

### Cache coherency

The SoC bus is `dma-noncoherent`. Data buffers are mapped with `dma_map_sg()` before the IDMA descriptors are built, and unmapped in `sunxi_mmc_finalize_request()`; the mapping direction comes from `mmc_get_dma_dir()`. The descriptor page comes from `dma_alloc_coherent()`. Before starting IDMAC, `sunxi_mmc_init_idma_des()` ends with a `wmb()` so the descriptor stores are visible before the controller fetches them.

### Runtime power management

The host autosuspends after 50 ms of idleness. Resume re-enables the clocks and the reset and reinitialises the controller; suspend reverses that. The card is not power-cycled because the regulators are always-on, so the card keeps its state across a host suspend.

## Userspace interface

| Path | Meaning |
| --- | --- |
| `/dev/mmcblk0` | The card as a block device |
| `/dev/mmcblk0p1` … | Partitions from the card's MBR |
| `/sys/block/mmcblk0/` | Size, queue and partition entries |
| `/sys/class/mmc_host/mmc0/` | The host; `mmc0:xxxx` is the card, with `type`, `name`, `cid`, `csd`, `scr` |
| `/sys/kernel/debug/mmc0/ios` | Current bus mode after mounting debugfs |
| `/proc/partitions` | All block devices and their sizes |

The card's sysfs directory is named `mmc0:` plus its four-hex-digit RCA, so it changes with the card. `/sys/class/mmc_host/mmc0/mmc0:*/type` reads `SD` for an SD card, `MMC` for eMMC and `SDIO` for an SDIO device.

There is no `mmc` utility in the root filesystem. The BusyBox applets that are useful are `fdisk` (partition table), `blkid` (filesystem type), `mkdosfs` (create a FAT filesystem), `mount`, `df` and `fsck`. The `ext4`, `exfat` and `mmc-utils` packages are not installed.

### Mounting a card

The filesystem must be one the kernel knows. `CONFIG_VFAT_FS` covers FAT16 and FAT32; exFAT and ext4 are not built. The root filesystem is read-only SquashFS, so the mount point has to be on a writable filesystem — the overlay makes `/mnt` writable, so `/mnt/sd` works.

```sh
mkdir -p /mnt/sd
mount -t vfat /dev/mmcblk0p1 /mnt/sd
```

`mount` without `-t` would probe the filesystem with `blkid` first; naming the type avoids the probe and gives a clearer error when the card is not FAT. A card with an MBR or GPT partition table gets `mmcblk0p1`, `p2` and so on; a card formatted without a partition table is mounted as `/dev/mmcblk0` directly.

## Worked examples

### Example 1: the negotiated bus mode

With a high-speed SD card inserted and debugfs mounted:

```sh
mount -t debugfs none /sys/kernel/debug
grep -v 'actual clock' /sys/kernel/debug/mmc0/ios
```

Representative output:

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

`clock` is the rate the core asked for, taken from `max-frequency`; `actual clock` is deliberately filtered out because it is whatever the CCU could round the request to, which depends on the PLL settings the bootloader left. `timing spec: 2` is `MMC_TIMING_SD_HS` from `include/linux/mmc/mmc.h`, and `bus width: 2` is four bits. A card that only supports standard speed would show timing spec 1 and 25 MHz.

### Example 2: card insertion and removal

With the card detect wired to `PF6`, inserting a card after boot triggers a detect event and the core scans the card:

```sh
dmesg | grep mmc0
```

Representative output, with the card-dependent fields in angle brackets:

```text
mmc0: new high speed SDHC card at address <rca>
mmcblk0: mmc0:<rca> <name> <capacity>
mmc0: card <rca> removed
```

The first two lines come from `mmc_add_card()` and `mmc_blk_probe()`; the third from the removal path. `<rca>` is the four-hex-digit relative card address assigned during identification, `<name>` is the product name from the CID, and `<capacity>` is printed by `string_get_size()`. Removing the card without unmounting leaves the mount point returning I/O errors; unmount first.

## Limitations

| Limitation | Detail |
| --- | --- |
| One slot | Only SMHC0 is wired; SMHC2 is an eMMC controller and is disabled |
| 3.3 V only | `no-1-8-v`; no UHS, SDR50, SDR104 or DDR50 |
| 50 MHz ceiling | SD high speed, 4-bit; the controller claims 52 MHz but the board node asks 50 |
| No tuning | `fixed_phase` replaces the delay-line calibration; there is no phase tuning loop |
| FAT only | exFAT and ext4 are not built into the kernel |
| No mmc-utils | No `mmc extcsd`, `mmc-utils` or card health commands |
| Not a boot device | The system boots from NOR; the card is data storage only |
| Shared `PC` pads on SMHC2 | Enabling eMMC would take `PC0`-`PC5` from SPI0/SPIF |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| No `mmc0` in `dmesg` | The node is disabled, or a clock/reset lookup failed | Check `&sdc0` is `okay` and the probe error in `dmesg` |
| `/dev/mmcblk0` missing with a card inserted | Card detect not working, or the card did not answer CMD0 | Check `PF6` and the pull-ups; try another card |
| "mmc0: error -110 whilst initialising SD card" | The card did not finish identification: clock too fast or signal integrity | Lower `max-frequency`; check the `PF` pins and the card |
| Card detected but no partitions | The card has no partition table, or an unusual one | Repartition with MBR or GPT; check with `fdisk -l` |
| `mount: wrong fs type` | exFAT or ext4 card | Use FAT, or rebuild the kernel with the filesystem |
| Card removed while mounted | Mount point now returns I/O errors | Unmount before removing; remount after reinserting |
| Enabling `&sdc2` breaks the flash | SMHC2, SPI0 and SPIF share `PC0`-`PC5` | Enable only one of them |

## Related pages

- [SPI and DMA](spi.md) and [SPIF - SPI NOR flash](spif-nor.md) for the storage the system actually boots from.
- [Pin multiplexing and GPIO](pinctrl-gpio.md) for the `PF` group and the `PF6` card-detect line.
- [Linux development](../index.md) for the kernel configuration and the boot chain.
- [Common commands](../apps/linux-commands.md): the shell commands that work on the board, including the tools used here.
