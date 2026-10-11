---
title: "Quickstart"
---

This page gets your board running by the shortest path. Pick either of the two routes; <strong>both require you to be able to get the board into FEL download mode</strong>.

## What you need

- A YuzukiNeko and a <strong>USB data cable</strong> (not a charge-only cable). The board has only one USB-C port, which both supplies power and serves as the FEL download port and the USB device/host port.
- A <strong>USB-to-serial adapter</strong> (3.3 V logic) to view the console output. The serial port defaults to 115200 8N1 with no flow control.
- A Windows / Linux / macOS host machine.
- The <strong>xfel</strong> or <strong>rfel</strong> download tool, see [FEL download mode and tools](boot/fel.md).

:::tip
All external interfaces are designed for <strong>3.3 V logic</strong>; the `5V` pin is power only, so do not connect a 5 V signal to a GPIO.
:::

## Identify your board revision

The silkscreen and the PCB carry the revision number. Pin labels and some components differ between revisions, so take a look before you start:

| Revision | Points to note |
| --- | --- |
| V1.3 | PD pin silkscreen is wrong (from `PD10` onwards each label is 2 lower than the real GPIO), so <strong>convert using the [errata table](hardware/errata.md)</strong>; the microSD detect pull-down is too large |
| V1.4 | Silkscreen corrected; the microSD detect pull-down `R11` is still 10 kΩ, change it to 1 kΩ |
| V1.5 | Added a dedicated PSRAM LDO, enabling 32 MiB PSRAM; `R11` is already 1 kΩ |

See [Errata and revision differences](hardware/errata.md) for details.

## Route A: flash RustSBI + Asterinas and boot into a BusyBox shell

This suits you if you want to see an interactive system straight away. The image is already in the repository under `02_Firmware/RustSBI-Asterinas/`.

1. Hold the <strong>FEL</strong> button, connect the USB cable, then release the button.
2. Check the FEL connection:
   ```sh
   xfel version
   xfel spinor
   ```
   It should identify the F101 (chip ID `0x00193700`) and 16 MiB of Flash.
3. (Strongly recommended) back up the existing Flash first:
   ```sh
   xfel spinor read 0x0 0x1000000 neko-backup.bin
   ```
4. Write, then read back to verify:
   ```sh
   xfel spinor write 0x0 yuzukineko-rustsbi-asterinas.img
   xfel spinor read 0x0 0x6d0000 readback.img
   sha256sum yuzukineko-rustsbi-asterinas.img readback.img
   ```
   The image is 7,143,424 bytes, which is exactly `0x6d0000`, so the read-back range is the same length as the image; the two digests should match, and should also match the record in `SHA256SUMS`. See the [firmware page](dev/asterinas/rustsbi-asterinas.md) for details.
5. Release the FEL button and reset:
   ```sh
   xfel reset
   ```
6. Open a serial terminal at 115200 8N1 and you will be in a BusyBox shell.

For the full instructions, including how to replace each component individually, see [RustSBI + Asterinas](dev/asterinas/rustsbi-asterinas.md).

:::tip
If you want your changes to persist (a writable root filesystem that survives a reboot), or you need an RV64I build, use the Linux image from the [prebuilt images](dev/linux/linux-prebuilt.md) instead. The procedure is the same, but that image covers the whole 16 MiB, so writing it also overwrites the data persisted on the board.
:::

## Route B: develop with Zephyr

This suits users who need a full RTOS, drivers and multimedia features. Zephyr's `yuzukineko` board support lives in the F101 workspace, see [Zephyr](dev/zephyr/index.md).

## Next steps

- Want to attach peripherals → [Pinout](hardware/pinout.md)
- Want drag-and-drop `.uf2` flashing → [UF2 drag-and-drop flashing](dev/zephyr/zephyr-uf2.md)
- Hitting problems → [FAQ](faq.md)
