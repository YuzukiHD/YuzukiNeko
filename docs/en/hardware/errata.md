# Errata and Version Differences

## Version summary

| Version | Changes |
| --- | --- |
| **V1.5** | Adds a dedicated PSRAM LDO supply so that the **32 MiB PSRAM** configuration works; this version targets the 32 MiB variant. The microSD detect pull-down resistor `R11` is changed from 10 kΩ to **1 kΩ** (`PF6`). |
| **V1.4** | Corrects the PD pin silkscreen numbering, see the V1.3 erratum below. If you only use the 16 MiB configuration, replacing `R11` with 1 kΩ on V1.4 is enough. |
| **V1.3** | Initial version. |

!> **Which version should you pick?** If you only need F101S3 + 16 MiB PSRAM, V1.4 is enough: replace `R11` with 1 kΩ and the microSD detect problem goes away. V1.5 is made specifically for the 32 MiB PSRAM configuration and needs the extra PSRAM LDO supply rail.

## V1.3: PD silkscreen numbering error

F101S3 **does not have** `PD10` and `PD11`. The V1.3 PCB keeps numbering sequentially after `PD9`, so every PD silkscreen label from `PD10` onwards is **2 lower than the real SoC GPIO number**. This is a mis-identification in the V1.3 silkscreen and V1.4 corrects it. For pinmux, software and schematics, use the "**Actual GPIO / V1.4 silkscreen**" column in the table below.

| V1.3 silkscreen | Actual GPIO / V1.4 silkscreen | Impact |
| --- | --- | --- |
| `PD10` | `PD12` | MUX selection must use `PD12` |
| `PD11` | `PD13` | MUX selection must use `PD13` |
| `PD12`–`PD20` | `PD14`–`PD22` | Every corresponding label is shifted by +2 |

Pay particular attention to this on V1.3 boards when configuring display, LVDS/DSI, UART2/4/5 and other functions that go through these pins. For the full mapping see the [Pinout](pinout.md#header-pin-table).

## V1.4 and earlier: microSD card detect (CD) pull-down too large

The microSD card detect signal is `PF6`, pulled down by `R11`. On V1.4 and earlier boards `R11` is **10 kΩ**. This value is too high, so the pin cannot reliably settle below the logic-low threshold, and an inserted card may not be detected.

- **Software workaround**: in pinctrl, set the **output drive strength of `PF6` to the lowest setting**.
- **Hardware fix**: replace `R11` with **1 kΩ** (V1.5 already does this).

## Check here first when something goes wrong

| Symptom | Possible cause |
| --- | --- |
| On V1.3, nothing happens after configuring `PD12`–`PD20` | Silkscreen offset; `PD14`–`PD22` should be used |
| A microSD card is inserted but the system does not see it | `PF6` card-detect problem, handle as described above |
| Want to use 32 MiB PSRAM but it is unstable | Needs the PSRAM LDO of V1.5; V1.4 and earlier do not work |
