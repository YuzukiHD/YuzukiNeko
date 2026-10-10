# Zephyr

Zephyr support for the F101 lives in the F101 west workspace: the SoC (`sun252i_f101`), the device tree, the `yuzukineko` board, and drivers for clock/reset, pinctrl, GPIO, I2C, SPI, PWM, ADC, DMA, watchdog, display, audio, USB, SD card, G2D, video decoding, and more. This page explains how to build and run programs on the YuzukiNeko.

!> The Zephyr board and driver code is in the F101 workspace, not in the YuzukiNeko hardware repository. All commands below are run from the workspace root.

## Boards

| Board name | Description |
| --- | --- |
| `yuzukineko` | This board: console on **UART1 (PB00/PB01)**; SD card (SMHC0), USB, audio, G2D, video engine, RGB panel, etc. |
| `f101_evb` | Allwinner F101 evaluation board, console on UART3 (PE08/PE09), plus a backlight |

This board has **no backlight wired**: `PB0`/`PB1` are reserved for the UART1 console, so the `yuzukineko` board has no PWM backlight.

## Building

```bash
. ./env.sh                      # activates .venv, sets ZEPHYR_BASE, CROSS_COMPILE, PATH
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

Output is in `build/hello/zephyr/zephyr.{elf,bin}`. The image is linked at `0x40010000` (entry `__start`), and the toolchain is XuanTie 900 newlib GCC (`ZEPHYR_TOOLCHAIN_VARIANT=cross-compile`).

## Loading and Running via FEL

On a board that is already in FEL:

```sh
xfel ddr f101-s3
xfel write 0x40010000 zephyr.bin
xfel exec 0x40010000
```

Key points:

- **Every download needs a fresh power-up into FEL**; FEL is no longer available after `exec`.
- The helper program of the `ddr` step also sets up the UART clock and pin multiplexing; without it the console prints nothing.
- Booting via xfel skips boot0/u-boot, so the early SoC initialization has to set up the CPU CSRs and the console clock itself.
- Do not use `xfel read32` / `hexdump` to inspect state after `exec`; the USB link is dead. State can only be inspected before `exec`.
- After a fresh power-up, confirm FEL with `xfel version` (the output contains `AWUSBFEX ID=0x00193700(F101)`). Seeing `usb bulk send/recv error` after `exec` means the CPU has left the BROM and code is running; it does not mean Zephyr is healthy.

## Console

The `yuzukineko` console is `PB00` / `PB01` of UART1, 115200 8N1. Connect the RX/TX of a USB-to-serial adapter to these two pins and share ground. If there is no output, first prove the path with a small bare-metal program (linked at `0x40010000`, polling the UART and writing the transmit register), to separate "execution, serial port, wiring" from "Zephyr itself".

## Pin Conflicts

The pinmux encoding is `ALLWINNER_PINMUX(port, num, mux)`. Before enabling a peripheral, check the whole compiled `zephyr.dts` for conflicts, for example:

- The LCD uses `PD0..PD21`, so enabling `dbi` / `pwm` / `i2c0` at the same time conflicts.
- The SD card and JTAG share `PF0/1/3/5` (JTAG is mux 4).
- `PE2` is the USB VBUS switch and shares `PE0..PE4` with I2S0 and SDC2.

When debugging, `grep` the boot log for `[E]` / `[W]` lines; do not rely on the boot merely "looking normal".

## Samples

| Sample | Content |
| --- | --- |
| `samples/hello_world` | Minimal example |
| `samples/drivers/display` | Display stack |
| `samples/drivers/g2d` | G2D accelerator |
| `samples/drivers/audio/sunxi_tone` | On-chip codec tone and microphone |
| `samples/drivers/usb/cherryusb_cdc_acm` | USB device (CDC ACM) |
| `samples/drivers/usb/cherryusb_host` | USB host |
| `samples/drivers/mp4_player` | MP4 playback |

Self-checking samples print `PASS (0 failures)` on their last line.

?> This board has only one USB-C port, which is both the xfel download port and the USB host/device port. Download over the PC cable first, then switch to the peripheral.
