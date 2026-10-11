---
title: "参与贡献"
---

欢迎提交：原理图、PCB 文件、BOM、BSP 支持、示例工程、勘误，以及经过验证的引脚补充。

- 仓库：<https://github.com/YuzukiHD/YuzukiNeko>
- 提交勘误或引脚补充时，请写明<strong>板子版本</strong>和<strong>验证方法</strong>（万用表、示波器、串口日志），并尽量附上原理图页码。
- 硬件设计文件默认以 CC0 1.0 发布；固件、软件和第三方文件遵循各自目录的许可证。

## 本地预览这份文档

文档是 [Starlight](https://starlight.astro.build)（Astro）站点，源码在仓库的 `docs/` 目录，需要 Node.js 22.12 或更新的版本：

```sh
cd docs
npm ci          # 第一次，或依赖有变化时
npm run dev     # 开发预览，改了页面会自动刷新
```

然后打开 <http://localhost:4321/YuzukiNeko/>。

要看和线上一样的构建结果：

```sh
npm run build      # 输出到 docs/dist/
npm run preview    # 预览构建结果
```

- 页面是 `docs/src/content/docs/` 下的 Markdown 文件，写法和目录约定见 `docs/README.md`。
- 改了构建插件或样式后，如果页面还是旧的，删掉 `docs/.astro` 和 `docs/node_modules/.astro` 再重启，Astro 会按页面内容缓存渲染结果。
- 推送到 `main` 后，GitHub Actions 会自动构建并发布到 GitHub Pages。
