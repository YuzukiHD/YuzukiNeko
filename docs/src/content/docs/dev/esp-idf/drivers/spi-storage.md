---
title: "SPI, NOR, partitions and NVS"
---

F101 SPI hosts, SPI NOR, partition tables and NVS all use standard ESP-IDF APIs. Unlike ESP32, NOR does not participate in boot and is not written by `idf.py flash`; FEL downloads only the RAM image, so the partition table and NVS data must be written to NOR separately before use.

## Controllers and pads

| Host | Controller | Pads |
| --- | --- | --- |
| `SPI2_HOST` | SPI0 | PC0 SCLK, PC1 CS, PC2 MISO, PC3 WP, PC4 MOSI, PC5 HOLD |
| `SPI3_HOST` | SPI1 | PD0 CS, PD1 SCLK, PD2 MOSI, PD3 MISO, PD4 HOLD, PD5 WP |

`SPI2_HOST` is owned by the on-board NOR by default, and `SPI3_HOST` is left for external devices. SPI is a polled 8-bit master without DMA; the command, address and dummy phase bit counts must be multiples of eight.

## SPI master

```c
#include "driver/spi_master.h"

spi_bus_config_t bus_cfg = {
    .mosi_io_num = GPIO_NUM_PD(2),
    .miso_io_num = GPIO_NUM_PD(3),
    .sclk_io_num = GPIO_NUM_PD(1),
    .quadwp_io_num = -1,
    .quadhd_io_num = -1,
    .max_transfer_sz = 4096,
};
spi_bus_initialize(SPI3_HOST, &bus_cfg, SPI_DMA_DISABLED);

spi_device_interface_config_t dev_cfg = {
    .clock_speed_hz = 1000000,
    .mode = 0,
    .spics_io_num = GPIO_NUM_PD(0),
    .queue_size = 4,
};
spi_device_handle_t dev;
spi_bus_add_device(SPI3_HOST, &dev_cfg, &dev);
```

The `dma_chan` argument of `spi_bus_initialize()` is ignored; `max_transfer_sz` is only checked, and the single-transaction limit is `0xFFFFFF` bytes. Chip select can be the controller's hardware select or any GPIO; in the latter case the driver handles polarity through `SPI_DEVICE_POSITIVE_CS`.

## SPI NOR

The on-board NOR is 16 MiB on `SPI2_HOST` pads PC0..PC5, read with the single-wire `0x03` command and written in 64-byte slices. `esp_flash_default_chip` is created during startup, and applications use `esp_flash_*` directly:

```c
#include "esp_flash.h"

uint32_t size;
esp_flash_get_size(esp_flash_default_chip, &size);

uint8_t id[3];
esp_flash_read(esp_flash_default_chip, id, 0, sizeof(id));
```

Erase a 4 KiB sector before writing:

```c
esp_flash_erase_region(esp_flash_default_chip, offset, length);
esp_flash_write(esp_flash_default_chip, data, offset, length);
```

Do not call `spi_bus_initialize()` on `SPI2_HOST` at the same time; `esp_flash` already owns the controller and its chip select.

## Partitions

The partition table is at NOR offset `0x8000`; the default table contains `nvs`, `phy_init` and `factory`. A RAM build does not place the partition table in the image, so generate and write it separately:

```sh
idf.py partition-table
xfel write 0x8000 build/partition_table/partition-table.bin
```

Applications look up partitions with `esp_partition_find_first()`:

```c
#include "esp_partition.h"

const esp_partition_t *part = esp_partition_find_first(
    ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_NVS, NULL);
esp_partition_read(part, 0, buf, len);
```

On F101, `esp_partition_mmap()` returns a RAM copy, not an XIP mapping; flash writes after the mapping are not reflected in the copy.

## NVS

NVS uses the `nvs` partition from the partition table and the standard API:

```c
#include "nvs_flash.h"

esp_err_t err = nvs_flash_init();
if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    nvs_flash_erase();
    err = nvs_flash_init();
}

nvs_handle_t handle;
nvs_open("cfg", NVS_READWRITE, &handle);
nvs_set_u32(handle, "brightness", 128);
nvs_commit(handle);
nvs_close(handle);
```

The partition table must already exist in NOR before the first run, otherwise `nvs_flash_init()` returns `ESP_ERR_NVS_PART_NOT_FOUND`. The XTS entry points of encrypted NVS are stubs that return unsupported; do not enable `CONFIG_NVS_ENCRYPTION`.

## Limitations

- SPI is polled, without DMA and without quad/octal modes; NOR reads are fixed to single-wire `0x03`.
- `spi_flash_mmap()` and `esp_partition_mmap()` return RAM copies and consume heap.
- Flash encryption, secure boot and OTA are unsupported; the `factory` partition is unused in the RAM flow.
- The partition table must be written to `0x8000` with xfel before NVS is used, and it must match the application's `partitions.csv`.
- There is one NOR chip; `SPI2_HOST` cannot be reused for other peripherals.
