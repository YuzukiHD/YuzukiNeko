# 快速开始

本页带你用最短路径让板子跑起来。三条路线任选其一，<strong>都需要先能让板子进入 FEL 下载模式</strong>。

## 你需要准备

- 一块 YuzukiNeko，一根 <strong>USB 数据线</strong>（不是纯充电线）。板子只有一个 USB-C 口，它既供电，也是 FEL 下载口和 USB 设备/主机口。
- 一个 <strong>USB 转串口适配器</strong>（3.3 V 电平），用来看控制台输出。串口默认 115200 8N1，无流控。
- 一台 Windows / Linux / macOS 主机。
- 下载工具 <strong>xfel</strong> 或 <strong>rfel</strong>，见 [FEL 下载模式与工具](boot/fel.md)。

?> 所有外部接口都按 <strong>3.3 V 逻辑</strong>设计，`5V` 脚只是电源，不要把 5 V 信号接到 GPIO 上。

## 认清你的板子版本

丝印和 PCB 上写着版本号。版本不同，引脚标号和部分元件不同，开始前先看一眼：

| 版本 | 要点 |
| --- | --- |
| V1.3 | PD 脚丝印错误（`PD10` 起比真实 GPIO 少 2），<strong>按[勘误表](hardware/errata.md)换算</strong>；microSD 检测下拉偏大 |
| V1.4 | 丝印已更正；microSD 检测下拉 `R11` 仍是 10 kΩ，换成 1 kΩ 即可 |
| V1.5 | 增加 PSRAM 专用 LDO，支持 32 MiB PSRAM；`R11` 已改为 1 kΩ |

详见[勘误与版本差异](hardware/errata.md)。

## 路线 A：刷入 RustSBI + Asterinas，进入 BusyBox shell

适合想直接看到一个能交互的系统。镜像已经放在仓库的 `02_Firmware/RustSBI-Asterinas/` 中。

1. 按住 <strong>FEL</strong> 键，接上 USB 线，松开按键。
2. 检查 FEL 连接：
   ```sh
   xfel version
   xfel spinor
   ```
   应识别出 F101（chip ID `0x00193700`）和 16 MiB Flash。
3. （强烈建议）先备份原有 Flash：
   ```sh
   xfel spinor read 0x0 0x1000000 neko-backup.bin
   ```
4. 写入并回读校验：
   ```sh
   xfel spinor write 0x0 yuzukineko-rustsbi-asterinas.img
   xfel spinor read 0x0 0x6d0000 readback.img
   sha256sum yuzukineko-rustsbi-asterinas.img readback.img
   ```
   镜像大小 7,143,424 字节，正好是 `0x6d0000`，所以读回的范围与镜像等长，两个摘要应一致，并与 `SHA256SUMS` 中的记录相同。细节见[固件页](firmware/rustsbi-asterinas.md)。
5. 松开 FEL 键，复位：
   ```sh
   xfel reset
   ```
6. 串口终端 115200 8N1 打开，进入 BusyBox shell。

完整说明与单独替换各组件的方法见 [RustSBI + Asterinas](firmware/rustsbi-asterinas.md)。

?> 想要改动能保留（可写根文件系统，重启后仍在），或者需要 RV64I 版本，可以改用 [Linux + Buildroot](firmware/linux-buildroot.md) 的镜像。流程一样，但那个镜像覆盖整片 16 MiB，写入时会一并覆盖板上持久化的数据。

## 路线 B：用 Arduino 写第一个 Blink

适合熟悉 Arduino 的用户，无需自己搭工具链。

1. Arduino IDE 2.x → <strong>文件 → 首选项</strong>，在“其他开发板管理器地址”里加入
   ```
   https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json
   ```
2. 开发板管理器中安装 <strong>YuzukiHD Boards</strong>，选择开发板 <strong>YuzukiNeko</strong>。
3. <strong>工具 → 编程器 → xfel (USB FEL)</strong>（这块板没有串口 bootloader，不能用普通的“上传”箭头）。
4. 首次需要安装 FEL 的 USB 驱动（Windows 用 Zadig 装 WinUSB，Linux 加 udev 规则），见 [FEL 下载模式与工具](boot/fel.md#usb-驱动与权限)。
5. 打开示例 <strong>Blink</strong>，编译，让板子进入 FEL，然后 <strong>项目 → 使用编程器上传</strong>。

详细步骤、API 支持范围和限制见 [Arduino](dev/arduino.md)。

## 路线 C：用 Zephyr 开发

适合需要完整 RTOS、驱动和多媒体功能的用户。Zephyr 的 `yuzukineko` 板级支持在 F101 工作区内，见 [Zephyr](dev/zephyr.md)。

## 下一步

- 想接外设 → [引脚排布](hardware/pinout.md)
- 想拖放 `.uf2` 烧录 → [UF2 拖放烧录](dev/uf2.md)
- 遇到问题 → [常见问题](faq.md)
