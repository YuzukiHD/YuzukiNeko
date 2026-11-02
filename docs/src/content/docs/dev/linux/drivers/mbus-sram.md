---
title: "MBUS and SRAM - bus priority and on-chip memory"
---

Two small blocks decide how the memory bus is shared and which engine owns the on-chip SRAM. The MBUS arbiter gives each bus master a priority and a bandwidth ceiling and counts the traffic of the master groups. The system controller hands the internal SRAM and the OTG FIFO RAM to the block that claims them. Neither block has an interrupt; both are plain MMIO and both expose their state through debugfs.

| Item | Content |
| --- | --- |
| Drivers | `drivers/soc/sunxi/sun252i_f101_mbus.c`, `drivers/soc/sunxi/sunxi_sram.c` |
| Compatibles | `allwinner,sun252i-f101-mbus`, `allwinner,sun252i-f101-system-control`, three SRAM section compatibles |
| Bases | MBUS `0x03102000` (0x1000), system control `0x03000000` (0x1000) |
| Clocks and resets | MBUS takes `CLK_BUS_DRAM` and `CLK_MBUS`, and `RST_BUS_DRAM` must be deasserted |
| Kconfig | `CONFIG_SUN252I_F101_MBUS`, `CONFIG_SUNXI_SRAM` (default with `CONFIG_ARCH_SUNXI`) |
| Userspace | `/sys/kernel/debug/sun252i-f101-mbus/{traffic,masters}`, `/sys/kernel/debug/sram` |

## Hardware

### MBUS arbitration registers

The MBUS window at `0x03102000` contains three register groups. Per-master arbitration lives at `0x210 + 0x10 * m` (MSC) and the bandwidth limit at `0x218 + 0x10 * m` (BWLR), for 40 masters numbered 0 to 39. The traffic monitor starts at `0x09c`.

| Register | Offset | Fields |
| --- | --- | --- |
| `MSC(m)` | `0x210 + 0x10 * m` | priority in bits 3:2, 0 to 3, 3 is highest |
| `BWLR(m)` | `0x218 + 0x10 * m` | limit in bits 27:16, enable in bit 31 |
| `PMU_CTRL` | `0x09c` | window in bits 31:16, enable in bit 0 |
| `PMU_COUNTER(n)` | `0x0a0 + 4 * n` | 32-bit counter for group n, 16 groups |

The bandwidth limit is not in MB/s. The field counts 1/256 byte per MBUS clock cycle, so the driver converts a requested `bandwidth-limit-mbps` into `256 * mbps / mbus_clk_mhz`, clamped to the 12-bit field. A value of 0 in the devicetree property clears the enable bit and means no limit. The monitor window is a 16-bit field; the counters themselves are 32-bit registers. The window property is `allwinner,monitor-window-us`, default 50000, maximum 65535.

The 16 monitor groups are fixed by the hardware:

| Index | Name | Index | Name |
| --- | --- | --- | --- |
| 0 | `cpu` | 8 | `dsp_sys` |
| 1 | `rv_sys` | 9 | `g2d` |
| 2 | `mahb` | 10 | `di` |
| 3 | `dma` | 11 | `de` |
| 4 | `ve` | 12 | `iommu` |
| 5 | `ce` | 13 | `reserved` |
| 6 | `tvd` | 14 | `other` |
| 7 | `csi` | 15 | `total` |

Counters are per group, not per master. There is no way to read the traffic of one master in isolation; the `masters` file shows its configuration, and the `traffic` file shows the group it contributes to. The 16 groups are not guaranteed to partition all traffic: `reserved` and `other` name buckets that do not correspond to a single named master.

The MBUS clock is the time base for both the limit and the counters. A limit of 500 MB/s is only meaningful relative to the rate reported by `clk_get_rate()`; if a future board lowers the MBUS clock, the same register value corresponds to a lower byte rate, and the driver recomputes the field from the new clock at boot.

The devicetree binding only gives symbolic names to the two masters the board configures: `SUN252I_F101_MBUS_MASTER_DE` is 16 and `SUN252I_F101_MBUS_MASTER_RISCV` is 39. Other master numbers come from the hardware manual and are not named in the header.

### System control and SRAM

The system controller at `0x03000000` is mostly a mux block. The register at `+0x00` reads as zero and ignores writes on this SoC, from both Linux and OpenSBI; only the mux at `+0x04` is writable and effective. Three sections are modelled, and two of them share the same three bits.

| Section | Compatible | Register | Value when claimed | Meaning |
| --- | --- | --- | --- | --- |
| Video engine SRAM | `allwinner,sun252i-f101-sram-ve` | `+0x04` bit 24 | 0 | VE owns the SRAM; 1 means the CPU |
| Display engine SRAM | `allwinner,sun252i-f101-sram-de` | `+0x04` bits 27:25 | 5 | DE owns the SRAM; 0 means the CPU |
| USB OTG FIFO | `allwinner,sun252i-f101-sram-usb` | `+0x04` bits 27:25 | 0 | OTG owns the FIFO RAM; the same field holds 5 when the DE owns it |

The VE memory is the 0xb000-byte `mmio-sram` at `0x00020000`, the same SRAM region where the FEL stage loads `init_psram_efex.bin` and `usb-boot_fel.bin`. By the time Linux runs, those programs are finished and the region can be handed to the video engine. The OTG FIFO RAM is internal to the USB controller, but its ownership is selected by the same bits 27:25 that the display engine uses, which is why the two devices conflict.

The display engine and the USB controller want opposite values of the same field. The DE writes 5 when it claims its section; the OTG writes 0 when it claims the USB section. The display engine also works with 0, which is the state the board runs in when both are active and the OTG claim is the last one. With the bits left at 5, the gadget never leaves the `default` state and enumeration does not finish. See [USB](usb.md) for the role switch and gadget side.

## Devicetree

### MBUS

The MBUS node has the bus clock and the MBUS clock, and one reset. Masters that need a non-default setting are child nodes with the master number in `reg`.

```text
mbus: mbus@3102000 {
	compatible = "allwinner,sun252i-f101-mbus";
	reg = <0x0 0x03102000 0x0 0x1000>;
	clocks = <&ccu CLK_BUS_DRAM>, <&ccu CLK_MBUS>;
	clock-names = "bus", "mbus";
	resets = <&ccu RST_BUS_DRAM>;
	#address-cells = <1>;
	#size-cells = <0>;
	status = "disabled";
};
```

The board enables it, gives the display engine the highest priority and caps the C907 cluster:

```text
&mbus {
	status = "okay";

	display-engine@10 {
		reg = <SUN252I_F101_MBUS_MASTER_DE>;
		priority = <3>;
	};

	cpu@27 {
		reg = <SUN252I_F101_MBUS_MASTER_RISCV>;
		bandwidth-limit-mbps = <500>;
	};
};
```

The names come from `include/dt-bindings/memory/sun252i-f101-mbus.h`. `16` is the display engine; `39` is the RISC-V cluster. A child with a `reg` of 40 or more, or with no valid `reg`, is skipped with a warning. A priority above 3 is rejected with a warning and left unchanged. The `bandwidth-limit-mbps` property has no upper check in the driver: the computed field is clamped to 0xfff by `FIELD_MAX()`.

### System control and SRAM

The system controller contains an `mmio-sram` child at `0x20000`. The VE section is a child of that SRAM node. The DE and USB sections are declared directly under the SoC node because they are only phandles for the driver and have no address of their own.

```text
syscon: syscon@3000000 {
	compatible = "allwinner,sun252i-f101-system-control";
	reg = <0x0 0x03000000 0x0 0x1000>;
	#address-cells = <1>;
	#size-cells = <1>;
	ranges = <0x0 0x0 0x0 0x40000000>;

	ve_sram: sram@20000 {
		compatible = "mmio-sram";
		reg = <0x20000 0xb000>;
		#address-cells = <1>;
		#size-cells = <1>;
		ranges = <0 0x20000 0xb000>;

		ve_sram_section: sram-section@0 {
			compatible = "allwinner,sun252i-f101-sram-ve";
			reg = <0x0 0xb000>;
		};
	};
};

usb_sram_section: sram-section-usb {
	compatible = "allwinner,sun252i-f101-sram-usb";
};

de_sram_section: sram-section-de {
	compatible = "allwinner,sun252i-f101-sram-de";
};
```

### Consumers

A device asks for a section with `allwinner,sram`; the second cell is the value that means "this device". The driver looks up the section node by its compatible, checks the second cell against the table, and writes the corresponding register value on the first claim.

```text
ve: video-codec@1c0e000 {
	allwinner,sram = <&ve_sram_section 1>;
};

mixer0: mixer@5100000 {
	allwinner,sram = <&de_sram_section 1>;
};

usb_otg: usb@4100000 {
	allwinner,sram = <&usb_sram_section 1>;
};
```

| Binding | Scope |
| --- | --- |
| `Documentation/devicetree/bindings/arm/sunxi/allwinner,sun252i-f101-mbus.yaml` | MBUS node, child masters, `priority`, `bandwidth-limit-mbps`, `allwinner,monitor-window-us` |
| `Documentation/devicetree/bindings/sram/allwinner,sun4i-a10-system-control.yaml` | System control, `mmio-sram` children, section compatibles |
| `include/dt-bindings/memory/sun252i-f101-mbus.h` | The two named master numbers |

The DE and USB section nodes are not inside the system controller in this devicetree, while the binding describes sections as children of `sram`. The driver only needs the compatible and the phandle, so it works, but the node placement is not covered by the binding schema. Treat it as a known layout quirk when running `dtbs_check`.

## Kconfig

```text
CONFIG_SUN252I_F101_MBUS=y
CONFIG_SUNXI_SRAM=y
CONFIG_DEBUG_FS=y
```

`CONFIG_SUNXI_SRAM` is a bool that defaults to `y` with `CONFIG_ARCH_SUNXI` and selects `REGMAP_MMIO`. The F101 system-control variant has no EMAC clocks and no LDO control, so the driver does not register a regmap for it; it only maps the window, populates the SRAM children and creates the debugfs file. `CONFIG_SUNXI_MBUS` is a different option: it is the ARM-only DMA quirk fixup and is not used here.

`CONFIG_SUN252I_F101_MBUS` depends on `ARCH_SUNXI` or `COMPILE_TEST` and is a tristate, but the board builds it in.

## Driver internals

### MBUS probe

`f101_mbus_probe()` maps the 4 KiB window, gets the reset with `devm_reset_control_get_optional_exclusive_deasserted()`, enables the `bus` and `mbus` clocks with `devm_clk_get_enabled()`, and stores `clk_get_rate() / 1000000` as the MBUS clock in MHz. If the clock rate is zero the probe fails, because the limit conversion would divide by zero.

It then starts the monitor by writing the window and the enable bit to `PMU_CTRL`, walks the available child nodes and applies `priority` and `bandwidth-limit-mbps`, creates the debugfs directory and logs the clock in MHz. The reset is deasserted before any register is touched. With the reset still asserted the whole window reads back as `0x4`, which looks like a dead controller rather than a reset problem.

### Limit encoding

`f101_mbus_set_limit()` reads the BWLR, clears the limit field and the enable bit, and writes the new value. A request of 0 mbps is encoded as "enable clear", not as a zero limit. A non-zero request is converted with `div_u64(256 * mbps, clk_mhz)`. The result is a rate in 1/256-byte units per cycle; the debugfs `masters` file converts it back with `limit * clk_mhz / 256` and prints MB/s. Integer truncation means a low MBUS clock can round the effective limit below the requested value.

### Monitor window

The driver writes the window field before setting the enable bit. The property name says microseconds, and the value is placed in bits 31:16 without scaling. A window of 50000 is the default. The counter registers at `0x0a0` onward are read directly by the `traffic` file; the driver does not scale, latch or reset them. Consecutive reads therefore show overlapping traffic, not a rate per second.

Removal only deletes the debugfs directory; it does not stop the monitor or restore the arbitration registers. The values written at probe stay in the hardware until the next power cycle.

### SRAM probe and claim

`sunxi_sram_probe()` stores the platform device, maps the system-control window, and calls `of_platform_populate()` so the `mmio-sram` node is probed by the generic SRAM driver. It then creates `/sys/kernel/debug/sram`. For `allwinner,sun252i-f101-system-control` the variant data is the plain A10 variant: no EMAC clocks and no LDO control, so `of_syscon_register_regmap()` is not called.

`sunxi_sram_claim()` iterates every `allwinner,sram` phandle of the device. For each one it checks that the section node is available, matches its compatible, and maps the second cell through the function table. The first claim of a section reads `+0x04`, clears the width of the field, and writes the value shifted into place. Later claims of the same section only increment `claim_cnt`; they do not rewrite the register, so two consumers of the same section share the first value.

### Claim counting and release

`sunxi_sram_release()` decrements the count and does nothing else. It does not restore the previous owner and does not write the register. If a driver probes, claims, and is removed, the field stays at the value it wrote. The DE and VE consumers claim at probe and release only when their driver is removed; the OTG claims in `sunxi_musb_init()` and releases in `sunxi_musb_exit()`.

The claim order between the display engine and the OTG controller decides the final value of bits 27:25. The MUSB driver claims when the MUSB core initializes, the mixer claims when the DRM component binds. On the board as built the OTG claim is the last one, so the field reads 0 and both the display and the gadget work. If a future probe order leaves 5 in the field, the gadget stalls in `default`; see the troubleshooting table.

## Userspace interface

### MBUS debugfs

After mounting debugfs, two read-only files appear:

```sh
mkdir -p /sys/kernel/debug
mount -t debugfs none /sys/kernel/debug
cat /sys/kernel/debug/sun252i-f101-mbus/masters
cat /sys/kernel/debug/sun252i-f101-mbus/traffic
```

`masters` prints 40 lines, one per master, in the form `NN priority P limit L MB/s`, or `NN priority P limit none` when bit 31 is clear. `traffic` prints 16 lines, one per group, in the form `name value`, left-aligned in eight columns. Both files re-read the hardware on every open; there is no cached snapshot.

### SRAM debugfs

`/sys/kernel/debug/sram` walks the `mmio-sram` children of the system controller and prints each section, its function table and a `*` next to the function whose register value is current. Only the VE section appears, because the DE and USB sections are not below the `mmio-sram` node in this devicetree. A change to bits 27:25 made by the display engine or the OTG controller is therefore invisible in this file even though the register value changed.

The MBUS clock used by both limit conversions is `/sys/kernel/debug/clk/mbus/clk_rate`. Read it before interpreting a limit, especially on a board whose boot chain selected a different PLL for the MBUS.

### Raw register access

The ownership field is readable and writable from the shell with `devmem`:

```sh
devmem 0x03000004
```

Bits 24 and 27:25 are the two ownership fields. A read of the whole word is safe; a write changes SRAM ownership and can break the display engine or the video engine, so do not write it unless you are deliberately recovering from a bad claim order.

## Worked examples

### Read the arbitration settings

```sh
cat /sys/kernel/debug/sun252i-f101-mbus/masters
```

A representative excerpt, trimmed to the lines the board configures:

```text
 0 priority 0 limit none
...
16 priority 3 limit none
...
39 priority 0 limit 500 MB/s
...
```

The display engine has priority 3 and no bandwidth limit. The CPU has priority 0 and a 500 MB/s limit. Every other master keeps the reset value: priority 0, no limit.

### Read the traffic counters

```sh
cat /sys/kernel/debug/sun252i-f101-mbus/traffic
```

The output is always 16 lines with these names; the values are raw byte counts accumulated during the monitor window and change on every read:

```text
cpu      ...
rv_sys   ...
mahb     ...
dma      ...
ve       ...
ce       ...
tvd      ...
csi      ...
dsp_sys  ...
g2d      ...
di       ...
de       ...
iommu    ...
reserved ...
other    ...
total    ...
```

The `total` group is not necessarily the sum of the others, because the hardware assigns each transaction to one group and some groups may overlap the reserved bucket. Read twice in a row to see which groups are active rather than idle.

### Verify the bandwidth register

Convert the requested 500 MB/s into the register encoding and compare it with the hardware:

```sh
MBUS_HZ=$(cat /sys/kernel/debug/clk/mbus/clk_rate)
MBUS_MHZ=$((MBUS_HZ / 1000000))
LIMIT=$((256 * 500 / MBUS_MHZ))
echo "mbus clock: $MBUS_MHZ MHz, encoded limit: $LIMIT"
devmem 0x03102488
```

`0x03102488` is `0x03102000 + 0x218 + 0x10 * 39`, the BWLR of master 39. Bits 27:16 should equal the computed limit and bit 31 should be set. If the computed value exceeds 0xfff, the driver clamps it and the effective limit is lower than 500 MB/s.

### Inspect one arbitration register

The MSC register of the display engine is at `0x03102000 + 0x210 + 0x10 * 16`, which is `0x03102310`:

```sh
devmem 0x03102310
```

Bits 3:2 hold the priority. With the board setting of 3, the low byte reads `0x0c` when the other bits are zero. This is the same value the `masters` file decodes, and it is useful when a child node is present but the `masters` line still shows priority 0: the register write never happened.

### Check SRAM ownership

```sh
cat /sys/kernel/debug/sram
devmem 0x03000004
```

A representative `sram` file after the video engine probed:

```text
Allwinner sunXi SRAM
--------------------

sram@00020000
	section@0000	(VE)
		cpu
		ve*
```

The same command works while the display engine and the OTG controller are active, but their sections do not appear in this file. Read `0x03000004` to see bits 27:25. The board's working state has them at 0.

## Limitations and troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ls /sys/kernel/debug/sun252i-f101-mbus` fails | debugfs is not mounted | mount debugfs at `/sys/kernel/debug` |
| Every MBUS register reads `0x4` | `RST_BUS_DRAM` is still asserted | check the `resets` property and the CCU reset bit; the driver must deassert it in probe |
| `traffic` stays all zero | the monitor is not running or the window is too short to catch traffic | check the probe log, read twice while a video is playing |
| A `bandwidth-limit-mbps` child has no effect | the child has no valid `reg`, the node is disabled, or the property is zero | check `dmesg` for the driver warning and the child's `reg` |
| The limit reads slightly below the request | the 12-bit field truncates the conversion, especially at a low MBUS clock | compute `256 * mbps / clk_mhz` and accept the rounded-down value |
| `traffic` does not show a per-master rate | the hardware only counts the 16 groups | use `masters` for configuration and the group counters for totals |
| The UDC stays in `default` and the gadget never enumerates | bits 27:25 of `0x03000004` are 5, owned by the display engine | ensure the OTG claim is the last one; see [USB](usb.md) |
| Releasing a section does not give the memory back | `sunxi_sram_release()` only decrements the claim count | claim the section again after the other consumer exits, or reboot |
| A write to `0x03000000` does nothing | only `+0x04` is writable on this SoC | use the section mechanism, not the base register |
| `/sys/kernel/debug/sram` does not list the DE or USB section | only `mmio-sram` children are walked, and those two nodes sit under the SoC | read `0x03000004` directly |

The MBUS debugfs files and the SRAM debugfs file are both read-only. Neither block has a character device, an ioctl interface or an interrupt, so a userspace monitor has to poll the debugfs files.

## Related links

See [CCU](clock.md) for `RST_BUS_DRAM` and the MBUS clock, [Pin multiplexing and GPIO](pinctrl-gpio.md) for the APB0 clock, and [USB](usb.md) for the FIFO RAM claim and the role switch that depends on it. The [Linux introduction](../index.md) lists the drivers that consume these settings, and [Prebuilt images](../linux-prebuilt.md) describes the FEL stage that uses the SRAM at `0x00020000` before Linux starts.
