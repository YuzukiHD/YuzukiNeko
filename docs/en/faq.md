# FAQ

## Download and Boot

**`xfel version` cannot find the device.**
The board is not in FEL. Hold the **FEL** key while powering on, use a cable that carries data, and on Windows make sure WinUSB has been installed with Zadig (VID `1f3a` / PID `efe8`). See [FEL](boot/fel.md).

**It reports `unsupported chip`.**
Your xfel / rfel version is too old to support F101. Upgrade and try again.

**The board used to enter FEL, but no longer does.**
The Flash already contains a valid boot loader, which runs directly at power-on instead of entering FEL. You must hold the FEL key while powering on.

**The board does nothing after writing Flash.**
Read back the written region and compare the SHA-256; make sure you wrote the complete image rather than a single component (writing only the three `.bin` files does not install the device tree and root filesystem). See [RustSBI + Asterinas](dev/asterinas/rustsbi-asterinas.md).

**I want to restore the original firmware.**
Use the full-chip image you backed up earlier: `xfel spinor write 0x0 neko-backup.bin`, then read back to verify and reset. Without a backup it cannot be restored, so back up the Flash before touching it.

## Hardware

**`PD12`-`PD20` do not work on a V1.3 board.**
The V1.3 silkscreen is 2 lower than the real GPIO. Silkscreen `PD12` is actually `PD14`. See [Errata](hardware/errata.md).

**The microSD card is not detected after insertion.**
On V1.4 and earlier, `R11` (`PF6` pull-down) is 10 kΩ, which is too large. Replace it with 1 kΩ, or set the drive strength of `PF6` to the lowest in software.

**Can I connect 5 V peripherals?**
GPIO is 3.3 V logic; the `5V` pin is only a power supply.

**How do I connect CAN?**
The SoC only provides logic levels; you need an external CAN transceiver and termination resistor.

## Serial and Console

**There is no serial output.**
Which pins the console uses depends on the software being run (Zephyr `yuzukineko`: UART1 `PB0/PB1`). Check the wiring, the baud rate 115200 8N1, a common ground, and whether TX/RX are crossed.

**Pasting long commands in RustSBI + Asterinas gives garbled text.**
The serial input of this image is sensitive to long strings; set the terminal's per-character send delay to about 20 ms.

## Software

**Clicking "Upload" in Arduino fails with `Request 'upload' failed`.**
Use **Sketch → Upload Using Programmer** and select the programmer `xfel (USB FEL)` first.

**Why can't USB device/host functions and downloading be used at the same time?**
The board has only one USB-C port, which is also the FEL download port. Download first, then switch to the peripheral.
