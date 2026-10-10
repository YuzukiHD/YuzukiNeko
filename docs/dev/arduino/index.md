# Arduino

用 Arduino API 写 `.ino` 草图，通过 Arduino IDE 或 arduino-cli 上传。底层是一份预编译的 Zephyr 核心，草图用普通 gcc 链接到它上面，所以只需要 Arduino IDE（或 arduino-cli）、RISC-V GCC 和 `xfel`，这些都由板管理器自动装好（约 85 MB）。

仓库：<https://github.com/YuzukiHD/Arduino>。支持 Windows 10/11 和 Linux x86_64。

## 本章内容

- [安装](install.md)
- [第一个草图](first-sketch.md)
- [编写草图与 API](api.md)
- [外设库](libraries.md)
- [运行原理与硬件注意事项](internals.md)
