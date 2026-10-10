# 外设库

## 外设库

所有库都是预编译核心的一部分，草图 include 即可。会占用引脚或电源的设备由库在 `begin()` 里启动，而不是开机就启动。

| 库 | 硬件 | 说明 |
| --- | --- | --- |
| `Display` | DE + TCON + RGB 屏 | ARGB8888 缓冲，绘图/文字，`show()`，视频层（`showYuv`），背光。`Display.begin()` 后占用 PD0..PD22、PE6/7、PB0..PB3。LVGL 不在核心里：把 LVGL Arduino 库指向 `Display.buffer()` |
| `G2D` | 2D 引擎 | 填充、blit（转换/缩放）、混合；旋转/翻转必须保持格式和尺寸 |
| `DBI` | MIPI DBI（PD0..PD5） | 与 `Display` 互斥：同时 include 会 `#error` |
| `Audio` | 片上 codec | PCM 输出、麦克风输入、音调、音量、喇叭功放（PE10） |
| `I2S`、`SPDIF` | I2S0、OWA | EVB 上 I2S0 没有引脚（内部回环）；S/PDIF 接收 DMA 未解决 |
| `SD` | SMHC0（PF0..PF6） | Arduino SD API，`File` 是 `Stream`；也是 `USBDrive` 卷 |
| `USBDevice` | CherryUSB 设备 | `USBSerial`（CDC ACM） |
| `USBHost` | CherryUSB 主机 | `USBHostMSC`（含 FAT 挂载为 `USBDrive`）、`USBHostSerial`；一个草图只能选一种 USB 角色 |
| `VideoDecoder` | VE | 硬件 JPEG/PNG、H.264 流 |
| `MP4`、`AACDecoder`、`MP4Player` | 解复用、AAC、完整播放器 | 播放器需要 Display、SD 和 codec |
| `Watchdog` | WDT | `begin(ms)`、`reset()`、`end()` |

随库自带的示例有：Blink、SelfTest、AnalogSerial、I2CScan、SerialPins、StringDemo、SDInfo、SDListFiles、SDReadWrite、DisplayBasics、DisplayYuvOverlay、G2DDemo、DBIProbe、JPEGShow、H264Frames、MP4Info、PlayVideo、AACToPCM、AudioTone、AudioPlayPCM、AudioMicLevel、I2SLoopback、SPDIFTone、USBSerialEcho、USBSerialBridge、USBMassStorage、WatchdogDemo。

### 验证状态

下面只列出能用串口验证的结果，画面和声音没有人工评判：

- 已验证：SelfTest（String、计时、数学、GPIO、ADC、PWM、Wire、SPI、Serial RX 回显）、AnalogSerial、DisplayBasics、Flash 启动、Windows 上的 `upload.cmd`；此前在单外设核心上验证过 `I2S` 回环、`SD`、`Watchdog`、`G2D`、`VideoDecoder` JPEG。
- 已编译但<strong>尚未在当前核心上运行</strong>：`DBI`、`G2D`、`VideoDecoder`、`Audio`、`SPDIF`、`USBDevice`、`USBHost`、`MP4*`、H.264、PNG。
