# Linux Development

Linux on the F101 consists of three parts, with the boot chain BROM → SyterKit → OpenSBI → Linux → BusyBox:

- **Linux**: the open-source operating system kernel, responsible for processes, memory, filesystems and device drivers. Here it is a mainline-based kernel from the `sun252i_f101_7.2` branch of [`YuzukiHD/linux-mainline`](https://github.com/YuzukiHD/linux-mainline), currently 7.2. It has configurations for both RV32 (C907) and RV64I modes and boots from SPI NOR; the root filesystem is SquashFS with a writable JFFS2 overlay on top.
- **OpenSBI**: the open-source reference implementation of the RISC-V SBI (Supervisor Binary Interface). It runs in the highest-privilege M mode and does what only M mode can do for the kernel, such as timers, inter-processor interrupts and reset. Here it is the firmware from the `sun252i-f101` branch of [`YuzukiHD/opensbi`](https://github.com/YuzukiHD/opensbi), in the `fw_jump` form. SyterKit loads it into RAM at `0x40f80000`; after initialising, it jumps to the kernel at `0x40000000` and provides SBI services while the kernel runs.
- **Buildroot**: an open-source build system for embedded Linux that downloads, compiles and packages a complete system from one configuration. Here it builds the toolchain, kernel, OpenSBI, SyterKit and the BusyBox root filesystem into a 16 MiB image. The board configuration lives in the external tree [`YuzukiHD/buildroot-external-yuzukihd`](https://github.com/YuzukiHD/buildroot-external-yuzukihd); Buildroot itself is the official mainline [`buildroot/buildroot`](https://github.com/buildroot/buildroot) repository.

| Option | Notes |
| --- | --- |
| [Prebuilt Images](linux-prebuilt.md) | Ready-made full 16 MiB images (RV32 / RV64I): flashing, serial port, replacing single components |
| [Manual Build](linux-manual.md) | SyterKit, OpenSBI, kernel and a BusyBox root filesystem built step by step into a 16 MiB image (RV32) |
| [Manual Build, RV64I](linux-manual-rv64.md) | What to change for the 64-bit image |
| [Linux + Buildroot](linux-buildroot.md) | Build the images with the Buildroot external tree in one command (RV32 / RV64I) |

## Driver Support

This follows the `sun252i_f101_7.2` branch of `YuzukiHD/linux-mainline`: whether the board-level device tree enables a peripheral, and whether its driver is built into the image's kernel. The RV32 and RV64I images support the same peripherals.

### Supported

Enabled in the device tree, with the driver built into the kernel:

| Peripheral | Driver | Notes |
| --- | --- | --- |
| Clocks and resets | `sunxi-ng` CCU (including CPU PLL, DDR PLL, RTC clock) | Clock source for all peripherals |
| Interrupts and timer | PLIC, CLINT | Part of the C907 |
| Pin mux and GPIO | `pinctrl-sun252i-f101`, GPIO character device | Provides `/dev/gpiochip*` |
| UART1 | 8250 DesignWare | Console `ttyS1`, 115200 8N1, pins `PB0/PB1` |
| I2C2 | `i2c-mv64xxx`, `i2c-dev` | `PB2` pin group; user space uses `/dev/i2c-*` |
| SPI0 and on-board NOR | `spi-sun6i`, `spi-nor`, MTD | 16 MiB NOR mounted as fixed partitions, see [Prebuilt Images](linux-prebuilt.md#replacing-individual-components) |
| DMA | `sun6i-dma` | |
| System control and SRAM | `sunxi_sram` | |

### Not Verified

None of the following has been verified; do not treat them as working. There are three cases: a driver exists but has not passed testing, a driver exists but the device tree does not enable it, and no driver exists.

| Peripheral | Status |
| --- | --- |
| Video engine | The Cedrus driver (`VIDEO_SUNXI_CEDRUS`, V4L2 staging) is built in and enabled in the device tree; it has not passed testing, and the board does not have enough memory to verify it |
| microSD (SMHC0) | The `sunxi-mmc` driver is built in; the board file sets card detect `PF6` and 3.3 V supply, but the status is `disabled`; it has not passed testing, and the board does not have enough memory to verify it |
| SMHC2 | The `sunxi-mmc` driver is built in; the node exists in the SoC file but is not configured for the board; it has not passed testing, and the board does not have enough memory to verify it |
| UART0, UART2–UART5 | The 8250 DesignWare driver is built in; the nodes exist in the SoC file, but the board neither enables them nor configures pins |
| I2C0, I2C1 | The `i2c-mv64xxx` driver is built in; the board neither enables them nor configures pins |
| SPI1 | The `spi-sun6i` driver is built in; the board neither enables it nor configures pins |
| PWM0 | The `pwm-sunxi` driver is built in; the board neither enables it nor configures pins |
| Watchdog | The SoC device tree has the node, but the kernel does not enable `CONFIG_WATCHDOG`, so no driver is built |
| USB (host / device) | The kernel does not enable `CONFIG_USB`, and the device tree has no USB node |
| Display and RGB LCD | No display driver (`CONFIG_DRM` is off), and no display node in the device tree |
| G2D | No node in the device tree and no driver in the kernel |
| Audio (on-chip codec) | No node in the device tree and no driver in the kernel |
| ADC | No node in the device tree; `CONFIG_IIO` is off |
| RTC | Only the RTC clock controller exists, with no RTC device; `CONFIG_RTC_CLASS` is off |

To use a peripheral whose node already exists but is not enabled, edit `sun252i-f101-yuzukineko-common.dtsi`, set the node to `okay`, configure the pins, and rebuild the device tree.

Linux has no drivers yet for USB, display, G2D or audio; these peripherals have drivers in [Zephyr](../zephyr/build-run.md).

## In This Chapter

- [Prebuilt Images](linux-prebuilt.md)
- [Manual Build](linux-manual.md)
- [Manual Build, RV64I](linux-manual-rv64.md)
- [Linux + Buildroot](linux-buildroot.md)

?> Before flashing, read [FEL Download Mode and Tools](../../boot/fel.md) and [SPI NOR Layout and Backup](../../boot/flash-layout.md), and back up the on-board Flash. For the pure-Rust system see [Asterinas](../asterinas/rustsbi-asterinas.md).
