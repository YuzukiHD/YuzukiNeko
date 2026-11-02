---
title: "Get the Zephyr source"
---

F101 uses [`YuzukiHD/zephyr`](https://github.com/YuzukiHD/zephyr) for the kernel, SoC, boards and drivers, and [`YuzukiHD/zephyr-components`](https://github.com/YuzukiHD/zephyr-components) for applications and extension modules. **4.2.2 and 4.5.0 coexist.** Choose a matched pair using the [version guide](zephyr-4-5.md); the commands below initialize the retained 4.2.2 workspace. First complete [environment setup](zephyr-setup-env.md).

## Initialize a 4.2.2 workspace

The workspace directory already contains `.venv/`, `toolchains/` and `env.sh`. It is not itself a Git repository. Select the branch explicitly:

```sh
. ~/f101-zephyr/env.sh
west init -m https://github.com/YuzukiHD/zephyr --mr zephyr-v4.2.2-f101 ~/f101-zephyr
cd ~/f101-zephyr
west update --narrow fatfs lvgl mbedtls cherryusb opencore
git clone --branch main https://github.com/YuzukiHD/zephyr-components.git
west packages pip --install
```

`zephyr/west.yml` is the manifest. `west update` uses its pinned revisions; the named subset covers common F101 applications without fetching unrelated HALs. Add other manifest projects when required by your application, or use `west update --narrow` for all enabled groups. Interrupted updates can be rerun. Repository counts and disk usage depend on the selected version and fetched history.

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/init.cast" data-speed="6"></div>

The captures on this page are historical 4.2.2 sessions; current commands explicitly name the branch and required modules.

:::caution
west workspaces cannot be nested. If initialization finds a parent `.west`, check which workspace owns it and choose a separate directory. Preserve an existing workspace rather than deleting its configuration to make initialization succeed.
:::

## Initialize a separate 4.5 workspace

Use a sibling directory, such as `~/f101-zephyr-4.5`, with its own environment script and Python 3.12+ environment. Once both remote branches are available, initialize with `--mr zephyr-v4.5.0-f101` and clone components with `--branch zephyr-v4.5.0-f101`. In that workspace fetch:

```sh
west update --narrow fatfs lvgl mbedtls tf-psa-crypto tf-psa-crypto-drivers cherryusb opencore
```

The [4.5 guide](zephyr-4-5.md) lists environment requirements, interface changes, source revisions, publication status and switching/rollback commands. A separate workspace allows both versions to remain usable without changing each other's dependency checkouts.

## Applications and modules

Components are outside the west manifest and must be updated separately, on the branch matching the kernel.

| Directory | Contents |
| --- | --- |
| `nekobox/`, `bilibili-tv/`, `uf2-downloader/` | Applications: media/game UI, online video client, optional UF2 downloader |
| `micropython/`, `mgba/`, `gbsp/`, `nes/`, `doom/`, `bochs/` | Language runtime, console/game and PC emulators |
| `ncnn/`, `pocketjs/`, `litehtml/` | Inference, JavaScript UI runtime and HTML rendering |
| `aic8800/` | Wi-Fi/Bluetooth driver, Wi-Fi Direct control |
| `android-screen-mirror/`, `ios-screen-mirror/`, `miracast/` | ADB/scrcpy, AirPlay and Android wireless-display receivers |
| `dlna/` | UPnP media renderer protocol |
| `examples/` | Standalone API examples used by driver/component articles |

A module has `zephyr/module.yml`; applications do not all have one. Application `CMakeLists.txt` files normally add their required sibling modules. For your own application, add module directories to `ZEPHYR_EXTRA_MODULES` before `find_package(Zephyr)`.

Fetch only the upstream submodules needed by the selected application, for example:

```sh
git -C zephyr-components submodule update --init micropython/micropython
```

Use each application's README for nested submodules and host tools. Module licenses differ; inspect the licenses of all libraries linked into an image.

## Source locations

| Path | Purpose |
| --- | --- |
| `soc/allwinner/sun252i_f101/` | SoC startup, cache, MMU and interrupt support |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree |
| `dts/bindings/` | Peripheral bindings; the 4.5 F101 GPIO compatible is `allwinner,sun252i-f101-gpio` |
| `boards/yuzukihd/yuzukineko/` | YuzukiNeko board configuration |
| `boards/yuzukihd/f101_evb/` | Evaluation-board configuration |
| `samples/drivers/`, `samples/subsys/` | Driver/media and subsystem examples |
| `modules/` in the west workspace | Manifest dependencies, including LVGL, FatFs and Mbed TLS; 4.5 also uses TF-PSA-Crypto |

## Check the build

In the 4.2.2 workspace:

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west list
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-get-source/build.cast"></div>

Check the actual exit status. Outputs are `build/hello/zephyr/zephyr.elf` and `zephyr.bin`. The default hello-world image is a RAM build; confirm `.config` and ELF addresses before [running it](zephyr-build-run.md). XIP applications have a different layout and loader flow.

## Update within the selected version

After saving local changes, update both repositories on their selected branches, then update dependencies from that version's manifest:

```sh
git -C zephyr pull --ff-only
git -C zephyr-components pull --ff-only
west update --narrow fatfs lvgl mbedtls cherryusb opencore
west packages pip --install
```

For 4.5, include `tf-psa-crypto tf-psa-crypto-drivers` in the update list and activate its environment. Use separate output directories for versions, boards and incompatible configurations. For exact historical reproduction, use the revision pair in the [version guide](zephyr-4-5.md).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Git connection reset or RPC failure | Retry the same fetch; check local proxy/network settings and access to the repository |
| Unknown `west build` command | Enter the initialized west workspace and activate its environment |
| Compiler not found | Source the matching `env.sh` and check `CROSS_COMPILE` |
| Missing Python package | Install with `west packages pip --install` in the selected virtual environment |
| A 4.5 branch cannot be fetched | Confirm publication in both repositories; retain the working 4.2.2 pair until it is available |
