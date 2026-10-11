---
title: "从源码构建 RustSBI 与 Asterinas"
---

本文从获取源码开始，为 YuzukiNeko F101-S3 的 **16 MiB PSRAM + 16 MiB SPI NOR** 配置构建 SyterKit、RustSBI、Asterinas 和 BusyBox initramfs，最后生成可以直接刷写的 NOR 镜像。只想体验系统时，请使用[预编译镜像教程](rustsbi-asterinas.md)。

启动链为：

```text
BROM → SyterKit → RustSBI → Asterinas → BusyBox shell
```

本教程使用 [RustSBI 维护的 Asterinas 仓库](https://github.com/rustsbi/asterinas)中的 Neko RV32 源码分支，直接获取内核、Buildroot 外部树和打包工具。请使用下列版本及板级配置。构建得到的是运行在 RAM 中的 initramfs 系统；文件修改不会跨重启保留。

:::note
SyterKit 的 PSRAM 初始化仍链接其仓库附带的预编译 `libpsram.a`，默认还使用仓库附带的 `dt2c` 主机工具。这里重建启动加载器、SBI 固件、内核和用户态，不表示这些外部依赖也全部从源码重建。
:::

## 1. 准备 Linux 构建主机

使用 **x86_64 Linux** 主机，以下依赖命令以 Ubuntu 24.04 为例。普通用户执行构建，只有安装系统软件包时使用 `sudo`。刷机可以在另一台 Windows、Linux 或 macOS 主机上进行。

```sh
sudo apt update
sudo apt install -y build-essential git curl wget ca-certificates \
    python3 device-tree-compiler gcc-riscv64-linux-gnu binutils-riscv64-linux-gnu \
    cpio unzip rsync bc bzip2 xz-utils patch file perl gawk \
    pkg-config cmake clang libclang-dev libssl-dev libncurses-dev flex bison
```

下面的命令按顺序在同一个 Bash 终端中执行。请在 Linux 文件系统中直接克隆和构建，保留 LF 换行及文件权限，不要复制经过 Windows 自动换行转换的源码树。工作目录避免包含空格，预留源码、工具链下载和构建产物的空间：

```sh
mkdir -p ~/f101-asterinas
cd ~/f101-asterinas
export NEKO_WORK="$PWD"
mkdir -p "$NEKO_WORK/toolchain" "$NEKO_WORK/build" "$NEKO_WORK/tools"
export PATH="$NEKO_WORK/tools/bin:$PATH"
```

### 工具链与版本

| 组件 | 本教程使用的版本或配置 |
| --- | --- |
| SyterKit | `3bf4f61fc7a1a40137a49482e1a225fef0b97a42` + Asterinas 交接补丁 |
| RustSBI | `4068e0d062493d2af3aeed7eb20bf84acd4b2c0f` + 去色补丁、自定义 RV32 标量 target、WARN 配置 |
| Asterinas | `rustsbi/asterinas` 的 `feat/neko-rv32` 分支，固定提交 `a38ffafb1b138bdd6b3095665acc0465e2f750da` |
| Rust：SyterKit / RustSBI | `nightly-2026-05-11` |
| Rust：Asterinas / OSDK | `nightly-2026-07-21` |
| SyterKit C 工具链 | Xuantie-900 ELF/Newlib V3.2.0，`riscv64-unknown-elf-` |
| Asterinas RV32 vDSO 汇编 | Ubuntu 的 `riscv64-linux-gnu-gcc`，脚本指定 RV32 ABI |
| BusyBox 用户态 | Buildroot `2025.02.6`，BusyBox `1.37.0`，Bootlin `riscv32-ilp32d--musl--stable-2024.05-1` |

RustSBI 使用 ILP32 软浮点 ABI，BusyBox 使用 RV32GC / ILP32D；它们分别用于固件和用户态，不能混用构建配置。Buildroot 会获取用户态所需的工具链，不需要用 Xuantie 的 Linux/glibc 工具链代替。

### 安装 Rust

尚未安装 rustup 时，先按 [Rust 官方安装说明](https://www.rust-lang.org/tools/install)安装，并确保 `rustup`、`cargo` 在 `PATH` 中。安装两套固定工具链，以及 SyterKit 使用的 RV32 标准库：

```sh
rustup toolchain install nightly-2026-05-11 --profile minimal \
    --component rust-src --component llvm-tools-preview
rustup target add --toolchain nightly-2026-05-11 riscv32imac-unknown-none-elf
rustup toolchain install nightly-2026-07-21 --profile minimal \
    --component rust-src --component rustc-dev --component llvm-tools-preview
```

RustSBI 的构建命令需要 `rust-objcopy`。将它安装到本工作目录，不覆盖其他项目使用的工具：

```sh
cargo +nightly-2026-05-11 install cargo-binutils --version 0.4.0 \
    --locked --root "$NEKO_WORK/tools"
```

### 安装 Xuantie ELF/Newlib 工具链

SyterKit 使用 C907 专用编译选项，需要以下 x86_64 工具链。下载地址与校验值来自 [YuzukiHD Buildroot 外部树](https://github.com/YuzukiHD/buildroot-external-yuzukihd/tree/main/package/xuantie-riscv-toolchain)：

```sh
cd "$NEKO_WORK/toolchain"
curl -fLO 'https://occ-oss-prod.oss-cn-hangzhou.aliyuncs.com/resource//1751370399722/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz'
echo '80c174c6445f7565bc082d328045021862a63beddfad8c393c534e2d9523dc3b  Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz' | sha256sum -c -
tar -xzf Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
export XUANTIE_ROOT="$NEKO_WORK/toolchain/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0"
"$XUANTIE_ROOT/bin/riscv64-unknown-elf-gcc" --version
cd "$NEKO_WORK"
```

## 2. 获取源码

Asterinas 直接从 `rustsbi/asterinas` 的 `feat/neko-rv32` 分支获取，RV32 适配和 Neko 构建脚本均在源码中。本仓库的 [`02_Firmware/RustSBI-Asterinas/sources/`](https://github.com/YuzukiHD/YuzukiNeko/tree/main/02_Firmware/RustSBI-Asterinas/sources) 仅提供 SyterKit 交接补丁，以及 RustSBI 的去色补丁、target 和配置。

先获取教程配套资料并校验：

```sh
cd "$NEKO_WORK"
git clone https://github.com/YuzukiHD/YuzukiNeko.git board-support
export NEKO_SUPPORT="$NEKO_WORK/board-support/02_Firmware/RustSBI-Asterinas/sources"
cd "$NEKO_SUPPORT"
sha256sum -c SHA256SUMS
cd "$NEKO_WORK"
```

下面使用新的源码目录。两个固件补丁在 `git apply --check` 通过后应用；Asterinas 克隆后检出本教程使用的固定提交，再继续构建。

```sh
git clone https://github.com/luojia65/SyterKit.git syterkit
git -C syterkit checkout --detach 3bf4f61fc7a1a40137a49482e1a225fef0b97a42
git -C syterkit apply --check "$NEKO_SUPPORT/syterkit/asterinas-handoff.patch"
git -C syterkit apply "$NEKO_SUPPORT/syterkit/asterinas-handoff.patch"

git clone https://github.com/rustsbi/rustsbi.git rustsbi
git -C rustsbi checkout --detach 4068e0d062493d2af3aeed7eb20bf84acd4b2c0f
git -C rustsbi apply --check "$NEKO_SUPPORT/rustsbi/rustsbi-no-color.patch"
git -C rustsbi apply "$NEKO_SUPPORT/rustsbi/rustsbi-no-color.patch"

git clone --branch feat/neko-rv32 --single-branch \
    https://github.com/rustsbi/asterinas.git asterinas
git -C asterinas checkout --detach a38ffafb1b138bdd6b3095665acc0465e2f750da
```

此时 `asterinas/tools/yuzuki-neko/` 应包含 `build.sh`、`build-initramfs.sh`、`build-nor.py`、`check_image.py` 和 `buildroot/`。若没有这些文件，先确认克隆的是 `rustsbi/asterinas` 的 `feat/neko-rv32` 分支。

## 3. 构建 SyterKit

SyterKit 初始化 PSRAM，再按固定 NOR 布局加载后续组件。交接补丁保留 Asterinas 所需的缓存状态；不要用 Linux 教程的加载器替换它。

```sh
cd "$NEKO_WORK"
RUSTUP_TOOLCHAIN=nightly-2026-05-11 \
    make -C syterkit O="$NEKO_WORK/build/syterkit" \
    CROSS_COMPILE="$XUANTIE_ROOT/bin/riscv64-unknown-elf-" \
    yuzukineko_rv32_defconfig
RUSTUP_TOOLCHAIN=nightly-2026-05-11 \
    make -C syterkit O="$NEKO_WORK/build/syterkit" \
    CROSS_COMPILE="$XUANTIE_ROOT/bin/riscv64-unknown-elf-" \
    -j"$(nproc)" spinor-boot
```

本固定版本的配置目标名为 `yuzukineko_rv32_defconfig`。产物是：

```text
build/syterkit/build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin
```

使用带 `_spi.bin` 后缀的镜像，它包含 BROM 所需的 eGON 启动头。对应的 `spinor-boot_bin.elf` 留作调试和检查，不直接写入 Flash。

## 4. 构建 RustSBI

使用配套 JSON target 构建 RV32 标量固件。配置固定入口地址 `0x40f80000`、跳转地址 `0x40000000` 和 WARN 日志等级；设备树由加载器通过 `a1` 传递。

```sh
cd "$NEKO_WORK/rustsbi"
CARGO_UNSTABLE_JSON_TARGET_SPEC=true \
    cargo +nightly-2026-05-11 prototyper build \
    --target "$NEKO_SUPPORT/rustsbi/riscv32-neko-scalar-none-elf.json" \
    --config-file "$NEKO_SUPPORT/rustsbi/rustsbi-warn.toml" jump
cd "$NEKO_WORK"
```

产物为：

```text
rustsbi/target/riscv32-neko-scalar-none-elf/release/rustsbi-prototyper-jump.bin
rustsbi/target/riscv32-neko-scalar-none-elf/release/rustsbi-prototyper-jump.elf
```

`.bin` 用于打包；`.elf` 用于确认入口和内存占用。运行时的 BSS、栈和堆也必须位于 `0x40f80000..0x41000000` 的保留区域内，不能只检查 `.bin` 是否小于 512 KiB。

## 5. 构建 BusyBox 与 initramfs

使用 Asterinas 源码中的 Buildroot 外部树。脚本自动下载并校验 Buildroot `2025.02.6`，获取 Bootlin RV32 ILP32D/musl 工具链和 BusyBox `1.37.0`，构建静态 BusyBox、三个 C 示例并安装其余 shell 示例。

```sh
cd "$NEKO_WORK/asterinas"
JOBS="$(nproc)" bash tools/yuzuki-neko/build-initramfs.sh
```

产物为 `target/neko-buildroot/output/images/rootfs.cpio`。脚本会检查它是否不超过 1 MiB，这也是 NOR 镜像中 initramfs 槽位的大小。

根文件系统由配套 overlay 配置启动流程和 `ttyS0` 控制台，包含 `/root/run-demos.sh`。不要直接替换成 Linux 教程的 SquashFS 或 `ttyS1` 启动脚本。

## 6. 构建 Asterinas 内核与设备树

首先从刚克隆的 Asterinas 工作区构建 OSDK。`OSDK_LOCAL_DEV=1` 会将当前工作区路径用于内核开发，因此需要使用这个工作区安装的工具：

```sh
cd "$NEKO_WORK/asterinas"
OSDK_LOCAL_DEV=1 cargo +nightly-2026-07-21 install cargo-osdk \
    --path osdk --locked --force --root "$NEKO_WORK/tools"
export VDSO_LIBRARY_DIR="$NEKO_WORK/asterinas/target/neko-vdso"
export CROSS_COMPILE=riscv64-linux-gnu-
RUSTUP_TOOLCHAIN=nightly-2026-07-21 \
    bash tools/yuzuki-neko/build.sh --arch riscv32 \
    target/neko-buildroot/output/images/rootfs.cpio 0x40500000
```

脚本构建 RV32 vDSO、内核和设备树，并检查地址布局。OSDK 使用 `riscv32imac-unknown-none-elf` 目标重新构建所需 Rust 库；这里不使用 RustSBI 的自定义 JSON target。

产物为：

```text
asterinas/target/yuzuki-neko-rv32/kernel.elf
asterinas/target/yuzuki-neko-rv32/Image
asterinas/target/yuzuki-neko-rv32/yuzuki-neko.dtb
```

:::caution
本 NOR 布局的 initramfs 载入地址必须是 `0x40500000`。移植源码中的部分 RAM 启动示例使用 `0x40d00000`，不能将那个地址直接用于本教程。内核仍从 `0x40000000` 启动。
:::

## 7. 合成 NOR 镜像

使用 Asterinas 源码中的打包脚本，从内核 ELF 生成包含段间空隙和 BSS 零填充的 `Image`，更新设备树中的 initramfs 地址和长度，并按下表组合镜像。输出目录与输入目录分开：

```sh
cd "$NEKO_WORK/asterinas"
python3 tools/yuzuki-neko/build-nor.py \
    --kernel target/yuzuki-neko-rv32/kernel.elf \
    --dtb target/yuzuki-neko-rv32/yuzuki-neko.dtb \
    --sbi "$NEKO_WORK/rustsbi/target/riscv32-neko-scalar-none-elf/release/rustsbi-prototyper-jump.bin" \
    --spl "$NEKO_WORK/build/syterkit/build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin" \
    --initramfs target/neko-buildroot/output/images/rootfs.cpio \
    --output-dir "$NEKO_WORK/images"
cd "$NEKO_WORK"
stat -c '%n %s bytes' images/asterinas-buildroot-nor.bin
sha256sum images/asterinas-buildroot-nor.bin
```

| 组件 | NOR 偏移 | 本布局预留容量 | RAM 载入地址 |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| 设备树 | `0x010000` | 256 KiB | `0x40f40000` |
| RustSBI | `0x050000` | 512 KiB | `0x40f80000` |
| Asterinas | `0x0d0000` | 5 MiB | `0x40000000` |
| initramfs | `0x5d0000` | 1 MiB | `0x40500000` |

输出包括 `images/asterinas-buildroot-nor.bin`、打包后的 `Image`、更新后的 `yuzuki-neko.dtb` 和 `manifest.json`。组合镜像应为 **7,143,424 字节（`0x6d0000`）**，空隙填充 `0xFF`；默认内核日志等级为 `loglevel=3`。

SyterKit 固定将 NOR `0x0d0000` 起的 6 MiB 加载到 RAM `0x40000000`，其中前 5 MiB 留给内核，最后 1 MiB 携带 initramfs。不能只移动其中一个载荷的偏移或地址。打包脚本会检查槽位、RAM 布局及 SPL 启动头；保留同目录的 `check_image.py`，不要只复制单个打包脚本，也不要用普通 `objcopy` 替代它的 ELF 处理。

重新编译的哈希可能与预编译包不同。保存本次构建的 `manifest.json` 和 SHA-256，烧录后以本次产物作为回读校验的基准。

## 8. 刷写与验证

先按[接线与串口说明](rustsbi-asterinas.md#连接串口)打开 UART1 控制台，再按 [FEL 下载模式与工具](../../boot/fel.md)进入 FEL，并[备份原 Flash](../../boot/flash-layout.md#备份整片-flash)。以下命令在连接开发板的刷机主机上执行，目录应包含本次构建的 `images/`：

```sh
xfel version
xfel spinor
xfel spinor write 0x0 images/asterinas-buildroot-nor.bin
xfel spinor read 0x0 0x6d0000 readback.img
sha256sum images/asterinas-buildroot-nor.bin readback.img
```

本镜像写入 `0x000000..0x6d0000`，不是整片 16 MiB 备份；其余范围不在本次写入内。不需要执行 `xfel ddr`。两个哈希一致后，松开 FEL 键并复位：

```sh
xfel reset
```

若使用 Windows 或 macOS 刷机，哈希命令见[预编译镜像教程](rustsbi-asterinas.md)。在开发板的 BusyBox shell 里运行：

```sh
/root/run-demos.sh
```

成功完成时应看到 `All 9 Asterinas examples completed.`。启动日志、九个示例和串口输入延时的说明也见[预编译镜像教程](rustsbi-asterinas.md)。

## 修改代码后的重建

- 修改 RustSBI：重跑第 4 步，再重新打包镜像；如果单独替换，仍需检查运行时内存占用。
- 修改内核：重跑第 6、7 步，打包时使用新的 ELF 和设备树。
- 修改根文件系统：编辑 `tools/yuzuki-neko/buildroot/overlay/` 或 `tools/yuzuki-neko/buildroot/examples/`，重跑第 5、6、7 步。
- 修改配置：编辑外部树中的 `configs/neko_defconfig` 或 `busybox.config`。`build-initramfs.sh` 每次都会重新载入 defconfig，直接修改输出目录的 `.config` 不会持久保留。

仅修改 `busybox.config` 时，先让已有 BusyBox 构建重新配置，再重跑第 5、6、7 步：

```sh
cd "$NEKO_WORK/asterinas"
make -C target/neko-buildroot/buildroot-2025.02.6 \
    O="$NEKO_WORK/asterinas/target/neko-buildroot/output" \
    BR2_EXTERNAL="$NEKO_WORK/asterinas/tools/yuzuki-neko/buildroot" \
    busybox-reconfigure
```

若在 `neko_defconfig` 中修改了工具链、架构、ABI 或包集合，先清理这一 Buildroot 输出目录，再重跑第 5、6、7 步，避免复用不兼容的构建产物：

```sh
cd "$NEKO_WORK/asterinas"
make -C target/neko-buildroot/buildroot-2025.02.6 \
    O="$NEKO_WORK/asterinas/target/neko-buildroot/output" \
    BR2_EXTERNAL="$NEKO_WORK/asterinas/tools/yuzuki-neko/buildroot" clean
```

## 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| 找不到 `tools/yuzuki-neko/build.sh` 或 RV32 scheme | 确认源码来自 `rustsbi/asterinas` 的 `feat/neko-rv32` 分支 |
| `git apply --check` 失败 | 确认是在未打补丁的固定基础提交上操作；不要重复应用，也不要对最新主分支强行套用 |
| SyterKit 编译器不识别 C907 参数 | 检查 `CROSS_COMPILE` 是否指向 Xuantie ELF/Newlib V3.2.0 |
| RustSBI 提示 JSON target 或找不到 `rust-objcopy` | 使用指定 nightly 和 `CARGO_UNSTABLE_JSON_TARGET_SPEC=true`，确认本工作目录的 `tools/bin` 在 `PATH` 中 |
| OSDK 或 vDSO 构建失败 | 确认 OSDK 来自当前克隆的 Asterinas 工作区，使用指定 nightly，并设置 `VDSO_LIBRARY_DIR` 和 RV32 vDSO 使用的交叉编译器 |
| Buildroot 下载失败 | 检查网络、下载地址和脚本输出；不要跳过校验或直接替换为其他 ABI 的工具链 |
| 打包提示镜像或内存区域越界 | 根据实际 ELF、根文件系统大小检查布局，不能只扩大 Flash 槽位而忽略 RAM 中的重叠 |

## 版本与验证范围

Neko RV32 源码分支及配套固件配置对应 2026-09-12 的固件构建资料。该预编译包已有 Flash 回读、BusyBox 启动和九个实板示例的验证记录；自行重建或修改后的产物需要按第 8 步重新验证，不能直接沿用原镜像的校验值和通过结论。

基础源码与补丁分别遵循相应项目的许可证；来源、文件校验值和许可说明见配套 `sources/README.md`。硬件仓库的 CC0 声明不替代这些软件许可证。
