---
title: "I2C and GT967 touch"
---

F101 has two TWI controllers supporting 7-bit addresses in master mode. The driver uses the current `driver/i2c_master.h` API; the legacy `driver/i2c.h` is not built for F101. The bus is polled, with no interrupt or DMA.

## Controllers and pads

| Bus | SCL | SDA |
| --- | --- | --- |
| I2C0 | PE8 | PE9 |
| I2C1 | PE0 | PE1 |
| I2C1 alternate | PD0 | PD1 |

`SOC_I2C_NUM` is 2, so only port 0 and port 1 exist; the `i2c2` pads appear in the SoC table, but ESP-IDF does not expose a third master port. I2C0 shares PE8/PE9 with UART3, and the I2C1 alternate pads PD0/PD1 are exactly the base board GT967 wiring.

## Bus and devices

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

The base board has external pull-ups on SCL/SDA; `enable_internal_pullup` is only a debugging fallback. The internal pull-up is weak, so do not rely on it for long wires or high speeds. The unit of `glitch_ignore_cnt` is the bus clock period; at 400 kHz, 7 periods is about 17.5 µs.

## Transfers

```c
uint8_t reg = 0x00;
uint8_t value;
i2c_master_transmit_receive(dev, &reg, 1, &value, 1, 100);

uint8_t buf[4];
i2c_master_receive(dev, buf, sizeof(buf), 100);
i2c_master_transmit(dev, buf, sizeof(buf), 100);
```

The last argument is the timeout in milliseconds. `ESP_ERR_TIMEOUT` means the slave did not acknowledge or the bus is held low; check the pull-ups, address and power first, then look for another task using the bus. The driver serializes access with a mutex on the bus object, so multiple tasks can share one bus handle, while concurrent calls on one device handle are serialized.

## GT967 touch

The GT967 register layout is compatible with the GT911 family: I2C address `0x5d`, 16-bit register addresses, up to 400 kHz. The driver does not use the interrupt line; `esp_lcd_touch_read_data()` polls the coordinates.

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

Read the coordinates:

```c
esp_lcd_touch_read_data(touch);
esp_lcd_touch_point_data_t point[1];
uint8_t count = 0;
esp_lcd_touch_get_data(touch, point, &count, 1);
```

`esp_lcd_touch_get_data()` returns the number of touch points; `point[0].x` and `point[0].y` are screen coordinates, and `point[0].strength` is the pressure. The coordinate range comes from `x_max`/`y_max`; for a rotated panel, change `swap_xy` and the mirror flags.

## Board wiring

| Signal | GPIO |
| --- | --- |
| SCL | PD0 |
| SDA | PD1 |
| INT | PD2 |
| RST | PD3 |

The touch controller and the display panel share one FPC, and the base board already routes all four signals to the core board. On another base board the address, reset polarity and coordinate orientation may differ; read the schematic before changing the configuration.
