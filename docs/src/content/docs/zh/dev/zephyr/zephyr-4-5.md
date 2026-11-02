---
title: "Zephyr 4.2.2 与 4.5.0"
---

F101 的两版 Zephyr 在一个月过渡期内共存。**4.2.2 在过渡期继续保留**；4.5.0 使用独立的内核移植与组件分支。构建前先选择配套版本。本章已有的录像和板上结果，除非另有明确说明，属于 4.2.2 基线。

按 2026-11-02 的安排，计划约一个月后（约 2026-12-02）完成合并并停止维护 4.2.2，之后以 4.5 为维护版本。下文共存流程适用于这段过渡期；维护结束后，旧示例与结果仍保留其历史版本归属。

## 选择版本

| 项目 | 4.2.2 | 4.5.0 |
| --- | --- | --- |
| `YuzukiHD/zephyr` 分支 | `zephyr-v4.2.2-f101` | `zephyr-v4.5.0-f101` |
| `YuzukiHD/zephyr-components` 分支 | `main` | `zephyr-v4.5.0-f101` |
| 本次审阅的源码版本 | `839812c7e2b` / `ed8886e` | `88344a2dcbf` / `d1e6062` |
| Python 最低版本 | 3.10 | 3.12 |
| CMake 最低版本 | 3.20.5 | 3.28 |
| 维护计划 | 过渡共存，计划约 2026-12-02 合并后停止维护 | 合并后继续维护 |
| LVGL | 9.3 | 9.6 |
| 加密库 | Mbed TLS 3 | Mbed TLS 4.1.1 与 TF-PSA-Crypto |
| 构建产物 | 原有 4.2.2 目录 | 独立的 `build/zephyr-4.5.0/` 目录 |

4.5 移植基于上游 `v4.5.0`，提交 `41d10b59730406bbab4ca9f1fbbe9e96aafb4966`。表中的提交组合用于定位本次审阅基线，不限制分支后续更新。4.5 分支已在本地提交；本次文档更新未确认其远程发布状态。初始化新工作区前，先确认两个分支都可获取。远程分支不可用时，不能用另一个仓库的 `main` 代替。

## 保留两套环境

需要日常独立构建时，建议使用两个并列的 west 工作区，分别初始化对应的 Zephyr 分支和配套组件，manifest 管理的依赖检出也随之隔离。[环境配置](zephyr-setup-env.md) 与 [源码获取](zephyr-get-source.md) 保留 4.2.2 流程。在已经切换到 4.5 的工作区中创建独立环境：

```sh
python3 -m venv .venv-zephyr-4.5.0
. ./env.sh
. .venv-zephyr-4.5.0/bin/activate
export PATH="$PWD/tools-local/usr/bin:$(dirname "$CROSS_COMPILE"):$PATH"
python -m pip install --upgrade pip
python -m pip install west
west packages pip --install
```

第一条命令需使用 Python 3.12 或更新版本。激活后检查 `python --version` 和 `cmake --version`。切换虚拟环境可能恢复之前的 `PATH`，因此需要在激活后重新加入本地安装的 `dtc`、`gperf` 和工具链目录。本次 4.5 检查使用 XuanTie GCC 14.1.1；构建主机使用 Python 3.14.4 和 CMake 4.2.3。

在同一工作区顺序切换时，先保存本地改动，再同时选择两个分支并更新 4.5 的 manifest 依赖：

```sh
git -C zephyr switch zephyr-v4.5.0-f101
git -C zephyr-components switch zephyr-v4.5.0-f101
. ./env.sh
. .venv-zephyr-4.5.0/bin/activate
export PATH="$PWD/tools-local/usr/bin:$(dirname "$CROSS_COMPILE"):$PATH"
west update --narrow fatfs lvgl mbedtls tf-psa-crypto tf-psa-crypto-drivers cherryusb opencore
west packages pip --install
west build -b yuzukineko -d build/zephyr-4.5.0/hello zephyr/samples/hello_world
west build -b yuzukineko -d build/zephyr-4.5.0/nekobox zephyr-components/nekobox
```

不要把 4.2.2 的 CMake 缓存用于 4.5.0，也不要在切换同一工作区源码和依赖时并发构建两个版本。使用产物前检查构建进程的实际退出状态。

## 4.5 有哪些变化

| 范围 | 移植变化与应用影响 |
| --- | --- |
| CPU 与设备树 | CPU 改用 `riscv,isa-base`、`riscv,isa-extensions`。缓存指令使用 `RISCV_ISA_EXT_XTHEAD_CMO`。F101 GPIO compatible 为 `allwinner,sun252i-f101-gpio`，与上游的 `allwinner,sunxi-gpio` binding 分开。 |
| 驱动 API | 音频、SDHC、vdec 使用 `DEVICE_API`。`uart_irq_update()` 返回 `void`，需先调用，再检查 `uart_irq_is_pending()`。SDHC 四位支持字段为 `props.bus_4_bit_support`。参见 [UART](drivers/uart.md)、[SDHC](drivers/sdhc.md)、[vdec](drivers/vdec.md) 文章中的版本说明。 |
| 显示与 LVGL | 显示流水线根节点继承 display-controller 类。LVGL 9.6 需要更新图像缓存、文字测量和 blend hook，包括 RVV 渲染器的 masked fill 与 alpha 边界。旧的 LVGL 内部 hook 不宜原样复制。 |
| Android 投屏 | RSA 生成与 HKDF 使用 PSA API，PK、X.509、TLS 接口及原生 Kconfig 选择均已适配。使用 `MBEDTLS_SSL_PROTO_TLS1_3`；4.5 已移除旧的 `mirror_mbedtls.h` 用户配置。 |
| iOS 与 Bilibili | 更新 SHA-512/AES、TLS 配置及加密头文件；Bilibili 同时适配新的 LVGL 接口。 |
| AIC8800 | Ethernet capability 回调接收网络接口；可选 WPA3 SAE 后端使用 TF-PSA-Crypto 配置，为椭圆曲线乘法提供随机回调，并拒绝已移除的 secp192r1 曲线组。 |
| RVV | `SUN252I_F101_RVV` 仍为可选配置。C 启动前启用向量状态，异常帧保存全部向量寄存器。[RVV](zephyr-riscv-vector.md) 介绍配置方法。 |
| MMU 与分页 | 机器态 Sv32 保留原有限制：不能与 SMP、PMP 用户态或监督态组合。映射 API 返回 4.5 要求的状态，内核保持常驻。后备存储位于 `subsys/mem_mgmt/demand_paging/backing_store`，SD 页面 I/O 保留互斥串行化。 |
| 解码示例 | 测试数据头文件为 `jpeg_cases.h`、`png_cases.h`、`h264_cases.h`；H.264 示例支持三字节和四字节 Annex B 起始码。请使用对应组件分支里的示例。 |

两个板级的引脚分配不变，DTS 的 RAM 区仍为 `0x40000000` 起的 16 MiB。硬件版本拥有更多 PSRAM，不会自动扩大 Zephyr 的可用区。RAM 和 XIP 启动要求与 Zephyr 版本独立，见 [编译与运行](zephyr-build-run.md)。开发时保留 FEL 流程及 NOR 采样参数区。

## 4.5 的验证记录

移植检查在 `yuzukineko` 与 `f101_evb` 上完成 53 个驱动、媒体、LVGL 和分页配置的编译；EVB 没有触摸设备，因此排除了触摸绘图样例。后续组件检查在 `yuzukineko` 上构建了 40 个应用配置，包含 NekoBox、Bilibili、MicroPython、PocketJS、模拟器、手机投屏接收器与 API 示例。另有 Miracast RAM/XIP、WPA3、RVV 与分页组合检查。

六套主机测试通过，包含各套件提供的 sanitizer 检查。Android 加密测试独立校验 RSA、ADB 密钥常量、证书和 HKDF/AES-GCM：

```sh
sh zephyr-components/dlna/tests/host/run.sh
sh zephyr-components/nekobox/tests/streaming/run.sh
sh zephyr-components/miracast/tests/host/run.sh
sh zephyr-components/aic8800/tests/p2p/run.sh
sh zephyr-components/nekobox/tests/miracast/run.sh
sh zephyr-components/android-screen-mirror/tests/host/run.sh
```

**4.5 尚未完成板上运行验证。** 显示、触摸、音频、SD、Wi-Fi、持续内存占用、RVV 上下文切换、标量/向量渲染一致性、分页完整性以及 Android/AirPlay/ADB 互通，都需要新的实机结果。已有的 4.2.2 日志和截图继续作为其原始构建的历史证据。

## 返回 4.2.2

共用工作区时，先保存本地改动，然后一起恢复两个仓库、Python 环境与依赖：

```sh
git -C zephyr switch zephyr-v4.2.2-f101
git -C zephyr-components switch main
. ./env.sh
west update --narrow fatfs lvgl mbedtls cherryusb opencore
west packages pip --install
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

旧 manifest 不使用额外的 TF-PSA-Crypto 检出，保留在磁盘上即可。需要精确复现历史版本时，使用首表中的 4.2.2 提交组合，不要假设持续更新的 `main` 始终指向该提交。
