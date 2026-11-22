---
title: "I2C 与 GT967 触摸"
---

F101 有两个 TWI 控制器，支持 7 位地址和主机模式。驱动使用 ESP-IDF 的新版 `driver/i2c_master.h` API，旧版 `driver/i2c.h` 没有为 F101 编译。总线是轮询实现，没有中断或 DMA。

## 控制器与焊盘

| 总线 | SCL | SDA |
| --- | --- | --- |
| I2C0 | PE8 | PE9 |
| I2C1 | PE0 | PE1 |
| I2C1 备用 | PD0 | PD1 |

`SOC_I2C_NUM` 为 2，所以只有 port 0 和 port 1；`i2c2` 的焊盘表存在于 SoC 描述中，但 ESP-IDF 不提供第三个主机端口。I2C0 和 UART3 共用 PE8/PE9，I2C1 的备用焊盘 PD0/PD1 正是底板上 GT967 的接线。

## 主机与设备

```c
#include "driver/i2c_master.h"

i2c_master_bus_config_t bus_cfg = {
    .i2c_port = 1,
    .scl_io_num = GPIO_NUM_PD(0),
    .sda_io_num = GPIO_NUM_PD(1),
    .clk_source = I2C_CLK_SRC_DEFAULT,
    .glitch_ignore_cnt = 7,
    .flags.enable_internal_pullup = true,
};
i2c_master_bus_handle_t bus;
i2c_new_master_bus(&bus_cfg, &bus);

i2c_device_config_t dev_cfg = {
    .dev_addr_length = I2C_ADDR_BIT_LEN_7,
    .device_address = 0x5d,
    .scl_speed_hz = 400000,
};
i2c_master_dev_handle_t dev;
i2c_master_bus_add_device(bus, &dev_cfg, &dev);
```

底板在 SCL/SDA 上有外部上拉，`enable_internal_pullup` 只作为调试兜底；内部上拉较弱，长线或高速率时不要依赖它。`glitch_ignore_cnt` 的单位是总线时钟周期，400 kHz 下 7 个周期约为 17.5 µs。

## 传输

```c
uint8_t reg = 0x00;
uint8_t value;
i2c_master_transmit_receive(dev, &reg, 1, &value, 1, 100);

uint8_t buf[4];
i2c_master_receive(dev, buf, sizeof(buf), 100);
i2c_master_transmit(dev, buf, sizeof(buf), 100);
```

最后一个参数是超时毫秒。返回 `ESP_ERR_TIMEOUT` 表示从机没有应答或总线被拉低；先检查上拉、地址和供电，再检查是否有其他任务同时占用总线。驱动在总线对象上加了互斥锁，多个任务可以共享同一个 bus handle，但同一个 device handle 的并发调用会串行化。

## GT967 触摸

GT967 的寄存器布局与 GT911 系列兼容，I2C 地址 `0x5d`，16 位寄存器地址，最高 400 kHz。驱动不接中断线，`esp_lcd_touch_read_data()` 时主动读取坐标。

```c
#include "esp_lcd_touch_gt967.h"

esp_lcd_panel_io_i2c_config_t io_cfg = ESP_LCD_TOUCH_IO_I2C_GT967_CONFIG();
io_cfg.scl_speed_hz = 400000;
esp_lcd_panel_io_handle_t tp_io;
esp_lcd_new_panel_io_i2c(bus, &io_cfg, &tp_io);

esp_lcd_touch_config_t tp_cfg = {
    .x_max = 1024,
    .y_max = 768,
    .rst_gpio_num = GPIO_NUM_PD(3),
    .int_gpio_num = GPIO_NUM_NC,
    .levels = { .reset = 0, .interrupt = 0 },
    .flags = { .swap_xy = 0, .mirror_x = 0, .mirror_y = 0 },
};
esp_lcd_touch_handle_t touch;
esp_lcd_touch_new_i2c_gt967(tp_io, &tp_cfg, &touch);
```

读取坐标：

```c
esp_lcd_touch_read_data(touch);
esp_lcd_touch_point_data_t point[1];
uint8_t count = 0;
esp_lcd_touch_get_data(touch, point, &count, 1);
```

`esp_lcd_touch_get_data()` 返回触摸点数量，`point[0].x`、`point[0].y` 是屏幕坐标，`point[0].strength` 是压力。坐标范围由 `x_max`/`y_max` 决定，面板旋转时修改 `swap_xy` 和镜像标志。

## 板上接线

| 信号 | GPIO |
| --- | --- |
| SCL | PD0 |
| SDA | PD1 |
| INT | PD2 |
| RST | PD3 |

触摸控制器和显示面板共用一条 FPC，底板已经把四根信号接到核心板。使用其他底板时，地址、复位极性和坐标方向都可能不同，先读原理图再改配置。
