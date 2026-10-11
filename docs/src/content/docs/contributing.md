---
title: "参与贡献"
---

欢迎提交：原理图、PCB 文件、BOM、BSP 支持、示例工程、勘误，以及经过验证的引脚补充。

- 仓库：<https://github.com/YuzukiHD/YuzukiNeko>
- 提交勘误或引脚补充时，请写明<strong>板子版本</strong>和<strong>验证方法</strong>（万用表、示波器、串口日志），并尽量附上原理图页码。
- 硬件设计文件默认以 CC0 1.0 发布；固件、软件和第三方文件遵循各自目录的许可证。

## 本地预览这份文档

文档是 [docsify](https://docsify.js.org/) 站点，无需构建：

```sh
npx docsify-cli serve docs
# 或
cd docs && python3 -m http.server 3000
```

然后打开 <http://localhost:3000>。
