---
name: f101-ram-boot-test
description: |
  F101 固件的 RAM 启动测试。把 Zephyr、RT-Thread 或 ESP-IDF 镜像经 FEL 加载到 PSRAM
  0x40000000 运行，读串口确认结果。不写 SPI NOR。当用户要求“刷固件测试”“load 内存跑”
  “RAM 启动”“测试固件”“别烧录 flash”“不要动 NOR”时使用。
---

# F101 RAM 启动测试

这个 skill 只做 RAM 测试：把已经构建好的镜像写进 PSRAM 运行，用串口确认结果。“刷固件测试”在这里指经 FEL 加载 RAM 镜像，不是写 NOR。整个过程不擦、不写 SPI NOR。

## 不能执行的命令

- `xfel spinor write`、`xfel spinor erase`：写 NOR。
- `xfel ddr f101-s3`：只有 S3 参数，S4 用它会初始化错误。
- `idf.py flash`、`idf.py monitor`：F101 没有对应的 runner。
- SyterKit 的 `flash-boot`、`xip-boot`、`spinor-boot` 里写 NOR 的步骤。
- 为了让板子进 FEL 而擦除 NOR 启动区。

需要改 NOR、XIP、UF2、Linux/Asterinas 或恢复启动链时，停下来，把原因告诉用户。

## 1. 确认板卡和访问方式

先确定板子是 F101S3（16 MiB PSRAM）还是 F101S4（32 MiB）。看丝印或板卡版本：V1.3、V1.4 是 S3，V1.5 是 S4。不确定就问用户，不要猜。S3 和 S4 的 helper 参数不同，用错会初始化失败或只认出 16 MiB。

访问方式二选一：

- 板子接在本机：直接用 `xfel`。
- 板子接在 ThunderWorkbench：先 `get_devices`、`get_device_config` 拿 `device_id`、串口和固件来源。用 `execute_host_command` 在后端主机跑 xfel，用 `power_control` 上下电，用 `get_serial_buffer`、`get_serial_log`、`search_serial_log` 读串口。MCP 连不上就停下来报告，不要改走本机 xfel。

本机先确认 FEL：

```sh
xfel version
```

应返回 `AWUSBFEX ID=0x00193700(F101)` 和 `scratchpad=0x00020000`。找不到设备时，让用户按住 FEL 键重新上电。Linux 权限问题见 `YuzukiNeko/docs/src/content/docs/boot/fel.md` 的 udev 规则。不要为了进 FEL 擦 NOR。

## 2. 检查镜像类型

RAM 镜像的入口和第一个 `LOAD` 段都在 `0x40000000`。路径按实际构建产物替换：

```sh
riscv64-unknown-elf-readelf -h build/<app>/zephyr/zephyr.elf
riscv64-unknown-elf-readelf -l build/<app>/zephyr/zephyr.elf
```

ESP-IDF 用 `riscv32-esp-elf-readelf`。Zephyr 的 `zephyr.bin`、RT-Thread 的 `rtt.bin`、ESP-IDF 的 `<app>.bin` 都可以加载。

入口是 `0x0e000000`，或者 overlay 把 `zephyr,flash` 指向 `xip_flash`（NekoBox、Bilibili、Miracast 的默认配置），说明这是 XIP 镜像，必须写 NOR 才能运行。停下来告诉用户，不要自己改成 XIP 烧录。

再确认大小不超过板卡 PSRAM：S3 小于 16 MiB，S4 小于 32 MiB。ESP-IDF 镜像还要确认 `CONFIG_ESP_F101_PSRAM_MB` 和板卡一致：S3 为 16，S4 为 32。

## 3. 准备 PSRAM helper

优先用已经构建好的：

- `out/syterkit-efex-s3/init_psram_efex.bin`
- `out/syterkit-efex-s4/init_psram_efex.bin`

没有就按 `YuzukiNeko/docs/src/content/docs/boot/psram-init.md` 构建，或用 `SyterKit/tools/efex-param.py` 从默认镜像生成。不要用 `xfel ddr` 代替。helper 的控制台默认是 UART1 PB00/PB01，115200 8N1。应用控制台按板卡走。

## 4. 初始化 PSRAM

每条命令单独执行，看输出再走下一步：

```sh
xfel version
xfel write 0x20000 out/syterkit-efex-s3/init_psram_efex.bin
xfel exec 0x20000
```

S4 换成 `out/syterkit-efex-s4/init_psram_efex.bin`。串口应打印：

```text
LPSRAM Type = APS128M
LPSRAM SIZE = 16 MB
LPSRAM simple test OK.
```

S4 的 `LPSRAM SIZE` 应是 32 MB。再跑一次 `xfel version`，能重新看到 F101 才说明 helper 返回了。容量或型号不对就停下，换正确的 helper，不要继续加载应用。

## 5. 写入、校验、执行

```sh
mkdir -p out
IMAGE=build/<app>/zephyr/zephyr.bin
SIZE=$(wc -c < "$IMAGE")
printf 'size: %s bytes (0x%x)\n' "$SIZE" "$SIZE"
xfel write 0x40000000 "$IMAGE"
xfel read 0x40000000 "$SIZE" out/ram-readback.bin
sha256sum "$IMAGE" out/ram-readback.bin
xfel exec 0x40000000
```

两个 SHA-256 一致才执行 `xfel exec`。不一致就停下来，重新跑 helper 和写入，不要执行不完整的镜像。

`xfel write` 写的是 PSRAM，不是 NOR，不需要擦除。`exec` 之后 FEL 的 USB 设备会消失，这是正常的。不要再跑 `xfel read32`、`xfel read` 或 `xfel version` 去确认。

## 6. 读串口

`yuzukineko` 的控制台是 UART1，PB00 TX / PB01 RX，115200 8N1。`f101_evb` 是 UART3，PE08/PE09。本机用：

```sh
picocom -b 115200 /dev/ttyUSB0
```

端口按实际设备改。ThunderWorkbench 用 `get_serial_buffer`、`get_serial_log`，并用 `search_serial_log` 搜关键字。

Zephyr `hello_world` 的预期输出：

```text
Hello World! yuzukineko/sun252i_f101
```

没有输出时依次检查：串口线和 TX/RX 是否交叉、终端波特率、镜像入口是不是 `0x40000000`、helper 是否返回 FEL、板子是否已经断电重启。没有重新进 FEL 就反复 `exec` 不会成功。

## 7. 下一次测试

执行应用之后 FEL 已经不可用。重新测试要重新上电进 FEL：

- NOR 启动区为空：上电自动进 FEL。
- NOR 里有可启动镜像：按住 FEL 键上电，再松开。

不要为了让板子自动进 FEL 去擦 NOR。需要恢复 NOR 启动链时，先让用户确认并备份。

## 8. 汇报

测试结束按这个格式汇报：

- 板卡：S3 或 S4，以及判断依据（丝印、版本或用户告知）。
- 镜像：路径、大小、SHA-256、ELF 入口和第一个 `LOAD` 地址。
- helper：路径和 SHA-256。
- 串口证据：helper 的 `LPSRAM ...` 行和应用的第一段输出。
- 结果：通过或失败，失败时给出失败的命令和原始输出。
- 明确写一句：本次没有写 SPI NOR。

## 停止条件

出现以下情况直接停下来问用户，不要自己绕过：

- 板卡型号不确定。
- 镜像是 XIP，或入口不是 `0x40000000`。
- 缺少匹配的 PSRAM helper，且无法按文档构建。
- 板子进不了 FEL，或串口没有输出。
- 用户要求把固件留在 NOR、做 UF2、XIP、Linux/Asterinas 启动。
