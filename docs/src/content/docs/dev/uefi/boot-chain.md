---
title: "Boot chain: from FEL to S-mode"
---

Booting EDK II on the F101 takes four programs and one hardware quirk. The quirk is that the C907 latches RV32 or RV64 at reset, so a 32-bit loader has to switch the core before anything 64-bit can run. The four programs are xfel's PSRAM setup, the SyterKit loader, OpenSBI and EDK II itself.

## Stages

| Stage | Runs in | Entry | Job |
| --- | --- | --- | --- |
| xfel | Host, over USB | FEL | Initialize PSRAM with the S3 table |
| `loader.bin` | C907, RV32, SRAM | `0x20000` | Program the RV64 reset vector and restart the core |
| `fw_jump.bin` | C907, RV64, M mode | `0x40f80000` | Provide SBI services and start the payload |
| `edk2.fd` | C907, RV64, S mode | `0x40000000` | SEC, DXE, BDS and the UEFI boot menu |

The packaged `run.sh` performs the xfel steps and then executes the loader. The rest of this page explains what each stage does and which part of the image it reads.

## FEL and PSRAM

The Boot ROM enters FEL when the board is powered up with the FEL key held, or when the first NOR sector is empty. xfel first runs `xfel ddr f101-s3`, which writes the F101S3 `dram_para` table and brings up the 16 MiB PSRAM at `0x40000000`. The EDK II memory map is built for that capacity.

S3 and S4 need different tables. `xfel ddr f101-s3` cannot initialize the 32 MiB PSRAM of an F101S4 board. The general RAM-boot flow uses the returning SyterKit helper `init_psram_efex_s3.bin` or `init_psram_efex_s4.bin` instead; see [PSRAM initialization and RAM boot](../../boot/psram-init.md). The edk2-build platform is an EVB target, so its packaged script keeps the S3 command.

## The loader

`loader.bin` is the `usb-boot-rv64i` application of SyterKit. The build uses `yuzukineko_rv32_sram_defconfig` and applies `patches/syterkit-f101-evb.patch` before compiling. The patch does two things:

- It adds `usb-boot-rv64i` to the SRAM applications of the `yuzukineko` board.
- It changes the board console from UART1 (PB0/PB1) to UART3 (PE8/PE9), which is the EVB console.

The loader runs from SRAM at `0x20000`. It does not copy the EDK II image; xfel has already placed it in PSRAM. Its job is the mode switch: it programs the reset vector, sets the RV64 bit of the core and restarts the core through the RISC-V watchdog. The reset lands in a small stub that jumps to OpenSBI.

## OpenSBI

`fw_jump.bin` comes from the `opensbi` submodule, [`YuzukiHD/opensbi`](https://github.com/YuzukiHD/opensbi), branch `sun252i-f101`. It is built as RV64 with the XuanTie `linux-glibc` toolchain. OpenSBI needs a linker with PIE support, which the `elf-newlib` toolchain does not provide.

OpenSBI runs in M mode. It installs its trap handlers, exposes the SBI services the payload uses (console, timer, IPI, reset), and starts the EDK II SEC entry at `0x40000000` in S mode. The hart ID is in `a0` and the device tree address is in `a1`.

## Device tree

`dts/f101-evb.dts` is compiled into `f101-evb.dtb` and written inside the 256 KiB slot at `0x40f40000`. It describes:

| Node | Address | Notes |
| --- | --- | --- |
| `memory@40000000` | `0x40000000`, 16 MiB | The only RAM node |
| `clint@14000000` | `0x14000000` | `thead,c900-clint`, no 64-bit MMIO |
| `interrupt-controller@10000000` | `0x10000000` | `thead,c900-plic`, 191 interrupts |
| `serial@2500c00` | `0x2500c00` | UART3, `ns16550a`, 24 MHz, 115200 |
| `cpu@0` | — | RV64 `rv64imafdcsu_zicbom_zicboz_svpbmt`, Sv39 |

The root `compatible` must contain `allwinner,sun252i-f101`:

```dts
compatible = "allwinner,sun252i-f101", "allwinner,sun252iw2p1";
```

OpenSBI uses the first string to select the F101 platform. Without it, OpenSBI falls back to its generic platform and does not set the C907 CSRs that enable the caches. S mode then runs about 280 times slower; the repository measured a two-instruction loop at 358 cycles in that state.

## Memory map

| Address | Size | Image | Written by |
| --- | --- | --- | --- |
| `0x40000000` | 3 MiB region, about 0.7 MiB used | `edk2.fd` | `xfel write` |
| `0x40300000` | 6 MiB | SEC temporary RAM | EDK II at runtime |
| `0x40900000` | about 6.25 MiB | Free PSRAM | DXE boot services |
| `0x40f40000` | 256 KiB | `f101-evb.dtb` | `xfel write` |
| `0x40f80000` | OpenSBI size | `fw_jump.bin` | `xfel write` |
| `0x20000` | loader size | `loader.bin` | `xfel write`, then `exec` |

The DTB and OpenSBI are packed into one host file, `dtb_sbi.bin`, so xfel only needs one write at `0x40f40000`. The first 256 KiB of that file are the DTB slot, padded with zeros; OpenSBI follows at the 256 KiB boundary, which is `0x40f80000` in PSRAM.

## What can go wrong

- `xfel` prints `No FEL device found`: the board is not in FEL, the cable has no data lines, or the USB driver is missing. See [FEL download mode and tools](../../boot/fel.md).
- The loader starts but nothing appears: check that `dtb_sbi.bin` was written at `0x40f40000` and that the DTB `compatible` contains `allwinner,sun252i-f101`.
- The console is silent: the EVB uses UART3 (PE08/PE09). A YuzukiNeko has UART1 (PB0/PB1), so the EVB loader and device tree do not match its console.
- The boot is extremely slow: OpenSBI selected its generic platform. Fix the `compatible` string and rebuild the DTB.
- The image starts but the panel stays dark: check the panel supply pin PD22, the backlight on PB0..PB3 and the 49 MHz RGB timing; see [graphics output](display.md).
