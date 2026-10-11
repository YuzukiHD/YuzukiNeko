# 配置开发环境

这一页在 Linux 主机上准备好编译 YuzukiNeko 的 Zephyr 程序所需的一切：系统依赖、Python 虚拟环境、west、玄铁（XuanTie）工具链，以及下载用的 xfel。做完之后，下一篇 [获取 Zephyr 代码](zephyr-get-source.md) 才有地方放代码。

!> 本页以 <strong>Ubuntu 24.04（x86_64）</strong> 为准。其他发行版请把 `apt` 包换成对应名字；Windows 建议用 WSL2，macOS 未验证。

## 工作区目录

后面所有内容都放在同一个目录 `~/f101-zephyr` 里，叫它「工作区」。它最终长这样：

```text
~/f101-zephyr/
├── .venv/          Python 虚拟环境（本页创建）
├── toolchains/     玄铁工具链（本页创建）
├── env.sh          每次开终端都要 source 的环境脚本（本页创建）
├── .west/          west 工作区标记（下一篇创建）
├── zephyr/         F101 版 Zephyr 内核（下一篇创建）
└── modules/        Zephyr 依赖的第三方模块（下一篇创建）
```

```sh
mkdir -p ~/f101-zephyr/toolchains && cd ~/f101-zephyr
```

## 系统依赖

```sh
sudo apt update
sudo apt install --no-install-recommends git cmake ninja-build gperf \
  ccache dfu-util device-tree-compiler wget python3-dev python3-venv python3-tk \
  xz-utils file make gcc gcc-multilib g++-multilib libsdl2-dev libmagic1
```

Zephyr 4.2 对主要工具的最低版本要求如下，装完请核对：

| 工具 | 最低版本 | 检查命令 |
| --- | --- | --- |
| CMake | 3.20.5 | `cmake --version` |
| Python | 3.10 | `python3 --version` |
| 设备树编译器（dtc） | 1.4.6 | `dtc --version` |

?> `gcc-multilib` / `g++-multilib` 只用于在主机上跑 native 仿真，编译 F101 目标不依赖它们。ARM64 主机上没有这两个包，直接从命令里去掉。

## Python 虚拟环境和 west

用虚拟环境装 west 和 Zephyr 的 Python 依赖，不污染系统 Python：

```sh
python3 -m venv ~/f101-zephyr/.venv
. ~/f101-zephyr/.venv/bin/activate
pip install --upgrade pip
pip install west
west --version
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-setup-env/venv.cast"></div>

Zephyr 自己的 Python 依赖（`pyelftools`、`PyYAML` 等）要等代码拿到之后才能装，放在下一篇的最后一步。

## 玄铁工具链

F101 的 CPU 是玄铁 C907（`rv32imafdcv`）。Zephyr 在这里用 <strong>XuanTie 900 elf-newlib</strong> 工具链，通过 `cross-compile` 方式接入，不使用 Zephyr SDK。

| 项 | 值 |
| --- | --- |
| 包名 | `Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz` |
| 编译器前缀 | `riscv64-unknown-elf-` |
| 来源 | 平头哥 OCC |

```sh
cd ~/f101-zephyr/toolchains
wget -c https://occ-oss-prod.oss-cn-hangzhou.aliyuncs.com/resource//1751370399722/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
tar -xzf Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
ls
```

解压后 `toolchains/` 下应有 `Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/`。验证：

```sh
~/f101-zephyr/toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf-gcc --version
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-setup-env/toolchain.cast"></div>

?> 这个工具链和 [手动构建 Linux 镜像](../linux/linux-manual.md) 里给 SyterKit 用的是同一个包。已经装过的话，不必再下载，把下面 `env.sh` 里的路径指过去即可。

## env.sh

把环境变量集中在一个脚本里，以后每开一个终端只需要 `source` 一次：

```sh
cat > ~/f101-zephyr/env.sh <<'EOF'
# 用法：. ./env.sh   （在工作区根目录，或用绝对路径 source）
_F101_WS="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

. "$_F101_WS/.venv/bin/activate"

export ZEPHYR_TOOLCHAIN_VARIANT=cross-compile
export CROSS_COMPILE="$_F101_WS/toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf-"
export PATH="$(dirname "$CROSS_COMPILE"):$PATH"

# 代码还没拿到时 zephyr/ 不存在，先不设
[ -d "$_F101_WS/zephyr" ] && export ZEPHYR_BASE="$_F101_WS/zephyr"

unset _F101_WS
EOF
```

各变量的作用：

| 变量 | 作用 |
| --- | --- |
| `ZEPHYR_TOOLCHAIN_VARIANT=cross-compile` | 让 Zephyr 使用 `CROSS_COMPILE` 指定的外部工具链 |
| `CROSS_COMPILE` | 工具链路径加前缀，注意末尾的 `-` |
| `PATH` | 让 `riscv64-unknown-elf-gcc` 等可以直接调用 |
| `ZEPHYR_BASE` | Zephyr 内核目录，下一篇拿到代码后才有 |

加载并检查：

```sh
. ~/f101-zephyr/env.sh
which west riscv64-unknown-elf-gcc
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-setup-env/check.cast"></div>

两个命令都应该指到工作区里。

## 安装 xfel

经 USB 把程序载入板子靠 xfel，不装也能编译，但无法下载运行。安装步骤（含 Linux 的 udev 规则）见 [FEL 下载模式与工具](../../boot/fel.md)，需要 <strong>v1.4.0 或更新</strong>。装完用 `xfel version` 验证（板子需先进入 FEL）。

## 检查清单

重新开一个终端，确认下面每项都成立再进入下一篇：

```sh
. ~/f101-zephyr/env.sh
west --version
cmake --version
dtc --version
riscv64-unknown-elf-gcc --version
```

下一篇：[获取 Zephyr 代码](zephyr-get-source.md)。
