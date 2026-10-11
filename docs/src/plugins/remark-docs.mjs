// Remark plugin for the docs:
//  - ```mermaid code blocks become <pre class="mermaid"> (drawn in the browser by public/enhance.js);
//    the first one on a page is preceded by a blocking <script> for the site's own copy of mermaid,
//    so the library is there when the page has been parsed and nothing is fetched from a CDN
//  - links to other pages written as relative or root paths ending in .md point at the page URL
//  - the asciinema placeholders get the not-content class and data-src="assets/casts/..." gets the site base
import path from 'node:path';
import { visit } from 'unist-util-visit';

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function remarkDocs({ base = '' } = {}) {
	return (tree, file) => {
		const fp = String(file.path ?? '').replaceAll('\\', '/');
		const rel = fp.split('/src/content/docs/')[1] ?? '';
		const dir = path.posix.dirname(rel);

		const pageUrl = (url) => {
			if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url)) return url;
			const hashAt = url.indexOf('#');
			const p = hashAt < 0 ? url : url.slice(0, hashAt);
			const hash = hashAt < 0 ? '' : url.slice(hashAt);
			if (!/\.md$/i.test(p)) return url;
			let target = p.startsWith('/') ? p.slice(1) : path.posix.normalize(path.posix.join(dir, p));
			target = target.replace(/\.md$/i, '').replace(/(^|\/)(README|index)$/, '');
			return `${base}/${target}${target ? '/' : ''}${hash}`;
		};

		let mermaidLoaded = false;
		visit(tree, (node, index, parent) => {
			if (node.type === 'code' && node.lang === 'mermaid' && parent && index !== undefined) {
				const loader = mermaidLoaded ? '' : `<script src="${base}/mermaid.min.js"></script>`;
				mermaidLoaded = true;
				parent.children[index] = {
					type: 'html',
					value: `${loader}<pre class="mermaid">${escapeHtml(node.value)}</pre>`,
				};
			} else if (node.type === 'link' && typeof node.url === 'string') {
				node.url = pageUrl(node.url);
			} else if (node.type === 'html' && node.value.includes('class="asciinema-cast"')) {
				// not-content keeps the page's own spacing rules away from the player's inner elements
				node.value = node.value
					.replace('class="asciinema-cast"', 'class="asciinema-cast not-content"')
					.replaceAll('data-src="assets/casts/', `data-src="${base}/casts/`);
			}
		});
	};
}
