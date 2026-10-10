# Contributing

Contributions are welcome: schematics, PCB files, BOMs, BSP support, example projects, errata, and verified pin additions.

- Repository: <https://github.com/YuzukiHD/YuzukiNeko>
- When submitting errata or pin additions, state the **board version** and the **verification method** (multimeter, oscilloscope, serial log), and include the schematic page number where possible.
- Hardware design files are released under CC0 1.0 by default; firmware, software and third-party files follow the license of their own directory.

## Previewing These Docs Locally

The docs are a [docsify](https://docsify.js.org/) site and need no build step:

```sh
npx docsify-cli serve docs
# or
cd docs && python3 -m http.server 3000
```

Then open <http://localhost:3000>.
