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

Flash 的划分取决于你装的是哪套软件。同一块板子可以有以下几种布局之一，<strong>它们互相不兼容</strong>，独立启动布局切换时需要匹配的引导；XIP 开发流程则保留启动区为空。

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

### Zephyr XIP 开发布局（4.2.2 与 4.5）

| 内容 | NOR 偏移 | 说明 |
| --- | --- | --- |
| 启动区 | `0x000000` 起 | 保持无有效启动头，上电自动进入 FEL |
| 采样参数 | `0x020000` | 保留，不能用应用或旧 UF2 loader 覆盖 |
| XIP 应用 | `0x080000` | 当前应用写入并按相同长度读回校验 |

loader 是从 RAM `0x20000` 运行的当前 `xip-boot_fel.bin`，不是写到 NOR `0x20000`。应用被映射到 `0x0e000000`。具体步骤与当前 loader 的构建方法见 [编译与运行](../dev/zephyr/zephyr-build-run.md)。仅在明确制作独立启动镜像时才安装 NOR boot；完整打包会覆盖应用前的区域，需要单独处理参数区。

### UF2 布局

| 内容 | NOR 偏移 |
| --- | --- |
| SyterKit 加载器（三份） | `0x000000` / `0x010000` / `0x020000` |
| 已保存的 Flash 采样点参数 | `0x02f000` |
| 系统程序头页（UF2 下载器） | `0x030000` |
| 应用头页（Zephyr 应用） | `0x200000`（最大约 `0x9F0000` 字节） |

应用最大 payload 为 `0x9F0000` 字节，头页另占 4 KiB；系统 payload 最大 `0x1CF000` 字节。该布局将普通 RAM 镜像复制到 PSRAM，不能用于 XIP 镜像。

详见 [UF2 拖放烧录](../dev/zephyr/zephyr-uf2.md)。

:::tip
上面几张表里的区域有重叠（例如独立启动布局都从 `0x000000` 开始放引导），<strong>不要在同一块 Flash 上混着写</strong>。切换布局前确认启动策略；FEL 开发保留空启动区，独立启动才安装配套引导，并用 `xfel spinor read` 回读确认。
:::

## 写入前自检清单

1. 已经备份整片 Flash，备份文件的 SHA-256 已记录。
2. 要写的地址范围没有压到你想保留的数据。
3. 写入后回读并比较 SHA-256，一致后再复位。
4. 失败（命令报错或校验不一致）时，先解决问题再启动，不要强行复位。
