---
title: "Core board wiring"
---

The core board can be used on its own for power, FEL download and flashing, without the base board or a display. Add a 3.3 V USB-to-TTL serial adapter when you want boot logs. This page covers the minimum wiring, host detection, microSD, serial, headers and the first power-up.

## Wiring and cable

```mermaid
flowchart LR
    PC["Host USB port"] -->|"USB-C data cable"| Board["Core board USB-C port"]
```

The core board has one USB-C port that carries power, USB data and FEL download; no extra power supply is needed. It can only do one job at a time: FEL uses it for download, and after reset into the system the firmware decides whether it is a USB device or host.

- Use a USB-C cable that supports data. A charge-only cable will not let the host see the FEL device.
- Connect directly to a host USB port; on a desktop use a rear port, not a hub or dock.
- To check whether a cable carries data, connect a phone and transfer a file.
- Disconnect USB before wiring, and power up after the connections are made.

## Connection steps

1. Disconnect everything from the board.
2. Connect the core board to the host with a USB-C data cable; on a desktop use a rear port.
3. Watch for a new USB device on the host. FEL mode does not show a disk or window.
4. If the host does nothing, replace the cable and try another USB port.
5. If you need serial, disconnect USB first and connect the adapter using the table below.
6. Power up again and confirm the device with [install xfel](xfel.md).

When the flash boot area is empty, the BROM enters FEL on every power-up and `xfel` can see it. When a valid bootloader is present, the board boots directly; hold `FEL` while powering on to enter download mode. See [FEL download mode and tools](../boot/fel.md) for details.

:::tip
If the host does nothing, replace the cable and USB port first, then check whether the board entered FEL. Most detection failures come from a charge-only cable or a front USB port with weak power.
:::

## microSD (optional)

- Flashing does not need a microSD card; you can skip it.
- Disconnect USB before inserting the card, and push it in gently in the socket direction.
- The socket is push-push: the card should click in, and pushing again releases it.
- Card detection may be unstable on V1.4 and earlier. If the card is not detected, leave it out for now and see [errata and revision differences](../hardware/errata.md).

## Serial (optional)

Serial shows boot logs and the console; it does not carry the FEL download. Flashing does not need it, but it helps when a boot fails.

:::caution
Use a 3.3 V USB-to-TTL adapter only. A 5 V adapter can damage the GPIO. Disconnect USB before wiring.
:::

| Adapter type | Level | Connection | Use case |
| --- | --- | --- | --- |
| Generic USB-to-TTL | 3.3 V | `PB0`, `PB1` and `GND` headers | Needs jumper wires; general option |
| Yuzuki AvaotaUART | 3.3 V | Plugs into the core board USB-C | Serial on the USB-C SBU pins |
| 5 V USB-to-TTL | 5 V | Do not connect | Can damage the GPIO |

| Core board pin | Position | Adapter pin | Description |
| --- | --- | --- | --- |
| `PB0` | Right row, pin 10 | `RX` | UART1 TX, board transmits |
| `PB1` | Right row, pin 11 | `TX` | UART1 RX, board receives |
| `GND` | Right row, pin 2 | `GND` | Signal ground, required |
| Adapter `3V3` / `5V` | — | Leave unconnected | The board is powered by USB |

UART `TX` and `RX` must cross: board `TX` to adapter `RX`, board `RX` to adapter `TX`. Connect only the signal wires and ground; do not power the board from the adapter.

With a Yuzuki AvaotaUART, plug it directly into the core board USB-C port; serial goes over the USB-C SBU pins, which a normal USB-C cable does not expose. See [RustSBI + Asterinas](../dev/asterinas/rustsbi-asterinas.md) for the wiring.

![Core board with a USB-C serial adapter](figures/core-board.webp)

Serial parameters are 115200 baud, 8N1, no flow control. On Windows with PuTTY: set Connection type to Serial, choose the adapter's COM port under Serial line, set Speed to 115200, open the connection and power up the board. On Linux use `picocom`:

```sh
picocom -b 115200 /dev/ttyUSB0
```

The port comes from `dmesg | tail` and may be `ttyACM0`. Quit `picocom` with `Ctrl+A`, then `Ctrl+X`.

Wiring order: disconnect USB, connect adapter `GND` to core board `GND`, adapter `RX` to `PB0`, adapter `TX` to `PB1`, leave adapter `3V3`/`5V` unconnected, then connect USB and open the terminal.

| Symptom | Check |
| --- | --- |
| No serial output | `TX`/`RX` crossed, `GND` connected, 115200 baud, correct port |
| Garbled output | Baud rate, ground, 3.3 V adapter level |
| Receives but cannot send | Board `RX` connected to adapter `TX` |
| Port does not exist | Adapter driver, USB cable, replug |
| Linux permission denied | User in the `dialout` group, or a udev rule |

## Headers and power

Header pins take 3.3 V signals only. `5V` is a power pin, not a signal; do not power the board from the headers, and do not reverse the supply. Use female jumper wires and disconnect USB before wiring. See [Pinout](../hardware/pinout.md) for the complete pin definitions and multiplexing.

- `3V3` is an output; do not feed power into it.
- `GND` must be shared with external devices.
- `GPADC` is an analog input; its range and reference are in the SoC documentation.

## First power-up and troubleshooting

- With empty flash, the BROM enters FEL on every power-up, shows nothing on a display, and `xfel` can see it.
- With a valid bootloader, the board boots directly and may show output on a display or serial; without holding `FEL`, `xfel` does not see it.
- With no display and no serial connected, no visible output is normal.
- The board has no power switch; disconnecting USB turns it off. Do not disconnect during a flash write.
- If the board heats up, smells odd or draws abnormal current, disconnect USB immediately and inspect it.

Before power-up, confirm: the USB-C cable is a data cable; the host port is direct; the board is not touching metal; no loose wire ends touch other pins; the serial adapter is 3.3 V with `3V3`/`5V` unconnected; `TX`/`RX` are crossed and `GND` is connected; USB was disconnected while wiring; no 5 V signal or external supply is on the headers.

| Symptom | Likely cause | Action |
| --- | --- | --- |
| The host does nothing | Charge-only cable, weak front USB port, damaged cable | Replace the cable and USB port |
| `xfel` cannot find the device | Not in FEL, driver missing, cable does not carry data | Hold FEL while powering on, install WinUSB, replace the cable |
| No serial output | `TX`/`RX` reversed, no ground, wrong baud rate or port | Check each item in the serial table |
| microSD is not detected | Revision card-detection issue, poor socket contact | Leave the card out; check `R11` and the socket if needed |
| The board heats up or smells | Reversed power, short circuit, excessive peripheral current | Disconnect USB immediately and check the wiring |
| Host reports an unknown USB device | Driver missing or bad descriptor | Install WinUSB with Zadig on Windows; replace the cable |

## References

- Pinout and multiplexing: [Pinout](../hardware/pinout.md)
- FEL mode and xfel: [Install xfel](xfel.md)
- Revision differences and card detection: [Errata and revision differences](../hardware/errata.md)
- Serial installation and FEL details: [FEL download mode and tools](../boot/fel.md)

---

Next page: [Base board wiring](base-board.md)
