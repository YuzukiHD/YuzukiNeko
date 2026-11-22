---
title: "SD/MMC and SDIO"
---

F101 has two SMHC controllers: SMHC0 connects the microSD slot and SMHC2 connects the AIC8800 SDIO interface. The protocol layer uses the ESP-IDF `sdmmc_*` API, and the host layer is polled, moving data between the FIFO and memory through the CPU.

## Controllers and slots

| Slot | Controller | Pads |
| --- | --- | --- |
| `SDMMC_HOST_SLOT_0` | SMHC0 | PF2 CLK, PF3 CMD, PF1 D0, PF0 D1, PF5 D2, PF4 D3 |
| `SDMMC_HOST_SLOT_1` | SMHC2 | PE2 CLK, PE3 CMD, PE1 D0, PE0 D1, PE5 D2, PE4 D3 |

Both slots support only 1-bit or 4-bit buses; there are no eight data lines. `SDMMC_SLOT_CONFIG_DEFAULT()` provides the SMHC0 pads and disables card detect; SMHC2 needs an explicit `sdmmc_slot_config_t` from the application.

## SD card

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

The default maximum frequency is 20 MHz. `sdmmc_host_set_card_clk()` can change it after initialization, but confirm that the card and wiring support the target rate. `SDMMC_SLOT_CONFIG_DEFAULT()` leaves card detect unconfigured; to use it, set `slot.cd` to `GPIO_NUM_PF(6)` and note that the 10 kΩ pull-down on V1.4 and earlier may not reach a logic low, so PF6 should use the lowest drive strength.

The FATFS component was not verified in this board session. Before `esp_vfs_fat_sdmmc_mount()`, do a raw sector read/write to confirm card initialization and power, then debug the filesystem layer.

## SDIO for the Wi-Fi chip

The AIC8800 uses slot 1, 4-bit SDIO, with power enable on PE10:

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

`aic8800_wifi_register()` powers the chip and enumerates its SDIO functions during `esp_wifi_start()`. The application must not also call `sdmmc_host_init_slot()` on slot 1, or it will contend with the Wi-Fi driver for the controller.

## Limitations

- The host layer is polled and moves data through the FIFO with the CPU; there is no SDMA or ADMA.
- Only 1-bit and 4-bit buses are supported; there is no 8-bit mode.
- Card detect is off by default; PF6 needs the lowest drive strength on V1.4 and earlier.
- One driver owns each controller: slot 0 for the filesystem, slot 1 for the AIC8800.
- FATFS mounting, hot-plug and high-speed modes were not verified on hardware; start with a raw sector test.
