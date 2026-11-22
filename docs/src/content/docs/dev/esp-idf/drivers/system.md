---
title: "System, clocks and memory"
---

This page covers the system services an application uses after startup: CPU frequency, PLIC interrupts, esp_timer, the task watchdog, RTC, eFuse, random numbers, the heap and the cache. Peripheral pages refer here when they use one of these services.

## Clocks

`CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ` ranges from 72 to 1008 and defaults to 600. The startup code raises `PLL_CPU` in 72 MHz steps and runs a memory test after each step, undoing a failing step; the supply voltage does not change with frequency, so a high setting is not guaranteed to be stable on every board and temperature. Read the current frequency at runtime:

```c
#include "esp_private/esp_clk.h"

printf("cpu %d Hz, apb %d Hz\n", esp_clk_cpu_freq(), esp_clk_apb_freq());
```

Peripheral module clocks come from the 24 MHz crystal or PLL_PERI, divided by each driver. The UART, I2C, SPI and timer drivers all derive their divisors from the 24 MHz reference, so changing the SoC clock tree affects those peripherals as well.

## Interrupts

The PLIC has 192 interrupt sources, and the first argument of `esp_intr_alloc()` is the PLIC interrupt number. Priorities use `ESP_INTR_FLAG_LEVEL1` through `LEVEL7`, mapping to PLIC priorities 1 through 7; only one interrupt is serviced at a time and there is no nested preemption. GPIO bank interrupts, UART, DMA, display and the accelerators all register through this interface.

Handlers run in interrupt context and must not call blocking APIs. To wake a task, use `xTaskNotifyFromISR`, the `FromISR` queue variants or a semaphore, and handle `portYIELD_FROM_ISR` before returning.

## Time

`esp_timer` uses the CLINT 24 MHz `mtime` and provides monotonic microseconds:

```c
int64_t now = esp_timer_get_time();
```

The FreeRTOS tick and the `esp_timer` alarm share `mtimecmp`, and the port programs the earlier of the two deadlines each time. `gettimeofday()` and `time()` use only the high-resolution timer by default and do not read the RTC; system time is therefore lost across power loss, but reads are cheap. Use the RTC when time must survive a reset.

## Watchdog

The task watchdog uses `esp_task_wdt.h`; the hardware encodes timeouts from 0.5 to 16 seconds. The check runs from an `esp_timer` callback, and the SoC watchdog in reset mode is the backstop: even if the checking task itself hangs, the system resets.

```c
esp_task_wdt_config_t cfg = {
    .timeout_ms = 5000,
    .idle_core_mask = 0,
    .trigger_panic = true,
};
esp_task_wdt_reconfigure(&cfg);
esp_task_wdt_add(NULL);
esp_task_wdt_reset();
```

`esp_task_wdt_reconfigure()` applies to an already initialized watchdog; use `esp_task_wdt_init()` for the first enable and check the return value. `esp_task_wdt_add(NULL)` subscribes the current task. Evaluate the timeout before long computations, blocking waits or large flash operations; never feed the watchdog from an interrupt.

## RTC

The RTC stores a date and a time of day, with 1970-01-01 as day 1 and a range through 2097. Its 32 kHz clock is the 24 MHz crystal divided by 750: accurate to the crystal, but running only while the chip is powered. The interface is in `f101_rtc.h`:

```c
#include "f101_rtc.h"

struct tm tm;
f101_rtc_get_time(&tm);
```

`f101_rtc_set_time()` writes the date and time through a slow register path; consecutive writes must wait for the busy bit to clear. The RTC is not a battery-backed clock; a full power loss loses the time.

## eFuse, chip identity and MAC

eFuse is 512 bits of read-only data behind the SID controller, organized as 16 words. `esp_efuse_read_field_blob()` and `esp_efuse_read_field_bit()` read it, and `ESP_EFUSE_CHIP_ID` is the 128-bit chip identity. Write, program and encryption APIs are unsupported.

`esp_chip_info()` returns the model, one core and `CHIP_FEATURE_EMB_PSRAM`. The SoC has no MAC fuse; `esp_efuse_mac_get_default()` hashes the chip id with FNV-1a and sets the locally administered bit, producing a stable default MAC per chip. It is not an IEEE-assigned address; production images need their own address or an address stored externally.

## Random numbers

```c
uint32_t v = esp_random();
esp_fill_random(buf, len);
```

The implementation is xorshift seeded from the timer and the chip id, and its output is predictable. It suits initialization noise, backoff jitter and test data, not keys, nonces, session tokens or any security purpose. The chip has no hardware TRNG or crypto accelerator.

## Heap and cache

The whole PSRAM is one kind of heap memory: `MALLOC_CAP_INTERNAL`, `MALLOC_CAP_DMA` and `MALLOC_CAP_EXEC` all hold, and the caps argument does not switch memory regions. Large display frame buffers and Wi-Fi firmware come from this heap; when allocation fails, check both free heap and fragmentation.

The data cache line is 64 bytes. Before a DMA engine or peripheral reads a buffer written by the CPU, clean it; before the CPU reads a buffer written by a peripheral, invalidate it:

```c
esp_cache_msync(buf, size, ESP_CACHE_MSYNC_FLAG_DIR_C2M);
esp_cache_msync(buf, size, ESP_CACHE_MSYNC_FLAG_DIR_M2C);
```

Addresses and lengths must be 64-byte aligned by default; add `ESP_CACHE_MSYNC_FLAG_UNALIGNED` when they are not, and the driver widens the range internally.

## Panic and reset

`esp_restart()` calls the ROM software reset, returning the chip to FEL and discarding the RAM image. On a panic, `panic.c` prints the task, registers and backtrace; if the exception happens before the scheduler starts, the early handler in `start.S` prints `mcause`, `mepc`, `mtval` and stack words directly to UART3 and stops.

Panic output requires the console UART to be initialized. When there is no output at all during early startup, check the console pins, power and whether FEL succeeded before suspecting the image; also verify that the entry is `0x40000000`.
