# 运行原理与硬件注意事项

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
