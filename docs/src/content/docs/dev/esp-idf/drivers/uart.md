---
title: "UART and console"
---

F101 has six DW-APB UARTs with 128-byte FIFOs. Transmit polls data into the FIFO; receive is interrupt-driven into a stream buffer. There is no DMA and no hardware flow control. The console and ordinary serial ports share the same driver, but the console is initialized by the startup code before `app_main()`.

## Controllers and pads

| UART | TX / RX pads |
| --- | --- |
| UART0 | PF2 / PF4 |
| UART1 | PF0 / PF1 or PB0 / PB1 |
| UART2 | PF4 / PF5 or PE6 / PE7 |
| UART3 | PE8 / PE9 |
| UART4 | PE2 / PE3 or PD6 / PD7 |
| UART5 | PE4 / PE5 |

YuzukiNeko connects UART1 on PB0/PB1 to the on-board serial port; `f101_evb` uses UART3 on PE8/PE9. The RTS, CTS, DTR and DSR arguments of `uart_set_pin()` must be -1, otherwise it returns `ESP_ERR_NOT_SUPPORTED`.

## Console

The console defaults to UART1, PB0/PB1, 115200 8N1. The startup code routes the pads and initializes UART directly from `CONFIG_ESP_CONSOLE_UART_TX_GPIO`/`RX_GPIO` before FreeRTOS, so the earliest `ESP-ROM:sun252i-f101-fel` banner does not depend on the UART driver.

On the EVB, select `Custom UART` and `UART3` in `idf.py menuconfig`, with TX 136 and RX 137. Do not install the console UART again as an ordinary serial port; use UART0, UART2, UART4 or UART5 for extra ports.

## Installing the driver

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

Use an RX buffer of at least 1024 bytes for `uart_driver_install()`; the FIFO is only 128 bytes, and a smaller buffer loses data at high baud rates. The event queue delivers `UART_BREAK`, `UART_FIFO_OVF`, `UART_FRAME_ERR` and similar events.

## Transmitting and receiving

```c
const char msg[] = "hello\n";
uart_write_bytes(UART_NUM_1, msg, sizeof(msg) - 1);

uint8_t buf[64];
int n = uart_read_bytes(UART_NUM_1, buf, sizeof(buf), pdMS_TO_TICKS(100));
```

`uart_write_bytes()` queues data into the TX FIFO and returns without waiting for the line; use `uart_wait_tx_done()` when completion matters. `uart_read_bytes()` returns the number of bytes actually read and 0 on timeout. The receive interrupt moves data into the driver buffer, and the application task reads from there.

## VFS

To use a UART as a file, register VFS and select driver mode:

```c
#include "driver/uart_vfs.h"

uart_vfs_dev_register();
uart_vfs_dev_use_driver(UART_NUM_1);
int fd = open("/dev/uart/1", O_RDWR);
```

`uart_vfs_dev_use_driver()` makes `read()`/`write()` go through the UART driver; without it, the blocking polling implementation is used. VFS suits command lines and simple protocols; high-throughput data should still use `uart_read_bytes()`.

## Limitations

- There is no RTS/CTS, DTR/DSR or software flow control; `UART_HW_FLOWCTRL_CTS_RTS` fails.
- Transmit is polled and receive is interrupt-driven with a buffer; there is no UART DMA.
- The baud rate is divided from the 24 MHz reference, so divider error grows at extreme rates; 115200 has been verified on hardware, and higher rates need their own divider and wiring check.
- The console UART is owned by the startup path; applications must not call `uart_driver_install()` on it.
- The six UARTs use interrupt numbers 2 through 7; registration order does not matter, but each port can be installed only once.
