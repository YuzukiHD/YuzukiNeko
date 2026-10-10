# Other Systems and Components

The F101 workspace also contains the directions below. They differ in maturity, which is noted honestly here.

| Project | Content | Status |
| --- | --- | --- |
| **MicroPython** | Upstream Zephyr port as the application, plus an `f101` module (G2D, audio, chip ID); REPL on the console | Verified on the EVB: floating point, `machine` Pin/SPI/ADC/PWM/WDT, SD mount, display writes, G2D, tone output |
| **RT-Thread** | v5.3.0, BSP `sun252iw2`, entirely on the device model and a built-in device tree | Drivers ported and tested on the EVB; USB host not run (the single port is taken by the download cable) |
| **ESP-IDF** | v6.1 port, target `sun252i-f101` | In progress: gpio/uart/i2c/spi/adc/ledc/sdmmc, esp_lcd RGB panel, DMA and audio (on-chip codec) pass EVB tests; USB and WiFi not done |
| **mGBA / NES / Doom** | Ports of game consoles and games | mGBA runs; NES and Doom build and link but have not been run on the board yet |
| **Other Zephyr components** | ncnn, PocketJS, litehtml, AIC8800 WiFi, etc. | Each has its own status; see its README |

?> These are development projects in the F101 workspace and are not part of what the YuzukiNeko hardware repository releases. For specific usage, refer to the README in each directory.
