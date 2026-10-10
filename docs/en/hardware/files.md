# Hardware Files

The hardware design files of the YuzukiNeko module are in `01_Hardware/` of the repository, **one set per version**. Browse online: <https://github.com/YuzukiHD/YuzukiNeko/tree/main/01_Hardware>

The directory is split by version: one each for `V1.3/`, `V1.4/` and `V1.5/`, with the same set of items inside every version.

| Directory | Contents | Format |
| --- | --- | --- |
| `01_SCH/` | Schematics | PDF |
| `02_PCB/` | PCB design files | LCEDA Pro (`.epro2`) |
| `03_Gerber/` | Production Gerber files | ZIP |
| `04_3D/` | PCB 3D models | ZIP |
| `05_BOM/` | Bill of materials (V1.3 and V1.4 also have an interactive BOM web page) | XLSX / HTML |
| `06_PickAndPlace/` | Pick-and-place coordinates | XLSX |
| `07_Project/` | Complete projects (V1.4, V1.5; V1.3 has none) | `.epro2` |

The file names carry the export date. For notes on the directory itself see [`01_Hardware/README.md`](https://github.com/YuzukiHD/YuzukiNeko/blob/main/01_Hardware/README.md).

## How to use them

- **Check wiring**: open the schematic PDF of the matching version. Before wiring, use it to confirm pin functions, GPADC channels and onboard devices, rather than relying only on the header silkscreen.
- **Modify the design**: open the `.epro2` project files in `07_Project` or `02_PCB` with LCEDA Pro.
- **Fabricate**: submit the ZIP of the matching version from `03_Gerber` to the board house; for assembly use `05_BOM` and `06_PickAndPlace`.
- **Make an enclosure**: check dimensions against the 3D model in `04_3D`, or simply use the [ready-made enclosure](../shell.md).

?> Always use the files of the **same version** as the board you have. For the differences between versions (PD silkscreen, `R11`, PSRAM LDO) see [Errata and Version Differences](errata.md).

## YuzukiCube-M base board

The base board has its own file set under `04_BaseBoard/`, currently only `V1.0`, with the same seven items as `01_Hardware/` (its `04_3D/` also holds an enclosure, `3DShell_PCB2.zip`). The base board is not a version of YuzukiNeko but a carrier board the module is fitted to; see [YuzukiCube-M Base Board](../baseboard.md) for its pins, devices and power.

## License

The hardware design files are released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), except where noted otherwise.
