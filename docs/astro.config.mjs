import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { remarkDocs } from './src/plugins/remark-docs.mjs';
import { sidebar } from './sidebar.mjs';

// GitHub Pages project site: https://yuzukihd.github.io/YuzukiNeko/
const site = 'https://yuzukihd.github.io';
const base = '/YuzukiNeko';

export default defineConfig({
	site,
	base,
	markdown: {
		remarkPlugins: [[remarkDocs, { base }]],
	},
	integrations: [
		starlight({
			title: 'YuzukiNeko',
			description:
				'Documentation for the YuzukiNeko Pico development board (Allwinner F101 / XuanTie C907 RISC-V) · YuzukiNeko Pico 开发板（Allwinner F101 / XuanTie C907 RISC-V）使用文档',
			// English is the root locale (src/content/docs/), 简体中文 lives in src/content/docs/zh/.
			// Both trees hold the same pages, so a sidebar slug resolves in either language.
			locales: {
				root: { label: 'English', lang: 'en' },
				zh: { label: '简体中文', lang: 'zh-CN' },
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/YuzukiHD/YuzukiNeko' },
			],
			// Starlight appends the page's file path relative to the Astro project root
			// (`src/content/docs/...`, and `src/content/docs/zh/...` for Chinese), so the
			// base stops at the project directory, not at the content directory.
			editLink: {
				baseUrl: 'https://github.com/YuzukiHD/YuzukiNeko/edit/main/docs/',
			},
			sidebar,
			customCss: ['./src/styles/custom.css'],
			head: [
				// mermaid diagrams and asciinema players, see public/enhance.js
				{ tag: 'script', attrs: { type: 'module', src: `${base}/enhance.js` } },
			],
		}),
	],
});
