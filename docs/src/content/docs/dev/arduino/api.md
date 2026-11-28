---
title: "Arduino API and pins"
---

The core implements the common Arduino API on top of Zephyr. Pins are named `PA0` … `PF31` (bank × 32 + pin), and `A0` … `A11` are the GPADC inputs (pseudo pin numbers 200–211). Peripherals that need more than the core API come as [libraries](libraries.md).

## Sketch entry points

`setup()` runs once and `loop()` runs forever, both in Zephyr's main thread. `init()` runs before `setup()` and seeds the random generator from the cycle counter. `initVariant()` is a weak hook for a variant. `serialEvent()` and `serialEvent1()` are weak hooks: after each `loop()`, the core calls them when `Serial` or `Serial1` has data.

```cpp
void serialEvent() {
  while (Serial.available()) {
    char c = Serial.read();
    Serial.print(c);
  }
}
```

## Digital I/O and interrupts

| API | Implementation |
| --- | --- |
| `pinMode`, `digitalWrite`, `digitalRead` | Zephyr GPIO; pin number = bank × 32 + pin |
| `attachInterrupt`, `detachInterrupt` | GPIO callbacks; `RISING`, `FALLING`, `CHANGE`, `ONHIGH`, `ONLOW` |
| `interrupts`, `noInterrupts` | Global IRQ lock and unlock; the lock is not nesting-safe |
| `pulseIn`, `pulseInLong` | Busy-wait measurement with a timeout in microseconds |

`pinMode()` accepts `INPUT`, `OUTPUT`, `INPUT_PULLUP` and `INPUT_PULLDOWN`. A pin that was routed to the PWM output goes back to GPIO when `pinMode()` is called again.

## Time

| API | Implementation |
| --- | --- |
| `millis` | Kernel uptime in milliseconds |
| `micros` | 64-bit cycle counter converted to microseconds |
| `delay`, `delayMicroseconds` | Sleep and busy-wait |
| `yield` | Yield the main thread |

`clockCyclesPerMicrosecond()` is 24. `pulseIn()` is implemented in software; for long pulses use `pulseInLong()`, which is the same implementation on this core.

## Analog input and output

| API | Implementation |
| --- | --- |
| `analogRead(A0..A11)` | GPADC, 12 bit, scaled by `analogReadResolution()` (default 10) |
| `analogReference` | Accepted and ignored; the reference is internal |
| `analogWrite`, `tone`, `analogWriteFrequency` | PWM0 on PD6, PD7, PD8 and PB3; 500 Hz default |
| `analogWriteResolution` | PWM duty resolution, 1..16 bits, default 8 |
| `noTone` | Stops the tone on the pin |
| `analogWrite` on another pin | Digital 50 % output; no PWM |

`analogReadResolution(bits)` scales the 12-bit hardware result to the requested width. `analogWriteResolution(bits)` sets the duty range to `2^bits - 1`; `analogWrite(pin, value)` maps that range to the PWM duty. `analogWriteFrequency(pin, hz)` changes the period for that pin.

When the `Display` library is included, the panel uses PD0..PD22, PE6/PE7 and PB0..PB3, so all four PWM pins are taken. `analogWrite` then falls back to a digital output on those pins.

## Serial ports

`Serial` is the console UART of the board, with the pins from the board devicetree. Its pins are fixed: `setPins()` does not re-route it. On YuzukiNeko the console is UART1 (PB0/PB1); on the EVB it is UART3 (PE8/PE9). The other UARTs are `Serial1` … `Serial5`.

| Object | UART | Routes (RX / TX) |
| --- | --- | --- |
| `Serial1` | UART5 | PE5 / PE4 |
| `Serial2` | UART2 | PF5 / PF4 |
| `Serial3` | UART1 | PF1 / PF0, PB1 / PB0 |
| `Serial4` | UART0 | PF4 / PF2 |
| `Serial5` | UART4 | PE3 / PE2 |

If the console is one of these UARTs, the matching object is not defined. On YuzukiNeko, `Serial3` (UART1) is the console, so it is not available as `Serial3`; use `Serial`. On the EVB, all five objects exist. `begin(baud, config, rx, tx)` and `setPins(rx, tx)` accept only the routes in the table; other pins return false. `Serial2` to `Serial4` default onto the SD card pins PF0..PF5.

`Serial` and `Serial1`..`Serial5` have a 256-byte RX ring buffer. `Serial.print` is synchronous and polled, and the shell and log backends are disabled so that `Serial` owns the console UART. `Serial.begin(baud, config)` accepts the `SERIAL_8N1` family of constants; the baud rate and frame format are applied to the UART.

## I²C and SPI

`Wire` uses I2C1 on PE0 (SCL) and PE1 (SDA), controller mode only. `Wire.endTransmission(false)` still ends with a STOP; there is no peripheral mode. The buffer is 128 bytes.

`SPI` uses SPI0 on PC0 (SCK), PC4 (MOSI) and PC2 (MISO). The chip select is up to the sketch; `PIN_SPI_SS` is PC1, but the library does not drive it.

## Utilities and math

- `randomSeed(seed)` and `random(max)` / `random(min, max)` use a 32-bit xorshift generator.
- `map(value, fromLow, fromHigh, toLow, toHigh)`, `min`, `max`, `constrain`, `round`, `radians`, `degrees` and `sq` are macros or inline functions.
- `bitRead`, `bitSet`, `bitClear`, `bitToggle`, `bitWrite`, `lowByte`, `highByte`, `_BV` and `word` are available.
- `PROGMEM`, `PSTR()`, `pgm_read_byte()` and the other `pgm_read_*` helpers are no-ops: there is no separate program memory.
- `String`, `Print`, `Stream`, `F()` and `printf` are implemented by the core; `Serial.printf()` works. Math functions come from the toolchain libm.

## Memory and limits

- A sketch is limited to 2 MiB of code and data. The prebuilt core is about 0.9 MB and is not counted; the size the IDE prints is only the sketch.
- `setup()` and `loop()` run in Zephyr's main thread with a 16 KiB stack.
- `new` and `malloc` use all RAM above the image, up to the sketch window at `0x40e00000`.
- The sketch compile flags disable C++ exceptions and RTTI (`-fno-exceptions -fno-rtti`).
- `Wire` has no peripheral mode, `Serial.print` is synchronous, and `analogWrite` on a non-PWM pin is digital.

## Pin conflicts

- `Display` and `DBI` both use PD0..PD5; a sketch can include only one of them. Including both is a compile error.
- `Display.begin()` claims PD0..PD22, PE6/PE7 and PB0..PB3. PWM0 uses PD6/PD7/PD8/PB3, so `analogWrite` falls back to digital while `Display` is active.
- PE2 is the USB VBUS switch; PF0..PF5 are the SD card. Avoid them unless the sketch uses those functions.
- The EVB has no documented user LED; `LED_BUILTIN` is PA0.
