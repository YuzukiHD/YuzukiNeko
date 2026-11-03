---
title: "环境与源码"
---

建议使用 Linux x86_64 主机（可从 Ubuntu 24.04 开始）、Python 虚拟环境、SCons、dtc 和玄铁 900 elf-newlib V3.2.0 工具链。编译器前缀虽然为 `riscv64-unknown-elf-`，本 BSP 实际生成 RV32 代码。

## 安装依赖

```sh
sudo apt update
sudo apt install git build-essential python3-venv python3-dev device-tree-compiler wget xz-utils
mkdir -p ~/f101-rtt/toolchains
cd ~/f101-rtt
python3 -m venv .venv
. .venv/bin/activate
python -m pip install scons kconfiglib pyyaml pyelftools
```

## 工具链

工具链版本与 [Zephyr 环境指南](../zephyr/zephyr-setup-env.md)一致。通用 RISC-V 编译器可能不识别 `xtheadcmo`，或没有匹配的 newlib multilib。

```sh
cd ~/f101-rtt/toolchains
wget -c https://occ-oss-prod.oss-cn-hangzhou.aliyuncs.com/resource//1751370399722/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
tar -xzf Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
export RTT_EXEC_PATH="$PWD/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin"
"$RTT_EXEC_PATH/riscv64-unknown-elf-gcc" --version
```

## 获取板级分支

```sh
cd ~/f101-rtt
git clone --branch rtt-5.3.0-f101 https://github.com/YuzukiHD/rt-thread.git
cd rt-thread
git log -5 --oneline
git status --short
export RTT_ROOT="$PWD"
cd bsp/allwinner-hal/sun252iw2
export SUN252I_BOARD=yuzukineko
```

源码应包含本章所述的配置种子和源码解码器。每次测试记录 `git rev-parse HEAD`。分支会继续演进；较早的远端检出可能尚未包含最新的本地提交。

## 新终端的环境

```sh
. ~/f101-rtt/.venv/bin/activate
export RTT_ROOT="$HOME/f101-rtt/rt-thread"
export RTT_EXEC_PATH="$HOME/f101-rtt/toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin"
export SUN252I_BOARD=yuzukineko
cd "$RTT_ROOT/bsp/allwinner-hal/sun252iw2"
scons --version
dtc --version
```

## 准备下载主机

按 [FEL 工具](../../boot/fel.md)安装 xfel，并准备 115200 8N1 串口终端。Linux 编译、Windows 接板时，先将本次镜像与 helper 复制到 Windows，再执行 xfel。COM 号由主机分配，不是板卡固定属性：近期测试使用 COM4，仍应通过拔插目标确认当前端口。

下一步：[选择配置、构建并从 RAM 启动](build-run.md)。
