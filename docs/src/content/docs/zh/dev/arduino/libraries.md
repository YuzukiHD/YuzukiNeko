---
title: "外设库"
---

每个库都编在预编译核心里；sketch 只需包含头文件并调用 `begin()`。占用引脚或电源的设备不会在启动时初始化，由库在自己的 `begin()` 里启动。库可以把自己的 Kconfig 片段（`f101.conf`）和设备树 overlay（`f101.overlay`）带进核心构建，显示、SD、USB 和音频栈就是这样启用的。

## 库列表

| 库 | 硬件 | 详情 |
| --- | --- | --- |
| `Display` | DE、TCON、RGB 屏 | [Display、DBI 与 G2D](libraries/display.md) |
| `DBI` | MIPI DBI，四线 SPI | [Display、DBI 与 G2D](libraries/display.md) |
| `G2D` | 2D 引擎 | [Display、DBI 与 G2D](libraries/display.md) |
| `Audio` | 片内 codec | [Audio、I2S 与 S/PDIF](libraries/audio.md) |
| `I2S` | I2S0 | [Audio、I2S 与 S/PDIF](libraries/audio.md) |
| `SPDIF` | OWA | [Audio、I2S 与 S/PDIF](libraries/audio.md) |
| `AACDecoder` | 软件 AAC-LC | [Audio、I2S 与 S/PDIF](libraries/audio.md) |
| `MP4` | MP4 解封装 | [Audio、I2S 与 S/PDIF](libraries/audio.md) |
| `MP4Player` | H.264 + AAC 播放器 | [Audio、I2S 与 S/PDIF](libraries/audio.md) |
| `SD` | SMHC0、FatFs | [SD、USB 设备与 USB 主机](libraries/storage-usb.md) |
| `USBDevice` | CherryUSB 设备 | [SD、USB 设备与 USB 主机](libraries/storage-usb.md) |
| `USBHost` | CherryUSB 主机、MSC、CDC | [SD、USB 设备与 USB 主机](libraries/storage-usb.md) |
| `VideoDecoder` | 视频引擎 | [视频解码](libraries/video.md) |
| `Wire` | I2C1 | 本页 |
| `SPI` | SPI0 | 本页 |
| `Watchdog` | WDT | 本页 |

## Wire

`Wire` 是 PE0（SCL）和 PE1（SDA）上的 I2C1，只有控制器模式。`begin()` 启动总线，`setClock(hz)` 改速率，`beginTransmission(address)`、`write()`、`endTransmission(sendStop)` 和 `requestFrom(address, quantity, sendStop)` 完成一次事务。

| `endTransmission` 返回 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 数据超出缓冲 |
| 2 | 地址 NACK |
| 3 | 数据 NACK |
| 4 | 其他错误 |
| 5 | 超时 |

`Wire.endTransmission(false)` 仍然以 STOP 结束；没有重复起始条件。发送和接收缓冲各 128 字节（`BUFFER_LENGTH`）。`onReceive()` 和 `onRequest()` 只保存函数指针，永远不会被调用：没有从机模式。

```cpp
#include <Wire.h>

void setup() {
  Serial.begin(115200);
  Wire.begin();
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) Serial.printf("device at 0x%02X\n", addr);
  }
}
```

## SPI

`SPI` 是 PC0（SCK）、PC4（MOSI）、PC2（MISO）上的 SPI0。片选由 sketch 自己控制；`PIN_SPI_SS` 定义为 PC1，但库不会驱动它。

`begin()` 启动总线。`beginTransaction(SPISettings(clock, bitOrder, dataMode))` 为接下来的传输设置时钟、位序和模式；`endTransaction()` 什么也不做。`setBitOrder()`、`setDataMode()` 和 `setClockDivider()` 是旧接口。`transfer(byte)` 交换一个字节，`transfer16(word)` 交换两个，`transfer(buf, count)` 和 `transfer(tx, rx, count)` 传输缓冲。

```cpp
#include <SPI.h>

void setup() {
  Serial.begin(115200);
  SPI.begin();
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  uint8_t id = SPI.transfer(0x9F);
  SPI.endTransaction();
  Serial.printf("id 0x%02X\n", id);
}
```

## Watchdog

`Watchdog.begin(timeoutMs)` 启动硬件看门狗，`reset()` 喂狗，`end()` 停止。硬件周期是 1 到 6 秒、8、10、12、14、16 秒；`begin()` 选第一个不短于请求值的周期。`roundTimeout(ms)` 返回会使用的周期，请求过长时返回 0。`active()` 和 `timeoutMs()` 报告状态。

看门狗复位会重启 SoC，加载器会再次运行 sketch。`WatchdogDemo` 喂狗 10 秒后停止，板子复位并再次打印启动信息。

## 状态

记录里的板测覆盖核心、ADC/PWM、屏幕、SD、I2S、Watchdog、G2D 和 JPEG。对应的示例是 `SelfTest`、`AnalogSerial`、`DisplayBasics`、`SDInfo`、`SDReadWrite`、`I2SLoopback`、`WatchdogDemo`、`G2DDemo` 和 `JPEGShow`；例外情况写在各库页面上。其余库能构建和链接；第一次运行按 bring-up 对待。[示例列表](examples.md)说明每个示例需要什么硬件。
