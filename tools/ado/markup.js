// Text conversions for Azure DevOps. Work item rich-text fields are HTML; Lumen and the AI speak Markdown.
// Wiki pages are already Markdown and are passed through untouched (so Mermaid and [[_TOC_]] survive).

const { marked } = require('marked');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', copy: '©', reg: '®', trade: '™' };
const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'area', 'base', 'wbr', 'source']);
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'pre', 'blockquote', 'hr', 'tr', 'section', 'article', 'header', 'footer']);

/** Parse HTML into a small tree: { tag, attrs, children } / strings. Forgiving: unclosed tags close at their parent's end. */
function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+|<)/g;
  let m;
  while ((m = re.exec(String(html || '')))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[5] !== undefined) { stack[stack.length - 1].children.push(decode(m[5])); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.map((n) => n.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const attrs = {};
    m[3].replace(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, (_, k, a, b, c) => { attrs[k.toLowerCase()] = decode(a ?? b ?? c ?? ''); });
    const node = { tag, attrs, children: [] };
    if (tag === 'li') { const i = stack.map((n) => n.tag).lastIndexOf('li'); const list = Math.max(stack.map((n) => n.tag).lastIndexOf('ul'), stack.map((n) => n.tag).lastIndexOf('ol')); if (i > 0 && i > list) stack.length = i; }
    if (tag === 'p') { const i = stack.map((n) => n.tag).lastIndexOf('p'); if (i > 0) stack.length = i; }
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(tag) && !m[4] && !['script', 'style'].includes(tag)) stack.push(node);
    else if (['script', 'style'].includes(tag)) { const end = String(html).toLowerCase().indexOf(`</${tag}`, re.lastIndex); re.lastIndex = end < 0 ? String(html).length : String(html).indexOf('>', end) + 1 || String(html).length; }
  }
  return root;
}

const inlineText = (n) => (typeof n === 'string' ? n : n.children.map(inlineText).join(''));
const collapse = (s) => s.replace(/[ \t\r\n ]+/g, ' ');

function inline(nodes, ctx = {}) {
  let out = '';
  for (const n of nodes) {
    if (typeof n === 'string') { out += ctx.pre ? n : collapse(n).replace(/([*_`[\]\\])/g, '\\$1'); continue; }
    const inner = () => inline(n.children, ctx);
    switch (n.tag) {
      case 'br': out += ctx.cell ? '<br>' : '  \n'; break;
      case 'strong': case 'b': { const t = inner().trim(); out += t ? `**${t}**` : ''; break; }
      case 'em': case 'i': { const t = inner().trim(); out += t ? `*${t}*` : ''; break; }
      case 's': case 'strike': case 'del': { const t = inner().trim(); out += t ? `~~${t}~~` : ''; break; }
      case 'code': out += `\`${inlineText(n).replace(/`/g, 'ˋ')}\``; break;
      case 'a': { const t = inner().trim() || n.attrs.href || ''; out += n.attrs.href && !/^javascript:/i.test(n.attrs.href) ? `[${t}](${n.attrs.href})` : t; break; }
      case 'img': out += `![${n.attrs.alt || 'image'}](${n.attrs.src || ''})`; break;
      case 'script': case 'style': break;
      default: out += BLOCK.has(n.tag) ? ` ${inner()} ` : inner();
    }
  }
  return out;
}

function table(n) {
  const rows = [];
  const walk = (x) => { for (const c of x.children) if (typeof c !== 'string') { if (c.tag === 'tr') rows.push(c.children.filter((d) => typeof d !== 'string' && (d.tag === 'td' || d.tag === 'th'))); else walk(c); } };
  walk(n);
  if (!rows.length) return '';
  const cells = rows.map((r) => r.map((c) => inline(c.children, { cell: true }).trim().replace(/\|/g, '\\|') || ' '));
  const width = Math.max(...cells.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill(' ')];
  return [`| ${pad(cells[0]).join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`, ...cells.slice(1).map((r) => `| ${pad(r).join(' | ')} |`)].join('\n');
}

function blocks(nodes, depth = 0) {
  const out = [];
  let buf = [];
  const flush = () => { const t = inline(buf).trim(); if (t) out.push(t); buf = []; };
  for (const n of nodes) {
    if (typeof n === 'string' || !BLOCK.has(n.tag)) { buf.push(n); continue; }
    flush();
    switch (n.tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': out.push(`${'#'.repeat(Number(n.tag[1]))} ${inline(n.children).trim()}`); break;
      case 'ul': case 'ol': {
        let i = 1;
        const items = [];
        for (const li of n.children) {
          if (typeof li === 'string') { if (li.trim()) items.push(`${'  '.repeat(depth)}- ${collapse(li).trim()}`); continue; }
          const nested = li.children.filter((c) => typeof c !== 'string' && (c.tag === 'ul' || c.tag === 'ol'));
          const text = blocks(li.children.filter((c) => !nested.includes(c)), depth + 1).replace(/\n\n+/g, '\n').trim();
          items.push(`${'  '.repeat(depth)}${n.tag === 'ol' ? `${i++}.` : '-'} ${text.split('\n').join(`\n${'  '.repeat(depth + 1)}`)}`);
          for (const sub of nested) items.push(blocks([sub], depth + 1));
        }
        out.push(items.filter(Boolean).join('\n'));
        break;
      }
      case 'table': out.push(table(n)); break;
      case 'pre': out.push(`\`\`\`\n${inlineText(n).replace(/\n$/, '')}\n\`\`\``); break;
      case 'blockquote': out.push(blocks(n.children, depth).split('\n').map((l) => `> ${l}`).join('\n')); break;
      case 'hr': out.push('---'); break;
      default: { const t = blocks(n.children, depth); if (t) out.push(t); }
    }
  }
  flush();
  return out.filter((b) => b.trim()).join('\n\n');
}

/** Azure DevOps rich text (HTML) → readable Markdown. Small and forgiving; never throws. */
function htmlToMd(html) {
  if (!html) return '';
  if (!/<[a-z!/]/i.test(html)) return decode(String(html)).trim();
  try { return blocks(parse(html).children).replace(/\n{3,}/g, '\n\n').trim(); }
  catch { return decode(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
}

/** Markdown → HTML for work item fields and comments. Strips scripts, event handlers and javascript: links. */
function mdToHtml(md) {
  const html = marked.parse(String(md || ''), { gfm: true, breaks: true, async: false });
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed)[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"')
    .trim();
}

/** Line diff (LCS) for wiki page previews. Unchanged runs collapse to `context` lines around each change. */
function lineDiff(before, after, { context = 2, maxLines = 3000 } = {}) {
  const a = String(before || '').replace(/\r\n/g, '\n').split('\n');
  const b = String(after || '').replace(/\r\n/g, '\n').split('\n');
  if (a.length > maxLines || b.length > maxLines) return { tooLarge: true, added: b.length, removed: a.length, lines: [] };
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push({ t: ' ', s: a[i] }); i++; j++; }
    else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) { ops.push({ t: '-', s: a[i] }); i++; }
    else { ops.push({ t: '+', s: b[j] }); j++; }
  }
  const keep = ops.map((o, k) => o.t !== ' ' || ops.slice(Math.max(0, k - context), k + context + 1).some((x) => x.t !== ' '));
  const lines = [];
  let skipped = 0;
  ops.forEach((o, k) => { if (keep[k]) { if (skipped) { lines.push({ t: '…', s: `${skipped} unchanged line${skipped > 1 ? 's' : ''}` }); skipped = 0; } lines.push(o); } else skipped++; });
  if (skipped) lines.push({ t: '…', s: `${skipped} unchanged line${skipped > 1 ? 's' : ''}` });
  return { tooLarge: false, added: ops.filter((o) => o.t === '+').length, removed: ops.filter((o) => o.t === '-').length, lines };
}

module.exports = { htmlToMd, mdToHtml, lineDiff, decode };
