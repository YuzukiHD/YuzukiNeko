# Licenses and Provenance

This directory retains the license texts and copyright notices of the
components that make up the two Linux (Buildroot) boot images in the parent
directory. Each component follows its own license. The hardware-oriented CC0
declaration at the repository root does **not** cover this firmware and
software.

| Directory | Component | License |
| --- | --- | --- |
| `syterkit/` | SyterKit SPI NOR loader (the bootloader at `0x000000`) | GPL-2.0-or-later |
| `opensbi/` | OpenSBI `fw_jump` SBI firmware (at `0x050000`) | BSD-2-Clause |
| `linux/` | Linux kernel 7.2.0 and the device tree (at `0x0d0000` / `0x010000`) | GPL-2.0 WITH Linux-syscall-note |
| `busybox/` | BusyBox 1.38.0 user space (in the SquashFS root) | GPL-2.0 |
| `musl/` | musl 1.2.6 C library (in the SquashFS root) | MIT |
| `buildroot/` | Buildroot build system used to produce the root filesystem | GPL-2.0-or-later |
| `toolchain/` | GCC 15.3.0 / binutils 2.45.1 cross toolchain | GPL-3.0-or-later, with the GCC Runtime Library Exception |

## Where each license file comes from

The original texts are preserved unmodified. Each file was taken from the
source revision actually used for the build, or from the release archive that
Buildroot downloads for that version:

| File | Source |
| --- | --- |
| `syterkit/LICENSE` | `YuzukiHD/SyterKit` at `f95d29d611ce439a2510957b0f312b5b439f53b8` |
| `opensbi/COPYING.BSD`, `opensbi/ThirdPartyNotices.md` | `YuzukiHD/opensbi`, branch `sun252i-f101` |
| `linux/COPYING`, `linux/GPL-2.0`, `linux/Linux-syscall-note` | `YuzukiHD/linux-mainline`, branch `sun252i_f101_7.2`, versions 7.2.0 |
| `busybox/LICENSE` | BusyBox 1.38.0 release archive, `busybox-1.38.0.tar.bz2` |
| `musl/COPYRIGHT` | musl 1.2.6 release, `COPYRIGHT` |
| `buildroot/COPYING` | Buildroot tree used for the build |
| `toolchain/GPL-3.0`, `toolchain/GCC-Runtime-Library-Exception` | GNU GPL v3 and the GCC 15.3.0 `COPYING.RUNTIME` |

Two of these can be checked against the hashes Buildroot itself records, which
is why they are worth stating explicitly:

- `syterkit/LICENSE` — SHA-256 `8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643`,
  matching the `LICENSE` entry in `boot/syterkit/syterkit.hash` of
  `buildroot-external-yuzukihd`.
- `busybox/LICENSE` — SHA-256 `bbfc9843646d483c334664f651c208b9839626891d8f17604db2146962f43548`,
  matching the `LICENSE` entry in Buildroot's `package/busybox/busybox.hash`.
- `musl/COPYRIGHT` — SHA-256 `b870108ec5e7790e9f9919064f1b9421d62d5f9b0e6c230c6adf7ea2da62e97b`,
  matching the `COPYRIGHT` entry in Buildroot's `package/musl/musl.hash`.

## Notes on the Linux kernel text

The kernel is licensed `GPL-2.0 WITH Linux-syscall-note`, not plain GPL-2.0.
`linux/COPYING` is the short kernel statement that names both parts;
`linux/GPL-2.0` is the license body it refers to, and
`linux/Linux-syscall-note` is the syscall exception. All three are needed to
state the kernel's terms.

## Notes on the toolchain

The cross toolchain (GCC 15.3.0, binutils 2.45.1) is GPL-3.0-or-later. The
statically linked `libgcc` support routines are covered by the GCC Runtime
Library Exception, which permits linking them into the binaries shipped in the
image without placing those binaries under the GPL.

## Notes on Buildroot

Buildroot is the build system, not a component of the running system. Its
`COPYING` is GPL-2.0-or-later; individual packages it builds carry their own
licenses, and the ones present in these images are listed above. The build
recipe itself lives in `YuzukiHD/buildroot-external-yuzukihd`.
