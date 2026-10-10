# 示例

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

## 其他 Zephyr 组件

ncnn、PocketJS、litehtml、AIC8800 WiFi 等，各自状态不同，见各自的 README。

?> 这些都是 F101 工作区里的开发项目，不属于 YuzukiNeko 硬件仓库发布的内容。具体用法以各自目录里的 README 为准。
