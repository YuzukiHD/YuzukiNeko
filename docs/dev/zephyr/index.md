# Zephyr

Zephyr 对 F101 的支持放在 F101 west 工作区里：SoC（`sun252i_f101`）、设备树、板级 `yuzukineko`，以及时钟/复位、pinctrl、GPIO、I2C、SPI、PWM、ADC、DMA、看门狗、显示、音频、USB、SD 卡、G2D、视频解码等驱动。本章说明怎么编译并把程序放到 YuzukiNeko 上运行。

!> Zephyr 的板级和驱动代码在 F101 工作区，不在 YuzukiNeko 硬件仓库中。下面的命令都在工作区根目录下执行。

## 本章内容

- [板级](boards.md)
- [编译与运行](build-run.md)
- [引脚冲突](pin-conflicts.md)
- [示例](samples.md)
- [MicroPython](micropython/index.md)
- [mGBA](mgba/index.md)
- [NES](nes/index.md)
- [Doom](doom/index.md)
