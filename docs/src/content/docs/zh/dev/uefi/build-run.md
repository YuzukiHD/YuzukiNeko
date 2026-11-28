---
title: "构建与运行 EDK II"
---

构建脚本按 F101 west 工作区的目录布局设计：`edk2-build/` 与 `zephyr/`、`toolchains/`、`tools-local/` 并列，因为脚本默认从上一级目录查找编译器和主机工具。单独克隆到别处时，需要覆盖 `LINUX_GCC`、`ELF_GCC`、`DTC` 和主机工具的路径。

## 依赖

- Linux x86_64 主机，安装 `bash`、`make`、Python 3 和 `git`。
- OpenSBI 和 EDK II 使用玄铁 `linux-glibc` 工具链。OpenSBI 需要支持 PIE 的链接器，`elf-newlib` 工具链不提供。
- SyterKit 使用玄铁 `elf-newlib` 工具链。
- `dtc`。脚本先找 `PATH` 上的版本，再找 `../tools-local/usr/bin/dtc`。
- EDK II BaseTools 需要主机头文件和工具：`uuid/uuid.h` 和 `iasl`。脚本会在 `../tools-local/usr/include`、`../tools-local/usr/lib` 存在时加入搜索路径；没有就安装发行版的开发包。

| 工具 | 用途 | 默认值 |
| --- | --- | --- |
| `LINUX_GCC` | OpenSBI、EDK II | `../toolchains/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-` |
| `ELF_GCC` | SyterKit 加载器 | `../toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf-` |
| `DTC` | 设备树 | `PATH` 上的 `dtc`，否则 `../tools-local/usr/bin/dtc` |

## 源码结构

| 路径 | 内容 |
| --- | --- |
| `edk2/` | tianocore/edk2 子模块；平台使用其中的 RISCV64 包 |
| `opensbi/` | `YuzukiHD/opensbi` 的 `sun252i-f101` 分支，按 `fw_jump` 构建 |
| `SyterKit/` | `YuzukiHD/SyterKit`，按 RV32 的 `usb-boot-rv64i` 加载器构建 |
| `F101Pkg/` | 平台代码：DSC、FDF、SEC 库、GOP 和 SMBIOS 驱动 |
| `dts/f101-evb.dts` | 供 OpenSBI 和负载使用的设备树 |
| `patches/syterkit-f101-evb.patch` | 加载器的控制台和应用改动 |
| `tests/sbi_hello/` | 检查 OpenSBI 和缓存的 S 态负载 |

## 获取源码

```sh
cd <workspace root>
git clone --recurse-submodules https://github.com/YuzukiHD/edk2-build.git edk2-build
cd edk2-build
./build.sh all
```

`./build.sh all` 会先执行子模块步骤，所以只有克隆时没加 `--recurse-submodules` 才需要单独运行 `./build.sh submodules`。

## 构建步骤

| 参数 | 作用 |
| --- | --- |
| `submodules` | 初始化 `edk2`、`opensbi`、`SyterKit` 以及平台用到的 EDK II 子模块 |
| `tools` | 构建 EDK II BaseTools 主机程序 |
| `opensbi` | 用 glibc 工具链构建 RV64 的 OpenSBI `fw_jump` |
| `dtb` | 用 `dtc` 编译 `dts/f101-evb.dts` |
| `syterkit` | 应用 `patches/syterkit-f101-evb.patch`，构建 `usb-boot-rv64i` 加载器 |
| `edk2` | 构建 `F101Pkg/F101.dsc` |
| `package` | 裁剪 `edk2.fd`，打包 `dtb_sbi.bin`，复制 `loader.bin`，生成 `run.sh` 和 `README.txt` |
| `all` | 依次执行上面的全部步骤 |
| `clean` | 删除 `Build/`、`out/`、`out-syter/` 和 `opensbi/build/` |

| 步骤 | 主要产物 |
| --- | --- |
| `tools` | `edk2/BaseTools/Source/C/bin/GenFv` 等主机工具 |
| `opensbi` | `opensbi/build/sun252i-f101-rv64/platform/generic/firmware/fw_jump.bin` |
| `dtb` | `dts/f101-evb.dtb` |
| `syterkit` | `out-syter/build/yuzukineko/app_sram/usb-boot-rv64i/usb-boot-rv64i_fel.bin` |
| `edk2` | `Build/F101/<target>_GCC/FV/F101_CODE.fd` |
| `package` | `out/f101-edk2/` 里的四个运行文件 |

## 构建选项

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `LINUX_GCC` | 见上文 | OpenSBI 和 EDK II 的编译器；需要支持 PIE 的链接器 |
| `ELF_GCC` | 见上文 | SyterKit 的编译器 |
| `DTC` | 见上文 | 设备树编译器 |
| `JOBS` | `nproc` | 并行构建的作业数 |
| `BUILD_TARGET` | `RELEASE` | EDK II 构建目标：`DEBUG`、`RELEASE` 或 `NOOPT`；`DEBUG` 会编进调试调用，输出仍由 `PcdDebugPrintErrorLevel` 过滤 |
| `DEBUG_WAIT` | 未设置 | `-D F101_DEBUG_WAIT=TRUE`；SEC 等待调试器 |
| `NO_SCANOUT` | 未设置 | `-D F101_NO_SCANOUT=TRUE`；显示引擎不扫描输出 |

```sh
BUILD_TARGET=DEBUG ./build.sh all
DEBUG_WAIT=1 ./build.sh edk2 package
NO_SCANOUT=1 ./build.sh edk2 package
```

`DEBUG_WAIT` 和 `NO_SCANOUT` 只影响 EDK II 步骤。单独运行 `edk2 package` 时，OpenSBI、设备树和加载器沿用上一次构建的产物。

## 输出

| 文件 | 内容 | 加载地址 |
| --- | --- | --- |
| `edk2.fd` | 裁剪到实际使用大小的 EDK II 镜像 | `0x40000000` |
| `dtb_sbi.bin` | 256 KiB 槽位里的设备树，后面紧跟 OpenSBI | `0x40f40000` |
| `loader.bin` | SyterKit RV32 加载器 | `0x20000`，SRAM |
| `run.sh` | 写入三个镜像的 xfel 命令 | 不加载 |
| `README.txt` | 内存映射和启动说明 | 不加载 |
| `f101-evb.dtb`、`fw_jump.bin` | `dtb_sbi.bin` 的两个组成部分 | 不加载 |

## 从 FEL 运行

先把板子置于 FEL，再运行打包好的脚本。控制台是 UART3（PE08/PE09），115200 8N1，启动菜单显示在屏幕上。

```sh
cd edk2-build
./out/f101-edk2/run.sh
```

脚本执行的步骤等同于下面这些命令：

```sh
xfel ddr f101-s3
xfel write 0x40000000 out/f101-edk2/edk2.fd
xfel write 0x40f40000 out/f101-edk2/dtb_sbi.bin
xfel write 0x20000 out/f101-edk2/loader.bin
xfel exec 0x20000
```

:::caution
`xfel ddr f101-s3` 只带 F101S3 的 PSRAM 参数，无法初始化 F101S4 的 32 MiB PSRAM。EDK II 平台按 EVB 构建，16 MiB 内存映射和 S3 参数是配套的。在 S4 板子上运行前，先用 SyterKit 的 `init_psram_efex_s4.bin` helper 初始化 PSRAM，并核对设备树、屏幕和控制台引脚，见 [PSRAM 初始化与 RAM 启动](../../boot/psram-init.md)。
:::

## 只重建一部分

子模块就位后，各步骤参数可以单独运行。改设备树或平台代码时的常用循环：

```sh
./build.sh dtb
./build.sh edk2
./build.sh package
```

只改显示驱动时跑 `edk2` 和 `package`。改加载器时跑 `syterkit` 和 `package`。改 OpenSBI 时跑 `opensbi` 和 `package`。拉取更新且子模块有变化时，用 `./build.sh all` 最稳妥。

## 常见问题

- `xfel: command not found` 或 `No FEL device found`：按 [FEL 下载模式与工具](../../boot/fel.md)安装 xfel 并进入 FEL。
- `no compiler: .../riscv64-unknown-linux-gnu-gcc`：把 `LINUX_GCC` 指向 glibc 工具链前缀。
- OpenSBI 链接时报 PIE 重定位错误：OpenSBI 用了 newlib 工具链，改用 glibc 工具链。
- `dtc: command not found`：安装 `dtc`，或设置 `DTC`。
- `missing: .../F101_CODE.fd`：EDK II 步骤没有运行或失败了；运行 `./build.sh edk2`，看第一条错误。
- S 态运行极慢：设备树的 `compatible` 里没有 `allwinner,sun252i-f101`，OpenSBI 走了通用平台，没有启用 C907 的缓存。
- `ProtectUefiImage failed to create image properties record`：每个模块都会打印的已知消息，见[状态与已知限制](limits.md)。
