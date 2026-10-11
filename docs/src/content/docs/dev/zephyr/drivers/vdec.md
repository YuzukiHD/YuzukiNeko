---
title: "视频引擎 vdec"
---

F101 片上的视频引擎（video engine）可以用硬件解码 <strong>JPEG</strong>、<strong>PNG</strong> 和 <strong>H.264</strong>。Zephyr 里把它做成一个设备，接口是 `<zephyr/drivers/vdec.h>`，驱动在 `drivers/vdec/sunxi/`。

| 编码 | 用法 | 输出格式 |
| --- | --- | --- |
| JPEG | 单张图片，`vdec_decode_image()` | `VDEC_FORMAT_NV12` 或 `VDEC_FORMAT_NV21` |
| PNG | 单张图片，`vdec_decode_image()` | `VDEC_FORMAT_RGBA8888` |
| MJPEG | 一连串 JPEG，`vdec_stream_*()`，`codec` 用 `VDEC_CODEC_JPEG` | `VDEC_FORMAT_NV12` 或 `VDEC_FORMAT_NV21` |
| H.264 | 视频流，`vdec_stream_*()` | `VDEC_FORMAT_NV12` 或 `VDEC_FORMAT_NV21` |

输出格式的含义：

| 格式 | 内存布局 |
| --- | --- |
| `VDEC_FORMAT_NV12` | 8 位亮度平面，后面接半分辨率的 Cb/Cr 交错平面 |
| `VDEC_FORMAT_NV21` | 同上，但交错顺序是 Cr/Cb |
| `VDEC_FORMAT_RGBA8888` | 32 位小端字，R 在最高字节、A 在最低字节（内存里的字节顺序是 A、B、G、R） |

## 设备树

视频引擎涉及三个文件，从下到上依次是：

| 文件 | 作用 |
| --- | --- |
| `dts/bindings/video/allwinner,sunxi-ve.yaml` | 绑定：规定 `allwinner,sunxi-ve` 节点必须有哪些属性 |
| `dts/riscv/allwinner/sun252i_f101.dtsi` | SoC 的设备树：定义 `ve` 节点和它的寄存器、中断、时钟、复位，默认 `disabled` |
| `boards/yuzukihd/yuzukineko/yuzukineko.dts`、`boards/yuzukihd/f101_evb/f101_evb.dts` | 板级设备树：把 `ve` 改成 `okay` |

`ve` 节点不启用，`CONFIG_VDEC_SUNXI` 就不会被选中（它依赖 `DT_HAS_ALLWINNER_SUNXI_VE_ENABLED`），驱动不会编进去。

### SoC 设备树：sun252i_f101.dtsi

下面是 `sun252i_f101.dtsi` 里的 `ve` 节点，说明写在注释里（这些中文注释是加的，节点内容和源文件一致）：

```c
/* 在 soc 节点下，464–474 行 */
ve: video-codec@1c0e000 {
	/* 标签 ve：应用里用 DT_NODELABEL(ve) 取这个设备 */

	/* 匹配驱动 vdec_sunxi.c 里的 DT_DRV_COMPAT allwinner_sunxi_ve */
	compatible = "allwinner,sunxi-ve";

	/* 寄存器窗口：基址 0x01c0e000，长度 0x1000（4 KiB） */
	reg = <0x01c0e000 0x1000>;

	/* 中断：PLIC 的 66 号，优先级 1。PLIC 的 #interrupt-cells 是 2，两个格子依次是 irq、priority */
	interrupts = <66 1>;
	interrupt-parent = <&plic>;

	/* 三个时钟，顺序和 clock-names 一一对应：模块时钟、总线时钟、MBUS 时钟 */
	clocks = <&cctl CLK_VE>, <&cctl CLK_BUS_VE>, <&cctl CLK_BUS_VE_M>;
	clock-names = "mod", "bus", "mbus";

	/* 总线复位 */
	resets = <&rctl RST_BUS_VE>;

	/* 模块时钟寄存器在 CCU 里的偏移：时钟源选择、分频和门控都在这个寄存器 */
	clock-reg = <0x690>;

	/* 系统控制块的基址，里面有把共享 SRAM 交给视频引擎的控制位 */
	sram-ctrl-reg = <0x03000000>;

	/* 默认关闭，由板级打开 */
	status = "disabled";
};
```

`CLK_VE` 这些宏定义在 `include/zephyr/dt-bindings/clock/sun252i-f101-ccu.h`，由 `ALLWINNER_CCU_ID(base, reg, bit)` 把“哪个 CCU、寄存器偏移、位”打包成一个整数，打包方式是 `(base << 20) | (reg << 8) | bit`：

| 宏 | CCU | 寄存器偏移 | 位 |
| --- | --- | --- | --- |
| `CLK_VE` | `ALLWINNER_CCU_MAIN` | `0x0690` | 31 |
| `CLK_BUS_VE` | `ALLWINNER_CCU_MAIN` | `0x069c` | 0 |
| `RST_BUS_VE` | `ALLWINNER_CCU_MAIN` | `0x069c` | 16 |
| `CLK_BUS_VE_M` | `ALLWINNER_CCU_MAIN` | `0x0804` | 1 |

### 板级设备树：yuzukineko.dts 与 f101_evb.dts

两个板级都只做一件事，把节点打开。`yuzukineko.dts` 第 409–412 行：

```c
/* Video engine: hardware JPEG, PNG and H.264 decoder */
&ve {
	status = "okay";
};
```

`f101_evb.dts` 第 278–281 行写法完全一样。`&ve` 是按标签引用 SoC 设备树里的 `ve` 节点，`status = "okay"` 把 `disabled` 覆盖掉，其余属性继承自 dtsi。

在自己的板子或应用里使用，同样的覆盖写在应用的 `boards/<板级>.overlay` 里即可：

```c
&ve {
	status = "okay";
};
```

### 绑定：allwinner,sunxi-ve.yaml

绑定文件规定了节点必须有哪些属性，缺一个编译就会报错：

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

| 属性 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `reg` | 来自 `base.yaml` | 是 | 寄存器窗口 |
| `interrupts` | 来自 `base.yaml` | 是 | 中断 |
| `clocks`、`clock-names` | 来自 `base.yaml` | 是 | 三个时钟及名字 |
| `resets` | phandle 数组 | 是 | 复位 |
| `clock-reg` | int | 是 | 模块时钟寄存器在主 CCU 里的偏移 |
| `sram-ctrl-reg` | int | 是 | 系统控制块基址，里面有 SRAM 归属位 |

在应用里取设备：

```c
const struct device *dev = DEVICE_DT_GET(DT_NODELABEL(ve));
```

## Kconfig

应用的 `prj.conf` 里打开 `CONFIG_VDEC=y`。视频引擎驱动 `CONFIG_VDEC_SUNXI` 在设备树节点启用时默认打开，并且要求 `CONFIG_FPU`。播放视频的应用一般还需要 `CONFIG_FPU_SHARING`。

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `CONFIG_VDEC` | n | 总开关 |
| `CONFIG_VDEC_INIT_PRIORITY` | 90 | 驱动的初始化优先级 |
| `CONFIG_VDEC_SUNXI` | y | 视频引擎驱动。依赖设备树里 `ve` 启用，并依赖 `CONFIG_FPU` |
| `CONFIG_VDEC_SUNXI_JPEG` | y | JPEG 解码 |
| `CONFIG_VDEC_SUNXI_PNG` | y | PNG 解码 |
| `CONFIG_VDEC_SUNXI_H264` | y | H.264 解码（只支持帧图像，不支持场编码和宏块自适应帧场编码） |
| `CONFIG_VDEC_SUNXI_RVV` | y | 用向量扩展加速 CPU 一侧的字节循环：PNG 的滤波、校验和像素转换，NV21 的色度交换，H.264 起始码查找。依赖 `CONFIG_SUN252I_F101_RVV`，引擎解码本身不受影响 |
| `CONFIG_VDEC_SUNXI_H264_DIRECT_NV12` | n | 实验性：H.264 由引擎通过第二路输出直接写线性 NV12，省掉单独的转换。依赖 `CONFIG_VDEC_SUNXI_H264` |
| `CONFIG_VDEC_SUNXI_H264_DIRECT_CHECK` | n | 调试用：对流的前几张图再做一次转换，并打印两张线性图有多少字节不同。依赖上一项 |
| `CONFIG_VDEC_SUNXI_MEM_TRACE` | n | 调试用：打印每一次图片和工作缓冲的分配 |
| `CONFIG_VDEC_SUNXI_CLOCK_MHZ` | 300 | 模块时钟的目标频率（MHz），实际取时钟分频器能产生的、不超过源频率的最接近值 |
| `CONFIG_VDEC_SUNXI_STREAM_BUFFER_KB` | 512 | 压缩数据缓冲区大小（KiB）。一张 JPEG 或 PNG 必须放得下；应用打开流时可以要更大的 |
| `CONFIG_VDEC_SUNXI_MAX_MEMORY_KB` | 12288 | 一个解码器可用的内存上限（KiB），包括图片和流缓冲，决定一个流能拿到几个帧缓冲（不会少于 H.264 参考帧数加 3） |
| `CONFIG_VDEC_SUNXI_MEM_ALIGN` | 4096 | 交给视频引擎的每块缓冲的对齐 |
| `CONFIG_VDEC_SUNXI_LOG_LEVEL` | 3 | 驱动的日志级别 |

:::note
驱动全部是 C 源码，不依赖预编译库：`ve_hw.c` 管视频引擎（时钟、复位、中断、图片转换），`ve_pool.c` 和 `ve_stream.c` 管图片和压缩数据，`ve_session.c` 把它们接到各个解码器（`ve_jpeg*.c`、`ve_h264*.c`、`ve_png.c`）。JPEG 的标记由软件解析，寄存器由 `ve_jpeg_hw.c` 配置；H.264 的语法解析、参考帧管理和引擎配置在 `ve_h264*.c`；PNG 完全由软件解码（全部颜色类型和位深、tRNS、Adam7）。
:::

## 接口详解

`<zephyr/drivers/vdec.h>` 一共 7 个函数。下面每个函数按“原型 → 参数 → 返回值 → 说明 → 示例代码 → 日志”写。<strong>日志是演示程序在 `yuzukineko` 上跑出来的真实输出</strong>，演示程序的完整源码在文末的 [完整演示程序](#完整演示程序)。

示例里的 `err()`、`show_frame()`、`luma_crc()` 是演示程序里的小工具，源码在文末。

演示程序的测试数据：JPEG、PNG 和 H.264 用的是 `samples/drivers/vdec/` 里三个示例内嵌的图片（都是 320×240）；MJPEG 用 ffmpeg 生成了 5 张 320×240 的 JPEG。

:::caution
解码失败时驱动会打印 `<err>` 日志。日志是延迟输出的，会和演示程序的 `printk` 输出交错，所以下面贴的日志只保留演示程序自己打印的行，驱动日志见 [驱动日志](#驱动日志)。
:::

### vdec_decode_image

解码一张 JPEG 或 PNG。

```c
int vdec_decode_image(const struct device *dev, enum vdec_codec codec,
                      const void *data, size_t len, enum vdec_format format,
                      struct vdec_frame *frame);
```

| 参数 | 说明 |
| --- | --- |
| `dev` | 视频引擎设备，`DEVICE_DT_GET(DT_NODELABEL(ve))` |
| `codec` | `VDEC_CODEC_JPEG` 或 `VDEC_CODEC_PNG` |
| `data`、`len` | 压缩后的整张图片。返回后驱动不再引用，调用者可以立刻释放或复用这块内存 |
| `format` | 想要的帧格式。JPEG 用 `VDEC_FORMAT_NV12` 或 `VDEC_FORMAT_NV21`，PNG 用 `VDEC_FORMAT_RGBA8888` |
| `frame` | 输出，成功时被填好 |

返回值，下表最后一栏是演示程序在板子上得到的结果：

| 返回值 | 头文件注释里的含义 | 示例中的情形 |
| --- | --- | --- |
| `0` | 成功 | JPEG→NV12、JPEG→NV21、PNG→RGBA8888 |
| `-ENOTSUP` | 编码、格式或图片不支持 | PNG→NV12；JPEG→RGBA8888；`VDEC_CODEC_H264` 传给本函数 |
| `-EINVAL` | 参数错误，或图片已损坏 | 16 个 `0x55` 当 JPEG |
| `-ENOMEM` | 图片放不进解码器内存 | 没有触发 |
| `-EIO` | 硬件解码失败 | 只有半张的 JPEG |

要点：

- <strong>阻塞</strong>到解码完成。320×240 的 JPEG 约 2 ms，PNG 约 28 ms（PNG 由软件解码）。
- 成功之后，解码器被这一帧<strong>占用</strong>，直到 `vdec_frame_release()`。期间别的 `vdec_decode_image()` 和 `vdec_stream_open()` 都会等待。所以拿到帧、用完、释放，不要长期持有。
- 失败时不占用，不需要释放；出错后解码器可以继续用（演示里半张 JPEG 失败后，一张正常的 JPEG 立刻解码成功）。
- JPEG 和 PNG 帧的 `pts` 都是 `-1`（没有时间戳）。
- PNG 是 `RGBA8888`：`plane[0]` 是像素，`stride[0]` 是每行字节数（320×4=1280），`plane[1]` 是 NULL，`stride[1]` 为 0。内存里的字节顺序是 A、B、G、R。

#### 示例：JPEG

演示程序依次请求 NV21、NV12、NV21，把每个调用的返回值打印出来，验证两种格式都能解码。成功时再打印帧信息和亮度平面的 CRC，最后释放。

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

日志：

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

`format 2` 是 `VDEC_FORMAT_NV21`，`format 1` 是 `VDEC_FORMAT_NV12`，三次都成功。帧是 320×240，亮度和色度的 `stride` 都是 320，`pts` 为 -1。NV21 和 NV12 是同一张图，只是色度的字节顺序对调，所以三次的亮度 CRC 相同。

#### 示例：PNG

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

日志：

```text
[png] vdec_decode_image(RGBA8888) = 0, 28 ms
[png] frame: format 3, 320x240, stride 1280/0, pts -1
[png] first pixel bytes (A, B, G, R): ff ff ff ff
[png] vdec_frame_release done
```

`format 3` 是 `VDEC_FORMAT_RGBA8888`，`stride` 的第一项是 1280（320 像素 × 4 字节），第二项是 0。测试图的第一个像素四个字节全是 `ff`。

#### 示例：各种错误

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

日志：

```text
[error] PNG as NV12             = -ENOTSUP
[error] JPEG as RGBA8888        = -ENOTSUP
[error] H.264 to decode_image   = -ENOTSUP
[error] 16 bytes of 0x55 (JPEG) = -EINVAL
[error] half a JPEG             = -EIO
[error] a good JPEG afterwards  = 0
```

每种错误的返回值见上面的返回值表。最后一行说明出错之后解码器仍然可以使用。

### vdec_frame_release

归还一帧。

```c
void vdec_frame_release(const struct device *dev, struct vdec_frame *frame);
```

| 参数 | 说明 |
| --- | --- |
| `dev` | 视频引擎设备 |
| `frame` | 要归还的帧，必须是 `vdec_decode_image()` 或 `vdec_stream_get_frame()` 给出的 |

没有返回值。

- 对 `vdec_decode_image()` 的帧：释放后解码器才能再被使用。
- 对流里的帧：这张图片回到解码器的图片池。解码器只有几张图片，不释放就会让 `vdec_stream_get_frame()` 返回 `-EBUSY`。
- 释放后，`frame->plane[]` 指向的内存不再属于你，不能再读。
- 显示引擎或 2D 加速器还在读这一帧时不能释放。MP4 播放器的做法是“晚一帧再释放”。
- 每一帧只能释放一次。

#### 示例：解码单张图片后释放

解码一张 JPEG，释放，立刻再解码一次。两次返回的 `plane` 地址相同，说明解码器把同一块图片内存重新拿去用了，所以释放之后原来的指针不能再读：

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

日志：

```text
[release] first decode = 0, plane 0x4029f000
[release] vdec_frame_release done
[release] second decode = 0, plane 0x4029f000
[release] vdec_frame_release done
```

#### 示例：流里的帧

`holding_frames` 设成 2，只取帧、不释放，直到被挡住（`-EBUSY`）；再把拿着的帧全部释放，解码器就恢复可用：

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

日志：

```text
[hold] vdec_stream_open(holding_frames 2) = 0
[hold] 3 frames held, get_frame = -EBUSY
[hold] after releasing them, get_frame = -EAGAIN
[hold] vdec_stream_close done
```

`3 frames held, get_frame = -EBUSY` 是释放之前的状态；释放之后变成 `-EAGAIN`（要更多数据，因为这个函数没有再喂数据），不再是 `-EBUSY`。

### vdec_stream_open

打开一个解码流。

```c
int vdec_stream_open(const struct device *dev, const struct vdec_stream_config *config,
                     struct vdec_stream **stream);
```

| 参数 | 说明 |
| --- | --- |
| `dev` | 视频引擎设备 |
| `config` | 流的配置，字段见 [struct vdec_stream_config](#struct-vdec_stream_config) |
| `stream` | 输出，成功时得到流句柄 |

| 返回值 | 含义 |
| --- | --- |
| `0` | 成功 |
| `-ENOTSUP` | 编码或格式不支持：PNG 不能做流；H.264 流不能输出 RGBA8888 |
| `-EINVAL` | 参数不对：JPEG 流没有给 `width`、`height` |
| `-ENOMEM` | 内存不够 |

- 一个流<strong>独占解码器</strong>，到 `vdec_stream_close()` 才让出。期间其他流和 `vdec_decode_image()` 会等。
- H.264 流用 `VDEC_CODEC_H264`；motion JPEG（一连串 JPEG）用 `VDEC_CODEC_JPEG`，并且<strong>必须给出 `width`、`height`</strong>，因为引擎要提前知道图片大小。
- `buffer_size` 是压缩数据缓冲区，要装得下一次 `feed` 的最大一组 NAL；不确定就给 1 MiB（MP4 播放器就是这么做的），0 为默认值。
- `holding_frames` 决定应用能同时持有多少帧，见 `-EBUSY` 的示例。

#### 示例

下面的函数用同一个 `open_and_close()` 试了六种配置：三种正常的，三种有问题的。成功的流立刻关闭，避免占着解码器。

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

日志：

```text
[open] MJPEG 320x240                      = 0
[open] H.264                              = 0
[open] H.264, 1 MiB buffer, hold 2        = 0
[open] JPEG without width/height          = -EINVAL
[open] PNG as a stream                    = -ENOTSUP
[open] H.264 as RGBA8888                  = -ENOTSUP
```

- `JPEG without width/height`：JPEG 流没有给 `width`、`height`，返回 `-EINVAL`。
- `PNG as a stream`：PNG 不能作为流，返回 `-ENOTSUP`。
- `H.264 as RGBA8888`：H.264 流不能输出 RGBA8888，返回 `-ENOTSUP`。

### vdec_stream_feed

把压缩数据放进流的缓冲区。

```c
int vdec_stream_feed(const struct device *dev, struct vdec_stream *stream,
                     const void *data, size_t len, int64_t pts, size_t *consumed);
```

| 参数 | 说明 |
| --- | --- |
| `stream` | `vdec_stream_open()` 得到的句柄 |
| `data`、`len` | 压缩数据。H.264 必须是 <strong>Annex B</strong> 字节流，由完整的 NAL 单元组成；MJPEG 每次是<strong>一整张</strong> JPEG |
| `pts` | 这块数据的时间戳，原样带到对应的帧；没有就传 `-1` |
| `consumed` | 输出，实际收下的字节数 |

| 返回值 | 含义 |
| --- | --- |
| `0` | 至少收下了一个 NAL 单元 |
| `-EAGAIN` | 流缓冲区满了，先用 `vdec_stream_get_frame()` 取走帧 |
| `-EINVAL` | 数据里一个 NAL 单元都没有（长度为 0 也是） |

- 这个函数<strong>只存数据，不解码</strong>，解码在 `vdec_stream_get_frame()` 里进行。
- 收多少由 `consumed` 返回。`len` 可能放不下，没收完的部分要在取走帧之后接着喂。
- 演示程序里每次都是“全部收下”（`used` 等于 `len`）。
- MJPEG 的 `pts` 原样回到帧上（见日志：0、100、…、400）。H.264 逐块喂入时不是这样：日志里第一帧的 `pts` 是 1，而喂入时第一个切片块带的是 2，所以不要假设帧的 `pts` 等于刚喂入的那一块。

#### 示例

下面的函数试了三种输入：16 个 `0x55`（没有 NAL）、长度为 0、以及整段 H.264 码流（21745 字节）一次喂入。

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

日志：

```text
[feed] vdec_stream_open = 0
[feed] 16 bytes of 0x55        = -EINVAL, used 0
[feed] 0 bytes                 = -EINVAL, used 0
[feed] whole clip (21745 bytes) = 0, used 21745
[feed] vdec_stream_close done
```

- 没有 NAL 的数据和长度为 0 都返回 `-EINVAL`，`used` 为 0。
- 整段码流一次喂入，全部被收下（`used` 等于 `len`）。
- 逐块喂入的完整例子（把码流按起始码切成块，一块一个 `pts`）见 [vdec_stream_get_frame](#vdec_stream_get_frame) 一节的 `demo_stream_get_frame_h264()`；MJPEG 一次一张的例子见同一节的 `demo_stream_get_frame_mjpeg()`。

### vdec_stream_get_frame

取下一帧；解码在这里完成。

```c
int vdec_stream_get_frame(const struct device *dev, struct vdec_stream *stream,
                          struct vdec_frame *frame);
```

| 返回值 | 含义 | 应该怎么做 |
| --- | --- | --- |
| `0` | 拿到了一帧 | 显示或处理，然后 `vdec_frame_release()` |
| `-EAGAIN` | 数据不够 | 用 `vdec_stream_feed()` 喂数据；没有数据了就 `vdec_stream_flush()` |
| `-EBUSY` | 所有帧都被应用占着 | 释放一些帧，或者稍等 |
| `-ENODATA` | 已经 flush，并且帧全部取完 | 结束，关闭流 |
| `-EIO` | 硬件出错 | 关闭流 |

- 每次调用最多给出一帧。
- 解码器只持有几张图片，帧要及时 `vdec_frame_release()`，否则就会 `-EBUSY`。
- 取出的帧里 `pts` 是 `feed` 时给的时间戳，但 H.264 逐块喂入时和喂入的块不是一一对应，见 `vdec_stream_feed` 一节。

#### 示例：MJPEG

每张图喂进去，立刻 `get_frame` 取出一帧，`pts` 原样回来：

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

日志：

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

#### 示例：H.264 的完整循环

把 `open`、`feed`、`get_frame`、`flush`、`close` 串在一个循环里。循环的节奏由 `get_frame` 的返回值决定：`-EAGAIN` 时喂数据，数据喂完就 flush，拿到帧就校验 CRC 并释放，`-ENODATA` 时退出。码流按起始码 `00 00 00 01` 切块，`next_start_code()` 找下一个起始码的位置。

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

日志（前 12 次 `get_frame`，以及帧信息）：

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

前几行能看出节奏：打开之后 `get_frame` 先是 `-EAGAIN`；喂了 SPS（类型 7）、PPS（类型 8）、第一个切片（类型 1）之后，第一帧出来；之后大体是“喂一个块，出一帧”。第 2 块长 5650 字节，是按四字节起始码切出来的，里面还夹着用三字节起始码分隔的其他 NAL，这对解码没有影响。最后喂完 33 个块，flush，剩下的帧被取空。30 帧都通过了 CRC 校验（有错会打印 `bad crc`，日志里没有）。

#### 示例：-EBUSY

`holding_frames` 设成 2，然后只取帧、不释放：

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

日志：

```text
[hold] vdec_stream_open(holding_frames 2) = 0
[hold] 3 frames held, get_frame = -EBUSY
[hold] after releasing them, get_frame = -EAGAIN
[hold] vdec_stream_close done
```

拿到 3 帧才返回 `-EBUSY`（解码器的帧缓冲不会少于 3 张，所以 `holding_frames` 设成 2 也能多拿一帧）。释放之后恢复，见 [vdec_frame_release](#vdec_frame_release) 一节。

### vdec_stream_flush

告诉流“不会再有数据了”。

```c
int vdec_stream_flush(const struct device *dev, struct vdec_stream *stream);
```

| 返回值 | 含义 |
| --- | --- |
| `0` | 成功 |

- 调用之后，`vdec_stream_get_frame()` 会把解码器里还没吐出来的帧依次给出，最后返回 `-ENODATA`。
- 只需要调用一次。演示程序用 `flushed` 变量保证这一点。
- 头文件的说明是：flush 之后，解码器里还没吐出的帧才会交出来。不 flush，视频末尾的几帧就取不到。

#### 示例

MJPEG 流：先喂 3 张图，一张都不取，然后 flush，再把帧逐个取空，直到 `-ENODATA`：

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

日志：

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

flush 之后 `get_frame` 依次给出 3 帧（`pts` 为 0、100、200），再返回 `-ENODATA`。H.264 流里 flush 的位置（数据喂完后调用一次）见 `demo_stream_get_frame_h264()`，日志里的 `flush = 0 (after 33 NAL units)`。

### vdec_stream_close

结束一个流，让出解码器。

```c
void vdec_stream_close(const struct device *dev, struct vdec_stream *stream);
```

没有返回值。

- 调用前，这个流的<strong>所有帧都必须已经释放</strong>。
- 关闭后 `stream` 句柄作废，解码器可以被别的流和 `vdec_decode_image()` 使用。

#### 示例

打开 MJPEG 流，取一帧，释放，关闭；再打开一个 H.264 流，证明解码器已经让出：

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

日志：

```text
[close] open the MJPEG stream = 0
[close] get_frame = 0
[close] vdec_stream_close done
[close] open an H.264 stream afterwards = 0
[close] vdec_stream_close done
```

关闭之后，下一个流可以正常打开。

### struct vdec_stream_config

| 字段 | 说明 |
| --- | --- |
| `codec` | `VDEC_CODEC_H264`（流）、`VDEC_CODEC_JPEG`（motion JPEG） |
| `format` | 想要的帧格式。JPEG 只支持 `VDEC_FORMAT_NV12`；H.264 用 `VDEC_FORMAT_NV12` |
| `buffer_size` | 压缩数据缓冲区的字节数，要能装下一次 `feed` 的最大一组 NAL；0 为默认值 |
| `no_cache_ops` | CPU 不会读这些帧（只给显示引擎或 2D 加速器读）时设为 true，省掉缓存维护 |
| `holding_frames` | 应用同时持有的帧数；0 为默认的 3，`VDEC_HOLD_NONE` 为不持有。解码器会分配 2 张加上这个数量的图片。实际的帧缓冲数不会少于 3 张，所以设为 2 时，在 MJPEG 流上拿 3 帧不放才会 `-EBUSY` |
| `width`、`height` | 图片尺寸，只有 JPEG 流需要 |

### struct vdec_frame

| 字段 | 说明 |
| --- | --- |
| `format` | 帧格式 |
| `width`、`height` | 可见区域的像素尺寸 |
| `plane[2]` | 每个平面第一个可见像素的指针，没有用到的平面是 NULL |
| `stride[2]` | 每个平面相邻两行之间的字节数 |
| `pts` | `feed` 时给的时间戳 |
| `priv` | 驱动私有，不要碰。播放器用 `priv != NULL` 判断一个 `vdec_frame` 变量里有没有持有帧 |

### 帧格式

| 格式 | 值 | 内存布局 |
| --- | --- | --- |
| `VDEC_FORMAT_NV12` | 1 | 8 位亮度平面，后面接半分辨率的 Cb/Cr 交错平面 |
| `VDEC_FORMAT_NV21` | 2 | 同上，但交错顺序是 Cr/Cb |
| `VDEC_FORMAT_RGBA8888` | 3 | 32 位小端字，R 在最高字节、A 在最低字节（内存里的字节顺序是 A、B、G、R） |

## 驱动日志

驱动在出错时打印下面这些 `<err>` 级别的日志。正常解码不会打印 `<err>` 日志，不再有预编译库留下的 `cedarc` 日志。

| 日志 | 说明 |
| --- | --- |
| `vdec_sunxi: not a valid picture` | 输入的数据不是合法图片。演示程序里是 16 个 `0x55` 当 JPEG 的那一步 |
| `vdec_sunxi: decoding failed: 1` | 解码失败，数字是内部状态码。演示程序里是只有半张的 JPEG 那一步，调用返回 `-EIO` |
| `vdec_sunxi: not enough memory to decode`、`out of memory for N bytes` | 图片放不进解码器的内存预算，调用返回 `-ENOMEM`。演示程序没有触发 |
| `vdec_sunxi: stream buffer is full`、`the picture does not fit in the stream buffer` | 压缩数据缓冲放不下，见 `CONFIG_VDEC_SUNXI_STREAM_BUFFER_KB`。演示程序没有触发 |
| `vdec_sunxi: interrupt timeout: top …`（`<wrn>`） | 引擎一直没有产生中断。演示程序没有触发 |

这些日志是延迟输出的，会和演示程序的 `printk` 交错，这里只列出现的现象。前两行是在板子上跑演示程序时实际出现的，其余几行来自驱动源码。

## 示例

| 示例 | 路径 | 内容 |
| --- | --- | --- |
| JPEG | `samples/drivers/vdec/jpeg` | 解码内嵌的 JPEG 三次，打印耗时和各平面校验值，最后显示。`CONFIG_SAMPLE_VDEC_DUMP` 可在控制台导出 NV12 数据，用来和主机解码结果对比 |
| PNG | `samples/drivers/vdec/png` | 解码内嵌的 PNG，输出 RGBA8888，打印耗时和像素的 CRC（PNG 无损，应与主机解码结果一致），然后叠在黑底上显示 |
| H.264 | `samples/drivers/vdec/h264` | 解码内嵌的 H.264 片段，每一帧都和主机解码的 CRC32 对比（H.264 的解码过程是严格规定的，结果必须一致），并按片段的帧率显示 |
| H.264 播放器 | `samples/drivers/vdec/h264_player` | 播放 TF 卡上的 Annex B H.264 裸流（默认 `/SD:/badapple.h264`），按帧率显示，带统计叠加层 |
| MP4 播放器 | `samples/drivers/mp4_player` | 视频加声音，见 [MP4 播放器](../apps/mp4-player.md) |

编译示例（以 JPEG 为例）：

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/vdec-jpeg zephyr/samples/drivers/vdec/jpeg
```

<div class="asciinema-cast" data-src="assets/casts/zephyr/drivers-vdec/build.cast" data-speed="6"></div>

下载和运行的方法见 [编译与运行](../zephyr-build-run.md)。

## 在自己的应用里使用

1. `prj.conf`：`CONFIG_VDEC=y`、`CONFIG_FPU=y`、`CONFIG_FPU_SHARING=y`。需要大块缓冲时设置 `CONFIG_COMMON_LIBC_MALLOC_ARENA_SIZE=-1` 和足够的 `CONFIG_HEAP_MEM_POOL_SIZE`（示例里分别是 -1 和 65536 起）。
2. 板级设备树里 `ve` 要是 `okay`。`yuzukineko` 和 `f101_evb` 都已经打开。
3. 用 `device_is_ready()` 检查设备再使用。
4. 帧给显示用：`display_sunxi_show_yuv()` 直接接收 `vdec_frame` 的两个平面，不需要拷贝，见 [MP4 播放器](../apps/mp4-player.md)。

## 完整演示程序

上面所有示例和日志都来自这一个程序。建一个目录，放进下面的文件，就可以像其他 Zephyr 应用一样编译。

```text
vdec_api/
├── CMakeLists.txt
├── prj.conf
└── src/
    ├── main.c
    └── test_mjpeg.h      用 ffmpeg 生成，见下
```

`test_mjpeg.h` 是 5 张 320×240 的 JPEG 转成的 C 数组，生成命令：

```sh
ffmpeg -f lavfi -i testsrc2=size=320x240:rate=10 -frames:v 5 -q:v 5 f%d.jpg
```

JPEG、PNG、H.264 的测试数据直接用 `samples/drivers/vdec/` 里三个示例的头文件，`CMakeLists.txt` 里把它们的目录加进了头文件搜索路径。

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

### 编译和运行

```sh
. ~/f101-zephyr/env.sh
cd ~/f101-zephyr
west build -b yuzukineko -d build/vdec-api vdec_api
```

下载运行的方法见 [编译与运行](../zephyr-build-run.md)。控制台 UART1 上输出的演示程序自己的行如下（驱动的 `<err>` 日志已去掉，见 [驱动日志](#驱动日志)）：

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
