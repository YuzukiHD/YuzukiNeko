# First Sketch

## First Sketch: Blink

1. **File → Examples**, open **Blink** under **YuzukiHD Boards** (it can also be found in `Documents/Arduino/hardware/yuzuki/f101/examples`).
2. Click **Verify** (the check mark); compilation finishes in a few seconds.
3. Put the board into FEL: **hold the FEL button, power up (or reset), release**.
4. **Sketch → Upload Using Programmer** (Ctrl+Shift+U). It writes the loader, core and sketch into the on-board Flash and starts them.
5. Open the console serial port at 115200; you should see `F101 Arduino: Blink` and an `on` / `off` every half second. The LED pin is `PA0` (the EVB has no user LED; you need to wire one).

After that, the board **runs the sketch by itself on every power-up**. To upload again you still need to put it into FEL (power up while holding FEL), because a board that boots from Flash does not enter FEL on its own.

| Symptom | Fix |
| --- | --- |
| `no board in FEL mode` | The board is not in FEL; redo step 3 and check the USB driver |
| `Request 'upload' failed` | "Upload" was chosen instead of "Upload Using Programmer", or no programmer is selected |
