---
title: "SD、USB 设备与 USB 主机"
---

存储和 USB 共用几个库。`SD` 把 microSD 卡挂载成 FAT 卷，提供 Arduino SD API。`USBDevice` 把 OTG 口变成 CDC ACM 串口。`USBHost` 让 OTG 口工作在主机模式，带一个把 FAT 卷挂成 `USBDrive` 的大容量存储驱动，以及一个支持 CDC ACM 和 CH34x 适配器的串口驱动。

## SD 与 FAT

`SD` 是 `SDClass`，底层是 Zephyr 的 SDMMC 磁盘和 FatFs。`begin()` 的 `csPin` 参数为了兼容而保留，实际不使用。

| 分组 | 方法 |
| --- | --- |
| 挂载 | `begin(csPin)`、`end`、`mounted` |
| 文件 | `open(path, mode)`、`exists`、`remove`、`rename` |
| 目录 | `mkdir`、`rmdir` |
| 空间 | `totalBytes`、`freeBytes`、`cardSize` |

`open()` 返回 `File`。模式默认是 `FILE_READ`。`FILE_WRITE` 遵循 Arduino 习惯：以读写打开、创建文件并追加。也可以使用 `O_READ`、`O_WRITE`、`O_RDWR`、`O_CREAT`、`O_APPEND` 和 `O_TRUNC`。`mkdir()` 会创建缺失的父目录。

| `File` 方法 | 作用 |
| --- | --- |
| `write`、`read`、`peek`、`available`、`flush` | `File` 是 `Stream` |
| `seek`、`position`、`size` | 定位和长度 |
| `close`、`operator bool` | 关闭和判断 |
| `name`、`isDirectory`、`openNextFile`、`rewindDirectory` | 遍历目录 |

`File` 的副本共享同一个打开句柄。目录用 `SD.open("/")` 打开，再用 `openNextFile()` 遍历；`isDirectory()` 区分文件和目录。

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

挂载点是 `SD:`。SD API 里的路径是普通 FAT 路径，例如 `/arduino/hello.txt`；`SD:` 前缀出现在视频和 MP4 API 里，例如 `/SD:/video540p.mp4`。

## USB 设备

`USBDevice` 在 MUSB OTG 控制器上使用 CherryUSB，暴露一个 CDC ACM 串口，和 UART 控制台相互独立。

| 方法 | 作用 |
| --- | --- |
| `setID(vid, pid)`、`setStrings(manufacturer, product, serial)` | 给 PC 看的身份；在 `begin()` 前调用 |
| `begin()`、`begin(baud)`、`end()` | 启动和停止；波特率参数被忽略 |
| `configured()`、`connected()`、`operator bool` | 枚举状态和 DTR 状态 |
| `baud()` | PC 侧选择的波特率 |
| `read`、`peek`、`available`、`write`、`flush`、`setWriteTimeout` | 流式读写 |

PC 配置好设备并打开端口（DTR）后 `connected()` 为真。`setWriteTimeout(ms)` 控制写入等待 PC 取数据的时间；0 表示立即丢弃。USB 口同时也是下载口，先烧录，再重新插线使用 `USBSerial`。示例是 `USBSerialEcho`。

## USB 主机

`USBHost` 让 OTG 口工作在主机模式。一个 sketch 只能用一种角色：`USBDevice` 和 `USBHost` 不能同时使用。EVB 用 PE2 切换 VBUS，PE2 不能再做别的用途。

`USBHostClass` 有 `begin()`、`end()`、`connected()` 和 `info(USBHostDeviceInfo&)`。`USBHostDeviceInfo` 报告 VID、PID、类、速度（low、full、high）和地址。

`USBHostMSC` 是大容量存储类：

| 方法 | 作用 |
| --- | --- |
| `begin(timeoutMs)`、`present()` | 等待并检测盘 |
| `blockCount()`、`blockSize()`、`capacity()` | 几何信息 |
| `readBlocks(lba, buf, count)`、`writeBlocks(lba, buf, count)` | 原始 512 字节块访问 |
| `info(USBHostDeviceInfo&)` | 设备身份 |
| `mount()`、`unmount()` | 把 FAT 卷挂成 `USBDrive` |

`mount()` 之后，`USBDrive` 的用法和 `SD` 一样：`USBDrive.open("/readme.txt")`、`USBDrive.exists()` 等。`USBMassStorage` 打印身份、读取 MBR 并列出根目录。

`USBHostSerial` 是 CDC ACM 设备或 CH34x 适配器上的 `Stream`。`begin(baud, config)` 打开，`present()` 检测，`read`、`peek`、`available`、`write` 照常使用。`USBSerialBridge` 把它桥接到 UART 控制台。

## 卷

`SD` 和 `USBDrive` 都是 `SDClass` 实例。`SD` 是卡槽；`USBDrive` 是 USB 大容量存储设备的 FAT 卷，只有 `USBHostMSC.mount()` 之后才能用。两者使用同一个 `File` 类型，为其中一个卷写的代码换个对象名就能用于另一个。

## 状态

`SD` 在 EVB 上跑过：mkdir、读、seek、改名和删除都通过。`USBDevice`、`USBHost`、`USBHostMSC` 和 `USBHostSerial` 能构建和链接，但当前板测列表里没有它们。设备模式先试 `USBSerialEcho`，主机模式先试 `USBMassStorage`。
