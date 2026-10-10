# 板级

## 板级

| 板级名 | 说明 |
| --- | --- |
| `yuzukineko` | 本板：控制台为 <strong>UART1（PB00/PB01）</strong>；SD 卡（SMHC0）、USB、音频、G2D、视频引擎、RGB 屏等 |
| `f101_evb` | Allwinner F101 评估板，控制台为 UART3（PE08/PE09），另外带背光 |

本板<strong>没有接背光</strong>：`PB0`/`PB1` 留给 UART1 控制台，所以 `yuzukineko` 板级里没有 PWM 背光。
