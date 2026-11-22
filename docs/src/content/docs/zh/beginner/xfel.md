---
title: "安装 xfel 与进入 FEL"
---

xfel 是主机端的 FEL 下载工具，通过 USB 和 F101 BROM 的 FEL 模式通信。这一页装好 xfel，让板子进入 FEL，再确认连接。命令在主机终端里执行：Windows 用 PowerShell，Linux 用系统终端。

## 安装 xfel

### Windows

1. 从 [xfel Releases](https://github.com/xboot/xfel/releases/tag/v1.4.0) 下载 `xfel-windows-v1.4.0.7z`。这个版本包含 F101 支持。
2. 完整解压压缩包，`xfel.exe` 旁边的 DLL 必须留在同一目录。
3. 把文件放进一个不含中文和空格的目录，例如 `D:\neko`。
4. 在该目录打开 PowerShell，执行：

```powershell
.\xfel.exe version
```

PowerShell 不会自动在当前目录查找程序，所以没配 PATH 时要写 `.\xfel.exe`。把目录加入 PATH 后可以直接用 `xfel version`。配置方法见 [FEL 下载模式与工具](../boot/fel.md)。

如果 xfel 报告找不到或打不开设备，用 [Zadig](https://zadig.akeo.ie/) 安装 WinUSB 驱动：选 VID `1f3a`、PID `efe8` 的 FEL 设备，目标驱动选 WinUSB，安装后重新插拔。不要改串口适配器、键盘、鼠标等其他 USB 设备的驱动。

![Zadig 为 FEL 设备安装 WinUSB 驱动](figures/zadig.webp)

### Linux

以 Debian / Ubuntu 为例，安装依赖并从源码编译：

```sh
sudo apt update
sudo apt install git build-essential pkg-config libusb-1.0-0-dev
git clone https://github.com/xboot/xfel.git
cd xfel
make
sudo make install
```

如果 xfel 报告权限不足，新建 `/etc/udev/rules.d/70-allwinner-fel.rules`，内容如下：

```text
SUBSYSTEM=="usb", ATTR{idVendor}=="1f3a", ATTR{idProduct}=="efe8", TAG+="uaccess"
```

重新加载规则并插拔板子：

```sh
sudo udevadm control --reload-rules
```

### macOS

macOS 不需要 WinUSB 或 udev 规则，用下面的命令编译安装：

```sh
xcode-select --install
brew install libusb pkg-config
git clone https://github.com/xboot/xfel.git
cd xfel
make
sudo install -m 755 xfel /usr/local/bin/xfel
```

更多安装与驱动细节见 [FEL 下载模式与工具](../boot/fel.md)。

## 进入 FEL

1. 断开板子的 USB 线。
2. 按住 `FEL` 键。
3. 连接 USB 数据线。
4. 松开 `FEL` 键。
5. 观察主机是否出现新的 USB 设备。

Flash 中有有效启动加载器时，板子会直接启动，必须按住 `FEL` 上电才能进入下载模式。Flash 启动区为空时，每次上电都会进入 FEL。

| 模式 | 板子状态 | xfel 能否识别 |
| --- | --- | --- |
| FEL 模式 | 等待主机命令 | 能 |
| 启动模式 | 运行 NOR 中的系统 | 不能 |

## 确认连接

进入 FEL 后执行：

```sh
xfel version
xfel spinor
```

Windows 没配 PATH 时把 `xfel` 换成 `.\xfel.exe`。正常输出类似：

```text
AWUSBFEX ID=0x00193700(F101) dflag=0x44 dlength=0x08 scratchpad=0x00020000
Found spi nor flash 'SFDP' with 16777216 bytes
```

| 命令 | 关键输出 |
| --- | --- |
| `xfel version` | `AWUSBFEX ID=0x00193700(F101)`，识别到 F101 |
| `xfel spinor` | `16777216 bytes`，表示 16 MiB NOR Flash |

芯片 ID 或容量不对时先停下来检查接线。写 NOR 不需要执行 `xfel ddr`。下载到 RAM 运行要用 SyterKit 的 PSRAM helper，这是另一条路径，见 [PSRAM 初始化与 RAM 启动](../boot/psram-init.md)。

![xfel version 和 xfel spinor 的正常输出](figures/xfel-version.webp)

## 常见错误

| 输出或现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 找不到设备 | 未进入 FEL、充电线、驱动未安装 | 按住 FEL 上电，换数据线，Windows 安装 WinUSB |
| `unsupported chip` | xfel 版本太旧 | 使用 v1.4.0 或更新版本 |
| 权限不足 | Linux udev 规则未配置 | 配置规则并重新插拔 |
| `xfel` 不是内部或外部命令 | 未配置 PATH | 在 xfel 目录中使用 `.\xfel.exe` |
| `No such file` | 目录或文件名错误 | 用 `dir`/`ls` 检查当前目录 |
| `usb bulk send/recv error` | USB 链路断开或设备复位 | 重新按住 FEL 上电，检查线缆 |
| 设备时有时无 | 线缆接触不良、USB 口供电不足 | 更换线缆，改用后置 USB 口 |
| Zadig 安装后仍无法打开 | 选错设备或驱动未生效 | 核对 VID/PID，重新插拔后再试 |

## 参考资料

- FEL 模式、安装和命令参考：[FEL 下载模式与工具](../boot/fel.md)
- PSRAM 初始化和 RAM 启动：[PSRAM 初始化与 RAM 启动](../boot/psram-init.md)
- 备份、写入和回读：[NOR 烧录专题](nor-flash.md)

---

下一页：[NOR 烧录专题](nor-flash.md)
