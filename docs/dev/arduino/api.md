# 编写草图与 API

## 编写草图

用的是通常的 Arduino API：`pinMode`、`digitalWrite`、`analogRead`、`analogWrite`、`Serial`、`Wire`、`SPI`、`String`、`millis`、`delay` 等。

- 引脚名是 `PA0` … `PF31`（端口字母 + 编号），模拟输入是 `A0`..`A11`。
- `Serial.begin(115200)` 就是控制台所需的全部初始化；其他 UART 是 `Serial1`..`Serial5`，用 `Serial1.setPins(rx, tx)` 选引脚（控制台的引脚来自板级配置，不会被重新路由）。
- 外设以库的形式提供，用到什么就 `#include`：`<SD.h>`、`<Display.h>`、`<Audio.h>`、`<MP4Player.h>` 等。示例演示了每个库。

两点注意：

- `Display` 和 `DBI` 使用相同的引脚（`PD0`–`PD5`），一个草图里只能用其中一个。
- 一个草图最多 <strong>2 MiB</strong> 代码和数据；系统（Zephyr、驱动、所有库，约 0.9 MB）属于预编译核心，不计入。IDE 显示的大小只是草图自己，所以很小。

## 支持的 API

| Arduino API | 实现 |
| --- | --- |
| `pinMode/digitalWrite/digitalRead` | Zephyr GPIO，引脚号 = 端口 × 32 + 引脚，名字 `PA0`..`PF31` |
| `attachInterrupt/detachInterrupt` | GPIO 回调（`RISING/FALLING/CHANGE/ONHIGH/ONLOW`） |
| `analogRead(A0..A11)` | GPADC，12 位，按 `analogReadResolution()` 缩放（默认 10） |
| `analogWrite`、`tone`、`analogWriteFrequency` | PWM0，引脚 `PD6 PD7 PD8 PB3`（默认 500 Hz） |
| `Serial` | 板子的控制台 UART，带 RX 环形缓冲，支持 `begin(baud, SERIAL_8N1...)` |
| `Serial1..Serial5` | UART5、UART2、UART1、UART0、UART4 |
| `setPins(rx, tx)` | 运行时路由引脚（无需改设备树）：UART0 PF4/PF2，UART1 PF1/PF0 或 PB1/PB0，UART2 PF5/PF4，UART3 PE9/PE8 或 PE1/PE0，UART4 PE3/PE2，UART5 PE5/PE4（RX/TX）。其他引脚会被拒绝。第一组是默认值（Serial2..Serial4 默认落在 SD 卡引脚 PF0..PF5 上） |
| `Wire` | I2C1：PE0（SCL）/ PE1（SDA），仅控制器模式 |
| `SPI` | SPI0：PC0（SCK）/ PC4（MOSI）/ PC2（MISO），片选由草图自己处理 |
| `millis/micros/delay/delayMicroseconds` | 内核时钟，24 MHz 周期计数器 |
| `String`、`Print`、`Stream`、`F()`、`printf` | 自有实现，支持 `Serial.printf()` |
| 数学函数 | 工具链 libm（`sin`、`pow` 等） |

`setup()` 和 `loop()` 跑在 Zephyr 主线程（16 KiB 栈）；`new` / `malloc` 使用镜像以上的全部 RAM。

## 局限

- `Wire.endTransmission(false)`（重复起始）仍以 STOP 结束；没有从机模式。
- `Serial.print` 是同步的（轮询发送），shell 和日志被禁用，让 `Serial` 独占控制台 UART。
- 在没有 PWM 的引脚上 `analogWrite` 退化为 50% 阈值的数字输出。
- 暂无 `Servo`、`EEPROM`、`WiFi` 库。
