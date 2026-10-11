# Linux 开发

C 技术栈：标准 Linux 内核加 Buildroot 用户态，从 SPI NOR 启动，使用现成镜像。需要完整 Linux、可写且能持久化的根文件系统时选这一条。

| 方案 | 说明 |
| --- | --- |
| [预编译镜像](linux-prebuilt.md) | 现成的整片 16 MiB 镜像（RV32 / RV64I）及其烧录、串口和单组件替换 |
| [手动构建](linux-manual.md) | 从 SyterKit、OpenSBI、内核到 BusyBox 根文件系统，逐步构建并拼成 16 MiB 镜像（RV32） |
| [手动构建 RV64I](linux-manual-rv64.md) | 64 位镜像要改的地方 |
| [Linux + Buildroot](linux-buildroot.md) | 用 Buildroot 外部树一条命令构建镜像（RV32 / RV64I） |

## 本章内容

- [预编译镜像](linux-prebuilt.md)
- [手动构建](linux-manual.md)
- [手动构建 RV64I](linux-manual-rv64.md)
- [Linux + Buildroot](linux-buildroot.md)

?> 刷写前请先阅读 [FEL 下载模式与工具](../../boot/fel.md) 和 [SPI NOR 布局与备份](../../boot/flash-layout.md)，并备份板上 Flash。纯 Rust 的系统见 [Asterinas](../asterinas/index.md)。
