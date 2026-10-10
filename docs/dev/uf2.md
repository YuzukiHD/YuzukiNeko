# UF2 拖放烧录

不装任何工具，把 `.uf2` 文件拖到 U 盘里就能烧录。板子上运行一个 USB 下载器，呈现为一个叫 `F101BOOT` 的 U 盘（128 MiB FAT16，即时生成）。收到的每个 UF2 块都会写入 SPI NOR，写完后自动重启。

?> UF2 下载器是 F101 工作区中的 Zephyr 应用。要使用，板子的 Flash 里必须先有 SyterKit 的 `flash-boot` 加载器和下载器本身（首次用 FEL 安装一次）。

## 使用

1. 上电时<strong>按住 `PD5` 上的按键（接地）</strong>，或让板子在没有有效应用的情况下上电。加载器会启动下载器而不是应用。
2. 板子在 PC 上出现为驱动器 `F101BOOT`（用的是下载口的 USB 线）。
3. 把 `.uf2` 文件复制进去。最后一个块写完，板子自动重启进入应用。

## 制作 `.uf2`

用 `tools/mkuf2.py` 从镜像生成：

```sh
tools/mkuf2.py app build/gba/zephyr/zephyr.bin -o gba.uf2        # 应用，Flash 0x200000
tools/mkuf2.py system build/uf2/zephyr/zephyr.bin -o dl.uf2      # 下载器自身，Flash 0x30000
tools/mkuf2.py loader boot.img -o loader.uf2                     # 加载器，Flash 0
```

| 类型 | UF2 family | 可写范围 |
| --- | --- | --- |
| `app` | `0x31303146` | 仅应用区（偏移 ≥ `0x200000`） |
| `system`、`loader` | `0x31303147` | 任意位置 |

!> `system` 和 `loader` 文件可以写入任何位置，写坏了会让板子没有加载器，那时只有 <strong>FEL</strong> 能救。只拖放你信任的文件。

## Flash 布局（16 MiB）

| 内容 | 偏移 |
| --- | --- |
| 加载器 ×3 | `0x000000` / `0x010000` / `0x020000`（`boot.img`） |
| 已保存的 Flash 采样点 | `0x02f000` |
| 系统程序（下载器）头页 | `0x030000` |
| 应用头页 | `0x200000`（最大 `0x4CF000` 字节；Arduino：核心 `0x200000`，草图 `0x400000`） |

两个程序都带 4 KiB 头页（见 `tools/mkuf2.py` 和 SyterKit 的 `flash-boot`），头页给出它被载入的 PSRAM 地址。

## 首次安装（需要 FEL）

```sh
xfel spinor write 0       boot.img
xfel spinor write 0x30000 sys.img
xfel spinor write 0x200000 app.img
```

镜像用 `mkuf2.py ... --raw` 生成。一旦加载器在 Flash 里，板子就不会自己进 FEL，需要按住 FEL 键（见[FEL](../boot/fel.md)）。

## 编译下载器

```sh
west build -b yuzukineko -d build/uf2 zephyr-components/uf2-downloader
```
