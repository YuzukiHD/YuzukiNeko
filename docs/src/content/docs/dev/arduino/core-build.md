---
title: "Building the core and the release"
---

The repository ships the Arduino platform, not a firmware image. The release package carries the prebuilt cores and the loader under `prebuilt/`; a fresh checkout builds them with `tools/build-core`. Users install the package; maintainers rebuild the core when the Zephyr tree, the core sources or a library changes. The Zephyr environment is described in [Zephyr building and running](../zephyr/zephyr-build-run.md).

## Build the core

`tools/build-core` needs the F101 west workspace: `zephyr/`, the west modules (`fatfs`, `cherryusb`, `opencore`) and a RISC-V compiler. Run it from the `Arduino/` checkout inside the workspace.

```sh
cd <workspace root>
. ./env.sh
cd Arduino
tools/build-core --board f101_evb
tools/build-core --board yuzukineko
```

Without `. env.sh`, set `CROSS_COMPILE` to a RISC-V toolchain prefix; the xPack `riscv-none-elf-` toolchain used by CI works. The default board is `f101_evb`; pass `--board yuzukineko` for the other core.

## What build-core does

| Step | Action |
| --- | --- |
| Clean | Removes `build/core/<variant>` so a stale overlay is not reused |
| Configure | Runs `west build -b <board>` with `-DARDUINO_LIBRARIES=...`, `-DARDUINO_CORE_ID=...` and `-DARDUINO_EXPORTS=` |
| First link | Builds the Zephyr image with the core and every library |
| Symbol scan | Runs `nm -g --defined-only` over the app objects and the C/C++ libraries |
| Second link | Rebuilds with a response file of `-u <symbol>` lines, so sketches can call symbols the core itself does not use |
| Install | Writes `prebuilt/<variant>-core/{core.elf,core.bin,core.flash}` and copies the loader binaries |
| Headers | Copies the headers a sketch reads into `prebuilt/include` and `prebuilt/<variant>-core/include` |

The core ID is `int(time.time()) & 0x7FFFFFFF` unless `-DARDUINO_CORE_ID` is given. Every rebuild gets a new ID, which is why sketches must be recompiled after a core update. `core.flash` is a 4 KiB header page followed by the core image; the loader reads that page.

## Build the package

`tools/package` needs `prebuilt/` and `loader/`. It writes the platform zip, the tool archives, the Boards Manager index and `SHA256SUMS`.

```sh
tools/package --out dist
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--out` | required | output directory |
| `--version` | `version=` in `platform.txt` | platform version |
| `--base-url` | latest release URL | where the files are published |
| `--targets` | `windows,linux` | host packages to build |

| Package file | Content |
| --- | --- |
| `yuzukihd-f101-<version>.zip` | Platform: `boards.txt`, `platform.txt`, `programmers.txt`, cores, library headers, variants, prebuilt cores and loader, examples |
| `riscv-gcc-<version>-<target>.*` | xPack RISC-V GCC cut down to the rv32imafdc/ilp32d multilib |
| `xfel-<version>-<target>.*` | xfel 1.4.0 for the host |
| `package_yuzukihd_index.json` | Boards Manager index pointing at the base URL |
| `SHA256SUMS` | Checksums of the files above |

The platform zip contains only the public headers of the libraries; the implementations are already in the core. `tools/package` copies `tools/upload.sh` and `tools/upload.cmd` into the platform so the IDE can call them.

## Release

GitHub Actions runs `.github/workflows/build.yml`. It builds both cores with the xPack GCC, packages them, installs the package with `arduino-cli`, compiles every example and publishes the files when the pushed tag is `v<version>` and matches `version=` in `platform.txt`.

A local release follows the same steps: build both cores, run `tools/package --out dist`, then test `arduino-cli core install yuzuki:f101` against a local index before publishing.

## Adding a board

A new board needs a directory under `variants/<name>/` with `pins_arduino.h`, `<name>.overlay` and `<name>.conf`, an entry in `boards.txt` with `build.variant=<name>`, `build.board=<macro>` and the arch flags, and a mapping from the Zephyr board to the variant in `BOARDS` in `tools/build-core`. The core build directory and the sketch headers are named after that variant.

`CMakeLists.txt` currently selects `variants/evb/` for the core configuration, so a board with a different peripheral set also needs a change there. The `variants/yuzukineko/` files describe the YuzukiNeko pin names, but the core build still uses the shared EVB configuration; the Zephyr board supplies the console and panel.

## Updating the core

1. Check out the Zephyr and module revisions you want.
2. Rebuild both cores with `tools/build-core`.
3. Run the examples against the new core; the core ID changes, so every sketch has to be recompiled.
4. Bump `version=` in `platform.txt`.
5. Tag the release `v<version>` and let CI publish the package.

The `prebuilt/` directory is gitignored except for `sketch.ld`; the binaries live in the release assets, not in the repository.

## Layout

| Path | Content |
| --- | --- |
| `cores/f101/` | Arduino headers and the sketch entry |
| `src/core/` | implementation of the core |
| `libraries/<name>/src/` | public headers of a library |
| `libsrc/<name>/` | implementation, built into the core |
| `variants/<name>/` | pin names, overlay and Kconfig fragment |
| `prebuilt/` | core images, loader and headers for sketches |
| `tools/` | `upload.sh`, `upload.cmd`, `build-core`, `package` |
| `examples/` | one folder per example sketch |
