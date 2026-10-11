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
make -j8 O=../build/syterkit CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf- spinor-boot-rv64i
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/syterkit.cast"></div>

If you have not configured it yet, first run the `defconfig` command from "Building SyterKit" on the RV32 page.

The output is `build/syterkit/build/yuzukineko/app_sram/spinor-boot-rv64i/spinor-boot-rv64i_spi.bin`, 49,152 bytes, in a 64 KiB reserved region.

### Boot Code

After SyterKit has read the device tree, `fw_jump` and the kernel into RAM, the following code restarts the core in RV64 mode. The source is `SyterKit/boards/yuzukineko/app_sram/spinor-boot-rv64i/main.c`:

```c
static const uint32_t f101_rv64_entry[] __attribute__((section(".text.rv64_entry"), aligned(4), used)) = {
	0x00000513U,
	0x40f405b7U,
	0x40f802b7U,
	0x0000100fU,
	0x00028067U,
};

static __attribute__((noreturn, noinline)) void f101_boot_sbi_firmware(void)
{
	uintptr_t rv64_entry = (uintptr_t)f101_rv64_entry;

	/* Make images loaded from the SPI NOR visible before the reset. */
	flush_dcache_all();
	asm volatile("fence rw, rw\n\tfence.i" ::: "memory");

	/*
	 * C907 latches the ISA mode at reset. Program the reset vector and force
	 * RV64, then use the RISC-V watchdog to restart the core. The reset lands
	 * in f101_rv64_entry, which sets a0/a1 and jumps to SBI firmware.
	 */
	asm volatile("li t0, 0x02001d0c\n\t"
		     "li t1, 0x1\n\t"
		     "sw t1, 0(t0)\n\t"
		     "li t0, 0x06010100\n\t"
		     "sw %[entry], 0(t0)\n\t"
		     "sw zero, 4(t0)\n\t"
		     "li t1, 0x200\n\t"
		     "sw t1, 8(t0)\n\t"
		     "sw zero, 0x6c(t0)\n\t"
		     "li t0, 0x06011000\n\t"
		     "li t1, 0x1\n\t"
		     "sw t1, 0(t0)\n\t"
		     "li t1, 0x16aa0000\n\t"
		     "sw t1, 0x14(t0)\n\t"
		     "li t1, 0x16aa0011\n\t"
		     "sw t1, 0x18(t0)\n"
		     "1: wfi\n\t"
		     "j 1b\n"
		:
		: [entry] "r"((uint32_t)rv64_entry)
		: "t0", "t1", "memory");

	__builtin_unreachable();
}
```

### Principle

The C907 always starts in **RV32** mode: the BROM loads SyterKit into SRAM and runs it, so SyterKit itself must be linked as RV32. The ISA mode of the C907, however, is **latched at reset**, so a running core cannot switch from RV32 to RV64 directly. The code above is designed around this: prepare everything first, then reset the core, which restarts in RV64 mode.

Before that, SyterKit has already done the same steps as `spinor-boot`: initialised the serial port, clocks and RAM, detected the SPI NOR, read three regions into RAM and checked the device tree:

| Content | NOR offset | Length read | RAM address |
| --- | --- | --- | --- |
| Device tree | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux `Image` | `0x0d0000` | 6 MiB | `0x40000000` |

`f101_boot_sbi_firmware()` then does the following, in code order:

1. `flush_dcache_all()` plus `fence rw, rw` and `fence.i`: flush what was just read into RAM out of the cache, so that after the reset the core sees complete data and instructions.
2. Write `1` to `0x02001d0c`: according to the source comment, this forces the core's ISA mode to RV64.
3. Write the address of `f101_rv64_entry` to `0x06010100`: this is the reset vector, where the core fetches its first instruction after reset. The writes that follow to the same register block (offsets `+4`, `+8`, `+0x6c`) are the rest of the configuration.
4. Configure the RISC-V watchdog at `0x06011000` and write `0x16aa0000` and `0x16aa0011` at offsets `+0x14` and `+0x18` to trigger a watchdog reset. The core then waits in `wfi` for the reset to happen.
5. After the reset the core runs `f101_rv64_entry` in RV64 mode. This entry code has to be raw machine instructions, because SyterKit itself is compiled as RV32 and the compiler would not generate RV64 code for it. The five words are:

   | Instruction word | Assembly | Effect |
   | --- | --- | --- |
   | `0x00000513` | `addi a0, zero, 0` | `a0 = 0`, the hart ID |
   | `0x40f405b7` | `lui a1, 0x40f40` | `a1 = 0x40f40000`, the device tree address |
   | `0x40f802b7` | `lui t0, 0x40f80` | `t0 = 0x40f80000`, the OpenSBI address |
   | `0x0000100f` | `fence.i` | Synchronise the instruction stream |
   | `0x00028067` | `jr t0` | Jump to OpenSBI |

6. OpenSBI (`fw_jump`) hands control to the Linux `Image` at the start of RAM, using the `FW_JUMP_ADDR=0x40000000` fixed at build time; the device tree the kernel receives is the one in `a1`.

So the only difference between the RV32 and RV64I versions is the last step: `spinor-boot` jumps straight to OpenSBI, while `spinor-boot-rv64i` goes through one reset first. The device tree and OpenSBI addresses are hard-coded in the entry code, so OpenSBI must be placed at `0x40f80000` and must be the RV64I build.

### How to Boot

1. Build the RV64I `fw_jump`, kernel, device tree and root filesystem following the sections below.
2. Assemble `yuzukineko-manual-rv64.img` as described in [Packaging and Flashing](#packing-and-flashing) and flash the whole chip, or write the components one by one.
3. Reset the board and connect to UART1 at 115200 8N1. SyterKit reads the components from NOR and boots automatically; you do not need to type anything on the serial port.

### When Loading Fails

If the serial port shows `SPI NOR boot failed; load images and run 'boot'`, SyterKit could not read or validate the components from NOR and stops at a command line on the serial port. Put the three files at the following RAM addresses, then type `boot` at the command line:

| Content | RAM address |
| --- | --- |
| Device tree | `0x40f40000` |
| OpenSBI `fw_jump` | `0x40f80000` |
| Linux `Image` | `0x40000000` |

```text
boot
```

## Building OpenSBI

Change `--arch` to `rv64`; the output goes to `opensbi/build/sun252i-f101-rv64/`:

```sh
cd opensbi
mkdir -p build
./build.sh --arch rv64 $HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/opensbi.cast" data-speed="0.3"></div>

The output is `opensbi/build/sun252i-f101-rv64/platform/generic/firmware/fw_jump.bin`, 268,728 bytes, in a 512 KiB reserved region. The three parameters `build.sh` passes to OpenSBI are:

| Parameter | Value |
| --- | --- |
| `PLATFORM_RISCV_XLEN` | `64` |
| `PLATFORM_RISCV_ABI` | `lp64` |
| `PLATFORM_RISCV_ISA` | `rv64imafdcv_zicsr_zifencei_xtheadcmo_xtheadsync` |

## Building the Kernel

Switch to the RV64 defconfig and device tree, with the output going to `build/kernel-rv64`:

```sh
cd linux-mainline
make O=../build/kernel-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- sun252i_f101_rv64_yuzukineko_defconfig
scripts/kconfig/merge_config.sh -m -O ../build/kernel-rv64 ../build/kernel-rv64/.config ../buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/scripts/linux-nor.fragment
make O=../build/kernel-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- olddefconfig
make -j8 O=../build/kernel-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- Image allwinner/sun252i-f101-yuzukineko-rv64i.dtb
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/kernel.cast" data-speed="3"></div>

The output is in `build/kernel-rv64/arch/riscv/boot/`:

| File | Size (bytes) | Reserved region |
| --- | ---: | --- |
| `Image` | 5,791,000 | 6 MiB |
| `dts/allwinner/sun252i-f101-yuzukineko-rv64i.dtb` | 10,472 | 256 KiB |

## Building the Root Filesystem

BusyBox has to be rebuilt as 64-bit. The steps are the same as on the RV32 page, with `rv32` replaced by `rv64` and the compile options replaced by `-march=rv64imafdc -mabi=lp64d`:

```sh
cd busybox-1.38.0
mkdir -p ../build/busybox-rv64
make O=../build/busybox-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- defconfig
sed -i 's/^# CONFIG_STATIC is not set/CONFIG_STATIC=y/' ../build/busybox-rv64/.config
sed -i 's/^# CONFIG_FLASH_ERASEALL is not set/CONFIG_FLASH_ERASEALL=y/' ../build/busybox-rv64/.config
sed -i 's/^CONFIG_EXTRA_CFLAGS=""/CONFIG_EXTRA_CFLAGS="-march=rv64imafdc -mabi=lp64d"/' ../build/busybox-rv64/.config
sed -i 's/^CONFIG_EXTRA_LDFLAGS=""/CONFIG_EXTRA_LDFLAGS="-march=rv64imafdc -mabi=lp64d"/' ../build/busybox-rv64/.config
make O=../build/busybox-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- oldconfig < /dev/null
make -j8 O=../build/busybox-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/busybox.cast"></div>

`file build/busybox-rv64/busybox` should report 64-bit, statically linked.

Apart from the `bin/busybox` binary, the directories and configuration files in the root filesystem are exactly the same as for RV32, so there is no need to do them again. Copy the RV32 directory, replace only the binary, and pack it:

```sh
cp -a build/rootfs-rv32 build/rootfs-rv64
cp build/busybox-rv64/busybox build/rootfs-rv64/bin/busybox
mksquashfs build/rootfs-rv64 build/rootfs-rv64.squashfs -comp xz -all-root -noappend -no-progress -p "dev/console c 600 0 0 5 1" -p "dev/null c 666 0 0 1 3"
ls -l build/rootfs-rv64.squashfs
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/squashfs.cast"></div>

This step requires that the root filesystem has already been built following the RV32 page. Do not run `make ... install` again for RV64: it would turn the custom `/sbin/init` back into a symlink to BusyBox.

The output is 1,081,344 bytes, in a reserved region of 8,585,216 bytes.

## Packing and Flashing

The offsets are exactly the same as for RV32; only the files are the RV64 ones:

```sh
head -c 16777216 /dev/zero | tr '\000' '\377' > build/yuzukineko-manual-rv64.img
dd if=build/syterkit/build/yuzukineko/app_sram/spinor-boot-rv64i/spinor-boot-rv64i_spi.bin of=build/yuzukineko-manual-rv64.img bs=1 seek=0 conv=notrunc status=none
dd if=build/kernel-rv64/arch/riscv/boot/dts/allwinner/sun252i-f101-yuzukineko-rv64i.dtb of=build/yuzukineko-manual-rv64.img bs=1 seek=$((0x10000)) conv=notrunc status=none
dd if=opensbi/build/sun252i-f101-rv64/platform/generic/firmware/fw_jump.bin of=build/yuzukineko-manual-rv64.img bs=1 seek=$((0x50000)) conv=notrunc status=none
dd if=build/kernel-rv64/arch/riscv/boot/Image of=build/yuzukineko-manual-rv64.img bs=1 seek=$((0xd0000)) conv=notrunc status=none
dd if=build/rootfs-rv64.squashfs of=build/yuzukineko-manual-rv64.img bs=1 seek=$((0x6d0000)) conv=notrunc status=none
ls -l build/yuzukineko-manual-rv64.img
sha256sum build/yuzukineko-manual-rv64.img
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/image.cast" data-speed="0.35"></div>

Flashing the full image is the same as on the RV32 page, with the image file name changed to `build/yuzukineko-manual-rv64.img`. When flashing components individually, replace each file with the RV64 file used in the `dd` commands above; the offsets stay the same.

If the board already runs an RV64I image, you can replace just one component; but to go from RV32 to RV64I, flash the full image.

## Booting

After flashing and resetting, connect to UART1 at 115200 8N1. The serial port settings, how to log in, and the notes on first boot are the same as for RV32; see [Prebuilt Images](linux-prebuilt.md#connecting-the-serial-port).
