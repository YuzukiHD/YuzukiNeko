---
title: "构建、加载与运行"
---

ESP-IDF 的构建产物不是可直接烧到 NOR 的固件，而是一个链接在 `0x40000000` 的 RAM 镜像。下面的流程从空项目开始，最后用 xfel 通过 FEL 把镜像写入 PSRAM 并执行。所有命令都在[环境](setup.md)激活后的终端里运行。

## 项目结构

一个最小项目只有三个文件：

```text
hello_f101/
  CMakeLists.txt
  main/CMakeLists.txt
  main/main.c
```

顶层 `CMakeLists.txt` 必须启用 `MINIMAL_BUILD`，否则 ESP-IDF 会把 `components/` 下的所有组件都加入配置，其中包含与 F101 无关的蓝牙、OpenThread 和测试组件：

```cmake
cmake_minimum_required(VERSION 3.22)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(hello_f101)
```

`main/CMakeLists.txt` 声明应用源文件和它需要的组件。不写 `REQUIRES` 时只会链接默认组件。用到哪个驱动就把它加进来：

```cmake
idf_component_register(SRCS "main.c")
```

`main/main.c` 是普通 ESP-IDF 应用：

```c
#include <stdio.h>

void app_main(void)
{
    printf("Hello from F101\n");
}
```

## 设置目标

首次配置或切换目标时运行：

```sh
IDF_SKIP_CHECK_SUBMODULES=1 IDF_COMPONENT_MANAGER=0 idf.py --preview set-target sun252i-f101
```

`--preview` 是必需的，因为 `sun252i-f101` 属于预览目标。`IDF_SKIP_CHECK_SUBMODULES=1` 阻止 CMake 再次初始化所有子模块。`IDF_COMPONENT_MANAGER=0` 关闭组件管理器，本移植不使用受管组件。目标只能在空构建目录里设置。修改目标后先执行 `idf.py fullclean` 或删除 `build/`。

## 控制台配置

F101 的默认控制台是 UART1，TX 为 PB0（GPIO 32），RX 为 PB1（GPIO 33），115200 8N1，与 YuzukiNeko 的板载串口一致。默认值来自 `components/esp_stdio/Kconfig` 的 F101 条件默认项。

`f101_evb` 的控制台是 UART3，TX 为 PE8（GPIO 136），RX 为 PE9（GPIO 137）。使用 EVB 时运行 `idf.py menuconfig`，在 `Component config → ESP-STDIO → Channel for console output` 选择 `Custom UART`，再选择 `UART3` 并填入两个 GPIO。对应的 `sdkconfig` 行为：

```text
CONFIG_ESP_CONSOLE_UART_CUSTOM=y
CONFIG_ESP_CONSOLE_UART_CUSTOM_NUM_3=y
CONFIG_ESP_CONSOLE_UART_TX_GPIO=136
CONFIG_ESP_CONSOLE_UART_RX_GPIO=137
```

## 构建

F101S4 板卡还要把 `CONFIG_ESP_F101_PSRAM_MB` 设为 32。默认值 16 对应 F101S3。这个值同时决定链接脚本的 RAM 长度和堆的上界，必须和 PSRAM helper 初始化的容量一致。可以在 `idf.py menuconfig` 的 `ESP System Settings` 中修改，或直接写入 `sdkconfig`：

```text
CONFIG_ESP_F101_PSRAM_MB=32
```

然后构建：

```sh
IDF_SKIP_CHECK_SUBMODULES=1 IDF_COMPONENT_MANAGER=0 idf.py build
```

构建完成后，产物在 `build/` 下：

| 文件 | 内容 |
| --- | --- |
| `hello_f101.elf` | 带符号的完整镜像，入口 `0x40000000` |
| `hello_f101.map` | 链接映射，检查段地址和符号 |
| `bootloader/` | RAM 构建不生成，目录不存在是正常的 |
| `hello_f101.bin` | RAM 构建不自动生成，需要自己转换 |

## 生成可加载镜像

`idf.py` 的 `elf2image` 步骤针对 ESP 系列芯片，不支持 F101，所以 RAM 构建不会生成 `.bin`。用工具链的 `objcopy` 把 ELF 的加载段转换成裸二进制：

```sh
riscv32-esp-elf-objcopy -O binary build/hello_f101.elf build/hello_f101.bin
```

镜像的第一个字节位于 `0x40000000`，长度等于 ELF 中 `LOAD` 段的大小。可以用 `riscv32-esp-elf-readelf -l build/hello_f101.elf` 检查 `VirtAddr` 和 `FileSiz`。如果入口不是 `0x40000000`，不要加载。

## 准备 PSRAM helper

`xfel ddr f101-s3` 只带 S3 参数，不能初始化 S4。S3 与 S4 需要使用不同的 `dram_para` 表。按全局专题 [PSRAM 初始化与 RAM 启动](../../boot/psram-init.md) 构建与板卡匹配的 `init_psram_efex_s3.bin` 或 `init_psram_efex_s4.bin`，本章后面的命令假定该文件已经准备好。

## 通过 FEL 加载并运行

板子进入 FEL 后，先用与板卡匹配的 helper 初始化 PSRAM。下面以 S3 为例，S4 把文件名换成 `init_psram_efex_s4.bin`：

```sh
xfel version
xfel write 0x20000 init_psram_efex_s3.bin
xfel exec 0x20000
```

串口应打印与参数表一致的 `LPSRAM CLK`、`LPSRAM Type`、`LPSRAM SIZE` 和 `LPSRAM simple test OK.`，随后 helper 返回 FEL。再次执行 `xfel version` 能重新看到 `AWUSBFEX ID=0x00193700(F101)`，说明 helper 已经返回。不要在 helper 之前执行 `xfel ddr`。

然后写入并运行 ESP-IDF 镜像：

```sh
xfel write 0x40000000 build/hello_f101.bin
xfel exec 0x40000000
```

`xfel write` 不需要擦除，写入的是 PSRAM 而不是 NOR。`xfel exec` 把 PC 设为 `0x40000000` 后交棒，USB FEL 设备随后从主机上消失是正常的。

## 预期输出

串口 115200 8N1 上应看到类似下面的内容。helper 的容量行在 S3 上是 16 MB，在 S4 上是 32 MB。时间戳和堆大小会随应用变化：

```text
LPSRAM type detection done.
LPSRAM Type = APS128M
LPSRAM SIZE = 16 MB
LPSRAM simple test OK.
ESP-ROM:sun252i-f101-fel
Build:Nov 22 2026
rst:0x1 (POWERON),boot:0x0 (FEL_DOWNLOAD)
I (4045) cpu_start: Pro cpu up.
I (4048) cpu_start: Pro cpu start user code
I (4052) cpu_start: cpu freq: 600000000 Hz
I (4055) heap_init: Initializing. RAM available for dynamic allocation:
I (4062) heap_init: At 400136F0 len 00FEC910 (16306 KiB): RAM
I (4076) spi_flash: flash id 0x852018, 16 MiB
I (4080) main_task: Calling app_main()
Hello from F101
```

`ESP-ROM:sun252i-f101-fel` 是移植的启动横幅，不是芯片 ROM 的原生输出。应用调用 `esp_restart()` 后芯片会重新进入 FEL，镜像不会保留。断电再上电也会回到 FEL，除非 NOR 中存在可启动的镜像。

## 重新构建与清理

修改源码后直接再次 `idf.py build`。修改 `sdkconfig` 后 CMake 会自动重新配置。修改目标或组件依赖后使用：

```sh
idf.py fullclean
IDF_SKIP_CHECK_SUBMODULES=1 IDF_COMPONENT_MANAGER=0 idf.py --preview set-target sun252i-f101
```

每个应用使用独立的项目目录和 `build/`。不要把 F101 的构建目录与 ESP32 目标或其他 ESP-IDF 版本的构建目录混用。

## 烧录与监视

F101 没有 `idf.py flash` 所需的烧录 runner，也没有从 NOR 启动的引导链，所以 `idf.py flash` 不可用。`idf.py monitor` 会调用 esptool 复位芯片，同样不适用于 FEL 流程。串口输出用 ThunderWorkbench、`picocom` 或其他 115200 8N1 终端查看。

需要重新加载时，重新进入 FEL，先重跑 SyterKit helper 的 `write 0x20000` + `exec 0x20000`，再写入并执行镜像。xfel 的安装、udev 权限和 Windows 驱动见 [FEL 工具](../../boot/fel.md)。
