---
title: "启动链：从 FEL 到 S 态"
---

在 F101 上启动 EDK II 需要四个程序，外加一个硬件特性。这个特性是 C907 在复位时锁存 RV32 或 RV64，所以必须先由 32 位加载器切换核心，64 位代码才能运行。四个程序分别是 xfel 的 PSRAM 初始化、SyterKit 加载器、OpenSBI 和 EDK II 本身。

## 阶段

| 阶段 | 运行位置 | 入口 | 作用 |
| --- | --- | --- | --- |
| xfel | 主机，通过 USB | FEL | 用 S3 参数初始化 PSRAM |
| `loader.bin` | C907，RV32，SRAM | `0x20000` | 改写 RV64 复位向量并重启核心 |
| `fw_jump.bin` | C907，RV64，M 态 | `0x40f80000` | 提供 SBI 服务并启动负载 |
| `edk2.fd` | C907，RV64，S 态 | `0x40000000` | SEC、DXE、BDS 和 UEFI 启动菜单 |

打包好的 `run.sh` 负责 xfel 的几个写入步骤，然后执行加载器。下面说明每个阶段做了什么、读的是镜像的哪一部分。

## FEL 与 PSRAM

按住 FEL 键上电，或者 NOR 首扇区为空时，Boot ROM 进入 FEL。xfel 先执行 `xfel ddr f101-s3`，写入 F101S3 的 `dram_para` 表，把 `0x40000000` 的 16 MiB PSRAM 初始化好。EDK II 的内存映射就是按这个容量设计的。

S3 和 S4 需要不同的参数表。`xfel ddr f101-s3` 无法初始化 F101S4 的 32 MiB PSRAM。通用的 RAM 启动流程改用可返回的 SyterKit helper `init_psram_efex_s3.bin` 或 `init_psram_efex_s4.bin`，见 [PSRAM 初始化与 RAM 启动](../../boot/psram-init.md)。edk2-build 的平台是 EVB 目标，打包脚本保留 S3 命令。

## 加载器

`loader.bin` 是 SyterKit 的 `usb-boot-rv64i` 应用。构建时使用 `yuzukineko_rv32_sram_defconfig`，并在编译前应用 `patches/syterkit-f101-evb.patch`。补丁做两件事：

- 把 `usb-boot-rv64i` 加入 `yuzukineko` 板子的 SRAM 应用列表。
- 把板级控制台从 UART1（PB0/PB1）改成 UART3（PE8/PE9），也就是 EVB 的控制台。

加载器在 SRAM 的 `0x20000` 运行。它不复制 EDK II 镜像，镜像已经由 xfel 放进 PSRAM。它负责模式切换：改写复位向量，置位核心的 RV64 位，通过 RISC-V 看门狗重启核心。复位后进入一个小跳转桩，跳到 OpenSBI。

## OpenSBI

`fw_jump.bin` 来自 `opensbi` 子模块 [`YuzukiHD/opensbi`](https://github.com/YuzukiHD/opensbi) 的 `sun252i-f101` 分支，用玄铁 `linux-glibc` 工具链按 RV64 构建。OpenSBI 需要支持 PIE 的链接器，`elf-newlib` 工具链不提供。

OpenSBI 运行在 M 态。它装好陷阱处理，提供负载会用到的 SBI 服务（控制台、定时器、IPI、复位），然后在 S 态从 `0x40000000` 启动 EDK II SEC。hart ID 放在 `a0`，设备树地址放在 `a1`。

## 设备树

`dts/f101-evb.dts` 编译成 `f101-evb.dtb`，放在 `0x40f40000` 的 256 KiB 槽位里。它描述：

| 节点 | 地址 | 说明 |
| --- | --- | --- |
| `memory@40000000` | `0x40000000`，16 MiB | 唯一的 RAM 节点 |
| `clint@14000000` | `0x14000000` | `thead,c900-clint`，没有 64 位 MMIO |
| `interrupt-controller@10000000` | `0x10000000` | `thead,c900-plic`，191 个中断 |
| `serial@2500c00` | `0x2500c00` | UART3，`ns16550a`，24 MHz，115200 |
| `cpu@0` | — | RV64 `rv64imafdcsu_zicbom_zicboz_svpbmt`，Sv39 |

根节点的 `compatible` 必须包含 `allwinner,sun252i-f101`：

```dts
compatible = "allwinner,sun252i-f101", "allwinner,sun252iw2p1";
```

OpenSBI 用第一个字符串选择 F101 平台。没有它时，OpenSBI 退回通用平台，不会设置启用缓存的 C907 CSR。S 态会慢约 280 倍；仓库在这种状态下测到一个两条指令的循环要跑 358 个周期。

## 内存映射

| 地址 | 大小 | 镜像 | 写入方式 |
| --- | --- | --- | --- |
| `0x40000000` | 3 MiB 区域，实际约 0.7 MiB | `edk2.fd` | `xfel write` |
| `0x40300000` | 6 MiB | SEC 临时内存 | EDK II 运行时使用 |
| `0x40900000` | 约 6.25 MiB | 空闲 PSRAM | DXE 启动服务使用 |
| `0x40f40000` | 256 KiB | `f101-evb.dtb` | `xfel write` |
| `0x40f80000` | OpenSBI 大小 | `fw_jump.bin` | `xfel write` |
| `0x20000` | 加载器大小 | `loader.bin` | `xfel write`，然后 `exec` |

设备树和 OpenSBI 在主机上打包成一个 `dtb_sbi.bin`，xfel 只需要往 `0x40f40000` 写一次。文件的前 256 KiB 是补零的 DTB 槽位，OpenSBI 从 256 KiB 边界开始，对应 PSRAM 的 `0x40f80000`。

## 常见故障

- xfel 报 `No FEL device found`：板子不在 FEL，线缆没有数据线，或者 USB 驱动没装。见 [FEL 下载模式与工具](../../boot/fel.md)。
- 加载器启动了但没有任何输出：确认 `dtb_sbi.bin` 写到了 `0x40f40000`，以及 DTB 的 `compatible` 包含 `allwinner,sun252i-f101`。
- 串口没有输出：EVB 用 UART3（PE08/PE09）。YuzukiNeko 用 UART1（PB0/PB1），EVB 的加载器和设备树与它的控制台不匹配。
- 启动极慢：OpenSBI 走了通用平台。修正 `compatible` 字符串并重新生成 DTB。
- 镜像启动了但屏幕不亮：检查 PD22 的屏幕供电、PB0..PB3 的背光和 49 MHz RGB 时序，见[图形输出](display.md)。
