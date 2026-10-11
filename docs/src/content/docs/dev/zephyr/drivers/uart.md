---
title: "UART"
---

The F101 has 6 UARTs (`uart0`…`uart5`). Zephyr uses the upstream NS16550 driver (`drivers/serial/uart_ns16550.c`), because the UART of the F101 is a Synopsys DesignWare APB UART (16550-compatible). The F101 port does only three things: the devicetree nodes, the clock/reset, and having the SoC select `UART_NS16550_DW8250_DW_APB` by default. The interface is the standard `<zephyr/drivers/uart.h>`.

| Item | Content |
| --- | --- |
| Devices | `uart0`…`uart5` |
| Data bits | 5, 6, 7, 8 |
| Stop bits | 1, 2 (1.5 bits returns `-ENOTSUP`) |
| Parity | None, even (odd returns `-ENOTSUP`) |
| Flow control | `uart_configure` accepts none, RTS/CTS and DTR/DSR and records them; for hardware automatic flow control see the note below |
| Interface | Polling (`uart_poll_in`/`uart_poll_out`), interrupts (`uart_irq_*`, `uart_fifo_*`) |

## Devicetree

| File | Purpose |
| --- | --- |
| `dts/bindings/serial/ns16550.yaml` | Binding (upstream), `uart-controller.yaml` provides common properties such as `current-speed` |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree: `uart0`…`uart5`, `disabled` by default |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | Board devicetree: the pin groups, enables `uart1`, `uart2` and `uart4`, chooses the console |

### SoC devicetree: sun252i_f101.dtsi

The six nodes differ in their register address, interrupt number, clock and reset bit. `uart1` is below:

```c
uart1: serial@2500400 {
	/* Two compatibles: the ns16550 driver matches first, snps,dw-apb-uart tells it this is the DW APB variant */
	compatible = "ns16550", "snps,dw-apb-uart";

	/* Register window: base address 0x02500400, length 0x400 */
	reg = <0x02500400 0x400>;

	/* Registers are laid out in 4-byte units, so offsets are shifted left by 2 */
	reg-shift = <2>;

	/* Interrupt: PLIC number 3, priority 1 */
	interrupts = <3 1>;
	interrupt-parent = <&plic>;

	/* The bus clock gate and the bus reset. The reference clock for the baud rate comes from the CCU driver */
	clocks = <&cctl CLK_BUS_UART1>;
	resets = <&rctl RST_BUS_UART1>;

	status = "disabled";
};
```

| Node | Label | Register | PLIC interrupt number | Clock macro |
| --- | --- | --- | --- | --- |
| `serial@2500000` | `uart0` | `0x02500000` | 2 | `CLK_BUS_UART0` |
| `serial@2500400` | `uart1` | `0x02500400` | 3 | `CLK_BUS_UART1` |
| `serial@2500800` | `uart2` | `0x02500800` | 4 | `CLK_BUS_UART2` |
| `serial@2500c00` | `uart3` | `0x02500c00` | 5 | `CLK_BUS_UART3` |
| `serial@2501000` | `uart4` | `0x02501000` | 6 | `CLK_BUS_UART4` |
| `serial@2501400` | `uart5` | `0x02501400` | 7 | `CLK_BUS_UART5` |

### Board devicetree: yuzukineko.dts

```c
/ {
	chosen {
		/* Console and shell use UART1 */
		zephyr,console = &uart1;
		zephyr,shell-uart = &uart1;
	};
};

&pio {
	/* UART1 console: PB00 is TX, PB01 is RX, multiplexing function 4 */
	uart1_pins: uart1_pins {
		uart1_tx_rx {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 0, 4)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 1, 4)>;
		};
	};

	/* UART2 Bluetooth HCI: TX PE6, RX PE7, RTS PE8, CTS PE9, multiplexing function 3, with pull-up */
	uart2_pins: uart2_pins {
		uart2_group {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PE, 6, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PE, 7, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PE, 8, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PE, 9, 3)>;
			bias-pull-up;
		};
	};

	/* UART4 general-purpose serial: PD6 is TX, PD7 is RX, multiplexing function 5, with pull-up */
	uart4_pins: uart4_pins {
		uart4_group {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 6, 5)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 7, 5)>;
			bias-pull-up;
		};
	};
};

&uart1 {
	status = "okay";
	/* Baud rate */
	current-speed = <115200>;
	pinctrl-0 = <&uart1_pins>;
	pinctrl-names = "default";
};

/* AIC8800D40 Bluetooth HCI: with hardware flow control */
&uart2 {
	status = "okay";
	current-speed = <115200>;
	hw-flow-control;
	pinctrl-0 = <&uart2_pins>;
	pinctrl-names = "default";

	bt_hci: bt-hci {
		compatible = "zephyr,bt-hci-uart";
		status = "okay";
	};
};

&uart4 {
	status = "okay";
	current-speed = <115200>;
	pinctrl-0 = <&uart4_pins>;
	pinctrl-names = "default";
};
```

The detailed multiplexing of the pins is in the [pin multiplexing table](../../../hardware/mux.md), and the pin groups available to each UART are in [Peripheral pin groups](../../../hardware/groups.md).

### Binding properties

| Property | Required | Meaning |
| --- | --- | --- |
| `reg` | Yes | Register window |
| `reg-shift` | Yes | Number of bits the register offset is shifted left by, 2 on the F101 |
| `interrupts` | Yes | Interrupt |
| `clocks`, `resets` | Yes | Bus clock and reset |
| `current-speed` | Yes | Baud rate |
| `hw-flow-control` | No | Records the initial flow control as RTS/CTS; whether hardware automatic flow control is really turned on is below |
| `parity` | No | 0 none, 1 odd, 2 even; odd parity does not work in this port |
| `stop-bits`, `data-bits` | No | Stop bits, data bits |
| `pinctrl-0`, `pinctrl-names` | No | Pins, see [the pinctrl section of the GPIO page](gpio.md#pin-multiplexing-pinctrl) |

## Kconfig

| Option | Default | Meaning |
| --- | --- | --- |
| `CONFIG_SERIAL` | `y` in the board defconfig | Enables the serial subsystem |
| `CONFIG_UART_NS16550` | `y` by SoC default | The NS16550 driver |
| `CONFIG_UART_NS16550_DW8250_DW_APB` | `y` by SoC default | Support for the Synopsys DesignWare 8250 UART controller |
| `CONFIG_UART_INTERRUPT_DRIVEN` | `y` in the board defconfig | The interrupt interface `uart_irq_*`, `uart_fifo_*` |
| `CONFIG_UART_CONSOLE` | `y` in the board defconfig | `printk` output through `zephyr,console` |

## API reference

Each interface below has a subheading of its own: the prototype, what the driver does, the example function and its output on the board. The examples come from the [complete demo program](#complete-demo-program) at the end, whose `err()` turns the return value into a name. The demos use two serial ports:

| Serial port | Position | Purpose |
| --- | --- | --- |
| UART1 | PB00/PB01, the console of the board | The host is at the other end and can really send characters in |
| UART4 | PD6/PD7 | Nothing is connected to it on the board, so only transmit is demonstrated |

UART1 is also the output port of `printk`, so changing the baud rate in the demos needs care: nothing is printed while a different setting is active, so let the transmitter finish sending what is still in it first and print again after the original setting is restored, otherwise the last few characters go out at the wrong baud rate.

### uart_config_get

```c
int uart_config_get(const struct device *dev, struct uart_config *cfg);
```

Reads the current baud rate, parity, stop bits, data bits and flow control. Enum values: parity 0 none, 1 odd, 2 even; stop bits 0 half, 1 one, 2 one and a half, 3 two; data bits 0…3 are 5…8; flow control 0 none, 1 RTS/CTS, 2 DTR/DSR.

```c
/* uart_config_get: the current baud rate, parity, stop bits, data bits and flow control.
 * The enum values: parity 0 none, 1 odd, 2 even; stop bits 0 half, 1 one, 2 one and a half, 3 two;
 * data bits 0..3 are 5..8; flow control 0 none, 1 RTS/CTS, 2 DTR/DSR.
 */
static void demo_config_get(void)
{
	struct uart_config now;
	int ret = uart_config_get(uart, &now);

	printk("[config] uart_config_get = %s: %u baud, parity %d, stop bits %d, data bits %d, flow control %d\n",
	       err(ret), now.baudrate, now.parity, now.stop_bits, now.data_bits, now.flow_ctrl);
}
```

```text
[config] uart_config_get = 0: 115200 baud, parity 0, stop bits 1, data bits 3, flow control 0
```

### uart_configure

```c
int uart_configure(const struct device *dev, const struct uart_config *cfg);
```

Applies a new setting. On success `uart_config_get` reads the new configuration back; on failure the configuration is left unchanged.

```c
/* uart_configure: apply a new setting, and read it back with uart_config_get */
static void demo_configure(void)
{
	static const struct uart_config table[] = {
		{ .baudrate = 9600, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 921600, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_EVEN, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_ODD, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_2,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1_5,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_7, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_RTS_CTS },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_DTR_DSR },
	};
	struct uart_config now, back[ARRAY_SIZE(table)];
	int ret[ARRAY_SIZE(table)];

	uart_config_get(uart, &now);

	/* The console is this very UART, so nothing is printed while a different setting is active,
	 * and the transmitter is given time to send what is still in it before the first change.
	 * Each setting is applied and read back, then the original is restored and the results printed.
	 */
	k_msleep(50);
	for (int i = 0; i < ARRAY_SIZE(table); i++) {
		ret[i] = uart_configure(uart, &table[i]);
		uart_config_get(uart, &back[i]);
	}
	uart_configure(uart, &now);

	for (int i = 0; i < ARRAY_SIZE(table); i++) {
		printk("[config] %6u baud, parity %d, stop bits %d, data bits %d, flow %d = %s; read back %u, %d, %d, %d, %d\n",
		       table[i].baudrate, table[i].parity, table[i].stop_bits, table[i].data_bits,
		       table[i].flow_ctrl, err(ret[i]), back[i].baudrate, back[i].parity,
		       back[i].stop_bits, back[i].data_bits, back[i].flow_ctrl);
	}
}
```

```text
[config]   9600 baud, parity 0, stop bits 1, data bits 3, flow 0 = 0; read back 9600, 0, 1, 3, 0
[config] 921600 baud, parity 0, stop bits 1, data bits 3, flow 0 = 0; read back 921600, 0, 1, 3, 0
[config] 115200 baud, parity 2, stop bits 1, data bits 3, flow 0 = 0; read back 115200, 2, 1, 3, 0
[config] 115200 baud, parity 1, stop bits 1, data bits 3, flow 0 = -ENOTSUP; read back 115200, 2, 1, 3, 0
[config] 115200 baud, parity 0, stop bits 3, data bits 3, flow 0 = 0; read back 115200, 0, 3, 3, 0
[config] 115200 baud, parity 0, stop bits 1, data bits 2, flow 0 = 0; read back 115200, 0, 1, 2, 0
[config] 115200 baud, parity 0, stop bits 1, data bits 3, flow 1 = 0; read back 115200, 0, 1, 3, 1
[config] 115200 baud, parity 0, stop bits 1, data bits 3, flow 2 = 0; read back 115200, 0, 1, 3, 2
```

Line 4 is odd parity, which returns `-ENOTSUP` and reads back the even parity of the previous success. Line 6 is 1.5 stop bits, and the driver accepts only 1 and 2 stop bits, so it too returns `-ENOTSUP` and the configuration is left unchanged. The last two lines read flow control back as 1 and 2, which only shows that the settings were recorded: `uart_ns16550.c` sets the automatic flow control bit (AFCE) of the MCR only when `UART_NS16550_VARIANT_NS16750` or `UART_NS16550_VARIANT_NS16950` is selected, and the F101 uses the default NS16550 variant, so `hw-flow-control` and `UART_CFG_FLOW_CTRL_RTS_CTS` do not turn hardware flow control on today. This comes from the driver source and was not verified on the board with an oscilloscope or a peer device.

### uart_poll_out

```c
void uart_poll_out(const struct device *dev, unsigned char out_char);
```

Sends one character and waits while the transmitter has no room.

```c
/* uart_poll_out: one character, waits until the transmitter has room */
static void demo_poll_out(void)
{
	static const char text[] = "[poll_out] Hello from uart_poll_out\r\n";

	for (int i = 0; text[i] != '\0'; i++) {
		uart_poll_out(uart, text[i]);
	}
}
```

```text
[poll_out] Hello from uart_poll_out
```

### uart_poll_in

```c
int uart_poll_in(const struct device *dev, unsigned char *p_char);
```

Returns 0 with the character placed in `p_char` when one has arrived, and -1 when there is nothing, without waiting. The demo calls it once first (nobody has sent yet, so it returns -1) and then waits up to 20 seconds for the host to send 5 characters.

```c
/* uart_poll_in: returns 0 with the character, or -1 when nothing has arrived */
static void demo_poll_in(void)
{
	unsigned char c = 0;
	char got[16] = { 0 };
	int n = 0;
	int ret = uart_poll_in(uart, &c);

	printk("[poll_in] nothing sent yet: uart_poll_in = %s\n", err(ret));
	printk("[poll_in] waiting up to 20 s for 5 characters on the console\n");

	for (int64_t end = k_uptime_get() + 20000; n < 5 && k_uptime_get() < end;) {
		if (uart_poll_in(uart, &c) == 0) {
			got[n++] = c;
		} else {
			k_msleep(1);
		}
	}
	printk("[poll_in] got %d characters: \"%s\"\n", n, got);
}
```

The host sends `hello` with `write_serial`:

```text
[poll_in] nothing sent yet: uart_poll_in = -1
[poll_in] waiting up to 20 s for 5 characters on the console
hello[poll_in] got 5 characters: "hello"
```

`hello` is the 5 characters sent by the host; they also appear in the serial capture, but the board did not print them.

### Variables used by the interrupt-driven examples

The interrupt-driven examples share the variables below: received data goes into a ring buffer, data to be sent is held in a global variable.

```c
RING_BUF_DECLARE(rx_ring, 64);

static const char *tx_text;

static int tx_left;

static volatile int rx_irqs, tx_irqs;
```

### uart_irq_callback_user_data_set

```c
int uart_irq_callback_user_data_set(const struct device *dev, uart_irq_callback_user_data_t cb, void *user_data);
```

Sets the handler that the UART interrupt calls. The handler is always written the same way: `uart_irq_update()` and then a loop on `uart_irq_is_pending()`: receive when `uart_irq_rx_ready()` is true, transmit when `uart_irq_tx_ready()` is true.

```c
/* the interrupt handler: uart_irq_update latches the interrupt state, uart_irq_is_pending says
 * whether there is anything to do, uart_irq_rx_ready and uart_irq_tx_ready say what
 */
static void uart_isr(const struct device *dev, void *user_data)
{
	ARG_UNUSED(user_data);

	while (uart_irq_update(dev) && uart_irq_is_pending(dev)) {
		if (uart_irq_rx_ready(dev)) {
			rx_ready(dev);
		}
		if (uart_irq_tx_ready(dev)) {
			tx_ready(dev);
		}
	}
}

/* uart_irq_callback_user_data_set: the handler that the UART interrupt calls */
static void demo_irq_callback_set(void)
{
	int ret = uart_irq_callback_user_data_set(uart, uart_isr, NULL);

	printk("[irq] uart_irq_callback_user_data_set = %s\n", err(ret));
}
```

```text
[irq] uart_irq_callback_user_data_set = 0
```

### uart_fifo_read

```c
int uart_fifo_read(const struct device *dev, uint8_t *rx_data, const int size);
```

Takes at most `size` bytes out of the receive FIFO and returns how many were actually taken. Called when the receiver is ready; the demo puts the data into the ring buffer.

```c
/* uart_fifo_read: take what the receiver has out of its FIFO */
static void rx_ready(const struct device *dev)
{
	uint8_t buf[16];
	int n = uart_fifo_read(dev, buf, sizeof(buf));

	ring_buf_put(&rx_ring, buf, n);
	rx_irqs++;
}
```

### uart_fifo_fill

```c
int uart_fifo_fill(const struct device *dev, const uint8_t *tx_data, int size);
```

Fills at most `size` bytes into the transmit FIFO and returns how many were actually put in; what does not fit waits for the next transmit interrupt. Call `uart_irq_tx_disable()` once it is all sent, otherwise the transmit interrupt keeps coming.

```c
/* uart_fifo_fill: put as much as fits into the transmit FIFO; the rest waits for the next interrupt */
static void tx_ready(const struct device *dev)
{
	tx_irqs++;
	if (tx_left > 0) {
		int n = uart_fifo_fill(dev, (const uint8_t *)tx_text, tx_left);

		tx_text += n;
		tx_left -= n;
	}
	if (tx_left == 0) {
		uart_irq_tx_disable(dev);
	}
}
```

### uart_irq_tx_enable

```c
void uart_irq_tx_enable(const struct device *dev);
```

Enables the transmit interrupt, and `uart_fifo_fill` in the handler starts working.

```c
/* uart_irq_tx_enable: the handler fills the FIFO whenever it has room */
static void demo_irq_tx_enable(void)
{
	static const char msg[] = "[irq] sent by the interrupt handler, 64 bytes at the most per fill ........\r\n";

	tx_text = msg;
	tx_left = strlen(msg);
	uart_irq_tx_enable(uart);
	k_msleep(100);
	printk("[irq] transmit: %d interrupt(s), %d byte(s) left\n", tx_irqs, tx_left);
}
```

```text
[irq] sent by the interrupt handler, 64 bytes at the most per fill ........
[irq] transmit: 5 interrupt(s), 0 byte(s) left
```

This 77-byte string took 5 transmit interrupts to send.

### uart_irq_rx_enable

```c
void uart_irq_rx_enable(const struct device *dev);
```

Enables the receive interrupt (`uart_irq_rx_disable()` turns it off). The demo enables it and then waits for the host to send 4 characters, which are taken together in 1 receive interrupt.

```c
/* uart_irq_rx_enable: the host sends 4 characters; the handler puts them in a ring buffer.
 * uart_irq_rx_disable stops the receive interrupt again.
 */
static void demo_irq_rx_enable(void)
{
	uint8_t buf[32];

	uart_irq_rx_enable(uart);
	printk("[irq] waiting up to 20 s for 4 characters on the console\n");
	for (int64_t end = k_uptime_get() + 20000; ring_buf_size_get(&rx_ring) < 4 && k_uptime_get() < end;) {
		k_msleep(10);
	}
	k_msleep(20);
	int n = ring_buf_get(&rx_ring, buf, sizeof(buf) - 1);

	buf[n] = '\0';
	uart_irq_rx_disable(uart);
	printk("[irq] receive: %d interrupt(s), got %d characters: \"%s\"\n", rx_irqs, n, buf);
}
```

```text
[irq] waiting up to 20 s for 4 characters on the console
ping[irq] receive: 1 interrupt(s), got 4 characters: "ping"
```

### uart_err_check

```c
int uart_err_check(const struct device *dev);
```

Returns the error bits seen since the last call (overrun, parity, framing, break); no error is 0.

```c
/* uart_err_check: a bit mask of the errors seen since the last call */
static void demo_errors(void)
{
	int ret = uart_err_check(uart);

	printk("[error] uart_err_check = 0x%x (0 = no overrun, parity, framing or break error)\n", ret);
}
```

```text
[error] uart_err_check = 0x0 (0 = no overrun, parity, framing or break error)
```

### The other serial port: UART4

UART4 is enabled in the board file, but nothing is connected to PD6/PD7. The demo sends 7 bytes and then reads the receiver:

```c
/* UART4 on PD6 (TX) and PD7 (RX): nothing is connected there on the board */
static void demo_uart4(void)
{
	static const char text[] = "uart4\r\n";
	unsigned char c;
	struct uart_config cfg;
	int ret;

	printk("[uart4] device_is_ready = %d\n", device_is_ready(uart4));
	ret = uart_config_get(uart4, &cfg);
	printk("[uart4] uart_config_get = %s: %u baud\n", err(ret), cfg.baudrate);

	for (int i = 0; text[i] != '\0'; i++) {
		uart_poll_out(uart4, text[i]);
	}
	printk("[uart4] sent %d bytes on PD6\n", (int)strlen(text));

	/* PD7 is not connected: take whatever is in the receiver and ask for the line errors */
	int n = 0;

	c = 0;
	while (n < 64 && uart_poll_in(uart4, &c) == 0) {
		n++;
	}
	ret = uart_poll_in(uart4, &c);
	printk("[uart4] %d byte(s) were waiting in the receiver, then uart_poll_in = %s\n", n, err(ret));
	printk("[uart4] uart_err_check = 0x%x\n", uart_err_check(uart4));
}
```

```text
[uart4] device_is_ready = 1
[uart4] uart_config_get = 0: 115200 baud
[uart4] sent 7 bytes on PD6
[uart4] 1 byte(s) were waiting in the receiver, then uart_poll_in = -1
[uart4] uart_err_check = 0x0
```

## Complete demo program

All the examples and logs above come from this one program. Create a directory, put the files below into it, and it builds like any other Zephyr application.

```text
uart_api/
├── CMakeLists.txt
├── prj.conf
└── src/
    └── main.c
```

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(uart_api)

target_sources(app PRIVATE src/main.c)
```

### prj.conf

```ini
CONFIG_SERIAL=y
CONFIG_UART_INTERRUPT_DRIVEN=y
CONFIG_PRINTK=y
CONFIG_MAIN_STACK_SIZE=4096
CONFIG_SHELL=n
CONFIG_DEVMEM_SHELL=n
CONFIG_LOG_PRINTK=n
```

### src/main.c

```c
/*
 * Calls the functions of <zephyr/drivers/uart.h> on UART1, the console of the YuzukiNeko (PB00/PB01), so
 * that the other end of the cable, the host, can answer, and on UART4 (PD6/PD7).
 */
#include <errno.h>
#include <string.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/ring_buffer.h>

static const struct device *const uart = DEVICE_DT_GET(DT_CHOSEN(zephyr_console));
static const struct device *const uart4 = DEVICE_DT_GET(DT_NODELABEL(uart4));

static const char *err(int ret)
{
	switch (ret) {
	case 0:		return "0";
	case -1:	return "-1";
	case -EINVAL:	return "-EINVAL";
	case -ENOTSUP:	return "-ENOTSUP";
	case -ENOSYS:	return "-ENOSYS";
	default:	return "?";
	}
}

/* uart_config_get: the current baud rate, parity, stop bits, data bits and flow control.
 * The enum values: parity 0 none, 1 odd, 2 even; stop bits 0 half, 1 one, 2 one and a half, 3 two;
 * data bits 0..3 are 5..8; flow control 0 none, 1 RTS/CTS, 2 DTR/DSR.
 */
static void demo_config_get(void)
{
	struct uart_config now;
	int ret = uart_config_get(uart, &now);

	printk("[config] uart_config_get = %s: %u baud, parity %d, stop bits %d, data bits %d, flow control %d\n",
	       err(ret), now.baudrate, now.parity, now.stop_bits, now.data_bits, now.flow_ctrl);
}

/* uart_configure: apply a new setting, and read it back with uart_config_get */
static void demo_configure(void)
{
	static const struct uart_config table[] = {
		{ .baudrate = 9600, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 921600, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_EVEN, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_ODD, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_2,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1_5,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_7, .flow_ctrl = UART_CFG_FLOW_CTRL_NONE },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_RTS_CTS },
		{ .baudrate = 115200, .parity = UART_CFG_PARITY_NONE, .stop_bits = UART_CFG_STOP_BITS_1,
		  .data_bits = UART_CFG_DATA_BITS_8, .flow_ctrl = UART_CFG_FLOW_CTRL_DTR_DSR },
	};
	struct uart_config now, back[ARRAY_SIZE(table)];
	int ret[ARRAY_SIZE(table)];

	uart_config_get(uart, &now);

	/* The console is this very UART, so nothing is printed while a different setting is active,
	 * and the transmitter is given time to send what is still in it before the first change.
	 * Each setting is applied and read back, then the original is restored and the results printed.
	 */
	k_msleep(50);
	for (int i = 0; i < ARRAY_SIZE(table); i++) {
		ret[i] = uart_configure(uart, &table[i]);
		uart_config_get(uart, &back[i]);
	}
	uart_configure(uart, &now);

	for (int i = 0; i < ARRAY_SIZE(table); i++) {
		printk("[config] %6u baud, parity %d, stop bits %d, data bits %d, flow %d = %s; read back %u, %d, %d, %d, %d\n",
		       table[i].baudrate, table[i].parity, table[i].stop_bits, table[i].data_bits,
		       table[i].flow_ctrl, err(ret[i]), back[i].baudrate, back[i].parity,
		       back[i].stop_bits, back[i].data_bits, back[i].flow_ctrl);
	}
}

/* uart_poll_out: one character, waits until the transmitter has room */
static void demo_poll_out(void)
{
	static const char text[] = "[poll_out] Hello from uart_poll_out\r\n";

	for (int i = 0; text[i] != '\0'; i++) {
		uart_poll_out(uart, text[i]);
	}
}

/* uart_poll_in: returns 0 with the character, or -1 when nothing has arrived */
static void demo_poll_in(void)
{
	unsigned char c = 0;
	char got[16] = { 0 };
	int n = 0;
	int ret = uart_poll_in(uart, &c);

	printk("[poll_in] nothing sent yet: uart_poll_in = %s\n", err(ret));
	printk("[poll_in] waiting up to 20 s for 5 characters on the console\n");

	for (int64_t end = k_uptime_get() + 20000; n < 5 && k_uptime_get() < end;) {
		if (uart_poll_in(uart, &c) == 0) {
			got[n++] = c;
		} else {
			k_msleep(1);
		}
	}
	printk("[poll_in] got %d characters: \"%s\"\n", n, got);
}

/* interrupt driven receive and transmit */
RING_BUF_DECLARE(rx_ring, 64);
static const char *tx_text;
static int tx_left;
static volatile int rx_irqs, tx_irqs;

/* uart_fifo_read: take what the receiver has out of its FIFO */
static void rx_ready(const struct device *dev)
{
	uint8_t buf[16];
	int n = uart_fifo_read(dev, buf, sizeof(buf));

	ring_buf_put(&rx_ring, buf, n);
	rx_irqs++;
}

/* uart_fifo_fill: put as much as fits into the transmit FIFO; the rest waits for the next interrupt */
static void tx_ready(const struct device *dev)
{
	tx_irqs++;
	if (tx_left > 0) {
		int n = uart_fifo_fill(dev, (const uint8_t *)tx_text, tx_left);

		tx_text += n;
		tx_left -= n;
	}
	if (tx_left == 0) {
		uart_irq_tx_disable(dev);
	}
}

/* the interrupt handler: uart_irq_update latches the interrupt state, uart_irq_is_pending says
 * whether there is anything to do, uart_irq_rx_ready and uart_irq_tx_ready say what
 */
static void uart_isr(const struct device *dev, void *user_data)
{
	ARG_UNUSED(user_data);

	while (uart_irq_update(dev) && uart_irq_is_pending(dev)) {
		if (uart_irq_rx_ready(dev)) {
			rx_ready(dev);
		}
		if (uart_irq_tx_ready(dev)) {
			tx_ready(dev);
		}
	}
}

/* uart_irq_callback_user_data_set: the handler that the UART interrupt calls */
static void demo_irq_callback_set(void)
{
	int ret = uart_irq_callback_user_data_set(uart, uart_isr, NULL);

	printk("[irq] uart_irq_callback_user_data_set = %s\n", err(ret));
}

/* uart_irq_tx_enable: the handler fills the FIFO whenever it has room */
static void demo_irq_tx_enable(void)
{
	static const char msg[] = "[irq] sent by the interrupt handler, 64 bytes at the most per fill ........\r\n";

	tx_text = msg;
	tx_left = strlen(msg);
	uart_irq_tx_enable(uart);
	k_msleep(100);
	printk("[irq] transmit: %d interrupt(s), %d byte(s) left\n", tx_irqs, tx_left);
}

/* uart_irq_rx_enable: the host sends 4 characters; the handler puts them in a ring buffer.
 * uart_irq_rx_disable stops the receive interrupt again.
 */
static void demo_irq_rx_enable(void)
{
	uint8_t buf[32];

	uart_irq_rx_enable(uart);
	printk("[irq] waiting up to 20 s for 4 characters on the console\n");
	for (int64_t end = k_uptime_get() + 20000; ring_buf_size_get(&rx_ring) < 4 && k_uptime_get() < end;) {
		k_msleep(10);
	}
	k_msleep(20);
	int n = ring_buf_get(&rx_ring, buf, sizeof(buf) - 1);

	buf[n] = '\0';
	uart_irq_rx_disable(uart);
	printk("[irq] receive: %d interrupt(s), got %d characters: \"%s\"\n", rx_irqs, n, buf);
}

/* uart_err_check: a bit mask of the errors seen since the last call */
static void demo_errors(void)
{
	int ret = uart_err_check(uart);

	printk("[error] uart_err_check = 0x%x (0 = no overrun, parity, framing or break error)\n", ret);
}

/* UART4 on PD6 (TX) and PD7 (RX): nothing is connected there on the board */
static void demo_uart4(void)
{
	static const char text[] = "uart4\r\n";
	unsigned char c;
	struct uart_config cfg;
	int ret;

	printk("[uart4] device_is_ready = %d\n", device_is_ready(uart4));
	ret = uart_config_get(uart4, &cfg);
	printk("[uart4] uart_config_get = %s: %u baud\n", err(ret), cfg.baudrate);

	for (int i = 0; text[i] != '\0'; i++) {
		uart_poll_out(uart4, text[i]);
	}
	printk("[uart4] sent %d bytes on PD6\n", (int)strlen(text));

	/* PD7 is not connected: take whatever is in the receiver and ask for the line errors */
	int n = 0;

	c = 0;
	while (n < 64 && uart_poll_in(uart4, &c) == 0) {
		n++;
	}
	ret = uart_poll_in(uart4, &c);
	printk("[uart4] %d byte(s) were waiting in the receiver, then uart_poll_in = %s\n", n, err(ret));
	printk("[uart4] uart_err_check = 0x%x\n", uart_err_check(uart4));
}

int main(void)
{
	if (!device_is_ready(uart) || !device_is_ready(uart4)) {
		printk("uart not ready\n");
		return 0;
	}

	demo_config_get();
	demo_configure();
	demo_poll_out();
	demo_poll_in();
	demo_irq_callback_set();
	demo_irq_tx_enable();
	demo_irq_rx_enable();
	demo_errors();
	demo_uart4();

	printk("uart_api done\n");
	return 0;
}
```

### Build and run

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/uart-api uart_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-uart/build.cast" data-speed="6"></div>

See [Build and run](../zephyr-build-run.md) for how to download and run it. When the program reaches `[poll_in]` and `[irq]` it waits for the host to send characters in over the console serial port (20 seconds each): first 5 characters, then 4. The complete output on the console UART1:

```text
[config] uart_config_get = 0: 115200 baud, parity 0, stop bits 1, data bits 3, flow control 0
[config]   9600 baud, parity 0, stop bits 1, data bits 3, flow 0 = 0; read back 9600, 0, 1, 3, 0
[config] 921600 baud, parity 0, stop bits 1, data bits 3, flow 0 = 0; read back 921600, 0, 1, 3, 0
[config] 115200 baud, parity 2, stop bits 1, data bits 3, flow 0 = 0; read back 115200, 2, 1, 3, 0
[config] 115200 baud, parity 1, stop bits 1, data bits 3, flow 0 = -ENOTSUP; read back 115200, 2, 1, 3, 0
[config] 115200 baud, parity 0, stop bits 3, data bits 3, flow 0 = 0; read back 115200, 0, 3, 3, 0
[config] 115200 baud, parity 0, stop bits 2, data bits 3, flow 0 = -ENOTSUP; read back 115200, 0, 3, 3, 0
[config] 115200 baud, parity 0, stop bits 1, data bits 2, flow 0 = 0; read back 115200, 0, 1, 2, 0
[config] 115200 baud, parity 0, stop bits 1, data bits 3, flow 1 = 0; read back 115200, 0, 1, 3, 1
[config] 115200 baud, parity 0, stop bits 1, data bits 3, flow 2 = 0; read back 115200, 0, 1, 3, 2
[poll_out] Hello from uart_poll_out
[poll_in] nothing sent yet: uart_poll_in = -1
[poll_in] waiting up to 20 s for 5 characters on the console
hello[poll_in] got 5 characters: "hello"
[irq] uart_irq_callback_user_data_set = 0
[irq] sent by the interrupt handler, 64 bytes at the most per fill ........
[irq] transmit: 5 interrupt(s), 0 byte(s) left
[irq] waiting up to 20 s for 4 characters on the console
ping[irq] receive: 1 interrupt(s), got 4 characters: "ping"
[error] uart_err_check = 0x0 (0 = no overrun, parity, framing or break error)
[uart4] device_is_ready = 1
[uart4] uart_config_get = 0: 115200 baud
[uart4] sent 7 bytes on PD6
[uart4] 1 byte(s) were waiting in the receiver, then uart_poll_in = -1
[uart4] uart_err_check = 0x0
uart_api done
```
