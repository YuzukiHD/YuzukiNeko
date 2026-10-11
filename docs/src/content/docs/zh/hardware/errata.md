---
title: "勘误与版本差异"
---

## 版本一览

| 版本 | 变化 |
| --- | --- |
| <strong>V1.5</strong> | 新增 PSRAM 专用 LDO 供电，使 <strong>32 MiB PSRAM</strong> 配置可用，本版面向 32 MiB 版本；microSD 检测下拉电阻 `R11` 由 10 kΩ 改为 <strong>1 kΩ</strong>（`PF6`）。 |
| <strong>V1.4</strong> | 修正 PD 脚丝印编号，见下方 V1.3 勘误。只用 16 MiB 配置时，V1.4 把 `R11` 换成 1 kΩ 即可。 |
| <strong>V1.3</strong> | 初始版本。 |

:::caution
<strong>该选哪个版本？</strong> 如果只需要 F101S3 + 16 MiB PSRAM，V1.4 就够用：把 `R11` 换成 1 kΩ，microSD 检测问题就消失了。V1.5 是专门为 32 MiB PSRAM 配置准备的，它需要额外的 PSRAM LDO 电源轨。
:::

## V1.3：PD 丝印编号错误

F101S3 <strong>没有</strong> `PD10` 和 `PD11`。V1.3 的 PCB 在 `PD9` 之后继续顺序编号，导致从 `PD10` 开始的所有 PD 丝印都<strong>比真实 SoC GPIO 编号小 2</strong>。这是 V1.3 丝印的识别错误，V1.4 已更正。做 pinmux、写软件、看原理图时，请使用下表中的“<strong>实际 GPIO / V1.4 丝印</strong>”。

| V1.3 丝印 | 实际 GPIO / V1.4 丝印 | 影响 |
| --- | --- | --- |
| `PD10` | `PD12` | MUX 选择必须用 `PD12` |
| `PD11` | `PD13` | MUX 选择必须用 `PD13` |
| `PD12`–`PD20` | `PD14`–`PD22` | 每个对应标号都偏移 +2 |

在 V1.3 板上配置显示、LVDS/DSI、UART2/4/5 等经过这些脚的功能时，尤其要注意这一点。整张对照表见[引脚排布](pinout.md#排针总表)。

## V1.4 及更早：microSD 卡检测 (CD) 下拉偏大

microSD 卡检测信号是 `PF6`，由 `R11` 下拉。V1.4 及更早的板子上 `R11` 是 <strong>10 kΩ</strong>，阻值偏大，引脚无法稳定地降到逻辑低阈值以下，插卡可能检测不到。

- <strong>软件规避</strong>：在 pinctrl 里把 `PF6` 的<strong>输出驱动强度设为最低</strong>。
- <strong>硬件修复</strong>：把 `R11` 换成 <strong>1 kΩ</strong>（V1.5 已经这样做）。

## 遇到问题先看这里

| 现象 | 可能原因 |
| --- | --- |
| 在 V1.3 上 `PD12`–`PD20` 配置后没有反应 | 丝印偏移，实际应使用 `PD14`–`PD22` |
| 插入 microSD 卡但系统认不到 | `PF6` 卡检测问题，按上面方法处理 |
| 想上 32 MiB PSRAM 但不稳定 | 需要 V1.5 的 PSRAM LDO，V1.4 及以前不行 |
