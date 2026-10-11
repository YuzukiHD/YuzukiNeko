---
title: "PWM-BL - analog backlight"
---

PWM_BL is the module on the F101 dedicated to driving the LCD backlight, and it is a device separate from the general-purpose [PWM](pwm.md). It does not produce square waves of arbitrary frequency: it controls two on-chip boost (BOOST) circuits and adjusts the brightness of the backlight LEDs through the size of the "sink current"; dimming has both a digital and an analog form. In Zephyr it is the `pwm_bl` device, the interface is still the standard `<zephyr/drivers/pwm.h>`, and the driver is `drivers/pwm/pwm_sunxi_bl.c`.

| Item | Content |
| --- | --- |
| Ports | Two: port 0 (BOOST0, PWM pin PB2, feedback pin PB3) digital plus analog comparison dimming; port 1 (BOOST1, PWM pin PB0, feedback pin PB1) analog only, 750 kHz |
| Channel | As far as the API is concerned there is only one channel, channel 0, and any other channel returns `-EINVAL`; when setting, the two ports are switched together, and the brightness (sink current) is written only to port 0 |
| Brightness | `pulse × 256 ÷ period` gives the sink current level, maximum 200, 0 switches off |
| Time unit | `pwm_get_cycles_per_sec` returns 1 GHz, so one period is 1 ns and the ratios are exact |
| Polarity | None. There is no polarity in the analog stage, `flags` is ignored |
| Period | The length of the period does not change the output, only the ratio of pulse to period is useful |
| Board | The RGB panel backlight of `f101_evb` is connected here; the backlight of `yuzukineko` is on channel 2 of the general-purpose PWM and does not use PWM_BL |

The demonstration in this page runs on `yuzukineko`: an overlay switches `pwm_bl` on (using only PB2 and PB3, without touching the console on PB0 and PB1), and since no backlight on this board is connected to PWM_BL, the demonstration reads the module's registers back to see the brightness the driver wrote into them, without measuring the output.

## Devicetree

| File | Purpose |
| --- | --- |
| `dts/bindings/pwm/allwinner,sunxi-pwm-bl.yaml` | Binding |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree: the `pwm_bl` node, `disabled` by default |
| `examples/pwm_bl_api/app.overlay` | The application overlay: the pin group, switching `pwm_bl` on, and referencing it from the `zephyr,user` node |

### SoC devicetree: sun252i_f101.dtsi

```c
pwm_bl: pwm@200a000 {
	/* matches DT_DRV_COMPAT allwinner_sunxi_pwm_bl in the driver pwm_sunxi_bl.c */
	compatible = "allwinner,sunxi-pwm-bl";

	/* the pwms property that references it has 3 cells: channel, period (nanoseconds), flags */
	#pwm-cells = <3>;

	/* register window: base 0x0200a000, length 0x400; each of the two ports takes 0x200 */
	reg = <0x0200a000 0x400>;

	/* the driver configures the clock itself: the CCU base address, and the offsets of the PWM_BL module clock, bus gate and reset registers */
	ccu-base = <0x02001000>;
	mod-clk-reg = <0x790>;
	bus-clk-reg = <0x794>;

	status = "disabled";
};
```

### Enabling PWM_BL: app.overlay

The board files of `yuzukineko` do not switch `pwm_bl` on, so the demonstration switches it on from the application overlay. PB0 and PB1 are the UART1 console and cannot be given to PWM_BL, so only PB2 and PB3 are assigned (the PWM and feedback of BOOST0, multiplexing function 2), and a `pwms` property is placed in the `zephyr,user` node:

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

`PWM_POLARITY_INVERTED` is written here only to stay consistent with the other backlight nodes; it has no effect on PWM_BL. For the properties of the `pwm-backlight` node used by the display pipeline, see [Display](display.md) and [PWM](pwm.md).

### Binding: allwinner,sunxi-pwm-bl.yaml

```yaml
# Copyright (c) 2026 Yuzuki Tsuru
# SPDX-License-Identifier: Apache-2.0

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
    description: Base address of the CCU holding the module clock registers.

  mod-clk-reg:
    type: int
    required: true
    description: CCU offset of the PWM_BL module clock register.

  bus-clk-reg:
    type: int
    required: true
    description: CCU offset of the PWM_BL bus gate / reset register.

pwm-cells:
  - channel
  - period
  - flags
```

| Property | Required | Meaning |
| --- | --- | --- |
| `reg` | Yes | Register window |
| `ccu-base` | Yes | Base address of the CCU |
| `mod-clk-reg` | Yes | CCU offset of the PWM_BL module clock register |
| `bus-clk-reg` | Yes | CCU offset of the PWM_BL bus gate and reset register |
| `#pwm-cells` | No | Fixed at 3: channel, period, flags |
| `pinctrl-0`, `pinctrl-names` | No | Pins, see [the pinctrl section of the GPIO page](gpio.md#pin-multiplexing-pinctrl) |

## Kconfig

| Option | Default | Meaning |
| --- | --- | --- |
| `CONFIG_PWM` | `y` in the board defconfig | Switch on the PWM subsystem |
| `CONFIG_PWM_SUNXI_BL` | `y` (depends on `DT_HAS_ALLWINNER_SUNXI_PWM_BL_ENABLED`) | Build this driver, and select `CONFIG_PINCTRL` |
| `CONFIG_PWM_SUNXI_BL_INIT_PRIORITY` | 82 | Initialization priority of the driver |

## How the driver works

At initialization the driver does these things: switches on the bus clock, releases the reset, and sets the module clock to close to 400 MHz after dividing PLL_PERI_2X; applies the `pinctrl`; sets the drive strength of PB0 and PB2 to 3 (on `yuzukineko` PB0 is the console TX, and its drive strength is also changed to 3, without affecting communication); and configures the two ports with fixed parameters:

| Port | Configuration |
| --- | --- |
| Port 1 (BOOST1) | Analog only, 750 kHz, maximum brightness code 2 |
| Port 0 (BOOST0) | Digital plus analog comparison: period 0x215, initially active 0x1a, maximum active 0x140, maximum brightness code 3 |

When setting the brightness (`pwm_set_cycles`): `level = pulse × 256 ÷ period`, not exceeding 200; if the level is not 0 both ports are enabled and the sink current of port 0 is set to this level; if the level is 0 both ports are switched off. The registers read back by the demonstration below:

| Register | Offset (port 0; add 0x200 for port 1) | Content |
| --- | --- | --- |
| `CTRL` | `0x0000` | Bit 0 enables |
| `ANA1` | `0x0054` | Bits 23:16 sink current level, bits 2:0 maximum brightness code |

## API details

Each API below gets its own short heading: the prototype, the driver's behavior, an example function, and its output on the board. The examples come from [the complete demonstration program](#the-complete-demonstration-program) at the end of the page, whose `err()` turns a return value into a name. The function that reads the registers and the macros it uses:

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

Returns how many cycles there are per second: 1 000 000 000, so the values of the pulse and the period are directly in nanoseconds. Only channel 0 exists, any other channel returns `-EINVAL`.

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

The brightness is determined by `pulse / period`. 100% gives 256, clamped to 200; 50% is 128; 5% is 12; 0.5% is 1. The flags are ignored.

| Argument | Return |
| --- | --- |
| Channel other than 0, period 0, or pulse greater than the period | `-EINVAL` |
| Other | 0 |

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

The period and pulse are in nanoseconds (macros such as `PWM_USEC()` and `PWM_MSEC()`). The clock is 1 GHz, so no conversion is needed; whether the period is 20 µs or 1 ms does not affect the result, the same ratio gives the same level.

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

The channel, device and flags come from the `pwms` property in the devicetree. The `bl` of the demonstration comes from `pwms = <&pwm_bl 0 20000 PWM_POLARITY_INVERTED>` in the `zephyr,user` node of the overlay.

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

Uses the period written in the devicetree and supplies only the pulse. A pulse of 0 gives level 0, with both ports switched off, which is the way to turn the backlight off.

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

### Arguments the driver rejects

The driver checks three things, the channel number, the period and the pulse: only channel 0 exists, any other channel returns `-EINVAL` and the registers are left untouched.

```c
/* the arguments the driver refuses */
static void demo_errors(void)
{
	int ret;

	ret = pwm_set_cycles(pwm_bl, 0, 0, 0, 0);
	printk("[error] period 0                                = %s\n", err(ret));

	ret = pwm_set_cycles(pwm_bl, 0, 20000, 20001, 0);
	printk("[error] pulse longer than the period            = %s\n", err(ret));

	ret = pwm_set_cycles(pwm_bl, 5, 20000, 10000, 0);
	printk("[error] channel 5 (only channel 0 exists)       = %s\n", err(ret));
	show_regs();
}
```

```text
[error] period 0                                = -EINVAL
[error] pulse longer than the period            = -EINVAL
[error] channel 5 (the channel is not checked)  = 0
         port 0 enabled 1, port 1 enabled 1, load current level 128 (maximum brightness code 3)
```

## The complete demonstration program

All the examples and logs above come from this one program. Create a directory, put the files below into it, and it can be built like any other Zephyr application.

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

/* the arguments the driver refuses */
static void demo_errors(void)
{
	int ret;

	ret = pwm_set_cycles(pwm_bl, 0, 0, 0, 0);
	printk("[error] period 0                                = %s\n", err(ret));

	ret = pwm_set_cycles(pwm_bl, 0, 20000, 20001, 0);
	printk("[error] pulse longer than the period            = %s\n", err(ret));

	ret = pwm_set_cycles(pwm_bl, 5, 20000, 10000, 0);
	printk("[error] channel 5 (only channel 0 exists)       = %s\n", err(ret));
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

### Building and running

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/pwm-bl-api pwm_bl_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-pwm-bl/build.cast" data-speed="6"></div>

For how to download and run it, see [Building and running](../zephyr-build-run.md). The complete output on the console UART1:

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
[error] channel 5 (only channel 0 exists)       = -EINVAL
         port 0 enabled 0, port 1 enabled 0, load current level 0 (maximum brightness code 3)
pwm_bl_api done
```
