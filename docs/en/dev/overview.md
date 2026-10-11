# Software Overview

YuzukiNeko is a single-core RISC-V board whose chip is rv32imacfdv and also supports 64-bit, and it can run a variety of software. Which path to pick depends on what you want to do:

| Option | Suited for | Status and notes | Docs |
| --- | --- | --- | --- |
| **Zephyr** | A full RTOS using display, audio, USB, G2D, video decoding, etc. | Board `yuzukineko`, complete peripheral drivers | [Zephyr](zephyr/build-run.md) |
| **UF2 downloader** | Flashing applications by dropping a `.uf2` file, no tools to install | The board runs a USB drive `F101BOOT` | [UF2 Drag-and-Drop Flashing](zephyr/uf2/make-uf2.md) |
| **RustSBI + Asterinas** | A system with a Linux-style shell right away | Ready-made image, nine BusyBox demos | [RustSBI + Asterinas](asterinas/rustsbi-asterinas.md) |
| **Linux + Buildroot** | A full Linux with a writable, persistent root filesystem | Ready-made images (RV32 / RV64I), SquashFS + JFFS2 overlay | [Linux + Buildroot](linux/linux-buildroot.md) |
| **MicroPython** | Upstream Zephyr port as the application, plus an `f101` module (G2D, audio, chip ID); REPL on the console | Verified on the EVB: floating point, `machine` Pin/SPI/ADC/PWM/WDT, SD mount, display writes, G2D, tone output | — |
| **mGBA** | Game Boy Advance emulator port | Runs | — |
| **NES** | NES emulator port | Builds and links; not yet run on the board | — |
| **Doom** | Doom port | Builds and links; not yet run on the board | — |

## Technology Stacks

The two Linux-style routes are kept apart:

- [Linux Development](linux/index.md): the C stack, standard Linux kernel + Buildroot.
- [Asterinas Development](asterinas/rustsbi-asterinas.md): the pure-Rust stack, RustSBI + Asterinas.

## Boot Methods

Two common methods:

1. **Load and run directly from FEL** (during development): the board enters FEL, the host writes the program into memory and runs it, leaving Flash untouched. Suited for debugging bare-metal programs such as Zephyr; **it needs a fresh power-up every time**.
2. **Boot from SPI NOR** (for deployment): Flash holds a loader such as SyterKit, the BROM loads it at power-up, and the loader then loads the system into RAM. UF2 and RustSBI + Asterinas all take this route.

Once Flash holds a valid loader, the board no longer enters FEL by itself; you must power up while holding the **FEL** button. See [FEL Download Mode and Tools](../boot/fel.md).

## Some Global Points

- **The board has only one USB-C port**: it is the power input, the FEL download port, and the USB device/host port. To use USB device or host functions, download the program over the cable first, then switch to the peripheral.
- **The console serial port** depends on the software; check the documentation of the software you use before wiring.
- **RAM and Flash**: the 16 MiB RAM is all the runtime memory; programs, image buffers and media buffers all have to be planned within it.
