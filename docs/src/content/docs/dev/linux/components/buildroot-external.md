---
title: "Buildroot external tree"
---

`buildroot-external-yuzukihd` is the Buildroot external tree that carries all YuzukiHD board support: the board defconfigs, the root filesystem overlay, the kernel and BusyBox fragments, the post-image assembly script, and the Buildroot packages for SyterKit and the Xuantie toolchain. Upstream Buildroot stays unmodified.

This page describes the mechanism, the tree layout, the six YuzukiNeko defconfigs, the NOR image assembler, the overlay that makes the read-only SquashFS root writable, and how the tree builds SyterKit and OpenSBI. Building and flashing a complete image end to end is covered on [Linux + Buildroot](../linux-buildroot.md).

:::note[Version scope]
The external tree is at commit `1e250e5` (2026-09-22). The Buildroot checkout in this repository reports `2026.08-1413-g302f5b6a2f` and `BR2_VERSION` `2026.11-git`; the prebuilt images referenced in the documentation were produced with `2026.08-323-g45f1c387e0`. Buildroot's package infrastructure is stable across these revisions, but the exact set of options and the generated image sizes differ.
:::

## What BR2_EXTERNAL is

Buildroot is a single build system. `BR2_EXTERNAL` is the official way to add boards, packages and configuration to it without forking the Buildroot tree. A directory used as an external tree must contain `external.desc`, and normally carries the other two files below:

| File | Purpose |
| --- | --- |
| `external.desc` | `name:` and `desc:`; the name becomes the `BR2_EXTERNAL_<NAME>_PATH` variable |
| `external.mk` | Makefile fragments to include, usually every `boot/*/*.mk` and `package/*/*.mk` |
| `Config.in` | Kconfig entries sourced into Buildroot's menu |

The name in this tree is `YUZUKIHD`, so every defconfig refers to paths through `$(BR2_EXTERNAL_YUZUKIHD_PATH)`:

```text
name: YUZUKIHD
desc: Custom packages and board configurations for YuzukiHD boards
```

`external.mk` is just two wildcard expressions:

```make
include $(sort \
	$(wildcard $(BR2_EXTERNAL_YUZUKIHD_PATH)/boot/*/*.mk) \
	$(wildcard $(BR2_EXTERNAL_YUZUKIHD_PATH)/package/*/*.mk))
```

Because the globs are recursive only one level under `boot/` and `package/`, a new component must be placed at `boot/<name>/<name>.mk` or `package/<name>/<name>.mk`; a deeper directory would not be picked up. The root `Config.in` currently sources only `boot/syterkit/Config.in`; the toolchain package is a host package pulled in as a dependency and has no menu entry.

## Tree layout

```text
buildroot-external-yuzukihd/
├── external.desc              tree name and description
├── external.mk                include boot/*/*.mk and package/*/*.mk
├── Config.in                  Kconfig entries sourced by Buildroot
├── configs/                   six YuzukiNeko defconfigs
├── board/yuzukihd/yuzukineko/
│   ├── readme.txt             board notes, defconfig matrix, layout
│   ├── overlay/               merged into the root filesystem
│   │   ├── sbin/init          overlayfs pivot for the NOR image
│   │   └── etc/init.d/S40network
│   ├── scripts/
│   │   ├── post-image-nor.sh  assembles the 16 MiB NOR image
│   │   ├── linux-nor.fragment kernel config fragment
│   │   └── busybox.fragment   BusyBox config fragment
│   └── bin/                   empty; prebuilt bootloaders were removed
├── boot/syterkit/             Buildroot package for the bootloader
└── package/xuantie-riscv-toolchain/  prebuilt ELF toolchain package
```

`board/yuzukihd/yuzukineko/bin/` is empty in the current tree. Earlier revisions kept prebuilt `spinor-boot_spi.bin` there; commit `1e250e5` removed them and made Buildroot build SyterKit from source instead.

## The six defconfigs

All six target the same SoC and differ in architecture, toolchain and output.

| Defconfig | Toolchain | Architecture | Root filesystem | Bootloader |
| --- | --- | --- | --- | --- |
| `yuzukihd_yuzukineko_nor_defconfig` | Buildroot internal musl | RV32 | SquashFS (xz) | `spinor-boot_spi.bin` |
| `yuzukihd_yuzukineko_xuantie_nor_defconfig` | Xuantie musl32 external | RV32 | SquashFS (xz) | `spinor-boot_spi.bin` |
| `yuzukihd_yuzukineko_rv64i_nor_defconfig` | Buildroot internal musl | RV64I | SquashFS (xz) | `spinor-boot-rv64i_spi.bin` |
| `yuzukihd_yuzukineko_ramdisk_defconfig` | Buildroot internal musl | RV32 | CPIO initramfs | none |
| `yuzukihd_yuzukineko_xuantie_ramdisk_defconfig` | Xuantie musl32 external | RV32 | CPIO initramfs | none |
| `yuzukihd_yuzukineko_rv64i_ramdisk_defconfig` | Buildroot internal musl | RV64I | CPIO initramfs | none |

The three NOR defconfigs share the same kernel repository and branch (`YuzukiHD/linux-mainline`, `sun252i_f101_7.2`), the same `linux-nor.fragment`, the same `busybox.fragment`, the same overlay and the same post-image script. The Xuantie variant changes the toolchain block (external musl32, its headers, C++ and OpenMP) and drops the SyterKit Xuantie-toolchain selection so that SyterKit reuses the rootfs compiler. Between the RV32 and RV64I variants the kernel defconfig, the in-tree DTS name, the `--arch` argument to the post-image script and the SyterKit image all change:

| Defconfig | Kernel defconfig | DTS | Post-image arch | SyterKit image |
| --- | --- | --- | --- | --- |
| `..._nor_defconfig` | `sun252i_f101_yuzukineko` | `sun252i-f101-yuzukineko` | `rv32` | `spinor-boot_spi.bin` |
| `..._xuantie_nor_defconfig` | `sun252i_f101_yuzukineko` | `sun252i-f101-yuzukineko` | `rv32` | `spinor-boot_spi.bin` |
| `..._rv64i_nor_defconfig` | `sun252i_f101_rv64_yuzukineko` | `sun252i-f101-yuzukineko-rv64i` | `rv64i` | `spinor-boot-rv64i_spi.bin` |

The two internal-musl NOR defconfigs set `BR2_TARGET_SYTERKIT_USE_XUANTIE_TOOLCHAIN=y`, because SyterKit's C907-specific compiler options need the Xuantie ELF/Newlib toolchain. The Xuantie musl32 NOR defconfig leaves it off and reuses its rootfs toolchain, which is also a Xuantie toolchain. The RV64I NOR defconfig uses the Xuantie ELF toolchain to build the RV32 SPL, then builds the Linux user space with Buildroot's internal musl.

The RV64I NOR defconfig also changes the OpenSBI variables: it adds `PLATFORM_RISCV_XLEN=64`, `PLATFORM_RISCV_ABI=lp64` and an ISA string without the vector extension, while the RV32 defconfigs pass only `PLATFORM_DEFCONFIG`, `FW_JUMP_ADDR` and `FW_JUMP_FDT_ADDR`.

## Key defconfig options

The NOR defconfigs are small but every line matters. The table lists the options that decide what is built and where the pieces come from; the values shown are the RV32 internal-musl case unless noted.

| Option | Value | Effect |
| --- | --- | --- |
| `BR2_riscv` | `y` | RISC-V target |
| `BR2_RISCV_32` | `y` | RV32; the RV64I defconfig sets `BR2_riscv_custom=y` and `BR2_RISCV_ISA_RVA=y` instead |
| `BR2_RISCV_ISA_RVC` | `y` | Compressed instructions, as the C907 supports |
| `BR2_TOOLCHAIN_BUILDROOT_MUSL` | `y` | Internal musl toolchain; the Xuantie defconfigs use `BR2_TOOLCHAIN_EXTERNAL` instead |
| `BR2_TARGET_GENERIC_GETTY_PORT` | `"ttyS1"` | Login prompt on UART1 |
| `BR2_TARGET_GENERIC_GETTY_BAUDRATE_115200` | `y` | Console baud rate |
| `BR2_ROOTFS_OVERLAY` | `.../overlay` | Merges `/sbin/init` and `S40network` into the rootfs |
| `BR2_ROOTFS_POST_IMAGE_SCRIPT` | `.../post-image-nor.sh` | Runs the assembler after the rootfs is built |
| `BR2_ROOTFS_POST_IMAGE_SCRIPT_ARGS` | `"--arch rv32"` | Selects the bootloader and DTB pair |
| `BR2_LINUX_KERNEL_CUSTOM_GIT` | `y` | Kernel from a git branch, not a tarball |
| `BR2_LINUX_KERNEL_CUSTOM_REPO_VERSION` | `"sun252i_f101_7.2"` | Kernel branch |
| `BR2_LINUX_KERNEL_DEFCONFIG` | `sun252i_f101_yuzukineko` | Board kernel defconfig |
| `BR2_LINUX_KERNEL_CONFIG_FRAGMENT_FILES` | `.../linux-nor.fragment` | Adds MTD, SquashFS, JFFS2, overlayfs |
| `BR2_PACKAGE_BUSYBOX_CONFIG_FRAGMENT_FILES` | `.../busybox.fragment` | Adds `pivot_root` |
| `BR2_PACKAGE_MTD` | `y` | Provides `flash_erase` and the MTD tools |
| `BR2_PACKAGE_MTD_MKFSJFFS2` | `y` | Builds the JFFS2 creation tool |
| `BR2_TARGET_ROOTFS_SQUASHFS` | `y` | SquashFS root filesystem |
| `BR2_TARGET_ROOTFS_SQUASHFS4_XZ` | `y` | xz compression |
| `BR2_TARGET_OPENSBI_CUSTOM_GIT` | `y` | OpenSBI from `YuzukiHD/opensbi` |
| `BR2_TARGET_OPENSBI_PLAT` | `"generic"` | Generic platform |
| `BR2_TARGET_OPENSBI_ADDITIONAL_VARIABLES` | `PLATFORM_DEFCONFIG=... FW_JUMP_ADDR=... FW_JUMP_FDT_ADDR=...` | Selects the platform defconfig and the jump target |
| `BR2_TARGET_SYTERKIT_DEFCONFIG` | `yuzukineko_rv32_sram_defconfig` | SyterKit make target |
| `BR2_TARGET_SYTERKIT_IMAGE` | `build/.../spinor-boot/spinor-boot_spi.bin` | Binary to install in `images/` |

The RV64I NOR defconfig changes the architecture options, the kernel defconfig and DTS, and the OpenSBI variables, which is why the same post-image script can assemble two different images.

## Building

The build directory is outside the source tree, and `BR2_EXTERNAL` must be an absolute path or a path relative to the directory where `make` runs:

```sh
mkdir -p ~/f101-linux/build && cd ~/f101-linux
git clone https://github.com/buildroot/buildroot.git
git clone https://github.com/YuzukiHD/buildroot-external-yuzukihd.git
cd buildroot
make O=../build/br-rv32 BR2_EXTERNAL=../buildroot-external-yuzukihd yuzukihd_yuzukineko_nor_defconfig
make O=../build/br-rv32 BR2_EXTERNAL=../buildroot-external-yuzukihd -j8
```

The RV64I image is built the same way with `yuzukihd_yuzukineko_rv64i_nor_defconfig` and a separate output directory. The ramdisk configurations produce `output/images/rootfs.cpio` and do not run the NOR assembler.

```text
build/br-rv32/images/yuzukineko-nor.img
build/br-rv32/images/rootfs.squashfs
build/br-rv32/images/Image
build/br-rv32/images/sun252i-f101-yuzukineko.dtb
build/br-rv32/images/fw_jump.bin
build/br-rv32/images/spinor-boot_spi.bin
```

The first build downloads the kernel, OpenSBI, SyterKit and BusyBox, and compiles the musl toolchain, so it takes a while. Subsequent builds reuse the output directory. The image sizes and the full build report are on [Linux + Buildroot](../linux-buildroot.md).

## Board directory

### readme.txt

`board/yuzukihd/yuzukineko/readme.txt` is the in-tree reference for the board. It documents the ramdisk and NOR defconfigs, the defconfig/arch/bootloader/DTB matrix, the fact that the internal-musl defconfigs use the Xuantie ELF toolchain while the Xuantie musl32 defconfig reuses its rootfs toolchain, the exact NOR layout, and the console setting (UART1 / `ttyS1`, 115200). It predates the RV64I ramdisk variant and lists only two ramdisk defconfigs; the tree has three. It also records the contract for `BR2_TARGET_SYTERKIT_DEFCONFIG` and `BR2_TARGET_SYTERKIT_IMAGE`: the parent directory of the image path names the SyterKit make target, and the basename is installed under `images/`.

### post-image-nor.sh

The script is called by Buildroot as a post-image script. It takes exactly three arguments, `<images-dir> --arch <rv32|rv64i>`, and derives the bootloader and DTB names from the architecture. It checks that all five inputs exist, creates a 16 MiB image prefilled with `0xFF`, and writes each component at its fixed offset.

```sh
OVERLAY_OFF=$((0xf00000))
OVERLAY_SIZE=$((0x1000000 - OVERLAY_OFF))   # 1 MiB
ROOTFS_END=$((OVERLAY_OFF))

dd if=/dev/zero bs=1M count=16 status=none | tr '\000' '\377' >"$IMG"

write_at() {
	off="$1"
	file="$2"
	dd if="$file" of="$IMG" bs=1K seek=$((off / 1024)) conv=notrunc status=none
}
```

`write_at` uses `bs=1K` and `seek=offset/1024`, so every region offset must be a multiple of 1 KiB. All offsets in this layout are.

| Region | Offset | Reserved | Content |
| --- | --- | --- | --- |
| bootloader | `0x000000` | 64 KiB | `spinor-boot_spi.bin` or `spinor-boot-rv64i_spi.bin` |
| dtb | `0x010000` | 256 KiB | architecture-specific DTB |
| fw_jump | `0x050000` | 512 KiB | OpenSBI `fw_jump.bin` |
| Image | `0x0d0000` | 6 MiB | Linux `Image` |
| rootfs | `0x6d0000` | to `0xf00000` | `rootfs.squashfs` at its real size |
| overlay | `0xf00000` | 1 MiB | left erased (`0xFF`) for the JFFS2 upper |

The script checks only the rootfs against its region:

```sh
if [ $((0x6d0000 + rootfs_size)) -gt "$ROOTFS_END" ]; then
	echo "post-image-nor.sh: rootfs ($rootfs_size B) overflows into overlay @ 0x$(printf '%x' "$OVERLAY_OFF")" >&2
	exit 1
fi
```

The other regions are laid down without a bound check: an oversized component is silently truncated when the next region is written over its tail. The report that follows the writes prints each region's rounded-up KiB size and its limit, so a human can see the problem, but the image is still produced. The reserved sizes themselves are not enforced.

The script does not erase the physical flash. It builds a file whose gaps and overlay region are `0xFF`; writing that file over the whole NOR reproduces the same state. If only part of the flash is written, the overlay partition should still contain erased flash (`0xFF`); the first `/sbin/init` will erase and format it if the JFFS2 mount fails.

The last step prints a table with `REGION`, `OFFSET`, `SIZE`, `LIMIT` and `CONTENT`, followed by `done` and the on-disk size. That output is the one quoted on [Linux + Buildroot](../linux-buildroot.md).

### The rootfs overlay

`overlay/` is merged into the root filesystem by `BR2_ROOTFS_OVERLAY`. It contains three things: the custom `/sbin/init`, the `/etc/init.d/S40network` stub, and two empty mount directories (`/mnt/overlay`, `/mnt/root`) kept by `.gitkeep`.

`/sbin/init` is PID 1. The kernel mounts the read-only SquashFS root and executes it. It then:

1. Mounts `proc`, `sysfs` and `devtmpfs`.
2. Finds the MTD partition whose name is `overlay` by parsing `/proc/mtd`.
3. Mounts JFFS2 on `mtd:overlay`. If the mount fails, it erases the partition with `flash_erase` and mounts again.
4. Creates `upper` and `work` under `/mnt/overlay`.
5. Mounts an overlayfs with the SquashFS root as `lowerdir` and the JFFS2 partition as `upperdir`/`workdir`.
6. `pivot_root()`s onto the overlay and re-mounts the pseudo-filesystems.
7. Executes `/bin/busybox init`.

The essential lines:

```sh
mtd="$(sed -n 's/^mtd\([0-9]\+\):.*"overlay".*/\1/p' /proc/mtd | head -n1)"
if [ -z "$mtd" ]; then
	msg "no 'overlay' MTD partition; staying on read-only root"
	exec /bin/busybox init
fi

mkdir -p /mnt/overlay
if ! mount -t jffs2 mtd:overlay /mnt/overlay 2>/dev/null; then
	msg "initializing JFFS2 on /dev/mtd$mtd"
	flash_erase /dev/mtd$mtd 0 0 >/dev/null || true
	mount -t jffs2 mtd:overlay /mnt/overlay
fi
mkdir -p /mnt/overlay/upper /mnt/overlay/work

mkdir -p /mnt/root
mount -t overlay overlay \
	-o "lowerdir=/,upperdir=/mnt/overlay/upper,workdir=/mnt/overlay/work" \
	/mnt/root
```

Every failure path is trapped and falls back to the read-only root with `exec /bin/busybox init`, so a broken overlay leaves a debuggable board rather than a panic. The partition lookup is by name, not by number: `mtd:overlay` resolves through the MTD alias, and the `sed` expression only exists to print the device number for the erase step.

`/etc/init.d/S40network` is deliberately a no-op:

```sh
#!/bin/sh
# No network on YuzukiNeko (kernel has no CONFIG_NET); keep boot quiet.
exit 0
```

Without it, BusyBox's network init script would try to configure interfaces that the kernel does not have and print `ENOSYS` noise on every boot.

### Kernel and BusyBox fragments

`linux-nor.fragment` is merged into the board kernel defconfig. It enables exactly what the NOR boot needs:

```text
CONFIG_MTD=y
CONFIG_MTD_BLOCK=y
CONFIG_MTD_OF_PARTS=y
CONFIG_MTD_SPI_NOR=y
CONFIG_SQUASHFS=y
CONFIG_JFFS2_FS=y
CONFIG_OVERLAY_FS=y
```

`CONFIG_MTD_OF_PARTS` reads the fixed-partitions table from the devicetree, which is how `/dev/mtdblock4` becomes the rootfs and `/dev/mtd5` becomes the overlay. `CONFIG_MTD_SPI_NOR` is needed for the flash itself, `CONFIG_SQUASHFS` for the read-only root, `CONFIG_JFFS2_FS` for the upper and `CONFIG_OVERLAY_FS` for the union.

`busybox.fragment` adds one option:

```text
CONFIG_PIVOT_ROOT=y
```

The `pivot_root` applet is required by `/sbin/init`. Without it the overlay mounts but the root cannot be switched.

## Partitions and persistence

The kernel devicetree defines the same layout as fixed MTD partitions, so the overlay can find its upper by name:

| MTD | Label | Offset | Size | Mounted as |
| ---: | --- | --- | --- | --- |
| 0 | `bootloader` | `0x000000` | 64 KiB | not mounted |
| 1 | `dtb` | `0x010000` | 256 KiB | not mounted |
| 2 | `opensbi` | `0x050000` | 512 KiB | not mounted |
| 3 | `kernel` | `0x0d0000` | 6 MiB | not mounted |
| 4 | `rootfs` | `0x6d0000` | 8.2 MiB | `/dev/mtdblock4`, SquashFS, read-only |
| 5 | `overlay` | `0xf00000` | 1 MiB | `/mnt/overlay`, JFFS2, read-write |

Partitions 0 to 4 are marked `read-only` in the devicetree. Partition 5 is the only writable persistent storage on a NOR-booted board. A full-image write replaces it, which is why flashing a complete `yuzukineko-nor.img` discards the changes that were persisted on the device.

The overlay is not a copy of the root filesystem. The SquashFS stays the lower layer and is never modified; every file created or changed after boot lands in the JFFS2 `upper` directory, and the overlayfs `work` directory holds the copy-up state. Deleting a file recorded in the lower layer creates a whiteout in the upper, not a deletion in the SquashFS.

## Pinned component versions

The external tree pins some components by commit and others by branch. That distinction matters when a rebuild produces different binaries.

| Component | Pin | Reproducible |
| --- | --- | --- |
| Buildroot | checkout `2026.08-1413-g302f5b6a2f`; the external tree does not pin Buildroot | Only if the same checkout is used |
| External tree | commit `1e250e5` | Yes |
| SyterKit | commit `f95d29d611ce439a2510957b0f312b5b439f53b8` | Yes |
| OpenSBI | branch `sun252i-f101` | No; the branch tip moves |
| Linux | branch `sun252i_f101_7.2` | No; the branch tip moves |
| Xuantie ELF toolchain | `V3.2.0-20250627`, SHA-256 pinned | Yes |
| Xuantie musl32 toolchain | `V3.2.0-20250627`, URL in the defconfig | Only if the mirror keeps the archive |

SyterKit is the only firmware component pinned to a commit. The OpenSBI and Linux branches are fetched by name, so two builds at different times can produce different `fw_jump.bin` and `Image`. The hashes in the documentation describe one build, not a guarantee.

## The SyterKit boot integration

`boot/syterkit/` is a normal Buildroot package with a Kconfig menu. It has three user-visible choices and two paths:

| Option | Meaning |
| --- | --- |
| `BR2_TARGET_SYTERKIT` | Enable the package; depends on ARM or RISC-V |
| `BR2_TARGET_SYTERKIT_USE_TARGET_TOOLCHAIN` | Build with the rootfs cross-compiler; the compiler must support the CPU selected by the SyterKit defconfig |
| `BR2_TARGET_SYTERKIT_USE_XUANTIE_TOOLCHAIN` | Build with the downloaded Xuantie ELF/Newlib toolchain; x86_64 host and RISC-V target only |
| `BR2_TARGET_SYTERKIT_DEFCONFIG` | Make target, for example `yuzukineko_rv32_sram_defconfig` |
| `BR2_TARGET_SYTERKIT_IMAGE` | Binary path relative to SyterKit's `O=` directory; the parent directory names the make target |

The package pins SyterKit to a commit, not a branch:

```make
SYTERKIT_VERSION = f95d29d611ce439a2510957b0f312b5b439f53b8
SYTERKIT_SITE = $(call github,YuzukiHD,SyterKit,$(SYTERKIT_VERSION))
SYTERKIT_LICENSE = GPL-2.0+
SYTERKIT_LICENSE_FILES = LICENSE
SYTERKIT_DEPENDENCIES = \
	host-bison \
	host-flex \
	host-ncurses \
	host-pkgconf
```

If the Xuantie option is selected, the package adds `host-xuantie-riscv-toolchain` and sets `SYTERKIT_CROSS_COMPILE` to that toolchain's `bin/riscv64-unknown-elf-`; otherwise it uses `TARGET_CROSS`.

The configure step runs the SyterKit defconfig, then disables `CONFIG_RUST_FFI` in the generated `.config` and runs `olddefconfig`. The Rust applet and FFI layer are not needed for the bootloader, and disabling them keeps the Buildroot build free of a Rust toolchain.

The build step invokes the parent directory of `BR2_TARGET_SYTERKIT_IMAGE` as the make target. That is why the variable must point at a concrete binary, for example `build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin`: the parent directory `spinor-boot` is the target name. The install step copies the binary to `$(BINARIES_DIR)` under its original basename, where `post-image-nor.sh` expects it.

## The Xuantie toolchain package

`package/xuantie-riscv-toolchain/` downloads a prebuilt Xuantie-900 GCC 14 ELF/Newlib toolchain and installs it into the host directory. It is a `host-generic-package`, so it is not visible in the menu; `boot/syterkit` pulls it in as a dependency.

| Variable | Value |
| --- | --- |
| Version | `V3.2.0-20250627` |
| Source | `Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz` from the Allwinner OSS mirror |
| Install directory | `$(HOST_DIR)/opt/xuantie-riscv-toolchain` |
| License | Unknown; the archive has no license manifest |

The install step copies `bin`, `include`, `lib`, `lib64`, `libexec`, `riscv64-unknown-elf` and `share` from the extracted archive. The hash file pins the archive's SHA-256 to the value used by the SyterKit CI configuration, so a changed download fails the build instead of silently changing the compiler.

The same toolchain is available separately as `Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0` in the repository root and is what the manual SyterKit build uses. The Buildroot package and the manual toolchain must be the same release; mixing them produces different code generation for the C907 options.

## Adding a board

A new board follows the same shape as YuzukiNeko:

1. Create `configs/<vendor>_<board>_<variant>_defconfig` with the architecture, toolchain, kernel, root filesystem and post-image settings.
2. Create `board/<vendor>/<board>/` with a `readme.txt`, an `overlay/` tree, and a `scripts/` directory for the post-image script and config fragments.
3. Point `BR2_ROOTFS_OVERLAY`, `BR2_ROOTFS_POST_IMAGE_SCRIPT`, `BR2_ROOTFS_POST_IMAGE_SCRIPT_ARGS`, `BR2_LINUX_KERNEL_CONFIG_FRAGMENT_FILES` and `BR2_PACKAGE_BUSYBOX_CONFIG_FRAGMENT_FILES` at those files with `$(BR2_EXTERNAL_YUZUKIHD_PATH)`.
4. If the board needs a bootloader, either add a package under `boot/` or reuse `BR2_TARGET_SYTERKIT` with a board-specific defconfig and image path.
5. Add the new defconfig to the table in the top-level `README.md` and to the board `readme.txt`.

No change to `external.mk` is needed for a board, because board files are referenced by path. A new bootloader package under `boot/<name>/<name>.mk` is picked up by the existing glob.

## Adding a package

A target package goes under `package/<name>/` with a `<name>.mk` and, if it should appear in the menu, a `Config.in`:

```make
HELLO_VERSION = 1.0
HELLO_SITE = https://example.com/hello
HELLO_LICENSE = MIT
HELLO_LICENSE_FILES = LICENSE

$(eval $(generic-package))
```

Then source the `Config.in` from the tree's root `Config.in` and select the option in a defconfig. The `external.mk` glob includes `package/*/*.mk` automatically, so the `.mk` file itself needs no registration. A host-only package uses `$(eval $(host-generic-package))` and is pulled in through a dependency, as the Xuantie toolchain is; it does not need a `Config.in` entry.

## Troubleshooting

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| `post-image-nor.sh: missing input` | One of the five components was not built or was not copied to `images/` | Check the Buildroot log for `fw_jump`, `Image`, the DTB, the rootfs and the SyterKit image |
| `post-image-nor.sh: unsupported architecture` | `BR2_ROOTFS_POST_IMAGE_SCRIPT_ARGS` does not match the defconfig | It must be `--arch rv32` or `--arch rv64i`, and the matching DTB and bootloader must exist |
| `rootfs ... overflows into overlay` | The SquashFS is larger than the `0x6d0000..0xf00000` region | Reduce the rootfs or move the overlay; the script refuses to produce the image |
| A component exceeds its region and is silently truncated | The script only bounds-checks the rootfs | Compare the reported sizes with the limits before flashing |
| Build fails in SyterKit with an unknown `rv32...` option | The rootfs toolchain does not support the C907 ISA | Select `BR2_TARGET_SYTERKIT_USE_XUANTIE_TOOLCHAIN`, or use the Xuantie musl32 defconfig |
| `fw_jump.elf` is 64-bit in an RV32 image | OpenSBI guessed the XLEN from a 64-bit compiler triplet | Check the toolchain; add `PLATFORM_RISCV_XLEN=32` to `BR2_TARGET_OPENSBI_ADDITIONAL_VARIABLES` if a 64-bit compiler must be used |
| The Xuantie toolchain download fails | The mirror URL or hash changed | Check `xuantie-riscv-toolchain.mk` and `.hash`; the archive is large and the mirror may be slow |
| Board boots but the root is read-only | `pivot_root` failed or the overlay partition is missing | Look for `init: overlay setup failed`; check `/proc/mtd` for the `overlay` label |
| Overlay is not persistent after reboot | The overlay partition was not erased before the first JFFS2 mount, or the full image overwrote it | Erase `0xf00000..0x1000000`, or let `/sbin/init` erase it on the first boot |
| `S40network` prints `ENOSYS` | The kernel has no `CONFIG_NET` but BusyBox tried to configure a network | Keep the stub `S40network`, or enable networking in the kernel |
