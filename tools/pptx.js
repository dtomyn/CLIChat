// Markdown deck outline → PowerPoint (.pptx), the same way md-export writes Word: marked's lexer tokens and a minimal
// OOXML package written with JSZip. No PowerPoint installation and no extra package needed.
//
// Deck outline convention:
//   # Deck title                  → the title slide (the first paragraph after it is the subtitle)
//   ## Slide title                → one slide: bullets (nested levels), numbered lists, paragraphs and tables
//   Notes: …                      → speaker notes: everything from a paragraph that starts with "Notes:" (also
//                                   "**Notes:**", "Speaker notes:" or "> Notes:") to the next heading
// A slide with more than 8 paragraphs (or a table with more rows than fit) continues on "<title> (cont.)" slides.
//
// With a template (.potx/.pptx) the template's slide master, theme, layouts, fonts, footer and logo are kept, its own
// slides are dropped, and the text goes into the placeholders of its "Title Slide" and "Title and Content" layouts.

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { marked } = require('marked');

const x = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
const unent = (s) => String(s ?? '').replace(/&(lt|gt|quot|#39|apos|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", amp: '&' }[e]));
const lex = (markdown) => marked.lexer(String(markdown || ''), { gfm: true });
const plain = (tokens = []) => tokens.map((t) => (t.type === 'br' ? '\n' : t.tokens?.length ? plain(t.tokens) : unent(t.text ?? ''))).join('');

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const PML = 'application/vnd.openxmlformats-officedocument.presentationml';
const CT = {
  presentation: `${PML}.presentation.main+xml`, template: `${PML}.template.main+xml`, slide: `${PML}.slide+xml`,
  layout: `${PML}.slideLayout+xml`, master: `${PML}.slideMaster+xml`, notesMaster: `${PML}.notesMaster+xml`, notesSlide: `${PML}.notesSlide+xml`,
  presProps: `${PML}.presProps+xml`, viewProps: `${PML}.viewProps+xml`, tableStyles: `${PML}.tableStyles+xml`,
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml', core: 'application/vnd.openxmlformats-package.core-properties+xml',
  app: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
};
const TABLE_STYLE = '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}'; // PowerPoint's built-in "Medium Style 2 - Accent 1": it takes the theme's accent colour
const MAX_PARAS = 8, MAX_LINES = 10, CHARS_PER_LINE = 90;
const EMU = 914400; // per inch
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// ------------------------------------------------------------------ Markdown → deck model

const NOTES_RE = /^\s*(?:speaker\s+)?notes\s*:\s*/i;
const isNotes = (t) => (t.type === 'paragraph' || t.type === 'text') && NOTES_RE.test(plain(t.tokens || [{ text: t.text }]).replace(/^[*_]+/, ''))
  || (t.type === 'blockquote' && t.tokens?.[0] && isNotes(t.tokens[0]));

/** Plain notes lines from block tokens (lists become "• item"). */
function notesLines(tokens, depth = 0) {
  const out = [];
  for (const t of tokens) {
    if (t.type === 'space' || t.type === 'hr') continue;
    if (t.type === 'list') {
      t.items.forEach((item, n) => {
        const lines = notesLines(item.tokens || [], depth + 1);
        const mark = t.ordered ? `${(Number(t.start) || 1) + n}.` : '•';
        if (lines.length) lines[0] = `${'  '.repeat(depth)}${mark} ${lines[0].trimStart()}`;
        out.push(...lines);
      });
    } else if (t.type === 'blockquote') out.push(...notesLines(t.tokens, depth));
    else if (t.type === 'table') {
      out.push(t.header.map((c) => plain(c.tokens)).join(' | '));
      for (const r of t.rows) out.push(r.map((c) => plain(c.tokens)).join(' | '));
    } else if (t.type === 'code') out.push(...t.text.split('\n'));
    else if (t.type === 'html') { const s = t.text.replace(/<[^>]+>/g, '').trim(); if (s) out.push(s); }
    else out.push(...(t.tokens ? plain(t.tokens) : unent(t.text || '')).split('\n').map((l) => `${depth ? '  '.repeat(depth - 1) : ''}${l}`));
  }
  return out;
}

/** Slide paragraphs from block tokens: { kind: 'p', level, bullet: 'bullet'|'number'|null, number, tokens|text, fmt } or { kind: 'table', t }. */
function items(tokens, level = 0, fmt = {}) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'heading': out.push({ kind: 'p', level, bullet: null, tokens: t.tokens, fmt: { ...fmt, b: true } }); break;
      case 'paragraph': case 'text': {
        const text = plain(t.tokens || [{ text: t.text }]);
        out.push({ kind: 'p', level, bullet: null, tokens: t.tokens || [{ type: 'text', text: t.text }], fmt: /^\s*sources?\s*:/i.test(text) ? { ...fmt, source: true } : fmt });
        break;
      }
      case 'list':
        t.items.forEach((item, n) => {
          let first = true;
          for (const c of item.tokens || []) {
            if (c.type === 'space') continue;
            if (c.type === 'list') { out.push(...items([c], Math.min(level + 1, 4), fmt)); continue; }
            if (first && (c.type === 'text' || c.type === 'paragraph')) {
              const box = item.task ? [{ type: 'text', text: item.checked ? '☑ ' : '☐ ' }] : [];
              out.push({ kind: 'p', level, bullet: t.ordered ? 'number' : 'bullet', number: (Number(t.start) || 1) + n, tokens: [...box, ...(c.tokens || [{ type: 'text', text: c.text }])], fmt });
              first = false;
            } else out.push(...items([c], level, fmt).map((p) => (p.kind === 'p' ? { ...p, bullet: null } : p)));
          }
          if (first) out.push({ kind: 'p', level, bullet: t.ordered ? 'number' : 'bullet', number: (Number(t.start) || 1) + n, tokens: [], fmt });
        });
        break;
      case 'table': out.push({ kind: 'table', t }); break;
      case 'code': out.push({ kind: 'p', level, bullet: null, tokens: [{ type: 'text', text: t.text }], fmt: { ...fmt, code: true }, lines: t.text.split('\n').length }); break;
      case 'blockquote': out.push(...items(t.tokens, level, { ...fmt, i: true })); break;
      case 'html': { const s = t.text.replace(/<[^>]+>/g, '').trim(); if (s) out.push({ kind: 'p', level, bullet: null, tokens: [{ type: 'text', text: s }], fmt }); break; }
      default: break;
    }
  }
  return out;
}

/** Split one section's tokens into slide content and speaker notes (from the "Notes:" marker to the end). */
function section(tokens) {
  const i = tokens.findIndex(isNotes);
  if (i < 0) return { content: items(tokens), notes: [] };
  const marker = tokens[i];
  const rest = marker.type === 'blockquote' ? [...marker.tokens, ...tokens.slice(i + 1)] : [marker, ...tokens.slice(i + 1)];
  const lines = notesLines(rest);
  lines[0] = lines[0].replace(/^[*_]*\s*(?:speaker\s+)?notes\s*:\s*[*_]*\s*/i, '').trim();
  return { content: items(tokens.slice(0, i)), notes: lines.filter((l, n) => n || l) };
}

/** The deck: { title, subtitle (plain), intro (items), introNotes, slides: [{ title tokens, content, notes }] }. */
function parseDeck(markdown, { title } = {}) {
  const tokens = lex(markdown);
  const deck = { title: title || '', titleTokens: null, subtitle: '', slides: [] };
  let cur = null;
  const intro = [];
  for (const t of tokens) {
    if (t.type === 'heading' && t.depth === 1 && !deck.titleTokens && !cur) { deck.titleTokens = t.tokens; deck.title = plain(t.tokens).trim() || deck.title; continue; }
    if (t.type === 'heading' && t.depth <= 2) { cur = { titleTokens: t.tokens, tokens: [] }; deck.slides.push(cur); continue; }
    (cur ? cur.tokens : intro).push(t);
  }
  const head = section(intro);
  const firstPara = head.content.findIndex((p) => p.kind === 'p' && !p.bullet);
  if (firstPara >= 0 && firstPara === head.content.findIndex((p) => p.kind === 'p')) {
    deck.subtitle = plain(head.content[firstPara].tokens).trim();
    head.content.splice(firstPara, 1);
  }
  deck.introNotes = head.notes;
  deck.intro = head.content;
  deck.slides = deck.slides.map((s) => ({ titleTokens: s.titleTokens, ...section(s.tokens) }));
  if (deck.intro.length) deck.slides.unshift({ titleTokens: [{ type: 'text', text: deck.title || 'Overview' }], content: deck.intro, notes: [] });
  return deck;
}

const weight = (p) => p.lines || Math.max(1, Math.ceil(plain(p.tokens).length / CHARS_PER_LINE));

/** Break a slide's content into pages: ≤ MAX_PARAS paragraphs / MAX_LINES lines each, keeping a bullet with its sub-bullets, and tables with at most `rowsPerPage` rows (header repeated). A short lead-in (≤ 3 paragraphs) shares the slide with the table after it. */
function paginate(content, rowsPerPage) {
  const pages = [];
  let page = { paras: [], table: null };
  const flush = () => { if (page.paras.length || page.table) pages.push(page); page = { paras: [], table: null }; };
  // group a top-level paragraph with the deeper ones that follow it
  const groups = [];
  for (const it of content) {
    if (it.kind === 'table') { groups.push(it); continue; }
    const last = groups[groups.length - 1];
    if (last && !last.kind && it.level > 0 && last[0].level < it.level) last.push(it); else groups.push([it]);
  }
  const lines = () => page.paras.reduce((s, p) => s + weight(p), 0);
  for (const g of groups) {
    if (g.kind === 'table') {
      const rows = g.t.rows.length ? g.t.rows : [[]];
      for (let i = 0; i < rows.length; i += rowsPerPage) {
        if (page.table || page.paras.length > 3 || lines() > 4) flush();
        page.table = { header: g.t.header, align: g.t.align, rows: g.t.rows.slice(i, i + rowsPerPage) };
        flush();
      }
      continue;
    }
    const gl = g.reduce((s, p) => s + weight(p), 0);
    if (page.paras.length && (page.paras.length + g.length > MAX_PARAS || lines() + gl > MAX_LINES)) flush();
    for (const p of g) {
      if (page.paras.length && (page.paras.length >= MAX_PARAS || lines() + weight(p) > MAX_LINES)) flush();
      page.paras.push(p);
    }
  }
  flush();
  return pages.length ? pages : [{ paras: [], table: null }];
}

// ------------------------------------------------------------------ DrawingML text

function textWriter(links) {
  const linkId = (href) => { let i = links.indexOf(href); if (i < 0) i = links.push(href) - 1; return `rIdLink${i + 1}`; };
  const run = (text, fmt = {}) => String(text).split('\n').map((line, i) => {
    const attrs = `lang="en-US"${fmt.sz ? ` sz="${fmt.sz}"` : ''}${fmt.b ? ' b="1"' : ''}${fmt.i ? ' i="1"' : ''}${fmt.strike ? ' strike="sngStrike"' : ''}${fmt.link ? ' u="sng"' : ''} dirty="0"`;
    const inner = (fmt.code ? '<a:latin typeface="Consolas"/><a:cs typeface="Consolas"/>' : '') + (fmt.href ? `<a:hlinkClick r:id="${linkId(fmt.href)}"/>` : '');
    return `${i ? '<a:br/>' : ''}<a:r><a:rPr ${attrs}${inner ? `>${inner}</a:rPr>` : '/>'}<a:t>${x(line)}</a:t></a:r>`;
  }).join('');
  function inline(tokens = [], fmt = {}) {
    let out = '';
    for (const t of tokens) {
      if (t.type === 'strong') out += inline(t.tokens, { ...fmt, b: true });
      else if (t.type === 'em') out += inline(t.tokens, { ...fmt, i: true });
      else if (t.type === 'del') out += inline(t.tokens, { ...fmt, strike: true });
      else if (t.type === 'codespan') out += run(unent(t.text), { ...fmt, code: true });
      else if (t.type === 'br') out += '<a:br/>';
      else if (t.type === 'link') {
        const ext = /^(https?|mailto):/i.test(t.href);
        out += t.tokens?.length ? inline(t.tokens, { ...fmt, link: ext, href: ext ? t.href : undefined }) : run(t.href, { ...fmt, link: ext, href: ext ? t.href : undefined });
      } else if (t.type === 'image') out += run(`[${t.text || 'image'}]`, fmt);
      else if (t.type === 'html') out += run(t.text.replace(/<[^>]+>/g, ''), fmt);
      else if (t.tokens?.length) out += inline(t.tokens, fmt);
      else out += run(unent(t.text ?? t.raw ?? ''), fmt);
    }
    return out;
  }
  /** One a:p for a slide paragraph. Bullets come from the master's body style; other paragraphs switch the bullet off. */
  const para = (p) => {
    const lvl = Math.min(p.level || 0, 4);
    const fmt = { ...p.fmt, ...(p.fmt?.source ? { i: true, sz: 1400 } : {}), ...(p.fmt?.code ? { sz: 1400 } : {}) };
    let pPr;
    if (p.bullet === 'number') pPr = `<a:pPr marL="${457200 + lvl * 457200}" lvl="${lvl}" indent="-457200"><a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod" startAt="${p.number || 1}"/></a:pPr>`;
    else if (p.bullet === 'bullet') pPr = lvl ? `<a:pPr lvl="${lvl}"/>` : '';
    else pPr = `<a:pPr marL="${lvl * 457200}" lvl="${lvl}" indent="0"><a:buNone/></a:pPr>`;
    return `<a:p>${pPr}${inline(p.tokens, fmt)}</a:p>`;
  };
  return { run, inline, para };
}

const textPara = (text, fmt = {}) => `<a:p>${text ? `<a:r><a:rPr lang="en-US"${fmt.i ? ' i="1"' : ''}${fmt.sz ? ` sz="${fmt.sz}"` : ''} dirty="0"/><a:t>${x(text)}</a:t></a:r>` : '<a:endParaRPr lang="en-US" dirty="0"/>'}</a:p>`;

// ------------------------------------------------------------------ built-in master, layouts and theme
// Also used by scripts/make-deck-template.js to write the sample program template, with its own colours, font,
// footer and logo.

const DEFAULT_BRAND = {
  name: 'Lumen', colors: { dk1: '000000', lt1: 'FFFFFF', dk2: '2B2350', lt2: 'EEEAFB', accent1: '4A36C4', accent2: '0F7B6C', accent3: 'C2185B', accent4: 'E09B1A', accent5: '2E75B6', accent6: '6B6B6B', hlink: '0563C1', folHlink: '7F4FA0' },
  major: 'Calibri Light', minor: 'Calibri', footer: '', masterShapes: '', titleShapes: '',
};

function themeXml(brand = DEFAULT_BRAND) {
  const c = { ...DEFAULT_BRAND.colors, ...brand.colors };
  const clr = (k) => `<a:${k}><a:srgbClr val="${c[k]}"/></a:${k}>`;
  const ln = (w) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  const font = (tf) => `<a:latin typeface="${x(tf)}"/><a:ea typeface=""/><a:cs typeface=""/>`;
  const fills = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:shade val="80000"/></a:schemeClr></a:solidFill>';
  return `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${x(brand.name || 'Lumen')}"><a:themeElements>`
    + `<a:clrScheme name="${x(brand.name || 'Lumen')}">${['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(clr).join('')}</a:clrScheme>`
    + `<a:fontScheme name="${x(brand.name || 'Lumen')}"><a:majorFont>${font(brand.major || DEFAULT_BRAND.major)}</a:majorFont><a:minorFont>${font(brand.minor || DEFAULT_BRAND.minor)}</a:minorFont></a:fontScheme>`
    + `<a:fmtScheme name="${x(brand.name || 'Lumen')}"><a:fillStyleLst>${fills}</a:fillStyleLst><a:lnStyleLst>${ln(6350)}${ln(12700)}${ln(19050)}</a:lnStyleLst>`
    + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
    + `<a:bgFillStyleLst>${fills}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const xfrm = (r) => `<a:xfrm><a:off x="${Math.round(r.x)}" y="${Math.round(r.y)}"/><a:ext cx="${Math.round(r.cx)}" cy="${Math.round(r.cy)}"/></a:xfrm>`;
const CLR_MAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';

/** A placeholder shape for a master or layout. ph: attributes string; rect optional; body: inner txBody paragraphs. */
function phShape(id, name, ph, { rect, bodyPr = '<a:bodyPr/>', lstStyle = '<a:lstStyle/>', text = '' } = {}) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${x(name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${ph}/></p:nvPr></p:nvSpPr>`
    + `<p:spPr>${rect ? `${xfrm(rect)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` : ''}</p:spPr>`
    + `<p:txBody>${bodyPr}${lstStyle}${text || '<a:p><a:endParaRPr lang="en-US"/></a:p>'}</p:txBody></p:sp>`;
}

function geometry(cx, cy) {
  const m = cx * 0.0688; // 0.69" side margins on a 13.33" slide
  return {
    title: { x: m, y: cy * 0.053, cx: cx - 2 * m, cy: cy * 0.159 },
    body: { x: m, y: cy * 0.266, cx: cx - 2 * m, cy: cy * 0.634 },
    ctrTitle: { x: cx * 0.125, y: cy * 0.164, cx: cx * 0.75, cy: cy * 0.348 },
    subTitle: { x: cx * 0.125, y: cy * 0.525, cx: cx * 0.75, cy: cy * 0.241 },
    ftr: { x: cx * 0.3375, y: cy * 0.927, cx: cx * 0.325, cy: cy * 0.053 },
    sldNum: { x: cx * 0.8625, y: cy * 0.927, cx: cx * 0.1, cy: cy * 0.053 },
  };
}

function masterXml(brand, cx, cy, layoutRels) {
  const g = geometry(cx, cy);
  const lvl = (n, sz, ch) => `<a:lvl${n}pPr marL="${228600 + (n - 1) * 457200}" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="${n === 1 ? 1000 : 500}"/></a:spcBef><a:buClr><a:schemeClr val="accent1"/></a:buClr><a:buFont typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/><a:buChar char="${ch}"/>`
    + `<a:defRPr sz="${sz}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${n}pPr>`;
  const ftrText = brand.footer ? textPara(brand.footer) : '';
  return `${XML}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}`
    + (brand.masterShapes || '')
    + phShape(2, 'Title Placeholder 1', 'type="title"', { rect: g.title, bodyPr: '<a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="b"><a:normAutofit/></a:bodyPr>', text: '<a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title style</a:t></a:r></a:p>' })
    + phShape(3, 'Text Placeholder 2', 'type="body" idx="1"', { rect: g.body, bodyPr: '<a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"><a:normAutofit/></a:bodyPr>', text: '<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:rPr lang="en-US"/><a:t>Second level</a:t></a:r></a:p>' })
    + phShape(4, 'Footer Placeholder 3', 'type="ftr" sz="quarter" idx="3"', { rect: g.ftr, bodyPr: '<a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/>', lstStyle: '<a:lstStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="1100"><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>', text: ftrText })
    + phShape(5, 'Slide Number Placeholder 4', 'type="sldNum" sz="quarter" idx="4"', { rect: g.sldNum, bodyPr: '<a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/>', lstStyle: '<a:lstStyle><a:lvl1pPr algn="r"><a:defRPr sz="1100"><a:solidFill><a:schemeClr val="tx1"><a:tint val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>', text: '<a:p><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p>' })
    + `</p:spTree></p:cSld><p:clrMap ${CLR_MAP}/>`
    + `<p:sldLayoutIdLst>${layoutRels.map((rid, i) => `<p:sldLayoutId id="${2147483649 + i}" r:id="${rid}"/>`).join('')}</p:sldLayoutIdLst>`
    + '<p:txStyles><p:titleStyle><a:lvl1pPr algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/>'
    + '<a:defRPr sz="3600" kern="1200"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr></p:titleStyle>'
    + `<p:bodyStyle>${lvl(1, 2400, '•')}${lvl(2, 2000, '–')}${lvl(3, 1800, '•')}${lvl(4, 1600, '–')}${lvl(5, 1600, '•')}</p:bodyStyle>`
    + '<p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:otherStyle>'
    + '</p:txStyles></p:sldMaster>';
}

/** Built-in layouts: Title Slide, Title and Content, Title Only. */
function layoutXmls(brand, cx, cy) {
  const g = geometry(cx, cy);
  const ftr = brand.footer ? phShape(10, 'Footer Placeholder', 'type="ftr" sz="quarter" idx="11"', { text: textPara(brand.footer) }) : '';
  const num = phShape(11, 'Slide Number Placeholder', 'type="sldNum" sz="quarter" idx="12"', { text: '<a:p><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p>' });
  const layout = (type, name, shapes, extra = '') => `${XML}<p:sldLayout ${NS} type="${type}" preserve="1"><p:cSld name="${x(name)}"><p:spTree>${GRP}${extra}${shapes}${ftr}${num}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const title = (ph, rect, lst = '') => phShape(2, 'Title 1', ph, { rect, bodyPr: rect === g.ctrTitle ? '<a:bodyPr anchor="b"><a:normAutofit/></a:bodyPr>' : '<a:bodyPr/>', lstStyle: lst ? `<a:lstStyle>${lst}</a:lstStyle>` : '<a:lstStyle/>', text: '<a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title style</a:t></a:r></a:p>' });
  return [
    layout('title', 'Title Slide', title('type="ctrTitle"', g.ctrTitle, '<a:lvl1pPr algn="ctr"><a:defRPr sz="4800"/></a:lvl1pPr>')
      + phShape(3, 'Subtitle 2', 'type="subTitle" idx="1"', { rect: g.subTitle, bodyPr: '<a:bodyPr><a:normAutofit/></a:bodyPr>', lstStyle: '<a:lstStyle><a:lvl1pPr marL="0" indent="0" algn="ctr"><a:buNone/><a:defRPr sz="2200"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>', text: '<a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master subtitle style</a:t></a:r></a:p>' }), brand.titleShapes || ''),
    layout('obj', 'Title and Content', title('type="title"', null) + phShape(3, 'Content Placeholder 2', 'idx="1"', { text: '<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p>' })),
    layout('titleOnly', 'Title Only', title('type="title"', null)),
  ];
}

function notesMasterXml() {
  return `${XML}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}`
    + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr>'
    + `<p:spPr>${xfrm({ x: 685800, y: 1143000, cx: 5486400, cy: 3086100 })}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>`
    + phShape(3, 'Notes Placeholder 2', 'type="body" sz="quarter" idx="1"', { rect: { x: 685800, y: 4400550, cx: 5486400, cy: 3600450 }, bodyPr: '<a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/>', text: '<a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p>' })
    + `</p:spTree></p:cSld><p:clrMap ${CLR_MAP}/>`
    + '<p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>';
}

const relsXml = (rels) => `${XML}<Relationships xmlns="${PKG_REL}">${rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type.startsWith('http') ? r.type : `${REL}/${r.type}`}" Target="${x(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;
const DEFAULT_TEXT_STYLE = '<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle>';

function coreXml(title, creator = 'Lumen', when = nowIso()) {
  return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${x(title || '')}</dc:title><dc:creator>${x(creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified></cp:coreProperties>`;
}
const appXml = (slides, notes) => `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Lumen</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slides}</Slides><Notes>${notes}</Notes></Properties>`;

/**
 * A complete package with a master, three layouts, a theme and no slides (the built-in look, or a branded template for
 * scripts/make-deck-template.js). brand: { name, colors, major, minor, footer, masterShapes, titleShapes }.
 * Returns the JSZip; slides are added by writeSlides (or by the template script).
 */
function basePackage(brand = DEFAULT_BRAND, { cx = 12192000, cy = 6858000, template = false, title = '', creator = 'Lumen', when } = {}) {
  brand = { ...DEFAULT_BRAND, ...brand, colors: { ...DEFAULT_BRAND.colors, ...(brand.colors || {}) } };
  const zip = new JSZip();
  const layouts = layoutXmls(brand, cx, cy);
  zip.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + `<Override PartName="/ppt/presentation.xml" ContentType="${template ? CT.template : CT.presentation}"/>`
    + `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT.master}"/>`
    + layouts.map((_, i) => `<Override PartName="/ppt/slideLayouts/slideLayout${i + 1}.xml" ContentType="${CT.layout}"/>`).join('')
    + `<Override PartName="/ppt/theme/theme1.xml" ContentType="${CT.theme}"/>`
    + `<Override PartName="/ppt/presProps.xml" ContentType="${CT.presProps}"/><Override PartName="/ppt/viewProps.xml" ContentType="${CT.viewProps}"/><Override PartName="/ppt/tableStyles.xml" ContentType="${CT.tableStyles}"/>`
    + `<Override PartName="/docProps/core.xml" ContentType="${CT.core}"/><Override PartName="/docProps/app.xml" ContentType="${CT.app}"/></Types>`);
  zip.file('_rels/.rels', relsXml([{ id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' }, { id: 'rId2', type: `${PKG_REL}/metadata/core-properties`, target: 'docProps/core.xml' }, { id: 'rId3', type: 'extended-properties', target: 'docProps/app.xml' }]));
  zip.file('ppt/presentation.xml', `${XML}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>`
    + `<p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/>${DEFAULT_TEXT_STYLE}</p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', relsXml([{ id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' }, { id: 'rId2', type: 'theme', target: 'theme/theme1.xml' },
    { id: 'rId3', type: 'presProps', target: 'presProps.xml' }, { id: 'rId4', type: 'viewProps', target: 'viewProps.xml' }, { id: 'rId5', type: 'tableStyles', target: 'tableStyles.xml' }]));
  zip.file('ppt/slideMasters/slideMaster1.xml', masterXml(brand, cx, cy, layouts.map((_, i) => `rId${i + 1}`)));
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', relsXml([...layouts.map((_, i) => ({ id: `rId${i + 1}`, type: 'slideLayout', target: `../slideLayouts/slideLayout${i + 1}.xml` })), { id: `rId${layouts.length + 1}`, type: 'theme', target: '../theme/theme1.xml' }]));
  layouts.forEach((l, i) => {
    zip.file(`ppt/slideLayouts/slideLayout${i + 1}.xml`, l);
    zip.file(`ppt/slideLayouts/_rels/slideLayout${i + 1}.xml.rels`, relsXml([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]));
  });
  zip.file('ppt/theme/theme1.xml', themeXml(brand));
  zip.file('ppt/presProps.xml', `${XML}<p:presentationPr ${NS}/>`);
  zip.file('ppt/viewProps.xml', `${XML}<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`);
  zip.file('ppt/tableStyles.xml', `${XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="${TABLE_STYLE}"/>`);
  zip.file('docProps/core.xml', coreXml(title, creator, when));
  zip.file('docProps/app.xml', appXml(0, 0));
  return zip;
}

// ------------------------------------------------------------------ reading a package (template or built-in)

const attr = (tag, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag); return m ? unent(m[1]) : undefined; };
const parseRels = (xml) => [...String(xml || '').matchAll(/<Relationship\b[^>]*\/?>/g)].map((m) => ({ id: attr(m[0], 'Id'), type: attr(m[0], 'Type'), target: attr(m[0], 'Target'), external: attr(m[0], 'TargetMode') === 'External' }));
const relsPath = (part) => `${path.posix.dirname(part)}/_rels/${path.posix.basename(part)}.rels`;
const resolve = (from, target) => (target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(from), target)));

/** The placeholders of a layout or master: [{ type, raw, idx, rect, xml }]. A placeholder without a type is "obj", as in the spec. */
function placeholders(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
    const ph = /<p:ph\b[^>]*\/?>/.exec(m[1]);
    if (!ph) continue;
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(m[1]);
    const raw = attr(ph[0], 'type');
    out.push({ type: raw || 'obj', raw, idx: attr(ph[0], 'idx'), rect: off ? { x: +off[1], y: +off[2], cx: +off[3], cy: +off[4] } : null, xml: m[0] });
  }
  return out;
}

async function readPackage(zip) {
  const read = async (n) => (zip.file(n) ? zip.file(n).async('string') : null);
  const presRels = parseRels(await read('ppt/_rels/presentation.xml.rels'));
  const pres = await read('ppt/presentation.xml');
  const masterRel = presRels.find((r) => r.type.endsWith('/slideMaster'));
  if (!masterRel) throw new Error('it has no slide master');
  const masterPart = resolve('ppt/presentation.xml', masterRel.target);
  const masterXmlText = await read(masterPart);
  const layouts = [];
  for (const r of parseRels(await read(relsPath(masterPart))).filter((r) => r.type.endsWith('/slideLayout'))) {
    const part = resolve(masterPart, r.target);
    const xml = await read(part);
    if (!xml) continue;
    layouts.push({ part, xml, type: attr(/<p:sldLayout\b[^>]*>/.exec(xml)?.[0] || '', 'type') || 'cust', name: attr(/<p:cSld\b[^>]*>/.exec(xml)?.[0] || '', 'name') || '', phs: placeholders(xml) });
  }
  if (!layouts.length) throw new Error('its slide master has no layouts');
  const sz = /<p:sldSz\b[^>]*\/>/.exec(pres || '');
  return { read, pres, presRels, masterPart, masterPhs: placeholders(masterXmlText), layouts, cx: Number(attr(sz?.[0] || '', 'cx')) || 12192000, cy: Number(attr(sz?.[0] || '', 'cy')) || 6858000 };
}

const isTitlePh = (p) => ['title', 'ctrTitle'].includes(p.type);
const isBodyPh = (p) => ['body', 'obj'].includes(p.type) && p.idx !== undefined;

/** Pick the "Title Slide" and "Title and Content" layouts by type, then by name, then by their placeholders. */
function pickLayouts(layouts) {
  const by = (pred) => layouts.find(pred);
  const content = by((l) => l.type === 'obj' && l.phs.some(isBodyPh)) || by((l) => /^title and content$/i.test(l.name)) || by((l) => l.type === 'tx')
    || by((l) => l.phs.some(isTitlePh) && l.phs.some(isBodyPh)) || by((l) => l.phs.some(isTitlePh)) || layouts[0];
  const title = by((l) => l.type === 'title') || by((l) => /^title slide$/i.test(l.name)) || by((l) => l.phs.some((p) => p.type === 'ctrTitle')) || content;
  return { title, content };
}

// ------------------------------------------------------------------ slides

function slideXml(shapes) {
  return `${XML}<p:sld ${NS}><p:cSld><p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

/** A slide shape that fills a layout placeholder (geometry, fonts and bullets come from the layout). */
function phSp(id, name, ph, paras, { rect, autofit = false } = {}) {
  const phAttrs = `${ph.raw ? `type="${ph.raw}"` : ''}${ph.idx !== undefined ? ` idx="${ph.idx}"` : ''}`.trim() || 'type="body"';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${x(name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${phAttrs}/></p:nvPr></p:nvSpPr>`
    + `<p:spPr>${rect ? xfrm(rect) : ''}</p:spPr><p:txBody><a:bodyPr>${autofit ? '<a:normAutofit/>' : ''}</a:bodyPr><a:lstStyle/>${paras || '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'}</p:txBody></p:sp>`;
}

/** Copy the layout's footer and slide number placeholders onto the slide, so the template's footer shows. */
function footerShapes(layout, nextId) {
  let out = '';
  for (const p of layout.phs.filter((q) => ['ftr', 'sldNum'].includes(q.type))) {
    const body = /<p:txBody>[\s\S]*<\/p:txBody>/.exec(p.xml);
    if (!body || (p.type === 'ftr' && !/<a:t>[^<]+<\/a:t>/.test(body[0]))) continue;
    out += `<p:sp><p:nvSpPr><p:cNvPr id="${nextId()}" name="${p.type === 'ftr' ? 'Footer' : 'Slide Number'}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${p.type}"${/sz="quarter"/.test(p.xml) ? ' sz="quarter"' : ''}${p.idx !== undefined ? ` idx="${p.idx}"` : ''}/></p:nvPr></p:nvSpPr><p:spPr/>${body[0]}</p:sp>`;
  }
  return out;
}

function tableFrame(id, table, rect, inline) {
  const cols = Math.max(1, table.header.length);
  const w = Math.floor(rect.cx / cols);
  const sz = cols > 4 ? 1200 : 1400;
  const rowH = 370840;
  const algn = (a) => ({ center: 'ctr', right: 'r' }[a]);
  const cell = (c, i) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>${algn(table.align[i]) ? `<a:pPr algn="${algn(table.align[i])}"/>` : ''}${inline(c?.tokens || [], { sz })}<a:endParaRPr lang="en-US" sz="${sz}" dirty="0"/></a:p></a:txBody><a:tcPr/></a:tc>`;
  const row = (cells) => `<a:tr h="${rowH}">${Array.from({ length: cols }, (_, i) => cell(cells[i], i)).join('')}</a:tr>`;
  const rows = [table.header, ...table.rows];
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id - 1}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>`
    + `${xfrm({ ...rect, cx: w * cols, cy: rowH * rows.length }).replace(/a:xfrm/g, 'p:xfrm')}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">`
    + `<a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>${TABLE_STYLE}</a:tableStyleId></a:tblPr><a:tblGrid>${Array.from({ length: cols }, () => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>`
    + rows.map(row).join('') + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
}

function notesXml(lines) {
  return `${XML}<p:notes ${NS}><p:cSld><p:spTree>${GRP}`
    + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
    + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${lines.map((l) => textPara(l)).join('')}</p:txBody></p:sp>`
    + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>';
}

/** Turn the deck model into slide specs: [{ layout: 'title'|'content', xml (shapes), links, notes }]. */
function buildSlides(deck, pkg, { label }) {
  const { title: tl, content: cl } = pickLayouts(pkg.layouts);
  const findRect = (layout, pred) => layout.phs.find(pred)?.rect || pkg.masterPhs.find(pred)?.rect;
  const g = geometry(pkg.cx, pkg.cy);
  const bodyRect = findRect(cl, isBodyPh) || findRect(cl, (p) => p.type === 'body') || g.body;
  const rowsPerPage = Math.max(3, Math.min(10, Math.floor(bodyRect.cy / 370840) - 1));
  const slides = [];

  // Title slide
  {
    const links = [];
    const w = textWriter(links);
    let id = 1; const nextId = () => ++id;
    const titlePh = tl.phs.find(isTitlePh) || { type: 'title', raw: 'title' };
    const subPh = tl.phs.find((p) => p.type === 'subTitle') || tl.phs.find(isBodyPh);
    const sub = [deck.subtitle && textPara(deck.subtitle), label && textPara(label, { i: true })].filter(Boolean).join('');
    let shapes = phSp(nextId(), 'Title 1', titlePh, `<a:p>${deck.titleTokens && deck.title === plain(deck.titleTokens).trim() ? w.inline(deck.titleTokens) : w.run(deck.title || 'Presentation')}</a:p>`);
    if (sub && subPh) shapes += phSp(nextId(), 'Subtitle 2', subPh, sub);
    shapes += footerShapes(tl, nextId);
    slides.push({ layout: tl, shapes, links, notes: deck.introNotes || [] });
  }

  for (const s of deck.slides) {
    const pages = paginate(s.content, rowsPerPage);
    pages.forEach((page, n) => {
      const links = [];
      const w = textWriter(links);
      let id = 1; const nextId = () => ++id;
      const titlePh = cl.phs.find(isTitlePh) || { type: 'title', raw: 'title' };
      const bodyPh = cl.phs.find(isBodyPh) || { type: 'body', raw: 'body', idx: '1', missing: true };
      let shapes = phSp(nextId(), 'Title 1', titlePh, `<a:p>${w.inline(s.titleTokens)}${n ? w.run(' (cont.)') : ''}</a:p>`);
      const paras = page.paras.map(w.para).join('');
      if (page.table) {
        let tableRect = bodyRect;
        if (paras) {
          const lines = page.paras.reduce((t, p) => t + weight(p), 0);
          const h = Math.min(bodyRect.cy * 0.4, (lines * 0.45 + 0.2) * EMU);
          shapes += phSp(nextId(), 'Content Placeholder 2', bodyPh, paras, { rect: { ...bodyRect, cy: h }, autofit: true });
          tableRect = { ...bodyRect, y: bodyRect.y + h + 0.1 * EMU, cy: bodyRect.cy - h - 0.1 * EMU };
        }
        shapes += tableFrame(nextId(), page.table, tableRect, w.inline);
      } else if (paras) shapes += phSp(nextId(), 'Content Placeholder 2', bodyPh, paras, { autofit: true, rect: bodyPh.missing ? bodyRect : undefined });
      shapes += footerShapes(cl, nextId);
      slides.push({ layout: cl, shapes, links, notes: n === 0 ? s.notes : [] });
    });
  }
  return slides;
}

// ------------------------------------------------------------------ template handling

/** Open a .potx/.pptx template (path or Buffer), or explain why it can't be used. */
async function openTemplate(template) {
  if (!template) return { warning: '' };
  const label = typeof template === 'string' ? path.basename(template) : 'template';
  let buf = template;
  if (typeof template === 'string') {
    if (!fs.existsSync(template)) return { warning: `The PowerPoint template "${label}" was not found, so Lumen's built-in slide design was used.` };
    if (!/\.(pptx|potx)$/i.test(template)) return { warning: `"${label}" is not a .potx or .pptx template (macro-enabled templates are not used), so Lumen's built-in slide design was used.` };
    buf = fs.readFileSync(template);
  }
  try {
    const zip = await JSZip.loadAsync(buf);
    const types = zip.file('[Content_Types].xml') ? await zip.file('[Content_Types].xml').async('string') : '';
    if (!zip.file('ppt/presentation.xml') || !types || /macroEnabled/i.test(types)) throw new Error('not a PowerPoint presentation or template');
    const pkg = await readPackage(zip);
    return { zip, pkg };
  } catch (e) {
    return { warning: `The PowerPoint template "${label}" could not be read (${e.message}), so Lumen's built-in slide design was used.` };
  }
}

/** Remove the template's own slides (and their notes pages) from the package. */
async function dropSlides(zip, pkg, types) {
  let rels = await pkg.read('ppt/_rels/presentation.xml.rels');
  for (const r of pkg.presRels.filter((q) => q.type.endsWith('/slide'))) {
    const part = resolve('ppt/presentation.xml', r.target);
    for (const n of parseRels(await pkg.read(relsPath(part))).filter((q) => q.type.endsWith('/notesSlide'))) {
      const np = resolve(part, n.target);
      zip.remove(np); zip.remove(relsPath(np));
      types = types.replace(new RegExp(`<Override PartName="/${np.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), '');
    }
    zip.remove(part); zip.remove(relsPath(part));
    types = types.replace(new RegExp(`<Override PartName="/${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), '');
    rels = rels.replace(new RegExp(`<Relationship\\b[^>]*\\bId="${r.id}"[^>]*/>`), '');
  }
  // Any other leftover slide or notes parts not reachable any more (named slideN.xml) would clash with ours.
  for (const n of Object.keys(zip.files).filter((f) => /^ppt\/(slides|notesSlides)\/(_rels\/)?[^/]+$/.test(f))) zip.remove(n);
  types = types.replace(/<Override PartName="\/ppt\/(slides|notesSlides)\/[^"]*"[^>]*\/>/g, '');
  return { types, rels };
}

// ------------------------------------------------------------------ public

/**
 * Markdown deck outline → .pptx. options: { title (when the outline has no "# Title"), template (.potx/.pptx path or Buffer), label (a line under the
 * subtitle on the title slide, e.g. "Draft (AI) for review"), properties (custom document properties) }.
 * Returns { buffer, template: true|false, warning, slides, notes }.
 */
async function toPptx(markdown, { title, template, label, properties } = {}) {
  const t = await openTemplate(template);
  const zip = t.zip || basePackage(DEFAULT_BRAND, { title });
  const pkg = t.pkg || await readPackage(zip);
  const deck = parseDeck(markdown, { title });
  const slides = buildSlides(deck, pkg, { label });
  const read = pkg.read;

  let types = await read('[Content_Types].xml');
  let presRels = await read('ppt/_rels/presentation.xml.rels');
  let pres = pkg.pres;
  if (t.zip) ({ types, rels: presRels } = await dropSlides(zip, pkg, types));
  const addType = (part, ct) => { if (!types.includes(`PartName="${part}"`)) types = types.replace('</Types>', `<Override PartName="${part}" ContentType="${ct}"/></Types>`); };

  // Notes master: the template's own, else the built-in one with its own theme.
  const hasNotes = slides.some((s) => s.notes.length);
  let notesMasterPart = null;
  if (hasNotes) {
    const existing = parseRels(presRels).find((r) => r.type.endsWith('/notesMaster'));
    if (existing) notesMasterPart = resolve('ppt/presentation.xml', existing.target);
    else {
      let n = 1; while (zip.file(`ppt/theme/theme${n}.xml`)) n++;
      notesMasterPart = 'ppt/notesMasters/notesMaster1.xml';
      zip.file(notesMasterPart, notesMasterXml());
      zip.file(relsPath(notesMasterPart), relsXml([{ id: 'rId1', type: 'theme', target: `../theme/theme${n}.xml` }]));
      zip.file(`ppt/theme/theme${n}.xml`, themeXml(DEFAULT_BRAND));
      addType('/' + notesMasterPart, CT.notesMaster);
      addType(`/ppt/theme/theme${n}.xml`, CT.theme);
      presRels = presRels.replace('</Relationships>', `<Relationship Id="rIdLumenNotesMaster" Type="${REL}/notesMaster" Target="notesMasters/notesMaster1.xml"/></Relationships>`);
      const lst = '<p:notesMasterIdLst><p:notesMasterId r:id="rIdLumenNotesMaster"/></p:notesMasterIdLst>';
      pres = pres.replace(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>|<p:notesMasterIdLst\/>/, '').replace('</p:sldMasterIdLst>', `</p:sldMasterIdLst>${lst}`);
    }
  }

  const ids = [];
  slides.forEach((s, i) => {
    const n = i + 1;
    const part = `ppt/slides/slide${n}.xml`;
    zip.file(part, slideXml(s.shapes));
    const rels = [{ id: 'rId1', type: 'slideLayout', target: path.posix.relative('ppt/slides', s.layout.part) }];
    if (s.notes.length) {
      const np = `ppt/notesSlides/notesSlide${n}.xml`;
      zip.file(np, notesXml(s.notes));
      zip.file(relsPath(np), relsXml([{ id: 'rId1', type: 'notesMaster', target: path.posix.relative('ppt/notesSlides', notesMasterPart) }, { id: 'rId2', type: 'slide', target: `../slides/slide${n}.xml` }]));
      addType(`/${np}`, CT.notesSlide);
      rels.push({ id: 'rId2', type: 'notesSlide', target: `../notesSlides/notesSlide${n}.xml` });
    }
    s.links.forEach((href, k) => rels.push({ id: `rIdLink${k + 1}`, type: 'hyperlink', target: href, external: true }));
    zip.file(relsPath(part), relsXml(rels));
    addType(`/${part}`, CT.slide);
    presRels = presRels.replace('</Relationships>', `<Relationship Id="rIdLumenSlide${n}" Type="${REL}/slide" Target="slides/slide${n}.xml"/></Relationships>`);
    ids.push(`<p:sldId id="${255 + n}" r:id="rIdLumenSlide${n}"/>`);
  });

  // presentation.xml: new slide list (after the master/notes/handout lists), no section list pointing at old slides.
  pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>|<p:sldIdLst\/>/, '').replace(/<p:custShowLst>[\s\S]*?<\/p:custShowLst>/, '')
    .replace(/<p:ext uri="\{521415D9-36F7-43E2-AB2F-B90AF26B5E84\}">[\s\S]*?<\/p:ext>/, '');
  const at = ['<p:sldSz', '<p:notesSz'].map((tag) => pres.indexOf(tag)).find((i) => i >= 0);
  pres = pres.slice(0, at) + `<p:sldIdLst>${ids.join('')}</p:sldIdLst>` + pres.slice(at);
  zip.file('ppt/presentation.xml', pres);
  zip.file('ppt/_rels/presentation.xml.rels', presRels);

  // Document properties: title, app.xml slide counts; a template becomes a normal presentation.
  const core = await read('docProps/core.xml');
  const docTitle = deck.title || title || '';
  if (core && t.zip) {
    const now = nowIso();
    const titleRe = /<dc:title\s*\/>|<dc:title>[\s\S]*?<\/dc:title>/;
    let c = titleRe.test(core) ? core.replace(titleRe, `<dc:title>${x(docTitle)}</dc:title>`) : core.replace('</cp:coreProperties>', `<dc:title>${x(docTitle)}</dc:title></cp:coreProperties>`);
    c = c.replace(/(<dcterms:created[^>]*>)[^<]*/, `$1${now}`).replace(/(<dcterms:modified[^>]*>)[^<]*/, `$1${now}`);
    zip.file('docProps/core.xml', c);
  } else zip.file('docProps/core.xml', coreXml(docTitle));
  addType('/docProps/core.xml', CT.core);
  zip.file('docProps/app.xml', appXml(slides.length, slides.filter((s) => s.notes.length).length));
  addType('/docProps/app.xml', CT.app);
  let root = await read('_rels/.rels');
  if (!root.includes('docProps/core.xml')) root = root.replace('</Relationships>', `<Relationship Id="rIdLumenCore" Type="${PKG_REL}/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  if (!root.includes('docProps/app.xml')) root = root.replace('</Relationships>', `<Relationship Id="rIdLumenApp" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file('_rels/.rels', root);
  zip.file('[Content_Types].xml', types.replace(CT.template, CT.presentation));

  if (properties && Object.keys(properties).length) await require('./md-export').setCustomProperties(zip, properties);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  return { buffer, template: !!t.zip, warning: t.warning || '', slides: slides.length, notes: slides.filter((s) => s.notes.length).length };
}

/** Plain text of every slide (title first) and its notes, for checks and tests: [{ title, text, notes }]. */
async function readPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (n) => (zip.file(n) ? zip.file(n).async('string') : '');
  const pres = await read('ppt/presentation.xml');
  const rels = parseRels(await read('ppt/_rels/presentation.xml.rels'));
  const paraTexts = (xml) => [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) => unent([...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(''))).filter(Boolean);
  const out = [];
  for (const m of pres.matchAll(/<p:sldId\b[^>]*\/>/g)) {
    const rel = rels.find((r) => r.id === attr(m[0], 'r:id'));
    const part = resolve('ppt/presentation.xml', rel.target);
    const xml = await read(part);
    const sps = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].map((s) => s[1]);
    const titleSp = sps.find((s) => /<p:ph type="(title|ctrTitle)"/.test(s)) || '';
    const notesRel = parseRels(await read(relsPath(part))).find((r) => r.type.endsWith('/notesSlide'));
    const notesXmlText = notesRel ? await read(resolve(part, notesRel.target)) : '';
    out.push({ part, title: paraTexts(titleSp).join(' '), text: paraTexts(xml.replace(titleSp, '')), notes: notesXmlText ? paraTexts(notesXmlText.replace(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*type="sldImg"[\s\S]*?<\/p:sp>/, '')) : [], table: /<a:tbl>/.test(xml) });
  }
  return out;
}

module.exports = { toPptx, readPptx, parseDeck, basePackage, themeXml, relsXml, slideXml, phShape, geometry, CT, NS, DEFAULT_BRAND };
