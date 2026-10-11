# YuzukiNeko 文档站

用 [Starlight](https://starlight.astro.build)（Astro）构建，发布在 GitHub Pages：<https://yuzukihd.github.io/YuzukiNeko/>。

```sh
cd docs
npm ci          # 安装依赖
npm run dev     # 本地预览，http://localhost:4321/YuzukiNeko/
npm run build   # 构建到 dist/
```

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/content/docs/` | 页面，Markdown，每页开头有 `title` 前置信息 |
| `src/content/docs/**/figures/` | 页面里的图片，放在文章同目录的 `figures/` 下，用 `![](figures/xx.png)` 引用，例如 `dev/asterinas/figures/`、`boot/figures/`；根目录页面（如外壳）的图片在 `src/content/docs/figures/` |
| `public/casts/` | asciinema 录像（`.cast`） |
| `public/enhance.js` | 浏览器端脚本：画 mermaid 图、启动 asciinema 播放器 |
| `src/plugins/remark-docs.mjs` | 构建期插件，见下 |
| `sidebar.mjs` | 侧边栏，按章节分组，默认折叠 |
| `astro.config.mjs` | 站点配置，`site` 和 `base` 对应 GitHub Pages 的地址 |

## 写页面

- 页面之间的链接直接写相对路径和 `.md`，例如 `[UF2](zephyr-uf2.md)`、`[布局](../../boot/flash-layout.md#备份整片-flash)`，构建时插件会改成站点地址。
- 提示块用 Starlight 的写法：`:::note`、`:::tip`、`:::caution`、`:::danger`，以 `:::` 结束。
- 流程图直接写 ` ```mermaid ` 代码块，在浏览器里绘制。
- asciinema 录像写 `<div class="asciinema-cast" data-src="assets/casts/x/y.cast" data-speed="3"></div>`，文件放在 `public/casts/x/y.cast`。
- 标题里的全角标点（如 `：`）在锚点里会被去掉，链接到这样的标题时按生成的 id 写，例如标题“方式一：下载到 RAM 运行”的锚点是 `#方式一下载到-ram-运行`。

## 部署

`.github/workflows/deploy-docs.yml` 在 `main` 分支上 `docs/` 有改动时构建并发布。第一次使用需要在仓库 Settings → Pages 里把 Source 设成 <strong>GitHub Actions</strong>。
