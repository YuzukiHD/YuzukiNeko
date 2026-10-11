# 手动构建 Linux 镜像

这一页从源码一步步构建 YuzukiNeko <strong>F101-S3</strong> 的 SPI NOR 启动镜像（<strong>RV32</strong>）：SyterKit、OpenSBI、Linux 内核、BusyBox 根文件系统，然后按 Flash 布局拼成 16 MiB 的 `.img`，用 xfel 分段或整片烧录。64 位（RV64I）的改法见 [手动构建 RV64I 镜像](linux-manual-rv64.md)；想一条命令出镜像，请看 [Linux + Buildroot](linux-buildroot.md)。

启动链和 Buildroot 版一致：

```
BROM → SyterKit → OpenSBI → Linux → BusyBox
```

## 准备

主机需要 `gcc`、`make`、`bison`、`flex`、`bc`、`git`、`squashfs-tools`，以及内核和 SyterKit 常见的其他主机构建依赖。

下面所有命令都在同一个工作目录 `~/f101-linux` 里执行，需要进入源码目录的地方会写出 `cd`，用完后回到工作目录：

```sh
mkdir -p ~/f101-linux/build && cd ~/f101-linux
```

### 工具链

需要两个玄铁（Xuantie）工具链：

| 工具链 | 用途 | 前缀 |
| --- | --- | --- |
| `Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0` | SyterKit | `riscv64-unknown-elf-` |
| `Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0` | OpenSBI、内核、BusyBox | `riscv64-unknown-linux-gnu-` |

两个工具链都从平头哥 OCC 下载，版本都是 `V3.2.0-20250627`：elf-newlib 约 235 MB，glibc 约 510 MB。

```sh
curl -fLO 'https://occ-oss-prod.oss-cn-hangzhou.aliyuncs.com/resource//1751370399722/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz'
curl -fLO 'https://occ-oss-prod.oss-cn-hangzhou.aliyuncs.com/resource//1755679709552/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0-20250627.tar.gz'
sha256sum Xuantie-900-gcc-*.tar.gz
```

两个压缩包的 SHA-256 应为：

```text
80c174c6445f7565bc082d328045021862a63beddfad8c393c534e2d9523dc3b  Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
a5a6a5e517a738baffed091efce984ffa215f78bb11e296d6175bf5896778fdd  Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0-20250627.tar.gz
```

校验通过后解压到工作目录下的 `toolchain/`，不需要 root 权限，后面的命令直接引用这个路径（`$HOME` 是你的主目录）：

```sh
mkdir -p toolchain
tar -xzf Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz -C toolchain
tar -xzf Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0-20250627.tar.gz -C toolchain
```

### 源码

```sh
git clone https://github.com/YuzukiHD/SyterKit.git
git clone -b sun252i-f101 https://github.com/YuzukiHD/opensbi.git
git clone -b sun252i_f101_7.2 https://github.com/YuzukiHD/linux-mainline.git
git clone https://github.com/YuzukiHD/buildroot-external-yuzukihd.git
curl -fLO https://busybox.net/downloads/busybox-1.38.0.tar.bz2
tar -xjf busybox-1.38.0.tar.bz2
```

BusyBox 从 [busybox.net](https://busybox.net/downloads/) 下载，解压后是 `busybox-1.38.0/`。`buildroot-external-yuzukihd` 只用来取内核配置片段和根文件系统里的几个文件，不会构建 Buildroot。

本页构建时的版本：SyterKit `main`（`6ef3f27ab`）、OpenSBI `08cbbe0b`、Linux `95cd7466c`、BusyBox 1.38.0。

## 构建 SyterKit

SyterKit 是 BROM 之后的第一级引导加载器，同时负责从 SPI NOR 读出设备树、OpenSBI 和内核。它用 elf-newlib 工具链，输出放在工作目录的 `build/` 里：

```sh
cd SyterKit
make O=../build/syterkit CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf- yuzukineko_rv32_sram_defconfig
make -j8 O=../build/syterkit CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf- spinor-boot
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual/syterkit.cast" data-speed="0.35"></div>

产物是 `build/syterkit/build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin`，49,152 字节，预留区是 64 KiB（65,536 字节），放得下。

## 构建 OpenSBI

OpenSBI 仓库自带 `build.sh`，已经写好 F101 的各项参数（`sun252i-f101.defconfig`、`FW_JUMP`、`FW_TEXT_START=0x40f80000`、`FW_JUMP_ADDR=0x40000000`）。`--arch rv32` 选择 32 位，输出在仓库里的 `build/` 下：

```sh
cd opensbi
mkdir -p build
./build.sh --arch rv32 $HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual/opensbi.cast" data-speed="0.45"></div>

`mkdir -p build` 不能省，`build.sh` 的默认输出目录要求上一级目录已经存在。

产物是 `opensbi/build/sun252i-f101/platform/generic/firmware/fw_jump.bin`，266,344 字节，预留区 512 KiB（524,288 字节）。用 `file` 查看同目录的 `fw_jump.elf`，应是 32-bit。

!> 不要直接 `make PLATFORM=generic ...` 而漏掉 `build.sh` 里传的 `PLATFORM_RISCV_XLEN` 等参数，否则工具链默认会编出 64 位的 `fw_jump.elf`，即使名字叫 RV32。

## 构建内核

内核用 RV32 的 defconfig，再合并外部树里的 `linux-nor.fragment`。这个片段打开 MTD、OverlayFS 和 JFFS2，是 SquashFS 根文件系统叠 JFFS2 overlay 所需要的。

```sh
cd linux-mainline
make O=../build/kernel-rv32 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- sun252i_f101_yuzukineko_defconfig
scripts/kconfig/merge_config.sh -m -O ../build/kernel-rv32 ../build/kernel-rv32/.config ../buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/scripts/linux-nor.fragment
make O=../build/kernel-rv32 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- olddefconfig
make -j8 O=../build/kernel-rv32 ARCH=riscv CROSS_COMPILE=$HOME/f101-linux/toolchain/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu- Image allwinner/sun252i-f101-yuzukineko.dtb
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual/kernel.cast" data-speed="3"></div>

产物在 `build/kernel-rv32/arch/riscv/boot/`：

| 文件 | 大小（字节） | 预留区 |
| --- | ---: | --- |
| `Image` | 5,178,200 | 6 MiB |
| `dts/allwinner/sun252i-f101-yuzukineko.dtb` | 10,472 | 256 KiB |

RV32 内核由内核配置里的 32 位选项决定，不需要换工具链，仍然用 `riscv64-unknown-linux-gnu-` 前缀。

## 构建根文件系统

这里不用 Buildroot，直接编译 BusyBox，补上必要的目录和文件，打成 SquashFS。BusyBox 静态链接，根文件系统里不需要 C 库。

### BusyBox

在默认配置上改四处：静态链接、启用 `flash_eraseall`、指定架构的编译和链接选项。`pivot_root` 默认已经开启，`/sbin/init` 要用它切到 overlay 根。

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

`file build/busybox-rv32/busybox` 应显示 32-bit、statically linked。最后一条 `install` 的 `CONFIG_PREFIX` 是相对输出目录的，所以写 `../rootfs-rv32`，装到 `build/rootfs-rv32/`。

### 目录与配置文件

下面补 `build/rootfs-rv32/` 里缺的内容。`/sbin/init` 和 `S40network` 取自外部树的 overlay 目录。`install` 之后 `/sbin/init` 是指向 BusyBox 的符号链接，必须先删掉再复制，否则复制会覆盖 BusyBox 本体。

```sh
mkdir -p build/rootfs-rv32/{proc,sys,dev,tmp,run,root,etc/init.d,mnt/root,mnt/overlay,var/log}
rm build/rootfs-rv32/sbin/init
cp buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/overlay/sbin/init build/rootfs-rv32/sbin/init
cp buildroot-external-yuzukihd/board/yuzukihd/yuzukineko/overlay/etc/init.d/S40network build/rootfs-rv32/etc/init.d/
```

BusyBox 带的是 `flash_eraseall`，补一个 `flash_erase` 的简化替身：

```sh
printf '#!/bin/sh\nexec /usr/sbin/flash_eraseall "$1"\n' > build/rootfs-rv32/usr/sbin/flash_erase
```

创建 `build/rootfs-rv32/etc/inittab`：

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

创建 `build/rootfs-rv32/etc/init.d/rcS`：

```sh
cat > build/rootfs-rv32/etc/init.d/rcS <<'EOF'
#!/bin/sh
for s in /etc/init.d/S[0-9][0-9]*; do [ -x "$s" ] && "$s" start; done
EOF
```

其余几个小文件，以及可执行权限：

```sh
echo 'root::0:0:root:/root:/bin/sh' > build/rootfs-rv32/etc/passwd
echo 'root:x:0:' > build/rootfs-rv32/etc/group
echo yuzukineko > build/rootfs-rv32/etc/hostname
echo /dev/ttyS1 > build/rootfs-rv32/etc/securetty
chmod 755 build/rootfs-rv32/usr/sbin/flash_erase build/rootfs-rv32/etc/init.d/rcS build/rootfs-rv32/etc/init.d/S40network
```

`root` 的密码为空，和 Buildroot 版一样。控制台是 UART1（`ttyS1`），`getty` 用 115200 波特。

### 打包 SquashFS

用 xz 压缩。设备节点 `/dev/console`、`/dev/null` 用 `-p` 直接写进镜像，不需要 root 权限：

```sh
mksquashfs build/rootfs-rv32 build/rootfs-rv32.squashfs -comp xz -all-root -noappend -no-progress -p "dev/console c 600 0 0 5 1" -p "dev/null c 666 0 0 1 3"
ls -l build/rootfs-rv32.squashfs
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-manual/squashfs.cast"></div>

产物是 1,089,536 字节，预留区是 `0x6d0000` 到 `0xf00000`（8,585,216 字节）。

## Flash 布局

各组件在 SPI NOR 上的位置是固定的，和 Buildroot 版镜像相同：

| 组件 | NOR 偏移 | 预留大小 | RAM 载入地址 |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000`（BROM 载入 SRAM） |
| 设备树 | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux Image | `0x0d0000` | 6 MiB | `0x40000000` |
| SquashFS 根文件系统 | `0x6d0000` | 到 `0xf00000`（约 8.2 MiB） | 从 MTD 挂载 |
| JFFS2 overlay | `0xf00000` | 1 MiB，保持擦除态 | 从 MTD 挂载 |

!> SyterKit 每次启动都按固定长度读取：256 KiB 设备树、512 KiB `fw_jump`、6 MiB 内核。组件必须放得进各自的预留区，不能挪到别的偏移。

## 分段烧录

先按 [FEL 下载模式与工具](../../boot/fel.md) 装好 xfel，让板子进入 FEL，并按 [SPI NOR 布局与备份](../../boot/flash-layout.md) 备份整片 Flash。分段烧录只改动对应区域，不动 overlay 分区：

```sh
xfel version
xfel spinor
xfel spinor write 0x0 build/syterkit/build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin
xfel spinor write 0x10000 build/kernel-rv32/arch/riscv/boot/dts/allwinner/sun252i-f101-yuzukineko.dtb
xfel spinor write 0x50000 opensbi/build/sun252i-f101/platform/generic/firmware/fw_jump.bin
xfel spinor write 0xd0000 build/kernel-rv32/arch/riscv/boot/Image
xfel spinor write 0x6d0000 build/rootfs-rv32.squashfs
```

写完后按文件大小回读并比对，例如内核（`5178200` 是 `Image` 的字节数，换了内核请按 `ls -l` 的实际大小改）：

```sh
xfel spinor read 0xd0000 5178200 Image-readback.bin
cmp Image-readback.bin build/kernel-rv32/arch/riscv/boot/Image
```

最后复位：

```sh
xfel reset
```

## 打包成完整镜像

分段烧录适合调试。要得到一个能一次写入的 16 MiB 文件，先确认每个组件都没有超过上面的预留区（用 `ls -l` 看大小），再在全 `0xFF` 的底子上按偏移写入：

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

文件应正好是 16,777,216 字节，`0xf00000` 之后全是 `0xFF`，也就是空的 overlay 分区。

## 整片烧录

整片写入会<strong>覆盖整片 Flash</strong>，包括 overlay 分区里板子上的改动，先备份。

```sh
xfel version
xfel spinor
xfel spinor write 0x0 build/yuzukineko-manual-rv32.img
xfel spinor read 0x0 0x1000000 readback.img
sha256sum build/yuzukineko-manual-rv32.img readback.img
```

两个 SHA-256 一致后再复位：

```sh
xfel reset
```

启动后的串口参数、登录方式和首次启动要格式化 overlay 的说明，见 [预编译镜像](linux-prebuilt.md#连接串口)。
