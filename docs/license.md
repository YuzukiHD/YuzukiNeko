# 许可证

| 内容 | 许可证 |
| --- | --- |
| 硬件设计文件（原理图、PCB、BOM、Gerber 等） | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)，另有说明的除外 |
| 固件与软件、第三方文件 | 遵循各自目录里声明的许可证 |
| 3D 外壳 | 改自 dj.santos 的 Pico 外壳（BY-NC-SA），请遵守其条款 |

## 固件包里的第三方软件

固件包里的每个组件都遵循自己的许可证，CC0 声明<strong>不适用于</strong>它们。

`02_Firmware/RustSBI-Asterinas/` 里的四个组件：

| 组件 | 许可证文本位置 |
| --- | --- |
| SyterKit | `licenses/syterkit/` |
| RustSBI | `licenses/rustsbi/`（MIT、Mulan） |
| Asterinas | `licenses/asterinas/`（MPL） |
| BusyBox 1.37.0 | `licenses/busybox/` |

`02_Firmware/Linux-Buildroot/` 里的组件：

| 组件 | 许可证 | 许可证文本位置 |
| --- | --- | --- |
| SyterKit | GPL-2.0-or-later | `licenses/syterkit/` |
| OpenSBI | BSD-2-Clause | `licenses/opensbi/` |
| Linux 7.2.0 内核与设备树 | GPL-2.0 WITH Linux-syscall-note | `licenses/linux/` |
| BusyBox 1.38.0 | GPL-2.0 | `licenses/busybox/` |
| musl 1.2.6 | MIT | `licenses/musl/` |
| Buildroot | GPL-2.0-or-later | `licenses/buildroot/` |
| GCC / binutils 工具链 | GPL-3.0-or-later（含 GCC Runtime Library Exception） | `licenses/toolchain/` |

每个包中 `licenses/README.md` 记录了这些许可证文本的来源和校验方式。

仓库根目录的 [LICENSE](https://github.com/YuzukiHD/YuzukiNeko/blob/main/LICENSE) 是总的声明。
