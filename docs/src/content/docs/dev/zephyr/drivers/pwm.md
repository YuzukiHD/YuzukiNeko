---
title: "PWM"
---

The general-purpose PWM of the F101 is the `pwm` device in Zephyr, with 4 channels, a standard `<zephyr/drivers/pwm.h>` interface and the driver `drivers/pwm/pwm_sunxi.c`. The `yuzukineko` board uses its channel 2 (PD22) to drive the backlight of the DSI display. The backlight-specific PWM_BL module (analog dimming, current sink) is a separate device, see [PWM-BL - analog backlight](pwm-bl.md).

| Item | Content |
| --- | --- |
| Channels | 0…3 |
| Reference clock | The unit of the period and the pulse is the cycle of 24 MHz, `pwm_get_cycles_per_sec` returns 24000000 |
| Clock source | A period of no more than 334 ns uses 100 MHz, otherwise 24 MHz |
| Divider | M divider 1, 2, 4…256, plus an 8-bit prescaler 1…256 and a 16-bit count 1…65536 |
| Polarity | `PWM_POLARITY_NORMAL`, `PWM_POLARITY_INVERTED` |
| Stop | A pulse of 0 turns the output off and gates the clock of that channel |
| Unsupported | Flags other than the polarity (`-ENOTSUP`), input capture |

## Devicetree

| File | Purpose |
| --- | --- |
| `dts/bindings/pwm/allwinner,sunxi-pwm.yaml` | Binding |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree: `pwm`, `disabled` by default |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | Board devicetree: the pin group, enables `pwm`, the backlight node references it |

### SoC devicetree: sun252i_f101.dtsi

```c
pwm: pwm@2000c00 {
	/* Matches DT_DRV_COMPAT allwinner_sunxi_pwm in the driver pwm_sunxi.c */
	compatible = "allwinner,sunxi-pwm";

	/* A pwms property that references it has 3 cells: channel, period (nanoseconds), flags */
	#pwm-cells = <3>;

	/* Register window: base address 0x02000c00, length 0x400 */
	reg = <0x02000c00 0x400>;

	/* Number of channels, fixed at 4 */
	channels = <4>;

	/* Bus clock and reset */
	clocks = <&cctl CLK_BUS_PWM>;
	resets = <&rctl RST_BUS_PWM>;

	status = "disabled";
};
```

### Board devicetree: yuzukineko.dts

```c
&pio {
	/* PWM0-2 is on PD22, multiplexing function 4, driving the backlight of the DSI panel on the carrier board */
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
	/* Backlight: channel 2, period 1 ms (1 kHz), inverted polarity (lit by a low level) */
	backlight_dsi: backlight-dsi {
		compatible = "pwm-backlight";
		pwms = <&pwm 2 1000000 PWM_POLARITY_INVERTED>;
		max-level = <255>;
		default-level = <96>;
	};
};
```

The three numbers in `pwms = <&pwm 2 1000000 PWM_POLARITY_INVERTED>` are the channel, the period (1 000 000 ns) and the flags that `#pwm-cells = <3>` prescribes. Other peripherals reference the PWM with the same notation, and an application takes it out with `PWM_DT_SPEC_GET()`.

### Binding

`allwinner,sunxi-pwm.yaml`:

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

| Property | Required | Meaning |
| --- | --- | --- |
| `reg` | Yes | Register window |
| `clocks` | Yes | Bus clock |
| `resets` | Yes | Bus reset |
| `channels` | No | Number of channels, fixed at 4 |
| `#pwm-cells` | No | Fixed at 3: channel, period, flags |
| `pinctrl-0`, `pinctrl-names` | No | Pins, see [the pinctrl section of the GPIO page](gpio.md#pin-multiplexing-pinctrl) |

The properties of the backlight node `pwm-backlight` (`dts/bindings/display/sunxi/pwm-backlight.yaml`):

| Property | Required | Meaning |
| --- | --- | --- |
| `pwms` | Yes | PWM channel, period (nanoseconds), flags |
| `max-level` | No, 255 | Maximum brightness level |
| `default-level` | No, 255 | Brightness level at boot |
| `min-level` | No, 0 | Minimum brightness, in units of 1/`max-level` |
| `enable-gpios` | No | GPIO that switches the backlight power |

## Kconfig

| Option | Default | Meaning |
| --- | --- | --- |
| `CONFIG_PWM` | `y` in the board defconfig | Enables the PWM subsystem |
| `CONFIG_PWM_SUNXI` | `y` (depends on `DT_HAS_ALLWINNER_SUNXI_PWM_ENABLED`) | Builds the general-purpose PWM driver and selects `CONFIG_PINCTRL` |
| `CONFIG_PWM_SUNXI_INIT_PRIORITY` | 82 | Initialization priority of the driver |

## API reference

Each interface below has a subheading of its own: the prototype, what the driver does, the example function and its output on the board. The demos use channel 2. It is the channel of the display backlight, so the screen brightness follows every call: first 10%, 50%, 90%, then back to the default level. The examples come from the [complete demo program](#complete-demo-program) at the end, whose `err()` turns the return value into a name.

After each call the program reads the registers of the channel back and prints the values the driver actually programmed: the clock source, the M divider, the prescaler, the polarity, the period count and the active count. Output period = clock source frequency ÷ M divider ÷ prescaler ÷ period count. The function that reads the registers and the macros it uses:

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

Returns the unit of "period" in `pwm_set_cycles`, how many cycles per second: 24000000. A channel number above 3 returns `-EINVAL`.

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

The unit of the period and the pulse is the cycle of 24 MHz, so `24000` cycles are 1 ms. With `PWM_POLARITY_INVERTED` the pulse is the low part of the period. The first call also turns the channel on.

| Argument | Return |
| --- | --- |
| Channel ≥ 4, period 0, pulse longer than the period | `-EINVAL` |
| A flag other than the polarity | `-ENOTSUP` |
| A period that does not fit into the 16-bit count plus divider | `-ERANGE` |

#### Example: different duty cycles and polarities

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

#### Example: arguments the driver refuses

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

The period and the pulse are in nanoseconds, written with macros such as `PWM_USEC()`, `PWM_MSEC()` and `PWM_SEC()`. The API first converts them to cycles of 24 MHz (rounded down) and hands them to `pwm_set_cycles`, so short periods are rounded: 200 ns is 4.8 cycles, rounded to 4 cycles (166.7 ns); a period shorter than one cycle (41.7 ns) converts to 0 and returns `-EINVAL`.

The driver picks the clock from the period automatically: a period of no more than 334 ns uses the 100 MHz clock source, which counts more finely; otherwise it uses 24 MHz, searching from M divider 1 up through the prescaler for the first combination into which the 16-bit count fits. A 50 Hz servo signal uses prescaler 8, and 0.5 Hz uses M divider 4 with prescaler 184.

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

The last call returns `-EINVAL`, and the registers of the channel keep the values of the previous call.

### pwm_set_dt

```c
int pwm_set_dt(const struct pwm_dt_spec *spec, uint32_t period, uint32_t pulse);
```

The channel, the device and the polarity come from the `pwms` property of the devicetree node, so an application need not hard-code the channel number; the period and the pulse are in nanoseconds. `spec` is taken with `PWM_DT_SPEC_GET(node)`:

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

Uses the period written in the devicetree node (`backlight_dsi` is 1 ms) and gives only the pulse. A pulse of 0 is the way to stop PWM in Zephyr: the driver clears the enable bit of the channel and gates its clock, and a non-zero pulse sets it going again.

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

## Complete demo program

All the examples and logs above come from this one program. Create a directory, put the files below into it, and it builds like any other Zephyr application.

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

### Build and run

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/pwm-api pwm_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-pwm/build.cast" data-speed="6"></div>

See [Build and run](../zephyr-build-run.md) for how to download and run it. The complete output on the console UART1 (the screen brightness changes while it runs):

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
