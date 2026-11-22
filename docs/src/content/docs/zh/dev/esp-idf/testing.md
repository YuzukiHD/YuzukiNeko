---
title: "验证与已知限制"
---

本页区分“能编译链接”和“在实板上跑过”。ESP-IDF 组件很多，交叉编译通过只能证明接口和依赖成立，不能证明外设的电气连接或时序正确。

## 验证基线

| 项目 | 值 |
| --- | --- |
| 日期 | 2026-11-22 |
| 源码 | `YuzukiHD/esp-idf`，分支 `sun252i-f101`，提交 `c71329b4d15` |
| ESP-IDF | v6.1.0 |
| 工具链 | `riscv32-esp-elf` `esp-15.2.0_20251204` |
| PSRAM 助手 | SyterKit `main` @ `61ac087b0`，按板卡生成 S3/S4 参数镜像；S3 已实测 |
| 板卡 | YuzukiNeko 核心板与 YuzukiCube-M 底板 |
| 控制台 | UART1 PB0/PB1，115200 8N1，ThunderWorkbench 串口日志 |

## 构建覆盖

| 范围 | 结果 |
| --- | --- |
| `hello_world` | 干净目录构建通过，FEL 运行通过 |
| 驱动集合 | GPIO、UART、I2C、SPI、GPTimer、LEDC、ADC、SD/MMC、DMA、I2S 构建链接通过 |
| 显示集合 | `esp_lcd`、JD9168S、GT967、触摸接口构建链接通过 |
| 加速器 | PPA、JPEG 解码构建链接通过 |
| 存储 | `spi_flash`、`esp_partition`、NVS 构建链接通过 |
| Wi-Fi | AIC8800、esp_wifi、esp_netif、lwIP、mbedTLS 构建链接通过 |

驱动集合使用一个启用 `MINIMAL_BUILD` 的测试项目，`main` 的 `REQUIRES` 列出上述组件，并包含全部公开头文件。

## 运行检查

- `hello_world` 从 `0x40000000` 启动，打印芯片信息、16 MiB NOR 和约 16,306 KiB 堆，`esp_restart()` 后回到 FEL。
- Wi-Fi 测试应用初始化 AIC8800，下载固件，扫描到 11 个 AP。日志中出现 `wifi open ok`、`aic_wifi_init ok` 和 `found 11 APs`。
- 显示、触摸、音频、SD 卡、NVS 读写、ADC 和定时器没有在本次实板会话中执行；它们的页面代码都经过编译，但运行结果需要单独验证。
- SyterKit helper 在每次进入 FEL 后先执行 `write 0x20000` + `exec 0x20000`，串口报告 `LPSRAM Type = APS128M`、`SIZE = 16 MB`、`simple test OK`，然后返回 FEL；之后才执行 `write 0x40000000` + `exec 0x40000000`。不使用 `xfel ddr f101-s3`。
- 本次实板是 16 MiB F101S3，使用 252 MHz、APS128M、ZQ `0x007bfbfb` 的 S3 参数镜像，回读 `psram.size_mb=16`、`init_ok=1`。S4 使用 192 MHz、W958、ZQ `0x007bfffb`、32 MiB、`tpr11=0x00ff44ff` 的独立参数镜像，参数来自 SyterKit 的 W958 表，但 32 MiB 实板尚未验证。
- ESP-IDF 的 `CONFIG_ESP_F101_PSRAM_MB=32` 配置已交叉编译通过，生成的链接脚本 RAM 长度为 32 MiB；它只证明链接和堆描述正确，不代表 S4 实板已启动。

## 已知限制

- 没有 bootloader、OTA、secure boot 和 flash encryption；`idf.py flash` 不可用。
- 没有 Bluetooth 协议栈，Wi-Fi 只有 station 模式；AIC8800 的蓝牙复位线和 HCI 未接入 ESP-IDF。
- 没有低功耗、deep sleep、动态调频和双核；RVV 和 Sv32 分页也未启用。
- `esp_random()` 不是密码学随机源，eFuse 只读且没有 MAC 地址。
- GPIO 没有 GPIO matrix；`gpio_config()` 的 64 位掩码只覆盖 PA/PB，PC 到 PF 要逐脚配置。
- UART 没有 RTS/CTS 流控；I2C 只支持 7 位地址和主机模式；SPI 是轮询的 8 位主机；SD/MMC 也是轮询实现。
- `spi_flash_mmap()` 返回 RAM 副本，不是 XIP 映射；映射之后的 flash 写入不会反映到副本。
- NVS 需要 NOR 中已有的分区表；FEL 只下载 RAM 镜像，不会自动写入分区表。
- `xfel ddr f101-s3` 只有 S3 的固定参数，不能用于 S4；RAM 流程必须先用 SyterKit helper 初始化 PSRAM。
- 显示和音频的板级连线按 YuzukiNeko 与 YuzukiCube-M 描述，其他底板需要修改引脚和描述符。

## 报告问题

报告时附上提交哈希、`sdkconfig` 中的构建类型和控制台配置、完整构建命令、xfel 命令及串口日志。若问题只在实板出现，说明底板型号、屏幕和 Wi-Fi 模块是否连接，并区分“构建失败”“加载失败”和“运行后无输出”。
