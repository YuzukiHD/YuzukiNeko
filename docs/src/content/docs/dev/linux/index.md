---
title: "Linux development"
---

Linux on F101 consists of three parts, and the boot chain is BROM → SyterKit → OpenSBI → Linux → BusyBox:

- <strong>Linux</strong>: the open-source operating system kernel, responsible for processes, memory, filesystems, and device drivers. The kernel used here is based on mainline, from the `sun252i_f101_7.2` branch of [`YuzukiHD/linux-mainline`](https://github.com/YuzukiHD/linux-mainline), currently 7.2. There are configurations for both RV32 (C907) and RV64I modes; it boots from SPI NOR, the root filesystem is SquashFS, with a writable JFFS2 overlay on top.
- <strong>OpenSBI</strong>: the open-source reference implementation of the RISC-V SBI (Supervisor Binary Interface), running in the highest-privileged M mode, doing on the kernel's behalf the things only M mode can do, such as timers, inter-processor interrupts, and reset. The one used here is from the `sun252i-f101` branch of [`YuzukiHD/opensbi`](https://github.com/YuzukiHD/opensbi), in its `fw_jump` form. SyterKit loads it into RAM at `0x40f80000`; after it finishes initialising, it jumps to the kernel at `0x40000000` and provides SBI services while the kernel runs.
- <strong>Buildroot</strong>: an open-source build system for embedded Linux that automatically downloads, compiles, and packages a complete system from a single configuration. Here it is used to build the toolchain, kernel, OpenSBI, SyterKit, and the BusyBox root filesystem together into a 16 MiB image. The board configuration lives in the external tree [`YuzukiHD/buildroot-external-yuzukihd`](https://github.com/YuzukiHD/buildroot-external-yuzukihd), while Buildroot itself uses the official mainline [`buildroot/buildroot`](https://github.com/buildroot/buildroot) repository.

| Approach | Description |
| --- | --- |
| [Prebuilt images](linux-prebuilt.md) | Ready-made full 16 MiB images (RV32 / RV64I) and their flashing, serial port, and single-component replacement |
| [Manual build](linux-manual.md) | Build step by step from SyterKit, OpenSBI, and the kernel to a BusyBox root filesystem, and assemble a 16 MiB image (RV32) |
| [Manual build RV64I](linux-manual-rv64.md) | What to change for the 64-bit image |
| [Linux + Buildroot](linux-buildroot.md) | Build the image with one command using the Buildroot external tree (RV32 / RV64I) |

## Driver support

### Supported

Enabled in the devicetree, with the drivers compiled into the kernel:

| Peripheral | Driver | Notes |
| --- | --- | --- |
| Clocks and reset | `sunxi-ng` CCU (including CPU PLL, DDR PLL, RTC clock) | Clock source for all peripherals |
| Interrupts and timers | PLIC, CLINT | Built into the C907 |
| Pin multiplexing and GPIO | `pinctrl-sun252i-f101`, GPIO character device | Provides `/dev/gpiochip*` |
| UART1 | 8250 DesignWare | Console `ttyS1`, 115200 8N1, pins `PB0/PB1` |
| I2C2 | `i2c-mv64xxx`, `i2c-dev` | `PB2` pin group, userspace via `/dev/i2c-*` |
| SPI0 and onboard NOR | `spi-sun6i`, `spi-nor`, MTD | 16 MiB NOR, mounted by fixed partitions, see [Prebuilt images](linux-prebuilt.md#replacing-a-single-component) |
| DMA | `sun6i-dma` | |
| System control and SRAM | `sunxi_sram` | |

### Unverified

The following have not been verified and may have problems.

| Peripheral | Status |
| --- | --- |
| Video engine | The Cedrus driver (`VIDEO_SUNXI_CEDRUS`, V4L2 staging) is compiled in and enabled in the devicetree; it has not passed testing, and there is not enough memory on the board to verify it |
| microSD (SMHC0) | The `sunxi-mmc` driver is compiled in; the board layer declares card detect `PF6` and 3.3 V power, but the status is `disabled`; it has not passed testing, and there is not enough memory on the board to verify it |
| SMHC2 | The `sunxi-mmc` driver is compiled in; the SoC has a node, the board layer does not configure it; it has not passed testing, and there is not enough memory on the board to verify it |
| UART0, UART2–UART5 | The 8250 DesignWare driver is compiled in; the SoC has nodes, but the board layer neither enables them nor configures pins |
| I2C0, I2C1 | The `i2c-mv64xxx` driver is compiled in; the board layer neither enables them nor configures pins |
| SPI1 | The `spi-sun6i` driver is compiled in; the board layer neither enables it nor configures pins |
| PWM0 | The `pwm-sunxi` driver is compiled in; the board layer neither enables it nor configures pins |
| Watchdog | The SoC devicetree has a node, but the kernel does not enable `CONFIG_WATCHDOG`, so the driver is not compiled in |
| USB (host / device) | The kernel does not enable `CONFIG_USB`, and there is no USB node in the devicetree |
| Display and RGB LCD | There is no display driver (`CONFIG_DRM` not enabled), and no display node in the devicetree |
| G2D | No node in the devicetree and no driver in the kernel |
| Audio (on-chip codec) | No node in the devicetree and no driver in the kernel |
| ADC | No node in the devicetree, `CONFIG_IIO` not enabled |
| RTC | Only the RTC clock controller, no RTC device, `CONFIG_RTC_CLASS` not enabled |

To use a peripheral that already has a node in the devicetree but is not enabled, edit `sun252i-f101-yuzukineko-common.dtsi`, set the corresponding node to `okay`, configure its pins, and rebuild the devicetree.

Linux currently has no USB, display, G2D, or audio drivers; these classes of peripheral have drivers in [Zephyr](../zephyr/index.md).

## In this chapter

- [Prebuilt images](linux-prebuilt.md)
- [Manual build](linux-manual.md)
- [Manual build RV64I](linux-manual-rv64.md)
- [Linux + Buildroot](linux-buildroot.md)

:::tip
Before flashing, read [FEL download mode and tools](../../boot/fel.md) and [SPI NOR layout and backup](../../boot/flash-layout.md), and back up the board's Flash. For a pure Rust system, see [Asterinas](../asterinas/rustsbi-asterinas.md).
:::
