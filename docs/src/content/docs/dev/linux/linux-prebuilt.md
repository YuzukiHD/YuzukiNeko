---
title: "Prebuilt images"
---

The repository's `02_Firmware/Linux-Buildroot/` provides SPI NOR boot images built with Buildroot for the YuzukiNeko <strong>F101-S3</strong>. The boot chain is:

```
BROM → SyterKit → OpenSBI → Linux → BusyBox
```

Two images are provided by CPU mode: <strong>RV32</strong> (C907, `ilp32d`) and <strong>RV64I</strong> (`lp64`). The root filesystem is SquashFS, with a writable JFFS2 overlay on top, so changes made on the board survive a reboot. The images are built for a board with <strong>16 MiB RAM + 16 MiB SPI NOR</strong>.

To build these images yourself, see [Linux + Buildroot](linux-buildroot.md) (one command) and [Manual build](linux-manual.md) (step by step).

## File list

| File | Architecture | ABI | Size (bytes) |
| --- | --- | --- | ---: |
| `linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img` | RV32 (C907) | ilp32d | 16,777,216 |
| `linux-7.2-YuzukiNeko-sun252i-f101-buildroot-rv64i-nor.img` | RV64I | lp64 | 16,777,216 |
| `SHA256SUMS` | SHA-256 of the two images above | — | — |
| `manifest.json` | Region layout, per-component checksums, source versions | — | — |
| `licenses/` | Licenses and third-party notices | — | — |

Each image is complete — bootloader, devicetree, SBI firmware, kernel, root filesystem — and is exactly the size of the whole Flash. Gaps that hold no payload and the overlay partition are erased to `0xFF`.

Unlike [RustSBI + Asterinas](../asterinas/rustsbi-asterinas.md): that one is a 7 MiB partial image that boots to initramfs; the images here cover the entire 16 MiB and mount a persistent root filesystem from Flash.

The `.img` is <strong>raw SPI NOR data</strong> assembled at fixed offsets; it is neither a PhoenixSuit container nor a disk image with a partition table.

## Flashing the full image

<strong>Windows, Linux, and macOS can all act as the flashing host.</strong> First install xfel or rfel as described in [FEL download mode and tools](../../boot/fel.md). The following assumes the tool is in `PATH` and the terminal is in the directory containing the images.

Use the full image for a first install or when switching from other firmware. Because each image is the entire 16 MiB, writing it <strong>covers the whole Flash</strong>, including the overlay partition that holds the board's persisted changes. To keep what is on the board, [back up](../../boot/flash-layout.md#back-up-the-whole-flash) first.

1. Hold the <strong>FEL</strong> button, reconnect the USB data cable, and release it.
2. Check the chip and Flash:
   ```sh
   xfel version
   xfel spinor
   ```
   It should recognise the F101 with chip ID `0x00193700` and the 16 MiB Flash. This step <strong>does not</strong> require the `ddr` command.
3. Write and read back for the architecture you need. RV32:
   ```sh
   xfel spinor write 0x0 linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img
   xfel spinor read 0x0 0x1000000 readback-rv32.img
   ```
   RV64I:
   ```sh
   xfel spinor write 0x0 linux-7.2-YuzukiNeko-sun252i-f101-buildroot-rv64i-nor.img
   xfel spinor read 0x0 0x1000000 readback-rv64i.img
   ```
   The same applies to rfel, replacing `xfel` with `rfel`.
4. Compute the SHA-256 of the original image and of the read-back file, and confirm that they match each other and the values recorded in `SHA256SUMS`. If there is an error or a checksum mismatch, resolve it before booting.
5. Release the FEL button and reset:
   ```sh
   xfel reset
   ```

### Connecting the serial port

Connect the board's UART with <strong>115200 baud, 8N1, no flow control</strong>. The kernel command line is fixed in the devicetree:

```text
console=ttyS1,115200n8 earlycon=uart8250,mmio32,0x02500400 loglevel=8 printk.time=1 root=/dev/mtdblock4 rootfstype=squashfs ro
```

The console is UART1 / `ttyS1`. At boot the SquashFS root is first mounted read-only, then `/sbin/init` sets up overlayfs on top of it, and the login prompt appears. No root password is set in the configuration, so Buildroot's default applies: log in as `root` with an empty password.

:::tip
The documentation in this package does not specify which header pin group the console is wired to. Check the serial port pins against the [schematic](../../hardware/files.md).
:::

:::tip
On the first boot, `/sbin/init` needs to erase and format the JFFS2 overlay partition, which takes a while, so the first boot is slower than later ones.
:::

## Replacing a single component

Prerequisite: the board already has the full image from this directory for the matching architecture. Hold FEL to reconnect USB, and first check the device with `version` and `spinor`.

In this layout the Flash offsets and RAM load addresses differ, so use the <strong>NOR offsets</strong> below:

| Component | NOR offset | Reserved in this layout | RAM load address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` (loaded into SRAM by the BROM) |
| Devicetree | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux Image | `0x0d0000` | 6 MiB | `0x40000000` |
| SquashFS root filesystem | `0x6d0000` | up to `0xf00000` (about 8.2 MiB) | Mounted from MTD, not copied to RAM |
| JFFS2 overlay | `0xf00000` | 1 MiB, erased | Mounted from MTD |

These regions are the fixed MTD partitions declared in the devicetree, named `bootloader`, `dtb`, `opensbi`, `kernel`, `rootfs`, and `overlay`.

:::caution
<strong>SyterKit reads a fixed length, not the file's actual size.</strong> On every boot it always takes a 256 KiB devicetree, 512 KiB `fw_jump`, and 6 MiB kernel from Flash. A replacement component must fit within the reserved capacity of its region; anything beyond it is not recognised and is simply read in as a truncated image. The boundaries are also hard-coded, so a component cannot be moved to a different offset.
:::

Choose the write commands you need; replacing one component does not require rewriting the others:

```sh
xfel spinor write 0x0 spinor-boot_spi.bin
xfel spinor write 0x10000 sun252i-f101-yuzukineko.dtb
xfel spinor write 0x50000 fw_jump.bin
xfel spinor write 0xd0000 Image
```

RV64I images use `spinor-boot-rv64i_spi.bin` and `sun252i-f101-yuzukineko-rv64i.dtb`, at the same offsets.

After writing, read back the corresponding range at the file's actual size and verify it. For example, after replacing with this package's RV32 kernel:

```sh
xfel spinor read 0xd0000 0x4c3be8 Image-readback.bin
```

`0x4c3be8` is the size of this package's RV32 kernel Image (4,996,072 bytes); for other versions, adjust the length to the actual size; the values for each image are in `manifest.json`. Once the read-back SHA-256 matches the written file, run `xfel reset`.

:::caution
Writing a bootloader, devicetree, or `fw_jump` from a package of <strong>the other architecture</strong> will make the board fail to boot. Components from RV32 and RV64I images cannot be used interchangeably; to switch architectures, replace the whole image, not individual components.
:::

## After boot

The root filesystem is writable: `/sbin/init` pivots to an overlayfs whose upper layer is the JFFS2 `overlay` partition, so newly created and modified files persist until the next reflash. `/etc/init.d/` holds the usual BusyBox startup scripts. `reboot` restarts the system. `poweroff` stops the system, but the board is still powered over USB, so it <strong>does not cut the power</strong>.

To restore the board's persistent state to the image contents, you can erase the overlay partition inside the system (`flash_erase /dev/mtd5 0 0`), or reflash the image.

## Component versions

From `manifest.json`:

| Component | Version / commit | Notes |
| --- | --- | --- |
| SyterKit | `f95d29d6` | Pinned exactly by the external tree, identical in both images |
| OpenSBI | 1.9, branch `sun252i-f101` | The defconfig specifies the branch, not a commit |
| Linux | 7.2.0, branch `sun252i_f101_7.2` | The defconfig specifies the branch, not a commit |
| BusyBox | 1.38.0 | Read from the BusyBox banner in the image |
| musl | 1.2.6 | |
| Buildroot | `2026.08` + some commits | The two images were built with different versions |
| Toolchain | GCC 15.3.0, binutils 2.45.1 | Buildroot's bundled musl toolchain |

## Verification status

The checksums, region sizes, and version strings in `manifest.json` all come from the two image files themselves. <strong>This package records no real-hardware boot test</strong>, and no board-level result is claimed here.

## License

The firmware and its third-party software follow their respective licenses, and the repository's CC0 declaration <strong>does not apply</strong> to them. The license texts and origins of each component in these images are in `licenses/README.md`.
