---
title: "PWM-BL - 模拟背光"
---

PWM_BL 是 F101 上专门驱动 LCD 背光的模块，和通用的 [PWM](pwm.md) 是两个独立的设备。它不产生任意频率的方波：它控制片内的两个升压（BOOST）电路，通过“灌电流”的大小调节背光 LED 的亮度，调光有数字加模拟两种方式。在 Zephyr 里它是 `pwm_bl` 设备，接口仍然是标准的 `<zephyr/drivers/pwm.h>`，驱动是 `drivers/pwm/pwm_sunxi_bl.c`。

| 项目 | 内容 |
| --- | --- |
| 端口 | 两个：端口 0（BOOST0，PWM 脚 PB2，反馈脚 PB3）数字加模拟比较调光；端口 1（BOOST1，PWM 脚 PB0，反馈脚 PB1）纯模拟，750 kHz |
| 通道 | 对 API 只有一个通道，通道 0；设置时两个端口一起开关，亮度（灌电流）只写端口 0 |
| 亮度 | `脉宽 × 256 ÷ 周期` 得到灌电流级别，最大 200，0 关闭 |
| 计时单位 | `pwm_get_cycles_per_sec` 返回 1 GHz，一个周期是 1 ns，比例精确 |
| 极性 | 没有。模拟级没有极性，`flags` 被忽略 |
| 周期 | 周期的长短不改变输出，只有脉宽和周期的比值有用 |
| 板子 | `f101_evb` 的 RGB 屏背光接在这里；`yuzukineko` 的背光在通用 PWM 的通道 2，不用 PWM_BL |

本页的演示在 `yuzukineko` 上运行：用 overlay 把 `pwm_bl` 打开（只用 PB2、PB3，不动 PB0、PB1 的控制台），这块板上没有接 PWM_BL 的背光，所以演示读回模块的寄存器来看驱动写进去的亮度，没有测输出。

## 设备树

| 文件 | 作用 |
| --- | --- |
| `dts/bindings/pwm/allwinner,sunxi-pwm-bl.yaml` | 绑定 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 设备树：`pwm_bl` 节点，默认 `disabled` |
| `boards/yuzukihd/f101_evb/f101_evb.dts` | 板级设备树：引脚组，打开 `pwm_bl`，背光节点引用它 |

### SoC 设备树：sun252i_f101.dtsi

```c
pwm_bl: pwm@200a000 {
	/* 匹配驱动 pwm_sunxi_bl.c 里的 DT_DRV_COMPAT allwinner_sunxi_pwm_bl */
	compatible = "allwinner,sunxi-pwm-bl";

	/* 引用它的 pwms 属性有 3 个格子：通道、周期（纳秒）、标志 */
	#pwm-cells = <3>;

	/* 寄存器窗口：基址 0x0200a000，长度 0x400；两个端口各占 0x200 */
	reg = <0x0200a000 0x400>;

	/* 驱动自己配置时钟：CCU 的基址，PWM_BL 模块时钟、总线门控和复位寄存器的偏移 */
	ccu-base = <0x02001000>;
	mod-clk-reg = <0x790>;
	bus-clk-reg = <0x794>;

	status = "disabled";
};
```

### 板级设备树：f101_evb.dts

```c
&pio {
	/* PWM_BL 在 PB0…PB3，复用功能 2：PB0/PB1 是 BOOST1 的 PWM 和反馈，PB2/PB3 是 BOOST0 的 */
	pwm_bl_pins: pwm_bl_pins {
		pwm_bl_group {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 0, 2)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 1, 2)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 2, 2)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 3, 2)>;
		};
	};
};

&pwm_bl {
	status = "okay";
	pinctrl-0 = <&pwm_bl_pins>;
	pinctrl-names = "default";
};

/ {
	/* 背光：通道 0，周期 20 us，启动亮度 250（满量程 255） */
	backlight0: backlight {
		compatible = "pwm-backlight";
		pwms = <&pwm_bl 0 20000 PWM_POLARITY_INVERTED>;
		max-level = <255>;
		default-level = <250>;
	};
};
```

`pwm-backlight` 节点是显示流水线用的背光（`panel-simple` 的 `backlight` 属性指向它），它的属性见 [显示](display.md) 和 [PWM](pwm.md)。`PWM_POLARITY_INVERTED` 写在这里只是和别的背光节点保持一致，对 PWM_BL 没有影响。

`yuzukineko` 上 PB0、PB1 是 UART1 控制台，不能给 PWM_BL。用 PWM_BL 做演示时只用 PB2、PB3，写在应用的 overlay 里（见后面的完整演示程序）。

### 绑定：allwinner,sunxi-pwm-bl.yaml

```yaml
description: |
  Allwinner PWM_BL backlight controller (digital dimming + analog current
  sink). Single logical channel 0; the duty is mapped to a load current
  reference.

compatible: "allwinner,sunxi-pwm-bl"

include: [pwm-controller.yaml, pinctrl-device.yaml, base.yaml]

properties:
  reg:
    required: true
  "#pwm-cells":
    const: 3
  ccu-base:
    type: int
    required: true
  mod-clk-reg:
    type: int
    required: true
  bus-clk-reg:
    type: int
    required: true

pwm-cells:
  - channel
  - period
  - flags
```

| 属性 | 必填 | 含义 |
| --- | --- | --- |
| `reg` | 是 | 寄存器窗口 |
| `ccu-base` | 是 | CCU 的基址 |
| `mod-clk-reg` | 是 | PWM_BL 模块时钟寄存器在 CCU 里的偏移 |
| `bus-clk-reg` | 是 | PWM_BL 总线门控和复位寄存器在 CCU 里的偏移 |
| `#pwm-cells` | 否 | 固定为 3：通道、周期、标志 |
| `pinctrl-0`、`pinctrl-names` | 否 | 引脚，见 [GPIO 页的 pinctrl 一节](gpio.md#引脚复用pinctrl) |

## Kconfig

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `CONFIG_PWM` | 板级 defconfig 里是 `y` | 打开 PWM 子系统 |
| `CONFIG_PWM_SUNXI_BL` | `y`（依赖 `DT_HAS_ALLWINNER_SUNXI_PWM_BL_ENABLED`） | 编译这个驱动，并选中 `CONFIG_PINCTRL` |
| `CONFIG_PWM_SUNXI_BL_INIT_PRIORITY` | 82 | 驱动的初始化优先级 |

## 驱动怎么工作

初始化时驱动做这些事：打开总线时钟、释放复位，把模块时钟设成 PLL_PERI_2X 分频后接近 400 MHz；应用 `pinctrl`；PB0 和 PB2 的驱动能力设为 3；按固定的参数配置两个端口：

| 端口 | 配置 |
| --- | --- |
| 端口 1（BOOST1） | 纯模拟，750 kHz，最大亮度代码 2 |
| 端口 0（BOOST0） | 数字加模拟比较：周期 0x215，初始有效 0x1a，最大有效 0x140，最大亮度代码 3 |

设置亮度时（`pwm_set_cycles`）：`级别 = 脉宽 × 256 ÷ 周期`，不超过 200；级别非 0 就使能两个端口，端口 0 的灌电流设为这个级别；级别是 0 就关闭两个端口。下面的演示读回的寄存器：

| 寄存器 | 偏移（端口 0，端口 1 加 0x200） | 内容 |
| --- | --- | --- |
| `CTRL` | `0x0000` | 位 0 使能 |
| `ANA1` | `0x0054` | 位 23:16 灌电流级别，位 2:0 最大亮度代码 |

## 接口详解

下面每个接口一个小标题：原型、驱动的行为、示例函数和它在板子上的输出。示例来自文末的[完整演示程序](#完整演示程序)，里面的 `err()` 把返回值转成名字。读寄存器的函数和用到的宏：

```c
#define BASE		DT_REG_ADDR(DT_NODELABEL(pwm_bl))
#define PORT_STRIDE	0x200
#define REG_CTRL	0x0000		/* bit 0 enable, bit 1 clock gating, bit 2 digital + analog */
#define REG_PRD		0x0008		/* period of the digital dimming */
#define REG_ANA1	0x0054		/* bits 23:16 load current level, bits 2:0 maximum brightness */

/* what the driver wrote: enable bits of the two ports, the load current level of port 0 */
static void show_regs(void)
{
	uint32_t ctrl0 = sys_read32(BASE + REG_CTRL);
	uint32_t ctrl1 = sys_read32(BASE + PORT_STRIDE + REG_CTRL);
	uint32_t ana1 = sys_read32(BASE + REG_ANA1);

	printk("         port 0 enabled %u, port 1 enabled %u, load current level %u (maximum brightness code %u)\n",
	       ctrl0 & 1, ctrl1 & 1, (ana1 >> 16) & 0xff, ana1 & 7);
}
```

### pwm_get_cycles_per_sec

```c
int pwm_get_cycles_per_sec(const struct device *dev, uint32_t channel, uint64_t *cycles);
```

返回每秒多少个周期：1 000 000 000，所以脉宽和周期的数值直接就是纳秒。只有通道 0，别的通道返回 `-EINVAL`。

```c
/* pwm_get_cycles_per_sec: 1 GHz, so a cycle is a nanosecond and the ratios are exact */
static void demo_cycles_per_sec(void)
{
	uint64_t hz;
	int ret;

	ret = pwm_get_cycles_per_sec(pwm_bl, 0, &hz);
	printk("[clock] pwm_get_cycles_per_sec(channel 0)   = %s, %u Hz\n", err(ret), (uint32_t)hz);

	ret = pwm_get_cycles_per_sec(pwm_bl, 1, &hz);
	printk("[clock] pwm_get_cycles_per_sec(channel 1)   = %s\n", err(ret));
}
```

```text
[clock] pwm_get_cycles_per_sec(channel 0)   = 0, 1000000000 Hz
[clock] pwm_get_cycles_per_sec(channel 1)   = -EINVAL
```

### pwm_set_cycles

```c
int pwm_set_cycles(const struct device *dev, uint32_t channel, uint32_t period, uint32_t pulse, pwm_flags_t flags);
```

亮度由 `pulse / period` 决定。100% 得到 256，被限制到 200；50% 是 128；5% 是 12；0.5% 是 1。通道号和标志都被忽略。

| 参数 | 返回 |
| --- | --- |
| 周期 0，或脉宽大于周期 | `-EINVAL` |
| 其他 | 0 |

```c
/* pwm_set_cycles: the level is pulse * 256 / period; 200 is the maximum, a level of 0 switches the
 * block off. The flags are ignored, there is no polarity.
 */
static void demo_set_cycles(void)
{
	static const uint32_t pulse[] = { 20000, 10000, 5000, 1000, 100 };
	int ret;

	for (int i = 0; i < ARRAY_SIZE(pulse); i++) {
		ret = pwm_set_cycles(pwm_bl, 0, 20000, pulse[i], 0);
		printk("[cycles] pulse %5u of 20000 (%3u%%)         = %s\n", pulse[i], pulse[i] * 100 / 20000,
		       err(ret));
		show_regs();
	}
}
```

```text
[cycles] pulse 20000 of 20000 (100%)         = 0
         port 0 enabled 1, port 1 enabled 1, load current level 200 (maximum brightness code 3)
[cycles] pulse 10000 of 20000 ( 50%)         = 0
         port 0 enabled 1, port 1 enabled 1, load current level 128 (maximum brightness code 3)
[cycles] pulse  5000 of 20000 ( 25%)         = 0
         port 0 enabled 1, port 1 enabled 1, load current level 64 (maximum brightness code 3)
[cycles] pulse  1000 of 20000 (  5%)         = 0
         port 0 enabled 1, port 1 enabled 1, load current level 12 (maximum brightness code 3)
[cycles] pulse   100 of 20000 (  0%)         = 0
         port 0 enabled 1, port 1 enabled 1, load current level 1 (maximum brightness code 3)
```

### pwm_set

```c
int pwm_set(const struct device *dev, uint32_t channel, uint32_t period, uint32_t pulse, pwm_flags_t flags);
```

周期和脉宽用纳秒（`PWM_USEC()`、`PWM_MSEC()` 等宏）。时钟是 1 GHz，所以不需要换算；周期是 20 µs 还是 1 ms 不影响结果，比值一样级别就一样。

```c
/* pwm_set: the same in nanoseconds; the period does not change the output, only the ratio does */
static void demo_set(void)
{
	int ret;

	ret = pwm_set(pwm_bl, 0, PWM_USEC(20), PWM_USEC(10), PWM_POLARITY_NORMAL);
	printk("[set] 20 us period, 10 us pulse                 = %s\n", err(ret));
	show_regs();

	ret = pwm_set(pwm_bl, 0, PWM_MSEC(1), PWM_USEC(500), PWM_POLARITY_INVERTED);
	printk("[set] 1 ms period, 500 us pulse, inverted       = %s\n", err(ret));
	show_regs();
}
```

```text
[set] 20 us period, 10 us pulse                 = 0
         port 0 enabled 1, port 1 enabled 1, load current level 128 (maximum brightness code 3)
[set] 1 ms period, 500 us pulse, inverted       = 0
         port 0 enabled 1, port 1 enabled 1, load current level 128 (maximum brightness code 3)
```

### pwm_set_dt

```c
int pwm_set_dt(const struct pwm_dt_spec *spec, uint32_t period, uint32_t pulse);
```

通道、设备和标志来自设备树的 `pwms` 属性。演示的 `bl` 取自 overlay 里 `zephyr,user` 节点的 `pwms = <&pwm_bl 0 20000 PWM_POLARITY_INVERTED>`。

```c
static const struct device *const pwm_bl = DEVICE_DT_GET(DT_NODELABEL(pwm_bl));

/* pwm_set_dt: channel, period and flags from the pwms property of the zephyr,user node */
static void demo_set_dt(void)
{
	int ret = pwm_set_dt(&bl, bl.period, bl.period / 4);

	printk("[dt] channel %u, period %u ns, flags 0x%x\n", bl.channel, bl.period, bl.flags);
	printk("[dt] pwm_set_dt(period, 1/4 of it)              = %s\n", err(ret));
	show_regs();
}
```

```text
[dt] channel 0, period 20000 ns, flags 0x1
[dt] pwm_set_dt(period, 1/4 of it)              = 0
         port 0 enabled 1, port 1 enabled 1, load current level 64 (maximum brightness code 3)
```

### pwm_set_pulse_dt

```c
int pwm_set_pulse_dt(const struct pwm_dt_spec *spec, uint32_t pulse);
```

用设备树里写的周期，只给脉宽。脉宽 0 得到级别 0，两个端口都关闭，这是关背光的办法。

```c
/* pwm_set_pulse_dt: only the pulse; 0 switches the backlight off */
static void demo_set_pulse_dt(void)
{
	int ret = pwm_set_pulse_dt(&bl, bl.period * 3 / 4);

	printk("[dt] pwm_set_pulse_dt(3/4 of the period)        = %s\n", err(ret));
	show_regs();

	ret = pwm_set_pulse_dt(&bl, 0);
	printk("[dt] pwm_set_pulse_dt(0)                        = %s\n", err(ret));
	show_regs();
}
```

```text
[dt] pwm_set_pulse_dt(3/4 of the period)        = 0
         port 0 enabled 1, port 1 enabled 1, load current level 192 (maximum brightness code 3)
[dt] pwm_set_pulse_dt(0)                        = 0
         port 0 enabled 0, port 1 enabled 0, load current level 0 (maximum brightness code 3)
```

### 驱动拒绝的参数

驱动只检查周期和脉宽两项；通道号不检查，通道 5 也一样当通道 0 处理。

```c
/* the only arguments the driver refuses */
static void demo_errors(void)
{
	int ret;

	ret = pwm_set_cycles(pwm_bl, 0, 0, 0, 0);
	printk("[error] period 0                                = %s\n", err(ret));

	ret = pwm_set_cycles(pwm_bl, 0, 20000, 20001, 0);
	printk("[error] pulse longer than the period            = %s\n", err(ret));

	ret = pwm_set_cycles(pwm_bl, 5, 20000, 10000, 0);
	printk("[error] channel 5 (the channel is not checked)  = %s\n", err(ret));
	show_regs();
}
```

```text
[error] period 0                                = -EINVAL
[error] pulse longer than the period            = -EINVAL
[error] channel 5 (the channel is not checked)  = 0
         port 0 enabled 1, port 1 enabled 1, load current level 128 (maximum brightness code 3)
```

## 完整演示程序

上面所有示例和日志都来自这一个程序。建一个目录，放进下面的文件，就可以像其他 Zephyr 应用一样编译。

```text
pwm_bl_api/
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
project(pwm_bl_api)

target_sources(app PRIVATE src/main.c)
```

### prj.conf

```ini
CONFIG_PWM=y
CONFIG_PRINTK=y
CONFIG_MAIN_STACK_SIZE=4096
CONFIG_SHELL=n
CONFIG_DEVMEM_SHELL=n
CONFIG_LOG_PRINTK=n
```

### app.overlay

```c
/*
 * The PWM_BL block is not used by the yuzukineko board (its panel backlight is on PWM channel 2).
 * It is switched on here for the demonstration, on PB2 (PWM) and PB3 (FB) of the first boost
 * converter, and not on PB0/PB1, which carry the console.
 */
&pio {
	pwm_bl_pins_app: pwm_bl_pins_app {
		pwm_bl_group {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 2, 2)
				  ALLWINNER_PINMUX(ALLWINNER_PIO_PB, 3, 2)>;
		};
	};
};

&pwm_bl {
	status = "okay";
	pinctrl-0 = <&pwm_bl_pins_app>;
	pinctrl-names = "default";
};

/ {
	zephyr,user {
		/* channel 0, period 20 us, like the backlight node of the f101_evb board */
		pwms = <&pwm_bl 0 20000 PWM_POLARITY_INVERTED>;
	};
};
```

### src/main.c

```c
/*
 * Calls the functions of <zephyr/drivers/pwm.h> on the PWM_BL backlight block. The block is
 * not a PWM that makes square waves of any frequency: the duty ratio (pulse / period) is turned into a
 * load current level, 0..200, of the boost converter. The registers of the block are printed after
 * each call to show the level.
 */
#include <errno.h>
#include <zephyr/device.h>
#include <zephyr/drivers/pwm.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/sys_io.h>

static const struct device *const pwm_bl = DEVICE_DT_GET(DT_NODELABEL(pwm_bl));
static const struct pwm_dt_spec bl = PWM_DT_SPEC_GET(DT_PATH(zephyr_user));

#define BASE		DT_REG_ADDR(DT_NODELABEL(pwm_bl))
#define PORT_STRIDE	0x200
#define REG_CTRL	0x0000		/* bit 0 enable, bit 1 clock gating, bit 2 digital + analog */
#define REG_PRD		0x0008		/* period of the digital dimming */
#define REG_ANA1	0x0054		/* bits 23:16 load current level, bits 2:0 maximum brightness */

static const char *err(int ret)
{
	switch (ret) {
	case 0:		return "0";
	case -EINVAL:	return "-EINVAL";
	default:	return "?";
	}
}

/* what the driver wrote: enable bits of the two ports, the load current level of port 0 */
static void show_regs(void)
{
	uint32_t ctrl0 = sys_read32(BASE + REG_CTRL);
	uint32_t ctrl1 = sys_read32(BASE + PORT_STRIDE + REG_CTRL);
	uint32_t ana1 = sys_read32(BASE + REG_ANA1);

	printk("         port 0 enabled %u, port 1 enabled %u, load current level %u (maximum brightness code %u)\n",
	       ctrl0 & 1, ctrl1 & 1, (ana1 >> 16) & 0xff, ana1 & 7);
}

/* pwm_get_cycles_per_sec: 1 GHz, so a cycle is a nanosecond and the ratios are exact */
static void demo_cycles_per_sec(void)
{
	uint64_t hz;
	int ret;

	ret = pwm_get_cycles_per_sec(pwm_bl, 0, &hz);
	printk("[clock] pwm_get_cycles_per_sec(channel 0)   = %s, %u Hz\n", err(ret), (uint32_t)hz);

	ret = pwm_get_cycles_per_sec(pwm_bl, 1, &hz);
	printk("[clock] pwm_get_cycles_per_sec(channel 1)   = %s\n", err(ret));
}

/* pwm_set_cycles: the level is pulse * 256 / period; 200 is the maximum, a level of 0 switches the
 * block off. The flags are ignored, there is no polarity.
 */
static void demo_set_cycles(void)
{
	static const uint32_t pulse[] = { 20000, 10000, 5000, 1000, 100 };
	int ret;

	for (int i = 0; i < ARRAY_SIZE(pulse); i++) {
		ret = pwm_set_cycles(pwm_bl, 0, 20000, pulse[i], 0);
		printk("[cycles] pulse %5u of 20000 (%3u%%)         = %s\n", pulse[i], pulse[i] * 100 / 20000,
		       err(ret));
		show_regs();
	}
}

/* pwm_set: the same in nanoseconds; the period does not change the output, only the ratio does */
static void demo_set(void)
{
	int ret;

	ret = pwm_set(pwm_bl, 0, PWM_USEC(20), PWM_USEC(10), PWM_POLARITY_NORMAL);
	printk("[set] 20 us period, 10 us pulse                 = %s\n", err(ret));
	show_regs();

	ret = pwm_set(pwm_bl, 0, PWM_MSEC(1), PWM_USEC(500), PWM_POLARITY_INVERTED);
	printk("[set] 1 ms period, 500 us pulse, inverted       = %s\n", err(ret));
	show_regs();
}

/* pwm_set_dt: channel, period and flags from the pwms property of the zephyr,user node */
static void demo_set_dt(void)
{
	int ret = pwm_set_dt(&bl, bl.period, bl.period / 4);

	printk("[dt] channel %u, period %u ns, flags 0x%x\n", bl.channel, bl.period, bl.flags);
	printk("[dt] pwm_set_dt(period, 1/4 of it)              = %s\n", err(ret));
	show_regs();
}

/* pwm_set_pulse_dt: only the pulse; 0 switches the backlight off */
static void demo_set_pulse_dt(void)
{
	int ret = pwm_set_pulse_dt(&bl, bl.period * 3 / 4);

	printk("[dt] pwm_set_pulse_dt(3/4 of the period)        = %s\n", err(ret));
	show_regs();

	ret = pwm_set_pulse_dt(&bl, 0);
	printk("[dt] pwm_set_pulse_dt(0)                        = %s\n", err(ret));
	show_regs();
}

/* the only arguments the driver refuses */
static void demo_errors(void)
{
	int ret;

	ret = pwm_set_cycles(pwm_bl, 0, 0, 0, 0);
	printk("[error] period 0                                = %s\n", err(ret));

	ret = pwm_set_cycles(pwm_bl, 0, 20000, 20001, 0);
	printk("[error] pulse longer than the period            = %s\n", err(ret));

	ret = pwm_set_cycles(pwm_bl, 5, 20000, 10000, 0);
	printk("[error] channel 5 (the channel is not checked)  = %s\n", err(ret));
	show_regs();
}

int main(void)
{
	if (!device_is_ready(pwm_bl)) {
		printk("pwm_bl not ready\n");
		return 0;
	}

	demo_cycles_per_sec();
	demo_set_cycles();
	demo_set();
	demo_set_dt();
	demo_set_pulse_dt();
	demo_errors();

	pwm_set_pulse_dt(&bl, 0);
	printk("pwm_bl_api done\n");
	return 0;
}
```

### 编译和运行

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/pwm-bl-api pwm_bl_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-pwm-bl/build.cast" data-speed="6"></div>

下载运行的方法见[编译与运行](../zephyr-build-run.md)。控制台 UART1 上的完整输出：

```text
[clock] pwm_get_cycles_per_sec(channel 0)   = 0, 1000000000 Hz
[clock] pwm_get_cycles_per_sec(channel 1)   = -EINVAL
[cycles] pulse 20000 of 20000 (100%)         = 0
         port 0 enabled 1, port 1 enabled 1, load current level 200 (maximum brightness code 3)
[cycles] pulse 10000 of 20000 ( 50%)         = 0
         port 0 enabled 1, port 1 enabled 1, load current level 128 (maximum brightness code 3)
[cycles] pulse  5000 of 20000 ( 25%)         = 0
         port 0 enabled 1, port 1 enabled 1, load current level 64 (maximum brightness code 3)
[cycles] pulse  1000 of 20000 (  5%)         = 0
         port 0 enabled 1, port 1 enabled 1, load current level 12 (maximum brightness code 3)
[cycles] pulse   100 of 20000 (  0%)         = 0
         port 0 enabled 1, port 1 enabled 1, load current level 1 (maximum brightness code 3)
[set] 20 us period, 10 us pulse                 = 0
         port 0 enabled 1, port 1 enabled 1, load current level 128 (maximum brightness code 3)
[set] 1 ms period, 500 us pulse, inverted       = 0
         port 0 enabled 1, port 1 enabled 1, load current level 128 (maximum brightness code 3)
[dt] channel 0, period 20000 ns, flags 0x1
[dt] pwm_set_dt(period, 1/4 of it)              = 0
         port 0 enabled 1, port 1 enabled 1, load current level 64 (maximum brightness code 3)
[dt] pwm_set_pulse_dt(3/4 of the period)        = 0
         port 0 enabled 1, port 1 enabled 1, load current level 192 (maximum brightness code 3)
[dt] pwm_set_pulse_dt(0)                        = 0
         port 0 enabled 0, port 1 enabled 0, load current level 0 (maximum brightness code 3)
[error] period 0                                = -EINVAL
[error] pulse longer than the period            = -EINVAL
[error] channel 5 (the channel is not checked)  = 0
         port 0 enabled 1, port 1 enabled 1, load current level 128 (maximum brightness code 3)
pwm_bl_api done
```
