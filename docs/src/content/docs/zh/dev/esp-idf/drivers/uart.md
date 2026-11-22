---
title: "UART 与控制台"
---

F101 有 6 个 DW-APB UART，带 128 字节 FIFO。发送是轮询写入 FIFO，接收由中断搬进 stream buffer。没有 DMA，也没有硬件流控。控制台和普通串口使用同一个驱动，但控制台在 `app_main()` 之前就已经由启动代码初始化。

## 控制器与焊盘

| UART | TX / RX 焊盘 |
| --- | --- |
| UART0 | PF2 / PF4 |
| UART1 | PF0 / PF1 或 PB0 / PB1 |
| UART2 | PF4 / PF5 或 PE6 / PE7 |
| UART3 | PE8 / PE9 |
| UART4 | PE2 / PE3 或 PD6 / PD7 |
| UART5 | PE4 / PE5 |

YuzukiNeko 把 UART1 的 PB0/PB1 接到板载串口。`f101_evb` 使用 UART3 的 PE8/PE9。`uart_set_pin()` 的 RTS、CTS、DTR、DSR 参数必须是 -1，否则返回 `ESP_ERR_NOT_SUPPORTED`。

## 控制台

控制台默认是 UART1、PB0/PB1、115200 8N1。启动代码在 FreeRTOS 之前直接按 `CONFIG_ESP_CONSOLE_UART_TX_GPIO`/`RX_GPIO` 路由焊盘并初始化 UART，所以最早的 `ESP-ROM:sun252i-f101-fel` 横幅不依赖 UART 驱动。

使用 EVB 时在 `idf.py menuconfig` 中选择 `Custom UART`、`UART3`，TX 填 136，RX 填 137。控制台使用的 UART 不要再被应用重复安装为普通串口。需要额外串口时使用 UART0、UART2、UART4 或 UART5。

## 安装驱动

```c
#include "driver/uart.h"

uart_config_t cfg = {
    .baud_rate = 115200,
    .data_bits = UART_DATA_8_BITS,
    .parity = UART_PARITY_DISABLE,
    .stop_bits = UART_STOP_BITS_1,
    .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
    .source_clk = UART_SCLK_DEFAULT,
};
uart_param_config(UART_NUM_1, &cfg);
uart_set_pin(UART_NUM_1, GPIO_NUM_PB(0), GPIO_NUM_PB(1), -1, -1);
uart_driver_install(UART_NUM_1, 2048, 0, 20, &uart_queue, 0);
```

`uart_driver_install()` 的 RX 缓冲建议不小于 1024 字节。FIFO 只有 128 字节，高波特率下缓冲太小会丢数据。事件队列用于接收 `UART_BREAK`、`UART_FIFO_OVF`、`UART_FRAME_ERR` 等事件。

## 收发数据

```c
const char msg[] = "hello\n";
uart_write_bytes(UART_NUM_1, msg, sizeof(msg) - 1);

uint8_t buf[64];
int n = uart_read_bytes(UART_NUM_1, buf, sizeof(buf), pdMS_TO_TICKS(100));
```

`uart_write_bytes()` 把数据放进 TX FIFO 后返回，不等待线路发送完毕。需要确认发送完成时用 `uart_wait_tx_done()`。`uart_read_bytes()` 返回实际读到的字节数，超时返回 0。接收中断把数据搬进驱动缓冲，应用任务从缓冲读取。

## VFS

要把串口当文件用，就注册 VFS 并切换为驱动模式：

```c
#include "driver/uart_vfs.h"

uart_vfs_dev_register();
uart_vfs_dev_use_driver(UART_NUM_1);
int fd = open("/dev/uart/1", O_RDWR);
```

`uart_vfs_dev_use_driver()` 让 `read()`/`write()` 走 UART 驱动。不调用时使用阻塞的轮询实现。VFS 适合命令行和简单协议，高吞吐数据仍建议直接使用 `uart_read_bytes()`。

## 限制

- 没有 RTS/CTS、DTR/DSR 和软件流控；`UART_HW_FLOWCTRL_CTS_RTS` 会失败。
- 发送是轮询，接收是中断加缓冲；没有 UART DMA。
- 波特率由 24 MHz 参考时钟分频，极高波特率的分频误差会增大；115200 已在实板验证，更高波特率需要自行确认分频误差和线材。
- 控制台 UART 在启动阶段被占用，应用不要对它调用 `uart_driver_install()`。
- 6 个 UART 共享同一套中断号 2 到 7，注册顺序不影响使用，但每个端口只能安装一次驱动。
