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
make -j8 O=../out/syterkit CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf- spinor-boot-rv64i
cd ..
```

还没配置过的话，先执行 RV32 页「构建 SyterKit」里的前三条命令（`defconfig`、`sed`、`olddefconfig`）。

产物是 `out/syterkit/build/yuzukineko/app_sram/spinor-boot-rv64i/spinor-boot-rv64i_spi.bin`，49,152 字节，预留区 64 KiB。

### 它是怎么启动到 RV64I 的

C907 上电后总是先以 <strong>RV32</strong> 模式运行：BROM 把 SyterKit 载入 SRAM 执行，所以 SyterKit 必须按 RV32 链接，`spinor-boot-rv64i` 也不例外。它和 `spinor-boot` 的前半段完全一样，区别在最后一步——不是直接跳到 OpenSBI，而是先让核心以 RV64 模式重启。完整过程如下：

1. 初始化串口、时钟和 PSRAM（16 MiB，基址 `0x40000000`）。
2. 初始化 SPI NOR 控制器并识别 Flash，串口会打印 `SPI NOR: flash id …`。
3. 把三个固定大小的区域从 NOR 读进 PSRAM：

   | 内容 | NOR 偏移 | 读取长度 | PSRAM 地址 |
   | --- | --- | --- | --- |
   | 设备树 | `0x010000` | 256 KiB | `0x40f40000` |
   | OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
   | Linux `Image` | `0x0d0000` | 6 MiB | `0x40000000` |

   这和 [Flash 布局](linux-manual.md#flash-布局) 表里的 RAM 载入地址相同。每读完一个区域，串口打印一行 `SPI NOR: <名称> 0x… -> 0x… (… KiB)`。
4. 检查设备树头部是否合法、大小是否超过 256 KiB，不合法就不启动。
5. 刷新数据缓存，保证读进 PSRAM 的内容对后面的执行可见。
6. 切到 RV64：写入 C907 的复位向量，指向 SyterKit 里一小段预先放好的入口代码，并把核心的 ISA 模式设为 RV64，然后用 RISC-V 看门狗复位核心。核心复位后以 RV64 模式从这段入口代码开始执行，串口此前会打印 `Booting memory images: Linux=0x40000000 DTB=0x40f40000 SBI firmware=0x40f80000`。
7. 入口代码只有五条指令：把 `a0` 设为 0（hart ID），`a1` 设为设备树地址 `0x40f40000`，执行 `fence.i`，再跳到 `0x40f80000` 的 OpenSBI。
8. OpenSBI（`fw_jump`）按构建时写死的 `FW_JUMP_ADDR=0x40000000`，把控制权交给 PSRAM 起始处的 Linux `Image`，内核拿到的设备树就是 `a1` 里的那份。

这一步有两个限制：

- <strong>入口代码和 `fw_jump` 的地址是写死的。</strong>SyterKit 固定把 OpenSBI 放在 `0x40f80000`，设备树放在 `0x40f40000`，所以 OpenSBI 的 `FW_TEXT_START` 必须是 `0x40f80000`，内核必须从 `0x40000000` 起。用仓库自带的 `build.sh` 构建 OpenSBI 就满足这一点。
- <strong>必须是 RV64I 版的 `fw_jump`。</strong>核心已经切到 RV64，再跳进 `--arch rv32` 编出的 32 位 `fw_jump.bin` 是无法运行的，这也是前面说组件不能混用的原因。

### 载入失败时

识别 Flash、读取区域或检查设备树任何一步失败，SyterKit 不会重启核心，而是打印 `SPI NOR boot failed; load images and run 'boot'`，进入串口上的命令行。此时可以把镜像用别的方式放进上表的 PSRAM 地址，再在命令行输入 `boot`，它会做第 4～8 步。命令行退出后同样会执行一次 `boot`。

## 构建 OpenSBI

把 `--arch` 换成 `rv64`，输出在 `opensbi/build/sun252i-f101-rv64/`：

```sh
cd opensbi
mkdir -p build
./build.sh --arch rv64 /opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-
cd ..
```

产物是 `opensbi/build/sun252i-f101-rv64/platform/generic/firmware/fw_jump.bin`，268,728 字节，预留区 512 KiB。`build.sh` 传给 OpenSBI 的三个参数分别是：

| 参数 | 值 |
| --- | --- |
| `PLATFORM_RISCV_XLEN` | `64` |
| `PLATFORM_RISCV_ABI` | `lp64` |
| `PLATFORM_RISCV_ISA` | `rv64imafdcv_zicsr_zifencei_xtheadcmo_xtheadsync` |

## 构建内核

换成 RV64 的 defconfig 和设备树，输出到 `out/kernel-rv64`：

```sh
cd linux-mainline
make O=../out/kernel-rv64 ARCH=riscv CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- sun252i_f101_rv64_yuzukineko_defconfig
scripts/kconfig/merge_config.sh -m -O ../out/kernel-rv64 ../out/kernel-rv64/.config ../buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/scripts/linux-nor.fragment
make O=../out/kernel-rv64 ARCH=riscv CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- olddefconfig
make -j8 O=../out/kernel-rv64 ARCH=riscv CROSS_COMPILE=/opt/xuantie/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- Image allwinner/sun252i-f101-yuzukineko-rv64i.dtb
cd ..
```

产物在 `out/kernel-rv64/arch/riscv/boot/`：

| 文件 | 大小（字节） | 预留区 |
| --- | ---: | --- |
| `Image` | 5,791,000 | 6 MiB |
| `dts/allwinner/sun252i-f101-yuzukineko-rv64i.dtb` | 10,472 | 256 KiB |

## 构建根文件系统

BusyBox 要重新编成 64 位。步骤和 RV32 页一样，把 `rv32` 换成 `rv64`，编译选项换成 `-march=rv64imafdc -mabi=lp64d`：

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

`file out/busybox-rv64/busybox` 应显示 64-bit、statically linked。

根文件系统里除了 `bin/busybox` 这个二进制，其余目录和配置文件与 RV32 完全一样，不用再做一遍。直接复制 RV32 的目录，只替换二进制，再打包：

```sh
cp -a out/rootfs-rv32 out/rootfs-rv64
cp out/busybox-rv64/busybox out/rootfs-rv64/bin/busybox
mksquashfs out/rootfs-rv64 out/rootfs-rv64.squashfs -comp xz -all-root -noappend -no-progress -p "dev/console c 600 0 0 5 1" -p "dev/null c 666 0 0 1 3"
ls -l out/rootfs-rv64.squashfs
```

这一步要求已经按 RV32 页做完根文件系统。不要对 RV64 重新执行 `make ... install`：它会把自定义的 `/sbin/init` 换回指向 BusyBox 的符号链接。

产物是 1,081,344 字节，预留区 8,585,216 字节。

## 打包与烧录

偏移和 RV32 完全一样，只是文件换成 RV64 的：

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

整片烧录和 RV32 页相同，把镜像文件名换成 `out/yuzukineko-manual-rv64.img`。分段烧录时，每个文件换成上面 `dd` 用的 RV64 文件，偏移不变。

板子上已经是 RV64I 镜像时，可以只替换某个组件；但要从 RV32 换成 RV64I，请整片烧录。

## 启动

烧录完成并复位后，用 115200 8N1 连接 UART1。串口参数、登录方式和首次启动的说明与 RV32 相同，见 [预编译镜像](linux-prebuilt.md#连接串口)。
