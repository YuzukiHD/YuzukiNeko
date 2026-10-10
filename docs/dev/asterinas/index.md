# Asterinas 开发

纯 Rust 技术栈：RustSBI 加 Asterinas 内核，从 SBI 到系统全部是 Rust。想直接看到 Linux 风格 shell 时选这一条。

| 方案 | 说明 |
| --- | --- |
| [RustSBI + Asterinas](rustsbi-asterinas.md) | 7 MiB 部分镜像，启动到 initramfs，BusyBox 九个示例 |

## 本章内容

- [RustSBI + Asterinas](rustsbi-asterinas.md)

?> 刷写前请先阅读 [FEL 下载模式与工具](../../boot/fel.md) 和 [SPI NOR 布局与备份](../../boot/flash-layout.md)，并备份板上 Flash。需要完整 Linux 见 [Linux 开发](../linux/index.md)。
