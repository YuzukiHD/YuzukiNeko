---
title: "Display, DBI and G2D"
---

The display side has three libraries. `Display` drives the RGB panel through the display engine and owns an ARGB8888 drawing buffer. `DBI` drives a small panel over 4-wire SPI on the same pins. `G2D` accelerates fill, blit and blend on either buffer. `Display` and `DBI` are mutually exclusive because they share PD0..PD5.

## Display

`Display` is a `Print`, so `print()` and `printf()` work on it. `begin(brightness = 255)` starts the panel and the backlight; `end()` stops them.

| Group | Methods |
| --- | --- |
| Lifetime | `begin`, `end`, `width`, `height`, `buffer`, `stride` |
| Colours | `color`, `fillScreen`, `fillRect`, `drawRect` |
| Pixels and shapes | `drawPixel`, `getPixel`, `drawFastHLine`, `drawFastVLine`, `drawLine`, `drawCircle`, `fillCircle`, `drawTriangle`, `fillTriangle`, `drawBitmap` |
| Text | `setCursor`, `setTextColor`, `setTextSize`, `setTextWrap`, `drawChar`, `textWidth`, `print`, `printf` |
| Output | `show()`, `show(x, y, w, h)` |
| Panel | `setBrightness`, `blank` |

The drawing buffer is `0xAARRGGBB`, `stride()` pixels per row, and equals the panel width. All drawing is clipped to the screen. The font is 5×7 in a 6×8 cell, scaled by `setTextSize()`. `setTextColor(fg)` draws transparent text; `setTextColor(fg, bg)` fills the cell.

`show()` copies the buffer to the display engine's frame buffer plane. `show(x, y, w, h)` copies one rectangle. Drawing does not touch the screen until `show()` runs.

```cpp
#include <Display.h>

void setup() {
  Serial.begin(115200);
  if (!Display.begin()) {
    Serial.println("display not ready");
    return;
  }
  Display.fillScreen(Display.color(0, 0, 64));
  Display.fillRect(20, 20, 200, 120, Display.color(255, 0, 0));
  Display.setTextSize(3);
  Display.setTextColor(Display.color(255, 255, 255));
  Display.setCursor(20, 200);
  Display.println("F101 Arduino");
  Display.show();
}
```

## Video plane

`showYuv()` puts an NV12 or NV21 picture on the video plane and scales it to the screen. The drawing buffer stays on top; pixels with alpha 0 let the picture through. This is how `DisplayYuvOverlay` and the video player draw subtitles or UI over a video frame.

The picture memory has to stay valid and unchanged until the next `showYuv()` or `hideYuv()`. The display engine reads it directly, so the sketch must write it back from the data cache first:

```cpp
Display.cacheFlush(y, width * height * 3 / 2);
Display.showYuv(y, uv, width, height, strideY, strideUV);
```

`nv21` selects the chroma order, `fullRange` and `bt709` select the colour conversion, and `nonblock` returns before the previous update has finished. `showYuv()` returns false when the plane or the scaling is not available.

## DBI

`DBI` is a MIPI DBI type C host: 4-wire SPI with a D/C line. It uses the same PD0..PD5 pins as the RGB panel; including both `Display.h` and `DBI.h` in one sketch is a compile error.

| Signal | Pin |
| --- | --- |
| Chip select | PD0 |
| Clock | PD1 |
| MOSI | PD2 |
| D/C | PD3 |
| Reset | PD4 |

PD5 is part of the same pin group. The SPI clock is 5 MHz and comes from the devicetree. The reset line is active low.

| Method | Purpose |
| --- | --- |
| `begin(spiMode = 0)` | Starts the DBI host; returns false when it is not ready |
| `reset(holdMs = 20, settleMs = 120)` | Pulses the reset line and waits |
| `command(cmd, params, len)` | Sends a command byte and parameters |
| `writeData(buf, len)` | Streams data bytes, for example pixels |
| `softReset`, `sleepOut`, `displayOn`, `displayOff`, `invert` | Common MIPI DCS commands |
| `setWindow(x0, y0, x1, y1)` | Sets the column and row window |
| `writeRGB565(x, y, w, h, pix, swapBytes)` | Sets the window and streams RGB565 pixels |

There is no readback. Without a panel, `DBIProbe` still completes its calls, which only proves that the host and the bus are alive.

## G2D

`G2D` uses the 2D engine. All calls wait for completion and return 0 or a negative errno.

| Method | Operation |
| --- | --- |
| `fill(dst, rect, color)` | Fills a rectangle with `0xAARRGGBB` |
| `blit(src, srcRect, dst, dstRect, rot, flags)` | Copies with format conversion and scaling; rotation 90/270 swaps the rectangle |
| `blend(fg, fgRect, bg, bgRect, dst, dstRect, mode, fgAlpha, flags)` | Porter-Duff composition; `fgAlpha` multiplies the pixel alpha |

`G2DSurface` describes a buffer: format, width, height, up to three planes and their pitches. `G2DSurface::of()` wraps a packed buffer, `G2DSurface::nv12()` describes a YUV frame, and `G2DSurface::fromDisplay(Display)` wraps the display buffer.

Supported formats are ARGB8888, ABGR8888, RGBA8888, BGRA8888, XRGB8888, XBGR8888, RGB888, BGR888, RGB565, BGR565, ARGB4444 and ARGB1555; NV12, NV21, I420 and YUYV are source-only. Rotations are 0, 90, 180 and 270. Flags are `FlipH`, `FlipV`, `SrcPremultiplied`, `DstPremultiplied`, `NoCacheOps`, `YuvFullRange` and `YuvBt709`.

```cpp
G2DSurface screen = G2DSurface::fromDisplay(Display);
G2D.fill(screen, {0, 0, (uint16_t)Display.width(), (uint16_t)Display.height()}, 0xFF102030);
G2D.blit(tile, {0, 0, 64, 64}, screen, {20, 20, 256, 256});
G2D.blit(tile32, {0, 0, 64, 64}, screen, {300, 20, 64, 64}, G2DRotation::Rot90);
G2D.blend(overlay, {0, 0, 200, 100}, screen, {200, 150, 200, 100}, screen, {200, 150, 200, 100});
```

Rotation and flip must keep the source and destination formats and sizes; scaling and format conversion are `blit` features. `G2DDemo` is the runnable example.

## LVGL

LVGL is not part of the core. The Arduino LVGL library can draw into `Display.buffer()` and call `Display.show()` in its flush callback. The display buffer is ARGB8888, not the 16-bit format most LVGL examples assume; configure LVGL for 32-bit colour. `Display` owns PD0..PD22, PE6/PE7 and PB0..PB3 once it starts, so plan the other pins around it.

## Status

`DisplayBasics` ran on the EVB. `DisplayYuvOverlay` and `G2DDemo` build and link, but the current board-test list does not include the video plane or G2D. `DBIProbe` builds and can drive the bus, but no panel was attached in the recorded tests. Treat the first run of each as bring-up.
