---
title: "Zephyr development"
---

:::note[Version scope]
Zephyr 4.2.2 and 4.5.0 coexist. The original examples, captures and target results on this page use the 4.2.2 baseline; 4.5 changes are identified separately. Select matching kernel and component branches and separate environments/build directories using the [version and migration guide](zephyr-4-5.md). A 4.5 build or host-test pass does not update the version of an existing board result.
:::


[Zephyr](https://www.zephyrproject.org) is an open-source real-time operating system (RTOS) for resource-constrained devices. The F101 Zephyr support is a fork of upstream Zephyr: [`YuzukiHD/zephyr`](https://github.com/YuzukiHD/zephyr), retaining `zephyr-v4.2.2-f101` (4.2.2) alongside the separate `zephyr-v4.5.0-f101` (4.5.0) port branch; see the [version and migration guide](zephyr-4-5.md) for matching components.

- <strong>SoC</strong>: `sun252i_f101`, one XuanTie C907 core (`rv32imafdcv`, with the vector extension and an optional Sv32 MMU), on-chip SRAM plus 16 MB PSRAM, with no external DDR.
- <strong>Board support</strong>: `yuzukineko` (this board, console on UART1 at PB00/PB01) and `f101_evb` (the F101 evaluation board, console on UART3 at PE08/PE09).
- <strong>Toolchain</strong>: XuanTie 900 elf-newlib GCC, integrated through the `cross-compile` variant, without using the Zephyr SDK.
- <strong>Build</strong>: west manages the source and dependency modules, and `west build` compiles.

:::caution
The Zephyr board and driver code lives in the fork above, not in the YuzukiNeko hardware repository.
:::

The versions coexist for an approximately one-month transition: the plan is to complete the merge and stop maintaining 4.2.2 around 2026-12-02, then maintain 4.5. Original examples and target records keep their version scope.

## Where to start

Read the following three pages in order and you can get a program running on the board:

| Step | Description |
| --- | --- |
| [Set up the development environment](zephyr-setup-env.md) | Host dependencies, Python virtual environment, west, the XuanTie toolchain, `env.sh` |
| [Get the Zephyr source](zephyr-get-source.md) | `west init` / `west update`, directory structure, Python dependencies, building `hello_world` to verify |
| [Build and run](zephyr-build-run.md) | RAM images, XIP development preserving FEL, and optional standalone/UF2 boot |

Other pages:

| Page | Description |
| --- | --- |
| [Versions and 4.5 changes](zephyr-4-5.md) | Coexistence, dependencies, API changes and verification scope |
| [NekoBox](apps/nekobox.md) | Media, games, DLNA and Miracast home applications |
| [Bilibili](apps/bilibili.md) | Online video client |
| [MicroPython](apps/micropython.md) | Python REPL and peripheral scripts |
| [PocketJS applications](apps/pocketjs.md) | Solid/TSX UI development, packaging, player and benchmark |
| [Miracast](apps/miracast.md) | Android wireless display / screen mirroring |
| [gpSP](apps/gpsp.md) | GBA emulator with dynamic recompilation |
| [MP4 player](apps/mp4-player.md) | Play MP4 from a TF card: H.264 hardware decode + AAC software decode |
| [ncnn - neural-network inference](apps/ncnn.md) | ncnn inference library + RVV, benchmark |
| [Doom - game](apps/doom.md) | doomgeneric, touch-screen buttons |
| [mGBA - GBA emulator](apps/mgba.md) | Scaled output, touch-screen buttons, sound |
| [NES - FC emulator](apps/nes.md) | nofrendo, touch-screen buttons |
| [HTML renderer - litehtml](apps/html.md) | Renders HTML/CSS to RGB565 |
| [Android screen mirroring](apps/android-mirror.md) | ADB + scrcpy, H.264 hardware decode |
| [iOS screen mirroring - AirPlay](apps/ios-mirror.md) | AirPlay receiver, H.264 hardware decode |
| [Win95 - Bochs x86 emulation](apps/win95.md) | Bochs 486 emulator |
| [LVGL - graphical UI](apps/lvgl.md) | Display and touch integration, demo and frame rate |
| [USB secondary display - PC extended screen](apps/usb-display.md) | Use the computer's USB port as a secondary screen |
| [UF2 drag-and-drop flashing](zephyr-uf2.md) | Creating `.uf2` files and the Flash layout |
| [RVV - RISC-V vector extension](zephyr-riscv-vector.md) | Configuration, interfaces and examples of the vector extension |

Driver pages (each has a devicetree, Kconfig, one complete example per interface, board output and a full demo program):

| Page | Description |
| --- | --- |
| [GPIO](drivers/gpio.md) | Input and output, whole-port operations, interrupts |
| [I2C](drivers/i2c.md) | Read and write, repeated start, bus scan |
| [SPI](drivers/spi.md) | Command plus data, full duplex, DMA, modes |
| [PWM](drivers/pwm.md) | Period and duty cycle, polarity, devicetree references |
| [PWM-BL - analog backlight](drivers/pwm-bl.md) | Backlight-specific module, brightness adjusted by current sinking |
| [Display](drivers/display.md) | Pipeline, adapting RGB and MIPI DSI panels, display interfaces |
| [SDHC host controller](drivers/sdhc.md) | Operate the controller directly with SD commands |
| [AUDIO - audio](drivers/audio.md) | On-chip codec, I2S0, S/PDIF |
| [UART](drivers/uart.md) | Polling, interrupts, configuration |
| [USB](drivers/usb.md) | CherryUSB device mode, CDC ACM echo |
| [G2D 2D accelerator](drivers/g2d.md) | Fill, blit, rotate, YUV, blend |
| [Video engine vdec](drivers/vdec.md) | JPEG, PNG, MJPEG, H.264 decoding |

Component pages cover configuration, integration, interfaces and available verification for protocol stacks and libraries:

| Page | Description |
| --- | --- |
| [PocketJS runtime](components/pocketjs.md) | QuickJS-ng, Rust UI, RGB565 rendering, G2D/RVV and resource ownership |
| [CherryUSB - USB protocol stack](components/cherryusb.md) | Device stack, host stack, CDC ACM, MSC |
| [SD - SD card protocol stack](components/sd.md) | SD subsystem, disk access, FAT filesystem |
| [AIC8800 WIFI - wireless adapter driver](components/aic8800-wifi.md) | SDIO, firmware download, scan, connect |
| [AIC8800 Bluetooth - Bluetooth driver](components/aic8800-bt.md) | HCI, advertising, scan, connect |
| [DLNA](components/dlna.md) | UPnP renderer, progressive downloads and playback control |
| [AAC - AAC decoder](components/aac.md) | OpenCORE AAC decoding |
| [MP4 - MP4 demuxing](components/mp4.md) | moov parsing, sample reading, seek |

## Driver support

The drivers are written to Zephyr's own APIs, and the devicetree bindings are in `dts/bindings/`.

| Category | Description |
| --- | --- |
| Basics | Clocks and reset, pinctrl, GPIO, DMA, watchdog, hwinfo (SID fuses), CPU clock frequency |
| Buses | I2C, SPI, PWM (including panel backlight), ADC, SD/MMC (`sdhc`) |
| Flash | SPIF SPI NOR controller: 100 MHz quad read, saved sampling-point parameters, XIP window and XIP code section |
| Audio | On-chip codec (DAC/ADC and the analog part), I2S0, S/PDIF |
| Display | Layers, TCON, RGB/LVDS/DSI encoders, D-PHY, backlight, YUV/RGB scaling video layer, MIPI DBI |
| Accelerators | G2D 2D accelerator (fill, blit with format conversion/scaling/rotation, blend); video engine (H.264, JPEG, PNG decoding) |
| USB | PHY, CherryUSB device (CDC ACM, MSC, vendor display class) and host (EHCI/OHCI) |
| Input | GT967 capacitive touch |
| RISC-V | Vector-extension context save, machine-mode Sv32 MMU with demand paging, `lib/mp4`, AAC decoding |

The SoC code is in `soc/allwinner/sun252i_f101`, the SoC devicetree is in `dts/riscv/allwinner/sun252i_f101.dtsi`, and the board support is in `boards/yuzukihd`.

:::tip
Applications built on this port (emulators, WiFi, MicroPython, PocketJS and so on) live in the [`YuzukiHD/zephyr-components`](https://github.com/YuzukiHD/zephyr-components) repository. Each has a different status; the README in each directory is the reference for how to use it.
:::

## In this chapter

- [Set up the development environment](zephyr-setup-env.md)
- [Get the Zephyr source](zephyr-get-source.md)
- [Build and run](zephyr-build-run.md)
- [UF2 drag-and-drop flashing](zephyr-uf2.md)

:::tip
Before downloading, read [FEL download mode and tools](../../boot/fel.md) and [SPI NOR layout and backup](../../boot/flash-layout.md), and back up the on-board Flash. To run Linux, see [Linux development](../linux/index.md).
:::
