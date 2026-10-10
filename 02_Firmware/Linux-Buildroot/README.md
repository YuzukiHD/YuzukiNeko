# Linux + Buildroot for Yuzuki Neko

## Directory Overview

This directory provides SPI NOR boot images for the Yuzuki Neko **F101-S3**,
built with Buildroot. The boot sequence is
BROM → SyterKit → OpenSBI → Linux → BusyBox. The root filesystem is a SquashFS
image with a writable JFFS2 overlay on top, so changes made on the board
survive a reboot. These images target the board tested with 16 MiB of PSRAM and
16 MiB of SPI NOR flash.

| File | Architecture | ABI | Size (bytes) |
| --- | --- | --- | ---: |
| `linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img` | RV32 (C907) | ilp32d | 16,777,216 |
| `linux-7.2-YuzukiNeko-sun252i-f101-buildroot-rv64i-nor.img` | RV64I | lp64 | 16,777,216 |
| `SHA256SUMS` | SHA-256 checksums for the two images | — | — |
| `manifest.json` | Region layout, per-payload checksums, source versions | — | — |
| `licenses/` | Licenses & third-party notices | — | — |

Each image is complete: it contains the bootloader, device tree, SBI firmware,
kernel and root filesystem, and it is exactly the size of the flash chip.
Space that holds no payload — and the overlay partition — is erased (0xFF).

Unlike [`../RustSBI-Asterinas/`](../RustSBI-Asterinas/README.md), which is a
7 MiB partial image that boots into an initramfs, these images cover all
16 MiB of the flash and mount a persistent root filesystem from it.

`.img` here means **raw SPI NOR data**. It is neither a PhoenixSuit container
nor a disk image with a partition table. See [manifest.json](manifest.json) for
the full layout and version details.

## Flashing the Full Image

**Windows, Linux, and macOS are all supported as flashing hosts.** Install
**xfel or rfel** first, following the [Appendix](#appendix). The instructions
below assume that your chosen tool is on PATH and your terminal is in this
directory.

Use a full image for the first installation or when switching from other
firmware. Because each image is the full 16 MiB, writing it replaces
**everything** on the flash chip, including the overlay partition that holds
the board's persistent changes. Back the flash up first as described in the
Appendix if you want to keep what is on the board.

1. Hold the board's **FEL** button, reconnect the USB data cable, then release
   the button.
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

   The tool should identify an F101 with chip ID `0x00193700` and 16 MiB of
   flash. If it reports `unsupported chip`, update to a version with F101
   support. This operation does not require running the `ddr` command.
3. Choose the architecture you want, then write and read back the image.
   RV32:

   ```sh
   xfel spinor write 0x0 linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img
   xfel spinor read 0x0 0x1000000 readback-rv32.img
   ```

   RV64I:

   ```sh
   xfel spinor write 0x0 linux-7.2-YuzukiNeko-sun252i-f101-buildroot-rv64i-nor.img
   xfel spinor read 0x0 0x1000000 readback-rv64i.img
   ```

   Or use the same commands with `rfel` in place of `xfel`.
4. Calculate the SHA-256 checksums of the original image and the readback as
   described in the Appendix. Confirm that they match each other and the entry
   in `SHA256SUMS`. Resolve any command errors or checksum mismatches before
   booting.
5. Release the FEL button and reset the board using your chosen tool:

   ```sh
   xfel reset
   ```

   Or:

   ```sh
   rfel reset
   ```

Connect a serial terminal to the board's UART using **115200 baud, 8N1, and no
flow control**. The kernel command line is baked into the device tree:

```text
console=ttyS1,115200n8 earlycon=uart8250,mmio32,0x02500400 loglevel=8 printk.time=1 root=/dev/mtdblock4 rootfstype=squashfs ro
```

The console is UART1 / `ttyS1`. Booting mounts the SquashFS root read-only,
`/sbin/init` builds the overlayfs on top of it, and a login prompt appears. The
configuration sets no root password, so Buildroot's default applies: log in as
`root` with an empty password.

On a first boot, `/sbin/init` has to erase and format the JFFS2 overlay
partition, which takes a moment; the first boot is slower than later ones.

## Replacing Individual Images

**Windows, Linux, and macOS are all supported.** Install **xfel or rfel** first
as described in the Appendix. The instructions below assume that the tool is
installed, your terminal is in this directory, and the board already has a
matching full image installed. Reconnect USB while holding the FEL button, then
run your chosen tool's `version` and `spinor` commands to check the device.

Flash offsets differ from RAM load addresses in this layout. Use the **NOR
offsets** in the following table:

| Component | NOR offset | Reserved capacity in this layout | RAM load address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` (loaded by the BROM into SRAM) |
| Device tree | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux Image | `0x0d0000` | 6 MiB | `0x40000000` |
| SquashFS rootfs | `0x6d0000` | up to `0xf00000` (about 8.2 MiB) | mounted from MTD, not copied to RAM |
| JFFS2 overlay | `0xf00000` | 1 MiB, erased | mounted from MTD |

These regions are the same ones the device tree declares as MTD fixed
partitions, named `bootloader`, `dtb`, `opensbi`, `kernel`, `rootfs` and
`overlay`.

> **The SyterKit loader reads fixed sizes, not real file sizes.** It copies
> exactly 256 KiB of device tree, 512 KiB of `fw_jump` and 6 MiB of kernel out
> of the flash on every boot. A replacement must fit inside the reserved
> capacity of its region; a larger payload is not detected, it is simply read
> as a truncated image. The boundaries are also hard-coded, so a payload cannot
> be moved to a different offset.

Choose one or more write commands below as needed. Replacing one component does
not require writing the others.

**xfel:**

```sh
xfel spinor write 0x0 spinor-boot_spi.bin
xfel spinor write 0x10000 sun252i-f101-yuzukineko.dtb
xfel spinor write 0x50000 fw_jump.bin
xfel spinor write 0xd0000 Image
```

**rfel:**

```sh
rfel spinor write 0x0 spinor-boot_spi.bin
rfel spinor write 0x10000 sun252i-f101-yuzukineko.dtb
rfel spinor write 0x50000 fw_jump.bin
rfel spinor write 0xd0000 Image
```

The RV64I image uses `spinor-boot-rv64i_spi.bin` and
`sun252i-f101-yuzukineko-rv64i.dtb` at the same offsets.

After writing, read back the corresponding range using the actual file size and
verify it. For example, after replacing the kernel with this package's RV32
image:

```sh
xfel spinor read 0xd0000 0x4c3be8 Image-readback.bin
```

The equivalent rfel command is:

```sh
rfel spinor read 0xd0000 0x4c3be8 Image-readback.bin
```

`0x4c3be8` is the size of this package's RV32 kernel Image: 4,996,072 bytes.
Adjust the length to the actual file size for other versions, and read the
per-image value from [manifest.json](manifest.json) — the RV64I Image, for
example, is 5,881,208 bytes. Once the readback SHA-256 matches the file you
wrote, run `xfel reset` or `rfel reset`.

> Writing the bootloader, the device tree or `fw_jump` from a *different*
> architecture's package leaves the board unbootable. The RV32 and RV64I images
> are not interchangeable component by component; replace a whole image, not
> parts of it, when switching architecture.

## Building from Source

Both images are produced by
[`YuzukiHD/buildroot-external-yuzukihd`](https://github.com/YuzukiHD/buildroot-external-yuzukihd),
an external tree for upstream [Buildroot](https://buildroot.org) that holds the
YuzukiHD board support and the SyterKit build recipe. Nothing is patched inside
the Buildroot checkout itself.

The external tree provides two defconfigs for these images:

| Defconfig | Architecture | Bootloader |
| --- | --- | --- |
| `yuzukihd_yuzukineko_nor_defconfig` | RV32 (C907 / ilp32) | `spinor-boot_spi.bin` |
| `yuzukihd_yuzukineko_rv64i_nor_defconfig` | RV64I (lp64) | `spinor-boot-rv64i_spi.bin` |

Each one selects SyterKit
([`YuzukiHD/SyterKit`](https://github.com/YuzukiHD/SyterKit)), OpenSBI
`fw_jump` ([`YuzukiHD/opensbi`](https://github.com/YuzukiHD/opensbi), branch
`sun252i-f101`), the Linux `Image` and device tree
([`YuzukiHD/linux-mainline`](https://github.com/YuzukiHD/linux-mainline),
branch `sun252i_f101_7.2`), and a SquashFS (xz) root filesystem. The
post-image script
`board/yuzukihd/yuzukineko/scripts/post-image-nor.sh` then assembles the 16 MiB
`images/yuzukineko-nor.img`.

Build out of tree, pointing `BR2_EXTERNAL` at the external tree:

```sh
git clone https://github.com/YuzukiHD/buildroot-external-yuzukihd.git
git clone https://github.com/buildroot/buildroot.git

make -C buildroot O=$PWD/build-rv32 \
    BR2_EXTERNAL=$PWD/buildroot-external-yuzukihd \
    yuzukihd_yuzukineko_nor_defconfig
make -C buildroot O=$PWD/build-rv32
```

The result is `build-rv32/images/yuzukineko-nor.img`. Substitute
`yuzukihd_yuzukineko_rv64i_nor_defconfig` and a separate output directory for
the RV64I image.

Both defconfigs build SyterKit with the x86_64 Xuantie-900 ELF/Newlib V3.2.0
toolchain, downloaded by Buildroot, because SyterKit's C907-specific compiler
flags need it; the root filesystem is built with Buildroot's internal musl
toolchain. The `*_xuantie_nor_defconfig` variant instead reuses the Xuantie
musl32 toolchain for the root filesystem as well.

The images in this directory were built from Buildroot revisions recorded per
image in [manifest.json](manifest.json). Because the external tree and the
kernel and OpenSBI branches are moving targets, a fresh build is unlikely to
reproduce these exact files.

## Using the System After Boot

The root filesystem is writable: `/sbin/init` pivots onto an overlayfs whose
upper layer is the JFFS2 `overlay` partition, so files you create or change are
kept across reboots until you reflash. `/etc/init.d/` provides the usual
BusyBox startup scripts. `reboot` restarts the system. `poweroff` stops the
system, but the board remains powered by USB; it does not cut the power supply.

To restore the board's persistent state to the contents of the image, erase the
overlay partition from the running system (`flash_erase /dev/mtd5 0 0`) or
reflash the image.

## Appendix

### Installing xfel and rfel

Full instructions for all three host platforms, including USB drivers and
udev rules, are in the repository documentation:
[FEL Download Mode and Tools](../../docs/en/boot/fel.md)
(Chinese: [FEL 下载模式与工具](../../docs/boot/fel.md)).

- **xfel** — from the [xboot/xfel repository](https://github.com/xboot/xfel).
  Use **v1.4.0** or later, the current release; it adds the F101
  `xfel extra exec riscv64` command. The version you use must support F101.
- **rfel** — from
  [rustsbi/allwinner-hal](https://github.com/rustsbi/allwinner-hal/tree/main/rfel).
  Use source containing `11544b3` (`feat(rfel): support F101 chip`) or later.

On Windows, if the tool cannot open the FEL device, use
[Zadig](https://zadig.akeo.ie/) to install the WinUSB driver for the **FEL USB
device (VID `1f3a`, PID `efe8`)**. Check the VID/PID before selecting the
device, and do not change the USB serial adapter's driver.

On Linux, if rfel reports insufficient USB permissions, create
`/etc/udev/rules.d/70-allwinner-fel.rules` with:

```text
SUBSYSTEM=="usb", ATTR{idVendor}=="1f3a", ATTR{idProduct}=="efe8", TAG+="uaccess"
```

Run `sudo udevadm control --reload-rules`, then reconnect the device.

### Verifying Files

Windows PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img
Get-FileHash -Algorithm SHA256 readback-rv32.img
```

Linux:

```sh
sha256sum -c SHA256SUMS
sha256sum linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img readback-rv32.img
```

macOS:

```sh
shasum -a 256 -c SHA256SUMS
shasum -a 256 linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img readback-rv32.img
```

When replacing an individual image, substitute the corresponding original and
readback filenames in these commands. The expected value for the whole file is
in `SHA256SUMS`; the expected value for a single region is in
`manifest.json`.

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

### Licenses and Source Code

The firmware and its third-party software follow their respective licenses; the
CC0 declaration for hardware files does not apply to them. See
[licenses/README.md](licenses/README.md) for the license texts and provenance
of the components in these images.
