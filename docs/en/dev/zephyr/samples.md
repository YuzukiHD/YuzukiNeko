# Samples

## Samples

| Sample | Content |
| --- | --- |
| `samples/hello_world` | Minimal example |
| `samples/drivers/display` | Display stack |
| `samples/drivers/g2d` | G2D accelerator |
| `samples/drivers/audio/sunxi_tone` | On-chip codec tone and microphone |
| `samples/drivers/usb/cherryusb_cdc_acm` | USB device (CDC ACM) |
| `samples/drivers/usb/cherryusb_host` | USB host |
| `samples/drivers/mp4_player` | MP4 playback |

Self-checking samples print `PASS (0 failures)` on their last line.

?> This board has only one USB-C port, which is both the xfel download port and the USB host/device port. Download over the PC cable first, then switch to the peripheral.

## Other Zephyr Components

ncnn, PocketJS, litehtml, AIC8800 WiFi, etc. Each has its own status; see its README.

?> These are development projects in the F101 workspace and are not part of what the YuzukiNeko hardware repository releases. For specific usage, refer to the README in each directory.
