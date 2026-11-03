---
title: "回归与已知限制"
---

按[配置流程](build-run.md)使用 `test_defconfig` 为 YuzukiNeko 构建，常规镜像有意关闭测试命令。先检查本轮启动的板级身份，再运行测试；报告应保留源码版本、配置、板级 DTS 和完整串口日志。

## 推荐顺序

```text
list_device
free
test_all
test_spi_features
test_spi_quad
test_i2c i2c1
test_touch
test_rtc
test_display_features
test_vdec
test_sd
free
```

`test_all` 执行注册的冒烟测试组，不包含所有扩展命令。`test_touch` 检查实体控制器并注入原生输入事件；实物手指另用 `test_touch_watch 60` 验证。解码器参考素材要求见 [VE 页](drivers/vdec.md)。测试不能与占用同一外设的应用并发运行。

## YuzukiNeko 实测结果

| 检查（2026-11-03） | 实测结果 |
| --- | --- |
| `test_all` | 25 组，0 失败；明确 SKIP 的项目仍按跳过处理 |
| SPI 功能 / 四线 | 分别通过 14 / 6 项；100 MHz，采样模式 0、延迟 17 |
| SPI 单线与四线数据 | `0x80000` 的 4 KiB，CRC `11c60a82` |
| I2C1 / 原生触摸 | 分别通过 5 / 16 项；GT967 位于 `0x5d`，400 kHz |
| RTC | 13 项，覆盖闰日、2097 和一次性 IRQ |
| 显示像素 | 22 项，通过整帧 writeback 在内存中比较 |
| VE | 13 项；JPEG 亮度误差 ≤1，PNG CRC `03c854ec`，H.264 30 帧 / 0 错误 |
| 解码生命周期 | 320 次 JPEG、环形回绕、持帧关闭后释放，堆占用一致 |
| SD 2 MiB | DMA 89 ms；独立 PIO 配置 772 ms |
| UI 配置 | 分辨率除以 2、512×384 窗口，窗外像素为黑 |
| SPIF 配置 | 13 项，100 MHz 四线 DTR `0xed`，模式 0、延迟 27，CRC 一致 |
| 默认日志 / ulog | 均启动并通过 30 帧 JPEG 显示自测 |

## 其他配置

SD PIO 和 UI 窗口使用 `pio_window_defconfig`。SPIF 使用 `test_defconfig` 加 `SUN252I_BOARD=yuzukineko-spif`；参考数据未变化时运行 `test_spif_read 0x11c60a82`。Flash 数据变化后应由 SPI 重新计算参考 CRC。采样延迟及 CRC 是特定板卡和镜像的实测值，不能硬编码为通用参数。

## 证据的边界

180 秒实物触摸观察未收到事件。原生多点转换已通过，但手指触摸仍待确认。显示像素通过内部抓回验证，没有摄像头或现场观察确认屏幕观感。播放 DMA 正常推进，但没有确认听感；麦克风样本为零。未连接 DBI 屏和 USB host 外设。OWA 接收没有 RX DMA 请求，明确跳过。

writeback 的非零裁剪起点当前会抓取左上角，测试采用整帧抓回后软件取 patch。中间 alpha 值与理想线性算术有差异（记录中的 alpha 128 案例为 `0xff008486`），测试验证端点和单调性，不证明精确色彩。不能把这些限制改写为已完成的实物或观感测试。

## 保持回归不破坏数据

常规命令读取 Flash 和 SD 数据。日常回归不要给 `test_spi` 或 `test_sd` 添加 `write`：这些模式会擦写 Flash 或修改 SD 原始扇区，即使带恢复过程，中断时仍可能丢失数据。SPIF 配置有意关闭参数保存和块保护清除，保留 NOR 启动区与参数区。
