# FEL 下载模式与工具

F101 的 BROM 里有一个 USB 下载模式，叫 <strong>FEL</strong>。在 FEL 下，主机可以通过 USB 读写 SPI NOR、把程序载入内存并运行。本板的所有下载方式（xfel、rfel、Arduino 上传、从 FEL 启动 UF2 加载器）都基于它。

## 进入 FEL

1. 按住板上的 <strong>FEL</strong> 键。
2. 接上 USB 数据线（或在已供电时复位）。
3. 松开 FEL 键。

用工具确认：

```sh
xfel version
```

应看到类似 `AWUSBFEX ID=0x00193700(F101)` 的输出。USB 设备的 VID/PID 是 `1f3a:efe8`。

!> <strong>板子已经从 Flash 启动时，不会自己进入 FEL。</strong> 一旦 SPI NOR 里有有效的启动加载器，上电就直接运行它，必须按住 FEL 键才能进入下载模式。反过来，Flash 的首扇区为空时，BROM 每次上电都会落到 FEL。

## 安装 xfel

xfel 仓库：<https://github.com/xboot/xfel>。固件包是用 v1.3.6 在板子上测试的，使用的版本必须支持 F101。

### Windows

从仓库 [v1.3.6 发布页](https://github.com/xboot/xfel/releases/tag/v1.3.6)下载 `xfel-windows-v1.3.6.7z`，<strong>整个解压</strong>，把含 `xfel.exe` 的目录加入 `PATH`，重新打开 PowerShell。随附的 DLL 必须和 `xfel.exe` 放在一起。不设 `PATH` 时，可以在工具目录里用 `./xfel.exe` 代替 `xfel`。

### Linux（以 Debian / Ubuntu 为例）

```sh
sudo apt update
sudo apt install git build-essential pkg-config libusb-1.0-0-dev
git clone https://github.com/xboot/xfel.git
cd xfel
make
sudo make install
sudo udevadm control --reload-rules
```

重新插拔 FEL 设备，让安装的 udev 规则生效。

### macOS

```sh
xcode-select --install
brew install libusb pkg-config
git clone https://github.com/xboot/xfel.git
cd xfel
make
sudo install -m 755 xfel /usr/local/bin/xfel
```

如果 `/usr/local/bin` 不存在，先执行 `sudo mkdir -p /usr/local/bin`，并确保它在 `PATH` 里。macOS 不使用 udev 规则。

## 安装 rfel

rfel 是 [rustsbi/allwinner-hal](https://github.com/rustsbi/allwinner-hal/tree/main/rfel) 的一部分，用 Rust 写成，三个平台命令相同。需要 [Rust 和 Cargo](https://www.rust-lang.org/tools/install) 以及 Git。Windows 还需要 Visual Studio Build Tools 的 C++ 工具链；Linux 需要 C 编译器和链接器（Debian / Ubuntu 上是 `build-essential`）；macOS 需要 Xcode Command Line Tools。

```sh
git clone https://github.com/rustsbi/allwinner-hal.git
cd allwinner-hal
rustup update stable
cargo +stable install --path rfel
rfel --help
```

源码需要包含提交 `11544b3`（`feat(rfel): support F101 chip`）或更新的 F101 支持。旧的检出请先更新再重新安装。Cargo 通常把可执行文件装到 Windows 的 `%USERPROFILE%\.cargo\bin` 或 Linux / macOS 的 `~/.cargo/bin`，确认它在 `PATH` 里。

`rfel version` 可查询已连接设备的芯片版本。

## USB 驱动与权限

### Windows

如果工具打不开 FEL 设备，用 [Zadig](https://zadig.akeo.ie/) 为 <strong>FEL USB 设备（VID `1f3a`，PID `efe8`）</strong> 安装 <strong>WinUSB</strong> 驱动。选设备前先核对 VID/PID，<strong>不要改动你的 USB 串口适配器的驱动</strong>。

### Linux

rfel 报告 USB 权限不足时，可以用绝对路径加管理员权限运行，或配置 udev 规则。在使用 systemd-logind 的桌面系统上，创建 `/etc/udev/rules.d/70-allwinner-fel.rules`：

```text
SUBSYSTEM=="usb", ATTR{idVendor}=="1f3a", ATTR{idProduct}=="efe8", TAG+="uaccess"
```

然后执行 `sudo udevadm control --reload-rules` 并重新插拔设备。没有桌面会话的系统请按本地用户组配置 USB 权限。Arduino 文档给出的另一种写法是 `MODE="0666"`，对所有用户开放，按需选择。

### macOS

不需要 WinUSB 或 udev 规则。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `xfel version` | 查询芯片，确认 FEL 连接 |
| `xfel spinor` | 识别 SPI NOR 及容量 |
| `xfel spinor read <addr> <len> <file>` | 读 Flash |
| `xfel spinor write <addr> <file>` | 写 Flash（自动擦除所需扇区） |
| `xfel reset` | 复位板子 |

rfel 的子命令与之同名，把 `xfel` 换成 `rfel` 即可。

!> <strong>某些命令的限制</strong>：`xfel ddr f101-s3`（初始化 PSRAM）加 `xfel write` + `xfel exec` 可以把程序直接载入 PSRAM 运行，不经 Flash，是开发 Zephyr 等裸机程序时的常用流程；这条流程需要<strong>每次重新上电进入 FEL</strong>，因为 `exec` 之后 FEL 不再可用。写 Flash 的流程（本站的固件刷写）<strong>不需要</strong>执行 `ddr`。

## 常见错误

| 提示 | 原因与处理 |
| --- | --- |
| `unsupported chip` | 工具版本不支持 F101，升级 xfel / rfel |
| 找不到设备 | 没进入 FEL；线缆是否带数据；Windows 是否装了 WinUSB |
| `usb bulk send/recv error` | 如果发生在 `exec` 之后：CPU 已离开 BROM，程序在跑，属正常现象 |
| 权限不足（Linux） | 配置 udev 规则，见上 |
