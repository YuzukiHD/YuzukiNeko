# 手动构建 RV64I 镜像

[手动构建 Linux 镜像](linux-manual.md) 默认构建 <strong>RV32</strong>。F101 的 C907 内核同时支持 RV32 和 RV64I 两种模式，这一页只写构建 RV64I 要改的地方。工具链、源码、工作目录 `~/f101-linux`、Flash 布局都和那一页相同，请先照那一页准备好，并在同一个工作目录里继续。

RV64I 要换的是整套组件，不是只换内核：

| 组件 | RV32 | RV64I |
| --- | --- | --- |
| SyterKit 目标 | `spinor-boot` | `spinor-boot-rv64i` |
| OpenSBI `--arch` | `rv32`（`ilp32`） | `rv64`（`lp64`） |
| 内核 defconfig | `sun252i_f101_yuzukineko_defconfig` | `sun252i_f101_rv64_yuzukineko_defconfig` |
| 设备树 | `sun252i-f101-yuzukineko.dtb` | `sun252i-f101-yuzukineko-rv64i.dtb` |
| BusyBox 编译选项 | `-march=rv32imafdc -mabi=ilp32d` | `-march=rv64imafdc -mabi=lp64d` |

!> <strong>RV32 与 RV64I 的组件不能混用。</strong>把另一个架构的引导加载器、设备树或 `fw_jump` 写进去，板子会无法启动。从 RV32 切到 RV64I，要换整套组件或整个镜像，不要只换内核。

## 构建 SyterKit

SyterKit 本身始终用 RV32 配置（`yuzukineko_rv32_sram_defconfig`）构建，RV64I 只是多一个目标 `spinor-boot-rv64i`。如果已经按 RV32 那页做过配置，直接构建这个目标：

```sh
cd SyterKit
make -j8 O=../build/syterkit CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf- spinor-boot-rv64i
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/syterkit.cast"></div>

还没配置过的话，先执行 RV32 页「构建 SyterKit」里的 `defconfig` 那条命令。

产物是 `build/syterkit/build/yuzukineko/app_sram/spinor-boot-rv64i/spinor-boot-rv64i_spi.bin`，49,152 字节，预留区 64 KiB。

### 启动代码

SyterKit 把设备树、`fw_jump` 和内核读进 RAM 后，用下面的代码让核心以 RV64 重新启动。源码在 `SyterKit/boards/yuzukineko/app_sram/spinor-boot-rv64i/main.c`：

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

### 原理

C907 上电后总是以 <strong>RV32</strong> 模式运行：BROM 把 SyterKit 载入 SRAM 执行，所以 SyterKit 自己必须按 RV32 链接。而 C907 的 ISA 模式是<strong>在复位时锁存</strong>的，运行中不能直接从 RV32 切到 RV64。上面的代码就是为此设计的：先把一切准备好，再让核心复位，复位后以 RV64 模式重新启动。

在这之前，SyterKit 已经完成了和 `spinor-boot` 相同的步骤：初始化串口、时钟和 RAM，识别 SPI NOR，把三个区域读进 RAM，并检查设备树：

| 内容 | NOR 偏移 | 读取长度 | RAM 地址 |
| --- | --- | --- | --- |
| 设备树 | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux `Image` | `0x0d0000` | 6 MiB | `0x40000000` |

`f101_boot_sbi_firmware()` 随后做的事，按代码顺序是：

1. `flush_dcache_all()` 加 `fence rw, rw` 和 `fence.i`：把刚读进 RAM 的内容刷出缓存，保证复位之后看到的是完整的数据和指令。
2. 往 `0x02001d0c` 写 `1`：按源码注释，这一步把核心的 ISA 模式强制设为 RV64。
3. 往 `0x06010100` 写入 `f101_rv64_entry` 的地址：这是复位向量，核心复位后从这里取第一条指令。紧接着对同一块寄存器区域的几次写入（偏移 `+4`、`+8`、`+0x6c`）是其余配置。
4. 对 `0x06011000` 处的 RISC-V 看门狗写入配置，并在偏移 `+0x14`、`+0x18` 写入 `0x16aa0000`、`0x16aa0011`，触发看门狗复位。之后核心在 `wfi` 里等待复位发生。
5. 复位后核心以 RV64 模式从 `f101_rv64_entry` 开始执行。这段入口代码必须是裸机器指令，因为 SyterKit 本身是按 RV32 编译的，编译器不会为它生成 RV64 代码。五个字依次是：

   | 指令字 | 汇编 | 作用 |
   | --- | --- | --- |
   | `0x00000513` | `addi a0, zero, 0` | `a0 = 0`，hart ID |
   | `0x40f405b7` | `lui a1, 0x40f40` | `a1 = 0x40f40000`，设备树地址 |
   | `0x40f802b7` | `lui t0, 0x40f80` | `t0 = 0x40f80000`，OpenSBI 地址 |
   | `0x0000100f` | `fence.i` | 同步指令流 |
   | `0x00028067` | `jr t0` | 跳到 OpenSBI |

6. OpenSBI（`fw_jump`）按构建时写死的 `FW_JUMP_ADDR=0x40000000`，把控制权交给 RAM 起始处的 Linux `Image`，内核拿到的设备树就是 `a1` 里的那份。

所以 RV32 版和 RV64I 版的差别只在最后一步：`spinor-boot` 直接跳到 OpenSBI，`spinor-boot-rv64i` 则先经过一次复位再跳。入口代码里的设备树和 OpenSBI 地址是写死的，所以 OpenSBI 必须放在 `0x40f80000`，并且要用 RV64I 版本。

### 启动方法

1. 按本页下面各节构建 RV64I 的 `fw_jump`、内核、设备树和根文件系统。
2. 按 [打包与烧录](#打包与烧录) 拼成 `yuzukineko-manual-rv64.img` 并整片烧录，或按分段烧录写入各组件。
3. 复位板子，用 115200 8N1 连接 UART1。SyterKit 会自动从 NOR 读出各组件并启动，不需要在串口上输入命令。

### 载入失败时

如果串口上出现 `SPI NOR boot failed; load images and run 'boot'`，说明 SyterKit 没能从 NOR 读出或校验各组件，它会停在串口命令行。把三个文件放进 RAM 的下列地址，再在命令行输入 `boot`：

| 内容 | RAM 地址 |
| --- | --- |
| 设备树 | `0x40f40000` |
| OpenSBI `fw_jump` | `0x40f80000` |
| Linux `Image` | `0x40000000` |

```text
boot
```

## 构建 OpenSBI

把 `--arch` 换成 `rv64`，输出在 `opensbi/build/sun252i-f101-rv64/`：

```sh
cd opensbi
mkdir -p build
./build.sh --arch rv64 $HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/opensbi.cast" data-speed="0.3"></div>

产物是 `opensbi/build/sun252i-f101-rv64/platform/generic/firmware/fw_jump.bin`，268,728 字节，预留区 512 KiB。`build.sh` 传给 OpenSBI 的三个参数分别是：

| 参数 | 值 |
| --- | --- |
| `PLATFORM_RISCV_XLEN` | `64` |
| `PLATFORM_RISCV_ABI` | `lp64` |
| `PLATFORM_RISCV_ISA` | `rv64imafdcv_zicsr_zifencei_xtheadcmo_xtheadsync` |

## 构建内核

换成 RV64 的 defconfig 和设备树，输出到 `build/kernel-rv64`：

```sh
cd linux-mainline
make O=../build/kernel-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- sun252i_f101_rv64_yuzukineko_defconfig
scripts/kconfig/merge_config.sh -m -O ../build/kernel-rv64 ../build/kernel-rv64/.config ../buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/scripts/linux-nor.fragment
make O=../build/kernel-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- olddefconfig
make -j8 O=../build/kernel-rv64 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- Image allwinner/sun252i-f101-yuzukineko-rv64i.dtb
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/kernel.cast" data-speed="3"></div>

产物在 `build/kernel-rv64/arch/riscv/boot/`：

| 文件 | 大小（字节） | 预留区 |
| --- | ---: | --- |
| `Image` | 5,791,000 | 6 MiB |
| `dts/allwinner/sun252i-f101-yuzukineko-rv64i.dtb` | 10,472 | 256 KiB |

## 构建根文件系统

BusyBox 要重新编成 64 位。步骤和 RV32 页一样，把 `rv32` 换成 `rv64`，编译选项换成 `-march=rv64imafdc -mabi=lp64d`：

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

`file build/busybox-rv64/busybox` 应显示 64-bit、statically linked。

根文件系统里除了 `bin/busybox` 这个二进制，其余目录和配置文件与 RV32 完全一样，不用再做一遍。直接复制 RV32 的目录，只替换二进制，再打包：

```sh
cp -a build/rootfs-rv32 build/rootfs-rv64
cp build/busybox-rv64/busybox build/rootfs-rv64/bin/busybox
mksquashfs build/rootfs-rv64 build/rootfs-rv64.squashfs -comp xz -all-root -noappend -no-progress -p "dev/console c 600 0 0 5 1" -p "dev/null c 666 0 0 1 3"
ls -l build/rootfs-rv64.squashfs
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual-rv64/squashfs.cast"></div>

这一步要求已经按 RV32 页做完根文件系统。不要对 RV64 重新执行 `make ... install`：它会把自定义的 `/sbin/init` 换回指向 BusyBox 的符号链接。

产物是 1,081,344 字节，预留区 8,585,216 字节。

## 打包与烧录

偏移和 RV32 完全一样，只是文件换成 RV64 的：

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

整片烧录和 RV32 页相同，把镜像文件名换成 `build/yuzukineko-manual-rv64.img`。分段烧录时，每个文件换成上面 `dd` 用的 RV64 文件，偏移不变。

板子上已经是 RV64I 镜像时，可以只替换某个组件；但要从 RV32 换成 RV64I，请整片烧录。

## 启动

烧录完成并复位后，用 115200 8N1 连接 UART1。串口参数、登录方式和首次启动的说明与 RV32 相同，见 [预编译镜像](linux-prebuilt.md#连接串口)。
