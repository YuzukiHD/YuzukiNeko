---
title: "环境与源码"
---

本移植在 Linux x86_64 上开发和验证。ESP-IDF 自带 CMake、Ninja 和 Python 虚拟环境管理，主机只需要 Git、Python 3.10 或更新版本，以及一个能访问 GitHub 的网络。F101 使用 `riscv32-esp-elf` 工具链，不需要玄铁或 Zephyr 的 `riscv64-unknown-elf` 工具链。

## 主机与工具

```sh
sudo apt update
sudo apt install git wget curl xz-utils
python3 --version
```

ESP-IDF 的 `install.sh` 会创建 `.venv` 并安装 CMake、Ninja 和 Python 依赖。不要把 ESP-IDF 安装到已有 `.venv` 的目录里，也不要复用 Zephyr 的构建缓存。

## 获取源码

```sh
cd ~
git clone -b sun252i-f101 https://github.com/YuzukiHD/esp-idf.git
cd esp-idf
git submodule update --init --depth 1 components/heap/tlsf components/lwip/lwip components/mbedtls/mbedtls
git rev-parse HEAD
```

`heap/tlsf` 是堆分配器，`lwip` 和 `mbedtls` 供 Wi-Fi 与 TLS 使用。F101 不使用 ESP32 的蓝牙库、引导程序库和 Wi-Fi 预编译库，所以不必执行全量递归子模块更新；只有运行 ESP-IDF 自带测试时才需要 `git submodule update --init --recursive`。记录 `git rev-parse HEAD`，报告问题时附上这个提交。

## 工具链

```sh
./install.sh esp32c3
```

`install.sh` 按目标芯片选择工具链。F101 是预览目标，工具安装脚本不认识 `sun252i-f101` 这个名字，但它的 RISC-V 工具链和 ESP32-C3 相同，都是 `riscv32-esp-elf`。安装完成后确认：

```sh
riscv32-esp-elf-gcc --version
```

工具链位于 `~/.espressif/tools/riscv32-esp-elf/`，`export.sh` 会把它加入 `PATH`。不要用系统自带的 `riscv64-unknown-elf-gcc` 代替，两者的 multilib 和头文件不兼容。

## 本机的 Python 环境

这台主机的 Python 3.14 缺少 `ensurepip`，`install.sh` 无法在 ESP-IDF 目录里新建虚拟环境。工作区已经有一个 `.venv`，把它指定给 ESP-IDF 即可。下面假设虚拟环境在 `$HOME/.venv`，实际位置不同时替换这个路径：

```sh
export IDF_PYTHON_ENV_PATH=$HOME/.venv
mkdir -p ~/.espressif
curl -L https://dl.espressif.com/dl/esp-idf/espidf.constraints.v6.1.txt -o ~/.espressif/espidf.constraints.v6.1.txt
python -m pip install -c ~/.espressif/espidf.constraints.v6.1.txt -r tools/requirements/requirements.core.txt
```

约束文件必须和 ESP-IDF 版本匹配；`v6.1` 对应本移植的上游版本。如果 `install.sh` 在这台主机上能正常创建虚拟环境，可以跳过本节，直接使用它生成的 `.venv`。

## 新终端的环境

每打开一个新终端，先激活同一个 Python 环境并导入 ESP-IDF 的变量：

```sh
export IDF_PYTHON_ENV_PATH=$HOME/.venv
. $HOME/esp-idf/export.sh
```

`export.sh` 会设置 `IDF_PATH`、工具链路径和 `idf.py`。确认版本：

```sh
idf.py --version
```

输出应为 `ESP-IDF v6.1.0`。源码目录没有本地标签时，`idf.py` 还会打印一行 Git 版本警告，不影响构建。

## 下载与串口工具

FEL 烧录使用 xfel，安装和 udev 权限见 [FEL 工具](../../boot/fel.md)。串口终端使用 115200 8N1，无流控；板载控制台是 UART1 的 PB0/PB1。Windows 主机只用于运行 xfel 和串口工具也可以，但本文的构建命令以 Linux 为准。

RAM 加载不使用 `xfel ddr`。PSRAM 由 SyterKit 的 returning eFEX helper 初始化，源码在工作区的 `SyterKit/`，构建和加载步骤见[构建、加载与运行](build-run.md)。
