---
title: "SPI、NOR、分区与 NVS"
---

F101 的 SPI 主机、SPI NOR、分区表和 NVS 都使用 ESP-IDF 的标准 API。与 ESP32 不同的是，NOR 不参与启动，也不会被 `idf.py flash` 写入；FEL 只下载 RAM 镜像，分区表和 NVS 数据需要单独写入 NOR 才能使用。

## 控制器与焊盘

| 主机 | 控制器 | 焊盘 |
| --- | --- | --- |
| `SPI2_HOST` | SPI0 | PC0 SCLK、PC1 CS、PC2 MISO、PC3 WP、PC4 MOSI、PC5 HOLD |
| `SPI3_HOST` | SPI1 | PD0 CS、PD1 SCLK、PD2 MOSI、PD3 MISO、PD4 HOLD、PD5 WP |

`SPI2_HOST` 默认被板载 NOR 占用，`SPI3_HOST` 留给外部设备。SPI 是轮询的 8 位主机，没有 DMA；命令、地址和 dummy 阶段的位数必须是 8 的倍数。

## SPI 主机

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

`spi_bus_initialize()` 的 `dma_chan` 参数被忽略；`max_transfer_sz` 只用于检查，单次传输上限是 `0xFFFFFF` 字节。片选可以是控制器的硬件片选，也可以是任意 GPIO；后者由驱动按 `SPI_DEVICE_POSITIVE_CS` 处理极性。

## SPI NOR

板载 NOR 是 16 MiB，接在 `SPI2_HOST` 的 PC0..PC5，读命令为单线 `0x03`，写按 64 字节分片。`esp_flash_default_chip` 在启动时创建，应用直接使用 `esp_flash_*`：

```c
#include "esp_flash.h"

uint32_t size;
esp_flash_get_size(esp_flash_default_chip, &size);

uint8_t id[3];
esp_flash_read(esp_flash_default_chip, id, 0, sizeof(id));
```

写之前按 4 KiB 扇区擦除：

```c
esp_flash_erase_region(esp_flash_default_chip, offset, length);
esp_flash_write(esp_flash_default_chip, data, offset, length);
```

不要同时对 `SPI2_HOST` 调用 `spi_bus_initialize()`；`esp_flash` 已经拥有这个控制器和它的片选。

## 分区

分区表位于 NOR 偏移 `0x8000`，默认表包含 `nvs`、`phy_init` 和 `factory`。RAM 构建不会自动把分区表放进镜像，需要单独生成并写入：

```sh
idf.py partition-table
xfel write 0x8000 build/partition_table/partition-table.bin
```

应用通过 `esp_partition_find_first()` 查找分区：

```c
#include "esp_partition.h"

const esp_partition_t *part = esp_partition_find_first(
    ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_NVS, NULL);
esp_partition_read(part, 0, buf, len);
```

`esp_partition_mmap()` 在 F101 上返回一块 RAM 副本，不是 XIP 映射；映射之后对 flash 的写入不会反映到副本。

## NVS

NVS 使用分区表中的 `nvs` 分区，标准 API 即可：

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

第一次运行前 NOR 中必须已经有分区表，否则 `nvs_flash_init()` 返回 `ESP_ERR_NVS_PART_NOT_FOUND`。加密 NVS 的 XTS 入口是占位实现，返回不支持；不要启用 `CONFIG_NVS_ENCRYPTION`。

## 限制

- SPI 是轮询实现，没有 DMA，也没有 quad/octal 模式；NOR 读取固定为单线 `0x03`。
- `spi_flash_mmap()` 和 `esp_partition_mmap()` 返回 RAM 副本，占用堆空间。
- 不支持 flash encryption、secure boot 和 OTA；`factory` 分区在 RAM 流程中不会被使用。
- 分区表必须在写入 NVS 之前通过 xfel 单独写到 `0x8000`，且与应用的 `partitions.csv` 一致。
- 同一时刻只有一个 NOR 芯片；`SPI2_HOST` 不能复用于其他外设。
