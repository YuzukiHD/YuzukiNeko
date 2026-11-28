---
title: "Graphics output and the display stack"
---

`F101GopDxe` turns the board panel into a UEFI graphics console. It owns a 32-bit frame buffer in memory, scans it out through the display engine, and implements `EFI_GRAPHICS_OUTPUT_PROTOCOL` with `FrameBufferBltLib`. The display pipeline itself is the sunxi display stack, compiled into the driver with an EDK II OS layer.

## Pipeline

| Node | Resource | Role |
| --- | --- | --- |
| `display-engine@5000000` | MMIO `0x05000000`, 2 MiB | Composes the plane and scans it out |
| `tcon-top@5460000` | MMIO `0x05460000`, 4 KiB | Routes the TCON output to the encoder |
| `tcon-lcd@5461000` | MMIO `0x05461000`, 4 KiB, IRQ 90 | LCD timing generator |
| `rgb` | — | Parallel RGB encoder, 18-bit RGB666 |
| `panel` | — | Simple panel with one 1024×600 mode |
| `backlight` | PWM_BL | Backlight on PB0..PB3 |

The graph is described in `F101Pkg/Drivers/F101GopDxe/dpy_board_f101.c`. `f101_display.c` also raises the display engine's priority on the memory bus and gives the RISC-V core a bandwidth limit before probing the pipeline.

## Panel and timing

| Parameter | Value |
| --- | --- |
| Pixel clock | 49 MHz |
| Horizontal | 1024 visible, sync start 1185, sync end 1205, total 1240 |
| Vertical | 600 visible, sync start 615, sync end 625, total 650 |
| Sync polarity | Both active low |
| Bus format | `RGB666_1X18` |
| Panel size | 154 mm × 86 mm |
| Panel supply | PD22 high, then 30 ms delay |
| Enable delay | 50 ms |

The mode is the only one in the panel description. The GOP driver reports one mode, number 0, and `SetMode(0)` clears the screen to black. There is no mode switching at runtime.

## Pins

| Pins | Function | Use |
| --- | --- | --- |
| PD0..PD9 | Mux 2 | RGB data |
| PD12..PD21 | Mux 2 | RGB data |
| PE6, PE7 | Mux 4 | Pixel clock and data enable |
| PB0..PB3 | Mux 2 | PWM backlight |
| PD22 | GPIO output | Panel supply switch |

`rgb_swap` is 5, which is the bit swap the panel expects on the RGB666 bus. PD22 is driven high in the panel's power-on sequence and low in the power-off sequence.

## GOP

`F101GopEntry` maps the registers, initializes the pipeline, allocates the frame buffer with `AllocatePages` as `EfiBootServicesData`, zeroes it, writes it back from the data cache and starts the scanout. It then installs a vendor device path and `EFI_GRAPHICS_OUTPUT_PROTOCOL`.

The mode information is:

| Field | Value |
| --- | --- |
| Version | 0 |
| Resolution | 1024 × 600 |
| Pixel format | `PixelBlueGreenRedReserved8BitPerColor` (B8G8R8X8) |
| Pixels per scan line | 1024 |
| Frame buffer | Allocated from boot services memory |

`Blt` forwards to `FrameBufferBlt` and then writes back the affected rows for `EfiBltVideoFill`, `EfiBltBufferToVideo` and `EfiBltVideoToVideo`. A read from the frame buffer (`EfiBltVideoToBltBuffer`) does not need a writeback. The display engine reads the memory directly, so the cache writeback is what makes a drawing visible.

## MMIO and the MMU

The CPU runs with the MMU on. The driver adds the register windows it touches to the GCD as uncached MMIO:

| Base | Size | Blocks |
| --- | --- | --- |
| `0x02000000` | 64 KiB | PIO, CCU, PWM_BL |
| `0x03000000` | 64 KiB | SYSCFG, SID |
| `0x03102000` | 4 KiB | MBUS |
| `0x05000000` | 2 MiB | Display engine |
| `0x05460000` | 8 KiB | TCON top and TCON LCD |

An access to a range that is not in the memory map faults. This is why the display stack cannot simply use a physical address from the device tree; the EDK II glue has to add the range first.

## OS glue

The display stack was written for an operating system, so `dpy_os_edk2.c` provides the pieces it expects:

- Memory allocation through `AllocatePool` and `AllocateAlignedPages`.
- DMA memory as whole pages with a size header in front, so cache maintenance never touches a neighbour.
- A one-to-one `ioremap`.
- Time through `MicroSecondDelay` and the `rdtime` CSR.
- A polling timer: EDK II timer events run every millisecond and call the interrupt handlers; there is no real interrupt dispatch.
- Locking through `RaiseTPL(TPL_NOTIFY)` and `RestoreTPL`, which keeps the polled handlers out on the single core.
- A semaphore that waits in 1 ms steps while the timer events run.

`edk_glue.c` contains the memory, cache, time and logging helpers. The display stack's own log goes through `DEBUG()`; the default build logs errors only.

## Backlight

The backlight is PWM_BL channel 0 on PB0..PB3. The board description sets a 20 µs period (50 kHz), inverted polarity, a 0..255 range and a default level of 250. `F101GopEntry` sets it to 255 after the first scanout. There is no UEFI protocol for it; changing the level means changing the driver or using the same registers from a UEFI application.

## Known behavior

- The frame buffer is drawn in place while it is scanned out. Redraws can show tearing.
- A double-buffered version was tried and reverted because it was slower in use. The next step in the repository is to time `Blt` on the board before trying again.
- `NO_SCANOUT=1 ./build.sh edk2 package` defines `F101_NO_SCANOUT`. The GOP driver still installs and the frame buffer is still allocated, but `f101_display_show` and the backlight are skipped. This isolates display faults from the rest of the firmware.

## A different panel

The board description is tied to the EVB: 1024×600 RGB, PD0..PD22, PE6/PE7, PB0..PB3 and PD22. A YuzukiNeko has a 1024×768 MIPI DSI panel and a different backlight and supply wiring. The display stack contains DSI and combo D-PHY code, but the EVB graph does not use it. Supporting another panel means adding a board description with its nodes, links, pins, timing and panel commands, then selecting it in the GOP driver. The Zephyr side of the same hardware is documented in [the Zephyr display driver](../zephyr/drivers/display.md).
