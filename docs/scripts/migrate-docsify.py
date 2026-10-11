#!/usr/bin/env python3
"""Copy the Chinese docsify pages of ../docs into the Starlight content collection.

  python3 -I scripts/migrate-docsify.py <old docsify docs dir>

This was a one-time conversion; the images were moved into figures/ folders next to
their pages afterwards, so it no longer matches the current layout. The docsify sources are in the git history, for
example `git archive 96ae4e0 docs | tar -x -C /tmp/old` gives /tmp/old/docs.

What it changes: the first "# title" becomes the frontmatter title, "!>" / "?>" lines
become :::caution / :::tip asides, local image links point at files under src/, and
the images and asciinema casts are copied. Links between pages are left alone, the
remark plugin src/plugins/remark-docs.mjs rewrites them at build time. It also writes
sidebar.mjs from docs/_sidebar.md.
"""
import json
import os
import posixpath
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
if len(sys.argv) != 2:
    sys.exit(__doc__)
DOCS = os.path.abspath(sys.argv[1])
OUT = os.path.join(SITE, 'src', 'content', 'docs')
ASSETS = os.path.join(SITE, 'src', 'assets')
PUBLIC = os.path.join(SITE, 'public')


def md_files():
    for root, dirs, files in os.walk(DOCS):
        rel = os.path.relpath(root, DOCS)
        if rel == 'en' or rel.startswith('en' + os.sep):
            continue
        for f in sorted(files):
            if f.endswith('.md') and not f.startswith('_'):
                yield os.path.normpath(os.path.join(rel, f)).replace(os.sep, '/')


def dest_for_asset(docs_rel):
    """where a local asset of the docs ends up under site/, as a path from site/"""
    if docs_rel.startswith('assets/images/'):
        return 'src/assets/' + docs_rel[len('assets/'):]
    return 'src/content/docs/' + docs_rel


def convert(rel, text):
    lines = text.split('\n')
    title = None
    for i, l in enumerate(lines):
        if l.startswith('# '):
            title = l[2:].strip()
            del lines[i]
            if i < len(lines) and not lines[i].strip():
                del lines[i]
            break
    if title is None:
        sys.exit(f'{rel}: no H1')
    out = []
    in_fence = False
    for l in lines:
        if l.startswith('```'):
            in_fence = not in_fence
        m = None if in_fence else re.match(r'^([!?])> (.*)$', l)
        if m:
            kind = 'caution' if m.group(1) == '!' else 'tip'
            out += [f':::{kind}', m.group(2), ':::']
        else:
            out.append(l)
    body = '\n'.join(out)

    page_dir = posixpath.dirname(rel)

    def fix_img(url):
        if re.match(r'^([a-z][a-z0-9+.-]*:|//|#)', url, re.I):
            return url
        path = url.lstrip('/') if url.startswith('/') else posixpath.normpath(posixpath.join(page_dir, url))
        src = os.path.join(DOCS, path)
        if not os.path.exists(src):
            sys.exit(f'{rel}: missing image {url} -> {path}')
        dest = dest_for_asset(path)
        os.makedirs(os.path.dirname(os.path.join(SITE, dest)), exist_ok=True)
        shutil.copy2(src, os.path.join(SITE, dest))
        page_dest_dir = posixpath.join('src/content/docs', page_dir)
        return posixpath.relpath(dest, page_dest_dir)

    body = re.sub(r'(!\[[^\]]*\]\()([^)\s]+)(\))', lambda m: m.group(1) + fix_img(m.group(2)) + m.group(3), body)
    return title, body


def write_pages():
    n = 0
    for rel in md_files():
        text = open(os.path.join(DOCS, rel), encoding='utf-8').read()
        title, body = convert(rel, text)
        out_rel = 'index.md' if rel == 'README.md' else rel
        dest = os.path.join(OUT, out_rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'w', encoding='utf-8') as f:
            f.write('---\ntitle: ' + json.dumps(title, ensure_ascii=False) + '\n---\n\n' + body.lstrip('\n'))
        n += 1
    return n


def copy_casts():
    src = os.path.join(DOCS, 'assets', 'casts')
    dst = os.path.join(PUBLIC, 'casts')
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def slug_of(link):
    s = link.lstrip('/')
    s = re.sub(r'\.md$', '', s)
    if s in ('README', 'index'):
        return 'index'
    return re.sub(r'/index$', '', s)


def parse_sidebar():
    """docs/_sidebar.md -> nested [(label, link-or-None, [children])]"""
    items = []
    stack = [(-1, items)]
    for line in open(os.path.join(DOCS, '_sidebar.md'), encoding='utf-8').read().split('\n'):
        m = re.match(r'^(\s*)- (.*)$', line)
        if not m:
            continue
        depth = len(m.group(1)) // 2
        text = m.group(2)
        lm = re.match(r'^\[(.*?)\]\((.*?)\)$', text)
        node = (lm.group(1), lm.group(2), []) if lm else (text, None, [])
        while stack[-1][0] >= depth:
            stack.pop()
        stack[-1][1].append(node)
        stack.append((depth, node[2]))
    return items


def to_js(items, top=True):
    out = []
    for label, link, kids in items:
        if link is None:
            out.append({'label': label, 'collapsed': True, 'items': to_js(kids, False)})
        elif link.startswith('http'):
            out.append({'label': label, 'link': link})
        else:
            out.append({'label': label, 'slug': slug_of(link)})
    return out


def write_sidebar():
    tree = parse_sidebar()
    groups = {label: kids for label, link, kids in tree if link is None}
    singles = {label: (link, kids) for label, link, kids in tree}
    order = []
    for label, link, kids in tree:
        if label in ('语言',) or (link and link.startswith('http')):
            continue
        if label == '开发':
            # lift the children of the "dev" group to the top level
            for l2, k2, c2 in kids:
                order.append((l2, k2, c2))
            continue
        order.append((label, link, kids))
    sidebar = to_js(order)
    # the first group stays open
    if sidebar and 'items' in sidebar[0]:
        sidebar[0]['collapsed'] = False
    js = '// generated by scripts/migrate-docsify.py from docs/_sidebar.md\nexport const sidebar = ' + json.dumps(sidebar, ensure_ascii=False, indent=2) + ';\n'
    open(os.path.join(SITE, 'sidebar.mjs'), 'w', encoding='utf-8').write(js)
    return len(sidebar)


if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(OUT)
print('pages:', write_pages())
copy_casts()
print('sidebar top-level entries:', write_sidebar())
