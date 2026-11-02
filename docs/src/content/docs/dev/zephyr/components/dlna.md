---
title: "DLNA - UPnP media renderer"
---

`zephyr-components/dlna` is a reusable UPnP AV **MediaRenderer:1**. A phone or PC sends a media URL and playback commands; the application downloads and plays the file. DLNA does not mirror the phone's desktop. For Android wireless screen mirroring use [Miracast](../apps/miracast.md).

## Versions and verification

DLNA is available with both the 4.2.2 baseline and matching 4.5 components; see the [version guide](../zephyr-4-5.md). Host protocol and NekoBox streaming tests passed on 4.5. Board checks recorded on 2026-10-30 used the earlier baseline: discovery/events, HTTP progressive H.264/AAC playback, long URLs, pause/resume/seek/stop and resolution rejection. They do not establish 4.5 board operation.

## Use with NekoBox

1. Connect the board and controller to the same local network, with client isolation disabled and multicast available.
2. Open the **DLNA** home tile in [NekoBox](../apps/nekobox.md) and select **Start receiving**. The default name is **NekoBox**.
3. In a DLNA video application, select 360p or lower, then select the board as the playback device.
4. The receiver page shows buffering/errors and opens the player once enough data is available. Leaving playback returns to the receiver page; **Stop receiving** disables the service.

The receiver keeps Wi-Fi awake while enabled, including after leaving the page. Miracast temporarily takes over the radio and stops DLNA; leaving Miracast restores the previous service state. Cast downloads require space on the TF card and are excluded from local playback history.

| NekoBox option | Default | Meaning |
| --- | --- | --- |
| `CONFIG_NEKOBOX_FEATURE_DLNA` | `y` | Receiver, page, home tile and settings control |
| `CONFIG_NEKOBOX_DLNA_NAME` | `NekoBox` | Renderer name |
| `CONFIG_NEKOBOX_DLNA_BUFFER_KB` | 512 | Initial buffer, in addition to a complete MP4 movie header |
| `CONFIG_NEKOBOX_DLNA_MAX_WIDTH`, `CONFIG_NEKOBOX_DLNA_MAX_HEIGHT` | 640, 360 | Cast dimensions; 360×640 portrait is also accepted |
| `CONFIG_NEKOBOX_DLNA_DIR` | `/SD:/dlna` | Temporary download directory, cleaned at receiver startup |

## Media and buffering

The NekoBox player supports ordinary **HTTP H.264/AAC MP4**, including chunked transfer and bodies without Content-Length. HTTPS, playlists and fragmented MP4 are unsupported. The protocol module delegates media fetching and format support to the application.

The downloader syncs every 64 KiB before publishing readable data. Playback starts after a complete `moov` and the configured buffer are available, or when the file is complete. A `moov` at the end requires the whole download. Waiting reads can be interrupted by pause, seek, stop and a replacement request. The UI thread never waits for network data.

DLNA cannot force a sending app to supply 360p. NekoBox checks the selected DIDL resource and the actual MP4 dimensions independently. Missing or misleading metadata cannot bypass the resolution limit. URLs can contain up to 4095 decoded bytes; a rejected replacement prevents Play from restarting the previous URL.

## Integrate the module

Add `dlna/` to `ZEPHYR_EXTRA_MODULES`, enable `CONFIG_DLNA`, include `<dlna/dlna.h>` and pass application callbacks to `dlna_start()`. The module provides SSDP discovery/announcements, device and service descriptions, SOAP AVTransport/RenderingControl/ConnectionManager and event subscriptions. It supports `Expect: 100-continue`, subscription renewal and socket cleanup.

| Module option | Default | Meaning |
| --- | --- | --- |
| `CONFIG_DLNA_HTTP_PORT` | 49152 | Description and control HTTP port |
| `CONFIG_DLNA_MAX_REQUEST` | 12288 | Maximum control request bytes |
| `CONFIG_DLNA_MAX_SUBSCRIBERS` | 4 | Event subscribers |
| `CONFIG_DLNA_ANNOUNCE_INTERVAL_S` | 600 | SSDP alive announcement interval |

Controller callbacks should queue player/UI commands to the application thread. NekoBox's implementation lives under `nekobox/src/features/dlna/`, with the reusable protocol in `dlna/src/`.

## Verify

```sh
sh zephyr-components/dlna/tests/host/run.sh
sh zephyr-components/nekobox/tests/streaming/run.sh
```

These checks use GCC, Python and FFmpeg and include ASan/UBSan, an actual HTTP server through POSIX adapters, event XML validation and progressive MP4 reads with a FAT-style cached-size adapter. They complement testing on a real SD card and network. For discovery failures, check multicast and network isolation; for playback failures, check HTTP reachability, format, resolution and free card space.
