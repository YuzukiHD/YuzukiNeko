---
title: "Example sketches"
---

The platform ships 27 examples. They are installed with the core and appear under **File > Examples > YuzukiHD Boards** in the IDE. This page lists what each one exercises and what hardware it expects, so you can pick the first one that matches your board.

## Examples in the IDE

The examples are also on disk under `<sketchbook>/hardware/yuzuki/f101/examples` or inside the installed platform package. Open one, select the board, put it in FEL and use **Upload Using Programmer**. The console baud rate is 115200 on the board console.

## Example list

| Example | Uses | Needs | What it does |
| --- | --- | --- | --- |
| `Blink` | GPIO, `Serial` | An LED on PA0 | Blinks `LED_BUILTIN` and prints `on` / `off` |
| `SerialPins` | `Serial1` | PE4 shorted to PE5 | Moves UART5 to explicit pins and forwards what it receives |
| `StringDemo` | `String` | — | Concatenation, case conversion, number formatting, search |
| `AnalogSerial` | ADC, PWM | A0 input, LED on PD6 | Reads A0, fades PD6, echoes serial input |
| `I2CScan` | `Wire` | An I²C device (optional) | Scans addresses 1..126 on I2C1 |
| `SelfTest` | Core, `Wire`, `SPI` | PA1 output, PA2 pull-up input, A0 | Checks String, timing, math, GPIO, ADC, PWM, I²C and SPI |
| `DisplayBasics` | `Display` | The panel | Fills, draws shapes and text, fades the backlight |
| `DisplayYuvOverlay` | `Display` | The panel | Shows a generated NV12 picture with a text overlay |
| `G2DDemo` | `Display`, `G2D` | The panel | Fill, scaled blit, rotate, flip and alpha blend with timing |
| `DBIProbe` | `DBI` | A 4-wire SPI panel on PD0..PD5 | Resets and initializes an ST7789-style panel, draws color bars |
| `JPEGShow` | `VideoDecoder`, `Display` | The panel | Decodes a built-in JPEG and shows it, then converts pixels on the CPU |
| `AudioTone` | `Audio` | Headphones or a speaker | Plays a rising scale on the on-chip codec |
| `AudioPlayPCM` | `Audio` | Headphones or a speaker | Plays a generated stereo sweep, blocking and non-blocking |
| `AudioMicLevel` | `Audio` | A microphone | Prints the microphone peak level every 200 ms |
| `I2SLoopback` | `I2S` | Nothing external | Sends a counting pattern through I2S0's internal loopback and checks it |
| `SPDIFTone` | `SPDIF` | A S/PDIF receiver on PE6 | Sends a 1 kHz tone at 48 kHz, 16 bit stereo |
| `AACToPCM` | `MP4`, `AACDecoder` | An SD card with `video540p.mp4` | Decodes the AAC track and prints the level of each second |
| `SDInfo` | `SD` | A FAT-formatted SD card | Prints card size, volume size and free space |
| `SDListFiles` | `SD` | A FAT-formatted SD card | Lists the card contents recursively |
| `SDReadWrite` | `SD` | A FAT-formatted SD card | Creates, reads, seeks, renames and removes files |
| `USBSerialEcho` | `USBDevice` | A USB cable to a PC | Creates a CDC ACM port and echoes what the PC sends |
| `USBSerialBridge` | `USBHost` | A USB serial device on the Type-A port | Bridges the device to the UART console |
| `USBMassStorage` | `USBHost`, `SD` | A USB flash stick | Prints the drive identity, reads the MBR and lists the FAT root |
| `MP4Info` | `MP4` | An SD card with `video540p.mp4` | Lists tracks and walks the video and audio packets |
| `PlayVideo` | `MP4Player` | An SD card with `video540p.mp4`, the panel | Plays the file in a loop and prints statistics |
| `H264Frames` | `VideoDecoder`, `MP4`, `SD` | An SD card with `video540p.mp4` or a `.h264` file | Decodes frames and counts them |
| `WatchdogDemo` | `Watchdog` | — | Feeds the watchdog for 10 s, then stops and lets the board reset |

## Suggested order

1. `Blink` and `StringDemo` to check the toolchain and the console.
2. `SelfTest` to check the core, GPIO, ADC, PWM, I²C and SPI in one run.
3. `AnalogSerial` or `I2CScan` to bring up a peripheral of your own.
4. `SDInfo` and `SDReadWrite` once a card is available.
5. `DisplayBasics` and `G2DDemo` for the panel.
6. `AudioTone` and `AudioMicLevel` for the codec.
7. `USBSerialEcho` or `USBSerialBridge` for USB.
8. `MP4Info`, `PlayVideo` and `H264Frames` for video.

## Files on the SD card

`MP4Info`, `PlayVideo`, `AACToPCM` and `H264Frames` expect `/SD:/video540p.mp4`; the path is the FAT mount point `SD:` followed by the file name. `H264Frames` also accepts an Annex B `.h264` file. `JPEGShow` does not need a card: the test image is compiled into `test_image.ino`.
