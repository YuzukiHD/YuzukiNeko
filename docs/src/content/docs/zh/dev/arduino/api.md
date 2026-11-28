---
title: "Arduino API 与引脚"
---

核心在 Zephyr 之上实现常用的 Arduino API。引脚命名为 `PA0` … `PF31`（bank × 32 + pin），`A0` … `A11` 是 GPADC 输入（伪引脚号 200–211）。超出核心 API 的外设以[库](libraries.md)的形式提供。

## sketch 入口

`setup()` 运行一次，`loop()` 一直运行，两者都在 Zephyr 的主线程里。`init()` 在 `setup()` 之前运行，用周期计数器给随机数生成器设种子。`initVariant()` 是给变体用的弱符号。`serialEvent()` 和 `serialEvent1()` 也是弱符号：每次 `loop()` 之后，`Serial` 或 `Serial1` 有数据时核心会调用它们。

```cpp
void serialEvent() {
  while (Serial.available()) {
    char c = Serial.read();
    Serial.print(c);
  }
}
```

## 数字 I/O 与中断

| API | 实现 |
| --- | --- |
| `pinMode`、`digitalWrite`、`digitalRead` | Zephyr GPIO；引脚号 = bank × 32 + pin |
| `attachInterrupt`、`detachInterrupt` | GPIO 回调；`RISING`、`FALLING`、`CHANGE`、`ONHIGH`、`ONLOW` |
| `interrupts`、`noInterrupts` | 全局中断加锁和解锁；锁不嵌套安全 |
| `pulseIn`、`pulseInLong` | 带微秒超时的忙等测量 |

`pinMode()` 接受 `INPUT`、`OUTPUT`、`INPUT_PULLUP` 和 `INPUT_PULLDOWN`。已经路由到 PWM 输出的引脚再次调用 `pinMode()` 时会回到 GPIO。

## 时间

| API | 实现 |
| --- | --- |
| `millis` | 内核运行时间，毫秒 |
| `micros` | 64 位周期计数器换算成微秒 |
| `delay`、`delayMicroseconds` | 睡眠和忙等 |
| `yield` | 让出主线程 |

`clockCyclesPerMicrosecond()` 是 24。`pulseIn()` 由软件实现；长脉冲用 `pulseInLong()`，在这个核心上两者实现相同。

## 模拟输入与输出

| API | 实现 |
| --- | --- |
| `analogRead(A0..A11)` | GPADC，12 位，按 `analogReadResolution()` 缩放（默认 10 位） |
| `analogReference` | 接受但忽略；参考电压是内部参考 |
| `analogWrite`、`tone`、`analogWriteFrequency` | PWM0，引脚 PD6、PD7、PD8、PB3；默认 500 Hz |
| `analogWriteResolution` | PWM 占空比分辨率，1..16 位，默认 8 位 |
| `noTone` | 停止该引脚上的音调 |
| 其他引脚上的 `analogWrite` | 数字 50% 输出；没有 PWM |

`analogReadResolution(bits)` 把 12 位硬件结果缩放到指定位宽。`analogWriteResolution(bits)` 把占空比范围设为 `2^bits - 1`，`analogWrite(pin, value)` 再映射到 PWM 占空比。`analogWriteFrequency(pin, hz)` 修改该引脚的周期。

包含 `Display` 库时，屏幕占用 PD0..PD22、PE6/PE7 和 PB0..PB3，四个 PWM 引脚都被占住。此时这些引脚上的 `analogWrite` 会退化为数字输出。

## 串口

`Serial` 是板子的控制台 UART，引脚来自板级设备树。它的引脚是固定的，`setPins()` 不会重新路由。YuzukiNeko 的控制台是 UART1（PB0/PB1），EVB 的控制台是 UART3（PE8/PE9）。其余 UART 是 `Serial1` … `Serial5`。

| 对象 | UART | 路由（RX / TX） |
| --- | --- | --- |
| `Serial1` | UART5 | PE5 / PE4 |
| `Serial2` | UART2 | PF5 / PF4 |
| `Serial3` | UART1 | PF1 / PF0、PB1 / PB0 |
| `Serial4` | UART0 | PF4 / PF2 |
| `Serial5` | UART4 | PE3 / PE2 |

控制台正好是其中某个 UART 时，对应的对象不会被定义。YuzukiNeko 上 `Serial3`（UART1）就是控制台，所以没有 `Serial3`，直接用 `Serial`。EVB 上五个对象都存在。`begin(baud, config, rx, tx)` 和 `setPins(rx, tx)` 只接受表里的路由，其他引脚返回 false。`Serial2` 到 `Serial4` 默认落在 SD 卡的 PF0..PF5 上。

`Serial` 和 `Serial1`..`Serial5` 都有一个 256 字节的接收环形缓冲。`Serial.print` 是同步轮询发送，shell 和日志后端已关闭，控制台 UART 归 `Serial` 使用。`Serial.begin(baud, config)` 接受 `SERIAL_8N1` 这一族常量，波特率和帧格式会应用到 UART。

## I²C 与 SPI

`Wire` 使用 I2C1，PE0 是 SCL，PE1 是 SDA，只有控制器模式。`Wire.endTransmission(false)` 仍然以 STOP 结束；没有从机模式。缓冲为 128 字节。

`SPI` 使用 SPI0，PC0 是 SCK，PC4 是 MOSI，PC2 是 MISO。片选由 sketch 自己控制；`PIN_SPI_SS` 定义为 PC1，但库不会驱动它。

## 工具函数与数学

- `randomSeed(seed)` 和 `random(max)` / `random(min, max)` 使用 32 位 xorshift 生成器。
- `map(value, fromLow, fromHigh, toLow, toHigh)`、`min`、`max`、`constrain`、`round`、`radians`、`degrees` 和 `sq` 是宏或内联函数。
- `bitRead`、`bitSet`、`bitClear`、`bitToggle`、`bitWrite`、`lowByte`、`highByte`、`_BV` 和 `word` 可用。
- `PROGMEM`、`PSTR()`、`pgm_read_byte()` 等 `pgm_read_*` 都是空操作：没有独立的程序存储空间。
- `String`、`Print`、`Stream`、`F()` 和 `printf` 由核心实现，`Serial.printf()` 可用。数学函数来自工具链的 libm。

## 内存与限制

- sketch 的代码和数据合计限制为 2 MiB。预编译核心约 0.9 MB，不计入这个限制；IDE 显示的大小只是 sketch 本身。
- `setup()` 和 `loop()` 运行在 Zephyr 的主线程里，栈大小为 16 KiB。
- `new` 和 `malloc` 使用镜像之上的全部 RAM，直到 `0x40e00000` 的 sketch 窗口。
- sketch 的编译参数关闭了 C++ 异常和 RTTI（`-fno-exceptions -fno-rtti`）。
- `Wire` 没有从机模式，`Serial.print` 是同步发送，非 PWM 引脚上的 `analogWrite` 是数字输出。

## 引脚冲突

- `Display` 和 `DBI` 都使用 PD0..PD5，一个 sketch 只能用其中一个。两个头文件同时包含会报编译错误。
- `Display.begin()` 会占用 PD0..PD22、PE6/PE7 和 PB0..PB3。PWM0 使用 PD6/PD7/PD8/PB3，所以 `Display` 工作时 `analogWrite` 退回数字输出。
- PE2 是 USB VBUS 开关，PF0..PF5 是 SD 卡。除了 sketch 确实要用这些功能，否则避开它们。
- EVB 没有标注用户 LED；`LED_BUILTIN` 是 PA0。
