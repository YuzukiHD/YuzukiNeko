---
title: "状态与已知限制"
---

记录里的板测都在 F101 EVB 上。核心也能为 YuzukiNeko 构建，但它的屏幕和控制台路径不在记录的测试范围内。本页区分跑过的和只构建过的，并列出容易踩到的 API 限制。

## 已验证示例

| 示例 | 结果 |
| --- | --- |
| `SelfTest` | String、计时、数学、GPIO、ADC、PWM、I²C 和 SPI 通过 |
| `AnalogSerial` | ADC 读取和 PWM 呼吸运行 |
| `DisplayBasics` | 屏幕绘制和背光调节运行 |
| Flash 启动 | 上电直接运行 sketch |
| `upload.cmd` | Windows 下用 xfel 上传可用 |

更早的分外设核心上，`I2S` 回环跑了 180k 帧、零个不一致，`SD` 通过 mkdir/读/seek/改名/删除，`Watchdog` 能复位 CPU，`G2D` 所有调用返回 0，`VideoDecoder` 解码 320×240 JPEG 用了 4 ms。

## 库状态

| 库 | 能构建 | 板上运行过 |
| --- | --- | --- |
| `Display` | 是 | `DisplayBasics` |
| `DBI` | 是 | 记录里的测试没有接屏幕 |
| `G2D` | 是 | 只在更早的核心上 |
| `Audio` | 是 | 当前核心没有 |
| `I2S` | 是 | EVB 上的回环 |
| `SPDIF` | 是 | 当前核心没跑发送；接收不可用 |
| `AACDecoder` | 是 | 当前核心没有 |
| `MP4` | 是 | 当前核心没有 |
| `MP4Player` | 是 | 当前核心没有 |
| `SD` | 是 | mkdir、读、seek、改名、删除 |
| `USBDevice` | 是 | 当前核心没有 |
| `USBHost` | 是 | 当前核心没有 |
| `VideoDecoder` | 是 | 更早的核心跑过 JPEG；PNG 和 H.264 没有 |
| `Wire` | 是 | `SelfTest`、`I2CScan` |
| `SPI` | 是 | `SelfTest` |
| `Watchdog` | 是 | `WatchdogDemo` |

## API 限制

- `Wire.endTransmission(false)` 仍然以 STOP 结束；没有重复起始条件，也没有从机模式。
- `Serial.print` 是同步轮询发送。shell 和日志后端已关闭，控制台 UART 归 `Serial` 使用。
- 不在 PD6、PD7、PD8、PB3 上的 `analogWrite` 是数字 50% 输出。`Display` 工作时，这四个 PWM 引脚属于屏幕。
- `pulseIn()` 是软件忙等，会阻塞主线程。
- `random()` 是 32 位 xorshift，不是密码学随机源。
- sketch 的代码和数据合计限制为 2 MiB。核心约 0.9 MB，不计入。
- `USBDevice` 和 `USBHost` 不能用在同一个 sketch 里；板子只有一路 USB 控制器。
- `Display` 和 `DBI` 不能同时包含；它们共用 PD0..PD5。
- 没有 `Servo`、`EEPROM` 和 `WiFi` 库。
- 加载器自己的日志即使在 YuzukiNeko 上也走 UART3；sketch 的 `Serial` 跟随板级控制台。

## 已知问题

- 用另一个核心编译的 sketch 会停在 `the sketch was built for another core`。核心每次更新后都要重新编译。
- YuzukiNeko 变体能构建，但记录的测试没有覆盖它的 MIPI DSI 屏幕和 UART1 控制台。第一次运行按 bring-up 对待。
- YuzukiNeko 变体的 `pins_arduino.h` 注释还写着 UART3；核心实际使用板级控制台 UART1。以板级设备树和 `Serial` 为准，不要相信那条注释。
- `MP4Player` 会占用 LCD 引脚并关闭 PWM 模块；它运行时 sketch 不能再用 `analogWrite`。

## 检查清单

把失败当成核心 bug 之前：

- 确认所选板子和硬件一致（EVB 或 YuzukiNeko）。
- 确认控制台 UART 和 115200 波特率。
- 核心更新后重新编译 sketch。
- 在[示例列表](examples.md)里核对示例需要的硬件。
- 使用某个库占用的引脚前，先看上面的引脚冲突。
- USB 一个 sketch 只用一种角色，切换后重新上电。
