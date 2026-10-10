# License

| Content | License |
| --- | --- |
| Hardware design files (schematics, PCB, BOM, Gerber, etc.) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), unless noted otherwise |
| Firmware, software and third-party files | The license declared in their own directory |
| 3D enclosure | Adapted from dj.santos's Pico enclosure (BY-NC-SA); please follow its terms |

## Third-Party Software in the Firmware Packages

Each component in a firmware package follows its own license; the CC0 declaration **does not apply** to them.

The four components in `02_Firmware/RustSBI-Asterinas/`:

| Component | License text location |
| --- | --- |
| SyterKit | `licenses/syterkit/` |
| RustSBI | `licenses/rustsbi/` (MIT, Mulan) |
| Asterinas | `licenses/asterinas/` (MPL) |
| BusyBox 1.37.0 | `licenses/busybox/` |

The components in `02_Firmware/Linux-Buildroot/`:

| Component | License | License text location |
| --- | --- | --- |
| SyterKit | GPL-2.0-or-later | `licenses/syterkit/` |
| OpenSBI | BSD-2-Clause | `licenses/opensbi/` |
| Linux 7.2.0 kernel and device tree | GPL-2.0 WITH Linux-syscall-note | `licenses/linux/` |
| BusyBox 1.38.0 | GPL-2.0 | `licenses/busybox/` |
| musl 1.2.6 | MIT | `licenses/musl/` |
| Buildroot | GPL-2.0-or-later | `licenses/buildroot/` |
| GCC / binutils toolchain | GPL-3.0-or-later, with the GCC Runtime Library Exception | `licenses/toolchain/` |

The `licenses/README.md` in each package records where those license texts come from and how they can be checked.

The [LICENSE](https://github.com/YuzukiHD/YuzukiNeko/blob/main/LICENSE) file in the repository root is the overall statement.
