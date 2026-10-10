# 引脚冲突

## 引脚冲突

pinmux 编码为 `ALLWINNER_PINMUX(port, num, mux)`。启用外设前对整个编译后的 `zephyr.dts` 检查有没有冲突，例如：

- LCD 使用 `PD0..PD21`，所以同时启用 `dbi` / `pwm` / `i2c0` 会冲突。
- SD 卡和 JTAG 共用 `PF0/1/3/5`（JTAG 是 mux 4）。
- `PE2` 是 USB VBUS 开关，与 I2S0、SDC2 共用 `PE0..PE4`。

排错时 `grep` 启动日志中的 `[E]` / `[W]` 行，不要只看启动是否“看起来正常”。
