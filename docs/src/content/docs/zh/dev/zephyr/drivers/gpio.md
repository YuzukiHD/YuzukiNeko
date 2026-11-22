---
title: "GPIO"
---

F101 的 GPIO 和引脚复用（pinctrl）在同一个 PIO 模块里：6 个 bank（PA…PF），每个 bank 32 根线，每个 bank 一个中断。Zephyr 里把每个 bank 做成一个 GPIO 设备（`gpioa`…`gpiof`），接口是标准的 `<zephyr/drivers/gpio.h>`，驱动是 `drivers/gpio/gpio_sunxi.c`。

| 项目 | 内容 |
| --- | --- |
| 设备 | `gpioa`、`gpiob`、`gpioc`、`gpiod`、`gpioe`、`gpiof`，每个 bank 32 个引脚 |
| 方向 | 输入、输出，可选内部上拉或下拉 |
| 中断 | 上升沿、下降沿、双沿、高电平、低电平 |
| 不支持 | 开漏、开源输出（`-ENOTSUP`），`gpio_pin_get_config` |

## 设备树

GPIO 涉及三个文件，从下到上依次是：

| 文件 | 作用 |
| --- | --- |
| `dts/bindings/gpio/allwinner,sunxi-gpio.yaml` | 绑定：规定 `allwinner,sunxi-gpio` 节点的属性 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 设备树：6 个 bank 的节点，默认都是 `okay` |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | 板级设备树：用 `gpio-leds`、`cd-gpios` 这类属性引用具体的引脚 |

### SoC 设备树：sun252i_f101.dtsi

下面是 PB bank 的节点，其余 5 个 bank 只有寄存器地址、`allwinner,bank` 和中断号不同：

```c
gpiob: gpio@2000030 {
	/* 匹配驱动 gpio_sunxi.c 里的 DT_DRV_COMPAT allwinner_sunxi_gpio */
	compatible = "allwinner,sunxi-gpio";

	/* 这个 bank 的寄存器：基址 0x02000030，长度 0x30 */
	reg = <0x02000030 0x30>;

	/* PIO 寄存器布局类型。F1xx 系列用类型 0：bank 间隔 0x30 字节，中断寄存器在 0x200 之后 */
	allwinner,pio-hw-type = <ALLWINNER_PIO_HW_TYPE0>;

	/* bank 号：PA = 0，PB = 1，……，PF = 5。驱动靠它算出这个 bank 的中断寄存器位置 */
	allwinner,bank = <1>;

	/* 这是一个 GPIO 控制器，引用它的 gpios 属性有 2 个格子：引脚号、标志 */
	gpio-controller;
	#gpio-cells = <2>;

	/* 引脚个数 */
	ngpios = <32>;

	/* 这个 bank 的中断：PLIC 的 69 号，优先级 1 */
	interrupts = <69 1>;
	interrupt-parent = <&plic>;

	status = "okay";
};
```

六个 bank 的差别：

| 节点 | 标签 | 寄存器 | `allwinner,bank` | PLIC 中断号 |
| --- | --- | --- | --- | --- |
| `gpio@2000000` | `gpioa` | `0x02000000` | 0 | 67 |
| `gpio@2000030` | `gpiob` | `0x02000030` | 1 | 69 |
| `gpio@2000060` | `gpioc` | `0x02000060` | 2 | 71 |
| `gpio@2000090` | `gpiod` | `0x02000090` | 3 | 73 |
| `gpio@20000c0` | `gpioe` | `0x020000c0` | 4 | 75 |
| `gpio@20000f0` | `gpiof` | `0x020000f0` | 5 | 77 |

### 板级设备树：yuzukineko.dts

板级文件用 GPIO 的地方有两处。一处是 LED，另一处是 TF 卡的插卡检测：

```c
/ {
	aliases {
		/* 应用里用 DT_ALIAS(led0) 取到 LED */
		led0 = &led0;
	};

	leds {
		compatible = "gpio-leds";

		led0: led_0 {
			/* &gpiod：PD bank；5：第 5 根线，即 PD5；高电平点亮 */
			gpios = <&gpiod 5 GPIO_ACTIVE_HIGH>;
		};
	};
};

&smhc0 {
	/* PF6 是 TF 卡插卡检测，低电平表示有卡，所以是 GPIO_ACTIVE_LOW */
	cd-gpios = <&gpiof 6 GPIO_ACTIVE_LOW>;
};
```

`gpios = <&gpiod 5 GPIO_ACTIVE_HIGH>` 里 `&gpiod` 后面的两个数就是 `#gpio-cells = <2>` 规定的“引脚号”和“标志”。标志可以用的位在 `include/zephyr/dt-bindings/gpio/gpio.h`：`GPIO_ACTIVE_LOW`、`GPIO_PULL_UP`、`GPIO_PULL_DOWN` 等。

### 引脚复用：pinctrl

引脚不用作普通 GPIO，而是给外设用时，由 pinctrl 设定功能。`yuzukineko.dts` 里每个外设都有一组 `pinctrl-0`：

```c
&pio {
	/* UART1 控制台：PB00 是 TX，PB01 是 RX，复用功能 4 */
	uart1_pins: uart1_pins {
		uart1_tx_rx {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 0, 4)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 1, 4)>;
		};
	};
};

&uart1 {
	pinctrl-0 = <&uart1_pins>;
	pinctrl-names = "default";
};
```

`ALLWINNER_PINMUX(bank, 引脚号, 复用功能)` 的复用功能：0 是输入，1 是输出，2…15 是外设功能，14 是外部中断。每个引脚各功能是什么，见[引脚复用表](../../../hardware/mux.md)。可以写在同一个组里的属性：

| 属性 | 含义 |
| --- | --- |
| `pinmux` | 引脚和复用功能，每个格子一个引脚 |
| `bias-pull-up` | 打开内部上拉 |
| `bias-pull-down` | 打开内部下拉 |
| `bias-disable` | 关闭上下拉 |
| `allwinner,drive-level` | 驱动能力，0…3，不写就保持复位值 |

### 绑定：allwinner,sunxi-gpio.yaml

```yaml
# Copyright (c) 2026 Yuzuki Tsuru
# SPDX-License-Identifier: Apache-2.0

description: |
  Allwinner sunxi PIO GPIO controller.

  Each DT gpio node covers one PIO bank (PA..PF), identified by the
  'allwinner,bank' property. The 'allwinner,pio-hw-type' property selects
  the PIO register layout used by the driver (see
  include/zephyr/drivers/pinctrl/pinctrl_sunxi.h). Bank interrupts are
  exposed as interrupt specifiers.

compatible: "allwinner,sunxi-gpio"

include: [gpio-controller.yaml, base.yaml]

properties:
  reg:
    required: true

  interrupts:
    required: true

  allwinner,pio-hw-type:
    required: true
    type: int
    description: |
      PIO hardware layout type. See
      include/zephyr/drivers/pinctrl/pinctrl_sunxi.h for the register
      layout description of each type.

  allwinner,bank:
    required: true
    type: int
    description: |
      PIO bank number of this controller (PA = 0, PB = 1, ...).

  "#gpio-cells":
    const: 2

gpio-cells:
  - pin
  - flags
```

| 属性 | 必填 | 含义 |
| --- | --- | --- |
| `reg` | 是 | 这个 bank 的寄存器 |
| `interrupts` | 是 | 这个 bank 的中断 |
| `allwinner,pio-hw-type` | 是 | PIO 寄存器布局，F101 是 `ALLWINNER_PIO_HW_TYPE0` |
| `allwinner,bank` | 是 | bank 号，PA = 0 … PF = 5 |
| `ngpios` | 来自 `gpio-controller.yaml` | 引脚个数，32 |
| `#gpio-cells` | 是，固定为 2 | 引脚号、标志 |

## Kconfig

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `CONFIG_GPIO` | 板级 defconfig 里是 `y` | 打开 GPIO 子系统。自己的应用里要写在 `prj.conf` |
| `CONFIG_GPIO_SUNXI` | `y`（依赖 `DT_HAS_ALLWINNER_SUNXI_GPIO_ENABLED`） | 编译这个驱动，不用手动设置 |
| `CONFIG_GPIO_INIT_PRIORITY` | Zephyr 默认 | GPIO 驱动的初始化优先级 |

## 接口详解

下面每个接口一个小标题：原型、驱动的行为、一个完整的示例函数和它在板子上的输出。示例来自文末的[完整演示程序](#完整演示程序)，里面的 `err()` 把返回值转成名字。接口里的“电平”都是逻辑电平：设备树里写了 `GPIO_ACTIVE_LOW` 的引脚，`gpio_pin_set_dt(spec, 1)` 输出的是低电平。带 `_raw` 的接口不看这个标志。

演示用到 3 个引脚：

| 引脚 | 位置 | 用途 |
| --- | --- | --- |
| PD5 | 板上的 LED（`led0`） | 输出 |
| PB2 | 排针上悬空的引脚 | 输出，用 `gpio_port_*` 操作 |
| PB3 | 排针上悬空的引脚 | 输入，用内部上下拉改变电平，触发中断 |

PB2 和 PB3 在演示的 `app.overlay` 里通过 `zephyr,user` 节点引用。这是应用自己给引脚取名字的标准办法，不用改板级文件。

### gpio_pin_configure_dt

```c
int gpio_pin_configure_dt(const struct gpio_dt_spec *spec, gpio_flags_t extra_flags);
```

配置方向、初始电平和上下拉。

| 标志 | 驱动的行为 |
| --- | --- |
| `GPIO_INPUT` | 复用功能设为输入 |
| `GPIO_OUTPUT`、`GPIO_OUTPUT_INACTIVE`、`GPIO_OUTPUT_ACTIVE` | 复用功能设为输出，并按初始电平先写数据寄存器再切成输出，输出口不会有毛刺 |
| `GPIO_PULL_UP`、`GPIO_PULL_DOWN` | 打开对应的内部上拉或下拉；两个都不写则关闭上下拉 |
| `GPIO_OPEN_DRAIN`、`GPIO_OPEN_SOURCE` | 返回 `-ENOTSUP` |

```c
/* gpio_pin_configure_dt: direction, initial level and pull resistor */
static void demo_pin_configure_dt(void)
{
	int ret;

	ret = gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);
	printk("[configure] PD5 output, low                 = %s\n", err(ret));

	ret = gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_UP);
	printk("[configure] PB3 input with pull up         = %s\n", err(ret));

	ret = gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_DOWN);
	printk("[configure] PB3 input with pull down       = %s\n", err(ret));

	ret = gpio_pin_configure_dt(&out, GPIO_OUTPUT | GPIO_OPEN_DRAIN);
	printk("[configure] PB2 open drain output          = %s\n", err(ret));

	ret = gpio_pin_configure_dt(&out, GPIO_OUTPUT | GPIO_OPEN_SOURCE);
	printk("[configure] PB2 open source output         = %s\n", err(ret));
}
```

```text
[configure] PD5 output, low                 = 0
[configure] PB3 input with pull up         = 0
[configure] PB3 input with pull down       = 0
[configure] PB2 open drain output          = -ENOTSUP
[configure] PB2 open source output         = -ENOTSUP
```

### gpio_pin_set_dt

```c
int gpio_pin_set_dt(const struct gpio_dt_spec *spec, int value);
```

设置输出的逻辑电平，1 是有效电平。

```c
/* gpio_pin_set_dt: the logical level of an output */
static void demo_pin_set_dt(void)
{
	int ret;

	gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);

	ret = gpio_pin_set_dt(&led, 1);
	printk("[set] gpio_pin_set_dt(PD5, 1)              = %s, register bit %d\n", err(ret),
	       gpio_pin_get_raw(led.port, led.pin));

	ret = gpio_pin_set_dt(&led, 0);
	printk("[set] gpio_pin_set_dt(PD5, 0)              = %s, register bit %d\n", err(ret),
	       gpio_pin_get_raw(led.port, led.pin));
}
```

```text
[set] gpio_pin_set_dt(PD5, 1)              = 0, register bit 1
[set] gpio_pin_set_dt(PD5, 0)              = 0, register bit 0
```

### gpio_pin_toggle_dt

```c
int gpio_pin_toggle_dt(const struct gpio_dt_spec *spec);
```

把输出的电平翻转。

```c
/* gpio_pin_toggle_dt: invert an output; six calls make the LED blink three times */
static void demo_pin_toggle_dt(void)
{
	int ret = gpio_pin_toggle_dt(&led);

	printk("[toggle] gpio_pin_toggle_dt(PD5)           = %s, register bit %d\n", err(ret),
	       gpio_pin_get_raw(led.port, led.pin));

	for (int i = 0; i < 5; i++) {
		k_msleep(100);
		gpio_pin_toggle_dt(&led);
	}
	printk("[toggle] blinked the LED 3 times\n");
}
```

```text
[toggle] gpio_pin_toggle_dt(PD5)           = 0, register bit 1
[toggle] blinked the LED 3 times
```

最后一行对应 LED 闪烁 3 次。

### gpio_pin_get_dt

```c
int gpio_pin_get_dt(const struct gpio_dt_spec *spec);
```

读引脚的逻辑电平。输出引脚读回的是写进去的值，不是引脚上的实际电平。

```c
/* gpio_pin_get_dt: the logical level of a pin. For an output pin it is the level that was written. */
static void demo_pin_get_dt(void)
{
	int level;

	gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE);
	level = gpio_pin_get_dt(&led);
	printk("[get] PD5 written active, gpio_pin_get_dt   = %d\n", level);

	gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);
	level = gpio_pin_get_dt(&led);
	printk("[get] PD5 written inactive, gpio_pin_get_dt = %d\n", level);
}
```

```text
[get] PD5 written active, gpio_pin_get_dt   = 1
[get] PD5 written inactive, gpio_pin_get_dt = 0
```

### gpio_pin_get_raw

```c
int gpio_pin_get_raw(const struct device *port, gpio_pin_t pin);
```

读引脚上的实际电平，不看 `GPIO_ACTIVE_LOW`。PB3 悬空，所以打开上拉读到 1，打开下拉读到 0，这也是后面中断演示制造边沿的办法。

```c
/* gpio_pin_get_raw: the level of the pin, not looking at GPIO_ACTIVE_LOW. PB3 is not connected,
 * so the pull resistor decides.
 */
static void demo_pin_get_raw(void)
{
	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_UP);
	k_msleep(1);
	printk("[get_raw] PB3 with pull up                  = %d\n", gpio_pin_get_raw(in.port, in.pin));

	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_DOWN);
	k_msleep(1);
	printk("[get_raw] PB3 with pull down                = %d\n", gpio_pin_get_raw(in.port, in.pin));
}
```

```text
[get_raw] PB3 with pull up                  = 1
[get_raw] PB3 with pull down                = 0
```

### gpio_port_get_raw

```c
int gpio_port_get_raw(const struct device *port, gpio_port_value_t *value);
```

一次读整个 bank 的 32 根线，`value` 的每一位对应一个引脚。

```c
/* gpio_port_get_raw: all 32 pins of the bank at once */
static void demo_port_get_raw(void)
{
	gpio_port_value_t v;
	int ret;

	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_UP);
	k_msleep(1);
	ret = gpio_port_get_raw(gpiob, &v);
	printk("[port_get] gpio_port_get_raw(PB)            = %s, PB2 %d, PB3 %d\n", err(ret),
	       !!(v & BIT(out.pin)), !!(v & BIT(in.pin)));
}
```

```text
[port_get] gpio_port_get_raw(PB)            = 0, PB2 0, PB3 1
```

### gpio_port_set_bits_raw

```c
int gpio_port_set_bits_raw(const struct device *port, gpio_port_pins_t pins);
```

把掩码里的引脚都拉高，一次寄存器写入完成。

```c
/* gpio_port_set_bits_raw: drive the pins of the mask high */
static void demo_port_set_bits_raw(void)
{
	gpio_port_value_t v;
	int ret;

	gpio_pin_configure_dt(&out, GPIO_OUTPUT_INACTIVE);
	ret = gpio_port_set_bits_raw(gpiob, BIT(out.pin));
	gpio_port_get_raw(gpiob, &v);
	printk("[set_bits] gpio_port_set_bits_raw(PB2)       = %s, PB2 %d\n", err(ret), !!(v & BIT(out.pin)));
}
```

```text
[set_bits] gpio_port_set_bits_raw(PB2)       = 0, PB2 1
```

### gpio_port_clear_bits_raw

```c
int gpio_port_clear_bits_raw(const struct device *port, gpio_port_pins_t pins);
```

把掩码里的引脚都拉低。

```c
/* gpio_port_clear_bits_raw: drive the pins of the mask low */
static void demo_port_clear_bits_raw(void)
{
	gpio_port_value_t v;
	int ret = gpio_port_clear_bits_raw(gpiob, BIT(out.pin));

	gpio_port_get_raw(gpiob, &v);
	printk("[clear_bits] gpio_port_clear_bits_raw(PB2)   = %s, PB2 %d\n", err(ret), !!(v & BIT(out.pin)));
}
```

```text
[clear_bits] gpio_port_clear_bits_raw(PB2)   = 0, PB2 0
```

### gpio_port_toggle_bits

```c
int gpio_port_toggle_bits(const struct device *port, gpio_port_pins_t pins);
```

把掩码里的引脚都翻转。

```c
/* gpio_port_toggle_bits: invert the pins of the mask */
static void demo_port_toggle_bits(void)
{
	gpio_port_value_t v;
	int ret = gpio_port_toggle_bits(gpiob, BIT(out.pin));

	gpio_port_get_raw(gpiob, &v);
	printk("[toggle_bits] gpio_port_toggle_bits(PB2)     = %s, PB2 %d\n", err(ret), !!(v & BIT(out.pin)));
}
```

```text
[toggle_bits] gpio_port_toggle_bits(PB2)     = 0, PB2 1
```

### gpio_port_set_masked_raw

```c
int gpio_port_set_masked_raw(const struct device *port, gpio_port_pins_t mask, gpio_port_value_t value);
```

掩码里的引脚设成 `value` 里对应的位，其余引脚不变。

```c
/* gpio_port_set_masked_raw: set the pins of the mask to the matching bits of value, leave the others */
static void demo_port_set_masked_raw(void)
{
	gpio_port_value_t v;
	int ret = gpio_port_set_masked_raw(gpiob, BIT(out.pin), 0);

	gpio_port_get_raw(gpiob, &v);
	printk("[set_masked] gpio_port_set_masked_raw(PB2, 0) = %s, PB2 %d\n", err(ret),
	       !!(v & BIT(out.pin)));
}
```

```text
[set_masked] gpio_port_set_masked_raw(PB2, 0) = 0, PB2 0
```

### gpio_init_callback

```c
void gpio_init_callback(struct gpio_callback *callback, gpio_callback_handler_t handler, gpio_port_pins_t pin_mask);
```

把处理函数和它关心的引脚掩码绑在一个 `struct gpio_callback` 上。回调在 PLIC 中断里执行，`pins` 参数是这个 bank 上本次待处理的所有引脚的位掩码，回调里不要做耗时的事。下面三个演示共用的变量和回调函数：

```c
static struct gpio_callback cb;

static volatile int fired;

static volatile uint32_t last_pins;

static void on_edge(const struct device *port, struct gpio_callback *callback, uint32_t pins)
{
	fired++;
	last_pins = pins;
}

/* gpio_init_callback: bind a handler and the mask of the pins it wants */
static void demo_init_callback(void)
{
	gpio_init_callback(&cb, on_edge, BIT(in.pin));
	printk("[init_callback] handler for pin mask 0x%x\n", (unsigned int)cb.pin_mask);
}
```

```text
[init_callback] handler for pin mask 0x8
```

### gpio_add_callback

```c
int gpio_add_callback(const struct device *port, struct gpio_callback *callback);
```

把回调注册到 bank 上。

```c
/* gpio_add_callback: register it with the bank */
static void demo_add_callback(void)
{
	int ret = gpio_add_callback(in.port, &cb);

	printk("[add_callback] gpio_add_callback              = %s\n", err(ret));
}
```

```text
[add_callback] gpio_add_callback              = 0
```

### gpio_pin_interrupt_configure_dt

```c
int gpio_pin_interrupt_configure_dt(const struct gpio_dt_spec *spec, gpio_flags_t flags);
```

| `flags` | 驱动的行为 |
| --- | --- |
| `GPIO_INT_EDGE_RISING`、`GPIO_INT_EDGE_FALLING`、`GPIO_INT_EDGE_BOTH` | 边沿触发 |
| `GPIO_INT_LEVEL_HIGH`、`GPIO_INT_LEVEL_LOW` | 电平触发 |
| `GPIO_INT_DISABLE` | 关掉这个引脚的中断；如果引脚还在中断功能上，把复用功能恢复为打开中断前的值 |

:::caution
打开引脚中断时驱动把这个引脚切到外部中断功能（复用功能 14），原来的功能存下来；已经打开中断的引脚再次打开时不会覆盖存下来的功能。之后再对同一个引脚调用 `gpio_pin_configure`，复用功能会被写成“输入”或“输出”，中断就收不到了。所以改过引脚配置以后，要再调用一次 `gpio_pin_interrupt_configure_dt`。
:::

演示：PB3 先下拉，装载上升沿；改成上拉制造一个上升沿，回调触发 1 次；改回下拉是下降沿，不是装载的上升沿，回调次数是 0。

```c
/* gpio_pin_interrupt_configure_dt: arm the pin. The pull resistor is part of the pin configuration,
 * so after every gpio_pin_configure the interrupt is armed again.
 */
static void demo_pin_interrupt_configure_dt(void)
{
	int ret;

	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_DOWN);
	k_msleep(1);

	ret = gpio_pin_interrupt_configure_dt(&in, GPIO_INT_EDGE_RISING);
	printk("[interrupt] arm EDGE_RISING                 = %s\n", err(ret));

	fired = 0;
	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_UP);
	gpio_pin_interrupt_configure_dt(&in, GPIO_INT_EDGE_RISING);
	k_msleep(20);
	printk("[interrupt] pull up after arming rising     : %d callback(s), pins 0x%x\n", fired, last_pins);

	fired = 0;
	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_DOWN);
	gpio_pin_interrupt_configure_dt(&in, GPIO_INT_EDGE_RISING);
	k_msleep(20);
	printk("[interrupt] pull down after arming rising   : %d callback(s)\n", fired);

	ret = gpio_pin_interrupt_configure_dt(&in, GPIO_INT_DISABLE);
	printk("[interrupt] GPIO_INT_DISABLE                = %s\n", err(ret));
}
```

```text
[interrupt] arm EDGE_RISING                 = 0
[interrupt] pull up after arming rising     : 1 callback(s), pins 0x8
[interrupt] pull down after arming rising   : 0 callback(s)
[interrupt] GPIO_INT_DISABLE                = 0
```

`pins 0x8` 就是 PB3（第 3 位）。

### gpio_get_pending_int

```c
int gpio_get_pending_int(const struct device *dev);
```

读这个 bank 的中断状态寄存器，每个引脚一位。中断处理函数会清掉已经处理的位，所以没有待处理的中断时读到 0。

```c
/* gpio_get_pending_int: the interrupt status register of the bank, one bit per pin */
static void demo_get_pending_int(void)
{
	printk("[pending] gpio_get_pending_int(PB)           = 0x%x\n", gpio_get_pending_int(gpiob));
}
```

```text
[pending] gpio_get_pending_int(PB)           = 0x0
```

### gpio_remove_callback

```c
int gpio_remove_callback(const struct device *port, struct gpio_callback *callback);
```

把回调从 bank 上取下来。

```c
/* gpio_remove_callback: take the handler out again */
static void demo_remove_callback(void)
{
	int ret = gpio_remove_callback(in.port, &cb);

	printk("[remove_callback] gpio_remove_callback        = %s\n", err(ret));
}
```

```text
[remove_callback] gpio_remove_callback        = 0
```

## 完整演示程序

上面所有示例和日志都来自这一个程序。建一个目录，放进下面的文件，就可以像其他 Zephyr 应用一样编译。

```text
gpio_api/
├── CMakeLists.txt
├── prj.conf
├── app.overlay
└── src/
    └── main.c
```

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(gpio_api)

target_sources(app PRIVATE src/main.c)
```

### prj.conf

```ini
CONFIG_GPIO=y
CONFIG_PRINTK=y
CONFIG_SHELL=n
CONFIG_DEVMEM_SHELL=n
CONFIG_LOG_PRINTK=n
CONFIG_MAIN_STACK_SIZE=4096
```

`CONFIG_MAIN_STACK_SIZE=4096` 不能省：默认的主线程栈只有 1024 字节，`printk` 就会把它用完，程序在显示初始化的时候就会因为 `Instruction Access fault` 停下来。

### app.overlay

```c
/* PB2 and PB3 are free pins of the board (the UART1 flow control signals, not used) */
/ {
	zephyr,user {
		out-gpios = <&gpiob 2 GPIO_ACTIVE_HIGH>;
		in-gpios = <&gpiob 3 GPIO_ACTIVE_HIGH>;
	};
};
```

### src/main.c

```c
/*
 * Calls the functions of <zephyr/drivers/gpio.h> that the sunxi GPIO driver
 * implements, one function per call, and prints what each call returns.
 */
#include <errno.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

/* PD5, the LED of the board (alias led0 in yuzukineko.dts) */
static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(DT_ALIAS(led0), gpios);
/* PB2 and PB3, from the zephyr,user node of app.overlay */
static const struct gpio_dt_spec out = GPIO_DT_SPEC_GET(DT_PATH(zephyr_user), out_gpios);
static const struct gpio_dt_spec in = GPIO_DT_SPEC_GET(DT_PATH(zephyr_user), in_gpios);

static const struct device *const gpiob = DEVICE_DT_GET(DT_NODELABEL(gpiob));

static const char *err(int ret)
{
	switch (ret) {
	case 0:		return "0";
	case -ENOTSUP:	return "-ENOTSUP";
	case -EINVAL:	return "-EINVAL";
	case -EIO:	return "-EIO";
	default:	return "?";
	}
}

/* gpio_pin_configure_dt: direction, initial level and pull resistor */
static void demo_pin_configure_dt(void)
{
	int ret;

	ret = gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);
	printk("[configure] PD5 output, low                 = %s\n", err(ret));

	ret = gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_UP);
	printk("[configure] PB3 input with pull up         = %s\n", err(ret));

	ret = gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_DOWN);
	printk("[configure] PB3 input with pull down       = %s\n", err(ret));

	ret = gpio_pin_configure_dt(&out, GPIO_OUTPUT | GPIO_OPEN_DRAIN);
	printk("[configure] PB2 open drain output          = %s\n", err(ret));

	ret = gpio_pin_configure_dt(&out, GPIO_OUTPUT | GPIO_OPEN_SOURCE);
	printk("[configure] PB2 open source output         = %s\n", err(ret));
}

/* gpio_pin_set_dt: the logical level of an output */
static void demo_pin_set_dt(void)
{
	int ret;

	gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);

	ret = gpio_pin_set_dt(&led, 1);
	printk("[set] gpio_pin_set_dt(PD5, 1)              = %s, register bit %d\n", err(ret),
	       gpio_pin_get_raw(led.port, led.pin));

	ret = gpio_pin_set_dt(&led, 0);
	printk("[set] gpio_pin_set_dt(PD5, 0)              = %s, register bit %d\n", err(ret),
	       gpio_pin_get_raw(led.port, led.pin));
}

/* gpio_pin_toggle_dt: invert an output; six calls make the LED blink three times */
static void demo_pin_toggle_dt(void)
{
	int ret = gpio_pin_toggle_dt(&led);

	printk("[toggle] gpio_pin_toggle_dt(PD5)           = %s, register bit %d\n", err(ret),
	       gpio_pin_get_raw(led.port, led.pin));

	for (int i = 0; i < 5; i++) {
		k_msleep(100);
		gpio_pin_toggle_dt(&led);
	}
	printk("[toggle] blinked the LED 3 times\n");
}

/* gpio_pin_get_dt: the logical level of a pin. For an output pin it is the level that was written. */
static void demo_pin_get_dt(void)
{
	int level;

	gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE);
	level = gpio_pin_get_dt(&led);
	printk("[get] PD5 written active, gpio_pin_get_dt   = %d\n", level);

	gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);
	level = gpio_pin_get_dt(&led);
	printk("[get] PD5 written inactive, gpio_pin_get_dt = %d\n", level);
}

/* gpio_pin_get_raw: the level of the pin, not looking at GPIO_ACTIVE_LOW. PB3 is not connected,
 * so the pull resistor decides.
 */
static void demo_pin_get_raw(void)
{
	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_UP);
	k_msleep(1);
	printk("[get_raw] PB3 with pull up                  = %d\n", gpio_pin_get_raw(in.port, in.pin));

	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_DOWN);
	k_msleep(1);
	printk("[get_raw] PB3 with pull down                = %d\n", gpio_pin_get_raw(in.port, in.pin));
}

/* gpio_port_get_raw: all 32 pins of the bank at once */
static void demo_port_get_raw(void)
{
	gpio_port_value_t v;
	int ret;

	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_UP);
	k_msleep(1);
	ret = gpio_port_get_raw(gpiob, &v);
	printk("[port_get] gpio_port_get_raw(PB)            = %s, PB2 %d, PB3 %d\n", err(ret),
	       !!(v & BIT(out.pin)), !!(v & BIT(in.pin)));
}

/* gpio_port_set_bits_raw: drive the pins of the mask high */
static void demo_port_set_bits_raw(void)
{
	gpio_port_value_t v;
	int ret;

	gpio_pin_configure_dt(&out, GPIO_OUTPUT_INACTIVE);
	ret = gpio_port_set_bits_raw(gpiob, BIT(out.pin));
	gpio_port_get_raw(gpiob, &v);
	printk("[set_bits] gpio_port_set_bits_raw(PB2)       = %s, PB2 %d\n", err(ret), !!(v & BIT(out.pin)));
}

/* gpio_port_clear_bits_raw: drive the pins of the mask low */
static void demo_port_clear_bits_raw(void)
{
	gpio_port_value_t v;
	int ret = gpio_port_clear_bits_raw(gpiob, BIT(out.pin));

	gpio_port_get_raw(gpiob, &v);
	printk("[clear_bits] gpio_port_clear_bits_raw(PB2)   = %s, PB2 %d\n", err(ret), !!(v & BIT(out.pin)));
}

/* gpio_port_toggle_bits: invert the pins of the mask */
static void demo_port_toggle_bits(void)
{
	gpio_port_value_t v;
	int ret = gpio_port_toggle_bits(gpiob, BIT(out.pin));

	gpio_port_get_raw(gpiob, &v);
	printk("[toggle_bits] gpio_port_toggle_bits(PB2)     = %s, PB2 %d\n", err(ret), !!(v & BIT(out.pin)));
}

/* gpio_port_set_masked_raw: set the pins of the mask to the matching bits of value, leave the others */
static void demo_port_set_masked_raw(void)
{
	gpio_port_value_t v;
	int ret = gpio_port_set_masked_raw(gpiob, BIT(out.pin), 0);

	gpio_port_get_raw(gpiob, &v);
	printk("[set_masked] gpio_port_set_masked_raw(PB2, 0) = %s, PB2 %d\n", err(ret),
	       !!(v & BIT(out.pin)));
}

/* interrupts. The edge is made by switching the pull resistor of the unconnected pin PB3. */
static struct gpio_callback cb;
static volatile int fired;
static volatile uint32_t last_pins;

static void on_edge(const struct device *port, struct gpio_callback *callback, uint32_t pins)
{
	fired++;
	last_pins = pins;
}

/* gpio_init_callback: bind a handler and the mask of the pins it wants */
static void demo_init_callback(void)
{
	gpio_init_callback(&cb, on_edge, BIT(in.pin));
	printk("[init_callback] handler for pin mask 0x%x\n", (unsigned int)cb.pin_mask);
}

/* gpio_add_callback: register it with the bank */
static void demo_add_callback(void)
{
	int ret = gpio_add_callback(in.port, &cb);

	printk("[add_callback] gpio_add_callback              = %s\n", err(ret));
}

/* gpio_pin_interrupt_configure_dt: arm the pin. The pull resistor is part of the pin configuration,
 * so after every gpio_pin_configure the interrupt is armed again.
 */
static void demo_pin_interrupt_configure_dt(void)
{
	int ret;

	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_DOWN);
	k_msleep(1);

	ret = gpio_pin_interrupt_configure_dt(&in, GPIO_INT_EDGE_RISING);
	printk("[interrupt] arm EDGE_RISING                 = %s\n", err(ret));

	fired = 0;
	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_UP);
	gpio_pin_interrupt_configure_dt(&in, GPIO_INT_EDGE_RISING);
	k_msleep(20);
	printk("[interrupt] pull up after arming rising     : %d callback(s), pins 0x%x\n", fired, last_pins);

	fired = 0;
	gpio_pin_configure_dt(&in, GPIO_INPUT | GPIO_PULL_DOWN);
	gpio_pin_interrupt_configure_dt(&in, GPIO_INT_EDGE_RISING);
	k_msleep(20);
	printk("[interrupt] pull down after arming rising   : %d callback(s)\n", fired);

	ret = gpio_pin_interrupt_configure_dt(&in, GPIO_INT_DISABLE);
	printk("[interrupt] GPIO_INT_DISABLE                = %s\n", err(ret));
}

/* gpio_get_pending_int: the interrupt status register of the bank, one bit per pin */
static void demo_get_pending_int(void)
{
	printk("[pending] gpio_get_pending_int(PB)           = 0x%x\n", gpio_get_pending_int(gpiob));
}

/* gpio_remove_callback: take the handler out again */
static void demo_remove_callback(void)
{
	int ret = gpio_remove_callback(in.port, &cb);

	printk("[remove_callback] gpio_remove_callback        = %s\n", err(ret));
}

int main(void)
{
	if (!gpio_is_ready_dt(&led) || !gpio_is_ready_dt(&out) || !gpio_is_ready_dt(&in)) {
		printk("gpio not ready\n");
		return 0;
	}

	demo_pin_configure_dt();
	demo_pin_set_dt();
	demo_pin_toggle_dt();
	demo_pin_get_dt();
	demo_pin_get_raw();
	demo_port_get_raw();
	demo_port_set_bits_raw();
	demo_port_clear_bits_raw();
	demo_port_toggle_bits();
	demo_port_set_masked_raw();
	demo_init_callback();
	demo_add_callback();
	demo_pin_interrupt_configure_dt();
	demo_get_pending_int();
	demo_remove_callback();

	printk("gpio_api done\n");
	return 0;
}
```

### 编译和运行

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/gpio-api gpio_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-gpio/build.cast" data-speed="6"></div>

下载运行的方法见[编译与运行](../zephyr-build-run.md)。控制台 UART1 上的完整输出：

```text
[configure] PD5 output, low                 = 0
[configure] PB3 input with pull up         = 0
[configure] PB3 input with pull down       = 0
[configure] PB2 open drain output          = -ENOTSUP
[configure] PB2 open source output         = -ENOTSUP
[set] gpio_pin_set_dt(PD5, 1)              = 0, register bit 1
[set] gpio_pin_set_dt(PD5, 0)              = 0, register bit 0
[toggle] gpio_pin_toggle_dt(PD5)           = 0, register bit 1
[toggle] blinked the LED 3 times
[get] PD5 written active, gpio_pin_get_dt   = 1
[get] PD5 written inactive, gpio_pin_get_dt = 0
[get_raw] PB3 with pull up                  = 1
[get_raw] PB3 with pull down                = 0
[port_get] gpio_port_get_raw(PB)            = 0, PB2 0, PB3 1
[set_bits] gpio_port_set_bits_raw(PB2)       = 0, PB2 1
[clear_bits] gpio_port_clear_bits_raw(PB2)   = 0, PB2 0
[toggle_bits] gpio_port_toggle_bits(PB2)     = 0, PB2 1
[set_masked] gpio_port_set_masked_raw(PB2, 0) = 0, PB2 0
[init_callback] handler for pin mask 0x8
[add_callback] gpio_add_callback              = 0
[interrupt] arm EDGE_RISING                 = 0
[interrupt] pull up after arming rising     : 1 callback(s), pins 0x8
[interrupt] pull down after arming rising   : 0 callback(s)
[interrupt] GPIO_INT_DISABLE                = 0
[pending] gpio_get_pending_int(PB)           = 0x0
[remove_callback] gpio_remove_callback        = 0
gpio_api done
```
