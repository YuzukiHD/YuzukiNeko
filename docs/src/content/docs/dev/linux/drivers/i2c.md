---
title: "I2C - the I²C bus"
---

The F101 has three I²C controllers, called TWI in the Allwinner documentation. They are the Marvell mv64xxx design that most Allwinner SoCs carry, with a small register file, an interrupt-driven state machine and no DMA. Linux drives them with `i2c-mv64xxx`, and with the character device enabled the whole bus can be probed and exercised from the shell.

Only one of the three is enabled on the board: `i2c2`, on `PB2`/`PB3`. Nothing is declared on that bus in the devicetree, so it starts empty and is available for whatever is wired to those two pins. This chapter covers the register map and the bus timing, the devicetree nodes, the probe path, and the BusyBox tools that talk to the bus through `/dev/i2c-*`.

| Item | Content |
| --- | --- |
| Driver | `drivers/i2c/busses/i2c-mv64xxx.c` |
| Compatible | `allwinner,sun20i-d1-i2c`, `allwinner,sun8i-v536-i2c`, `allwinner,sun6i-a31-i2c` |
| Base | `0x02502000` (TWI0), `0x02502400` (TWI1), `0x02502800` (TWI2) |
| Register window | `0x400` bytes per controller |
| Interrupts | PLIC 9, 10, 11 |
| Clocks | `CLK_BUS_TWI0/1/2`, gates on `apb1` |
| Reset | `RST_BUS_TWI0/1/2` |
| Kconfig | `CONFIG_I2C`, `CONFIG_I2C_MV64XXX`, `CONFIG_I2C_CHARDEV` |
| Userspace | `/dev/i2c-N`, `/sys/bus/i2c/devices`, `i2cdetect`, `i2cget`, `i2cset`, `i2cdump`, `i2ctransfer` |

## How the bus works

The bus needs pull-ups on both SDA and SCL. The `i2c2_pb2_pins` group sets no bias, so the pull-ups are the carrier board's job; without them the lines never rise and every transfer fails with a timeout. The controller drives open-drain outputs and does not supply the pull-ups itself.

The controller is used as a master-only state machine. A transfer is started by writing the target address to the data register and setting START in the control register; from then on every step — address acknowledged, byte written, byte read — raises an interrupt with a status code that says exactly what happened on the wire. Software reads the status, decides the next action, writes the next byte and clears the interrupt flag. There is no FIFO and no descriptor engine, so a transfer is a sequence of interrupts, one or two per byte.

The register file, from `mv64xxx_i2c_regs_sun4i` in the driver:

| Offset | Register | Purpose |
| --- | --- | --- |
| `0x00` | ADDR | Target address for the address phase |
| `0x04` | EXT_ADDR | Second address byte for 10-bit targets |
| `0x08` | DATA | Byte to send or the byte just received |
| `0x0c` | CONTROL | ACK, interrupt flag, STOP, START, bus enable, interrupt enable |
| `0x10` | STATUS | The state machine's code for the last event |
| `0x14` | CLOCK | Baud-rate factors: `M` and `N` |
| `0x18` | SOFT_RESET | Software reset |

The control bits that matter are `ACK` (bit 2), `IFLG` (bit 3), `STOP` (bit 4), `START` (bit 5), `TWSIEN` (bit 6) and `INTEN` (bit 7). The driver keeps a cached copy in `cntl_bits` and rewrites the register at each step rather than doing read-modify-write in the interrupt handler.

The status codes are the I²C specification's own values, and they are what a bus error is diagnosed from:

| Code | Meaning |
| --- | --- |
| `0x08` | START sent |
| `0x10` | Repeated START sent |
| `0x18` / `0x20` | Address + write acknowledged / not acknowledged |
| `0x28` / `0x30` | Data byte written, acknowledged / not acknowledged |
| `0x38` | Arbitration lost |
| `0x40` / `0x48` | Address + read acknowledged / not acknowledged |
| `0x50` / `0x58` | Data byte read, ACK sent / NACK sent |
| `0xd0` / `0xd8` | Second address byte (10-bit target) written, ACK / NACK |
| `0xe0` / `0xe8` | Second address byte read, ACK / NACK |
| `0xf8` | No relevant status |

A NACK on the address (`0x20` or `0x48`) is the normal way a scan discovers that nobody is at an address. A NACK on a data byte while writing means the target refused the byte; the driver turns that into an I/O error on the `write()` or ioctl.

### Bus timing

The clock register does not take a rate; it takes two factors, `M` and `N`, and the hardware divides the input clock by `10 × (M + 1) × 2^N` for this variant. `mv64xxx_calc_freq()` in the driver implements that formula, and `mv64xxx_find_baud_factors()` scans `N` from 0 to 7 and `M` from 0 to 15 for the largest frequency at or below the requested one; the `clk_n_base_0` flag, set for the Allwinner compatible strings, makes the power term `2^N` instead of `2^(N+1)`.

The input is the `apb1` clock through the per-bus gate. `apb1` (register `0x0524`) is a divider plus a mux whose reset parent is `dcxo24M`, and the bootloader leaves it at the reset setting, so the controller sees 24 MHz. With that input:

| Requested | `N` | `M` | Produced |
| --- | --- | --- | --- |
| 100 kHz | 1 | 11 | 24 MHz / (10 × 12 × 2) = 100 kHz |
| 400 kHz | 0 | 5 | 24 MHz / (10 × 6 × 1) = 400 kHz |

For 100 kHz the exact match exists, so `clock-frequency = <100000>` gives exactly 100 kHz, and `<400000>` gives 400 kHz. A value the factors cannot hit exactly gets the nearest lower rate, never a higher one. The bits themselves are written to CLOCK only after this search; there is no runtime adjustment and no clock stretching support beyond what the hardware does.

The adapter timeout is fixed at one second: `mv64xxx_of_config()` sets `drv_data->adapter.timeout = HZ` with a comment that the devicetree has no property for it. A transfer blocked by a target that holds SDA low therefore fails after about a second rather than hanging the caller forever. The driver also has an "atomic" transfer path, used by the I²C core when a transfer is requested from a context that cannot sleep; it polls instead of waiting and adds a 100 ns delay before reading STATUS, because the controller sometimes updates the status register only after asserting IFLG.

This controller does not support the Marvell offload engine. `offload_enabled` is only set for the `marvell,mv78230-i2c` compatible, so on the F101 every message goes through the interrupt state machine. Bus recovery is nominally wired up (`mv64xxx_i2c_init_recovery_info()` puts a `bus_recovery_info` on the adapter when the device has pinctrl), but the board declares no GPIO-based recovery state, so the generic recovery cannot bit-bang SCL. A bus stuck because a target is holding SDA low needs a power cycle, not a recovery ioctl.

## Devicetree

The three controllers are identical apart from their address and interrupt:

```text
i2c2: i2c@2502800 {
	compatible = "allwinner,sun20i-d1-i2c",
		     "allwinner,sun8i-v536-i2c",
		     "allwinner,sun6i-a31-i2c";
	reg = <0x0 0x02502800 0x0 0x400>;
	interrupts-extended = <&plic 11 IRQ_TYPE_LEVEL_HIGH>;
	clocks = <&ccu CLK_BUS_TWI2>;
	resets = <&ccu RST_BUS_TWI2>;
	status = "disabled";
	#address-cells = <1>;
	#size-cells = <0>;
};
```

| Label | Node | Base | PLIC | Board |
| --- | --- | --- | --- | --- |
| `i2c0` | `i2c@2502000` | `0x02502000` | 9 | Disabled |
| `i2c1` | `i2c@2502400` | `0x02502400` | 10 | Disabled |
| `i2c2` | `i2c@2502800` | `0x02502800` | 11 | Enabled on `PB2`/`PB3` |

The compatible list is ordered from most specific to the fallback that the driver actually matches. `of_device_is_compatible()` returns true for any string in the list, so the presence of `allwinner,sun6i-a31-i2c` is what turns on the `clk_n_base_0` baud formula and the inverted interrupt-flag handling. Dropping that string from a board file would silently change the bus frequency.

The board enables the second controller and routes its pins:

```text
&i2c2 {
	pinctrl-names = "default";
	pinctrl-0 = <&i2c2_pb2_pins>;
	status = "okay";
};
```

The pin group lives in the SoC devicetree:

```text
i2c2_pb2_pins: i2c2-pb2-pins {
	pins = "PB2", "PB3";
	function = "twi2";
};
```

`PB2` and `PB3` are the only I²C pins the board file configures. `i2c0` and `i2c1` have no pin groups anywhere in the SoC devicetree, so enabling either needs a new group first; the pins that carry them are not listed in the tree.

A target is a child node whose `reg` is the seven-bit address. No such child node exists in the board devicetree today, but this is the shape:

```text
&i2c2 {
	eeprom@50 {
		compatible = "atmel,24c02";
		reg = <0x50>;
	};
};
```

The binding is `Documentation/devicetree/bindings/i2c/marvell,mv64xxx-i2c.yaml`. It requires `compatible`, `reg`, `interrupts` and `clocks`, allows `clock-frequency`, `resets`, `#address-cells`/`#size-cells`, and documents the `marvell,mv78230` offload properties, which this SoC does not use.

## Kconfig

```text
CONFIG_I2C=y
CONFIG_I2C_MV64XXX=y
CONFIG_I2C_CHARDEV=y
```

`CONFIG_I2C` is the core and the `i2c-dev` interface is added by `CONFIG_I2C_CHARDEV`. `CONFIG_I2C_MV64XXX` is the bus driver; its Kconfig entry depends on `PLAT_ORION || ARCH_SUNXI || ARCH_MVEBU || COMPILE_TEST`, so it is available here through `ARCH_SUNXI`. The board defconfig `arch/riscv/configs/sun252i_f101_yuzukineko_defconfig` sets all three, and also `CONFIG_I2C_SLAVE` is *not* set, so the controller is master-only in this build.

The tools come from BusyBox, not from an i2c-tools package. `CONFIG_I2CGET`, `CONFIG_I2CSET`, `CONFIG_I2CDUMP`, `CONFIG_I2CDETECT` and `CONFIG_I2CTRANSFER` are all enabled in the shipped `.config`, and the applets install into `/usr/sbin`.

## Driver internals

### Probe path

`mv64xxx_i2c_probe()` in `drivers/i2c/busses/i2c-mv64xxx.c`:

1. Maps the register window with `devm_platform_ioremap_resource()`.
2. Gets the bus clock as the unnamed clock (`devm_clk_get(dev, NULL)`) and an optional register clock named `"reg"`. The F101 node has only the bus clock.
3. Gets the interrupt with `platform_get_irq()`.
4. Calls `mv64xxx_of_config()`, which reads `clock-frequency` (default 100 kHz), computes the `M`/`N` factors, gets an optional exclusive reset, sets the one-second timeout, copies the register offsets for the matched compatible, and sets the Allwinner quirks.
5. Calls `mv64xxx_i2c_init_recovery_info()`, which is not fatal if it fails.
6. Enables runtime PM with a one-second autosuspend delay, requests the interrupt and registers the adapter with `i2c_add_numbered_adapter()`.

There is no DMA channel and no per-transfer buffer in the driver: the message array is walked in place, and each `struct i2c_msg` points straight at the caller's buffer. A combined write-then-read (register address followed by a read) is expressed as two messages and turned into a repeated START by the state machine.

### The state machine

`mv64xxx_i2c_xfer()` sets `atomic = 0` and calls `mv64xxx_i2c_xfer_core()`, which prepares the first message in `mv64xxx_i2c_prepare_for_io()`, starts the transfer and waits on `drv_data->waitq`. The interrupt handler `mv64xxx_i2c_intr()` runs `mv64xxx_i2c_fsm()` on the status code and then `mv64xxx_i2c_do_action()`, which writes the next byte, raises STOP, or starts the next message. When the last message finishes, or a NACK or arbitration loss stops the transfer, the handler sets `drv_data->block = 0` and wakes the waiter, which returns the number of messages transferred or a negative errno.

The states are `WAITING_FOR_START_COND`, `WAITING_FOR_RESTART`, `WAITING_FOR_ADDR_1_ACK`, `WAITING_FOR_ADDR_2_ACK`, `WAITING_FOR_TARGET_ACK` and `WAITING_FOR_TARGET_DATA`; the actions are `SEND_RESTART`, `SEND_ADDR_1`, `SEND_ADDR_2`, `SEND_DATA`, `RCV_DATA`, `RCV_DATA_STOP` and `SEND_STOP`. Reading those two enums in the driver is the quickest way to understand why a particular transfer stopped.

The I²C core serialises every transfer on one adapter with the adapter lock, so the driver's single `waitq`, `block` flag and `msgs` pointer are only ever used by one caller at a time. A second process that opens the same `/dev/i2c-N` waits in the core, not in the driver. A transfer also owns the bus for all of its messages: two processes cannot interleave bytes on the same adapter, but nothing stops a caller from holding the bus for a long combined transfer and delaying everyone else.

### Interrupts and the flag quirk

The handler loops while the control register reports IFLG set. On the Allwinner variant it clears the flag by writing the cached control value with IFLG set, which is what `irq_clear_inverted` means; the plain mv64xxx clears it the other way round. It also drops the spinlock only after the whole loop, so a burst of state-machine steps is handled without re-entering the handler.

If the controller raises an interrupt but the status register has not caught up, the atomic path adds the 100 ns delay mentioned above. In interrupt mode this is not needed, and the code comment says the problem has not been observed there.

### Error paths

A missing clock fails probe with a message from `mv64xxx_of_config()` ("CLK is mandatory when using DT to describe the i2c bus"). A requested frequency that no `M`/`N` pair can produce fails with `-EINVAL`; in practice every standard rate from 24 MHz works. A NACK on the address surfaces as `-ENXIO`, the core's "no such target" error; an arbitration loss ends the transfer with an error from the state machine; a stuck bus fails with `-ETIMEDOUT` after the one-second adapter timeout. `i2cget` prints the error and exits non-zero.

### Runtime power management

The driver enables runtime PM with autosuspend; `mv64xxx_i2c_runtime_suspend()` asserts the reset and disables both clocks, and resume reverses that. Register state is not saved explicitly — the state machine is idle whenever the device is suspended, and the next transfer re-initialises the controller.

## Userspace interface

With `CONFIG_I2C_CHARDEV`, each registered adapter gets a character device. The number is the adapter number, which is *not* the devicetree label.

### Which bus number?

This matters because the number in `/dev/i2c-N` is what every command below uses. `mv64xxx_i2c_probe()` sets `adapter.nr = pd->id`, the platform device id. A device created from a devicetree node without an `i2cN` alias has id -1, so `i2c_add_numbered_adapter()` falls through to `i2c_add_adapter()`, which asks `of_alias_get_id(dev->of_node, "i2c")`, gets -1 again, and registers the adapter with the first free bus number.

The F101 devicetree declares no `i2cN` aliases, and the stock board enables only `i2c2`. The first and only adapter therefore registers as bus 0, not bus 2. The `i2c2` label is a devicetree label, not a bus number. To pin the number, add an alias:

```text
aliases {
	i2c0 = &i2c0;
	i2c1 = &i2c1;
	i2c2 = &i2c2;
};
```

With that, the adapter registers at the requested number and `/dev/i2c-2` exists as the label suggests. Without it, always ask the bus what it is called rather than assuming.

| Path | Meaning |
| --- | --- |
| `/dev/i2c-N` | One character device per registered adapter |
| `/sys/class/i2c-dev/i2c-N/name` | Adapter name, `mv64xxx_i2c adapter` |
| `/sys/bus/i2c/devices/` | Clients, plus a `i2c-N` entry per adapter |
| `/sys/bus/i2c/devices/i2c-N/new_device` | Ask the core to instantiate a client from user space |

One practical detail about `I2C_SLAVE`: the core refuses an address that already has a driver bound to it, because two masters of the same client would fight. `i2cget`, `i2cset` and `i2cdump` therefore print an error unless `-f` is given. `-f` maps to `I2C_SLAVE_FORCE` and should only be used for a bus that has no kernel driver for that address, which is the normal case for an empty board bus.

The `i2c-dev` interface is what the tools use. The relevant ioctls are `I2C_SLAVE` (set the target address for plain `read()`/`write()`), `I2C_RDWR` (the combined transfer the tools use), `I2C_FUNCS` (the capability word behind `i2cdetect -F`), `I2C_SMBUS` and `I2C_TENBIT`. `I2C_SLAVE_FORCE` bypasses the "address already in use" check and is what `-f` selects in the tools.

## Worked examples

### Example 1: find the bus and scan it

```sh
i2cdetect -l
i2cdetect -y 0
```

Representative output on the stock board, with nothing wired to `PB2`/`PB3`:

```text
i2c-0	i2c       	mv64xxx_i2c adapter             	I2C adapter
     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f
00:          -- -- -- -- -- -- -- -- -- -- -- -- --
10: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
20: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
30: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
40: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
50: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
60: -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
70: -- -- -- -- -- -- -- -- --
```

The first line comes from `i2cdetect -l`, which lists `/sys/class/i2c-dev/*` and prints the adapter name and algorithm. The table is the scan: addresses 0x00-0x02 and 0x78-0x7f are outside the default range and print as blanks, `--` means no ACK, and a responding address would print its own number. In the default `auto` mode the scan uses SMBus quick writes for most addresses and read-byte probing for 0x30-0x37 and 0x50-0x5f; `-q` forces quick writes, `-r` forces read-byte probing, and `-a` widens the range to 0x00-0x7f. The BusyBox source warns that quick writes are known to corrupt the Atmel AT24RF08 EEPROM and that read-byte probing can lock some SMBus clock chips; on an unknown bus, scan the smallest address range that can contain the device, with `i2cdetect -y 0 0x48 0x4f` for example.

### Example 2: what the adapter can do

```sh
i2cdetect -F 0
```

Representative output:

```text
Functionalities implemented by bus #0
I2C                              yes
SMBus quick command              yes
SMBus send byte                  yes
SMBus receive byte               yes
SMBus write byte                 yes
SMBus read byte                  yes
SMBus write word                 yes
SMBus read word                  yes
SMBus process call               yes
SMBus block write                yes
SMBus block read                 no
SMBus block process call         no
SMBus PEC                        yes
I2C block write                  yes
I2C block read                   yes
```

This follows from `mv64xxx_i2c_functionality()`, which returns `I2C_FUNC_I2C | I2C_FUNC_10BIT_ADDR | I2C_FUNC_SMBUS_EMUL`. `SMBUS_EMUL` includes the block-write and I²C-block bits but not read-block or block-process-call, which is why those two rows say no. PEC is advertised even though the controller does not compute it in hardware; the core emulates it.

### Example 3: a register read and write

With a target at address `0x50` whose register `0x00` is readable, a read is two messages — write the register address, repeated START, read one byte:

```sh
i2ctransfer -y 0 w1@0x50 0x00 r1
i2cget -y 0 0x50 0x00
i2cset -y 0 0x50 0x00 0x5a
i2cdump -y 0 0x50
```

`i2ctransfer` prints the read bytes as `0xNN` separated by spaces; `i2cget` prints the single value in the same form. `i2cset` writes and, with `-r`, reads the register back and compares. `i2cdump` prints a 16-by-16 table of the target's registers. The exact output depends entirely on the device; what the adapter contributes is the transfer form, not the data. If the target does not answer, every one of these fails with `read failed: Remote I/O error` or `write failed: Remote I/O error` and exit status 1 rather than printing a value.

### Example 4: a small i2c-dev program

The ioctl interface is small enough to use directly. This program reads register `0x00` of the target at `0x50` with one combined transfer:

```c
/* i2c-rd.c: read one byte from register 0x00 of the target at 0x50 */
#include <fcntl.h>
#include <stdio.h>
#include <sys/ioctl.h>
#include <linux/i2c.h>
#include <linux/i2c-dev.h>

int main(void)
{
	int fd = open("/dev/i2c-0", O_RDWR);
	unsigned char reg = 0x00, val = 0;
	struct i2c_msg msgs[2] = {
		{ .addr = 0x50, .flags = 0, .len = 1, .buf = &reg },
		{ .addr = 0x50, .flags = I2C_M_RD, .len = 1, .buf = &val },
	};
	struct i2c_rdwr_ioctl_data xfer = { .msgs = msgs, .nmsgs = 2 };

	if (fd < 0)
		return 1;
	if (ioctl(fd, I2C_RDWR, &xfer) < 0)
		return 1;
	printf("0x%02x\n", val);
	return 0;
}
```

Build it with the board toolchain and copy it over the same way as the other test programs:

```sh
build-rv32/host/bin/riscv32-buildroot-linux-musl-gcc -static -o i2c-rd i2c-rd.c
```

The `I2C_RDWR` ioctl takes the two messages as one transaction with a repeated START between them, so the target sees the register write and the read as a single bus operation and does not release SDA in between. That is the same sequence `i2ctransfer -y 0 w1@0x50 0x00 r1` produces.

## Limitations

| Limitation | Detail |
| --- | --- |
| One enabled bus | Only `i2c2` is `okay`; `i2c0` and `i2c1` have no pin groups |
| Master only | The controller can be a target in hardware, but `CONFIG_I2C_SLAVE` is not enabled and the driver does not implement target mode |
| No offload engine | The Marvell transaction generator is only used for `marvell,mv78230-i2c`; this SoC uses the interrupt state machine |
| No usable bus recovery | Recovery info is installed but the board has no GPIO recovery state, so a stuck bus cannot be bit-banged free |
| One-second timeout | Fixed in the driver; there is no devicetree property for it |
| Bus number is dynamic | Without `i2cN` aliases the adapter number is the first free one, not the label number |
| No hardware PEC | PEC is emulated by the I²C core, not generated by the controller |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Error: Could not open file '/dev/i2c-2'` | The adapter registered as bus 0 because there is no alias | Use `i2cdetect -l` to see the number, or add `i2c2 = &i2c2;` to the aliases |
| `i2cdetect` shows every address as `--` | Nothing on the bus, or SDA/SCL not routed | Check the wiring on `PB2`/`PB3` and that `&i2c2` is `okay` |
| Every access returns `Remote I/O error` | The target address is wrong, or the device is not powered | Confirm the seven-bit address and the supply |
| Transfer fails after about one second | A target is holding SDA low, or clock stretching never ends | Power-cycle the target; there is no bus recovery here |
| Bus frequency is wrong | The `allwinner,sun6i-a31-i2c` fallback was removed from `compatible` | Restore the full compatible list |
| `/dev/i2c-0` exists but nothing answers | This is the expected empty state of the board's own bus | Wire a device to `PB2`/`PB3`, or use a bus that has one |
| `i2cdetect` says "bus doesn't support SMBus quick write" | Functionality bits missing for that adapter | Use `-r` for read-byte probing |

## Related pages

- [Linux development](../index.md) for the kernel configuration and the boot chain.
- [Pin multiplexing and GPIO](pinctrl-gpio.md) for the `PB2`/`PB3` group.
- [UART - serial ports](uart.md) for the other two-wire peripheral on the board.
- [Common commands](../apps/linux-commands.md): the shell commands that work on the board, including the tools used here.
