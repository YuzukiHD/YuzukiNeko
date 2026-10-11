# Making a .uf2

## Making a `.uf2`

Generate it from an image with `tools/mkuf2.py`:

```sh
tools/mkuf2.py app build/gba/zephyr/zephyr.bin -o gba.uf2        # application, Flash 0x200000
tools/mkuf2.py system build/uf2/zephyr/zephyr.bin -o dl.uf2      # the downloader itself, Flash 0x30000
tools/mkuf2.py loader boot.img -o loader.uf2                     # loader, Flash 0
```

| Type | UF2 family | Writable range |
| --- | --- | --- |
| `app` | `0x31303146` | Application area only (offset ≥ `0x200000`) |
| `system`, `loader` | `0x31303147` | Anywhere |

!> `system` and `loader` files can write to any location; a bad write can leave the board without a loader, and then only **FEL** can rescue it. Only drop files you trust.
