# YuzukiNeko Hardware

Board fabrication and assembly outputs, grouped by PCB revision.

```
01_Hardware/
├── V1.3/   initial release
├── V1.4/   corrected PD silkscreen numbering
└── V1.5/   dedicated PSRAM LDO rail (32 MiB build), R11 10 kΩ → 1 kΩ
```

Each revision directory holds the same item set:

| Directory | Contents |
| --- | --- |
| `01_SCH` | Schematic PDF |
| `02_PCB` | PCB project document (`.epro2`) |
| `03_Gerber` | Gerber fabrication archive |
| `04_3D` | 3D model archive |
| `05_BOM` | BOM spreadsheet and interactive BOM (HTML) |
| `06_PickAndPlace` | Pick-and-place / centroid file |
| `07_Project` | Full EasyEDA project archive (V1.4 and later) |

`07_Project` first appears in V1.4; V1.3 has no project archive.

See the [repository README](../README.md) for the revision history, the V1.3 PD
silkscreen errata, and the V1.4-and-earlier microSD card-detect note.
