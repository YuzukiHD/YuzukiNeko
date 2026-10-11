# Linux Development

The C stack: the standard Linux kernel plus a Buildroot userland, booting from SPI NOR with ready-made images. Choose this path when you need a full Linux with a writable, persistent root filesystem.

| Option | Notes |
| --- | --- |
| [Prebuilt Images](linux-prebuilt.md) | Ready-made full 16 MiB images (RV32 / RV64I): flashing, serial port, replacing single components |
| [Manual Build](linux-manual.md) | SyterKit, OpenSBI, kernel and a BusyBox root filesystem built step by step into a 16 MiB image (RV32) |
| [Manual Build, RV64I](linux-manual-rv64.md) | What to change for the 64-bit image |
| [Linux + Buildroot](linux-buildroot.md) | Build the images with the Buildroot external tree in one command (RV32 / RV64I) |

## In This Chapter

- [Prebuilt Images](linux-prebuilt.md)
- [Manual Build](linux-manual.md)
- [Manual Build, RV64I](linux-manual-rv64.md)
- [Linux + Buildroot](linux-buildroot.md)

?> Before flashing, read [FEL Download Mode and Tools](../../boot/fel.md) and [SPI NOR Layout and Backup](../../boot/flash-layout.md), and back up the on-board Flash. For the pure-Rust system see [Asterinas](../asterinas/index.md).
