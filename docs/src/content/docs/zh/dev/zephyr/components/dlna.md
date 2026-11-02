---
title: "DLNA - UPnP 媒体接收器"
---

`zephyr-components/dlna` 是可复用的 UPnP AV **MediaRenderer:1**。手机或 PC 发送媒体 URL 和播放命令，应用下载并播放文件。DLNA 不镜像手机桌面；Android 无线屏幕镜像请使用 [Miracast](../apps/miracast.md)。

## 版本与验证

DLNA 可用于 4.2.2 基线及配套的 4.5 组件，见[版本指南](../zephyr-4-5.md)。4.5 的主机协议与 NekoBox 流式播放测试通过。2026-10-30 的板上检查属于较早基线，覆盖发现／事件、HTTP H.264/AAC 边下载边播、长 URL、暂停／继续／跳转／停止及分辨率拒绝，不能据此认定 4.5 已通过实机验证。

## 在 NekoBox 中使用

1. 将板子和控制端连接到同一局域网，关闭客户端隔离并允许组播。
2. 打开 [NekoBox](../apps/nekobox.md) 首页的 **DLNA**，选择 **Start receiving**。默认设备名为 **NekoBox**。
3. 在支持 DLNA 的视频应用中选择 360p 或更低清晰度，再选择板子作为播放设备。
4. 接收页显示缓冲进度和错误，数据足够后打开播放器。退出播放返回接收页；**Stop receiving** 关闭服务。

接收器启用时保持 Wi-Fi 唤醒，离开页面后也继续接收。Miracast 会暂时接管无线接口并停止 DLNA，退出后恢复之前的服务状态。投屏下载需要 TF 卡可用空间，不进入本地播放历史。

| NekoBox 配置 | 默认值 | 含义 |
| --- | --- | --- |
| `CONFIG_NEKOBOX_FEATURE_DLNA` | `y` | 接收器、页面、首页磁贴和设置开关 |
| `CONFIG_NEKOBOX_DLNA_NAME` | `NekoBox` | 接收器名称 |
| `CONFIG_NEKOBOX_DLNA_BUFFER_KB` | 512 | 初始缓冲量，另需完整 MP4 movie header |
| `CONFIG_NEKOBOX_DLNA_MAX_WIDTH`, `CONFIG_NEKOBOX_DLNA_MAX_HEIGHT` | 640, 360 | 投屏尺寸，也接受 360×640 竖屏 |
| `CONFIG_NEKOBOX_DLNA_DIR` | `/SD:/dlna` | 临时下载目录，接收器启动时清理 |

## 媒体与缓冲

NekoBox 播放器支持普通的 **HTTP H.264/AAC MP4**，包括 chunked 和没有 Content-Length 的响应。不支持 HTTPS、播放列表或 fragmented MP4。协议模块把媒体获取与格式支持交给应用。

下载器每写入 64 KiB 同步一次，再发布可读数据。完整 `moov` 与配置的缓冲量可用后开始播放，文件下载完毕也可启动。`moov` 位于文件尾部时必须等待全部下载。等待中的读取可被暂停、跳转、停止或替换请求打断，UI 线程不会等待网络数据。

DLNA 不能强制发送应用提供 360p。NekoBox 分别检查选中的 DIDL 资源和实际 MP4 尺寸，缺失或错误的元数据不能绕过限制。URL 最长为解码后的 4095 字节；替换地址被拒绝后，Play 不会重新启动旧地址。

## 集成模块

将 `dlna/` 加入 `ZEPHYR_EXTRA_MODULES`，启用 `CONFIG_DLNA`，包含 `<dlna/dlna.h>`，向 `dlna_start()` 提供应用回调。模块提供 SSDP 发现／广播、设备与服务描述、SOAP AVTransport/RenderingControl/ConnectionManager 和事件订阅，支持 `Expect: 100-continue`、订阅续期与 socket 清理。

| 模块配置 | 默认值 | 含义 |
| --- | --- | --- |
| `CONFIG_DLNA_HTTP_PORT` | 49152 | 描述与控制 HTTP 端口 |
| `CONFIG_DLNA_MAX_REQUEST` | 12288 | 控制请求的最大字节数 |
| `CONFIG_DLNA_MAX_SUBSCRIBERS` | 4 | 事件订阅者数量 |
| `CONFIG_DLNA_ANNOUNCE_INTERVAL_S` | 600 | SSDP alive 广播间隔 |

控制端回调应把播放器／UI 命令排队交给应用线程。NekoBox 的集成位于 `nekobox/src/features/dlna/`，可复用协议位于 `dlna/src/`。

## 验证

```sh
sh zephyr-components/dlna/tests/host/run.sh
sh zephyr-components/nekobox/tests/streaming/run.sh
```

检查需要 GCC、Python 和 FFmpeg，包含 ASan/UBSan、通过 POSIX 适配运行的实际 HTTP 服务器、事件 XML 校验，以及模拟 FAT 缓存文件大小的 MP4 渐进读取。它们需与真实 SD 卡和网络测试配合。发现失败时检查组播与网络隔离；播放失败时检查 HTTP 可达性、格式、分辨率和卡上空间。
