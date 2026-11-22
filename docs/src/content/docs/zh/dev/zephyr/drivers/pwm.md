---
title: "PWM"
---

F101 的通用 PWM 在 Zephyr 里是 `pwm` 设备，4 个通道，接口是标准的 `<zephyr/drivers/pwm.h>`，驱动是 `drivers/pwm/pwm_sunxi.c`。`yuzukineko` 板用它的通道 2（PD22）驱动 DSI 屏的背光。背光专用的 PWM_BL 模块（模拟调光、灌电流）是另一个独立的设备，见 [PWM-BL - 模拟背光](pwm-bl.md)。

| 项目 | 内容 |
| --- | --- |
| 通道 | 0…3 |
| 参考时钟 | 周期和脉宽的单位是 24 MHz 的周期，`pwm_get_cycles_per_sec` 返回 24000000 |
| 时钟源 | 周期不超过 334 ns 用 100 MHz，否则用 24 MHz |
| 分频 | M 分频 1、2、4…256，再加 8 位预分频 1…256，16 位计数 1…65536 |
| 极性 | `PWM_POLARITY_NORMAL`、`PWM_POLARITY_INVERTED` |
| 停止 | 脉宽为 0 时关闭输出并关掉该通道的时钟门 |
| 不支持 | 极性以外的标志（`-ENOTSUP`），输入捕获 |

## 设备树

| 文件 | 作用 |
| --- | --- |
| `dts/bindings/pwm/allwinner,sunxi-pwm.yaml` | 绑定 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 设备树：`pwm`，默认 `disabled` |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | 板级设备树：引脚组，打开 `pwm`，背光节点引用它 |

### SoC 设备树：sun252i_f101.dtsi

```c
pwm: pwm@2000c00 {
	/* 匹配驱动 pwm_sunxi.c 里的 DT_DRV_COMPAT allwinner_sunxi_pwm */
	compatible = "allwinner,sunxi-pwm";

	/* 引用它的 pwms 属性有 3 个格子：通道、周期（纳秒）、标志 */
	#pwm-cells = <3>;

	/* 寄存器窗口：基址 0x02000c00，长度 0x400 */
	reg = <0x02000c00 0x400>;

	/* 通道数，固定为 4 */
	channels = <4>;

	/* 总线时钟和复位 */
	clocks = <&cctl CLK_BUS_PWM>;
	resets = <&rctl RST_BUS_PWM>;

	status = "disabled";
};
```

### 板级设备树：yuzukineko.dts

```c
&pio {
	/* PWM0-2 在 PD22，复用功能 4，接载板上 DSI 屏的背光 */
	pwm0_pins: pwm0_pins {
		pwm0_group {
			pinmux = <ALLWINNER_PINMUX(ALLWINNER_PIO_PD, 22, 4)>;
		};
	};
};

&pwm {
	status = "okay";
	pinctrl-0 = <&pwm0_pins>;
	pinctrl-names = "default";
};

/ {
	/* 背光：通道 2，周期 1 ms（1 kHz），极性反相（低电平点亮） */
	backlight_dsi: backlight-dsi {
		compatible = "pwm-backlight";
		pwms = <&pwm 2 1000000 PWM_POLARITY_INVERTED>;
		max-level = <255>;
		default-level = <96>;
	};
};
```

`pwms = <&pwm 2 1000000 PWM_POLARITY_INVERTED>` 里的三个数就是 `#pwm-cells = <3>` 规定的通道、周期（1 000 000 ns）和标志。别的外设用同样的写法引用 PWM，应用里 `PWM_DT_SPEC_GET()` 取出来。

### 绑定

`allwinner,sunxi-pwm.yaml`：

```yaml
# Copyright (c) 2026 Yuzuki Tsuru
# SPDX-License-Identifier: Apache-2.0

description: Allwinner sunxi PWM-ng controller

compatible: "allwinner,sunxi-pwm"

include: [pwm-controller.yaml, base.yaml, reset-device.yaml, pinctrl-device.yaml]

properties:
  reg:
    required: true

  clocks:
    required: true

  resets:
    required: true

  channels:
    type: int
    const: 4

  "#pwm-cells":
    const: 3

pwm-cells:
  - channel
  - period
  - flags
```

| 属性 | 必填 | 含义 |
| --- | --- | --- |
| `reg` | 是 | 寄存器窗口 |
| `clocks` | 是 | 总线时钟 |
| `resets` | 是 | 总线复位 |
| `channels` | 否 | 通道数，固定为 4 |
| `#pwm-cells` | 否 | 固定为 3：通道、周期、标志 |
| `pinctrl-0`、`pinctrl-names` | 否 | 引脚，见 [GPIO 页的 pinctrl 一节](gpio.md#引脚复用pinctrl) |

背光节点 `pwm-backlight`（`dts/bindings/display/sunxi/pwm-backlight.yaml`）的属性：

| 属性 | 必填 | 含义 |
| --- | --- | --- |
| `pwms` | 是 | PWM 通道、周期（纳秒）、标志 |
| `max-level` | 否，255 | 最大亮度级 |
| `default-level` | 否，255 | 启动时的亮度级 |
| `min-level` | 否，0 | 最低亮度，单位是 1/`max-level` |
| `enable-gpios` | 否 | 开关背光电源的 GPIO |

## Kconfig

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `CONFIG_PWM` | 板级 defconfig 里是 `y` | 打开 PWM 子系统 |
| `CONFIG_PWM_SUNXI` | `y`（依赖 `DT_HAS_ALLWINNER_SUNXI_PWM_ENABLED`） | 编译通用 PWM 驱动，并选中 `CONFIG_PINCTRL` |
| `CONFIG_PWM_SUNXI_INIT_PRIORITY` | 82 | 驱动的初始化优先级 |

## 接口详解

下面每个接口一个小标题：原型、驱动的行为、示例函数和它在板子上的输出。演示用通道 2。它就是显示背光的通道，所以每一次调用屏幕亮度都会跟着变：先 10%、50%、90%，再回到默认亮度。示例来自文末的[完整演示程序](#完整演示程序)，里面的 `err()` 把返回值转成名字。

每次调用后程序读回通道的寄存器，打印驱动实际编程的值：时钟源、M 分频、预分频、极性、周期计数和有效计数。输出周期 = 时钟源频率 ÷ M 分频 ÷ 预分频 ÷ 周期计数。读寄存器的函数和用到的宏：

```c
#define CH	2U

#define PWM_BASE	DT_REG_ADDR(DT_NODELABEL(pwm))
#define REG_PER		0x80			/* channel enable bits */
#define REG_PCGR	0x40			/* clock gate bits */
#define REG_PCCR	(0x20 + (CH / 2) * 4)	/* clock source and divider of channel 2 and 3 */
#define REG_PCR		(0x100 + CH * 0x20)	/* prescaler and polarity */
#define REG_PPR		(0x104 + CH * 0x20)	/* period and active count */

/* what the driver wrote: enable bit, divider M, prescaler, polarity, counts of the period */
static void show_regs(void)
{
	uint32_t per = sys_read32(PWM_BASE + REG_PER);
	uint32_t pccr = sys_read32(PWM_BASE + REG_PCCR);
	uint32_t pcr = sys_read32(PWM_BASE + REG_PCR);
	uint32_t ppr = sys_read32(PWM_BASE + REG_PPR);

	printk("         enabled %u, clock source %u, divider 1/%u, prescaler %u, %s, period %u counts, active %u counts\n",
	       !!(per & BIT(CH)), (pccr >> 7) & 3, 1U << (pccr & 15), (pcr & 0xff) + 1,
	       (pcr & BIT(8)) ? "inverted" : "normal", (ppr >> 16) + 1, ppr & 0xffff);
}
```

### pwm_get_cycles_per_sec

```c
int pwm_get_cycles_per_sec(const struct device *dev, uint32_t channel, uint64_t *cycles);
```

返回 `pwm_set_cycles` 里“周期”的单位，每秒多少个周期：24000000。通道号超过 3 返回 `-EINVAL`。

```c
/* pwm_get_cycles_per_sec: the unit of the cycles of pwm_set_cycles */
static void demo_cycles_per_sec(void)
{
	uint64_t hz;
	int ret;

	ret = pwm_get_cycles_per_sec(pwm, CH, &hz);
	printk("[clock] pwm_get_cycles_per_sec(channel %u) = %s, %u Hz\n", CH, err(ret), (uint32_t)hz);

	ret = pwm_get_cycles_per_sec(pwm, 4, &hz);
	printk("[clock] pwm_get_cycles_per_sec(channel 4) = %s\n", err(ret));
}
```

```text
[clock] pwm_get_cycles_per_sec(channel 2) = 0, 24000000 Hz
[clock] pwm_get_cycles_per_sec(channel 4) = -EINVAL
```

### pwm_set_cycles

```c
int pwm_set_cycles(const struct device *dev, uint32_t channel, uint32_t period, uint32_t pulse, pwm_flags_t flags);
```

周期和脉宽的单位是 24 MHz 的周期，`24000` 个周期就是 1 ms。`PWM_POLARITY_INVERTED` 时脉宽是周期里的低电平部分。第一次调用同时打开通道。

| 参数 | 返回 |
| --- | --- |
| 通道 ≥ 4、周期 0、脉宽大于周期 | `-EINVAL` |
| 极性以外的标志 | `-ENOTSUP` |
| 周期换算不进 16 位计数加分频 | `-ERANGE` |

#### 示例：不同的占空比和极性

```c
/* pwm_set_cycles: period and pulse in cycles of the 24 MHz reference clock. 24000 cycles are
 * 1 ms, a frequency of 1 kHz. PWM_POLARITY_INVERTED makes the pulse the low part of the period,
 * which is how the backlight of the board is wired (low = on).
 */
static void demo_set_cycles(void)
{
	static const uint32_t pulse[] = { 2400, 12000, 21600 };
	int ret;

	for (int i = 0; i < ARRAY_SIZE(pulse); i++) {
		ret = pwm_set_cycles(pwm, CH, 24000, pulse[i], PWM_POLARITY_INVERTED);
		printk("[cycles] 1 kHz, pulse %5u of 24000 (%2u%%), inverted = %s\n", pulse[i],
		       pulse[i] * 100 / 24000, err(ret));
		show_regs();
		k_msleep(1000);
	}

	ret = pwm_set_cycles(pwm, CH, 24000, 12000, PWM_POLARITY_NORMAL);
	printk("[cycles] 1 kHz, 50%%, normal polarity            = %s\n", err(ret));
	show_regs();
	k_msleep(500);
}
```

```text
[cycles] 1 kHz, pulse  2400 of 24000 (10%), inverted = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 2400 counts
[cycles] 1 kHz, pulse 12000 of 24000 (50%), inverted = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 12000 counts
[cycles] 1 kHz, pulse 21600 of 24000 (90%), inverted = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 21600 counts
[cycles] 1 kHz, 50%, normal polarity            = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, normal, period 24000 counts, active 12000 counts
```

#### 示例：驱动拒绝的参数

```c
/* what the driver refuses */
static void demo_errors(void)
{
	int ret;

	ret = pwm_set_cycles(pwm, 4, 24000, 12000, 0);
	printk("[error] channel 4                       = %s\n", err(ret));

	ret = pwm_set_cycles(pwm, CH, 0, 0, 0);
	printk("[error] period 0                        = %s\n", err(ret));

	ret = pwm_set_cycles(pwm, CH, 24000, 24001, 0);
	printk("[error] pulse longer than the period    = %s\n", err(ret));

	ret = pwm_set_cycles(pwm, CH, 24000, 12000, BIT(1));
	printk("[error] a flag other than the polarity  = %s\n", err(ret));

	ret = pwm_set_cycles(pwm, CH, 1, 1, 0);
	printk("[error] period of 1 cycle (41.7 ns)     = %s\n", err(ret));
}
```

```text
[error] channel 4                       = -EINVAL
[error] period 0                        = -EINVAL
[error] pulse longer than the period    = -EINVAL
[error] a flag other than the polarity  = -ENOTSUP
[error] period of 1 cycle (41.7 ns)     = 0
```

### pwm_set

```c
int pwm_set(const struct device *dev, uint32_t channel, uint32_t period, uint32_t pulse, pwm_flags_t flags);
```

周期和脉宽用纳秒，用 `PWM_USEC()`、`PWM_MSEC()`、`PWM_SEC()` 这些宏写。API 先按 24 MHz 换算成周期数（向下取整），再交给 `pwm_set_cycles`，所以短周期会被取整：200 ns 是 4.8 个周期，取整成 4 个周期（166.7 ns）；比一个周期（41.7 ns）还短的周期换算成 0，返回 `-EINVAL`。

驱动按周期自动选时钟：周期不超过 334 ns 用 100 MHz 的时钟源，计数更细；否则用 24 MHz，从 M 分频 1 开始，一直到预分频，找到第一个使 16 位计数放得下的组合。50 Hz 的舵机信号用预分频 8，0.5 Hz 用 M 分频 4 加预分频 184。

```c
/* pwm_set: the same in nanoseconds; the API converts to cycles of the 24 MHz reference, and a period
 * shorter than one cycle (41.7 ns) becomes 0 cycles and is refused.
 */
static void demo_set(void)
{
	int ret;

	ret = pwm_set(pwm, CH, PWM_USEC(100), PWM_USEC(25), PWM_POLARITY_NORMAL);
	printk("[set] 10 kHz, 25%%                                = %s\n", err(ret));
	show_regs();

	ret = pwm_set(pwm, CH, PWM_MSEC(20), PWM_USEC(1500), PWM_POLARITY_NORMAL);
	printk("[set] 50 Hz, 1.5 ms (a servo in the middle)      = %s\n", err(ret));
	show_regs();

	ret = pwm_set(pwm, CH, PWM_SEC(2), PWM_SEC(1), PWM_POLARITY_NORMAL);
	printk("[set] 0.5 Hz, 50%%                                = %s\n", err(ret));
	show_regs();

	ret = pwm_set(pwm, CH, 200, 100, PWM_POLARITY_NORMAL);
	printk("[set] 200 ns period (5 MHz), 50%%                 = %s\n", err(ret));
	show_regs();

	ret = pwm_set(pwm, CH, 10, 5, PWM_POLARITY_NORMAL);
	printk("[set] 10 ns period (less than one 24 MHz cycle) = %s\n", err(ret));
	show_regs();
}
```

```text
[set] 10 kHz, 25%                                = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, normal, period 2400 counts, active 600 counts
[set] 50 Hz, 1.5 ms (a servo in the middle)      = 0
         enabled 1, clock source 0, divider 1/1, prescaler 8, normal, period 60000 counts, active 4500 counts
[set] 0.5 Hz, 50%                                = 0
         enabled 1, clock source 0, divider 1/4, prescaler 184, normal, period 65217 counts, active 32608 counts
[set] 200 ns period (5 MHz), 50%                 = 0
         enabled 1, clock source 1, divider 1/1, prescaler 1, normal, period 17 counts, active 8 counts
[set] 10 ns period (less than one 24 MHz cycle) = -EINVAL
         enabled 1, clock source 1, divider 1/1, prescaler 1, normal, period 17 counts, active 8 counts
```

最后一次返回 `-EINVAL`，通道的寄存器保持上一次的值。

### pwm_set_dt

```c
int pwm_set_dt(const struct pwm_dt_spec *spec, uint32_t period, uint32_t pulse);
```

通道、设备和极性来自设备树节点的 `pwms` 属性，应用里不用写死通道号；周期和脉宽用纳秒。`spec` 用 `PWM_DT_SPEC_GET(node)` 取：

```c
static const struct pwm_dt_spec bl = PWM_DT_SPEC_GET(DT_NODELABEL(backlight_dsi));

/* pwm_set_dt: period and pulse, with the channel and the polarity from the devicetree node */
static void demo_set_dt(void)
{
	int ret = pwm_set_dt(&bl, bl.period, bl.period * 3 / 4);

	printk("[dt] pwm_set_dt(period, 3/4 of it)               = %s\n", err(ret));
	show_regs();
	k_msleep(1000);
}
```

```text
[dt] pwm_set_dt(period, 3/4 of it)               = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 18000 counts
```

### pwm_set_pulse_dt

```c
int pwm_set_pulse_dt(const struct pwm_dt_spec *spec, uint32_t pulse);
```

用设备树节点里写的周期（`backlight_dsi` 是 1 ms），只给脉宽。脉宽为 0 是 Zephyr 里停止 PWM 的办法：驱动关掉通道的使能位和时钟门，再设一个非 0 的脉宽就重新打开。

```c
/* pwm_set_pulse_dt: the channel, period and polarity come from the pwms property of the devicetree
 * node, only the pulse is given
 */
static void demo_set_pulse_dt(void)
{
	int ret;

	printk("[dt] backlight_dsi: channel %u, period %u ns, flags 0x%x\n", bl.channel, bl.period,
	       bl.flags);

	ret = pwm_set_pulse_dt(&bl, bl.period / 4);
	printk("[dt] pwm_set_pulse_dt(period / 4)                = %s\n", err(ret));
	show_regs();
	k_msleep(1000);
}

/* a pulse of 0 stops the output and gates the channel's clock */
static void demo_stop(void)
{
	int ret;

	ret = pwm_set_pulse_dt(&bl, 0);
	printk("[stop] pulse 0                                  = %s\n", err(ret));
	show_regs();
	k_msleep(1000);

	/* back to the default level of the backlight node: 96 of 255, inverted */
	ret = pwm_set_pulse_dt(&bl, bl.period * 96 / 255);
	printk("[stop] pulse 96/255 of the period (the default) = %s\n", err(ret));
	show_regs();
}
```

```text
[dt] backlight_dsi: channel 2, period 1000000 ns, flags 0x1
[dt] pwm_set_pulse_dt(period / 4)                = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 6000 counts
[stop] pulse 0                                  = 0
         enabled 0, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 18000 counts
[stop] pulse 96/255 of the period (the default) = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 9035 counts
```

## 完整演示程序

上面所有示例和日志都来自这一个程序。建一个目录，放进下面的文件，就可以像其他 Zephyr 应用一样编译。

```text
pwm_api/
├── CMakeLists.txt
├── prj.conf
└── src/
    └── main.c
```

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(pwm_api)

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

### src/main.c

```c
/*
 * Calls the functions of <zephyr/drivers/pwm.h> on the PWM of the YuzukiNeko. Channel 2 is on PD22
 * and drives the backlight of the display (node backlight_dsi), so the screen brightness follows
 * the calls. The registers of the channel are printed after each call to show what the driver
 * programmed.
 */
#include <errno.h>
#include <zephyr/device.h>
#include <zephyr/drivers/pwm.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/sys_io.h>

static const struct device *const pwm = DEVICE_DT_GET(DT_NODELABEL(pwm));
/* channel, period and flags of the backlight, from the pwms property of its node */
static const struct pwm_dt_spec bl = PWM_DT_SPEC_GET(DT_NODELABEL(backlight_dsi));

#define CH	2U

#define PWM_BASE	DT_REG_ADDR(DT_NODELABEL(pwm))
#define REG_PER		0x80			/* channel enable bits */
#define REG_PCGR	0x40			/* clock gate bits */
#define REG_PCCR	(0x20 + (CH / 2) * 4)	/* clock source and divider of channel 2 and 3 */
#define REG_PCR		(0x100 + CH * 0x20)	/* prescaler and polarity */
#define REG_PPR		(0x104 + CH * 0x20)	/* period and active count */

static const char *err(int ret)
{
	switch (ret) {
	case 0:		return "0";
	case -EINVAL:	return "-EINVAL";
	case -ENOTSUP:	return "-ENOTSUP";
	case -ERANGE:	return "-ERANGE";
	default:	return "?";
	}
}

/* what the driver wrote: enable bit, divider M, prescaler, polarity, counts of the period */
static void show_regs(void)
{
	uint32_t per = sys_read32(PWM_BASE + REG_PER);
	uint32_t pccr = sys_read32(PWM_BASE + REG_PCCR);
	uint32_t pcr = sys_read32(PWM_BASE + REG_PCR);
	uint32_t ppr = sys_read32(PWM_BASE + REG_PPR);

	printk("         enabled %u, clock source %u, divider 1/%u, prescaler %u, %s, period %u counts, active %u counts\n",
	       !!(per & BIT(CH)), (pccr >> 7) & 3, 1U << (pccr & 15), (pcr & 0xff) + 1,
	       (pcr & BIT(8)) ? "inverted" : "normal", (ppr >> 16) + 1, ppr & 0xffff);
}

/* pwm_get_cycles_per_sec: the unit of the cycles of pwm_set_cycles */
static void demo_cycles_per_sec(void)
{
	uint64_t hz;
	int ret;

	ret = pwm_get_cycles_per_sec(pwm, CH, &hz);
	printk("[clock] pwm_get_cycles_per_sec(channel %u) = %s, %u Hz\n", CH, err(ret), (uint32_t)hz);

	ret = pwm_get_cycles_per_sec(pwm, 4, &hz);
	printk("[clock] pwm_get_cycles_per_sec(channel 4) = %s\n", err(ret));
}

/* pwm_set_cycles: period and pulse in cycles of the 24 MHz reference clock. 24000 cycles are
 * 1 ms, a frequency of 1 kHz. PWM_POLARITY_INVERTED makes the pulse the low part of the period,
 * which is how the backlight of the board is wired (low = on).
 */
static void demo_set_cycles(void)
{
	static const uint32_t pulse[] = { 2400, 12000, 21600 };
	int ret;

	for (int i = 0; i < ARRAY_SIZE(pulse); i++) {
		ret = pwm_set_cycles(pwm, CH, 24000, pulse[i], PWM_POLARITY_INVERTED);
		printk("[cycles] 1 kHz, pulse %5u of 24000 (%2u%%), inverted = %s\n", pulse[i],
		       pulse[i] * 100 / 24000, err(ret));
		show_regs();
		k_msleep(1000);
	}

	ret = pwm_set_cycles(pwm, CH, 24000, 12000, PWM_POLARITY_NORMAL);
	printk("[cycles] 1 kHz, 50%%, normal polarity            = %s\n", err(ret));
	show_regs();
	k_msleep(500);
}

/* pwm_set: the same in nanoseconds; the API converts to cycles of the 24 MHz reference, and a period
 * shorter than one cycle (41.7 ns) becomes 0 cycles and is refused.
 */
static void demo_set(void)
{
	int ret;

	ret = pwm_set(pwm, CH, PWM_USEC(100), PWM_USEC(25), PWM_POLARITY_NORMAL);
	printk("[set] 10 kHz, 25%%                                = %s\n", err(ret));
	show_regs();

	ret = pwm_set(pwm, CH, PWM_MSEC(20), PWM_USEC(1500), PWM_POLARITY_NORMAL);
	printk("[set] 50 Hz, 1.5 ms (a servo in the middle)      = %s\n", err(ret));
	show_regs();

	ret = pwm_set(pwm, CH, PWM_SEC(2), PWM_SEC(1), PWM_POLARITY_NORMAL);
	printk("[set] 0.5 Hz, 50%%                                = %s\n", err(ret));
	show_regs();

	ret = pwm_set(pwm, CH, 200, 100, PWM_POLARITY_NORMAL);
	printk("[set] 200 ns period (5 MHz), 50%%                 = %s\n", err(ret));
	show_regs();

	ret = pwm_set(pwm, CH, 10, 5, PWM_POLARITY_NORMAL);
	printk("[set] 10 ns period (less than one 24 MHz cycle) = %s\n", err(ret));
	show_regs();
}

/* pwm_set_pulse_dt: the channel, period and polarity come from the pwms property of the devicetree
 * node, only the pulse is given
 */
static void demo_set_pulse_dt(void)
{
	int ret;

	printk("[dt] backlight_dsi: channel %u, period %u ns, flags 0x%x\n", bl.channel, bl.period,
	       bl.flags);

	ret = pwm_set_pulse_dt(&bl, bl.period / 4);
	printk("[dt] pwm_set_pulse_dt(period / 4)                = %s\n", err(ret));
	show_regs();
	k_msleep(1000);
}

/* pwm_set_dt: period and pulse, with the channel and the polarity from the devicetree node */
static void demo_set_dt(void)
{
	int ret = pwm_set_dt(&bl, bl.period, bl.period * 3 / 4);

	printk("[dt] pwm_set_dt(period, 3/4 of it)               = %s\n", err(ret));
	show_regs();
	k_msleep(1000);
}

/* a pulse of 0 stops the output and gates the channel's clock */
static void demo_stop(void)
{
	int ret;

	ret = pwm_set_pulse_dt(&bl, 0);
	printk("[stop] pulse 0                                  = %s\n", err(ret));
	show_regs();
	k_msleep(1000);

	/* back to the default level of the backlight node: 96 of 255, inverted */
	ret = pwm_set_pulse_dt(&bl, bl.period * 96 / 255);
	printk("[stop] pulse 96/255 of the period (the default) = %s\n", err(ret));
	show_regs();
}

/* what the driver refuses */
static void demo_errors(void)
{
	int ret;

	ret = pwm_set_cycles(pwm, 4, 24000, 12000, 0);
	printk("[error] channel 4                       = %s\n", err(ret));

	ret = pwm_set_cycles(pwm, CH, 0, 0, 0);
	printk("[error] period 0                        = %s\n", err(ret));

	ret = pwm_set_cycles(pwm, CH, 24000, 24001, 0);
	printk("[error] pulse longer than the period    = %s\n", err(ret));

	ret = pwm_set_cycles(pwm, CH, 24000, 12000, BIT(1));
	printk("[error] a flag other than the polarity  = %s\n", err(ret));

	ret = pwm_set_cycles(pwm, CH, 1, 1, 0);
	printk("[error] period of 1 cycle (41.7 ns)     = %s\n", err(ret));
}

int main(void)
{
	if (!device_is_ready(pwm)) {
		printk("pwm not ready\n");
		return 0;
	}

	demo_cycles_per_sec();
	demo_set_cycles();
	demo_set();
	demo_set_pulse_dt();
	demo_set_dt();
	demo_stop();
	demo_errors();

	/* leave the backlight on */
	pwm_set_pulse_dt(&bl, bl.period * 96 / 255);
	printk("pwm_api done\n");
	return 0;
}
```

### 编译和运行

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/pwm-api pwm_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-pwm/build.cast" data-speed="6"></div>

下载运行的方法见[编译与运行](../zephyr-build-run.md)。控制台 UART1 上的完整输出（运行期间屏幕亮度会变化）：

```text
[clock] pwm_get_cycles_per_sec(channel 2) = 0, 24000000 Hz
[clock] pwm_get_cycles_per_sec(channel 4) = -EINVAL
[cycles] 1 kHz, pulse  2400 of 24000 (10%), inverted = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 2400 counts
[cycles] 1 kHz, pulse 12000 of 24000 (50%), inverted = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 12000 counts
[cycles] 1 kHz, pulse 21600 of 24000 (90%), inverted = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 21600 counts
[cycles] 1 kHz, 50%, normal polarity            = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, normal, period 24000 counts, active 12000 counts
[set] 10 kHz, 25%                                = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, normal, period 2400 counts, active 600 counts
[set] 50 Hz, 1.5 ms (a servo in the middle)      = 0
         enabled 1, clock source 0, divider 1/1, prescaler 8, normal, period 60000 counts, active 4500 counts
[set] 0.5 Hz, 50%                                = 0
         enabled 1, clock source 0, divider 1/4, prescaler 184, normal, period 65217 counts, active 32608 counts
[set] 200 ns period (5 MHz), 50%                 = 0
         enabled 1, clock source 1, divider 1/1, prescaler 1, normal, period 17 counts, active 8 counts
[set] 10 ns period (less than one 24 MHz cycle) = -EINVAL
         enabled 1, clock source 1, divider 1/1, prescaler 1, normal, period 17 counts, active 8 counts
[dt] backlight_dsi: channel 2, period 1000000 ns, flags 0x1
[dt] pwm_set_pulse_dt(period / 4)                = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 6000 counts
[dt] pwm_set_dt(period, 3/4 of it)               = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 18000 counts
[stop] pulse 0                                  = 0
         enabled 0, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 18000 counts
[stop] pulse 96/255 of the period (the default) = 0
         enabled 1, clock source 0, divider 1/1, prescaler 1, inverted, period 24000 counts, active 9035 counts
[error] channel 4                       = -EINVAL
[error] period 0                        = -EINVAL
[error] pulse longer than the period    = -EINVAL
[error] a flag other than the polarity  = -ENOTSUP
[error] period of 1 cycle (41.7 ns)     = 0
pwm_api done
```
