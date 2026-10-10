# Quick Start

This page takes the shortest path to getting the board running. Pick any one of the three routes; **all of them require that you can first put the board into FEL download mode**.

## What you need

- A YuzukiNeko and a **USB data cable** (not a charge-only cable). The board has a single USB-C port, which provides power and also serves as the FEL download port and the USB device/host port.
- A **USB-to-serial adapter** (3.3 V level) to view the console output. The serial port defaults to 115200 8N1, no flow control.
- A Windows / Linux / macOS host.
- The download tool **xfel** or **rfel**, see [FEL Download Mode and Tools](boot/fel.md).

?> All external interfaces are designed for **3.3 V logic**. The `5V` pin is only a power pin; do not connect 5 V signals to GPIO.

## Identify your board version

The version number is printed on the silkscreen and the PCB. Pin labels and some components differ between versions, so check before you start:

| Version | Key points |
| --- | --- |
| V1.3 | PD pin silkscreen is wrong (from `PD10` on it is 2 lower than the real GPIO); **convert using the [errata](hardware/errata.md)**; the microSD detect pull-down is too large |
| V1.4 | Silkscreen corrected; the microSD detect pull-down `R11` is still 10 kΩ, replace it with 1 kΩ |
| V1.5 | Adds a dedicated PSRAM LDO and supports 32 MiB PSRAM; `R11` is already 1 kΩ |

See [Errata and Version Differences](hardware/errata.md) for details.

## Route A: flash RustSBI + Asterinas and enter a BusyBox shell

Suited if you want to see an interactive system right away. The image is already in the repository under `02_Firmware/RustSBI-Asterinas/`.

1. Hold the **FEL** button, plug in the USB cable, then release the button.
2. Check the FEL connection:
   ```sh
   xfel version
   xfel spinor
   ```
   It should recognize the F101 (chip ID `0x00193700`) and 16 MiB of Flash.
3. (Strongly recommended) Back up the existing Flash first:
   ```sh
   xfel spinor read 0x0 0x1000000 neko-backup.bin
   ```
4. Write and read back for verification:
   ```sh
   xfel spinor write 0x0 yuzukineko-rustsbi-asterinas.img
   xfel spinor read 0x0 0x6d0000 readback.img
   sha256sum yuzukineko-rustsbi-asterinas.img readback.img
   ```
   The image is 7,143,424 bytes, exactly `0x6d0000`, so the read-back range is the same length as the image. The two digests should match each other and the record in `SHA256SUMS`. See the [firmware page](firmware/rustsbi-asterinas.md) for details.
5. Release the FEL button and reset:
   ```sh
   xfel reset
   ```
6. Open a serial terminal at 115200 8N1 to get the BusyBox shell.

For the full description and how to replace individual components, see [RustSBI + Asterinas](firmware/rustsbi-asterinas.md).

## Route B: write a first Blink with Arduino

Suited if you are familiar with Arduino; no toolchain setup is needed.

1. In Arduino IDE 2.x go to **File → Preferences** and add the following to "Additional boards manager URLs":
   ```
   https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json
   ```
2. In the Boards Manager install **YuzukiHD Boards**, then select the board **YuzukiNeko**.
3. **Tools → Programmer → xfel (USB FEL)** (this board has no serial bootloader, so the normal "Upload" arrow cannot be used).
4. On first use install the FEL USB driver (on Windows install WinUSB with Zadig, on Linux add a udev rule), see [FEL Download Mode and Tools](boot/fel.md#usb-drivers-and-permissions).
5. Open the **Blink** example, compile, put the board into FEL, then use **Sketch → Upload Using Programmer**.

For detailed steps, API coverage and limitations see [Arduino](dev/arduino.md).

## Route C: develop with Zephyr

Suited if you need a full RTOS, drivers and multimedia features. The Zephyr `yuzukineko` board support is in the F101 workspace, see [Zephyr](dev/zephyr.md).

## Next steps

- Want to connect peripherals → [Pinout](hardware/pinout.md)
- Want to flash by dragging and dropping a `.uf2` → [UF2 Drag-and-Drop Flashing](dev/uf2.md)
- Running into problems → [FAQ](faq.md)
