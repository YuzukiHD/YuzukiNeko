# Linux 开发

C 技术栈：标准 Linux 内核加 Buildroot 用户态，从 SPI NOR 启动，使用现成镜像。需要完整 Linux、可写且能持久化的根文件系统时选这一条。

| 方案 | 说明 |
| --- | --- |
| [Linux + Buildroot](linux-buildroot.md) | 整片 16 MiB 镜像（RV32 / RV64I），SquashFS + JFFS2 overlay |

## 本章内容

- [Linux + Buildroot](linux-buildroot.md)

?> 刷写前请先阅读 [FEL 下载模式与工具](../../boot/fel.md) 和 [SPI NOR 布局与备份](../../boot/flash-layout.md)，并备份板上 Flash。纯 Rust 的系统见 [Asterinas](../asterinas/index.md)。
