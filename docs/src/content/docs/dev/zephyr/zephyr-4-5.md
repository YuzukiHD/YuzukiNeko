---
title: "Zephyr 4.2.2 and 4.5.0"
---

F101 currently supports two Zephyr versions during a one-month transition. **4.2.2 remains available during this period**; 4.5.0 has a separate port and component branch. Choose the matching pair before building. Existing captures and board results in this chapter belong to the 4.2.2 baseline unless explicitly stated otherwise.

The plan as of 2026-11-02 is to complete the merge and stop maintaining 4.2.2 in about one month (around 2026-12-02), then maintain 4.5. The coexistence instructions below cover this transition; older examples and results retain their historical version scope after maintenance ends.

## Choose a version

| Item | 4.2.2 | 4.5.0 |
| --- | --- | --- |
| `YuzukiHD/zephyr` branch | `zephyr-v4.2.2-f101` | `zephyr-v4.5.0-f101` |
| `YuzukiHD/zephyr-components` branch | `main` | `zephyr-v4.5.0-f101` |
| Source revision reviewed for this update | `839812c7e2b` / `ed8886e` | `88344a2dcbf` / `d1e6062` |
| Python minimum | 3.10 | 3.12 |
| CMake minimum | 3.20.5 | 3.28 |
| Maintenance plan | Transition; stop maintenance after the planned merge around 2026-12-02 | Continued maintenance after the merge |
| LVGL | 9.3 | 9.6 |
| Cryptography | Mbed TLS 3 | Mbed TLS 4.1.1 and TF-PSA-Crypto |
| Build outputs | existing 4.2.2 directories | separate `build/zephyr-4.5.0/` directories |

The 4.5 port is based on upstream `v4.5.0`, commit `41d10b59730406bbab4ca9f1fbbe9e96aafb4966`. The revision pairs above identify the review baseline, rather than freezing future branch updates. The 4.5 branches were committed locally; their remote publication was not confirmed during this documentation update. Check that both branches are available before initializing a new checkout. An unavailable remote branch cannot be replaced by the other repository's `main`.

## Keep both environments

For independent daily builds, use two sibling west workspaces, each initialized with its own Zephyr branch and matching components. This also separates manifest-managed module checkouts. The [environment guide](zephyr-setup-env.md) and [source guide](zephyr-get-source.md) retain the 4.2.2 procedure. In a workspace already switched to 4.5, create a separate environment:

```sh
python3 -m venv .venv-zephyr-4.5.0
. ./env.sh
. .venv-zephyr-4.5.0/bin/activate
export PATH="$PWD/tools-local/usr/bin:$(dirname "$CROSS_COMPILE"):$PATH"
python -m pip install --upgrade pip
python -m pip install west
west packages pip --install
```

Run the first command with Python 3.12 or newer. Check `python --version` and `cmake --version` in the activated shell. Activating a virtual environment can restore the previous `PATH`; add any locally installed `dtc`, `gperf` and toolchain directories again afterwards. The compiler used for the 4.5 checks was XuanTie GCC 14.1.1; Python 3.14.4 and CMake 4.2.3 were used on the build host.

For sequential switching in one existing workspace, save local changes first, then select both branches and update the 4.5 manifest dependencies:

```sh
git -C zephyr switch zephyr-v4.5.0-f101
git -C zephyr-components switch zephyr-v4.5.0-f101
. ./env.sh
. .venv-zephyr-4.5.0/bin/activate
export PATH="$PWD/tools-local/usr/bin:$(dirname "$CROSS_COMPILE"):$PATH"
west update --narrow fatfs lvgl mbedtls tf-psa-crypto tf-psa-crypto-drivers cherryusb opencore
west packages pip --install
west build -b yuzukineko -d build/zephyr-4.5.0/hello zephyr/samples/hello_world
west build -b yuzukineko -d build/zephyr-4.5.0/nekobox zephyr-components/nekobox
```

Do not reuse a 4.2.2 CMake cache for 4.5.0, or run both versions concurrently while switching one workspace's source and dependency checkouts. Check the build process exit status before using its output.

## What changed in 4.5

| Area | Port changes and application impact |
| --- | --- |
| CPU and devicetree | The CPU uses `riscv,isa-base` and `riscv,isa-extensions`. Cache instructions use `RISCV_ISA_EXT_XTHEAD_CMO`. The F101 GPIO compatible is `allwinner,sun252i-f101-gpio`; the upstream `allwinner,sunxi-gpio` binding remains separate. |
| Driver API | [Audio](drivers/audio.md), SDHC and vdec use `DEVICE_API`. `uart_irq_update()` returns `void`; call it before checking `uart_irq_is_pending()`. Four-bit SDHC support is `props.bus_4_bit_support`. See the version-specific notes in the [UART](drivers/uart.md), [SDHC](drivers/sdhc.md) and [vdec](drivers/vdec.md) articles. |
| Display and LVGL | The pipeline root inherits the display-controller class; see [Display](drivers/display.md). [LVGL](apps/lvgl.md) 9.6 requires updated image-cache, text-measurement and blend hooks, including masked fills and alpha boundaries in the RVV renderer. Old internal LVGL hooks should not be copied unchanged. |
| Android mirroring | RSA generation and HKDF use PSA APIs; PK, X.509 and TLS interfaces and native Kconfig selections were updated. Use `MBEDTLS_SSL_PROTO_TLS1_3`; the old `mirror_mbedtls.h` user configuration is removed on 4.5. |
| iOS and Bilibili | SHA-512/AES and TLS selections and crypto headers were updated. Bilibili also uses the new LVGL interfaces. |
| [AIC8800](components/aic8800-wifi.md) | The Ethernet capability callback takes the interface. The optional WPA3 SAE backend uses TF-PSA-Crypto configuration, a random callback for EC multiplication, and rejects the removed secp192r1 group. |
| RVV | `SUN252I_F101_RVV` remains optional. Vector status is enabled before C startup, and the exception frame saves all vector registers. [RVV](zephyr-riscv-vector.md) explains the configuration. |
| MMU and paging | Machine-mode Sv32 retains its restrictions: no SMP, PMP userspace or supervisor mode. Mapping APIs return the status required by 4.5; the kernel stays resident. Backing stores are under `subsys/mem_mgmt/demand_paging/backing_store`; SD page I/O retains mutex serialization. |
| Decoder examples | Fixture headers are `jpeg_cases.h`, `png_cases.h` and `h264_cases.h`. The H.264 example accepts three- and four-byte Annex B start codes. Use the example from the selected component branch. |

Both boards retain their pin assignments and the 16 MiB DTS RAM region at `0x40000000`. A hardware revision with more PSRAM does not automatically enlarge the Zephyr region. RAM and XIP boot requirements are separate from the Zephyr version; see [Build and run](zephyr-build-run.md). Preserve the FEL development boot flow and the NOR sampling-parameter region.

## Checked-in examples on 4.5

These 18 component builds pass on 4.5; there are no target logs yet. Boot them with the [RAM or XIP flow](zephyr-build-run.md).

| Page | Build command |
| --- | --- |
| [AAC](components/aac.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/aac_api zephyr-components/examples/aac_api` |
| [AIC8800 Bluetooth](components/aic8800-bt.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/aic8800_bt_api zephyr-components/examples/aic8800_bt_api` |
| [AIC8800 Wi-Fi](components/aic8800-wifi.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/aic8800_wifi_api zephyr-components/examples/aic8800_wifi_api` |
| [CherryUSB](components/cherryusb.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/cherryusb_api zephyr-components/examples/cherryusb_api` |
| [MP4](components/mp4.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/mp4_api zephyr-components/examples/mp4_api` |
| [SD](components/sd.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/sd_api zephyr-components/examples/sd_api` |
| [Audio](drivers/audio.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/audio_api zephyr-components/examples/audio_api` |
| [Display](drivers/display.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/display_api zephyr-components/examples/display_api` |
| [G2D](drivers/g2d.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/g2d_api zephyr-components/examples/g2d_api` |
| [GPIO](drivers/gpio.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/gpio_api zephyr-components/examples/gpio_api` |
| [I2C](drivers/i2c.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/i2c_api zephyr-components/examples/i2c_api` |
| [PWM backlight](drivers/pwm-bl.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/pwm_bl_api zephyr-components/examples/pwm_bl_api` |
| [PWM](drivers/pwm.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/pwm_api zephyr-components/examples/pwm_api` |
| [SDHC](drivers/sdhc.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/sdhc_api zephyr-components/examples/sdhc_api` |
| [SPI](drivers/spi.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/spi_api zephyr-components/examples/spi_api` |
| [UART](drivers/uart.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/uart_api zephyr-components/examples/uart_api` |
| [USB](drivers/usb.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/usb_api zephyr-components/examples/usb_api` |
| [vdec](drivers/vdec.md) | `west build -b yuzukineko -d build/zephyr-4.5.0/vdec_api zephyr-components/examples/vdec_api` |

## Verification recorded for 4.5

The port checks compiled 53 driver, media, LVGL and paging configurations across `yuzukineko` and `f101_evb`; the EVB touch-drawing example was excluded because that board has no touch device. Follow-up component checks built 40 application configurations for `yuzukineko`, including NekoBox, Bilibili, MicroPython, PocketJS, the emulators, phone-mirroring receivers and API examples. Additional checks covered Miracast RAM/XIP, WPA3, RVV and paging combinations.

Six host suites passed, including the sanitizers provided by the suites. The Android crypto checks independently verify RSA, ADB key constants, certificates and HKDF/AES-GCM:

```sh
sh zephyr-components/dlna/tests/host/run.sh
sh zephyr-components/nekobox/tests/streaming/run.sh
sh zephyr-components/miracast/tests/host/run.sh
sh zephyr-components/aic8800/tests/p2p/run.sh
sh zephyr-components/nekobox/tests/miracast/run.sh
sh zephyr-components/android-screen-mirror/tests/host/run.sh
```

**4.5 board execution has not been verified.** Display, touch, audio, SD, Wi-Fi, sustained memory use, RVV context switching, scalar/vector rendering equivalence, paging integrity and Android/AirPlay/ADB interoperability require fresh target results. Existing 4.2.2 logs and screenshots remain historical evidence for their original builds.

## Return to 4.2.2

In a shared workspace, save local changes and return both repositories, the Python environment and dependencies together:

```sh
git -C zephyr switch zephyr-v4.2.2-f101
git -C zephyr-components switch main
. ./env.sh
west update --narrow fatfs lvgl mbedtls cherryusb opencore
west packages pip --install
west build -b yuzukineko -d build/hello zephyr/samples/hello_world
```

The old manifest does not use the extra TF-PSA-Crypto checkouts, so they may remain on disk. For exact historical reproduction, use the 4.2.2 revision pair in the first table rather than assuming that a moving `main` still names that revision.
