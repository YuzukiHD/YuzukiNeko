---
title: "AIC8800 Wi-Fi"
---

底板的 AIC8800 是一颗 FullMAC Wi-Fi 芯片，通过 SDIO 接到 F101。ESP-IDF 侧把它注册成 `esp_wifi` 的芯片后端，应用使用标准的 `esp_wifi.h`、`esp_netif.h` 和事件循环，不需要直接调用 AIC 厂商驱动。

## 芯片与总线

| 项目 | 连接 |
| --- | --- |
| SDIO | SMHC2，插槽 1，4 位 |
| CLK / CMD | PE2 / PE3 |
| D0..D3 | PE1 / PE0 / PE5 / PE4 |
| 电源使能 | PE10，高有效 |
| 唤醒输入 | 未接 |
| 蓝牙复位 | PD8，ESP-IDF 未使用 |

驱动在 `esp_wifi_start()` 时拉高 PE10，枚举 SDIO 的 function 1，下载约 333 KiB 的固件，然后启动 Wi-Fi 任务。芯片型号由 `CONFIG_AIC8800_CHIP` 选择，默认 AIC8800D80。实际芯片会在启动日志里报告自己的 chip id。

## 配置

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

`aic8800_wifi_register()` 必须在 `esp_wifi_init()` 之前调用。它只注册后端，不碰硬件。`CONFIG_AIC8800_MEM_POOL_KB` 默认 384 KiB，Wi-Fi 固件和协议栈从这个池里分配，堆紧张时先调整它。

## 扫描

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

扫描是阻塞的，`esp_wifi_scan_start()` 的第二个参数为 `true` 时等扫描完成后返回。`esp_wifi_scan_get_ap_records()` 会把记录复制到调用者的数组，数组至少要能容纳 `count` 项。扫描期间不要重复调用 `esp_wifi_start()` 或 `esp_wifi_stop()`。

## 连接

```c
wifi_config_t sta = { 0 };
strncpy((char *)sta.sta.ssid, "SSID", sizeof(sta.sta.ssid));
strncpy((char *)sta.sta.password, "password", sizeof(sta.sta.password));
sta.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

esp_wifi_set_config(WIFI_IF_STA, &sta);
esp_wifi_connect();
```

连接成功后 `esp_netif` 默认的 DHCP 客户端会取得地址，`IP_EVENT_STA_GOT_IP` 事件携带 `ip_event_got_ip_t`。断开后不会自动重连，需要应用在 `WIFI_EVENT_STA_DISCONNECTED` 里决定是否重试。当前驱动支持开放网络和 WPA2-PSK。WPA3 的 SAE 代码可以编译，但没有在路由器上验证。

## 事件与地址

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

`WIFI_EVENT_STA_START` 表示协议栈已启动，可以发起扫描或连接。`WIFI_EVENT_STA_CONNECTED` 只表示链路建立，地址要到 `IP_EVENT_STA_GOT_IP` 才可用。事件回调运行在事件循环任务里，不要做阻塞操作。

实测日志中的关键行：

```text
I (3990) aic8800: sdio card up: 2 functions
I (4389) aic8800: ### Upload firmware, @ = 120000
I (5909) aic8800: wifi open ok
I (5909) wifi_check: station started
I (7649) wifi_check: found 11 APs
```

## 限制

- 只有 station 模式；`esp_wifi_set_mode()` 拒绝 AP 和 sniffer 模式。
- 没有 Bluetooth；AIC8800 的蓝牙部分需要单独的复位和 HCI 接入，本移植未实现。
- 管理接口只接受开放网络和 WPA2-PSK；WPA3 未验证。
- `esp_wifi_stop()` 会关闭芯片电源，再次启动会重新下载固件，耗时约 2 秒。
- Wi-Fi 使用插槽 1 的 SDIO 控制器，应用不能同时把它当作普通 SD 卡主机。
- Wi-Fi 固件和协议栈占用数 MiB 堆；显示帧缓冲和 Wi-Fi 同时使用时先确认剩余堆。
