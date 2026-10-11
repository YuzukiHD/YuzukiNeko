---
title: "License"
---

| Content | License |
| --- | --- |
| Hardware design files (schematic, PCB, BOM, Gerber, etc.) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), unless stated otherwise |
| This documentation (the text, images, videos and diagrams on the documentation site) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) |
| Firmware and software, third-party files | Follow the license declared in their respective directories |
| 3D enclosure | Adapted from dj.santos's Pico enclosure (BY-NC-SA), follow its terms |

## License of this documentation

This documentation (the text, images, videos and diagrams on the documentation site) is released under the <strong>Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0)</strong>; the full text of the license is in the [Legal Code](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.zh-hans), and a summary is in the [license deed](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans).

| Requirement | Meaning |
| --- | --- |
| Attribution (BY) | You must credit the source, give a link to the license, and state whether you made changes |
| NonCommercial (NC) | You may not use it for commercial purposes |
| ShareAlike (SA) | If you modify, republish or build on this documentation, you must release it under the same license |

This license covers the documentation only; it <strong>does not change</strong> the CC0 declaration for the hardware design files in the table above, nor the licenses of the firmware, software and third-party files. In addition:

- Source snippets quoted in the documentation (for example Zephyr samples and drivers) still follow the license of the original project, which does not change because they appear in this documentation.
- Third-party content mentioned or shown in the documentation (for example the sample video on the MP4 player page, from Pixabay) is outside the scope of this documentation's license; follow its own terms.

## Third-party software in the firmware packages

Every component in the firmware packages follows its own license; the CC0 declaration <strong>does not apply to</strong> them.

The four components in `02_Firmware/RustSBI-Asterinas/`:

| Component | License text location |
| --- | --- |
| SyterKit | `licenses/syterkit/` |
| RustSBI | `licenses/rustsbi/` (MIT, Mulan) |
| Asterinas | `licenses/asterinas/` (MPL) |
| BusyBox 1.37.0 | `licenses/busybox/` |

Components in `02_Firmware/Linux-Buildroot/`:

| Component | License | License text location |
| --- | --- | --- |
| SyterKit | GPL-2.0-or-later | `licenses/syterkit/` |
| OpenSBI | BSD-2-Clause | `licenses/opensbi/` |
| Linux 7.2.0 kernel and devicetree | GPL-2.0 WITH Linux-syscall-note | `licenses/linux/` |
| BusyBox 1.38.0 | GPL-2.0 | `licenses/busybox/` |
| musl 1.2.6 | MIT | `licenses/musl/` |
| Buildroot | GPL-2.0-or-later | `licenses/buildroot/` |
| GCC / binutils toolchain | GPL-3.0-or-later (with the GCC Runtime Library Exception) | `licenses/toolchain/` |

In each package, `licenses/README.md` records where these license texts came from and how they are verified.

The [LICENSE](https://github.com/YuzukiHD/YuzukiNeko/blob/main/LICENSE) at the repository root is the overall declaration.
