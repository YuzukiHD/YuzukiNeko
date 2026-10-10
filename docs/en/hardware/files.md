# Hardware Files

The hardware design files are in `01_Hardware/` of the repository, **one set per version**. Browse online: <https://github.com/YuzukiHD/YuzukiNeko/tree/main/01_Hardware>

| Directory | Contents | Format |
| --- | --- | --- |
| `01_SCH/` | Schematics | PDF |
| `02_PCB/` | PCB design files | LCEDA Pro (`.epro2`) |
| `03_Garber/` | Production Gerber files | ZIP (available for V1.4, V1.5 and V1.3) |
| `04_3D/` | PCB 3D models | ZIP |
| `05_BOM/` | Bill of materials (V1.3 and V1.4 also have an interactive BOM web page) | XLSX / HTML |
| `06_PickAndPlace/` | Pick-and-place coordinates | XLSX |
| `07_Project/` | Complete projects (V1.4, V1.5) | `.epro2` |

Each subdirectory contains `V1.3`, `V1.4` and `V1.5` folders, and the file names carry the export date.

## How to use them

- **Check wiring**: open the schematic PDF of the matching version. Before wiring, use it to confirm pin functions, GPADC channels and onboard devices, rather than relying only on the header silkscreen.
- **Modify the design**: open the `.epro2` project files in `07_Project` or `02_PCB` with LCEDA Pro.
- **Fabricate**: submit the ZIP of the matching version from `03_Garber` to the board house; for assembly use `05_BOM` and `06_PickAndPlace`.
- **Make an enclosure**: check dimensions against the 3D model in `04_3D`, or simply use the [ready-made enclosure](../shell.md).

?> Always use the files of the **same version** as the board you have. For the differences between versions (PD silkscreen, `R11`, PSRAM LDO) see [Errata and Version Differences](errata.md).

## License

The hardware design files are released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), except where noted otherwise.
