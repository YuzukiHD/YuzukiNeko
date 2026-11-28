---
title: "Video decoding"
---

`VideoDecoder` uses the video engine for hardware JPEG, PNG and H.264 decoding. A decoded frame stays in decoder memory and is handed out without a copy. For single pictures the decoder stays claimed until `release()`; for a stream the sketch has to release frames in time because the decoder holds only a few of them.

## Frame

| Field | Meaning |
| --- | --- |
| `format` | `NV12`, `NV21` or `RGBA8888` |
| `width`, `height` | Visible size |
| `plane[0]`, `plane[1]` | First visible pixel of the luma and chroma planes, or of the RGBA plane |
| `stride[0]`, `stride[1]` | Row length of each plane in bytes |
| `pts` | Timestamp given to `feed()`, `-1` when none |
| `_priv` | Internal handle; `valid()` tests it |

The strides can be larger than the visible width. Do not assume that a row is `width` bytes.

## Single pictures

`decodeJPEG(data, len, frame, format = NV12)` and `decodePNG(data, len, frame)` decode a complete picture. They return 0 on success or a negative errno (`-ENOTSUP`, `-EINVAL`, `-ENOMEM`, `-EIO`). `release(frame)` gives the frame back; after that the decoder can be used again.

JPEG output can be NV12, NV21 or RGBA8888. PNG output is RGBA8888. The decoder does not scale; use `show()` or `G2D` for scaling.

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

## H.264 streams

The stream interface takes an Annex B byte stream with whole NAL units:

| Method | Purpose |
| --- | --- |
| `openH264(bufferSize = 0, format = NV12)` | Start a stream; a zero buffer size uses the driver default |
| `feed(data, len, pts, &consumed)` | Feed bytes; returns `OK` or `AGAIN`, `consumed` is what was taken |
| `getFrame(frame)` | Take a decoded frame; `OK`, `AGAIN` or `BUSY` |
| `flush()` | Drain the frames still in the decoder |
| `closeStream()` | End the stream |
| `streamOpen()` | Test the stream state |

The result codes are:

| Code | Meaning |
| --- | --- |
| `OK` | Success |
| `AGAIN` (`-11`) | Needs more data, or no frame is ready |
| `BUSY` (`-16`) | Every frame is held by the sketch; release some |
| `NODATA` (`-61`) | Flushed and all frames delivered |

`BUSY` is the one to watch: a sketch that keeps every frame will stall the decoder after a few frames. Release each frame once it has been shown or converted.

## Showing a frame

`show(frame, fullRange = false, nonblock = false)` puts an NV12/NV21 frame on the display video plane and scales it to the screen. The frame must stay valid until the next `show()` or `hide()`. `hide()` removes it. This is the path used by `JPEGShow`, `H264Frames` and `MP4Player`.

## CPU conversion

`toRGB565(frame, out, outStridePixels)` and `toARGB8888(frame, out, outStridePixels)` convert a frame on the CPU, without scaling. They are useful for saving a frame, drawing it into the `Display` buffer, or checking a decoder result without the display. `outStridePixels` is the destination row length in pixels.

## MP4

`MP4` demultiplexes an MP4 file and hands out H.264 and AAC packets. `MP4File::readVideoAnnexB(packet, buf)` converts a video packet to the Annex B form with SPS/PPS in front of key frames, ready for `VideoDecoder::feed()`. `MP4Player` does this internally. See [audio](audio.md) for `AACDecoder` and the player.

## Status

JPEG decode ran on the EVB: 320×240 took 4 ms. PNG and H.264 build and link, but the current board-test list does not include them. `JPEGShow` is the smallest decoder example; `H264Frames` is the stream example; `PlayVideo` combines video and audio through `MP4Player`.
