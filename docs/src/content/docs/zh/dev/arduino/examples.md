---
title: "示例 sketch"
---

平台自带 27 个示例，随核心一起安装，在 IDE 的 **File > Examples > YuzukiHD Boards** 下。本页列出每个示例用到的功能、需要的硬件和它做什么，方便挑第一个能对上自己板子的示例。

## IDE 里的示例

示例也在磁盘上，位于 `<sketchbook>/hardware/yuzuki/f101/examples`，或者安装好的平台包里。打开一个，选择板子，进入 FEL，用 **Upload Using Programmer** 上传。控制台波特率是板级控制台的 115200。

## 示例列表

| 示例 | 使用 | 需要 | 作用 |
| --- | --- | --- | --- |
| `Blink` | GPIO、`Serial` | PA0 上接一个 LED | 闪烁 `LED_BUILTIN` 并打印 `on` / `off` |
| `SerialPins` | `Serial1` | PE4 和 PE5 短接 | 把 UART5 改到指定引脚并转发收到的数据 |
| `StringDemo` | `String` | — | 拼接、大小写转换、数字格式化和查找 |
| `AnalogSerial` | ADC、PWM | A0 输入，PD6 接 LED | 读取 A0，让 PD6 呼吸，回显串口输入 |
| `I2CScan` | `Wire` | 可选一个 I²C 设备 | 扫描 I2C1 上 1..126 的地址 |
| `SelfTest` | 核心、`Wire`、`SPI` | PA1 输出，PA2 上拉输入，A0 | 检查 String、计时、数学、GPIO、ADC、PWM、I²C 和 SPI |
| `DisplayBasics` | `Display` | 屏幕 | 填充、画图形和文字，调节背光 |
| `DisplayYuvOverlay` | `Display` | 屏幕 | 显示生成的 NV12 画面，上面叠加文字 |
| `G2DDemo` | `Display`、`G2D` | 屏幕 | 填充、缩放 blit、旋转、翻转和 alpha 混合，带计时 |
| `DBIProbe` | `DBI` | PD0..PD5 上的四线 SPI 屏 | 复位并初始化 ST7789 类屏幕，画彩条 |
| `JPEGShow` | `VideoDecoder`、`Display` | 屏幕 | 解码内置 JPEG 并显示，再用 CPU 转换几个像素 |
| `AudioTone` | `Audio` | 耳机或扬声器 | 用片内 codec 播放一段音阶 |
| `AudioPlayPCM` | `Audio` | 耳机或扬声器 | 播放生成的立体声扫频，演示阻塞和非阻塞写法 |
| `AudioMicLevel` | `Audio` | 麦克风 | 每 200 ms 打印麦克风峰值 |
| `I2SLoopback` | `I2S` | 不需要外部硬件 | 通过 I2S0 内部回环发送计数并检查 |
| `SPDIFTone` | `SPDIF` | PE6 上接 S/PDIF 接收端 | 发送 48 kHz、16 位立体声 1 kHz 音调 |
| `AACToPCM` | `MP4`、`AACDecoder` | SD 卡和 `video540p.mp4` | 解码 AAC 轨并打印每秒的电平 |
| `SDInfo` | `SD` | FAT 格式的 SD 卡 | 打印卡容量、卷容量和剩余空间 |
| `SDListFiles` | `SD` | FAT 格式的 SD 卡 | 递归列出卡上的文件 |
| `SDReadWrite` | `SD` | FAT 格式的 SD 卡 | 创建、读取、seek、改名和删除文件 |
| `USBSerialEcho` | `USBDevice` | 连到 PC 的 USB 线 | 创建 CDC ACM 串口并回显 PC 发来的数据 |
| `USBSerialBridge` | `USBHost` | Type-A 口上的 USB 串口设备 | 把设备桥接到 UART 控制台 |
| `USBMassStorage` | `USBHost`、`SD` | USB 闪存盘 | 打印盘的身份，读取 MBR，列出 FAT 根目录 |
| `MP4Info` | `MP4` | SD 卡和 `video540p.mp4` | 列出轨道并遍历视频和音频包 |
| `PlayVideo` | `MP4Player` | SD 卡、`video540p.mp4` 和屏幕 | 循环播放并打印统计 |
| `H264Frames` | `VideoDecoder`、`MP4`、`SD` | SD 卡和 `video540p.mp4` 或 `.h264` | 解码帧并计数 |
| `WatchdogDemo` | `Watchdog` | — | 喂狗 10 秒后停止，让板子复位 |

## 建议顺序

1. `Blink` 和 `StringDemo`，确认工具链和控制台。
2. `SelfTest`，一次检查核心、GPIO、ADC、PWM、I²C 和 SPI。
3. `AnalogSerial` 或 `I2CScan`，接自己的外设。
4. 有卡之后跑 `SDInfo` 和 `SDReadWrite`。
5. 屏幕用 `DisplayBasics` 和 `G2DDemo`。
6. codec 用 `AudioTone` 和 `AudioMicLevel`。
7. USB 用 `USBSerialEcho` 或 `USBSerialBridge`。
8. 视频用 `MP4Info`、`PlayVideo` 和 `H264Frames`。

## SD 卡上的文件

`MP4Info`、`PlayVideo`、`AACToPCM` 和 `H264Frames` 读取 `/SD:/video540p.mp4`；路径是 FAT 挂载点 `SD:` 加文件名。`H264Frames` 也接受 Annex B 的 `.h264` 文件。`JPEGShow` 不需要卡：测试图片编在 `test_image.ino` 里。
