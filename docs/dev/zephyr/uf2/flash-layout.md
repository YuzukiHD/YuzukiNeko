# Flash 布局与首次安装

## Flash 布局（16 MiB）

| 内容 | 偏移 |
| --- | --- |
| 加载器 ×3 | `0x000000` / `0x010000` / `0x020000`（`boot.img`） |
| 已保存的 Flash 采样点 | `0x02f000` |
| 系统程序（下载器）头页 | `0x030000` |
| 应用头页 | `0x200000`（最大 `0x4CF000` 字节） |

两个程序都带 4 KiB 头页（见 `tools/mkuf2.py` 和 SyterKit 的 `flash-boot`），头页给出它被载入的 PSRAM 地址。

## 首次安装（需要 FEL）

```sh
xfel spinor write 0       boot.img
xfel spinor write 0x30000 sys.img
xfel spinor write 0x200000 app.img
```

镜像用 `mkuf2.py ... --raw` 生成。一旦加载器在 Flash 里，板子就不会自己进 FEL，需要按住 FEL 键（见[FEL](../../../boot/fel.md)）。

## 编译下载器

```sh
west build -b yuzukineko -d build/uf2 zephyr-components/uf2-downloader
```
