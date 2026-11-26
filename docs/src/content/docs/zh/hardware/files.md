---
title: "硬件文件结构"
---

YuzukiNeko 模块的硬件设计文件放在仓库 `01_Hardware/` 下，<strong>每个版本一套</strong>。在线浏览：<https://github.com/YuzukiHD/YuzukiNeko/tree/main/01_Hardware>

:::tip
这一页说明目录结构。要下载文件，请用[硬件资料下载](download.md)。
:::

目录按版本分层：`V1.3/`、`V1.4/`、`V1.5/` 各一个，每个版本目录下是同一套条目。

| 目录 | 内容 | 格式 |
| --- | --- | --- |
| `01_SCH/` | 原理图 | PDF |
| `02_PCB/` | PCB 设计文件 | 嘉立创 EDA Pro（`.epro2`） |
| `03_Gerber/` | 生产用 Gerber | ZIP |
| `04_3D/` | PCB 三维模型 | ZIP |
| `05_BOM/` | 物料清单（V1.3、V1.4 另有交互式 BOM 网页） | XLSX / HTML |
| `06_PickAndPlace/` | 贴片坐标 | XLSX |
| `07_Project/` | 完整工程（V1.4、V1.5；V1.3 没有） | `.epro2` |

文件名里带有导出日期，目录本身的说明见 [`01_Hardware/README.md`](https://github.com/YuzukiHD/YuzukiNeko/blob/main/01_Hardware/README.md)。

## 怎么用

- <strong>看接线</strong>：打开对应版本的原理图 PDF。接线前先用它确认引脚用途、GPADC 通道和板载器件，而不是只看排针丝印。
- <strong>改设计</strong>：用嘉立创 EDA Pro 打开 `07_Project` 或 `02_PCB` 里的 `.epro2` 工程文件。
- <strong>打样</strong>：把 `03_Gerber` 中对应版本的 ZIP 提交给板厂；贴片使用 `05_BOM` 与 `06_PickAndPlace`。
- <strong>做外壳</strong>：用 `04_3D` 的三维模型核对尺寸，或直接用[现成的 3D 打印外壳](../shell.md)，核心板和底板各有一款。

:::tip
请始终使用与你手上板子<strong>同一版本</strong>的文件。版本之间的差异（PD 丝印、`R11`、PSRAM LDO）见[勘误与版本差异](errata.md)。
:::

## YuzukiCube-M 底板

底板的文件单独放在 `04_BaseBoard/` 下，目前只有 `V1.0`，条目与 `01_Hardware/` 的七个目录相同。`04_3D/` 里有 PCB 模型、[底板外壳](https://github.com/YuzukiHD/YuzukiNeko/blob/main/04_BaseBoard/V1.0/04_3D/3DShell_PCB2.zip)（上下壳 STL）和单独的[下壳文件](https://github.com/YuzukiHD/YuzukiNeko/blob/main/04_BaseBoard/V1.0/04_3D/3DShell_3DShell_PCB2_B.stl)。底板本身不是 YuzukiNeko 的一个版本，而是把模块装上去的载板。引脚、器件与电源见 [YuzukiCube-M 底板](../baseboard.md)。

## 协议

硬件设计文件以 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 发布，另有说明的除外。
