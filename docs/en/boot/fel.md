# FEL Download Mode and Tools

The F101 BROM contains a USB download mode called **FEL**. In FEL, the host can read and write the SPI NOR over USB, load programs into memory and run them. Every download method on this board (xfel, rfel, Arduino upload, booting the UF2 loader from FEL) is built on it.

## Entering FEL

1. Hold the **FEL** button on the board.
2. Plug in the USB data cable (or reset if the board is already powered).
3. Release the FEL button.

Confirm with the tool:

```sh
xfel version
```

You should see output like `AWUSBFEX ID=0x00193700(F101)`. The USB device VID/PID is `1f3a:efe8`.

!> **A board that already boots from Flash does not enter FEL on its own.** Once the SPI NOR holds a valid boot loader, power-on runs it directly, and you must hold the FEL button to enter download mode. Conversely, when the first sector of the Flash is empty, the BROM falls into FEL on every power-up.

## Installing xfel

xfel repository: <https://github.com/xboot/xfel>. Use **v1.4.0** or later, the current release; it adds the F101 `xfel extra exec riscv64` command. The version you use must support the F101.

### Windows

Download `xfel-windows-v1.4.0.7z` from the [v1.4.0 release page](https://github.com/xboot/xfel/releases/tag/v1.4.0), **extract everything**, add the directory containing `xfel.exe` to `PATH`, and reopen PowerShell. The bundled DLLs must stay next to `xfel.exe`. Without a `PATH` entry, you can use `./xfel.exe` in place of `xfel` from the tool directory.

### Linux (Debian / Ubuntu as an example)

```sh
sudo apt update
sudo apt install git build-essential pkg-config libusb-1.0-0-dev
git clone https://github.com/xboot/xfel.git
cd xfel
make
sudo make install
sudo udevadm control --reload-rules
```

Replug the FEL device so the installed udev rules take effect.

### macOS

```sh
xcode-select --install
brew install libusb pkg-config
git clone https://github.com/xboot/xfel.git
cd xfel
make
sudo install -m 755 xfel /usr/local/bin/xfel
```

If `/usr/local/bin` does not exist, run `sudo mkdir -p /usr/local/bin` first and make sure it is in `PATH`. macOS does not use udev rules.

## Installing rfel

rfel is part of [rustsbi/allwinner-hal](https://github.com/rustsbi/allwinner-hal/tree/main/rfel), written in Rust, with the same commands on all three platforms. It needs [Rust and Cargo](https://www.rust-lang.org/tools/install) and Git. Windows also needs the C++ toolchain from Visual Studio Build Tools; Linux needs a C compiler and linker (`build-essential` on Debian / Ubuntu); macOS needs the Xcode Command Line Tools.

```sh
git clone https://github.com/rustsbi/allwinner-hal.git
cd allwinner-hal
rustup update stable
cargo +stable install --path rfel
rfel --help
```

The source must include commit `11544b3` (`feat(rfel): support F101 chip`) or newer F101 support. For an older checkout, update it and reinstall. Cargo usually installs the executable to `%USERPROFILE%\.cargo\bin` on Windows or `~/.cargo/bin` on Linux / macOS; make sure it is in `PATH`.

`rfel version` queries the chip version of the connected device.

## USB Drivers and Permissions

### Windows

If the tool cannot open the FEL device, use [Zadig](https://zadig.akeo.ie/) to install the **WinUSB** driver for the **FEL USB device (VID `1f3a`, PID `efe8`)**. Check the VID/PID before selecting the device, and **do not change the driver of your USB serial adapter**.

### Linux

When rfel reports insufficient USB permissions, you can run it with administrator rights using its absolute path, or configure a udev rule. On desktop systems using systemd-logind, create `/etc/udev/rules.d/70-allwinner-fel.rules`:

```text
SUBSYSTEM=="usb", ATTR{idVendor}=="1f3a", ATTR{idProduct}=="efe8", TAG+="uaccess"
```

Then run `sudo udevadm control --reload-rules` and replug the device. On systems without a desktop session, configure USB permissions according to your local user groups. The Arduino documentation gives an alternative form, `MODE="0666"`, which opens the device to all users; choose as needed.

### macOS

No WinUSB or udev rules are needed.

## Common Commands

| Command | Purpose |
| --- | --- |
| `xfel version` | Query the chip, confirm the FEL connection |
| `xfel spinor` | Identify the SPI NOR and its capacity |
| `xfel spinor read <addr> <len> <file>` | Read Flash |
| `xfel spinor write <addr> <file>` | Write Flash (erases the required sectors automatically) |
| `xfel reset` | Reset the board |

The rfel subcommands have the same names; just replace `xfel` with `rfel`.

!> **Limits of some commands**: `xfel ddr f101-s3` (initialize PSRAM) followed by `xfel write` + `xfel exec` loads a program straight into PSRAM and runs it without touching Flash. This is the usual flow when developing bare-metal programs such as Zephyr, and it requires **a fresh power-up into FEL every time**, because FEL is no longer available after `exec`. The Flash-writing flow (the firmware flashing on this site) does **not** need `ddr`.

## Common Errors

| Message | Cause and fix |
| --- | --- |
| `unsupported chip` | The tool version does not support the F101; upgrade xfel / rfel |
| Device not found | Not in FEL; check that the cable carries data; on Windows check that WinUSB is installed |
| `usb bulk send/recv error` | If it happens after `exec`: the CPU has left the BROM and the program is running, which is normal |
| Insufficient permissions (Linux) | Configure udev rules, see above |
