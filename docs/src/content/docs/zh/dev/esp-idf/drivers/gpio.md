---
title: "GPIO 与引脚复用"
---

F101 的 GPIO 是六个 PIO bank（PA 到 PF），没有 ESP32 的 GPIO matrix。每个焊盘只有固定的几组复用功能，驱动通过 `f101_periph_route()` 查表选择功能。一个焊盘不能任意映射到任意外设。

## 引脚编号

GPIO 编号是 `bank * 32 + pin`，PA 为 0，PB 为 32，PC 为 64，PD 为 96，PE 为 128，PF 为 160。头文件提供 `GPIO_NUM_PA()` 到 `GPIO_NUM_PF()` 宏，例如 PD5 是 `GPIO_NUM_PD(5)`，数值 101。

```c
#include "driver/gpio.h"

gpio_set_direction(GPIO_NUM_PD(5), GPIO_MODE_OUTPUT);
gpio_set_level(GPIO_NUM_PD(5), 1);
```

YuzukiNeko 的板载 LED 在 PD5，和底板 `SW1` 共用这个引脚。Wi-Fi 的 `REG_ON` 在 PE10，音频功放使能在 PD4。

## 方向、电平与上下拉

```c
gpio_set_direction(gpio, GPIO_MODE_INPUT);
gpio_set_pull_mode(gpio, GPIO_PULLUP_ONLY);
gpio_set_drive_capability(gpio, GPIO_DRIVE_CAP_2);
int level = gpio_get_level(gpio);
```

输入模式支持上拉、下拉和浮空。驱动能力为 0 到 3，数值越大驱动越强。F101 的引脚复用是固定功能，调用 `gpio_set_direction()` 会把焊盘切到 GPIO 功能，之后 `f101_periph_route()` 才能把它切回外设。

## gpio_config 的 64 位掩码

`gpio_config()` 的 `pin_bit_mask` 是 64 位，只覆盖 PA 和 PB。PC 到 PF 的引脚不能出现在这个掩码里，必须逐脚调用：

```c
gpio_config_t cfg = {
    .pin_bit_mask = 1ULL << 32,
    .mode = GPIO_MODE_OUTPUT,
    .pull_up_en = GPIO_PULLUP_DISABLE,
    .pull_down_en = GPIO_PULLDOWN_DISABLE,
    .intr_type = GPIO_INTR_DISABLE,
};
gpio_config(&cfg);
```

`gpio_dump_io_configuration()` 也只遍历前 64 个引脚，查看 PC 到 PF 时要自己读取 `f101_pin_mux()` 或使用示波器。

## 中断

每个 bank 有一条 PIO 中断线接到 PLIC。使用 ISR 服务注册单个引脚：

```c
static void on_button(void *arg)
{
}

gpio_install_isr_service(0);
gpio_set_intr_type(GPIO_NUM_PD(2), GPIO_INTR_NEGEDGE);
gpio_isr_handler_add(GPIO_NUM_PD(2), on_button, NULL);
gpio_intr_enable(GPIO_NUM_PD(2));
```

支持上升沿、下降沿、任意边沿和高低电平触发。边沿检测来自 24 MHz 去抖时钟，32 kHz 时钟在普通运行时没有开启。`gpio_isr_register()` 返回 `ESP_ERR_NOT_SUPPORTED`，统一使用 `gpio_install_isr_service()`。

## 焊盘复用

| 信号 | 可用焊盘 |
| --- | --- |
| UART0 TX/RX | PF2 / PF4 |
| UART1 TX/RX | PF0 / PF1 或 PB0 / PB1 |
| UART2 TX/RX | PF4 / PF5 或 PE6 / PE7 |
| UART3 TX/RX | PE8 / PE9 |
| UART4 TX/RX | PE2 / PE3 或 PD6 / PD7 |
| UART5 TX/RX | PE4 / PE5 |
| I2C0 SCL/SDA | PE8 / PE9 |
| I2C1 SCL/SDA | PE0 / PE1 或 PD0 / PD1 |
| SPI0 | PC0..PC5 |
| SPI1 | PD0..PD5 |
| SD/MMC0 | PF0..PF5 |
| SD/MMC2 | PE0..PE5 |
| PWM0/PWM1 | PD6 / PD7 |
| PWM2 | PD8 或 PD22 |
| PWM3 | PB3 |
| RGB LCD | PD0..PD9、PD12..PD21、PE6/PE7 |

`f101_periph_pin_mux(signal, instance, gpio)` 返回该焊盘的功能号，返回 -1 表示这个焊盘不能承载该信号。驱动在初始化时检查这个返回值，错误的引脚会得到 `ESP_ERR_INVALID_ARG`，而不是静默输出到别处。

## 板载引脚

| GPIO | 用途 |
| --- | --- |
| PD2 | GT967 触摸中断 |
| PD3 | GT967 触摸复位 |
| PD4 | 音频功放使能，高有效 |
| PD5 | 板载 LED，也是底板 SW1 |
| PD9 | DSI 面板复位 |
| PD22 | 背光 PWM |
| PE10 | AIC8800 电源使能 |
| PF6 | microSD 卡检测，V1.4 及更早需要最低驱动强度 |
