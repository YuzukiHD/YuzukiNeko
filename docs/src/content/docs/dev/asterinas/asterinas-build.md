---
title: "Build RustSBI and Asterinas from source"
---

This guide starts with obtaining the source code and builds SyterKit, RustSBI, Asterinas, and a BusyBox initramfs for the YuzukiNeko F101-S3 configuration with **16 MiB PSRAM + 16 MiB SPI NOR**, then produces a NOR image ready to flash. To try the system using an existing image, follow the [prebuilt image guide](rustsbi-asterinas.md).

The boot chain is:

```text
BROM → SyterKit → RustSBI → Asterinas → BusyBox shell
```

This guide uses the Neko RV32 source branch in the [Asterinas repository maintained by RustSBI](https://github.com/rustsbi/asterinas), which includes the kernel, Buildroot external tree, and image tools. Use the versions and board configurations listed below. The resulting system uses an initramfs in RAM, so file changes do not survive a reboot.

:::note
SyterKit still links the prebuilt `libpsram.a` supplied in its repository for PSRAM initialization, and uses the repository's bundled `dt2c` host tool by default. This guide rebuilds the bootloader, SBI firmware, kernel, and userspace; it does not rebuild all of these external dependencies from source.
:::

## 1. Prepare a Linux build host

Use an **x86_64 Linux** host. The dependency commands below use Ubuntu 24.04 as an example. Build as a regular user, using `sudo` only to install system packages. You can flash the board from another Windows, Linux, or macOS host.

```sh
sudo apt update
sudo apt install -y build-essential git curl wget ca-certificates \
    python3 device-tree-compiler gcc-riscv64-linux-gnu binutils-riscv64-linux-gnu \
    cpio unzip rsync bc bzip2 xz-utils patch file perl gawk \
    pkg-config cmake clang libclang-dev libssl-dev libncurses-dev flex bison
```

Run the commands below in order in the same Bash terminal. Clone and build directly on a Linux filesystem to preserve LF line endings and file permissions; do not copy a source tree whose line endings have been converted automatically on Windows. Avoid spaces in the working directory path, and allow room for source code, toolchain downloads, and build artifacts:

```sh
mkdir -p ~/f101-asterinas
cd ~/f101-asterinas
export NEKO_WORK="$PWD"
mkdir -p "$NEKO_WORK/toolchain" "$NEKO_WORK/build" "$NEKO_WORK/tools"
export PATH="$NEKO_WORK/tools/bin:$PATH"
```

### Toolchains and versions

| Component | Version or configuration used in this guide |
| --- | --- |
| SyterKit | `3bf4f61fc7a1a40137a49482e1a225fef0b97a42` + Asterinas handoff patch |
| RustSBI | `4068e0d062493d2af3aeed7eb20bf84acd4b2c0f` + no-color patch, custom RV32 scalar target, and WARN configuration |
| Asterinas | `feat/neko-rv32` branch of `rustsbi/asterinas`, pinned at `a38ffafb1b138bdd6b3095665acc0465e2f750da` |
| Rust: SyterKit / RustSBI | `nightly-2026-05-11` |
| Rust: Asterinas / OSDK | `nightly-2026-07-21` |
| SyterKit C toolchain | Xuantie-900 ELF/Newlib V3.2.0, `riscv64-unknown-elf-` |
| Asterinas RV32 vDSO assembly | Ubuntu's `riscv64-linux-gnu-gcc`; the script selects the RV32 ABI |
| BusyBox userspace | Buildroot `2025.02.6`, BusyBox `1.37.0`, Bootlin `riscv32-ilp32d--musl--stable-2024.05-1` |

RustSBI uses the ILP32 soft-float ABI, while BusyBox uses RV32GC / ILP32D. These are for firmware and userspace respectively, and their build configurations are not interchangeable. Buildroot obtains the userspace toolchain; you do not need to substitute a Xuantie Linux/glibc toolchain.

### Install Rust

If rustup is not installed, follow the [official Rust installation instructions](https://www.rust-lang.org/tools/install) first, and ensure that `rustup` and `cargo` are on `PATH`. Install the two pinned toolchains and the RV32 standard library used by SyterKit:

```sh
rustup toolchain install nightly-2026-05-11 --profile minimal \
    --component rust-src --component llvm-tools-preview
rustup target add --toolchain nightly-2026-05-11 riscv32imac-unknown-none-elf
rustup toolchain install nightly-2026-07-21 --profile minimal \
    --component rust-src --component rustc-dev --component llvm-tools-preview
```

The RustSBI build command requires `rust-objcopy`. Install it in this working directory to avoid replacing tools used by other projects:

```sh
cargo +nightly-2026-05-11 install cargo-binutils --version 0.4.0 \
    --locked --root "$NEKO_WORK/tools"
```

### Install the Xuantie ELF/Newlib toolchain

SyterKit uses C907-specific compiler options and requires the following x86_64 toolchain. The download URL and checksum come from the [YuzukiHD Buildroot external tree](https://github.com/YuzukiHD/buildroot-external-yuzukihd/tree/main/package/xuantie-riscv-toolchain):

```sh
cd "$NEKO_WORK/toolchain"
curl -fLO 'https://occ-oss-prod.oss-cn-hangzhou.aliyuncs.com/resource//1751370399722/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz'
echo '80c174c6445f7565bc082d328045021862a63beddfad8c393c534e2d9523dc3b  Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz' | sha256sum -c -
tar -xzf Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0-20250627.tar.gz
export XUANTIE_ROOT="$NEKO_WORK/toolchain/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0"
"$XUANTIE_ROOT/bin/riscv64-unknown-elf-gcc" --version
cd "$NEKO_WORK"
```

## 2. Obtain the source

Obtain Asterinas directly from the `feat/neko-rv32` branch of `rustsbi/asterinas`, which includes the RV32 port and Neko build scripts. This repository's [`02_Firmware/RustSBI-Asterinas/sources/`](https://github.com/YuzukiHD/YuzukiNeko/tree/main/02_Firmware/RustSBI-Asterinas/sources) supplies only the SyterKit handoff patch and the RustSBI no-color patch, target, and configuration.

First, obtain and verify the supporting files:

```sh
cd "$NEKO_WORK"
git clone https://github.com/YuzukiHD/YuzukiNeko.git board-support
export NEKO_SUPPORT="$NEKO_WORK/board-support/02_Firmware/RustSBI-Asterinas/sources"
cd "$NEKO_SUPPORT"
sha256sum -c SHA256SUMS
cd "$NEKO_WORK"
```

Use new source directories for the commands below. Apply the two firmware patches after `git apply --check` succeeds; after cloning Asterinas, check out the pinned commit used by this guide before building.

```sh
git clone https://github.com/luojia65/SyterKit.git syterkit
git -C syterkit checkout --detach 3bf4f61fc7a1a40137a49482e1a225fef0b97a42
git -C syterkit apply --check "$NEKO_SUPPORT/syterkit/asterinas-handoff.patch"
git -C syterkit apply "$NEKO_SUPPORT/syterkit/asterinas-handoff.patch"

git clone https://github.com/rustsbi/rustsbi.git rustsbi
git -C rustsbi checkout --detach 4068e0d062493d2af3aeed7eb20bf84acd4b2c0f
git -C rustsbi apply --check "$NEKO_SUPPORT/rustsbi/rustsbi-no-color.patch"
git -C rustsbi apply "$NEKO_SUPPORT/rustsbi/rustsbi-no-color.patch"

git clone --branch feat/neko-rv32 --single-branch \
    https://github.com/rustsbi/asterinas.git asterinas
git -C asterinas checkout --detach a38ffafb1b138bdd6b3095665acc0465e2f750da
```

At this point, `asterinas/tools/yuzuki-neko/` should contain `build.sh`, `build-initramfs.sh`, `build-nor.py`, `check_image.py`, and `buildroot/`. If these files are missing, confirm that you cloned the `feat/neko-rv32` branch of `rustsbi/asterinas`.

## 3. Build SyterKit

SyterKit initializes PSRAM and loads the subsequent components according to the fixed NOR layout. The handoff patch preserves the cache state required by Asterinas; do not substitute the loader from the Linux guide.

```sh
cd "$NEKO_WORK"
RUSTUP_TOOLCHAIN=nightly-2026-05-11 \
    make -C syterkit O="$NEKO_WORK/build/syterkit" \
    CROSS_COMPILE="$XUANTIE_ROOT/bin/riscv64-unknown-elf-" \
    yuzukineko_rv32_defconfig
RUSTUP_TOOLCHAIN=nightly-2026-05-11 \
    make -C syterkit O="$NEKO_WORK/build/syterkit" \
    CROSS_COMPILE="$XUANTIE_ROOT/bin/riscv64-unknown-elf-" \
    -j"$(nproc)" spinor-boot
```

The configuration target in this pinned revision is `yuzukineko_rv32_defconfig`. The output is:

```text
build/syterkit/build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin
```

Use the image with the `_spi.bin` suffix, which includes the eGON boot header required by the BROM. Keep the corresponding `spinor-boot_bin.elf` for debugging and inspection; do not write it directly to flash.

## 4. Build RustSBI

Use the supplied JSON target to build the RV32 scalar firmware. The configuration fixes the entry address at `0x40f80000`, the jump address at `0x40000000`, and the log level at WARN. The loader passes the devicetree through `a1`.

```sh
cd "$NEKO_WORK/rustsbi"
CARGO_UNSTABLE_JSON_TARGET_SPEC=true \
    cargo +nightly-2026-05-11 prototyper build \
    --target "$NEKO_SUPPORT/rustsbi/riscv32-neko-scalar-none-elf.json" \
    --config-file "$NEKO_SUPPORT/rustsbi/rustsbi-warn.toml" jump
cd "$NEKO_WORK"
```

The outputs are:

```text
rustsbi/target/riscv32-neko-scalar-none-elf/release/rustsbi-prototyper-jump.bin
rustsbi/target/riscv32-neko-scalar-none-elf/release/rustsbi-prototyper-jump.elf
```

Use the `.bin` for packaging and the `.elf` to check the entry point and memory usage. The runtime BSS, stack, and heap must also fit within the reserved `0x40f80000..0x41000000` region; checking that the `.bin` is smaller than 512 KiB is not sufficient.

## 5. Build BusyBox and the initramfs

Use the Buildroot external tree in the Asterinas source. The script automatically downloads and verifies Buildroot `2025.02.6`, obtains the Bootlin RV32 ILP32D/musl toolchain and BusyBox `1.37.0`, builds a static BusyBox and three C examples, and installs the remaining shell examples.

```sh
cd "$NEKO_WORK/asterinas"
JOBS="$(nproc)" bash tools/yuzuki-neko/build-initramfs.sh
```

The output is `target/neko-buildroot/output/images/rootfs.cpio`. The script checks that it is no larger than 1 MiB, which is also the size of the initramfs slot in the NOR image.

The supplied overlay configures the root filesystem's startup sequence and `ttyS0` console, and includes `/root/run-demos.sh`. Do not substitute the SquashFS image or `ttyS1` startup script from the Linux guide.

## 6. Build the Asterinas kernel and devicetree

First, build OSDK from the Asterinas workspace you just cloned. `OSDK_LOCAL_DEV=1` uses the current workspace path for kernel development, so use the tool installed from this workspace:

```sh
cd "$NEKO_WORK/asterinas"
OSDK_LOCAL_DEV=1 cargo +nightly-2026-07-21 install cargo-osdk \
    --path osdk --locked --force --root "$NEKO_WORK/tools"
export VDSO_LIBRARY_DIR="$NEKO_WORK/asterinas/target/neko-vdso"
export CROSS_COMPILE=riscv64-linux-gnu-
RUSTUP_TOOLCHAIN=nightly-2026-07-21 \
    bash tools/yuzuki-neko/build.sh --arch riscv32 \
    target/neko-buildroot/output/images/rootfs.cpio 0x40500000
```

The script builds the RV32 vDSO, kernel, and devicetree, and checks the address layout. OSDK rebuilds the required Rust libraries for the `riscv32imac-unknown-none-elf` target; it does not use the custom JSON target for RustSBI.

The outputs are:

```text
asterinas/target/yuzuki-neko-rv32/kernel.elf
asterinas/target/yuzuki-neko-rv32/Image
asterinas/target/yuzuki-neko-rv32/yuzuki-neko.dtb
```

:::caution
The initramfs load address for this NOR layout must be `0x40500000`. Some RAM boot examples in the port's source code use `0x40d00000`; do not use that address for this guide. The kernel still starts at `0x40000000`.
:::

## 7. Assemble the NOR image

Use the packaging script in the Asterinas source to generate an `Image` from the kernel ELF, including gaps between segments and zero-filled BSS, update the initramfs address and length in the devicetree, and combine the images according to the table below. Keep the output directory separate from the input directories:

```sh
cd "$NEKO_WORK/asterinas"
python3 tools/yuzuki-neko/build-nor.py \
    --kernel target/yuzuki-neko-rv32/kernel.elf \
    --dtb target/yuzuki-neko-rv32/yuzuki-neko.dtb \
    --sbi "$NEKO_WORK/rustsbi/target/riscv32-neko-scalar-none-elf/release/rustsbi-prototyper-jump.bin" \
    --spl "$NEKO_WORK/build/syterkit/build/yuzukineko/app_sram/spinor-boot/spinor-boot_spi.bin" \
    --initramfs target/neko-buildroot/output/images/rootfs.cpio \
    --output-dir "$NEKO_WORK/images"
cd "$NEKO_WORK"
stat -c '%n %s bytes' images/asterinas-buildroot-nor.bin
sha256sum images/asterinas-buildroot-nor.bin
```

| Component | NOR offset | Capacity reserved in this layout | RAM load address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| Devicetree | `0x010000` | 256 KiB | `0x40f40000` |
| RustSBI | `0x050000` | 512 KiB | `0x40f80000` |
| Asterinas | `0x0d0000` | 5 MiB | `0x40000000` |
| initramfs | `0x5d0000` | 1 MiB | `0x40500000` |

The outputs include `images/asterinas-buildroot-nor.bin`, the packaged `Image`, the updated `yuzuki-neko.dtb`, and `manifest.json`. The combined image should be **7,143,424 bytes (`0x6d0000`)**, with gaps filled with `0xFF`; the default kernel log level is `loglevel=3`.

SyterKit always loads 6 MiB from NOR offset `0x0d0000` into RAM at `0x40000000`. The first 5 MiB are reserved for the kernel, and the final 1 MiB carries the initramfs. Do not change a payload's offset or address in isolation. The packaging script checks the slots, RAM layout, and SPL boot header. Keep `check_image.py` in the same directory rather than copying only the packaging script, and do not replace its ELF processing with a plain `objcopy` command.

Rebuilt images may have different hashes from the prebuilt package. Save the `manifest.json` and SHA-256 from this build, and use this build's artifacts as the reference when verifying the flash read-back.

## 8. Flash and verify

First, open the UART1 console using the [wiring and serial port instructions](rustsbi-asterinas.md#connecting-the-serial-port), then enter FEL using [FEL download mode and tools](../../boot/fel.md) and [back up the original flash](../../boot/flash-layout.md#back-up-the-whole-flash). Run the following commands on the flashing host connected to the board, from a directory containing the `images/` produced by this build:

```sh
xfel version
xfel spinor
xfel spinor write 0x0 images/asterinas-buildroot-nor.bin
xfel spinor read 0x0 0x6d0000 readback.img
sha256sum images/asterinas-buildroot-nor.bin readback.img
```

This image writes the range `0x000000..0x6d0000`; it is not a backup of the entire 16 MiB flash. The remaining range is outside this write. There is no need to run `xfel ddr`. After the two hashes match, release the FEL button and reset:

```sh
xfel reset
```

For flashing from Windows or macOS, see the checksum commands in the [prebuilt image guide](rustsbi-asterinas.md). Run the following in the board's BusyBox shell:

```sh
/root/run-demos.sh
```

Successful completion should print `All 9 Asterinas examples completed.`. The [prebuilt image guide](rustsbi-asterinas.md) also covers boot logs, the nine examples, and the serial input delay.

## Rebuild after modifying code

- RustSBI changes: repeat step 4, then repackage the image. If replacing it separately, check its runtime memory usage as well.
- Kernel changes: repeat steps 6 and 7, using the new ELF and devicetree when packaging.
- Root filesystem changes: edit `tools/yuzuki-neko/buildroot/overlay/` or `tools/yuzuki-neko/buildroot/examples/`, then repeat steps 5, 6, and 7.
- Configuration changes: edit `configs/neko_defconfig` or `busybox.config` in the external tree. `build-initramfs.sh` reloads the defconfig on every run, so direct edits to `.config` in the output directory do not persist.

If only `busybox.config` has changed, first reconfigure the existing BusyBox build, then repeat steps 5, 6, and 7:

```sh
cd "$NEKO_WORK/asterinas"
make -C target/neko-buildroot/buildroot-2025.02.6 \
    O="$NEKO_WORK/asterinas/target/neko-buildroot/output" \
    BR2_EXTERNAL="$NEKO_WORK/asterinas/tools/yuzuki-neko/buildroot" \
    busybox-reconfigure
```

If you change the toolchain, architecture, ABI, or set of packages in `neko_defconfig`, clean this Buildroot output directory first, then repeat steps 5, 6, and 7 to avoid reusing incompatible artifacts:

```sh
cd "$NEKO_WORK/asterinas"
make -C target/neko-buildroot/buildroot-2025.02.6 \
    O="$NEKO_WORK/asterinas/target/neko-buildroot/output" \
    BR2_EXTERNAL="$NEKO_WORK/asterinas/tools/yuzuki-neko/buildroot" clean
```

## Troubleshooting

| Symptom | Checks and resolution |
| --- | --- |
| `tools/yuzuki-neko/build.sh` or an RV32 scheme is missing | Confirm that the source is from the `feat/neko-rv32` branch of `rustsbi/asterinas` |
| `git apply --check` fails | Confirm that you are using the unpatched, pinned base commit; do not apply a patch twice or force it onto the latest main branch |
| The SyterKit compiler does not recognize C907 options | Check that `CROSS_COMPILE` points to Xuantie ELF/Newlib V3.2.0 |
| RustSBI reports a JSON target issue or cannot find `rust-objcopy` | Use the specified nightly and `CARGO_UNSTABLE_JSON_TARGET_SPEC=true`, and ensure that this working directory's `tools/bin` is on `PATH` |
| The OSDK or vDSO build fails | Confirm that OSDK comes from the current Asterinas checkout, use the specified nightly, and set `VDSO_LIBRARY_DIR` and the cross compiler for the RV32 vDSO |
| Buildroot downloads fail | Check the network, download URLs, and script output; do not skip verification or substitute a toolchain with a different ABI |
| Packaging reports an image or memory region outside its allowed range | Check the layout against the actual ELF and root filesystem sizes; enlarging a flash slot alone does not resolve an overlap in RAM |

## Versions and validation scope

The Neko RV32 source branch and supporting firmware configurations correspond to the firmware build materials dated 2026-09-12. That prebuilt package has records of flash read-back, BusyBox boot, and nine examples passing on the board. Validate rebuilt or modified artifacts again using step 8; the original image's checksums and validation results do not apply automatically.

The base sources and patches are covered by their respective project licenses. See the supplied `sources/README.md` for provenance, file checksums, and license notes. The hardware repository's CC0 declaration does not replace these software licenses.
