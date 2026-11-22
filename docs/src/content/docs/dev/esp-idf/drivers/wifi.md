---
title: "AIC8800 Wi-Fi"
---

The base board's AIC8800 is a FullMAC Wi-Fi chip connected to F101 over SDIO. On the ESP-IDF side it registers as the chip backend of `esp_wifi`; applications use the standard `esp_wifi.h`, `esp_netif.h` and event loop and never call the AIC vendor driver directly.

## Chip and bus

| Item | Connection |
| --- | --- |
| SDIO | SMHC2, slot 1, 4-bit |
| CLK / CMD | PE2 / PE3 |
| D0..D3 | PE1 / PE0 / PE5 / PE4 |
| Power enable | PE10, active high |
| Wake-up input | Not connected |
| Bluetooth reset | PD8, unused by ESP-IDF |

The driver raises PE10 during `esp_wifi_start()`, enumerates SDIO function 1, downloads about 333 KiB of firmware and starts the Wi-Fi task. `CONFIG_AIC8800_CHIP` selects the chip model, defaulting to AIC8800D80; the actual chip reports its own chip id in the startup log.

## Configuration

```c
#include "aic8800.h"
#include "driver/gpio.h"
#include "driver/sdmmc_host.h"

static const aic8800_config_t s_aic = {
    .sdmmc_slot = 1,
    .sdmmc_pins = {
        .clk = GPIO_NUM_PE(2),
        .cmd = GPIO_NUM_PE(3),
        .d0 = GPIO_NUM_PE(1),
        .d1 = GPIO_NUM_PE(0),
        .d2 = GPIO_NUM_PE(5),
        .d3 = GPIO_NUM_PE(4),
        .d4 = GPIO_NUM_NC, .d5 = GPIO_NUM_NC,
        .d6 = GPIO_NUM_NC, .d7 = GPIO_NUM_NC,
        .cd = GPIO_NUM_NC, .wp = GPIO_NUM_NC,
        .width = 4, .flags = 0,
    },
    .reg_on_gpio = GPIO_NUM_PE(10),
    .wakeup_gpio = -1,
};
```

`aic8800_wifi_register()` must be called before `esp_wifi_init()`; it only registers the backend and does not touch hardware. `CONFIG_AIC8800_MEM_POOL_KB` defaults to 384 KiB, and the Wi-Fi firmware and stack allocate from that pool; adjust it first when the heap is tight.

## Scanning

```c
esp_netif_init();
esp_event_loop_create_default();
esp_netif_create_default_wifi_sta();
aic8800_wifi_register(&s_aic);

wifi_init_config_t init_cfg = WIFI_INIT_CONFIG_DEFAULT();
esp_wifi_init(&init_cfg);
esp_wifi_set_mode(WIFI_MODE_STA);
esp_wifi_start();

wifi_scan_config_t scan = { 0 };
esp_wifi_scan_start(&scan, true);

uint16_t count = 0;
esp_wifi_scan_get_ap_num(&count);
wifi_ap_record_t *aps = calloc(count, sizeof(*aps));
esp_wifi_scan_get_ap_records(&count, aps);
```

Scanning is blocking: when the second argument of `esp_wifi_scan_start()` is `true`, it returns after the scan completes. `esp_wifi_scan_get_ap_records()` copies the records into the caller's array, which must hold at least `count` entries. Do not call `esp_wifi_start()` or `esp_wifi_stop()` again while a scan is running.

## Connecting

```c
wifi_config_t sta = { 0 };
strncpy((char *)sta.sta.ssid, "SSID", sizeof(sta.sta.ssid));
strncpy((char *)sta.sta.password, "password", sizeof(sta.sta.password));
sta.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

esp_wifi_set_config(WIFI_IF_STA, &sta);
esp_wifi_connect();
```

After a successful connection the default DHCP client in `esp_netif` obtains an address and `IP_EVENT_STA_GOT_IP` carries an `ip_event_got_ip_t`. There is no automatic reconnect after a disconnect; the application decides whether to retry in `WIFI_EVENT_STA_DISCONNECTED`. The current driver supports open networks and WPA2-PSK; the WPA3 SAE code compiles but has not been verified against a router.

## Events and addresses

```c
static void on_wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_CONNECTED) {
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    }
}

esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_wifi_event, NULL);
```

`WIFI_EVENT_STA_START` means the stack is up and a scan or connect may start; `WIFI_EVENT_STA_CONNECTED` only means the link is established, and the address becomes usable at `IP_EVENT_STA_GOT_IP`. Event callbacks run in the event-loop task; do not block there.

Key lines from the observed log:

```text
I (3990) aic8800: sdio card up: 2 functions
I (4389) aic8800: ### Upload firmware, @ = 120000
I (5909) aic8800: wifi open ok
I (5909) wifi_check: station started
I (7649) wifi_check: found 11 APs
```

## Limitations

- Station mode only; `esp_wifi_set_mode()` rejects AP and sniffer modes.
- There is no Bluetooth. The AIC8800 Bluetooth part needs separate reset and HCI wiring, which this port does not implement.
- The management interface accepts only open networks and WPA2-PSK; WPA3 is unverified.
- `esp_wifi_stop()` removes power from the chip, and the next start downloads firmware again, taking about two seconds.
- Wi-Fi owns the slot 1 SDIO controller; the application cannot use it as an ordinary SD card host at the same time.
- Wi-Fi firmware and stack consume several MiB of heap; check the remaining heap when display frame buffers and Wi-Fi are used together.
