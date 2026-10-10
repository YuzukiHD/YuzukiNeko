# 安装

## 准备

- 一块 YuzukiNeko。
- 一根接 USB 口的数据线（同时是下载口）。
- 一个接控制台 UART 的 USB 转串口适配器（115200），用来看 `Serial` 输出。
- <strong>Arduino IDE 2.x</strong> 或 `arduino-cli`。

## 安装

1. <strong>文件 → 首选项</strong>，在“其他开发板管理器地址”粘贴：
   ```
   https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json
   ```
2. 打开<strong>开发板管理器</strong>，搜索 <strong>YuzukiHD Boards</strong> 并安装。
3. <strong>工具 → 开发板 → YuzukiHD Boards</strong>，选 <strong>YuzukiNeko</strong>。
4. <strong>工具 → 编程器 → xfel (USB FEL)</strong>。板子没有串口 bootloader，普通“上传”箭头不能用，只有“使用编程器上传”可用。选择会被记住。

arduino-cli：

```sh
arduino-cli config add board_manager.additional_urls https://github.com/YuzukiHD/Arduino/releases/latest/download/package_yuzukihd_index.json
arduino-cli core update-index
arduino-cli core install yuzuki:f101
```

?> 索引文件只有在发布过 Release 之后才存在；在此之前请用 Release 资源或自己构建。

### 一次性：安装 FEL 的 USB 驱动

- <strong>Windows</strong>：按住板上 <strong>FEL</strong> 键上电，打开 <https://zadig.akeo.ie>，选设备 `USB Device (VID_1f3a PID_efe8)`，驱动选 <strong>WinUSB</strong>，点 <strong>Install Driver</strong>。
- <strong>Linux</strong>：`sudo apt install libusb-1.0-0`，再放行权限：
  ```sh
  echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="1f3a", ATTR{idProduct}=="efe8", MODE="0666"' | sudo tee /etc/udev/rules.d/50-allwinner-fel.rules
  sudo udevadm control --reload
  ```

## 离线安装

从 Releases 页（<https://github.com/YuzukiHD/Arduino/releases>）下载 `yuzukihd-f101-<版本>.zip`，解压到 `<草图本>/hardware/yuzuki/f101`（草图本默认是 `Documents/Arduino`），把同一页的 `riscv-gcc` 和 `xfel` 装到 `<Arduino15>/packages/yuzuki/tools/<名称>/<版本>`（Windows 上 `Arduino15` 是 `%LOCALAPPDATA%\Arduino15`，Linux 上是 `~/.arduino15`），重启 IDE。
