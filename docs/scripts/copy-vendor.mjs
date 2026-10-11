// Copies the browser libraries from node_modules to public/, so the site serves all its JavaScript itself:
//  - mermaid.min.js, loaded by a blocking script in front of the first diagram (src/plugins/remark-docs.mjs)
//  - asciinema-player.min.js / .css, loaded by public/enhance.js on pages with a recording
// Runs before `astro dev` and `astro build`.
import { copyFileSync, mkdirSync } from 'node:fs';

const files = [
	['mermaid/dist/mermaid.min.js', 'mermaid.min.js'],
	['asciinema-player/dist/bundle/asciinema-player.min.js', 'asciinema-player.min.js'],
	['asciinema-player/dist/bundle/asciinema-player.css', 'asciinema-player.css'],
];

mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
for (const [from, to] of files) {
	copyFileSync(new URL(`../node_modules/${from}`, import.meta.url), new URL(`../public/${to}`, import.meta.url));
}
