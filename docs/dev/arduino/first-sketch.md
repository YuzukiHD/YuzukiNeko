# 第一个草图

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
