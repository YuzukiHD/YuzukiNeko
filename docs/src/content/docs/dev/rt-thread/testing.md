---
title: "Regression and known limits"
---

Build `test_defconfig` for YuzukiNeko using [the configuration flow](build-run.md). Normal images deliberately omit test commands. Check a fresh boot identity before running tests and keep the source revision, profile, board DTS and complete serial log with the report.

## Recommended sequence

```text
list_device
free
test_all
test_spi_features
test_spi_quad
test_i2c i2c1
test_touch
test_rtc
test_display_features
usb_display_selftest
test_display_jpeg
usb_display_stop
test_vdec
test_sd
free
```

`test_all` runs the registered smoke groups, not every extended command. `test_touch` injects native input events as well as checking the real controller; `test_touch_watch 60` is the separate physical-finger check. Decoder reference media requirements are described on the [VE page](drivers/vdec.md). Do not run a test concurrently with an application using the same peripheral.

The JPEG self-test checks streaming RGB before keeping a private preview; `test_display_jpeg` checks the retained image. It compares all eight color bars, while `test_vdec` checks Y, Cb and Cr separately for both NV12 and NV21. Luma-only checks in older test images did not cover the UV-order fault that changed yellow to cyan and cyan to brown.

## Observed YuzukiNeko results

| Check (2026-11-03) | Observed result |
| --- | --- |
| `test_all` | 25 groups, zero failed; explicit SKIP entries still apply |
| SPI features / quad | 14 / 6 checks passed; 100 MHz sample mode 0 delay 17 |
| SPI single vs quad data | 4 KiB at `0x80000`, CRC `11c60a82` |
| I2C1 / native touch | 5 / 16 checks passed; GT967 at `0x5d`, 400 kHz |
| RTC | 13 checks, including leap day, 2097 and one-shot IRQ |
| Display pixels | 22 checks; full-frame writeback compared in memory |
| VE | 13 checks; JPEG luma error ≤1, PNG CRC `03c854ec`, H.264 30 frames / zero bad |
| Decoder lifetime | 320 JPEG iterations, ring wrap and held close/release, stable heap |
| SD 2 MiB | DMA 89 ms; separate PIO profile 772 ms |
| UI profile | Divisor 2, 512×384 window; outside pixels black |
| SPIF profile | 13 checks, 100 MHz quad DTR `0xed`, mode 0 delay 27, matching CRC |
| Default / ulog | Both booted and passed 30-frame JPEG display self-test |

## Alternative profiles

For SD PIO and the UI window use `pio_window_defconfig`. For SPIF use `test_defconfig` plus `SUN252I_BOARD=yuzukineko-spif`, then run `test_spif_read 0x11c60a82` only when the reference bytes are still the same. Recompute the reference with SPI after changing flash contents. Sampling delays and CRCs are observations from one board and flash image, not constants to hardcode.

## Limits of the evidence

A 180-second physical touch watch received no events. Native multitouch translation passed, but physical finger operation remains unconfirmed. Display pixels were captured internally; no camera or local observer confirmed screen appearance. Playback DMA ran, but audible sound was not confirmed; microphone samples were zero. There was no attached DBI panel or USB host peripheral. OWA receive was explicitly skipped because no RX DMA request arrived.

Writeback with a nonzero crop origin currently captures the top-left region; tests capture a full frame and select patches in software. Intermediate alpha values differ from ideal linear arithmetic (`0xff008486` for the recorded alpha-128 case); tests establish endpoints and monotonic behavior, not exact colorimetry. Do not relabel these limits as successful visual or physical tests.

## Keep regression non-destructive

The ordinary commands above read flash and SD data. Do not append `write` to `test_spi` or `test_sd` for a routine regression: those modes erase/program flash or modify a raw SD sector. Even restore-based tests can lose data on interruption. The SPIF profile intentionally omits parameter saving and block-protection clearing. Keep the NOR boot and saved-parameter areas intact.
