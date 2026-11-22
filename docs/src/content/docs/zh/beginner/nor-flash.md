---
title: "NOR 烧录专题"
---

以下步骤覆盖完整镜像的备份、写入、回读和恢复。操作前先完成 [安装 xfel](xfel.md)，确认 `xfel version` 能识别 F101，并准备好镜像文件。NOR Flash 是板子的系统资源，写入前必须备份。

## NOR Flash 与镜像布局

NOR Flash 共 16 MiB，地址范围为 `0x000000`–`0xFFFFFF`。启动加载器、设备树、内核和根文件系统都按固定偏移存放在里面。本指南使用的 RustSBI + Asterinas 镜像布局如下：

| 内容 | NOR 偏移 | 预留容量 | 说明 |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | 启动加载器，上电后首先运行 |
| 设备树 | `0x010000` | 256 KiB | 描述板级硬件 |
| RustSBI | `0x050000` | 512 KiB | SBI 固件 |
| Asterinas | `0x0d0000` | 5 MiB | 操作系统内核 |
| initramfs | `0x5d0000` | 1 MiB | BusyBox 根文件系统 |

完整镜像写入 `0x000000`–`0x6d0000`，共 7,143,424 字节。`0x6d0000`–`0x1000000` 不在本次写入范围内，原有内容不会被覆盖。

## 地址与长度速查

| 名称 | 值 | 用途 |
| --- | --- | --- |
| NOR 起始 | `0x0` | 读写起点 |
| 整片长度 | `0x1000000` | 备份和恢复 |
| 镜像长度 | `0x6d0000` | 写入和回读 |
| 镜像结束 | `0x6d0000`（不包含） | 写入范围的结束地址 |

## 镜像类型

| 镜像 | 大小 | 写入范围 | 适用情况 |
| --- | --- | --- | --- |
| `yuzukineko-rustsbi-asterinas.img` | 7,143,424 字节 | `0x000000`–`0x6d0000` | 本指南，首次体验 |
| Linux + Buildroot 镜像 | 16,777,216 字节 | 整片 16 MiB | 需要可写根文件系统和持久化改动 |
| Zephyr XIP / UF2 | 不固定 | 特定布局 | Zephyr 开发，见对应章节 |

不同布局互相不兼容。不要在同一块 Flash 上混写 Linux、RustSBI 和 Zephyr 的镜像。Zephyr 的 XIP 和 UF2 流程还会保留启动区或采样参数，不能套用本页的整片写入步骤。

## 备份、写入、回读对照

| 阶段 | 命令 | 长度 | 输出文件 |
| --- | --- | --- | --- |
| 备份 | `xfel spinor read` | `0x1000000` | `neko-backup.bin` |
| 写入 | `xfel spinor write` | 镜像大小 | — |
| 回读 | `xfel spinor read` | `0x6d0000` | `readback.img` |
| 恢复 | `xfel spinor write` | 备份大小 | — |

备份和恢复使用整片长度 `0x1000000`；写入和回读使用镜像长度 `0x6d0000`。两组长度不能混淆。

## 写入风险与备份

写入镜像会替换 NOR 中的原有内容。写入错误镜像、写到错误偏移，或在写入过程中断电，都可能导致板子无法启动。大多数情况下可以重新按住 `FEL` 上电并重写，但原有内容可能已经丢失。

:::danger
写入过程中不要断开 USB、关闭主机或切断板子电源。开始前先备份整片 NOR Flash，并把备份复制到另一个位置。
:::

## 操作要求

1. 备份整片 NOR，并确认备份文件为 16,777,216 字节。
2. 将备份复制到另一目录或存储设备，不要覆盖。
3. 只写入与板子匹配的镜像，不要混用不同系统的镜像。
4. 写入后回读相同长度，并比较 SHA-256。

## 准备文件

- 新建不含中文和空格的目录：Windows 使用 `D:\neko`，Linux 使用 `~/neko`。
- 将 `xfel.exe`（Windows）、全部 DLL 和待写入的 `.img` 放入该目录。
- 主机接通电源；板子直接连接主机 USB 口，不经过扩展坞或 USB 集线器。
- 下载镜像：打开 <https://github.com/YuzukiHD/YuzukiNeko/blob/main/02_Firmware/RustSBI-Asterinas/yuzukineko-rustsbi-asterinas.img>，点击“Download raw file”（下载原始文件）；或下载仓库 ZIP，在 `02_Firmware/RustSBI-Asterinas/` 中查找。
- 文件大小应为 **7,143,424 字节**。Windows 查看文件属性，Linux 使用 `stat -c %s`。
- 不要修改文件名，不要解压或转换 `.img`。Windows 隐藏扩展名时，文件可能显示为 `yuzukineko-rustsbi-asterinas`，按大小确认，不要手动添加或修改后缀。

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `yuzukineko-rustsbi-asterinas.img` | 7,143,424 字节 | 待写入镜像 |
| `neko-backup.bin` | 16,777,216 字节 | 烧录前备份的整片 NOR |
| `readback.img` | 7,143,424 字节 | 写入后回读的文件 |

## 镜像下载步骤

1. 打开 <https://github.com/YuzukiHD/YuzukiNeko/blob/main/02_Firmware/RustSBI-Asterinas/yuzukineko-rustsbi-asterinas.img>。
2. 点击“Download raw file”（下载原始文件）。
3. 保存到 `D:\neko` 或 `~/neko`，与 xfel 放在同一目录。
4. 检查文件大小为 7,143,424 字节。
5. 不要改名、解压或转换为其他格式。

## 步骤 1：进入 FEL

1. 断开板子的 USB 线。
2. 按住 `FEL` 键。
3. 连接 USB 数据线。
4. 松开 `FEL` 键。
5. 确认主机识别到新的 USB 设备。

Flash 中存在有效启动程序时，板子不会自动进入 FEL；必须在按住 `FEL` 的情况下上电。Flash 启动区为空时，每次上电都会进入 FEL。

## 步骤 2：确认连接

在终端中执行：

```sh
xfel version
xfel spinor
```

Windows 未配置 PATH 时，使用 `.\xfel.exe version` 和 `.\xfel.exe spinor`。

| 命令 | 应看到 |
| --- | --- |
| `xfel version` | `AWUSBFEX ID=0x00193700(F101)`，以及 `scratchpad=0x00020000` |
| `xfel spinor` | `16777216 bytes`，表示 16 MiB NOR Flash |

如果芯片 ID 不是 `0x00193700`，或容量不是 16 MiB，先停止操作并确认连接的是正确的板子。

## 步骤 3：备份整片 NOR

此步骤不可跳过。在终端中执行：

```sh
xfel spinor read 0x0 0x1000000 neko-backup.bin
```

参数说明：

- `0x0`：从 NOR 起始地址开始读。
- `0x1000000`：读取 16 MiB，即整片 Flash。
- `neko-backup.bin`：保存到当前目录的备份文件。

等待进度到 100%。备份文件应为 **16,777,216 字节**。将 `neko-backup.bin` 复制到另一目录或存储位置，不要覆盖。备份文件是二进制镜像，不要用文本编辑器打开或修改。

计算备份文件的 SHA-256，并保存结果。Windows PowerShell：

```powershell
Get-FileHash -Algorithm SHA256 .\neko-backup.bin
```

Linux：

```sh
sha256sum neko-backup.bin
```

## 备份文件管理

- 文件名建议包含日期和镜像版本，例如 `neko-backup-20261122.bin`。
- 至少保留两份，放在不同目录或存储设备。
- 不要覆盖上一次备份。
- 记录备份文件的 SHA-256。
- 不要用文本编辑器打开或修改备份文件。

## 步骤 4：写入镜像

确认备份完成并已复制后执行：

```sh
xfel spinor write 0x0 yuzukineko-rustsbi-asterinas.img
```

`xfel spinor write` 会自动擦除所需扇区，不需要手动擦除。等待进度到 100%，并等提示符重新出现后再继续。

:::caution
写入过程中不要触碰线缆、断开 USB、关闭主机或让主机断电。进度条暂时停住时先等待，不要断开连接。
:::

## 步骤 5：回读校验

写入完成后，回读相同区域：

```sh
xfel spinor read 0x0 0x6d0000 readback.img
```

`0x6d0000` 等于镜像字节数 7,143,424。命令中的十六进制数不要修改。回读文件大小应为 7,143,424 字节。

比较两个文件的 SHA-256。Windows PowerShell：

```powershell
Get-FileHash -Algorithm SHA256 .\yuzukineko-rustsbi-asterinas.img
Get-FileHash -Algorithm SHA256 .\readback.img
```

Linux：

```sh
sha256sum yuzukineko-rustsbi-asterinas.img readback.img
```

两个 SHA-256 必须一致，并与官方值相同：

```text
368b658f93cb921a66c690a1ae26def95fbb500d0098b955695cebb977228cc5
```

大小写不影响比较，64 个字符必须一致。下图为 Windows 上的正常结果：

![xfel 写入、回读和 SHA-256 校验的正常输出](figures/xfel-write.webp)

:::caution
部分 xfel 错误仍返回退出码 0。不要仅根据命令结束判断成功，应检查输出并比较回读的 SHA-256。指纹不一致时不要复位，重新写入；仍不一致时停止操作并检查。
:::

## 步骤 6：复位

校验通过后执行：

```sh
xfel reset
```

板子重新启动并运行写入的系统。复位后 FEL 连接会断开，`xfel` 不再能识别设备。

## 步骤 7：验证启动（可选）

连接串口后，使用 **115200 波特、8N1、无流控**，连接 UART1 的 `PB0`/`PB1`，应出现 BusyBox 提示符 `neko:~#`。

![RustSBI + Asterinas 启动后的 BusyBox 提示符](figures/boot-success.webp)

没有串口适配器时，第 5 步的 SHA-256 一致即可确认写入成功；串口可在后续连接。

## 恢复备份

恢复烧录前的状态：

1. 重新进入 FEL。
2. 执行 `xfel spinor write 0x0 neko-backup.bin`。
3. 回读相同长度并比较 SHA-256。可使用 `xfel spinor read 0x0 0x1000000 backup-readback.bin`，再比较 `neko-backup.bin` 和 `backup-readback.bin` 的 SHA-256。
4. 执行 `xfel reset`。

```sh
xfel spinor write 0x0 neko-backup.bin
```

如果备份文件已经丢失，无法恢复烧录前的原始内容，只能重新写入已知的完整镜像。

## 失败后的恢复路径

| 情况 | 恢复方法 |
| --- | --- |
| 写入中断 | 重新按住 FEL 上电，重新执行写入 |
| SHA-256 不一致 | 不要复位，重新写入并检查文件大小和线缆 |
| 启动区损坏 | 按住 FEL 重新上电，仍可进入下载模式 |
| 备份可用 | 写回 `neko-backup.bin`，回读校验后复位 |
| 备份丢失 | 无法恢复原始内容，只能写入已知完整镜像 |

## 写入时间与进度

- 写入时间取决于 USB 速度、镜像大小和主机负载。
- 进度条可能短暂停顿，不代表失败。
- 必须等待进度到 100% 且提示符重新出现。
- 不要根据进度百分比提前断开或复位。

## 常见问题

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 设备突然消失 | 线缆松动、供电不足、触碰 FEL | 按住 FEL 重新上电，更换线缆或 USB 口 |
| `unsupported chip` | xfel 版本过旧 | 使用 v1.4.0 或更新版本 |
| 写入中途报错 | 线缆或 USB 口不稳定 | 不要复位，重新进入 FEL 后再写入 |
| SHA-256 不一致 | 写入、回读或文件问题 | 不要复位，重新写入并检查文件大小和线缆 |
| 回读文件大小不对 | 读取长度或文件路径错误 | 检查 `0x6d0000` 和文件名 |
| 复位后无输出 | 镜像不完整，或串口未连接 | 重新进入 FEL 回读校验，连接串口查看日志 |
| 再次进入 FEL | 启动区为空，或镜像未写入 `0x0` | 检查写入地址，回读开头内容 |
| 备份文件丢失 | 未复制到其他位置 | 无法恢复原始内容，只能重新写入已知镜像 |

## 烧录前检查

- `xfel version` 能识别 F101，`xfel spinor` 能识别 16 MiB。
- 镜像大小为 7,143,424 字节，文件名未修改。
- 整片备份 `neko-backup.bin` 已完成，大小为 16,777,216 字节。
- 备份已复制到另一位置。
- 主机已接通电源，板子直接连接主机 USB 口。
- 没有其他程序占用该 USB 设备。
- 板子没有连接大电流外设。
- 写入过程中不会移动板子或线缆。

## 烧录后检查

- 写入进度到 100%，命令正常结束。
- 回读文件大小为 7,143,424 字节。
- 回读文件与原始镜像的 SHA-256 一致。
- 官方 SHA-256 也一致。
- 已执行 `xfel reset`。
- 备份文件仍然存在，未被覆盖。
- 板子能正常启动，或串口能看到预期日志。

## 校验记录

| 项目 | 记录 |
| --- | --- |
| 镜像 SHA-256 | — |
| 备份 SHA-256 | — |
| 回读 SHA-256 | — |
| 结果 | — |

## 进阶阅读

- 按最短流程重新操作：[快速开始](../quickstart.md)
- 切换到 Linux 系统：[Linux 预编译镜像](../dev/linux/linux-prebuilt.md)
- 使用 `.uf2` 拖放烧录：[UF2 拖放烧录](../dev/zephyr/zephyr-uf2.md)
- 排查问题：[常见问题](../faq.md)
- 了解完整 NOR 布局和备份策略：[SPI NOR 布局与备份](../boot/flash-layout.md)

---

返回：[零基础入门](index.md)
