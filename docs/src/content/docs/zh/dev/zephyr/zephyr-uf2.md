---
title: "UF2 拖放烧录"
---

UF2 下载器是跑在板子上的一个小程序：板子显示为 USB 盘 `F101BOOT`，把 `.uf2` 文件拷进去就会写进 SPI NOR，写完自动重启。装好之后下载应用不再需要 xfel 和 FEL。下载器本身的安装、`.uf2` 的日常使用流程见 [编译与运行](zephyr-build-run.md#方式三uf2-拖放下载)，这一页是参考资料。

## 进入下载器

- 上电时<strong>按住 PD5 上的按键</strong>（接地有效，内部上拉），加载器就运行下载器而不是应用。
- Flash 里没有有效应用时，不按键也会自动进入。

下载器的源码是 `zephyr-components/uf2-downloader/`，编译：

```sh
west build -b yuzukineko -d build/uf2 zephyr-components/uf2-downloader
```

## 制作 .uf2

用 `zephyr-components/uf2-downloader/tools/mkuf2.py` 从镜像生成：

```sh
mkuf2.py app build/hello/zephyr/zephyr.bin -o app.uf2       # 应用，Flash 0x200000
mkuf2.py system build/uf2/zephyr/zephyr.bin -o dl.uf2       # 下载器自身，Flash 0x030000
mkuf2.py loader flash-boot_spi.bin -o loader.uf2            # 加载器，Flash 0
```

| 类型 | UF2 family | 写入位置 | 可写范围 |
| --- | --- | --- | --- |
| `app` | `0x31303146` | `0x200000` | 仅应用区 |
| `system`、`loader` | `0x31303147` | `0x030000` / `0x000000` | 任意位置 |

常用参数：`--load <地址>` 指定镜像载入的 PSRAM 地址（默认 `0x40000000`，与 Zephyr 链接地址一致）；`--raw` 输出带头页的 Flash 原始镜像而不是 `.uf2`，供 `xfel spinor write` 使用。

:::caution
`system` 和 `loader` 文件可以写入任何位置，写坏了板子就没有加载器，那时只有 <strong>FEL</strong> 能救。只拖放你信任的文件，写入期间不要断电。
:::

## Flash 布局（16 MiB）

| 内容 | 偏移 | 大小上限 |
| --- | --- | --- |
| 加载器（三份） | `0x000000` / `0x010000` / `0x020000` | 各 64 KiB |
| 已保存的 Flash 采样点 | `0x02f000` | 加载器自己维护，不要覆盖 |
| 系统程序（UF2 下载器） | `0x030000` | `0x1CF000` 字节 |
| 应用 | `0x200000` | `0x9F0000` 字节 |

下载器和应用都带一个 4 KiB 的头页，记录镜像载入的 PSRAM 地址和大小，由 `mkuf2.py` 生成。头页和加载器 `flash-boot` 的实现见 SyterKit。这个布局与 Linux、Asterinas 镜像的布局不兼容，见 [SPI NOR 布局与备份](../../boot/flash-layout.md)。

## 首次安装

板子上还没有加载器和下载器时，要先用 xfel 写一次，步骤见 [编译与运行](zephyr-build-run.md#方式三uf2-拖放下载) 的「第一步」。一旦加载器在 Flash 里，板子就不会自己进 FEL，需要按住 FEL 键，见 [FEL 下载模式与工具](../../boot/fel.md#进入-fel)。
