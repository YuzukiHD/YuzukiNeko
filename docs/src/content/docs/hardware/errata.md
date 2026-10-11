---
title: "Errata and revision differences"
---

## Revision overview

| Revision | Changes |
| --- | --- |
| <strong>V1.5</strong> | Adds a dedicated PSRAM LDO rail, which makes the <strong>32 MiB PSRAM</strong> configuration possible; this revision targets the 32 MiB build; the microSD card-detect pull-down `R11` changed from 10 kΩ to <strong>1 kΩ</strong> (`PF6`). |
| <strong>V1.4</strong> | Corrects the PD pin silkscreen numbering, see the V1.3 errata below. When using only the 16 MiB configuration, changing `R11` to 1 kΩ on V1.4 is enough. |
| <strong>V1.3</strong> | Initial release. |

:::caution
<strong>Which revision do I need?</strong> If you only need the F101S3 + 16 MiB PSRAM, V1.4 is enough: change `R11` to 1 kΩ and the microSD detect problem is gone. V1.5 exists specifically for the 32 MiB PSRAM configuration, which needs the additional PSRAM LDO rail.
:::

## V1.3: PD silkscreen numbering error

F101S3 has <strong>no</strong> `PD10` and `PD11`. The V1.3 PCB kept numbering consecutively after `PD9`, which makes every PD silkscreen label from `PD10` onwards <strong>two lower than the real SoC GPIO number</strong>. This is an identification error in the V1.3 silkscreen, and V1.4 corrects it. When doing pinmux, writing software or reading the schematic, use the "<strong>Actual SoC GPIO / V1.4 silkscreen</strong>" column in the table below.

| V1.3 silkscreen | Actual SoC GPIO / V1.4 silkscreen | Effect |
| --- | --- | --- |
| `PD10` | `PD12` | MUX selection must use `PD12` |
| `PD11` | `PD13` | MUX selection must use `PD13` |
| `PD12`–`PD20` | `PD14`–`PD22` | Each corresponding label is offset by +2 |

Pay particular attention to this on V1.3 boards when configuring functions that pass through these pins, such as display, LVDS/DSI and UART2/4/5. The full mapping table is in [Pinout](pinout.md#header-pinout-table).

## V1.4 and earlier: microSD card-detect (CD) pull-down too large

The microSD card-detect signal is `PF6`, pulled down by `R11`. On V1.4 and earlier boards `R11` is <strong>10 kΩ</strong>, which is too high for the pin to settle reliably below the logic-low threshold, so card insertion may not be detected.

- <strong>Software workaround</strong>: set `PF6`'s <strong>output drive strength to its lowest setting</strong> in pinctrl.
- <strong>Hardware fix</strong>: change `R11` to <strong>1 kΩ</strong> (V1.5 already does this).

## Look here first when something goes wrong

| Symptom | Possible cause |
| --- | --- |
| On V1.3, nothing happens after configuring `PD12`–`PD20` | Silkscreen offset; you should actually use `PD14`–`PD22` |
| The microSD card is inserted but the system does not see it | `PF6` card-detect problem; handle it as described above |
| Want 32 MiB PSRAM but it is unstable | Needs the V1.5 PSRAM LDO; V1.4 and earlier will not work |
