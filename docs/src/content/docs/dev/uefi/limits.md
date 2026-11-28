---
title: "Status and known limits"
---

The boot chain, the serial console and the graphics output have run on the F101 EVB. The rest of the UEFI environment is built but not exercised on the board, or not implemented. This page records what is verified, what is missing and what a port to another board needs.

## Verified on the board

| Area | What was checked |
| --- | --- |
| Boot chain | FEL → SyterKit loader → OpenSBI → EDK II SEC → DxeCore → BDS reaches the UiApp boot menu |
| Serial console | SBI debug console output at 115200 8N1 on UART3 |
| Graphics | GOP driver scans out the 1024×600 panel; the boot menu is readable |
| Shell | The UEFI Shell is present in the firmware volume |

## Not implemented

| Area | State |
| --- | --- |
| USB host and keyboard | Not ported; the only input is the serial console |
| SD card and USB storage | The FAT driver is present, but there is no block device behind it |
| Persistent UEFI variables | The emulated store is in RAM and is lost at reset |
| Networking | No network stack or driver |
| Capsule updates, secure boot, TPM | Disabled or absent |
| PCI and ACPI | No PCI host bridge, no ACPI tables; PCI enumeration is disabled |
| PEI | The platform follows the PEI-less RiscVVirt flow |

## Known issues

- Tearing: the frame buffer is drawn in place while it is scanned out. A double-buffered version was tried and reverted because it was slower in use. The next step in the repository is to time `Blt` on the board before trying again.
- The UEFI Shell is not a default boot option. Whether it can be selected from the Boot Manager list has not been checked.
- Every module logs `ProtectUefiImage failed to create image properties record`. Linking with 4 KB section alignment made DxeCore fail to load, so that alignment was not kept.
- The package step does not generate `out/f101-edk2/symbols/`; a debugger needs the module ELF from `Build/F101/<target>_GCC/RISCV64/`.
- The repository README notes that the RELEASE build has not been checked on the board. `BUILD_TARGET` defaults to RELEASE; use `BUILD_TARGET=DEBUG` when a problem needs the DEBUG log.

## Debug options

| Item | Effect |
| --- | --- |
| `BUILD_TARGET=DEBUG` | EDK II DEBUG build; the debug calls are compiled in, the print level PCD still filters them |
| `DEBUG_WAIT=1` | `-D F101_DEBUG_WAIT=TRUE`; SEC waits for a debugger, set `mDebugWait` to 0 to continue |
| `NO_SCANOUT=1` | `-D F101_NO_SCANOUT=TRUE`; the display engine does not scan out, to isolate display faults |
| `tests/sbi_hello/` | a small S-mode payload that uses the SBI console and the cycle/time counters |

The commands for these options are in [building and running](build-run.md). The device tree and the 280× slowdown are explained in [boot chain](boot-chain.md) and [platform firmware](platform.md).

## Performance

If the device tree loses the `allwinner,sun252i-f101` compatible string, OpenSBI falls back to its generic platform and does not set the C907 cache CSRs. S mode then runs about 280 times slower; the repository measured a two-instruction loop at 358 cycles. Check the DTB before debugging a slow boot.

The display path is single-buffered and copies through `FrameBufferBltLib`. The boot menu is comfortable, but a full-screen redraw is not fast. The display engine has a priority boost on the memory bus and the RISC-V core has a bandwidth limit; see [graphics output](display.md).

## Compatibility

| Item | F101 EVB | YuzukiNeko |
| --- | --- | --- |
| Console | UART3, PE08/PE09 | UART1, PB0/PB1 |
| Panel | 1024×600 RGB666, 49 MHz | 1024×768 MIPI DSI |
| PSRAM | 16 MiB, S3 | 16 MiB S3 / 32 MiB S4 |
| Loader console | UART3 via the patch | Needs a loader built for UART1 |
| Device tree | `dts/f101-evb.dts` | Needs a YuzukiNeko device tree |
| SMBIOS | `Allwinner F101 EVB` | Needs the product name changed |

## Porting to YuzukiNeko

A port is more than a device tree edit. The minimum set is:

- A device tree with the YuzukiNeko memory size, the UART1 console and the DSI panel resources.
- A display board description: the EVB graph is 1024×600 RGB on PD0..PD22, PE6/PE7 and PB0..PB3. The YuzukiNeko panel is MIPI DSI and uses different pins, supply and backlight wiring. The display stack has DSI and combo D-PHY code, but no board graph for it yet.
- A loader built with the YuzukiNeko console, or a patch that leaves UART1 in place.
- The matching PSRAM table: `xfel ddr f101-s3` for S3, the eFEX helper for S4.
- SMBIOS strings and the panel timing in the board description.

None of these are in the current repository. Treat the EVB image as an EVB image, not as a YuzukiNeko firmware.
