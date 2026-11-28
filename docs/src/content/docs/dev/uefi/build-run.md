---
title: "Building and running EDK II"
---

The build script assumes the F101 west workspace layout: `edk2-build/` sits next to `zephyr/`, `toolchains/` and `tools-local/`, because it resolves the compilers and the host tools from the parent directory by default. A standalone clone works only when `LINUX_GCC`, `ELF_GCC`, `DTC` and the host tool paths are overridden.

## Prerequisites

- A Linux x86_64 host with `bash`, `make`, Python 3 and `git`.
- The XuanTie `linux-glibc` toolchain for OpenSBI and EDK II. OpenSBI needs a linker with PIE support; the `elf-newlib` toolchain does not provide one.
- The XuanTie `elf-newlib` toolchain for SyterKit.
- `dtc`. The script uses the one on `PATH`, then `../tools-local/usr/bin/dtc`.
- Host headers and tools for the EDK II BaseTools: `uuid/uuid.h` and `iasl`. The script adds `../tools-local/usr/include` and `../tools-local/usr/lib` when they exist; otherwise install the distribution packages.

| Tool | Used for | Default |
| --- | --- | --- |
| `LINUX_GCC` | OpenSBI, EDK II | `../toolchains/Xuantie-900-gcc-linux-6.6.0-glibc-x86_64-V3.2.0/bin/riscv64-unknown-linux-gnu-` |
| `ELF_GCC` | SyterKit loader | `../toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf-` |
| `DTC` | Device tree | `dtc` on `PATH`, then `../tools-local/usr/bin/dtc` |

## Source layout

| Path | Content |
| --- | --- |
| `edk2/` | tianocore/edk2 submodule; the platform uses the RISCV64 packages |
| `opensbi/` | `YuzukiHD/opensbi`, branch `sun252i-f101`, built as `fw_jump` |
| `SyterKit/` | `YuzukiHD/SyterKit`, built as the RV32 `usb-boot-rv64i` loader |
| `F101Pkg/` | The platform: DSC, FDF, SEC library, GOP and SMBIOS drivers |
| `dts/f101-evb.dts` | Device tree for OpenSBI and the payload |
| `patches/syterkit-f101-evb.patch` | Console and application changes for the loader |
| `tests/sbi_hello/` | S-mode payload for checking OpenSBI and the caches |

## Getting the source

```sh
cd <workspace root>
git clone --recurse-submodules https://github.com/YuzukiHD/edk2-build.git edk2-build
cd edk2-build
./build.sh all
```

`./build.sh all` runs the submodule step first, so `./build.sh submodules` is only needed after a clone made without `--recurse-submodules`.

## Build steps

| Argument | What it does |
| --- | --- |
| `submodules` | Initialize `edk2`, `opensbi`, `SyterKit` and the EDK II submodules the platform uses |
| `tools` | Build the EDK II BaseTools host programs |
| `opensbi` | Build OpenSBI `fw_jump` for RV64 with the glibc toolchain |
| `dtb` | Compile `dts/f101-evb.dts` with `dtc` |
| `syterkit` | Apply `patches/syterkit-f101-evb.patch` and build the `usb-boot-rv64i` loader |
| `edk2` | Build `F101Pkg/F101.dsc` |
| `package` | Trim `edk2.fd`, pack `dtb_sbi.bin`, copy `loader.bin`, write `run.sh` and `README.txt` |
| `all` | Run every step above |
| `clean` | Remove `Build/`, `out/`, `out-syter/` and `opensbi/build/` |

| Step | Main product |
| --- | --- |
| `tools` | `edk2/BaseTools/Source/C/bin/GenFv` and the other host tools |
| `opensbi` | `opensbi/build/sun252i-f101-rv64/platform/generic/firmware/fw_jump.bin` |
| `dtb` | `dts/f101-evb.dtb` |
| `syterkit` | `out-syter/build/yuzukineko/app_sram/usb-boot-rv64i/usb-boot-rv64i_fel.bin` |
| `edk2` | `Build/F101/<target>_GCC/FV/F101_CODE.fd` |
| `package` | `out/f101-edk2/` with the four runtime files |

## Build options

| Variable | Default | Purpose |
| --- | --- | --- |
| `LINUX_GCC` | see above | OpenSBI and EDK II compiler; needs a linker with PIE support |
| `ELF_GCC` | see above | SyterKit compiler |
| `DTC` | see above | Device tree compiler |
| `JOBS` | `nproc` | Parallel build |
| `BUILD_TARGET` | `RELEASE` | EDK II build target: `DEBUG`, `RELEASE` or `NOOPT`; `DEBUG` compiles the debug calls in, while `PcdDebugPrintErrorLevel` still filters the output |
| `DEBUG_WAIT` | unset | `-D F101_DEBUG_WAIT=TRUE`; SEC waits for a debugger |
| `NO_SCANOUT` | unset | `-D F101_NO_SCANOUT=TRUE`; the display engine does not scan out |

```sh
BUILD_TARGET=DEBUG ./build.sh all
DEBUG_WAIT=1 ./build.sh edk2 package
NO_SCANOUT=1 ./build.sh edk2 package
```

`DEBUG_WAIT` and `NO_SCANOUT` only affect the EDK II step. Running `edk2 package` on its own reuses the OpenSBI, device tree and loader outputs from an earlier build.

## Output

| File | Content | Load address |
| --- | --- | --- |
| `edk2.fd` | EDK II image trimmed to its used size | `0x40000000` |
| `dtb_sbi.bin` | Device tree in a 256 KiB slot followed by OpenSBI | `0x40f40000` |
| `loader.bin` | SyterKit RV32 loader | `0x20000`, SRAM |
| `run.sh` | xfel commands for the three images | not loaded |
| `README.txt` | Memory map and boot notes | not loaded |
| `f101-evb.dtb`, `fw_jump.bin` | The two parts of `dtb_sbi.bin` | not loaded |

## Running from FEL

Put the board into FEL, then run the packaged script. The console is UART3 (PE08/PE09) at 115200 8N1, and the boot menu appears on the panel.

```sh
cd edk2-build
./out/f101-edk2/run.sh
```

The script performs the same steps as these commands:

```sh
xfel ddr f101-s3
xfel write 0x40000000 out/f101-edk2/edk2.fd
xfel write 0x40f40000 out/f101-edk2/dtb_sbi.bin
xfel write 0x20000 out/f101-edk2/loader.bin
xfel exec 0x20000
```

:::caution
`xfel ddr f101-s3` only carries the F101S3 PSRAM table and cannot initialize the 32 MiB PSRAM of F101S4. The EDK II platform is built for the EVB, so the 16 MiB map and the S3 table match. Before running it on an S4 board, initialize PSRAM with the SyterKit `init_psram_efex_s4.bin` helper and check the device tree, panel and console pins; see [PSRAM initialization and RAM boot](../../boot/psram-init.md).
:::

## Rebuilding one part

The step arguments are independent once the submodules exist. A typical loop while changing the device tree or the platform:

```sh
./build.sh dtb
./build.sh edk2
./build.sh package
```

Changing the display driver only needs `edk2` and `package`. Changing the loader needs `syterkit` and `package`. Changing OpenSBI needs `opensbi` and `package`. `./build.sh all` is the safe option after a pull that touches submodules.

## Troubleshooting

- `xfel: command not found`, or `No FEL device found`: install xfel and enter FEL as described in [FEL download mode and tools](../../boot/fel.md).
- `no compiler: .../riscv64-unknown-linux-gnu-gcc`: set `LINUX_GCC` to the glibc toolchain prefix.
- An OpenSBI link error about PIE relocations: OpenSBI was built with the newlib toolchain. Use the glibc one.
- `dtc: command not found`: install `dtc` or set `DTC`.
- `missing: .../F101_CODE.fd`: the EDK II step did not run or failed; run `./build.sh edk2` and read the first error.
- S mode runs very slowly: the device tree `compatible` does not contain `allwinner,sun252i-f101`, so OpenSBI used its generic platform and did not enable the C907 caches.
- `ProtectUefiImage failed to create image properties record`: a known message from every module; see [status and known limits](limits.md).
