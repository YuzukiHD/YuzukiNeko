---
title: "The prebuilt core and the sketch ABI"
---

The Arduino support is split in two binaries. The core is a Zephyr image with the Arduino API and every library, built once for each board and shipped in the Boards Manager package. A sketch is a small program compiled separately by the Arduino IDE and linked against the core's symbol table. The loader copies both into PSRAM and starts the core; the core finds the sketch through a fixed header.

## Memory layout

| Region | Address | Size |
| --- | --- | --- |
| Loader in NOR | `0x000000` | Three copies at 64 KiB intervals |
| System program (UF2 downloader) | `0x030000` | Up to about 1.8 MiB |
| Core header and core in NOR | `0x200000` | 4 KiB header page plus about 0.9 MB |
| Sketch in NOR | `0x400000` | Up to 2 MiB |
| Core in PSRAM | `0x40000000` | About 0.9 MB, linked at this address |
| Sketch window in PSRAM | `0x40e00000` | 2 MiB |
| Heap | End of the core image to `0x40e00000` | The rest of the 14 MiB |

The core's `prebuilt.overlay` shrinks `sram0` to `0x40000000`..`0x40e00000`, so the libc heap ends below the sketch window. The sketch window is the top 2 MiB of the 16 MiB PSRAM.

## Boot header

The loader reads a 4 KiB header page in front of the core image. The fields are:

| Field | Value in a core image | Meaning |
| --- | --- | --- |
| `magic` | `0x44524146` (`FARD`) | Image marker |
| `version` | 2 | Header version |
| `load` | `0x40000000` | PSRAM address of the core, also its entry |
| `size` | core size | Bytes after the header page |
| `id` | build time stamp | Core ID, matched by the sketch |
| `extra_load` | `0x40e00000` | PSRAM address of the sketch |
| `extra_max` | `0x200000` | Maximum sketch size |
| `extra_offset` | `0x400000` | NOR offset of the sketch header |

The loader accepts the image when the magic matches, the version is 2, the size is non-zero and within the application region, `load` points into PSRAM, and the core does not overlap the extra part. If PD5 is held at power-up or the header is invalid, it starts the system program at `0x030000` instead.

## Sketch header

The sketch starts with a `struct f101_sketch_header`, placed in the `.f101_header` section by `cores/f101/sketch_entry.cpp`:

| Field | Meaning |
| --- | --- |
| `magic` | `0x31303146` (`F101`) |
| `abi` | ABI version, currently 1 |
| `core_id` | The core the sketch was linked against |
| `setup`, `loop` | The two sketch entry points |
| `serial_event`, `serial_event1` | The optional `Serial` / `Serial1` event handlers |
| `init_array_start`, `init_array_end` | C++ static constructors |
| `bss_start`, `bss_end` | Zero-initialized region the core clears |
| `image_end` | End of the copied image |

The header is at `0x40e00000` in PSRAM and at `0x400000` in NOR. The loader reads the header from NOR to get `image_end`, copies `image_end - 0x40e00000` bytes, and jumps to the core.

## Boot sequence

1. The Boot ROM loads the loader from NOR into SRAM.
2. The loader reads the core header at NOR `0x200000` and validates it.
3. If PD5 is held or the header is invalid, it starts the system program at NOR `0x030000` instead.
4. It copies the core to `0x40000000`.
5. It reads the sketch header at NOR `0x400000`, copies the sketch to `0x40e00000`, and flushes the data cache.
6. The core starts, invalidates the caches, checks the sketch magic, ABI version and core ID, clears the sketch BSS, runs the C++ constructors, calls `setup()`, and then calls `loop()` forever.
7. After each `loop()`, the core checks `Serial.available()` and `Serial1.available()` and calls the corresponding `serialEvent` hook if the sketch defines one.

A core built for another board or another build fails the `core_id` check and prints `the sketch was built for another core`; the firmware then idles. This is why a sketch must be recompiled after the core is rebuilt.

## Linking a sketch

The Arduino IDE compiles the sketch with the xPack `riscv-none-elf-g++` and links it against `prebuilt/<variant>-core/core.elf`. The link uses the core only for symbols: no core code is included in the sketch. The essential flags are:

```sh
riscv-none-elf-g++ -mabi=ilp32d -march=rv32imafdc_zicsr_zifencei \
  -nostdlib -static -Wl,--no-relax -Wl,--gc-sections -Wl,--no-warn-rwx-segments \
  -Wl,-u,f101_sketch_header -Wl,-T,prebuilt/sketch.ld \
  -Wl,--just-symbols=prebuilt/<variant>-core/core.elf \
  -Wl,-Map,<build>/<sketch>.map -o <sketch>.elf <objects> <archive> -lm -lgcc
```

`-Wl,--just-symbols` takes the addresses of the core's exported symbols without copying its sections. `-Wl,-u,f101_sketch_header` keeps the header even though nothing in the sketch references it. `sketch.ld` places `.header` first at `0x40e00000`, then `.text`, `.rodata`, `.init_array`, `.data`, and a `.bss` that is not part of the image. The sketch links `libm` and `libgcc` from the toolchain; the rest of the C library comes from the core.

## Symbol export

A normal Zephyr link would drop every function that the core itself does not call, but a sketch may call any `Print`, `String`, `Wire` or `SPI` method. `tools/build-core` therefore links the core a second time with a response file that adds `-u` for every global symbol defined by the core objects and the C/C++ libraries. The resulting `core.elf` keeps those symbols, and `--just-symbols` resolves the sketch's calls to them.

The core ID is an absolute symbol, `f101_core_id_value`, set with `-Wl,--defsym`. The sketch header copies its value at link time; the core compares it with its own at boot.

## Zephyr configuration

The common `prj.conf` enables C++17, `printk`, `printf` floating point, GPIO, serial and interrupt-driven UART. It disables the shell and the UART log backend so that `Serial` owns the console, sets a 16 KiB main stack, a negative libc malloc arena (take all RAM above the image) and a 16 KiB kernel heap.

Each variant adds I²C, SPI, PWM, ADC, FPU and FPU sharing, and disables the display, G2D, MIPI DBI and USB PHY by default. A library that needs one of them brings its own `f101.conf` and `f101.overlay`; the core build merges them. This is how `Display` turns the panel pipeline back on and how `USBHost` enables the CherryUSB host stack without making every sketch pay for it.

## Console differences

The core's `Serial` is the board console: UART1 on PB0/PB1 for YuzukiNeko, UART3 on PE8/PE9 for the EVB. The loader's own log is hardcoded to UART3 in `loader/flash-boot/main.c`, so on YuzukiNeko the loader banner is not on the same pins as `Serial`. The sketch output is always on the board console.
