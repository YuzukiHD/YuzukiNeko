---
title: "Install and upload sketches"
---

The Arduino platform is installed from the Boards Manager or from a release archive. Both paths need xfel and the FEL USB driver; the Boards Manager package brings xfel with it, while the offline archive lists the toolchain and xfel as separate tools.

## Requirements

| Item | Notes |
| --- | --- |
| Board | YuzukiNeko or the Allwinner F101 EVB |
| Host | Windows 10/11 or Linux x86_64 |
| IDE | Arduino IDE 2.x or `arduino-cli` |
| USB cable | Data lines, not charge-only; the same port is used for FEL |
| Serial adapter | On the console UART, 115200 8N1, if the board has no on-board adapter |
| xfel | Installed by the Boards Manager package; 1.4.0 or newer |
| FEL access | The FEL key on the board |

## Arduino IDE

1. Open **File > Preferences** and add this URL to **Additional boards manager URLs**: `https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json`.
2. Open the **Boards Manager**, search for **YuzukiHD Boards** and install the package.
3. Select **Tools > Board > YuzukiHD Boards** and pick **YuzukiNeko** or **Allwinner F101 EVB**.
4. Select **Tools > Programmer > xfel (USB FEL)**. The normal Upload button is not used; the board has no serial bootloader.

The package installs the platform, the xPack RISC-V GCC and xfel. The first install downloads about 85 MB.

## arduino-cli

```sh
arduino-cli config add board_manager.additional_urls https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json
arduino-cli core update-index
arduino-cli core install yuzuki:f101
arduino-cli board listall yuzuki
```

The FQBN is `yuzuki:f101:f101neko` or `yuzuki:f101:f101evb`. Compile with `arduino-cli compile -b <FQBN> <sketch-dir>`. The upload uses the same `xfel` programmer as the IDE.

## FEL driver

Install xfel and the USB driver as described in [FEL download mode and tools](../../boot/fel.md). On Windows, Zadig installs WinUSB for VID `1f3a`, PID `efe8`. On Linux, the udev rule grants access to the same device. The board enters FEL when the FEL key is held during power-up or reset.

## Upload

1. Hold the FEL key, power the board or press reset, then release the key.
2. In the IDE choose **Sketch > Upload Using Programmer** (Ctrl+Shift+U).
3. The upload writes the loader, the core and the sketch, then starts the loader from SRAM so the sketch runs without another power cycle.

| NOR offset | What the upload writes |
| --- | --- |
| `0x000000` | `boot.img`: the loader, three copies at 64 KiB intervals |
| `0x200000` | `core.flash`: the 4 KiB core header page and the core image |
| `0x400000` | the sketch binary |

:::caution
The first upload overwrites the loader, core and sketch regions of SPI NOR. Back up the whole flash as described in [SPI NOR layout and backup](../../boot/flash-layout.md) before uploading.
:::

## Offline install

Download `yuzukihd-f101-<version>.zip` from the [releases page](https://github.com/YuzukiHD/Arduino/releases) and unpack it as `<sketchbook>/hardware/yuzuki/f101`. The sketchbook is `Documents/Arduino` on Windows and macOS, and `~/Arduino` on Linux. Install the `riscv-gcc` and `xfel` tools from the same release under `<Arduino15>/packages/yuzuki/tools/<name>/<version>`, then restart the IDE. `Arduino15` is `%LOCALAPPDATA%\Arduino15` on Windows and `~/.arduino15` on Linux.

| Item | Location |
| --- | --- |
| Platform | `<sketchbook>/hardware/yuzuki/f101` |
| Toolchain | `<Arduino15>/packages/yuzuki/tools/riscv-gcc/<version>` |
| xfel | `<Arduino15>/packages/yuzuki/tools/xfel/<version>` |

## Updating

Installing a newer platform package replaces the core. The core ID changes, so every sketch must be recompiled; a sketch built for the old core stops with `the sketch was built for another core`. The loader and the sketch layout follow the core header version, so check the release notes before mixing a loader from one release with a core from another. Back up the flash before a major update if the board holds anything you want to keep.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `no board in FEL mode` | Not in FEL, or the USB driver is missing | Repeat the FEL step and check the driver |
| `Request 'upload' failed` | The normal Upload button was used, or no programmer is selected | Use **Upload Using Programmer** with **xfel (USB FEL)** |
| The sketch does not start | Wrong console or baud rate, or the wrong board variant | Check 115200 on the board console and the selected board |
| `the sketch was built for another core` | The core was updated after the sketch was compiled | Recompile and upload the sketch |
| The board does not enter FEL | It boots from NOR and the FEL key was not held | Hold FEL while powering or resetting |
