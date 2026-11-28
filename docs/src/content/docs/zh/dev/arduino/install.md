---
title: "安装与上传 sketch"
---

Arduino 平台可以从 Boards Manager 安装，也可以用发行包离线安装。两种方式都需要 xfel 和 FEL USB 驱动；Boards Manager 安装包会一并装上 xfel，离线包则把工具链和 xfel 作为单独的工具列出。

## 依赖

| 项目 | 说明 |
| --- | --- |
| 板子 | YuzukiNeko 或 Allwinner F101 EVB |
| 主机 | Windows 10/11 或 Linux x86_64 |
| IDE | Arduino IDE 2.x 或 `arduino-cli` |
| USB 线 | 带数据线，不是只供电；同一个口也用于 FEL |
| 串口适配器 | 接控制台 UART，115200 8N1；板上没有适配器时需要 |
| xfel | Boards Manager 安装包会装；1.4.0 或更新 |
| FEL | 板上的 FEL 键 |

## Arduino IDE

1. 打开 **File > Preferences**，在 **Additional boards manager URLs** 里加入 `https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json`。
2. 打开 **Boards Manager**，搜索 **YuzukiHD Boards** 并安装。
3. 选择 **Tools > Board > YuzukiHD Boards**，然后选 **YuzukiNeko** 或 **Allwinner F101 EVB**。
4. 选择 **Tools > Programmer > xfel (USB FEL)**。不要用普通的 Upload 按钮，板子没有串口 bootloader。

安装包会装上平台、xPack RISC-V GCC 和 xfel。第一次安装大约下载 85 MB。

## arduino-cli

```sh
arduino-cli config add board_manager.additional_urls https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json
arduino-cli core update-index
arduino-cli core install yuzuki:f101
arduino-cli board listall yuzuki
```

FQBN 是 `yuzuki:f101:f101neko` 或 `yuzuki:f101:f101evb`。用 `arduino-cli compile -b <FQBN> <sketch-dir>` 编译。上传使用和 IDE 相同的 `xfel` 编程器。

## FEL 驱动

按 [FEL 下载模式与工具](../../boot/fel.md)安装 xfel 和 USB 驱动。Windows 上用 Zadig 给 VID `1f3a`、PID `efe8` 的设备安装 WinUSB。Linux 上用 udev 规则给同一设备授权。按住 FEL 键上电或复位，板子进入 FEL。

## 上传

1. 按住 FEL 键，给板子上电或按复位，然后松开。
2. 在 IDE 里选择 **Sketch > Upload Using Programmer**（Ctrl+Shift+U）。
3. 上传会写入加载器、核心和 sketch，然后从 SRAM 启动加载器，不需要再断电重启就能运行 sketch。

| NOR 偏移 | 上传写入的内容 |
| --- | --- |
| `0x000000` | `boot.img`：加载器，三份副本，间隔 64 KiB |
| `0x200000` | `core.flash`：4 KiB 核心头页和核心镜像 |
| `0x400000` | sketch 二进制 |

:::caution
第一次上传会覆盖 SPI NOR 里的加载器、核心和 sketch 区域。上传前先按 [SPI NOR 布局与备份](../../boot/flash-layout.md)备份整片 Flash。
:::

## 离线安装

从[发布页](https://github.com/YuzukiHD/Arduino/releases)下载 `yuzukihd-f101-<version>.zip`，解压为 `<sketchbook>/hardware/yuzuki/f101`。sketchbook 在 Windows 和 macOS 上默认是 `Documents/Arduino`，在 Linux 上是 `~/Arduino`。把同一发布页的 `riscv-gcc` 和 `xfel` 工具装到 `<Arduino15>/packages/yuzuki/tools/<name>/<version>`，然后重启 IDE。`Arduino15` 在 Windows 上是 `%LOCALAPPDATA%\Arduino15`，在 Linux 上是 `~/.arduino15`。

| 项目 | 位置 |
| --- | --- |
| 平台 | `<sketchbook>/hardware/yuzuki/f101` |
| 工具链 | `<Arduino15>/packages/yuzuki/tools/riscv-gcc/<version>` |
| xfel | `<Arduino15>/packages/yuzuki/tools/xfel/<version>` |

## 更新

安装新版本的平台包会替换核心。核心 ID 会变，所有 sketch 都要重新编译；用旧核心编译的 sketch 会停在 `the sketch was built for another core`。加载器和 sketch 布局跟随核心头版本，混用不同版本的加载器和核心前先看发布说明。板子上有需要保留的内容时，大版本更新前先备份 Flash。

## 上传失败时

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `no board in FEL mode` | 不在 FEL，或者 USB 驱动没装好 | 重新执行 FEL 步骤并检查驱动 |
| `Request 'upload' failed` | 用了普通 Upload 按钮，或者没选编程器 | 改用 **Upload Using Programmer**，编程器选 **xfel (USB FEL)** |
| sketch 不运行 | 控制台或波特率不对，或者板子选错 | 检查板级控制台 115200 和所选板子 |
| `the sketch was built for another core` | 核心更新后 sketch 没有重新编译 | 重新编译并上传 sketch |
| 板子不进 FEL | 从 NOR 启动且没有按 FEL 键 | 按住 FEL 上电或复位 |
