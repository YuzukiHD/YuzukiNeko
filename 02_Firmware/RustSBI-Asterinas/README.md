# RustSBI + Asterinas for Yuzuki Neko

## Directory Overview

This directory provides SPI NOR boot images for the Yuzuki Neko **F101-S3**.
The boot sequence is SyterKit → RustSBI → Asterinas → BusyBox shell. These images
target the board tested with 16 MiB of PSRAM and 16 MiB of SPI NOR flash.

| File | Purpose | Size (bytes) |
| --- | --- | ---: |
| `syterkit-3bf4f61f.bin` | SyterKit with an eGON boot header; initializes PSRAM and loads subsequent images | 49,152 |
| `rustsbi-0.4.1.bin` | RustSBI 0.4.1, customized for Neko RV32 scalar extensions with WARN logging | 270,336 |
| `asterinas.bin` | Raw Asterinas RV32 kernel image | 2,762,160 |
| `yuzukineko-rustsbi-asterinas.img` | Full boot image containing the three components above, a device tree, and an initramfs with BusyBox | 7,143,424 |
| `SHA256SUMS` | SHA-256 checksums for the four images | — |
| `manifest.json` | Source versions, flash layout, and validation information | — |
| `licenses/` | Licenses & third-party notices | — |

See [manifest.json](manifest.json) for full version details.

Individual images use `.bin`, while the combined image uses `.img`. The `.img`
file contains **raw SPI NOR data** assembled at fixed offsets. It is neither a
PhoenixSuit container nor a disk image with a partition table.

## Flashing the Full Image

**Windows, Linux, and macOS are all supported as flashing hosts.** Install
**xfel or rfel** first, following the [Appendix](#appendix). The instructions
below assume that your chosen tool is on PATH and your terminal is in this directory.

Use the full image for the first installation or when switching from other
firmware. It writes to NOR addresses `0x000000..0x6d0000`; the range
`0x6d0000..0x1000000` is outside this write operation. “Full image” means that
the file contains everything needed to boot; it is not padded to the flash
chip's full 16 MiB capacity. To preserve the existing firmware, back it up first
as described in the Appendix.

1. Hold the board's **FEL** button, reconnect the USB data cable, then release the button.
2. Check the chip and flash using your chosen tool:

   ```sh
   xfel version
   xfel spinor
   ```

   Or:

   ```sh
   rfel version
   rfel spinor
   ```

   The tool should identify an F101 with chip ID `0x00193700` and 16 MiB of flash.
   If it reports `unsupported chip`, update to a version with F101 support.
   This operation does not require running the `ddr` command.

3. Choose one set of commands to write and read back the image:

   ```sh
   xfel spinor write 0x0 yuzukineko-rustsbi-asterinas.img
   xfel spinor read 0x0 0x6d0000 readback.img
   ```

   Or:

   ```sh
   rfel spinor write 0x0 yuzukineko-rustsbi-asterinas.img
   rfel spinor read 0x0 0x6d0000 readback.img
   ```

4. Calculate the SHA-256 checksums of the original image and `readback.img` as
   described in the Appendix. Confirm that they match each other and the entry
   in `SHA256SUMS`. Resolve any command errors or checksum mismatches before booting.
5. Release the FEL button and reset the board using your chosen tool:

   ```sh
   xfel reset
   ```

   Or:

   ```sh
   rfel reset
   ```

Connect a serial terminal to the board's UART using **115200 baud, 8N1, and no
flow control**. Booting opens a BusyBox shell. RustSBI uses WARN logging, so its
INFO banner is not displayed during normal boot.

## Replacing Individual Images

**Windows, Linux, and macOS are all supported.** Install **xfel or rfel** first
as described in the Appendix. The instructions below assume that the tool is
installed, your terminal is in this directory, and the board already has this
directory's full image installed. Reconnect USB while holding the FEL button,
then run your chosen tool's `version` and `spinor` commands to check the device.

Flash offsets differ from RAM load addresses in this layout. Use the
**NOR offsets** in the following table:

| Component | NOR offset | Reserved capacity in this layout | RAM load address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| Device tree (included in the full image) | `0x010000` | 256 KiB | `0x40f40000` |
| RustSBI | `0x050000` | 512 KiB | `0x40f80000` |
| Asterinas | `0x0d0000` | 5 MiB, ending before the initramfs | `0x40000000` |
| initramfs (included in the full image) | `0x5d0000` | 1 MiB | `0x40500000` |

These capacity limits describe only this image's layout. Custom builds must
also keep entry points, load addresses, the device tree, and memory usage
compatible; binary size alone does not determine whether a replacement will
work. In particular, RustSBI's runtime memory, including BSS, stacks, and heap,
must fit within its reserved region.

Choose one or more write commands below as needed. Replacing one component does
not require writing the others.

**xfel:**

```sh
xfel spinor write 0x0 syterkit-3bf4f61f.bin
xfel spinor write 0x50000 rustsbi-0.4.1.bin
xfel spinor write 0xd0000 asterinas.bin
```

**rfel:**

```sh
rfel spinor write 0x0 syterkit-3bf4f61f.bin
rfel spinor write 0x50000 rustsbi-0.4.1.bin
rfel spinor write 0xd0000 asterinas.bin
```

After writing, read back the corresponding range using the actual file size
and verify it. For example, after replacing RustSBI with the file in this package:

```sh
xfel spinor read 0x50000 0x42000 rustsbi-readback.bin
```

The equivalent rfel command is:

```sh
rfel spinor read 0x50000 0x42000 rustsbi-readback.bin
```

`0x42000` is the size of this package's RustSBI file: 270,336 bytes. Adjust the
length to the actual file size for other versions. Once the readback SHA-256
matches the file you wrote, run `xfel reset` or `rfel reset`. Writing only the
three individual images does not install the device tree or root filesystem,
so use the full image for the first installation.

## Appendix

### Installing xfel

Obtain the tool from the [xboot/xfel repository](https://github.com/xboot/xfel).
This package was tested on the board using v1.3.6; your version must support F101.

**Windows**

Download `xfel-windows-v1.3.6.7z` from the repository's
[v1.3.6 release](https://github.com/xboot/xfel/releases/tag/v1.3.6), extract the
entire archive, add the directory containing `xfel.exe` to PATH, and reopen
PowerShell. Keep the bundled DLLs alongside the executable. If you do not set
PATH, you can run `./xfel.exe` from the tool's directory instead of `xfel`.

**Linux (Debian / Ubuntu example)**

Download the source from the repository, then build and install it:

```sh
sudo apt update
sudo apt install git build-essential pkg-config libusb-1.0-0-dev
git clone https://github.com/xboot/xfel.git
cd xfel
make
sudo make install
sudo udevadm control --reload-rules
```

Reconnect the FEL device so the installed udev rules take effect.

**macOS**

Install Xcode Command Line Tools and [Homebrew](https://brew.sh/), then obtain
the source from the repository:

```sh
xcode-select --install
brew install libusb pkg-config
git clone https://github.com/xboot/xfel.git
cd xfel
make
sudo install -m 755 xfel /usr/local/bin/xfel
```

If `/usr/local/bin` does not exist, first run `sudo mkdir -p /usr/local/bin`, and
ensure that the directory is on PATH. macOS does not use Linux udev rules.

### Installing rfel from Source

rfel is part of [rustsbi/allwinner-hal](https://github.com/rustsbi/allwinner-hal/tree/main/rfel).
Install [Rust and Cargo](https://www.rust-lang.org/tools/install), along with Git.
Windows also requires the C++ toolchain from Visual Studio Build Tools. Linux
requires a C compiler and linker (`build-essential` on Debian / Ubuntu), and
macOS requires Xcode Command Line Tools.

Run the following commands on any of the three host platforms:

```sh
git clone https://github.com/rustsbi/allwinner-hal.git
cd allwinner-hal
rustup update stable
cargo +stable install --path rfel
rfel --help
```

Use source containing `11544b3` (`feat(rfel): support F101 chip`) or subsequent
F101 support. If you have an older checkout, update the source before reinstalling.
Cargo usually installs executables to `%USERPROFILE%\.cargo\bin` on Windows or
`~/.cargo/bin` on Linux / macOS; ensure that this directory is on PATH.
`rfel version` queries the chip version of the connected device.

### USB Drivers and Access Permissions

If the tool cannot open the FEL device on Windows, use
[Zadig](https://zadig.akeo.ie/) to install the WinUSB driver for the
**FEL USB device (VID `1f3a`, PID `efe8`)**. Check the VID/PID before selecting
the device, and do not change the USB serial adapter's driver.

If rfel reports insufficient USB permissions on Linux, run the tool by its
absolute path with administrator privileges, or configure a udev rule for the
device. On desktop systems using systemd-logind, create
`/etc/udev/rules.d/70-allwinner-fel.rules` with the following contents:

```text
SUBSYSTEM=="usb", ATTR{idVendor}=="1f3a", ATTR{idProduct}=="efe8", TAG+="uaccess"
```

Run `sudo udevadm control --reload-rules`, then reconnect the device. On systems
without a desktop session, configure USB access according to the local user
groups. macOS does not require WinUSB or udev rules.

### Verifying Files

Windows PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 yuzukineko-rustsbi-asterinas.img
Get-FileHash -Algorithm SHA256 readback.img
```

Linux:

```sh
sha256sum -c SHA256SUMS
sha256sum yuzukineko-rustsbi-asterinas.img readback.img
```

macOS:

```sh
shasum -a 256 -c SHA256SUMS
shasum -a 256 yuzukineko-rustsbi-asterinas.img readback.img
```

When replacing an individual image, substitute the corresponding original and
readback filenames in these commands.

### Backing Up the Existing Flash

After confirming that the board has 16 MiB of SPI NOR flash, run the following
in FEL mode:

```sh
xfel spinor read 0x0 0x1000000 neko-backup.bin
```

Or use:

```sh
rfel spinor read 0x0 0x1000000 neko-backup.bin
```

Keep your backup and its SHA-256 checksum, and do not overwrite an earlier
backup. To restore your own backup, use
`xfel spinor write 0x0 neko-backup.bin` or `rfel spinor write 0x0 neko-backup.bin`,
then read it back, verify it, and reset the board.

### Using the System After Boot

Run `/root/run-demos.sh` in the BusyBox shell to execute nine examples.
Serial input in this package is sensitive to long pasted strings; you can set
the terminal's transmit delay to approximately **20 ms per character**.
`reboot` restarts the system. `poweroff` stops the system, but the board remains
powered by USB; it does not cut the power supply.

### Licenses and Source Code

The firmware and its third-party software follow their respective licenses;
the CC0 declaration for hardware files does not apply to them. See
[licenses/README.md](licenses/README.md) for the license texts and provenance
of the four components currently retained.
