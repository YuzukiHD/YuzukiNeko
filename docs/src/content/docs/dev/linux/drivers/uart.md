---
title: "UART - serial ports"
---

The F101 has six serial ports built on the Synopsys DesignWare 8250 core. Linux drives them with the generic `8250_dw` driver on top of the 8250 core, and the board only wires out UART1, which is the console. Everything the kernel prints during boot, the login prompt, and every command in these pages arrive and leave through that one port.

This chapter covers the register layout and the clocking of the port, the two devicetree nodes that describe it, the probe path through `8250_dw` and the 8250 core, and what can be done with the port from BusyBox. The same driver would serve the other five ports once their nodes are enabled and their pins are routed.

| Item | Content |
| --- | --- |
| Driver | `drivers/tty/serial/8250/8250_dw.c`, `8250_core.c`, `8250_port.c`, `drivers/tty/serial/serial_core.c` |
| Compatible | `snps,dw-apb-uart` |
| Base | `0x02500000` + `0x400` × n, UART0 to UART5 |
| Register window | `0x400` bytes per port, `reg-shift = <2>`, `reg-io-width = <4>` |
| Interrupts | PLIC 2 (UART0) to PLIC 7 (UART5) |
| Clocks | `baudclk` and `apb_pclk`, both the `CLK_BUS_UARTn` gate on `apb-uart` |
| Reset | `RST_BUS_UARTn` |
| Kconfig | `CONFIG_SERIAL_8250`, `CONFIG_SERIAL_8250_DW`, `CONFIG_SERIAL_8250_CONSOLE` |
| Userspace | `/dev/ttyS1`, `/sys/class/tty/ttyS1`, `getty`, `stty`, `microcom` |

## How the hardware works

The DesignWare APB UART is a 16550A-compatible register file with a few extra registers. The SoC does not place the registers one byte apart: `reg-shift = <2>` and `reg-io-width = <4>` mean each register index is multiplied by four and accessed as a 32-bit word. `dw8250_serial_in32()` and `dw8250_serial_out32()` in `8250_dw.c` do exactly that, so the addresses below are the byte offsets a `devmem` read would use.

| Offset | Register | Purpose |
| --- | --- | --- |
| `0x00` | RBR / THR / DLL | Received byte, transmit byte, or low divisor byte when DLAB is set |
| `0x04` | IER / DLM | Interrupt enables, or the high divisor byte when DLAB is set |
| `0x08` | IIR / FCR | Interrupt identification (read) and FIFO control (write) |
| `0x0c` | LCR | Word length, stop bits, parity, DLAB |
| `0x10` | MCR | Modem control: DTR, RTS, loopback |
| `0x14` | LSR | Data ready, overrun, empty transmitter, error bits |
| `0x18` | MSR | Modem status: CTS, DSR, RI, DCD |
| `0x1c` | SCR | Scratch register |
| `0x7c` | DW USR | DesignWare status; bit 0 is busy |
| `0x300` | DW DLF | Fractional divisor, when the core implements it |
| `0x3d0` | DW CPR | Component parameter register: FIFO size, extra features |
| `0x3e0` | DW UCV | Component version, ASCII in three bytes |

The FIFO control register at `0x08` enables the FIFOs and selects the receiver trigger level; the interrupt identification register tells the handler why the interrupt fired. The FIFO depth is not fixed by the 16550 standard: at probe `dw8250_setup_port()` in `drivers/tty/serial/8250/8250_dwlib.c` reads CPR, and if the FIFO mode field is non-zero it takes the depth from `DW_UART_CPR_FIFO_SIZE()` and marks the port as a `PORT_16550A`. When CPR reads zero the driver falls back to a platform-supplied value, and when that is also zero the port keeps the generic 8250 defaults. The exact FIFO size of the F101 port has not been measured; the kernel prints the detected type at boot.

Baud rate generation is the standard 16× divider: the input clock is divided by 16 times the requested baud. The input is the `baudclk`, which in this SoC is the per-port gate on the `apb-uart` clock in the CCU (register `0x0528`), a divider plus a mux whose reset parent is `dcxo24M`. With the reset divider the port is fed 24 MHz, so 115200 baud asks for 24 MHz / (16 × 115200) = 13.02, and the integer divisor 13 gives 115384.6 baud, 0.16 % above nominal — well inside what a UART link tolerates. The DesignWare core can also add a fractional divisor in DLF. At probe `dw8250_setup_port()` writes all ones to DLF, reads it back and, if the register exists, switches to `dw8250_get_divisor()` / `dw8250_set_divisor()`, which split the remainder across the DLF field as well as DLL/DLM. Whether the F101 core has DLF is not recorded anywhere in the tree, so treat the fractional path as possible but unverified.

Because the register file is 32-bit wide, the F101 port is configured as `UPIO_MEM32` rather than the 8-bit `UPIO_MEM` default. `serial_port.c` maps `reg-io-width = <4>` to `UPIO_MEM32` and `reg-shift = <2>` to `port->regshift`, so the port's `serial_in`/`serial_out` become the 32-bit DesignWare accessors in `8250_dw.c`.

### Register bits worth knowing

Three registers carry almost all of the behaviour that matters when a port misbehaves.

| Register | Bits | Meaning |
| --- | --- | --- |
| LCR (`0x0c`) | `[1:0]` | Word length: 0 = 5 bits, 1 = 6, 2 = 7, 3 = 8 |
| | `[2]` | Stop bits: 0 = 1, 1 = 2 (1.5 with 5-bit words) |
| | `[3]` | Parity enable |
| | `[5:4]` | Parity select: 0 = odd, 1 = even, 2 = stick, 3 = none |
| | `[6]` | Break control |
| | `[7]` | DLAB: swaps RBR/THR with DLL and IER with DLM |
| LSR (`0x14`) | `[0]` | Data ready |
| | `[1]` | Overrun error |
| | `[2]` | Parity error |
| | `[3]` | Framing error |
| | `[4]` | Break interrupt |
| | `[5]` | Transmitter holding register empty |
| | `[6]` | Transmitter empty: holding and shift registers both empty |
| IIR (`0x08`) | `[0]` | 0 when an interrupt is pending |
| | `[3:1]` | Cause: 3 = line status, 2 = received data, 6 = timeout, 1 = transmitter empty |
| | `[7:6]` | FIFO state: 0 = no FIFO, 3 = FIFO enabled |

The 8250 core uses LSR bit 6, not bit 5, when it waits before writing the next console character: TX holding empty only means the byte has moved into the shift register, while TX empty means the line has actually gone idle. This is why a console write blocks for roughly one character time per byte at 115200 — about 87 µs.

The IIR on the DesignWare core can also report the vendor-specific "busy" code (7), which is not an error: it means a register write is still in progress. The handler reads USR and returns.

One more number is worth keeping in mind. At 115200 8N1 a character is 10 bit times, so 86.8 µs, and a FIFO of N bytes holds N × 86.8 µs of line time. The receive interrupt fires when the FIFO reaches the trigger level in FCR; the core starts from the 16550A default `UART_FCR_R_TRIG_10` (the second of four levels) and the DesignWare core scales that level to its own FIFO size. Neither the trigger level nor the FIFO size is configurable from the devicetree, so for low-latency protocols keep messages short and accept the batching.

### The six ports

| Label | Node | PLIC | Board |
| --- | --- | --- | --- |
| `uart0` | `serial@2500000` | 2 | Disabled; `PE0`/`PE1` group exists |
| `uart1` | `serial@2500400` | 3 | Enabled; console on `PB0`/`PB1` |
| `uart2` | `serial@2500800` | 4 | Disabled; no pin group |
| `uart3` | `serial@2500c00` | 5 | Disabled; no pin group |
| `uart4` | `serial@2501000` | 6 | Disabled; no pin group |
| `uart5` | `serial@2501400` | 7 | Disabled; no pin group |

## Devicetree

The SoC devicetree declares all six ports from one template. UART1 looks like this:

```text
uart1: serial@2500400 {
	compatible = "snps,dw-apb-uart";
	reg = <0x0 0x02500400 0x0 0x400>;
	interrupts-extended = <&plic 3 IRQ_TYPE_LEVEL_HIGH>;
	clocks = <&ccu SUN252I_F101_CLK_BUS_UART1>,
		 <&ccu SUN252I_F101_CLK_BUS_UART1>;
	clock-names = "baudclk", "apb_pclk";
	resets = <&ccu SUN252I_F101_RST_BUS_UART1>;
	reg-shift = <2>;
	reg-io-width = <4>;
	status = "disabled";
};
```

The other five differ only in the address, the PLIC number, the clock and reset IDs, and the label. The addresses run from `serial@2500000` to `serial@2501400`, and the PLIC numbers from 2 for UART0 to 7 for UART5. The aliases block fixes the Linux line numbers:

```text
aliases {
	serial0 = &uart0;
	serial1 = &uart1;
	serial2 = &uart2;
	serial3 = &uart3;
	serial4 = &uart4;
	serial5 = &uart5;
};
```

That alias is what makes the console `ttyS1` rather than whatever number the port happens to get: `__uart_read_properties()` in `drivers/tty/serial/serial_port.c` reads `of_alias_get_id(dev_of_node(dev), "serial")` into `port->line`.

The board file enables UART1 with its two pins and leaves the other ports disabled:

```text
&uart1 {
	pinctrl-names = "default";
	pinctrl-0 = <&uart1_pb_pins>;
	status = "okay";
};
```

The pin group is declared in the SoC file, next to the other groups:

```text
uart1_pb_pins: uart1-pb-pins {
	pins = "PB0", "PB1";
	function = "uart1";
};
```

Only TX and RX are routed; there is no RTS/CTS pair in the group, so hardware flow control has nothing to drive. UART0 has a group on `PE0`/`PE1` (`uart0_pe_pins`, function `uart0`), but no board node enables it. UART2 to UART5 have no pin groups at all, so enabling one of them means adding a group with the pin numbers of the package balls that carry it.

The binding is `Documentation/devicetree/bindings/serial/snps-dw-apb-uart.yaml`. It requires `compatible`, `reg`, `interrupts`, and at least the `apb_pclk` clock, and it documents `reg-shift`, `reg-io-width`, `fifo-size`, `snps,uart-16550-compatible`, and the `dcd-override`/`dsr-override`/`cts-override`/`ri-override` properties. The clock names `baudclk` and `apb_pclk` are the ones `8250_dw` looks up.

## Console and earlycon

The chosen node supplies both the kernel command line and the standard output path:

```text
bootargs = "console=tty0 console=ttyS1,115200n8 earlycon=uart8250,mmio32,0x02500400 loglevel=8 printk.time=1 root=/dev/mtdblock4 rootfstype=squashfs ro";
stdout-path = "serial1:115200n8";
```

Two consoles are named. `tty0` is the framebuffer console on the DSI panel, `ttyS1` is the serial port; both receive the kernel log and both show the getty prompt, and writing to `/dev/console` reaches both.

`earlycon=uart8250,mmio32,0x02500400` is deliberately spelt out rather than left to the devicetree. The early console is used before the 8250 driver has probed, and because the option carries no baud rate, `early_serial8250_setup()` in `drivers/tty/serial/8250/8250_early.c` does not program the divisor at all: it assumes the bootloader has already set the port up and only masks the UART interrupts. The kernel then prints a line confirming the mapping, of the form `uart8250 at MMIO32 0x02500400`, and the regular driver takes over later without changing the line settings.

`SERIAL_8250_CONSOLE` selects `SERIAL_EARLYCON`, so the early console code is present as soon as the console option is enabled. The `earlycon` word without arguments would also work here: the DW UART compatible string is registered with `OF_EARLYCON_DECLARE`, and `stdout-path` gives the port and the rate.

The other two words on the command line change what appears on the console rather than how it is driven. `loglevel=8` raises the console log level so that debug-level messages are printed too; the default is 7, which already includes everything up to `KERN_DEBUG`. `printk.time=1` prefixes each line with a monotonic timestamp in seconds, which is what makes "when did this happen during boot" answerable from a captured log.

Once user space starts, BusyBox `init` reads `/etc/inittab`, which contains one respawning getty:

```text
ttyS1::respawn:/sbin/getty -L  ttyS1 115200 vt100 # GENERIC_SERIAL
```

The root account has no password, so the prompt accepts `root` directly. Changing the console speed means changing three things together: the `console=` and `stdout-path` in the devicetree, and the getty line in `/etc/inittab`; changing only the kernel command line leaves getty opening the port at the old rate.

### From reset to the login prompt

The port changes hands several times before a shell appears:

1. The boot ROM and SyterKit leave the UART configured at whatever rate they used; the kernel does not reprogram it until it probes the port.
2. `earlycon=uart8250,...` maps the registers and installs a boot console. Because no baud rate was given, it only masks the UART interrupt and writes through the existing configuration.
3. `8250_dw` probes, enables the clocks, deasserts the reset and registers the port as `ttyS1`. Deasserting the reset clears the controller's line settings, and they are programmed again when the console is registered, from `console=ttyS1,115200n8` on the command line.
4. `SERIAL_8250_CONSOLE` installs the real console on `ttyS1`, the boot console is unregistered, and printk continues on the driver.
5. BusyBox `init` runs `getty` on `ttyS1` at 115200, which opens the port, applies the termios from `/etc/inittab`'s speed argument and prints the login prompt.

A reset in the middle of this sequence is why a port can print the early boot and then go silent, or the reverse.

## Kconfig

```text
CONFIG_SERIAL_8250=y
CONFIG_SERIAL_8250_CONSOLE=y
CONFIG_SERIAL_8250_DW=y
```

`CONFIG_SERIAL_8250` is the core, `SERIAL_8250_CONSOLE` adds the console (and selects `SERIAL_CORE_CONSOLE` and `SERIAL_EARLYCON`), and `SERIAL_8250_DW` selects `SERIAL_8250_DWLIB` and handles the DesignWare extras: the 32-bit accessors, the busy bit, the RX-timeout workaround, CPR parsing and DLF.

The board defconfig `arch/riscv/configs/sun252i_f101_yuzukineko_defconfig` sets exactly these three. It does not raise `CONFIG_SERIAL_8250_NR_UARTS`, whose default is 4. The core keeps at most `nr_uarts` port slots, and `serial8250_find_match_or_unused()` only honours a requested line number when `port->line < nr_uarts`; a port whose alias number is 4 or 5 falls back to the first free slot. The stock board is unaffected — only UART1 is enabled, and line 1 fits — but enabling UART4 and UART5 as well needs `CONFIG_SERIAL_8250_NR_UARTS=6` for them to appear as `ttyS4` and `ttyS5`.

## Driver internals

Although `8250_of.c` and `8250_dw.c` both live in the 8250 directory, only `8250_dw` matches this node: its match table contains `snps,dw-apb-uart`, while `8250_of` lists only the legacy `ns8250`/`ns16xxx` compatibles. There is no second driver racing for the device. The 8250 core (`8250_core.c`, `8250_port.c`) still owns the port structure, the tty and the console; `8250_dw` is the platform driver that creates the port and supplies the register accessors and the DesignWare-specific behaviour.

### Probe path

`dw8250_probe()` in `8250_dw.c`:

1. Gets the first memory resource, maps it, and fills in `p->mapbase`, `p->mapsize` and `p->membase`.
2. Calls `uart_read_port_properties()`, the permissive variant of the DT parser. It reads `reg-io-width`, `reg-shift`, `reg-offset`, an optional `fifo-size` and the `serialN` alias into `port->line`; a missing interrupt is allowed and leaves the port without one.
3. Because `reg-io-width = <4>` the iotype is `UPIO_MEM32`, so the driver installs `dw8250_serial_in32()` and `dw8250_serial_out32()`, which multiply every register index by `reg-shift`.
4. Gets the baud clock with `devm_clk_get_optional_enabled(dev, "baudclk")`, falling back to the first clock, and copies `clk_get_rate()` into `p->uartclk`. Gets `apb_pclk` the same way and keeps it for the runtime-PM callbacks. Both entries in the DT are the same `CLK_BUS_UART1` gate, so the two lookups resolve to one clock.
5. Gets the reset array with `reset_control_array_get_optional_exclusive()` and deasserts it.
6. Enables runtime PM, calls `dw8250_setup_port()` to probe DLF and CPR, and finally `serial8250_register_8250_port()`.

The port is marked `UPF_FIXED_PORT`, so the 8250 core does not try to autoconfigure the type by probing scratch registers. Two details are worth remembering when the console misbehaves. First, `data->clk` is looked up as `"baudclk"` and, if absent, as the first unnamed clock; if neither exists `dw8250_probe()` fails with "clock rate not defined". Second, the reset lookup is optional, so a DT without a `resets` property still probes, and a DT with several entries is handled without a driver change.

### Interrupts

The port uses one level-high interrupt from the PLIC. The DT parser sets `UPF_SHARE_IRQ`, and the line is requested by the 8250 core when the port is opened. `dw8250_handle_irq()` adds two things to `serial8250_handle_irq()`:

- The DesignWare IIR reports "busy" (`UART_IIR_BUSY`) while a write to LCR or another register is still in flight; the handler reads USR to let it complete and reports the interrupt as handled.
- A receive-timeout interrupt can be raised with no data behind it. The handler reads LSR and, when neither data-ready nor break is set, performs a dummy read of RBR so the interrupt does not fire forever. The workaround is limited to non-DMA mode.

The port is not in DMA mode: the DT has no `dmas` property and the defconfig does not enable `CONFIG_SERIAL_8250_DMA`. All movement goes through the FIFO and the 64-byte-ish interrupt thresholds.

### Runtime power management

`8250_dw` implements runtime PM; `dw8250_do_pm()` takes a runtime-PM reference when the port is opened and releases it on close, and the driver's suspend/resume callbacks disable and re-enable `apb_pclk`. There is no separate register save/restore in the driver, so the 8250 core's port state is what comes back.

`dw8250_do_pm()` is the port's `pm` callback: opening the port takes a runtime-PM reference and closing it releases the reference. The driver's runtime suspend callback disables both clocks and the resume callback re-enables them, so a closed port is fully unclocked. The 8250 core programs the line again on every open, so the divisor is not lost with the clocks.

### Error paths

A missing `reg` property is rejected before any mapping ("no registers defined"). A missing clock fails probe with "clock rate not defined" and leaves no `/dev/ttyS1`. A missing reset is not fatal because the reset lookup is optional. An invalid `reg-io-width` is rejected by `uart_read_and_validate_port_properties()` with "Unsupported reg-io-width"; only 1, 2 and 4 are accepted. If the interrupt is missing, `dw8250_probe()` treats `-ENXIO` as "poll instead" and the port still registers; a polled console is slow but functional.

### Serial core behaviour

Above the two drivers sits `serial_core.c`, and most of what a user notices comes from there rather than from `8250_dw`:

- **Open and close.** The first open calls `uart_startup()`, which runs `serial8250_do_startup()`: the FIFO is enabled, the line is programmed from the current termios, and the interrupt is requested. The last close calls `uart_shutdown()`, which disables the interrupt and, unless the port is the console, powers it down.
- **Termios.** `serial8250_do_set_termios()` computes the divisor from `port->uartclk`, writes DLL/DLM (and DLF through `dw8250_set_divisor()` when the core has it), and updates LCR. Changing the baud rate does not touch the FIFO contents.
- **Break and modem control.** `TCSBRK` and `TIOCSBRK` toggle LCR bit 6; `TIOCMGET`/`TIOCMSET` read and write MCR and MSR. With only TX and RX routed, the modem bits are software state and loopback testing is the only way to move them.
- **Console writes.** The console path does not use interrupts. `serial8250_console_write()` takes the port lock, writes bytes while polling LSR, and waits for TX empty at the end, so a long printk can hold the port for milliseconds.
- **Polling.** When the DT port has no interrupt, `uart_read_port_properties()` leaves `port->irq` at 0, `UPF_SHARE_IRQ` is still set, and the core falls back to a timer-driven poll.

## Userspace interface

| Path | Meaning |
| --- | --- |
| `/dev/ttyS1` | The console port; created by devtmpfs when the port registers |
| `/sys/class/tty/ttyS1` | The tty device; `uartclk`, `type`, `line`, `irq` and `xmit_fifo_size` are attributes of it, not of `device/` |
| `/dev/console` | The system console; with both `console=` words it fans out to `tty0` and `ttyS1` |
| `/proc/cmdline` | The command line actually used, including both console words |

Only ports that register get device nodes. On the stock devicetree that is `ttyS1` alone; `/dev/ttyS0` does not exist until `uart0` is enabled and its pins are configured.

The port is an ordinary tty, so the shell tools that work on any tty work here. `stty` reads and changes termios, `microcom` is a small terminal, `getty` is already running on the console, and `setserial` is present in the BusyBox build although the driver does not use its configuration interface. There is no `setserial`-visible `uart` port type detail beyond what sysfs reports.

At the ioctl level the port answers the standard tty requests:

| Request | Effect |
| --- | --- |
| `TCGETS` / `TCSETS` | Read or write termios; `TCSETSW` waits for the change to drain first |
| `TCFLSH` | Flush the input, output or both queues |
| `TCSBRK` / `TIOCSBRK` / `TIOCCBRK` | Send a break of the given duration, or start and stop one |
| `TIOCMGET` / `TIOCMSET` | Read or change DTR, RTS and the other modem lines |
| `TIOCGWINSZ` | Window size; unchanged from what the terminal sets |
| `TIOCSTI` | Push a character back into the input queue (usually disabled by the kernel's `dev.tty.legacy_tiocsti`) |

There is no raw divisor access. `TIOCGSERIAL` reports the port in a `struct serial_struct`, and `TIOCSSERIAL` is accepted, but for a `UPF_FIXED_PORT` port it only applies the closing delays, the custom divisor, the `UPF_USR_MASK` flags and the FIFO size; the IRQ, the mapped address and the input clock cannot be changed from user space.

## Worked examples

### Example 1: what the console is set to

```sh
cat /proc/cmdline
stty -F /dev/ttyS1
ls /dev/ttyS*
```

Representative output:

```text
console=tty0 console=ttyS1,115200n8 earlycon=uart8250,mmio32,0x02500400 loglevel=8 printk.time=1 root=/dev/mtdblock4 rootfstype=squashfs ro
speed 115200 baud; line = 0;
/dev/ttyS1
```

`/proc/cmdline` shows the devicetree `bootargs` verbatim, including the two console words and the early console. `stty` with no flags prints only the speed and the line discipline; `line = 0` is `N_TTY`. The `ls` output confirms that only UART1 is registered.

### Example 2: use an unused port

UART0's node and pin group already exist in the SoC devicetree, so bringing it up is a board-file change and a rebuild:

```text
&uart0 {
	pinctrl-names = "default";
	pinctrl-0 = <&uart0_pe_pins>;
	status = "okay";
};
```

After rebuilding the devicetree and rebooting, the port appears as `ttyS0`, and a terminal can be attached to it:

```sh
stty -F /dev/ttyS0 115200 cs8 -cstopb -parenb raw
microcom -s 115200 /dev/ttyS0
```

`stty` sets 115200 8N1 with no flow control and raw input; `microcom` then copies bytes between the shell's stdin/stdout and the port. `Ctrl-X` leaves `microcom` unless `-X` was given. UART2 to UART5 need a new pin group first; the SoC devicetree does not declare one, and the package balls that carry those ports are not documented in the tree.

### Example 3: read the port parameters from sysfs

```sh
cat /sys/class/tty/ttyS1/uartclk
cat /sys/class/tty/ttyS1/line
cat /sys/class/tty/ttyS1/irq
```

Representative output:

```text
24000000
1
3
```

The three files are attributes of the tty device itself, created by `serial_core.c` from `tty_dev_attrs`. `uartclk` is the 24 MHz `apb-uart` rate the driver uses for the divisor, `line` is the alias number, and `irq` is the PLIC source from the devicetree. If `uartclk` reads 0 the clock lookup failed; the port would not have registered in that case, so a nonzero value is also a quick check that the clock is where the devicetree says it is.

## Limitations

| Limitation | Detail |
| --- | --- |
| Only UART1 is wired | The other five nodes are `disabled`; UART0 has a pin group, UART2-5 do not |
| No flow control pins | The UART1 group has only `PB0`/`PB1`; RTS/CTS are not routed |
| No DMA | No `dmas` in the node and `CONFIG_SERIAL_8250_DMA` is off; transfers are FIFO and interrupt driven |
| Four port slots | `CONFIG_SERIAL_8250_NR_UARTS` stays at its default of 4; enabling UART4/UART5 needs a larger value to keep their alias numbers |
| Fixed 115200 console | Kernel, bootloader, getty and the host terminal must agree; only the kernel side is described by the devicetree |
| No modem signals | DCD/DSR/RI are not connected; the `*-override` properties are the way to fake them if a program waits for carrier |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Nothing at all on the serial port, panel works | Wrong port, wrong pins, or the console word points at a disabled port | Check `console=ttyS1` and that `&uart1` is `okay` with `uart1_pb_pins` |
| Boot log appears, then stops before the login prompt | `getty` not running or on another tty | Check the `ttyS1` line in `/etc/inittab` and that `/dev/ttyS1` exists |
| Garbage characters | Baud mismatch, or the host terminal is not 8N1 | Set the host to 115200 8N1; check `stty -F /dev/ttyS1` |
| Garbage only after changing the console speed | Kernel, getty and host disagree | Change `console=`, `stdout-path` and `/etc/inittab` together |
| `/dev/ttyS0` missing | `uart0` is disabled | Enable the node and add the pin group, then rebuild the devicetree |
| Enabling UART4/UART5 gives `ttyS2` instead of `ttyS4` | Line number 4 does not fit in `nr_uarts` | Set `CONFIG_SERIAL_8250_NR_UARTS=6` |
| Console works but a program sees no CTS | CTS is not routed | Use `cts-override` in the node, or do not enable hardware flow control |

## Related pages

- [Linux development](../index.md) for the boot chain and the kernel configuration.
- [Pin multiplexing and GPIO](pinctrl-gpio.md) for how the `PB0`/`PB1` group is applied.
- [Flash layout](../../../boot/flash-layout.md) for the root filesystem the console boots into.
- [Common commands](../apps/linux-commands.md): the shell commands that work on the board, including the tools used here.
