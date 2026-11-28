---
title: "平台固件：SEC、DXE 与启动管理器"
---

`F101Pkg` 是 EDK II 构建里的平台层。它沿用 `OvmfPkg/RiscVVirt` 的无 PEI 流程：SEC 从 OpenSBI 拿到设备树，从设备树读出内存映射，解压 DXE 固件卷，然后把控制权交给 DxeCore。平台没有 PEI、没有 PCI 枚举，也没有 ACPI。

## 包结构

| 路径 | 作用 |
| --- | --- |
| `F101Pkg/F101.dsc` | 平台描述：库类、PCD 和组件列表 |
| `F101Pkg/F101.fdf` | Flash 设备布局：`0x40000000` 的 3 MiB FD，内含压缩的 DXE 固件卷 |
| `F101Pkg/F101Pkg.dec` | 包 GUID 和版本 |
| `F101Pkg/Library/PlatformSecLib/` | SEC 入口、设备树交接、内存和 CPU HOB |
| `F101Pkg/Drivers/F101GopDxe/` | 图形输出和 sunxi 显示栈 |
| `F101Pkg/Drivers/F101SmbiosDxe/` | SMBIOS type 0、1、4、19 记录 |
| `dts/f101-evb.dts` | 供 OpenSBI 和负载使用的设备树 |
| `patches/syterkit-f101-evb.patch` | 加载器控制台和 `usb-boot-rv64i` 的改动 |
| `tests/sbi_hello/` | 检查 OpenSBI 和缓存的小型 S 态负载 |

## SEC 阶段

`SecEntry.S` 是 `0x40000000` 上执行的第一段代码。它把栈设在 SEC 临时内存顶部减去 4 KiB 交接区的位置，然后调用 `SecStartupPlatform`。这个函数把 hart ID 和设备树指针存进交接数据，再调用 `SecPEIlessStartup`。

`SecPEIlessStartup` 在临时内存顶部留出 16 KiB 栈，建立 HOB 链表，调用 `SecPlatformMain` 初始化内存、CPU 和平台设备，执行库构造函数，找到压缩固件卷，把它解压到临时内存，最后调用 `LoadDxeCoreFromFv`。

## 内存与 CPU HOB

`MemoryInitialization` 遍历设备树里 `device_type` 为 `memory` 的节点。它要求 `reg` 属性包含两个 64 位单元（基址和大小），把该范围发布为系统内存，并处理 `reserved-memory`：带 `no-map` 的节点标为 `EfiReservedMemoryType`，其余标为 `EfiBootServicesData`。它还断言 SEC 运行时地址转换是关闭的，并建立内存类型信息 HOB，供 DXE 核心计算内存池大小。

`CpuInitialization` 建立 CPU HOB（`BuildCpuHob(56, 32)`，与 RiscVVirt 平台一致）。`PlatformInitialization` 把设备树复制到分配的内存页，发布为 `gFdtHobGuid`，并把 `ns16550a` 串口的地址范围加入 MMIO 资源 HOB。RiscVVirt 还会查找 `qemu,fw-cfg-mmio` 和 `virtio,mmio`，这棵设备树里没有这些节点，所以不会添加任何东西。

## DXE 组件

| 分组 | 主要模块 |
| --- | --- |
| 架构协议 | `CpuDxeRiscV64`、`RuntimeDxe`、`EmuVariableFvbRuntimeDxe`、`FaultTolerantWriteDxe`、`VariableRuntimeDxe`、`WatchdogTimer`、`CpuTimerDxeRiscV64` |
| 控制台 | `F101GopDxe`、`GraphicsConsoleDxe`、`TerminalDxe`、`SerialDxe`、`ConPlatformDxe`、`ConSplitterDxe` |
| 存储 | `DiskIoDxe`、`PartitionDxe`、`FatPkg`、`EnglishDxe` |
| 启动管理器 | `BdsDxe`、`UiApp`、`DisplayEngineDxe`、`SetupBrowserDxe`、`DriverHealthManagerDxe` |
| 平台信息 | `SmbiosDxe`、`F101SmbiosDxe`、`HiiDatabaseDxe`、`ReportStatusCodeRouter`、`StatusCodeHandler` |

DXE 固件卷用 LZMA 压缩。FDF 把它包在 `FVMAIN_COMPACT` 里的 GUIDed section 中；SEC 解压该 section，DxeCore 从临时内存里的解压卷加载驱动。

## 变量

UEFI 变量使用 `EmuVariableFvbRuntimeDxe`，放在内存里，复位后丢失。存储大小如下：

| PCD | 值 |
| --- | --- |
| `PcdFlashNvStorageVariableSize` | `0x00020000` |
| `PcdFlashNvStorageFtwWorkingSize` | `0x00001000` |
| `PcdFlashNvStorageFtwSpareSize` | `0x00021000` |
| `PcdOvmfFlashNvStorageVariableBase` | `0x40000000` |

前两者之和不能超过备用区大小，基址必须指向可读内存。按上面的取值，`0x20000 + 0x1000 = 0x21000`，正好等于备用区。

## 控制台

负载使用 SBI debug console。SEC 链接 `BaseSerialPortLibRiscVSbiLib`，DXE 链接 `BaseSerialPortLibRiscVSbiLibRam`，两者都通过 `DBCN` 扩展发送字节。不经过 SBI 的状态码和调试输出改用 UART3 的 MMIO 寄存器：

| PCD | 值 |
| --- | --- |
| `PcdSerialUseMmio` | TRUE |
| `PcdSerialRegisterBase` | `0x02500c00` |
| `PcdSerialBaudRate` | 115200 |
| `PcdSerialClockRate` | 24000000 |
| `PcdSerialRegisterStride` | 4 |

BDS 启动 `UiApp`，后者把启动菜单画到 GOP 控制台和串口终端上。固件卷里包含 UEFI Shell，但 `PcdUefiShellDefaultBootEnable` 为 FALSE，所以默认进入菜单。`PcdPlatformBootTimeOut` 是 3 秒。

## SMBIOS

`SmbiosDxe` 安装协议后，`F101SmbiosDxe` 添加四条记录：

| 类型 | 内容 |
| --- | --- |
| 0 | BIOS 厂商和版本，来自 `PcdFirmwareVendor` 和 `PcdFirmwareVersionString` |
| 1 | 系统厂商 `Allwinner`，产品 `Allwinner F101 EVB`，版本 `1.0` |
| 4 | 处理器 `XuanTie C907 (RV64GCV)`，当前 600 MHz，最高 1008 MHz，单核 |
| 19 | 内存映射地址，`0x40000000` 起的 16 MiB |

启动菜单从这些记录读取型号、处理器和内存大小。新增板级变体时，板名和内存大小的修改从这里开始。

## 常用 PCD

| PCD | 值 | 作用 |
| --- | --- | --- |
| `PcdDebugPrintErrorLevel` | `0x80000000` | 只输出错误日志 |
| `PcdRiscVFeatureOverride` | `0xFFFFFFFFFFFFFFF1` | 启用 Zicbom 缓存指令 |
| `PcdMaxVariableSize` | `0x2000` | 单个变量的最大长度 |
| `PcdUefiShellDefaultBootEnable` | FALSE | 启动后进入菜单，不直接进 Shell |
| `PcdFirmwareVendor`、`PcdFirmwareVersionString` | `YuzukiHD`、`0.1 (Allwinner F101 EVB)` | 启动菜单和 SMBIOS 显示的内容 |
| `PcdOvmfFdBaseAddress`、`PcdOvmfFirmwareFdSize` | `0x40000000`、`0x300000` | FD 的链接和加载位置 |
| `PcdOvmfSecPeiTempRamBase`、`PcdOvmfSecPeiTempRamSize` | `0x40300000`、`0x600000` | SEC 临时内存 |
| `PcdFlashNvStorageVariableSize` 和 FTW 大小 | 见上文 | 模拟变量存储 |
| `PcdPlatformBootTimeOut` | 3 | 启动菜单等待的秒数 |

## 没有提供的部分

平台不提供 PEI、PCI、ACPI、`fw_cfg`、virtio、ramfb、网络、capsule 更新、secure boot 和 TPM。构建里只包含串口控制台、屏幕、启动菜单、FAT 卷和 SMBIOS 需要的驱动。这些限制在实际使用中的影响见[状态与已知限制](limits.md)。
