---
title: "预编译核心与 sketch ABI"
---

Arduino 支持分成两个二进制。核心是一个带 Arduino API 和全部库的 Zephyr 镜像，按板子各构建一次，随 Boards Manager 安装包发布。sketch 是由 Arduino IDE 单独编译的小程序，链接到核心的符号表。加载器把两者复制到 PSRAM 并启动核心，核心通过一个固定头部找到 sketch。

## 内存布局

| 区域 | 地址 | 大小 |
| --- | --- | --- |
| NOR 里的加载器 | `0x000000` | 三份副本，间隔 64 KiB |
| 系统程序（UF2 下载器） | `0x030000` | 最多约 1.8 MiB |
| NOR 里的核心头和核心 | `0x200000` | 4 KiB 头页加约 0.9 MB |
| NOR 里的 sketch | `0x400000` | 最多 2 MiB |
| PSRAM 里的核心 | `0x40000000` | 约 0.9 MB，链接在这个地址 |
| PSRAM 里的 sketch 窗口 | `0x40e00000` | 2 MiB |
| 堆 | 核心镜像末尾到 `0x40e00000` | 14 MiB 里剩下的部分 |

核心的 `prebuilt.overlay` 把 `sram0` 缩到 `0x40000000`..`0x40e00000`，所以 libc 堆在 sketch 窗口之前结束。sketch 窗口是 16 MiB PSRAM 顶部的 2 MiB。

## 启动头

加载器读取核心镜像前面的 4 KiB 头页，字段如下：

| 字段 | 核心镜像里的值 | 含义 |
| --- | --- | --- |
| `magic` | `0x44524146`（`FARD`） | 镜像标记 |
| `version` | 2 | 头版本 |
| `load` | `0x40000000` | 核心在 PSRAM 的地址，也是入口 |
| `size` | 核心大小 | 头页之后的字节数 |
| `id` | 构建时间戳 | 核心 ID，sketch 会匹配它 |
| `extra_load` | `0x40e00000` | sketch 在 PSRAM 的地址 |
| `extra_max` | `0x200000` | sketch 的最大大小 |
| `extra_offset` | `0x400000` | sketch 头在 NOR 的偏移 |

magic 匹配、版本为 2、大小非零且在应用区内、`load` 指向 PSRAM、核心不和 extra 部分重叠时，加载器才接受这个镜像。上电时按住 PD5，或者头无效，加载器改为启动 `0x030000` 的系统程序。

## sketch 头

sketch 以 `struct f101_sketch_header` 开头，由 `cores/f101/sketch_entry.cpp` 放进 `.f101_header` 段：

| 字段 | 含义 |
| --- | --- |
| `magic` | `0x31303146`（`F101`） |
| `abi` | ABI 版本，当前为 1 |
| `core_id` | sketch 链接时对应的核心 |
| `setup`、`loop` | 两个 sketch 入口 |
| `serial_event`、`serial_event1` | 可选的 `Serial` / `Serial1` 事件处理函数 |
| `init_array_start`、`init_array_end` | C++ 静态构造函数 |
| `bss_start`、`bss_end` | 核心负责清零的区域 |
| `image_end` | 复制镜像的末尾 |

头在 PSRAM 的 `0x40e00000`，在 NOR 的 `0x400000`。加载器从 NOR 读头得到 `image_end`，复制 `image_end - 0x40e00000` 字节，然后跳到核心。

## 启动流程

1. Boot ROM 把加载器从 NOR 载入 SRAM。
2. 加载器读取 NOR `0x200000` 的核心头并校验。
3. 按住 PD5 或头无效时，改为启动 NOR `0x030000` 的系统程序。
4. 把核心复制到 `0x40000000`。
5. 读取 NOR `0x400000` 的 sketch 头，把 sketch 复制到 `0x40e00000`，回写数据缓存。
6. 核心启动，使缓存失效，检查 sketch 的 magic、ABI 版本和核心 ID，清零 sketch 的 BSS，运行 C++ 构造函数，调用 `setup()`，然后一直调用 `loop()`。
7. 每次 `loop()` 之后，核心检查 `Serial.available()` 和 `Serial1.available()`，如果 sketch 定义了对应的 `serialEvent` 钩子就调用它。

用另一块板子或另一次构建的核心时，`core_id` 检查会失败，固件打印 `the sketch was built for another core` 然后空转。核心重建后 sketch 必须重新编译，原因就在这里。

## 链接 sketch

Arduino IDE 用 xPack `riscv-none-elf-g++` 编译 sketch，并链接到 `prebuilt/<variant>-core/core.elf`。链接只使用核心的符号，不会把核心代码打进 sketch。关键参数是：

```sh
riscv-none-elf-g++ -mabi=ilp32d -march=rv32imafdc_zicsr_zifencei \
  -nostdlib -static -Wl,--no-relax -Wl,--gc-sections -Wl,--no-warn-rwx-segments \
  -Wl,-u,f101_sketch_header -Wl,-T,prebuilt/sketch.ld \
  -Wl,--just-symbols=prebuilt/<variant>-core/core.elf \
  -Wl,-Map,<build>/<sketch>.map -o <sketch>.elf <objects> <archive> -lm -lgcc
```

`-Wl,--just-symbols` 只取核心导出符号的地址，不复制它的段。`-Wl,-u,f101_sketch_header` 让头保留下来，即使 sketch 里没有代码引用它。`sketch.ld` 把 `.header` 放在 `0x40e00000` 最前面，后面是 `.text`、`.rodata`、`.init_array`、`.data`，以及不进入镜像的 `.bss`。sketch 链接工具链的 `libm` 和 `libgcc`，其余 C 库来自核心。

## 符号导出

普通的 Zephyr 链接会丢掉核心自己没调用的函数，但 sketch 可能调用任意 `Print`、`String`、`Wire` 或 `SPI` 方法。`tools/build-core` 因此用响应文件对核心做第二次链接，为核心对象和 C/C++ 库定义的每个全局符号加上 `-u`。这样 `core.elf` 会保留这些符号，`--just-symbols` 才能解析 sketch 的调用。

核心 ID 是一个绝对符号 `f101_core_id_value`，由 `-Wl,--defsym` 设置。sketch 头在链接时复制它的值，核心启动时和自己的值比较。

## Zephyr 配置

公共 `prj.conf` 打开 C++17、`printk`、`printf` 浮点、GPIO、串口和中断驱动 UART。它关闭 shell 和 UART 日志后端，让 `Serial` 独占控制台；主栈设为 16 KiB，libc malloc arena 设为负数（使用镜像之上的全部 RAM），内核堆 16 KiB。

每个变体再加 I²C、SPI、PWM、ADC、FPU 和 FPU sharing，默认关闭显示、G2D、MIPI DBI 和 USB PHY。需要这些功能的库自带 `f101.conf` 和 `f101.overlay`，核心构建会把它们合并进来。`Display` 借此重新打开屏幕链路，`USBHost` 借此启用 CherryUSB 主机栈，而不用让每个 sketch 都付出代价。

## 控制台差异

核心的 `Serial` 是板级控制台：YuzukiNeko 是 UART1 PB0/PB1，EVB 是 UART3 PE8/PE9。加载器自己的日志在 `loader/flash-boot/main.c` 里固定为 UART3，所以 YuzukiNeko 上加载器的 banner 和 `Serial` 不在同一组引脚。sketch 的输出始终在板级控制台上。
