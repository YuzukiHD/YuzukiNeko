---
title: "Manually Building the RV64I Image"
---

[Manually Building the Linux Image](linux-manual.md) builds <strong>RV32</strong> by default. The C907 core of the F101 supports both RV32 and RV64I modes; this page only covers the changes needed to build RV64I. The toolchain, sources, working directory `~/f101-linux` and Flash layout are the same as on that page, so prepare according to it first and continue in the same working directory.

RV64I requires replacing the whole set of components, not just the kernel:

| Component | RV32 | RV64I |
| --- | --- | --- |
| SyterKit target | `spinor-boot` | `spinor-boot-rv64i` |
| OpenSBI `--arch` | `rv32` (`ilp32`) | `rv64` (`lp64`) |
| Kernel defconfig | `sun252i_f101_yuzukineko_defconfig` | `sun252i_f101_rv64_yuzukineko_defconfig` |
| Devicetree | `sun252i-f101-yuzukineko.dtb` | `sun252i-f101-yuzukineko-rv64i.dtb` |
| BusyBox compile options | `-march=rv32imafdc -mabi=ilp32d` | `-march=rv64imafdc -mabi=lp64d` |

:::caution
<strong>RV32 and RV64I components cannot be mixed.</strong> Writing the bootloader, devicetree or `fw_jump` of the other architecture makes the board fail to boot. When switching from RV32 to RV64I, replace the whole set of components or the whole image, not just the kernel.
:::

## Building SyterKit

SyterKit itself is always built with the RV32 configuration (`yuzukineko_rv32_sram_defconfig`); RV64I just adds one more target, `spinor-boot-rv64i`. If the configuration was already done according to the RV32 page, build this target directly:

```sh
cd SyterKit
make -j8 O=../build/syterkit CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf- spinor-boot-rv64i
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/syterkit.cast"></div>

If it has not been configured yet, first run the `defconfig` command from "Building SyterKit" on the RV32 page.

The artifact is `build/syterkit/build/yuzukineko/app_sram/spinor-boot-rv64i/spinor-boot-rv64i_spi.bin`, 49,152 bytes; the reserved area is 64 KiB.

### Boot code

After SyterKit has read the devicetree, `fw_jump` and the kernel into RAM, the code below restarts the core in RV64. The source is in `SyterKit/boards/yuzukineko/app_sram/spinor-boot-rv64i/main.c`:

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

### How it works

On power-up the C907 always runs in <strong>RV32</strong> mode: BROM loads SyterKit into SRAM to execute, so SyterKit itself must be linked as RV32. The ISA mode of the C907 is <strong>latched at reset</strong>, and cannot be switched directly from RV32 to RV64 while running. The code above is designed for this: prepare everything first, then reset the core, which restarts in RV64 mode after the reset.

Before that, SyterKit has already done the same steps as `spinor-boot`: initialize the serial port, clocks and RAM, identify the SPI NOR, read the three areas into RAM, and check the devicetree:

| Content | NOR offset | Read length | RAM address |
| --- | --- | --- | --- |
| Devicetree | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux `Image` | `0x0d0000` | 6 MiB | `0x40000000` |

What `f101_boot_sbi_firmware()` does afterwards, in code order, is:

1. `flush_dcache_all()` plus `fence rw, rw` and `fence.i`: flush what was just read into RAM out of the caches, ensuring that complete data and instructions are visible after the reset.
2. Write `1` to `0x02001d0c`: according to the source comment, this forces the ISA mode of the core to RV64.
3. Write the address of `f101_rv64_entry` to `0x06010100`: this is the reset vector, and the core fetches its first instruction from here after reset. The writes that follow to the same register block (offsets `+4`, `+8`, `+0x6c`) are the remaining configuration.
4. Write the configuration to the RISC-V watchdog at `0x06011000`, and write `0x16aa0000` and `0x16aa0011` at offsets `+0x14` and `+0x18`, triggering a watchdog reset. The core then waits in `wfi` for the reset to happen.
5. After the reset the core begins executing at `f101_rv64_entry` in RV64 mode. This entry code must be raw machine instructions, because SyterKit itself is compiled as RV32 and the compiler will not generate RV64 code for it. The five words are, in order:

   | Instruction word | Assembly | Effect |
   | --- | --- | --- |
   | `0x00000513` | `addi a0, zero, 0` | `a0 = 0`, hart ID |
   | `0x40f405b7` | `lui a1, 0x40f40` | `a1 = 0x40f40000`, devicetree address |
   | `0x40f802b7` | `lui t0, 0x40f80` | `t0 = 0x40f80000`, OpenSBI address |
   | `0x0000100f` | `fence.i` | synchronize the instruction stream |
   | `0x00028067` | `jr t0` | jump to OpenSBI |

6. OpenSBI (`fw_jump`) transfers control to the Linux `Image` at the start of RAM, per the `FW_JUMP_ADDR=0x40000000` hard-coded at build time, and the devicetree the kernel receives is the one in `a1`.

So the difference between the RV32 and RV64I versions is only in the last step: `spinor-boot` jumps directly to OpenSBI, while `spinor-boot-rv64i` goes through a reset first and then jumps. The devicetree and OpenSBI addresses in the entry code are hard-coded, so OpenSBI must be placed at `0x40f80000` and must be the RV64I version.

### Boot method

1. Build the RV64I `fw_jump`, kernel, devicetree and root filesystem as described in the sections below.
2. Assemble `yuzukineko-manual-rv64.img` and flash the whole flash as described in [Packaging and flashing](#packaging-and-flashing), or write each component as in flashing in sections.
3. Reset the board and connect to UART1 at 115200 8N1. SyterKit reads the components from the NOR automatically and boots; no command needs to be typed on the serial port.

### When loading fails

If `SPI NOR boot failed; load images and run 'boot'` appears on the serial port, SyterKit could not read or verify the components from the NOR and has stopped at the serial command line. Put the three files at the following RAM addresses, then type `boot` at the command line:

| Content | RAM address |
| --- | --- |
| Devicetree | `0x40f40000` |
| OpenSBI `fw_jump` | `0x40f80000` |
| Linux `Image` | `0x40000000` |

```text
boot
```

## Building OpenSBI

Change `--arch` to `rv64`; the output is in `opensbi/build/sun252i-f101-rv64/`:

```sh
cd opensbi
mkdir -p build
./build.sh --arch rv64 $HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/opensbi.cast" data-speed="0.3"></div>

The artifact is `opensbi/build/sun252i-f101-rv64/platform/generic/firmware/fw_jump.bin`, 268,728 bytes; the reserved area is 512 KiB. The three parameters `build.sh` passes to OpenSBI are:

| Parameter | Value |
| --- | --- |
| `PLATFORM_RISCV_XLEN` | `64` |
| `PLATFORM_RISCV_ABI` | `lp64` |
| `PLATFORM_RISCV_ISA` | `rv64imafdcv_zicsr_zifencei_xtheadcmo_xtheadsync` |

## Building the kernel

Switch to the RV64 defconfig and devicetree, with output in `build/kernel-rv64`:

```sh
cd linux-mainline
make O=../build/kernel-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- sun252i_f101_rv64_yuzukineko_defconfig
scripts/kconfig/merge_config.sh -m -O ../build/kernel-rv64 ../build/kernel-rv64/.config ../buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/scripts/linux-nor.fragment
make O=../build/kernel-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- olddefconfig
make -j8 O=../build/kernel-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- Image allwinner/sun252i-f101-yuzukineko-rv64i.dtb
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/kernel.cast" data-speed="3"></div>

The artifacts are in `build/kernel-rv64/arch/riscv/boot/`:

| File | Size (bytes) | Reserved area |
| --- | ---: | --- |
| `Image` | 5,791,000 | 6 MiB |
| `dts/allwinner/sun252i-f101-yuzukineko-rv64i.dtb` | 10,472 | 256 KiB |

## Building the root filesystem

BusyBox must be recompiled as 64-bit. The steps are the same as on the RV32 page, replacing `rv32` with `rv64` and the compile options with `-march=rv64imafdc -mabi=lp64d`:

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

Apart from the `bin/busybox` binary, the rest of the directories and configuration files in the root filesystem are exactly the same as RV32, so there is no need to do it again. Copy the RV32 directory directly, replace only the binary, and repack:

```sh
cp -a build/rootfs-rv32 build/rootfs-rv64
cp build/busybox-rv64/busybox build/rootfs-rv64/bin/busybox
mksquashfs build/rootfs-rv64 build/rootfs-rv64.squashfs -comp xz -all-root -noappend -no-progress -p "dev/console c 600 0 0 5 1" -p "dev/null c 666 0 0 1 3"
ls -l build/rootfs-rv64.squashfs
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/squashfs.cast"></div>

This step requires the root filesystem to have been built already according to the RV32 page. Do not run `make ... install` again for RV64: it will replace the custom `/sbin/init` with the symbolic link pointing at BusyBox.

The artifact is 1,081,344 bytes; the reserved area is 8,585,216 bytes.

## Packaging and flashing

The offsets are exactly the same as RV32; only the files are the RV64 ones:

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

Flashing the whole flash is the same as on the RV32 page, with the image filename changed to `build/yuzukineko-manual-rv64.img`. For flashing in sections, replace each file with the RV64 file used in the `dd` commands above; the offsets do not change.

When the board already has an RV64I image, a single component can be replaced on its own; but to switch from RV32 to RV64I, flash the whole flash.

## Boot

After flashing completes and the board is reset, connect to UART1 at 115200 8N1. The serial parameters, login method and first-boot notes are the same as RV32; see [Prebuilt image](linux-prebuilt.md#connecting-the-serial-port).
