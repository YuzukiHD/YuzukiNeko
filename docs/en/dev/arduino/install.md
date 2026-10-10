# Installation

## Requirements

- A YuzukiNeko.
- A data cable for the USB port (it is also the download port).
- A USB-to-serial adapter connected to the console UART (115200), to see `Serial` output.
- **Arduino IDE 2.x** or `arduino-cli`.

## Installation

1. In **File → Preferences**, paste into "Additional boards manager URLs":
   ```
   https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json
   ```
2. Open the **Boards Manager**, search for **YuzukiHD Boards** and install it.
3. **Tools → Board → YuzukiHD Boards**, select **YuzukiNeko**.
4. **Tools → Programmer → xfel (USB FEL)**. The board has no serial bootloader, so the normal "Upload" arrow does not work; only "Upload Using Programmer" does. The choice is remembered.

arduino-cli:

```sh
arduino-cli config add board_manager.additional_urls https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json
arduino-cli core update-index
arduino-cli core install yuzuki:f101
```

?> The index file exists only after a Release has been published; until then, use the Release assets or build it yourself.

### One-time: install the USB driver for FEL

- **Windows**: power up the board while holding the **FEL** button, open <https://zadig.akeo.ie>, select the device `USB Device (VID_1f3a PID_efe8)`, choose the **WinUSB** driver, and click **Install Driver**.
- **Linux**: `sudo apt install libusb-1.0-0`, then grant permissions:
  ```sh
  echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="1f3a", ATTR{idProduct}=="efe8", MODE="0666"' | sudo tee /etc/udev/rules.d/50-allwinner-fel.rules
  sudo udevadm control --reload
  ```

## Offline Installation

Download `yuzukihd-f101-<version>.zip` from the Releases page (<https://github.com/YuzukiHD/Arduino/releases>) and extract it to `<sketchbook>/hardware/yuzuki/f101` (the sketchbook defaults to `Documents/Arduino`). Install `riscv-gcc` and `xfel` from the same page into `<Arduino15>/packages/yuzuki/tools/<name>/<version>` (`Arduino15` is `%LOCALAPPDATA%\Arduino15` on Windows and `~/.arduino15` on Linux), then restart the IDE.
