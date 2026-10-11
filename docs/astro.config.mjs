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
			description: 'YuzukiNeko Pico 开发板（Allwinner F101 / XuanTie C907 RISC-V）使用文档',
			locales: {
				root: { label: '简体中文', lang: 'zh-CN' },
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/YuzukiHD/YuzukiNeko' },
			],
			editLink: {
				baseUrl: 'https://github.com/YuzukiHD/YuzukiNeko/edit/main/docs/src/content/docs/',
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
