---
title: "SD/MMC 与 SDIO"
---

F101 有两个 SMHC 控制器：SMHC0 接 microSD 卡座，SMHC2 接 AIC8800 的 SDIO 接口。协议层使用 ESP-IDF 的 `sdmmc_*` API，主机层是轮询实现，数据经过 CPU 在 FIFO 和内存之间搬运。

## 控制器与插槽

| 插槽 | 控制器 | 焊盘 |
| --- | --- | --- |
| `SDMMC_HOST_SLOT_0` | SMHC0 | PF2 CLK、PF3 CMD、PF1 D0、PF0 D1、PF5 D2、PF4 D3 |
| `SDMMC_HOST_SLOT_1` | SMHC2 | PE2 CLK、PE3 CMD、PE1 D0、PE0 D1、PE5 D2、PE4 D3 |

两个插槽都只支持 1 位或 4 位总线，没有 8 位数据线。`SDMMC_SLOT_CONFIG_DEFAULT()` 给出 SMHC0 的默认焊盘和不使用卡检测的配置；SMHC2 需要应用自己填 `sdmmc_slot_config_t`。

## SD 卡

```c
#include "driver/sdmmc_host.h"
#include "sdmmc_cmd.h"

sdmmc_host_t host = SDMMC_HOST_DEFAULT();
sdmmc_slot_config_t slot = SDMMC_SLOT_CONFIG_DEFAULT();
slot.width = 4;

sdmmc_host_init();
sdmmc_host_init_slot(SDMMC_HOST_SLOT_0, &slot);

sdmmc_card_t card;
ESP_ERROR_CHECK(sdmmc_card_init(&host, &card));

uint8_t buf[512];
ESP_ERROR_CHECK(sdmmc_read_sectors(&card, buf, 0, 1));
```

默认最大频率是 20 MHz。`sdmmc_host_set_card_clk()` 可以在初始化后调整，但先确认卡和走线支持目标频率。`SDMMC_SLOT_CONFIG_DEFAULT()` 不配置卡检测；需要卡检测时把 `slot.cd` 设为 `GPIO_NUM_PF(6)`，并注意 V1.4 及更早的 10 kΩ 下拉可能无法把电平拉到逻辑低，PF6 应配置最低驱动强度。

FATFS 组件没有在本次实板会话中验证。使用 `esp_vfs_fat_sdmmc_mount()` 之前先做一次裸扇区读写，确认卡初始化和供电正常，再排查文件系统层。

## Wi-Fi 的 SDIO 通道

AIC8800 使用插槽 1、4 位 SDIO，电源使能在 PE10：

```c
aic8800_config_t cfg = {
    .sdmmc_slot = 1,
    .sdmmc_pins = {
        .clk = GPIO_NUM_PE(2),
        .cmd = GPIO_NUM_PE(3),
        .d0 = GPIO_NUM_PE(1),
        .d1 = GPIO_NUM_PE(0),
        .d2 = GPIO_NUM_PE(5),
        .d3 = GPIO_NUM_PE(4),
        .d4 = GPIO_NUM_NC, .d5 = GPIO_NUM_NC,
        .d6 = GPIO_NUM_NC, .d7 = GPIO_NUM_NC,
        .cd = GPIO_NUM_NC, .wp = GPIO_NUM_NC,
        .width = 4, .flags = 0,
    },
    .reg_on_gpio = GPIO_NUM_PE(10),
    .wakeup_gpio = -1,
};
```

`aic8800_wifi_register()` 在 `esp_wifi_start()` 时上电并枚举 SDIO 功能。应用不要同时对插槽 1 调用 `sdmmc_host_init_slot()`，否则会和 Wi-Fi 驱动争用控制器。

## 限制

- 主机层是轮询实现，数据由 CPU 通过 FIFO 搬运；没有 SDMA 或 ADMA。
- 只有 1 位和 4 位总线，没有 8 位模式。
- 卡检测默认关闭；PF6 在 V1.4 及更早的板子上需要最低驱动强度。
- 同一控制器只能由一个驱动拥有：插槽 0 给文件系统，插槽 1 给 AIC8800。
- 没有在实板上验证 FATFS 挂载、热插拔和高速模式，首次使用先做裸扇区测试。
