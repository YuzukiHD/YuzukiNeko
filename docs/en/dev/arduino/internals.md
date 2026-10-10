# How It Runs and Hardware Notes

## How It Runs

```
SPI NOR   0x000000  Loader (SyterKit, 3 copies every 64 KiB): initializes PSRAM
          0x200000  Core header page + core image (Zephyr, drivers, libraries; linked at 0x40000000)
          0x400000  Sketch image (linked to the window at 0x40e00000)
```

At power-up the BROM starts the loader, which copies the core and sketch into PSRAM and starts the core; the core then calls the sketch's `setup()` and `loop()`. The sketch is compiled and linked with plain gcc against `prebuilt/core/core.elf`.

Uploading uses `xfel` and needs no serial port: power up while holding FEL, then upload. `xfel` writes the loader, core and sketch, then starts the loader.

## Hardware Notes

- `PE2` is the USB VBUS switch and `PF0..PF5` are the SD card; avoid them.
- The pins needed by the display (`PD0..PD22`, `PB0..PB3`) are taken only after `Display` (or `DBI`) is started; PWM and UART pins are routed on first use.
- `LED_BUILTIN` is `PA0`; you need to wire an LED yourself.
