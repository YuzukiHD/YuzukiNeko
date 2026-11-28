---
title: "Display、DBI 与 G2D"
---

显示侧有三个库。`Display` 通过显示引擎驱动 RGB 屏，并管理一块 ARGB8888 绘图缓冲。`DBI` 用同一组引脚上的四线 SPI 驱动小屏。`G2D` 在任意缓冲上加速填充、blit 和混合。`Display` 和 `DBI` 共用 PD0..PD5，不能同时使用。

## Display

`Display` 是一个 `Print`，可以直接 `print()` 和 `printf()`。`begin(brightness = 255)` 启动屏幕和背光，`end()` 停止。

| 分组 | 方法 |
| --- | --- |
| 生命周期 | `begin`、`end`、`width`、`height`、`buffer`、`stride` |
| 颜色 | `color`、`fillScreen`、`fillRect`、`drawRect` |
| 像素与图形 | `drawPixel`、`getPixel`、`drawFastHLine`、`drawFastVLine`、`drawLine`、`drawCircle`、`fillCircle`、`drawTriangle`、`fillTriangle`、`drawBitmap` |
| 文字 | `setCursor`、`setTextColor`、`setTextSize`、`setTextWrap`、`drawChar`、`textWidth`、`print`、`printf` |
| 输出 | `show()`、`show(x, y, w, h)` |
| 屏幕 | `setBrightness`、`blank` |

绘图缓冲是 `0xAARRGGBB`，每行 `stride()` 个像素，等于屏幕宽度。所有绘制都裁剪到屏幕内。字体是 6×8 单元里的 5×7 点阵，按 `setTextSize()` 放大。`setTextColor(fg)` 画透明文字，`setTextColor(fg, bg)` 填充字符单元。

`show()` 把缓冲复制到显示引擎的帧缓冲层，`show(x, y, w, h)` 只复制一个矩形。绘制不会立刻上屏，调用 `show()` 才显示。

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

## 视频层

`showYuv()` 把 NV12 或 NV21 画面放到视频层并缩放到屏幕。绘图缓冲仍在上面；alpha 为 0 的像素让画面透出来。`DisplayYuvOverlay` 和视频播放器就是这样在画面上叠加文字或界面。

画面内存在下一次 `showYuv()` 或 `hideYuv()` 之前必须保持有效且不被修改。显示引擎直接读内存，所以 sketch 要先回写数据缓存：

```cpp
Display.cacheFlush(y, width * height * 3 / 2);
Display.showYuv(y, uv, width, height, strideY, strideUV);
```

`nv21` 选择色度顺序，`fullRange` 和 `bt709` 选择颜色转换，`nonblock` 在上一帧还没完成时提前返回。视频层或缩放不可用时 `showYuv()` 返回 false。

## DBI

`DBI` 是 MIPI DBI type C 主机：四线 SPI 加一根 D/C 线。它和 RGB 屏共用 PD0..PD5；同一个 sketch 同时包含 `Display.h` 和 `DBI.h` 会编译失败。

| 信号 | 引脚 |
| --- | --- |
| 片选 | PD0 |
| 时钟 | PD1 |
| MOSI | PD2 |
| D/C | PD3 |
| 复位 | PD4 |

PD5 属于同一组引脚。SPI 时钟为 5 MHz，来自设备树。复位线低有效。

| 方法 | 作用 |
| --- | --- |
| `begin(spiMode = 0)` | 启动 DBI 主机；未就绪时返回 false |
| `reset(holdMs = 20, settleMs = 120)` | 拉复位并等待 |
| `command(cmd, params, len)` | 发送命令字节和参数 |
| `writeData(buf, len)` | 流式发送数据，例如像素 |
| `softReset`、`sleepOut`、`displayOn`、`displayOff`、`invert` | 常用 MIPI DCS 命令 |
| `setWindow(x0, y0, x1, y1)` | 设置列、行窗口 |
| `writeRGB565(x, y, w, h, pix, swapBytes)` | 设置窗口并发送 RGB565 像素 |

总线没有回读。没有接屏幕时 `DBIProbe` 的调用也会完成，只能证明主机和总线是活的。

## G2D

`G2D` 使用 2D 引擎。所有调用等待完成，返回 0 或负 errno。

| 方法 | 操作 |
| --- | --- |
| `fill(dst, rect, color)` | 用 `0xAARRGGBB` 填充矩形 |
| `blit(src, srcRect, dst, dstRect, rot, flags)` | 带格式转换和缩放的复制；旋转 90/270 会交换矩形 |
| `blend(fg, fgRect, bg, bgRect, dst, dstRect, mode, fgAlpha, flags)` | Porter-Duff 合成；`fgAlpha` 与像素 alpha 相乘 |

`G2DSurface` 描述一块缓冲：格式、宽高、最多三个平面和各自的 pitch。`G2DSurface::of()` 包装紧凑缓冲，`G2DSurface::nv12()` 描述 YUV 帧，`G2DSurface::fromDisplay(Display)` 包装显示缓冲。

支持的格式有 ARGB8888、ABGR8888、RGBA8888、BGRA8888、XRGB8888、XBGR8888、RGB888、BGR888、RGB565、BGR565、ARGB4444 和 ARGB1555；NV12、NV21、I420 和 YUYV 只能作为源。旋转为 0、90、180、270。标志有 `FlipH`、`FlipV`、`SrcPremultiplied`、`DstPremultiplied`、`NoCacheOps`、`YuvFullRange` 和 `YuvBt709`。

```cpp
G2DSurface screen = G2DSurface::fromDisplay(Display);
G2D.fill(screen, {0, 0, (uint16_t)Display.width(), (uint16_t)Display.height()}, 0xFF102030);
G2D.blit(tile, {0, 0, 64, 64}, screen, {20, 20, 256, 256});
G2D.blit(tile32, {0, 0, 64, 64}, screen, {300, 20, 64, 64}, G2DRotation::Rot90);
G2D.blend(overlay, {0, 0, 200, 100}, screen, {200, 150, 200, 100}, screen, {200, 150, 200, 100});
```

旋转和翻转必须保持源和目标的格式、尺寸一致；缩放和格式转换是 `blit` 的功能。可运行的例子是 `G2DDemo`。

## LVGL

LVGL 不在核心里。Arduino 的 LVGL 库可以画到 `Display.buffer()`，在 flush 回调里调用 `Display.show()`。显示缓冲是 ARGB8888，不是多数 LVGL 示例假设的 16 位格式，配置 LVGL 时选 32 位颜色。`Display` 启动后会占用 PD0..PD22、PE6/PE7 和 PB0..PB3，其他引脚要避开这些。

## 状态

`DisplayBasics` 在 EVB 上跑过。`DisplayYuvOverlay` 和 `G2DDemo` 能构建和链接，但当前板测列表里没有视频层和 G2D。`DBIProbe` 能构建并驱动总线，记录里的测试没有接屏幕。第一次运行时都按 bring-up 对待。
