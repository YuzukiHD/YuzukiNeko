---
title: "Install xfel and enter FEL"
---

xfel is the host-side FEL tool. It talks to the F101 BROM over USB in FEL mode. This page installs xfel, gets the board into FEL, and confirms the connection. Run the commands in a host terminal: PowerShell on Windows, a system terminal on Linux.

## Install xfel

### Windows

1. Download `xfel-windows-v1.4.0.7z` from [xfel Releases](https://github.com/xboot/xfel/releases/tag/v1.4.0). This version includes F101 support.
2. Extract the whole archive; keep the DLLs next to `xfel.exe`.
3. Put the files in a path without spaces or non-ASCII characters, for example `D:\neko`.
4. Open PowerShell in that directory and run:

```powershell
.\xfel.exe version
```

PowerShell does not search the current directory automatically, so without PATH you must write `.\xfel.exe`. Add the directory to PATH if you want to run `xfel version`; see [FEL download mode and tools](../boot/fel.md).

If xfel cannot find or open the device, install the WinUSB driver with [Zadig](https://zadig.akeo.ie/): select the FEL device with VID `1f3a` and PID `efe8`, choose WinUSB as the target driver, install, then replug the board. Do not change the driver of a serial adapter, keyboard, mouse or any other USB device.

![Zadig installing the WinUSB driver for the FEL device](figures/zadig.webp)

### Linux

On Debian / Ubuntu, install the dependencies and build from source:

```sh
sudo apt update
sudo apt install git build-essential pkg-config libusb-1.0-0-dev
git clone https://github.com/xboot/xfel.git
cd xfel
make
sudo make install
```

If xfel reports a permission error, create `/etc/udev/rules.d/70-allwinner-fel.rules` with:

```text
SUBSYSTEM=="usb", ATTR{idVendor}=="1f3a", ATTR{idProduct}=="efe8", TAG+="uaccess"
```

Reload the rules and replug the board:

```sh
sudo udevadm control --reload-rules
```

### macOS

macOS does not need WinUSB or a udev rule. Build and install with:

```sh
xcode-select --install
brew install libusb pkg-config
git clone https://github.com/xboot/xfel.git
cd xfel
make
sudo install -m 755 xfel /usr/local/bin/xfel
```

For more installation and driver details, see [FEL download mode and tools](../boot/fel.md).

## Enter FEL

1. Disconnect the board's USB cable.
2. Hold the `FEL` button.
3. Connect the USB data cable.
4. Release the `FEL` button.
5. Watch for a new USB device on the host.

When the flash has a valid bootloader, the board boots directly; hold `FEL` while powering on to enter download mode. When the flash boot area is empty, every power-up enters FEL.

| Mode | Board state | xfel can see it |
| --- | --- | --- |
| FEL mode | Waiting for host commands | Yes |
| Boot mode | Running the system from NOR | No |

## Confirm the connection

After entering FEL, run:

```sh
xfel version
xfel spinor
```

Without PATH on Windows, replace `xfel` with `.\xfel.exe`. Normal output looks like:

```text
AWUSBFEX ID=0x00193700(F101) dflag=0x44 dlength=0x08 scratchpad=0x00020000
Found spi nor flash 'SFDP' with 16777216 bytes
```

| Command | Key output |
| --- | --- |
| `xfel version` | `AWUSBFEX ID=0x00193700(F101)`, the F101 is detected |
| `xfel spinor` | `16777216 bytes`, a 16 MiB NOR flash |

Stop and check the wiring if the chip ID or capacity differs. Writing NOR does not need `xfel ddr`; RAM boot uses the SyterKit PSRAM helper, a separate path described in [PSRAM initialization and RAM boot](../boot/psram-init.md).

![Normal xfel version and xfel spinor output](figures/xfel-version.webp)

## Common errors

| Output or symptom | Likely cause | Action |
| --- | --- | --- |
| Device not found | Not in FEL, charge-only cable, driver missing | Hold FEL while powering on, replace the cable, install WinUSB on Windows |
| `unsupported chip` | xfel is too old | Use v1.4.0 or newer |
| Permission denied | Linux udev rule missing | Add the rule and replug |
| `xfel` is not recognized | PATH not configured | Run `.\xfel.exe` from the xfel directory |
| `No such file` | Wrong directory or file name | Check the current directory with `dir`/`ls` |
| `usb bulk send/recv error` | USB link dropped or the device reset | Hold FEL while powering on again, check the cable |
| Device appears and disappears | Poor cable contact, weak USB port power | Replace the cable, use a rear USB port |
| Zadig install did not help | Wrong device or the driver did not take effect | Check VID/PID, replug and retry |

## References

- FEL mode, installation and command reference: [FEL download mode and tools](../boot/fel.md)
- PSRAM initialization and RAM boot: [PSRAM initialization and RAM boot](../boot/psram-init.md)
- Backup, write and read-back: [Flashing NOR](nor-flash.md)

---

Next page: [Flashing NOR](nor-flash.md)
