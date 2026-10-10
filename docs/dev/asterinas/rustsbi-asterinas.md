# RustSBI + Asterinas

仓库 `02_Firmware/RustSBI-Asterinas/` 提供 YuzukiNeko <strong>F101-S3</strong> 的 SPI NOR 启动镜像。启动链为：

```
BROM → SyterKit → RustSBI → Asterinas → BusyBox shell
```

镜像针对 <strong>16 MiB PSRAM + 16 MiB SPI NOR</strong> 的板子测试。

## 文件清单

| 文件 | 用途 | 大小（字节） |
| --- | --- | ---: |
| `syterkit-3bf4f61f.bin` | 带 eGON 启动头的 SyterKit；初始化 PSRAM 并加载后续镜像 | 49,152 |
| `rustsbi-0.4.1.bin` | RustSBI 0.4.1，针对 Neko 的 RV32 标量扩展定制，WARN 级日志 | 270,336 |
| `asterinas.bin` | Asterinas RV32 内核原始镜像 | 2,762,160 |
| `yuzukineko-rustsbi-asterinas.img` | 完整启动镜像：以上三者 + 设备树 + 含 BusyBox 的 initramfs | 7,143,424 |
| `SHA256SUMS` | 以上四个镜像的 SHA-256 | — |
| `manifest.json` | 来源版本、Flash 布局和验证信息 | — |
| `licenses/` | 许可证与第三方声明 | — |

单个镜像是 `.bin`，合成镜像是 `.img`。`.img` 是按固定偏移拼好的<strong>原始 SPI NOR 数据</strong>，既不是 PhoenixSuit 容器，也不是带分区表的磁盘镜像。

## 刷入完整镜像

<strong>Windows、Linux、macOS 都可以做刷机主机。</strong> 先按[FEL 下载模式与工具](../../boot/fel.md)装好 xfel 或 rfel。下面假设工具在 `PATH` 里，终端位于镜像所在目录。

首次安装或从其他固件切换时用完整镜像。它写入 NOR `0x000000..0x6d0000`，`0x6d0000..0x1000000` 不受影响。“完整”指文件包含启动所需的一切，并不是补到整片 16 MiB。要保留原固件，请先[备份](../../boot/flash-layout.md#备份整片-flash)。

1. 按住 <strong>FEL</strong> 键，重新接上 USB 数据线，松开。
2. 检查芯片和 Flash：
   ```sh
   xfel version
   xfel spinor
   ```
   应识别出 chip ID `0x00193700` 的 F101 和 16 MiB Flash。这一步<strong>不需要</strong>执行 `ddr` 命令。
3. 写入并回读：
   ```sh
   xfel spinor write 0x0 yuzukineko-rustsbi-asterinas.img
   xfel spinor read 0x0 0x6d0000 readback.img
   ```
   rfel 同理，把 `xfel` 换成 `rfel`。
4. 计算原始镜像和 `readback.img` 的 SHA-256，确认两者一致且与 `SHA256SUMS` 中记录相同（完整镜像的 SHA-256 是 `368b658f93cb921a66c690a1ae26def95fbb500d0098b955695cebb977228cc5`）。有报错或校验不一致时先解决，再启动。
5. 松开 FEL 键，复位：
   ```sh
   xfel reset
   ```

### 连接串口

用 <strong>115200 波特、8N1、无流控</strong>连接板子的 UART。启动后进入 BusyBox shell。RustSBI 使用 WARN 级日志，正常启动时看不到它的 INFO 横幅。

?> 本包的说明没有指明控制台接在哪一组排针引脚上。请对照[原理图](../../hardware/files.md)确认串口引脚。

## 单独替换某个组件

前提：板子已经装有本目录的完整镜像。按住 FEL 重新接 USB，先用 `version` 和 `spinor` 检查设备。

在这个布局里 Flash 偏移和 RAM 载入地址不同，请使用下面的 <strong>NOR 偏移</strong>：

| 组件 | NOR 偏移 | 本布局预留 | RAM 载入地址 |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| 设备树（在完整镜像中） | `0x010000` | 256 KiB | `0x40f40000` |
| RustSBI | `0x050000` | 512 KiB | `0x40f80000` |
| Asterinas | `0x0d0000` | 5 MiB，到 initramfs 之前 | `0x40000000` |
| initramfs（在完整镜像中） | `0x5d0000` | 1 MiB | `0x40500000` |

这些容量限制只针对本镜像布局。自行构建时，还必须保证入口、载入地址、设备树和内存使用相互兼容；不能只看二进制大小。特别是 RustSBI 运行时占用的内存（含 BSS、栈和堆）必须落在它预留的区域内。

按需选择写入命令，替换一个组件不必重写其他组件：

```sh
xfel spinor write 0x0 syterkit-3bf4f61f.bin
xfel spinor write 0x50000 rustsbi-0.4.1.bin
xfel spinor write 0xd0000 asterinas.bin
```

写完后按实际文件大小回读相应范围并校验。例如替换 RustSBI 后：

```sh
xfel spinor read 0x50000 0x42000 rustsbi-readback.bin
```

`0x42000` 是本包 RustSBI 文件的大小（270,336 字节），其他版本请按实际大小调整长度。回读的 SHA-256 与写入文件一致后，执行 `xfel reset`。

!> 单独写这三个镜像<strong>不会</strong>安装设备树和根文件系统，首次安装必须用完整镜像。

## 启动之后

在 BusyBox shell 里运行：

```sh
/root/run-demos.sh
```

会执行九个示例。其他注意事项：

- 本包的串口输入对<strong>长粘贴字符串</strong>比较敏感，可以把终端的发送延时设为约 <strong>每字符 20 ms</strong>。
- `reboot` 重启系统。
- `poweroff` 停止系统，但板子仍由 USB 供电，<strong>并不会切断电源</strong>。

## 组件版本

来自 `manifest.json`：

| 组件 | 版本 / 提交 | 备注 |
| --- | --- | --- |
| SyterKit | 基于 `3bf4f61f` | Neko SPI NOR 加载器和 Asterinas 交接；并非未修改的上游构建 |
| RustSBI | 0.4.1（`4068e0d0`） | 去色补丁、Neko RV32 标量目标、WARN 日志 |
| Asterinas | 基于 `db0d7958` | Neko RV32 移植与 BusyBox 集成 |
| BusyBox | 1.37.0 | 静态 RV32GC ILP32D musl 构建 |
| musl | 1.2.5 | |

## 验证记录

验证日期 2026-09-12，板子为 Yuzuki Neko F101-S3：Flash 回读与镜像 SHA-256 一致；SPI NOR 启动到达 BusyBox shell；九个示例通过。

## 许可证

固件及其第三方软件遵循各自的许可证，仓库的 CC0 声明<strong>不适用于</strong>它们。四个组件的许可证文本和来源见仓库中的 `licenses/README.md`。
