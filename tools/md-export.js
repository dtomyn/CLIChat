// Markdown → Word (.docx) and Excel (.xlsx) for "Save as…" on a reply. No Word or Excel installation needed.
// Word: walk marked's lexer tokens and write a minimal OOXML package with JSZip.
// Excel: pull out every markdown table and hand it to excel.write so the styling matches the rest of Lumen.

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { marked } = require('marked');
const excel = require('./excel');

const x = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ''); // characters XML 1.0 forbids
// marked keeps HTML entities in some token text (e.g. &quot; in codespans); turn them back into characters.
const unent = (s) => String(s ?? '').replace(/&(lt|gt|quot|#39|apos|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", amp: '&' }[e]));
const lex = (markdown) => marked.lexer(String(markdown || ''), { gfm: true });

// ---------------------------------------------------------------- Word

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const TABLE_WIDTH = 9360; // twips between 1" margins on Letter; A4 is close enough that Word reflows it

/** One run of text. Newlines become line breaks. fmt: { b, i, strike, code, link } */
function run(text, fmt = {}) {
  const props = [
    fmt.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '',
    fmt.b ? '<w:b/>' : '', fmt.i ? '<w:i/>' : '', fmt.strike ? '<w:strike/>' : '',
    fmt.link ? '<w:color w:val="0563C1"/>' : '',
    fmt.code ? '<w:sz w:val="20"/>' : '',
    fmt.link ? '<w:u w:val="single"/>' : '',
    fmt.code ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '',
  ].join('');
  return String(text).split('\n').map((line, i) => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${x(line)}</w:t></w:r>`).join('');
}

// Built-in style IDs, and the Word style names a program template uses for the same thing.
const STYLE_NAMES = {
  Title: ['title'], Heading1: ['heading 1'], Heading2: ['heading 2'], Heading3: ['heading 3'], Heading4: ['heading 4'],
  ListParagraph: ['list paragraph'], ListBullet: ['list bullet'], ListNumber: ['list number'], Quote: ['quote'],
  Code: ['code', 'html preformatted', 'source code'], TableGrid: ['table grid'], Caption: ['caption'],
};
const BUILTIN_IDS = { ListBullet: 'ListParagraph', ListNumber: 'ListParagraph', Heading4: 'Heading3', Caption: 'Normal' };

// templateTables: leave table borders and header shading to the template's table style.
function docxWriter(styleOf = (id) => BUILTIN_IDS[id] || id, numBase = 0, linkPrefix = 'rIdLink', templateTables = false) {
  const links = []; // external hyperlink targets → rId
  const ordered = []; // one w:num per numbered list so each restarts at its own start number
  const linkId = (href) => { let i = links.indexOf(href); if (i < 0) i = links.push(href) - 1; return `${linkPrefix}${i + 1}`; };

  function inline(tokens = [], fmt = {}) {
    let out = '';
    for (const t of tokens) {
      if (t.type === 'strong') out += inline(t.tokens, { ...fmt, b: true });
      else if (t.type === 'em') out += inline(t.tokens, { ...fmt, i: true });
      else if (t.type === 'del') out += inline(t.tokens, { ...fmt, strike: true });
      else if (t.type === 'codespan') out += run(unent(t.text), { ...fmt, code: true });
      else if (t.type === 'br') out += '<w:r><w:br/></w:r>';
      else if (t.type === 'link') {
        const label = t.tokens?.length ? inline(t.tokens, { ...fmt, link: true }) : run(t.href, { ...fmt, link: true });
        out += /^(https?|mailto):/i.test(t.href) ? `<w:hyperlink r:id="${linkId(t.href)}" w:history="1">${label}</w:hyperlink>` : label;
        if (t.text !== t.href && t.href.replace(/^mailto:/, '') !== t.text) out += run(` (${t.href})`, fmt);
      } else if (t.type === 'image') out += run(`[${t.text || 'image'}] (${t.href})`, fmt);
      else if (t.type === 'html') out += run(t.text.replace(/<[^>]+>/g, ''), fmt);
      else if (t.tokens?.length) out += inline(t.tokens, fmt);
      else out += run(unent(t.text ?? t.raw ?? ''), fmt);
    }
    return out;
  }

  const para = (content, { style, num, jc, after, quote } = {}) => {
    const pPr = [
      style ? `<w:pStyle w:val="${styleOf(style)}"/>` : '',
      num ? `<w:numPr><w:ilvl w:val="${num.level}"/><w:numId w:val="${num.id}"/></w:numPr>` : '',
      after !== undefined ? `<w:spacing w:after="${after}"/>` : '',
      jc ? `<w:jc w:val="${jc}"/>` : '',
    ].join('');
    return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`;
  };

  function table(t) {
    const cols = t.header.length;
    const w = Math.floor(TABLE_WIDTH / Math.max(1, cols));
    const jc = (a) => ({ left: 'left', center: 'center', right: 'right' }[a] || undefined);
    const cell = (c, i, head) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head && !templateTables ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E3FB"/>' : ''}</w:tcPr>${para(inline(c.tokens, { b: head }), { jc: jc(t.align[i]), after: 0 })}</w:tc>`;
    const row = (cells, head) => `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c, i) => cell(c, i, head)).join('')}</w:tr>`;
    const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>`;
    return `<w:tbl><w:tblPr><w:tblStyle w:val="${styleOf('TableGrid')}"/><w:tblW w:w="5000" w:type="pct"/>`
      + (templateTables ? '' : `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`)
      + `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`
      + `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
      + row(t.header, true) + t.rows.map((r) => row(r, false)).join('') + '</w:tbl>'
      + para('', { after: 0 }); // Word needs a paragraph between adjacent tables, and it reads better
  }

  function list(t, level, ctx) {
    let numId = numBase + 1; // bullets
    if (t.ordered) { ordered.push(Number(t.start) || 1); numId = numBase + ordered.length + 1; }
    let out = '';
    for (const item of t.items) {
      let first = true;
      for (const c of item.tokens || []) {
        if (c.type === 'list') { out += list(c, Math.min(level + 1, 1), ctx); continue; }
        if (c.type === 'space') continue;
        if (c.type === 'text' || c.type === 'paragraph') {
          const box = first && item.task ? run(item.checked ? '☑ ' : '☐ ') : '';
          out += first ? para(box + inline(c.tokens || [{ type: 'text', text: c.text }], ctx.fmt), { style: level ? 'ListParagraph' : t.ordered ? 'ListNumber' : 'ListBullet', num: { id: numId, level } })
            : para(inline(c.tokens, ctx.fmt), { style: 'ListParagraph' });
          first = false;
        } else out += block(c, ctx);
      }
      if (first) out += para('', { style: 'ListParagraph', num: { id: numId, level } });
    }
    return out;
  }

  function block(t, ctx = {}) {
    const fmt = ctx.fmt || {};
    const style = ctx.quote ? 'Quote' : undefined;
    switch (t.type) {
      case 'heading': return para(inline(t.tokens, fmt), { style: `Heading${Math.min(t.depth, 4)}` });
      case 'paragraph': return para(inline(t.tokens, fmt), { style });
      case 'text': return para(inline(t.tokens || [{ type: 'text', text: t.text }], fmt), { style });
      case 'list': return list(t, 0, ctx);
      case 'table': return table(t);
      case 'code': return para(run(t.text, { code: true }), { style: 'Code' });
      case 'blockquote': return t.tokens.map((c) => block(c, { ...ctx, quote: true, fmt: { ...fmt, i: true } })).join('');
      case 'hr': return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr></w:pPr></w:p>';
      case 'html': { const s = t.text.replace(/<[^>]+>/g, '').trim(); return s ? para(run(s), { style }) : ''; }
      default: return '';
    }
  }

  function numbering() {
    const lvl = (ilvl, fmt, text, font) => `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>`
      + `<w:pPr><w:ind w:left="${720 * (ilvl + 1)}" w:hanging="360"/></w:pPr>${font ? `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:hint="default"/></w:rPr>` : ''}</w:lvl>`;
    const abstracts = `<w:abstractNum w:abstractNumId="${numBase}"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, 'bullet', '•', 'Calibri')}${lvl(1, 'bullet', 'o', 'Courier New')}</w:abstractNum>`
      + `<w:abstractNum w:abstractNumId="${numBase + 1}"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, 'decimal', '%1.')}${lvl(1, 'lowerLetter', '%2.')}</w:abstractNum>`;
    const nums = `<w:num w:numId="${numBase + 1}"><w:abstractNumId w:val="${numBase}"/></w:num>`
      + ordered.map((start, i) => `<w:num w:numId="${numBase + i + 2}"><w:abstractNumId w:val="${numBase + 1}"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`).join('');
    return { abstracts, nums, xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering ${NS}>${abstracts}${nums}</w:numbering>` };
  }

  return { block, para, run, numbering, links };
}

const STYLES = (() => {
  const heading = (n, size, color) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>`
    + `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>`
    + `<w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ${NS}>`
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>'
    + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
    + '<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/><w:pPr><w:spacing w:after="240"/><w:contextualSpacing/></w:pPr><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:color w:val="3B2A99"/><w:kern w:val="28"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>'
    + heading(1, 32, '3B2A99') + heading(2, 26, '4A36C4') + heading(3, 23, '595959')
    + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C9C0F5"/></w:pBdr><w:ind w:left="432" w:right="432"/></w:pPr><w:rPr><w:i/><w:color w:val="404040"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="160" w:line="240" w:lineRule="auto"/><w:ind w:left="144" w:right="144"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>'
    + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('')
    + '</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
    + '</w:styles>';
})();

const DOC_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const TEMPLATE_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml';
const CUSTOM_CT = 'application/vnd.openxmlformats-officedocument.custom-properties+xml';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const fieldKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const paraText = (p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

function coreXml(title) {
  const now = nowIso();
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${x(title || '')}</dc:title><dc:creator>Lumen</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}

/** docProps/custom.xml with `props` merged over any properties already there (same name = replaced). */
function customXml(existing, props) {
  const names = Object.keys(props).map((k) => k.toLowerCase());
  const keep = [];
  for (const m of String(existing || '').matchAll(/<property\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/property>/g)) {
    if (!names.includes(unent(m[1]).toLowerCase())) keep.push({ name: m[1], inner: m[2] });
  }
  const all = [...keep, ...Object.entries(props).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => ({ name: x(k), inner: `<vt:lpwstr>${x(v)}</vt:lpwstr>` }))];
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    + all.map((p, i) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${i + 2}" name="${p.name}">${p.inner}</property>`).join('') + '</Properties>';
}

/** Put the custom properties part into a package (adds the content type and package relationship if needed). */
async function setCustomProperties(zip, props) {
  if (!props || !Object.keys(props).length) return;
  const existing = zip.file('docProps/custom.xml') ? await zip.file('docProps/custom.xml').async('string') : '';
  zip.file('docProps/custom.xml', customXml(existing, props));
  let types = await zip.file('[Content_Types].xml').async('string');
  if (!types.includes('/docProps/custom.xml')) types = types.replace('</Types>', `<Override PartName="/docProps/custom.xml" ContentType="${CUSTOM_CT}"/></Types>`);
  zip.file('[Content_Types].xml', types);
  let rels = await zip.file('_rels/.rels').async('string');
  if (!rels.includes('docProps/custom.xml')) rels = rels.replace('</Relationships>', `<Relationship Id="rIdLumenCustom" Type="${REL}/custom-properties" Target="docProps/custom.xml"/></Relationships>`);
  zip.file('_rels/.rels', rels);
}

/** Read the custom document properties (version, approver, source revision…) and title of a .docx Buffer. */
async function readDocxProperties(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const out = {};
  const custom = zip.file('docProps/custom.xml') ? await zip.file('docProps/custom.xml').async('string') : '';
  for (const m of custom.matchAll(/<property\b[^>]*\bname="([^"]*)"[^>]*>\s*<vt:\w+>([\s\S]*?)<\/vt:\w+>\s*<\/property>/g)) out[unent(m[1])] = unent(m[2]);
  const core = zip.file('docProps/core.xml') ? await zip.file('docProps/core.xml').async('string') : '';
  const t = /<dc:title>([\s\S]*?)<\/dc:title>/.exec(core);
  if (t) out.title = unent(t[1]);
  return out;
}

/** Fill {{key}} placeholders (also when Word split them across runs) and content controls tagged or titled key. */
function fillFields(xml, fields) {
  const vals = Object.fromEntries(Object.entries(fields || {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [fieldKey(k), String(v)]));
  if (!Object.keys(vals).length) return xml;
  const setText = (frag, value) => {
    let first = true;
    return frag.replace(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g, () => { const r = first ? `<w:t xml:space="preserve">${x(value)}</w:t>` : '<w:t></w:t>'; first = false; return r; });
  };
  // Content controls: a <w:sdt> whose tag or title (alias) names a field.
  xml = xml.replace(/<w:sdt>([\s\S]*?)<\/w:sdt>/g, (whole, inner) => {
    if (inner.includes('<w:sdt>')) return whole; // nested controls: leave alone
    const name = (/<w:tag w:val="([^"]*)"/.exec(inner) || /<w:alias w:val="([^"]*)"/.exec(inner) || [])[1];
    const key = fieldKey(unent(name));
    if (!name || !(key in vals)) return whole;
    const content = /<w:sdtContent>([\s\S]*)<\/w:sdtContent>/.exec(inner);
    if (!content || !/<w:t[\s>]/.test(content[1])) return whole;
    const filled = setText(content[1], vals[key]).replace(/<w:rStyle w:val="PlaceholderText"\/>/g, '');
    return `<w:sdt>${inner.replace(/<w:showingPlcHdr\/>/g, '').replace(content[1], () => filled)}</w:sdt>`;
  });
  // {{key}} inside one text run: replace in place, so tabs, fields and formatting around it are kept.
  const fill = (s) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (fieldKey(k) in vals ? x(vals[fieldKey(k)]) : m));
  xml = xml.replace(/(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g, (m, open, text, close) => {
    const next = fill(text);
    return next === text ? m : `${open.includes('xml:space') ? open : '<w:t xml:space="preserve">'}${next}${close}`;
  });
  // {{key}} that Word split across runs: merge that paragraph's text into its first run.
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
    const joined = paraText(p);
    if (!/\{\{\s*\w+\s*\}\}/.test(joined)) return p;
    let changed = false;
    const next = unent(joined).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => { const key = fieldKey(k); if (!(key in vals)) return m; changed = true; return vals[key]; });
    return changed ? setText(p, next) : p;
  });
}

function styleIndex(stylesXml) {
  const byName = new Map(), ids = new Set();
  for (const m of stylesXml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const id = (/w:styleId="([^"]*)"/.exec(m[1]) || [])[1];
    const name = (/<w:name w:val="([^"]*)"/.exec(m[2]) || [])[1];
    if (!id) continue;
    ids.add(id);
    if (name && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), id);
  }
  return { byName, ids };
}
const builtinStyle = (id) => (new RegExp(`<w:style [^>]*w:styleId="${id}">[\\s\\S]*?</w:style>`).exec(STYLES) || [])[0];

/** Open a .docx/.dotx template (path or Buffer), or explain why it can't be used. */
async function openTemplate(template) {
  if (!template) return { warning: '' };
  const label = typeof template === 'string' ? path.basename(template) : 'template';
  let buf = template;
  if (typeof template === 'string') {
    if (!fs.existsSync(template)) return { warning: `The Word template "${label}" was not found, so Lumen's built-in styles were used.` };
    if (!/\.(docx|dotx)$/i.test(template)) return { warning: `"${label}" is not a .docx or .dotx template (macro-enabled templates are not used), so Lumen's built-in styles were used.` };
    buf = fs.readFileSync(template);
  }
  try {
    const zip = await JSZip.loadAsync(buf);
    const types = zip.file('[Content_Types].xml') ? await zip.file('[Content_Types].xml').async('string') : '';
    if (!zip.file('word/document.xml') || !types || /macroEnabled/i.test(types)) throw new Error('not a Word document or template');
    return { zip };
  } catch (e) {
    return { warning: `The Word template "${label}" could not be read (${e.message}), so Lumen's built-in styles were used.` };
  }
}

async function templateDocx(zip, markdown, { title, fields, properties }) {
  const read = async (name) => (zip.file(name) ? zip.file(name).async('string') : null);
  const stylesXml = (await read('word/styles.xml')) || STYLES;
  const { byName, ids } = styleIndex(stylesXml);
  const injected = new Map();
  const styleOf = (id) => {
    for (const n of STYLE_NAMES[id] || []) if (byName.has(n)) return byName.get(n);
    if (ids.has(id)) return id;
    if (BUILTIN_IDS[id]) return styleOf(BUILTIN_IDS[id]);
    const def = builtinStyle(id);
    if (def) { injected.set(id, def); return id; }
    return undefined;
  };
  let numbering = await read('word/numbering.xml');
  const used = [...String(numbering || '').matchAll(/w:(?:abstractNumId|numId)="(\d+)"/g)].map((m) => Number(m[1]));
  const numBase = used.length ? Math.max(...used) + 1 : 0;
  const w = docxWriter((id) => styleOf(id) || 'Normal', numBase, 'rIdLumenLink', true);
  const body = lex(markdown).map((t) => w.block(t)).join('');

  // Body: replace the {{content}} paragraph, or go after the template's own content (cover page etc.).
  let doc = await read('word/document.xml');
  let placed = false;
  doc = doc.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
    if (placed || !/\{\{\s*content\s*\}\}/.test(paraText(p))) return p;
    placed = true; return body;
  });
  if (!placed) {
    const sect = doc.lastIndexOf('<w:sectPr');
    const lastBlock = Math.max(doc.lastIndexOf('</w:p>'), doc.lastIndexOf('</w:tbl>'), doc.lastIndexOf('</w:sdt>'));
    const i = sect > lastBlock ? sect : doc.lastIndexOf('</w:body>');
    doc = doc.slice(0, i) + body + doc.slice(i);
  }
  const allFields = { title, ...fields };
  zip.file('word/document.xml', fillFields(doc, allFields));
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    zip.file(name, fillFields(await read(name), allFields));
  }

  let types = await read('[Content_Types].xml');
  let rels = (await read('word/_rels/document.xml.rels')) || `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PKG_REL}"></Relationships>`;
  const addRel = (id, type, target) => { if (!rels.includes(`Target="${target}"`)) rels = rels.replace('</Relationships>', `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/></Relationships>`); };
  const addType = (part, ct) => { if (!types.includes(`PartName="${part}"`)) types = types.replace('</Types>', `<Override PartName="${part}" ContentType="${ct}"/></Types>`); };

  zip.file('word/styles.xml', injected.size ? stylesXml.replace('</w:styles>', `${[...injected.values()].join('')}</w:styles>`) : stylesXml);
  addRel('rIdLumenStyles', 'styles', 'styles.xml');
  addType('/word/styles.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml');

  const parts = w.numbering();
  if (numbering) {
    const firstNum = numbering.search(/<w:num\s/); // abstract definitions must come before the w:num list
    numbering = firstNum >= 0 ? numbering.slice(0, firstNum) + parts.abstracts + numbering.slice(firstNum) : numbering.replace('</w:numbering>', `${parts.abstracts}</w:numbering>`);
    zip.file('word/numbering.xml', numbering.replace('</w:numbering>', `${parts.nums}</w:numbering>`));
  } else zip.file('word/numbering.xml', parts.xml);
  addRel('rIdLumenNumbering', 'numbering', 'numbering.xml');
  addType('/word/numbering.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml');

  rels = rels.replace('</Relationships>', w.links.map((href, i) => `<Relationship Id="rIdLumenLink${i + 1}" Type="${REL}/hyperlink" Target="${x(href)}" TargetMode="External"/>`).join('') + '</Relationships>');
  zip.file('word/_rels/document.xml.rels', rels);

  let core = await read('docProps/core.xml');
  if (core) {
    const now = nowIso();
    const titleRe = /<dc:title\s*\/>|<dc:title>[\s\S]*?<\/dc:title>/;
    if (title) core = titleRe.test(core) ? core.replace(titleRe, `<dc:title>${x(title)}</dc:title>`) : core.replace('</cp:coreProperties>', `<dc:title>${x(title)}</dc:title></cp:coreProperties>`);
    core = core.replace(/(<dcterms:created[^>]*>)[^<]*/, `$1${now}`).replace(/(<dcterms:modified[^>]*>)[^<]*/, `$1${now}`);
    zip.file('docProps/core.xml', core);
  } else {
    zip.file('docProps/core.xml', coreXml(title));
    addType('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml');
    const root = await read('_rels/.rels');
    if (!root.includes('docProps/core.xml')) zip.file('_rels/.rels', root.replace('</Relationships>', `<Relationship Id="rIdLumenCore" Type="${PKG_REL}/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`));
  }
  zip.file('[Content_Types].xml', types.replace(TEMPLATE_CT, DOC_CT)); // a .dotx becomes a normal document
  return zip;
}

function builtinDocx(markdown, { title, fields }) {
  const w = docxWriter();
  const meta = [fields?.version && `Version ${fields.version}`, fields?.date, fields?.approver && `Approved by ${fields.approver}`].filter(Boolean).join(' · ');
  const body = (title ? w.para(w.run(title), { style: 'Title' }) : '') + (meta ? w.para(w.run(meta, { i: true })) : '') + lex(markdown).map((t) => w.block(t)).join('');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}`
    + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + `<Override PartName="/word/document.xml" ContentType="${DOC_CT}"/>`
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PKG_REL}">`
    + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>`
    + `<Relationship Id="rId2" Type="${PKG_REL}/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('word/document.xml', doc);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PKG_REL}">`
    + `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>`
    + `<Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/>`
    + w.links.map((href, i) => `<Relationship Id="rIdLink${i + 1}" Type="${REL}/hyperlink" Target="${x(href)}" TargetMode="External"/>`).join('')
    + '</Relationships>');
  zip.file('word/styles.xml', STYLES);
  zip.file('word/numbering.xml', w.numbering().xml);
  zip.file('docProps/core.xml', coreXml(title));
  return zip;
}

/**
 * Markdown → .docx. With `template` (a .docx/.dotx path or Buffer) the template's styles, numbering, headers,
 * footers, theme and cover page are kept, Markdown is mapped to its styles by name (Heading 1–4, List Bullet,
 * Table Grid…), and {{title}}, {{version}}, {{date}}, {{approver}} placeholders or content controls are filled
 * from `fields`. The body replaces a {{content}} paragraph, else follows the template's own content. A missing or
 * unreadable template falls back to the built-in styles with a warning. `properties` become custom document
 * properties. This is what Pandoc's --reference-doc does, without Pandoc.
 * Returns { buffer, template: true|false, warning }.
 */
async function toDocx(markdown, { title, template, fields = {}, properties } = {}) {
  const t = await openTemplate(template);
  const opts = { title, fields };
  const zip = t.zip ? await templateDocx(t.zip, markdown, opts) : builtinDocx(markdown, opts);
  await setCustomProperties(zip, properties);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return { buffer, template: !!t.zip, warning: t.warning || '' };
}

/** Convert a markdown reply into a .docx Buffer (built-in styles). */
async function markdownToDocx(markdown, { title } = {}) {
  return (await toDocx(markdown, { title })).buffer;
}

// ---------------------------------------------------------------- Excel

const plain = (tokens = []) => tokens.map((t) => (t.type === 'br' ? ' ' : t.tokens?.length ? plain(t.tokens) : unent(t.text ?? ''))).join('');

/** Every table in document order, each with the text of the nearest heading before it. */
function findTables(tokens, out = [], state = { heading: '' }) {
  for (const t of tokens) {
    if (t.type === 'heading') state.heading = plain(t.tokens).trim();
    else if (t.type === 'table') out.push({ heading: state.heading, table: t });
    else if (t.type === 'list') t.items.forEach((i) => findTables(i.tokens || [], out, state));
    else if (t.tokens && t.type !== 'paragraph') findTables(t.tokens, out, state);
  }
  return out;
}

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b/i;

/** Like excel.coerce, but from text a person typed: numbers, money, percentages and dates become real values. */
function coerceCell(s) {
  const v = String(s).trim();
  if (!v) return { value: null };
  let m = /^([-+])?\(?\s*([$€£])?\s*(\d{1,3}(?:,\d{3})+|\d+)?(\.\d+)?\s*\)?$/.exec(v);
  if (m && (m[3] || m[4]) && (!v.includes('(') || v.endsWith(')'))) {
    const n = Number(`${m[3] || '0'}${m[4] || ''}`.replace(/,/g, '')) * (m[1] === '-' || v.startsWith('(') ? -1 : 1);
    return { value: n, kind: m[2] ? 'currency' : 'number', decimals: !!m[4], grouped: !!m[3]?.includes(',') };
  }
  m = /^([-+]?\d+(?:\.\d+)?)\s*%$/.exec(v);
  if (m) return { value: Number(m[1]) / 100, kind: 'percent', decimals: m[1].includes('.') };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { value: new Date(`${v}T00:00:00Z`), kind: 'date' };
  if (MONTH.test(v) && /\b\d{4}\b/.test(v) && /\d{1,2}/.test(v.replace(/\b\d{4}\b/, '')) && v.length <= 24) {
    const d = new Date(`${v.replace(/(\d)(st|nd|rd|th)\b/, '$1')} 00:00:00 UTC`);
    if (!Number.isNaN(+d)) return { value: d, kind: 'date' };
  }
  // A cell that starts with "=" would become a formula in excel.write; keep it as text.
  return { value: v.startsWith('=') ? { richText: [{ text: v }] } : v };
}

const FORMAT_FOR = (cells) => {
  const kinds = new Set(cells.filter((c) => c.kind).map((c) => c.kind));
  if (kinds.has('currency')) kinds.delete('number'); // "$12,000" above "40,000" is still a money column
  if (kinds.size !== 1) return undefined;
  const k = [...kinds][0];
  const dec = cells.some((c) => c.decimals);
  if (k === 'percent') return dec ? 'percent1' : 'percent';
  if (k === 'currency') return dec ? 'currency2' : 'currency';
  if (k === 'number') return dec ? 'decimal' : cells.some((c) => c.grouped) ? 'number' : undefined;
  return k; // date
};

function sheetName(base, used, n) {
  let name = String(base || '').replace(/[\[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 31) || `Table ${n}`;
  for (let i = 2; used.has(name.toLowerCase()); i++) { const sfx = ` (${i})`; name = `${name.replace(/ \(\d+\)$/, '').slice(0, 31 - sfx.length)}${sfx}`; }
  used.add(name.toLowerCase());
  return name;
}

/** Write every markdown table in the reply to `file`, one sheet each. Returns the file path, or null if there were no tables. */
async function markdownTablesToXlsx(markdown, file) {
  const found = findTables(lex(markdown));
  if (!found.length) return null;
  const used = new Set();
  const sheets = found.map(({ heading, table }, n) => {
    const rows = table.rows.map((r) => r.map((c) => coerceCell(plain(c.tokens))));
    const columns = table.header.map((h, i) => {
      const fmt = FORMAT_FOR(rows.map((r) => r[i] || {}));
      return fmt ? { header: plain(h.tokens).trim(), format: fmt } : { header: plain(h.tokens).trim() };
    });
    return { name: sheetName(heading, used, n + 1), columns, rows: rows.map((r) => r.map((c) => c.value)) };
  });
  await excel.write(file, sheets, { recalculate: false });
  return file;
}

const hasTable = (markdown) => findTables(lex(markdown)).length > 0;

module.exports = { toDocx, readDocxProperties, fillFields, markdownToDocx, markdownTablesToXlsx, hasTable, coerceCell, setCustomProperties };
