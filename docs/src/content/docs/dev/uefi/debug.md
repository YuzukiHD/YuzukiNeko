---
title: "Debugging the firmware"
---

The firmware has no UEFI debug port and no operating system, so most debugging happens over the serial console and through build-time options. A debugger can still attach to the core with `DEBUG_WAIT`. This page covers the log levels, the DEBUG build, the two platform switches and the SBI hello payload that checks OpenSBI before EDK II is involved.

## Serial output

The release build sets `PcdDebugPrintErrorLevel` to `0x80000000`, which is `DEBUG_ERROR`. Only errors are printed. The DEBUG target compiles the `DEBUG()`, `INFO()` and `WARN()` calls into the image, but the same PCD still filters them; lower `PcdDebugPrintErrorLevel` if you need more output. The repository README expects the DEBUG target to show the log, so check this PCD first if the log stays silent.

The platform also sets `PcdStatusCodeUseSerial` to TRUE and `PcdStatusCodeUseMemory` to FALSE, so status codes go to the serial port rather than to a memory buffer.

Debug output that goes through the SBI debug console is available from the first SEC instruction. Output that does not go through SBI uses UART3 MMIO at `0x02500c00`, 24 MHz, 115200 8N1. Both paths end on PE08 (TX) / PE09 (RX).

## Build targets

| Target | How to build | What it changes |
| --- | --- | --- |
| `RELEASE` | `./build.sh all` | `-DMDEPKG_NDEBUG`, errors only, the default |
| `DEBUG` | `BUILD_TARGET=DEBUG ./build.sh all` | `DEBUG()`, `INFO()` and `WARN()` calls are compiled in; the PCD still filters the output |
| `NOOPT` | `BUILD_TARGET=NOOPT ./build.sh all` | No optimization; useful when a compiler optimization hides a bug |

The repository README notes that the RELEASE build has not been checked on the board. If a problem appears only in RELEASE, rebuild with DEBUG and compare the log.

## Build options

| Option | Effect |
| --- | --- |
| `DEBUG_WAIT=1` | Defines `F101_DEBUG_WAIT`. SEC sets `mDebugWait` to 1 and spins in `SecStartupPlatform` until a debugger sets it to 0. Attach the debugger before powering the board, or the firmware waits forever. |
| `NO_SCANOUT=1` | Defines `F101_NO_SCANOUT`. The GOP driver installs and the frame buffer is allocated, but `f101_display_show` and the backlight are skipped. Use it to separate a display fault from a firmware fault. |

Both options only affect the EDK II step. Rebuild the packaged output with `./build.sh edk2 package` after the other pieces exist.

## SBI hello payload

`tests/sbi_hello/` is a small S-mode payload that does not use EDK II. It prints through the SBI debug console, reads `rdtime`, and measures a two-instruction loop and a load loop to show whether the caches are enabled. It is linked at `0x40000000`, the address OpenSBI jumps to.

Build it with the glibc toolchain and link it with the supplied script:

```sh
riscv64-unknown-linux-gnu-gcc -nostdlib -T tests/sbi_hello/link.ld tests/sbi_hello/hello.S -o sbi_hello.elf
riscv64-unknown-linux-gnu-objcopy -O binary sbi_hello.elf sbi_hello.bin
```

Run it the same way as EDK II, with the payload in place of `edk2.fd`:

```sh
xfel ddr f101-s3
xfel write 0x40000000 sbi_hello.bin
xfel write 0x40f40000 out/f101-edk2/dtb_sbi.bin
xfel write 0x20000 out/f101-edk2/loader.bin
xfel exec 0x20000
```

The payload prints `S-mode payload started by OpenSBI`, the hart ID, the device tree address, the cycle and time counts of both loops, and then `payload done`. If the cycle count of the two-instruction loop is around 358 instead of a few cycles per iteration, the device tree `compatible` is wrong and OpenSBI did not enable the caches.

## Common log messages

Most of these are `DEBUG_INFO`; the default build prints errors only, so they appear after lowering `PcdDebugPrintErrorLevel` or in a build that enables them.

| Message | Meaning |
| --- | --- |
| `F101Gop: panel 1024x600 @ N Hz` | The display pipeline came up; N is the refresh rate calculated from the panel mode |
| `F101Gop: graphics output installed: Success` | The GOP protocol is installed and the boot menu can use it |
| `F101Gop: the display pipeline did not come up` | The display stack failed to probe; check the panel supply and the device tree |
| `F101Smbios: add type N: ...` | An SMBIOS record could not be added; usually a memory allocation failure |
| `ProtectUefiImage failed to create image properties record` | Known message from every module; the 4 KB section alignment that would avoid it makes DxeCore fail to load |

## Symbols

The package step does not generate `out/f101-edk2/symbols/`. The module ELFs are under `Build/F101/<target>_GCC/RISCV64/`, and `f101.elf` or the individual module ELFs can be loaded into a debugger. The FD itself is raw; use the ELF, not the FD, for symbol resolution.

## Checklist

When the board does not reach the boot menu, check these in order:

- The DTB `compatible` contains `allwinner,sun252i-f101`.
- `dtb_sbi.bin` is at `0x40f40000` and `loader.bin` is at `0x20000`.
- The console is UART3 on PE08/PE09 at 115200 8N1.
- The PSRAM table matches the board: `xfel ddr f101-s3` for the EVB, the eFEX helper for an S4 board.
- `DEBUG_WAIT` is not set by accident.
- The display fault is separated from the firmware fault with `NO_SCANOUT=1`.
