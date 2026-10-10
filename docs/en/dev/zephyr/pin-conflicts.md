# Pin Conflicts

## Pin Conflicts

The pinmux encoding is `ALLWINNER_PINMUX(port, num, mux)`. Before enabling a peripheral, check the whole compiled `zephyr.dts` for conflicts, for example:

- The LCD uses `PD0..PD21`, so enabling `dbi` / `pwm` / `i2c0` at the same time conflicts.
- The SD card and JTAG share `PF0/1/3/5` (JTAG is mux 4).
- `PE2` is the USB VBUS switch and shares `PE0..PE4` with I2S0 and SDC2.

When debugging, `grep` the boot log for `[E]` / `[W]` lines; do not rely on the boot merely "looking normal".
