# UF2 Drag-and-Drop Flashing

Flash without installing any tools: just drag a `.uf2` file onto a USB drive. The board runs a USB downloader that appears as a drive named `F101BOOT` (128 MiB FAT16, generated on the fly). Every UF2 block received is written to the SPI NOR, and the board restarts automatically when done.

?> The UF2 downloader is a Zephyr application in the F101 workspace. To use it, the board's Flash must first contain SyterKit's `flash-boot` loader and the downloader itself (installed once via FEL).

## Usage

1. At power-up, **hold the button on `PD5` (to ground)**, or power up the board with no valid application. The loader starts the downloader instead of the application.
2. The board shows up on the PC as the drive `F101BOOT` (using the USB cable on the download port).
3. Copy the `.uf2` file into it. When the last block is written, the board restarts into the application automatically.

## Making a `.uf2`

Generate it from an image with `tools/mkuf2.py`:

```sh
tools/mkuf2.py app build/gba/zephyr/zephyr.bin -o gba.uf2        # application, Flash 0x200000
tools/mkuf2.py system build/uf2/zephyr/zephyr.bin -o dl.uf2      # the downloader itself, Flash 0x30000
tools/mkuf2.py loader boot.img -o loader.uf2                     # loader, Flash 0
```

| Type | UF2 family | Writable range |
| --- | --- | --- |
| `app` | `0x31303146` | Application area only (offset ≥ `0x200000`) |
| `system`, `loader` | `0x31303147` | Anywhere |

!> `system` and `loader` files can write to any location; a bad write can leave the board without a loader, and then only **FEL** can rescue it. Only drop files you trust.

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

Generate the images with `mkuf2.py ... --raw`. Once the loader is in Flash, the board no longer enters FEL by itself; you need to hold the FEL button (see [FEL](../boot/fel.md)).

## Building the Downloader

```sh
west build -b yuzukineko -d build/uf2 zephyr-components/uf2-downloader
```
