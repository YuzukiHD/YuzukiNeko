---
title: "PINCTRL - pin multiplexing and GPIO"
---

Every pin of the F101 can carry one of several functions. The pinctrl driver holds the pin descriptions, the multiplexing tables and the pull and drive settings, and it also registers the GPIO controller for the same pins, so a pin can be driven as an input or output by a kernel driver. The whole controller is one device at `0x02000000` with six banks and six external interrupt lines.

| Item | Content |
| --- | --- |
| Driver | `drivers/pinctrl/sunxi/pinctrl-sun252i-f101.c` |
| Compatible | `allwinner,sun252i-f101-pinctrl` |
| Base | `0x02000000`, 0x500 bytes |
| Pins | 59 pins in banks A to F |
| Interrupts | PLIC 67, 69, 71, 73, 75, 77, one per bank |
| Kconfig | driver selected by `CONFIG_ARCH_SUNXI`; core `CONFIG_PINCTRL_SUNXI`, `CONFIG_GPIOLIB`, `CONFIG_GPIO_CDEV` |
| Userspace | `/sys/kernel/debug/pinctrl/2000000.pinctrl/`, `/sys/kernel/debug/gpio`, `/dev/gpiochip0` |

## Hardware

### Banks and pin numbering

The controller calls its ports banks and numbers each pin inside its bank. Linux uses a global number for GPIOs: bank A starts at 0, bank B at 32, bank C at 64, and so on, with 32 numbers reserved per bank even when the bank is not full.

| Bank | Pins | First Linux GPIO | PLIC interrupt | Notes |
| --- | --- | --- | --- | --- |
| A | `PA0` to `PA3` | 0 | 67 | touch panel and PWM alternatives |
| B | `PB0` to `PB3` | 32 | 69 | console UART and I2C |
| C | `PC0` to `PC5` | 64 | 71 | shared SPI, SPIF and SD pads |
| D | `PD0` to `PD22` | 96 | 73 | LCD, DSI, SPI1 and PWM |
| E | `PE0` to `PE14` | 128 | 75 | UART, I2S and PWM alternatives |
| F | `PF0` to `PF6` | 160 | 77 | microSD and card detect |

The last pin is `PF6`, number 166. The GPIO chip covers `round_up(166, 32)` = 192 line numbers starting at 0, so `/dev/gpiochip0` reports 192 lines even though only 59 have a pin description. The unused numbers are holes: they are not backed by a pin and every request on them fails.

### Register layout

The F101 uses the newer Allwinner register layout, selected by `SUNXI_PINCTRL_NEW_REG_LAYOUT` in the driver. Each bank occupies 0x30 bytes. Mux, data, drive level and pull registers are per pin; the external interrupt block is global.

| Offset | Register | Field |
| --- | --- | --- |
| bank + `0x00` | Pn_CFG0..3 | 4 bits per pin, 8 pins per 32-bit word |
| bank + `0x10` | Pn_DATA | 1 bit per pin, read and written |
| bank + `0x14` | Pn_DRV0..3 | 4 bits per pin, drive level |
| bank + `0x24` | Pn_PULL0..1 | 2 bits per pin, pull setting |
| `0x200` | Pn_EINT_CFG | 4 bits per EINT source, 8 sources per word |
| `0x210` | Pn_EINT_CTL | 1 bit per EINT source, enable |
| `0x214` | Pn_EINT_STATUS | 1 bit per EINT source, pending |
| `0x218` | Pn_EINT_DEB | debounce divider per bank |
| `0x300` | Pn_GRP_CONFIG | group configuration |
| `0x340` | PIO_POW_MOD_SEL | bias power mode select |

The bank bases are `0x02000000`, `0x02000030`, `0x02000060`, `0x02000090`, `0x020000c0` and `0x020000f0` for A to F. Within a bank, pin `n` uses bits `4n` to `4n+3` of the mux word at `n / 8 * 4`, so `PB0` is the low nibble of `0x02000030` and `PB1` is bits 7:4 of the same word.

The extended bank K at offset 0x500 is not used: the controller describes only six banks, so the `PIO_BANK_K_OFFSET` path in the generic driver is never taken. The window is 0x500 bytes because the EINT block at 0x200 and the group and bias registers at 0x300 share it with the six banks.

### Pin functions

Mux value 0 is `gpio_in` and value 1 is `gpio_out` on every pin. Value 0xe is the external interrupt function, and value 0xf is `io_disabled`. The values in between are the alternate functions of the pin, in the order the datasheet numbers them; the driver lists them in numeric order and the devicetree names one by its string.

| Function value | Name | Available on |
| --- | --- | --- |
| 0 | `gpio_in` | every pin |
| 1 | `gpio_out` | every pin |
| 0xe | `irq` | every pin, maps to its bank EINT |
| 0xf | `io_disabled` | every pin |
| 2 to 0xd | peripheral names | depends on the pin |

The function names are shared across pins. `uart1`, for example, appears on `PB0`, `PB1`, `PD2`, `PD3`, `PD10`, `PD11`, `PD21`, `PD22`, `PE10`, `PE11`, `PF0`, `PF4`, `PF5` and `PF6`; naming `function = "uart1"` selects whichever mux value that pin uses for the function, not a single global value. That is why a pin group must list the pins it actually uses.

### External interrupts

Each bank has one PLIC line and 32 possible EINT sources. The driver builds an `irq_domain` with `irq_banks * IRQ_PER_BANK` = 192 mappings. A GPIO translates to an interrupt through its pin description: the `irq` function carries `(bank, pin)`, and `to_irq` returns `irq_find_mapping(domain, bank * 32 + pin)`. The interrupt is routed to the PLIC line of the bank, so several pins of one bank share one PLIC interrupt and are demultiplexed by the status register.

The devicetree interrupt specifier for a pinctrl interrupt is three cells: bank, pin and flags. `interrupts-extended = <&pio 5 6 IRQ_TYPE_EDGE_FALLING>` would be `PF6`, falling edge. The debounce divider is per bank and comes from the `input-debounce` property, one value per bank; the F101 devicetree does not set it, so the reset divider applies to all six banks.

### Pull and drive strength

The pull field is two bits: 0 is no pull, 1 is a weak pull-up and 2 is a weak pull-down. The driver accepts the generic `bias-pull-up`, `bias-pull-down` and `bias-disable` properties and the old `allwinner,pull` values. There is no selectable bias voltage on this SoC; the descriptor leaves the bias voltage variant at its default, so the group configuration registers at `0x300` are not used for this purpose.

The drive field is four bits, but the binding is in milliamps. The parser rejects a value below 10, clamps anything above 40 to 40, and rounds down to a multiple of 10. The register value is `mA / 10 - 1`, and the read-back path returns `(value + 1) * 10`, so 10 mA is field 0, 20 mA is 1, 30 mA is 2 and 40 mA is 3. The board uses 30 mA on the DSI lanes and 40 mA with pull-ups on the SD card lines.

## Devicetree

### SoC node

```text
pio: pinctrl@2000000 {
	compatible = "allwinner,sun252i-f101-pinctrl";
	reg = <0x0 0x02000000 0x0 0x500>;
	interrupts-extended = <&plic 67 IRQ_TYPE_LEVEL_HIGH>,
			      <&plic 69 IRQ_TYPE_LEVEL_HIGH>,
			      <&plic 71 IRQ_TYPE_LEVEL_HIGH>,
			      <&plic 73 IRQ_TYPE_LEVEL_HIGH>,
			      <&plic 75 IRQ_TYPE_LEVEL_HIGH>,
			      <&plic 77 IRQ_TYPE_LEVEL_HIGH>;
	clocks = <&ccu SUN252I_F101_CLK_APB0>;
	gpio-controller;
	#gpio-cells = <3>;
	interrupt-controller;
	#interrupt-cells = <3>;
};
```

The six interrupt entries are ordered by bank. The driver calls `platform_get_irq()` for index 0 to 5 and registers a chained handler for each. The clock is the APB0 gate; the driver gets it with `devm_clk_get_enabled()` using no name because the node has exactly one clock.

### Pin groups

The SoC devicetree declares fourteen groups. Only some are referenced by an enabled board node; the rest are available for a custom board file.

| Group | Pins | Function | Used by |
| --- | --- | --- | --- |
| `uart0_pe_pins` | `PE0`, `PE1` | `uart0` | not enabled, UART0 is disabled |
| `pwm0_pe2_pins` | `PE2` | `pwm0_0` | not used |
| `pwm0_pe3_pins` | `PE3` | `pwm0_1` | not used |
| `pwm0_pe4_pins` | `PE4` | `pwm0_2` | not used |
| `pwm0_pe5_pins` | `PE5` | `pwm0_3` | not used |
| `uart1_pb_pins` | `PB0`, `PB1` | `uart1` | console |
| `i2c2_pb2_pins` | `PB2`, `PB3` | `twi2` | I2C bus |
| `spi0_pc_pins` | `PC0` to `PC5` | `spi0` | NOR flash on the SPI controller |
| `dsi_pd_pins` | `PD12` to `PD21` | `dsi` | MIPI DSI lanes, 30 mA |
| `pwm0_pd22_pin` | `PD22` | `pwm0_2` | display backlight |
| `spif0_pc_pins` | `PC0` to `PC5` | `spif0` | NOR flash on the SPIF variant |
| `spi1_pd_pins` | `PD0` to `PD3` | `spi1` | not used, SPI1 is disabled |
| `sdc0_pf_pins` | `PF0` to `PF5` | `sdc0` | microSD, 40 mA, pull-up |
| `sdc2_pc_pins` | `PC0` to `PC5` | `sdc2` | not used, SMHC2 is disabled |

The SPI controller, the SPIF controller and the SMHC2 controller share the `PC0` to `PC5` pads, so only one of them can be wired out at a time. The board file selects the general SPI controller. The SPIF devicetree variant replaces that group with `spif0_pc_pins` on the same pads.

Drive strength and bias are part of the group. The SD card and DSI groups show both forms:

```text
sdc0_pf_pins: sdc0-pf-pins {
	pins = "PF0", "PF1", "PF2", "PF3", "PF4", "PF5";
	function = "sdc0";
	drive-strength = <40>;
	bias-pull-up;
};

dsi_pd_pins: dsi-pd-pins {
	pins = "PD12", "PD13", "PD14", "PD15", "PD16",
	       "PD17", "PD18", "PD19", "PD20", "PD21";
	function = "dsi";
	drive-strength = <30>;
};
```

### Board consumers

The board file attaches the groups to the peripherals it enables, and takes the card detect line as a GPIO rather than as part of the SD pin group:

```text
&uart1 {
	pinctrl-names = "default";
	pinctrl-0 = <&uart1_pb_pins>;
	status = "okay";
};

&i2c2 {
	pinctrl-names = "default";
	pinctrl-0 = <&i2c2_pb2_pins>;
	status = "okay";
};

&sdc0 {
	cd-gpios = <&pio 5 6 GPIO_ACTIVE_LOW>;
	status = "okay";
};

&dsi0 {
	pinctrl-names = "default";
	pinctrl-0 = <&dsi_pd_pins>;
	status = "okay";
};
```

`<&pio 5 6 GPIO_ACTIVE_LOW>` is the three-cell GPIO form: bank 5 is F, pin 6 is `PF6`, and the flag says the line is active low. The panel reset line in the DSI child node uses the same form: `<&pio 3 9 GPIO_ACTIVE_LOW>` is `PD9`.

| Binding | Scope |
| --- | --- |
| `Documentation/devicetree/bindings/pinctrl/allwinner,sun4i-a10-pinctrl.yaml` | Generic Allwinner pinctrl node; the F101 compatible is not listed in the enum in this tree |
| `include/dt-bindings/pinctrl/sun4i-a10.h` | Pull values for the legacy `allwinner,pull` binding |
| `include/dt-bindings/gpio/gpio.h` | `GPIO_ACTIVE_LOW` and the other flags |

## Kconfig

```text
CONFIG_ARCH_SUNXI=y
CONFIG_PINCTRL=y
CONFIG_PINCTRL_SUNXI=y
CONFIG_GPIOLIB=y
CONFIG_GPIO_CDEV=y
# CONFIG_GPIO_SYSFS is not set
```

The F101 driver has no Kconfig symbol of its own: `drivers/pinctrl/sunxi/Makefile` builds `pinctrl-sun252i-f101.o` with `obj-$(CONFIG_ARCH_SUNXI)`. `CONFIG_PINCTRL_SUNXI` and `CONFIG_PINCTRL` are selected by `ARCH_SUNXI` in `arch/riscv/Kconfig.socs`, so a kernel that supports the board always has the controller. `CONFIG_GPIO_CDEV` defaults to `y` and gives `/dev/gpiochip0`; `CONFIG_GPIO_SYSFS` is off, so there is no `/sys/class/gpio`.

## Driver internals

### Probe and state

`sun252i_f101_pinctrl_probe()` calls `sunxi_pinctrl_init_with_flags()` with `SUNXI_PINCTRL_NEW_REG_LAYOUT`. The flag changes the bank stride to `D1_BANK_MEM_SIZE` 0x30, the pull register offset to 0x24 and the drive level field width to 4 bits. The older layout would use 0x24-byte banks, pull at 0x1c and a 2-bit drive field.

`sunxi_pinctrl_init_with_flags()` maps the window, builds the pinctrl state and registers the GPIO chip, the pin ranges, the clock, the six chained interrupt handlers and a linear irq domain of 192 entries. It then masks and clears every EINT before registering the handlers.

### Pin groups and functions

The driver declares one `sunxi_desc_pin` per pin, each with its function list in numeric order. The state builder turns every pin into a pinctrl group of the same name (`PA0`, `PB0`, ...), adds one function entry per distinct function name, and records the group list for each function. The pinmux ops are strict, so two devices cannot request the same pin through two different groups at the same time.

The device tree parser reads the generic `pins` and `function` properties first and falls back to `allwinner,pins` and `allwinner,function`. It reads `drive-strength` or `allwinner,drive`, and `bias-pull-up`, `bias-pull-down`, `bias-disable` or `allwinner,pull`. The packed configuration is applied to the whole group when the map is activated.

### GPIO controller

There is a single `gpio_chip` for the whole controller. Its label is the device name `2000000.pinctrl`, its base is 0, and its `ngpio` is 192. Each pin is added as a one-pin GPIO range so that the pin controller and the GPIO numbers agree. The chip is not split per bank; one range keeps the global numbering stable across banks.

GPIO direction is not a separate register. `direction_input` sets the pin mux to `gpio_in`, `direction_output` sets it to `gpio_out`, and `get`/`set` read and write the data register. `of_xlate` accepts the three-cell form: bank, pin, flags. `to_irq` finds the `irq` function of the pin and maps its bank and pin number into the domain.

### Interrupt controller

When a consumer requests an interrupt from the pin controller, the driver switches the pin mux to the `irq` function if it is not there already, programs the EINT configuration register with the requested type, and enables the bit in the control register. The chained handler reads the status register of the bank, finds the pending bits, and dispatches the matching virtual interrupts. The debounce divider comes from `input-debounce`; the F101 devicetree does not set it, so the reset value applies.

## Userspace interface

### debugfs files

Mount debugfs and the pin controller directory appears:

```sh
mkdir -p /sys/kernel/debug
mount -t debugfs none /sys/kernel/debug
ls /sys/kernel/debug/pinctrl/2000000.pinctrl/
```

| File | Content |
| --- | --- |
| `pins` | registered pin count and one line per pin with its GPIO range |
| `pinmux-pins` | which device or GPIO owns each pin, and the selected function and group |
| `pingroups` | group names, one line per group |
| `pinmux-functions` | function names and the groups that implement them |
| `pinconf-pins` | per-pin drive strength and bias |
| `pinconf-groups` | the same settings per group |
| `gpio-ranges` | the mapping between the pin controller and the GPIO chip |
| `pinmux-select` | write-only debug override: `group function` changes the mux directly |

`CONFIG_GPIO_CDEV` also gives `/dev/gpiochip0`. There is no `gpioinfo` or `gpioget` in the image and no libgpiod, and `CONFIG_GPIO_SYSFS` is off, so the character device is only usable from a program that issues the GPIO ioctls itself. The only runtime mux control is the root-writable `pinmux-select` file; it bypasses the pinctrl state and does not claim the pin, so it is a debugging aid rather than a supported interface.

### GPIO debugfs

`/sys/kernel/debug/gpio` lists the requested and named lines of every chip. It is the only shell-level view of a GPIO value:

```sh
cat /sys/kernel/debug/gpio
```

## Worked examples

### Read the pin multiplexing

```sh
cat /sys/kernel/debug/pinctrl/2000000.pinctrl/pinmux-pins
```

A representative excerpt for the board, with the unchanged lines removed:

```text
pin 0 (PA0): UNCLAIMED
...
pin 32 (PB0): device 2500400.serial function uart1 group uart1_pb_pins
pin 33 (PB1): device 2500400.serial function uart1 group uart1_pb_pins
pin 34 (PB2): device 2502800.i2c function twi2 group i2c2_pb2_pins
...
pin 64 (PC0): device 4025000.spi function spi0 group spi0_pc_pins
...
pin 108 (PD12): device 5450000.dsi function dsi group dsi_pd_pins
...
pin 166 (PF6): GPIO cd
```

A line with `UNCLAIMED` is a pin no driver requested. A line with `GPIO cd` is a pin requested as a GPIO by the mmc core; the `cd` label comes from the `cd-gpios` consumer name. A pin with a device, function and group is muxed by a pinctrl map.

### Compare a pin with its mux register

```sh
cat /sys/kernel/debug/pinctrl/2000000.pinctrl/pins
devmem 0x02000030
```

The low nibble of `0x02000030` is the mux value of `PB0`. With the console active it should be 4, the `uart1` function of that pin. The `pins` file confirms the global GPIO number of each pin:

```text
registered pins: 59
pin 0 (PA0) 0:2000000.pinctrl
pin 1 (PA1) 1:2000000.pinctrl
...
pin 32 (PB0) 32:2000000.pinctrl
...
pin 166 (PF6) 166:2000000.pinctrl
```

### Change a mux for debugging

The `pinmux-select` file accepts `group function` as a root write. For example, this sets `PB0` to `uart1` without going through the pinctrl state:

```sh
echo "PB0 uart1" > /sys/kernel/debug/pinctrl/2000000.pinctrl/pinmux-select
```

The write does not claim the pin and is not recorded in `pinmux-pins`; the next pinctrl state activation, driver rebind or reboot overwrites it. Changing the console pins this way can cut the only console, so use it only on a pin you can recover by rebooting.

### Read the card detect line

`PF6` is requested by the mmc core as an active-low input. The GPIO debugfs view shows its current level:

```sh
cat /sys/kernel/debug/gpio
```

A representative line with the card inserted:

```text
 gpio-166 (                    |cd                  ) in  hi ACTIVE LOW
```

Removing the card changes `hi` to `lo`. If the line never changes, the pin group, the pull-up or the `GPIO_ACTIVE_LOW` flag is wrong.

### Enable an unused UART

The SoC file already declares `uart0_pe_pins` on `PE0` and `PE1`, but UART0 is disabled. Enabling it needs only the board node:

```text
&uart0 {
	pinctrl-names = "default";
	pinctrl-0 = <&uart0_pe_pins>;
	status = "okay";
};
```

After rebuilding the DTB, `/dev/ttyS0` exists and the pins show `function uart0 group uart0_pe_pins` in `pinmux-pins`. The same pattern works for `spi1_pd_pins` and `sdc2_pc_pins`, provided the shared pads are free.

## Limitations and troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| A pin shows `UNCLAIMED` | its consumer is disabled or has no `pinctrl-0` | enable the node and attach the group |
| `could not request pin` in `dmesg` | strict mode, two groups claim the same pin, usually `PC0` to `PC5` | enable only one of SPI0, SPIF and SMHC2 |
| UART1 prints nothing | `PB0` and `PB1` are not muxed to `uart1` | check `pinmux-pins` and the `pinctrl-0` of `uart1` |
| SD card is never detected | `PF6` is not active low, has no pull-up, or the group is missing | check `cd-gpios`, `bias-pull-up` and the GPIO debugfs level |
| `gpioinfo` or `gpioget` not found | the image has no libgpiod | use debugfs, or write a program against `/dev/gpiochip0` |
| `/sys/class/gpio` does not exist | `CONFIG_GPIO_SYSFS` is off | use the character device or debugfs |
| An EINT never fires | the pin is not muxed to `irq`, or the type is wrong | check the interrupt specifier and `pinmux-pins` |
| `drive-strength = <5>` is rejected | values below 10 mA are invalid | use 10, 20, 30 or 40 |
| A pin's function changes back after a reboot | `pinmux-select` is a debug override and is not persistent | set the group in the devicetree and rebuild |
| `devmem` shows an unexpected mux value | another consumer owns the pin | find the device in `pinmux-pins` |

The controller has no wake-up or power-domain control in this driver. Suspend and resume are not wired to it, and the pin state is whatever the last consumer set.

A group can mix pins from different banks. The generated function table does not care about banks, only about the mux value each pin uses for the function.

The `pins` file lists all 59 pins, while the GPIO chip has 192 lines. Line numbers that do not map to a pin are reported by the chip but fail on request.

## Related links

See [UART](uart.md) for the console pin group, [I2C](i2c.md) for the `PB2` and `PB3` group, [microSD](mmc.md) for `PF0` to `PF6`, and [CCU](clock.md) for the APB0 gate that drives the controller. The [Linux introduction](../index.md) lists the other drivers, and [Prebuilt images](../linux-prebuilt.md) shows how the devicetree is rebuilt into the image.
