---
title: "Building and running"
---

:::note[Version scope]
Zephyr 4.2.2 and 4.5.0 coexist. The original examples, captures and target results on this page use the 4.2.2 baseline; 4.5 changes are identified separately. Select matching kernel and component branches and separate environments/build directories using the [version and migration guide](zephyr-4-5.md). A 4.5 build or host-test pass does not update the version of an existing board result.
:::


This page applies to matched 4.2.2 and 4.5.0 environments; use separate build outputs for 4.5 as described in the [version guide](zephyr-4-5.md). First complete [environment setup](zephyr-setup-env.md), [source setup](zephyr-get-source.md) and [FEL tool installation](../../boot/fel.md).

| Image and purpose | Procedure | After power loss |
| --- | --- | --- |
| Ordinary RAM application | Initialize PSRAM through FEL, then download/execute at the ELF address | Image is lost |
| XIP development application | Write/verify the app at NOR `0x80000`, then execute a current XIP loader from RAM | App remains; an empty boot area returns to FEL |
| Standalone RAM application | Optional legacy NOR/UF2 layout with `flash-boot` and image headers | Automatically loads from NOR into RAM |

**Check the image type first.** RAM and XIP do not share download addresses, and an XIP `zephyr.bin` cannot use the legacy UF2 `app` flow. Development preserves an empty NOR boot area so power cycling returns to FEL; the NOR/UF2 installation below is a separate choice for standalone boot.

## Building

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-build-run/build.cast"></div>

| Argument | Meaning |
| --- | --- |
| `-b yuzukineko` | Board. Use `f101_evb` for the evaluation board |
| `-d build/hello` | Build directory; use a different directory for each program so they do not overwrite each other |
| `zephyr/samples/hello_world` | The application to build; replace it with the path of another sample |

The output is under `build/hello/zephyr/`:

| File | Description |
| --- | --- |
| `zephyr.bin` | Bare binary; this is what gets downloaded to the board |
| `zephyr.elf` | ELF with symbols, for debugging and inspecting the memory layout |

The default hello-world RAM image uses `0x40000000`; for other applications check `zephyr/.config`, `zephyr/zephyr.dts` and the ELF load address and entry. The toolchain is the XuanTie 900 newlib GCC, wired in through `ZEPHYR_TOOLCHAIN_VARIANT=cross-compile`, set by `env.sh`.

To rebuild the same directory, use `west build -d build/hello`; if you changed the board or want to start over, add `-p always`.

## Console

The console of `yuzukineko` is <strong>UART1, PB00 (TX) / PB01 (RX), 115200 8N1</strong>. Connect the USB-to-serial adapter's RX to PB00 and its TX to PB01, share ground, then open any serial terminal, for example:

```sh
picocom -b 115200 /dev/ttyUSB0
```

When there is no output, first work out which link is at fault: the wiring and terminal parameters, whether the program is really executing, or Zephyr itself. A useful approach is to first load a small bare-metal program (linked at `0x40000000`, polling UART and writing the transmit register) to prove that this path works.

## Method 1: download to RAM and run

The host writes `zephyr.bin` into PSRAM over USB and then jumps to it, without touching Flash.

1. Put the board into FEL: hold the FEL button, connect the USB data cable, release (see [FEL download mode and tools](../../boot/fel.md#entering-fel)).
2. Confirm the connection:

   ```sh
   xfel version
   ```

   The output should contain `AWUSBFEX ID=0x00193700(F101)`.

3. Initialize memory, load, and run:

   ```sh
   xfel ddr f101-s3
   xfel write 0x40000000 build/hello/zephyr/zephyr.bin
   xfel exec 0x40000000
   ```

At this point the console should start producing output. `hello_world` prints `Hello World! yuzukineko/sun252i_f101`.

| Command | Effect |
| --- | --- |
| `xfel ddr f101-s3` | Initialize PSRAM. This helper also sets up the UART clock and pin multiplexing; without it the console has no output |
| `xfel write 0x40000000 …` | Write the image to the link address |
| `xfel exec 0x40000000` | Jump to the entry point and start running |

Points to note:

- <strong>Every download needs a fresh power-up into FEL.</strong> After `exec` the CPU has left the BROM and FEL is no longer available.
- This path skips boot0 and u-boot, so the early SoC initialization (CPU CSR, console clock) is handled by Zephyr itself.
- Do not use `xfel read32` or `hexdump` to check status after `exec`; the USB link is already gone. Status can only be checked before `exec`.
- Seeing `usb bulk send/recv error` after `exec` may mean the ROM USB connection disconnected after the jump; it does not establish execution. Check the current image’s console output.

## XIP development: application in NOR, loader in RAM

Use this flow for NekoBox, Bilibili and the Miracast XIP configuration. Both Zephyr versions require a loader matching the current SPIF layout; do not rely on a stale `.bin` in an application's `tools/` directory.

Obtain current SyterKit sources first (run `git clone https://github.com/YuzukiHD/SyterKit.git` if not already cloned), then build in the workspace with `CROSS_COMPILE` set:

```sh
make -C SyterKit O=../out/syterkit CROSS_COMPILE="$CROSS_COMPILE" yuzukineko_rv32_sram_defconfig
make -C SyterKit O=../out/syterkit CROSS_COMPILE="$CROSS_COMPILE" -j8 xip-boot
```

Check the build exit status, loader source revision, timestamp and SHA-256. This example uses the current NekoBox output; substitute the matching XIP build directory for another app:

```sh
mkdir -p out
xfel version
xfel spinor write 0x80000 build/nekobox/zephyr/zephyr.bin
xfel spinor read 0x80000 "$(wc -c < build/nekobox/zephyr/zephyr.bin)" out/nekobox-readback.bin
sha256sum build/nekobox/zephyr/zephyr.bin out/nekobox-readback.bin
```

Continue only for the F101 ID `0x00193700`, scratchpad `0x00020000`, and matching hashes. With multiple boards connected, confirm the USB device disappears when the target loses power. Use the actual uploaded and verified artifacts on the host; in PowerShell obtain length with `(Get-Item <file>).Length` and compare `Get-FileHash` results.

```sh
xfel write 0x20000 out/syterkit/build/yuzukineko/app_sram/xip-boot/xip-boot_fel.bin
```

Check the write result, then execute separately:

```sh
xfel exec 0x20000
```

NOR `0x20000` stores sampling parameters; RAM `0x20000` holds the loader. These are different address spaces. **Keep `xip-boot_spi.bin` out of the NOR boot area** to retain automatic FEL entry. Re-enter FEL for each download; after execution check the serial console rather than using `xfel read32`. See [SPI NOR layout and backup](../../boot/flash-layout.md).

## The common basis for NOR boot

The following retains the 4.2.2 standalone/UF2 installation and its pinned SyterKit revision. It accepts ordinary RAM images, changes automatic FEL entry, and is incompatible with the XIP development layout above.

Methods 2 and 3 both write the program into the onboard 16 MiB SPI NOR, and a loader in the Flash fetches it out and runs it at power-up. This section explains how that works and how to install the loader.

### How it works

| Content | NOR offset | Description |
| --- | --- | --- |
| Loader (three copies) | `0x000000` / `0x010000` / `0x020000` | SyterKit `flash-boot` |
| Saved Flash sample point | `0x02f000` | Maintained by the loader itself, <strong>do not overwrite</strong> |
| UF2 downloader (system program) | `0x030000` | Header page + image, up to `0x1CF000` bytes; needed only by method 3 |
| Application (your Zephyr program) | `0x200000` | Header page + image, up to `0x9F0000` bytes |

At power-up the BROM reads the loader into SRAM, the loader initializes PSRAM and the Flash controller, then chooses one of two paths:

- <strong>The button on PD5 is not held, and the application header page is valid</strong>: copy the application to PSRAM and run it.
- Otherwise: run the UF2 downloader, and the board appears on the USB port as the drive `F101BOOT`, waiting for a `.uf2` to be dragged in.

The application runs <strong>in PSRAM</strong> just as in method 1, not in place from Flash, so it is the same `zephyr.bin`. Each program is preceded by a 4 KiB <strong>header page</strong> that records the PSRAM address the image loads to (the default `0x40000000`) and its size. The header page is added automatically by `mkuf2.py`; you do not write it by hand.

:::caution
This layout is <strong>mutually incompatible</strong> with the layout of the [Linux + Buildroot](../linux/linux-prebuilt.md) and RustSBI + Asterinas images, and they must not be written mixed together. Switching over from those images requires reinstalling the loader. Before you start, back up the whole Flash following [SPI NOR layout and backup](../../boot/flash-layout.md).
:::

:::caution
Once NOR holds a valid loader, the board boots straight from Flash at power-up and <strong>no longer enters FEL on its own</strong>. From then on, every time you want to use xfel you must hold the FEL button while powering up, see [FEL download mode and tools](../../boot/fel.md#entering-fel).
:::

### Preparing the tools

`mkuf2.py` lives in the `zephyr-components` repository; it is a Python script that only needs the standard library, with no extra packages to install. For what the repository is for, see [Get zephyr-components](zephyr-get-source.md#applications-and-modules); if you have already cloned it, skip the `git clone` below:

```sh
cd ~/f101-zephyr
git clone https://github.com/YuzukiHD/zephyr-components.git
mkdir -p out
```

:::tip
The other directories in this repository are applications such as MicroPython and mGBA, each with its own git submodules. Only `uf2-downloader/` is used here; there is no need to run `git submodule update`.
:::

### Building the loader

```sh
cd ~/f101-zephyr
git clone https://github.com/YuzukiHD/SyterKit.git
cd SyterKit
git checkout 6ef3f27abd547439cb2de4e455e40a2cbfbebff8
export CROSS=$HOME/f101-zephyr/toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf-
make O=../out/syterkit CROSS_COMPILE=$CROSS yuzukineko_rv32_sram_defconfig
make O=../out/syterkit CROSS_COMPILE=$CROSS olddefconfig
make -j8 O=../out/syterkit CROSS_COMPILE=$CROSS flash-boot
cd ..
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-build-run/loader.cast" data-speed="3"></div>

The output is `out/syterkit/build/yuzukineko/app_sram/flash-boot/flash-boot_spi.bin` (32 KiB).

### Writing the loader

Enter FEL, back up the whole Flash first, then write the loader three times:

```sh
xfel version
xfel spinor read 0x0 0x1000000 neko-backup.bin

L=out/syterkit/build/yuzukineko/app_sram/flash-boot/flash-boot_spi.bin
xfel spinor write 0x000000 $L
xfel spinor write 0x010000 $L
xfel spinor write 0x020000 $L
```

`xfel spinor write` erases the sectors it needs automatically. Writing Flash does not require running `xfel ddr`.

Then continue according to the method you are using: method 2 writes the application, method 3 writes the UF2 downloader.

### Generating an image with a header page

`mkuf2.py` adds a header page to `zephyr.bin`. `--raw` outputs the raw Flash image, for use with `xfel spinor write`; without `--raw` it outputs a `.uf2` file.

```sh
python3 zephyr-components/uf2-downloader/tools/mkuf2.py app build/hello/zephyr/zephyr.bin --raw -o out/app.img
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-build-run/mkuf2.cast"></div>

The output is similar to `out/app.img: 2096208 bytes at 0x200000`. When the image is larger than the application area (`0x9F0000` bytes) the script reports an error and exits. The default load address is `0x40000000`, matching Zephyr's link address; when the image is linked elsewhere, specify it with `--load`.

## Method 2: write NOR directly with xfel

Without installing the UF2 downloader, use xfel each time to write the application to `0x200000` in NOR. Suited to the case where you only want one fixed program to run.

**Prerequisite**: the loader has been written into NOR as described under [The common basis for NOR boot](#the-common-basis-for-nor-boot) above.

**1. Generate the application image**

```sh
python3 zephyr-components/uf2-downloader/tools/mkuf2.py app build/hello/zephyr/zephyr.bin --raw -o out/app.img
```

**2. Enter FEL and write**

Hold the FEL button while powering up, then:

```sh
xfel version
xfel spinor write 0x200000 out/app.img
xfel reset
```

**3. Watch the console**

The loader prints its own log first, then runs your program:

```text
PSRAM: … MiB initialized
SPI NOR: flash id 0x…, … KiB
SPI NOR: image  0x00201000 -> 0x40000000 (… KiB)
starting at 0x40000000 (id 0)
```

Afterwards, for each code change: rebuild → `mkuf2.py app … --raw` → hold the FEL button while powering up → `xfel spinor write 0x200000` → `xfel reset`.

:::caution
With this method there is no UF2 downloader in Flash. If the application is written incorrectly or its header page is invalid, the loader finds no runnable program, reports `flash: no valid system program`, stops booting, and the board has no program output. In that case the only option is to enter FEL again and rewrite the application.
:::

## Method 3: UF2 drag-and-drop download

This is <strong>the general everyday download method</strong>. xfel is used only once at the very beginning, to install the UF2 downloader into NOR; afterwards you turn the application into a `.uf2` file and drag it into the USB drive the board shows, and FEL and xfel are no longer needed.

### Step one: install the UF2 downloader (once only)

**Prerequisite**: the loader has been written into NOR as described under [The common basis for NOR boot](#the-common-basis-for-nor-boot).

**1. Build the UF2 downloader and add the header page**

```sh
west build -b yuzukineko -d build/uf2 zephyr-components/uf2-downloader
python3 zephyr-components/uf2-downloader/tools/mkuf2.py system build/uf2/zephyr/zephyr.bin --raw -o out/sys.img
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/zephyr-build-run/downloader.cast"></div>

**2. Enter FEL and write**

Hold the FEL button while powering up, then:

```sh
xfel version
xfel spinor write 0x030000 out/sys.img
xfel reset
```

Here you do <strong>not write the application</strong>. When there is no valid application in Flash, the loader runs the downloader directly.

**3. Confirm the UF2 drive appears**

After the reset, connect to the computer with a USB data cable; the board should appear as the USB drive <strong>`F101BOOT`</strong>. Seeing this drive means the installation is complete.

### Step two: download an application with UF2 (the everyday flow)

Turn `zephyr.bin` into a `.uf2`:

```sh
python3 zephyr-components/uf2-downloader/tools/mkuf2.py app build/hello/zephyr/zephyr.bin -o out/app.uf2
```

The output is similar to `out/app.uf2: 2096208 bytes at 0x200000, 8189 UF2 blocks`. The `.uf2` file is about twice the size of `zephyr.bin`, because each block carries only 256 bytes of data.

Then:

1. Put the board into the UF2 downloader: <strong>hold the button on PD5, then power up</strong> (or reset). When there is no valid application in Flash the button is not needed, it enters automatically.
2. The board appears as the `F101BOOT` drive.
3. Copy `out/app.uf2` into this drive.
4. After the copy finishes the board restarts automatically, the loader runs the new application, and the console starts producing output.

Afterwards, for each code change: rebuild → `mkuf2.py app …` → hold the button while powering up → copy.

### The three kinds of uf2 files

| File type | Command | Write location | Range it can write |
| --- | --- | --- | --- |
| Application | `mkuf2.py app zephyr.bin -o x.uf2` | `0x200000` | Only the application area |
| The downloader itself | `mkuf2.py system zephyr.bin -o x.uf2` | `0x030000` | Any location |
| Loader | `mkuf2.py loader flash-boot_spi.bin -o x.uf2` | `0x000000` | Any location |

:::caution
An `app` file writes only to the application area, so a mistake at worst means the application will not run. `system` and `loader` files can write to any location; write them wrong and the board has no loader, and only FEL can rescue it. Only drag in files you trust, and do not cut power while writing.
:::

For more detail about UF2 see [UF2 drag-and-drop flashing](zephyr-uf2.md).

## Troubleshooting

<strong>Method 1: the console has no output after `exec`</strong>: first confirm the console wiring and parameters, and that `xfel ddr f101-s3` has been run. If there is still nothing, use the small bare-metal program mentioned in the "Console" section above to work out which link is at fault.

<strong>`mkuf2.py` reports `… bytes, the limit is 10420224`</strong>: the application exceeds the `0x9F0000`-byte application area. Make the program smaller, or drop features you do not need.

<strong>The `F101BOOT` drive does not appear</strong>: confirm you are using a USB-C cable with data lines, plugged into the download port; confirm you have held the button on PD5 before powering up. If it still does not appear, the loader or the downloader is not installed properly; hold the FEL button while powering up and rewrite them.

<strong>The board restarts after a copy or write but has no output</strong>: first use method 1 to load the same `zephyr.bin` into memory and run it, to see whether the program itself is fine, then investigate the image in NOR.

<strong>The board does nothing at all at power-up</strong>: the loader has been overwritten or written incorrectly. Hold the FEL button while powering up and rewrite the loader, or restore from the backup: `xfel spinor write 0x0 neko-backup.bin`.
