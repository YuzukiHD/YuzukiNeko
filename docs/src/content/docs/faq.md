---
title: "常见问题"
---

## 下载与启动

<strong>`xfel version` 找不到设备。</strong>
没进入 FEL。按住 <strong>FEL</strong> 键再上电，换一根带数据的线，Windows 上确认已用 Zadig 装好 WinUSB（VID `1f3a` / PID `efe8`）。见 [FEL](boot/fel.md)。

<strong>提示 `unsupported chip`。</strong>
xfel / rfel 版本太旧，不支持 F101。升级后重试。

<strong>板子以前能进 FEL，现在不行了。</strong>
Flash 里已经有有效的启动加载器，上电直接运行它，不再自己进 FEL。必须按住 FEL 键上电。

<strong>写完 Flash 之后板子没反应。</strong>
回读写入的区域，比较 SHA-256；确认写的是完整镜像而不是单个组件（单独写三个 `.bin` 不会安装设备树和根文件系统）。见 [RustSBI + Asterinas](dev/asterinas/rustsbi-asterinas.md)。

<strong>我想恢复原来的固件。</strong>
用此前备份的整片镜像：`xfel spinor write 0x0 neko-backup.bin`，然后回读校验、复位。没有备份就无法还原，所以动 Flash 之前先备份。

## 硬件

<strong>V1.3 板上 `PD12`–`PD20` 不工作。</strong>
V1.3 丝印比真实 GPIO 小 2。丝印 `PD12` 实际是 `PD14`。见[勘误](hardware/errata.md)。

<strong>microSD 卡插入后检测不到。</strong>
V1.4 及更早的 `R11`（`PF6` 下拉）是 10 kΩ，偏大。把它换成 1 kΩ，或在软件里把 `PF6` 的驱动强度设到最低。

<strong>可以接 5 V 的外设吗？</strong>
GPIO 是 3.3 V 逻辑，`5V` 脚只是电源。

<strong>CAN 怎么接？</strong>
SoC 只给出逻辑电平，要外置 CAN 收发器和终端电阻。

## 串口与控制台

<strong>串口没有输出。</strong>
控制台接在哪组引脚上，取决于所运行的软件（Zephyr `yuzukineko`：UART1 `PB0/PB1`）。确认接线、波特率 115200 8N1、共地，并核对 TX/RX 是否交叉。

<strong>RustSBI + Asterinas 里粘贴长命令乱码。</strong>
这个镜像的串口输入对长字符串敏感，把终端的发送延时设为约每字符 20 ms。

## 软件

<strong>为什么 USB 设备/主机功能和下载不能同时用？</strong>
板子只有一个 USB-C 口，它同时是 FEL 下载口。先下载，再换接外设。
