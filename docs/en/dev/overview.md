# Software Overview

YuzukiNeko is a single-core RISC-V (rv32imac) board that can run a variety of software. Which path to pick depends on what you want to do:

| Option | Suited for | Status and notes | Docs |
| --- | --- | --- | --- |
| **Arduino** | Writing sketches quickly, getting familiar with the Arduino API | Prebuilt core (Zephyr inside), no toolchain setup; several examples verified on the EVB | [Arduino](arduino.md) |
| **Zephyr** | A full RTOS using display, audio, USB, G2D, video decoding, etc. | Board `yuzukineko`, complete peripheral drivers | [Zephyr](zephyr.md) |
| **UF2 downloader** | Flashing applications by dropping a `.uf2` file, no tools to install | The board runs a USB drive `F101BOOT` | [UF2 Drag-and-Drop Flashing](uf2.md) |
| **RustSBI + Asterinas** | A system with a Linux-style shell right away | Ready-made image, nine BusyBox demos | [RustSBI + Asterinas](../firmware/rustsbi-asterinas.md) |
| **Linux + Buildroot** | A full Linux with a writable, persistent root filesystem | Ready-made images (RV32 / RV64I), SquashFS + JFFS2 overlay | [Linux + Buildroot](../firmware/linux-buildroot.md) |
| **MicroPython, RT-Thread, ESP-IDF, etc.** | Other ecosystems | Mostly still in progress | [Other Systems and Components](others.md) |

## Boot Methods

Two common methods:

1. **Load and run directly from FEL** (during development): the board enters FEL, the host writes the program into memory and runs it, leaving Flash untouched. Suited for debugging bare-metal programs such as Zephyr; **it needs a fresh power-up every time**.
2. **Boot from SPI NOR** (for deployment): Flash holds a loader such as SyterKit, the BROM loads it at power-up, and the loader then loads the system into PSRAM. Arduino, UF2 and RustSBI + Asterinas all take this route.

Once Flash holds a valid loader, the board no longer enters FEL by itself; you must power up while holding the **FEL** button. See [FEL Download Mode and Tools](../boot/fel.md).

## Some Global Points

- **The board has only one USB-C port**: it is the power input, the FEL download port, and the USB device/host port. To use USB device or host functions, download the program over the cable first, then switch to the peripheral.
- **The console serial port** depends on the software; check the documentation of the software you use before wiring.
- **PSRAM and Flash**: the 16 MiB PSRAM is all the runtime memory; programs, image buffers and media buffers all have to be planned within it.
