---
title: "I2C"
---

The F101 has 3 two-wire interface controllers (TWI), which are `i2c0`, `i2c1` and `i2c2` in Zephyr; the interface is the standard `<zephyr/drivers/i2c.h>`, and the driver is `drivers/i2c/i2c_sunxi.c`.

| Item | Content |
| --- | --- |
| Devices | `i2c0`, `i2c1`, `i2c2` |
| Role | Controller only |
| Speed | Standard 100 kHz, fast 400 kHz; 200 kHz can also be written in the devicetree |
| Address | 7-bit; 10-bit addresses return `-ENOTSUP` |
| Transfer mode | Polling, no interrupts; a mutex is held during a transfer |
| Not supported | Fast+ (1 MHz), slave mode, `i2c_get_config` |

## Devicetree

| File | Purpose |
| --- | --- |
| `dts/bindings/i2c/allwinner,sunxi-twi.yaml` | Binding: defines the properties of an `allwinner,sunxi-twi` node |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree: `i2c0`, `i2c1`, `i2c2`, `disabled` by default |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | Board devicetree: switches on the controllers that are used, assigns their pins and speed, and attaches the slave devices |

### SoC devicetree: sun252i_f101.dtsi

The three nodes differ only in register address, interrupt number, clock and reset. The one below is `i2c1`:

```c
i2c1: i2c@2502400 {
	/* matches DT_DRV_COMPAT allwinner_sunxi_twi in the driver i2c_sunxi.c */
	compatible = "allwinner,sunxi-twi";

	/* child nodes (slave devices) use a 1 cell address, with no size */
	#address-cells = <1>;
	#size-cells = <0>;

	/* register window: base 0x02502400, length 0x400 */
	reg = <0x02502400 0x400>;

	/* interrupt: PLIC number 10, priority 1 (the driver polls and does not use it) */
	interrupts = <10 1>;
	interrupt-parent = <&plic>;

	/* switching and reset of the bus clock */
	clocks = <&cctl CLK_BUS_TWI1>;
	resets = <&rctl RST_BUS_TWI1>;

	/* bus speed, the board file may change it: 100000, 200000 or 400000 */
	clock-frequency = <100000>;

	/* off by default, switched on by the board */
	status = "disabled";
};
```

| Node | Label | Register | PLIC interrupt number | Clock macro | Reset macro |
| --- | --- | --- | --- | --- | --- |
| `i2c@2502000` | `i2c0` | `0x02502000` | 9 | `CLK_BUS_TWI0` | `RST_BUS_TWI0` |
| `i2c@2502400` | `i2c1` | `0x02502400` | 10 | `CLK_BUS_TWI1` | `RST_BUS_TWI1` |
| `i2c@2502800` | `i2c2` | `0x02502800` | 11 | `CLK_BUS_TWI2` | `RST_BUS_TWI2` |

### Board devicetree: yuzukineko.dts

The board file does three things: defines the pin groups, switches on the controllers and binds their pins, and attaches the slave devices under the controllers.

```c
&pio {
	/* TWI0 is on PE08/PE09; TWI1 is on PD0/PD1 (touch panel); TWI2 is on PD10/PD11. The multiplexing function is 4 for all of them, with pull-up enabled */
	twi1_pins: twi1_pins {
		twi1_pins_group {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 0, 4)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 1, 4)>;
			bias-pull-up;
		};
	};
};

/* PE8/PE9 of TWI0 are the RTS/CTS of the Bluetooth UART2, so it is switched off */
&i2c0 {
	status = "disabled";
	pinctrl-0 = <&twi0_pins>;
	pinctrl-names = "default";
};

/* Carrier board touch controller GT967: SCL is on PD0, SDA on PD1, INT on PD2, RST on PD3 */
&i2c1 {
	status = "okay";

	/* 400 kHz. I2C_BITRATE_FAST comes from <zephyr/dt-bindings/i2c/i2c.h> */
	clock-frequency = <I2C_BITRATE_FAST>;

	pinctrl-0 = <&twi1_pins>;
	pinctrl-names = "default";

	/* slave device: the part of the node name after @ and the reg value are the 7 bit address */
	touch: touch@5d {
		compatible = "goodix,gt967";
		reg = <0x5d>;
		screen-width = <1024>;
		screen-height = <768>;
		irq-gpios = <&gpiod 2 GPIO_ACTIVE_HIGH>;
		reset-gpios = <&gpiod 3 GPIO_ACTIVE_LOW>;
	};
};
```

`i2c2` is not switched on in the board file; to use it, write `&i2c2 { status = "okay"; pinctrl-0 = <&twi2_pins>; pinctrl-names = "default"; };` in the application overlay, since `twi2_pins` is already defined in the board file.

### Binding: allwinner,sunxi-twi.yaml

```yaml
# Copyright (c) 2026 Yuzuki Tsuru
# SPDX-License-Identifier: Apache-2.0

description: Allwinner sunxi two-wire interface controller

compatible: "allwinner,sunxi-twi"

include: [i2c-controller.yaml, pinctrl-device.yaml]

properties:
  reg:
    required: true

  clocks:
    required: true

  resets:
    type: phandle-array
    required: true

  clock-frequency:
    required: true
```

| Property | Required | Meaning |
| --- | --- | --- |
| `reg` | Yes | Register window |
| `clocks` | Yes | Bus clock |
| `resets` | Yes | Bus reset |
| `clock-frequency` | Yes | Bus speed; only 100000, 200000 and 400000 are accepted, any other value makes driver initialization return `-ENOTSUP` |
| `pinctrl-0`, `pinctrl-names` | From `pinctrl-device.yaml` | Pins, see [the pinctrl section of the GPIO page](gpio.md#pin-multiplexing-pinctrl) |
| `interrupts` | No | Not used by the driver |

## Kconfig

| Option | Default | Meaning |
| --- | --- | --- |
| `CONFIG_I2C` | `y` in the board defconfig | Switch on the I2C subsystem |
| `CONFIG_I2C_SUNXI` | `y` (depends on `DT_HAS_ALLWINNER_SUNXI_TWI_ENABLED`) | Build this driver, and select `CONFIG_PINCTRL` |
| `CONFIG_I2C_SUNXI_INIT_PRIORITY` | 81 | Initialization priority of the driver |

## Interface details

Each interface below gets its own short heading: the prototype, the driver's behavior, one complete example function, and its output on the board. The demonstration is on `i2c1` and makes all these calls to the GT967 touch controller of the carrier board; the examples come from [the complete demonstration program](#the-complete-demonstration-program) at the end of the page, whose `err()` turns a return value into a name.

The GT967's register addresses are 16-bit and big-endian, and its product ID register `0x8140` holds 4 ASCII bytes, `"967"` plus a 0. At the moment reset is released it takes its address from the level of the INT pin: INT low is `0x5d`, INT high is `0x14`. The demonstration program does this first with `touch_reset()`, and the real touch driver `drivers/input/input_gt967.c` does the same; this function uses only the [GPIO](gpio.md) interface:

```c
/* The controller takes its address from the level of INT at the moment RST is released:
 * INT low gives 0x5d, INT high gives 0x14. A real touch driver does this once at start.
 */
static void touch_reset(void)
{
	gpio_pin_configure_dt(&rst, GPIO_OUTPUT_ACTIVE);	/* RST is active low in the DT: held in reset */
	k_msleep(12);
	gpio_pin_configure_dt(&irq, GPIO_OUTPUT_INACTIVE);	/* INT low selects 0x5d */
	k_msleep(2);
	gpio_pin_set_dt(&rst, 0);				/* released */
	k_msleep(6);
	gpio_pin_configure_dt(&irq, GPIO_INPUT);
	k_msleep(60);
	printk("[reset] released RST with INT low, the controller should answer at 0x%02x\n", ADDR);
}
```

### i2c_configure

```c
int i2c_configure(const struct device *dev, uint32_t dev_config);
```

Changes the bus speed at run time. `dev_config` must carry `I2C_MODE_CONTROLLER`.

| Argument | Return |
| --- | --- |
| `I2C_SPEED_STANDARD` (100 kHz) | 0 |
| `I2C_SPEED_FAST` (400 kHz) | 0 |
| Other speeds (fast plus, high speed, ultra fast) | `-ENOTSUP` |
| With `I2C_ADDR_10_BITS` | `-ENOTSUP` |
| Without `I2C_MODE_CONTROLLER` | `-ENOTSUP` |

Every call resets the controller and sets the divider again.

```c
/* i2c_configure: the speed can be changed at run time */
static void demo_configure(void)
{
	int ret;

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_STANDARD) | I2C_MODE_CONTROLLER);
	printk("[configure] standard, 100 kHz           = %s\n", err(ret));

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_FAST) | I2C_MODE_CONTROLLER);
	printk("[configure] fast, 400 kHz               = %s\n", err(ret));

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_FAST_PLUS) | I2C_MODE_CONTROLLER);
	printk("[configure] fast plus, 1 MHz            = %s\n", err(ret));

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_STANDARD) | I2C_MODE_CONTROLLER |
				 I2C_ADDR_10_BITS);
	printk("[configure] 10 bit addresses            = %s\n", err(ret));

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_STANDARD));
	printk("[configure] without I2C_MODE_CONTROLLER = %s\n", err(ret));

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_FAST) | I2C_MODE_CONTROLLER);
	printk("[configure] back to fast                = %s\n", err(ret));
}
```

```text
[configure] standard, 100 kHz           = 0
[configure] fast, 400 kHz               = 0
[configure] fast plus, 1 MHz            = -ENOTSUP
[configure] 10 bit addresses            = -ENOTSUP
[configure] without I2C_MODE_CONTROLLER = -ENOTSUP
[configure] back to fast                = 0
```

### i2c_get_config

```c
int i2c_get_config(const struct device *dev, uint32_t *dev_config);
```

Reads the current configuration. The driver does not implement this interface and returns `-ENOSYS`.

```c
/* i2c_get_config is not implemented by this driver */
static void demo_get_config(void)
{
	uint32_t cfg;
	int ret = i2c_get_config(bus, &cfg);

	printk("[configure] i2c_get_config              = %s\n", err(ret));
}
```

```text
[configure] i2c_get_config              = -ENOSYS
```

### i2c_read

```c
int i2c_read(const struct device *dev, uint8_t *buf, uint32_t num_bytes, uint16_t addr);
```

Reads `num_bytes` bytes from `addr`; it is one complete transfer, with a stop condition at the end. When a device does not acknowledge, the call returns `-EIO`, so reading 1 byte from each address is enough to scan the bus:

```c
/* A read of one byte finds out whether a device acknowledges its address. */
static void demo_scan(void)
{
	uint8_t b;
	int found = 0;

	for (uint16_t a = 0x08; a <= 0x77; a++) {
		if (i2c_read(bus, &b, 1, a) == 0) {
			printk("[scan] device at 0x%02x\n", a);
			found++;
		}
	}
	printk("[scan] %d device(s) found\n", found);
}
```

```text
[scan] device at 0x5d
[scan] 1 device(s) found
```

To read a register, first set the register address with `i2c_write`, then use `i2c_read`, with a stop condition in between; the GT967 accepts this, some chips do not and require `i2c_write_read`. Below, 1 byte of `0x8047` (the configuration version) is read, provided the `i2c_write` of the previous step has already set that address:

```c
/* i2c_read: reads the register that the write above selected */
static void demo_read(void)
{
	uint8_t val = 0;
	int ret = i2c_read(bus, &val, 1, ADDR);

	printk("[write+read] i2c_read(1 byte)            = %s: 0x%02x\n", err(ret), val);
}
```

```text
[write+read] i2c_read(1 byte)            = 0: 0x69
```

### i2c_write

```c
int i2c_write(const struct device *dev, const uint8_t *buf, uint32_t num_bytes, uint16_t addr);
```

Writes `num_bytes` bytes to `addr`; it is one complete transfer. What is written here is a 2-byte register address.

```c
/* i2c_write: one complete transfer with a stop at the end. Here it sets the register address. */
static void demo_write(void)
{
	uint8_t reg[2] = { REG_CONFIG_VER >> 8, REG_CONFIG_VER & 0xff };
	int ret = i2c_write(bus, reg, sizeof(reg), ADDR);

	printk("[write+read] i2c_write(register address) = %s\n", err(ret));
}
```

```text
[write+read] i2c_write(register address) = 0
```

(In the log `i2c_write` comes before `i2c_read`, because the read depends on the register address the write has set.)

### i2c_write_read

```c
int i2c_write_read(const struct device *dev, uint16_t addr, const void *write_buf, size_t num_write,
                   void *read_buf, size_t num_read);
```

Writes first and then reads, with a repeated start (restart) between the two and no stop condition in between. This is the standard way to read a register with a 16-bit address.

```c
/* i2c_write_read: write the 16 bit register address, restart, read the value */
static void demo_write_read(void)
{
	uint8_t reg[2] = { REG_PRODUCT_ID >> 8, REG_PRODUCT_ID & 0xff };
	uint8_t id[4] = { 0 };
	int ret;

	ret = i2c_write_read(bus, ADDR, reg, sizeof(reg), id, sizeof(id));
	printk("[write_read] product id register 0x%04x = %s: %02x %02x %02x %02x \"%c%c%c\"\n",
	       REG_PRODUCT_ID, err(ret), id[0], id[1], id[2], id[3], id[0], id[1], id[2]);
}
```

```text
[write_read] product id register 0x8140 = 0: 39 36 37 00 "967"
```

### i2c_burst_read

```c
int i2c_burst_read(const struct device *dev, uint16_t dev_addr, uint8_t start_addr, uint8_t *buf, uint32_t num_bytes);
```

Writes a 1-byte start address, then reads `num_bytes` bytes consecutively. The GT967's register addresses are 16-bit, so this demonstration only shows that the call goes through; for a chip with 16-bit addresses, use `i2c_write_read`.

```c
/* i2c_burst_read: writes a one byte start address, then reads. The GT967 registers have 16 bit
 * addresses, so this only shows that the call goes through; use i2c_write_read for this chip.
 */
static void demo_burst(void)
{
	uint8_t buf[4];
	int ret;

	ret = i2c_burst_read(bus, ADDR, 0x81, buf, sizeof(buf));
	printk("[burst] i2c_burst_read(0x81, 4)       = %s\n", err(ret));
}
```

```text
[burst] i2c_burst_read(0x81, 4)       = 0
```

### i2c_transfer

```c
int i2c_transfer(const struct device *dev, struct i2c_msg *msgs, uint8_t num_msgs, uint16_t addr);
```

Assembles the messages yourself. `flags` decide start, repeated start and stop:

| Flag | Driver behavior |
| --- | --- |
| `I2C_MSG_WRITE`, `I2C_MSG_READ` | Direction |
| `I2C_MSG_RESTART` | Send a repeated start and re-send the address before this message |
| `I2C_MSG_STOP` | Send a stop condition after this message; the last message always sends one in any case |
| `I2C_MSG_ADDR_10_BITS` | `-ENOTSUP` |

An address longer than 7 bits returns `-EINVAL`. Consecutive write messages are merged into the same transfer.

```c
/* i2c_transfer: the messages by hand, flags decide start, restart and stop */
static void demo_transfer(void)
{
	uint8_t reg[2] = { REG_PRODUCT_ID >> 8, REG_PRODUCT_ID & 0xff };
	uint8_t id[4] = { 0 };
	struct i2c_msg msgs[2];
	int ret;

	msgs[0].buf = reg;
	msgs[0].len = sizeof(reg);
	msgs[0].flags = I2C_MSG_WRITE;				/* no stop: the next message restarts */
	msgs[1].buf = id;
	msgs[1].len = sizeof(id);
	msgs[1].flags = I2C_MSG_READ | I2C_MSG_RESTART | I2C_MSG_STOP;

	ret = i2c_transfer(bus, msgs, 2, ADDR);
	printk("[transfer] write + restart + read       = %s: \"%c%c%c\"\n", err(ret), id[0], id[1], id[2]);

	/* a 10 bit address is refused */
	msgs[1].flags |= I2C_MSG_ADDR_10_BITS;
	ret = i2c_transfer(bus, msgs, 2, ADDR);
	printk("[transfer] 10 bit address               = %s\n", err(ret));

	/* an address above 7 bits */
	msgs[1].flags &= ~I2C_MSG_ADDR_10_BITS;
	ret = i2c_transfer(bus, msgs, 2, 0x100);
	printk("[transfer] address 0x100                = %s\n", err(ret));
}
```

```text
[transfer] write + restart + read       = 0: "967"
[transfer] 10 bit address               = -ENOTSUP
[transfer] address 0x100                = -EINVAL
```

### No device acknowledges

When the address is sent and no device acknowledges, the driver returns `-EIO` and issues a stop condition to bring the bus back to idle.

```c
/* a device that is not there does not acknowledge */
static void demo_nack(void)
{
	uint8_t b;
	int ret;

	ret = i2c_read(bus, &b, 1, 0x50);
	printk("[nack] read from 0x50                  = %s\n", err(ret));
	ret = i2c_write(bus, &b, 1, 0x50);
	printk("[nack] write to 0x50                   = %s\n", err(ret));
}
```

```text
[nack] read from 0x50                  = -EIO
[nack] write to 0x50                   = -EIO
```

## The complete demonstration program

All the examples and logs above come from this one program. Create a directory, put the files below into it, and it can be built like any other Zephyr application.

```text
i2c_api/
├── CMakeLists.txt
├── prj.conf
└── src/
    └── main.c
```

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(i2c_api)

target_sources(app PRIVATE src/main.c)
```

### prj.conf

```ini
CONFIG_I2C=y
CONFIG_GPIO=y
CONFIG_PRINTK=y
CONFIG_MAIN_STACK_SIZE=4096
CONFIG_SHELL=n
CONFIG_DEVMEM_SHELL=n
CONFIG_LOG_PRINTK=n
```

### src/main.c

```c
/*
 * Calls the functions of <zephyr/drivers/i2c.h> on I2C1 of the YuzukiNeko,
 * where the touch controller GT967 of the carrier board sits at 0x5d.
 */
#include <errno.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

static const struct device *const bus = DEVICE_DT_GET(DT_NODELABEL(i2c1));
/* the touch controller node of yuzukineko.dts: address and reset/interrupt pins */
#define TOUCH DT_NODELABEL(touch)
static const struct gpio_dt_spec rst = GPIO_DT_SPEC_GET(TOUCH, reset_gpios);
static const struct gpio_dt_spec irq = GPIO_DT_SPEC_GET(TOUCH, irq_gpios);
#define ADDR DT_REG_ADDR(TOUCH)

/* GT967 registers (16 bit addresses, big endian) */
#define REG_PRODUCT_ID	0x8140	/* "967" in ASCII, 4 bytes */
#define REG_CONFIG_VER	0x8047	/* 1 byte */

static const char *err(int ret)
{
	switch (ret) {
	case 0:		return "0";
	case -EIO:	return "-EIO";
	case -ENOTSUP:	return "-ENOTSUP";
	case -EINVAL:	return "-EINVAL";
	case -EAGAIN:	return "-EAGAIN";
	case -ENOSYS:	return "-ENOSYS";
	case -ETIMEDOUT: return "-ETIMEDOUT";
	default:	return "?";
	}
}

/* The controller takes its address from the level of INT at the moment RST is released:
 * INT low gives 0x5d, INT high gives 0x14. A real touch driver does this once at start.
 */
static void touch_reset(void)
{
	gpio_pin_configure_dt(&rst, GPIO_OUTPUT_ACTIVE);	/* RST is active low in the DT: held in reset */
	k_msleep(12);
	gpio_pin_configure_dt(&irq, GPIO_OUTPUT_INACTIVE);	/* INT low selects 0x5d */
	k_msleep(2);
	gpio_pin_set_dt(&rst, 0);				/* released */
	k_msleep(6);
	gpio_pin_configure_dt(&irq, GPIO_INPUT);
	k_msleep(60);
	printk("[reset] released RST with INT low, the controller should answer at 0x%02x\n", ADDR);
}

/* i2c_configure: the speed can be changed at run time */
static void demo_configure(void)
{
	int ret;

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_STANDARD) | I2C_MODE_CONTROLLER);
	printk("[configure] standard, 100 kHz           = %s\n", err(ret));

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_FAST) | I2C_MODE_CONTROLLER);
	printk("[configure] fast, 400 kHz               = %s\n", err(ret));

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_FAST_PLUS) | I2C_MODE_CONTROLLER);
	printk("[configure] fast plus, 1 MHz            = %s\n", err(ret));

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_STANDARD) | I2C_MODE_CONTROLLER |
				 I2C_ADDR_10_BITS);
	printk("[configure] 10 bit addresses            = %s\n", err(ret));

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_STANDARD));
	printk("[configure] without I2C_MODE_CONTROLLER = %s\n", err(ret));

	ret = i2c_configure(bus, I2C_SPEED_SET(I2C_SPEED_FAST) | I2C_MODE_CONTROLLER);
	printk("[configure] back to fast                = %s\n", err(ret));
}

/* i2c_get_config is not implemented by this driver */
static void demo_get_config(void)
{
	uint32_t cfg;
	int ret = i2c_get_config(bus, &cfg);

	printk("[configure] i2c_get_config              = %s\n", err(ret));
}

/* A read of one byte finds out whether a device acknowledges its address. */
static void demo_scan(void)
{
	uint8_t b;
	int found = 0;

	for (uint16_t a = 0x08; a <= 0x77; a++) {
		if (i2c_read(bus, &b, 1, a) == 0) {
			printk("[scan] device at 0x%02x\n", a);
			found++;
		}
	}
	printk("[scan] %d device(s) found\n", found);
}

/* i2c_write_read: write the 16 bit register address, restart, read the value */
static void demo_write_read(void)
{
	uint8_t reg[2] = { REG_PRODUCT_ID >> 8, REG_PRODUCT_ID & 0xff };
	uint8_t id[4] = { 0 };
	int ret;

	ret = i2c_write_read(bus, ADDR, reg, sizeof(reg), id, sizeof(id));
	printk("[write_read] product id register 0x%04x = %s: %02x %02x %02x %02x \"%c%c%c\"\n",
	       REG_PRODUCT_ID, err(ret), id[0], id[1], id[2], id[3], id[0], id[1], id[2]);
}

/* i2c_write: one complete transfer with a stop at the end. Here it sets the register address. */
static void demo_write(void)
{
	uint8_t reg[2] = { REG_CONFIG_VER >> 8, REG_CONFIG_VER & 0xff };
	int ret = i2c_write(bus, reg, sizeof(reg), ADDR);

	printk("[write+read] i2c_write(register address) = %s\n", err(ret));
}

/* i2c_read: reads the register that the write above selected */
static void demo_read(void)
{
	uint8_t val = 0;
	int ret = i2c_read(bus, &val, 1, ADDR);

	printk("[write+read] i2c_read(1 byte)            = %s: 0x%02x\n", err(ret), val);
}

/* i2c_burst_read: writes a one byte start address, then reads. The GT967 registers have 16 bit
 * addresses, so this only shows that the call goes through; use i2c_write_read for this chip.
 */
static void demo_burst(void)
{
	uint8_t buf[4];
	int ret;

	ret = i2c_burst_read(bus, ADDR, 0x81, buf, sizeof(buf));
	printk("[burst] i2c_burst_read(0x81, 4)       = %s\n", err(ret));
}

/* i2c_transfer: the messages by hand, flags decide start, restart and stop */
static void demo_transfer(void)
{
	uint8_t reg[2] = { REG_PRODUCT_ID >> 8, REG_PRODUCT_ID & 0xff };
	uint8_t id[4] = { 0 };
	struct i2c_msg msgs[2];
	int ret;

	msgs[0].buf = reg;
	msgs[0].len = sizeof(reg);
	msgs[0].flags = I2C_MSG_WRITE;				/* no stop: the next message restarts */
	msgs[1].buf = id;
	msgs[1].len = sizeof(id);
	msgs[1].flags = I2C_MSG_READ | I2C_MSG_RESTART | I2C_MSG_STOP;

	ret = i2c_transfer(bus, msgs, 2, ADDR);
	printk("[transfer] write + restart + read       = %s: \"%c%c%c\"\n", err(ret), id[0], id[1], id[2]);

	/* a 10 bit address is refused */
	msgs[1].flags |= I2C_MSG_ADDR_10_BITS;
	ret = i2c_transfer(bus, msgs, 2, ADDR);
	printk("[transfer] 10 bit address               = %s\n", err(ret));

	/* an address above 7 bits */
	msgs[1].flags &= ~I2C_MSG_ADDR_10_BITS;
	ret = i2c_transfer(bus, msgs, 2, 0x100);
	printk("[transfer] address 0x100                = %s\n", err(ret));
}

/* a device that is not there does not acknowledge */
static void demo_nack(void)
{
	uint8_t b;
	int ret;

	ret = i2c_read(bus, &b, 1, 0x50);
	printk("[nack] read from 0x50                  = %s\n", err(ret));
	ret = i2c_write(bus, &b, 1, 0x50);
	printk("[nack] write to 0x50                   = %s\n", err(ret));
}

int main(void)
{
	if (!device_is_ready(bus) || !gpio_is_ready_dt(&rst) || !gpio_is_ready_dt(&irq)) {
		printk("i2c or gpio not ready\n");
		return 0;
	}

	touch_reset();
	demo_configure();
	demo_get_config();
	demo_scan();
	demo_write_read();
	demo_write();
	demo_read();
	demo_burst();
	demo_transfer();
	demo_nack();

	printk("i2c_api done\n");
	return 0;
}
```

### Building and running

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/i2c-api i2c_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-i2c/build.cast" data-speed="6"></div>

For how to download and run it, see [Building and running](../zephyr-build-run.md). The complete output on the console UART1:

```text
[reset] released RST with INT low, the controller should answer at 0x5d
[configure] standard, 100 kHz           = 0
[configure] fast, 400 kHz               = 0
[configure] fast plus, 1 MHz            = -ENOTSUP
[configure] 10 bit addresses            = -ENOTSUP
[configure] without I2C_MODE_CONTROLLER = -ENOTSUP
[configure] back to fast                = 0
[configure] i2c_get_config              = -ENOSYS
[scan] device at 0x5d
[scan] 1 device(s) found
[write_read] product id register 0x8140 = 0: 39 36 37 00 "967"
[write+read] i2c_write(register address) = 0
[write+read] i2c_read(1 byte)            = 0: 0x63
[burst] i2c_burst_read(0x81, 4)       = 0
[transfer] write + restart + read       = 0: "967"
[transfer] 10 bit address               = -ENOTSUP
[transfer] address 0x100                = -EINVAL
[nack] read from 0x50                  = -EIO
[nack] write to 0x50                   = -EIO
i2c_api done
```
