---
title: "SD, USB device and USB host"
---

Storage and USB share the same libraries. `SD` mounts the microSD card as a FAT volume and exposes the Arduino SD API. `USBDevice` turns the OTG port into a CDC ACM serial port. `USBHost` runs the OTG port in host mode, with a mass-storage driver that mounts a FAT volume as `USBDrive`, and a serial driver for CDC ACM and CH34x adapters.

## SD and FAT

`SD` is a `SDClass` over the Zephyr SDMMC disk and FatFs. The `csPin` argument of `begin()` is accepted for compatibility and ignored.

| Group | Methods |
| --- | --- |
| Mount | `begin(csPin)`, `end`, `mounted` |
| Files | `open(path, mode)`, `exists`, `remove`, `rename` |
| Directories | `mkdir`, `rmdir` |
| Space | `totalBytes`, `freeBytes`, `cardSize` |

`open()` returns a `File`. The mode is `FILE_READ` by default. `FILE_WRITE` follows the Arduino convention: open read/write, create the file and append. The `O_READ`, `O_WRITE`, `O_RDWR`, `O_CREAT`, `O_APPEND` and `O_TRUNC` flags are also available. `mkdir()` creates missing parent directories.

| `File` method | Purpose |
| --- | --- |
| `write`, `read`, `peek`, `available`, `flush` | `File` is a `Stream` |
| `seek`, `position`, `size` | Positioning and length |
| `close`, `operator bool` | Close and test |
| `name`, `isDirectory`, `openNextFile`, `rewindDirectory` | Directory walking |

Copies of a `File` share the same open handle. A directory is opened with `SD.open("/")` and walked with `openNextFile()`; `isDirectory()` tells files from folders.

```cpp
#include <SD.h>

void setup() {
  Serial.begin(115200);
  if (!SD.begin()) {
    Serial.println("SD.begin() failed");
    return;
  }
  File f = SD.open("/arduino/hello.txt", O_WRITE | O_CREAT | O_TRUNC);
  f.println("hello from the F101");
  f.close();

  f = SD.open("/arduino/hello.txt");
  while (f.available()) Serial.write(f.read());
  f.close();
}
```

The mount point is `SD:`. Paths in the SD API are ordinary FAT paths such as `/arduino/hello.txt`; the `SD:` prefix appears in the video and MP4 APIs, for example `/SD:/video540p.mp4`.

## USB device

`USBDevice` uses CherryUSB on the MUSB OTG controller. It exposes one CDC ACM serial port, independent of the UART console.

| Method | Purpose |
| --- | --- |
| `setID(vid, pid)`, `setStrings(manufacturer, product, serial)` | Identity shown to the PC; call before `begin()` |
| `begin()`, `begin(baud)`, `end()` | Start and stop the device; the baud rate is ignored |
| `configured()`, `connected()`, `operator bool` | Enumeration and DTR state |
| `baud()` | The rate the PC selected |
| `read`, `peek`, `available`, `write`, `flush`, `setWriteTimeout` | Stream I/O |

`connected()` is true when the PC has configured the device and opened the port (DTR). `setWriteTimeout(ms)` controls how long a write waits for the PC to take data; 0 drops at once. The USB port is also the download port, so flash first and plug the cable again to use `USBSerial`. `USBSerialEcho` is the example.

## USB host

`USBHost` runs the OTG port in host mode. Only one role is possible per sketch: `USBDevice` and `USBHost` cannot be used together. The EVB switches VBUS with PE2; do not use PE2 for anything else.

`USBHostClass` has `begin()`, `end()`, `connected()` and `info(USBHostDeviceInfo&)`. `USBHostDeviceInfo` reports VID, PID, class, speed (low, full, high) and address.

`USBHostMSC` is the mass-storage class:

| Method | Purpose |
| --- | --- |
| `begin(timeoutMs)`, `present()` | Wait for and test a drive |
| `blockCount()`, `blockSize()`, `capacity()` | Geometry |
| `readBlocks(lba, buf, count)`, `writeBlocks(lba, buf, count)` | Raw 512-byte block access |
| `info(USBHostDeviceInfo&)` | Device identity |
| `mount()`, `unmount()` | Mount the FAT volume as `USBDrive` |

After `mount()`, use `USBDrive` exactly like `SD`: `USBDrive.open("/readme.txt")`, `USBDrive.exists()`, and so on. `USBMassStorage` prints the identity, reads the MBR and lists the root.

`USBHostSerial` is a `Stream` over a CDC ACM device or a CH34x adapter. `begin(baud, config)` opens it, `present()` tests it, and `read`, `peek`, `available`, `write` work as usual. `USBSerialBridge` bridges it to the UART console.

## Volumes

`SD` and `USBDrive` are both `SDClass` instances. `SD` is the card slot; `USBDrive` is the FAT volume of the USB mass-storage device and only works after `USBHostMSC.mount()`. Both use the same `File` type, so code written for one volume works with the other by changing the object name.

## Status

`SD` ran on the EVB: mkdir, read, seek, rename and remove all passed. `USBDevice`, `USBHost`, `USBHostMSC` and `USBHostSerial` build and link, but the current board-test list does not include them. Start with `USBSerialEcho` for device mode, then `USBMassStorage` for host mode.
