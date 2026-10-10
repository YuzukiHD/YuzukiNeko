# Linux Development

The C stack: the standard Linux kernel plus a Buildroot userland, booting from SPI NOR with ready-made images. Choose this path when you need a full Linux with a writable, persistent root filesystem.

| Option | Notes |
| --- | --- |
| [Linux + Buildroot](linux-buildroot.md) | Full 16 MiB image (RV32 / RV64I), SquashFS + JFFS2 overlay |

## In This Chapter

- [Linux + Buildroot](linux-buildroot.md)

?> Before flashing, read [FEL Download Mode and Tools](../../boot/fel.md) and [SPI NOR Layout and Backup](../../boot/flash-layout.md), and back up the on-board Flash. For the pure-Rust system see [Asterinas](../asterinas/index.md).
