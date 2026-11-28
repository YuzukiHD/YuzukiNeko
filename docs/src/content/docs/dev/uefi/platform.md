---
title: "Platform firmware: SEC, DXE and the boot manager"
---

`F101Pkg` is the platform layer of the EDK II build. It follows the PEI-less `OvmfPkg/RiscVVirt` flow: SEC gets the device tree from OpenSBI, reads the memory map from it, decompresses the DXE firmware volume, and hands control to DxeCore. There is no PEI, no PCI enumeration and no ACPI.

## Package layout

| Path | Role |
| --- | --- |
| `F101Pkg/F101.dsc` | Platform description: library classes, PCDs and the component list |
| `F101Pkg/F101.fdf` | Flash device layout: a 3 MiB FD at `0x40000000` with a compressed DXE firmware volume |
| `F101Pkg/F101Pkg.dec` | Package GUID and version |
| `F101Pkg/Library/PlatformSecLib/` | SEC entry, device tree handoff, memory and CPU HOBs |
| `F101Pkg/Drivers/F101GopDxe/` | Graphics output and the sunxi display stack |
| `F101Pkg/Drivers/F101SmbiosDxe/` | SMBIOS type 0, 1, 4 and 19 records |
| `dts/f101-evb.dts` | Device tree for OpenSBI and the payload |
| `patches/syterkit-f101-evb.patch` | Loader console and `usb-boot-rv64i` changes |
| `tests/sbi_hello/` | Small S-mode payload for checking OpenSBI and the caches |

## SEC phase

`SecEntry.S` is the first code that runs at `0x40000000`. It sets the stack to the top of the SEC temporary RAM, minus the 4 KiB handoff area, and calls `SecStartupPlatform`. That function stores the hart ID and the device tree pointer in the handoff data and calls `SecPEIlessStartup`.

`SecPEIlessStartup` reserves a 16 KiB stack at the top of the temporary RAM, builds the HOB list, calls `SecPlatformMain` to initialize memory, CPU and platform devices, runs the library constructors, finds the compressed firmware volume, decompresses it into the temporary RAM and calls `LoadDxeCoreFromFv`.

## Memory and CPU HOBs

`MemoryInitialization` walks the device tree for nodes whose `device_type` is `memory`. It expects the `reg` property to hold two 64-bit cells (base and size), publishes the range as system memory, and marks the `reserved-memory` entries: a node with `no-map` becomes `EfiReservedMemoryType`, the others become `EfiBootServicesData`. It also asserts that SEC runs with address translation off, and builds the memory type information HOB that the DXE core uses to size its pools.

`CpuInitialization` builds the CPU HOB (`BuildCpuHob(56, 32)`, as the RiscVVirt platform does). `PlatformInitialization` copies the device tree into allocated pages, publishes it as `gFdtHobGuid`, and adds the `ns16550a` UART range to the MMIO resource HOBs. The QEMU compatibles that the RiscVVirt code also looks for (`qemu,fw-cfg-mmio`, `virtio,mmio`) have no nodes in this device tree, so they add nothing.

## DXE components

| Group | Main modules |
| --- | --- |
| Architectural protocols | `CpuDxeRiscV64`, `RuntimeDxe`, `EmuVariableFvbRuntimeDxe`, `FaultTolerantWriteDxe`, `VariableRuntimeDxe`, `WatchdogTimer`, `CpuTimerDxeRiscV64` |
| Console | `F101GopDxe`, `GraphicsConsoleDxe`, `TerminalDxe`, `SerialDxe`, `ConPlatformDxe`, `ConSplitterDxe` |
| Storage | `DiskIoDxe`, `PartitionDxe`, `FatPkg`, `EnglishDxe` |
| Boot manager | `BdsDxe`, `UiApp`, `DisplayEngineDxe`, `SetupBrowserDxe`, `DriverHealthManagerDxe` |
| Platform information | `SmbiosDxe`, `F101SmbiosDxe`, `HiiDatabaseDxe`, `ReportStatusCodeRouter`, `StatusCodeHandler` |

The DXE firmware volume is compressed with LZMA. The FDF wraps it in a GUIDed section inside `FVMAIN_COMPACT`; SEC decompresses the section and DxeCore dispatches the drivers from the decompressed volume in the temporary RAM.

## Variables

UEFI variables use `EmuVariableFvbRuntimeDxe`, so they live in RAM and disappear at reset. The store is sized as follows:

| PCD | Value |
| --- | --- |
| `PcdFlashNvStorageVariableSize` | `0x00020000` |
| `PcdFlashNvStorageFtwWorkingSize` | `0x00001000` |
| `PcdFlashNvStorageFtwSpareSize` | `0x00021000` |
| `PcdOvmfFlashNvStorageVariableBase` | `0x40000000` |

The first two must not exceed the spare size, and the base must point at readable memory. With the values above, `0x20000 + 0x1000 = 0x21000`, exactly the spare size.

## Console

The payload uses the SBI debug console. SEC links `BaseSerialPortLibRiscVSbiLib`, DXE links `BaseSerialPortLibRiscVSbiLibRam`; both send bytes through the `DBCN` extension. Status codes and debug output that do not go through SBI use the UART3 MMIO registers instead:

| PCD | Value |
| --- | --- |
| `PcdSerialUseMmio` | TRUE |
| `PcdSerialRegisterBase` | `0x02500c00` |
| `PcdSerialBaudRate` | 115200 |
| `PcdSerialClockRate` | 24000000 |
| `PcdSerialRegisterStride` | 4 |

BDS starts `UiApp`, which draws the boot menu on the GOP console and on the serial terminal. The UEFI Shell is included in the firmware volume, but `PcdUefiShellDefaultBootEnable` is FALSE, so the menu is the default. `PcdPlatformBootTimeOut` is 3 seconds.

## SMBIOS

`F101SmbiosDxe` adds four records after `SmbiosDxe` has installed the protocol:

| Type | Content |
| --- | --- |
| 0 | BIOS vendor and version from `PcdFirmwareVendor` and `PcdFirmwareVersionString` |
| 1 | System manufacturer `Allwinner`, product `Allwinner F101 EVB`, version `1.0` |
| 4 | Processor `XuanTie C907 (RV64GCV)`, 600 MHz current, 1008 MHz maximum, one core |
| 19 | Memory array mapped address, 16 MiB starting at `0x40000000` |

The boot menu reads the model, processor and memory size from these records. Changing the board name or the memory size in a new variant starts here.

## PCDs worth knowing

| PCD | Value | Why it matters |
| --- | --- | --- |
| `PcdDebugPrintErrorLevel` | `0x80000000` | Logs errors only |
| `PcdRiscVFeatureOverride` | `0xFFFFFFFFFFFFFFF1` | Enables the Zicbom cache instructions |
| `PcdMaxVariableSize` | `0x2000` | Maximum size of one variable |
| `PcdUefiShellDefaultBootEnable` | FALSE | The firmware starts in the menu, not the shell |
| `PcdFirmwareVendor`, `PcdFirmwareVersionString` | `YuzukiHD`, `0.1 (Allwinner F101 EVB)` | Shown by the boot menu and SMBIOS |
| `PcdOvmfFdBaseAddress`, `PcdOvmfFirmwareFdSize` | `0x40000000`, `0x300000` | Where the FD is linked and loaded |
| `PcdOvmfSecPeiTempRamBase`, `PcdOvmfSecPeiTempRamSize` | `0x40300000`, `0x600000` | SEC temporary RAM |
| `PcdFlashNvStorageVariableSize` and the FTW sizes | see above | The emulated variable store |
| `PcdPlatformBootTimeOut` | 3 | Seconds the boot menu waits |

## What is left out

The platform does not provide PEI, PCI, ACPI, `fw_cfg`, virtio, ramfb, networking, capsule updates, secure boot or TPM. Only the drivers needed for the serial console, the panel, the boot menu, FAT volumes and SMBIOS are included. See [status and known limits](limits.md) for what this means in practice.
