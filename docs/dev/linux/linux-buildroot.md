# Linux + Buildroot

这一页用 YuzukiNeko 的 Buildroot 外部树构建 <strong>F101-S3</strong> 的 SPI NOR 启动镜像，一条 `make` 出完整的 16 MiB 镜像。启动链为：

```
BROM → SyterKit → OpenSBI → Linux → BusyBox
```

按 CPU 模式有两个 defconfig：<strong>RV32</strong> 和 <strong>RV64I</strong>。根文件系统是 SquashFS，上面叠一层可写的 JFFS2 overlay。构建好的镜像怎么烧录、串口怎么接、怎么替换单个组件，见 [预编译镜像](linux-prebuilt.md)；逐步手动构建见 [手动构建](linux-manual.md)。

## 从源码构建

两个镜像都由 [`YuzukiHD/buildroot-external-yuzukihd`](https://github.com/YuzukiHD/buildroot-external-yuzukihd) 这个外部树产出。Buildroot 本体直接用官方主线的 [`buildroot/buildroot`](https://github.com/buildroot/buildroot) 仓库；板级 defconfig、SyterKit 构建规则和后处理脚本都在外部树里。

| defconfig | 架构 | 引导加载器 |
| --- | --- | --- |
| `yuzukihd_yuzukineko_nor_defconfig` | RV32 (C907 / ilp32) | `spinor-boot_spi.bin` |
| `yuzukihd_yuzukineko_rv64i_nor_defconfig` | RV64I (lp64) | `spinor-boot-rv64i_spi.bin` |

每个 defconfig 都会选取 SyterKit（[`YuzukiHD/SyterKit`](https://github.com/YuzukiHD/SyterKit)）、OpenSBI `fw_jump`（[`YuzukiHD/opensbi`](https://github.com/YuzukiHD/opensbi)，分支 `sun252i-f101`）、Linux `Image` 与设备树（[`YuzukiHD/linux-mainline`](https://github.com/YuzukiHD/linux-mainline)，分支 `sun252i_f101_7.2`），以及 SquashFS（xz）根文件系统。随后后处理脚本拼出 16 MiB 的 `images/yuzukineko-nor.img`。

在源码树外构建，输出放到 `build/`。先把两个仓库克隆到工作目录：

```sh
mkdir -p ~/f101-linux/build && cd ~/f101-linux
git clone https://github.com/buildroot/buildroot.git
git clone https://github.com/YuzukiHD/buildroot-external-yuzukihd.git
```

RV32：

```sh
cd buildroot
make O=../build/br-rv32 BR2_EXTERNAL=../buildroot-external-yuzukihd yuzukihd_yuzukineko_nor_defconfig
make O=../build/br-rv32 BR2_EXTERNAL=../buildroot-external-yuzukihd -j8
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-buildroot/rv32.cast" data-speed="6"></div>

构建结束时的输出（`LIMIT` 一列是各区域的预留大小）：

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

RV64I：

```sh
make O=../build/br-rv64i BR2_EXTERNAL=../buildroot-external-yuzukihd yuzukihd_yuzukineko_rv64i_nor_defconfig
make O=../build/br-rv64i BR2_EXTERNAL=../buildroot-external-yuzukihd -j8
```

<div class="asciinema-cast" data-src="assets/casts/linux/linux-buildroot/rv64i.cast" data-speed="6"></div>

构建结束时的输出：

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

首次构建要下载各组件的源码，并编译 Buildroot 自带的 musl 工具链，耗时较长。完成后镜像在 `build/br-rv32/images/yuzukineko-nor.img` 和 `build/br-rv64i/images/yuzukineko-nor.img`，都是 16,777,216 字节。同目录里还有各组件，可以直接用来[单独替换](linux-prebuilt.md#单独替换某个组件)：

| 文件 | RV32 大小（字节） | RV64I 大小（字节） |
| --- | ---: | ---: |
| `spinor-boot_spi.bin` / `spinor-boot-rv64i_spi.bin` | 49,152 | 49,152 |
| `sun252i-f101-yuzukineko.dtb` / `…-rv64i.dtb` | 10,284 | 10,284 |
| `fw_jump.bin` | 266,352 | 268,744 |
| `Image` | 5,243,808 | 5,881,208 |
| `rootfs.squashfs` | 1,282,048 | 1,253,376 |

上表来自 Buildroot `2026.08-323-g45f1c387e0`（外部树 `1e250e5`）的一次构建。烧录方法见 [预编译镜像](linux-prebuilt.md#刷入完整镜像)。

两个 defconfig 都用 x86_64 的 Xuantie-900 ELF/Newlib V3.2.0 工具链构建 SyterKit，因为 SyterKit 的 C907 专用编译选项需要它；根文件系统则用 Buildroot 自带的 musl 工具链。`*_xuantie_nor_defconfig` 变体的根文件系统也改用 Xuantie musl32 工具链。

本仓库里的镜像由 `manifest.json` 中记录的 Buildroot 版本构建。外部树和内核、OpenSBI 的分支都在持续变动，重新构建不太可能得到完全相同的文件。
