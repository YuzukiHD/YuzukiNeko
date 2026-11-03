---
title: "Environment and source"
---

Use Linux x86_64 (Ubuntu 24.04 is a suitable starting point), Python in a virtual environment, SCons, dtc and the XuanTie 900 elf-newlib V3.2.0 toolchain. The compiler executable has a `riscv64-unknown-elf-` prefix even though this BSP emits RV32 code.

## Install dependencies

```sh
sudo apt update
sudo apt install git build-essential python3-venv python3-dev device-tree-compiler wget xz-utils
mkdir -p ~/f101-rtt/toolchains
cd ~/f101-rtt
python3 -m venv .venv
. .venv/bin/activate
python -m pip install scons kconfiglib pyyaml pyelftools
```

## Toolchain

Use the same compiler release as the [Zephyr environment guide](../zephyr/zephyr-setup-env.md). A generic RISC-V compiler may reject `xtheadcmo` or lack the matching newlib multilib.

```sh
cd ~/f101-rtt/toolchains
wget -c https://occ-oss-prod.oss-cn-hangzhou.aliyuncs.com/resource//1751370399722/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
tar -xzf Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
export RTT_EXEC_PATH="$PWD/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin"
"$RTT_EXEC_PATH/riscv64-unknown-elf-gcc" --version
```

## Get the board fork

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

The source revision must contain the configuration seeds and source decoder described here. Record `git rev-parse HEAD` with any test report. A branch name tracks ongoing work; an older remote checkout may not contain the latest locally committed series yet.

## Environment for a new terminal

```sh
. ~/f101-rtt/.venv/bin/activate
export RTT_ROOT="$HOME/f101-rtt/rt-thread"
export RTT_EXEC_PATH="$HOME/f101-rtt/toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin"
export SUN252I_BOARD=yuzukineko
cd "$RTT_ROOT/bsp/allwinner-hal/sun252iw2"
scons --version
dtc --version
```

## Prepare the download host

Install xfel following [FEL tools](../../boot/fel.md), and a serial terminal for 115200 8N1. With a Linux build host and a Windows USB host, copy the freshly built image and helper to Windows before running xfel. A COM port is a host assignment, not a board property: the recent test used COM4, but identify the port again by unplugging the target.

Next: [build, select a profile and boot in RAM](build-run.md).
