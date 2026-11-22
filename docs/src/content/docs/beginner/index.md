---
title: "Beginner's guide"
---

This guide is for readers using YuzukiNeko for the first time, without previous hardware or terminal experience. It starts with the hardware, then covers core board wiring, base board wiring, xfel installation, FEL download mode, and backing up, writing and verifying NOR Flash. Each page builds on the previous one, so read them in order.

The guide does not cover soldering, base board design, driver development or application development. Follow the links on each page for those topics.

## Scope

| Topic | Covered by this guide |
| --- | --- |
| Wiring and powering the board for the first time | Yes |
| Entering FEL with xfel and flashing a prebuilt image | Yes |
| Connecting a display, speaker, antenna and serial port | Yes |
| Building Zephyr, Linux or RT-Thread | No; see the corresponding development chapters |
| Soldering the core board to the base board | No; see the hardware files |

## Reading order

| Page | Contents | Completion check |
| --- | --- | --- |
| [Meet the boards](hardware.md) | Core board, base board, connectors, power and revisions | Can identify USB-C, `FEL`, NOR, microSD and the main base board connectors |
| [Core board wiring](core-board.md) | USB-C power, microSD, serial and headers | The host detects a USB device; the optional serial port produces output |
| [Base board wiring](base-board.md) | Display, audio, antenna, button and serial | Required connectors are attached and the pre-power check passes |
| [Install xfel](xfel.md) | Windows/Linux installation, driver, FEL and commands | `xfel version` and `xfel spinor` produce the expected output |
| [Flashing NOR (special topic)](nor-flash.md) | Backup, write, read-back, verify and restore | The read-back SHA-256 matches the official value |

## Page dependencies

| Page | Depends on | Output |
| --- | --- | --- |
| Meet the boards | Nothing | Connectors, power and revision confirmed |
| Core board wiring | Meet the boards | Host detects the USB device; optional serial works |
| Base board wiring | Core board wiring | Display, audio, antenna and serial connected as needed |
| Install xfel | Core board wiring | FEL connection and chip identification confirmed |
| Flashing NOR (special topic) | Install xfel; backup complete | Image written and SHA-256 verified |

## Key commands by page

| Page | Key commands or operations |
| --- | --- |
| Meet the boards | None |
| Core board wiring | Insert USB-C; optionally `picocom -b 115200 /dev/ttyUSB0` |
| Base board wiring | None |
| Install xfel | `.\xfel.exe version`, `xfel version`, `xfel spinor` |
| Flashing NOR (special topic) | `xfel spinor read/write`, `sha256sum`, `xfel reset` |

## What you need

| Item | Description | Required |
| --- | --- | --- |
| YuzukiNeko core board or YuzukiCube-M base board | The base board includes the soldered core board | Yes |
| USB-C data cable | Must carry data; a charge-only cable cannot be used for FEL download | Yes |
| Windows, Linux or macOS host | Runs xfel and reads/writes the image | Yes |
| xfel | Host-side FEL download tool | Yes |
| Prebuilt image | This guide uses `yuzukineko-rustsbi-asterinas.img` | Yes |
| 3.3 V USB-to-TTL adapter | Optional serial console | Optional |
| microSD card | Not needed for flashing; card detection is unstable on some revisions | Optional |
| Display, speaker, antenna | Base board peripherals | Optional |

## Recommended work environment

| Item | Recommendation |
| --- | --- |
| Desk | Dry, no liquids, no metal debris |
| Host | Connected to power, rear USB port |
| Cable | Prefer a short cable; avoid poor-quality extensions |
| Lighting | Enough to read the silkscreen and connector orientation |

## Safety and operating requirements

- Discharge static before touching the board, and hold it by the edges.
- Place the board on a table or an anti-static bag, not on a metal surface.
- GPIO pins use 3.3 V logic; the `5V` pin is power only and must not receive a 5 V signal.
- Do not power the board from the header pins, and do not connect power backwards.
- Disconnect USB before connecting or disconnecting wires.
- Do not disconnect USB, shut down the host or cut power to the board while flashing.
- Disconnect power before inserting or removing FPC cables or 1.25 mm connectors.
- If the board gets hot, smells strange, smokes or a short circuit occurs, disconnect USB immediately and inspect it after it cools.
- Do not desolder the core board from the base board.
- Do not touch the back of the board or its pins with metal objects.
- Do not place liquids on the work surface.

## How to use this guide

- Read the current page before starting the steps.
- Move to the next page only after every item in the current page's checklist passes.
- Commands, file names and hexadecimal values are case-sensitive; copy them as written.
- When an error occurs, record the complete output before checking the common-error table.
- Do not skip the backup step, and do not cut power during a write.

## Record keeping

- Record the image file name and size.
- Record the output of `xfel version` and `xfel spinor`.
- Record the backup path and SHA-256.
- Record the write and read-back results and completion time.
- On failure, record the complete command, output and steps already performed.

## Terms

| Term | Description |
| --- | --- |
| Development board | A circuit board with a SoC, memory, storage and peripheral connectors. |
| Core board | The YuzukiNeko module: SoC, PSRAM, NOR Flash, USB-C, `FEL` button and microSD socket. |
| Base board | The YuzukiCube-M carrier board. The core board is soldered to it and its connectors bring out display, audio, Wi-Fi/Bluetooth, CAN and serial. |
| Chip / SoC | An integrated circuit containing the processor, memory controller and peripheral controllers. |
| PSRAM | On-board dynamic memory that holds program data and code while the board runs. |
| BROM | The boot ROM inside the F101; it initializes the chip and enters FEL or loads a boot program. |
| Firmware | The software the board uses to boot and run. |
| Image | A firmware file packed in a fixed layout. |
| Flash (verb) | Write an image into NOR Flash. |
| NOR Flash | The 16 MiB non-volatile memory that holds the bootloader and system. |
| FEL | The USB download mode in the F101 BROM. |
| xfel | The host-side FEL download tool. |
| Serial port / UART | An asynchronous serial interface for console output and input. |
| GPIO | A general-purpose pin configurable as input or output, with 3.3 V logic. |
| USB-C | The board's power, FEL download and USB device/host interface. |
| SHA-256 | A hash algorithm used to verify file integrity. |

## Overall flow

```mermaid
flowchart LR
    A["Meet the board"] --> B["Wire it up"]
    B --> C["Install xfel"]
    C --> D["Enter FEL"]
    D --> E["Back up NOR"]
    E --> F["Flash the image"]
    F --> G["Read back and verify"]
    G --> H["Reset"]
```

The flow runs from hardware to host tool, then download mode and Flash operations. Wiring and USB detection are covered by the core board and base board pages; xfel installation and the FEL connection are covered by the xfel page; backup, write, read-back and restore are collected in the NOR flashing topic. If a step fails, stop on that page and resolve it before moving on to the write steps.

## Completion checks

- Connect the board to a host and determine whether the host detects a USB device.
- Power up while holding `FEL` to enter FEL mode.
- Back up the whole NOR Flash and obtain a 16,777,216-byte backup file.
- Write the 7,143,424-byte `yuzukineko-rustsbi-asterinas.img`.
- Read back 0x6d0000 bytes and compare the SHA-256.
- Restore the original contents from the backup when needed.

## If something goes wrong

| Symptom | Check first |
| --- | --- |
| Host cannot find the USB device | [Core board wiring](core-board.md), [Install xfel](xfel.md) |
| No serial output | [Core board wiring](core-board.md) |
| Display stays dark | [Base board wiring](base-board.md) |
| xfel reports an error | [Install xfel](xfel.md) |
| Board does not boot after writing | [Flashing NOR (special topic)](nor-flash.md), [FAQ](../faq.md) |

## Common mistakes

| Mistake | Explanation |
| --- | --- |
| Flashing with a charge-only cable | The cable has no data channel and the host cannot detect the FEL device |
| Looking for the device without holding FEL | When the board has booted from Flash, `xfel` cannot see it |
| Writing without a backup | The original contents cannot be restored; only a known image can be written |
| Connecting a 5 V signal to GPIO | May damage the SoC; GPIO supports 3.3 V only |
| Using a hub or front-panel USB port | May cause insufficient power or unstable enumeration |

---

Next page: [Meet the boards](hardware.md)
