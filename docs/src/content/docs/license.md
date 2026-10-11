---
title: "许可证"
---

| 内容 | 许可证 |
| --- | --- |
| 硬件设计文件（原理图、PCB、BOM、Gerber 等） | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)，另有说明的除外 |
| 本文档（文档站里的文字、图片、录像和图表） | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) |
| 固件与软件、第三方文件 | 遵循各自目录里声明的许可证 |
| 3D 外壳 | 改自 dj.santos 的 Pico 外壳（BY-NC-SA），请遵守其条款 |

## 本文档的许可

本文档（文档站里的文字、图片、录像和图表）采用 <strong>知识共享 署名-非商业性使用-相同方式共享 4.0 国际许可协议（CC BY-NC-SA 4.0）</strong>，协议全文见 [法律文本](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.zh-hans)，简要说明见 [许可协议摘要](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)。

| 要求 | 含义 |
| --- | --- |
| 署名（BY） | 使用时要注明出处，给出许可协议的链接，并说明是否做过修改 |
| 非商业性使用（NC） | 不得用于商业目的 |
| 相同方式共享（SA） | 如果基于本文档修改、转载或再创作，要用相同的许可协议发布 |

这个许可只管文档本身，<strong>不改变</strong>上表里硬件设计文件的 CC0 声明，也不改变固件、软件和第三方文件各自的许可证。另外：

- 文档里引用的源码片段（例如 Zephyr 的示例和驱动）仍然遵循原项目的许可证，不因为出现在本文档里而改变。
- 文档里提到或展示的第三方内容（例如 MP4 播放器页的示例视频，来自 Pixabay）不属于本文档的许可范围，请遵守它们各自的条款。

## 固件包里的第三方软件

固件包里的每个组件都遵循自己的许可证，CC0 声明<strong>不适用于</strong>它们。

`02_Firmware/RustSBI-Asterinas/` 里的四个组件：

| 组件 | 许可证文本位置 |
| --- | --- |
| SyterKit | `licenses/syterkit/` |
| RustSBI | `licenses/rustsbi/`（MIT、Mulan） |
| Asterinas | `licenses/asterinas/`（MPL） |
| BusyBox 1.37.0 | `licenses/busybox/` |

`02_Firmware/Linux-Buildroot/` 里的组件：

| 组件 | 许可证 | 许可证文本位置 |
| --- | --- | --- |
| SyterKit | GPL-2.0-or-later | `licenses/syterkit/` |
| OpenSBI | BSD-2-Clause | `licenses/opensbi/` |
| Linux 7.2.0 内核与设备树 | GPL-2.0 WITH Linux-syscall-note | `licenses/linux/` |
| BusyBox 1.38.0 | GPL-2.0 | `licenses/busybox/` |
| musl 1.2.6 | MIT | `licenses/musl/` |
| Buildroot | GPL-2.0-or-later | `licenses/buildroot/` |
| GCC / binutils 工具链 | GPL-3.0-or-later（含 GCC Runtime Library Exception） | `licenses/toolchain/` |

每个包中 `licenses/README.md` 记录了这些许可证文本的来源和校验方式。

仓库根目录的 [LICENSE](https://github.com/YuzukiHD/YuzukiNeko/blob/main/LICENSE) 是总的声明。
