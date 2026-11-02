---
title: "I2C - I²C 总线"
---

F101 上有三个 I²C 控制器，Allwinner 文档里叫 TWI。它们就是大多数 Allwinner SoC 都带的 Marvell mv64xxx 设计：一套很小的寄存器、一个中断驱动的状态机，没有 DMA。Linux 用 `i2c-mv64xxx` 驱动它们，使能字符设备之后，整条总线都能在 shell 里探测和操作。

板子上只使能了三个中的一个：`PB2`/`PB3` 上的 `i2c2`。设备树里那条总线上没有声明任何设备，所以它一开始是空的，留给这两个引脚上接的东西。本章讲寄存器布局和总线时序、设备树节点、探测路径，以及通过 `/dev/i2c-*` 跟总线打交道的 BusyBox 工具。

| 项目 | 内容 |
| --- | --- |
| 驱动 | `drivers/i2c/busses/i2c-mv64xxx.c` |
| Compatible | `allwinner,sun20i-d1-i2c`、`allwinner,sun8i-v536-i2c`、`allwinner,sun6i-a31-i2c` |
| 基地址 | `0x02502000`（TWI0）、`0x02502400`（TWI1）、`0x02502800`（TWI2） |
| 寄存器窗口 | 每个控制器 `0x400` 字节 |
| 中断 | PLIC 9、10、11 |
| 时钟 | `CLK_BUS_TWI0/1/2`，`apb1` 上的门控 |
| 复位 | `RST_BUS_TWI0/1/2` |
| Kconfig | `CONFIG_I2C`、`CONFIG_I2C_MV64XXX`、`CONFIG_I2C_CHARDEV` |
| 用户态 | `/dev/i2c-N`、`/sys/bus/i2c/devices`、`i2cdetect`、`i2cget`、`i2cset`、`i2cdump`、`i2ctransfer` |

## 总线的工作原理

SDA 和 SCL 都得上拉。`i2c2_pb2_pins` 组没有设置任何偏置，上拉是底板的事；没有上拉，线永远升不起来，每次传输都会超时失败。控制器输出是开漏的，自己并不提供上拉。

控制器在这里被当作只做主机的状态机使用。传输从把目标地址写进数据寄存器、在控制寄存器里置 START 开始；此后每一步——地址被应答、字节写完、字节读完——都会以中断形式报出，并附带一个说明线路上到底发生了什么的状态码。软件读状态、决定下一步动作、写下一个字节、清中断标志。没有 FIFO，也没有描述符引擎，所以一次传输就是一串中断，每个字节一到两次。

寄存器文件来自驱动里的 `mv64xxx_i2c_regs_sun4i`：

| 偏移 | 寄存器 | 用途 |
| --- | --- | --- |
| `0x00` | ADDR | 地址阶段的目标地址 |
| `0x04` | EXT_ADDR | 10 位目标的第二个地址字节 |
| `0x08` | DATA | 要发送的字节，或刚收到的字节 |
| `0x0c` | CONTROL | ACK、中断标志、STOP、START、总线使能、中断使能 |
| `0x10` | STATUS | 状态机对最近一次事件的编码 |
| `0x14` | CLOCK | 波特率因子：`M` 与 `N` |
| `0x18` | SOFT_RESET | 软件复位 |

要紧的控制位是 `ACK`（bit 2）、`IFLG`（bit 3）、`STOP`（bit 4）、`START`（bit 5）、`TWSIEN`（bit 6）和 `INTEN`（bit 7）。驱动把一份副本缓存为 `cntl_bits`，每一步都整体重写寄存器，而不是在中断处理里做读改写。

状态码就是 I²C 规范里的那些值，排查总线错误靠的就是它们：

| 码 | 含义 |
| --- | --- |
| `0x08` | 已发送 START |
| `0x10` | 已发送重复 START |
| `0x18` / `0x20` | 地址 + 写被应答 / 未被应答 |
| `0x28` / `0x30` | 数据字节已写，被应答 / 未被应答 |
| `0x38` | 仲裁丢失 |
| `0x40` / `0x48` | 地址 + 读被应答 / 未被应答 |
| `0x50` / `0x58` | 数据字节已读，已回 ACK / 已回 NACK |
| `0xd0` / `0xd8` | 第二地址字节（10 位目标）写，ACK / NACK |
| `0xe0` / `0xe8` | 第二地址字节读，ACK / NACK |
| `0xf8` | 没有相关状态 |

地址上的 NACK（`0x20` 或 `0x48`）正是扫描时发现某地址上没人的正常方式。写数据字节时的 NACK 表示目标拒绝了这一字节；驱动把这种情况变成 `write()` 或 ioctl 上的 I/O 错误。

### 总线时序

时钟寄存器里放的不是速率，而是两个因子 `M` 和 `N`，这个变体的硬件把输入时钟除以 `10 × (M + 1) × 2^N`。驱动的 `mv64xxx_calc_freq()` 实现的就是这个公式，`mv64xxx_find_baud_factors()` 在 `N` 从 0 到 7、`M` 从 0 到 15 里找不超过目标频率的最大值；`clk_n_base_0` 标志对 Allwinner 的 compatible 置位，让幂次是 `2^N` 而不是 `2^(N+1)`。

输入是经过按总线门控的 `apb1` 时钟。`apb1`（寄存器 `0x0524`）是一个分频加一个 mux，复位时父时钟是 `dcxo24M`，bootloader 把它留在复位设置上，所以控制器看到的是 24 MHz。以这个输入：

| 目标 | `N` | `M` | 实际 |
| --- | --- | --- | --- |
| 100 kHz | 1 | 11 | 24 MHz / (10 × 12 × 2) = 100 kHz |
| 400 kHz | 0 | 5 | 24 MHz / (10 × 6 × 1) = 400 kHz |

100 kHz 存在精确解，所以 `clock-frequency = <100000>` 就是准确的 100 kHz，`<400000>` 就是 400 kHz。因子凑不出来的值只会得到不超过目标的最近频率，绝不会偏高。搜索完成后这些位才写进 CLOCK；运行时不再调整，除了硬件自己做的时钟拉伸之外也没有额外支持。

适配器超时固定为一秒：`mv64xxx_of_config()` 设置 `drv_data->adapter.timeout = HZ`，注释里写明设备树没有对应属性。目标一直拉住 SDA 的传输因此大约一秒后失败，而不是把调用者永远挂住。驱动还有一条"原子"传输路径，供 I²C 核心在不能睡眠的上下文里发起传输时使用；它不用等待而是轮询，并在读 STATUS 之前加 100 ns 延时，因为控制器有时要等 IFLG 置位后才更新状态寄存器。

这个控制器不支持 Marvell 的卸载引擎。`offload_enabled` 只对 `marvell,mv78230-i2c` 置位，所以在 F101 上每条消息都走中断状态机。总线恢复在名义上是接好的（`mv64xxx_i2c_init_recovery_info()` 在设备有 pinctrl 时给适配器挂上 `bus_recovery_info`），但板子没有声明基于 GPIO 的恢复状态，通用的恢复流程没法用 GPIO 模拟 SCL。目标拉住 SDA 导致总线卡死时只能断电重来，ioctl 救不回来。

## 设备树

三个控制器除了地址和中断之外完全一样：

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

| 标签 | 节点 | 基地址 | PLIC | 板级状态 |
| --- | --- | --- | --- | --- |
| `i2c0` | `i2c@2502000` | `0x02502000` | 9 | 禁用 |
| `i2c1` | `i2c@2502400` | `0x02502400` | 10 | 禁用 |
| `i2c2` | `i2c@2502800` | `0x02502800` | 11 | 在 `PB2`/`PB3` 上使能 |

compatible 列表从最具体排到驱动真正匹配的兜底项。`of_device_is_compatible()` 对列表里任意一个字符串都返回真，所以正是 `allwinner,sun6i-a31-i2c` 这一项打开了 `clk_n_base_0` 的分频公式和反相的中断标志处理。从板级文件里删掉这个字符串会悄悄改变总线频率。

板级文件使能第二个控制器并接上引脚：

```text
&i2c2 {
	pinctrl-names = "default";
	pinctrl-0 = <&i2c2_pb2_pins>;
	status = "okay";
};
```

引脚组在 SoC 设备树里：

```text
i2c2_pb2_pins: i2c2-pb2-pins {
	pins = "PB2", "PB3";
	function = "twi2";
};
```

`PB2` 和 `PB3` 是板级文件唯一配置的 I²C 引脚。`i2c0` 和 `i2c1` 在 SoC 设备树里没有任何引脚组，要使能其中一个得先补一组；承载它们的引脚在树里也没有列出。

目标是从节点，`reg` 就是七位地址。板级设备树里目前没有这样的子节点，但形式是这样的：

```text
&i2c2 {
	eeprom@50 {
		compatible = "atmel,24c02";
		reg = <0x50>;
	};
};
```

绑定文件是 `Documentation/devicetree/bindings/i2c/marvell,mv64xxx-i2c.yaml`。它要求 `compatible`、`reg`、`interrupts` 和 `clocks`，允许 `clock-frequency`、`resets`、`#address-cells`/`#size-cells`，也说明了 `marvell,mv78230` 的卸载属性——这颗 SoC 用不上。

## Kconfig

```text
CONFIG_I2C=y
CONFIG_I2C_MV64XXX=y
CONFIG_I2C_CHARDEV=y
```

`CONFIG_I2C` 是核心，`i2c-dev` 接口由 `CONFIG_I2C_CHARDEV` 加上。`CONFIG_I2C_MV64XXX` 是总线驱动；它的 Kconfig 项依赖 `PLAT_ORION || ARCH_SUNXI || ARCH_MVEBU || COMPILE_TEST`，这里是靠 `ARCH_SUNXI` 满足的。板级 defconfig `arch/riscv/configs/sun252i_f101_yuzukineko_defconfig` 三项都设了，而 `CONFIG_I2C_SLAVE` *没有*设，所以这个构建里控制器只做主机。

工具来自 BusyBox，不是 i2c-tools 软件包。出厂 `.config` 里 `CONFIG_I2CGET`、`CONFIG_I2CSET`、`CONFIG_I2CDUMP`、`CONFIG_I2CDETECT` 和 `CONFIG_I2CTRANSFER` 全部使能，applet 装到 `/usr/sbin`。

## 驱动内部

### 探测路径

`drivers/i2c/busses/i2c-mv64xxx.c` 里的 `mv64xxx_i2c_probe()`：

1. 用 `devm_platform_ioremap_resource()` 映射寄存器窗口。
2. 取无名时钟作为总线时钟（`devm_clk_get(dev, NULL)`），再取可选的、名为 `"reg"` 的寄存器时钟。F101 的节点只有总线时钟。
3. 用 `platform_get_irq()` 取中断。
4. 调用 `mv64xxx_of_config()`：读 `clock-frequency`（默认 100 kHz），算 `M`/`N` 因子，取可选独占复位，设置一秒超时，按匹配的 compatible 复制寄存器偏移，并设置 Allwinner 的 quirk。
5. 调用 `mv64xxx_i2c_init_recovery_info()`，失败不致命。
6. 以一秒自动挂起延时使能运行时 PM，申请中断，并用 `i2c_add_numbered_adapter()` 注册适配器。

驱动里没有 DMA 通道，也没有每条传输的缓冲区：消息数组原地遍历，每个 `struct i2c_msg` 直接指向调用者的缓冲区。先写寄存器地址再读的组合访问写成两条消息，由状态机变成重复 START。

### 状态机

`mv64xxx_i2c_xfer()` 把 `atomic` 置 0 并调用 `mv64xxx_i2c_xfer_core()`，后者用 `mv64xxx_i2c_prepare_for_io()` 准备第一条消息，启动传输，然后在 `drv_data->waitq` 上等待。中断处理 `mv64xxx_i2c_intr()` 对状态码运行 `mv64xxx_i2c_fsm()`，再运行 `mv64xxx_i2c_do_action()`，由它写下一个字节、发 STOP 或开始下一条消息。最后一条消息完成，或者 NACK、仲裁丢失让传输中止时，处理函数把 `drv_data->block = 0` 并唤醒等待者，后者返回传输的消息数或负的 errno。

状态有 `WAITING_FOR_START_COND`、`WAITING_FOR_RESTART`、`WAITING_FOR_ADDR_1_ACK`、`WAITING_FOR_ADDR_2_ACK`、`WAITING_FOR_TARGET_ACK`、`WAITING_FOR_TARGET_DATA`；动作有 `SEND_RESTART`、`SEND_ADDR_1`、`SEND_ADDR_2`、`SEND_DATA`、`RCV_DATA`、`RCV_DATA_STOP`、`SEND_STOP`。读驱动里的这两个枚举，是弄清某次传输为什么停下最快的办法。

I²C 核心用适配器锁串行化同一条总线上的每次传输，所以驱动里的单个 `waitq`、`block` 标志和 `msgs` 指针同一时刻只会被一个调用者使用。第二个打开同一个 `/dev/i2c-N` 的进程在核心里等，不在驱动里等。一次传输期间整条总线都归它所有：两个进程的字节不会在同一条适配器上交错，但也没有东西阻止某个调用者用一次很长的组合传输占着总线，让其他人等着。

### 中断与标志位的特殊之处

只要控制寄存器显示 IFLG 置位，处理函数就继续循环。在 Allwinner 变体上，它清除标志的方式是把缓存的控制值连同 IFLG 一起写回，这就是 `irq_clear_inverted` 的含义；普通 mv64xxx 是反过来清的。它直到整个循环结束才放自旋锁，所以一连串状态机步骤在一次进入里处理完，不会重入。

如果控制器报了中断但状态寄存器还没跟上，原子路径会加上前面提到的 100 ns 延时。中断模式下不需要这样做，代码注释也说那里没观察到这个问题。

### 错误路径

缺时钟会让探测失败，并打印 `mv64xxx_of_config()` 的消息（"CLK is mandatory when using DT to describe the i2c bus"）。请求的频率没有任何 `M`/`N` 组合能产生时返回 `-EINVAL`；实际上从 24 MHz 出发，所有标准速率都能凑出来。地址上的 NACK 表现为 `-ENXIO`，也就是核心"没有这个目标"的错误；仲裁丢失会以状态机的错误结束传输；总线卡死则在一秒适配器超时后以 `-ETIMEDOUT` 失败。`i2cget` 打印错误并以非零状态退出。

### 运行时电源管理

驱动带自动挂起使能运行时 PM；`mv64xxx_i2c_runtime_suspend()` 断言复位并关掉两个时钟，resume 反过来做。寄存器状态没有单独保存——设备挂起时状态机一定是空闲的，下一次传输会重新初始化控制器。

## 用户态接口

有了 `CONFIG_I2C_CHARDEV`，每个注册的适配器都会得到一个字符设备。设备号是适配器号，而适配器号*不是*设备树标签。

### 到底是第几条总线？

这很重要，因为下面所有命令里的 `/dev/i2c-N` 用的就是这个号。`mv64xxx_i2c_probe()` 设置 `adapter.nr = pd->id`，也就是平台设备 id。由设备树节点创建、又没有 `i2cN` alias 的平台设备 id 是 -1，于是 `i2c_add_numbered_adapter()` 落到 `i2c_add_adapter()`，后者问 `of_alias_get_id(dev->of_node, "i2c")`，拿到的还是 -1，就用第一个空闲总线号注册适配器。

F101 的设备树没有声明任何 `i2cN` alias，而出厂板只使能了 `i2c2`。因此第一个、也是唯一一个适配器注册成 0 号总线，而不是 2 号。`i2c2` 是设备树标签，不是总线号。要固定号数，加 alias：

```text
aliases {
	i2c0 = &i2c0;
	i2c1 = &i2c1;
	i2c2 = &i2c2;
};
```

这样适配器就会注册到请求的号上，`/dev/i2c-2` 也就像标签暗示的那样存在了。没有 alias 时，永远问一下总线叫什么，不要假设。

| 路径 | 含义 |
| --- | --- |
| `/dev/i2c-N` | 每个注册适配器一个字符设备 |
| `/sys/class/i2c-dev/i2c-N/name` | 适配器名，`mv64xxx_i2c adapter` |
| `/sys/bus/i2c/devices/` | 客户端，外加每个适配器一个 `i2c-N` 项 |
| `/sys/bus/i2c/devices/i2c-N/new_device` | 请求核心从用户态实例化一个客户端 |

关于 `I2C_SLAVE` 有一个实用细节：核心会拒绝已经有驱动绑定的地址，因为两个主机操作同一个客户端会打架。所以 `i2cget`、`i2cset` 和 `i2cdump` 不加 `-f` 时会打印错误。`-f` 对应 `I2C_SLAVE_FORCE`，只应该用在该地址没有内核驱动的总线上——对一条空着的板载总线来说这是常态。

工具用的就是 `i2c-dev` 接口。相关 ioctl 有 `I2C_SLAVE`（给普通 `read()`/`write()` 设定目标地址）、`I2C_RDWR`（工具使用的组合传输）、`I2C_FUNCS`（`i2cdetect -F` 背后的能力字）、`I2C_SMBUS` 和 `I2C_TENBIT`。`I2C_SLAVE_FORCE` 绕过"地址已被占用"的检查，就是工具里 `-f` 选中的那个。

## 工作示例

### 示例 1：找到总线并扫描

```sh
i2cdetect -l
i2cdetect -y 0
```

出厂板上的代表性输出，`PB2`/`PB3` 上没有接任何东西：

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

第一行来自 `i2cdetect -l`，它列出 `/sys/class/i2c-dev/*` 并打印适配器名和算法。表是扫描结果：0x00-0x02 和 0x78-0x7f 在默认范围之外，打印为空白；`--` 表示没有 ACK；有应答的地址会打印自己的编号。默认的 `auto` 模式对大多数地址用 SMBus quick 写，对 0x30-0x37 和 0x50-0x5f 用读字节探测；`-q` 强制 quick 写，`-r` 强制读字节探测，`-a` 把范围扩大到 0x00-0x7f。BusyBox 的源码提醒 quick 写已知会损坏 Atmel AT24RF08 EEPROM，读字节探测则可能锁住某些 SMBus 时钟芯片；面对未知总线时，把扫描范围缩到能容纳该设备的最小范围，例如 `i2cdetect -y 0 0x48 0x4f`。

### 示例 2：适配器能做什么

```sh
i2cdetect -F 0
```

代表性输出：

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

这来自 `mv64xxx_i2c_functionality()`，它返回 `I2C_FUNC_I2C | I2C_FUNC_10BIT_ADDR | I2C_FUNC_SMBUS_EMUL`。`SMBUS_EMUL` 包含块写和 I²C 块位，但不包含读块和块过程调用，所以那两行是 no。PEC 被声明为支持，尽管控制器不在硬件里计算它；由核心模拟。

### 示例 3：读写寄存器

假设 `0x50` 上有个目标，寄存器 `0x00` 可读，读操作是两条消息——写寄存器地址、重复 START、读一个字节：

```sh
i2ctransfer -y 0 w1@0x50 0x00 r1
i2cget -y 0 0x50 0x00
i2cset -y 0 0x50 0x00 0x5a
i2cdump -y 0 0x50
```

`i2ctransfer` 把读到的字节按 `0xNN` 用空格分开打印；`i2cget` 用同样的形式打印单个值。`i2cset` 写入，带 `-r` 时还会读回比较。`i2cdump` 打印目标寄存器的 16 乘 16 表格。具体输出完全取决于设备；适配器提供的是传输形式，不是数据。目标不应答时，这些命令都会以 `read failed: Remote I/O error` 或 `write failed: Remote I/O error` 和一的状态退出，而不是打印一个值。

### 示例 4：一个最小的 i2c-dev 程序

ioctl 接口小到可以直接用。下面这个程序用一次组合传输读取 `0x50` 目标寄存器 `0x00`：

```c
/* i2c-rd.c：从 0x50 目标的寄存器 0x00 读一个字节 */
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

用板级工具链构建，再像其他测试程序一样送过去：

```sh
build-rv32/host/bin/riscv32-buildroot-linux-musl-gcc -static -o i2c-rd i2c-rd.c
```

`I2C_RDWR` ioctl 把两条消息当成一次事务，中间是重复 START，所以目标看到寄存器写和读是同一次总线操作，中间不释放 SDA。这和 `i2ctransfer -y 0 w1@0x50 0x00 r1` 产生的序列一样。

## 限制

| 限制 | 说明 |
| --- | --- |
| 只有一条总线使能 | 只有 `i2c2` 是 `okay`；`i2c0` 和 `i2c1` 没有引脚组 |
| 只做主机 | 控制器硬件可以做目标，但 `CONFIG_I2C_SLAVE` 没开，驱动也没有实现目标模式 |
| 没有卸载引擎 | Marvell 的事务发生器只用于 `marvell,mv78230-i2c`；这颗 SoC 走中断状态机 |
| 总线恢复不可用 | 恢复了信息是挂上了，但板子没有 GPIO 恢复状态，卡死时没法用 GPIO 模拟 |
| 一秒超时 | 驱动里写死，没有对应的设备树属性 |
| 总线号是动态的 | 没有 `i2cN` alias 时适配器号是第一个空闲号，不是标签里的号 |
| 没有硬件 PEC | PEC 由 I²C 核心模拟，不是控制器生成的 |

## 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Error: Could not open file '/dev/i2c-2'` | 没有 alias，适配器注册成了 0 号总线 | 用 `i2cdetect -l` 看实际号，或者把 `i2c2 = &i2c2;` 加进 aliases |
| `i2cdetect` 显示的地址全是 `--` | 总线上没东西，或者 SDA/SCL 没接好 | 检查 `PB2`/`PB3` 的接线，确认 `&i2c2` 是 `okay` |
| 每次访问都返回 `Remote I/O error` | 目标地址不对，或者设备没供电 | 核对七位地址和供电 |
| 传输大约一秒后失败 | 有目标拉住 SDA，或时钟拉伸一直不结束 | 给目标断电重启；这里没有总线恢复 |
| 总线频率不对 | `compatible` 里的 `allwinner,sun6i-a31-i2c` 兜底项被删了 | 恢复完整的 compatible 列表 |
| `/dev/i2c-0` 存在但没有设备应答 | 这就是板载总线空着的正常状态 | 给 `PB2`/`PB3` 接设备，或者用有设备的总线 |
| `i2cdetect` 提示 "bus doesn't support SMBus quick write" | 该适配器缺少对应的功能位 | 用 `-r` 做读字节探测 |

## 相关页面

- [Linux 开发](../index.md)：内核配置和启动链。
- [引脚复用与 GPIO](pinctrl-gpio.md)：`PB2`/`PB3` 引脚组。
- [UART - 串口](uart.md)：板上的另一种两线外设。
- [常用命令](../apps/linux-commands.md)：板子上能用的 shell 命令，包括这里用到的工具。
