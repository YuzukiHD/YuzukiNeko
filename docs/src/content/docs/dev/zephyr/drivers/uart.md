---
title: "UART"
---

F101 有 6 个 UART（`uart0`…`uart5`）。Zephyr 里用的是上游的 NS16550 驱动（`drivers/serial/uart_ns16550.c`），因为 F101 的 UART 是 Synopsys DesignWare APB UART（16550 兼容）。F101 的移植只做了三件事：设备树节点、时钟/复位、让 SoC 默认选中 `UART_NS16550_DW8250_DW_APB`。接口是标准的 `<zephyr/drivers/uart.h>`。

| 项目 | 内容 |
| --- | --- |
| 设备 | `uart0`…`uart5` |
| 数据位 | 5、6、7、8 |
| 停止位 | 1、1.5、2 |
| 校验 | 无、偶校验（奇校验返回 `-ENOTSUP`） |
| 流控 | 无、RTS/CTS、DTR/DSR |
| 接口 | 轮询（`uart_poll_in`/`uart_poll_out`）、中断（`uart_irq_*`、`uart_fifo_*`） |

## 设备树

| 文件 | 作用 |
| --- | --- |
| `dts/bindings/serial/ns16550.yaml` | 绑定（上游），`uart-controller.yaml` 提供 `current-speed` 等通用属性 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 设备树：`uart0`…`uart5`，默认 `disabled` |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | 板级设备树：引脚组，打开 `uart1`、`uart2`、`uart4`，选控制台 |

### SoC 设备树：sun252i_f101.dtsi

六个节点的差别是寄存器地址、中断号、时钟和复位位。下面是 `uart1`：

```c
uart1: serial@2500400 {
	/* 两个 compatible：先匹配 ns16550 驱动，snps,dw-apb-uart 告诉它这是 DW APB 变种 */
	compatible = "ns16550", "snps,dw-apb-uart";

	/* 寄存器窗口：基址 0x02500400，长度 0x400 */
	reg = <0x02500400 0x400>;

	/* 寄存器按 4 字节排布，偏移要左移 2 位 */
	reg-shift = <2>;

	/* 中断：PLIC 的 3 号，优先级 1 */
	interrupts = <3 1>;
	interrupt-parent = <&plic>;

	/* 总线时钟的开关和总线复位。波特率的参考时钟由 CCU 驱动给出 */
	clocks = <&cctl CLK_BUS_UART1>;
	resets = <&rctl RST_BUS_UART1>;

	status = "disabled";
};
```

| 节点 | 标签 | 寄存器 | PLIC 中断号 | 时钟宏 |
| --- | --- | --- | --- | --- |
| `serial@2500000` | `uart0` | `0x02500000` | 2 | `CLK_BUS_UART0` |
| `serial@2500400` | `uart1` | `0x02500400` | 3 | `CLK_BUS_UART1` |
| `serial@2500800` | `uart2` | `0x02500800` | 4 | `CLK_BUS_UART2` |
| `serial@2500c00` | `uart3` | `0x02500c00` | 5 | `CLK_BUS_UART3` |
| `serial@2501000` | `uart4` | `0x02501000` | 6 | `CLK_BUS_UART4` |
| `serial@2501400` | `uart5` | `0x02501400` | 7 | `CLK_BUS_UART5` |

### 板级设备树：yuzukineko.dts

```c
/ {
	chosen {
		/* 控制台和 shell 用 UART1 */
		zephyr,console = &uart1;
		zephyr,shell-uart = &uart1;
	};
};

&pio {
	/* UART1 控制台：PB00 是 TX，PB01 是 RX，复用功能 4 */
	uart1_pins: uart1_pins {
		uart1_tx_rx {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 0, 4)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 1, 4)>;
		};
	};

	/* UART2 蓝牙 HCI：TX PE6、RX PE7、RTS PE8、CTS PE9，复用功能 3，带上拉 */
	uart2_pins: uart2_pins {
		uart2_group {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PE, 6, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PE, 7, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PE, 8, 3)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PE, 9, 3)>;
			bias-pull-up;
		};
	};

	/* UART4 通用串口：PD6 是 TX，PD7 是 RX，复用功能 5，带上拉 */
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
	/* 波特率 */
	current-speed = <115200>;
	pinctrl-0 = <&uart1_pins>;
	pinctrl-names = "default";
};

/* AIC8800D40 的蓝牙 HCI：带硬件流控 */
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

引脚的详细复用关系见[引脚复用表](../../../hardware/mux.md)，各 UART 可选的引脚组见[外设引脚分组](../../../hardware/groups.md)。

### 绑定的属性

| 属性 | 必填 | 含义 |
| --- | --- | --- |
| `reg` | 是 | 寄存器窗口 |
| `reg-shift` | 是 | 寄存器偏移左移位数，F101 是 2 |
| `interrupts` | 是 | 中断 |
| `clocks`、`resets` | 是 | 总线时钟和复位 |
| `current-speed` | 是 | 波特率 |
| `hw-flow-control` | 否 | 打开 RTS/CTS 硬件流控 |
| `parity` | 否 | 0 无、1 奇、2 偶；这个移植里奇校验不能用 |
| `stop-bits`、`data-bits` | 否 | 停止位、数据位 |
| `pinctrl-0`、`pinctrl-names` | 否 | 引脚，见 [GPIO 页的 pinctrl 一节](gpio.md#引脚复用pinctrl) |

## Kconfig

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `CONFIG_SERIAL` | 板级 defconfig 里是 `y` | 打开串口子系统 |
| `CONFIG_UART_NS16550` | SoC 默认 `y` | NS16550 驱动 |
| `CONFIG_UART_NS16550_DW8250_DW_APB` | SoC 默认 `y` | Synopsys DesignWare 8250 UART 控制器的支持 |
| `CONFIG_UART_INTERRUPT_DRIVEN` | 板级 defconfig 里是 `y` | 中断接口 `uart_irq_*`、`uart_fifo_*` |
| `CONFIG_UART_CONSOLE` | 板级 defconfig 里是 `y` | `printk` 从 `zephyr,console` 输出 |

## 接口详解

下面每个接口一个小标题：原型、驱动的行为、示例函数和它在板子上的输出。示例来自文末的[完整演示程序](#完整演示程序)，里面的 `err()` 把返回值转成名字。演示用到两个串口：

| 串口 | 位置 | 用途 |
| --- | --- | --- |
| UART1 | PB00/PB01，板子的控制台 | 主机在另一头，可以真的发字符进来 |
| UART4 | PD6/PD7 | 板子上没有接任何东西，只演示发送 |

UART1 也是 `printk` 的输出口，所以演示里改波特率要小心：改配置期间不输出，先把发送器里还没发完的字符等完，改完恢复再打印，否则最后几个字符会按错的波特率发出去。

### uart_config_get

```c
int uart_config_get(const struct device *dev, struct uart_config *cfg);
```

读当前的波特率、校验、停止位、数据位和流控。枚举取值：校验 0 无、1 奇、2 偶；停止位 0 半位、1 一位、2 一位半、3 两位；数据位 0…3 对应 5…8 位；流控 0 无、1 RTS/CTS、2 DTR/DSR。

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

应用新的设置。成功后 `uart_config_get` 读回新的配置，失败时配置保持不变。

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

第 4 行是奇校验，返回 `-ENOTSUP`，读回的还是上一次成功的偶校验。

### uart_poll_out

```c
void uart_poll_out(const struct device *dev, unsigned char out_char);
```

发一个字符，发送器没有空位就等。

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

收到字符返回 0 并把字符放进 `p_char`，没有字符返回 -1，不会等。演示里先调一次（还没有人发，返回 -1），然后在 20 秒内等主机发来 5 个字符。

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

主机用 `write_serial` 发 `hello`：

```text
[poll_in] nothing sent yet: uart_poll_in = -1
[poll_in] waiting up to 20 s for 5 characters on the console
hello[poll_in] got 5 characters: "hello"
```

`hello` 是主机发出的 5 个字符，也会出现在串口记录里，不是板子打印的。

### 中断方式用到的变量

中断方式的几个示例共用下面的变量：接收的数据放进环形缓冲区，发送的数据放在全局变量里。

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

设置 UART 中断调用的处理函数。处理函数的固定写法是 `uart_irq_update()` 之后循环处理 `uart_irq_is_pending()`：`uart_irq_rx_ready()` 为真就收，`uart_irq_tx_ready()` 为真就发。

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

从接收 FIFO 里最多取 `size` 个字节，返回实际取到的个数。接收就绪时调用，演示把数据放进环形缓冲区。

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

往发送 FIFO 里填最多 `size` 个字节，返回实际填进去的个数；填不下的等下一次发送中断。发完以后调用 `uart_irq_tx_disable()`，否则发送中断会一直来。

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

打开发送中断，处理函数里的 `uart_fifo_fill` 开始工作。

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

这个 77 个字节的字符串用了 5 次发送中断发完。

### uart_irq_rx_enable

```c
void uart_irq_rx_enable(const struct device *dev);
```

打开接收中断（`uart_irq_rx_disable()` 关掉）。演示打开后等主机发 4 个字符，它们在 1 次接收中断里一起取走。

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

返回自上次调用以来遇到的错误位（溢出、校验、帧、break）；没有错误是 0。

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

### 另一个串口：UART4

UART4 在板级文件里是打开的，但 PD6/PD7 上没有接东西。演示发送 7 个字节，再读接收器：

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

## 完整演示程序

上面所有示例和日志都来自这一个程序。建一个目录，放进下面的文件，就可以像其他 Zephyr 应用一样编译。

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

### 编译和运行

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/uart-api uart_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-uart/build.cast" data-speed="6"></div>

下载运行的方法见[编译与运行](../zephyr-build-run.md)。程序运行到 `[poll_in]` 和 `[irq]` 时会等主机从控制台串口发字符进来（各等 20 秒）：先发 5 个字符，再发 4 个字符。控制台 UART1 上的完整输出：

```text
[config] uart_config_get = 0: 115200 baud, parity 0, stop bits 1, data bits 3, flow control 0
[config]   9600 baud, parity 0, stop bits 1, data bits 3, flow 0 = 0; read back 9600, 0, 1, 3, 0
[config] 921600 baud, parity 0, stop bits 1, data bits 3, flow 0 = 0; read back 921600, 0, 1, 3, 0
[config] 115200 baud, parity 2, stop bits 1, data bits 3, flow 0 = 0; read back 115200, 2, 1, 3, 0
[config] 115200 baud, parity 1, stop bits 1, data bits 3, flow 0 = -ENOTSUP; read back 115200, 2, 1, 3, 0
[config] 115200 baud, parity 0, stop bits 3, data bits 3, flow 0 = 0; read back 115200, 0, 3, 3, 0
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
