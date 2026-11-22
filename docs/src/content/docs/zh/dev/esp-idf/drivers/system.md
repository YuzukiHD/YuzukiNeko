---
title: "系统、时钟与内存"
---

这一页覆盖应用启动之后会用到的系统服务：CPU 频率、PLIC 中断、esp_timer、任务看门狗、RTC、eFuse、随机数、堆和 cache。外设驱动页只在使用这些服务时引用本页。

## 时钟

`CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ` 的范围是 72 到 1008，默认 600。启动代码以 72 MHz 为步进提升 `PLL_CPU`，每一步之后做内存测试，失败就退回上一个频率。供电电压不随频率改变，所以高频率不保证在所有板卡和温度下稳定。运行时读取当前频率：

```c
#include "esp_private/esp_clk.h"

printf("cpu %d Hz, apb %d Hz\n", esp_clk_cpu_freq(), esp_clk_apb_freq());
```

外设模块时钟来自 24 MHz 晶振或 PLL_PERI，具体分频由各驱动设置。UART、I2C、SPI 和定时器的驱动都按 24 MHz 参考时钟计算分频，修改 SoC 时钟树会同时影响这些外设。

## 中断

PLIC 有 192 个中断源，`esp_intr_alloc()` 的第一个参数就是 PLIC 中断号。优先级用 `ESP_INTR_FLAG_LEVEL1` 到 `LEVEL7` 表示，对应 PLIC 优先级 1 到 7。同一时刻只有一个中断在处理，没有嵌套抢占。GPIO 的 bank 中断、UART、DMA、显示和加速器都通过这个接口注册。

中断处理程序运行在中断上下文，不能调用会阻塞的 API。需要唤醒任务时使用 `xTaskNotifyFromISR`、队列的 `FromISR` 变体或信号量，并在返回前处理 `portYIELD_FROM_ISR`。

## 时间

`esp_timer` 使用 CLINT 的 24 MHz `mtime`，提供微秒级单调时间：

```c
int64_t now = esp_timer_get_time();
```

FreeRTOS 的 tick 和 `esp_timer` 的 alarm 共用 `mtimecmp`，移植层在每次设置时取两者中较早的截止时间。`gettimeofday()` 和 `time()` 默认只使用高分辨率定时器，不读取 RTC。这样休眠或掉电后系统时间不会保持，但读取开销最小。需要跨复位保持时间时使用 RTC。

## 看门狗

任务看门狗通过 `esp_task_wdt.h` 使用，超时范围由硬件编码为 0.5 到 16 秒。检查由 `esp_timer` 回调执行，SoC 的复位模式看门狗作为后备。即使检查任务本身卡住，系统也会复位。

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

`esp_task_wdt_reconfigure()` 用于已经初始化的看门狗。首次启用时改用 `esp_task_wdt_init()`，并检查返回值。`esp_task_wdt_add(NULL)` 把当前任务加入订阅列表。长时间运算、阻塞等待或大块 flash 操作之前要评估超时。不要在中断里喂狗。

## RTC

RTC 保存日期和时分秒，日期以 1970-01-01 为第 1 天，可表示到 2097 年。32 kHz 时钟由 24 MHz 晶振除以 750 得到，精度跟随晶振，但只在芯片供电时运行。接口在 `f101_rtc.h`：

```c
#include "f101_rtc.h"

struct tm tm;
f101_rtc_get_time(&tm);
```

`f101_rtc_set_time()` 写入日期和时间，写入通过慢速寄存器路径完成，连续写入需要等待忙位清除。RTC 不是掉电保持的电池时钟。板子完全断电后时间丢失。

## eFuse、芯片标识与 MAC

eFuse 是 SID 控制器后面的 512 位只读数据，分为 16 个字。`esp_efuse_read_field_blob()` 和 `esp_efuse_read_field_bit()` 可读，`ESP_EFUSE_CHIP_ID` 是 128 位芯片标识。写入、烧写和加密 API 不支持。

`esp_chip_info()` 返回型号、单核和 `CHIP_FEATURE_EMB_PSRAM`。SoC 没有 MAC fuse，`esp_efuse_mac_get_default()` 对 chip id 做 FNV-1a 哈希并设置本地管理位，得到每颗芯片稳定的默认 MAC。它不是 IEEE 分配的地址，量产时需要自行写入或从外部存储读取。

## 随机数

```c
uint32_t v = esp_random();
esp_fill_random(buf, len);
```

实现是 xorshift，种子来自 timer 和 chip id，输出可预测。它适合初始化扰动、退避抖动和测试数据，不适合密钥、nonce、会话令牌或任何安全用途。芯片没有硬件 TRNG 或 crypto 加速器。

## 堆与 cache

整块 PSRAM 都是同一种堆内存，`MALLOC_CAP_INTERNAL`、`MALLOC_CAP_DMA` 和 `MALLOC_CAP_EXEC` 同时成立，caps 参数不会切换内存区域。大块显示帧缓冲和 Wi-Fi 固件都从这里分配，分配失败时先检查剩余堆和碎片。

数据 cache 行大小为 64 字节。DMA 或外设读取 CPU 写入的缓冲之前，要 clean。CPU 读取外设写入的缓冲之前，要 invalidate：

```c
esp_cache_msync(buf, size, ESP_CACHE_MSYNC_FLAG_DIR_C2M);
esp_cache_msync(buf, size, ESP_CACHE_MSYNC_FLAG_DIR_M2C);
```

地址和长度默认必须按 64 字节对齐。不对齐时加 `ESP_CACHE_MSYNC_FLAG_UNALIGNED`，驱动会在内部扩大范围。

## Panic 与复位

`esp_restart()` 调用 ROM 的软件复位，芯片回到 FEL，RAM 镜像丢失。panic 时 `panic.c` 打印任务、寄存器和回溯。如果异常发生在调度器启动之前，`start.S` 的早期处理程序直接向 UART3 输出 `mcause`、`mepc`、`mtval` 和栈内容，然后停住。

panic 输出依赖控制台 UART 已经初始化。启动早期没有任何输出时，先检查控制台引脚、供电和 FEL 是否成功，再检查镜像入口是否为 `0x40000000`。
