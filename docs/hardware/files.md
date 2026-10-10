# 硬件文件说明

硬件设计文件放在仓库 `01_Hardware/` 下，<strong>每个版本一套</strong>。在线浏览：<https://github.com/YuzukiHD/YuzukiNeko/tree/main/01_Hardware>

| 目录 | 内容 | 格式 |
| --- | --- | --- |
| `01_SCH/` | 原理图 | PDF |
| `02_PCB/` | PCB 设计文件 | 嘉立创 EDA Pro（`.epro2`） |
| `03_Garber/` | 生产用 Gerber | ZIP（V1.4、V1.5、V1.3 均有） |
| `04_3D/` | PCB 三维模型 | ZIP |
| `05_BOM/` | 物料清单（V1.3、V1.4 另有交互式 BOM 网页） | XLSX / HTML |
| `06_PickAndPlace/` | 贴片坐标 | XLSX |
| `07_Project/` | 完整工程（V1.4、V1.5） | `.epro2` |

每个子目录下都有 `V1.3`、`V1.4`、`V1.5` 文件夹，文件名里带有导出日期。

## 怎么用

- <strong>看接线</strong>：打开对应版本的原理图 PDF。接线前先用它确认引脚用途、GPADC 通道和板载器件，而不是只看排针丝印。
- <strong>改设计</strong>：用嘉立创 EDA Pro 打开 `07_Project` 或 `02_PCB` 里的 `.epro2` 工程文件。
- <strong>打样</strong>：把 `03_Garber` 中对应版本的 ZIP 提交给板厂；贴片使用 `05_BOM` 与 `06_PickAndPlace`。
- <strong>做外壳</strong>：用 `04_3D` 的三维模型核对尺寸，或直接用[现成外壳](../shell.md)。

?> 请始终使用与你手上板子<strong>同一版本</strong>的文件。版本之间的差异（PD 丝印、`R11`、PSRAM LDO）见[勘误与版本差异](errata.md)。

## 协议

硬件设计文件以 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) 发布，另有说明的除外。
