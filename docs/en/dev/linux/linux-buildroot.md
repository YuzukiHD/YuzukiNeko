# Linux + Buildroot

This page builds the SPI NOR boot image for the YuzukiNeko **F101-S3** with the Buildroot external tree: one `make` produces the complete 16 MiB image. The boot chain is:

```
BROM → SyterKit → OpenSBI → Linux → BusyBox
```

There is one defconfig per CPU mode: **RV32** and **RV64I**. The root filesystem is a SquashFS image with a writable JFFS2 overlay on top. For flashing a built image, wiring the serial port and replacing individual components, see [Prebuilt Images](linux-prebuilt.md); for the step-by-step manual build, see [Manual Build](linux-manual.md).

## Building from Source

Both images are produced by the [`YuzukiHD/buildroot-external-yuzukihd`](https://github.com/YuzukiHD/buildroot-external-yuzukihd) external tree. Buildroot itself is the official mainline [`buildroot/buildroot`](https://github.com/buildroot/buildroot) repository; the external tree supplies the board defconfigs, the SyterKit build recipe and the post-image script.

| Defconfig | Architecture | Bootloader |
| --- | --- | --- |
| `yuzukihd_yuzukineko_nor_defconfig` | RV32 (C907 / ilp32) | `spinor-boot_spi.bin` |
| `yuzukihd_yuzukineko_rv64i_nor_defconfig` | RV64I (lp64) | `spinor-boot-rv64i_spi.bin` |

Each defconfig selects SyterKit ([`YuzukiHD/SyterKit`](https://github.com/YuzukiHD/SyterKit)), OpenSBI `fw_jump` ([`YuzukiHD/opensbi`](https://github.com/YuzukiHD/opensbi), branch `sun252i-f101`), the Linux `Image` and device tree ([`YuzukiHD/linux-mainline`](https://github.com/YuzukiHD/linux-mainline), branch `sun252i_f101_7.2`), and a SquashFS (xz) root filesystem. The post-image script then assembles the 16 MiB `images/yuzukineko-nor.img`.

Build out of tree, with the output under `build/`. First clone the two repositories into a working directory:

```sh
mkdir -p ~/f101-linux/build && cd ~/f101-linux
git clone https://github.com/buildroot/buildroot.git
git clone https://github.com/YuzukiHD/buildroot-external-yuzukihd.git
```

RV32:

```sh
cd buildroot
make O=../build/br-rv32 BR2_EXTERNAL=../buildroot-external-yuzukihd yuzukihd_yuzukineko_nor_defconfig
make O=../build/br-rv32 BR2_EXTERNAL=../buildroot-external-yuzukihd -j8
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-buildroot/rv32.cast" data-speed="6"></div>

Output at the end of the build (the `LIMIT` column is the reserved size of each region):

```text
== build/br-rv32/images/yuzukineko-nor.img : 16 MiB SPI NOR image (RV32 (C907 / ilp32)) ==
  REGION      OFFSET          SIZE  LIMIT    CONTENT
  bootloader  0x000000      48 KiB  <64K     spinor-boot_spi.bin
  dtb         0x010000      11 KiB  <256K    sun252i-f101-yuzukineko.dtb
  fw_jump     0x050000     261 KiB  <512K    fw_jump.bin
  Image       0x0d0000    5121 KiB  <6M      Image
  rootfs      0x6d0000    1252 KiB  <8.2M    rootfs.squashfs
  overlay     0xf00000    1024 KiB  =1M      erased; JFFS2 overlayfs upper
== done: build/br-rv32/images/yuzukineko-nor.img (16384 KiB on disk) ==
```

RV64I:

```sh
make O=../build/br-rv64i BR2_EXTERNAL=../buildroot-external-yuzukihd yuzukihd_yuzukineko_rv64i_nor_defconfig
make O=../build/br-rv64i BR2_EXTERNAL=../buildroot-external-yuzukihd -j8
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-buildroot/rv64i.cast" data-speed="6"></div>

Output at the end of the build:

```text
== build/br-rv64i/images/yuzukineko-nor.img : 16 MiB SPI NOR image (RV64I (lp64)) ==
  REGION      OFFSET          SIZE  LIMIT    CONTENT
  bootloader  0x000000      48 KiB  <64K     spinor-boot-rv64i_spi.bin
  dtb         0x010000      11 KiB  <256K    sun252i-f101-yuzukineko-rv64i.dtb
  fw_jump     0x050000     263 KiB  <512K    fw_jump.bin
  Image       0x0d0000    5744 KiB  <6M      Image
  rootfs      0x6d0000    1224 KiB  <8.2M    rootfs.squashfs
  overlay     0xf00000    1024 KiB  =1M      erased; JFFS2 overlayfs upper
== done: build/br-rv64i/images/yuzukineko-nor.img (16384 KiB on disk) ==
```

The first build downloads the source of each component and compiles Buildroot's own musl toolchain, so it takes a while. When it finishes, the images are `build/br-rv32/images/yuzukineko-nor.img` and `build/br-rv64i/images/yuzukineko-nor.img`, both 16,777,216 bytes. The same directory holds the individual components, which you can use to [replace single components](linux-prebuilt.md#replacing-individual-components):

| File | RV32 size (bytes) | RV64I size (bytes) |
| --- | ---: | ---: |
| `spinor-boot_spi.bin` / `spinor-boot-rv64i_spi.bin` | 49,152 | 49,152 |
| `sun252i-f101-yuzukineko.dtb` / `…-rv64i.dtb` | 10,284 | 10,284 |
| `fw_jump.bin` | 266,352 | 268,744 |
| `Image` | 5,243,808 | 5,881,208 |
| `rootfs.squashfs` | 1,282,048 | 1,253,376 |

The table comes from one build with Buildroot `2026.08-323-g45f1c387e0` (external tree `1e250e5`). For flashing, see [Prebuilt Images](linux-prebuilt.md#flashing-the-full-image).

Both defconfigs build SyterKit with the x86_64 Xuantie-900 ELF/Newlib V3.2.0 toolchain, because SyterKit's C907-specific compiler flags need it; the root filesystem is built with Buildroot's internal musl toolchain. The `*_xuantie_nor_defconfig` variant instead reuses the Xuantie musl32 toolchain for the root filesystem as well.

The images in this repository were built from the Buildroot revisions recorded per image in `manifest.json`. Because the external tree and the kernel and OpenSBI branches are moving targets, a fresh build is unlikely to reproduce these exact files.
