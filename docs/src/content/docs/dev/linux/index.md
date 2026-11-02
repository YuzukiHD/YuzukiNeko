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

### Supported and tested

Enabled in the devicetree, compiled into the kernel, and exercised on the board:

| Peripheral | Driver | Notes | Documentation |
| --- | --- | --- | --- |
| Clocks and resets | `sunxi-ng` CCU | Clock source of every peripheral, including the C907 and PSRAM PLLs | [CCU](drivers/clock.md) |
| Interrupts and timers | PLIC, CLINT | Built into the C907 | |
| Pin multiplexing and GPIO | `pinctrl-sun252i-f101` | Six banks, external interrupts, GPIO character device | [PINCTRL](drivers/pinctrl-gpio.md) |
| Memory bus priority | `sun252i-f101-mbus` | Priorities, bandwidth limits, traffic counters | [MBUS and SRAM](drivers/mbus-sram.md) |
| On-chip SRAM | `sunxi_sram` | VE, display engine and USB FIFO sections | [MBUS and SRAM](drivers/mbus-sram.md) |
| UART1 | 8250 DesignWare | Console `ttyS1`, 115200 8N1, `PB0`/`PB1` | [UART](drivers/uart.md) |
| I2C2 | `i2c-mv64xxx` | `PB2`/`PB3`, userspace through `/dev/i2c-0` (the number is dynamic, see [I2C](drivers/i2c.md)) | [I2C](drivers/i2c.md) |
| SPI0 and NOR | `spi-sun6i`, `spi-nor`, MTD | 16 MiB flash, root filesystem, DMA transfers | [SPI and DMA](drivers/spi.md), [SPIF](drivers/spif-nor.md) |
| SPI flash controller | `spi-sunxi-spif` | Alternative controller for the same NOR, own devicetree variant | [SPIF](drivers/spif-nor.md) |
| DMA | `sun6i-dma` | Eight channels, used by SPI | [SPI and DMA](drivers/spi.md) |
| microSD | `sunxi-mmc` | SMHC0, 4-bit, 50 MHz, card detect on `PF6` | [SMHC](drivers/mmc.md) |
| Display | `sun4i-drm`, `sun6i-dsi`, D-PHY, JD9168S panel | 1024x768 MIPI DSI panel, framebuffer console | [Display](drivers/display.md) |
| G2D | `sun252i-g2d` | V4L2 memory to memory: convert, scale, rotate, flip | [G2D](drivers/g2d.md) |
| Video engine | `cedrus` | JPEG and H.264 decoding, linear NV12 output | [VE](drivers/vdec.md) |
| USB | MUSB OTG, EHCI, OHCI, `sun4i-usb-phy` | Device mode with configfs gadgets, host mode with root hubs | [USB](drivers/usb.md) |

### Not enabled or not verified

| Peripheral | Status |
| --- | --- |
| UART0, UART2 to UART5 | Nodes exist in the SoC devicetree but are `disabled`, and the board configures no pins for them |
| I2C0, I2C1 | Same: `disabled` nodes, no pin groups in the board file |
| SPI1 | `disabled`; shares the `PC` pads with SPI0, SMHC2 and SPIF |
| eMMC (SMHC2) | `disabled`; shares the `PC` pads |
| Watchdog | The SoC devicetree has the node, but `CONFIG_WATCHDOG` is not enabled, so no driver is built |
| RTC | Only the RTC clock controller exists; there is no RTC device driver or battery-backed clock |
| Audio (on-chip codec) | No node and no driver |
| ADC | No node, `CONFIG_IIO` not enabled |
| Camera (CSI) | No node and no driver |
| Network | The kernel is built without `CONFIG_NET`; the USB gadget can declare ECM but there is no stack behind it |

To use a peripheral whose node exists but is disabled, set it to `okay` in `sun252i-f101-yuzukineko-common.dtsi`, give it a pin group, and rebuild the devicetree.

## In this chapter

- [Prebuilt images](linux-prebuilt.md)
- [Manual build](linux-manual.md)
- [Manual build RV64I](linux-manual-rv64.md)
- [Linux + Buildroot](linux-buildroot.md)

## Apps

- [Buildroot packages](apps/buildroot-packages.md): what the root filesystem contains and how to add a package
- [BusyBox](apps/busybox.md): the shell, the applets, init and the init scripts
- [Common commands](apps/linux-commands.md): the commands that work on the board, grouped by task

## Drivers

- [CCU](drivers/clock.md), [MBUS and SRAM](drivers/mbus-sram.md), [PINCTRL](drivers/pinctrl-gpio.md)
- [UART](drivers/uart.md), [I2C](drivers/i2c.md), [SPI and DMA](drivers/spi.md), [SPIF](drivers/spif-nor.md), [SMHC](drivers/mmc.md)
- [Display](drivers/display.md), [G2D](drivers/g2d.md), [VE](drivers/vdec.md), [USB](drivers/usb.md)

## Components

- [OpenSBI](components/opensbi.md): the SBI firmware in M mode
- [SyterKit](components/syterkit.md): the bootloader and the PSRAM bring-up
- [Buildroot external tree](components/buildroot-external.md): the board configuration and image script

:::tip
Before flashing, read [FEL download mode and tools](../../boot/fel.md) and [SPI NOR layout and backup](../../boot/flash-layout.md), and back up the board's Flash. For a pure Rust system, see [Asterinas](../asterinas/rustsbi-asterinas.md).
:::
