# Building a Linux Image by Hand

This page builds the SPI NOR boot image for the YuzukiNeko <strong>F101-S3</strong> (<strong>RV32</strong>) from source, step by step: SyterKit, OpenSBI, the Linux kernel and a BusyBox root filesystem. The parts are then assembled into a 16 MiB `.img` according to the Flash layout, and flashed with xfel either piece by piece or as a whole. For the 64-bit (RV64I) changes, see [Building the RV64I Image by Hand](linux-manual-rv64.md). If you want an image from a single command, see [Linux + Buildroot](linux-buildroot.md).

The boot chain is the same as in the Buildroot version:

```
BROM → SyterKit → OpenSBI → Linux → BusyBox
```

## Preparation

The host needs `gcc`, `make`, `bison`, `flex`, `bc`, `git` and `squashfs-tools`, plus the other host build dependencies commonly required by the kernel and SyterKit.

All commands below run from one working directory, `~/f101-linux`. Where a command has to be run inside a source directory, a `cd` is shown, and you return to the working directory afterwards:

```sh
mkdir -p ~/f101-linux/build && cd ~/f101-linux
```

### Toolchains

Two Xuantie toolchains are needed:

| Toolchain | Used for | Prefix |
| --- | --- | --- |
| `Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0` | SyterKit | `riscv64-unknown-elf-` |
| `Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0` | OpenSBI, kernel, BusyBox | `riscv64-unknown-linux-gnu-` |

Both toolchains are downloaded from T-Head OCC, in the same release `V3.2.0-20250627`: elf-newlib is about 235 MB and glibc about 510 MB.

```sh
curl -fLO 'https://occ-oss-prod.oss-cn-hangzhou.aliyuncs.com/resource//1751370399722/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz'
curl -fLO 'https://occ-oss-prod.oss-cn-hangzhou.aliyuncs.com/resource//1755679709552/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0-20250627.tar.gz'
sha256sum Xuantie-900-gcc-*.tar.gz
```

The SHA-256 values of the two archives should be:

```text
80c174c6445f7565bc082d328045021862a63beddfad8c393c534e2d9523dc3b  Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
a5a6a5e517a738baffed091efce984ffa215f78bb11e296d6175bf5896778fdd  Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0-20250627.tar.gz
```

Once the checksums match, extract both into `toolchain/` under the working directory (no root needed); the commands that follow refer to this path directly (`$HOME` is your home directory):

```sh
mkdir -p toolchain
tar -xzf Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz -C toolchain
tar -xzf Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0-20250627.tar.gz -C toolchain
```

### Source Code

```sh
git clone https://github.com/YuzukiHD/SyterKit.git
git clone -b sun252i-f101 https://github.com/YuzukiHD/opensbi.git
git clone -b sun252i_f101_7.2 https://github.com/YuzukiHD/linux-mainline.git
git clone https://github.com/YuzukiHD/buildroot-external-yuzukihd.git
curl -fLO https://busybox.net/downloads/busybox-1.38.0.tar.bz2
tar -xjf busybox-1.38.0.tar.bz2
```

BusyBox is downloaded from [busybox.net](https://busybox.net/downloads/) and extracts to `busybox-1.38.0/`. `buildroot-external-yuzukihd` is used only to fetch the kernel config fragment and a few files for the root filesystem; Buildroot itself is not built.

Versions used when this page was built: SyterKit `main` (`6ef3f27ab`), OpenSBI `08cbbe0b`, Linux `95cd7466c`, BusyBox 1.38.0.

## Building SyterKit

SyterKit is the first-stage bootloader after the BROM, and it also reads the device tree, OpenSBI and the kernel out of the SPI NOR. It uses the elf-newlib toolchain, and its output goes into `build/` in the working directory:

```sh
cd SyterKit
make O=../build/syterkit CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf- yuzukineko_rv32_sram_defconfig
make -j8 O=../build/syterkit CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf- spinor-boot
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual/syterkit.cast" data-speed="0.35"></div>

The output is `build/syterkit/build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin`, 49,152 bytes. The reserved region is 64 KiB (65,536 bytes), so it fits.

## Building OpenSBI

The OpenSBI repository ships a `build.sh` that already sets the F101 parameters (`sun252i-f101.defconfig`, `FW_JUMP`, `FW_TEXT_START=0x40f80000`, `FW_JUMP_ADDR=0x40000000`). `--arch rv32` selects 32-bit, and the output goes under `build/` in the repository:

```sh
cd opensbi
mkdir -p build
./build.sh --arch rv32 $HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual/opensbi.cast" data-speed="0.45"></div>

`mkdir -p build` cannot be skipped: the default output directory of `build.sh` requires its parent directory to exist already.

The output is `opensbi/build/sun252i-f101/platform/generic/firmware/fw_jump.bin`, 266,344 bytes, in a 512 KiB (524,288 bytes) reserved region. Running `file` on `fw_jump.elf` in the same directory should report 32-bit.

!> Do not run `make PLATFORM=generic ...` directly and leave out the parameters that `build.sh` passes, such as `PLATFORM_RISCV_XLEN`. Otherwise the toolchain defaults to building a 64-bit `fw_jump.elf`, even though the name says RV32.

## Building the Kernel

The kernel uses the RV32 defconfig, then merges `linux-nor.fragment` from the external tree. This fragment enables MTD, OverlayFS and JFFS2, which are needed for a SquashFS root filesystem with a JFFS2 overlay on top.

```sh
cd linux-mainline
make O=../build/kernel-rv32 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- sun252i_f101_yuzukineko_defconfig
scripts/kconfig/merge_config.sh -m -O ../build/kernel-rv32 ../build/kernel-rv32/.config ../buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/scripts/linux-nor.fragment
make O=../build/kernel-rv32 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- olddefconfig
make -j8 O=../build/kernel-rv32 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- Image allwinner/sun252i-f101-yuzukineko.dtb
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual/kernel.cast" data-speed="3"></div>

The output is in `build/kernel-rv32/arch/riscv/boot/`:

| File | Size (bytes) | Reserved region |
| --- | ---: | --- |
| `Image` | 5,178,200 | 6 MiB |
| `dts/allwinner/sun252i-f101-yuzukineko.dtb` | 10,472 | 256 KiB |

The RV32 kernel is determined by the 32-bit options in the kernel config, so no toolchain change is needed; the `riscv64-unknown-linux-gnu-` prefix is still used.

## Building the Root Filesystem

Buildroot is not used here. BusyBox is compiled directly, the necessary directories and files are added, and the result is packed into a SquashFS. BusyBox is statically linked, so the root filesystem needs no C library.

### BusyBox

Four changes are made on top of the default config: static linking, enabling `flash_eraseall`, and the architecture-specific compile and link options. `pivot_root` is already enabled by default, and `/sbin/init` needs it to switch to the overlay root.

```sh
cd busybox-1.38.0
mkdir -p ../build/busybox-rv32
make O=../build/busybox-rv32 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- defconfig
sed -i 's/^# CONFIG_STATIC is not set/CONFIG_STATIC=y/' ../build/busybox-rv32/.config
sed -i 's/^# CONFIG_FLASH_ERASEALL is not set/CONFIG_FLASH_ERASEALL=y/' ../build/busybox-rv32/.config
sed -i 's/^CONFIG_EXTRA_CFLAGS=""/CONFIG_EXTRA_CFLAGS="-march=rv32imafdc -mabi=ilp32d"/' ../build/busybox-rv32/.config
sed -i 's/^CONFIG_EXTRA_LDFLAGS=""/CONFIG_EXTRA_LDFLAGS="-march=rv32imafdc -mabi=ilp32d"/' ../build/busybox-rv32/.config
make O=../build/busybox-rv32 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- oldconfig < /dev/null
make -j8 O=../build/busybox-rv32 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-
mkdir -p ../build/rootfs-rv32
make O=../build/busybox-rv32 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- CONFIG_PREFIX=../rootfs-rv32 install
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual/busybox.cast"></div>

`file build/busybox-rv32/busybox` should report 32-bit, statically linked. In the final `install` command, `CONFIG_PREFIX` is relative to the output directory, which is why it is written as `../rootfs-rv32`; the files are installed to `build/rootfs-rv32/`.

### Directories and Configuration Files

Next, add what is missing from `build/rootfs-rv32/`. `/sbin/init` and `S40network` come from the overlay directory of the external tree. After `install`, `/sbin/init` is a symlink to BusyBox, so it must be deleted before copying; otherwise the copy would overwrite BusyBox itself.

```sh
mkdir -p build/rootfs-rv32/{proc,sys,dev,tmp,run,root,etc/init.d,mnt/root,mnt/overlay,var/log}
rm build/rootfs-rv32/sbin/init
cp buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/overlay/sbin/init build/rootfs-rv32/sbin/init
cp buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/overlay/etc/init.d/S40network build/rootfs-rv32/etc/init.d/
```

BusyBox provides `flash_eraseall`, so add a simple stand-in for `flash_erase`:

```sh
printf '#!/bin/sh\nexec /usr/sbin/flash_eraseall "$1"\n' > build/rootfs-rv32/usr/sbin/flash_erase
```

Create `build/rootfs-rv32/etc/inittab`:

```sh
cat > build/rootfs-rv32/etc/inittab <<'EOF'
::sysinit:/bin/mount -t tmpfs tmpfs /tmp
::sysinit:/bin/mount -t tmpfs tmpfs /run
::sysinit:/etc/init.d/rcS
ttyS1::respawn:/sbin/getty -L ttyS1 115200 vt100
::ctrlaltdel:/sbin/reboot
::shutdown:/bin/umount -a -r
EOF
```

Create `build/rootfs-rv32/etc/init.d/rcS`:

```sh
cat > build/rootfs-rv32/etc/init.d/rcS <<'EOF'
#!/bin/sh
for s in /etc/init.d/S[0-9][0-9]*; do [ -x "$s" ] && "$s" start; done
EOF
```

The remaining small files, plus the executable permissions:

```sh
echo 'root::0:0:root:/root:/bin/sh' > build/rootfs-rv32/etc/passwd
echo 'root:x:0:' > build/rootfs-rv32/etc/group
echo yuzukineko > build/rootfs-rv32/etc/hostname
echo /dev/ttyS1 > build/rootfs-rv32/etc/securetty
chmod 755 build/rootfs-rv32/usr/sbin/flash_erase build/rootfs-rv32/etc/init.d/rcS build/rootfs-rv32/etc/init.d/S40network
```

The `root` password is empty, as in the Buildroot version. The console is UART1 (`ttyS1`), and `getty` uses 115200 baud.

### Packing the SquashFS

Compress with xz. The device nodes `/dev/console` and `/dev/null` are written straight into the image with `-p`, so no root privileges are needed:

```sh
mksquashfs build/rootfs-rv32 build/rootfs-rv32.squashfs -comp xz -all-root -noappend -no-progress -p "dev/console c 600 0 0 5 1" -p "dev/null c 666 0 0 1 3"
ls -l build/rootfs-rv32.squashfs
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual/squashfs.cast"></div>

The output is 1,089,536 bytes, and the reserved region runs from `0x6d0000` to `0xf00000` (8,585,216 bytes).

## Flash Layout

The location of each component on the SPI NOR is fixed, and is the same as in the Buildroot image:

| Component | NOR offset | Reserved size | RAM load address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` (loaded by the BROM into SRAM) |
| Device tree | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux Image | `0x0d0000` | 6 MiB | `0x40000000` |
| SquashFS rootfs | `0x6d0000` | up to `0xf00000` (about 8.2 MiB) | mounted from MTD |
| JFFS2 overlay | `0xf00000` | 1 MiB, left erased | mounted from MTD |

!> SyterKit reads fixed lengths on every boot: 256 KiB of device tree, 512 KiB of `fw_jump` and 6 MiB of kernel. Each component must fit in its reserved region and cannot be moved to a different offset.

## Flashing Components Individually

First install xfel as described in [FEL Download Mode and Tools](../../boot/fel.md), put the board into FEL, and [back up](../../boot/flash-layout.md#back-up-the-whole-flash) the whole Flash. Flashing components individually changes only the corresponding regions and leaves the overlay partition alone:

```sh
xfel version
xfel spinor
xfel spinor write 0x0 build/syterkit/build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin
xfel spinor write 0x10000 build/kernel-rv32/arch/riscv/boot/dts/allwinner/sun252i-f101-yuzukineko.dtb
xfel spinor write 0x50000 opensbi/build/sun252i-f101/platform/generic/firmware/fw_jump.bin
xfel spinor write 0xd0000 build/kernel-rv32/arch/riscv/boot/Image
xfel spinor write 0x6d0000 build/rootfs-rv32.squashfs
```

After writing, read back according to the file size and compare. For example for the kernel (`5178200` is the byte size of `Image`; if you use a different kernel, change it to the actual size shown by `ls -l`):

```sh
xfel spinor read 0xd0000 5178200 Image-readback.bin
cmp Image-readback.bin build/kernel-rv32/arch/riscv/boot/Image
```

Finally, reset:

```sh
xfel reset
```

## Packing a Full Image

Flashing components individually suits debugging. To get a single 16 MiB file that can be written in one go, first confirm that no component exceeds its reserved region above (check sizes with `ls -l`), then write each one at its offset onto a base of all `0xFF`:

```sh
head -c 16777216 /dev/zero | tr '\000' '\377' > build/yuzukineko-manual-rv32.img
dd if=build/syterkit/build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin of=build/yuzukineko-manual-rv32.img bs=1 seek=0 conv=notrunc status=none
dd if=build/kernel-rv32/arch/riscv/boot/dts/allwinner/sun252i-f101-yuzukineko.dtb of=build/yuzukineko-manual-rv32.img bs=1 seek=$((0x10000)) conv=notrunc status=none
dd if=opensbi/build/sun252i-f101/platform/generic/firmware/fw_jump.bin of=build/yuzukineko-manual-rv32.img bs=1 seek=$((0x50000)) conv=notrunc status=none
dd if=build/kernel-rv32/arch/riscv/boot/Image of=build/yuzukineko-manual-rv32.img bs=1 seek=$((0xd0000)) conv=notrunc status=none
dd if=build/rootfs-rv32.squashfs of=build/yuzukineko-manual-rv32.img bs=1 seek=$((0x6d0000)) conv=notrunc status=none
ls -l build/yuzukineko-manual-rv32.img
sha256sum build/yuzukineko-manual-rv32.img
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual/image.cast" data-speed="0.3"></div>

The file should be exactly 16,777,216 bytes, with everything after `0xf00000` being `0xFF`, that is, an empty overlay partition.

## Flashing the Full Image

Writing the full image <strong>overwrites the entire Flash</strong>, including any changes on the board in the overlay partition, so back up first.

```sh
xfel version
xfel spinor
xfel spinor write 0x0 build/yuzukineko-manual-rv32.img
xfel spinor read 0x0 0x1000000 readback.img
sha256sum build/yuzukineko-manual-rv32.img readback.img
```

Reset once the two SHA-256 values match:

```sh
xfel reset
```

For the serial port settings, how to log in, and the note that the overlay is formatted on first boot, see [Prebuilt Images](linux-prebuilt.md#connecting-the-serial-port).
