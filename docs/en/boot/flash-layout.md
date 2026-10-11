# SPI NOR Layout and Backup

The on-board NOR Flash is **16 MiB** (addresses `0x000000`-`0xFFFFFF`) and is a system resource: the boot loader, firmware and applications all live in it. **Before writing, check what is in the range you are about to overwrite, and back it up first.**

## Back up the whole Flash

After entering FEL:

```sh
xfel spinor read 0x0 0x1000000 neko-backup.bin
# or
rfel spinor read 0x0 0x1000000 neko-backup.bin
```

Keep the backup file and its SHA-256, and **do not overwrite the previous backup**.

Restore:

```sh
xfel spinor write 0x0 neko-backup.bin
```

Read back and verify after writing, then reset.

## Verifying Files

Check the SHA-256 both before and after writing.

| Platform | Command |
| --- | --- |
| Windows PowerShell | `Get-FileHash -Algorithm SHA256 <file>` |
| Linux | `sha256sum <file>`; against a checksum list: `sha256sum -c SHA256SUMS` |
| macOS | `shasum -a 256 <file>`; against a checksum list: `shasum -a 256 -c SHA256SUMS` |

## Common Layouts

How the Flash is divided depends on which software you install. The same board can use one of several layouts, **which are mutually incompatible**; when switching you need to rewrite the boot part.

### RustSBI + Asterinas image

| Component | NOR offset | Reserved in this layout | RAM load address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| Device tree | `0x010000` | 256 KiB | `0x40f40000` |
| RustSBI | `0x050000` | 512 KiB | `0x40f80000` |
| Asterinas | `0x0d0000` | 5 MiB (up to the initramfs) | `0x40000000` |
| initramfs | `0x5d0000` | 1 MiB | `0x40500000` |

The full image is written to `0x000000..0x6d0000`; `0x6d0000..0x1000000` is not touched. See [RustSBI + Asterinas](../dev/asterinas/rustsbi-asterinas.md) for details.

### Linux + Buildroot image

| Component | NOR offset | Reserved in this layout | RAM load address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| Device tree | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux Image | `0x0d0000` | 6 MiB | `0x40000000` |
| SquashFS rootfs | `0x6d0000` | up to `0xf00000` (about 8.2 MiB) | mounted from MTD |
| JFFS2 overlay | `0xf00000` | 1 MiB | mounted from MTD |

The full image covers the **whole 16 MiB**, including the overlay partition, so writing it discards changes already persisted on the board. See [Prebuilt Images](../dev/linux/linux-prebuilt.md) for details.

### UF2 layout

| Content | NOR offset |
| --- | --- |
| SyterKit loader (three copies) | `0x000000` / `0x010000` / `0x020000` |
| Saved Flash sample point parameters | `0x02f000` |
| System program header page (UF2 downloader) | `0x030000` |
| Application header page (Zephyr application) | `0x200000` (up to about `0x4CF000` bytes) |

See [UF2 Drag-and-Drop Flashing](../dev/zephyr/uf2/make-uf2.md) for details.

?> The regions in the tables above overlap (for example, they all place SyterKit starting at `0x000000`), so **do not mix them on the same Flash**. When switching from one layout to another, write the complete boot part of the new layout and read it back with `xfel spinor read` to confirm.

## Pre-write Checklist

1. The whole Flash has been backed up, and the SHA-256 of the backup file is recorded.
2. The address range to be written does not overlap data you want to keep.
3. After writing, read back and compare the SHA-256; reset only when they match.
4. On failure (a command error or a checksum mismatch), fix the problem before booting; do not force a reset.
