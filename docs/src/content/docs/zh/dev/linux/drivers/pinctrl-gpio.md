---
title: "PINCTRL - 引脚复用与 GPIO"
---

F101 的每个引脚都能承担多种功能之一。pinctrl 驱动保存引脚描述、复用表以及上下拉和驱动强度设置，同时也为同一批引脚注册 GPIO 控制器，因此内核驱动可以把引脚当作输入或输出使用。整个控制器是 `0x02000000` 处的一个设备，有六个 bank 和六条外部中断线。

| 项目 | 内容 |
| --- | --- |
| 驱动 | `drivers/pinctrl/sunxi/pinctrl-sun252i-f101.c` |
| 兼容字符串 | `allwinner,sun252i-f101-pinctrl` |
| 基址 | `0x02000000`，0x500 字节 |
| 引脚 | A 到 F 六个 bank，共 59 个引脚 |
| 中断 | PLIC 67、69、71、73、75、77，每 bank 一条 |
| Kconfig | 驱动由 `CONFIG_ARCH_SUNXI` 选择；核心 `CONFIG_PINCTRL_SUNXI`、`CONFIG_GPIOLIB`、`CONFIG_GPIO_CDEV` |
| 用户接口 | `/sys/kernel/debug/pinctrl/2000000.pinctrl/`、`/sys/kernel/debug/gpio`、`/dev/gpiochip0` |

## 硬件

### Bank 与引脚编号

控制器把端口叫 bank，并在 bank 内给每个引脚编号。Linux 使用全局 GPIO 编号：bank A 从 0 开始，bank B 从 32 开始，bank C 从 64 开始，依此类推，每个 bank 保留 32 个编号，即使 bank 没有排满。

| Bank | 引脚 | 首个 Linux GPIO | PLIC 中断 | 说明 |
| --- | --- | --- | --- | --- |
| A | `PA0` 到 `PA3` | 0 | 67 | 触摸面板和 PWM 备选 |
| B | `PB0` 到 `PB3` | 32 | 69 | 控制台 UART 和 I2C |
| C | `PC0` 到 `PC5` | 64 | 71 | SPI、SPIF 和 SD 共用焊盘 |
| D | `PD0` 到 `PD22` | 96 | 73 | LCD、DSI、SPI1 和 PWM |
| E | `PE0` 到 `PE14` | 128 | 75 | UART、I2S 和 PWM 备选 |
| F | `PF0` 到 `PF6` | 160 | 77 | microSD 和卡检测 |

最后一个引脚是 `PF6`，编号 166。GPIO 芯片覆盖从 0 开始的 `round_up(166, 32)` = 192 个线号，所以 `/dev/gpiochip0` 报告 192 条线，尽管只有 59 个引脚有描述。未使用的编号是空洞：它们没有对应引脚，任何请求都会失败。

### 寄存器布局

F101 使用较新的 Allwinner 寄存器布局，驱动用 `SUNXI_PINCTRL_NEW_REG_LAYOUT` 选择它。每个 bank 占 0x30 字节。复用、数据、驱动电平和上下拉寄存器按引脚排列；外部中断块是全局的。

| 偏移 | 寄存器 | 字段 |
| --- | --- | --- |
| bank + `0x00` | Pn_CFG0..3 | 每引脚 4 位，每个 32 位字 8 个引脚 |
| bank + `0x10` | Pn_DATA | 每引脚 1 位，可读可写 |
| bank + `0x14` | Pn_DRV0..3 | 每引脚 4 位，驱动电平 |
| bank + `0x24` | Pn_PULL0..1 | 每引脚 2 位，上下拉设置 |
| `0x200` | Pn_EINT_CFG | 每个 EINT 源 4 位，每字 8 个源 |
| `0x210` | Pn_EINT_CTL | 每个 EINT 源 1 位，使能 |
| `0x214` | Pn_EINT_STATUS | 每个 EINT 源 1 位，挂起 |
| `0x218` | Pn_EINT_DEB | 每 bank 的去抖分频 |
| `0x300` | Pn_GRP_CONFIG | 组配置 |
| `0x340` | PIO_POW_MOD_SEL | 偏置电源模式选择 |

A 到 F 的 bank 基址分别是 `0x02000000`、`0x02000030`、`0x02000060`、`0x02000090`、`0x020000c0`、`0x020000f0`。在 bank 内，引脚 `n` 使用 `n / 8 * 4` 处复用字的 bits `4n` 到 `4n+3`，所以 `PB0` 是 `0x02000030` 的低四位，`PB1` 是同一个字的 bits 7:4。

偏移 0x500 的扩展 bank K 不使用：控制器只描述六个 bank，所以通用驱动里的 `PIO_BANK_K_OFFSET` 路径永远不会走到。窗口是 0x500 字节，因为 0x200 的 EINT 块和 0x300 的组与偏置寄存器与六个 bank 共用这个窗口。

### 引脚功能

每个引脚的复用值 0 是 `gpio_in`，1 是 `gpio_out`。值 0xe 是外部中断功能，0xf 是 `io_disabled`。中间的值是引脚的复用功能，按数据手册的编号顺序排列；驱动按数字顺序列出它们，devicetree 用字符串指定其中一个。

| 功能值 | 名称 | 可用引脚 |
| --- | --- | --- |
| 0 | `gpio_in` | 每个引脚 |
| 1 | `gpio_out` | 每个引脚 |
| 0xe | `irq` | 每个引脚，映射到所属 bank 的 EINT |
| 0xf | `io_disabled` | 每个引脚 |
| 2 到 0xd | 外设名称 | 取决于引脚 |

功能名在引脚之间共享。例如 `uart1` 出现在 `PB0`、`PB1`、`PD2`、`PD3`、`PD10`、`PD11`、`PD21`、`PD22`、`PE10`、`PE11`、`PF0`、`PF4`、`PF5` 和 `PF6` 上；写 `function = "uart1"` 选中的是该引脚为这个功能使用的复用值，而不是一个全局值。这就是引脚组必须列出实际使用的引脚的原因。

### 外部中断

每个 bank 有一条 PLIC 线，最多 32 个 EINT 源。驱动建立 `irq_banks * IRQ_PER_BANK` = 192 个映射的 `irq_domain`。GPIO 通过引脚描述转换成中断：`irq` 功能携带 `(bank, pin)`，`to_irq` 返回 `irq_find_mapping(domain, bank * 32 + pin)`。中断被路由到该 bank 的 PLIC 线，所以同一 bank 的多个引脚共用一个 PLIC 中断，由状态寄存器分流。

pinctrl 中断的 devicetree 中断说明符是三个 cell：bank、pin 和标志。`interrupts-extended = <&pio 5 6 IRQ_TYPE_EDGE_FALLING>` 表示 `PF6` 下降沿。去抖分频按 bank 设置，来自 `input-debounce` 属性，每 bank 一个值；F101 的 devicetree 没有设置它，所以六个 bank 都使用复位分频。

### 上下拉与驱动强度

上下拉字段是两位：0 是不上下拉，1 是弱上拉，2 是弱下拉。驱动接受通用的 `bias-pull-up`、`bias-pull-down`、`bias-disable` 属性和旧的 `allwinner,pull` 值。这个 SoC 没有可选的偏置电压；描述符把偏置电压 variant 留在默认值，所以 `0x300` 处的组配置寄存器不用于这个目的。

驱动字段是四位，但绑定用毫安表示。解析器拒绝小于 10 的值，把大于 40 的值截到 40，并向下取整到 10 的倍数。寄存器值是 `mA / 10 - 1`，回读路径返回 `(value + 1) * 10`，所以 10 mA 是字段 0，20 mA 是 1，30 mA 是 2，40 mA 是 3。板子在 DSI 线上用 30 mA，在 SD 卡线上用 40 mA 并加上拉。

## Devicetree

### SoC 节点

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

六个中断项按 bank 排序。驱动对索引 0 到 5 调用 `platform_get_irq()`，并为每个注册 chained 处理函数。时钟是 APB0 门控；节点只有一个时钟，所以驱动用不带名字的 `devm_clk_get_enabled()` 获取。

### 引脚组

SoC devicetree 声明了十四个组。只有一部分被启用的板级节点引用，其余留给自定义板级文件使用。

| 组 | 引脚 | 功能 | 使用者 |
| --- | --- | --- | --- |
| `uart0_pe_pins` | `PE0`、`PE1` | `uart0` | 未启用，UART0 是 disabled |
| `pwm0_pe2_pins` | `PE2` | `pwm0_0` | 未使用 |
| `pwm0_pe3_pins` | `PE3` | `pwm0_1` | 未使用 |
| `pwm0_pe4_pins` | `PE4` | `pwm0_2` | 未使用 |
| `pwm0_pe5_pins` | `PE5` | `pwm0_3` | 未使用 |
| `uart1_pb_pins` | `PB0`、`PB1` | `uart1` | 控制台 |
| `i2c2_pb2_pins` | `PB2`、`PB3` | `twi2` | I2C 总线 |
| `spi0_pc_pins` | `PC0` 到 `PC5` | `spi0` | SPI 控制器上的 NOR flash |
| `dsi_pd_pins` | `PD12` 到 `PD21` | `dsi` | MIPI DSI lane，30 mA |
| `pwm0_pd22_pin` | `PD22` | `pwm0_2` | 显示背光 |
| `spif0_pc_pins` | `PC0` 到 `PC5` | `spif0` | SPIF 变体上的 NOR flash |
| `spi1_pd_pins` | `PD0` 到 `PD3` | `spi1` | 未使用，SPI1 是 disabled |
| `sdc0_pf_pins` | `PF0` 到 `PF5` | `sdc0` | microSD，40 mA，上拉 |
| `sdc2_pc_pins` | `PC0` 到 `PC5` | `sdc2` | 未使用，SMHC2 是 disabled |

SPI 控制器、SPIF 控制器和 SMHC2 控制器共用 `PC0` 到 `PC5` 焊盘，所以同一时间只能接出其中一个。板级文件选择通用 SPI 控制器。SPIF 的 devicetree 变体把该组换成同一批焊盘上的 `spif0_pc_pins`。

驱动强度和偏置是组的一部分。SD 卡和 DSI 组展示了两种写法：

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

### 板级使用者

板级文件把组接到它启用的外设上，并把卡检测线当作 GPIO 而不是 SD 引脚组的一部分：

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

`<&pio 5 6 GPIO_ACTIVE_LOW>` 是三 cell 的 GPIO 形式：bank 5 是 F，pin 6 是 `PF6`，标志表示低有效。DSI 子节点里的面板复位线用同样的形式：`<&pio 3 9 GPIO_ACTIVE_LOW>` 是 `PD9`。

| 绑定 | 范围 |
| --- | --- |
| `Documentation/devicetree/bindings/pinctrl/allwinner,sun4i-a10-pinctrl.yaml` | 通用 Allwinner pinctrl 节点；本树的枚举没有列出 F101 兼容字符串 |
| `include/dt-bindings/pinctrl/sun4i-a10.h` | 旧 `allwinner,pull` 绑定的上下拉值 |
| `include/dt-bindings/gpio/gpio.h` | `GPIO_ACTIVE_LOW` 等标志 |

## Kconfig

```text
CONFIG_ARCH_SUNXI=y
CONFIG_PINCTRL=y
CONFIG_PINCTRL_SUNXI=y
CONFIG_GPIOLIB=y
CONFIG_GPIO_CDEV=y
# CONFIG_GPIO_SYSFS is not set
```

F101 驱动没有自己的 Kconfig 符号：`drivers/pinctrl/sunxi/Makefile` 用 `obj-$(CONFIG_ARCH_SUNXI)` 编译 `pinctrl-sun252i-f101.o`。`CONFIG_PINCTRL_SUNXI` 和 `CONFIG_PINCTRL` 由 `arch/riscv/Kconfig.socs` 里的 `ARCH_SUNXI` select，所以支持该板的内核一定带这个控制器。`CONFIG_GPIO_CDEV` 默认 `y`，提供 `/dev/gpiochip0`；`CONFIG_GPIO_SYSFS` 关闭，所以没有 `/sys/class/gpio`。

## 驱动内部

### probe 与状态

`sun252i_f101_pinctrl_probe()` 用 `SUNXI_PINCTRL_NEW_REG_LAYOUT` 调用 `sunxi_pinctrl_init_with_flags()`。该标志把 bank 跨度改成 `D1_BANK_MEM_SIZE` 0x30，把上下拉寄存器偏移改成 0x24，把驱动电平字段宽度改成 4 位。旧布局会使用 0x24 字节的 bank、0x1c 处的上下拉和 2 位驱动字段。

`sunxi_pinctrl_init_with_flags()` 映射窗口，建立 pinctrl 状态，注册 GPIO 芯片、引脚范围、时钟、六个 chained 中断处理函数和 192 项的线性 irq domain。然后它在注册处理函数之前屏蔽并清除每个 EINT。

### 引脚组与功能

驱动为每个引脚声明一个 `sunxi_desc_pin`，功能列表按数字顺序排列。状态构建器把每个引脚变成同名的 pinctrl 组（`PA0`、`PB0` 等），为每个不同的功能名增加一个功能项，并记录每个功能对应的组列表。pinmux 操作是 strict 的，两个设备不能通过两个不同的组同时申请同一个引脚。

devicetree 解析器先读通用的 `pins` 和 `function` 属性，再回退到 `allwinner,pins` 和 `allwinner,function`。它读取 `drive-strength` 或 `allwinner,drive`，以及 `bias-pull-up`、`bias-pull-down`、`bias-disable` 或 `allwinner,pull`。打包后的配置在 map 激活时应用到整个组。

### GPIO 控制器

整个控制器只有一个 `gpio_chip`。它的 label 是设备名 `2000000.pinctrl`，base 是 0，`ngpio` 是 192。每个引脚被加成一个单引脚 GPIO range，这样引脚控制器和 GPIO 编号保持一致。芯片不按 bank 拆分；一个 range 让全局编号在各 bank 之间保持稳定。

GPIO 方向不是单独的寄存器。`direction_input` 把引脚复用设为 `gpio_in`，`direction_output` 设为 `gpio_out`，`get`/`set` 读写数据寄存器。`of_xlate` 接受三 cell 形式：bank、pin、标志。`to_irq` 找到引脚的 `irq` 功能，并把它的 bank 和 pin 编号映射到 domain。

### 中断控制器

当使用者向引脚控制器申请中断时，驱动会把引脚复用切到 `irq` 功能（如果还没切换），把请求的类型写进 EINT 配置寄存器，并在控制寄存器里使能对应位。chained 处理函数读该 bank 的状态寄存器，找出挂起位，再分发对应的虚拟中断。去抖分频来自 `input-debounce`；F101 的 devicetree 没有设置它，所以使用复位值。

## 用户接口

### debugfs 文件

挂载 debugfs 后会出现引脚控制器目录：

```sh
mkdir -p /sys/kernel/debug
mount -t debugfs none /sys/kernel/debug
ls /sys/kernel/debug/pinctrl/2000000.pinctrl/
```

| 文件 | 内容 |
| --- | --- |
| `pins` | 已注册引脚数和每个引脚及其 GPIO range 的一行 |
| `pinmux-pins` | 每个引脚归哪个设备或 GPIO，以及当前功能和组 |
| `pingroups` | 组名，每组一行 |
| `pinmux-functions` | 功能名和实现它的组 |
| `pinconf-pins` | 每引脚的驱动强度和偏置 |
| `pinconf-groups` | 同样的设置按组显示 |
| `gpio-ranges` | 引脚控制器与 GPIO 芯片之间的映射 |
| `pinmux-select` | 只写的调试覆盖接口：写 `group function` 直接改复用 |

`CONFIG_GPIO_CDEV` 还提供 `/dev/gpiochip0`。镜像里没有 `gpioinfo` 或 `gpioget`，也没有 libgpiod，并且 `CONFIG_GPIO_SYSFS` 关闭，所以字符设备只能由自己发 GPIO ioctl 的程序使用。唯一的运行时复用控制是 root 可写的 `pinmux-select` 文件；它绕过 pinctrl 状态，也不认领引脚，所以只是调试手段，不是受支持的接口。

### GPIO debugfs

`/sys/kernel/debug/gpio` 列出每个芯片上已申请和有名字的线。它是 shell 里唯一能看 GPIO 值的地方：

```sh
cat /sys/kernel/debug/gpio
```

## 示例

### 读取引脚复用

```sh
cat /sys/kernel/debug/pinctrl/2000000.pinctrl/pinmux-pins
```

下面是板子的一段代表性输出，省略了未变化的行：

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

带 `UNCLAIMED` 的行表示没有驱动申请该引脚。带 `GPIO cd` 的行表示 mmc core 把该引脚当作 GPIO 申请；`cd` 标签来自 `cd-gpios` 的使用者名。带设备、功能和组的行表示引脚被某个 pinctrl map 复用。

### 对比引脚与复用寄存器

```sh
cat /sys/kernel/debug/pinctrl/2000000.pinctrl/pins
devmem 0x02000030
```

`0x02000030` 的低四位是 `PB0` 的复用值。控制台活动时它应该是 4，即该引脚的 `uart1` 功能。`pins` 文件确认每个引脚的全局 GPIO 编号：

```text
registered pins: 59
pin 0 (PA0) 0:2000000.pinctrl
pin 1 (PA1) 1:2000000.pinctrl
...
pin 32 (PB0) 32:2000000.pinctrl
...
pin 166 (PF6) 166:2000000.pinctrl
```

### 调试时修改复用

`pinmux-select` 文件接受 root 写入的 `group function`。例如，下面这行把 `PB0` 设成 `uart1`，不经过 pinctrl 状态：

```sh
echo "PB0 uart1" > /sys/kernel/debug/pinctrl/2000000.pinctrl/pinmux-select
```

这次写入不认领引脚，也不会记录进 `pinmux-pins`；下一次 pinctrl 状态激活、驱动重新绑定或重启都会覆盖它。这样改控制台引脚可能切断唯一的控制台，所以只在不影响恢复的引脚上使用。

### 读取卡检测线

`PF6` 由 mmc core 作为低有效输入申请。GPIO debugfs 视图显示它当前的电平：

```sh
cat /sys/kernel/debug/gpio
```

插卡时的一行代表性输出：

```text
 gpio-166 (                    |cd                  ) in  hi ACTIVE LOW
```

拔卡后 `hi` 变成 `lo`。如果电平从不变化，说明引脚组、上拉或 `GPIO_ACTIVE_LOW` 标志有问题。

### 启用一个未使用的 UART

SoC 文件已经声明了 `PE0` 和 `PE1` 上的 `uart0_pe_pins`，但 UART0 是 disabled。启用它只需要板级节点：

```text
&uart0 {
	pinctrl-names = "default";
	pinctrl-0 = <&uart0_pe_pins>;
	status = "okay";
};
```

重建 DTB 后，`/dev/ttyS0` 就会出现，引脚在 `pinmux-pins` 里显示 `function uart0 group uart0_pe_pins`。同样的模式适用于 `spi1_pd_pins` 和 `sdc2_pc_pins`，前提是共用焊盘空闲。

## 限制与排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 某个引脚显示 `UNCLAIMED` | 它的使用者被禁用，或没有 `pinctrl-0` | 启用节点并接上组 |
| `dmesg` 里出现 `could not request pin` | strict 模式，两个组申请同一个引脚，通常是 `PC0` 到 `PC5` | 只启用 SPI0、SPIF 和 SMHC2 中的一个 |
| UART1 没有输出 | `PB0` 和 `PB1` 没有复用成 `uart1` | 检查 `pinmux-pins` 和 `uart1` 的 `pinctrl-0` |
| SD 卡始终检测不到 | `PF6` 不是低有效、没有上拉，或组缺失 | 检查 `cd-gpios`、`bias-pull-up` 和 GPIO debugfs 电平 |
| 找不到 `gpioinfo` 或 `gpioget` | 镜像没有 libgpiod | 用 debugfs，或自己针对 `/dev/gpiochip0` 写程序 |
| `/sys/class/gpio` 不存在 | `CONFIG_GPIO_SYSFS` 关闭 | 用字符设备或 debugfs |
| EINT 从不触发 | 引脚没有复用成 `irq`，或类型不对 | 检查中断说明符和 `pinmux-pins` |
| `drive-strength = <5>` 被拒绝 | 小于 10 mA 的值无效 | 用 10、20、30 或 40 |
| 重启后引脚功能又变回去 | `pinmux-select` 是调试覆盖，不会持久化 | 在 devicetree 里设置组并重建 |
| `devmem` 看到意外的复用值 | 另一个使用者占着引脚 | 在 `pinmux-pins` 里找该设备 |

这个驱动里控制器没有唤醒或电源域控制。suspend 和 resume 没有接到它，引脚状态保持最后一个使用者设置的样子。

一个组可以混合不同 bank 的引脚。生成的功能表不关心 bank，只关心每个引脚为该功能使用的复用值。

`pins` 文件列出全部 59 个引脚，而 GPIO 芯片有 192 条线。没有对应引脚的线号会被芯片报告，但申请时失败。

## 相关链接

控制台引脚组见 [UART](uart.md)，`PB2` 和 `PB3` 组见 [I2C](i2c.md)，`PF0` 到 `PF6` 见 [microSD](mmc.md)，驱动控制器的 APB0 门控见 [CCU](clock.md)。[Linux 介绍](../index.md)列出其他驱动，[预编译镜像](../linux-prebuilt.md)说明 devicetree 怎么重建进镜像。
