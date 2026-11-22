---
title: "I2C"
---

F101 有 3 个两线接口控制器（TWI），在 Zephyr 里是 `i2c0`、`i2c1`、`i2c2`，接口是标准的 `<zephyr/drivers/i2c.h>`，驱动是 `drivers/i2c/i2c_sunxi.c`。

| 项目 | 内容 |
| --- | --- |
| 设备 | `i2c0`、`i2c1`、`i2c2` |
| 角色 | 只做主机（controller） |
| 速度 | 标准 100 kHz、快速 400 kHz；设备树里还可以写 200 kHz |
| 地址 | 7 位；10 位地址返回 `-ENOTSUP` |
| 传输方式 | 轮询，不用中断；传输期间持有一把互斥锁 |
| 不支持 | 快速+（1 MHz）、从机模式、`i2c_get_config` |

## 设备树

| 文件 | 作用 |
| --- | --- |
| `dts/bindings/i2c/allwinner,sunxi-twi.yaml` | 绑定：规定 `allwinner,sunxi-twi` 节点的属性 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 设备树：`i2c0`、`i2c1`、`i2c2`，默认 `disabled` |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | 板级设备树：打开要用的控制器，指定引脚和速度，挂上从设备 |

### SoC 设备树：sun252i_f101.dtsi

三个节点只有寄存器地址、中断号、时钟和复位不同。下面是 `i2c1`：

```c
i2c1: i2c@2502400 {
	/* 匹配驱动 i2c_sunxi.c 里的 DT_DRV_COMPAT allwinner_sunxi_twi */
	compatible = "allwinner,sunxi-twi";

	/* 子节点（从设备）用 1 个格子的地址，没有大小 */
	#address-cells = <1>;
	#size-cells = <0>;

	/* 寄存器窗口：基址 0x02502400，长度 0x400 */
	reg = <0x02502400 0x400>;

	/* 中断：PLIC 的 10 号，优先级 1（驱动用轮询，不使用） */
	interrupts = <10 1>;
	interrupt-parent = <&plic>;

	/* 总线时钟的开关和总线复位 */
	clocks = <&cctl CLK_BUS_TWI1>;
	resets = <&rctl RST_BUS_TWI1>;

	/* 总线速度，板级文件可以改：100000、200000 或 400000 */
	clock-frequency = <100000>;

	/* 默认关闭，由板级打开 */
	status = "disabled";
};
```

| 节点 | 标签 | 寄存器 | PLIC 中断号 | 时钟宏 | 复位宏 |
| --- | --- | --- | --- | --- | --- |
| `i2c@2502000` | `i2c0` | `0x02502000` | 9 | `CLK_BUS_TWI0` | `RST_BUS_TWI0` |
| `i2c@2502400` | `i2c1` | `0x02502400` | 10 | `CLK_BUS_TWI1` | `RST_BUS_TWI1` |
| `i2c@2502800` | `i2c2` | `0x02502800` | 11 | `CLK_BUS_TWI2` | `RST_BUS_TWI2` |

### 板级设备树：yuzukineko.dts

板级文件做三件事：定义引脚组，打开控制器并绑定引脚，把从设备挂在控制器下面。

```c
&pio {
	/* TWI0 在 PE08/PE09；TWI1 在 PD0/PD1（触摸屏）；TWI2 在 PD10/PD11。复用功能都是 4，打开上拉 */
	twi1_pins: twi1_pins {
		twi1_pins_group {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 0, 4)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 1, 4)>;
			bias-pull-up;
		};
	};
};

/* TWI0 的 PE8/PE9 是蓝牙 UART2 的 RTS/CTS，所以关闭 */
&i2c0 {
	status = "disabled";
	pinctrl-0 = <&twi0_pins>;
	pinctrl-names = "default";
};

/* 载板触摸屏控制器 GT967：SCL 在 PD0，SDA 在 PD1，INT 在 PD2，RST 在 PD3 */
&i2c1 {
	status = "okay";

	/* 400 kHz。I2C_BITRATE_FAST 来自 <zephyr/dt-bindings/i2c/i2c.h> */
	clock-frequency = <I2C_BITRATE_FAST>;

	pinctrl-0 = <&twi1_pins>;
	pinctrl-names = "default";

	/* 从设备：节点名里 @ 后面和 reg 是 7 位地址 */
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

`i2c2` 在板级文件里没有打开；用它时在应用的 overlay 里写 `&i2c2 { status = "okay"; pinctrl-0 = <&twi2_pins>; pinctrl-names = "default"; };`，`twi2_pins` 已经在板级文件里定义好。

### 绑定：allwinner,sunxi-twi.yaml

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

| 属性 | 必填 | 含义 |
| --- | --- | --- |
| `reg` | 是 | 寄存器窗口 |
| `clocks` | 是 | 总线时钟 |
| `resets` | 是 | 总线复位 |
| `clock-frequency` | 是 | 总线速度，只接受 100000、200000、400000，别的值驱动初始化返回 `-ENOTSUP` |
| `pinctrl-0`、`pinctrl-names` | 来自 `pinctrl-device.yaml` | 引脚，见 [GPIO 页的 pinctrl 一节](gpio.md#引脚复用pinctrl) |
| `interrupts` | 否 | 驱动不使用 |

## Kconfig

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `CONFIG_I2C` | 板级 defconfig 里是 `y` | 打开 I2C 子系统 |
| `CONFIG_I2C_SUNXI` | `y`（依赖 `DT_HAS_ALLWINNER_SUNXI_TWI_ENABLED`） | 编译这个驱动，并选中 `CONFIG_PINCTRL` |
| `CONFIG_I2C_SUNXI_INIT_PRIORITY` | 81 | 驱动的初始化优先级 |

## 接口详解

下面每个接口一个小标题：原型、驱动的行为、一个完整的示例函数和它在板子上的输出。演示在 `i2c1` 上，对载板的触摸控制器 GT967 做所有这些调用；示例来自文末的[完整演示程序](#完整演示程序)，里面的 `err()` 把返回值转成名字。

GT967 的寄存器地址是 16 位、大端的，产品 ID 寄存器 `0x8140` 里是 4 字节 ASCII，`"967"` 加一个 0。它在复位释放的瞬间看 INT 引脚的电平选地址：INT 为低是 `0x5d`，为高是 `0x14`。演示程序先用 `touch_reset()` 做这件事，真正的触摸驱动 `drivers/input/input_gt967.c` 也这么做；这个函数只用到 [GPIO](gpio.md) 的接口：

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

运行中改变总线速度。`dev_config` 必须带 `I2C_MODE_CONTROLLER`。

| 参数 | 返回 |
| --- | --- |
| `I2C_SPEED_STANDARD`（100 kHz） | 0 |
| `I2C_SPEED_FAST`（400 kHz） | 0 |
| 其他速度（快速+、高速、超高速） | `-ENOTSUP` |
| 带 `I2C_ADDR_10_BITS` | `-ENOTSUP` |
| 没有 `I2C_MODE_CONTROLLER` | `-ENOTSUP` |

每次调用都会复位控制器、重新设置分频。

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

读当前的配置。驱动没有实现这个接口，返回 `-ENOSYS`。

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

从 `addr` 读 `num_bytes` 个字节，是一次完整的传输，结尾有停止条件。设备不应答返回 `-EIO`，所以对每个地址读 1 个字节就可以扫描总线：

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

读寄存器时，先用 `i2c_write` 设好寄存器地址，再 `i2c_read`，两次之间有停止条件；GT967 接受这种写法，有的芯片不接受，要用 `i2c_write_read`。下面读 `0x8047`（配置版本）的 1 个字节，前提是上一步 `i2c_write` 已经设了这个地址：

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

向 `addr` 写 `num_bytes` 个字节，是一次完整的传输。这里写的是 2 个字节的寄存器地址。

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

（日志里 `i2c_write` 在 `i2c_read` 之前，因为读依赖写设好的寄存器地址。）

### i2c_write_read

```c
int i2c_write_read(const struct device *dev, uint16_t addr, const void *write_buf, size_t num_write,
                   void *read_buf, size_t num_read);
```

先写再读，两段之间是重复起始（restart），中间没有停止条件。这是读 16 位地址寄存器的标准办法。

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

写 1 个字节的起始地址，再连续读 `num_bytes` 个字节。GT967 的寄存器地址是 16 位，所以这个演示只说明调用能通；16 位地址的芯片用 `i2c_write_read`。

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

自己组织消息。`flags` 决定起始、重复起始、停止：

| 标志 | 驱动的行为 |
| --- | --- |
| `I2C_MSG_WRITE`、`I2C_MSG_READ` | 方向 |
| `I2C_MSG_RESTART` | 这条消息前发重复起始并重新发地址 |
| `I2C_MSG_STOP` | 这条消息后发停止条件；最后一条消息无论如何都会发 |
| `I2C_MSG_ADDR_10_BITS` | `-ENOTSUP` |

地址超过 7 位返回 `-EINVAL`。连续的写消息合并成同一次传输。

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

### 没有设备应答

地址发出去没有设备应答，驱动返回 `-EIO`，并且发出停止条件让总线回到空闲。

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

## 完整演示程序

上面所有示例和日志都来自这一个程序。建一个目录，放进下面的文件，就可以像其他 Zephyr 应用一样编译。

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

### 编译和运行

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/i2c-api i2c_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-i2c/build.cast" data-speed="6"></div>

下载运行的方法见[编译与运行](../zephyr-build-run.md)。控制台 UART1 上的完整输出：

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
