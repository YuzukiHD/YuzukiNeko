# Building the RV64I Image by Hand

[Building a Linux Image by Hand](linux-manual.md) builds <strong>RV32</strong> by default. The F101's C907 core supports both RV32 and RV64I modes, and this page covers only what changes to build RV64I. The toolchains, source code, the `~/f101-linux` working directory and the Flash layout are all the same as on that page, so prepare them as described there first and continue in the same working directory.

RV64I replaces the whole set of components, not just the kernel:

| Component | RV32 | RV64I |
| --- | --- | --- |
| SyterKit target | `spinor-boot` | `spinor-boot-rv64i` |
| OpenSBI `--arch` | `rv32` (`ilp32`) | `rv64` (`lp64`) |
| Kernel defconfig | `sun252i_f101_yuzukineko_defconfig` | `sun252i_f101_rv64_yuzukineko_defconfig` |
| Device tree | `sun252i-f101-yuzukineko.dtb` | `sun252i-f101-yuzukineko-rv64i.dtb` |
| BusyBox compile options | `-march=rv32imafdc -mabi=ilp32d` | `-march=rv64imafdc -mabi=lp64d` |

!> <strong>RV32 and RV64I components cannot be mixed.</strong> Writing the bootloader, device tree or `fw_jump` of the other architecture leaves the board unable to boot. To switch from RV32 to RV64I, replace the whole set of components or the whole image, not just the kernel.

## Building SyterKit

SyterKit itself is always built with the RV32 config (`yuzukineko_rv32_sram_defconfig`); RV64I just adds one more target, `spinor-boot-rv64i`. If you have already configured it following the RV32 page, build this target directly:

```sh
cd SyterKit
make -j8 O=../out/syterkit CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf- spinor-boot-rv64i
cd ..
```

If you have not configured it yet, first run the first three commands (`defconfig`, `sed`, `olddefconfig`) from "Building SyterKit" on the RV32 page.

The output is `out/syterkit/build/yuzukineko/app_sram/spinor-boot-rv64i/spinor-boot-rv64i_spi.bin`, 49,152 bytes, in a 64 KiB reserved region.

### How It Boots into RV64I

The C907 always starts in <strong>RV32</strong> mode at power-on: the BROM loads SyterKit into SRAM and runs it, so SyterKit must be linked as RV32, and `spinor-boot-rv64i` is no exception. Its first half is identical to `spinor-boot`; the difference is the last step: instead of jumping straight to OpenSBI, it first restarts the core in RV64 mode. The full sequence is:

1. Initialize the serial port, clocks and PSRAM (16 MiB, base address `0x40000000`).
2. Initialize the SPI NOR controller and identify the flash; the serial port prints `SPI NOR: flash id …`.
3. Read three fixed-size regions from NOR into PSRAM:

   | Content | NOR offset | Read length | PSRAM address |
   | --- | --- | --- | --- |
   | Device tree | `0x010000` | 256 KiB | `0x40f40000` |
   | OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
   | Linux `Image` | `0x0d0000` | 6 MiB | `0x40000000` |

   These are the same as the RAM load addresses in the [Flash Layout](linux-manual.md#flash-layout) table. After each region is read, the serial port prints a line `SPI NOR: <name> 0x… -> 0x… (… KiB)`.
4. Check that the device tree header is valid and that its size does not exceed 256 KiB; if not, boot is aborted.
5. Flush the data cache so that what was read into PSRAM is visible to the code that runs next.
6. Switch to RV64: write the C907 reset vector, pointing at a small piece of entry code SyterKit has placed in advance, and set the core's ISA mode to RV64, then reset the core with the RISC-V watchdog. After the reset the core starts executing that entry code in RV64 mode; before this the serial port prints `Booting memory images: Linux=0x40000000 DTB=0x40f40000 SBI firmware=0x40f80000`.
7. The entry code is only five instructions: set `a0` to 0 (the hart ID), set `a1` to the device tree address `0x40f40000`, execute `fence.i`, and jump to OpenSBI at `0x40f80000`.
8. OpenSBI (`fw_jump`) hands control to the Linux `Image` at the start of PSRAM, according to `FW_JUMP_ADDR=0x40000000` fixed at build time; the device tree the kernel receives is the one in `a1`.

This step has two constraints:

- <strong>The addresses of the entry code and `fw_jump` are fixed.</strong> SyterKit always puts OpenSBI at `0x40f80000` and the device tree at `0x40f40000`, so OpenSBI's `FW_TEXT_START` must be `0x40f80000` and the kernel must start at `0x40000000`. Building OpenSBI with the `build.sh` in the repository satisfies this.
- <strong>It must be the RV64I `fw_jump`.</strong> The core has already switched to RV64, and jumping into the 32-bit `fw_jump.bin` built with `--arch rv32` cannot run, which is why the components above cannot be mixed.

### When Loading Fails

If identifying the flash, reading a region or checking the device tree fails at any step, SyterKit does not restart the core. Instead it prints `SPI NOR boot failed; load images and run 'boot'` and drops into the command line on the serial port. You can then put the images at the PSRAM addresses in the table above by other means and type `boot` at the command line, which performs steps 4 to 8. `boot` is also run once when the command line exits.

## Building OpenSBI

Change `--arch` to `rv64`; the output goes to `opensbi/build/sun252i-f101-rv64/`:

```sh
cd opensbi
mkdir -p build
./build.sh --arch rv64 /opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-
cd ..
```

The output is `opensbi/build/sun252i-f101-rv64/platform/generic/firmware/fw_jump.bin`, 268,728 bytes, in a 512 KiB reserved region. The three parameters `build.sh` passes to OpenSBI are:

| Parameter | Value |
| --- | --- |
| `PLATFORM_RISCV_XLEN` | `64` |
| `PLATFORM_RISCV_ABI` | `lp64` |
| `PLATFORM_RISCV_ISA` | `rv64imafdcv_zicsr_zifencei_xtheadcmo_xtheadsync` |

## Building the Kernel

Switch to the RV64 defconfig and device tree, with the output going to `out/kernel-rv64`:

```sh
cd linux-mainline
make O=../out/kernel-rv64 ARCH=riscv CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- sun252i_f101_rv64_yuzukineko_defconfig
scripts/kconfig/merge_config.sh -m -O ../out/kernel-rv64 ../out/kernel-rv64/.config ../buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/scripts/linux-nor.fragment
make O=../out/kernel-rv64 ARCH=riscv CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- olddefconfig
make -j8 O=../out/kernel-rv64 ARCH=riscv CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- Image allwinner/sun252i-f101-yuzukineko-rv64i.dtb
cd ..
```

The output is in `out/kernel-rv64/arch/riscv/boot/`:

| File | Size (bytes) | Reserved region |
| --- | ---: | --- |
| `Image` | 5,791,000 | 6 MiB |
| `dts/allwinner/sun252i-f101-yuzukineko-rv64i.dtb` | 10,472 | 256 KiB |

## Building the Root Filesystem

BusyBox has to be rebuilt as 64-bit. The steps are the same as on the RV32 page, with `rv32` replaced by `rv64` and the compile options replaced by `-march=rv64imafdc -mabi=lp64d`:

```sh
cd busybox-1.38.0
mkdir -p ../out/busybox-rv64
make O=../out/busybox-rv64 ARCH=riscv CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- defconfig
sed -i 's/^# CONFIG_STATIC is not set/CONFIG_STATIC=y/' ../out/busybox-rv64/.config
sed -i 's/^# CONFIG_FLASH_ERASEALL is not set/CONFIG_FLASH_ERASEALL=y/' ../out/busybox-rv64/.config
sed -i 's/^CONFIG_EXTRA_CFLAGS=""/CONFIG_EXTRA_CFLAGS="-march=rv64imafdc -mabi=lp64d"/' ../out/busybox-rv64/.config
sed -i 's/^CONFIG_EXTRA_LDFLAGS=""/CONFIG_EXTRA_LDFLAGS="-march=rv64imafdc -mabi=lp64d"/' ../out/busybox-rv64/.config
make O=../out/busybox-rv64 ARCH=riscv CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- oldconfig < /dev/null
make -j8 O=../out/busybox-rv64 ARCH=riscv CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-
cd ..
```

`file out/busybox-rv64/busybox` should report 64-bit, statically linked.

Apart from the `bin/busybox` binary, the directories and configuration files in the root filesystem are exactly the same as for RV32, so there is no need to do them again. Copy the RV32 directory, replace only the binary, and pack it:

```sh
cp -a out/rootfs-rv32 out/rootfs-rv64
cp out/busybox-rv64/busybox out/rootfs-rv64/bin/busybox
mksquashfs out/rootfs-rv64 out/rootfs-rv64.squashfs -comp xz -all-root -noappend -no-progress -p "dev/console c 600 0 0 5 1" -p "dev/null c 666 0 0 1 3"
ls -l out/rootfs-rv64.squashfs
```

This step requires that the root filesystem has already been built following the RV32 page. Do not run `make ... install` again for RV64: it would turn the custom `/sbin/init` back into a symlink to BusyBox.

The output is 1,081,344 bytes, in a reserved region of 8,585,216 bytes.

## Packing and Flashing

The offsets are exactly the same as for RV32; only the files are the RV64 ones:

```sh
head -c 16777216 /dev/zero | tr '\000' '\377' > out/yuzukineko-manual-rv64.img
dd if=out/syterkit/build/yuzukineko/app_sram/spinor-boot-rv64i/spinor-boot-rv64i_spi.bin of=out/yuzukineko-manual-rv64.img bs=1 seek=0 conv=notrunc status=none
dd if=out/kernel-rv64/arch/riscv/boot/dts/allwinner/sun252i-f101-yuzukineko-rv64i.dtb of=out/yuzukineko-manual-rv64.img bs=1 seek=$((0x10000)) conv=notrunc status=none
dd if=opensbi/build/sun252i-f101-rv64/platform/generic/firmware/fw_jump.bin of=out/yuzukineko-manual-rv64.img bs=1 seek=$((0x50000)) conv=notrunc status=none
dd if=out/kernel-rv64/arch/riscv/boot/Image of=out/yuzukineko-manual-rv64.img bs=1 seek=$((0xd0000)) conv=notrunc status=none
dd if=out/rootfs-rv64.squashfs of=out/yuzukineko-manual-rv64.img bs=1 seek=$((0x6d0000)) conv=notrunc status=none
ls -l out/yuzukineko-manual-rv64.img
sha256sum out/yuzukineko-manual-rv64.img
```

Flashing the full image is the same as on the RV32 page, with the image file name changed to `out/yuzukineko-manual-rv64.img`. When flashing components individually, replace each file with the RV64 file used in the `dd` commands above; the offsets stay the same.

If the board already runs an RV64I image, you can replace just one component; but to go from RV32 to RV64I, flash the full image.

## Booting

After flashing and resetting, connect to UART1 at 115200 8N1. The serial port settings, how to log in, and the notes on first boot are the same as for RV32; see [Prebuilt Images](linux-prebuilt.md#connecting-the-serial-port).
