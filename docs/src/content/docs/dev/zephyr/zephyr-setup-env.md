---
title: "Set up the development environment"
---

This page prepares everything needed on a Linux host to build YuzukiNeko Zephyr programs: system dependencies, a Python virtual environment, west, the XuanTie toolchain, and xfel for downloading. Once it is done, the next page, [Get the Zephyr source](zephyr-get-source.md), has somewhere to put the code.

:::caution
This page is based on <strong>Ubuntu 24.04 (x86_64)</strong>. On other distributions, replace the `apt` packages with the corresponding names; on Windows, WSL2 is recommended; macOS is unverified.
:::

## Workspace directory

Everything that follows goes into the same directory, `~/f101-zephyr`, referred to as the "workspace". In the end it looks like this:

```text
~/f101-zephyr/
├── .venv/          Python virtual environment (created on this page)
├── toolchains/     XuanTie toolchain (created on this page)
├── env.sh          environment script to source in every new terminal (created on this page)
├── .west/          west workspace marker (created on the next page)
├── zephyr/         F101 Zephyr kernel (created on the next page)
└── modules/        third-party modules Zephyr depends on (created on the next page)
```

```sh
mkdir -p ~/f101-zephyr/toolchains && cd ~/f101-zephyr
```

## System dependencies

```sh
sudo apt update
sudo apt install --no-install-recommends git cmake ninja-build gperf \
  ccache dfu-util device-tree-compiler wget python3-dev python3-venv python3-tk \
  xz-utils file make gcc gcc-multilib g++-multilib libsdl2-dev libmagic1
```

Zephyr 4.2 has the following minimum version requirements for the main tools; check them after installing:

| Tool | Minimum version | Check command |
| --- | --- | --- |
| CMake | 3.20.5 | `cmake --version` |
| Python | 3.10 | `python3 --version` |
| Devicetree compiler (dtc) | 1.4.6 | `dtc --version` |

:::tip
`gcc-multilib` / `g++-multilib` are only needed to run native simulation on the host; building for the F101 target does not depend on them. They do not exist on ARM64 hosts, so drop them from the command.
:::

## Python virtual environment and west

Use a virtual environment to install west and Zephyr's Python dependencies without polluting the system Python:

```sh
python3 -m venv ~/f101-zephyr/.venv
. ~/f101-zephyr/.venv/bin/activate
pip install --upgrade pip
pip install west
west --version
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-setup-env/venv.cast"></div>

Zephyr's own Python dependencies (`pyelftools`, `PyYAML`, etc.) can only be installed once the source has been fetched; that is the last step of the next page.

## XuanTie toolchain

The F101 CPU is the XuanTie C907 (`rv32imafdcv`). Zephyr here uses the <strong>XuanTie 900 elf-newlib</strong> toolchain, integrated through the `cross-compile` variant, without the Zephyr SDK.

| Item | Value |
| --- | --- |
| Package name | `Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz` |
| Compiler prefix | `riscv64-unknown-elf-` |
| Source | T-Head OCC |

```sh
cd ~/f101-zephyr/toolchains
wget -c https://occ-oss-prod.oss-cn-hangzhou.aliyuncs.com/resource//1751370399722/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
tar -xzf Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
ls
```

After extraction, `toolchains/` should contain `Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/`. Verify:

```sh
~/f101-zephyr/toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf-gcc --version
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-setup-env/toolchain.cast"></div>

:::tip
This toolchain is the same package used for SyterKit in [Building the Linux image manually](../linux/linux-manual.md). If you have already installed it, there is no need to download it again; just point the path inside `env.sh` below at it.
:::

## env.sh

Collect the environment variables in a single script, so that afterwards you only need to `source` it once per terminal:

```sh
cat > ~/f101-zephyr/env.sh <<'EOF'
# Usage: . ./env.sh   (from the workspace root, or source it by absolute path)
_F101_WS="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

. "$_F101_WS/.venv/bin/activate"

export ZEPHYR_TOOLCHAIN_VARIANT=cross-compile
export CROSS_COMPILE="$_F101_WS/toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf-"
export PATH="$(dirname "$CROSS_COMPILE"):$PATH"

# zephyr/ does not exist until the source has been fetched; do not set it yet
[ -d "$_F101_WS/zephyr" ] && export ZEPHYR_BASE="$_F101_WS/zephyr"

unset _F101_WS
EOF
```

What each variable does:

| Variable | Purpose |
| --- | --- |
| `ZEPHYR_TOOLCHAIN_VARIANT=cross-compile` | Makes Zephyr use the external toolchain given by `CROSS_COMPILE` |
| `CROSS_COMPILE` | Toolchain path plus prefix; note the trailing `-` |
| `PATH` | Lets `riscv64-unknown-elf-gcc` and the others be called directly |
| `ZEPHYR_BASE` | Zephyr kernel directory; it only exists after the source is fetched on the next page |

Load and check:

```sh
. ~/f101-zephyr/env.sh
which west riscv64-unknown-elf-gcc
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-setup-env/check.cast"></div>

Both commands should point into the workspace.

## Install xfel

Loading a program onto the board over USB uses xfel; without it you can still build, but not download and run. The installation steps (including the Linux udev rules) are in [FEL download mode and tools](../../boot/fel.md), and require <strong>v1.4.0 or newer</strong>. After installing, verify with `xfel version` (the board must be in FEL first).

## Checklist

Open a new terminal and confirm every item below holds before moving on to the next page:

```sh
. ~/f101-zephyr/env.sh
west --version
cmake --version
dtc --version
riscv64-unknown-elf-gcc --version
```

Next: [Get the Zephyr source](zephyr-get-source.md).
