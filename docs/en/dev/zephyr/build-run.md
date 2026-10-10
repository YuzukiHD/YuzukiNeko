# Build and Run

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
