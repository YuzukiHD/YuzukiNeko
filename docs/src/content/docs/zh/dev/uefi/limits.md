---
title: "状态与已知限制"
---

启动链、串口控制台和图形输出已经在 F101 EVB 上跑通。UEFI 环境的其余部分要么能构建但没在板上实际运行，要么还没有实现。本页记录已验证的范围、缺失的功能，以及移植到其他板子需要做什么。

## 已验证

| 范围 | 检查内容 |
| --- | --- |
| 启动链 | FEL → SyterKit 加载器 → OpenSBI → EDK II SEC → DxeCore → BDS 能进入 UiApp 启动菜单 |
| 串口控制台 | SBI debug console 在 UART3 上以 115200 8N1 输出 |
| 图形 | GOP 驱动能在 1024×600 屏幕上扫描输出，启动菜单可以正常阅读 |
| Shell | UEFI Shell 存在于固件卷中 |

## 未实现

| 范围 | 状态 |
| --- | --- |
| USB 主机和键盘 | 未移植；唯一的输入是串口控制台 |
| SD 卡和 USB 存储 | FAT 驱动在，但后面没有块设备 |
| 持久化 UEFI 变量 | 模拟变量存储在内存里，复位后丢失 |
| 网络 | 没有网络栈和驱动 |
| Capsule 更新、secure boot、TPM | 关闭或不存在 |
| PCI 和 ACPI | 没有 PCI 主机桥，没有 ACPI 表；PCI 枚举关闭 |
| PEI | 平台沿用 RiscVVirt 的无 PEI 流程 |

## 已知问题

- 撕裂：帧缓冲在扫描输出的同时被原地绘制。双缓冲版本试过，实际使用更慢，已经回退。仓库里的下一步是在板上测 `Blt` 的耗时，再决定是否重试。
- UEFI Shell 不是默认启动项。能否从启动管理器列表里选中，还没有验证。
- 每个模块都会打印 `ProtectUefiImage failed to create image properties record`。使用 4 KB 段对齐会让 DxeCore 加载失败，所以没有保留该对齐。
- 打包步骤不生成 `out/f101-edk2/symbols/`；调试器需要使用 `Build/F101/<target>_GCC/RISCV64/` 里的模块 ELF。
- 仓库 README 说明 RELEASE 构建还没有在板上验证。`BUILD_TARGET` 默认是 RELEASE；需要 DEBUG 日志时改成 `BUILD_TARGET=DEBUG`。

## 调试选项

| 项目 | 作用 |
| --- | --- |
| `BUILD_TARGET=DEBUG` | EDK II DEBUG 构建；调试调用会编进去，输出仍由打印级别 PCD 过滤 |
| `DEBUG_WAIT=1` | `-D F101_DEBUG_WAIT=TRUE`；SEC 等待调试器，把 `mDebugWait` 置 0 后继续 |
| `NO_SCANOUT=1` | `-D F101_NO_SCANOUT=TRUE`；显示引擎不扫描输出，用于隔离显示问题 |
| `tests/sbi_hello/` | 使用 SBI 控制台和 cycle/time 计数器的小型 S 态负载 |

这些选项的用法见[构建与运行](build-run.md)。设备树和 280 倍降速的说明见[启动链](boot-chain.md)和[平台固件](platform.md)。

## 性能

设备树丢掉 `allwinner,sun252i-f101` 这个 compatible 字符串后，OpenSBI 会走通用平台，不会设置 C907 的缓存 CSR。S 态会慢约 280 倍；仓库测到一个两条指令的循环要跑 358 个周期。启动变慢时先检查 DTB。

显示路径是单缓冲，并且经过 `FrameBufferBltLib` 复制。启动菜单够用，但全屏重绘不快。显示引擎在内存总线上有优先级提升，RISC-V 核心有带宽上限，见[图形输出](display.md)。

## 兼容性

| 项目 | F101 EVB | YuzukiNeko |
| --- | --- | --- |
| 控制台 | UART3，PE08/PE09 | UART1，PB0/PB1 |
| 屏幕 | 1024×600 RGB666，49 MHz | 1024×768 MIPI DSI |
| PSRAM | 16 MiB，S3 | 16 MiB S3 / 32 MiB S4 |
| 加载器控制台 | 通过补丁改为 UART3 | 需要用 UART1 重新构建加载器 |
| 设备树 | `dts/f101-evb.dts` | 需要 YuzukiNeko 设备树 |
| SMBIOS | `Allwinner F101 EVB` | 需要修改产品名 |

## 移植到 YuzukiNeko

移植不只是改设备树。至少需要：

- 一份设备树，写清 YuzukiNeko 的内存大小、UART1 控制台和 DSI 屏幕资源。
- 一份显示板级描述：EVB 的链路是 PD0..PD22、PE6/PE7、PB0..PB3 上的 1024×600 RGB。YuzukiNeko 是 MIPI DSI，引脚、供电和背光接线都不同。显示栈里有 DSI 和 combo D-PHY 代码，但还没有对应的板级链路。
- 一个按 YuzukiNeko 控制台构建的加载器，或者一份保留 UART1 的补丁。
- 匹配的 PSRAM 参数：S3 用 `xfel ddr f101-s3`，S4 用 eFEX helper。
- 修改 SMBIOS 字符串和板级描述里的屏幕时序。

这些都不在当前仓库里。EVB 镜像只能当 EVB 固件用，不能当 YuzukiNeko 固件。
