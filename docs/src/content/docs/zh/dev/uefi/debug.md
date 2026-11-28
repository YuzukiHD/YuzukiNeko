---
title: "调试固件"
---

固件没有 UEFI 调试口，也没有操作系统，大部分调试都靠串口和构建期选项。调试器仍可以通过 `DEBUG_WAIT` 挂到核心上。本页说明日志级别、DEBUG 构建、两个平台开关，以及在 EDK II 之前检查 OpenSBI 的 SBI hello 负载。

## 串口输出

Release 构建把 `PcdDebugPrintErrorLevel` 设为 `0x80000000`，也就是 `DEBUG_ERROR`，只打印错误。DEBUG 构建会把 `DEBUG()`、`INFO()`、`WARN()` 调用编进镜像，但同一个 PCD 仍然过滤输出；需要更多日志时降低 `PcdDebugPrintErrorLevel`。仓库 README 期望 DEBUG 构建能显示日志，如果日志仍然没有输出，先检查这个 PCD。

平台还把 `PcdStatusCodeUseSerial` 设为 TRUE，把 `PcdStatusCodeUseMemory` 设为 FALSE，状态码走串口而不是内存缓冲。

走 SBI debug console 的调试输出从 SEC 第一条指令起就能用。不经过 SBI 的输出走 UART3 MMIO，基址 `0x02500c00`，24 MHz，115200 8N1。两条路最终都在 PE08（TX）/ PE09（RX）上。

## 构建目标

| 目标 | 构建方式 | 变化 |
| --- | --- | --- |
| `RELEASE` | `./build.sh all` | `-DMDEPKG_NDEBUG`，只输出错误，默认值 |
| `DEBUG` | `BUILD_TARGET=DEBUG ./build.sh all` | 编进 `DEBUG()`、`INFO()`、`WARN()` 调用；输出仍由 PCD 过滤 |
| `NOOPT` | `BUILD_TARGET=NOOPT ./build.sh all` | 不做优化；编译器优化掩盖问题时使用 |

仓库 README 说明 RELEASE 构建还没有在板上验证。如果问题只在 RELEASE 出现，改用 DEBUG 重建并对比日志。

## 构建选项

| 选项 | 作用 |
| --- | --- |
| `DEBUG_WAIT=1` | 定义 `F101_DEBUG_WAIT`。SEC 把 `mDebugWait` 置 1，在 `SecStartupPlatform` 里循环等待，直到调试器把它改成 0。先接好调试器再上电，否则固件会一直等下去。 |
| `NO_SCANOUT=1` | 定义 `F101_NO_SCANOUT`。GOP 驱动仍然安装，帧缓冲仍然分配，但跳过 `f101_display_show` 和背光。用来把显示故障和固件故障分开。 |

两个选项都只影响 EDK II 步骤。其他部分已经构建好后，用 `./build.sh edk2 package` 重新打包。

## SBI hello 负载

`tests/sbi_hello/` 是一个不依赖 EDK II 的 S 态小负载。它通过 SBI debug console 打印，读取 `rdtime`，并测量一个两条指令的循环和一个加载循环，用来判断缓存有没有启用。它链接在 `0x40000000`，也就是 OpenSBI 跳转的地址。

用 glibc 工具链编译，并链接仓库自带的脚本：

```sh
riscv64-unknown-linux-gnu-gcc -nostdlib -T tests/sbi_hello/link.ld tests/sbi_hello/hello.S -o sbi_hello.elf
riscv64-unknown-linux-gnu-objcopy -O binary sbi_hello.elf sbi_hello.bin
```

运行方式和 EDK II 相同，只是把 `edk2.fd` 换成这个负载：

```sh
xfel ddr f101-s3
xfel write 0x40000000 sbi_hello.bin
xfel write 0x40f40000 out/f101-edk2/dtb_sbi.bin
xfel write 0x20000 out/f101-edk2/loader.bin
xfel exec 0x20000
```

负载会打印 `S-mode payload started by OpenSBI`、hart ID、设备树地址、两个循环的 cycle 和 time 计数，最后打印 `payload done`。如果两条指令的循环 cycle 数在 358 左右，而不是每轮几个 cycle，说明设备树的 `compatible` 不对，OpenSBI 没有启用缓存。

## 常见日志

这些大多是 `DEBUG_INFO`；默认构建只输出错误，降低 `PcdDebugPrintErrorLevel` 或使用启用了它们的构建才会出现。

| 消息 | 含义 |
| --- | --- |
| `F101Gop: panel 1024x600 @ N Hz` | 显示链路启动成功；N 是按屏幕模式算出的刷新率 |
| `F101Gop: graphics output installed: Success` | GOP 协议已安装，启动菜单可以使用 |
| `F101Gop: the display pipeline did not come up` | 显示栈探测失败；检查屏幕供电和设备树 |
| `F101Smbios: add type N: ...` | SMBIOS 记录添加失败，通常是内存分配失败 |
| `ProtectUefiImage failed to create image properties record` | 每个模块都会打印的已知消息；能避免它的 4 KB 段对齐会让 DxeCore 加载失败 |

## 符号

打包步骤不生成 `out/f101-edk2/symbols/`。模块 ELF 在 `Build/F101/<target>_GCC/RISCV64/` 下，调试器可以加载 `f101.elf` 或单个模块 ELF。FD 是原始镜像；解析符号要用 ELF，不要用 FD。

## 检查清单

板子进不了启动菜单时，按顺序检查：

- DTB 的 `compatible` 包含 `allwinner,sun252i-f101`。
- `dtb_sbi.bin` 在 `0x40f40000`，`loader.bin` 在 `0x20000`。
- 控制台是 UART3，PE08/PE09，115200 8N1。
- PSRAM 参数和板子匹配：EVB 用 `xfel ddr f101-s3`，S4 板子用 eFEX helper。
- 没有误设 `DEBUG_WAIT`。
- 用 `NO_SCANOUT=1` 把显示故障和固件故障分开。
