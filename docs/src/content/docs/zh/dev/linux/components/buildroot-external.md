---
title: "Buildroot 外部树"
---

`buildroot-external-yuzukihd` 是承载全部 YuzukiHD 板级支持的 Buildroot external tree：板级 defconfig、根文件系统 overlay、内核与 BusyBox fragment、post-image 组装脚本，以及 SyterKit 和玄铁工具链的 Buildroot 包。上游 Buildroot 保持不改。

本页介绍 BR2_EXTERNAL 机制、目录结构、六个 YuzukiNeko defconfig、NOR 镜像组装脚本、让只读 SquashFS 根可写的 overlay，以及这棵树如何构建 SyterKit 和 OpenSBI。端到端构建与烧录完整镜像见 [Linux + Buildroot](../linux-buildroot.md)。

:::note[版本范围]
external tree 位于提交 `1e250e5`（2026-09-22）。本仓库的 Buildroot 检出报告 `2026.08-1413-g302f5b6a2f`、`BR2_VERSION` 为 `2026.11-git`；文档引用的预编译镜像由 `2026.08-323-g45f1c387e0` 构建。Buildroot 的包基础设施在这些版本之间稳定，但具体选项集合和生成的镜像大小会不同。
:::

## BR2_EXTERNAL 是什么

Buildroot 是单一构建系统。`BR2_EXTERNAL` 是官方提供的、在不 fork Buildroot 树的前提下添加板级、包和配置的方式。作为 external tree 使用的目录必须包含 `external.desc`，通常还带下面另外两个文件：

| 文件 | 用途 |
| --- | --- |
| `external.desc` | `name:` 和 `desc:`；name 会变成 `BR2_EXTERNAL_<NAME>_PATH` 变量 |
| `external.mk` | 要包含的 Makefile 片段，通常是所有 `boot/*/*.mk` 和 `package/*/*.mk` |
| `Config.in` | 被 source 进 Buildroot 菜单的 Kconfig 条目 |

这棵树的 name 是 `YUZUKIHD`，所以每个 defconfig 都通过 `$(BR2_EXTERNAL_YUZUKIHD_PATH)` 引用路径：

```text
name: YUZUKIHD
desc: Custom packages and board configurations for YuzukiHD boards
```

`external.mk` 只是两条通配表达式：

```make
include $(sort \
	$(wildcard $(BR2_EXTERNAL_YUZUKIHD_PATH)/boot/*/*.mk) \
	$(wildcard $(BR2_EXTERNAL_YUZUKIHD_PATH)/package/*/*.mk))
```

因为通配只深入 `boot/` 和 `package/` 下一层，新组件必须放在 `boot/<name>/<name>.mk` 或 `package/<name>/<name>.mk`；更深的目录不会被拾取。根 `Config.in` 目前只 source 了 `boot/syterkit/Config.in`；工具链包是作为依赖拉进来的 host 包，没有菜单项。

## 目录结构

```text
buildroot-external-yuzukihd/
├── external.desc              树名和描述
├── external.mk                包含 boot/*/*.mk 和 package/*/*.mk
├── Config.in                  被 Buildroot source 的 Kconfig 条目
├── configs/                   六个 YuzukiNeko defconfig
├── board/yuzukihd/yuzukineko/
│   ├── readme.txt             板级说明、defconfig 矩阵、布局
│   ├── overlay/               合并进根文件系统
│   │   ├── sbin/init          NOR 镜像的 overlayfs pivot
│   │   └── etc/init.d/S40network
│   ├── scripts/
│   │   ├── post-image-nor.sh  组装 16 MiB NOR 镜像
│   │   ├── linux-nor.fragment 内核配置片段
│   │   └── busybox.fragment   BusyBox 配置片段
│   └── bin/                   空目录；预编译 bootloader 已移除
├── boot/syterkit/             bootloader 的 Buildroot 包
└── package/xuantie-riscv-toolchain/  预编译 ELF 工具链包
```

`board/yuzukihd/yuzukineko/bin/` 在当前树里是空的。更早的版本在这里保存预编译的 `spinor-boot_spi.bin`；提交 `1e250e5` 把它们删掉，改为让 Buildroot 从源码构建 SyterKit。

## 六个 defconfig

六个配置都针对同一颗 SoC，区别在架构、工具链和产物。

| Defconfig | 工具链 | 架构 | 根文件系统 | Bootloader |
| --- | --- | --- | --- | --- |
| `yuzukihd_yuzukineko_nor_defconfig` | Buildroot 内置 musl | RV32 | SquashFS（xz） | `spinor-boot_spi.bin` |
| `yuzukihd_yuzukineko_xuantie_nor_defconfig` | 玄铁 musl32 外部工具链 | RV32 | SquashFS（xz） | `spinor-boot_spi.bin` |
| `yuzukihd_yuzukineko_rv64i_nor_defconfig` | Buildroot 内置 musl | RV64I | SquashFS（xz） | `spinor-boot-rv64i_spi.bin` |
| `yuzukihd_yuzukineko_ramdisk_defconfig` | Buildroot 内置 musl | RV32 | CPIO initramfs | 无 |
| `yuzukihd_yuzukineko_xuantie_ramdisk_defconfig` | 玄铁 musl32 外部工具链 | RV32 | CPIO initramfs | 无 |
| `yuzukihd_yuzukineko_rv64i_ramdisk_defconfig` | Buildroot 内置 musl | RV64I | CPIO initramfs | 无 |

三个 NOR defconfig 共用同一个内核仓库和分支（`YuzukiHD/linux-mainline`、`sun252i_f101_7.2`）、同一个 `linux-nor.fragment`、同一个 `busybox.fragment`、同一个 overlay 和同一个 post-image 脚本。玄铁变体改了工具链部分（外部 musl32、它的头文件、C++ 和 OpenMP），并去掉 SyterKit 的玄铁工具链选择，让 SyterKit 复用根文件系统编译器。RV32 和 RV64I 变体之间，内核 defconfig、树内 DTS 名、传给 post-image 脚本的 `--arch` 参数和 SyterKit 镜像都会变化：

| Defconfig | 内核 defconfig | DTS | Post-image 架构 | SyterKit 镜像 |
| --- | --- | --- | --- | --- |
| `..._nor_defconfig` | `sun252i_f101_yuzukineko` | `sun252i-f101-yuzukineko` | `rv32` | `spinor-boot_spi.bin` |
| `..._xuantie_nor_defconfig` | `sun252i_f101_yuzukineko` | `sun252i-f101-yuzukineko` | `rv32` | `spinor-boot_spi.bin` |
| `..._rv64i_nor_defconfig` | `sun252i_f101_rv64_yuzukineko` | `sun252i-f101-yuzukineko-rv64i` | `rv64i` | `spinor-boot-rv64i_spi.bin` |

两个内置 musl 的 NOR defconfig 设置了 `BR2_TARGET_SYTERKIT_USE_XUANTIE_TOOLCHAIN=y`，因为 SyterKit 的 C907 专用编译选项需要玄铁 ELF/Newlib 工具链。玄铁 musl32 的 NOR defconfig 不设置它，而是复用根文件系统工具链，那本身也是玄铁工具链。RV64I NOR defconfig 用玄铁 ELF 工具链构建 RV32 SPL，再用 Buildroot 内置 musl 构建 Linux 用户空间。

RV64I NOR defconfig 还改了 OpenSBI 变量：增加 `PLATFORM_RISCV_XLEN=64`、`PLATFORM_RISCV_ABI=lp64` 和不带向量扩展的 ISA 字符串，而 RV32 defconfig 只传 `PLATFORM_DEFCONFIG`、`FW_JUMP_ADDR` 和 `FW_JUMP_FDT_ADDR`。

## 关键 defconfig 选项

NOR defconfig 很短，但每一行都有作用。下表列出决定构建内容和各部件来源的选项；除特别说明外，值取自 RV32 内置 musl 的情况。

| 选项 | 值 | 作用 |
| --- | --- | --- |
| `BR2_riscv` | `y` | RISC-V 目标 |
| `BR2_RISCV_32` | `y` | RV32；RV64I defconfig 改用 `BR2_riscv_custom=y` 和 `BR2_RISCV_ISA_RVA=y` |
| `BR2_RISCV_ISA_RVC` | `y` | 压缩指令，C907 支持 |
| `BR2_TOOLCHAIN_BUILDROOT_MUSL` | `y` | 内置 musl 工具链；玄铁 defconfig 改用 `BR2_TOOLCHAIN_EXTERNAL` |
| `BR2_TARGET_GENERIC_GETTY_PORT` | `"ttyS1"` | UART1 上的登录提示 |
| `BR2_TARGET_GENERIC_GETTY_BAUDRATE_115200` | `y` | 控制台波特率 |
| `BR2_ROOTFS_OVERLAY` | `.../overlay` | 把 `/sbin/init` 和 `S40network` 合并进 rootfs |
| `BR2_ROOTFS_POST_IMAGE_SCRIPT` | `.../post-image-nor.sh` | rootfs 构建后运行组装脚本 |
| `BR2_ROOTFS_POST_IMAGE_SCRIPT_ARGS` | `"--arch rv32"` | 选择 bootloader 与 DTB 组合 |
| `BR2_LINUX_KERNEL_CUSTOM_GIT` | `y` | 内核来自 git 分支，不是压缩包 |
| `BR2_LINUX_KERNEL_CUSTOM_REPO_VERSION` | `"sun252i_f101_7.2"` | 内核分支 |
| `BR2_LINUX_KERNEL_DEFCONFIG` | `sun252i_f101_yuzukineko` | 板级内核 defconfig |
| `BR2_LINUX_KERNEL_CONFIG_FRAGMENT_FILES` | `.../linux-nor.fragment` | 增加 MTD、SquashFS、JFFS2、overlayfs |
| `BR2_PACKAGE_BUSYBOX_CONFIG_FRAGMENT_FILES` | `.../busybox.fragment` | 增加 `pivot_root` |
| `BR2_PACKAGE_MTD` | `y` | 提供 `flash_erase` 和 MTD 工具 |
| `BR2_PACKAGE_MTD_MKFSJFFS2` | `y` | 构建 JFFS2 创建工具 |
| `BR2_TARGET_ROOTFS_SQUASHFS` | `y` | SquashFS 根文件系统 |
| `BR2_TARGET_ROOTFS_SQUASHFS4_XZ` | `y` | xz 压缩 |
| `BR2_TARGET_OPENSBI_CUSTOM_GIT` | `y` | OpenSBI 来自 `YuzukiHD/opensbi` |
| `BR2_TARGET_OPENSBI_PLAT` | `"generic"` | 通用平台 |
| `BR2_TARGET_OPENSBI_ADDITIONAL_VARIABLES` | `PLATFORM_DEFCONFIG=... FW_JUMP_ADDR=... FW_JUMP_FDT_ADDR=...` | 选择平台 defconfig 和跳转目标 |
| `BR2_TARGET_SYTERKIT_DEFCONFIG` | `yuzukineko_rv32_sram_defconfig` | SyterKit make 目标 |
| `BR2_TARGET_SYTERKIT_IMAGE` | `build/.../spinor-boot/spinor-boot_spi.bin` | 安装到 `images/` 的二进制 |

RV64I NOR defconfig 改了架构选项、内核 defconfig 和 DTS，以及 OpenSBI 变量，这就是同一个 post-image 脚本能组装两种不同镜像的原因。

## 构建

构建目录放在源码树外，`BR2_EXTERNAL` 必须是绝对路径，或相对于运行 `make` 的目录：

```sh
mkdir -p ~/f101-linux/build && cd ~/f101-linux
git clone https://github.com/buildroot/buildroot.git
git clone https://github.com/YuzukiHD/buildroot-external-yuzukihd.git
cd buildroot
make O=../build/br-rv32 BR2_EXTERNAL=../buildroot-external-yuzukihd yuzukihd_yuzukineko_nor_defconfig
make O=../build/br-rv32 BR2_EXTERNAL=../buildroot-external-yuzukihd -j8
```

RV64I 镜像用 `yuzukihd_yuzukineko_rv64i_nor_defconfig` 和独立的输出目录，方式相同。ramdisk 配置改为产出 `output/images/rootfs.cpio`，不运行 NOR 组装脚本。

```text
build/br-rv32/images/yuzukineko-nor.img
build/br-rv32/images/rootfs.squashfs
build/br-rv32/images/Image
build/br-rv32/images/sun252i-f101-yuzukineko.dtb
build/br-rv32/images/fw_jump.bin
build/br-rv32/images/spinor-boot_spi.bin
```

第一次构建要下载内核、OpenSBI、SyterKit 和 BusyBox，并编译 musl 工具链，所以耗时较长。后续构建复用输出目录。镜像大小和完整构建报告见 [Linux + Buildroot](../linux-buildroot.md)。

## 板级目录

### readme.txt

`board/yuzukihd/yuzukineko/readme.txt` 是板子的树内参考。它记录 ramdisk 和 NOR defconfig、defconfig/架构/bootloader/DTB 矩阵、内置 musl 配置使用玄铁 ELF 工具链而玄铁 musl32 配置复用根文件系统工具链这一事实、精确的 NOR 布局，以及控制台设置（UART1 / `ttyS1`，115200）。它早于 RV64I ramdisk 变体，只列了两个 ramdisk defconfig；树里有三个。它还记录了 `BR2_TARGET_SYTERKIT_DEFCONFIG` 和 `BR2_TARGET_SYTERKIT_IMAGE` 的约定：镜像路径的父目录名就是 SyterKit make 目标，basename 安装到 `images/` 下。

### post-image-nor.sh

脚本由 Buildroot 作为 post-image 脚本调用。它正好接受三个参数 `<images-dir> --arch <rv32|rv64i>`，并根据架构推出 bootloader 和 DTB 名。它检查五个输入是否存在，创建一个填满 `0xFF` 的 16 MiB 镜像，然后按固定偏移写入各组件。

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

`write_at` 用 `bs=1K` 和 `seek=offset/1024`，所以每个区域偏移必须是 1 KiB 的倍数。本布局的所有偏移都满足。

| 区域 | 偏移 | 预留 | 内容 |
| --- | --- | --- | --- |
| bootloader | `0x000000` | 64 KiB | `spinor-boot_spi.bin` 或 `spinor-boot-rv64i_spi.bin` |
| dtb | `0x010000` | 256 KiB | 对应架构的 DTB |
| fw_jump | `0x050000` | 512 KiB | OpenSBI `fw_jump.bin` |
| Image | `0x0d0000` | 6 MiB | Linux `Image` |
| rootfs | `0x6d0000` | 到 `0xf00000` | 实际大小的 `rootfs.squashfs` |
| overlay | `0xf00000` | 1 MiB | 保持擦除（`0xFF`），作为 JFFS2 upper |

脚本只对 rootfs 做区域检查：

```sh
if [ $((0x6d0000 + rootfs_size)) -gt "$ROOTFS_END" ]; then
	echo "post-image-nor.sh: rootfs ($rootfs_size B) overflows into overlay @ 0x$(printf '%x' "$OVERLAY_OFF")" >&2
	exit 1
fi
```

其他区域写入时没有边界检查：过大的组件会在下一个区域写入时被静默截断。写入后的报告会打印每个区域向上取整的 KiB 大小和上限，人能看出来，但镜像仍然会生成。预留大小本身没有被强制。

脚本不擦除物理 flash。它构建一个空隙和 overlay 区域都是 `0xFF` 的文件；把这个文件写到整片 NOR 就得到同样状态。如果只写部分 flash，overlay 分区仍应保持擦除状态（`0xFF`）；如果 JFFS2 挂载失败，第一次 `/sbin/init` 会擦除并格式化它。

最后一步打印 `REGION`、`OFFSET`、`SIZE`、`LIMIT`、`CONTENT` 表，随后是 `done` 和磁盘上的大小。这段输出在 [Linux + Buildroot](../linux-buildroot.md) 中有引用。

### 根文件系统 overlay

`overlay/` 由 `BR2_ROOTFS_OVERLAY` 合并进根文件系统。它包含三样东西：自定义 `/sbin/init`、`/etc/init.d/S40network` 占位脚本，以及两个由 `.gitkeep` 保留的空挂载目录（`/mnt/overlay`、`/mnt/root`）。

`/sbin/init` 是 PID 1。内核挂载只读 SquashFS 根并执行它。它随后：

1. 挂载 `proc`、`sysfs` 和 `devtmpfs`。
2. 解析 `/proc/mtd`，找到名为 `overlay` 的 MTD 分区。
3. 把 JFFS2 挂到 `mtd:overlay`。挂载失败时用 `flash_erase` 擦除分区再挂一次。
4. 在 `/mnt/overlay` 下创建 `upper` 和 `work`。
5. 以 SquashFS 根为 `lowerdir`、JFFS2 分区为 `upperdir`/`workdir` 挂载 overlayfs。
6. `pivot_root()` 到 overlay 上，重新挂载伪文件系统。
7. 执行 `/bin/busybox init`。

关键几行：

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

每条失败路径都被 trap 住，回退到只读根并执行 `/bin/busybox init`，所以 overlay 坏掉时板子仍然可调试，而不是 panic。分区按名字查找，不按编号：`mtd:overlay` 通过 MTD alias 解析，`sed` 表达式只是为了打印擦除步骤要用的设备号。

`/etc/init.d/S40network` 故意是空操作：

```sh
#!/bin/sh
# No network on YuzukiNeko (kernel has no CONFIG_NET); keep boot quiet.
exit 0
```

没有它，BusyBox 的网络初始化脚本会去配置内核根本没有的接口，每次启动都打印 `ENOSYS` 噪音。

### 内核与 BusyBox 片段

`linux-nor.fragment` 合并进板级内核 defconfig。它只打开 NOR 启动需要的东西：

```text
CONFIG_MTD=y
CONFIG_MTD_BLOCK=y
CONFIG_MTD_OF_PARTS=y
CONFIG_MTD_SPI_NOR=y
CONFIG_SQUASHFS=y
CONFIG_JFFS2_FS=y
CONFIG_OVERLAY_FS=y
```

`CONFIG_MTD_OF_PARTS` 从设备树读取 fixed-partitions 表，`/dev/mtdblock4` 因此成为 rootfs、`/dev/mtd5` 成为 overlay。`CONFIG_MTD_SPI_NOR` 是 flash 本身需要的，`CONFIG_SQUASHFS` 用于只读根，`CONFIG_JFFS2_FS` 用于 upper，`CONFIG_OVERLAY_FS` 用于联合挂载。

`busybox.fragment` 增加一个选项：

```text
CONFIG_PIVOT_ROOT=y
```

`/sbin/init` 需要 `pivot_root` applet。没有它，overlay 能挂上，但根切不过去。

## 分区与持久化

内核设备树把同样的布局定义成固定 MTD 分区，overlay 因此能按名字找到自己的 upper：

| MTD | 标签 | 偏移 | 大小 | 挂载点 |
| ---: | --- | --- | --- | --- |
| 0 | `bootloader` | `0x000000` | 64 KiB | 不挂载 |
| 1 | `dtb` | `0x010000` | 256 KiB | 不挂载 |
| 2 | `opensbi` | `0x050000` | 512 KiB | 不挂载 |
| 3 | `kernel` | `0x0d0000` | 6 MiB | 不挂载 |
| 4 | `rootfs` | `0x6d0000` | 8.2 MiB | `/dev/mtdblock4`，SquashFS，只读 |
| 5 | `overlay` | `0xf00000` | 1 MiB | `/mnt/overlay`，JFFS2，读写 |

分区 0 到 4 在设备树里标记为 `read-only`。分区 5 是 NOR 启动板子上唯一的可写持久存储。写整片镜像会替换它，所以刷完整的 `yuzukineko-nor.img` 会丢弃设备上已经持久化的修改。

overlay 不是根文件系统的副本。SquashFS 始终是 lower 层，永不被修改；启动后创建或修改的每个文件都落在 JFFS2 的 `upper` 目录里，overlayfs 的 `work` 目录保存 copy-up 状态。删除 lower 层里记录的文件会在 upper 里生成 whiteout，而不是删除 SquashFS 里的内容。

## 固定组件版本

external tree 对有的组件按提交固定，对有的按分支获取。这个区别在重建产生不同二进制时很重要。

| 组件 | 固定方式 | 可复现 |
| --- | --- | --- |
| Buildroot | 检出 `2026.08-1413-g302f5b6a2f`；external tree 不固定 Buildroot | 只有用同一检出时 |
| External tree | 提交 `1e250e5` | 是 |
| SyterKit | 提交 `f95d29d611ce439a2510957b0f312b5b439f53b8` | 是 |
| OpenSBI | 分支 `sun252i-f101` | 否；分支会移动 |
| Linux | 分支 `sun252i_f101_7.2` | 否；分支会移动 |
| 玄铁 ELF 工具链 | `V3.2.0-20250627`，SHA-256 固定 | 是 |
| 玄铁 musl32 工具链 | `V3.2.0-20250627`，URL 写在 defconfig 里 | 只有镜像站保留压缩包时 |

SyterKit 是唯一按提交固定的固件组件。OpenSBI 和 Linux 按分支名获取，所以不同时间构建会得到不同的 `fw_jump.bin` 和 `Image`。文档里的哈希描述的是某一次构建，不是保证。

## SyterKit 启动集成

`boot/syterkit/` 是一个带 Kconfig 菜单的普通 Buildroot 包。它有三个用户可见的选择和两个路径：

| 选项 | 含义 |
| --- | --- |
| `BR2_TARGET_SYTERKIT` | 打开包；依赖 ARM 或 RISC-V |
| `BR2_TARGET_SYTERKIT_USE_TARGET_TOOLCHAIN` | 用根文件系统交叉编译器构建；编译器必须支持 SyterKit defconfig 选中的 CPU |
| `BR2_TARGET_SYTERKIT_USE_XUANTIE_TOOLCHAIN` | 用下载的玄铁 ELF/Newlib 工具链构建；仅限 x86_64 主机和 RISC-V 目标 |
| `BR2_TARGET_SYTERKIT_DEFCONFIG` | make 目标，例如 `yuzukineko_rv32_sram_defconfig` |
| `BR2_TARGET_SYTERKIT_IMAGE` | 相对于 SyterKit `O=` 目录的二进制路径；父目录名就是 make 目标 |

包把 SyterKit 固定到提交，而不是分支：

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

如果选中玄铁选项，包会加上 `host-xuantie-riscv-toolchain`，并把 `SYTERKIT_CROSS_COMPILE` 设为该工具链的 `bin/riscv64-unknown-elf-`；否则使用 `TARGET_CROSS`。

configure 步骤先跑 SyterKit defconfig，然后在生成的 `.config` 里关掉 `CONFIG_RUST_FFI`，再跑 `olddefconfig`。bootloader 不需要 Rust applet 和 FFI 层，关掉它们让 Buildroot 构建不必引入 Rust 工具链。

build 步骤把 `BR2_TARGET_SYTERKIT_IMAGE` 的父目录作为 make 目标。这就是为什么变量必须指向具体二进制，例如 `build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin`：父目录 `spinor-boot` 就是目标名。install 步骤把二进制以原 basename 复制到 `$(BINARIES_DIR)`，`post-image-nor.sh` 在那里找它。

## 玄铁工具链包

`package/xuantie-riscv-toolchain/` 下载预编译的玄铁-900 GCC 14 ELF/Newlib 工具链并安装到 host 目录。它是 `host-generic-package`，所以不出现在菜单里；`boot/syterkit` 把它作为依赖拉进来。

| 变量 | 值 |
| --- | --- |
| 版本 | `V3.2.0-20250627` |
| 来源 | Allwinner OSS 镜像的 `Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz` |
| 安装目录 | `$(HOST_DIR)/opt/xuantie-riscv-toolchain` |
| 许可 | 未知；压缩包里没有许可声明 |

install 步骤从解压目录复制 `bin`、`include`、`lib`、`lib64`、`libexec`、`riscv64-unknown-elf` 和 `share`。hash 文件把压缩包的 SHA-256 固定为 SyterKit CI 配置使用的值，所以下载内容变化会让构建失败，而不是悄悄换掉编译器。

同一条工具链在仓库根目录也单独提供为 `Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0`，手动构建 SyterKit 用的就是它。Buildroot 包和手动工具链必须是同一版本；混用会为 C907 选项生成不同的代码。

## 添加板子

新板子沿用 YuzukiNeko 的形状：

1. 创建 `configs/<vendor>_<board>_<variant>_defconfig`，写入架构、工具链、内核、根文件系统和 post-image 设置。
2. 创建 `board/<vendor>/<board>/`，包含 `readme.txt`、`overlay/` 树，以及放 post-image 脚本和配置片段的 `scripts/` 目录。
3. 用 `$(BR2_EXTERNAL_YUZUKIHD_PATH)` 把 `BR2_ROOTFS_OVERLAY`、`BR2_ROOTFS_POST_IMAGE_SCRIPT`、`BR2_ROOTFS_POST_IMAGE_SCRIPT_ARGS`、`BR2_LINUX_KERNEL_CONFIG_FRAGMENT_FILES` 和 `BR2_PACKAGE_BUSYBOX_CONFIG_FRAGMENT_FILES` 指向这些文件。
4. 如果板子需要 bootloader，要么在 `boot/` 下加包，要么复用 `BR2_TARGET_SYTERKIT` 并给板级 defconfig 和镜像路径。
5. 把新 defconfig 加到顶层 `README.md` 和板级 `readme.txt` 的表里。

板子不需要改 `external.mk`，因为板级文件是按路径引用的。`boot/<name>/<name>.mk` 下的新 bootloader 包会被现有通配拾取。

## 添加包

target 包放在 `package/<name>/`，包含 `<name>.mk`，如果需要在菜单里出现再加 `Config.in`：

```make
HELLO_VERSION = 1.0
HELLO_SITE = https://example.com/hello
HELLO_LICENSE = MIT
HELLO_LICENSE_FILES = LICENSE

$(eval $(generic-package))
```

然后从树的根 `Config.in` source 该 `Config.in`，并在 defconfig 里选中选项。`external.mk` 的通配会自动包含 `package/*/*.mk`，所以 `.mk` 文件本身不需要注册。仅 host 的包用 `$(eval $(host-generic-package))`，通过依赖拉进来，就像玄铁工具链那样；它不需要 `Config.in` 条目。

## 排错

| 现象 | 可能原因 | 检查什么 |
| --- | --- | --- |
| `post-image-nor.sh: missing input` | 五个组件之一没有构建或没有复制到 `images/` | 在 Buildroot 日志里查 `fw_jump`、`Image`、DTB、rootfs 和 SyterKit 镜像 |
| `post-image-nor.sh: unsupported architecture` | `BR2_ROOTFS_POST_IMAGE_SCRIPT_ARGS` 与 defconfig 不匹配 | 必须是 `--arch rv32` 或 `--arch rv64i`，并且对应的 DTB 和 bootloader 存在 |
| `rootfs ... overflows into overlay` | SquashFS 超过 `0x6d0000..0xf00000` 区域 | 减小 rootfs 或移动 overlay；脚本会拒绝生成镜像 |
| 组件超出自己的区域并被静默截断 | 脚本只对 rootfs 做边界检查 | 烧录前把报告里的大小与上限比较 |
| SyterKit 构建报未知的 `rv32...` 选项 | 根文件系统工具链不支持 C907 ISA | 选中 `BR2_TARGET_SYTERKIT_USE_XUANTIE_TOOLCHAIN`，或使用玄铁 musl32 defconfig |
| RV32 镜像里的 `fw_jump.elf` 是 64 位 | OpenSBI 从 64 位编译器三元组猜出了 XLEN | 检查工具链；如果必须用 64 位编译器，在 `BR2_TARGET_OPENSBI_ADDITIONAL_VARIABLES` 里加 `PLATFORM_RISCV_XLEN=32` |
| 玄铁工具链下载失败 | 镜像 URL 或 hash 变了 | 检查 `xuantie-riscv-toolchain.mk` 和 `.hash`；压缩包很大，镜像站可能很慢 |
| 板子能启动但根是只读的 | `pivot_root` 失败，或 overlay 分区不存在 | 找 `init: overlay setup failed`；检查 `/proc/mtd` 里的 `overlay` 标签 |
| 重启后 overlay 不持久 | 首次挂载 JFFS2 前 overlay 分区没有擦除，或整片镜像覆盖了它 | 擦除 `0xf00000..0x1000000`，或让 `/sbin/init` 在首次启动时擦除 |
| `S40network` 打印 `ENOSYS` | 内核没有 `CONFIG_NET`，但 BusyBox 试图配置网络 | 保留占位的 `S40network`，或在内核里打开网络 |
