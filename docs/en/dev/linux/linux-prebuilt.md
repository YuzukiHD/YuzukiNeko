# Prebuilt Images

The repository directory `02_Firmware/Linux-Buildroot/` provides SPI NOR boot images for the YuzukiNeko **F101-S3**, built with [Buildroot](https://buildroot.org). The boot chain is:

```
BROM → SyterKit → OpenSBI → Linux → BusyBox
```

Two images are provided, one per CPU mode: **RV32** (C907, `ilp32d`) and **RV64I** (`lp64`). The root filesystem is a SquashFS image with a writable JFFS2 overlay on top, so changes made on the board survive a reboot. The images are built for boards with **16 MiB PSRAM + 16 MiB SPI NOR**.

To build these images yourself, see [Linux + Buildroot](linux-buildroot.md) (one command) and [Manual Build](linux-manual.md) (step by step).

## File List

| File | Architecture | ABI | Size (bytes) |
| --- | --- | --- | ---: |
| `linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img` | RV32 (C907) | ilp32d | 16,777,216 |
| `linux-7.2-YuzukiNeko-sun252i-f101-buildroot-rv64i-nor.img` | RV64I | lp64 | 16,777,216 |
| `SHA256SUMS` | SHA-256 of the two images | — | — |
| `manifest.json` | Region layout, per-payload checksums, source versions | — | — |
| `licenses/` | Licenses and third-party notices | — | — |

Each image is complete — bootloader, device tree, SBI firmware, kernel and root filesystem — and is exactly the size of the Flash chip. Space that holds no payload, and the overlay partition, is erased (`0xFF`).

Unlike [RustSBI + Asterinas](../asterinas/rustsbi-asterinas.md), which is a 7 MiB partial image that boots into an initramfs, these images cover all 16 MiB of the Flash and mount a persistent root filesystem from it.

`.img` here means **raw SPI NOR data**. It is neither a PhoenixSuit container nor a disk image with a partition table.

## Flashing the Full Image

**Windows, Linux and macOS can all be the flashing host.** First install xfel or rfel as described in [FEL Download Mode and Tools](../../boot/fel.md). The steps below assume the tool is in `PATH` and the terminal is in the directory containing the images.

Use a full image for a first installation or when switching from other firmware. Because each image is the full 16 MiB, writing it replaces **everything** on the Flash chip, including the overlay partition that holds the board's persistent changes. If you want to keep what is on the board, [back it up](../../boot/flash-layout.md#back-up-the-whole-flash) first.

1. Hold the **FEL** button, replug the USB data cable, and release.
2. Check the chip and Flash:
   ```sh
   xfel version
   xfel spinor
   ```
   It should identify an F101 with chip ID `0x00193700` and a 16 MiB Flash. This step does **not** need the `ddr` command.
3. Write and read back the architecture you want. RV32:
   ```sh
   xfel spinor write 0x0 linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img
   xfel spinor read 0x0 0x1000000 readback-rv32.img
   ```
   RV64I:
   ```sh
   xfel spinor write 0x0 linux-7.2-YuzukiNeko-sun252i-f101-buildroot-rv64i-nor.img
   xfel spinor read 0x0 0x1000000 readback-rv64i.img
   ```
   rfel works the same way; replace `xfel` with `rfel`.
4. Compute the SHA-256 of the original image and of the readback, and confirm they match each other and the value recorded in `SHA256SUMS`. If there are errors or a mismatch, fix the problem before booting.
5. Release the FEL button and reset:
   ```sh
   xfel reset
   ```

### Connecting the Serial Port

Connect to the board's UART at **115200 baud, 8N1, no flow control**. The kernel command line is baked into the device tree:

```text
console=ttyS1,115200n8 earlycon=uart8250,mmio32,0x02500400 loglevel=8 printk.time=1 root=/dev/mtdblock4 rootfstype=squashfs ro
```

The console is UART1 / `ttyS1`. Booting mounts the SquashFS root read-only, `/sbin/init` builds the overlayfs on top of it, and a login prompt appears. The configuration sets no root password, so Buildroot's default applies: log in as `root` with an empty password.

?> The documentation of this package does not state which header pins the console is wired to. Check the serial pins against the [schematics](../../hardware/files.md).

?> On a first boot, `/sbin/init` has to erase and format the JFFS2 overlay partition. This takes a moment, so the first boot is slower than later ones.

## Replacing Individual Components

Prerequisite: the board already has a matching full image from this directory installed. Hold FEL, replug USB, and check the device with `version` and `spinor` first.

In this layout the Flash offsets and RAM load addresses differ; use the **NOR offsets** below:

| Component | NOR offset | Reserved in this layout | RAM load address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` (loaded by the BROM into SRAM) |
| Device tree | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux Image | `0x0d0000` | 6 MiB | `0x40000000` |
| SquashFS rootfs | `0x6d0000` | up to `0xf00000` (about 8.2 MiB) | mounted from MTD, not copied to RAM |
| JFFS2 overlay | `0xf00000` | 1 MiB, erased | mounted from MTD |

These regions are the same ones the device tree declares as MTD fixed partitions, named `bootloader`, `dtb`, `opensbi`, `kernel`, `rootfs` and `overlay`.

!> **The SyterKit loader reads fixed sizes, not real file sizes.** It copies exactly 256 KiB of device tree, 512 KiB of `fw_jump` and 6 MiB of kernel out of the Flash on every boot. A replacement must fit inside the reserved capacity of its region; a larger payload is not detected, it is simply read as a truncated image. The boundaries are also hard-coded, so a payload cannot be moved to a different offset.

Choose the write commands you need; replacing one component does not require rewriting the others:

```sh
xfel spinor write 0x0 spinor-boot_spi.bin
xfel spinor write 0x10000 sun252i-f101-yuzukineko.dtb
xfel spinor write 0x50000 fw_jump.bin
xfel spinor write 0xd0000 Image
```

The RV64I image uses `spinor-boot-rv64i_spi.bin` and `sun252i-f101-yuzukineko-rv64i.dtb` at the same offsets.

After writing, read back the corresponding range according to the actual file size and verify it. For example, after replacing the kernel with this package's RV32 image:

```sh
xfel spinor read 0xd0000 0x4c3be8 Image-readback.bin
```

`0x4c3be8` is the size of this package's RV32 kernel Image (4,996,072 bytes); for other versions, adjust the length to the actual size. The per-image values are in `manifest.json`. Once the SHA-256 of the readback matches the written file, run `xfel reset`.

!> Writing the bootloader, device tree or `fw_jump` from a **different** architecture's package leaves the board unbootable. The RV32 and RV64I images are not interchangeable component by component; when switching architecture, replace a whole image rather than parts of it.

## After Boot

The root filesystem is writable: `/sbin/init` pivots onto an overlayfs whose upper layer is the JFFS2 `overlay` partition, so files you create or change are kept across reboots until you reflash. `/etc/init.d/` provides the usual BusyBox startup scripts. `reboot` restarts the system. `poweroff` halts the system, but the board is still powered over USB, so it **does not cut the power**.

To return the board's persistent state to the contents of the image, erase the overlay partition from the running system (`flash_erase /dev/mtd5 0 0`) or reflash the image.

## Component Versions

From `manifest.json`:

| Component | Version / commit | Notes |
| --- | --- | --- |
| SyterKit | `f95d29d6` | Pinned exactly by the external tree; the same for both images |
| OpenSBI | 1.9, branch `sun252i-f101` | The defconfig names a branch, not a commit |
| Linux | 7.2.0, branch `sun252i_f101_7.2` | The defconfig names a branch, not a commit |
| BusyBox | 1.38.0 | Read from the BusyBox banner inside each image |
| musl | 1.2.6 | |
| Buildroot | `2026.08` + commits | The two images were built by different revisions |
| Toolchain | GCC 15.3.0, binutils 2.45.1 | Buildroot internal musl toolchain |

## Verification

The checksums, region sizes and version strings in `manifest.json` were derived from the two image files themselves. **No hardware boot test is recorded for this package**; a board-level result is not asserted here.

## License

The firmware and its third-party software follow their own licenses, and the repository's CC0 statement **does not apply** to them. The license texts and sources of the components in these images are in `licenses/README.md`.
