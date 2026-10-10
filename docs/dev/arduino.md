# Arduino

用 Arduino API 写 `.ino` 草图，通过 Arduino IDE 或 arduino-cli 上传。底层是一份预编译的 Zephyr 核心，草图用普通 gcc 链接到它上面，所以只需要 Arduino IDE（或 arduino-cli）、RISC-V GCC 和 `xfel`，这些都由板管理器自动装好（约 85 MB）。

仓库：<https://github.com/YuzukiHD/Arduino>。支持 Windows 10/11 和 Linux x86_64。

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

## 第一个草图：Blink

1. <strong>文件 → 示例</strong>，在 <strong>YuzukiHD Boards</strong> 下打开 <strong>Blink</strong>（也可在 `Documents/Arduino/hardware/yuzuki/f101/examples` 找到）。
2. 点<strong>验证</strong>（对勾），几秒编译完成。
3. 让板子进入 FEL：<strong>按住 FEL 键，上电（或复位），松开</strong>。
4. <strong>项目 → 使用编程器上传</strong>（Ctrl+Shift+U）。它把加载器、核心和草图写进板上 Flash 并启动。
5. 在 115200 打开控制台串口，应看到 `F101 Arduino: Blink` 和每半秒一次的 `on` / `off`。LED 引脚是 `PA0`（EVB 没有用户 LED，需要自己接一个）。

之后板子<strong>每次上电自己运行草图</strong>。要再次上传，仍需让它进入 FEL（按住 FEL 上电），因为从 Flash 启动的板子不会自己进 FEL。

| 现象 | 处理 |
| --- | --- |
| 提示 `no board in FEL mode` | 板子没进 FEL；重做第 3 步，检查 USB 驱动 |
| `Request 'upload' failed` | 选了“上传”而不是“使用编程器上传”，或没选编程器 |

## 编写草图

用的是通常的 Arduino API：`pinMode`、`digitalWrite`、`analogRead`、`analogWrite`、`Serial`、`Wire`、`SPI`、`String`、`millis`、`delay` 等。

- 引脚名是 `PA0` … `PF31`（端口字母 + 编号），模拟输入是 `A0`..`A11`。
- `Serial.begin(115200)` 就是控制台所需的全部初始化；其他 UART 是 `Serial1`..`Serial5`，用 `Serial1.setPins(rx, tx)` 选引脚（控制台的引脚来自板级配置，不会被重新路由）。
- 外设以库的形式提供，用到什么就 `#include`：`<SD.h>`、`<Display.h>`、`<Audio.h>`、`<MP4Player.h>` 等。示例演示了每个库。

两点注意：

- `Display` 和 `DBI` 使用相同的引脚（`PD0`–`PD5`），一个草图里只能用其中一个。
- 一个草图最多 <strong>2 MiB</strong> 代码和数据；系统（Zephyr、驱动、所有库，约 0.9 MB）属于预编译核心，不计入。IDE 显示的大小只是草图自己，所以很小。

## 支持的 API

| Arduino API | 实现 |
| --- | --- |
| `pinMode/digitalWrite/digitalRead` | Zephyr GPIO，引脚号 = 端口 × 32 + 引脚，名字 `PA0`..`PF31` |
| `attachInterrupt/detachInterrupt` | GPIO 回调（`RISING/FALLING/CHANGE/ONHIGH/ONLOW`） |
| `analogRead(A0..A11)` | GPADC，12 位，按 `analogReadResolution()` 缩放（默认 10） |
| `analogWrite`、`tone`、`analogWriteFrequency` | PWM0，引脚 `PD6 PD7 PD8 PB3`（默认 500 Hz） |
| `Serial` | 板子的控制台 UART，带 RX 环形缓冲，支持 `begin(baud, SERIAL_8N1...)` |
| `Serial1..Serial5` | UART5、UART2、UART1、UART0、UART4 |
| `setPins(rx, tx)` | 运行时路由引脚（无需改设备树）：UART0 PF4/PF2，UART1 PF1/PF0 或 PB1/PB0，UART2 PF5/PF4，UART3 PE9/PE8 或 PE1/PE0，UART4 PE3/PE2，UART5 PE5/PE4（RX/TX）。其他引脚会被拒绝。第一组是默认值（Serial2..Serial4 默认落在 SD 卡引脚 PF0..PF5 上） |
| `Wire` | I2C1：PE0（SCL）/ PE1（SDA），仅控制器模式 |
| `SPI` | SPI0：PC0（SCK）/ PC4（MOSI）/ PC2（MISO），片选由草图自己处理 |
| `millis/micros/delay/delayMicroseconds` | 内核时钟，24 MHz 周期计数器 |
| `String`、`Print`、`Stream`、`F()`、`printf` | 自有实现，支持 `Serial.printf()` |
| 数学函数 | 工具链 libm（`sin`、`pow` 等） |

`setup()` 和 `loop()` 跑在 Zephyr 主线程（16 KiB 栈）；`new` / `malloc` 使用镜像以上的全部 RAM。

## 外设库

所有库都是预编译核心的一部分，草图 include 即可。会占用引脚或电源的设备由库在 `begin()` 里启动，而不是开机就启动。

| 库 | 硬件 | 说明 |
| --- | --- | --- |
| `Display` | DE + TCON + RGB 屏 | ARGB8888 缓冲，绘图/文字，`show()`，视频层（`showYuv`），背光。`Display.begin()` 后占用 PD0..PD22、PE6/7、PB0..PB3。LVGL 不在核心里：把 LVGL Arduino 库指向 `Display.buffer()` |
| `G2D` | 2D 引擎 | 填充、blit（转换/缩放）、混合；旋转/翻转必须保持格式和尺寸 |
| `DBI` | MIPI DBI（PD0..PD5） | 与 `Display` 互斥：同时 include 会 `#error` |
| `Audio` | 片上 codec | PCM 输出、麦克风输入、音调、音量、喇叭功放（PE10） |
| `I2S`、`SPDIF` | I2S0、OWA | EVB 上 I2S0 没有引脚（内部回环）；S/PDIF 接收 DMA 未解决 |
| `SD` | SMHC0（PF0..PF6） | Arduino SD API，`File` 是 `Stream`；也是 `USBDrive` 卷 |
| `USBDevice` | CherryUSB 设备 | `USBSerial`（CDC ACM） |
| `USBHost` | CherryUSB 主机 | `USBHostMSC`（含 FAT 挂载为 `USBDrive`）、`USBHostSerial`；一个草图只能选一种 USB 角色 |
| `VideoDecoder` | VE | 硬件 JPEG/PNG、H.264 流 |
| `MP4`、`AACDecoder`、`MP4Player` | 解复用、AAC、完整播放器 | 播放器需要 Display、SD 和 codec |
| `Watchdog` | WDT | `begin(ms)`、`reset()`、`end()` |

随库自带的示例有：Blink、SelfTest、AnalogSerial、I2CScan、SerialPins、StringDemo、SDInfo、SDListFiles、SDReadWrite、DisplayBasics、DisplayYuvOverlay、G2DDemo、DBIProbe、JPEGShow、H264Frames、MP4Info、PlayVideo、AACToPCM、AudioTone、AudioPlayPCM、AudioMicLevel、I2SLoopback、SPDIFTone、USBSerialEcho、USBSerialBridge、USBMassStorage、WatchdogDemo。

### 验证状态

只列有串口可验证的结果，画面和声音没有人工评判：

- 已验证：SelfTest（String、计时、数学、GPIO、ADC、PWM、Wire、SPI、Serial RX 回显）、AnalogSerial、DisplayBasics、Flash 启动、Windows 上的 `upload.cmd`；此前在单外设核心上验证过 `I2S` 回环、`SD`、`Watchdog`、`G2D`、`VideoDecoder` JPEG。
- 已编译但<strong>尚未在当前核心上运行</strong>：`DBI`、`G2D`、`VideoDecoder`、`Audio`、`SPDIF`、`USBDevice`、`USBHost`、`MP4*`、H.264、PNG。

## 它是怎么运行的

```
SPI NOR   0x000000  加载器（SyterKit，每隔 64 KiB 共 3 份）：初始化 PSRAM
          0x200000  核心头页 + 核心镜像（Zephyr、驱动、库；链接在 0x40000000）
          0x400000  草图镜像（链接到 0x40e00000 的窗口）
```

上电时 BROM 启动加载器，加载器把核心和草图复制进 PSRAM 并启动核心，核心再调用草图的 `setup()` 和 `loop()`。草图由普通 gcc 针对 `prebuilt/core/core.elf` 编译链接。

上传使用 `xfel`，不需要串口：按住 FEL 上电，上传。`xfel` 写入加载器、核心和草图，然后启动加载器。

## 硬件注意事项

- `PE2` 是 USB VBUS 开关，`PF0..PF5` 是 SD 卡，避开它们。
- 需要显示的引脚（`PD0..PD22`、`PB0..PB3`）只有在 `Display`（或 `DBI`）启动后才被占用；PWM 和 UART 引脚在第一次使用时才路由。
- `LED_BUILTIN` 是 `PA0`，需要自己接 LED。

## 局限

- `Wire.endTransmission(false)`（重复起始）仍以 STOP 结束；没有从机模式。
- `Serial.print` 是同步的（轮询发送），shell 和日志被禁用，让 `Serial` 独占控制台 UART。
- 在没有 PWM 的引脚上 `analogWrite` 退化为 50% 阈值的数字输出。
- 暂无 `Servo`、`EEPROM`、`WiFi` 库。

## 离线安装

从 Releases 页（<https://github.com/YuzukiHD/Arduino/releases>）下载 `yuzukihd-f101-<版本>.zip`，解压到 `<草图本>/hardware/yuzuki/f101`（草图本默认是 `Documents/Arduino`），把同一页的 `riscv-gcc` 和 `xfel` 装到 `<Arduino15>/packages/yuzuki/tools/<名称>/<版本>`（Windows 上 `Arduino15` 是 `%LOCALAPPDATA%\Arduino15`，Linux 上是 `~/.arduino15`），重启 IDE。
