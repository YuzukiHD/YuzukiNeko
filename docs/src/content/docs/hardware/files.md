---
title: "Hardware file layout"
---

The hardware design files for the YuzukiNeko module live under `01_Hardware/` in the repository, <strong>one set per revision</strong>. Browse online: <https://github.com/YuzukiHD/YuzukiNeko/tree/main/01_Hardware>

:::tip
This page explains the directory layout. To download a file, use [Hardware downloads](download.md).
:::

The directory is layered by revision: one each for `V1.3/`, `V1.4/` and `V1.5/`, and each revision directory holds the same set of entries.

| Directory | Content | Format |
| --- | --- | --- |
| `01_SCH/` | Schematic | PDF |
| `02_PCB/` | PCB design files | JLC EDA Pro (`.epro2`) |
| `03_Gerber/` | Gerber for production | ZIP |
| `04_3D/` | PCB 3D model | ZIP |
| `05_BOM/` | Bill of materials (V1.3 and V1.4 also have an interactive BOM web page) | XLSX / HTML |
| `06_PickAndPlace/` | Pick-and-place coordinates | XLSX |
| `07_Project/` | Complete project (V1.4, V1.5; not present for V1.3) | `.epro2` |

File names carry the export date; for the directory itself, see [`01_Hardware/README.md`](https://github.com/YuzukiHD/YuzukiNeko/blob/main/01_Hardware/README.md).

## How to use

- <strong>Check the wiring</strong>: open the schematic PDF for the matching revision. Before wiring, use it to confirm pin functions, the GPADC channel and onboard components, rather than going by the header silkscreen alone.
- <strong>Change the design</strong>: open the `.epro2` project under `07_Project` or `02_PCB` with JLC EDA Pro.
- <strong>Fabrication</strong>: submit the ZIP for the matching revision from `03_Gerber` to the board house; use `05_BOM` and `06_PickAndPlace` for assembly.
- <strong>Make an enclosure</strong>: check dimensions against the 3D model in `04_3D`, or use one of the ready-made [3D-printed enclosures](../shell.md) for the core board or the base board.

:::tip
Always use files for the <strong>same revision</strong> as the board in your hands. For the differences between revisions (PD silkscreen, `R11`, PSRAM LDO), see [Errata and revision differences](errata.md).
:::

## YuzukiCube-M base board

The base board files live separately under `04_BaseBoard/`, currently only `V1.0`, with the same entries as the seven directories of `01_Hardware/`. Its `04_3D/` holds the PCB model, the [base board enclosure](https://github.com/YuzukiHD/YuzukiNeko/blob/main/04_BaseBoard/V1.0/04_3D/3DShell_PCB2.zip) (top and bottom STL) and the [bottom part on its own](https://github.com/YuzukiHD/YuzukiNeko/blob/main/04_BaseBoard/V1.0/04_3D/3DShell_3DShell_PCB2_B.stl). The base board itself is not a revision of the YuzukiNeko but a carrier board the module mounts onto; for pins, components and power see [YuzukiCube-M base board](../baseboard.md).

## License

The hardware design files are released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), unless stated otherwise.
