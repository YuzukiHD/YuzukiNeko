---
title: "视频解码"
---

`VideoDecoder` 用视频引擎做硬件 JPEG、PNG 和 H.264 解码。解码后的帧留在解码器内存里，直接交给 sketch，不复制。单张图片要 `release()` 后解码器才能再用；视频流要及时释放帧，因为解码器只保留几帧。

## 帧

| 字段 | 含义 |
| --- | --- |
| `format` | `NV12`、`NV21` 或 `RGBA8888` |
| `width`、`height` | 可见尺寸 |
| `plane[0]`、`plane[1]` | 亮度平面和色度平面（或 RGBA 平面）第一个可见像素 |
| `stride[0]`、`stride[1]` | 每个平面的行字节数 |
| `pts` | 传给 `feed()` 的时间戳，没有时为 `-1` |
| `_priv` | 内部句柄；用 `valid()` 判断 |

stride 可能大于可见宽度，不要假设一行就是 `width` 字节。

## 单张图片

`decodeJPEG(data, len, frame, format = NV12)` 和 `decodePNG(data, len, frame)` 解码完整图片。成功返回 0，失败返回负 errno（`-ENOTSUP`、`-EINVAL`、`-ENOMEM`、`-EIO`）。`release(frame)` 归还帧，之后解码器可以再次使用。

JPEG 可以输出 NV12、NV21 或 RGBA8888。PNG 输出 RGBA8888。解码器不缩放；缩放交给 `show()` 或 `G2D`。

```cpp
#include <VideoDecoder.h>

void showJpeg(const void *data, size_t len) {
  VideoFrame frame;
  if (VideoDecoder.decodeJPEG(data, len, frame) != 0) return;
  VideoDecoder.show(frame);
  delay(2000);
  VideoDecoder.hide();
  VideoDecoder.release(frame);
}
```

## H.264 流

流接口接收 Annex B 字节流，每次给完整的 NAL 单元：

| 方法 | 作用 |
| --- | --- |
| `openH264(bufferSize = 0, format = NV12)` | 开始一个流；缓冲大小为 0 时用驱动默认值 |
| `feed(data, len, pts, &consumed)` | 输入字节；返回 `OK` 或 `AGAIN`，`consumed` 是实际取走的字节 |
| `getFrame(frame)` | 取一帧；返回 `OK`、`AGAIN` 或 `BUSY` |
| `flush()` | 取出解码器里剩余的帧 |
| `closeStream()` | 结束流 |
| `streamOpen()` | 查询流状态 |

返回码：

| 返回码 | 含义 |
| --- | --- |
| `OK` | 成功 |
| `AGAIN`（`-11`） | 需要更多数据，或者还没有帧 |
| `BUSY`（`-16`） | 所有帧都被 sketch 持有，需要释放一些 |
| `NODATA`（`-61`） | 已 flush，所有帧都已交付 |

要留意 `BUSY`：一直不释放帧的 sketch 会在几帧之后把解码器卡住。每帧显示或转换完就释放。

## 显示帧

`show(frame, fullRange = false, nonblock = false)` 把 NV12/NV21 帧放到显示视频层并缩放到屏幕。帧在下一次 `show()` 或 `hide()` 之前必须保持有效。`hide()` 移除画面。`JPEGShow`、`H264Frames` 和 `MP4Player` 都走这条路径。

## CPU 转换

`toRGB565(frame, out, outStridePixels)` 和 `toARGB8888(frame, out, outStridePixels)` 在 CPU 上转换帧，不缩放。保存帧、画进 `Display` 缓冲，或者不接屏幕时检查解码结果都用得上。`outStridePixels` 是目标每行的像素数。

## MP4

`MP4` 解封装 MP4 文件，交出 H.264 和 AAC 包。`MP4File::readVideoAnnexB(packet, buf)` 把视频包转成 Annex B 形式，关键帧前面补上 SPS/PPS，可以直接喂给 `VideoDecoder::feed()`。`MP4Player` 内部会做这些。`AACDecoder` 和播放器见[音频](audio.md)。

## 状态

JPEG 解码在 EVB 上跑过：320×240 用了 4 ms。PNG 和 H.264 能构建和链接，但当前板测列表里没有它们。`JPEGShow` 是最小的解码示例，`H264Frames` 是流示例，`PlayVideo` 通过 `MP4Player` 把视频和音频合在一起。
