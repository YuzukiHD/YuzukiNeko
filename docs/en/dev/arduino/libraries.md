# Peripheral Libraries

## Peripheral Libraries

All libraries are part of the prebuilt core; just include them in the sketch. Devices that take over pins or power are started by the library in `begin()`, not at boot.

| Library | Hardware | Notes |
| --- | --- | --- |
| `Display` | DE + TCON + RGB panel | ARGB8888 buffer, drawing/text, `show()`, video layer (`showYuv`), backlight. After `Display.begin()` it occupies PD0..PD22, PE6/7, PB0..PB3. LVGL is not in the core: point the LVGL Arduino library at `Display.buffer()` |
| `G2D` | 2D engine | Fill, blit (convert/scale), blend; rotation/flip must keep format and size |
| `DBI` | MIPI DBI (PD0..PD5) | Mutually exclusive with `Display`: including both gives an `#error` |
| `Audio` | On-chip codec | PCM output, microphone input, tones, volume, speaker amplifier (PE10) |
| `I2S`, `SPDIF` | I2S0, OWA | I2S0 has no pins on the EVB (internal loopback); S/PDIF receive DMA is unresolved |
| `SD` | SMHC0 (PF0..PF6) | Arduino SD API, `File` is a `Stream`; also the `USBDrive` volume |
| `USBDevice` | CherryUSB device | `USBSerial` (CDC ACM) |
| `USBHost` | CherryUSB host | `USBHostMSC` (including FAT mounted as `USBDrive`), `USBHostSerial`; a sketch can pick only one USB role |
| `VideoDecoder` | VE | Hardware JPEG/PNG, H.264 streams |
| `MP4`, `AACDecoder`, `MP4Player` | Demuxer, AAC, full player | The player needs Display, SD and the codec |
| `Watchdog` | WDT | `begin(ms)`, `reset()`, `end()` |

Examples shipped with the libraries: Blink, SelfTest, AnalogSerial, I2CScan, SerialPins, StringDemo, SDInfo, SDListFiles, SDReadWrite, DisplayBasics, DisplayYuvOverlay, G2DDemo, DBIProbe, JPEGShow, H264Frames, MP4Info, PlayVideo, AACToPCM, AudioTone, AudioPlayPCM, AudioMicLevel, I2SLoopback, SPDIFTone, USBSerialEcho, USBSerialBridge, USBMassStorage, WatchdogDemo.

### Verification Status

Only results that can be checked over the serial port are listed; pictures and sound were not judged by a person:

- Verified: SelfTest (String, timing, math, GPIO, ADC, PWM, Wire, SPI, Serial RX echo), AnalogSerial, DisplayBasics, Flash boot, `upload.cmd` on Windows; earlier, on single-peripheral cores, the `I2S` loopback, `SD`, `Watchdog`, `G2D` and `VideoDecoder` JPEG were verified.
- Compiled but **not yet run on the current core**: `DBI`, `G2D`, `VideoDecoder`, `Audio`, `SPDIF`, `USBDevice`, `USBHost`, `MP4*`, H.264, PNG.
