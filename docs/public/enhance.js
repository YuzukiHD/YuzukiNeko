// Loaded on every page: draws the mermaid diagrams and starts the asciinema players.
// Both libraries are only fetched on pages that use them.
const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@12.0.0/dist/mermaid.esm.min.mjs';
const ASCIINEMA = 'https://cdn.jsdelivr.net/npm/asciinema-player@3.8.0/dist/bundle/';

function loadScript(src) {
	return new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = src;
		s.onload = resolve;
		s.onerror = reject;
		document.head.appendChild(s);
	});
}

async function drawMermaid() {
	const nodes = [...document.querySelectorAll('pre.mermaid')];
	if (!nodes.length) return;
	const { default: mermaid } = await import(MERMAID);
	const dark = document.documentElement.dataset.theme === 'dark';
	mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
	await mermaid.run({ nodes });
}

async function startPlayers() {
	const els = [...document.querySelectorAll('.asciinema-cast')];
	if (!els.length) return;
	const css = document.createElement('link');
	css.rel = 'stylesheet';
	css.href = ASCIINEMA + 'asciinema-player.css';
	document.head.appendChild(css);
	await loadScript(ASCIINEMA + 'asciinema-player.min.js');
	for (const el of els) {
		window.AsciinemaPlayer.create(el.getAttribute('data-src'), el, {
			rows: 28,
			fit: 'width',
			idleTimeLimit: 2,
			speed: parseFloat(el.getAttribute('data-speed') || '1'),
			preload: true,
		});
	}
}

drawMermaid().catch((e) => console.error('mermaid', e));
startPlayers().catch((e) => console.error('asciinema', e));
