---
title: "Contributing"
---

Contributions are welcome: schematics, PCB files, BOMs, BSP support, sample projects, errata and verified pinout additions.

- Repository: <https://github.com/YuzukiHD/YuzukiNeko>
- When submitting errata or pinout additions, state the <strong>board revision</strong> and the <strong>verification method</strong> (multimeter, oscilloscope, serial log), and include the schematic page number where you can.
- Hardware design files are released under CC0 1.0 by default; firmware, software and third-party files follow the license in their respective directories.

## Preview this documentation locally

The documentation is a [Starlight](https://starlight.astro.build) (Astro) site; its source is in the repository's `docs/` directory and it needs Node.js 22.12 or newer:

```sh
cd docs
npm ci          # The first time, or when dependencies change
npm run dev     # Development preview; pages refresh automatically when changed
```

Then open <http://localhost:4321/YuzukiNeko/>.

To see the build result exactly as it is online:

```sh
npm run build      # Output goes to docs/dist/
npm run preview    # Preview the build result
```

- The pages are Markdown files under `docs/src/content/docs/`; for the writing style and directory conventions see `docs/README.md`.
- After changing a build plugin or the styles, if pages are still stale, delete `docs/.astro` and `docs/node_modules/.astro` and restart; Astro caches rendered results by page content.
- After a push to `main`, GitHub Actions builds and publishes to GitHub Pages automatically.
