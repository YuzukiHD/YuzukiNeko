---
title: "GPIO and pin multiplexing"
---

F101 GPIO is six PIO banks (PA through PF) with no ESP32-style GPIO matrix. Each pad has only a few fixed alternate functions, and drivers call `f101_periph_route()` to look up the function; a pad cannot be mapped to an arbitrary peripheral.

## Pin numbering

The GPIO number is `bank * 32 + pin`: PA starts at 0, PB at 32, PC at 64, PD at 96, PE at 128 and PF at 160. Headers provide `GPIO_NUM_PA()` through `GPIO_NUM_PF()`; PD5 is `GPIO_NUM_PD(5)`, numerically 101.

```c
#include "driver/gpio.h"

gpio_set_direction(GPIO_NUM_PD(5), GPIO_MODE_OUTPUT);
gpio_set_level(GPIO_NUM_PD(5), 1);
```

The YuzukiNeko on-board LED is on PD5, shared with the base board `SW1`; the Wi-Fi `REG_ON` is on PE10 and the audio amplifier enable is on PD4.

## Direction, level and pulls

```c
gpio_set_direction(gpio, GPIO_MODE_INPUT);
gpio_set_pull_mode(gpio, GPIO_PULLUP_ONLY);
gpio_set_drive_capability(gpio, GPIO_DRIVE_CAP_2);
int level = gpio_get_level(gpio);
```

Input mode supports pull-up, pull-down and floating; drive capability is 0 to 3, with larger values driving harder. F101 pad functions are fixed, so `gpio_set_direction()` switches the pad to GPIO and `f101_periph_route()` must be used to switch it back to a peripheral.

## The 64-bit mask of gpio_config

The `pin_bit_mask` of `gpio_config()` is 64 bits wide and covers only PA and PB. Pins PC through PF cannot appear in the mask and must be configured individually:

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

`gpio_dump_io_configuration()` also visits only the first 64 pins; to inspect PC through PF, read `f101_pin_mux()` yourself or use a scope.

## Interrupts

Each bank has one PIO interrupt line into the PLIC. Register a single pin through the ISR service:

```c
static void on_button(void *arg)
{
}

gpio_install_isr_service(0);
gpio_set_intr_type(GPIO_NUM_PD(2), GPIO_INTR_NEGEDGE);
gpio_isr_handler_add(GPIO_NUM_PD(2), on_button, NULL);
gpio_intr_enable(GPIO_NUM_PD(2));
```

Rising, falling, any-edge and high/low level triggers are supported. Edge detection uses the 24 MHz debounce clock; the 32 kHz clock is not running in normal operation. `gpio_isr_register()` returns `ESP_ERR_NOT_SUPPORTED`; use `gpio_install_isr_service()` consistently.

## Pad multiplexing

| Signal | Available pads |
| --- | --- |
| UART0 TX/RX | PF2 / PF4 |
| UART1 TX/RX | PF0 / PF1 or PB0 / PB1 |
| UART2 TX/RX | PF4 / PF5 or PE6 / PE7 |
| UART3 TX/RX | PE8 / PE9 |
| UART4 TX/RX | PE2 / PE3 or PD6 / PD7 |
| UART5 TX/RX | PE4 / PE5 |
| I2C0 SCL/SDA | PE8 / PE9 |
| I2C1 SCL/SDA | PE0 / PE1 or PD0 / PD1 |
| SPI0 | PC0..PC5 |
| SPI1 | PD0..PD5 |
| SD/MMC0 | PF0..PF5 |
| SD/MMC2 | PE0..PE5 |
| PWM0/PWM1 | PD6 / PD7 |
| PWM2 | PD8 or PD22 |
| PWM3 | PB3 |
| RGB LCD | PD0..PD9, PD12..PD21, PE6/PE7 |

`f101_periph_pin_mux(signal, instance, gpio)` returns the function number for that pad, or -1 when the pad cannot carry the signal. Drivers check the return value during initialization, so a wrong pin produces `ESP_ERR_INVALID_ARG` instead of silently driving something else.

## Board pins

| GPIO | Purpose |
| --- | --- |
| PD2 | GT967 touch interrupt |
| PD3 | GT967 touch reset |
| PD4 | Audio amplifier enable, active high |
| PD5 | On-board LED, also base board SW1 |
| PD9 | DSI panel reset |
| PD22 | Backlight PWM |
| PE10 | AIC8800 power enable |
| PF6 | microSD card detect; V1.4 and earlier need the lowest drive strength |
