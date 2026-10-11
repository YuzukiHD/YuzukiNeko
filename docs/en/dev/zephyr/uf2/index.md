# UF2 Drag-and-Drop Flashing

Flash without installing any tools: just drag a `.uf2` file onto a USB drive. The board runs a USB downloader that appears as a drive named `F101BOOT` (128 MiB FAT16, generated on the fly). Every UF2 block received is written to the SPI NOR, and the board restarts automatically when done.

?> The UF2 downloader is a Zephyr application in the F101 workspace. To use it, the board's Flash must first contain SyterKit's `flash-boot` loader and the downloader itself (installed once via FEL).

## Usage

1. At power-up, **hold the button on `PD5` (to ground)**, or power up the board with no valid application. The loader starts the downloader instead of the application.
2. The board shows up on the PC as the drive `F101BOOT` (using the USB cable on the download port).
3. Copy the `.uf2` file into it. When the last block is written, the board restarts into the application automatically.

## In This Chapter

- [Making a .uf2](make-uf2.md)
- [Flash Layout and First Installation](flash-layout.md)
