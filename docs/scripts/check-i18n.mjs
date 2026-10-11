// Bilingual consistency check for the docs site.
//
// English is the root locale (src/content/docs/**), 简体中文 lives in
// src/content/docs/zh/**. Every page exists in both trees under the same relative path
// and the two stay structurally identical: prose is translated, code, commands, links,
// images and diagrams are not.
//
//   node scripts/check-i18n.mjs                  # every page
//   node scripts/check-i18n.mjs hardware/mux     # one page, by slug
//   node scripts/check-i18n.mjs src/content/docs/zh/hardware/mux.md
//
// Exits non-zero when a pair does not line up.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(root, 'src', 'content', 'docs');
const zhDir = path.join(contentDir, 'zh');

// Characters that must never survive into an English page: Han, kana, Hangul and the CJK
// punctuation blocks. Nothing in the Chinese tree puts them inside a code block, so a hit
// anywhere in an English page is a miss.
const CJK = /[⺀-〿぀-ヿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/;

const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

// ---------------------------------------------------------------- markdown analysis

// Heading ids the way github-slugger (used by Astro) builds them: drop punctuation and
// symbols, keep letters (CJK included), numbers, marks, `_` and `-`, turn spaces into
// dashes, lowercase, then deduplicate repeats with a numeric suffix.
function headingIds(headings) {
  const seen = new Map();
  return headings.map(({ text }) => {
    const base = text
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '')
      .replace(/ /g, '-')
      .toLowerCase();
    const n = seen.get(base);
    if (n === undefined) {
      seen.set(base, 0);
      return base;
    }
    seen.set(base, n + 1);
    return `${base}-${n + 1}`;
  });
}

// Comment text inside a fenced block is documentation, so it is translated along with the
// prose. Everything else in a block — the code, the commands, pasted program output, log
// lines, an SSID, a usage string — is data and must survive verbatim. This reduces a block
// to that data: comment text removed (`#include` and `http://` are not comments), and lines
// that held nothing but a comment dropped.
function codeOnly(lines) {
  const out = [];
  const comments = [];
  let inBlockComment = false;
  lines.forEach((raw, i) => {
    let line = raw;
    let hasComment = false;
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end < 0) {
        comments[i] = true;
        return;
      }
      line = line.slice(end + 2);
      inBlockComment = false;
      hasComment = true;
    }
    const start = line.match(/(?:^|\s)(\/\*|\/\/|#(?=\s|$)|<!--)/);
    if (start) {
      const at = start.index + start[0].length - start[1].length;
      if (start[1] === '/*' && !line.slice(at).includes('*/')) inBlockComment = true;
      line = line.slice(0, at);
      hasComment = true;
    }
    comments[i] = hasComment;
    line = line.replace(/\s+$/, '');
    if (line.trim() !== '') out.push(line);
  });
  return { code: out.join('\n'), comments };
}

// The docs also draw listings — directory trees, annotated transcripts — where a line is
// `something` + two or more spaces + a description the author wrote. That description is
// prose too, so the comparison falls back to this looser form when the strict one differs:
// the trailing annotation is dropped and everything else still has to match.
function looseCode(code) {
  return code
    .split('\n')
    .map((line) => {
      const at = line.match(/^(\s*.*?\S)\s{2,}(\S.*)$/);
      return at ? at[1] : line;
    })
    .join('\n');
}

// A mermaid diagram's labels are translated, its syntax is not. Reduce a diagram to the
// skeleton that must survive translation: node ids, arrows, subgraph/participant structure,
// with quoted labels, `as` aliases and `%%` comments removed.
function mermaidSkeleton(blocks) {
  return blocks
    .flatMap((block) => block.split('\n'))
    .map((line) =>
      line
        .replace(/%%%%.*$/, '')
        .replace(/%%[^%]*$/, '')
        .replace(/"[^"]*"/g, '""')
        .replace(/\|[^|]*\|/g, '||')
        // `-.label.->` is a labelled dashed edge; the label is prose like any other
        .replace(/-\.(?:(?!\.->)[\s\S])*\.->/g, '-..->')
        // sequence-diagram message text and notes sit after a colon and are prose
        .replace(
          /^(\s*(?:Note\s+(?:over|left of|right of)\s+[^:]+|[^\s:]+\s*[-=][-=)>x|]*\s*[^\s:]+))\s*:.*$/,
          '$1',
        )
        // sequence-diagram block keywords carry a prose label after the keyword
        .replace(/^(\s*(?:alt|else|opt|loop|par|and|critical|option|break|rect))\b.*$/, '$1')
        .replace(/^\s*subgraph\b.*$/, 'subgraph')
        .replace(/^\s*participant\s+(\S+)(\s+as\s+.*)?$/, 'participant $1')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line !== '')
    .join('\n');
}

function analyze(text) {
  const lines = text.split(/\r?\n/);
  const doc = {
    fences: [],
    mermaid: 0,
    mermaidBlocks: [],
    mermaidCjk: [],
    fenceCjk: [],
    asciinema: [],
    admonitions: [],
    images: [],
    links: [],
    headings: [],
    tableRows: 0,
    strong: 0,
    frontmatter: null,
    hasCjk: false,
  };

  let inFence = false;
  let lang = '';
  let buf = [];
  let cjkInFence = [];

  lines.forEach((line, i) => {
    const fence = line.match(/^\s*(?:`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (inFence) {
        inFence = false;
        if (lang === 'mermaid') {
          doc.mermaid += 1;
          doc.mermaidBlocks.push(buf.join('\n'));
        } else {
          const { code, comments } = codeOnly(buf);
          doc.fences.push({ line: i + 1, code, loose: looseCode(code) });
          for (const hit of cjkInFence) {
            doc.fenceCjk.push({ ...hit, inComment: comments[hit.local] === true });
          }
        }
      } else {
        inFence = true;
        lang = fence[1].trim().toLowerCase();
        buf = [];
        cjkInFence = [];
      }
      return;
    }
    if (inFence) {
      if (CJK.test(line)) {
        if (lang === 'mermaid') doc.mermaidCjk.push(line.trim());
        else cjkInFence.push({ local: buf.length, line: i + 1, text: line.trim() });
      }
      buf.push(line);
      return;
    }

    if (CJK.test(line)) doc.hasCjk = true;

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) doc.headings.push({ level: heading[1].length, text: heading[2] });

    const admonition = line.match(/^:::\s*([a-z-]+)/);
    if (admonition) doc.admonitions.push(admonition[1]);

    if (line.includes('asciinema-cast')) {
      const src = line.match(/data-src="([^"]+)"/);
      doc.asciinema.push(src ? src[1] : '(missing data-src)');
    }

    if (/^\s*\|/.test(line)) doc.tableRows += 1;

    doc.strong += (line.match(/<strong>/g) ?? []).length;

    for (const m of line.matchAll(/(!?)\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[2];
      if (m[1] === '!') doc.images.push(target);
      else if (/\.md(?:$|#)/i.test(target) && !URL_LIKE.test(target)) doc.links.push(target);
    }
  });

  if (inFence) doc.fences.push({ line: lines.length, content: buf.join('\n') });

  const source = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (source) {
    doc.frontmatter = new Set(
      source[1]
        .split(/\r?\n/)
        .filter((l) => /^[A-Za-z_][\w-]*:/.test(l))
        .map((l) => l.slice(0, l.indexOf(':'))),
    );
  }

  doc.ids = headingIds(doc.headings);
  return doc;
}

// ------------------------------------------------------------------------- checks

const errors = [];
const warnings = [];
const translatedLabels = [];
const verbose = process.argv.includes('--verbose');
const fail = (rel, message) => errors.push(`${rel}: ${message}`);
const warn = (rel, message) => warnings.push(`${rel}: ${message}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (xs) => [...xs].sort();
const only = (a, b) => sorted(a).filter((x) => !b.includes(x));

function comparePair(rel, zh, en) {
  if (en.hasCjk) fail(rel, 'English page still contains CJK text');

  if (zh.frontmatter && en.frontmatter && !same(sorted(zh.frontmatter), sorted(en.frontmatter))) {
    fail(rel, `frontmatter keys differ: zh=[${sorted(zh.frontmatter)}] en=[${sorted(en.frontmatter)}]`);
  }
  if (!en.frontmatter?.has('title')) fail(rel, 'English page has no frontmatter title');

  if (zh.fences.length !== en.fences.length) {
    fail(rel, `code blocks: zh has ${zh.fences.length}, en has ${en.fences.length}`);
  } else {
    zh.fences.forEach((f, i) => {
      const g = en.fences[i];
      if (f.code === g.code) return;
      // a difference that disappears once trailing annotations are dropped is a translated
      // label in a listing, not drifting code
      if (f.loose === g.loose) {
        translatedLabels.push(rel);
        if (verbose) warn(rel, `code block #${i + 1}: a trailing label was translated`);
        return;
      }
      const a = f.code.split('\n');
      const b = g.code.split('\n');
      const at = Math.max(a.findIndex((line, n) => line !== b[n]), 0);
      fail(
        rel,
        `code block #${i + 1} differs at its line ${at + 1}: zh=${JSON.stringify(a[at])} en=${JSON.stringify(
          b[at] ?? '(missing)',
        )}`,
      );
    });
  }

  if (zh.mermaid !== en.mermaid) fail(rel, `mermaid blocks: zh ${zh.mermaid}, en ${en.mermaid}`);
  else if (zh.mermaid > 0) {
    const a = mermaidSkeleton(zh.mermaidBlocks);
    const b = mermaidSkeleton(en.mermaidBlocks);
    if (a !== b) {
      const al = a.split('\n');
      const bl = b.split('\n');
      const at = Math.max(
        al.findIndex((line, n) => line !== bl[n]),
        0,
      );
      warn(
        rel,
        `mermaid structure may have changed at line ${at + 1}: zh=${JSON.stringify(al[at])} en=${JSON.stringify(
          bl[at] ?? '(missing)',
        )}`,
      );
    }
  }
  // mermaid node labels are prose, so Chinese left in one means it was not translated
  for (const line of en.mermaidCjk) fail(rel, `mermaid block still in Chinese: ${line}`);
  // a code block keeps Chinese only where it is pasted data (output, a log line, an SSID). A Chinese
  // comment is documentation and should have been translated.
  for (const hit of en.fenceCjk) {
    if (hit.inComment) fail(rel, `comment in a code block is still in Chinese (line ${hit.line}): ${hit.text}`);
    else warn(rel, `Chinese data inside a code block, expected to stay (line ${hit.line}): ${hit.text}`);
  }
  if (!same(sorted(zh.asciinema), sorted(en.asciinema))) fail(rel, 'asciinema data-src values differ');

  // Targets are compared without their #anchor: a heading's id is derived from its own
  // language's text, so the anchors legitimately differ. checkAnchors() has the job of
  // proving each anchor really names a heading.
  const pageOf = (target) => target.replace(/#.*$/, '');
  const zhImages = zh.images.map(pageOf);
  const enImages = en.images.map(pageOf);
  if (!same(sorted(zhImages), sorted(enImages))) {
    fail(rel, `image targets differ: only in zh [${only(zhImages, enImages)}] only in en [${only(enImages, zhImages)}]`);
  }
  const zhLinks = zh.links.map(pageOf);
  const enLinks = en.links.map(pageOf);
  if (!same(sorted(zhLinks), sorted(enLinks))) {
    fail(rel, `link targets differ: only in zh [${only(zhLinks, enLinks)}] only in en [${only(enLinks, zhLinks)}]`);
  }
  if (zh.tableRows !== en.tableRows) fail(rel, `table rows: zh ${zh.tableRows}, en ${en.tableRows}`);
  if (zh.strong !== en.strong) fail(rel, `<strong> count: zh ${zh.strong}, en ${en.strong}`);
  if (zh.headings.length !== en.headings.length) fail(rel, `headings: zh ${zh.headings.length}, en ${en.headings.length}`);
  if (!same(sorted(zh.admonitions), sorted(en.admonitions))) {
    fail(rel, `admonitions: zh [${sorted(zh.admonitions)}] en [${sorted(en.admonitions)}]`);
  }
  for (const kind of en.admonitions) {
    if (!['note', 'tip', 'caution', 'danger'].includes(kind)) fail(rel, `unknown admonition type :::${kind}`);
  }
}

// Every link that points at another page (#anchor or page.md#anchor) must find that page
// in the same locale, and the anchor must match a heading of it. A page that exists in
// Chinese but not yet in English is a translation still to come ("missing English page"),
// not a broken link, so it is only a warning here.
function checkAnchors(rel, doc, tree, otherTree) {
  const dir = path.posix.dirname(rel);
  for (const target of doc.links) {
    const hash = target.indexOf('#');
    const page = (hash < 0 ? target : target.slice(0, hash)).replace(/\.md$/i, '');
    const anchor = hash < 0 ? '' : target.slice(hash + 1);
    const base = page === '' ? rel : path.posix.normalize(path.posix.join(dir, page));
    const candidates = page === '' ? [rel] : [`${base}.md`, `${base}/index.md`];
    const found = candidates.find((c) => tree.has(c));
    if (!found) {
      if (candidates.some((c) => otherTree.has(c))) warn(rel, `link "${target}" still points at an untranslated page`);
      else fail(rel, `link "${target}" points at a page that does not exist`);
      continue;
    }
    if (anchor && !tree.get(found).ids.includes(anchor)) {
      fail(rel, `link "${target}" anchor #${anchor} matches no heading in ${found}`);
    }
  }
}

// --------------------------------------------------------------------------- walk

function mdFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'figures') out.push(...mdFiles(full));
    } else if (entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function loadTree(dir, skipZh = false) {
  const tree = new Map();
  for (const file of mdFiles(dir)) {
    const rel = path.relative(contentDir, file).replaceAll('\\', '/');
    if (skipZh && rel.startsWith('zh/')) continue;
    tree.set(skipZh ? rel : path.relative(zhDir, file).replaceAll('\\', '/'), analyze(fs.readFileSync(file, 'utf8')));
  }
  return tree;
}

const zhTree = loadTree(zhDir);
const enTree = loadTree(contentDir, true);

// An argument may be a slug (`hardware/mux`, `dev/zephyr`) or a path (`src/content/docs/zh/hardware/mux.md`).
// A slug matches both the page itself and the section index directory of the same name.
const filters = new Set();
for (const raw of process.argv.slice(2)) {
  let s = raw.replaceAll('\\', '/').replace(/^\.\//, '');
  const marker = 'src/content/docs/';
  const at = s.indexOf(marker);
  if (at >= 0) s = s.slice(at + marker.length);
  s = s.replace(/^zh\//, '');
  if (s.endsWith('.md')) filters.add(s);
  else {
    filters.add(`${s}.md`);
    filters.add(`${s}/index.md`);
  }
}
const wanted = (rel) => filters.size === 0 || filters.has(rel);

// Pages exist in both languages, one for one — except 404.md, which Starlight turns into the
// 404 handler of the root locale only. A second one under zh/ would just become an orphan page.
const ROOT_ONLY = new Set(['404.md']);
for (const rel of zhTree.keys()) {
  if (wanted(rel) && !enTree.has(rel) && !ROOT_ONLY.has(rel)) fail(rel, 'missing English page');
}
for (const rel of enTree.keys()) {
  if (wanted(rel) && !zhTree.has(rel) && !ROOT_ONLY.has(rel)) {
    fail(rel, 'English page has no Chinese counterpart');
  }
}

// figures are duplicated byte for byte, so a stale copy is a real bug
function figuresDirs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === 'figures') out.push(full);
    else out.push(...figuresDirs(full));
  }
  return out;
}
for (const dir of filters.size === 0 ? figuresDirs(zhDir) : []) {
  const rel = path.relative(zhDir, dir).replaceAll('\\', '/');
  const copy = path.join(contentDir, rel);
  if (!fs.existsSync(copy)) {
    fail(rel, 'English tree has no copy of this figures directory');
    continue;
  }
  for (const name of fs.readdirSync(dir)) {
    const copyFile = path.join(copy, name);
    if (!fs.existsSync(copyFile) || !fs.readFileSync(path.join(dir, name)).equals(fs.readFileSync(copyFile))) {
      fail(rel, `figure ${name} differs between the two trees`);
    }
  }
}

// The "edit this page" link is editLink.baseUrl + the page's path relative to the Astro
// project root, so a baseUrl that already ends inside src/content/docs/ duplicates the
// directory and every edit link 404s. Check the resulting path really exists.
if (filters.size === 0) {
  const configText = fs.readFileSync(path.join(root, 'astro.config.mjs'), 'utf8');
  const editBase = configText.match(/editLink:\s*\{[\s\S]*?baseUrl:\s*'([^']+)'/)?.[1];
  const repoRoot = path.resolve(root, '..');
  const inRepo = editBase?.replace(/^https:\/\/github\.com\/[^/]+\/[^/]+\/edit\/[^/]+\//, '');
  if (editBase && inRepo === editBase) {
    fail('astro.config.mjs', `editLink.baseUrl is not a GitHub edit URL: ${editBase}`);
  } else if (editBase) {
    for (const rel of new Set([...zhTree.keys(), ...enTree.keys()])) {
      const file = path.join(repoRoot, inRepo, 'src', 'content', 'docs', rel);
      if (!fs.existsSync(file)) {
        fail('astro.config.mjs', `editLink for ${rel} points at a file that does not exist (${file})`);
      }
    }
  }
}

// every sidebar slug must resolve in both languages
const sidebar = fs.readFileSync(path.join(root, 'sidebar.mjs'), 'utf8');
const slugs = new Set([...sidebar.matchAll(/"slug":\s*"([^"]+)"/g)].map((m) => m[1]));
for (const slug of filters.size === 0 ? slugs : []) {
  for (const [side, tree] of [
    ['zh', zhTree],
    ['en', enTree],
  ]) {
    if (![`${slug}.md`, `${slug}/index.md`].some((c) => tree.has(c))) {
      fail(`sidebar (${side})`, `slug "${slug}" has no page`);
    }
  }
}

// pairs, then anchors (which may point across pages)
let checked = 0;
for (const [rel, zh] of zhTree) {
  if (!enTree.has(rel)) continue;
  if (wanted(rel)) {
    comparePair(rel, zh, enTree.get(rel));
    checked += 1;
  }
}
for (const [rel, zh] of zhTree) {
  if (wanted(rel)) checkAnchors(rel, zh, zhTree, enTree);
}
for (const [rel, en] of enTree) {
  if (wanted(rel)) checkAnchors(rel, en, enTree, zhTree);
}

// ------------------------------------------------------------------------ report

for (const error of errors) console.error(`error: ${error}`);
for (const warning of warnings) console.error(`warning: ${warning}`);
if (errors.length > 0) {
  console.error(`\ncheck-i18n: ${errors.length} problem(s), ${checked} page pair(s) checked`);
  process.exit(1);
}
const labels = translatedLabels.length === 0 ? '' : `, ${translatedLabels.length} translated label(s) in code listings`;
console.log(`check-i18n: ${checked} page pair(s) OK${labels}`);
process.exit(0);
