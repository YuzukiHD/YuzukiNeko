---
title: "DMA, PPA and JPEG"
---

F101 has a general DMA controller, a 2D pixel accelerator (PPA/G2D) and the video engine's JPEG decoder. All three use standard public ESP-IDF APIs, but the F101 implementations cover only the operations on this page.

## DMA controller

The DMA controller is at `0x03002000`, uses PLIC interrupt number 50, and has 12 channels with 24-byte chained descriptors. Each descriptor moves at most `0x00ffffff` bytes and a chain holds at most 32 descriptors. `esp_async_memcpy` is the public way to use it:

```c
#include "esp_async_memcpy.h"

async_memcpy_config_t cfg = ASYNC_MEMCPY_DEFAULT_CONFIG();
async_memcpy_handle_t dma;
esp_async_memcpy_install(&cfg, &dma);

esp_async_memcpy(dma, dst, src, len, NULL, NULL);
```

The last two arguments are the completion callback and its argument; `NULL` means synchronous waiting. Source and destination must be 64-byte aligned, and the driver handles cache maintenance around the transfer. DMA channels are also used by the I2S cyclic chain; when mixing I2S with large copies, check the remaining channels and descriptor supply.

## PPA 2D acceleration

PPA provides scaling, rotation, mirroring, blending and fill. Register a client, then submit operations:

```c
#include "driver/ppa.h"

ppa_client_config_t client_cfg = {
    .oper_type = PPA_OPERATION_SRM,
    .max_pending_trans_num = 1,
    .data_burst_length = PPA_DATA_BURST_LENGTH_128,
};
ppa_client_handle_t ppa;
ppa_register_client(&client_cfg, &ppa);

ppa_srm_oper_config_t srm = {
    .in = {
        .buffer = src,
        .pic_w = width, .pic_h = height,
        .block_w = width, .block_h = height,
        .srm_cm = PPA_SRM_COLOR_MODE_RGB565,
    },
    .out = {
        .buffer = dst,
        .buffer_size = width * height * 2,
        .pic_w = width, .pic_h = height,
        .srm_cm = PPA_SRM_COLOR_MODE_RGB565,
    },
    .rotation_angle = PPA_SRM_ROTATION_ANGLE_0,
    .scale_x = 1.0f,
    .scale_y = 1.0f,
    .mode = PPA_TRANS_MODE_BLOCKING,
};
ppa_do_scale_rotate_mirror(ppa, &srm);
```

| Operation | Client type | Submit function |
| --- | --- | --- |
| Scale/rotate/mirror | `PPA_OPERATION_SRM` | `ppa_do_scale_rotate_mirror()` |
| Blend | `PPA_OPERATION_BLEND` | `ppa_do_blend()` |
| Fill | `PPA_OPERATION_FILL` | `ppa_do_fill()` |

Input and output buffers must be 64-byte aligned and no dimension may exceed 8192 pixels. `PPA_TRANS_MODE_BLOCKING` blocks until the operation completes; non-blocking mode reports through a callback or event. The G2D hardware cache and bandwidth limiter are configured by the driver; applications do not touch them directly.

## JPEG decoding

The video engine's JPEG decoder supports baseline JPEG with 4:2:0 sampling and outputs RGB565, RGB888 or grayscale. The encoder is not implemented, and the `jpeg_encode` APIs are unavailable:

```c
#include "driver/jpeg_decode.h"

jpeg_decode_engine_cfg_t eng_cfg = {
    .intr_priority = 0,
    .timeout_ms = 1000,
};
jpeg_decoder_handle_t decoder;
jpeg_new_decoder_engine(&eng_cfg, &decoder);

jpeg_decode_picture_info_t info;
jpeg_decoder_get_info(jpeg_data, jpeg_len, &info);

jpeg_decode_cfg_t dec_cfg = {
    .output_format = JPEG_DECODE_OUT_FORMAT_RGB888,
    .rgb_order = JPEG_DEC_RGB_ELEMENT_ORDER_BGR,
    .conv_std = JPEG_YUV_RGB_CONV_STD_BT601,
};
uint32_t out_size;
jpeg_decoder_process(decoder, &dec_cfg, jpeg_data, jpeg_len, out, out_cap, &out_size);
```

`jpeg_decoder_get_info()` only parses the header and needs no hardware; use it to obtain the dimensions before allocating the output buffer. The output is the visible `width * height` pixels without padding. The decoder handles one picture at a time, so tasks sharing an engine must serialize their calls.

## Limitations

- DMA and PPA require 64-byte alignment; unaligned buffers must be copied into aligned storage first.
- PPA dimensions are limited to 8192 pixels; supported formats are the enumerations in `ppa_types.h`.
- JPEG supports only baseline, 4:2:0 and an NV12 intermediate format; progressive JPEG and encoding are unsupported.
- The JPEG and PPA code only cross-compiled and linked in this session; no picture was processed on hardware.
