# YuzukiNeko 文档站

用 [Starlight](https://starlight.astro.build)（Astro）构建，中英双语，发布在 GitHub Pages：<https://yuzukihd.github.io/YuzukiNeko/>。

```sh
cd docs
npm ci             # 安装依赖
npm run dev        # 本地预览，http://localhost:4321/YuzukiNeko/
npm run build      # 构建到 dist/
npm run check:i18n # 校验中英两棵树是否对得上
```

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/content/docs/` | **英文**页面，Markdown，每页开头有 `title` 前置信息 |
| `src/content/docs/zh/` | 简体中文页面，与英文树一一对应、相对路径相同 |
| `src/content/docs/**/figures/` | 页面里的图片，放在文章同目录的 `figures/` 下，用 `![](figures/xx.webp)` 引用，例如 `dev/asterinas/figures/`、`boot/figures/`；根目录页面（如外壳）的图片在 `src/content/docs/figures/` |
| `public/figures/` | 两种语言共用、不走 Astro 图片处理的图（首页那张板子渲染图）。页面里写 `<img src="assets/figures/xx.webp">`，`assets/` 前缀由构建插件换成站点地址 |
| `public/casts/` | asciinema 录像（`.cast`），两种语言共用 |
| `public/enhance.js` | 浏览器端脚本：画 mermaid 图、启动 asciinema 播放器 |
| `src/plugins/remark-docs.mjs` | 构建期插件，见下 |
| `sidebar.mjs` | 侧边栏，按章节分组；一级分组默认展开，嵌套的子分组默认折叠 |
| `astro.config.mjs` | 站点配置，`site` 和 `base` 对应 GitHub Pages 的地址，`locales` 定义两种语言 |

## 双语站点

英文是根语言，地址不带前缀；简体中文挂在 `/zh/` 下：

| 语言 | 页面所在目录 | 地址 |
| --- | --- | --- |
| English（root，`lang: 'en'`） | `src/content/docs/**` | `/YuzukiNeko/quickstart/` |
| 简体中文（`lang: 'zh-CN'`） | `src/content/docs/zh/**` | `/YuzukiNeko/zh/quickstart/` |

- **两棵树必须一一对应**：同一相对路径要在两边都存在，少一个 `npm run build` 就会报
  `The slug "..." specified in the Starlight sidebar config does not exist`。新增页面时两种语言一起加。
- **`sidebar.mjs` 只有一份**：`label` 用英文写，中文放进 `translations`。键是 BCP-47 的 `lang`
  （`'zh-CN'`），不是 `locales` 里的目录名（`zh`）。`slug` 是语言相对的，两边自动解析到各自语言的同名页面。
- **图片两份**：`figures/` 在英文树和 `zh/` 下各存一份、内容完全相同（同样的文件在 git 里只占一份空间）。
  换图时两边都要更新，否则 `npm run check:i18n` 会报 `figure ... differs between the two trees`。
- **图片一律用 WebP**：宽度不超过 1280（首页渲染图 800），截图和照片质量 82 上下，二维码这类要能扫的用无损，
  同一张图取「有损 / 无损」里更小的那个。存图时顺手压一下，别把几 MB 的原图直接放进来。
- **`public/` 共用**：录像、mermaid、样式两种语言共享，不需要复制。
- **页面内的锚点链接**：中文页里的 `#备份整片-flash` 在英文页要写成英文标题推导出的 id。

### 校验

`npm run check:i18n` 逐页比对中英两棵树，可以只查一个页面：

```sh
npm run check:i18n                       # 全部 57 对
npm run check:i18n -- dev/zephyr/drivers/gpio
npm run check:i18n -- --verbose          # 额外列出代码块里被翻译的标注
```

`error:` 表示真的对不上，必须修；`warning:` 是给人看的提示。检查内容：

| 项目 | 判定 |
| --- | --- |
| 代码块 | **去掉注释后**逐字节相同。代码、命令、路径、寄存器名、十六进制、粘贴的终端输出都不许变 |
| 代码块里的中文 | 注释里的中文算漏翻（`error`）；粘贴输出里的中文算数据、要求保留（`warning`） |
| 行尾标注 | 目录树、带标注的终端记录里，`名称` + 两个以上空格 + 说明 的说明部分可以翻译，其余部分仍须逐字相同 |
| mermaid | 块数量一致、图里不残留中文，并比对去掉标签后的骨架（节点、箭头、subgraph/participant 结构） |
| 结构 | 表格行数、标题数量、提示块类型与数量、`<strong>` 数量、图片路径、页面链接目标 |
| 语言 | 英文页正文里不残留中日韩字符 |
| 锚点 | 每个 `#锚点` 都能在对应语言的页面上找到同名标题（锚点按各语言自己的标题推导，允许中英不同） |
| 图片 | 两棵树的 `figures/` 逐字节相同 |

全绿时输出一行汇总，例如 `check-i18n: 57 page pair(s) OK, 31 translated label(s) in code listings`。

### 翻译约定

散文翻译，其余照抄。**逐字节保持**：代码块里的代码本身、命令与参数、终端输出与日志、行内代码中的
标识符、文件路径、URL、十六进制与版本号、devicetree/Kconfig/YAML 片段、HTML 标签与属性、
asciinema 的 `data-src`。

**翻译**：`title`、标题、正文、表格表头与散文单元格、图片 alt、提示块正文、mermaid 图里的节点标签，
以及代码块里的**注释文字**（`#`、`//`、`/* */`）。

**不要翻译代码块里属于"真实输出/数据"的中文**：程序打印的用法字符串、控制台回显、扫描到的 SSID 等，
照原样保留——翻成英文就成了伪造的输出。`check-i18n` 把代码块去掉注释后逐字节比对，
所以这些数据必须一字不差，而注释可以翻译。

不增删任何事实、结论与版本号。

术语表（英文页面统一用词）：

| 中文 | English | 中文 | English |
| --- | --- | --- | --- |
| 开发板 / 板卡 | board / development board | 驱动 | driver |
| 底板 | base board | 组件 | component |
| 引脚排布 | pinout | 协议栈 | stack |
| 引脚复用 | pin multiplexing (MUX) | 设备树 | devicetree |
| 复用功能 | alternate function | 编译 / 构建 | build |
| 互斥 | mutually exclusive | 交叉编译 | cross-compile |
| 勘误 | errata | 固件 | firmware |
| 版本 | revision | 镜像 | image |
| 丝印 | silkscreen | 烧录 / 刷入 | flash |
| 外壳 | enclosure | 下载模式 | download mode |
| 串口 | serial port | 上拉 / 下拉 | pull-up / pull-down |
| 外设 | peripheral | 中断 | interrupt |
| 背光 | backlight | 投屏 / 镜像 | screen mirroring |
| 副屏 | secondary display | 模拟器 | emulator |
| 帧 | frame | 推理 | inference |
| 分辨率 | resolution | 解封装 | demux |
| 分区 | partition | 布局 | layout |
| 备份 | backup / back up | 校验 | verify |
| 日志 | log | 控制台 | console |

## 写页面

- 页面之间的链接直接写相对路径和 `.md`，例如 `[UF2](zephyr-uf2.md)`、`[布局](../../boot/flash-layout.md#备份整片-flash)`，构建时插件会改成站点地址。
  插件按页面所在目录推导地址，所以相对链接在两种语言下都指向同语言的页面；**不要写以 `/` 开头的绝对链接**，那样会丢掉 `/zh/` 前缀。
- 提示块用 Starlight 的写法：`:::note`、`:::tip`、`:::caution`、`:::danger`，以 `:::` 结束。
- 流程图直接写 ` ```mermaid ` 代码块，在浏览器里绘制。
- asciinema 录像写 `<div class="asciinema-cast" data-src="assets/casts/x/y.cast" data-speed="3"></div>`，文件放在 `public/casts/x/y.cast`。
- 标题里的全角标点（如 `：`）在锚点里会被去掉，链接到这样的标题时按生成的 id 写，例如标题“方式一：下载到 RAM 运行”的锚点是 `#方式一下载到-ram-运行`。

## 部署

`.github/workflows/deploy-docs.yml` 在 `main` 分支上 `docs/` 有改动时构建并发布。第一次使用需要在仓库 Settings → Pages 里把 Source 设成 <strong>GitHub Actions</strong>。
