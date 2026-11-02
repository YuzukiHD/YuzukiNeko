---
title: "UART - 串口"
---

F101 上有六个基于 Synopsys DesignWare 8250 核的串口。Linux 在 8250 核心之上用通用的 `8250_dw` 驱动来驱动它们，而板子只引出 UART1，它就是控制台。内核启动时打印的所有内容、登录提示，以及这些页面里的每一条命令，都经由这一个端口进出。

本章讲端口的寄存器布局和时钟、描述它的两个设备树节点、`8250_dw` 与 8250 核心的探测路径，以及用 BusyBox 能对端口做些什么。其余五个端口只要使能节点并把引脚引出来，同一个驱动一样能用。

| 项目 | 内容 |
| --- | --- |
| 驱动 | `drivers/tty/serial/8250/8250_dw.c`、`8250_of.c`、`8250_core.c`、`8250_port.c`、`drivers/tty/serial/serial_core.c` |
| Compatible | `snps,dw-apb-uart` |
| 基地址 | `0x02500000` + `0x400` × n，UART0 到 UART5 |
| 寄存器窗口 | 每端口 `0x400` 字节，`reg-shift = <2>`，`reg-io-width = <4>` |
| 中断 | PLIC 2（UART0）到 PLIC 7（UART5） |
| 时钟 | `baudclk` 与 `apb_pclk`，都是 `apb-uart` 上的 `CLK_BUS_UARTn` 门控 |
| 复位 | `RST_BUS_UARTn` |
| Kconfig | `CONFIG_SERIAL_8250`、`CONFIG_SERIAL_8250_DW`、`CONFIG_SERIAL_8250_CONSOLE` |
| 用户态 | `/dev/ttyS1`、`/sys/class/tty/ttyS1`、`getty`、`stty`、`microcom` |

## 硬件工作原理

DesignWare APB UART 是一套 16550A 兼容的寄存器，外加几个扩展寄存器。这颗 SoC 没有把寄存器按一字节间隔摆放：`reg-shift = <2>` 与 `reg-io-width = <4>` 表示每个寄存器序号都要乘以四，并按 32 位字访问。`8250_dw.c` 里的 `dw8250_serial_in32()` 和 `dw8250_serial_out32()` 正是这么做的，所以下表就是 `devmem` 读到的字节偏移。

| 偏移 | 寄存器 | 用途 |
| --- | --- | --- |
| `0x00` | RBR / THR / DLL | 接收字节、发送字节，或 DLAB 置位时的除数低字节 |
| `0x04` | IER / DLM | 中断使能，或 DLAB 置位时的除数高字节 |
| `0x08` | IIR / FCR | 中断识别（读）与 FIFO 控制（写） |
| `0x0c` | LCR | 字长、停止位、校验、DLAB |
| `0x10` | MCR | 调制解调器控制：DTR、RTS、回环 |
| `0x14` | LSR | 数据就绪、溢出、发送器空、错误位 |
| `0x18` | MSR | 调制解调器状态：CTS、DSR、RI、DCD |
| `0x1c` | SCR | 暂存寄存器 |
| `0x7c` | DW USR | DesignWare 状态，bit 0 为忙 |
| `0x300` | DW DLF | 小数分频，核实现了才有 |
| `0x3d0` | DW CPR | 组件参数寄存器：FIFO 大小、扩展特性 |
| `0x3e0` | DW UCV | 组件版本，三个字节的 ASCII |

`0x08` 处的 FIFO 控制寄存器负责使能 FIFO 并选择接收触发深度，中断识别寄存器告诉处理函数这次中断的原因。FIFO 深度不是 16550 标准固定的：探测时 `drivers/tty/serial/8250/8250_dwlib.c` 里的 `dw8250_setup_port()` 读 CPR，若 FIFO 模式字段非零，就用 `DW_UART_CPR_FIFO_SIZE()` 算出深度并把端口标记为 `PORT_16550A`。CPR 读回零时驱动退回平台给的值，平台值也是零时端口保持通用 8250 的默认值。F101 这个端口实际的 FIFO 大小没有测量过；内核会在启动时打印检测到的类型。

波特率用标准 16 倍分频：输入时钟除以 16 与目标波特率之积。输入是 `baudclk`，在这颗 SoC 上是 CCU 里 `apb-uart` 时钟（寄存器 `0x0528`，一个分频加一个 mux，复位时父时钟为 `dcxo24M`）的按端口门控。用复位后的分频，端口拿到 24 MHz，于是 115200 波特要求 24 MHz / (16 × 115200) = 13.02，整数分频 13 得到 115384.6 波特，比标称高 0.16 %，远在 UART 链路能容忍的范围内。DesignWare 核还可以用 DLF 补上小数分频。探测时 `dw8250_setup_port()` 先往 DLF 写全 1 再读回，若寄存器存在就改用 `dw8250_get_divisor()` / `dw8250_set_divisor()`，把余数分到 DLF 和 DLL/DLM 里。F101 的核有没有 DLF，树里没有任何记录，所以小数分频这条路只能算可能存在，未经验证。

寄存器文件是 32 位宽的，因此 F101 的端口配置成 `UPIO_MEM32` 而不是默认的 8 位 `UPIO_MEM`。`serial_port.c` 把 `reg-io-width = <4>` 映射为 `UPIO_MEM32`，把 `reg-shift = <2>` 映射为 `port->regshift`，端口的 `serial_in`/`serial_out` 就变成 `8250_dw.c` 里的 32 位访问器。

### 需要记住的寄存器位

端口出问题时，行为几乎都集中在这三个寄存器里。

| 寄存器 | 位 | 含义 |
| --- | --- | --- |
| LCR（`0x0c`） | `[1:0]` | 字长：0 = 5 位，1 = 6 位，2 = 7 位，3 = 8 位 |
| | `[2]` | 停止位：0 = 1 位，1 = 2 位（5 位字长时是 1.5 位） |
| | `[3]` | 校验使能 |
| | `[5:4]` | 校验选择：0 = 奇，1 = 偶，2 = stick，3 = 无 |
| | `[6]` | Break 控制 |
| | `[7]` | DLAB：把 RBR/THR 换成 DLL、把 IER 换成 DLM |
| LSR（`0x14`） | `[0]` | 数据就绪 |
| | `[1]` | 溢出错误 |
| | `[2]` | 校验错误 |
| | `[3]` | 帧错误 |
| | `[4]` | Break 中断 |
| | `[5]` | 发送保持寄存器空 |
| | `[6]` | 发送器空：保持寄存器与移位寄存器都空 |
| IIR（`0x08`） | `[0]` | 有中断待处理时为 0 |
| | `[3:1]` | 原因：3 = 线路状态，2 = 收到数据，6 = 超时，1 = 发送器空 |
| | `[7:6]` | FIFO 状态：0 = 无 FIFO，3 = FIFO 已使能 |

8250 核心在写下一个控制台字符之前等的是 LSR 的 bit 6，而不是 bit 5：发送保持寄存器空只说明这个字节进了移位寄存器，发送器空才说明线路上真的空闲了。这也是 115200 下控制台每写一个字节大约阻塞 87 µs 的原因。

DesignWare 核的 IIR 还会报厂商自定义的 "busy" 码（7），这不是错误：它表示某次寄存器写还没完成。处理函数读一下 USR 就返回。

还有一个数字值得记住。115200 8N1 下一个字符是 10 个位时间，即 86.8 µs，N 字节的 FIFO 能顶上 N × 86.8 µs 的线路时间。接收中断在 FIFO 达到 FCR 里的触发深度时触发；核心从 16550A 的默认值 `UART_FCR_R_TRIG_10`（四档里的第二档）开始，DesignWare 核再按自己的 FIFO 大小换算这一档。触发深度和 FIFO 大小都不能从设备树配置，所以做低延迟协议时要保持报文短，接受这种成批处理。

### 六个端口

| 标签 | 节点 | PLIC | 板级状态 |
| --- | --- | --- | --- |
| `uart0` | `serial@2500000` | 2 | 禁用；有 `PE0`/`PE1` 引脚组 |
| `uart1` | `serial@2500400` | 3 | 使能；`PB0`/`PB1` 上的控制台 |
| `uart2` | `serial@2500800` | 4 | 禁用；无引脚组 |
| `uart3` | `serial@2500c00` | 5 | 禁用；无引脚组 |
| `uart4` | `serial@2501000` | 6 | 禁用；无引脚组 |
| `uart5` | `serial@2501400` | 7 | 禁用；无引脚组 |

## 设备树

SoC 设备树用一个模板声明全部六个端口。UART1 长这样：

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

其余五个只有地址、PLIC 号、时钟与复位 ID 和标签不同。地址从 `serial@2500000` 排到 `serial@2501400`，PLIC 号从 UART0 的 2 到 UART5 的 7。aliases 块决定了 Linux 里的行号：

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

正是这个 alias 让控制台是 `ttyS1`，而不是端口碰巧分到的某个号：`drivers/tty/serial/serial_port.c` 里的 `__uart_read_properties()` 把 `of_alias_get_id(dev_of_node(dev), "serial")` 读进 `port->line`。

板级文件使能 UART1 和它的两个引脚，其余端口保持禁用：

```text
&uart1 {
	pinctrl-names = "default";
	pinctrl-0 = <&uart1_pb_pins>;
	status = "okay";
};
```

引脚组声明在 SoC 文件里，和其他组放在一起：

```text
uart1_pb_pins: uart1-pb-pins {
	pins = "PB0", "PB1";
	function = "uart1";
};
```

只引出 TX 和 RX，组里没有 RTS/CTS 对，所以硬件流控没有可驱动的引脚。UART0 有一组 `PE0`/`PE1`（`uart0_pe_pins`，功能 `uart0`），但没有板级节点使能它。UART2 到 UART5 根本没有引脚组，要使能其中一个，得先补一组，写上它在封装上对应的球号。

绑定文件是 `Documentation/devicetree/bindings/serial/snps-dw-apb-uart.yaml`。它要求 `compatible`、`reg`、`interrupts` 和至少 `apb_pclk` 时钟，并说明了 `reg-shift`、`reg-io-width`、`fifo-size`、`snps,uart-16550-compatible` 以及 `dcd-override`/`dsr-override`/`cts-override`/`ri-override` 这些属性。`baudclk` 和 `apb_pclk` 这两个时钟名就是 `8250_dw` 查找的名字。

## 控制台与 earlycon

chosen 节点同时给出内核命令行和标准输出路径：

```text
bootargs = "console=tty0 console=ttyS1,115200n8 earlycon=uart8250,mmio32,0x02500400 loglevel=8 printk.time=1 root=/dev/mtdblock4 rootfstype=squashfs ro";
stdout-path = "serial1:115200n8";
```

这里指定了两个控制台。`tty0` 是 DSI 屏上的 framebuffer 控制台，`ttyS1` 是串口；两者都收到内核日志，也都显示 getty 提示，写 `/dev/console` 会同时到两边。

`earlycon=uart8250,mmio32,0x02500400` 是有意写死而不是交给设备树的。early console 在 8250 驱动探测之前就要用，而选项里没带波特率，所以 `drivers/tty/serial/8250/8250_early.c` 的 `early_serial8250_setup()` 根本不去写分频：它假定 bootloader 已经把端口配好，只屏蔽 UART 中断。随后内核会打印一行确认映射，形如 `uart8250 at MMIO32 0x02500400`，之后常规驱动接手，不改动线路参数。

`SERIAL_8250_CONSOLE` 会选中 `SERIAL_EARLYCON`，所以只要使能了控制台选项，early console 的代码就在。这里不带参数的 `earlycon` 也能用：DW UART 的 compatible 已用 `OF_EARLYCON_DECLARE` 注册，`stdout-path` 又给出了端口和速率。

命令行上另外两个词改变的是控制台显示什么，而不是它怎么被驱动。`loglevel=8` 把控制台日志级别调高，连 debug 级消息也打印；默认是 7，已经包含到 `KERN_DEBUG` 为止的所有级别。`printk.time=1` 给每行加上以秒为单位的单调时间戳，这样从抓下来的日志里才能回答「启动时这件事发生在什么时候」。

用户态启动后，BusyBox `init` 读 `/etc/inittab`，里面只有一个会重生的 getty：

```text
ttyS1::respawn:/sbin/getty -L  ttyS1 115200 vt100 # GENERIC_SERIAL
```

root 账户没有密码，所以提示符直接接受 `root`。改控制台速率要同时改三处：设备树里的 `console=`、`stdout-path`，以及 `/etc/inittab` 里的 getty 行；只改内核命令行，getty 仍会用旧速率打开端口。

### 从复位到登录提示

在 shell 出现之前，端口要经过好几手：

1. Boot ROM 和 SyterKit 把 UART 留在它们用的速率上；内核在探测端口之前不会重新配置它。
2. `earlycon=uart8250,...` 映射寄存器并安装 boot console。因为没有给波特率，它只屏蔽 UART 中断，沿用已有配置输出。
3. `8250_dw` 探测，打开时钟、解除复位，把端口注册成 `ttyS1`。解除复位会清掉控制器的线路设置，注册控制台时再用命令行上的 `console=ttyS1,115200n8` 重新配置。
4. `SERIAL_8250_CONSOLE` 在 `ttyS1` 上装好真正的控制台，boot console 注销，printk 继续走驱动。
5. BusyBox `init` 以 115200 在 `ttyS1` 上运行 `getty`，它打开端口、按 `/etc/inittab` 里的速率参数设置 termios，打印登录提示。

这个过程中只要复位一次，就会出现"早启动有输出、之后没声音"或者反过来的现象。

## Kconfig

```text
CONFIG_SERIAL_8250=y
CONFIG_SERIAL_8250_CONSOLE=y
CONFIG_SERIAL_8250_DW=y
```

`CONFIG_SERIAL_8250` 是核心，`SERIAL_8250_CONSOLE` 加上控制台（并选中 `SERIAL_CORE_CONSOLE` 和 `SERIAL_EARLYCON`），`SERIAL_8250_DW` 选中 `SERIAL_8250_DWLIB` 并处理 DesignWare 的扩展：32 位访问器、忙位、RX 超时兜底、CPR 解析和 DLF。

板级 defconfig `arch/riscv/configs/sun252i_f101_yuzukineko_defconfig` 正好设置这三项。它没有调高 `CONFIG_SERIAL_8250_NR_UARTS`，默认是 4。核心最多保留 `nr_uarts` 个端口槽，`serial8250_find_match_or_unused()` 只在 `port->line < nr_uarts` 时才接受请求的行号；alias 号是 4 或 5 的端口会退到第一个空槽。出厂板不受影响——只使能了 UART1，行号 1 放得下——但若同时使能 UART4 和 UART5，要让它们显示成 `ttyS4` 和 `ttyS5`，就得设 `CONFIG_SERIAL_8250_NR_UARTS=6`。

## 驱动内部

虽然 `8250_of.c` 和 `8250_dw.c` 都放在 8250 目录里，只有 `8250_dw` 匹配这个节点：它的匹配表里有 `snps,dw-apb-uart`，而 `8250_of` 只列了旧的 `ns8250`/`ns16xxx` compatible。没有第二个驱动来抢这个设备。8250 核心（`8250_core.c`、`8250_port.c`）仍然拥有端口结构、tty 和控制台；`8250_dw` 是创建端口并提供寄存器访问器和 DesignWare 专有行为的平台驱动。

### 探测路径

`8250_dw.c` 里的 `dw8250_probe()`：

1. 取第一个内存资源，映射它，填好 `p->mapbase`、`p->mapsize` 和 `p->membase`。
2. 调用设备树解析器的宽松版 `uart_read_port_properties()`。它读 `reg-io-width`、`reg-shift`、`reg-offset`、可选的 `fifo-size`，以及 `serialN` alias 到 `port->line`；允许缺中断，缺了端口就没有中断。
3. 因为 `reg-io-width = <4>`，iotype 是 `UPIO_MEM32`，所以驱动装上 `dw8250_serial_in32()` 和 `dw8250_serial_out32()`，它们把每个寄存器序号乘以 `reg-shift`。
4. 用 `devm_clk_get_optional_enabled(dev, "baudclk")` 取波特率时钟，取不到就用第一个时钟，并把 `clk_get_rate()` 复制进 `p->uartclk`。用同样方式取 `apb_pclk`，留给运行时 PM 回调使用。设备树里的两项是同一个 `CLK_BUS_UART1` 门控，所以两次查找解析到同一个时钟。
5. 用 `reset_control_array_get_optional_exclusive()` 取复位数组并解除复位。
6. 使能运行时 PM，调用 `dw8250_setup_port()` 探测 DLF 和 CPR，最后 `serial8250_register_8250_port()`。

端口带 `UPF_FIXED_PORT` 标志，8250 核心不会去探测杂项寄存器自动判断类型。控制台出问题时有两个细节值得记住。第一，`data->clk` 先按 `"baudclk"` 查，查不到就取第一个无名时钟；两者都没有时 `dw8250_probe()` 以 "clock rate not defined" 失败。第二，复位查找是可选的，所以没有 `resets` 属性的设备树照样能探测，写了多个复位项也不需要改驱动。

### 中断

端口使用 PLIC 的一根电平高有效中断。设备树解析器设置 `UPF_SHARE_IRQ`，中断线在端口打开时由 8250 核心申请。`dw8250_handle_irq()` 在 `serial8250_handle_irq()` 之上补了两件事：

- DesignWare 的 IIR 在写 LCR 等寄存器尚未完成时会报 "busy"（`UART_IIR_BUSY`）；处理函数读 USR 让写完成，并把这次中断报告为已处理。
- 接收超时中断可能在没有数据的情况下触发。处理函数读 LSR，若既没有数据就绪也没有 break，就空读一次 RBR，免得中断一直打。这个兜底只用于非 DMA 模式。

端口不在 DMA 模式：设备树没有 `dmas` 属性，defconfig 也没开 `CONFIG_SERIAL_8250_DMA`。数据全部经 FIFO 和中断阈值搬运。

### 运行时电源管理

`dw8250_do_pm()` 是端口的 `pm` 回调：打开端口时取运行时 PM 引用，关闭时释放。驱动的运行时 suspend 回调关掉两个时钟，resume 回调重新打开，所以关闭的端口完全没时钟。8250 核心每次打开都会重新配置线路，所以分频不会随时钟一起丢掉。

### 错误路径

缺 `reg` 属性会在映射之前就被拒绝（"no registers defined"）。缺时钟会让探测以 "clock rate not defined" 失败，不会出现 `/dev/ttyS1`。缺复位不致命，因为复位查找是可选的。无效的 `reg-io-width` 会被 `uart_read_and_validate_port_properties()` 以 "Unsupported reg-io-width" 拒绝；只接受 1、2 和 4。中断缺失时 `dw8250_probe()` 把 `-ENXIO` 当成"改用轮询"，端口照样注册；`univ8250_setup_irq()` 为无中断端口启用定时器轮询。

### 串口核心的行为

在两个驱动之上是 `serial_core.c`，用户能感觉到的大部分行为来自它，而不是 `8250_dw`：

- **打开与关闭。** 第一次打开调用 `uart_startup()`，进而执行 `serial8250_do_startup()`：使能 FIFO，按当前 termios 配置线路，申请中断。最后一次关闭调用 `uart_shutdown()`，关掉中断，并在端口不是控制台时断电。
- **Termios。** `serial8250_do_set_termios()` 从 `port->uartclk` 算分频，写 DLL/DLM（核有时还经 `dw8250_set_divisor()` 写 DLF），再更新 LCR。改波特率不会清空 FIFO。
- **Break 与调制解调器控制。** `TCSBRK` 和 `TIOCSBRK` 翻转 LCR 的 bit 6；`TIOCMGET`/`TIOCMSET` 读写 MCR 和 MSR。只引出 TX 和 RX 时，调制解调器位只是软件状态，回环测试是唯一能拨动它们的方法。
- **控制台写。** 控制台路径不用中断。`serial8250_console_write()` 拿端口锁，轮询 LSR 逐字节写，最后等发送器空，所以一次长 printk 可能占住端口几毫秒。
- **轮询。** 设备树端口没有中断时，`uart_read_port_properties()` 把 `port->irq` 留在 0，`UPF_SHARE_IRQ` 仍然设置，核心退回定时器轮询。

## 用户态接口

| 路径 | 含义 |
| --- | --- |
| `/dev/ttyS1` | 控制台端口；端口注册时由 devtmpfs 创建 |
| `/sys/class/tty/ttyS1` | tty 设备；`uartclk`、`type`、`line`、`irq`、`xmit_fifo_size` 是它的属性，不在 `device/` 下 |
| `/dev/console` | 系统控制台；写了两个 `console=` 时同时分发到 `tty0` 和 `ttyS1` |
| `/proc/cmdline` | 实际使用的命令行，包含两个 console 词 |

只有注册成功的端口才有设备节点。出厂设备树上只有 `ttyS1`；在使能 `uart0` 并配好引脚之前，`/dev/ttyS0` 不存在。

这个端口就是普通 tty，任何能作用于 tty 的 shell 工具都能用。`stty` 读写 termios，`microcom` 是个小终端，`getty` 已经在控制台上跑着，BusyBox 构建里也有 `setserial`，不过驱动并不使用它的配置接口。sysfs 报告的端口类型信息就是上面那些，没有更多 `setserial` 可见的细节。

在 ioctl 层面，端口响应标准的 tty 请求：

| 请求 | 作用 |
| --- | --- |
| `TCGETS` / `TCSETS` | 读或写 termios；`TCSETSW` 会等改动排空后再生效 |
| `TCFLSH` | 清空输入队列、输出队列或两者 |
| `TCSBRK` / `TIOCSBRK` / `TIOCCBRK` | 发送指定时长的 break，或开始、结束一个 break |
| `TIOCMGET` / `TIOCMSET` | 读或改 DTR、RTS 以及其他调制解调器线 |
| `TIOCGWINSZ` | 窗口大小；与终端设置的一致 |
| `TIOCSTI` | 把字符推回输入队列（通常被内核的 `dev.tty.legacy_tiocsti` 关闭） |

没有直接操作分频的接口。`TIOCGSERIAL` 用 `struct serial_struct` 报告端口，`TIOCSSERIAL` 也接受，但对 `UPF_FIXED_PORT` 端口只应用关闭延时、自定义分频、`UPF_USR_MASK` 标志和 FIFO 大小；中断、映射地址和输入时钟都不能从用户态改。

## 工作示例

### 示例 1：控制台当前是什么配置

```sh
cat /proc/cmdline
stty -F /dev/ttyS1
ls /dev/ttyS*
```

代表性输出：

```text
console=tty0 console=ttyS1,115200n8 earlycon=uart8250,mmio32,0x02500400 loglevel=8 printk.time=1 root=/dev/mtdblock4 rootfstype=squashfs ro
speed 115200 baud; line = 0;
/dev/ttyS1
```

`/proc/cmdline` 原样显示设备树 `bootargs`，包括两个 console 词和 early console。不带参数的 `stty` 只打印速率和线路规程；`line = 0` 就是 `N_TTY`。`ls` 的结果说明只有 UART1 注册了。

### 示例 2：使用一个未使用的端口

UART0 的节点和引脚组在 SoC 设备树里已经有了，所以把它启用只是改板级文件再重新构建：

```text
&uart0 {
	pinctrl-names = "default";
	pinctrl-0 = <&uart0_pe_pins>;
	status = "okay";
};
```

重新构建设备树并重启后，端口以 `ttyS0` 出现，可以接一个终端上去：

```sh
stty -F /dev/ttyS0 115200 cs8 -cstopb -parenb raw
microcom -s 115200 /dev/ttyS0
```

`stty` 设成 115200 8N1、无流控、raw 输入；随后 `microcom` 在 shell 的 stdin/stdout 和端口之间复制字节。没给 `-X` 时，`Ctrl-X` 退出 `microcom`。UART2 到 UART5 要先补引脚组；SoC 设备树没有声明它们，而承载这些端口的封装球号在树里也没有文档。

### 示例 3：从 sysfs 读端口参数

```sh
cat /sys/class/tty/ttyS1/uartclk
cat /sys/class/tty/ttyS1/line
cat /sys/class/tty/ttyS1/irq
```

代表性输出：

```text
24000000
1
3
```

这三个文件是 tty 设备本身的属性，由 `serial_core.c` 的 `tty_dev_attrs` 创建。`uartclk` 是驱动算分频用的 24 MHz `apb-uart` 速率，`line` 是 alias 号，`irq` 是设备树里的 PLIC 源。如果 `uartclk` 读出来是 0，说明时钟查找失败了；那种情况下端口根本不会注册，所以非零值也顺带证明时钟就在设备树说的位置上。

## 限制

| 限制 | 说明 |
| --- | --- |
| 只引出 UART1 | 其余五个节点是 `disabled`；UART0 有引脚组，UART2-5 没有 |
| 没有流控引脚 | UART1 的组里只有 `PB0`/`PB1`，RTS/CTS 没有引出 |
| 没有 DMA | 节点里没有 `dmas`，`CONFIG_SERIAL_8250_DMA` 也没开；传输靠 FIFO 和中断 |
| 四个端口槽 | `CONFIG_SERIAL_8250_NR_UARTS` 保持默认的 4；使能 UART4/UART5 要调大才能保住它们的 alias 号 |
| 控制台固定 115200 | 内核、bootloader、getty 和主机终端必须一致；设备树只描述内核这一侧 |
| 没有调制解调器信号 | DCD/DSR/RI 没有连接；若有程序等载波，用 `*-override` 属性伪造 |

## 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 串口完全没输出，屏幕正常 | 端口不对、引脚不对，或 console 词指向了禁用的端口 | 检查 `console=ttyS1`，确认 `&uart1` 是 `okay` 且带 `uart1_pb_pins` |
| 启动日志有，但到登录提示前停住 | `getty` 没跑，或跑在别的 tty 上 | 检查 `/etc/inittab` 里的 `ttyS1` 行，确认 `/dev/ttyS1` 存在 |
| 乱码 | 波特率不匹配，或主机终端不是 8N1 | 主机设成 115200 8N1；用 `stty -F /dev/ttyS1` 核对 |
| 改控制台速率后才乱码 | 内核、getty 和主机不一致 | 同时改 `console=`、`stdout-path` 和 `/etc/inittab` |
| 没有 `/dev/ttyS0` | `uart0` 是禁用的 | 使能节点、补引脚组，然后重新构建设备树 |
| 使能 UART4/UART5 后出来的是 `ttyS2` 而不是 `ttyS4` | 行号 4 放不进 `nr_uarts` | 设 `CONFIG_SERIAL_8250_NR_UARTS=6` |
| 控制台能用，但程序看不到 CTS | CTS 没有引出 | 在节点里用 `cts-override`，或者不要开硬件流控 |

## 相关页面

- [Linux 开发](../index.md)：启动链和内核配置。
- [引脚复用与 GPIO](pinctrl-gpio.md)：`PB0`/`PB1` 组是怎么生效的。
- [Flash 布局](../../../boot/flash-layout.md)：控制台最终启动进去的根文件系统。
- [常用命令](../apps/linux-commands.md)：板子上能用的 shell 命令，包括这里用到的工具。
