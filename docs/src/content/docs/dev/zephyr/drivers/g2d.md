---
title: "G2D - 2D graphics acceleration"
---

G2D is the F101's 2D graphics accelerator: without going through the CPU, it does rectangle fills, blits (which can convert pixel format, scale, rotate and flip at the same time) and alpha blending between memory buffers. In Zephyr it is made into a `g2d` device, the interface is `<zephyr/drivers/g2d.h>`, and the driver is in `drivers/g2d/`.

Operations are queued first, then handed to the hardware one by one by the driver's thread, completing in the order they were submitted.

| Item | Content |
| --- | --- |
| Operations | fill (`G2D_OP_FILL`), blit (`G2D_OP_BLIT`), blend (`G2D_OP_BLEND`) |
| Pixel formats (writable) | ARGB8888, ABGR8888, RGBA8888, BGRA8888, XRGB8888, XBGR8888, RGB888, BGR888, RGB565, BGR565, ARGB4444, ARGB1555 |
| Pixel formats (read-only) | all of the above, plus NV12, NV21, I420, YUYV |
| Maximum size | 8192×8192 |
| Queue depth | devicetree `queue-depth`, default 8 |
| Cache | before an operation the driver cleans and invalidates the destination region, and cleans the source region and the blend's background region; after the operation it invalidates the destination region. With `G2D_FLAG_NO_CACHE_OPS` none of this is done |
| Restrictions | the destination format cannot be YUV; rotation requires the source and destination to have the same format and the same size (after rotation), 4-byte-aligned addresses and an 8-byte-aligned destination pitch; the blend's background must be RGB and the same size as the destination region |

## Devicetree

| File | Purpose |
| --- | --- |
| `dts/bindings/g2d/allwinner,sunxi-g2d.yaml` | binding |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC devicetree: the `g2d` node, `disabled` by default |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | board devicetree: changes `g2d` to `okay` |

### SoC devicetree: sun252i_f101.dtsi

```c
g2d: g2d@5410000 {
	/* matches the DT_DRV_COMPAT allwinner_sunxi_g2d in the driver g2d_sunxi.c */
	compatible = "allwinner,sunxi-g2d";

	/* register window: base 0x05410000, length 0x40000 */
	reg = <0x05410000 0x40000>;

	/* interrupt: PLIC number 111, priority 1 */
	interrupts = <111 1>;
	interrupt-parent = <&plic>;

	/* three clock gates: module clock, bus clock, MBUS clock, in the order of clock-names */
	clocks = <&cctl CLK_G2D>, <&cctl CLK_BUS_G2D>, <&cctl CLK_BUS_G2D_M>;
	clock-names = "mod", "bus", "mbus";
	resets = <&rctl RST_BUS_G2D>;

	/* the driver sets the module clock itself: the CCU base address, and the offset of the
	 * module clock register. The clock source is PLL_PERI_2X, the divider follows clock-frequency */
	ccu-base = <0x02001000>;
	mod-clk-reg = <0x630>;
	clock-frequency = <300000000>;

	status = "disabled";
};
```

### Board devicetree: yuzukineko.dts

```c
/* 2D graphics accelerator */
&g2d {
	status = "okay";
};
```

### Binding: allwinner,sunxi-g2d.yaml

| Property | Required | Meaning |
| --- | --- | --- |
| `reg`, `interrupts` | yes | register window, interrupt |
| `clocks`, `clock-names` | yes | three clock gates: `mod`, `bus`, `mbus`, in that order |
| `resets` | yes | bus reset |
| `ccu-base` | yes | the CCU base address |
| `mod-clk-reg` | yes | the offset of the G2D module clock register in the CCU (select 26:24, divider 4:0, gate 31); the driver sets the clock source to PLL_PERI_2X and computes the divider from `clock-frequency` |
| `clock-frequency` | no, 300000000 | module clock, in Hz |
| `queue-depth` | no, 8 | how many operations can be queued |

## Kconfig

| Option | Default | Meaning |
| --- | --- | --- |
| `CONFIG_G2D` | `y` in the board defconfig | enables the G2D interface and driver |
| `CONFIG_G2D_INIT_PRIORITY` | 41 | the driver's initialization priority (POST_KERNEL) |
| `CONFIG_G2D_SHELL` | `y` (depends on `SHELL`, and not minimal libc) | the shell command `g2d info|fill|blit|blend|bench`, to try the accelerator and compare it with the CPU |
| `CONFIG_G2D_SUNXI` | `y` (depends on `DT_HAS_ALLWINNER_SUNXI_G2D_ENABLED`) | builds this driver and selects `CACHE_MANAGEMENT`. The driver's license is GPL-2.0-or-later |
| `CONFIG_G2D_SUNXI_THREAD_STACK_SIZE` | 2048 | the stack size of the driver's worker thread |
| `CONFIG_G2D_SUNXI_THREAD_PRIORITY` | 5 | the priority of the driver's worker thread |
| `CONFIG_G2D_SUNXI_TIMEOUT_MS` | 100 | the longest an operation is allowed to run (milliseconds); a timeout returns `-ETIMEDOUT` |

## Interface reference

The demo runs on `yuzukineko`. Every result is compared against what the CPU computes for the same pixels, and prints `ok` when it is right. The common form is:

```c
static const struct device *const g2d = DEVICE_DT_GET(DT_NODELABEL(g2d));
```

The buffers are supplied by the caller. The G2D reads and writes physical memory, so buffers must be aligned to the cache line (64 bytes), and the CPU must write them back (`sys_cache_data_flush_range`) after writing so the G2D can read them. The demo uses the following helper functions:

```c
/* A buffer for a surface: 64 byte aligned, which is the cache line size of the C907. */
static struct g2d_surface surface(enum g2d_format fmt, uint16_t w, uint16_t h)
{
	struct g2d_surface s = { .format = fmt, .width = w, .height = h };
	size_t size = (size_t)w * h * g2d_format_bytes_per_pixel(fmt);

	s.plane[0] = aligned_alloc(64, ROUND_UP(size, 64));
	__ASSERT_NO_MSG(s.plane[0] != NULL);
	memset(s.plane[0], 0, size);
	sys_cache_data_flush_range(s.plane[0], size);
	return s;
}

static void release(struct g2d_surface *s)
{
	free(s->plane[0]);
}

static uint32_t *px32(const struct g2d_surface *s, int x, int y)
{
	return (uint32_t *)((uint8_t *)s->plane[0] + ((size_t)y * s->width + x) * 4);
}

static uint16_t *px16(const struct g2d_surface *s, int x, int y)
{
	return (uint16_t *)((uint8_t *)s->plane[0] + ((size_t)y * s->width + x) * 2);
}

/* the CPU wrote the pixels: push them out of the cache before the G2D reads them */
static void flush(const struct g2d_surface *s)
{
	sys_cache_data_flush_range(s->plane[0], (size_t)s->width * s->height *
				   g2d_format_bytes_per_pixel(s->format));
}

/* |a - b| of every colour channel is at most `tol` */
static bool near(uint32_t a, uint32_t b, int tol)
{
	for (int shift = 0; shift < 32; shift += 8) {
		int d = (int)((a >> shift) & 0xff) - (int)((b >> shift) & 0xff);

		if (d > tol || d < -tol) {
			return false;
		}
	}
	return true;
}
```

### struct g2d_surface and struct g2d_rect

```c
struct g2d_surface {
	enum g2d_format format;
	uint16_t width, height;		/* the pixel size of the buffer */
	void *plane[3];			/* base address of each plane; NV12/NV21 use 2, I420 uses 3 */
	uint32_t pitch[3];		/* stride of each plane (bytes); 0 means tightly packed */
};

struct g2d_rect {
	uint16_t x, y, width, height;	/* pixels */
};
```

`g2d_surface` describes a whole buffer, and `g2d_rect` is the region within the buffer to operate on. A YUV region cannot split the chroma sampling: x and width must be even, and for 4:2:0 y and height must also be even.

### g2d_get_capabilities

```c
int g2d_get_capabilities(const struct device *dev, struct g2d_capabilities *caps);
```

Reads the device's capabilities: the pixel formats it can read and write (each bit corresponds to a value of `enum g2d_format`), the supported operations, the maximum size, the alignment requirements for rotation, and the queue depth.

```c
/* g2d_get_capabilities: which formats and operations the device has */
static void demo_capabilities(void)
{
	struct g2d_capabilities caps;
	int ret = g2d_get_capabilities(g2d, &caps);

	printk("[caps] g2d_get_capabilities = %s\n", err(ret));
	printk("[caps] source formats 0x%x, destination formats 0x%x (bit n = enum g2d_format n)\n",
	       caps.src_formats, caps.dst_formats);
	printk("[caps] operations 0x%x (fill, blit, blend), up to %ux%u pixels\n", caps.ops,
	       caps.max_width, caps.max_height);
	printk("[caps] rotation needs %u byte aligned addresses and %u byte aligned pitch, queue depth %u\n",
	       caps.rotate_addr_align, caps.rotate_pitch_align, caps.queue_depth);
}
```

```text
[caps] g2d_get_capabilities = 0
[caps] source formats 0xffff, destination formats 0xfff (bit n = enum g2d_format n)
[caps] operations 0x7 (fill, blit, blend), up to 8192x8192 pixels
[caps] rotation needs 4 byte aligned addresses and 8 byte aligned pitch, queue depth 8
```

### g2d_format_bytes_per_pixel

```c
static inline unsigned int g2d_format_bytes_per_pixel(enum g2d_format format);
```

Returns how many bytes each pixel of the format's first plane takes; planar formats (NV12 and the like) return 0. The `surface()` above uses it to compute the buffer size.

### g2d_fill

```c
int g2d_fill(const struct device *dev, const struct g2d_surface *dst,
             const struct g2d_rect *dst_rect, uint32_t color);
```

Fills a rectangle of the destination buffer with one colour, and returns only once the operation has completed. The colour is always ARGB8888; the driver converts it when the destination is another format.

```c
/* g2d_fill: a rectangle of one colour. The colour is always ARGB8888; the driver converts it. */
static void demo_fill(void)
{
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 128, 96);
	struct g2d_rect r = { 16, 8, 64, 48 };
	int ret;

	ret = g2d_fill(g2d, &d, &r, 0xff3366cc);
	printk("[fill] ARGB8888 64x48 at (16,8)        = %s: inside %08x, outside %08x, %s\n", err(ret),
	       *px32(&d, 20, 10), *px32(&d, 2, 2),
	       verdict(*px32(&d, 16, 8) == 0xff3366cc && *px32(&d, 79, 55) == 0xff3366cc &&
		       *px32(&d, 80, 56) == 0 && *px32(&d, 15, 7) == 0));
	release(&d);

	d = surface(G2D_PIXFMT_RGB565, 128, 96);
	ret = g2d_fill(g2d, &d, &r, 0xff3366cc);
	printk("[fill] RGB565 64x48 at (16,8)          = %s: inside %04x (0xff3366cc is %04x), %s\n",
	       err(ret), *px16(&d, 20, 10), ((0x33 >> 3) << 11) | ((0x66 >> 2) << 5) | (0xcc >> 3),
	       verdict(*px16(&d, 20, 10) == (uint16_t)(((0x33 >> 3) << 11) | ((0x66 >> 2) << 5) |
							(0xcc >> 3))));
	release(&d);
}
```

```text
[fill] ARGB8888 64x48 at (16,8)        = 0: inside ff3366cc, outside 00000000, ok
[fill] RGB565 64x48 at (16,8)          = 0: inside 3339 (0xff3366cc is 3339), ok
```

### g2d_blit

```c
int g2d_blit(const struct device *dev, const struct g2d_surface *src, const struct g2d_rect *src_rect,
             const struct g2d_surface *dst, const struct g2d_rect *dst_rect,
             enum g2d_rotation rotation, uint32_t flags);
```

Blits the source rectangle to the destination rectangle, and returns only once it has completed. When the source and destination rectangles are different sizes it scales; when the formats are different it converts; `rotation` and `G2D_FLIP_H` and `G2D_FLIP_V` in `flags` do rotation and flipping (rotation first, then flipping).

#### Example: copy, scale, convert format

```c
/* g2d_blit: copy a rectangle, converting the format, scaling to the size of the destination
 * rectangle and rotating
 */
static void demo_blit(void)
{
	struct g2d_surface s = surface(G2D_PIXFMT_ARGB8888, 128, 96);
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 128, 96);
	struct g2d_rect sr = { 10, 6, 80, 60 }, dr = { 30, 20, 80, 60 };
	int ret;

	for (int y = 0; y < 96; y++) {
		for (int x = 0; x < 128; x++) {
			*px32(&s, x, y) = 0xff000000 | (x << 16) | (y << 8) | 0x80;
		}
	}
	flush(&s);

	/* copy */
	ret = g2d_blit(g2d, &s, &sr, &d, &dr, G2D_ROTATE_0, 0);
	printk("[blit] copy 80x60 to (30,20)           = %s: %s\n", err(ret),
	       verdict(*px32(&d, 30, 20) == *px32(&s, 10, 6) && *px32(&d, 109, 79) == *px32(&s, 89, 65)));

	/* scale up to twice the size */
	struct g2d_surface big = surface(G2D_PIXFMT_ARGB8888, 256, 192);
	struct g2d_rect small = { 0, 0, 64, 48 }, twice = { 0, 0, 128, 96 };

	ret = g2d_blit(g2d, &s, &small, &big, &twice, G2D_ROTATE_0, 0);
	printk("[blit] scale 64x48 to 128x96           = %s: corner %08x -> %08x\n", err(ret),
	       *px32(&s, 0, 0), *px32(&big, 0, 0));

	/* convert to RGB565 */
	struct g2d_surface c = surface(G2D_PIXFMT_RGB565, 128, 96);
	struct g2d_rect all = { 0, 0, 128, 96 };

	ret = g2d_blit(g2d, &s, &all, &c, &all, G2D_ROTATE_0, 0);
	uint32_t p = *px32(&s, 100, 50);
	uint16_t want = (((p >> 16) & 0xff) >> 3) << 11 | (((p >> 8) & 0xff) >> 2) << 5 | ((p & 0xff) >> 3);

	printk("[blit] ARGB8888 to RGB565              = %s: %08x -> %04x (wanted %04x), %s\n", err(ret), p,
	       *px16(&c, 100, 50), want, verdict(near(*px16(&c, 100, 50), want, 0)));

	release(&s);
	release(&d);
	release(&big);
	release(&c);
}
```

```text
[blit] copy 80x60 to (30,20)           = 0: ok
[blit] scale 64x48 to 128x96           = 0: corner ff000080 -> ff000080
[blit] ARGB8888 to RGB565              = 0: ff643280 -> 6190 (wanted 6190), ok
```

#### Example: rotation and flips

Each of the source image's four corners has one colour, and after rotation the check sees which position each lands on. The destination buffer of a 90- and a 270-degree rotation has the source's width and height swapped. Rotation requires the source and destination to have the same format, an 8-byte-aligned destination pitch and a 4-byte-aligned buffer address.

```c
/* g2d_blit with a rotation and flips. The source has four coloured corners; the rotation moves
 * them. The destination of a 90 or 270 degree rotation is as high as the source is wide.
 */
static void demo_rotate(void)
{
	static const struct {
		const char *name;
		enum g2d_rotation rot;
		uint32_t flags;
		int tl, tr, bl, br;	/* which source corner lands in each destination corner */
	} cases[] = {
		/* corners are numbered 0 TL, 1 TR, 2 BL, 3 BR in the source */
		{ "flip horizontal", G2D_ROTATE_0, G2D_FLIP_H, 1, 0, 3, 2 },
		{ "flip vertical  ", G2D_ROTATE_0, G2D_FLIP_V, 2, 3, 0, 1 },
		{ "rotate 90      ", G2D_ROTATE_90, 0, 2, 0, 3, 1 },
		{ "rotate 180     ", G2D_ROTATE_180, 0, 3, 2, 1, 0 },
		{ "rotate 270     ", G2D_ROTATE_270, 0, 1, 3, 0, 2 },
	};
	static const uint32_t corner[4] = { 0xffff0000, 0xff00ff00, 0xff0000ff, 0xffffff00 };

	for (int i = 0; i < ARRAY_SIZE(cases); i++) {
		bool swap = cases[i].rot == G2D_ROTATE_90 || cases[i].rot == G2D_ROTATE_270;
		struct g2d_surface s = surface(G2D_PIXFMT_ARGB8888, 64, 48);
		struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, swap ? 48 : 64, swap ? 64 : 48);
		struct g2d_rect sr = { 0, 0, 64, 48 }, dr = { 0, 0, d.width, d.height };

		*px32(&s, 0, 0) = corner[0];
		*px32(&s, 63, 0) = corner[1];
		*px32(&s, 0, 47) = corner[2];
		*px32(&s, 63, 47) = corner[3];
		flush(&s);

		int ret = g2d_blit(g2d, &s, &sr, &d, &dr, cases[i].rot, cases[i].flags);
		bool ok = *px32(&d, 0, 0) == corner[cases[i].tl] &&
			  *px32(&d, d.width - 1, 0) == corner[cases[i].tr] &&
			  *px32(&d, 0, d.height - 1) == corner[cases[i].bl] &&
			  *px32(&d, d.width - 1, d.height - 1) == corner[cases[i].br];

		printk("[rotate] %s %2ux%-2u -> %2ux%-2u = %s: %s\n", cases[i].name, s.width, s.height,
		       d.width, d.height, err(ret), verdict(ok));
		release(&s);
		release(&d);
	}
}
```

```text
[rotate] flip horizontal 64x48 -> 64x48 = 0: ok
[rotate] flip vertical   64x48 -> 64x48 = 0: ok
[rotate] rotate 90       64x48 -> 48x64 = 0: ok
[rotate] rotate 180      64x48 -> 64x48 = 0: ok
[rotate] rotate 270      64x48 -> 48x64 = 0: ok
```

#### Example: YUV source to RGB

The two planes of NV12 are each given a base address and a stride. The defaults are BT.601 and the limited range (16…235); `G2D_FLAG_YUV_FULL_RANGE` uses full range and `G2D_FLAG_YUV_BT709` uses BT.709. Y 81, U 90, V 240 is red under the default settings.

```c
/* g2d_blit from a YUV source: NV12 is a Y plane followed by an interleaved U/V plane.
 * Y 81, U 90, V 240 is red in BT.601 with the limited range 16..235 (the defaults).
 */
static void demo_yuv(void)
{
	struct g2d_surface s = { .format = G2D_PIXFMT_NV12, .width = 64, .height = 48 };
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 64, 48);
	struct g2d_rect all = { 0, 0, 64, 48 };
	uint8_t *y = aligned_alloc(64, 64 * 48);
	uint8_t *uv = aligned_alloc(64, 64 * 24);
	int ret;

	memset(y, 81, 64 * 48);
	for (int i = 0; i < 64 * 24; i += 2) {
		uv[i] = 90;
		uv[i + 1] = 240;
	}
	sys_cache_data_flush_range(y, 64 * 48);
	sys_cache_data_flush_range(uv, 64 * 24);
	s.plane[0] = y;
	s.plane[1] = uv;
	s.pitch[0] = 64;
	s.pitch[1] = 64;

	ret = g2d_blit(g2d, &s, &all, &d, &all, G2D_ROTATE_0, 0);
	printk("[yuv] NV12 (81, 90, 240) to ARGB8888   = %s: %08x, %s\n", err(ret), *px32(&d, 10, 10),
	       verdict(near(*px32(&d, 10, 10), 0xffff0000, 3)));

	/* the same Y with a different matrix and range gives a different red */
	ret = g2d_blit(g2d, &s, &all, &d, &all, G2D_ROTATE_0, G2D_FLAG_YUV_FULL_RANGE | G2D_FLAG_YUV_BT709);
	printk("[yuv] same data, full range, BT.709    = %s: %08x\n", err(ret), *px32(&d, 10, 10));

	free(y);
	free(uv);
	release(&d);
}
```

```text
[yuv] NV12 (81, 90, 240) to ARGB8888   = 0: fffe0000, ok
[yuv] same data, full range, BT.709    = 0: fff11300
```

### g2d_blend

```c
int g2d_blend(const struct device *dev, const struct g2d_surface *fg, const struct g2d_rect *fg_rect,
              const struct g2d_surface *bg, const struct g2d_rect *bg_rect,
              const struct g2d_surface *dst, const struct g2d_rect *dst_rect,
              const struct g2d_blend *blend, uint32_t flags);
```

Blends the foreground over the background and writes the result to the destination; the destination can be the background itself. `struct g2d_blend` selects the blend mode (Porter-Duff: `G2D_BLEND_SRC_OVER`, `SRC`, `DST_OVER`, `SRC_IN` and other of the 12 kinds) and the alpha source for the foreground and background:

| `g2d_alpha_mode` | How alpha is taken |
| --- | --- |
| `G2D_ALPHA_PIXEL` | the pixel's own alpha channel |
| `G2D_ALPHA_GLOBAL` | a layer-wide uniform `fg_alpha` / `bg_alpha` (0…255) |
| `G2D_ALPHA_MIXED` | the pixel's alpha multiplied by the layer-wide alpha |

When the foreground and destination regions are different sizes the foreground is scaled; the background must be RGB and the same size as the destination region.

```c
/* g2d_blend: the foreground over the background. A red foreground with a layer alpha of 128 over
 * an opaque blue background is about half red and half blue.
 */
static void demo_blend(void)
{
	struct g2d_surface fg = surface(G2D_PIXFMT_ARGB8888, 64, 48);
	struct g2d_surface bg = surface(G2D_PIXFMT_ARGB8888, 64, 48);
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 64, 48);
	struct g2d_rect all = { 0, 0, 64, 48 };
	struct g2d_blend b = {
		.mode = G2D_BLEND_SRC_OVER,
		.fg_alpha_mode = G2D_ALPHA_GLOBAL,
		.fg_alpha = 128,
		.bg_alpha_mode = G2D_ALPHA_PIXEL,
	};
	int ret;

	for (int i = 0; i < 64 * 48; i++) {
		((uint32_t *)fg.plane[0])[i] = 0xffff0000;
		((uint32_t *)bg.plane[0])[i] = 0xff0000ff;
	}
	flush(&fg);
	flush(&bg);

	ret = g2d_blend(g2d, &fg, &all, &bg, &all, &d, &all, &b, 0);
	printk("[blend] src-over, layer alpha 128      = %s: %08x, %s\n", err(ret), *px32(&d, 5, 5),
	       verdict(near(*px32(&d, 5, 5), 0xff800080, 3)));

	/* the pixels' own alpha: a foreground of alpha 64 (a quarter) */
	for (int i = 0; i < 64 * 48; i++) {
		((uint32_t *)fg.plane[0])[i] = 0x40ff0000;
	}
	flush(&fg);
	b.fg_alpha_mode = G2D_ALPHA_PIXEL;
	ret = g2d_blend(g2d, &fg, &all, &bg, &all, &d, &all, &b, 0);
	printk("[blend] src-over, pixel alpha 64       = %s: %08x\n", err(ret), *px32(&d, 5, 5));

	/* a different Porter-Duff mode: G2D_BLEND_SRC replaces the background */
	b.mode = G2D_BLEND_SRC;
	b.fg_alpha_mode = G2D_ALPHA_GLOBAL;
	b.fg_alpha = 255;
	ret = g2d_blend(g2d, &fg, &all, &bg, &all, &d, &all, &b, 0);
	printk("[blend] G2D_BLEND_SRC                  = %s: %08x\n", err(ret), *px32(&d, 5, 5));

	release(&fg);
	release(&bg);
	release(&d);
}
```

```text
[blend] src-over, layer alpha 128      = 0: ff80007f, ok
[blend] src-over, pixel alpha 64       = 0: ff4100be
[blend] G2D_BLEND_SRC                  = 0: ffff0000
```

A red foreground with a layer alpha of 128 over an opaque blue gives about half red and half blue; red with a pixel alpha of 64 makes up about a quarter.

### g2d_submit

```c
int g2d_submit(const struct device *dev, const struct g2d_op *op);
```

Puts an operation into the queue without waiting for it to complete. `struct g2d_op` describes the whole operation (type, buffers, rectangles, colour, blend parameters, callback); the driver copies it, but the buffers used by the operation must stay valid until the operation completes.

| Return | Meaning |
| --- | --- |
| 0 | queued |
| `-EINVAL` | the device does not support these parameters (format, rectangle, alignment, etc.) |
| `-ENOMEM` | the queue is full |

After completion the driver calls `op->callback` in its own thread, with `status` being 0 or a negative error code; the callback must not block. Operations complete in the order they were submitted.

The demo submits 12 fills at once; the queue holds 7 and the other 5 are refused.

```c
static K_SEM_DEFINE(done_sem, 0, 64);

static volatile int completed, failed;

static volatile int order_ok = 1, last_tag = -1;

static void on_done(const struct device *dev, const struct g2d_op *op, int status, void *user_data)
{
	int tag = (int)(intptr_t)user_data;

	if (status != 0) {
		failed++;
	}
	if (tag != last_tag + 1) {
		order_ok = 0;
	}
	last_tag = tag;
	completed++;
	k_sem_give(&done_sem);
}

static void demo_submit(void)
{
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 512, 384);
	struct g2d_op op = {
		.type = G2D_OP_FILL,
		.dst = d,
		.dst_rect = { 0, 0, 512, 384 },
		.callback = on_done,
	};
	int queued = 0, full = 0;

	/* more operations than the queue holds, without waiting in between */
	for (int i = 0; i < 12; i++) {
		int ret;

		op.color = 0xff000000 | (i * 20);
		op.user_data = (void *)(intptr_t)queued;
		ret = g2d_submit(g2d, &op);
		if (ret == 0) {
			queued++;
		} else if (ret == -ENOMEM) {
			full++;
		}
	}
	printk("[submit] 12 fills of 512x384 submitted: %d queued, %d refused with -ENOMEM\n", queued, full);

	for (int i = 0; i < queued; i++) {
		k_sem_take(&done_sem, K_SECONDS(2));
	}
	printk("[submit] %d callbacks, %d failed, in submission order: %s; last pixel %08x\n", completed,
	       failed, order_ok ? "yes" : "NO", *px32(&d, 100, 100));
	release(&d);
}
```

```text
[submit] 12 fills of 512x384 submitted: 7 queued, 5 refused with -ENOMEM
[submit] 7 callbacks, 0 failed, in submission order: yes; last pixel ff000078
```

### g2d_run

```c
int g2d_run(const struct device *dev, const struct g2d_op *op, k_timeout_t timeout);
```

Submits one operation and waits for it to complete. `g2d_fill`, `g2d_blit` and `g2d_blend` are wrappers around it. A timeout returns `-EAGAIN`, and the operation itself still runs to completion.

```c
/* g2d_run: submit and wait. A timeout shorter than the operation returns -EAGAIN, the operation
 * still finishes.
 */
static void demo_run(void)
{
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 1024, 768);
	struct g2d_op op = {
		.type = G2D_OP_FILL,
		.color = 0xff112233,
		.dst = d,
		.dst_rect = { 0, 0, 1024, 768 },
	};
	int64_t t0;
	int ret;

	t0 = k_uptime_ticks();
	ret = g2d_run(g2d, &op, K_SECONDS(1));
	printk("[run] fill 1024x768, wait up to 1 s     = %s, %lld us, pixel %08x\n", err(ret),
	       k_ticks_to_us_near64(k_uptime_ticks() - t0), *px32(&d, 500, 500));

	ret = g2d_run(g2d, &op, K_NO_WAIT);
	printk("[run] the same with K_NO_WAIT           = %s\n", err(ret));
	k_msleep(50);
	release(&d);
}
```

```text
[run] fill 1024x768, wait up to 1 s     = 0, 5700 us, pixel ff112233
[run] the same with K_NO_WAIT           = -EAGAIN
```

### Parameters the driver refuses

```c
/* what the driver refuses */
static void demo_errors(void)
{
	struct g2d_surface rgb = surface(G2D_PIXFMT_ARGB8888, 64, 48);
	struct g2d_surface yuv = { .format = G2D_PIXFMT_NV12, .width = 64, .height = 48 };
	struct g2d_rect all = { 0, 0, 64, 48 };
	struct g2d_rect outside = { 40, 40, 64, 48 };
	struct g2d_rect empty = { 0, 0, 0, 0 };
	struct g2d_rect small = { 0, 0, 32, 32 };
	int ret;

	ret = g2d_fill(g2d, &rgb, &outside, 0xffffffff);
	printk("[error] rectangle outside the surface   = %s\n", err(ret));
	ret = g2d_fill(g2d, &rgb, &empty, 0xffffffff);
	printk("[error] empty rectangle                 = %s\n", err(ret));
	ret = g2d_fill(g2d, &yuv, &all, 0xffffffff);
	printk("[error] destination in NV12             = %s\n", err(ret));
	ret = g2d_blit(g2d, &rgb, &all, &rgb, &small, G2D_ROTATE_90, 0);
	printk("[error] rotation to a different size    = %s\n", err(ret));
	rgb.plane[0] = NULL;
	ret = g2d_fill(g2d, &rgb, &all, 0xffffffff);
	printk("[error] surface without a buffer        = %s\n", err(ret));
}
```

```text
[error] rectangle outside the surface   = -EINVAL
[error] empty rectangle                 = -EINVAL
[error] destination in NV12             = -EINVAL
[error] rotation to a different size    = -EINVAL
[error] surface without a buffer        = -EINVAL
```

### Speed against the CPU

Filling and copying a whole screen (1024×768 ARGB8888, 3 MiB):

```c
/* the G2D against the CPU filling a 1024x768 buffer, which is a full screen */
static void demo_speed(void)
{
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 1024, 768);
	struct g2d_surface s = surface(G2D_PIXFMT_ARGB8888, 1024, 768);
	struct g2d_rect all = { 0, 0, 1024, 768 };
	size_t size = 1024 * 768 * 4;
	int64_t t0;
	int ret;

	t0 = k_uptime_ticks();
	for (size_t i = 0; i < size / 4; i++) {
		((uint32_t *)d.plane[0])[i] = 0xff445566;
	}
	sys_cache_data_flush_range(d.plane[0], size);
	printk("[speed] CPU fill 1024x768               : %lld us\n", k_ticks_to_us_near64(k_uptime_ticks() - t0));

	t0 = k_uptime_ticks();
	ret = g2d_fill(g2d, &d, &all, 0xff445566);
	printk("[speed] g2d_fill 1024x768               = %s: %lld us\n", err(ret),
	       k_ticks_to_us_near64(k_uptime_ticks() - t0));

	t0 = k_uptime_ticks();
	memcpy(s.plane[0], d.plane[0], size);
	sys_cache_data_flush_range(s.plane[0], size);
	printk("[speed] CPU copy 1024x768               : %lld us\n", k_ticks_to_us_near64(k_uptime_ticks() - t0));

	t0 = k_uptime_ticks();
	ret = g2d_blit(g2d, &s, &all, &d, &all, G2D_ROTATE_0, 0);
	printk("[speed] g2d_blit 1024x768               = %s: %lld us\n", err(ret),
	       k_ticks_to_us_near64(k_uptime_ticks() - t0));

	release(&s);
	release(&d);
}
```

```text
[speed] CPU fill 1024x768               : 11300 us
[speed] g2d_fill 1024x768               = 0: 5700 us
[speed] CPU copy 1024x768               : 13400 us
[speed] g2d_blit 1024x768               = 0: 10900 us
```

The CPU's time includes writing the result back to the cache. The G2D's advantage is that the CPU can do other things during that time (with `g2d_submit`).

### Showing the result

Use the G2D to draw a few colour blocks in a 320×240 buffer, blend a translucent white bar over it, then rotate that bar 90 degrees and blend it onto the right side, and finally write it to screen position (100, 100) with the display interface. The display's frame-buffer layer is ARGB8888, and the write window is at most 400×400.

```c
/* make a picture with the G2D and show it. The frame buffer plane of the display is ARGB8888
 * and can be written in a window of at most 400x400 pixels.
 */
static void demo_show(void)
{
	const struct device *disp = DEVICE_DT_GET(DT_CHOSEN(zephyr_display));
	struct g2d_surface scene = surface(G2D_PIXFMT_ARGB8888, 320, 240);
	struct g2d_surface bar = surface(G2D_PIXFMT_ARGB8888, 160, 32);
	struct g2d_surface tall = surface(G2D_PIXFMT_ARGB8888, 32, 160);
	struct g2d_rect all = { 0, 0, 320, 240 };
	struct g2d_blend b = { .mode = G2D_BLEND_SRC_OVER, .fg_alpha_mode = G2D_ALPHA_GLOBAL,
			       .fg_alpha = 160, .bg_alpha_mode = G2D_ALPHA_PIXEL };

	if (!device_is_ready(disp)) {
		printk("[show] no display\n");
		return;
	}

	/* a dark background, then three bars, the last one blended over the others */
	g2d_fill(g2d, &scene, &all, 0xff102030);
	g2d_fill(g2d, &scene, &(struct g2d_rect){ 20, 20, 120, 80 }, 0xffe04040);
	g2d_fill(g2d, &scene, &(struct g2d_rect){ 100, 70, 120, 80 }, 0xff40e040);
	g2d_fill(g2d, &scene, &(struct g2d_rect){ 180, 120, 120, 80 }, 0xff4040e0);

	g2d_fill(g2d, &bar, &(struct g2d_rect){ 0, 0, 160, 32 }, 0xffffffff);
	g2d_blend(g2d, &bar, &(struct g2d_rect){ 0, 0, 160, 32 }, &scene,
		  &(struct g2d_rect){ 80, 40, 160, 32 }, &scene, &(struct g2d_rect){ 80, 40, 160, 32 }, &b, 0);

	/* the bar turned to stand up, put over the right side */
	g2d_blit(g2d, &bar, &(struct g2d_rect){ 0, 0, 160, 32 }, &tall, &(struct g2d_rect){ 0, 0, 32, 160 },
		 G2D_ROTATE_90, 0);
	g2d_blend(g2d, &tall, &(struct g2d_rect){ 0, 0, 32, 160 }, &scene,
		  &(struct g2d_rect){ 260, 40, 32, 160 }, &scene, &(struct g2d_rect){ 260, 40, 32, 160 }, &b, 0);

	struct display_buffer_descriptor desc = {
		.buf_size = 320 * 240 * 4,
		.width = 320,
		.height = 240,
		.pitch = 320,
	};
	int ret = display_write(disp, 100, 100, &desc, scene.plane[0]);

	sys_cache_data_flush_range(scene.plane[0], desc.buf_size);
	display_blanking_off(disp);
	printk("[show] display_write 320x240 at (100,100) = %s\n", err(ret));

	release(&scene);
	release(&bar);
	release(&tall);
}
```

```text
[show] display_write 320x240 at (100,100) = 0
```

## The complete demo program

All the examples and logs above come from this one program. Create a directory, put the files below in it, and it can be built like any other Zephyr application.

```text
g2d_api/
├── CMakeLists.txt
├── prj.conf
└── src/
    └── main.c
```

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(g2d_api)

target_sources(app PRIVATE src/main.c)
```

### prj.conf

```ini
CONFIG_G2D=y
CONFIG_DISPLAY=y
CONFIG_PRINTK=y
CONFIG_MAIN_STACK_SIZE=8192
CONFIG_HEAP_MEM_POOL_SIZE=65536
# the buffers come from the libc heap, which takes all RAM above the image
CONFIG_COMMON_LIBC_MALLOC_ARENA_SIZE=-1
CONFIG_SHELL=n
CONFIG_DEVMEM_SHELL=n
CONFIG_LOG_PRINTK=n
```

`CONFIG_COMMON_LIBC_MALLOC_ARENA_SIZE=-1` makes the libc heap take all RAM after the image, and the demo's 1024×768 buffers are all allocated from it; putting a large heap into the system heap (`CONFIG_HEAP_MEM_POOL_SIZE`) would make it part of `zephyr.bin`.

### src/main.c

```c
/*
 * Calls every function of <zephyr/drivers/g2d.h>: fill, copy with format conversion, scaling,
 * rotation and flips, YUV sources and alpha blending. Each result is checked against what the CPU
 * computes for the same pixels, then a picture made with the G2D is put on the display.
 */
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include <zephyr/cache.h>
#include <zephyr/device.h>
#include <zephyr/drivers/display.h>
#include <zephyr/drivers/g2d.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

static const struct device *const g2d = DEVICE_DT_GET(DT_NODELABEL(g2d));

static const char *err(int ret)
{
	switch (ret) {
	case 0:		return "0";
	case -EINVAL:	return "-EINVAL";
	case -ENOMEM:	return "-ENOMEM";
	case -EAGAIN:	return "-EAGAIN";
	case -EIO:	return "-EIO";
	case -ETIMEDOUT: return "-ETIMEDOUT";
	default:	return "?";
	}
}

/* A buffer for a surface: 64 byte aligned, which is the cache line size of the C907. */
static struct g2d_surface surface(enum g2d_format fmt, uint16_t w, uint16_t h)
{
	struct g2d_surface s = { .format = fmt, .width = w, .height = h };
	size_t size = (size_t)w * h * g2d_format_bytes_per_pixel(fmt);

	s.plane[0] = aligned_alloc(64, ROUND_UP(size, 64));
	__ASSERT_NO_MSG(s.plane[0] != NULL);
	memset(s.plane[0], 0, size);
	sys_cache_data_flush_range(s.plane[0], size);
	return s;
}

static void release(struct g2d_surface *s)
{
	free(s->plane[0]);
}

static uint32_t *px32(const struct g2d_surface *s, int x, int y)
{
	return (uint32_t *)((uint8_t *)s->plane[0] + ((size_t)y * s->width + x) * 4);
}

static uint16_t *px16(const struct g2d_surface *s, int x, int y)
{
	return (uint16_t *)((uint8_t *)s->plane[0] + ((size_t)y * s->width + x) * 2);
}

/* the CPU wrote the pixels: push them out of the cache before the G2D reads them */
static void flush(const struct g2d_surface *s)
{
	sys_cache_data_flush_range(s->plane[0], (size_t)s->width * s->height *
				   g2d_format_bytes_per_pixel(s->format));
}

/* |a - b| of every colour channel is at most `tol` */
static bool near(uint32_t a, uint32_t b, int tol)
{
	for (int shift = 0; shift < 32; shift += 8) {
		int d = (int)((a >> shift) & 0xff) - (int)((b >> shift) & 0xff);

		if (d > tol || d < -tol) {
			return false;
		}
	}
	return true;
}

static const char *verdict(bool ok)
{
	return ok ? "ok" : "WRONG";
}

/* g2d_get_capabilities: which formats and operations the device has */
static void demo_capabilities(void)
{
	struct g2d_capabilities caps;
	int ret = g2d_get_capabilities(g2d, &caps);

	printk("[caps] g2d_get_capabilities = %s\n", err(ret));
	printk("[caps] source formats 0x%x, destination formats 0x%x (bit n = enum g2d_format n)\n",
	       caps.src_formats, caps.dst_formats);
	printk("[caps] operations 0x%x (fill, blit, blend), up to %ux%u pixels\n", caps.ops,
	       caps.max_width, caps.max_height);
	printk("[caps] rotation needs %u byte aligned addresses and %u byte aligned pitch, queue depth %u\n",
	       caps.rotate_addr_align, caps.rotate_pitch_align, caps.queue_depth);
}

/* g2d_fill: a rectangle of one colour. The colour is always ARGB8888; the driver converts it. */
static void demo_fill(void)
{
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 128, 96);
	struct g2d_rect r = { 16, 8, 64, 48 };
	int ret;

	ret = g2d_fill(g2d, &d, &r, 0xff3366cc);
	printk("[fill] ARGB8888 64x48 at (16,8)        = %s: inside %08x, outside %08x, %s\n", err(ret),
	       *px32(&d, 20, 10), *px32(&d, 2, 2),
	       verdict(*px32(&d, 16, 8) == 0xff3366cc && *px32(&d, 79, 55) == 0xff3366cc &&
		       *px32(&d, 80, 56) == 0 && *px32(&d, 15, 7) == 0));
	release(&d);

	d = surface(G2D_PIXFMT_RGB565, 128, 96);
	ret = g2d_fill(g2d, &d, &r, 0xff3366cc);
	printk("[fill] RGB565 64x48 at (16,8)          = %s: inside %04x (0xff3366cc is %04x), %s\n",
	       err(ret), *px16(&d, 20, 10), ((0x33 >> 3) << 11) | ((0x66 >> 2) << 5) | (0xcc >> 3),
	       verdict(*px16(&d, 20, 10) == (uint16_t)(((0x33 >> 3) << 11) | ((0x66 >> 2) << 5) |
							(0xcc >> 3))));
	release(&d);
}

/* g2d_blit: copy a rectangle, converting the format, scaling to the size of the destination
 * rectangle and rotating
 */
static void demo_blit(void)
{
	struct g2d_surface s = surface(G2D_PIXFMT_ARGB8888, 128, 96);
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 128, 96);
	struct g2d_rect sr = { 10, 6, 80, 60 }, dr = { 30, 20, 80, 60 };
	int ret;

	for (int y = 0; y < 96; y++) {
		for (int x = 0; x < 128; x++) {
			*px32(&s, x, y) = 0xff000000 | (x << 16) | (y << 8) | 0x80;
		}
	}
	flush(&s);

	/* copy */
	ret = g2d_blit(g2d, &s, &sr, &d, &dr, G2D_ROTATE_0, 0);
	printk("[blit] copy 80x60 to (30,20)           = %s: %s\n", err(ret),
	       verdict(*px32(&d, 30, 20) == *px32(&s, 10, 6) && *px32(&d, 109, 79) == *px32(&s, 89, 65)));

	/* scale up to twice the size */
	struct g2d_surface big = surface(G2D_PIXFMT_ARGB8888, 256, 192);
	struct g2d_rect small = { 0, 0, 64, 48 }, twice = { 0, 0, 128, 96 };

	ret = g2d_blit(g2d, &s, &small, &big, &twice, G2D_ROTATE_0, 0);
	printk("[blit] scale 64x48 to 128x96           = %s: corner %08x -> %08x\n", err(ret),
	       *px32(&s, 0, 0), *px32(&big, 0, 0));

	/* convert to RGB565 */
	struct g2d_surface c = surface(G2D_PIXFMT_RGB565, 128, 96);
	struct g2d_rect all = { 0, 0, 128, 96 };

	ret = g2d_blit(g2d, &s, &all, &c, &all, G2D_ROTATE_0, 0);
	uint32_t p = *px32(&s, 100, 50);
	uint16_t want = (((p >> 16) & 0xff) >> 3) << 11 | (((p >> 8) & 0xff) >> 2) << 5 | ((p & 0xff) >> 3);

	printk("[blit] ARGB8888 to RGB565              = %s: %08x -> %04x (wanted %04x), %s\n", err(ret), p,
	       *px16(&c, 100, 50), want, verdict(near(*px16(&c, 100, 50), want, 0)));

	release(&s);
	release(&d);
	release(&big);
	release(&c);
}

/* g2d_blit with a rotation and flips. The source has four coloured corners; the rotation moves
 * them. The destination of a 90 or 270 degree rotation is as high as the source is wide.
 */
static void demo_rotate(void)
{
	static const struct {
		const char *name;
		enum g2d_rotation rot;
		uint32_t flags;
		int tl, tr, bl, br;	/* which source corner lands in each destination corner */
	} cases[] = {
		/* corners are numbered 0 TL, 1 TR, 2 BL, 3 BR in the source */
		{ "flip horizontal", G2D_ROTATE_0, G2D_FLIP_H, 1, 0, 3, 2 },
		{ "flip vertical  ", G2D_ROTATE_0, G2D_FLIP_V, 2, 3, 0, 1 },
		{ "rotate 90      ", G2D_ROTATE_90, 0, 2, 0, 3, 1 },
		{ "rotate 180     ", G2D_ROTATE_180, 0, 3, 2, 1, 0 },
		{ "rotate 270     ", G2D_ROTATE_270, 0, 1, 3, 0, 2 },
	};
	static const uint32_t corner[4] = { 0xffff0000, 0xff00ff00, 0xff0000ff, 0xffffff00 };

	for (int i = 0; i < ARRAY_SIZE(cases); i++) {
		bool swap = cases[i].rot == G2D_ROTATE_90 || cases[i].rot == G2D_ROTATE_270;
		struct g2d_surface s = surface(G2D_PIXFMT_ARGB8888, 64, 48);
		struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, swap ? 48 : 64, swap ? 64 : 48);
		struct g2d_rect sr = { 0, 0, 64, 48 }, dr = { 0, 0, d.width, d.height };

		*px32(&s, 0, 0) = corner[0];
		*px32(&s, 63, 0) = corner[1];
		*px32(&s, 0, 47) = corner[2];
		*px32(&s, 63, 47) = corner[3];
		flush(&s);

		int ret = g2d_blit(g2d, &s, &sr, &d, &dr, cases[i].rot, cases[i].flags);
		bool ok = *px32(&d, 0, 0) == corner[cases[i].tl] &&
			  *px32(&d, d.width - 1, 0) == corner[cases[i].tr] &&
			  *px32(&d, 0, d.height - 1) == corner[cases[i].bl] &&
			  *px32(&d, d.width - 1, d.height - 1) == corner[cases[i].br];

		printk("[rotate] %s %2ux%-2u -> %2ux%-2u = %s: %s\n", cases[i].name, s.width, s.height,
		       d.width, d.height, err(ret), verdict(ok));
		release(&s);
		release(&d);
	}
}

/* g2d_blit from a YUV source: NV12 is a Y plane followed by an interleaved U/V plane.
 * Y 81, U 90, V 240 is red in BT.601 with the limited range 16..235 (the defaults).
 */
static void demo_yuv(void)
{
	struct g2d_surface s = { .format = G2D_PIXFMT_NV12, .width = 64, .height = 48 };
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 64, 48);
	struct g2d_rect all = { 0, 0, 64, 48 };
	uint8_t *y = aligned_alloc(64, 64 * 48);
	uint8_t *uv = aligned_alloc(64, 64 * 24);
	int ret;

	memset(y, 81, 64 * 48);
	for (int i = 0; i < 64 * 24; i += 2) {
		uv[i] = 90;
		uv[i + 1] = 240;
	}
	sys_cache_data_flush_range(y, 64 * 48);
	sys_cache_data_flush_range(uv, 64 * 24);
	s.plane[0] = y;
	s.plane[1] = uv;
	s.pitch[0] = 64;
	s.pitch[1] = 64;

	ret = g2d_blit(g2d, &s, &all, &d, &all, G2D_ROTATE_0, 0);
	printk("[yuv] NV12 (81, 90, 240) to ARGB8888   = %s: %08x, %s\n", err(ret), *px32(&d, 10, 10),
	       verdict(near(*px32(&d, 10, 10), 0xffff0000, 3)));

	/* the same Y with a different matrix and range gives a different red */
	ret = g2d_blit(g2d, &s, &all, &d, &all, G2D_ROTATE_0, G2D_FLAG_YUV_FULL_RANGE | G2D_FLAG_YUV_BT709);
	printk("[yuv] same data, full range, BT.709    = %s: %08x\n", err(ret), *px32(&d, 10, 10));

	free(y);
	free(uv);
	release(&d);
}

/* g2d_blend: the foreground over the background. A red foreground with a layer alpha of 128 over
 * an opaque blue background is about half red and half blue.
 */
static void demo_blend(void)
{
	struct g2d_surface fg = surface(G2D_PIXFMT_ARGB8888, 64, 48);
	struct g2d_surface bg = surface(G2D_PIXFMT_ARGB8888, 64, 48);
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 64, 48);
	struct g2d_rect all = { 0, 0, 64, 48 };
	struct g2d_blend b = {
		.mode = G2D_BLEND_SRC_OVER,
		.fg_alpha_mode = G2D_ALPHA_GLOBAL,
		.fg_alpha = 128,
		.bg_alpha_mode = G2D_ALPHA_PIXEL,
	};
	int ret;

	for (int i = 0; i < 64 * 48; i++) {
		((uint32_t *)fg.plane[0])[i] = 0xffff0000;
		((uint32_t *)bg.plane[0])[i] = 0xff0000ff;
	}
	flush(&fg);
	flush(&bg);

	ret = g2d_blend(g2d, &fg, &all, &bg, &all, &d, &all, &b, 0);
	printk("[blend] src-over, layer alpha 128      = %s: %08x, %s\n", err(ret), *px32(&d, 5, 5),
	       verdict(near(*px32(&d, 5, 5), 0xff800080, 3)));

	/* the pixels' own alpha: a foreground of alpha 64 (a quarter) */
	for (int i = 0; i < 64 * 48; i++) {
		((uint32_t *)fg.plane[0])[i] = 0x40ff0000;
	}
	flush(&fg);
	b.fg_alpha_mode = G2D_ALPHA_PIXEL;
	ret = g2d_blend(g2d, &fg, &all, &bg, &all, &d, &all, &b, 0);
	printk("[blend] src-over, pixel alpha 64       = %s: %08x\n", err(ret), *px32(&d, 5, 5));

	/* a different Porter-Duff mode: G2D_BLEND_SRC replaces the background */
	b.mode = G2D_BLEND_SRC;
	b.fg_alpha_mode = G2D_ALPHA_GLOBAL;
	b.fg_alpha = 255;
	ret = g2d_blend(g2d, &fg, &all, &bg, &all, &d, &all, &b, 0);
	printk("[blend] G2D_BLEND_SRC                  = %s: %08x\n", err(ret), *px32(&d, 5, 5));

	release(&fg);
	release(&bg);
	release(&d);
}

/* g2d_submit and g2d_get_capabilities' queue: operations are queued and complete in order, the
 * callback runs in the driver's thread
 */
static K_SEM_DEFINE(done_sem, 0, 64);
static volatile int completed, failed;
static volatile int order_ok = 1, last_tag = -1;

static void on_done(const struct device *dev, const struct g2d_op *op, int status, void *user_data)
{
	int tag = (int)(intptr_t)user_data;

	if (status != 0) {
		failed++;
	}
	if (tag != last_tag + 1) {
		order_ok = 0;
	}
	last_tag = tag;
	completed++;
	k_sem_give(&done_sem);
}

static void demo_submit(void)
{
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 512, 384);
	struct g2d_op op = {
		.type = G2D_OP_FILL,
		.dst = d,
		.dst_rect = { 0, 0, 512, 384 },
		.callback = on_done,
	};
	int queued = 0, full = 0;

	/* more operations than the queue holds, without waiting in between */
	for (int i = 0; i < 12; i++) {
		int ret;

		op.color = 0xff000000 | (i * 20);
		op.user_data = (void *)(intptr_t)queued;
		ret = g2d_submit(g2d, &op);
		if (ret == 0) {
			queued++;
		} else if (ret == -ENOMEM) {
			full++;
		}
	}
	printk("[submit] 12 fills of 512x384 submitted: %d queued, %d refused with -ENOMEM\n", queued, full);

	for (int i = 0; i < queued; i++) {
		k_sem_take(&done_sem, K_SECONDS(2));
	}
	printk("[submit] %d callbacks, %d failed, in submission order: %s; last pixel %08x\n", completed,
	       failed, order_ok ? "yes" : "NO", *px32(&d, 100, 100));
	release(&d);
}

/* g2d_run: submit and wait. A timeout shorter than the operation returns -EAGAIN, the operation
 * still finishes.
 */
static void demo_run(void)
{
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 1024, 768);
	struct g2d_op op = {
		.type = G2D_OP_FILL,
		.color = 0xff112233,
		.dst = d,
		.dst_rect = { 0, 0, 1024, 768 },
	};
	int64_t t0;
	int ret;

	t0 = k_uptime_ticks();
	ret = g2d_run(g2d, &op, K_SECONDS(1));
	printk("[run] fill 1024x768, wait up to 1 s     = %s, %lld us, pixel %08x\n", err(ret),
	       k_ticks_to_us_near64(k_uptime_ticks() - t0), *px32(&d, 500, 500));

	ret = g2d_run(g2d, &op, K_NO_WAIT);
	printk("[run] the same with K_NO_WAIT           = %s\n", err(ret));
	k_msleep(50);
	release(&d);
}

/* what the driver refuses */
static void demo_errors(void)
{
	struct g2d_surface rgb = surface(G2D_PIXFMT_ARGB8888, 64, 48);
	struct g2d_surface yuv = { .format = G2D_PIXFMT_NV12, .width = 64, .height = 48 };
	struct g2d_rect all = { 0, 0, 64, 48 };
	struct g2d_rect outside = { 40, 40, 64, 48 };
	struct g2d_rect empty = { 0, 0, 0, 0 };
	struct g2d_rect small = { 0, 0, 32, 32 };
	int ret;

	ret = g2d_fill(g2d, &rgb, &outside, 0xffffffff);
	printk("[error] rectangle outside the surface   = %s\n", err(ret));
	ret = g2d_fill(g2d, &rgb, &empty, 0xffffffff);
	printk("[error] empty rectangle                 = %s\n", err(ret));
	ret = g2d_fill(g2d, &yuv, &all, 0xffffffff);
	printk("[error] destination in NV12             = %s\n", err(ret));
	ret = g2d_blit(g2d, &rgb, &all, &rgb, &small, G2D_ROTATE_90, 0);
	printk("[error] rotation to a different size    = %s\n", err(ret));
	rgb.plane[0] = NULL;
	ret = g2d_fill(g2d, &rgb, &all, 0xffffffff);
	printk("[error] surface without a buffer        = %s\n", err(ret));
}

/* the G2D against the CPU filling a 1024x768 buffer, which is a full screen */
static void demo_speed(void)
{
	struct g2d_surface d = surface(G2D_PIXFMT_ARGB8888, 1024, 768);
	struct g2d_surface s = surface(G2D_PIXFMT_ARGB8888, 1024, 768);
	struct g2d_rect all = { 0, 0, 1024, 768 };
	size_t size = 1024 * 768 * 4;
	int64_t t0;
	int ret;

	t0 = k_uptime_ticks();
	for (size_t i = 0; i < size / 4; i++) {
		((uint32_t *)d.plane[0])[i] = 0xff445566;
	}
	sys_cache_data_flush_range(d.plane[0], size);
	printk("[speed] CPU fill 1024x768               : %lld us\n", k_ticks_to_us_near64(k_uptime_ticks() - t0));

	t0 = k_uptime_ticks();
	ret = g2d_fill(g2d, &d, &all, 0xff445566);
	printk("[speed] g2d_fill 1024x768               = %s: %lld us\n", err(ret),
	       k_ticks_to_us_near64(k_uptime_ticks() - t0));

	t0 = k_uptime_ticks();
	memcpy(s.plane[0], d.plane[0], size);
	sys_cache_data_flush_range(s.plane[0], size);
	printk("[speed] CPU copy 1024x768               : %lld us\n", k_ticks_to_us_near64(k_uptime_ticks() - t0));

	t0 = k_uptime_ticks();
	ret = g2d_blit(g2d, &s, &all, &d, &all, G2D_ROTATE_0, 0);
	printk("[speed] g2d_blit 1024x768               = %s: %lld us\n", err(ret),
	       k_ticks_to_us_near64(k_uptime_ticks() - t0));

	release(&s);
	release(&d);
}

/* make a picture with the G2D and show it. The frame buffer plane of the display is ARGB8888
 * and can be written in a window of at most 400x400 pixels.
 */
static void demo_show(void)
{
	const struct device *disp = DEVICE_DT_GET(DT_CHOSEN(zephyr_display));
	struct g2d_surface scene = surface(G2D_PIXFMT_ARGB8888, 320, 240);
	struct g2d_surface bar = surface(G2D_PIXFMT_ARGB8888, 160, 32);
	struct g2d_surface tall = surface(G2D_PIXFMT_ARGB8888, 32, 160);
	struct g2d_rect all = { 0, 0, 320, 240 };
	struct g2d_blend b = { .mode = G2D_BLEND_SRC_OVER, .fg_alpha_mode = G2D_ALPHA_GLOBAL,
			       .fg_alpha = 160, .bg_alpha_mode = G2D_ALPHA_PIXEL };

	if (!device_is_ready(disp)) {
		printk("[show] no display\n");
		return;
	}

	/* a dark background, then three bars, the last one blended over the others */
	g2d_fill(g2d, &scene, &all, 0xff102030);
	g2d_fill(g2d, &scene, &(struct g2d_rect){ 20, 20, 120, 80 }, 0xffe04040);
	g2d_fill(g2d, &scene, &(struct g2d_rect){ 100, 70, 120, 80 }, 0xff40e040);
	g2d_fill(g2d, &scene, &(struct g2d_rect){ 180, 120, 120, 80 }, 0xff4040e0);

	g2d_fill(g2d, &bar, &(struct g2d_rect){ 0, 0, 160, 32 }, 0xffffffff);
	g2d_blend(g2d, &bar, &(struct g2d_rect){ 0, 0, 160, 32 }, &scene,
		  &(struct g2d_rect){ 80, 40, 160, 32 }, &scene, &(struct g2d_rect){ 80, 40, 160, 32 }, &b, 0);

	/* the bar turned to stand up, put over the right side */
	g2d_blit(g2d, &bar, &(struct g2d_rect){ 0, 0, 160, 32 }, &tall, &(struct g2d_rect){ 0, 0, 32, 160 },
		 G2D_ROTATE_90, 0);
	g2d_blend(g2d, &tall, &(struct g2d_rect){ 0, 0, 32, 160 }, &scene,
		  &(struct g2d_rect){ 260, 40, 32, 160 }, &scene, &(struct g2d_rect){ 260, 40, 32, 160 }, &b, 0);

	struct display_buffer_descriptor desc = {
		.buf_size = 320 * 240 * 4,
		.width = 320,
		.height = 240,
		.pitch = 320,
	};
	int ret = display_write(disp, 100, 100, &desc, scene.plane[0]);

	sys_cache_data_flush_range(scene.plane[0], desc.buf_size);
	display_blanking_off(disp);
	printk("[show] display_write 320x240 at (100,100) = %s\n", err(ret));

	release(&scene);
	release(&bar);
	release(&tall);
}

int main(void)
{
	if (!device_is_ready(g2d)) {
		printk("g2d not ready\n");
		return 0;
	}

	demo_capabilities();
	demo_fill();
	demo_blit();
	demo_rotate();
	demo_yuv();
	demo_blend();
	demo_submit();
	demo_run();
	demo_errors();
	demo_speed();
	demo_show();

	printk("g2d_api done\n");
	return 0;
}
```

### Building and running

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/g2d-api g2d_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-g2d/build.cast" data-speed="6"></div>

See [Building and running](../zephyr-build-run.md) for how to download and run. The complete output on the UART1 console:

```text
[caps] g2d_get_capabilities = 0
[caps] source formats 0xffff, destination formats 0xfff (bit n = enum g2d_format n)
[caps] operations 0x7 (fill, blit, blend), up to 8192x8192 pixels
[caps] rotation needs 4 byte aligned addresses and 8 byte aligned pitch, queue depth 8
[fill] ARGB8888 64x48 at (16,8)        = 0: inside ff3366cc, outside 00000000, ok
[fill] RGB565 64x48 at (16,8)          = 0: inside 3339 (0xff3366cc is 3339), ok
[blit] copy 80x60 to (30,20)           = 0: ok
[blit] scale 64x48 to 128x96           = 0: corner ff000080 -> ff000080
[blit] ARGB8888 to RGB565              = 0: ff643280 -> 6190 (wanted 6190), ok
[rotate] flip horizontal 64x48 -> 64x48 = 0: ok
[rotate] flip vertical   64x48 -> 64x48 = 0: ok
[rotate] rotate 90       64x48 -> 48x64 = 0: ok
[rotate] rotate 180      64x48 -> 64x48 = 0: ok
[rotate] rotate 270      64x48 -> 48x64 = 0: ok
[yuv] NV12 (81, 90, 240) to ARGB8888   = 0: fffe0000, ok
[yuv] same data, full range, BT.709    = 0: fff11300
[blend] src-over, layer alpha 128      = 0: ff80007f, ok
[blend] src-over, pixel alpha 64       = 0: ff4100be
[blend] G2D_BLEND_SRC                  = 0: ffff0000
[submit] 12 fills of 512x384 submitted: 7 queued, 5 refused with -ENOMEM
[submit] 7 callbacks, 0 failed, in submission order: yes; last pixel ff000078
[run] fill 1024x768, wait up to 1 s     = 0, 5700 us, pixel ff112233
[run] the same with K_NO_WAIT           = -EAGAIN
[error] rectangle outside the surface   = -EINVAL
[error] empty rectangle                 = -EINVAL
[error] destination in NV12             = -EINVAL
[error] rotation to a different size    = -EINVAL
[error] surface without a buffer        = -EINVAL
[speed] CPU fill 1024x768               : 11300 us
[speed] g2d_fill 1024x768               = 0: 5700 us
[speed] CPU copy 1024x768               : 13400 us
[speed] g2d_blit 1024x768               = 0: 10900 us
[show] display_write 320x240 at (100,100) = 0
g2d_api done
```

The driver's own test is `samples/drivers/g2d`, which does the same per-pixel checks for every format, rotation, YUV source and blend mode.
