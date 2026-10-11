# RustSBI + Asterinas

The repository directory `02_Firmware/RustSBI-Asterinas/` provides an SPI NOR boot image for the YuzukiNeko **F101-S3**. The boot chain is:

```
BROM → SyterKit → RustSBI → Asterinas → BusyBox shell
```

The image is tested on boards with **16 MiB RAM + 16 MiB SPI NOR**.

## File List

| File | Purpose | Size (bytes) |
| --- | --- | ---: |
| `syterkit-3bf4f61f.bin` | SyterKit with an eGON boot header; initializes RAM and loads the following images | 49,152 |
| `rustsbi-0.4.1.bin` | RustSBI 0.4.1, customized for the Neko RV32 scalar extensions, WARN-level logging | 270,336 |
| `asterinas.bin` | Raw Asterinas RV32 kernel image | 2,762,160 |
| `yuzukineko-rustsbi-asterinas.img` | Complete boot image: the three above + device tree + initramfs containing BusyBox | 7,143,424 |
| `SHA256SUMS` | SHA-256 of the four images above | — |
| `manifest.json` | Source versions, Flash layout and verification information | — |
| `licenses/` | Licenses and third-party notices | — |

Single images are `.bin`; the combined image is `.img`. The `.img` is **raw SPI NOR data** assembled at fixed offsets; it is neither a PhoenixSuit container nor a disk image with a partition table.

## Flashing the Full Image

**Windows, Linux and macOS can all be the flashing host.** First install xfel or rfel as described in [FEL Download Mode and Tools](../../boot/fel.md). The steps below assume the tool is in `PATH` and the terminal is in the directory containing the images.

Use the full image for a first installation or when switching from other firmware. It writes NOR `0x000000..0x6d0000`, and `0x6d0000..0x1000000` is unaffected. "Full" means the file contains everything needed to boot; it is not padded to the whole 16 MiB. To keep the original firmware, [back it up](../../boot/flash-layout.md#back-up-the-whole-flash) first.

1. Hold the **FEL** button, replug the USB data cable, and release.
2. Check the chip and Flash:
   ```sh
   xfel version
   xfel spinor
   ```
   It should identify an F101 with chip ID `0x00193700` and a 16 MiB Flash. This step does **not** need the `ddr` command.
3. Write and read back:
   ```sh
   xfel spinor write 0x0 yuzukineko-rustsbi-asterinas.img
   xfel spinor read 0x0 0x6d0000 readback.img
   ```
   rfel works the same way; replace `xfel` with `rfel`.
4. Compute the SHA-256 of the original image and of `readback.img`, and confirm they match each other and the value recorded in `SHA256SUMS` (the SHA-256 of the full image is `368b658f93cb921a66c690a1ae26def95fbb500d0098b955695cebb977228cc5`). If there are errors or a mismatch, fix the problem before booting.
5. Release the FEL button and reset:
   ```sh
   xfel reset
   ```

### Connecting the Serial Port

Connect to the board's UART at **115200 baud, 8N1, no flow control**. After boot you land in the BusyBox shell. RustSBI uses WARN-level logging, so its INFO banner is not visible in a normal boot.

?> The documentation of this package does not state which header pins the console is wired to. Check the serial pins against the [schematics](../../hardware/files.md).

## Replacing Individual Components

Prerequisite: the board already has the full image from this directory installed. Hold FEL, replug USB, and check the device with `version` and `spinor` first.

In this layout the Flash offsets and RAM load addresses differ; use the **NOR offsets** below:

| Component | NOR offset | Reserved in this layout | RAM load address |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| Device tree (in the full image) | `0x010000` | 256 KiB | `0x40f40000` |
| RustSBI | `0x050000` | 512 KiB | `0x40f80000` |
| Asterinas | `0x0d0000` | 5 MiB, up to the initramfs | `0x40000000` |
| initramfs (in the full image) | `0x5d0000` | 1 MiB | `0x40500000` |

These size limits apply only to this image layout. When building your own, you must also ensure the entry point, load addresses, device tree and memory usage are mutually compatible; the binary size alone is not enough. In particular, the memory RustSBI uses at runtime (including BSS, stack and heap) must fall within its reserved region.

Choose the write commands you need; replacing one component does not require rewriting the others:

```sh
xfel spinor write 0x0 syterkit-3bf4f61f.bin
xfel spinor write 0x50000 rustsbi-0.4.1.bin
xfel spinor write 0xd0000 asterinas.bin
```

After writing, read back the corresponding range according to the actual file size and verify it. For example, after replacing RustSBI:

```sh
xfel spinor read 0x50000 0x42000 rustsbi-readback.bin
```

`0x42000` is the size of this package's RustSBI file (270,336 bytes); for other versions, adjust the length to the actual size. Once the SHA-256 of the readback matches the written file, run `xfel reset`.

!> Writing these three images alone does **not** install the device tree and root filesystem; the first installation must use the full image.

## After Boot

In the BusyBox shell, run:

```sh
/root/run-demos.sh
```

It runs nine demos. Other notes:

- The serial input of this package is sensitive to **long pasted strings**; you can set the terminal's send delay to about **20 ms per character**.
- `reboot` restarts the system.
- `poweroff` halts the system, but the board is still powered over USB, so it **does not cut the power**.

## Component Versions

From `manifest.json`:

| Component | Version / commit | Notes |
| --- | --- | --- |
| SyterKit | Based on `3bf4f61f` | Neko SPI NOR loader and Asterinas handoff; not an unmodified upstream build |
| RustSBI | 0.4.1 (`4068e0d0`) | Color-stripping patch, Neko RV32 scalar target, WARN logging |
| Asterinas | Based on `db0d7958` | Neko RV32 port and BusyBox integration |
| BusyBox | 1.37.0 | Static RV32GC ILP32D musl build |
| musl | 1.2.5 | |

## Verification Record

Verified on 2026-09-12 on a Yuzuki Neko F101-S3 board: the Flash readback matches the image SHA-256; SPI NOR boot reaches the BusyBox shell; nine demos pass.

## License

The firmware and its third-party software follow their own licenses, and the repository's CC0 statement **does not apply** to them. The license texts and sources of the four components are in `licenses/README.md` in the repository.
