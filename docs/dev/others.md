# 其他系统与组件

F101 工作区里还有下面这些方向。它们的成熟度不同，下面如实标注。

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| <strong>MicroPython</strong> | 上游 Zephyr 端口作为应用，加 `f101` 模块（G2D、音频、芯片 ID）；REPL 在控制台 | 已在 EVB 上验证：浮点、`machine` Pin/SPI/ADC/PWM/WDT、SD 挂载、显示写入、G2D、音调输出 |
| <strong>RT-Thread</strong> | v5.3.0，BSP `sun252iw2`，完全基于设备模型和内置设备树 | 驱动已迁移并在 EVB 上测试；USB 主机未运行（单口被下载线占用） |
| <strong>ESP-IDF</strong> | v6.1 移植，目标 `sun252i-f101` | 进行中：gpio/uart/i2c/spi/adc/ledc/sdmmc、esp_lcd RGB 屏、DMA、音频（片上 codec）已通过 EVB 测试，USB 与 WiFi 未做 |
| <strong>mGBA / NES / Doom</strong> | 游戏机与游戏的移植 | mGBA 已跑；NES、Doom 能编译链接但尚未上板运行 |
| <strong>其他 Zephyr 组件</strong> | ncnn、PocketJS、litehtml、AIC8800 WiFi 等 | 各自状态不同，见各自的 README |

?> 这些都是 F101 工作区里的开发项目，不属于 YuzukiNeko 硬件仓库发布的内容。具体用法以各自目录里的 README 为准。
