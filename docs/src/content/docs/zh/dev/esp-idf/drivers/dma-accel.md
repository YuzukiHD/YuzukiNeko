---
title: "DMA、PPA 与 JPEG"
---

F101 有一个通用 DMA 控制器、一个 2D 像素加速器（PPA/G2D）和视频引擎的 JPEG 解码器。三者都使用 ESP-IDF 的标准公开 API，但 F101 的实现只覆盖本页列出的操作。

## DMA 控制器

DMA 控制器在 `0x03002000`，PLIC 中断号 50，有 12 个通道和 24 字节的链式描述符。每个描述符最多搬 `0x00ffffff` 字节，一条链最多 32 个描述符。`esp_async_memcpy` 是公开的使用方式：

```c
#include "esp_async_memcpy.h"

async_memcpy_config_t cfg = ASYNC_MEMCPY_DEFAULT_CONFIG();
async_memcpy_handle_t dma;
esp_async_memcpy_install(&cfg, &dma);

esp_async_memcpy(dma, dst, src, len, NULL, NULL);
```

最后两个参数是完成回调和回调参数，传 `NULL` 表示同步等待。源和目标地址要按 64 字节对齐，驱动会在提交前后做 cache 维护。DMA 通道也被 I2S 的循环链占用。同时使用 I2S 和大块拷贝时，先检查剩余通道和描述符数量。

## PPA 2D 加速

PPA 提供缩放、旋转、镜像、混合和填充。使用流程是注册客户端，再提交操作：

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

| 操作 | 客户端类型 | 提交函数 |
| --- | --- | --- |
| 缩放/旋转/镜像 | `PPA_OPERATION_SRM` | `ppa_do_scale_rotate_mirror()` |
| 混合 | `PPA_OPERATION_BLEND` | `ppa_do_blend()` |
| 填充 | `PPA_OPERATION_FILL` | `ppa_do_fill()` |

输入和输出缓冲要按 64 字节对齐，尺寸不能超过 8192 像素。`PPA_TRANS_MODE_BLOCKING` 在操作完成前阻塞。非阻塞模式通过回调或事件通知。G2D 的硬件缓存和带宽限制器由驱动配置，应用不需要直接操作。

## JPEG 解码

视频引擎的 JPEG 解码器支持 baseline JPEG、4:2:0 采样，输出 RGB565、RGB888 或灰度。编码器没有实现，`jpeg_encode` 相关 API 不可用：

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

`jpeg_decoder_get_info()` 只解析文件头，不需要硬件。先用它取得宽高，再分配输出缓冲。输出是去掉填充后的 `width * height` 像素。解码器一次处理一张图，多个任务共享同一个 engine 时要串行化。

## 限制

- DMA 和 PPA 都要求 64 字节对齐，未对齐的缓冲需要先拷贝到对齐缓冲。
- PPA 最大边长为 8192 像素；格式支持以 `ppa_types.h` 中的枚举为准。
- JPEG 只支持 baseline、4:2:0 和 NV12 中间格式，不支持渐进式 JPEG 和编码。
- JPEG 和 PPA 的代码在本次会话中只做了交叉编译和链接，没有在实板上处理图片。
