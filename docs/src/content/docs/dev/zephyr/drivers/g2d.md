---
title: "G2D 2D 加速器"
---

G2D 是 F101 的 2D 图形加速器：不经过 CPU，在内存缓冲区之间做矩形填充、搬运（可同时转换像素格式、缩放、旋转、翻转）和 Alpha 混合。Zephyr 里把它做成 `g2d` 设备，接口是 `<zephyr/drivers/g2d.h>`，驱动在 `drivers/g2d/`。

操作先进队列，由驱动的线程一个个交给硬件，按提交的顺序完成。

| 项目 | 内容 |
| --- | --- |
| 操作 | 填充（`G2D_OP_FILL`）、搬运（`G2D_OP_BLIT`）、混合（`G2D_OP_BLEND`） |
| 像素格式（可写） | ARGB8888、ABGR8888、RGBA8888、BGRA8888、XRGB8888、XBGR8888、RGB888、BGR888、RGB565、BGR565、ARGB4444、ARGB1555 |
| 像素格式（只读） | 上面所有，加 NV12、NV21、I420、YUYV |
| 最大尺寸 | 8192×8192 |
| 队列深度 | 设备树 `queue-depth`，默认 8 |
| 缓存 | 驱动在操作前清（clean）源缓冲区的数据缓存、操作后使目的缓冲区的缓存失效（invalidate），除非带 `G2D_FLAG_NO_CACHE_OPS` |
| 限制 | 目的格式不能是 YUV；旋转要求源和目的同格式、同尺寸（转后）、地址 4 字节对齐、目的行距 8 字节对齐；混合的背景必须是 RGB 且和目的区域一样大 |

## 设备树

| 文件 | 作用 |
| --- | --- |
| `dts/bindings/g2d/allwinner,sunxi-g2d.yaml` | 绑定 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 设备树：`g2d` 节点，默认 `disabled` |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts` | 板级设备树：把 `g2d` 改成 `okay` |

### SoC 设备树：sun252i_f101.dtsi

```c
g2d: g2d@5410000 {
	/* 匹配驱动 g2d_sunxi.c 里的 DT_DRV_COMPAT allwinner_sunxi_g2d */
	compatible = "allwinner,sunxi-g2d";

	/* 寄存器窗口：基址 0x05410000，长度 0x40000 */
	reg = <0x05410000 0x40000>;

	/* 中断：PLIC 的 111 号，优先级 1 */
	interrupts = <111 1>;
	interrupt-parent = <&plic>;

	/* 三个时钟门：模块时钟、总线时钟、MBUS 时钟，顺序和 clock-names 对应 */
	clocks = <&cctl CLK_G2D>, <&cctl CLK_BUS_G2D>, <&cctl CLK_BUS_G2D_M>;
	clock-names = "mod", "bus", "mbus";
	resets = <&rctl RST_BUS_G2D>;

	/* 驱动自己设模块时钟：CCU 的基址，和模块时钟寄存器的偏移。
	 * 时钟源选 PLL_PERI_2X，分频按 clock-frequency 算 */
	ccu-base = <0x02001000>;
	mod-clk-reg = <0x630>;
	clock-frequency = <300000000>;

	status = "disabled";
};
```

### 板级设备树：yuzukineko.dts

```c
/* 2D 图形加速器 */
&g2d {
	status = "okay";
};
```

### 绑定：allwinner,sunxi-g2d.yaml

| 属性 | 必填 | 含义 |
| --- | --- | --- |
| `reg`、`interrupts` | 是 | 寄存器窗口、中断 |
| `clocks`、`clock-names` | 是 | 三个时钟门：`mod`、`bus`、`mbus`，按这个顺序 |
| `resets` | 是 | 总线复位 |
| `ccu-base` | 是 | CCU 的基址 |
| `mod-clk-reg` | 是 | G2D 模块时钟寄存器在 CCU 里的偏移（选择 26:24、分频 4:0、门控 31）；驱动把时钟源设成 PLL_PERI_2X，分频按 `clock-frequency` 算 |
| `clock-frequency` | 否，300000000 | 模块时钟，单位 Hz |
| `queue-depth` | 否，8 | 队列里可以排几个操作 |

## Kconfig

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `CONFIG_G2D` | 应用里设为 `y` | 打开 G2D 接口和驱动 |
| `CONFIG_G2D_INIT_PRIORITY` | 41 | 驱动的初始化优先级（POST_KERNEL） |
| `CONFIG_G2D_SHELL` | `y`（依赖 `SHELL`） | shell 命令 `g2d info|fill|blit|blend|bench`，用来试加速器并和 CPU 比较 |
| `CONFIG_G2D_SUNXI` | `y`（依赖 `DT_HAS_ALLWINNER_SUNXI_G2D_ENABLED`） | 编译这个驱动，并选中 `CACHE_MANAGEMENT`。驱动的许可证是 GPL-2.0-or-later |
| `CONFIG_G2D_SUNXI_THREAD_STACK_SIZE` | 2048 | 驱动工作线程的栈大小 |
| `CONFIG_G2D_SUNXI_THREAD_PRIORITY` | 5 | 驱动工作线程的优先级 |
| `CONFIG_G2D_SUNXI_TIMEOUT_MS` | 100 | 一个操作最多允许运行多久（毫秒），超时返回 `-ETIMEDOUT` |

## 接口详解

演示在 `yuzukineko` 上运行。每个结果都和 CPU 对同样像素的计算结果比较，对了打印 `ok`。先看几个公共的写法：

```c
static const struct device *const g2d = DEVICE_DT_GET(DT_NODELABEL(g2d));
```

缓冲区由调用者提供。G2D 读写的是物理内存，所以缓冲区要对齐到缓存行（64 字节），CPU 写完要把缓存写回去（`sys_cache_data_flush_range`），G2D 才读得到。演示用下面这些辅助函数：

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

### struct g2d_surface 和 struct g2d_rect

```c
struct g2d_surface {
	enum g2d_format format;
	uint16_t width, height;		/* 缓冲区的像素尺寸 */
	void *plane[3];			/* 各平面的基址；NV12/NV21 用 2 个，I420 用 3 个 */
	uint32_t pitch[3];		/* 各平面的行距（字节）；0 表示紧密排列 */
};

struct g2d_rect {
	uint16_t x, y, width, height;	/* 像素 */
};
```

`g2d_surface` 描述整块缓冲区，`g2d_rect` 是缓冲区里要操作的区域。YUV 的区域不能切开色度采样：x 和宽度要是偶数，4:2:0 的 y 和高度也要是偶数。

### g2d_get_capabilities

```c
int g2d_get_capabilities(const struct device *dev, struct g2d_capabilities *caps);
```

读设备的能力：能读、能写的像素格式（每一位对应 `enum g2d_format` 的一个值）、支持的操作、最大尺寸、旋转的对齐要求和队列深度。

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

返回格式的第一个平面每个像素占几个字节；平面格式（NV12 等）返回 0。上面的 `surface()` 用它算缓冲区大小。

### g2d_fill

```c
int g2d_fill(const struct device *dev, const struct g2d_surface *dst,
             const struct g2d_rect *dst_rect, uint32_t color);
```

用一种颜色填充目的缓冲区的一个矩形，等操作完成才返回。颜色永远是 ARGB8888，目的是别的格式时由驱动转换。

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

把源矩形搬到目的矩形，等完成才返回。源和目的矩形大小不同就缩放；格式不同就转换；`rotation` 和 `flags` 里的 `G2D_FLIP_H`、`G2D_FLIP_V` 做旋转和翻转（先旋转后翻转）。

#### 示例：复制、缩放、转换格式

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

#### 示例：旋转和翻转

源图四个角各有一种颜色，检查旋转后它们落到的位置。90 度和 270 度旋转的目的缓冲区是源的宽高互换。旋转要求源和目的同格式，目的行距 8 字节对齐，缓冲区地址 4 字节对齐。

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

#### 示例：YUV 源转 RGB

NV12 的两个平面各给一个基址和行距。默认是 BT.601、限幅（16…235）；`G2D_FLAG_YUV_FULL_RANGE` 用全幅，`G2D_FLAG_YUV_BT709` 用 BT.709。Y 81、U 90、V 240 在默认设置下是红色。

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

把前景叠在背景上，结果写到目的；目的可以就是背景。`struct g2d_blend` 选混合模式（Porter-Duff：`G2D_BLEND_SRC_OVER`、`SRC`、`DST_OVER`、`SRC_IN` 等 12 种）和前后景的 Alpha 来源：

| `g2d_alpha_mode` | Alpha 的取法 |
| --- | --- |
| `G2D_ALPHA_PIXEL` | 像素自己的 Alpha 通道 |
| `G2D_ALPHA_GLOBAL` | 整层统一的 `fg_alpha` / `bg_alpha`（0…255） |
| `G2D_ALPHA_MIXED` | 像素的 Alpha 乘以整层的 Alpha |

前景和目的区域大小不同时前景被缩放；背景必须是 RGB，并且和目的区域一样大。

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

红色前景以整层 Alpha 128 盖在不透明蓝色上，得到一半红一半蓝；像素 Alpha 64 的红色约占四分之一。

### g2d_submit

```c
int g2d_submit(const struct device *dev, const struct g2d_op *op);
```

把一个操作放进队列，不等它完成。`struct g2d_op` 描述操作的全部（类型、缓冲区、矩形、颜色、混合参数、回调），驱动会复制它，但操作用到的缓冲区要保持有效到操作完成。

| 返回 | 含义 |
| --- | --- |
| 0 | 已入队 |
| `-EINVAL` | 设备不支持这些参数（格式、矩形、对齐等） |
| `-ENOMEM` | 队列满了 |

完成后驱动在自己的线程里调用 `op->callback`，`status` 是 0 或负的错误码；回调里不能阻塞。操作按提交的顺序完成。

演示一次提交 12 个填充，队列装得下 7 个，其余 5 个被拒绝。

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

提交一个操作并等它完成。`g2d_fill`、`g2d_blit`、`g2d_blend` 就是它的包装。超时返回 `-EAGAIN`，操作本身仍会继续执行完。

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

### 驱动拒绝的参数

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

### 和 CPU 比速度

填充和复制一整屏（1024×768 ARGB8888，3 MiB）：

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

CPU 的耗时包含把结果写回缓存。G2D 的优势是 CPU 在这段时间里可以做别的事（用 `g2d_submit`）。

### 把结果显示出来

用 G2D 在一个 320×240 的缓冲区里画几个色块，把一条白色半透明的条混合上去，再把这条转 90 度混到右侧，最后用显示接口写到屏幕的 (100, 100)。屏幕的帧缓冲层是 ARGB8888，写入窗口最大 400×400。

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

## 完整演示程序

上面所有示例和日志都来自这一个程序。建一个目录，放进下面的文件，就可以像其他 Zephyr 应用一样编译。

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

`CONFIG_COMMON_LIBC_MALLOC_ARENA_SIZE=-1` 让 libc 的堆占用镜像之后的全部 RAM，演示里 1024×768 的缓冲区都从这里分配；把一个大堆放进系统堆（`CONFIG_HEAP_MEM_POOL_SIZE`）会让它成为 `zephyr.bin` 的一部分。

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

### 编译和运行

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/g2d-api g2d_api
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-g2d/build.cast" data-speed="6"></div>

下载运行的方法见[编译与运行](../zephyr-build-run.md)。控制台 UART1 上的完整输出：

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

驱动自己的测试是 `samples/drivers/g2d`，对每种格式、旋转、YUV 源和混合模式做同样的逐像素检查。
