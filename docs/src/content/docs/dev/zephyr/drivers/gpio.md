---
title: "GPIO"
---

The GPIO and pin multiplexing (pinctrl) of the F101 live in the same PIO module: 6 banks (PA…PF), 32 lines per bank, one interrupt per bank. In Zephyr each bank is a GPIO device (`gpioa`…`gpiof`), the interface is the standard `<zephyr/drivers/gpio.h>`, and the driver is `drivers/gpio/gpio_sunxi.c`.

| Item | Description |
| --- | --- |
| Device | `gpioa`, `gpiob`, `gpioc`, `gpiod`, `gpioe`, `gpiof`, 32 pins per bank |
| Direction | input, output, with optional internal pull-up or pull-down |
| Interrupts | rising edge, falling edge, both edges, high level, low level |
| Not supported | open drain, open source output (`-ENOTSUP`), `gpio_pin_get_config` |

## Devicetree

GPIO involves three files, from the bottom up:

| File | Role |
| --- | --- |
| `dts/bindings/gpio/allwinner,sunxi-gpio.yaml` | Binding: defines the properties of the `allwinner,sunxi-gpio` node |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree: the nodes of the 6 banks, all `okay` by default |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | Board devicetree: references specific pins through properties such as `gpio-leds` and `cd-gpios` |

### SoC devicetree: sun252i_f101.dtsi

Below is the node of the PB bank; the other 5 banks differ only in the register address, `allwinner,bank` and the interrupt number:

```c
gpiob: gpio@2000030 {
	/* Matches DT_DRV_COMPAT allwinner_sunxi_gpio in the driver gpio_sunxi.c */
	compatible = "allwinner,sunxi-gpio";

	/* The registers of this bank: base address 0x02000030, length 0x30 */
	reg = <0x02000030 0x30>;

	/* PIO register layout type. The F1xx series uses type 0: the bank stride is 0x30 bytes and the interrupt registers are after 0x200 */
	allwinner,pio-hw-type = <ALLWINNER_PIO_HW_TYPE0>;

	/* Bank number: PA = 0, PB = 1, ..., PF = 5. The driver uses it to work out the interrupt register location of this bank */
	allwinner,bank = <1>;

	/* This is a GPIO controller; a gpios property that references it has 2 cells: pin number, flags */
	gpio-controller;
	#gpio-cells = <2>;

	/* Number of pins */
	ngpios = <32>;

	/* The interrupt of this bank: PLIC number 69, priority 1 */
	interrupts = <69 1>;
	interrupt-parent = <&plic>;

	status = "okay";
};
```

The differences between the six banks:

| Node | Label | Registers | `allwinner,bank` | PLIC interrupt number |
| --- | --- | --- | --- | --- |
| `gpio@2000000` | `gpioa` | `0x02000000` | 0 | 67 |
| `gpio@2000030` | `gpiob` | `0x02000030` | 1 | 69 |
| `gpio@2000060` | `gpioc` | `0x02000060` | 2 | 71 |
| `gpio@2000090` | `gpiod` | `0x02000090` | 3 | 73 |
| `gpio@20000c0` | `gpioe` | `0x020000c0` | 4 | 75 |
| `gpio@20000f0` | `gpiof` | `0x020000f0` | 5 | 77 |

### Board devicetree: yuzukineko.dts

The board file uses GPIO in two places. One is the LED, the other is the TF card insertion detection:

```c
/ {
	aliases {
		/* The application gets the LED with DT_ALIAS(led0) */
		led0 = &led0;
	};

	leds {
		compatible = "gpio-leds";

		led0: led_0 {
			/* &gpiod: the PD bank; 5: line 5, that is PD5; active high */
			gpios = <&gpiod 5 GPIO_ACTIVE_HIGH>;
		};
	};
};

&smhc0 {
	/* PF6 is TF card insertion detection, a low level means a card is present, so GPIO_ACTIVE_LOW */
	cd-gpios = <&gpiof 6 GPIO_ACTIVE_LOW>;
};
```

In `gpios = <&gpiod 5 GPIO_ACTIVE_HIGH>`, the two numbers after `&gpiod` are the "pin number" and the "flags" prescribed by `#gpio-cells = <2>`. The bits available for the flags are in `include/zephyr/dt-bindings/gpio/gpio.h`: `GPIO_ACTIVE_LOW`, `GPIO_PULL_UP`, `GPIO_PULL_DOWN` and so on.

### Pin multiplexing: pinctrl

When a pin is not used as ordinary GPIO but is given to a peripheral, pinctrl sets its function. In `yuzukineko.dts` every peripheral has a `pinctrl-0` group:

```c
&pio {
	/* UART1 console: PB00 is TX, PB01 is RX, multiplexing function 4 */
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

In `ALLWINNER_PINMUX(bank, pin number, multiplexing function)` the multiplexing function is: 0 is input, 1 is output, 2…15 are peripheral functions, 14 is the external interrupt. For what each function of a pin is, see the [pin multiplexing table](../../../hardware/mux.md). Properties that can be written in the same group:

| Property | Meaning |
| --- | --- |
| `pinmux` | The pin and the multiplexing function, one pin per cell |
| `bias-pull-up` | Enable the internal pull-up |
| `bias-pull-down` | Enable the internal pull-down |
| `bias-disable` | Disable the pull-up and pull-down |
| `allwinner,drive-level` | Drive strength, 0…3; if it is not written the reset value is kept |

### Binding: allwinner,sunxi-gpio.yaml

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

| Property | Required | Meaning |
| --- | --- | --- |
| `reg` | yes | The registers of this bank |
| `interrupts` | yes | The interrupt of this bank |
| `allwinner,pio-hw-type` | yes | PIO register layout; for the F101 it is `ALLWINNER_PIO_HW_TYPE0` |
| `allwinner,bank` | yes | Bank number, PA = 0 … PF = 5 |
| `ngpios` | from `gpio-controller.yaml` | Number of pins, 32 |
| `#gpio-cells` | yes, fixed at 2 | Pin number, flags |

## Kconfig

| Option | Default | Meaning |
| --- | --- | --- |
| `CONFIG_GPIO` | `y` in the board defconfig | Enables the GPIO subsystem. In your own application it has to be written in `prj.conf` |
| `CONFIG_GPIO_SUNXI` | `y` (depends on `DT_HAS_ALLWINNER_SUNXI_GPIO_ENABLED`) | Builds this driver; there is no need to set it manually |
| `CONFIG_GPIO_INIT_PRIORITY` | Zephyr default | The initialization priority of the GPIO driver |

## Interface details

Each interface below gets its own heading: the prototype, the behaviour of the driver, a complete example function and its output on the board. The examples come from the [complete demo program](#complete-demo-program) at the end of the page, whose `err()` turns a return value into a name. The "levels" in the interfaces are all logical levels: for a pin declared `GPIO_ACTIVE_LOW` in the devicetree, `gpio_pin_set_dt(spec, 1)` outputs a low level. Interfaces with `_raw` do not look at this flag.

The demo uses 3 pins:

| Pin | Location | Use |
| --- | --- | --- |
| PD5 | the LED on the board (`led0`) | output |
| PB2 | a floating pin on the header | output, driven with `gpio_port_*` |
| PB3 | a floating pin on the header | input; the internal pull-up/pull-down changes the level and triggers the interrupt |

PB2 and PB3 are referenced through the `zephyr,user` node in the demo's `app.overlay`. This is the standard way for an application to give pins its own names without changing the board file.

### gpio_pin_configure_dt

```c
int gpio_pin_configure_dt(const struct gpio_dt_spec *spec, gpio_flags_t extra_flags);
```

Configures the direction, the initial level and the pull-up/pull-down.

| Flag | Driver behaviour |
| --- | --- |
| `GPIO_INPUT` | Sets the multiplexing function to input |
| `GPIO_OUTPUT`, `GPIO_OUTPUT_INACTIVE`, `GPIO_OUTPUT_ACTIVE` | Sets the multiplexing function to output; it writes the data register with the initial level first and only then switches to output, so there is no glitch on the output |
| `GPIO_PULL_UP`, `GPIO_PULL_DOWN` | Enables the corresponding internal pull-up or pull-down; if neither is written the pull-up and pull-down are disabled |
| `GPIO_OPEN_DRAIN`, `GPIO_OPEN_SOURCE` | Returns `-ENOTSUP` |

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

Sets the logical level of an output; 1 is the active level.

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

Inverts the level of an output.

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

The last line corresponds to the LED blinking 3 times.

### gpio_pin_get_dt

```c
int gpio_pin_get_dt(const struct gpio_dt_spec *spec);
```

Reads the logical level of a pin. For an output pin it reads back the value that was written, not the actual level on the pin.

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

Reads the actual level on the pin, without looking at `GPIO_ACTIVE_LOW`. PB3 is floating, so with the pull-up enabled it reads 1 and with the pull-down enabled it reads 0; this is also how the interrupt demo further down creates an edge.

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

Reads all 32 lines of the bank at once; each bit of `value` corresponds to one pin.

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

Drives every pin in the mask high, in a single register write.

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

Drives every pin in the mask low.

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

Inverts every pin in the mask.

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

Sets the pins in the mask to the corresponding bits of `value`; the other pins are left unchanged.

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

Binds the handler and the pin mask it cares about to a `struct gpio_callback`. The callback runs in the PLIC interrupt, and the `pins` argument is the bitmask of all pins pending on this bank this time; do not do anything time-consuming inside the callback. The variables and the callback function shared by the three demos below:

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

Registers the callback with the bank.

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

| `flags` | Driver behaviour |
| --- | --- |
| `GPIO_INT_EDGE_RISING`, `GPIO_INT_EDGE_FALLING`, `GPIO_INT_EDGE_BOTH` | Edge triggered |
| `GPIO_INT_LEVEL_HIGH`, `GPIO_INT_LEVEL_LOW` | Level triggered |
| `GPIO_INT_DISABLE` | Disables the interrupt of this pin; if the pin is still on the interrupt function, restores the multiplexing function to the value it had before the interrupt was enabled |

:::caution
When a pin interrupt is enabled the driver switches this pin to the external interrupt function (multiplexing function 14) and saves the previous function; enabling the interrupt again on a pin that already has it enabled does not overwrite the saved function. If `gpio_pin_configure` is then called on the same pin, the multiplexing function is written as "input" or "output" and the interrupt is no longer received. So after changing the pin configuration, call `gpio_pin_interrupt_configure_dt` once more.
:::

Demo: PB3 is pulled down first and the rising edge is armed; changing it to pull-up creates a rising edge and the callback fires 1 time; changing it back to pull-down is a falling edge, not the armed rising edge, so the callback count is 0.

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

`pins 0x8` is PB3 (bit 3).

### gpio_get_pending_int

```c
int gpio_get_pending_int(const struct device *dev);
```

Reads the interrupt status register of this bank, one bit per pin. The interrupt handler clears the bits it has handled, so it reads 0 when there is no pending interrupt.

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

Takes the callback off the bank.

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

## Complete demo program

All the examples and logs above come from this single program. Create a directory, put the files below in it, and it builds like any other Zephyr application.

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

`CONFIG_MAIN_STACK_SIZE=4096` cannot be left out: the default main thread stack is only 1024 bytes, `printk` will use it up, and the program will stop with an `Instruction Access fault` while the display is being initialized.

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

### Build and run

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/gpio-api gpio_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-gpio/build.cast" data-speed="6"></div>

For how to download and run it, see [Build and run](../zephyr-build-run.md). The complete output on the UART1 console:

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
