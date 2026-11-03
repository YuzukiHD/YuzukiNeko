---
title: "UART console and serial devices"
---

This BSP uses the native DesignWare 8250 serial driver in `components/drivers/serial/device/8250/`. YuzukiNeko uses UART1 (`0x02500400`) on PB0 TX / PB1 RX, mux 4. The EVB UART3 pins PE8/PE9 are I2C0 pins on YuzukiNeko.

## DTS and Kconfig

```c
/ {
    aliases { serial1 = &uart1; };
    chosen { stdout-path = "serial1:115200n8"; };
};
&uart1 { status = "okay"; };
&uart3 { status = "disabled"; };
```

```text
CONFIG_RT_USING_SERIAL=y
CONFIG_RT_USING_SERIAL_V1=y
CONFIG_RT_SERIAL_8250=y
CONFIG_RT_SERIAL_8250_DW=y
CONFIG_RT_CONSOLE_DEVICE_NAME="uart1"
CONFIG_RT_SERIAL_RB_BUFSZ=128
```

Keep the DTS stdout path and Kconfig console name consistent. `board.c` buffers early output through the FDT early-console path; it no longer writes to a fixed UART3 address. Cross TX/RX and connect GND with a suitable 3.3 V serial adapter. COM4 was the test host assignment, not a fixed interface number.

## Native serial calls

| API | Unit / purpose |
| --- | --- |
| `rt_device_find(name)` | Locate a registered UART |
| `RT_DEVICE_CTRL_CONFIG` + `struct serial_configure` | Baud, word length, parity and stop bits |
| `rt_device_open(..., RT_DEVICE_FLAG_INT_RX)` | Interrupt receive and native ring buffer |
| `rt_device_set_rx_indicate()` | Notification; wake a thread, then read |
| `rt_device_read()` / `rt_device_write()` | Byte counts; check short transfers |
| `rt_device_close()` | Release the reference held by this caller |

## Complete transmit example

```c
#include <rtthread.h>
#include <rtdevice.h>
#include <string.h>
static int demo_uart_tx(int argc, char **argv)
{
    const char text[] = "UART1 native device write\r\n";
    rt_device_t uart = rt_device_find("uart1");
    rt_err_t ret;
    if (!uart) return -RT_ENOSYS;
    ret = rt_device_open(uart, RT_DEVICE_OFLAG_WRONLY);
    if (ret) return ret;
    rt_ssize_t sent = rt_device_write(uart, 0, text, strlen(text));
    rt_device_close(uart);
    return sent == (rt_ssize_t)strlen(text) ? 0 : -RT_EIO;
}
MSH_CMD_EXPORT(demo_uart_tx, Transmit through the native UART1 device);
```

Save as `applications/demo_uart.c`, build and run `demo_uart_tx` from the existing console. It opens one additional reference and sends one line without replacing the FinSH RX callback. For a separate UART application, first enable its DTS and free its pins, configure a `RT_SERIAL_CONFIG_DEFAULT` structure, then install a semaphore-based RX worker. Do not have both FinSH and an application consume UART1 RX: one consumer can steal the other's bytes.

## Complete interrupt receive example

Enable and route an additional UART in DTS before using this example; it intentionally refuses UART1 and already open devices. Save as `applications/demo_uart_rx.c`, then invoke `demo_uart_rx <uart-name>`. Send 115200 8N1 data from another adapter during the ten-second capture. The callback signals a semaphore; only the worker reads and prints. A pending semaphore prevents the read-empty / wait race from losing a notification.

```c
#include <rtthread.h>
#include <rtdevice.h>
#include <string.h>
static struct rt_semaphore uart_demo_ready;
static rt_err_t demo_uart_rx_notify(rt_device_t dev, rt_size_t size)
{
    return rt_sem_release(&uart_demo_ready);
}
static int demo_uart_rx(int argc, char **argv)
{
    struct serial_configure cfg = RT_SERIAL_CONFIG_DEFAULT;
    rt_device_t dev;
    int ret;
    if (argc != 2 || !strcmp(argv[1], RT_CONSOLE_DEVICE_NAME)) return -RT_EINVAL;
    dev = rt_device_find(argv[1]);
    if (!dev || dev->type != RT_Device_Class_Char || dev->ref_count) return -RT_EBUSY;
    cfg.baud_rate = BAUD_RATE_115200;
    cfg.data_bits = DATA_BITS_8; cfg.stop_bits = STOP_BITS_1; cfg.parity = PARITY_NONE;
    ret = rt_device_control(dev, RT_DEVICE_CTRL_CONFIG, &cfg);
    if (ret) return ret;
    ret = rt_sem_init(&uart_demo_ready, "uart-demo", 0, RT_IPC_FLAG_FIFO);
    if (ret) return ret;
    ret = rt_device_open(dev, RT_DEVICE_OFLAG_RDONLY | RT_DEVICE_FLAG_INT_RX);
    if (ret) { rt_sem_detach(&uart_demo_ready); return ret; }
    rt_err_t (*saved)(rt_device_t, rt_size_t) = dev->rx_indicate;
    rt_device_set_rx_indicate(dev, demo_uart_rx_notify);
    rt_tick_t start = rt_tick_get();
    while (rt_tick_get() - start < 10 * RT_TICK_PER_SECOND)
    {
        rt_uint8_t buf[32];
        rt_ssize_t n = rt_device_read(dev, 0, buf, sizeof(buf));
        if (n < 0) { ret = (int)n; break; }
        if (n == 0) { rt_sem_take(&uart_demo_ready, RT_TICK_PER_SECOND); continue; }
        for (rt_ssize_t i = 0; i < n; ++i) rt_kprintf("%02x ", buf[i]);
        rt_kprintf("\n");
    }
    rt_device_set_rx_indicate(dev, saved);
    rt_device_close(dev);
    rt_sem_detach(&uart_demo_ready);
    return ret;
}
MSH_CMD_EXPORT(demo_uart_rx, Capture an exclusively owned non-console UART);
```

## Receive flow and troubleshooting

```mermaid
flowchart LR
    RX["RX FIFO IRQ"] --> RB["Serial ring buffer"]
    RB --> CB["rx_indicate: signal worker"]
    CB --> READ["Worker rt_device_read"]
    READ --> PARSE["Protocol parser"]
```

Garbled text suggests baud/clock or electrical mismatch. Silent logs require checking DTS identity, PB0/PB1 routing, helper configuration and board power. A small receive ring can overflow under sustained traffic; increasing it does not replace timely draining. UART1 boot and shell operation were observed in the board regression; no external UART loopback test is claimed.
