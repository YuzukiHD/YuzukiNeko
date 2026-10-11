---
title: "Video engine vdec"
---

The video engine on the F101 can decode <strong>JPEG</strong>, <strong>PNG</strong> and <strong>H.264</strong> in hardware. In Zephyr it is made into a device whose interface is `<zephyr/drivers/vdec.h>`, with the driver under `drivers/vdec/sunxi/`.

| Codec | Usage | Output format |
| --- | --- | --- |
| JPEG | Single image, `vdec_decode_image()` | `VDEC_FORMAT_NV12` or `VDEC_FORMAT_NV21` |
| PNG | Single image, `vdec_decode_image()` | `VDEC_FORMAT_RGBA8888` |
| MJPEG | A series of JPEGs, `vdec_stream_*()`, with `codec` set to `VDEC_CODEC_JPEG` | `VDEC_FORMAT_NV12` or `VDEC_FORMAT_NV21` |
| H.264 | Video stream, `vdec_stream_*()` | `VDEC_FORMAT_NV12` or `VDEC_FORMAT_NV21` |

What the output formats mean:

| Format | Memory layout |
| --- | --- |
| `VDEC_FORMAT_NV12` | 8-bit luma plane followed by a half-resolution interleaved Cb/Cr plane |
| `VDEC_FORMAT_NV21` | Same, but the interleaving order is Cr/Cb |
| `VDEC_FORMAT_RGBA8888` | 32-bit little-endian word with R in the most significant byte and A in the least significant byte (the byte order in memory is A, B, G, R) |

## Devicetree

The video engine involves three files, from the bottom up:

| File | Role |
| --- | --- |
| `dts/bindings/video/allwinner,sunxi-ve.yaml` | Binding: specifies which properties an `allwinner,sunxi-ve` node must have |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree: defines the `ve` node and its registers, interrupt, clocks and reset, `disabled` by default |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts`, `boards/yuzukihd/f101_evb/f101_evb.dts` | Board devicetrees: change `ve` to `okay` |

If the `ve` node is not enabled, `CONFIG_VDEC_SUNXI` is not selected (it depends on `DT_HAS_ALLWINNER_SUNXI_VE_ENABLED`) and the driver is not compiled in.

### SoC devicetree: sun252i_f101.dtsi

Below is the `ve` node in `sun252i_f101.dtsi`, with the explanations in comments (these comments were added; the node content matches the source file):

```c
/* Under the soc node, lines 464–474 */
ve: video-codec@1c0e000 {
	/* Label ve: applications get this device with DT_NODELABEL(ve) */

	/* Matches DT_DRV_COMPAT allwinner_sunxi_ve in the driver vdec_sunxi.c */
	compatible = "allwinner,sunxi-ve";

	/* Register window: base 0x01c0e000, length 0x1000 (4 KiB) */
	reg = <0x01c0e000 0x1000>;

	/* Interrupt: PLIC number 66, priority 1. The PLIC #interrupt-cells is 2, and the two cells are irq then priority */
	interrupts = <66 1>;
	interrupt-parent = <&plic>;

	/* Three clocks, in one-to-one order with clock-names: module clock, bus clock, MBUS clock */
	clocks = <&cctl CLK_VE>, <&cctl CLK_BUS_VE>, <&cctl CLK_BUS_VE_M>;
	clock-names = "mod", "bus", "mbus";

	/* Bus reset */
	resets = <&rctl RST_BUS_VE>;

	/* Offset of the module clock register in the CCU: clock source select, divider and gate are all in this register */
	clock-reg = <0x690>;

	/* Base of the system control block, which holds the control bits that hand the shared SRAM to the video engine */
	sram-ctrl-reg = <0x03000000>;

	/* Disabled by default, enabled by the board */
	status = "disabled";
};
```

Macros such as `CLK_VE` are defined in `include/zephyr/dt-bindings/clock/sun252i-f101-ccu.h`; `ALLWINNER_CCU_ID(base, reg, bit)` packs "which CCU, register offset, bit" into a single integer, as `(base << 20) | (reg << 8) | bit`:

| Macro | CCU | Register offset | Bit |
| --- | --- | --- | --- |
| `CLK_VE` | `ALLWINNER_CCU_MAIN` | `0x0690` | 31 |
| `CLK_BUS_VE` | `ALLWINNER_CCU_MAIN` | `0x069c` | 0 |
| `RST_BUS_VE` | `ALLWINNER_CCU_MAIN` | `0x069c` | 16 |
| `CLK_BUS_VE_M` | `ALLWINNER_CCU_MAIN` | `0x0804` | 1 |

### Board devicetrees: yuzukineko.dts and f101_evb.dts

Both boards do one thing only: enable the node. `yuzukineko.dts` lines 409–412:

```c
/* Video engine: hardware JPEG, PNG and H.264 decoder */
&ve {
	status = "okay";
};
```

`f101_evb.dts` lines 278–281 are written exactly the same way. `&ve` references the `ve` node of the SoC devicetree by label; `status = "okay"` overrides `disabled`, and the remaining properties are inherited from the dtsi.

To use it on your own board or in an application, put the same override in the application's `boards/<board>.overlay`:

```c
&ve {
	status = "okay";
};
```

### Binding: allwinner,sunxi-ve.yaml

The binding file specifies which properties the node must have; a missing one fails the build:

```yaml
# Copyright (c) 2026 Yuzuki Tsuru
# SPDX-License-Identifier: Apache-2.0

description: Allwinner sunxi video engine (JPEG, PNG and H.264 decoder)

compatible: "allwinner,sunxi-ve"

include: base.yaml

properties:
  reg:
    required: true

  interrupts:
    required: true

  clocks:
    required: true

  clock-names:
    required: true

  resets:
    type: phandle-array
    required: true

  clock-reg:
    type: int
    required: true
    description: |
      Offset of the module clock register (source select, divider and gate)
      in the main CCU.

  sram-ctrl-reg:
    type: int
    required: true
    description: |
      Base of the system control block holding the SRAM ownership bits that
      hand the shared SRAM to the video engine.
```

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `reg` | From `base.yaml` | Yes | Register window |
| `interrupts` | From `base.yaml` | Yes | Interrupt |
| `clocks`, `clock-names` | From `base.yaml` | Yes | The three clocks and their names |
| `resets` | phandle array | Yes | Reset |
| `clock-reg` | int | Yes | Offset of the module clock register in the main CCU |
| `sram-ctrl-reg` | int | Yes | Base of the system control block, which holds the SRAM ownership bits |

Getting the device in an application:

```c
const struct device *dev = DEVICE_DT_GET(DT_NODELABEL(ve));
```

## Kconfig

Enable `CONFIG_VDEC=y` in the application's `prj.conf`. The video engine driver, `CONFIG_VDEC_SUNXI`, is on by default when the devicetree node is enabled and requires `CONFIG_FPU`. Applications that play video generally also need `CONFIG_FPU_SHARING`.

| Option | Default | Description |
| --- | --- | --- |
| `CONFIG_VDEC` | n | Master switch |
| `CONFIG_VDEC_INIT_PRIORITY` | 90 | Driver initialization priority |
| `CONFIG_VDEC_SUNXI` | y | Video engine driver. Depends on `ve` being enabled in the devicetree and on `CONFIG_FPU` |
| `CONFIG_VDEC_SUNXI_JPEG` | y | JPEG decode |
| `CONFIG_VDEC_SUNXI_PNG` | y | PNG decode |
| `CONFIG_VDEC_SUNXI_H264` | y | H.264 decode (frame pictures only; field coding and macroblock-adaptive frame/field coding are not supported) |
| `CONFIG_VDEC_SUNXI_RVV` | y | Uses the vector extension to accelerate the CPU-side byte loops: PNG filtering, checksum and pixel conversion, the NV21 chroma swap, and H.264 start-code search. Depends on `CONFIG_SUN252I_F101_RVV`; engine decoding itself is unaffected |
| `CONFIG_VDEC_SUNXI_H264_DIRECT_NV12` | n | Experimental: for H.264 the engine writes linear NV12 directly through its second output path, doing away with a separate conversion. Depends on `CONFIG_VDEC_SUNXI_H264` |
| `CONFIG_VDEC_SUNXI_H264_DIRECT_CHECK` | n | For debugging: converts the first few pictures of the stream a second time and prints how many bytes differ between the two linear pictures. Depends on the previous option |
| `CONFIG_VDEC_SUNXI_MEM_TRACE` | n | For debugging: prints every picture and work-buffer allocation |
| `CONFIG_VDEC_SUNXI_CLOCK_MHZ` | 300 | Target frequency of the module clock (MHz); the actual value is the closest one the clock divider can produce that does not exceed the source frequency |
| `CONFIG_VDEC_SUNXI_STREAM_BUFFER_KB` | 512 | Size of the compressed-data buffer (KiB). One JPEG or PNG must fit; an application can ask for a larger one when opening a stream |
| `CONFIG_VDEC_SUNXI_MAX_MEMORY_KB` | 12288 | Memory limit available to one decoder (KiB), pictures and stream buffer included; it determines how many frame buffers a stream gets (never fewer than the H.264 reference-frame count plus 3) |
| `CONFIG_VDEC_SUNXI_MEM_ALIGN` | 4096 | Alignment of every buffer handed to the video engine |
| `CONFIG_VDEC_SUNXI_LOG_LEVEL` | 3 | Driver log level |

## Interface reference

`<zephyr/drivers/vdec.h>` has seven functions in all. Each function below is written out as "prototype → parameters → return value → description → example code → log". <strong>The logs are real output from running the demo program on `yuzukineko`</strong>; the complete source of the demo program is in [Complete demo program](#complete-demo-program) at the end.

The `err()`, `show_frame()` and `luma_crc()` in the examples are small helpers in the demo program; their source is at the end.

The demo program's test data: for JPEG, PNG and H.264 it uses the pictures embedded in the three samples under `samples/drivers/vdec/` (all 320×240); for MJPEG, five 320×240 JPEGs were generated with ffmpeg.

:::caution
On a decode failure the driver prints an `<err>` log. Logs are emitted from a deferred context and interleave with the demo program's `printk` output, so the logs pasted below keep only the lines the demo program itself prints; for the driver logs see [Driver logs](#driver-logs).
:::

### vdec_decode_image

Decode one JPEG or PNG.

```c
int vdec_decode_image(const struct device *dev, enum vdec_codec codec,
                      const void *data, size_t len, enum vdec_format format,
                      struct vdec_frame *frame);
```

| Parameter | Description |
| --- | --- |
| `dev` | Video engine device, `DEVICE_DT_GET(DT_NODELABEL(ve))` |
| `codec` | `VDEC_CODEC_JPEG` or `VDEC_CODEC_PNG` |
| `data`, `len` | The whole compressed picture. The driver no longer references it after returning, so the caller can free or reuse this memory immediately |
| `format` | The desired frame format. JPEG uses `VDEC_FORMAT_NV12` or `VDEC_FORMAT_NV21`, PNG uses `VDEC_FORMAT_RGBA8888` |
| `frame` | Output, filled in on success |

Return values; the last column of the table below is what the demo program got on the board:

| Return value | Meaning in the header comment | What happened in the example |
| --- | --- | --- |
| `0` | Success | JPEG→NV12, JPEG→NV21, PNG→RGBA8888 |
| `-ENOTSUP` | Codec, format or picture not supported | PNG→NV12; JPEG→RGBA8888; `VDEC_CODEC_H264` passed to this function |
| `-EINVAL` | Bad parameters, or the picture is corrupt | 16 bytes of `0x55` as a JPEG |
| `-ENOMEM` | The picture does not fit in decoder memory | Not triggered |
| `-EIO` | Hardware decode failed | Half a JPEG |

Key points:

- <strong>Blocks</strong> until decoding finishes. A 320×240 JPEG takes about 2 ms, a PNG about 28 ms (PNG is decoded in software).
- After success the decoder is <strong>occupied</strong> by this frame until `vdec_frame_release()`. Other `vdec_decode_image()` and `vdec_stream_open()` calls wait during that time. So take the frame, use it and release it; do not hold it for long.
- A failure does not occupy the decoder and needs no release; after an error the decoder remains usable (in the demo, after the half-JPEG failure a normal JPEG decoded successfully right away).
- The `pts` of JPEG and PNG frames is `-1` (there is no timestamp).
- PNG is `RGBA8888`: `plane[0]` is the pixels, `stride[0]` is the bytes per row (320×4=1280), `plane[1]` is NULL and `stride[1]` is 0. The byte order in memory is A, B, G, R.

#### Example: JPEG

The demo program requests NV21, NV12, NV21 in turn and prints each call's return value, verifying that both formats decode. On success it also prints the frame info and the CRC of the luma plane, then releases it.

```c
static void demo_jpeg(void)
{
	static const enum vdec_format formats[] = {VDEC_FORMAT_NV21, VDEC_FORMAT_NV12, VDEC_FORMAT_NV21};
	struct vdec_frame frame;
	int64_t t;
	int ret;

	for (int i = 0; i < ARRAY_SIZE(formats); i++) {
		t = k_uptime_get();
		ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg),
					formats[i], &frame);
		printk("[jpeg] vdec_decode_image(format %d) = %s, %lld ms\n", formats[i], err(ret),
		       k_uptime_get() - t);
		if (ret == 0) {
			show_frame("[jpeg]", &frame);
			printk("[jpeg] luma crc %08x\n", luma_crc(&frame));
			vdec_frame_release(dev, &frame);
			printk("[jpeg] vdec_frame_release done\n");
		}
	}
}
```

Log:

```text
[jpeg] vdec_decode_image(format 2) = 0, 2 ms
[jpeg] frame: format 2, 320x240, stride 320/320, pts -1
[jpeg] luma crc f6be232d
[jpeg] vdec_frame_release done
[jpeg] vdec_decode_image(format 1) = 0, 2 ms
[jpeg] frame: format 1, 320x240, stride 320/320, pts -1
[jpeg] luma crc f6be232d
[jpeg] vdec_frame_release done
[jpeg] vdec_decode_image(format 2) = 0, 2 ms
[jpeg] frame: format 2, 320x240, stride 320/320, pts -1
[jpeg] luma crc f6be232d
[jpeg] vdec_frame_release done
```

`format 2` is `VDEC_FORMAT_NV21` and `format 1` is `VDEC_FORMAT_NV12`, and all three succeeded. The frame is 320×240, both the luma and chroma `stride` are 320, and `pts` is -1. NV21 and NV12 are the same picture with the chroma byte order swapped, so the luma CRC is the same all three times.

#### Example: PNG

```c
static void demo_png(void)
{
	struct vdec_frame frame;
	int64_t t = k_uptime_get();
	int ret;

	ret = vdec_decode_image(dev, VDEC_CODEC_PNG, test_png, sizeof(test_png),
				VDEC_FORMAT_RGBA8888, &frame);
	printk("[png] vdec_decode_image(RGBA8888) = %s, %lld ms\n", err(ret), k_uptime_get() - t);
	if (ret == 0) {
		const uint8_t *p = frame.plane[0];

		show_frame("[png]", &frame);
		printk("[png] first pixel bytes (A, B, G, R): %02x %02x %02x %02x\n", p[0], p[1],
		       p[2], p[3]);
		vdec_frame_release(dev, &frame);
		printk("[png] vdec_frame_release done\n");
	}
}
```

Log:

```text
[png] vdec_decode_image(RGBA8888) = 0, 28 ms
[png] frame: format 3, 320x240, stride 1280/0, pts -1
[png] first pixel bytes (A, B, G, R): ff ff ff ff
[png] vdec_frame_release done
```

`format 3` is `VDEC_FORMAT_RGBA8888`; the first `stride` entry is 1280 (320 pixels × 4 bytes) and the second is 0. The first pixel of the test picture has `ff` in all four bytes.

#### Example: the various errors

```c
static void demo_image_errors(void)
{
	static const uint8_t garbage[16] = {0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
					    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55};
	struct vdec_frame frame;
	int ret;

	ret = vdec_decode_image(dev, VDEC_CODEC_PNG, test_png, sizeof(test_png), VDEC_FORMAT_NV12,
				&frame);
	printk("[error] PNG as NV12             = %s\n", err(ret));
	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg),
				VDEC_FORMAT_RGBA8888, &frame);
	printk("[error] JPEG as RGBA8888        = %s\n", err(ret));
	ret = vdec_decode_image(dev, VDEC_CODEC_H264, test_jpeg, sizeof(test_jpeg),
				VDEC_FORMAT_NV12, &frame);
	printk("[error] H.264 to decode_image   = %s\n", err(ret));
	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, garbage, sizeof(garbage), VDEC_FORMAT_NV12,
				&frame);
	printk("[error] 16 bytes of 0x55 (JPEG) = %s\n", err(ret));
	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg) / 2,
				VDEC_FORMAT_NV12, &frame);
	printk("[error] half a JPEG             = %s\n", err(ret));
	if (ret == 0) {
		vdec_frame_release(dev, &frame);
	}
	/* the decoder must still work after the errors */
	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg),
				VDEC_FORMAT_NV12, &frame);
	printk("[error] a good JPEG afterwards  = %s\n", err(ret));
	if (ret == 0) {
		vdec_frame_release(dev, &frame);
	}
}
```

Log:

```text
[error] PNG as NV12             = -ENOTSUP
[error] JPEG as RGBA8888        = -ENOTSUP
[error] H.264 to decode_image   = -ENOTSUP
[error] 16 bytes of 0x55 (JPEG) = -EINVAL
[error] half a JPEG             = -EIO
[error] a good JPEG afterwards  = 0
```

The return value of each error is in the return-value table above. The last line shows that the decoder is still usable after the errors.

### vdec_frame_release

Give a frame back.

```c
void vdec_frame_release(const struct device *dev, struct vdec_frame *frame);
```

| Parameter | Description |
| --- | --- |
| `dev` | Video engine device |
| `frame` | The frame to give back; must be one handed out by `vdec_decode_image()` or `vdec_stream_get_frame()` |

No return value.

- For a frame from `vdec_decode_image()`: only after the release can the decoder be used again.
- For a frame from a stream: the picture goes back into the decoder's picture pool. The decoder has only a few pictures, so not releasing makes `vdec_stream_get_frame()` return `-EBUSY`.
- After the release the memory pointed to by `frame->plane[]` no longer belongs to you and must not be read.
- Do not release a frame while the display engine or the 2D accelerator is still reading it. What the MP4 player does is "release one frame late".
- Each frame may be released only once.

#### Example: decode one picture and release it

Decode a JPEG, release it, then decode again right away. The `plane` address returned both times is the same, showing that the decoder took the same picture memory back into use, so the original pointer must not be read after the release:

```c
static void demo_frame_release(void)
{
	struct vdec_frame frame;
	int ret;

	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg),
				VDEC_FORMAT_NV12, &frame);
	printk("[release] first decode = %s, plane %p\n", err(ret), frame.plane[0]);
	if (ret != 0) {
		return;
	}
	vdec_frame_release(dev, &frame);
	printk("[release] vdec_frame_release done\n");

	/* the decoder is free again: the next picture can be decoded at once */
	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg),
				VDEC_FORMAT_NV12, &frame);
	printk("[release] second decode = %s, plane %p\n", err(ret), frame.plane[0]);
	if (ret == 0) {
		vdec_frame_release(dev, &frame);
		printk("[release] vdec_frame_release done\n");
	}
}
```

Log:

```text
[release] first decode = 0, plane 0x4029f000
[release] vdec_frame_release done
[release] second decode = 0, plane 0x4029f000
[release] vdec_frame_release done
```

#### Example: frames from a stream

With `holding_frames` set to 2, take frames without releasing any until it is blocked off (`-EBUSY`); then release all the frames held and the decoder becomes usable again:

```c
static void demo_hold(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
		.holding_frames = 2,
	};
	struct vdec_frame held[8], frame;
	struct vdec_stream *stream;
	size_t off = 0, used, nal_end;
	int n = 0, ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[hold] vdec_stream_open(holding_frames 2) = %s\n", err(ret));
	if (ret != 0) {
		return;
	}
	/* take frames and never give them back */
	while (n < ARRAY_SIZE(held)) {
		ret = vdec_stream_get_frame(dev, stream, &held[n]);
		if (ret == 0) {
			n++;
			continue;
		}
		if (ret != -EAGAIN || off >= sizeof(test_h264)) {
			break;
		}
		nal_end = next_start_code(test_h264, sizeof(test_h264), off + 4);
		if (vdec_stream_feed(dev, stream, test_h264 + off, nal_end - off, -1, &used) == 0) {
			off += used;
		}
	}
	printk("[hold] %d frames held, get_frame = %s\n", n, err(ret));
	for (int i = 0; i < n; i++) {
		vdec_frame_release(dev, &held[i]);
	}
	ret = vdec_stream_get_frame(dev, stream, &frame);
	printk("[hold] after releasing them, get_frame = %s\n", err(ret));
	if (ret == 0) {
		vdec_frame_release(dev, &frame);
	}
	vdec_stream_close(dev, stream);
	printk("[hold] vdec_stream_close done\n");
}
```

Log:

```text
[hold] vdec_stream_open(holding_frames 2) = 0
[hold] 3 frames held, get_frame = -EBUSY
[hold] after releasing them, get_frame = -EAGAIN
[hold] vdec_stream_close done
```

`3 frames held, get_frame = -EBUSY` is the state before the release; after the release it becomes `-EAGAIN` (it wants more data, since this function feeds no more), no longer `-EBUSY`.

### vdec_stream_open

Open a decode stream.

```c
int vdec_stream_open(const struct device *dev, const struct vdec_stream_config *config,
                     struct vdec_stream **stream);
```

| Parameter | Description |
| --- | --- |
| `dev` | Video engine device |
| `config` | Stream configuration; for the fields see [struct vdec_stream_config](#struct-vdec-stream_config) |
| `stream` | Output; on success this receives the stream handle |

| Return value | Meaning |
| --- | --- |
| `0` | Success |
| `-ENOTSUP` | Codec or format not supported: PNG cannot be a stream; an H.264 stream cannot output RGBA8888 |
| `-EINVAL` | Bad parameters: a JPEG stream was given no `width` or `height` |
| `-ENOMEM` | Not enough memory |

- A stream <strong>owns the decoder exclusively</strong> and yields it only at `vdec_stream_close()`. Other streams and `vdec_decode_image()` wait during that time.
- An H.264 stream uses `VDEC_CODEC_H264`; motion JPEG (a series of JPEGs) uses `VDEC_CODEC_JPEG` and <strong>must be given `width` and `height`</strong>, because the engine needs to know the picture size in advance.
- `buffer_size` is the compressed-data buffer and must hold the largest group of NAL units of one `feed`; if unsure, give 1 MiB (which is what the MP4 player does); 0 is the default value.
- `holding_frames` determines how many frames the application can hold at once; see the `-EBUSY` example.

#### Example

The function below tries six configurations through the same `open_and_close()`: three normal and three problematic. A successful stream is closed immediately so it does not tie up the decoder.

```c
static void open_and_close(const char *what, const struct vdec_stream_config *cfg)
{
	struct vdec_stream *stream;
	int ret = vdec_stream_open(dev, cfg, &stream);

	printk("[open] %-34s = %s\n", what, err(ret));
	if (ret == 0) {
		vdec_stream_close(dev, stream);
	}
}

static void demo_stream_open(void)
{
	const struct vdec_stream_config mjpeg = {
		.codec = VDEC_CODEC_JPEG,
		.format = VDEC_FORMAT_NV12,
		.width = 320,
		.height = 240,
	};
	const struct vdec_stream_config h264 = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
	};
	const struct vdec_stream_config h264_big = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
		.buffer_size = 1024 * 1024,
		.no_cache_ops = true,
		.holding_frames = 2,
	};
	const struct vdec_stream_config jpeg_no_size = {
		.codec = VDEC_CODEC_JPEG,
		.format = VDEC_FORMAT_NV12,
	};
	const struct vdec_stream_config png = {
		.codec = VDEC_CODEC_PNG,
		.format = VDEC_FORMAT_RGBA8888,
	};
	const struct vdec_stream_config h264_rgba = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_RGBA8888,
	};

	open_and_close("MJPEG 320x240", &mjpeg);
	open_and_close("H.264", &h264);
	open_and_close("H.264, 1 MiB buffer, hold 2", &h264_big);
	open_and_close("JPEG without width/height", &jpeg_no_size);
	open_and_close("PNG as a stream", &png);
	open_and_close("H.264 as RGBA8888", &h264_rgba);
}
```

Log:

```text
[open] MJPEG 320x240                      = 0
[open] H.264                              = 0
[open] H.264, 1 MiB buffer, hold 2        = 0
[open] JPEG without width/height          = -EINVAL
[open] PNG as a stream                    = -ENOTSUP
[open] H.264 as RGBA8888                  = -ENOTSUP
```

- `JPEG without width/height`: the JPEG stream was given no `width` or `height` and returns `-EINVAL`.
- `PNG as a stream`: PNG cannot be a stream and returns `-ENOTSUP`.
- `H.264 as RGBA8888`: an H.264 stream cannot output RGBA8888 and returns `-ENOTSUP`.

### vdec_stream_feed

Put compressed data into the stream's buffer.

```c
int vdec_stream_feed(const struct device *dev, struct vdec_stream *stream,
                     const void *data, size_t len, int64_t pts, size_t *consumed);
```

| Parameter | Description |
| --- | --- |
| `stream` | The handle from `vdec_stream_open()` |
| `data`, `len` | Compressed data. H.264 must be an <strong>Annex B</strong> byte stream made of complete NAL units; MJPEG is <strong>one whole</strong> JPEG per call |
| `pts` | Timestamp of this data, carried unchanged to the corresponding frame; pass `-1` if there is none |
| `consumed` | Output, the number of bytes actually taken |

| Return value | Meaning |
| --- | --- |
| `0` | At least one NAL unit was taken |
| `-EAGAIN` | The stream buffer is full; take frames out first with `vdec_stream_get_frame()` |
| `-EINVAL` | There is not a single NAL unit in the data (so length 0 too) |

- This function <strong>only stores data and does not decode</strong>; decoding happens in `vdec_stream_get_frame()`.
- How much was taken is returned in `consumed`. `len` may not fit; the part not taken must be fed again after taking frames out.
- In the demo program every call takes everything (`used` equals `len`).
- MJPEG's `pts` comes back on the frame unchanged (see the log: 0, 100, …, 400). With H.264 fed block by block this is not the case: in the log the first frame's `pts` is 1, while the first slice block fed carried 2, so do not assume a frame's `pts` equals the block just fed.

#### Example

The function below tries three inputs: 16 bytes of `0x55` (no NAL), length 0, and the whole H.264 bitstream (21745 bytes) fed in one call.

```c
static void demo_stream_feed(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
	};
	static const uint8_t garbage[16] = {0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
					    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55};
	struct vdec_stream *stream;
	size_t used = 0;
	int ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[feed] vdec_stream_open = %s\n", err(ret));
	if (ret != 0) {
		return;
	}

	/* data with no NAL unit in it */
	ret = vdec_stream_feed(dev, stream, garbage, sizeof(garbage), -1, &used);
	printk("[feed] 16 bytes of 0x55        = %s, used %zu\n", err(ret), used);

	/* no data at all */
	ret = vdec_stream_feed(dev, stream, test_h264, 0, -1, &used);
	printk("[feed] 0 bytes                 = %s, used %zu\n", err(ret), used);

	/* the whole clip, in Annex B form, in one call */
	ret = vdec_stream_feed(dev, stream, test_h264, sizeof(test_h264), 0, &used);
	printk("[feed] whole clip (%zu bytes) = %s, used %zu\n", sizeof(test_h264), err(ret),
	       used);

	vdec_stream_close(dev, stream);
	printk("[feed] vdec_stream_close done\n");
}
```

Log:

```text
[feed] vdec_stream_open = 0
[feed] 16 bytes of 0x55        = -EINVAL, used 0
[feed] 0 bytes                 = -EINVAL, used 0
[feed] whole clip (21745 bytes) = 0, used 21745
[feed] vdec_stream_close done
```

- Data with no NAL and length 0 both return `-EINVAL` with `used` 0.
- The whole bitstream fed in one call is taken in full (`used` equals `len`).
- For a complete example of block-by-block feeding (splitting the bitstream at start codes, one `pts` per block) see `demo_stream_get_frame_h264()` in the [vdec_stream_get_frame](#vdec_stream_get_frame) section; for the one-picture-at-a-time MJPEG example see `demo_stream_get_frame_mjpeg()` in the same section.

### vdec_stream_get_frame

Get the next frame; decoding is done here.

```c
int vdec_stream_get_frame(const struct device *dev, struct vdec_stream *stream,
                          struct vdec_frame *frame);
```

| Return value | Meaning | What to do |
| --- | --- | --- |
| `0` | Got a frame | Display or process it, then `vdec_frame_release()` |
| `-EAGAIN` | Not enough data | Feed data with `vdec_stream_feed()`; when there is no data left, `vdec_stream_flush()` |
| `-EBUSY` | All frames are held by the application | Release some frames, or wait a moment |
| `-ENODATA` | Already flushed and all frames taken | Finish and close the stream |
| `-EIO` | Hardware error | Close the stream |

- Each call gives out at most one frame.
- The decoder holds only a few pictures; release frames promptly with `vdec_frame_release()` or you get `-EBUSY`.
- A frame taken carries the timestamp given at `feed`, but with H.264 fed block by block it does not correspond one-to-one with the block fed; see the `vdec_stream_feed` section.

#### Example: MJPEG

Each picture is fed in and a frame is taken out with `get_frame` right away, with `pts` coming back unchanged:

```c
static void demo_stream_get_frame_mjpeg(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_JPEG,
		.format = VDEC_FORMAT_NV12,
		.width = 320,
		.height = 240,
	};
	struct vdec_stream *stream;
	struct vdec_frame frame;
	size_t used;
	int ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[mjpeg] vdec_stream_open = %s\n", err(ret));
	if (ret != 0) {
		return;
	}
	for (int i = 0; i < ARRAY_SIZE(test_mjpeg); i++) {
		ret = vdec_stream_feed(dev, stream, test_mjpeg[i].data, test_mjpeg[i].len, i * 100,
				       &used);
		printk("[mjpeg] feed #%d (%u bytes, pts %d) = %s, used %zu\n", i, test_mjpeg[i].len,
		       i * 100, err(ret), used);
		ret = vdec_stream_get_frame(dev, stream, &frame);
		printk("[mjpeg] get_frame = %s\n", err(ret));
		if (ret == 0) {
			show_frame("[mjpeg]", &frame);
			vdec_frame_release(dev, &frame);
		}
	}
	ret = vdec_stream_flush(dev, stream);
	printk("[mjpeg] flush = %s\n", err(ret));
	ret = vdec_stream_get_frame(dev, stream, &frame);
	printk("[mjpeg] get_frame after flush = %s\n", err(ret));
	vdec_stream_close(dev, stream);
	printk("[mjpeg] vdec_stream_close done\n");
}
```

Log:

```text
[mjpeg] vdec_stream_open = 0
[mjpeg] feed #0 (8625 bytes, pts 0) = 0, used 8625
[mjpeg] get_frame = 0
[mjpeg] frame: format 1, 320x240, stride 320/320, pts 0
[mjpeg] feed #1 (8650 bytes, pts 100) = 0, used 8650
[mjpeg] get_frame = 0
[mjpeg] frame: format 1, 320x240, stride 320/320, pts 100
[mjpeg] feed #2 (9100 bytes, pts 200) = 0, used 9100
[mjpeg] get_frame = 0
[mjpeg] frame: format 1, 320x240, stride 320/320, pts 200
[mjpeg] feed #3 (9665 bytes, pts 300) = 0, used 9665
[mjpeg] get_frame = 0
[mjpeg] frame: format 1, 320x240, stride 320/320, pts 300
[mjpeg] feed #4 (9664 bytes, pts 400) = 0, used 9664
[mjpeg] get_frame = 0
[mjpeg] frame: format 1, 320x240, stride 320/320, pts 400
[mjpeg] flush = 0
[mjpeg] get_frame after flush = -ENODATA
[mjpeg] vdec_stream_close done
```

#### Example: the full H.264 loop

`open`, `feed`, `get_frame`, `flush` and `close` are strung together in one loop. The loop's rhythm is decided by `get_frame`'s return value: on `-EAGAIN` feed data, when the data runs out flush, on a frame validate the CRC and release, and exit on `-ENODATA`. The bitstream is split at the start code `00 00 00 01`, and `next_start_code()` finds the position of the next start code.

```c
static size_t next_start_code(const uint8_t *d, size_t len, size_t from)
{
	for (size_t i = from; i + 4 <= len; i++) {
		if (d[i] == 0 && d[i + 1] == 0 && d[i + 2] == 0 && d[i + 3] == 1) {
			return i;
		}
	}

	return len;
}

static void demo_stream_get_frame_h264(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
	};
	struct vdec_stream *stream;
	struct vdec_frame frame;
	size_t off = 0, used, nal_end;
	int frames = 0, calls = 0, nal = 0;
	bool flushed = false;
	int ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[h264] vdec_stream_open = %s\n", err(ret));
	if (ret != 0) {
		return;
	}
	while (true) {
		ret = vdec_stream_get_frame(dev, stream, &frame);
		if (calls++ < 12) {
			printk("[h264] get_frame = %s\n", err(ret));
		}
		if (ret == 0) {
			if (frames < 4) {
				show_frame("[h264]", &frame);
			}
			if (frames < ARRAY_SIZE(test_h264_crc)) {
				/* the same CRC the vdec h264 sample checks */
				uint32_t crc = 0;

				for (int y = 0; y < frame.height; y++) {
					crc = crc32_ieee_update(crc, frame.plane[0] +
							      y * frame.stride[0], frame.width);
				}
				for (int y = 0; y < frame.height / 2; y++) {
					crc = crc32_ieee_update(crc, frame.plane[1] +
							      y * frame.stride[1], frame.width);
				}
				if (crc != test_h264_crc[frames]) {
					printk("[h264] frame %d: bad crc\n", frames);
				}
			}
			frames++;
			vdec_frame_release(dev, &frame);
		} else if (ret == -ENODATA) {
			break;
		} else if (ret == -EAGAIN) {
			if (off < sizeof(test_h264)) {
				/* one NAL unit per call, so every call has a time stamp */
				nal_end = next_start_code(test_h264, sizeof(test_h264), off + 4);
				ret = vdec_stream_feed(dev, stream, test_h264 + off, nal_end - off,
						       nal, &used);
				if (nal < 6) {
					printk("[h264] feed NAL #%d (type %d, %zu bytes, pts %d) = %s, used %zu\n",
					       nal, test_h264[off + 4] & 0x1f, nal_end - off, nal,
					       err(ret), used);
				}
				if (ret == 0) {
					off += used;
					nal++;
				}
			} else if (!flushed) {
				ret = vdec_stream_flush(dev, stream);
				printk("[h264] flush = %s (after %d NAL units)\n", err(ret), nal);
				flushed = true;
			}
		} else {
			printk("[h264] get_frame failed: %s\n", err(ret));
			break;
		}
	}
	printk("[h264] %d frames decoded, all CRCs checked\n", frames);
	vdec_stream_close(dev, stream);
	printk("[h264] vdec_stream_close done\n");
}
```

Log (the first 12 `get_frame` calls, and the frame info):

```text
[h264] vdec_stream_open = 0
[h264] get_frame = -EAGAIN
[h264] feed NAL #0 (type 7, 27 bytes, pts 0) = 0, used 27
[h264] get_frame = -EAGAIN
[h264] feed NAL #1 (type 8, 5650 bytes, pts 1) = 0, used 5650
[h264] get_frame = -EAGAIN
[h264] feed NAL #2 (type 1, 335 bytes, pts 2) = 0, used 335
[h264] get_frame = 0
[h264] frame: format 1, 320x240, stride 320/320, pts 1
[h264] get_frame = -EAGAIN
[h264] feed NAL #3 (type 1, 136 bytes, pts 3) = 0, used 136
[h264] get_frame = -EAGAIN
[h264] feed NAL #4 (type 1, 108 bytes, pts 4) = 0, used 108
[h264] get_frame = 0
[h264] frame: format 1, 320x240, stride 320/320, pts 2
[h264] get_frame = -EAGAIN
[h264] feed NAL #5 (type 1, 87 bytes, pts 5) = 0, used 87
[h264] get_frame = 0
[h264] frame: format 1, 320x240, stride 320/320, pts 3
[h264] get_frame = -EAGAIN
[h264] get_frame = 0
[h264] frame: format 1, 320x240, stride 320/320, pts 4
[h264] get_frame = -EAGAIN
[h264] flush = 0 (after 33 NAL units)
[h264] 30 frames decoded, all CRCs checked
[h264] vdec_stream_close done
```

The first few lines show the rhythm: after opening, `get_frame` is first `-EAGAIN`; after feeding the SPS (type 7), the PPS (type 8) and the first slice (type 1), the first frame comes out; after that it is roughly "feed a block, get a frame". Block 2, 5650 bytes long, was cut out at a four-byte start code and also contains other NAL units separated by three-byte start codes, which does not affect decoding. At the end, after 33 blocks fed, it flushes and the remaining frames are drained. All 30 frames passed the CRC check (an error would print `bad crc`, and there is none in the log).

#### Example: -EBUSY

`holding_frames` is set to 2, and then frames are taken without releasing:

```c
static void demo_hold(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
		.holding_frames = 2,
	};
	struct vdec_frame held[8], frame;
	struct vdec_stream *stream;
	size_t off = 0, used, nal_end;
	int n = 0, ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[hold] vdec_stream_open(holding_frames 2) = %s\n", err(ret));
	if (ret != 0) {
		return;
	}
	/* take frames and never give them back */
	while (n < ARRAY_SIZE(held)) {
		ret = vdec_stream_get_frame(dev, stream, &held[n]);
		if (ret == 0) {
			n++;
			continue;
		}
		if (ret != -EAGAIN || off >= sizeof(test_h264)) {
			break;
		}
		nal_end = next_start_code(test_h264, sizeof(test_h264), off + 4);
		if (vdec_stream_feed(dev, stream, test_h264 + off, nal_end - off, -1, &used) == 0) {
			off += used;
		}
	}
	printk("[hold] %d frames held, get_frame = %s\n", n, err(ret));
	for (int i = 0; i < n; i++) {
		vdec_frame_release(dev, &held[i]);
	}
	ret = vdec_stream_get_frame(dev, stream, &frame);
	printk("[hold] after releasing them, get_frame = %s\n", err(ret));
	if (ret == 0) {
		vdec_frame_release(dev, &frame);
	}
	vdec_stream_close(dev, stream);
	printk("[hold] vdec_stream_close done\n");
}
```

Log:

```text
[hold] vdec_stream_open(holding_frames 2) = 0
[hold] 3 frames held, get_frame = -EBUSY
[hold] after releasing them, get_frame = -EAGAIN
[hold] vdec_stream_close done
```

It returns `-EBUSY` only after 3 frames have been taken (the decoder never has fewer than 3 frame buffers, so with `holding_frames` set to 2 one extra frame can still be taken). It recovers after the release; see the [vdec_frame_release](#vdec_frame_release) section.

### vdec_stream_flush

Tell the stream "there will be no more data".

```c
int vdec_stream_flush(const struct device *dev, struct vdec_stream *stream);
```

| Return value | Meaning |
| --- | --- |
| `0` | Success |

- After the call, `vdec_stream_get_frame()` hands out the frames the decoder has not yet emitted, in turn, and finally returns `-ENODATA`.
- It need only be called once. The demo program guarantees this with the `flushed` variable.
- The header says: only after a flush are the frames not yet emitted by the decoder handed over. Without a flush, the last few frames of the video cannot be obtained.

#### Example

MJPEG stream: feed 3 pictures without taking any, then flush, then drain the frames one by one until `-ENODATA`:

```c
static void demo_stream_flush(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_JPEG,
		.format = VDEC_FORMAT_NV12,
		.width = 320,
		.height = 240,
	};
	struct vdec_stream *stream;
	struct vdec_frame frame;
	size_t used;
	int taken = 0, ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[flush] vdec_stream_open = %s\n", err(ret));
	if (ret != 0) {
		return;
	}

	/* three pictures go in, none is taken out yet */
	for (int i = 0; i < 3; i++) {
		ret = vdec_stream_feed(dev, stream, test_mjpeg[i].data, test_mjpeg[i].len, i * 100,
				       &used);
		printk("[flush] feed #%d = %s\n", i, err(ret));
	}

	ret = vdec_stream_flush(dev, stream);
	printk("[flush] vdec_stream_flush = %s\n", err(ret));

	/* from now on get_frame hands out what is left, then returns -ENODATA */
	while ((ret = vdec_stream_get_frame(dev, stream, &frame)) == 0) {
		printk("[flush] get_frame = 0, pts %lld\n", frame.pts);
		vdec_frame_release(dev, &frame);
		taken++;
	}
	printk("[flush] get_frame = %s after %d frames\n", err(ret), taken);

	vdec_stream_close(dev, stream);
	printk("[flush] vdec_stream_close done\n");
}
```

Log:

```text
[flush] vdec_stream_open = 0
[flush] feed #0 = 0
[flush] feed #1 = 0
[flush] feed #2 = 0
[flush] vdec_stream_flush = 0
[flush] get_frame = 0, pts 0
[flush] get_frame = 0, pts 100
[flush] get_frame = 0, pts 200
[flush] get_frame = -ENODATA after 3 frames
[flush] vdec_stream_close done
```

After the flush `get_frame` hands out 3 frames in turn (`pts` 0, 100, 200), then returns `-ENODATA`. For where the flush sits in an H.264 stream (called once after the data is fed) see `demo_stream_get_frame_h264()`, and `flush = 0 (after 33 NAL units)` in the log.

### vdec_stream_close

End a stream and yield the decoder.

```c
void vdec_stream_close(const struct device *dev, struct vdec_stream *stream);
```

No return value.

- Before the call, <strong>all frames of this stream must already be released</strong>.
- After the close the `stream` handle is void, and the decoder can be used by other streams and `vdec_decode_image()`.

#### Example

Open an MJPEG stream, take a frame, release it, close; then open an H.264 stream to show that the decoder has been yielded:

```c
static void demo_stream_close(void)
{
	const struct vdec_stream_config mjpeg = {
		.codec = VDEC_CODEC_JPEG,
		.format = VDEC_FORMAT_NV12,
		.width = 320,
		.height = 240,
	};
	const struct vdec_stream_config h264 = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
	};
	struct vdec_stream *stream;
	struct vdec_frame frame;
	size_t used;
	int ret;

	ret = vdec_stream_open(dev, &mjpeg, &stream);
	printk("[close] open the MJPEG stream = %s\n", err(ret));
	if (ret != 0) {
		return;
	}
	vdec_stream_feed(dev, stream, test_mjpeg[0].data, test_mjpeg[0].len, 0, &used);
	ret = vdec_stream_get_frame(dev, stream, &frame);
	printk("[close] get_frame = %s\n", err(ret));
	if (ret == 0) {
		/* every frame has to be released before the stream is closed */
		vdec_frame_release(dev, &frame);
	}
	vdec_stream_close(dev, stream);
	printk("[close] vdec_stream_close done\n");

	/* the decoder belongs to nobody now: another stream can be opened */
	ret = vdec_stream_open(dev, &h264, &stream);
	printk("[close] open an H.264 stream afterwards = %s\n", err(ret));
	if (ret == 0) {
		vdec_stream_close(dev, stream);
		printk("[close] vdec_stream_close done\n");
	}
}
```

Log:

```text
[close] open the MJPEG stream = 0
[close] get_frame = 0
[close] vdec_stream_close done
[close] open an H.264 stream afterwards = 0
[close] vdec_stream_close done
```

After the close the next stream can be opened normally.

### struct vdec_stream_config

| Field | Description |
| --- | --- |
| `codec` | `VDEC_CODEC_H264` (stream), `VDEC_CODEC_JPEG` (motion JPEG) |
| `format` | The desired frame format. JPEG supports only `VDEC_FORMAT_NV12`; H.264 uses `VDEC_FORMAT_NV12` |
| `buffer_size` | Size of the compressed-data buffer in bytes; it must hold the largest group of NAL units of one `feed`; 0 is the default |
| `no_cache_ops` | Set to true when the CPU will not read these frames (only the display engine or 2D accelerator reads them), saving cache maintenance |
| `holding_frames` | Number of frames the application holds at once; 0 means the default of 3, and `VDEC_HOLD_NONE` means none. The decoder allocates 2 pictures plus this number. The real frame-buffer count is never below 3, so with it set to 2 you get `-EBUSY` only after holding 3 frames on an MJPEG stream |
| `width`, `height` | Picture dimensions, needed only for a JPEG stream |

### struct vdec_frame

| Field | Description |
| --- | --- |
| `format` | Frame format |
| `width`, `height` | Pixel dimensions of the visible area |
| `plane[2]` | Pointer to the first visible pixel of each plane; an unused plane is NULL |
| `stride[2]` | Bytes between two adjacent rows of each plane |
| `pts` | The timestamp given at `feed` |
| `priv` | Driver-private; do not touch. The player uses `priv != NULL` to tell whether a `vdec_frame` variable holds a frame |

### Frame formats

| Format | Value | Memory layout |
| --- | --- | --- |
| `VDEC_FORMAT_NV12` | 1 | 8-bit luma plane followed by a half-resolution interleaved Cb/Cr plane |
| `VDEC_FORMAT_NV21` | 2 | Same, but the interleaving order is Cr/Cb |
| `VDEC_FORMAT_RGBA8888` | 3 | 32-bit little-endian word with R in the most significant byte and A in the least significant byte (the byte order in memory is A, B, G, R) |

## Driver logs

The driver prints the following `<err>`-level logs on an error. Normal decoding prints no `<err>` logs.

| Log | Description |
| --- | --- |
| `vdec_sunxi: not a valid picture` | The input data is not a valid picture. In the demo program this is the step that passes 16 bytes of `0x55` as a JPEG |
| `vdec_sunxi: decoding failed: 1` | Decoding failed; the number is an internal status code. In the demo program this is the half-JPEG step, where the call returns `-EIO` |
| `vdec_sunxi: not enough memory to decode`, `out of memory for N bytes` | The picture does not fit in the decoder's memory budget; the call returns `-ENOMEM`. Not triggered by the demo program |
| `vdec_sunxi: stream buffer is full`, `the picture does not fit in the stream buffer` | The compressed-data buffer does not fit it; see `CONFIG_VDEC_SUNXI_STREAM_BUFFER_KB`. Not triggered by the demo program |
| `vdec_sunxi: interrupt timeout: top …` (`<wrn>`) | The engine never raised an interrupt. Not triggered by the demo program |

These logs are emitted from a deferred context and interleave with the demo program's `printk`; only the observations are listed here. The first two lines really appeared when the demo program ran on the board; the remaining lines come from the driver source.

## Examples

| Example | Path | Content |
| --- | --- | --- |
| JPEG | `samples/drivers/vdec/jpeg` | Decodes the embedded JPEG three times, prints the elapsed time and each plane's checksum, and displays it at the end. `CONFIG_SAMPLE_VDEC_DUMP` can export the NV12 data on the console for comparison with a host decoder's result |
| PNG | `samples/drivers/vdec/png` | Decodes the embedded PNG, outputs RGBA8888, prints the elapsed time and the CRC of the pixels (PNG is lossless, so it should match a host decoder's result), then displays it composited on a black background |
| H.264 | `samples/drivers/vdec/h264` | Decodes an embedded H.264 clip, compares every frame against the CRC32 of a host decode (the H.264 decoding process is strictly specified, so the results must match), and displays it at the clip's frame rate |
| H.264 player | `samples/drivers/vdec/h264_player` | Plays an Annex B H.264 raw stream from the TF card (default `/SD:/badapple.h264`), displaying at the frame rate with a statistics overlay |
| MP4 player | `samples/drivers/mp4_player` | Video plus sound; see [MP4 player](../apps/mp4-player.md) |

Building an example (JPEG here):

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/vdec-jpeg zephyr/samples/drivers/vdec/jpeg
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-vdec/build.cast" data-speed="6"></div>

For how to download and run it see [Build and run](../zephyr-build-run.md).

## Using it in your own application

1. `prj.conf`: `CONFIG_VDEC=y`, `CONFIG_FPU=y`, `CONFIG_FPU_SHARING=y`. When large buffers are needed, set `CONFIG_COMMON_LIBC_MALLOC_ARENA_SIZE=-1` and a sufficient `CONFIG_HEAP_MEM_POOL_SIZE` (in the example these are -1 and from 65536 respectively).
2. `ve` must be `okay` in the board devicetree. It is already enabled on `yuzukineko` and `f101_evb`.
3. Check the device with `device_is_ready()` before using it.
4. To hand a frame to the display: `display_sunxi_show_yuv()` takes the two planes of a `vdec_frame` directly, with no copy; see [MP4 player](../apps/mp4-player.md).

## Complete demo program

Every example and log above comes from this one program. Create a directory, put the files below into it, and it builds like any other Zephyr application.

```text
vdec_api/
├── CMakeLists.txt
├── prj.conf
└── src/
    ├── main.c
    └── test_mjpeg.h      generated with ffmpeg, see below
```

`test_mjpeg.h` is a C array converted from 5 320×240 JPEGs; the command that generates it:

```sh
ffmpeg -f lavfi -i testsrc2=size=320x240:rate=10 -frames:v 5 -q:v 5 f%d.jpg
```

The test data for JPEG, PNG and H.264 uses the header files of the three samples under `samples/drivers/vdec/` directly, and `CMakeLists.txt` adds their directories to the header search path.

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(vdec_api)

# the JPEG, PNG and H.264 test pictures are the ones of the vdec samples
set(VDEC_SAMPLES $ENV{ZEPHYR_BASE}/samples/drivers/vdec)

target_sources(app PRIVATE src/main.c)
target_include_directories(app PRIVATE
	${VDEC_SAMPLES}/jpeg/src
	${VDEC_SAMPLES}/png/src
	${VDEC_SAMPLES}/h264/src)
```

### prj.conf

```ini
CONFIG_FPU=y
CONFIG_FPU_SHARING=y
CONFIG_VDEC=y
CONFIG_LOG=y
CONFIG_PRINTK=y
CONFIG_MAIN_STACK_SIZE=8192
CONFIG_COMMON_LIBC_MALLOC_ARENA_SIZE=-1
CONFIG_HEAP_MEM_POOL_SIZE=65536
CONFIG_SHELL=n
CONFIG_DEVMEM_SHELL=n
CONFIG_LOG_PRINTK=n
CONFIG_CRC=y
```

### src/main.c

```c
/*
 * Calls every function of <zephyr/drivers/vdec.h> with JPEG, PNG, MJPEG and
 * H.264 data and prints what each call returns.
 */
#include <errno.h>
#include <string.h>
#include <zephyr/device.h>
#include <zephyr/drivers/vdec.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/crc.h>
#include <zephyr/sys/printk.h>

#include "test_jpeg.h"
#include "test_png.h"
#include "test_h264.h"
#include "test_mjpeg.h"

static const struct device *const dev = DEVICE_DT_GET(DT_NODELABEL(ve));

static const char *err(int ret)
{
	switch (ret) {
	case 0:		return "0";
	case -EAGAIN:	return "-EAGAIN";
	case -EBUSY:	return "-EBUSY";
	case -ENODATA:	return "-ENODATA";
	case -EINVAL:	return "-EINVAL";
	case -ENOTSUP:	return "-ENOTSUP";
	case -ENOMEM:	return "-ENOMEM";
	case -EIO:	return "-EIO";
	default:	return "?";
	}
}

static void show_frame(const char *tag, const struct vdec_frame *f)
{
	printk("%s frame: format %d, %ux%u, stride %u/%u, pts %lld\n", tag, f->format, f->width,
	       f->height, f->stride[0], f->stride[1], f->pts);
}

static uint32_t luma_crc(const struct vdec_frame *f)
{
	uint32_t crc = 0;

	for (int y = 0; y < f->height; y++) {
		crc = crc32_ieee_update(crc, f->plane[0] + y * f->stride[0], f->width);
	}

	return crc;
}

/* ---- JPEG: one picture --------------------------------------------------------------- */

static void demo_jpeg(void)
{
	static const enum vdec_format formats[] = {VDEC_FORMAT_NV21, VDEC_FORMAT_NV12, VDEC_FORMAT_NV21};
	struct vdec_frame frame;
	int64_t t;
	int ret;

	for (int i = 0; i < ARRAY_SIZE(formats); i++) {
		t = k_uptime_get();
		ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg),
					formats[i], &frame);
		printk("[jpeg] vdec_decode_image(format %d) = %s, %lld ms\n", formats[i], err(ret),
		       k_uptime_get() - t);
		if (ret == 0) {
			show_frame("[jpeg]", &frame);
			printk("[jpeg] luma crc %08x\n", luma_crc(&frame));
			vdec_frame_release(dev, &frame);
			printk("[jpeg] vdec_frame_release done\n");
		}
	}
}

/* ---- PNG: one picture ---------------------------------------------------------------- */

static void demo_png(void)
{
	struct vdec_frame frame;
	int64_t t = k_uptime_get();
	int ret;

	ret = vdec_decode_image(dev, VDEC_CODEC_PNG, test_png, sizeof(test_png),
				VDEC_FORMAT_RGBA8888, &frame);
	printk("[png] vdec_decode_image(RGBA8888) = %s, %lld ms\n", err(ret), k_uptime_get() - t);
	if (ret == 0) {
		const uint8_t *p = frame.plane[0];

		show_frame("[png]", &frame);
		printk("[png] first pixel bytes (A, B, G, R): %02x %02x %02x %02x\n", p[0], p[1],
		       p[2], p[3]);
		vdec_frame_release(dev, &frame);
		printk("[png] vdec_frame_release done\n");
	}
}

/* ---- errors of vdec_decode_image() --------------------------------------------------- */

static void demo_image_errors(void)
{
	static const uint8_t garbage[16] = {0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
					    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55};
	struct vdec_frame frame;
	int ret;

	ret = vdec_decode_image(dev, VDEC_CODEC_PNG, test_png, sizeof(test_png), VDEC_FORMAT_NV12,
				&frame);
	printk("[error] PNG as NV12             = %s\n", err(ret));
	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg),
				VDEC_FORMAT_RGBA8888, &frame);
	printk("[error] JPEG as RGBA8888        = %s\n", err(ret));
	ret = vdec_decode_image(dev, VDEC_CODEC_H264, test_jpeg, sizeof(test_jpeg),
				VDEC_FORMAT_NV12, &frame);
	printk("[error] H.264 to decode_image   = %s\n", err(ret));
	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, garbage, sizeof(garbage), VDEC_FORMAT_NV12,
				&frame);
	printk("[error] 16 bytes of 0x55 (JPEG) = %s\n", err(ret));
	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg) / 2,
				VDEC_FORMAT_NV12, &frame);
	printk("[error] half a JPEG             = %s\n", err(ret));
	if (ret == 0) {
		vdec_frame_release(dev, &frame);
	}
	/* the decoder must still work after the errors */
	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg),
				VDEC_FORMAT_NV12, &frame);
	printk("[error] a good JPEG afterwards  = %s\n", err(ret));
	if (ret == 0) {
		vdec_frame_release(dev, &frame);
	}
}

/* ---- vdec_stream_get_frame: MJPEG -------------------------------------------------- */

static void demo_stream_get_frame_mjpeg(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_JPEG,
		.format = VDEC_FORMAT_NV12,
		.width = 320,
		.height = 240,
	};
	struct vdec_stream *stream;
	struct vdec_frame frame;
	size_t used;
	int ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[mjpeg] vdec_stream_open = %s\n", err(ret));
	if (ret != 0) {
		return;
	}
	for (int i = 0; i < ARRAY_SIZE(test_mjpeg); i++) {
		ret = vdec_stream_feed(dev, stream, test_mjpeg[i].data, test_mjpeg[i].len, i * 100,
				       &used);
		printk("[mjpeg] feed #%d (%u bytes, pts %d) = %s, used %zu\n", i, test_mjpeg[i].len,
		       i * 100, err(ret), used);
		ret = vdec_stream_get_frame(dev, stream, &frame);
		printk("[mjpeg] get_frame = %s\n", err(ret));
		if (ret == 0) {
			show_frame("[mjpeg]", &frame);
			vdec_frame_release(dev, &frame);
		}
	}
	ret = vdec_stream_flush(dev, stream);
	printk("[mjpeg] flush = %s\n", err(ret));
	ret = vdec_stream_get_frame(dev, stream, &frame);
	printk("[mjpeg] get_frame after flush = %s\n", err(ret));
	vdec_stream_close(dev, stream);
	printk("[mjpeg] vdec_stream_close done\n");
}

/* ---- vdec_stream_get_frame: H.264 -------------------------------------------------- */

static size_t next_start_code(const uint8_t *d, size_t len, size_t from)
{
	for (size_t i = from; i + 4 <= len; i++) {
		if (d[i] == 0 && d[i + 1] == 0 && d[i + 2] == 0 && d[i + 3] == 1) {
			return i;
		}
	}

	return len;
}

static void demo_stream_get_frame_h264(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
	};
	struct vdec_stream *stream;
	struct vdec_frame frame;
	size_t off = 0, used, nal_end;
	int frames = 0, calls = 0, nal = 0;
	bool flushed = false;
	int ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[h264] vdec_stream_open = %s\n", err(ret));
	if (ret != 0) {
		return;
	}
	while (true) {
		ret = vdec_stream_get_frame(dev, stream, &frame);
		if (calls++ < 12) {
			printk("[h264] get_frame = %s\n", err(ret));
		}
		if (ret == 0) {
			if (frames < 4) {
				show_frame("[h264]", &frame);
			}
			if (frames < ARRAY_SIZE(test_h264_crc)) {
				/* the same CRC the vdec h264 sample checks */
				uint32_t crc = 0;

				for (int y = 0; y < frame.height; y++) {
					crc = crc32_ieee_update(crc, frame.plane[0] +
							      y * frame.stride[0], frame.width);
				}
				for (int y = 0; y < frame.height / 2; y++) {
					crc = crc32_ieee_update(crc, frame.plane[1] +
							      y * frame.stride[1], frame.width);
				}
				if (crc != test_h264_crc[frames]) {
					printk("[h264] frame %d: bad crc\n", frames);
				}
			}
			frames++;
			vdec_frame_release(dev, &frame);
		} else if (ret == -ENODATA) {
			break;
		} else if (ret == -EAGAIN) {
			if (off < sizeof(test_h264)) {
				/* one NAL unit per call, so every call has a time stamp */
				nal_end = next_start_code(test_h264, sizeof(test_h264), off + 4);
				ret = vdec_stream_feed(dev, stream, test_h264 + off, nal_end - off,
						       nal, &used);
				if (nal < 6) {
					printk("[h264] feed NAL #%d (type %d, %zu bytes, pts %d) = %s, used %zu\n",
					       nal, test_h264[off + 4] & 0x1f, nal_end - off, nal,
					       err(ret), used);
				}
				if (ret == 0) {
					off += used;
					nal++;
				}
			} else if (!flushed) {
				ret = vdec_stream_flush(dev, stream);
				printk("[h264] flush = %s (after %d NAL units)\n", err(ret), nal);
				flushed = true;
			}
		} else {
			printk("[h264] get_frame failed: %s\n", err(ret));
			break;
		}
	}
	printk("[h264] %d frames decoded, all CRCs checked\n", frames);
	vdec_stream_close(dev, stream);
	printk("[h264] vdec_stream_close done\n");
}

/* ---- vdec_stream_get_frame: -EBUSY -------------------------------------------------- */

static void demo_hold(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
		.holding_frames = 2,
	};
	struct vdec_frame held[8], frame;
	struct vdec_stream *stream;
	size_t off = 0, used, nal_end;
	int n = 0, ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[hold] vdec_stream_open(holding_frames 2) = %s\n", err(ret));
	if (ret != 0) {
		return;
	}
	/* take frames and never give them back */
	while (n < ARRAY_SIZE(held)) {
		ret = vdec_stream_get_frame(dev, stream, &held[n]);
		if (ret == 0) {
			n++;
			continue;
		}
		if (ret != -EAGAIN || off >= sizeof(test_h264)) {
			break;
		}
		nal_end = next_start_code(test_h264, sizeof(test_h264), off + 4);
		if (vdec_stream_feed(dev, stream, test_h264 + off, nal_end - off, -1, &used) == 0) {
			off += used;
		}
	}
	printk("[hold] %d frames held, get_frame = %s\n", n, err(ret));
	for (int i = 0; i < n; i++) {
		vdec_frame_release(dev, &held[i]);
	}
	ret = vdec_stream_get_frame(dev, stream, &frame);
	printk("[hold] after releasing them, get_frame = %s\n", err(ret));
	if (ret == 0) {
		vdec_frame_release(dev, &frame);
	}
	vdec_stream_close(dev, stream);
	printk("[hold] vdec_stream_close done\n");
}

/* ---- vdec_frame_release ------------------------------------------------------------- */

static void demo_frame_release(void)
{
	struct vdec_frame frame;
	int ret;

	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg),
				VDEC_FORMAT_NV12, &frame);
	printk("[release] first decode = %s, plane %p\n", err(ret), frame.plane[0]);
	if (ret != 0) {
		return;
	}
	vdec_frame_release(dev, &frame);
	printk("[release] vdec_frame_release done\n");

	/* the decoder is free again: the next picture can be decoded at once */
	ret = vdec_decode_image(dev, VDEC_CODEC_JPEG, test_jpeg, sizeof(test_jpeg),
				VDEC_FORMAT_NV12, &frame);
	printk("[release] second decode = %s, plane %p\n", err(ret), frame.plane[0]);
	if (ret == 0) {
		vdec_frame_release(dev, &frame);
		printk("[release] vdec_frame_release done\n");
	}
}

/* ---- vdec_stream_open ---------------------------------------------------------------- */

static void open_and_close(const char *what, const struct vdec_stream_config *cfg)
{
	struct vdec_stream *stream;
	int ret = vdec_stream_open(dev, cfg, &stream);

	printk("[open] %-34s = %s\n", what, err(ret));
	if (ret == 0) {
		vdec_stream_close(dev, stream);
	}
}

static void demo_stream_open(void)
{
	const struct vdec_stream_config mjpeg = {
		.codec = VDEC_CODEC_JPEG,
		.format = VDEC_FORMAT_NV12,
		.width = 320,
		.height = 240,
	};
	const struct vdec_stream_config h264 = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
	};
	const struct vdec_stream_config h264_big = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
		.buffer_size = 1024 * 1024,
		.no_cache_ops = true,
		.holding_frames = 2,
	};
	const struct vdec_stream_config jpeg_no_size = {
		.codec = VDEC_CODEC_JPEG,
		.format = VDEC_FORMAT_NV12,
	};
	const struct vdec_stream_config png = {
		.codec = VDEC_CODEC_PNG,
		.format = VDEC_FORMAT_RGBA8888,
	};
	const struct vdec_stream_config h264_rgba = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_RGBA8888,
	};

	open_and_close("MJPEG 320x240", &mjpeg);
	open_and_close("H.264", &h264);
	open_and_close("H.264, 1 MiB buffer, hold 2", &h264_big);
	open_and_close("JPEG without width/height", &jpeg_no_size);
	open_and_close("PNG as a stream", &png);
	open_and_close("H.264 as RGBA8888", &h264_rgba);
}

/* ---- vdec_stream_feed ---------------------------------------------------------------- */

static void demo_stream_feed(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
	};
	static const uint8_t garbage[16] = {0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
					    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55};
	struct vdec_stream *stream;
	size_t used = 0;
	int ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[feed] vdec_stream_open = %s\n", err(ret));
	if (ret != 0) {
		return;
	}

	/* data with no NAL unit in it */
	ret = vdec_stream_feed(dev, stream, garbage, sizeof(garbage), -1, &used);
	printk("[feed] 16 bytes of 0x55        = %s, used %zu\n", err(ret), used);

	/* no data at all */
	ret = vdec_stream_feed(dev, stream, test_h264, 0, -1, &used);
	printk("[feed] 0 bytes                 = %s, used %zu\n", err(ret), used);

	/* the whole clip, in Annex B form, in one call */
	ret = vdec_stream_feed(dev, stream, test_h264, sizeof(test_h264), 0, &used);
	printk("[feed] whole clip (%zu bytes) = %s, used %zu\n", sizeof(test_h264), err(ret),
	       used);

	vdec_stream_close(dev, stream);
	printk("[feed] vdec_stream_close done\n");
}

/* ---- vdec_stream_flush --------------------------------------------------------------- */

static void demo_stream_flush(void)
{
	const struct vdec_stream_config cfg = {
		.codec = VDEC_CODEC_JPEG,
		.format = VDEC_FORMAT_NV12,
		.width = 320,
		.height = 240,
	};
	struct vdec_stream *stream;
	struct vdec_frame frame;
	size_t used;
	int taken = 0, ret;

	ret = vdec_stream_open(dev, &cfg, &stream);
	printk("[flush] vdec_stream_open = %s\n", err(ret));
	if (ret != 0) {
		return;
	}

	/* three pictures go in, none is taken out yet */
	for (int i = 0; i < 3; i++) {
		ret = vdec_stream_feed(dev, stream, test_mjpeg[i].data, test_mjpeg[i].len, i * 100,
				       &used);
		printk("[flush] feed #%d = %s\n", i, err(ret));
	}

	ret = vdec_stream_flush(dev, stream);
	printk("[flush] vdec_stream_flush = %s\n", err(ret));

	/* from now on get_frame hands out what is left, then returns -ENODATA */
	while ((ret = vdec_stream_get_frame(dev, stream, &frame)) == 0) {
		printk("[flush] get_frame = 0, pts %lld\n", frame.pts);
		vdec_frame_release(dev, &frame);
		taken++;
	}
	printk("[flush] get_frame = %s after %d frames\n", err(ret), taken);

	vdec_stream_close(dev, stream);
	printk("[flush] vdec_stream_close done\n");
}

/* ---- vdec_stream_close --------------------------------------------------------------- */

static void demo_stream_close(void)
{
	const struct vdec_stream_config mjpeg = {
		.codec = VDEC_CODEC_JPEG,
		.format = VDEC_FORMAT_NV12,
		.width = 320,
		.height = 240,
	};
	const struct vdec_stream_config h264 = {
		.codec = VDEC_CODEC_H264,
		.format = VDEC_FORMAT_NV12,
	};
	struct vdec_stream *stream;
	struct vdec_frame frame;
	size_t used;
	int ret;

	ret = vdec_stream_open(dev, &mjpeg, &stream);
	printk("[close] open the MJPEG stream = %s\n", err(ret));
	if (ret != 0) {
		return;
	}
	vdec_stream_feed(dev, stream, test_mjpeg[0].data, test_mjpeg[0].len, 0, &used);
	ret = vdec_stream_get_frame(dev, stream, &frame);
	printk("[close] get_frame = %s\n", err(ret));
	if (ret == 0) {
		/* every frame has to be released before the stream is closed */
		vdec_frame_release(dev, &frame);
	}
	vdec_stream_close(dev, stream);
	printk("[close] vdec_stream_close done\n");

	/* the decoder belongs to nobody now: another stream can be opened */
	ret = vdec_stream_open(dev, &h264, &stream);
	printk("[close] open an H.264 stream afterwards = %s\n", err(ret));
	if (ret == 0) {
		vdec_stream_close(dev, stream);
		printk("[close] vdec_stream_close done\n");
	}
}

int main(void)
{
	if (!device_is_ready(dev)) {
		printk("decoder not ready\n");
		return 0;
	}
	demo_jpeg();
	demo_png();
	demo_image_errors();
	demo_frame_release();
	demo_stream_open();
	demo_stream_feed();
	demo_stream_get_frame_mjpeg();
	demo_stream_get_frame_h264();
	demo_hold();
	demo_stream_flush();
	demo_stream_close();
	printk("vdec_api done\n");
	k_sleep(K_FOREVER);

	return 0;
}
```

### Build and run

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/vdec-api vdec_api
```

For how to download and run it see [Build and run](../zephyr-build-run.md). The demo program's own lines printed on console UART1 are as follows (the driver's `<err>` logs have been removed; see [Driver logs](#driver-logs)):

```text
[jpeg] vdec_decode_image(format 2) = 0, 2 ms
[jpeg] frame: format 2, 320x240, stride 320/320, pts -1
[jpeg] luma crc f6be232d
[jpeg] vdec_frame_release done
[jpeg] vdec_decode_image(format 1) = 0, 2 ms
[jpeg] frame: format 1, 320x240, stride 320/320, pts -1
[jpeg] luma crc f6be232d
[jpeg] vdec_frame_release done
[jpeg] vdec_decode_image(format 2) = 0, 2 ms
[jpeg] frame: format 2, 320x240, stride 320/320, pts -1
[jpeg] luma crc f6be232d
[jpeg] vdec_frame_release done
[png] vdec_decode_image(RGBA8888) = 0, 28 ms
[png] frame: format 3, 320x240, stride 1280/0, pts -1
[png] first pixel bytes (A, B, G, R): ff ff ff ff
[png] vdec_frame_release done
[error] PNG as NV12             = -ENOTSUP
[error] JPEG as RGBA8888        = -ENOTSUP
[error] H.264 to decode_image   = -ENOTSUP
[error] 16 bytes of 0x55 (JPEG) = -EINVAL
[error] half a JPEG             = -EIO
[error] a good JPEG afterwards  = 0
[release] first decode = 0, plane 0x4029f000
[release] vdec_frame_release done
[release] second decode = 0, plane 0x4029f000
[release] vdec_frame_release done
[open] MJPEG 320x240                      = 0
[open] H.264                              = 0
[open] H.264, 1 MiB buffer, hold 2        = 0
[open] JPEG without width/height          = -EINVAL
[open] PNG as a stream                    = -ENOTSUP
[open] H.264 as RGBA8888                  = -ENOTSUP
[feed] vdec_stream_open = 0
[feed] 16 bytes of 0x55        = -EINVAL, used 0
[feed] 0 bytes                 = -EINVAL, used 0
[feed] whole clip (21745 bytes) = 0, used 21745
[feed] vdec_stream_close done
[mjpeg] vdec_stream_open = 0
[mjpeg] feed #0 (8625 bytes, pts 0) = 0, used 8625
[mjpeg] get_frame = 0
[mjpeg] frame: format 1, 320x240, stride 320/320, pts 0
[mjpeg] feed #1 (8650 bytes, pts 100) = 0, used 8650
[mjpeg] get_frame = 0
[mjpeg] frame: format 1, 320x240, stride 320/320, pts 100
[mjpeg] feed #2 (9100 bytes, pts 200) = 0, used 9100
[mjpeg] get_frame = 0
[mjpeg] frame: format 1, 320x240, stride 320/320, pts 200
[mjpeg] feed #3 (9665 bytes, pts 300) = 0, used 9665
[mjpeg] get_frame = 0
[mjpeg] frame: format 1, 320x240, stride 320/320, pts 300
[mjpeg] feed #4 (9664 bytes, pts 400) = 0, used 9664
[mjpeg] get_frame = 0
[mjpeg] frame: format 1, 320x240, stride 320/320, pts 400
[mjpeg] flush = 0
[mjpeg] get_frame after flush = -ENODATA
[mjpeg] vdec_stream_close done
[h264] vdec_stream_open = 0
[h264] get_frame = -EAGAIN
[h264] feed NAL #0 (type 7, 27 bytes, pts 0) = 0, used 27
[h264] get_frame = -EAGAIN
[h264] feed NAL #1 (type 8, 5650 bytes, pts 1) = 0, used 5650
[h264] get_frame = -EAGAIN
[h264] feed NAL #2 (type 1, 335 bytes, pts 2) = 0, used 335
[h264] get_frame = 0
[h264] frame: format 1, 320x240, stride 320/320, pts 1
[h264] get_frame = -EAGAIN
[h264] feed NAL #3 (type 1, 136 bytes, pts 3) = 0, used 136
[h264] get_frame = 0
[h264] frame: format 1, 320x240, stride 320/320, pts 2
[h264] get_frame = -EAGAIN
[h264] feed NAL #4 (type 1, 108 bytes, pts 4) = 0, used 108
[h264] get_frame = 0
[h264] frame: format 1, 320x240, stride 320/320, pts 3
[h264] get_frame = -EAGAIN
[h264] feed NAL #5 (type 1, 87 bytes, pts 5) = 0, used 87
[h264] get_frame = 0
[h264] frame: format 1, 320x240, stride 320/320, pts 4
[h264] get_frame = -EAGAIN
[h264] get_frame = 0
[h264] flush = 0 (after 33 NAL units)
[h264] 30 frames decoded, all CRCs checked
[h264] vdec_stream_close done
[hold] vdec_stream_open(holding_frames 2) = 0
[hold] 3 frames held, get_frame = -EBUSY
[hold] after releasing them, get_frame = -EAGAIN
[hold] vdec_stream_close done
[flush] vdec_stream_open = 0
[flush] feed #0 = 0
[flush] feed #1 = 0
[flush] feed #2 = 0
[flush] vdec_stream_flush = 0
[flush] get_frame = 0, pts 0
[flush] get_frame = 0, pts 100
[flush] get_frame = 0, pts 200
[flush] get_frame = -ENODATA after 3 frames
[flush] vdec_stream_close done
[close] open the MJPEG stream = 0
[close] get_frame = 0
[close] vdec_stream_close done
[close] open an H.264 stream afterwards = 0
[close] vdec_stream_close done
vdec_api done
```
