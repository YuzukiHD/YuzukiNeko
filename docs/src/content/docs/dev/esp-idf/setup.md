---
title: "Environment and source"
---

This port is developed and verified on Linux x86_64. ESP-IDF manages CMake, Ninja and its Python virtual environment itself, so the host only needs Git, Python 3.10 or newer, and network access to GitHub. F101 uses the `riscv32-esp-elf` toolchain, not the XuanTie or Zephyr `riscv64-unknown-elf` toolchain.

## Host and tools

```sh
sudo apt update
sudo apt install git wget curl xz-utils
python3 --version
```

The ESP-IDF `install.sh` creates `.venv` and installs CMake, Ninja and the Python dependencies. Do not install ESP-IDF into a directory that already has a `.venv`, and do not reuse Zephyr build caches.

## Get the source

```sh
cd ~
git clone -b sun252i-f101 https://github.com/YuzukiHD/esp-idf.git
cd esp-idf
git submodule update --init --depth 1 components/heap/tlsf components/lwip/lwip components/mbedtls/mbedtls
git rev-parse HEAD
```

`heap/tlsf` is the heap allocator; `lwip` and `mbedtls` serve Wi-Fi and TLS. F101 does not use the ESP32 Bluetooth libraries, bootloader libraries or prebuilt Wi-Fi libraries, so a full recursive submodule update is unnecessary; only the ESP-IDF test suites need `git submodule update --init --recursive`. Record `git rev-parse HEAD` and include the commit in any problem report.

## Toolchain

```sh
./install.sh esp32c3
```

`install.sh` selects a toolchain by target chip. F101 is a preview target and the tool installer does not recognize the name `sun252i-f101`, but its RISC-V toolchain is the same one ESP32-C3 uses, `riscv32-esp-elf`. After installation, check it:

```sh
riscv32-esp-elf-gcc --version
```

The toolchain lives under `~/.espressif/tools/riscv32-esp-elf/`, and `export.sh` adds it to `PATH`. Do not substitute the system `riscv64-unknown-elf-gcc`; their multilibs and headers are incompatible.

## Python environment on this host

This host runs Python 3.14 without `ensurepip`, so `install.sh` cannot create a virtual environment inside the ESP-IDF directory. The workspace already has a `.venv`; point ESP-IDF at it. The commands below assume `$HOME/.venv`; replace the path if the environment lives elsewhere:

```sh
export IDF_PYTHON_ENV_PATH=$HOME/.venv
mkdir -p ~/.espressif
curl -L https://dl.espressif.com/dl/esp-idf/espidf.constraints.v6.1.txt -o ~/.espressif/espidf.constraints.v6.1.txt
python -m pip install -c ~/.espressif/espidf.constraints.v6.1.txt -r tools/requirements/requirements.core.txt
```

The constraints file must match the ESP-IDF version; `v6.1` is the upstream version of this port. If `install.sh` can create a virtual environment on the host, skip this section and use the `.venv` it created.

## Environment for a new terminal

Every new terminal activates the same Python environment and imports the ESP-IDF variables:

```sh
export IDF_PYTHON_ENV_PATH=$HOME/.venv
. $HOME/esp-idf/export.sh
```

`export.sh` sets `IDF_PATH`, the toolchain path and `idf.py`. Check the version:

```sh
idf.py --version
```

The output should be `ESP-IDF v6.1.0`. When the source tree has no local tag, `idf.py` also prints a Git version warning; it does not affect builds.

## Download and serial tools

FEL flashing uses xfel; installation and udev permissions are in [FEL tools](../../boot/fel.md). Use a serial terminal at 115200 8N1 with no flow control; the board console is UART1 on PB0/PB1. A Windows host can run only xfel and the serial tool, but the build commands in this chapter assume Linux.

RAM loading does not use `xfel ddr`. PSRAM is initialized by the SyterKit returning eFEX helper; its source is in `SyterKit/` in the workspace, and the build and load steps are in [building, loading and running](build-run.md).
