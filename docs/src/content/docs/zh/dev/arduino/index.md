---
title: "Arduino 开发"
---

本章介绍 YuzukiHD F101 开发板的 Arduino 核心，源码位于 [`YuzukiHD/Arduino`](https://github.com/YuzukiHD/Arduino)。文档基线为提交 `a5287509418eeaad36ee933cfa25334ce1022e15`（2026-10-09），平台版本 0.1.1。sketch 由普通的 `riscv-none-elf-gcc` 编译，链接到预编译的 Zephyr 核心；Arduino IDE 或 `arduino-cli` 在 FEL 模式下通过 xfel 把加载器、核心和 sketch 写入 SPI NOR。

## 板子

| 板子 | FQBN | 控制台 | 说明 |
| --- | --- | --- | --- |
| Allwinner F101 EVB | `yuzuki:f101:f101evb` | UART3，PE08/PE09 | 1024×600 RGB 屏 |
| YuzukiNeko | `yuzuki:f101:f101neko` | UART1，PB0/PB1 | 1024×768 MIPI DSI 屏；S3 或 S4 PSRAM |

| 项目 | 当前核心 |
| --- | --- |
| CPU | 玄铁 C907，RV32 `rv32imafdc`，`ilp32d`，单核 |
| 核心 | Zephyr 加核心代码和全部库，约 0.9 MB，链接在 `0x40000000` |
| sketch | 链接在 `0x40e00000`，代码和数据共 2 MiB 窗口 |
| 控制台 | `Serial`：EVB 是 UART3 PE08/PE09，YuzukiNeko 是 UART1 PB0/PB1，115200 8N1 |
| 存储 | SPI NOR：加载器 `0x000000`，核心 `0x200000`，sketch `0x400000` |
| 上传 | FEL 模式下的 xfel，使用 “Upload Using Programmer”；没有串口 bootloader |
| 工具链 | xPack RISC-V GCC 15.2.0，`riscv-none-elf-` |
| IDE | Arduino IDE 2.x 或 `arduino-cli`；Boards Manager 安装包 |
| 外设 | GPIO、UART、I²C、SPI、PWM、ADC、显示、音频、SD、USB、视频解码 |

## 本章内容

| 页面 | 内容 |
| --- | --- |
| [安装与上传 sketch](install.md) | Boards Manager、`arduino-cli`、FEL 驱动、上传、离线安装 |
| [预编译核心与 sketch ABI](core.md) | 内存布局、启动头、sketch 头、链接、符号导出 |
| [Arduino API 与引脚](api.md) | 数字 I/O、模拟、中断、串口路由、I²C、SPI、内存 |
| [示例 sketch](examples.md) | 27 个示例，各自用到的功能和需要的硬件 |
| [外设库](libraries.md) | 总览、`Wire`、`SPI`、`Watchdog`；显示、音频、存储/USB 和视频分册 |
| [构建核心与发行包](core-build.md) | `tools/build-core`、`tools/package`、CI、新增板卡 |
| [状态与已知限制](limits.md) | 已验证示例、库状态、API 限制、引脚冲突 |

## sketch 如何运行

加载器是 SyterKit 的 `flash-boot` 应用。它从 NOR 启动，初始化 PSRAM，读取 `0x200000` 的核心头页来定位核心和 sketch，把两者复制到 PSRAM，然后启动 Zephyr。核心在 `0x40e00000` 找到 sketch，检查头部，调用 `setup()` 和 `loop()`。

| NOR 偏移 | 内容 |
| --- | --- |
| `0x000000` | 加载器，三份副本，间隔 64 KiB |
| `0x030000` | UF2 下载器（系统程序） |
| `0x200000` | 核心头页和核心镜像 |
| `0x400000` | sketch 镜像 |

上电时按住 PD5，或者核心头无效，加载器会改为启动 UF2 下载器。头页和链接的细节见[预编译核心与 sketch ABI](core.md)。

## 第一个 sketch

1. 安装平台并选择板子，见[安装与上传 sketch](install.md)。
2. 打开 **File > Examples > YuzukiHD Boards > Blink**。
3. 让板子进入 FEL：按住 FEL 键上电或复位，然后松开。
4. 选择 **Sketch > Upload Using Programmer**（Ctrl+Shift+U）。
5. 在控制台串口上以 115200 打开串口监视器。

示例使用 `LED_BUILTIN`，两个变体上都定义为 `PA0`。两块板子都没有标注用户 LED，需要自己接一个到 PA0，或者改掉这个引脚。

```cpp
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("F101 Arduino: Blink");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("on");
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("off");
  delay(500);
}
```

上传后每次上电都会运行这个 sketch。要再次上传，需要重新进入 FEL；从 NOR 启动的板子不会自己进入 FEL。

:::caution
上传会写 SPI NOR，覆盖 `0x000000` 的加载器、`0x200000` 的核心和 `0x400000` 的 sketch，这些区域里原有的固件会丢失。第一次上传前先备份整片 Flash，见 [SPI NOR 布局与备份](../../boot/flash-layout.md)。
:::

## 与 Zephyr 的关系

核心本身是一个 Zephyr 应用：Arduino API 建立在 Zephyr 驱动之上，预编译核心包含 Zephyr 内核、驱动和全部库。sketch 不构建 Zephyr，也不能修改 Kconfig 或设备树；它链接到 `core.elf` 导出的符号，运行在固定的 RAM 窗口里。板级差异放在 `variants/<name>/`（`pins_arduino.h`、`<name>.overlay`、`<name>.conf`）里，不放在 sketch 里。
