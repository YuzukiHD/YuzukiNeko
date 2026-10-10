# Zephyr

Zephyr 对 F101 的支持放在 F101 west 工作区里：SoC（`sun252i_f101`）、设备树、板级 `yuzukineko`，以及时钟/复位、pinctrl、GPIO、I2C、SPI、PWM、ADC、DMA、看门狗、显示、音频、USB、SD 卡、G2D、视频解码等驱动。本页说明怎么编译并把程序放到 YuzukiNeko 上运行。

!> Zephyr 的板级和驱动代码在 F101 工作区，不在 YuzukiNeko 硬件仓库中。下面的命令都在工作区根目录下执行。

## 板级

| 板级名 | 说明 |
| --- | --- |
| `yuzukineko` | 本板：控制台为 <strong>UART1（PB00/PB01）</strong>；SD 卡（SMHC0）、USB、音频、G2D、视频引擎、RGB 屏等 |
| `f101_evb` | Allwinner F101 评估板，控制台为 UART3（PE08/PE09），另外带背光 |

本板<strong>没有接背光</strong>：`PB0`/`PB1` 留给 UART1 控制台，所以 `yuzukineko` 板级里没有 PWM 背光。

## 编译

```bash
. ./env.sh                      # 激活 .venv，设置 ZEPHYR_BASE、CROSS_COMPILE、PATH
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

输出在 `build/hello/zephyr/zephyr.{elf,bin}`，镜像链接在 `0x40010000`（入口 `__start`），工具链是 XuanTie 900 newlib GCC（`ZEPHYR_TOOLCHAIN_VARIANT=cross-compile`）。

## 经 FEL 载入运行

在已进入 FEL 的板子上：

```sh
xfel ddr f101-s3
xfel write 0x40010000 zephyr.bin
xfel exec 0x40010000
```

要点：

- <strong>每次下载都要重新上电进入 FEL</strong>；`exec` 之后 FEL 不再可用。
- `ddr` 这一步的辅助程序也会把 UART 时钟和引脚复用配置好；没有它，控制台没有输出。
- 经 xfel 启动会跳过 boot0/u-boot，所以 SoC 早期初始化需要自己设好 CPU CSR 和控制台时钟。
- `exec` 之后不要再用 `xfel read32` / `hexdump` 查看状态，USB 链路已断。想查状态只能在 `exec` 前做。
- 重新上电后用 `xfel version` 确认 FEL（输出里有 `AWUSBFEX ID=0x00193700(F101)`）。`exec` 后看到 `usb bulk send/recv error` 说明 CPU 已离开 BROM、代码在跑，不代表 Zephyr 健康。

## 控制台

`yuzukineko` 的控制台是 UART1 的 `PB00` / `PB01`，115200 8N1。把 USB 转串口的 RX/TX 接到这两个脚，共地。没有输出时，先用一个裸机小程序证明路径（链接在 `0x40010000`，轮询 UART 并写发送寄存器），把“执行、串口、接线”和“Zephyr 自身”区分开。

## 引脚冲突

pinmux 编码为 `ALLWINNER_PINMUX(port, num, mux)`。启用外设前对整个编译后的 `zephyr.dts` 检查有没有冲突，例如：

- LCD 使用 `PD0..PD21`，所以同时启用 `dbi` / `pwm` / `i2c0` 会冲突。
- SD 卡和 JTAG 共用 `PF0/1/3/5`（JTAG 是 mux 4）。
- `PE2` 是 USB VBUS 开关，与 I2S0、SDC2 共用 `PE0..PE4`。

排错时 `grep` 启动日志中的 `[E]` / `[W]` 行，不要只看启动是否“看起来正常”。

## 示例

| 示例 | 内容 |
| --- | --- |
| `samples/hello_world` | 最小例子 |
| `samples/drivers/display` | 显示栈 |
| `samples/drivers/g2d` | G2D 加速器 |
| `samples/drivers/audio/sunxi_tone` | 片上 codec 音调与麦克风 |
| `samples/drivers/usb/cherryusb_cdc_acm` | USB 设备（CDC ACM） |
| `samples/drivers/usb/cherryusb_host` | USB 主机 |
| `samples/drivers/mp4_player` | MP4 播放 |

自检类示例的最后一行会打印 `PASS (0 failures)`。

?> 本板只有一个 USB-C 口，同时是 xfel 下载口和 USB 主机/设备口。先用 PC 线缆下载，再换接外设。
