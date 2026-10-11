---
title: "SPI NOR layout and backup"
---

The onboard NOR Flash is <strong>16 MiB</strong> in total (addresses `0x000000`–`0xFFFFFF`) and is a system resource: the bootloader, firmware, and applications all live in it. <strong>Before writing, take a look at what is in the range you intend to overwrite, and back it up first.</strong>

## Back up the whole flash

After entering FEL:

```sh
xfel spinor read 0x0 0x1000000 neko-backup.bin
# or
rfel spinor read 0x0 0x1000000 neko-backup.bin
```

Keep the backup file and its SHA-256 safely, and <strong>do not overwrite the previous backup</strong>.

Restore:

```sh
xfel spinor write 0x0 neko-backup.bin
```

Read it back to verify after writing, then reset.

## Verifying files

You should check the SHA-256 both before and after writing.

| Platform | Command |
| --- | --- |
| Windows PowerShell | `Get-FileHash -Algorithm SHA256 <file>` |
| Linux | `sha256sum <file>`; against the checksum list: `sha256sum -c SHA256SUMS` |
| macOS | `shasum -a 256 <file>`; against the checksum list: `shasum -a 256 -c SHA256SUMS` |

## Common layouts

How Flash is divided depends on which software set you have installed. The same board can have one of the following layouts; <strong>they are mutually incompatible</strong>, and switching between them requires rewriting the boot part.

### RustSBI + Asterinas image

| Component | NOR offset | Reserved in this layout | Load RAM address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| Devicetree | `0x010000` | 256 KiB | `0x40f40000` |
| RustSBI | `0x050000` | 512 KiB | `0x40f80000` |
| Asterinas | `0x0d0000` | 5 MiB (up to before initramfs) | `0x40000000` |
| initramfs | `0x5d0000` | 1 MiB | `0x40500000` |

The complete image is written to `0x000000..0x6d0000`; `0x6d0000..0x1000000` is left untouched. See [RustSBI + Asterinas](../dev/asterinas/rustsbi-asterinas.md) for details.

### Linux + Buildroot image

| Component | NOR offset | Reserved in this layout | Load RAM address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| Devicetree | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux Image | `0x0d0000` | 6 MiB | `0x40000000` |
| SquashFS root filesystem | `0x6d0000` | up to `0xf00000` (about 8.2 MiB) | Mounted from MTD |
| JFFS2 overlay | `0xf00000` | 1 MiB | Mounted from MTD |

The complete image covers <strong>the entire 16 MiB</strong>, including the overlay partition, so writing it discards the changes already persisted on the board. See [Prebuilt images](../dev/linux/linux-prebuilt.md) for details.

### UF2 layout

| Content | NOR offset |
| --- | --- |
| SyterKit loader (three copies) | `0x000000` / `0x010000` / `0x020000` |
| Saved Flash sampling-point parameters | `0x02f000` |
| System program header page (UF2 downloader) | `0x030000` |
| Application header page (Zephyr application) | `0x200000` (at most about `0x4CF000` bytes) |

See [UF2 drag-and-drop flashing](../dev/zephyr/zephyr-uf2.md) for details.

:::tip
The regions in the tables above overlap (for example, they all place SyterKit starting at `0x000000`), so <strong>do not mix layouts on the same Flash</strong>. When switching from one layout to another, write the complete boot part of the new layout and read it back with `xfel spinor read` to confirm.
:::

## Pre-write checklist

1. The whole Flash has been backed up, and the backup file's SHA-256 has been recorded.
2. The address range to be written does not overwrite data you want to keep.
3. After writing, read back and compare the SHA-256, and reset only once they match.
4. On failure (a command error or a checksum mismatch), resolve the problem before booting; do not force a reset.
