---
title: "SPI NOR 布局与备份"
---

板载 NOR Flash 共 <strong>16 MiB</strong>（地址 `0x000000`–`0xFFFFFF`），是系统资源：启动加载器、固件和应用都在里面。<strong>写之前请先看一眼自己想覆盖的范围里有什么，并先备份。</strong>

## 备份整片 Flash

进入 FEL 后：

```sh
xfel spinor read 0x0 0x1000000 neko-backup.bin
# 或
rfel spinor read 0x0 0x1000000 neko-backup.bin
```

保存好备份文件和它的 SHA-256，<strong>不要覆盖上一次的备份</strong>。

恢复：

```sh
xfel spinor write 0x0 neko-backup.bin
```

写完回读校验，再复位。

## 校验文件

写入前后都应该核对 SHA-256。

| 平台 | 命令 |
| --- | --- |
| Windows PowerShell | `Get-FileHash -Algorithm SHA256 <文件>` |
| Linux | `sha256sum <文件>`；对照校验表：`sha256sum -c SHA256SUMS` |
| macOS | `shasum -a 256 <文件>`；对照校验表：`shasum -a 256 -c SHA256SUMS` |

## 常见的布局

Flash 的划分取决于你装的是哪套软件。同一块板子可以有以下几种布局之一，<strong>它们互相不兼容</strong>，换用时需要重新写入引导部分。

### RustSBI + Asterinas 镜像

| 组件 | NOR 偏移 | 本布局预留 | 载入 RAM 地址 |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| 设备树 | `0x010000` | 256 KiB | `0x40f40000` |
| RustSBI | `0x050000` | 512 KiB | `0x40f80000` |
| Asterinas | `0x0d0000` | 5 MiB（到 initramfs 之前） | `0x40000000` |
| initramfs | `0x5d0000` | 1 MiB | `0x40500000` |

完整镜像写入 `0x000000..0x6d0000`；`0x6d0000..0x1000000` 不会被碰到。详见 [RustSBI + Asterinas](../dev/asterinas/rustsbi-asterinas.md)。

### Linux + Buildroot 镜像

| 组件 | NOR 偏移 | 本布局预留 | 载入 RAM 地址 |
| --- | --- | --- | --- |
| SyterKit | `0x000000` | 64 KiB | `0x00020000` |
| 设备树 | `0x010000` | 256 KiB | `0x40f40000` |
| OpenSBI `fw_jump` | `0x050000` | 512 KiB | `0x40f80000` |
| Linux Image | `0x0d0000` | 6 MiB | `0x40000000` |
| SquashFS 根文件系统 | `0x6d0000` | 到 `0xf00000`（约 8.2 MiB） | 从 MTD 挂载 |
| JFFS2 overlay | `0xf00000` | 1 MiB | 从 MTD 挂载 |

完整镜像覆盖<strong>整片 16 MiB</strong>，包括 overlay 分区，所以写入会丢掉板上已经持久化的改动。详见 [预编译镜像](../dev/linux/linux-prebuilt.md)。

### UF2 布局

| 内容 | NOR 偏移 |
| --- | --- |
| SyterKit 加载器（三份） | `0x000000` / `0x010000` / `0x020000` |
| 已保存的 Flash 采样点参数 | `0x02f000` |
| 系统程序头页（UF2 下载器） | `0x030000` |
| 应用头页（Zephyr 应用） | `0x200000`（最大约 `0x4CF000` 字节） |

详见 [UF2 拖放烧录](../dev/zephyr/zephyr-uf2.md)。

:::tip
上面几张表里的区域有重叠（例如都从 `0x000000` 开始放 SyterKit），<strong>不要在同一块 Flash 上混着写</strong>。从一种布局换到另一种时，写入新布局的完整引导部分，并用 `xfel spinor read` 回读确认。
:::

## 写入前自检清单

1. 已经备份整片 Flash，备份文件的 SHA-256 已记录。
2. 要写的地址范围没有压到你想保留的数据。
3. 写入后回读并比较 SHA-256，一致后再复位。
4. 失败（命令报错或校验不一致）时，先解决问题再启动，不要强行复位。
