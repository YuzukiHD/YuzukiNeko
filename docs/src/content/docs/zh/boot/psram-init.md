---
title: "PSRAM 初始化与 RAM 启动"
---

F101S3 和 F101S4 的 PSRAM 参数不同：S3 是 16 MiB APS128M，S4 是 32 MiB W958。`xfel ddr f101-s3` 只带 S3 的固定参数，不能用于 S4。所有下载到 PSRAM 运行的镜像（Zephyr、RT-Thread、ESP-IDF 和裸机程序）都必须先由 SyterKit 的 returning eFEX helper 初始化 PSRAM，helper 的 `dram_para` 表要按板卡选择。

## 为什么不用 xfel ddr

`xfel ddr f101-s3` 的 FES payload 内置了一张 S3 参数表：252 MHz、类型 3、ZQ `0x007bfbfb`、16 MiB。它没有 S4 的 32 MiB W958 表，也不能按 eFuse 切换。S4 需要 192 MHz、类型 8、ZQ `0x007bfffb`、32 MiB，并且要设置 W958 的 RDQ window。

SyterKit 的 `init_psram_efex.bin` 是一个 returning eFEX 应用：它在 FEL/SRAM 中运行，初始化 PSRAM 和 UART1，然后返回 FEL。它把参数表放在镜像里，也支持运行时覆盖，所以同一套代码可以生成 S3 和 S4 两个镜像。

## 参数表布局

`sunxi_psram_t.parameters` 是 32 个 32 位字，前 24 个字对应 `lpsram_para_t` 的字段：

| 下标 | 字段 | 说明 |
| --- | --- | --- |
| 0 | `dram_clk` | PSRAM 时钟，MHz |
| 1 | `dram_type` | 1 APS3208K、3 APS128M、8 W958 |
| 2 | `dram_zq` | ZQ 校准值 |
| 3 | `dram_odt_en` | ODT，通常为 0 |
| 4 | `dram_para1` | 低 16 位是容量，单位 MiB |
| 5 | `dram_para2` | 位宽/rank 标志，通常为 0 |
| 6–9 | `dram_mr0..mr3` | 模式寄存器，通常为 0 |
| 10–20 | `dram_tpr0..tpr10` | 时序/训练参数，通常为 0 |
| 21 | `dram_tpr11` | RDQ window |
| 22–23 | `dram_tpr12`、`dram_tpr13` | `tpr13` bit0 为 1 时跳过 eFuse 检测 |

驱动默认会从 eFuse 读取芯片型号，覆盖 `dram_type` 并按类型限制时钟和容量。表的其余字段（尤其 `dram_clk`、`dram_zq`、`dram_tpr11`）不会被自动修正，所以必须按板卡填写。只有 eFuse 检测不可用或需要强制某个型号时，才把 `dram_tpr13` 设为 1 跳过检测。

## S3 与 S4 的参数

| 字段 | F101S3 (APS128M) | F101S4 (W958) |
| --- | --- | --- |
| `dram_clk` | 252 MHz | 192 MHz |
| `dram_type` | 3 | 8 |
| `dram_zq` | `0x007bfbfb` | `0x007bfffb` |
| `dram_para1` | `0x00000010` (16 MiB) | `0x00000020` (32 MiB) |
| `dram_tpr11` | `0x00000000` | `0x00ff44ff` |
| `dram_tpr13` | 0（允许检测） | 0（允许检测） |

S4 的 192 MHz 是 SyterKit 验证过的稳定频率。W958 的 vendor 表也列出 252 MHz，但部分板子在 252 MHz 下从 PSRAM 取指失败或高 16 MiB 出现位错误，所以默认降到 192 MHz。

ESP-IDF 镜像还要把 `CONFIG_ESP_F101_PSRAM_MB` 设为与板卡一致的 16 或 32。它决定链接脚本的 RAM 长度和堆的上界。Zephyr 和 RT-Thread 的内存节点也需要按实际容量配置，否则只会使用前 16 MiB。

## 按板卡修改源码并构建

编辑 `soc/sun252iw2/app_efex/init_psram/main.c` 的 `psram` 结构。S3 使用：

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

S4 使用：

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

每种板卡用独立的输出目录构建，避免对象文件混用。在包含 `SyterKit/`、`toolchains/` 和 `out/` 的工作区根目录运行：

```sh
cd SyterKit
make O=../out/syterkit-efex-s3 sun252iw2_rv32_efex_defconfig
make O=../out/syterkit-efex-s3 CROSS_COMPILE="../toolchains/Xuantie-900-gcc-elf-newlib-x86_64-V3.2.0/bin/riscv64-unknown-elf-" -j8
cp ../out/syterkit-efex-s3/build/soc/sun252iw2/app_efex/init_psram/init_psram_efex.bin init_psram_efex_s3.bin
```

把上面的 `s3` 换成 `s4`、参数表换成 S4 版本，得到 `init_psram_efex_s4.bin`。`memory_size` 可以保持 32 MiB，驱动初始化后会用实测容量覆盖它。

## 用 efex-param.py 覆盖参数

不想为两张表分别构建时，可以保留默认的 S4 镜像，用 `tools/efex-param.py` 在镜像的参数区写入 S3 值。先生成 S3 镜像：

```sh
cp init_psram_efex.bin init_psram_efex_s3.bin
python3 -I tools/efex-param.py set init_psram_efex_s3.bin \
  'psram.para[0]=252' 'psram.para[1]=3' 'psram.para[2]=0x007bfbfb' \
  'psram.para[4]=16' 'psram.para[21]=0'
```

S4 镜像可以显式写入 S4 值，确认没有被旧参数污染：

```sh
cp init_psram_efex.bin init_psram_efex_s4.bin
python3 -I tools/efex-param.py set init_psram_efex_s4.bin \
  'psram.para[0]=192' 'psram.para[1]=8' 'psram.para[2]=0x007bfffb' \
  'psram.para[4]=32' 'psram.para[21]=0x00ff44ff'
```

`set` 直接修改镜像里的 4 KiB 参数区，eFEX 镜像不需要更新 eGON 校验。用 `dump` 检查写入结果：

```sh
python3 -I tools/efex-param.py dump init_psram_efex_s3.bin
```

## 获取 efex-param.py

脚本随 SyterKit 提供，位于 `SyterKit/tools/efex-param.py`（SyterKit `main` @ `61ac087b0`）。如果手头没有源码树，把下面内容保存为 `efex-param.py`，再用 `python3 -I efex-param.py ...` 运行：

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

## 运行与回读

写入与板卡匹配的 helper：

```sh
xfel version
xfel write 0x20000 init_psram_efex_s3.bin
xfel exec 0x20000
```

串口应看到与参数表一致的容量和类型。S3 的实测输出：

```text
LPSRAM type detection done.
LPSRAM CLK = 252 MHz
LPSRAM Type = APS128M
LPSRAM ZQ PARAM = 0x7bfbfb
LPSRAM SIZE = 16 MB
LPSRAM simple test OK.
```

helper 返回 FEL 后，回读参数区确认结果：

```sh
xfel read 0x239d0 4096 area.bin
python3 -I tools/efex-param.py dump area.bin
```

S3 上应包含：

```text
status DONE  ret 0  entries 34/508  checksum ok
  AO 0x05000000 psram.para[0]            0x000000fc (252)
  AO 0x05000002 psram.para[2]            0x007bfbfb (8125435)
  AO 0x05000004 psram.para[4]            0x00000010 (16)
  -O 0x05001000 psram.size_mb            0x00000010 (16)
  -O 0x05001100 psram.init_ok            0x00000001 (1)
```

`status DONE`、`psram.init_ok=1` 和正确的 `size_mb` 同时成立才算初始化成功。只看到 `simple test OK` 不够。

## 常见问题

- `LPSRAM SIZE = 16 MB` 但板卡是 S4：写入了 S3 参数，重新生成 S4 镜像。
- `LPSRAM Type = ...` 与参数表不一致：eFuse 检测覆盖了 `dram_type`；这通常是正确的。需要强制表值时把 `psram.para[23]` 设为 1。
- `PSRAM: initialization failed`：先确认容量、ZQ 和 `tpr11` 与板卡匹配，再检查供电和焊接。
- helper 没有返回 FEL：确认写入地址是 `0x20000`，并检查串口是否有完整输出；不要在 helper 之前执行 `xfel ddr`。
