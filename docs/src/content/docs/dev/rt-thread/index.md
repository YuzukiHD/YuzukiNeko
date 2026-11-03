---
title: "RT-Thread development"
---

This chapter documents the F101 port of RT-Thread 5.3 on **YuzukiNeko**, maintained in [`YuzukiHD/rt-thread`](https://github.com/YuzukiHD/rt-thread), branch `rtt-5.3.0-f101`. The BSP is `bsp/allwinner-hal/sun252iw2`. The upstream repository alone does not contain this board port. The driver baseline described here is the five-commit series ending at `64c4489708`, validated on 2026-11-03.

| Item | Current BSP |
| --- | --- |
| CPU | XuanTie C907, RV32 machine mode, `ilp32d`, floating point and cache |
| Memory | 16 MiB PSRAM at `0x40000000`; default heap `0x40200000`–`0x40e00000` |
| Console | UART1, PB0 TX / PB1 RX, mux 4, 115200 8N1 |
| Panel | JD9168S MIPI DSI, 1024×768, four lanes, RGB888 |
| Touch | Goodix GT967, I2C1 at 400 kHz, address `0x5d` |
| Build | SCons + Kconfig + preprocessed DTS compiled with dtc |
| Development boot | Returning PSRAM helper, then FEL download into RAM |
| Logging | Native `rtdbg.h` / `LOG_E/W/I/D`; optional ulog backend |

## Reading order

Start with [environment and source](setup.md), then [build and RAM boot](build-run.md). Read [device model and application integration](architecture.md) before adding code, and use [regression and known limits](testing.md) to assess what a PASS establishes.

## Driver manuals

- [GPIO and pinctrl](drivers/gpio.md)
- [UART console and serial devices](drivers/uart.md)
- [I2C transactions](drivers/i2c.md)
- [GT967 and native touch events](drivers/touch.md)
- [SPI sampling, quad receive and DMA](drivers/spi.md)
- [SPIF NOR, tuning and XIP](drivers/spif-nor.md)
- [PWM and backlight](drivers/pwm.md)
- [GPADC](drivers/adc.md)
- [RTC calendar and alarms](drivers/rtc.md)
- [SD/MMC and FAT files](drivers/sdmmc.md)
- [Display planes, scaling and logging](drivers/display.md)
- [G2D acceleration](drivers/g2d.md)
- [JPEG, PNG and H.264 decoding](drivers/vdec.md)
- [Codec, I2S and S/PDIF](drivers/audio.md)
- [CherryUSB and USB display](drivers/usb.md)
- [Clock, DMA, watchdog and system drivers](drivers/system.md)

## Relationship to Zephyr and Linux

The hardware capabilities and documentation depth follow the [Zephyr driver manuals](../zephyr/index.md); [Linux development](../linux/index.md) explains the same peripherals through Linux subsystems. This port uses RT-Thread device, input, audio, SPI and RTC interfaces. Zephyr `DEVICE_DT_GET`, overlays and Kconfig names are not interchangeable with this BSP. The synchronization reference was Zephyr `88344a2dcbfb1bab9a36ceff506d07d079f05832`; it does not establish parity with every Zephyr application.

RVV context support, Sv32 demand paging, networking and NekoBox are not implied by the CPU capabilities or this driver update. Consult the selected RT-Thread configuration and source before enabling such features.
