---
title: "底板接线"
---

底板（YuzukiCube-M）把核心板的信号引到屏幕、音频、天线、按键和串口。它没有 SoC，核心板以 `U1` 的形式贴片焊在上面。接线前断开 USB，确认接口方向再插。

| 底板实物图 | 底板原理图 |
| --- | --- |
| <img src="assets/figures/base-board.webp" loading="eager" alt="已安装核心板的 YuzukiCube-M 底板整板照片"> | <img src="assets/figures/base-board-sch.webp" loading="eager" alt="YuzukiCube-M 底板原理图"> |

照片上方中央是 `FPC1` 屏幕排线，左上 `CN1` CAN，右上 `CN3` 喇叭，右侧 `CN2` 串口，右下 `H1` 5 V 排针，左下 `SW1` 按键。器件位号、电源轨、信号对应和引脚冲突见 [YuzukiCube-M 底板](../baseboard.md)，常用外设的引脚组合见[常用外设引脚组合](../hardware/groups.md)。

## 接线原则

- 接线、拔线前断开 USB。
- 确认方向、缺口和金手指，不要斜插。
- 插不到底时停下来检查方向，不要用力。
- FPC 排线和 1.25 mm 插座都比较薄，插拔时不要拉拽线缆。
- 原理图见[硬件文件说明](../hardware/files.md)。

## 屏幕：FPC1

`FPC1` 是 40 针、0.5 mm 的 FPC 插座，一根排线同时连接 MIPI DSI、背光和电容触摸。

1. 断开 USB。
2. 找到底板上长条形的 `FPC1` 插座，按连接器结构打开锁扣。
3. 将排线金手指对准插座触点，按缺口方向插到底。
4. 压回锁扣，轻拉排线确认没有松动。
5. 不要折叠排线，不要触摸金手指。
6. 接好后重新上电，检查屏幕和触摸是否正常。

| FPC1 实物图 | FPC1 原理图 |
| --- | --- |
| <img src="assets/figures/fpc1.webp" loading="eager" alt="FPC1 屏幕排线座，已插入排线"> | <img src="assets/figures/fpc1-sch.webp" loading="eager" alt="FPC1 屏幕排线和背光、触摸原理图"> |

屏幕不亮时按顺序检查：

| 检查 | 说明 |
| --- | --- |
| 排线方向 | 金手指朝向插座触点，按缺口插入 |
| 锁扣 | 完全压回，排线没有松动 |
| 背光 | 只有背光没有画面，说明 DSI 信号或固件有问题 |
| 固件 | 确认固件支持该屏幕和分辨率 |
| 供电 | 检查 5 V、3.3 V 和背光升压是否正常 |

## 串口：CN2

`CN2` 是 5 针、1.25 mm 插座，引出 UART1 和 UART4。控制台使用 UART1 的三根线。

| 针 | 信号 | 连接 | 说明 |
| --- | --- | --- | --- |
| 1 | `UART1-RX` | 适配器 `TX` | 板子接收 |
| 2 | `UART1-TX` | 适配器 `RX` | 板子发送 |
| 3 | `UART4-RX` | 留空 | 第二组串口 |
| 4 | `UART4-TX` | 留空 | 第二组串口 |
| 5 | `GND` | 适配器 `GND` | 信号地 |

只能使用 3.3 V USB 转 TTL 适配器，适配器的 `3V3`/`5V` 不连接。板子由 USB 供电，适配器只接 `TX`、`RX`、`GND`。串口参数是 115200 波特、8N1、无流控；针号以丝印和原理图为准。

| CN2 实物图 | CN2 原理图 |
| --- | --- |
| <img src="assets/figures/cn2.webp" loading="eager" alt="CN2 5 针串口插座"> | <img src="assets/figures/cn2-sch.webp" loading="eager" alt="CN2 UART1 和 UART4 原理图"> |

## CAN：CN1

`CN1` 是 1.25 mm 的 CAN 接口，连接 `U5` TJA1051T/3 的 CANH / CANL。CAN 控制器信号从核心板 `PB2` / `PB3` 送到 `U5`，再由 `CN1` 引出。

| 针 | 信号 | 说明 |
| --- | --- | --- |
| 1 | `CANH` | CAN 高 |
| 2 | `CANL` | CAN 低 |
| 3/4 | `GND` | 屏蔽/地 |

`U5` 由 `VSYS-5V` 供电，`VIO` 接 `VSYS-3V3`。总线两端各接一个 120 Ω 终端电阻；不要把 CANH 或 CANL 接电源或地；接线前断开 USB。

| CN1 实物图 | CN1 原理图 |
| --- | --- |
| <img src="assets/figures/cn1.webp" loading="eager" alt="CN1 CAN 插座"> | <img src="assets/figures/cn1-sch.webp" loading="eager" alt="CN1 与 U5 CAN 收发器原理图"> |

## 音频：CN3

`HPOUT` 从核心板经 `C10`（100 nF）接到 `U2` 的 `+IN`，`U2` 输出 `SPKR+` / `SPKR-` 到 `CN3`。`HPOUT` 是板内网络，没有外部音频输入插座。

1. 断开 USB。
2. 将喇叭连接到 `CN3`，注意 `SPKR+` / `SPKR-` 标记。
3. 检查插头方向和极性，不要接到电源或地。
4. 上电后由软件打开 `PD4` 功放使能。

| CN3 实物图 | CN3 原理图 |
| --- | --- |
| <img src="assets/figures/cn3.webp" loading="eager" alt="CN3 喇叭插座"> | <img src="assets/figures/cn3-sch.webp" loading="eager" alt="CN3 与 U2 音频功放原理图"> |

## 天线、按键和 5V

`RF1` 是 IPEX / u.FL 天线座。把插头对准座子垂直按下到扣紧，插拔时按住座子，不要只拉线缆；用 Wi-Fi/蓝牙前先接天线。

`SW1` 是轻触按键，接 `PD5` / `DOWN`，和 UF2 下载器按键同一引脚。它不是复位键；上电时按住可进入 UF2 下载模式（需要对应固件）。

`H1` 是 2.54 mm 2 针排母，引出 `VSYS-5V` 和 `GND`。它只输出 USB 5 V，不要从这里给底板供电，也不要接电机、继电器等大电流负载。

![SW1 按键与 H1 5V 排针](figures/sw1-h1.webp)

## 上电与断电

1. 断开 USB。
2. 连接屏幕排线。
3. 连接天线。
4. 连接喇叭。
5. 连接串口（可选）。
6. 按下面的清单检查。
7. 最后连接 USB。
8. 上电后按屏幕、串口、音频、无线的顺序检查。

上电前确认：USB 已断开，所有接线都在断电时完成；排线插到底，锁扣压回；天线扣紧且线缆不受力；`CN3` 接喇叭，`CN1` 只接 CAN；串口适配器是 3.3 V，只接 `TX`、`RX`、`GND`；没有线头碰到其他引脚；板子没有接触金属；没有从 `H1` 接入外部电源。

| 上电后现象 | 说明 | 处理 |
| --- | --- | --- |
| 屏幕亮起或出现画面 | 排线和背光正常 | 检查触摸和显示方向 |
| 串口有输出 | `TX`/`RX`/`GND` 正常 | 继续查看启动日志 |
| 屏幕只有背光、没有画面 | DSI 信号或固件问题 | 检查排线方向和固件支持 |
| 屏幕不亮且串口无输出 | 固件不支持、仍在 FEL 或供电异常 | 回[核心板接线](core-board.md)检查 |
| 出现异味或发热 | 短路、接反或外设电流过大 | 立即断开 USB 并检查 |

断电时先断 USB，等系统停止；再拔 1.25 mm 音频、串口和排针；最后拔 FPC 排线和天线。通电时不要插拔任何外设。

## 常见问题

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 屏幕无显示 | 排线方向错、锁扣未压回、固件不支持 | 断电重插排线，确认固件和屏幕型号 |
| 触摸无反应 | 触摸排线未接触、TWI 配置错误 | 检查 `FPC1` 和固件触摸驱动 |
| 串口无输出 | `TX`/`RX` 未交叉、未共地、波特率错误 | 按 `CN2` 表逐项检查 |
| 喇叭无声 | 未接 `CN3`、功放未使能、音量过低 | 检查 `PD4` 使能、音频文件和音量 |
| Wi-Fi 无信号 | 天线未接、驱动未加载、供电异常 | 检查 `RF1`、`PE10` 和固件 |
| CAN 无通信 | `CN1` 未接、缺少终端电阻、`U5` 未供电 | 检查 `CN1`、CANH/CANL 和终端电阻 |

## 参考资料

- 底板器件、电源和引脚冲突：[YuzukiCube-M 底板](../baseboard.md)
- 屏幕、音频、Wi-Fi 和 CAN 的引脚组合：[常用外设引脚组合](../hardware/groups.md)
- 原理图和硬件文件：[硬件文件说明](../hardware/files.md)
- 版本差异和已知问题：[勘误与版本差异](../hardware/errata.md)

---

下一页：[安装 xfel](xfel.md)
