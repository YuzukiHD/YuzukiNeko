---
title: "PSRAM initialization and RAM boot"
---

F101S3 and F101S4 use different PSRAM parameters: S3 is a 16 MiB APS128M, S4 is a 32 MiB W958. `xfel ddr f101-s3` carries only the fixed S3 table and cannot drive S4. Every image that runs from PSRAM (Zephyr, RT-Thread, ESP-IDF and bare-metal programs) must first be preceded by the SyterKit returning eFEX helper, and the helper's `dram_para` table must match the board.

## Why not xfel ddr

The FES payload of `xfel ddr f101-s3` has one S3 table built in: 252 MHz, type 3, ZQ `0x007bfbfb`, 16 MiB. It has no 32 MiB W958 table and cannot switch on the eFuse. S4 needs 192 MHz, type 8, ZQ `0x007bfffb`, 32 MiB, and the W958 RDQ window.

SyterKit's `init_psram_efex.bin` is a returning eFEX application: it runs in FEL/SRAM, initializes PSRAM and UART1, then returns to FEL. Its parameter table is part of the image, and it can also be overridden at run time, so one source tree can produce separate S3 and S4 images.

## Parameter table layout

`sunxi_psram_t.parameters` is 32 32-bit words; the first 24 correspond to the fields of `lpsram_para_t`:

| Index | Field | Meaning |
| --- | --- | --- |
| 0 | `dram_clk` | PSRAM clock, MHz |
| 1 | `dram_type` | 1 APS3208K, 3 APS128M, 8 W958 |
| 2 | `dram_zq` | ZQ calibration value |
| 3 | `dram_odt_en` | ODT, normally 0 |
| 4 | `dram_para1` | Low 16 bits: capacity in MiB |
| 5 | `dram_para2` | Width/rank flags, normally 0 |
| 6–9 | `dram_mr0..mr3` | Mode registers, normally 0 |
| 10–20 | `dram_tpr0..tpr10` | Timing/training words, normally 0 |
| 21 | `dram_tpr11` | RDQ window |
| 22–23 | `dram_tpr12`, `dram_tpr13` | `tpr13` bit 0 = 1 skips eFuse detection |

The driver reads the chip type from eFuse by default, overwrites `dram_type`, and clamps clock and capacity by type. The rest of the table, especially `dram_clk`, `dram_zq` and `dram_tpr11`, is not corrected automatically and must match the board. Set `dram_tpr13` to 1 only when eFuse detection is unavailable or a specific type must be forced.

## Parameters for S3 and S4

| Field | F101S3 (APS128M) | F101S4 (W958) |
| --- | --- | --- |
| `dram_clk` | 252 MHz | 192 MHz |
| `dram_type` | 3 | 8 |
| `dram_zq` | `0x007bfbfb` | `0x007bfffb` |
| `dram_para1` | `0x00000010` (16 MiB) | `0x00000020` (32 MiB) |
| `dram_tpr11` | `0x00000000` | `0x00ff44ff` |
| `dram_tpr13` | 0 (detection enabled) | 0 (detection enabled) |

The 192 MHz setting for S4 is the frequency SyterKit validated; the W958 vendor table also lists 252 MHz, but some boards fail instruction fetch from PSRAM or show bit errors in the upper 16 MiB at 252 MHz, so the default is lowered to 192 MHz.

ESP-IDF images must also set `CONFIG_ESP_F101_PSRAM_MB` to 16 or 32 to match the board; it controls the linker RAM length and the heap end. Zephyr and RT-Thread memory nodes likewise need the real capacity, otherwise they use only the first 16 MiB.

## Edit the source per board and build

Edit the `psram` structure in `soc/sun252iw2/app_efex/init_psram/main.c`. For S3:

```c
static sunxi_psram_t psram = {
    .parameters = {
        [0] = 252U,        /* dram_clk (MHz) */
        [1] = 3U,          /* dram_type: APS128M */
        [2] = 0x007bfbfbU, /* dram_zq */
        [4] = 0x00000010U, /* dram_para1: 16 MiB */
    },
    .parameter_count = 32,
    .memory_base = SUNXI_PSRAM_BASE,
    .memory_size = 0x02000000U,
};
```

For S4:

```c
static sunxi_psram_t psram = {
    .parameters = {
        [0] = 192U,        /* dram_clk (MHz) */
        [1] = 8U,          /* dram_type: W958 */
        [2] = 0x007bfffbU, /* dram_zq */
        [4] = 0x00000020U, /* dram_para1: 32 MiB */
        [21] = 0x00ff44ffU,/* dram_tpr11: RDQ window */
    },
    .parameter_count = 32,
    .memory_base = SUNXI_PSRAM_BASE,
    .memory_size = 0x02000000U,
};
```

Build each board in its own output directory so object files cannot mix. Run this from the workspace root that contains `SyterKit/`, `toolchains/` and `out/`:

```sh
cd SyterKit
make O=../out/syterkit-efex-s3 sun252iw2_rv32_efex_defconfig
make O=../out/syterkit-efex-s3 CROSS_COMPILE="../toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf-" -j8
cp ../out/syterkit-efex-s3/build/soc/sun252iw2/app_efex/init_psram/init_psram_efex.bin init_psram_efex_s3.bin
```

Replace `s3` with `s4` and the table with the S4 version to produce `init_psram_efex_s4.bin`. `memory_size` may stay at 32 MiB; after initialization the driver replaces it with the measured size.

## Override parameters with efex-param.py

Instead of maintaining two source tables, keep the default S4 image and write the S3 values into its parameter area with `tools/efex-param.py`. Create the S3 image first:

```sh
cp init_psram_efex.bin init_psram_efex_s3.bin
python3 -I tools/efex-param.py set init_psram_efex_s3.bin \
  'psram.para[0]=252' 'psram.para[1]=3' 'psram.para[2]=0x007bfbfb' \
  'psram.para[4]=16' 'psram.para[21]=0'
```

The S4 image can be written explicitly to confirm it carries no stale parameters:

```sh
cp init_psram_efex.bin init_psram_efex_s4.bin
python3 -I tools/efex-param.py set init_psram_efex_s4.bin \
  'psram.para[0]=192' 'psram.para[1]=8' 'psram.para[2]=0x007bfffb' \
  'psram.para[4]=32' 'psram.para[21]=0x00ff44ff'
```

`set` edits the 4 KiB parameter area inside the image; the eGON checksum does not need updating. Check the result with `dump`:

```sh
python3 -I tools/efex-param.py dump init_psram_efex_s3.bin
```

## Getting efex-param.py

The script ships with SyterKit as `SyterKit/tools/efex-param.py` (SyterKit `main` @ `61ac087b0`). If the source tree is not at hand, save the listing below as `efex-param.py` and run it with `python3 -I efex-param.py ...`:

```python
#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0+
"""Edit and decode the SyterKit eFEX parameter area (ABI v1, include/efex.h).

FILE is either an eFEX image (*_efex.bin, located through the "SKEP"
descriptor at +0x30) or a raw 4 KiB parameter area, e.g. one read back from
SRAM after exec.

  efex-param.py addr IMAGE                 print the SRAM address to FEL-write
  efex-param.py set FILE KEY=VALUE...      add/replace entries in place
  efex-param.py set FILE -o AREA KEY=...   write only the 4 KiB area to AREA
  efex-param.py dump FILE                  decode header and entries

Keys:
  uart.<field>  twi.<field>        field: base id rate pin0 mux0 pin1 mux1
                                   gpio_base gpio_bank0 gate_reg gate_bit
                                   rst_reg rst_bit parent_clk
                                   (uart only: parity stop dlen)
                                   pins accept "PB9"-style names
  rail.<pmu>.<rail>                voltage in mV, the application's rail_mv[pmu][rail]
  dram.<field>  psram.<field>      field: para[N] para_count base size
                                   (outputs: size_mb init_ok)
  app.<n>                          application-defined, 24-bit n
  0xKKKKKKKK                       raw key
"""

import argparse
import re
import struct
import sys

DESC_OFFSET = 0x30
RUN_ADDR_OFFSET = 0x20
DESC_MAGIC = b"SKEP"
MAGIC = 0x41504B53
VERSION = 1
AREA_SIZE = 4096
HDR = struct.Struct("<IHHHHIIi8x")
ENT = struct.Struct("<II")
CAPACITY = (AREA_SIZE - HDR.size) // ENT.size

APPLIED = 1 << 31
OUTPUT = 1 << 30
FLAGS = APPLIED | OUTPUT

STATUS = {0: "idle", 0x454E4F44: "DONE", 0x4C494146: "FAIL", 0x50444142: "BADP"}

# Must match include/efex.h; test/cases/efex_param checks this.
GROUPS = {"uart": 0x01, "twi": 0x02, "rail": 0x03, "dram": 0x04, "psram": 0x05, "app": 0x3F}
BUS_FIELDS = {
    "base": 0x00, "id": 0x01, "rate": 0x02, "pin0": 0x03, "mux0": 0x04,
    "pin1": 0x05, "mux1": 0x06, "gpio_base": 0x07, "gpio_bank0": 0x08,
    "gate_reg": 0x09, "gate_bit": 0x0A, "rst_reg": 0x0B, "rst_bit": 0x0C,
    "parent_clk": 0x0D,
}
UART_FIELDS = dict(BUS_FIELDS, parity=0x0E, stop=0x0F, dlen=0x10)
MEM_FIELDS = {"para": 0x00, "para_count": 0x01, "base": 0x02, "size": 0x03, "size_mb": 0x10, "init_ok": 0x11}
FIELDS = {"uart": UART_FIELDS, "twi": BUS_FIELDS, "dram": MEM_FIELDS, "psram": MEM_FIELDS}
ALIASES = {"baud": "rate", "speed": "rate", "tx": "pin0", "tx_mux": "mux0", "rx": "pin1",
           "rx_mux": "mux1", "scl": "pin0", "scl_mux": "mux0", "sda": "pin1", "sda_mux": "mux1"}


def make_key(group, ident, index):
    return (group & 0x3F) << 24 | (ident & 0xFFFF) << 8 | (index & 0xFF)


def parse_key(name):
    if re.fullmatch(r"0x[0-9a-fA-F]+", name):
        return int(name, 16) & ~FLAGS
    parts = name.split(".")
    group = parts[0]
    if group not in GROUPS:
        raise ValueError(f"unknown group in {name!r}")
    if group == "app":
        if len(parts) != 2:
            raise ValueError(f"{name!r}: expected app.<n>")
        return GROUPS[group] << 24 | int(parts[1], 0) & 0xFFFFFF
    if group == "rail":
        if len(parts) != 3:
            raise ValueError(f"{name!r}: expected rail.<pmu>.<rail>")
        return make_key(GROUPS[group], int(parts[1], 0), int(parts[2], 0))
    if len(parts) != 2:
        raise ValueError(f"{name!r}: expected {group}.<field>")
    m = re.fullmatch(r"(\w+?)(?:\[(\w+)\])?", parts[1])
    field = ALIASES.get(m.group(1), m.group(1))
    if field not in FIELDS[group]:
        raise ValueError(f"unknown field in {name!r}")
    index = int(m.group(2), 0) if m.group(2) else 0
    return make_key(GROUPS[group], FIELDS[group][field], index)


def key_name(key):
    group, ident, index = key >> 24 & 0x3F, key >> 8 & 0xFFFF, key & 0xFF
    for gname, gid in GROUPS.items():
        if gid != group:
            continue
        if gname == "app":
            return f"app.{key & 0xFFFFFF}"
        if gname == "rail":
            return f"rail.{ident}.{index}"
        for fname, fid in FIELDS[gname].items():
            if fid == ident:
                return f"{gname}.{fname}[{index}]" if fname == "para" else f"{gname}.{fname}"
    return f"0x{key & ~FLAGS:08x}"


def parse_value(text):
    m = re.fullmatch(r"P([A-N])(\d+)", text, re.IGNORECASE)
    if m:  # GPIO_PIN(port, n)
        return (ord(m.group(1).upper()) - ord("A")) << 5 | int(m.group(2))
    return int(text, 0) & 0xFFFFFFFF


def locate(data):
    """Return the offset of the parameter area inside data."""
    if data[DESC_OFFSET:DESC_OFFSET + 4] == DESC_MAGIC:
        addr, size, version = struct.unpack_from("<III", data, DESC_OFFSET + 4)
        run_addr, = struct.unpack_from("<I", data, RUN_ADDR_OFFSET)
        if size != AREA_SIZE or version != VERSION:
            raise ValueError(f"unsupported descriptor: size={size} version={version}")
        return addr - run_addr
    if struct.unpack_from("<I", data, 0)[0] == MAGIC:
        return 0
    raise ValueError("neither an eFEX image nor a parameter area")


def read_area(data, offset):
    magic, version, hdr_size, count, capacity, checksum, status, ret = HDR.unpack_from(data, offset)
    if magic != MAGIC or version != VERSION or hdr_size != HDR.size or capacity != CAPACITY or count > CAPACITY:
        raise ValueError("invalid parameter area header")
    entries = [ENT.unpack_from(data, offset + HDR.size + i * ENT.size) for i in range(count)]
    return {"checksum": checksum, "status": status, "ret": ret, "entries": entries}


def checksum(entries):
    return sum(k + v for k, v in entries) & 0xFFFFFFFF


def write_area(data, offset, area):
    entries = area["entries"]
    HDR.pack_into(data, offset, MAGIC, VERSION, HDR.size, len(entries), CAPACITY,
                  checksum(entries), area["status"], area["ret"])
    for i in range(CAPACITY):
        ENT.pack_into(data, offset + HDR.size + i * ENT.size, *(entries[i] if i < len(entries) else (0, 0)))


def cmd_addr(args):
    data = open(args.file, "rb").read()
    if data[DESC_OFFSET:DESC_OFFSET + 4] != DESC_MAGIC:
        sys.exit("no SKEP descriptor at +0x30")
    addr, size, version = struct.unpack_from("<III", data, DESC_OFFSET + 4)
    print(f"0x{addr:08x} {size} v{version}")


def cmd_set(args):
    data = bytearray(open(args.file, "rb").read())
    offset = locate(data)
    area = read_area(data, offset)
    entries = area["entries"]
    for item in args.items:
        name, _, text = item.partition("=")
        key, value = parse_key(name), parse_value(text)
        for i, (k, _) in enumerate(entries):
            if k & ~FLAGS == key:
                entries[i] = (key, value)
                break
        else:
            if len(entries) >= CAPACITY:
                sys.exit("parameter area is full")
            entries.append((key, value))
    area["status"], area["ret"] = 0, 0
    write_area(data, offset, area)
    if args.output:
        open(args.output, "wb").write(data[offset:offset + AREA_SIZE])
    else:
        open(args.file, "wb").write(data)


def cmd_dump(args):
    data = open(args.file, "rb").read()
    area = read_area(data, locate(data))
    entries = area["entries"]
    ok = area["checksum"] in (0, checksum(entries))
    print(f"status {STATUS.get(area['status'], hex(area['status']))}  ret {area['ret']}  "
          f"entries {len(entries)}/{CAPACITY}  checksum {'ok' if ok else 'BAD'}")
    for key, value in entries:
        flags = ("A" if key & APPLIED else "-") + ("O" if key & OUTPUT else "-")
        print(f"  {flags} 0x{key & ~FLAGS:08x} {key_name(key):<24} 0x{value:08x} ({value})")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("addr")
    p.add_argument("file")
    p.set_defaults(func=cmd_addr)
    p = sub.add_parser("set")
    p.add_argument("file")
    p.add_argument("-o", "--output", help="write only the 4 KiB area here")
    p.add_argument("items", nargs="+", metavar="KEY=VALUE")
    p.set_defaults(func=cmd_set)
    p = sub.add_parser("dump")
    p.add_argument("file")
    p.set_defaults(func=cmd_dump)
    args = parser.parse_args()
    try:
        args.func(args)
    except ValueError as err:
        sys.exit(f"efex-param: {err}")


if __name__ == "__main__":
    main()
```

## Run and read back

Write the helper that matches the board:

```sh
xfel version
xfel write 0x20000 init_psram_efex_s3.bin
xfel exec 0x20000
```

The serial port should report the type and capacity from the table. Measured S3 output:

```text
LPSRAM type detection done.
LPSRAM CLK = 252 MHz
LPSRAM Type = APS128M
LPSRAM ZQ PARAM = 0x7bfbfb
LPSRAM SIZE = 16 MB
LPSRAM simple test OK.
```

After the helper returns to FEL, read the parameter area back to confirm the result:

```sh
xfel read 0x239d0 4096 area.bin
python3 -I tools/efex-param.py dump area.bin
```

On S3 the dump should contain:

```text
status DONE  ret 0  entries 34/508  checksum ok
  AO 0x05000000 psram.para[0]            0x000000fc (252)
  AO 0x05000002 psram.para[2]            0x007bfbfb (8125435)
  AO 0x05000004 psram.para[4]            0x00000010 (16)
  -O 0x05001000 psram.size_mb            0x00000010 (16)
  -O 0x05001100 psram.init_ok            0x00000001 (1)
```

Initialization is only proven when `status DONE`, `psram.init_ok=1` and the expected `size_mb` all hold; `simple test OK` alone is not enough.

## Troubleshooting

- `LPSRAM SIZE = 16 MB` on an S4 board: an S3 image was written; regenerate the S4 image.
- `LPSRAM Type = ...` differs from the table: eFuse detection overwrote `dram_type`; that is usually correct. Set `psram.para[23]` to 1 to force the table value.
- `PSRAM: initialization failed`: confirm capacity, ZQ and `tpr11` match the board, then check power and soldering.
- The helper does not return to FEL: confirm it was written to `0x20000` and has complete serial output; do not run `xfel ddr` before it.
