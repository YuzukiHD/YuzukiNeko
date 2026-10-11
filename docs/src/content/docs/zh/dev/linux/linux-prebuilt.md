---
title: "预编译镜像"
---

仓库 `02_Firmware/Linux-Buildroot/` 提供 YuzukiNeko <strong>F101-S3</strong> 用 Buildroot 构建的 SPI NOR 启动镜像。启动链为：

```
BROM → SyterKit → OpenSBI → Linux → BusyBox
```

按 CPU 模式提供两个镜像：<strong>RV32</strong>（C907，`ilp32d`）和 <strong>RV64I</strong>（`lp64`）。根文件系统是 SquashFS，上面叠一层可写的 JFFS2 overlay，所以在板子上做的改动重启后仍在。镜像针对 <strong>16 MiB RAM + 16 MiB SPI NOR</strong> 的板子构建。

想自己构建这些镜像，见 [Linux + Buildroot](linux-buildroot.md)（一条命令）和 [手动构建](linux-manual.md)（逐步构建）。

## 文件清单

| 文件 | 架构 | ABI | 大小（字节） |
| --- | --- | --- | ---: |
| `linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img` | RV32 (C907) | ilp32d | 16,777,216 |
| `linux-7.2-YuzukiNeko-sun252i-f101-buildroot-rv64i-nor.img` | RV64I | lp64 | 16,777,216 |
| `SHA256SUMS` | 以上两个镜像的 SHA-256 | — | — |
| `manifest.json` | 区域布局、各组件校验和、来源版本 | — | — |
| `licenses/` | 许可证与第三方声明 | — | — |

每个镜像都是完整的——引导加载器、设备树、SBI 固件、内核、根文件系统——并且正好是整片 Flash 的大小。不存放载荷的空隙和 overlay 分区都擦成 `0xFF`。

与 [RustSBI + Asterinas](../asterinas/rustsbi-asterinas.md) 不同：那个是 7 MiB 的部分镜像、启动到 initramfs；这里的镜像覆盖整片 16 MiB，并从 Flash 挂载可持久化的根文件系统。

`.img` 是按固定偏移拼好的<strong>原始 SPI NOR 数据</strong>，既不是 PhoenixSuit 容器，也不是带分区表的磁盘镜像。

## 刷入完整镜像

<strong>Windows、Linux、macOS 都可以做刷机主机。</strong> 先按 [FEL 下载模式与工具](../../boot/fel.md) 装好 xfel 或 rfel。下面假设工具在 `PATH` 里，终端位于镜像所在目录。

首次安装或从其他固件切换时用完整镜像。因为每个镜像都是整片 16 MiB，写入会<strong>覆盖整片 Flash</strong>，包括存放板子持久化改动的 overlay 分区。想保留板上的内容，请先[备份](../../boot/flash-layout.md#备份整片-flash)。

1. 按住 <strong>FEL</strong> 键，重新接上 USB 数据线，松开。
2. 检查芯片和 Flash：
   ```sh
   xfel version
   xfel spinor
   ```
   应识别出 chip ID `0x00193700` 的 F101 和 16 MiB Flash。这一步<strong>不需要</strong>执行 `ddr` 命令。
3. 按需要的架构写入并回读。RV32：
   ```sh
   xfel spinor write 0x0 linux-7.2-YuzukiNeko-sun252i-f101-buildroot-nor.img
   xfel spinor read 0x0 0x1000000 readback-rv32.img
   ```
   RV64I：
   ```sh
   xfel spinor write 0x0 linux-7.2-YuzukiNeko-sun252i-f101-buildroot-rv64i-nor.img
   xfel spinor read 0x0 0x1000000 readback-rv64i.img
   ```
   rfel 同理，把 `xfel` 换成 `rfel`。
4. 计算原始镜像和回读文件的 SHA-256，确认两者一致且与 `SHA256SUMS` 中记录相同。有报错或校验不一致时先解决，再启动。
5. 松开 FEL 键，复位：
   ```sh
   xfel reset
   ```

### 连接串口

用 <strong>115200 波特、8N1、无流控</strong>连接板子的 UART。内核命令行固化在设备树里：

```text
console=ttyS1,115200n8 earlycon=uart8250,mmio32,0x02500400 loglevel=8 printk.time=1 root=/dev/mtdblock4 rootfstype=squashfs ro
```

控制台是 UART1 / `ttyS1`。启动时先把 SquashFS 根挂载为只读，再由 `/sbin/init` 在上面搭好 overlayfs，然后出现登录提示。配置里没有设置 root 密码，因此适用 Buildroot 的默认值：用 `root` 登录，密码为空。

:::tip
本包的说明没有指明控制台接在哪一组排针引脚上。请对照[原理图](../../hardware/files.md)确认串口引脚。
:::

:::tip
首次启动时 `/sbin/init` 需要擦除并格式化 JFFS2 overlay 分区，会花一点时间，所以第一次启动比之后慢。
:::

## 单独替换某个组件

前提：板子已经装有本目录中架构匹配的完整镜像。按住 FEL 重新接 USB，先用 `version` 和 `spinor` 检查设备。

在这个布局里 Flash 偏移和 RAM 载入地址不同，请使用下面的 <strong>NOR 偏移</strong>：

| 组件 | NOR 偏移 | 本布局预留 | RAM 载入地址 |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000`（由 BROM 载入 SRAM） |
| 设备树 | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux Image | `0x0d0000` | 6 MiB | `0x40000000` |
| SquashFS 根文件系统 | `0x6d0000` | 到 `0xf00000`（约 8.2 MiB） | 从 MTD 挂载，不复制到 RAM |
| JFFS2 overlay | `0xf00000` | 1 MiB，已擦除 | 从 MTD 挂载 |

这些区域就是设备树里声明的 MTD 固定分区，名字分别是 `bootloader`、`dtb`、`opensbi`、`kernel`、`rootfs`、`overlay`。

:::caution
<strong>SyterKit 读取的是固定长度，不是文件的实际大小。</strong> 每次启动它都固定从 Flash 取 256 KiB 设备树、512 KiB `fw_jump`、6 MiB 内核。替换的组件必须放得进本区域的预留容量；超出的部分不会被识别，只会被当成截断的镜像读进来。边界也是写死的，不能把组件挪到别的偏移。
:::

按需选择写入命令，替换一个组件不必重写其他组件：

```sh
xfel spinor write 0x0 spinor-boot_spi.bin
xfel spinor write 0x10000 sun252i-f101-yuzukineko.dtb
xfel spinor write 0x50000 fw_jump.bin
xfel spinor write 0xd0000 Image
```

RV64I 镜像使用 `spinor-boot-rv64i_spi.bin` 和 `sun252i-f101-yuzukineko-rv64i.dtb`，偏移相同。

写完后按实际文件大小回读相应范围并校验。例如用本包的 RV32 内核替换后：

```sh
xfel spinor read 0xd0000 0x4c3be8 Image-readback.bin
```

`0x4c3be8` 是本包 RV32 内核 Image 的大小（4,996,072 字节），其他版本请按实际大小调整长度；各镜像的数值见 `manifest.json`。回读的 SHA-256 与写入文件一致后，执行 `xfel reset`。

:::caution
把<strong>另一个架构</strong>包里的引导加载器、设备树或 `fw_jump` 写进去会让板子无法启动。RV32 和 RV64I 镜像的组件不能互换使用；切换架构时要换整个镜像，而不是换部分组件。
:::

## 启动之后

根文件系统可写：`/sbin/init` 会 pivot 到一层 overlayfs，其 upper 是 JFFS2 的 `overlay` 分区，所以新建和修改的文件会保留到下次刷机为止。`/etc/init.d/` 里是常规的 BusyBox 启动脚本。`reboot` 重启系统。`poweroff` 停止系统，但板子仍由 USB 供电，<strong>并不会切断电源</strong>。

想把板子的持久化状态恢复到镜像内容，可以在系统里擦除 overlay 分区（`flash_erase /dev/mtd5 0 0`），或者重新刷入镜像。

## 组件版本

来自 `manifest.json`：

| 组件 | 版本 / 提交 | 备注 |
| --- | --- | --- |
| SyterKit | `f95d29d6` | 由外部树精确锁定，两个镜像相同 |
| OpenSBI | 1.9，分支 `sun252i-f101` | defconfig 指定的是分支，不是提交 |
| Linux | 7.2.0，分支 `sun252i_f101_7.2` | defconfig 指定的是分支，不是提交 |
| BusyBox | 1.38.0 | 从镜像里的 BusyBox 横幅读出 |
| musl | 1.2.6 | |
| Buildroot | `2026.08` + 若干提交 | 两个镜像由不同版本构建 |
| 工具链 | GCC 15.3.0，binutils 2.45.1 | Buildroot 自带 musl 工具链 |

## 验证情况

`manifest.json` 里的校验和、区域大小和版本字符串都来自两个镜像文件本身。<strong>本包没有记录真机启动测试</strong>，这里不声称任何板级结果。

## 许可证

固件及其第三方软件遵循各自的许可证，仓库的 CC0 声明<strong>不适用于</strong>它们。这些镜像中各组件的许可证文本和来源见 `licenses/README.md`。
