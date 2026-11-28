---
title: "图形输出与显示栈"
---

`F101GopDxe` 把板子的屏幕变成 UEFI 图形控制台。它管理一块 32 位帧缓冲，通过显示引擎扫描输出，并用 `FrameBufferBltLib` 实现 `EFI_GRAPHICS_OUTPUT_PROTOCOL`。显示链路本身是 sunxi 显示栈，配上一层 EDK II 的 OS 适配后编进驱动。

## 链路

| 节点 | 资源 | 作用 |
| --- | --- | --- |
| `display-engine@5000000` | MMIO `0x05000000`，2 MiB | 合成图层并扫描输出 |
| `tcon-top@5460000` | MMIO `0x05460000`，4 KiB | 把 TCON 输出接到编码器 |
| `tcon-lcd@5461000` | MMIO `0x05461000`，4 KiB，IRQ 90 | LCD 时序发生器 |
| `rgb` | — | 并行 RGB 编码器，18 位 RGB666 |
| `panel` | — | 只有一个 1024×600 模式的简单屏幕 |
| `backlight` | PWM_BL | PB0..PB3 上的背光 |

链路在 `F101Pkg/Drivers/F101GopDxe/dpy_board_f101.c` 里描述。`f101_display.c` 还会先提高显示引擎在内存总线上的优先级，并给 RISC-V 核心设置带宽上限，然后探测链路。

## 屏幕与时序

| 参数 | 值 |
| --- | --- |
| 像素时钟 | 49 MHz |
| 水平 | 可见 1024，同步起点 1185，同步终点 1205，总长 1240 |
| 垂直 | 可见 600，同步起点 615，同步终点 625，总长 650 |
| 同步极性 | 均为低有效 |
| 总线格式 | `RGB666_1X18` |
| 屏幕尺寸 | 154 mm × 86 mm |
| 屏幕供电 | PD22 拉高，延时 30 ms |
| 使能延时 | 50 ms |

屏幕描述里只有这一个模式。GOP 驱动只报告 0 号模式，`SetMode(0)` 会把屏幕清成黑色。运行时不支持切换模式。

## 引脚

| 引脚 | 功能 | 用途 |
| --- | --- | --- |
| PD0..PD9 | 复用 2 | RGB 数据 |
| PD12..PD21 | 复用 2 | RGB 数据 |
| PE6、PE7 | 复用 4 | 像素时钟和数据使能 |
| PB0..PB3 | 复用 2 | PWM 背光 |
| PD22 | GPIO 输出 | 屏幕供电开关 |

`rgb_swap` 为 5，这是屏幕在 RGB666 总线上要求的位交换。PD22 在屏幕的上电序列里拉高，在下电序列里拉低。

## GOP

`F101GopEntry` 映射寄存器、初始化链路、用 `AllocatePages` 从启动服务内存分配帧缓冲、清零、回写数据缓存并启动扫描输出。然后安装一个厂商设备路径和 `EFI_GRAPHICS_OUTPUT_PROTOCOL`。

模式信息如下：

| 字段 | 值 |
| --- | --- |
| Version | 0 |
| 分辨率 | 1024 × 600 |
| 像素格式 | `PixelBlueGreenRedReserved8BitPerColor`（B8G8R8X8） |
| 每行像素数 | 1024 |
| 帧缓冲 | 从启动服务内存分配 |

`Blt` 转给 `FrameBufferBlt`，然后对 `EfiBltVideoFill`、`EfiBltBufferToVideo` 和 `EfiBltVideoToVideo` 回写受影响的行。从帧缓冲读回（`EfiBltVideoToBltBuffer`）不需要回写。显示引擎直接读内存，所以缓存回写决定了一次绘制能不能显示出来。

## MMIO 与 MMU

CPU 开启 MMU 运行。驱动把它访问的寄存器窗口以非缓存 MMIO 加入 GCD：

| 基址 | 大小 | 模块 |
| --- | --- | --- |
| `0x02000000` | 64 KiB | PIO、CCU、PWM_BL |
| `0x03000000` | 64 KiB | SYSCFG、SID |
| `0x03102000` | 4 KiB | MBUS |
| `0x05000000` | 2 MiB | 显示引擎 |
| `0x05460000` | 8 KiB | TCON top 和 TCON LCD |

访问不在内存映射里的区间会触发页错误。显示栈不能直接使用设备树里的物理地址，EDK II 的适配层必须先把这个区间加进去。

## OS 适配

显示栈原本是给操作系统写的，`dpy_os_edk2.c` 提供它需要的接口：

- 通过 `AllocatePool` 和 `AllocateAlignedPages` 分配内存。
- DMA 内存按整页分配，块前面留一个大小头，缓存维护不会碰到相邻数据。
- `ioremap` 是一一映射。
- 时间来自 `MicroSecondDelay` 和 `rdtime` CSR。
- 用轮询定时器代替中断：EDK II 的定时器事件每毫秒运行一次，调用中断处理函数，没有真正的中断分发。
- 锁通过 `RaiseTPL(TPL_NOTIFY)` 和 `RestoreTPL` 实现，在单核上挡住轮询处理函数。
- 信号量按 1 ms 步长等待，等待期间定时器事件继续运行。

`edk_glue.c` 里是内存、缓存、时间和日志的辅助函数。显示栈自己的日志走 `DEBUG()`；默认构建只输出错误。

## 背光

背光是 PB0..PB3 上的 PWM_BL 通道 0。板级描述把周期设为 20 µs（50 kHz），极性反转，范围 0..255，默认亮度 250。第一次扫描输出后，`F101GopEntry` 把亮度设为 255。背光没有对应的 UEFI 协议，改亮度需要改驱动，或者从 UEFI 应用直接操作同一组寄存器。

## 已知行为

- 帧缓冲在扫描输出的同时被原地绘制。重绘时可能出现撕裂。
- 双缓冲版本试过，实际使用更慢，已经回退。仓库里的下一步是在板上测 `Blt` 的耗时，再决定是否重试。
- `NO_SCANOUT=1 ./build.sh edk2 package` 会定义 `F101_NO_SCANOUT`。GOP 驱动仍然安装，帧缓冲仍然分配，但跳过 `f101_display_show` 和背光。这样可以把显示问题和固件其余部分分开。

## 换用其他屏幕

板级描述和 EVB 绑定：1024×600 RGB、PD0..PD22、PE6/PE7、PB0..PB3 和 PD22。YuzukiNeko 是 1024×768 MIPI DSI 屏，背光和供电接线也不同。显示栈里有 DSI 和 combo D-PHY 代码，但 EVB 的链路没有用到。支持另一块屏幕需要增加一份板级描述，写清节点、链路、引脚、时序和屏幕命令，再在 GOP 驱动里选择它。同一套硬件在 Zephyr 侧的说明见 [Zephyr 显示驱动](../zephyr/drivers/display.md)。
