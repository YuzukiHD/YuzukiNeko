---
title: "Get the Zephyr source"
---

This page fetches the F101 Zephyr source and all the modules it depends on, installs the Python dependencies, and builds a `hello_world` to confirm the environment is sound. Before starting, complete [Set up the development environment](zephyr-setup-env.md).

## Where the code is

The F101 Zephyr support is not in the YuzukiNeko hardware repository, but is a fork of upstream Zephyr:

| Item | Value |
| --- | --- |
| Repository | <https://github.com/YuzukiHD/zephyr> |
| Default branch | `zephyr-v4.2.2-f101` (based on Zephyr v4.2.2) |
| SoC | `soc/allwinner/sun252i_f101` |
| Devicetree | `dts/riscv/allwinner/sun252i_f101.dtsi` |
| Board support | `boards/yuzukihd/yuzukineko`, `boards/yuzukihd/f101_evb` |

This repository is itself the west manifest repository: the `west.yml` at its root follows the upstream Zephyr style and lists all the dependency modules, such as HAL, CherryUSB and mbedTLS. There is therefore no need to look for a separate manifest; use it directly to initialize the workspace.

## Initialize the workspace

First enter the environment, then run `west init`. `~/f101-zephyr` already contains `.venv/`, `toolchains/` and `env.sh`, and west can initialize directly in this non-empty directory:

```sh
. ~/f101-zephyr/env.sh
west init -m https://github.com/YuzukiHD/zephyr ~/f101-zephyr
```

On success you will see:

```text
=== Initialized. Now run "west update" inside /home/<你>/f101-zephyr.
```

This step clones only the single repository `zephyr/` and generates `.west/config`:

```ini
[manifest]
path = zephyr
file = west.yml
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/init.cast" data-speed="6"></div>

:::tip
To use a different branch or tag, add `--mr <branch or tag>` to the initialization, for example `west init -m https://github.com/YuzukiHD/zephyr --mr main ~/f101-zephyr`. If you have already initialized, go into `zephyr/` and switch with `git checkout`, then return to the workspace and run `west update` once more.
:::

:::caution
If `west init` reports `already initialized in ...`, there is a leftover `.west` in a parent directory (your `$HOME`, for example). west does not allow nested workspaces, so first confirm that directory is not in use, then delete it.
:::

## Fetch the modules

```sh
cd ~/f101-zephyr
west update --narrow -o=--depth=1
```

| Parameter | Purpose |
| --- | --- |
| `--narrow` | Fetch only the commit pinned in the manifest, not the branch history |
| `-o=--depth=1` | Pass `--depth=1` to `git fetch`, taking only one level of history to save bandwidth and disk |

This step fetches about 60 repositories and takes time depending on the network. When it finishes, the workspace occupies about <strong>6.4 GB</strong> (`zephyr/` itself keeps its full history). An interruption is fine; run the same command again to continue.

Confirm the modules are all in place:

```sh
west list
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/update.cast" data-speed="8"></div>

The first output line is `manifest  zephyr  HEAD`, followed by the individual projects under `modules/`, 60 lines in all.

:::tip
`west update` already skips the `babblesim` and `optional` groups by default, so it does not fetch things you do not need, such as the simulator. The `cherryusb` (USB protocol stack) and `opencore` (AAC decoding) that F101 needs are both in the default groups.
:::

## Get zephyr-components

The `zephyr` repository contains only the kernel, SoC, board support and drivers. The <strong>applications and extension modules</strong> built on this port live in a separate repository, [`YuzukiHD/zephyr-components`](https://github.com/YuzukiHD/zephyr-components), which is not in the west manifest and must be cloned separately.

| Directory | Contents |
| --- | --- |
| `uf2-downloader/` | An application rather than a module: makes the board appear as an `F101BOOT` drive and writes the `.uf2` files dragged into it; includes `tools/mkuf2.py`. Used by the UF2 download option in [Build and run](zephyr-build-run.md) |
| `micropython/`, `mgba/`, `nes/`, `doom/` | Ports of MicroPython, the emulators and Doom |
| `ncnn/`, `pocketjs/`, `litehtml/` | Neural-network inference, JS runtime, HTML rendering |
| `aic8800/`, `android-screen-mirror/`, `ios-screen-mirror/` | WiFi driver and phone screen mirroring |
| `bochs/` | x86 PC emulator |

Except for `uf2-downloader/`, each directory is an independent Zephyr module (with `zephyr/module.yml`); the README in each directory is the reference for how to use it.

Clone and pin to the commit verified on this page:

```sh
cd ~/f101-zephyr
git clone https://github.com/YuzukiHD/zephyr-components.git
git -C zephyr-components checkout 282361ce5883bd65c228da584758e4796bf439e7
```

If you only use `uf2-downloader/`, stop here. To use other modules, you also need to fetch their upstream submodules, for example MicroPython:

```sh
git -C zephyr-components submodule update --init micropython/micropython
```

To use a module, add its directory to `ZEPHYR_EXTRA_MODULES` (on the command line with `-DZEPHYR_EXTRA_MODULES=/path/to/module`, or in the application's `CMakeLists.txt` before `find_package(Zephyr)`).

:::tip
The upstream licenses differ between modules; `doom/` and `nes/` are GPL-2.0, and images that link them are also GPL-2.0.
:::

## Directory structure

After fetching, the workspace looks like this:

```text
~/f101-zephyr/
├── .venv/              Python virtual environment
├── .west/              west workspace marker
├── toolchains/         XuanTie toolchain
├── env.sh
├── zephyr/             F101 Zephyr kernel (west manifest repository)
├── zephyr-components/  applications and extension modules (cloned separately, not in west)
├── modules/
│   ├── hal/            vendor HALs (unused by F101, but listed in west.yml), CMSIS
│   ├── lib/            cherryusb, opencore, picolibc, gui/lvgl, etc.
│   ├── crypto/         mbedtls, tinycrypt
│   ├── fs/             fatfs, littlefs
│   ├── debug/          segger, percepio, etc.
│   └── tee/            trusted-firmware series
└── tools/              edtt, net-tools
```

The F101-related locations inside `zephyr/`:

| Path | Contents |
| --- | --- |
| `soc/allwinner/sun252i_f101/` | SoC initialization (`soc.c`), interrupt entry, cache, MMU regions, pinctrl headers |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree |
| `dts/bindings/*/allwinner,sunxi-*.yaml` | Devicetree bindings for the peripherals |
| `boards/yuzukihd/yuzukineko/` | YuzukiNeko board support: `yuzukineko.dts`, `yuzukineko_defconfig` |
| `boards/yuzukihd/f101_evb/` | F101 evaluation board support |
| `drivers/` | Drivers for clock/reset, pinctrl, GPIO, I2C, SPI, PWM, ADC, DMA, display, G2D, `vdec` and more |
| `samples/drivers/`, `samples/subsys/` | Examples for this hardware |

## Install the Python dependencies

Only once the source is in hand can Zephyr's Python dependencies be installed. Have west read the `requirements.txt` of every project in the workspace and install them together:

```sh
. ~/f101-zephyr/env.sh
west packages pip --install
```

This installs packages needed for building, such as `pyelftools`, `PyYAML` and `pykwalify`, as well as packages for testing and compliance checks. There are quite a few, and one install is enough.

After installing, source it once more; this time `ZEPHYR_BASE` will be set:

```sh
. ~/f101-zephyr/env.sh
echo $ZEPHYR_BASE
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/pip.cast" data-speed="3"></div>

It should output `/home/<you>/f101-zephyr/zephyr`.

## Verify: build hello_world

```sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/build.cast"></div>

On success the end looks similar to:

```text
Memory region         Used Size  Region Size  %age Used
             RAM:     2092112 B     16320 KB     12.52%
        IDT_LIST:           0 B         4 KB      0.00%
Generating files from .../build/hello/zephyr/zephyr.elf for board: yuzukineko
```

The artifacts are under `build/hello/zephyr/`; `zephyr.bin` is the image to load onto the board later, linked at `0x40010000`. For how to download it to the board and see the console output, see [Build and run](zephyr-build-run.md).

## Update the source

To sync the latest F101 changes later:

```sh
cd ~/f101-zephyr/zephyr
git pull
cd ..
west update --narrow -o=--depth=1
```

Update `zephyr/` first, because the module versions are determined by its `west.yml`; then `west update` aligns the modules to the new commit. If the Python dependencies in `west.yml` change, run `west packages pip --install` again.

## Common problems

<strong>`west update` hangs on a repository, or reports `Connection reset` / `RPC failed`</strong>: caused by unstable access to GitHub. Running the same command again continues the fetch. If it keeps failing, configure a proxy for git, or increase the buffer: `git config --global http.postBuffer 524288000`.

<strong>`west: unknown command "build"`</strong>: the current directory is not inside the workspace, or the virtual environment is not active. First run `. ~/f101-zephyr/env.sh`, then `cd` to `~/f101-zephyr`.

<strong>The build reports `riscv64-unknown-elf-gcc: command not found`</strong>: `env.sh` was not sourced, or the toolchain path inside `env.sh` is wrong. Troubleshoot with the checklist in [Set up the development environment](zephyr-setup-env.md).

<strong>`No module named 'yaml'` / `pyelftools`</strong>: the Python dependencies are not installed, or they were installed into the system Python. Confirm the prompt shows `(.venv)`, then run `west packages pip --install`.
