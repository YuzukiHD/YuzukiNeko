# Neko RV32 source build support

These patches and configuration files accompany the source-build tutorial:

- [English](https://yuzukihd.github.io/YuzukiNeko/dev/asterinas/asterinas-build/)
- [简体中文](https://yuzukihd.github.io/YuzukiNeko/zh/dev/asterinas/asterinas-build/)

These files configure the SyterKit and RustSBI firmware used by the Neko
RV32 build validated on 2026-09-12. Obtain the Asterinas port directly from
the `feat/neko-rv32` branch of rustsbi/asterinas, pinned at
[`a38ffafb1`](https://github.com/rustsbi/asterinas/tree/a38ffafb1b138bdd6b3095665acc0465e2f750da).
The kernel, Buildroot integration, examples, and image tools live in that source
repository. This directory contains only the supporting firmware inputs below.

| Files | Base source and purpose |
| --- | --- |
| `syterkit/asterinas-handoff.patch` | [SyterKit `3bf4f61fc7a1a40137a49482e1a225fef0b97a42`](https://github.com/luojia65/SyterKit/tree/3bf4f61fc7a1a40137a49482e1a225fef0b97a42): preserve the cache state needed at the Asterinas handoff |
| `rustsbi/rustsbi-no-color.patch` | [RustSBI `4068e0d062493d2af3aeed7eb20bf84acd4b2c0f`](https://github.com/rustsbi/rustsbi/tree/4068e0d062493d2af3aeed7eb20bf84acd4b2c0f): remove ANSI log colors |
| `rustsbi/riscv32-neko-scalar-none-elf.json` | RV32 scalar target, ILP32 ABI, no vector extensions |
| `rustsbi/rustsbi-warn.toml` | Jump firmware configuration, WARN logging, entry `0x40f80000`, next stage `0x40000000` |

The four build inputs preserve the original content, with text line endings
normalized to LF. Verify them from this directory:

```sh
sha256sum -c SHA256SUMS
```

Apply each firmware patch once to its exact base commit. Both patches have
been checked and applied to those base sources.

Repacking the existing firmware payloads produces the released NOR image hash
`368b658f93cb921a66c690a1ae26def95fbb500d0098b955695cebb977228cc5`.
These checks do not establish that a new build on a different host is
byte-identical, and they do not replace board testing after code changes.

## Licenses and external inputs

The patches retain the licensing of the components they modify: RustSBI
MIT OR MulanPSL-2.0 and SyterKit GPLv2 (subject to file-specific notices).
The Asterinas source remains under MPL-2.0 with file-specific notices.
Preserve the original copyright and license notices in the base sources and added files. See the
corresponding directories under [../licenses/](../licenses/).

The RustSBI JSON target and TOML configuration are supplied under the same
MIT OR MulanPSL-2.0 terms as the accompanying RustSBI build support.
BusyBox and musl are obtained separately by Buildroot and retain their own
licenses. The hardware repository's CC0 dedication does not replace any of
these software licenses.

The pinned SyterKit source links its bundled PSRAM initialization archive
`boards/yuzukineko/lib/libpsram.a` and uses a bundled Linux x86_64 `dt2c` tool by
default. Those binaries are not redistributed in this support directory. Their
presence is explicitly described in the tutorial; this is not a claim that
every dependency can be rebuilt from source.
