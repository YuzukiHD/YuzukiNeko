# Flash Layout and First Installation

## Flash Layout (16 MiB)

| Content | Offset |
| --- | --- |
| Loader ×3 | `0x000000` / `0x010000` / `0x020000` (`boot.img`) |
| Saved Flash sample point | `0x02f000` |
| System program (downloader) header page | `0x030000` |
| Application header page | `0x200000` (up to `0x4CF000` bytes; Arduino: core `0x200000`, sketch `0x400000`) |

Both programs carry a 4 KiB header page (see `tools/mkuf2.py` and SyterKit's `flash-boot`), which gives the PSRAM address they are loaded to.

## First Installation (needs FEL)

```sh
xfel spinor write 0       boot.img
xfel spinor write 0x30000 sys.img
xfel spinor write 0x200000 app.img
```

Generate the images with `mkuf2.py ... --raw`. Once the loader is in Flash, the board no longer enters FEL by itself; you need to hold the FEL button (see [FEL](../../boot/fel.md)).

## Building the Downloader

```sh
west build -b yuzukineko -d build/uf2 zephyr-components/uf2-downloader
```
