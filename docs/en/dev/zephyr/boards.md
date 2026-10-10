# Boards

## Boards

| Board name | Description |
| --- | --- |
| `yuzukineko` | This board: console on **UART1 (PB00/PB01)**; SD card (SMHC0), USB, audio, G2D, video engine, RGB panel, etc. |
| `f101_evb` | Allwinner F101 evaluation board, console on UART3 (PE08/PE09), plus a backlight |

This board has **no backlight wired**: `PB0`/`PB1` are reserved for the UART1 console, so the `yuzukineko` board has no PWM backlight.
