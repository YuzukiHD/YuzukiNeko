---
title: "FAQ"
---

## Download and boot

<strong>`xfel version` does not find the device.</strong>
It did not enter FEL. Hold the <strong>FEL</strong> button while powering on, try another cable that carries data, and on Windows make sure WinUSB is installed with Zadig (VID `1f3a` / PID `efe8`). See [FEL](boot/fel.md).

<strong>It reports `unsupported chip`.</strong>
The xfel / rfel version is too old and does not support the F101. Upgrade and try again.

<strong>The board used to enter FEL, but no longer does.</strong>
There is already a valid bootloader in Flash, so the board runs it directly on power-up instead of entering FEL on its own. You must hold the FEL button while powering on.

<strong>The board does not respond after writing Flash.</strong>
Read back the region you wrote and compare the SHA-256; make sure you wrote the full image rather than a single component (writing the three `.bin` files on their own does not install the devicetree and root filesystem). See [RustSBI + Asterinas](dev/asterinas/rustsbi-asterinas.md).

<strong>I want to restore the original firmware.</strong>
Use the whole-chip image you backed up earlier: `xfel spinor write 0x0 neko-backup.bin`, then read back to verify and reset. Without a backup there is no way to restore, so back up before touching Flash.

## Hardware

<strong>On a V1.3 board `PD12`–`PD20` do not work.</strong>
The V1.3 silkscreen is 2 lower than the real GPIO. Silkscreen `PD12` is actually `PD14`. See [errata](hardware/errata.md).

<strong>The microSD card is not detected when inserted.</strong>
On V1.4 and earlier `R11` (the `PF6` pull-down) is 10 kΩ, which is too high. Change it to 1 kΩ, or set `PF6`'s output drive strength to its lowest setting in software.

<strong>Can I connect 5 V peripherals?</strong>
The GPIO is 3.3 V logic; the `5V` pin is power only.

<strong>How do I wire up CAN?</strong>
The SoC provides logic-level signals only; you need an external CAN transceiver and termination resistors.

## Serial port and console

<strong>There is no output on the serial port.</strong>
Which pin group the console is on depends on the software you are running (Zephyr `yuzukineko`: UART1 `PB0/PB1`). Check the wiring, the 115200 8N1 baud rate and the common ground, and make sure TX/RX are crossed over.

<strong>Pasting long commands into RustSBI + Asterinas produces garbage.</strong>
This image's serial input is sensitive to long strings; set the terminal's transmit delay to about 20 ms per character.

## Software

<strong>Why can't USB device/host functions and downloading be used at the same time?</strong>
The board has only one USB-C port, which is also the FEL download port. Download first, then switch to the peripheral.
