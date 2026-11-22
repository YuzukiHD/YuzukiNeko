---
title: "Verification and known limits"
---

This page separates "compiles and links" from "ran on the board". ESP-IDF has many components; a successful cross-build only proves that interfaces and dependencies are consistent, not that a peripheral's electrical connection or timing is correct.

## Verified baseline

| Item | Value |
| --- | --- |
| Date | 2026-11-22 |
| Source | `YuzukiHD/esp-idf`, branch `sun252i-f101`, commit `c71329b4d15` |
| ESP-IDF | v6.1.0 |
| Toolchain | `riscv32-esp-elf` `esp-15.2.0_20251204` |
| PSRAM helper | SyterKit `main` @ `61ac087b0`, per-board S3/S4 parameter images; S3 verified |
| Board | YuzukiNeko core board with the YuzukiCube-M base board |
| Console | UART1 PB0/PB1, 115200 8N1, ThunderWorkbench serial log |

## Build coverage

| Scope | Result |
| --- | --- |
| `hello_world` | Clean build passes and the image runs over FEL |
| Driver set | GPIO, UART, I2C, SPI, GPTimer, LEDC, ADC, SD/MMC, DMA and I2S compile and link |
| Display set | `esp_lcd`, JD9168S, GT967 and the touch interface compile and link |
| Accelerators | PPA and JPEG decode compile and link |
| Storage | `spi_flash`, `esp_partition` and NVS compile and link |
| Wi-Fi | AIC8800, esp_wifi, esp_netif, lwIP and mbedTLS compile and link |

The driver set uses a test project with `MINIMAL_BUILD` enabled; `main` lists those components in `REQUIRES` and includes every public header.

## Runtime checks

- `hello_world` starts at `0x40000000`, prints the chip information, the 16 MiB NOR and about 16,306 KiB of heap, and returns to FEL after `esp_restart()`.
- The Wi-Fi test application initializes the AIC8800, downloads firmware and scans 11 APs. The log contains `wifi open ok`, `aic_wifi_init ok` and `found 11 APs`.
- Display, touch, audio, SD card, NVS read/write, ADC and timers were not executed in this board session; their page code compiles, but runtime results need separate verification.
- The SyterKit helper runs first after every entry into FEL (`write 0x20000` + `exec 0x20000`); the serial port reports `LPSRAM Type = APS128M`, `SIZE = 16 MB` and `simple test OK`, then the helper returns to FEL. Only then do `write 0x40000000` + `exec 0x40000000` run. `xfel ddr f101-s3` is not used.
- This board is a 16 MiB F101S3 using the S3 image: 252 MHz, APS128M, ZQ `0x007bfbfb`; the readback reports `psram.size_mb=16` and `init_ok=1`. S4 uses a separate image: 192 MHz, W958, ZQ `0x007bfffb`, 32 MiB, `tpr11=0x00ff44ff`. Those values come from SyterKit's W958 table, but a 32 MiB board has not been verified.
- The ESP-IDF `CONFIG_ESP_F101_PSRAM_MB=32` configuration cross-compiles, and the generated linker script has a 32 MiB RAM length; that proves the link and heap description, not that an S4 board has booted.

## Known limits

- There is no bootloader, OTA, secure boot or flash encryption; `idf.py flash` is unavailable.
- There is no Bluetooth stack and Wi-Fi is station mode only; the AIC8800 Bluetooth reset line and HCI are not connected to ESP-IDF.
- There is no low power, deep sleep, dynamic frequency scaling or second core; RVV and Sv32 paging are also disabled.
- `esp_random()` is not a cryptographic source, eFuse is read-only and there is no MAC address fuse.
- GPIO has no GPIO matrix; the 64-bit mask of `gpio_config()` covers only PA/PB, and PC through PF need per-pin configuration.
- UART has no RTS/CTS flow control; I2C supports 7-bit addresses and master mode only; SPI is a polled 8-bit master; SD/MMC is also polled.
- `spi_flash_mmap()` returns a RAM copy, not an XIP mapping; flash writes after the mapping are not reflected in the copy.
- NVS needs a partition table already present in NOR; FEL only downloads the RAM image and does not write a partition table.
- `xfel ddr f101-s3` carries fixed S3 parameters and cannot be used on S4; the RAM flow must initialize PSRAM with the SyterKit helper first.
- Display and audio board wiring follows YuzukiNeko and YuzukiCube-M; other base boards need different pins and descriptors.

## Reporting a problem

Include the commit hash, the build type and console configuration from `sdkconfig`, the full build command, the xfel commands and the serial log. If the problem only appears on hardware, name the base board revision and whether the display and Wi-Fi module are attached, and separate "build failure", "load failure" and "no output after running".
