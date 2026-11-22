---
title: "ESP-IDF development"
---

This chapter documents the ESP-IDF 6.1 port for YuzukiNeko, maintained in [`YuzukiHD/esp-idf`](https://github.com/YuzukiHD/esp-idf), branch `sun252i-f101`. The target is `sun252i-f101`, a preview target in ESP-IDF, so builds need `idf.py --preview`. The documentation baseline is commit `c71329b4d15` (2026-10-19).

Unlike Zephyr and RT-Thread, ESP-IDF has no second-stage bootloader on this board and does not boot from SPI NOR. The build product is a RAM image linked at PSRAM `0x40000000`: a SyterKit returning eFEX helper first initializes PSRAM in FEL with the S3 or S4 parameter table for the board, then xfel writes and executes the image over USB. Every driver uses the standard public ESP-IDF API; board differences arrive through configuration structures and pin arguments.

| Item | Current port |
| --- | --- |
| CPU | XuanTie C907, RV32 `rv32imafc`, single core, single-precision FPU, 600 MHz default |
| Memory | 16 MiB PSRAM (32 MiB configurable on S4), starting at `0x40000000`; everything after the image is heap |
| Console | UART1, PB0 TX / PB1 RX, 115200 8N1 |
| Build type | `CONFIG_APP_BUILD_TYPE_RAM`, no bootloader, no OTA |
| Loading | SyterKit `init_psram_efex_s3.bin` or `_s4.bin` initializes PSRAM with the board's parameters, then xfel `write`/`exec` at `0x40000000` |
| Storage | SPI NOR 16 MiB, `esp_flash`, `esp_partition`, NVS |
| Display | Display engine, TCON, RGB and MIPI DSI, JD9168S 1024×768 |
| Touch | GT967, I2C1, address `0x5d` |
| Audio | On-chip codec, I2S0, DAC/ADC, PD4 amplifier enable |
| Wi-Fi | AIC8800, SDIO, station mode only |

## Reading order

Start with [environment and source](setup.md), then [building, loading and running](build-run.md). Read [port architecture](architecture.md) before adding driver or application code, and use [verification and known limits](testing.md) to judge what the port can and cannot do. PSRAM initialization before RAM loading is a global topic; see [PSRAM initialization and RAM boot](../../boot/psram-init.md).

## Driver manuals

- [System, clocks and memory](drivers/system.md)
- [GPIO and pin multiplexing](drivers/gpio.md)
- [UART and console](drivers/uart.md)
- [I2C and GT967 touch](drivers/i2c-touch.md)
- [SPI, NOR, partitions and NVS](drivers/spi-storage.md)
- [GPTimer, LEDC and GPADC](drivers/timers-adc.md)
- [SD/MMC and SDIO](drivers/sdmmc.md)
- [Display and backlight](drivers/display.md)
- [I2S and the on-chip codec](drivers/audio.md)
- [DMA, PPA and JPEG](drivers/dma-accel.md)
- [AIC8800 Wi-Fi](drivers/wifi.md)

## Relationship to Zephyr, RT-Thread and Linux

The three RTOS ports cover the same SoC under different software models. Zephyr uses devicetree, Kconfig and `DEVICE_DT_GET`; RT-Thread uses a runtime device model and an embedded DTB; ESP-IDF uses compile-time `sdkconfig`, component dependencies and the standard ESP-IDF driver API, with pins coming from each driver's configuration structure. Kconfig names, device names and initialization order are not interchangeable between them.

Verified functionality covers only the scope listed on these pages and does not imply one-to-one parity with the Zephyr driver manuals. The display, audio, SD card and storage code all cross-compile and link, but not every peripheral has been executed on the board; the runtime verification scope is in [verification and known limits](testing.md).

## Scope and limits

- There is no bootloader, no boot-from-NOR flow, and no `idf.py flash`, OTA, secure boot or flash encryption.
- There is no Bluetooth stack. The Bluetooth part of the AIC8800 is not ported, and Wi-Fi is station mode only.
- There is no low power, deep sleep, dynamic frequency scaling or second core; the CPU is a single C907.
- There is no RISC-V vector (RVV) context and no Sv32 paging.
- `esp_random()` is a software xorshift, not a cryptographic source; the chip has no hardware crypto.
- SPI, I2C and SD/MMC are polled implementations without a DMA host controller; DMA is used only for memory-to-memory and I2S.
- GPIO has no GPIO matrix; each pad has only a few fixed alternate functions.
