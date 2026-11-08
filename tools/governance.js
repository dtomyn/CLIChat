// Architecture and governance (UC 31, 38, 40, 42). No AI here: the AI reviews and writes, this code finds the facts.
//
// 1. readAdrs: parse an ADR folder (MADR or Nygard style) into an index. Flags ADRs with no status, superseded ADRs
//    that are still referenced, supersede links that disagree, and decisions that look duplicated.
// 2. checkConsistency: pull named things (components, APIs, endpoints, ADR IDs, standards, entities and fields) out
//    of the design documents with simple patterns, tables and headings, and report names one document uses that the
//    others never mention, references to unknown or superseded ADRs, and entities/fields the data model doesn't have.
// 3. assembleGatePack: collect the latest approved version of each artefact a gate needs (Lumen's lifecycle approval
//    stamp, or Approver properties on a Word file), and write "Gate packs/<gate>/" with a combined Word pack, an
//    index (approval status and open items), an open-item log and copies of the artefacts. Missing ones are listed.
// 4. diffInventory: compare a technical inventory workbook with delivery changes (ADO export, git log --name-only
//    text, ADR folder, design documents) and write "<inventory> (proposed).xlsx" with an "Approve? (Yes/No)" column.
//    The inventory itself is never changed.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const excel = require('./excel');
const docx = require('./docx');
const { similarity } = require('./tests');
const { approvalOf } = require('./publish');

const cellText = excel.cellText;
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
const HIGHLIGHT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const NEW_ROW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } };
const RETIRE_ROW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
const safeName = (s) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/, '').trim();
const norm = (s) => String(s || '').toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const slug = (s) => norm(s).replace(/\s+/g, '');
const rel = (root, f) => (root ? path.relative(root, f).split(path.sep).join('/') : path.basename(f));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function freeName(file) {
  if (!fs.existsSync(file)) return file;
  const ext = path.extname(file), stem = file.slice(0, -ext.length);
  for (let i = 2; ; i++) { const f = `${stem} (${i})${ext}`; if (!fs.existsSync(f)) return f; }
}

function styleHeader(ws, widths) {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = HEADER_FILL;
  ws.getRow(1).alignment = { vertical: 'top', wrapText: true };
  (widths || []).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function readText(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.docx' || ext === '.docm') return docx.docxToText(file);
  if (['.md', '.markdown', '.txt'].includes(ext)) return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  throw friendly(`"${path.basename(file)}" must be a Word document (.docx) or a text file (.md, .txt).`);
}

// ------------------------------------------------------------------ Markdown scanning
/** Headings, tables and lines of a Markdown(-ish) text, each with the heading it sits under. */
function scan(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const headings = [], tables = [], out = [];
  let heading = '', table = null;
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  lines.forEach((line, i) => {
    const h = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (h) { heading = h[2].trim(); headings.push({ level: h[1].length, text: heading, line: i + 1 }); }
    out.push({ text: line, heading, line: i + 1 });
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (!table) { table = { heading, line: i + 1, header: cells(line), rows: [] }; tables.push(table); }
      else if (!/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) table.rows.push(cells(line));
    } else table = null;
  });
  return { lines: out, headings, tables };
}

const ADR_RE = /\bADR[-_ ]?0*(\d{1,4})\b/gi;
const adrId = (n) => `ADR-${String(+n).padStart(3, '0')}`;
/** ADR references in a text, with the heading and line they sit under. */
function adrRefs(text) {
  const out = [];
  for (const l of scan(text).lines) for (const m of l.text.matchAll(ADR_RE)) out.push({ id: adrId(m[1]), heading: l.heading, line: l.line });
  return out;
}

// ------------------------------------------------------------------ 1. ADRs
const STATUS = [[/supersed/i, 'Superseded'], [/deprecat/i, 'Deprecated'], [/reject|declin/i, 'Rejected'], [/accept|approv|agreed|adopted/i, 'Accepted'], [/propos|draft|review|open/i, 'Proposed']];
const statusOf = (s) => { for (const [re, v] of STATUS) if (re.test(s || '')) return v; return s ? String(s).trim() : null; };

/** One ADR file → { id, title, status, date, context, decision, consequences, supersedes, supersededBy, refs }. */
function parseAdr(text, file = 'adr.md') {
  text = String(text || '').replace(/\r\n/g, '\n');
  const fm = {};
  let body = text;
  const f = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (f) { for (const line of f[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) fm[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); } body = text.slice(f[0].length); }
  const sections = [];
  let cur = { heading: '', level: 0, lines: [] };
  for (const line of body.split('\n')) {
    const h = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (h) { sections.push(cur); cur = { heading: h[2].trim(), level: h[1].length, lines: [] }; } else cur.lines.push(line);
  }
  sections.push(cur);
  const sec = (re) => { const s = sections.find((x) => re.test(x.heading)); return s ? s.lines.join('\n').trim() : ''; };
  const titleSec = sections.find((s) => s.level === 1) || sections.find((s) => s.level);
  let title = titleSec ? titleSec.heading : path.basename(file, path.extname(file));
  const base = path.basename(file);
  const idFrom = fm.id || (/\bADR[-_ ]?0*(\d{1,4})/i.exec(base) || [])[1] || (/^0*(\d{1,4})[-_ ]/.exec(base) || [])[1]
    || (/\bADR[-_ ]?0*(\d{1,4})/i.exec(title) || [])[1] || (/^0*(\d{1,4})\.\s/.exec(title) || [])[1];
  const id = idFrom ? adrId(/^\d+$/.test(idFrom) ? idFrom : (/(\d+)/.exec(idFrom) || [])[1] || 0) : null;
  title = title.replace(/^ADR[-_ ]?\d+\s*[:.\-—–]\s*/i, '').replace(/^\d+\.\s+/, '').trim();
  const statusText = fm.status || (/^[*-]?\s*\**status\**\s*:\s*(.+)$/im.exec(body) || [])[1] || (sec(/^status$/i).split('\n').find((l) => l.trim()) || '').replace(/^[*-]\s*/, '');
  const date = fm.date || (/^[*-]?\s*\**date\**\s*:\s*(\d{4}-\d{2}-\d{2})/im.exec(body) || [])[1] || (/\b(\d{4}-\d{2}-\d{2})\b/.exec(sec(/^status$/i)) || [])[1] || null;
  const ids = (s) => [...String(s || '').matchAll(ADR_RE)].map((m) => adrId(m[1]));
  const supersedes = [...new Set([...ids(fm.supersedes), ...[...body.matchAll(/\b(?:supersedes|replaces)\s+((?:ADR[-_ ]?\d+(?:\s*(?:,|and)\s*)?)+)/gi)].flatMap((m) => ids(m[1]))])].filter((x) => x !== id);
  const supersededBy = (ids(fm['superseded-by'] || fm.superseded_by)[0]) || (/\bsuperseded\s+by\s+(ADR[-_ ]?\d+)/i.exec(`${statusText}\n${body}`) || [])[1];
  const refs = adrRefs(body).filter((r) => r.id !== id);
  return {
    id, title, status: statusOf(statusText), statusText: String(statusText || '').trim(), date,
    context: sec(/context|problem/i), decision: sec(/^decision( outcome)?$/i) || sec(/decision/i), consequences: sec(/consequence/i),
    supersedes, supersededBy: supersededBy ? adrId(/(\d+)/.exec(supersededBy)[1]) : null, refs, file,
  };
}

function listFiles(dir, re, depth = 0, out = []) {
  if (depth > 3 || !fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('~$') || e.name === 'node_modules') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(f, re, depth + 1, out); else if (re.test(e.name)) out.push(f);
  }
  return out;
}

/**
 * Parse every ADR in a folder. opts: { root (for relative paths), referencedIn: [files] (other documents to scan for
 * references to superseded ADRs), threshold (0.5) for duplicate decisions }.
 */
function readAdrs(folder, { root, referencedIn = [], threshold = 0.5 } = {}) {
  if (!folder || !fs.existsSync(folder)) throw friendly(`Can't find the ADR folder "${folder}".`);
  const files = fs.statSync(folder).isDirectory() ? listFiles(folder, /\.(md|markdown)$/i).filter((f) => !/^(readme|index|template|adr-template)\b/i.test(path.basename(f))) : [folder];
  if (!files.length) throw friendly(`"${path.basename(folder)}" has no ADR Markdown files.`);
  const adrs = files.map((f) => ({ ...parseAdr(fs.readFileSync(f, 'utf8'), f), file: rel(root || path.dirname(folder), f) })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const byId = new Map();
  const findings = { noStatus: [], noId: [], duplicateIds: [], statusConflicts: [], unknownReferences: [], supersededReferenced: [], duplicateDecisions: [] };
  for (const a of adrs) {
    if (!a.id) { findings.noId.push({ file: a.file, title: a.title }); continue; }
    if (byId.has(a.id)) findings.duplicateIds.push({ id: a.id, files: [byId.get(a.id).file, a.file] }); else byId.set(a.id, a);
  }
  for (const a of adrs) {
    if (!a.status) findings.noStatus.push({ id: a.id, file: a.file, title: a.title });
    for (const s of a.supersedes) {
      const old = byId.get(s);
      if (!old) { findings.unknownReferences.push({ id: s, from: a.id, file: a.file, note: `${a.id} says it supersedes ${s}, which is not in the folder.` }); continue; }
      if (!old.supersededBy) old.supersededBy = a.id;
      if (old.status !== 'Superseded') findings.statusConflicts.push({ id: s, file: old.file, note: `${a.id} supersedes ${s}, but ${s}'s own status is "${old.statusText || 'missing'}".` });
    }
    if (a.supersededBy && !byId.has(a.supersededBy)) findings.unknownReferences.push({ id: a.supersededBy, from: a.id, file: a.file, note: `${a.id} says it is superseded by ${a.supersededBy}, which is not in the folder.` });
    if (a.status === 'Superseded' && !a.supersededBy) findings.statusConflicts.push({ id: a.id, file: a.file, note: `${a.id} is marked Superseded but doesn't say which ADR replaces it.` });
    if (a.supersededBy && a.status !== 'Superseded' && byId.has(a.supersededBy) && !findings.statusConflicts.some((c) => c.id === a.id)) findings.statusConflicts.push({ id: a.id, file: a.file, note: `${a.id} is superseded by ${a.supersededBy}, but its status is "${a.statusText || 'missing'}".` });
  }
  const retired = (a) => a.status === 'Superseded' || !!a.supersededBy;
  for (const a of adrs) {
    if (!a.id) continue;
    for (const r of a.refs) {
      const t = byId.get(r.id);
      if (!t) { if (!a.supersedes.includes(r.id) && !findings.unknownReferences.some((u) => u.id === r.id && u.from === a.id)) findings.unknownReferences.push({ id: r.id, from: a.id, file: a.file, note: `${a.id} refers to ${r.id}, which is not in the folder.` }); continue; }
      if (retired(t) && t.supersededBy !== a.id && !a.supersedes.includes(t.id) && !retired(a)) findings.supersededReferenced.push({ id: t.id, supersededBy: t.supersededBy, in: a.file, heading: r.heading, line: r.line });
    }
  }
  for (const f of referencedIn) {
    const text = readText(f);
    for (const r of adrRefs(text)) {
      const t = byId.get(r.id);
      if (t && retired(t)) findings.supersededReferenced.push({ id: t.id, supersededBy: t.supersededBy, in: rel(root, f), heading: r.heading, line: r.line });
      else if (!t) findings.unknownReferences.push({ id: r.id, from: rel(root, f), file: rel(root, f), note: `${rel(root, f)} refers to ${r.id} (${r.heading || 'top'}), which is not in the ADR folder.` });
    }
  }
  const live = adrs.filter((a) => a.id && !retired(a) && a.status !== 'Rejected');
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    const sim = Math.max(similarity(`${a.title} ${a.decision}`, `${b.title} ${b.decision}`), norm(a.title) === norm(b.title) ? 1 : 0);
    if (sim >= threshold) findings.duplicateDecisions.push({ ids: [a.id, b.id], titles: [a.title, b.title], similarity: +sim.toFixed(2) });
  }
  const index = adrs.map((a) => ({ id: a.id, title: a.title, status: a.status || '(no status)', date: a.date, supersedes: a.supersedes, supersededBy: a.supersededBy, file: a.file, decision: a.decision.replace(/\s+/g, ' ').slice(0, 300) }));
  const n = Object.values(findings).reduce((s, x) => s + x.length, 0);
  const counts = Object.fromEntries(['Accepted', 'Proposed', 'Superseded', 'Deprecated', 'Rejected'].map((s) => [s, adrs.filter((a) => a.status === s).length]));
  const result = {
    folder: rel(root, folder), count: adrs.length, byStatus: counts, index, findings,
    summary: `${plural(adrs.length, 'ADR')} (${Object.entries(counts).filter(([, v]) => v).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ') || 'no status'}); ${plural(n, 'finding')}: ${findings.supersededReferenced.length} reference${findings.supersededReferenced.length === 1 ? '' : 's'} to superseded ADRs, ${findings.noStatus.length} without a status, ${findings.duplicateDecisions.length} possible duplicate decision${findings.duplicateDecisions.length === 1 ? '' : 's'}.`,
  };
  Object.defineProperty(result, '_byId', { value: byId, enumerable: false });
  return result;
}

// ------------------------------------------------------------------ 2. consistency
const NAME_COL = /^(components?|platforms?|services?|systems?|apis?|interfaces?|integrations?|applications?|solution components?)$/i;
const NAME_SECTION = /\b(components?|services?|apis?|interfaces?|integrations?)\b/i;
const kindOfHeader = (h) => (/api|interface/i.test(h) ? 'API' : /integration/i.test(h) ? 'integration' : 'component');
const cleanName = (c) => String(c || '').replace(/[*`_]/g, '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/^[A-Z]{2,4}-\d+\s*[—–:-]\s*/, '').replace(/^[\d.]+\s+/, '').replace(/[.;,:]+$/, '').replace(/\s+/g, ' ').trim();
const STANDARD_RE = /\b(WCAG\s*\d(?:\.\d)?(?:\s*(?:AAA|AA|A)\b)?|ISO(?:\/IEC)?\s*\d{4,5}(?::\d{4})?|PCI[\s-]?DSS(?:\s*v?\d(?:\.\d)?)?|OWASP\s+(?:ASVS|Top\s*10)(?:\s*v?\d+(?:\.\d+)?)?|NIST\s*(?:SP\s*)?\d{3}-\d{2,3}\w?|ITSG-\d{2})/gi;
const standardFamily = (s) => { const t = s.toUpperCase().replace(/\s+/g, ' '); return /^WCAG/.test(t) ? 'WCAG' : /^PCI/.test(t) ? 'PCI DSS' : /^OWASP ASVS/.test(t) ? 'OWASP ASVS' : /^OWASP/.test(t) ? 'OWASP Top 10' : (/^(ISO|NIST|ITSG)\D*(\d{3,5}(?:-\d+)?)/.exec(t) || []).slice(1).join(' ') || t; };

/** Named things in one document: components/APIs (tables and component sections), endpoints, standards. */
function extractNames(text) {
  const { lines, headings, tables } = scan(text);
  const names = [];
  const add = (name, kind, heading, how) => { const n = cleanName(name); if (n && n.length >= 3 && n.length <= 60 && !/^(n\/a|none|tbc|tbd|—|-)$/i.test(n) && !names.some((x) => norm(x.name) === norm(n))) names.push({ name: n, kind, heading, how }); };
  for (const t of tables) {
    const i = t.header.findIndex((h) => NAME_COL.test(cleanName(h)));
    if (i < 0) continue;
    for (const r of t.rows) add(r[i], kindOfHeader(t.header[i]), t.heading, `table column "${cleanName(t.header[i])}"`);
  }
  headings.forEach((h, n) => {
    if (!NAME_SECTION.test(h.text)) return;
    for (let k = n + 1; k < headings.length && headings[k].level > h.level; k++) if (headings[k].level === h.level + 1) add(headings[k].text, kindOfHeader(h.text), h.text, 'heading');
  });
  const endpoints = [], standards = [];
  for (const l of lines) {
    for (const m of l.text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w\-/{}.:]+)/g)) if (!endpoints.some((e) => e.name === `${m[1]} ${m[2]}`)) endpoints.push({ name: `${m[1]} ${m[2]}`, heading: l.heading, line: l.line });
    for (const m of l.text.matchAll(STANDARD_RE)) { const v = m[1].replace(/\s+/g, ' ').trim(); if (!standards.some((s) => s.name.toUpperCase() === v.toUpperCase())) standards.push({ name: v, family: standardFamily(v), heading: l.heading, line: l.line }); }
  }
  return { names, endpoints, standards, tables };
}

function mentions(text, name) {
  const t = ` ${norm(text)} `, n = norm(name);
  if (!n) return true;
  const forms = [n, n.replace(/s$/, ''), `${n}s`];
  if (forms.some((f) => f && t.includes(` ${f} `))) return true;
  const sl = slug(name);
  return sl.length > 5 && t.replace(/\s+/g, '').includes(sl);
}

/** Entities and attributes from a data model workbook (Entities sheet with Entity; Attributes sheet with Entity + Attribute). */
async function readDataModel(file) {
  const wb = await excel.open(file);
  const entities = new Map(), attributes = new Map();
  for (const ws of wb.worksheets) {
    const head = [];
    ws.getRow(1).eachCell((c, n) => { head[n] = cellText(c).trim(); });
    const e = head.findIndex((h) => h && /^(entity|entity name|table|object)$/i.test(h));
    const a = head.findIndex((h) => h && /^(attribute|field|column|attribute name|field name)$/i.test(h));
    if (e < 1) continue;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const en = cellText(row.getCell(e)).trim();
      if (!en) return;
      if (!entities.has(slug(en))) entities.set(slug(en), { name: en, at: `${ws.name}!${String.fromCharCode(64 + e)}${r}` });
      if (a > 0) { const an = cellText(row.getCell(a)).trim(); if (an) { if (!attributes.has(slug(en))) attributes.set(slug(en), new Set()); attributes.get(slug(en)).add(an.toLowerCase()); } }
    });
  }
  if (!entities.size) throw friendly(`"${path.basename(file)}" needs a sheet with an "Entity" column (and ideally an Attributes sheet with "Entity" and "Attribute").`);
  return { entities, attributes, file };
}
const knownEntity = (dm, name) => dm.entities.has(slug(name)) || dm.entities.has(slug(name).replace(/s$/, ''));

/**
 * docs: design document files (FDD, TDD, blueprint, API specs; .md/.docx/.txt). opts: { root, adrs: ADR folder,
 * dataModel: data model workbook }. Read-only; the findings are evidence for the AI's review.
 */
async function checkConsistency(docs, { root, adrs, dataModel } = {}) {
  if (!Array.isArray(docs) || !docs.length) throw friendly('Give at least one design document.');
  const read = docs.map((f) => { const text = readText(f); return { file: rel(root, f), text, ...extractNames(text), refs: adrRefs(text) }; });
  const findings = { missingAcrossDocuments: [], supersededAdrReferences: [], unknownAdrReferences: [], unknownEntities: [], unknownFields: [], standardsDiffer: [] };
  const notes = [];
  if (read.length > 1) {
    const seen = new Map();
    for (const d of read) for (const n of d.names) {
      const missingFrom = read.filter((o) => o !== d && !mentions(o.text, n.name)).map((o) => o.file);
      if (!missingFrom.length) continue;
      const k = norm(n.name);
      if (seen.has(k)) { const f = seen.get(k); f.usedIn.push({ file: d.file, heading: n.heading }); f.missingFrom = f.missingFrom.filter((x) => missingFrom.includes(x) && x !== d.file); continue; }
      const f = { name: n.name, kind: n.kind, usedIn: [{ file: d.file, heading: n.heading, how: n.how }], missingFrom };
      seen.set(k, f); findings.missingAcrossDocuments.push(f);
    }
    for (const d of read) for (const e of d.endpoints) {
      const missingFrom = read.filter((o) => o !== d && o.endpoints.length && !o.endpoints.some((x) => x.name === e.name)).map((o) => o.file);
      if (missingFrom.length) findings.missingAcrossDocuments.push({ name: e.name, kind: 'endpoint', usedIn: [{ file: d.file, heading: e.heading, line: e.line }], missingFrom });
    }
    const fam = new Map();
    for (const d of read) for (const s of d.standards) { if (!fam.has(s.family)) fam.set(s.family, []); fam.get(s.family).push({ value: s.name, file: d.file, heading: s.heading }); }
    for (const [family, uses] of fam) if (new Set(uses.map((u) => u.value.toUpperCase())).size > 1) findings.standardsDiffer.push({ standard: family, uses });
  } else notes.push('Only one document was given, so names could not be compared across documents.');

  let adrIndex = null;
  if (adrs) adrIndex = readAdrs(adrs, { root });
  for (const d of read) for (const r of d.refs) {
    if (!adrIndex) continue;
    const a = adrIndex._byId.get(r.id);
    if (!a) findings.unknownAdrReferences.push({ id: r.id, file: d.file, heading: r.heading, line: r.line });
    else if (a.status === 'Superseded' || a.supersededBy || a.status === 'Deprecated' || a.status === 'Rejected') findings.supersededAdrReferences.push({ id: r.id, status: a.status, supersededBy: a.supersededBy, title: a.title, file: d.file, heading: r.heading, line: r.line });
  }
  if (!adrIndex && read.some((d) => d.refs.length)) notes.push('ADR references were found but no ADR folder was given, so they were not checked.');

  if (dataModel) {
    const dm = await readDataModel(dataModel);
    for (const d of read) {
      for (const t of d.tables) {
        const e = t.header.findIndex((h) => /^(data )?entit(y|ies)$|^data objects?$/i.test(cleanName(h)));
        if (e < 0) continue;
        const a = t.header.findIndex((h) => /attribute|field/i.test(h));
        for (const r of t.rows) {
          const en = cleanName(r[e]);
          if (!en) continue;
          if (!knownEntity(dm, en)) { if (!findings.unknownEntities.some((x) => x.entity === en && x.file === d.file)) findings.unknownEntities.push({ entity: en, file: d.file, heading: t.heading }); continue; }
          const attrs = dm.attributes.get(slug(en)) || dm.attributes.get(slug(en).replace(/s$/, ''));
          if (a < 0 || !attrs) continue;
          for (const f of String(r[a] || '').replace(/[`*]/g, '').split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean)) if (!attrs.has(f.toLowerCase())) findings.unknownFields.push({ entity: en, field: f, file: d.file, heading: t.heading });
        }
      }
      for (const [k, ent] of dm.entities) {
        const attrs = dm.attributes.get(k);
        if (!attrs) continue;
        const forms = [...new Set([ent.name, ent.name.replace(/\s+/g, '')])].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const re = new RegExp(`(?:^|[^\\w])(?:${forms.join('|')})\\.([A-Za-z_]\\w*)`, 'gi');
        for (const l of scan(d.text).lines) for (const m of l.text.matchAll(re)) if (!attrs.has(m[1].toLowerCase()) && !findings.unknownFields.some((x) => x.entity === ent.name && x.field === m[1] && x.file === d.file)) findings.unknownFields.push({ entity: ent.name, field: m[1], file: d.file, heading: l.heading, line: l.line });
      }
    }
  }
  const n = Object.values(findings).reduce((s, x) => s + x.length, 0);
  return {
    documents: read.map((d) => ({ file: d.file, names: d.names.length, endpoints: d.endpoints.length, standards: d.standards.map((s) => s.name), adrReferences: [...new Set(d.refs.map((r) => r.id))] })),
    adrs: adrIndex ? { folder: adrIndex.folder, count: adrIndex.count, summary: adrIndex.summary, findings: adrIndex.findings } : null,
    dataModel: dataModel ? rel(root, dataModel) : null,
    findings, notes,
    summary: `${plural(read.length, 'document')} checked; ${plural(n, 'finding')}: ${findings.missingAcrossDocuments.length} name${findings.missingAcrossDocuments.length === 1 ? '' : 's'} missing from other documents, ${findings.supersededAdrReferences.length} reference${findings.supersededAdrReferences.length === 1 ? '' : 's'} to superseded ADRs, ${findings.unknownAdrReferences.length} to unknown ADRs, ${findings.unknownEntities.length + findings.unknownFields.length} data model mismatch${findings.unknownEntities.length + findings.unknownFields.length === 1 ? '' : 'es'}.`,
    note: 'These are pattern-based findings to review, not a verdict. Names are matched as words, so a renamed component shows up as missing.',
  };
}

// ------------------------------------------------------------------ 3. gate packs
const versionOf = (name) => { const m = /\bv(?:ersion)?\s*(\d+(?:\.\d+)*)/i.exec(name) || /\((\d+)\)\s*(?:\.\w+)?$/.exec(name); return m ? m[1].split('.').map(Number) : []; };
const stemOf = (name) => name.replace(/\.[^.]+$/, '').replace(/[\s_-]*(?:\(?v(?:ersion)?\s*\d+(?:\.\d+)*\)?|\(\d+\)|draft|final)\s*$/i, '').trim().toLowerCase();
const cmpVersion = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };

async function approvalOfFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.docx') {
    const p = await require('./md-export').readDocxProperties(fs.readFileSync(file)).catch(() => ({}));
    const approver = p.Approver || p.approver || '';
    const approved = !!approver || /^approved/i.test(p.Status || '');
    return { approved, approver, approvedAt: p['Approved at'] || '', version: p.Version || '', how: approved ? 'Word document properties' : '', body: null };
  }
  const text = fs.readFileSync(file, 'utf8');
  if (/^> Based on unapproved inputs/m.test(text.slice(0, 400))) return { approved: false, reason: 'based on unapproved inputs', body: text };
  const s = approvalOf(text);
  if (s.approver) return { approved: true, approver: s.approver, approvedAt: s.approvedAt, how: 'Lumen approval stamp', body: s.body };
  const head = text.slice(0, 1500);
  if (/^\W*status\W*:?\W*approved\b/im.test(head)) return { approved: true, approver: ((/approved by:?\s*\**\s*([^\n·|*]+)/i.exec(head) || [])[1] || '').trim(), approvedAt: (/\b(\d{4}-\d{2}-\d{2})\b/.exec(head) || [])[1] || '', how: 'Status: Approved line', body: text };
  return { approved: false, reason: 'no approval stamp', body: text };
}

function artefactCandidates(root, spec) {
  const full = path.resolve(root, String(spec.path || ''));
  if (!spec.path || !fs.existsSync(full)) return [];
  const ok = (f) => /\.(md|markdown|docx)$/i.test(f) && !path.basename(f).startsWith('~$');
  if (fs.statSync(full).isDirectory()) {
    const re = spec.match ? new RegExp(String(spec.match).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    return fs.readdirSync(full).map((n) => path.join(full, n)).filter((f) => fs.statSync(f).isFile() && ok(f) && (!re || re.test(path.basename(f))));
  }
  const stem = stemOf(path.basename(full));
  const sibs = fs.readdirSync(path.dirname(full)).map((n) => path.join(path.dirname(full), n)).filter((f) => f !== full && fs.statSync(f).isFile() && ok(f) && stemOf(path.basename(f)) === stem);
  return [full, ...sibs];
}

/**
 * manifest: { gate, artefacts: [{ name, path (file or folder), match?, required (default true) }],
 *             approvals: [{ role, approver?, date?, artefact? }], openItems: [text] }
 * opts: { root, template (Word template), raid (RAID log: open items are added), now }.
 * Writes only into <root>/Gate packs/<gate>/. Includes only approved versions.
 */
async function assembleGatePack(manifest, { root, template, raid, now = new Date() } = {}) {
  if (!root) throw new Error('root is required');
  const gate = safeName(manifest?.gate);
  if (!gate) throw friendly('Give the gate a name (e.g. "Design gate").');
  const specs = (manifest.artefacts || []).filter((a) => a && (a.name || a.path));
  if (!specs.length) throw friendly('List the artefacts the gate needs.');
  const included = [], missing = [], openItems = [], warnings = [];
  for (const spec of specs) {
    const name = spec.name || path.basename(spec.path);
    const required = spec.required !== false;
    const cands = artefactCandidates(root, spec);
    if (!cands.length) { missing.push({ name, path: spec.path || '', required, reason: 'not found in the project folder' }); continue; }
    const info = [];
    for (const f of cands) info.push({ file: f, mtime: fs.statSync(f).mtimeMs, ...(await approvalOfFile(f)) });
    for (const i of info) i.ver = i.version ? String(i.version).split('.').map(Number) : versionOf(path.basename(i.file));
    info.sort((a, b) => cmpVersion(b.ver, a.ver) || b.mtime - a.mtime);
    const chosen = info.find((i) => i.approved);
    if (!chosen) { missing.push({ name, path: spec.path, required, reason: `no approved version (${info.map((i) => `${path.basename(i.file)}: ${i.reason || 'not approved'}`).join('; ')})` }); continue; }
    const newer = info.slice(0, info.indexOf(chosen)).map((i) => rel(root, i.file));
    if (newer.length) openItems.push({ type: 'Newer draft', item: name, detail: `Newer version${newer.length === 1 ? '' : 's'} not yet approved, left out of the pack: ${newer.join(', ')}.` });
    included.push({ name, file: rel(root, chosen.file), version: chosen.ver.join('.') || '', approver: chosen.approver || '', approvedAt: String(chosen.approvedAt || '').slice(0, 10), how: chosen.how, newerUnapproved: newer, _abs: chosen.file, _body: chosen.body });
  }
  for (const m of missing) openItems.push({ type: m.required ? 'Missing artefact' : 'Missing (optional)', item: m.name, detail: m.reason });
  const approvals = (manifest.approvals || []).map((a) => {
    const role = a.role || a.name || 'Approval';
    if (a.approver && a.date) return { role, status: 'Approved', approver: a.approver, date: a.date, source: 'given in the gate definition' };
    const art = a.artefact && included.find((i) => norm(i.name) === norm(a.artefact));
    if (art && art.approver) return { role, status: 'Approved', approver: art.approver, date: art.approvedAt, source: `approval on ${art.file}` };
    return { role, status: 'Open', approver: a.approver || '', date: '', source: a.artefact ? `${a.artefact} has no approved version` : 'not recorded' };
  });
  for (const a of approvals.filter((x) => x.status === 'Open')) openItems.push({ type: 'Approval', item: a.role, detail: `Approval still open (${a.source}).` });
  for (const t of [].concat(manifest.openItems || [])) if (String(t).trim()) openItems.push({ type: 'Open item', item: String(t).trim(), detail: 'from the gate definition' });
  if (raid) {
    try {
      const items = (await require('./status').readRaid(raid)).filter((i) => i.open && i.severity !== 'Low');
      for (const i of items) openItems.push({ type: `RAID ${i.kind}`, item: `${i.id} ${i.title}`, detail: `${i.severity}${i.owner ? `, owner ${i.owner}` : ', no owner'} (${path.basename(raid)} ${i.source.ref})` });
    } catch (e) { warnings.push(`The RAID log could not be read: ${e.message}`); }
  }

  const dir = path.join(root, 'Gate packs', gate);
  fs.mkdirSync(path.join(dir, 'Artefacts'), { recursive: true });
  const day = now.toISOString().slice(0, 10);
  for (const i of included) { const dest = freeName(path.join(dir, 'Artefacts', path.basename(i._abs))); fs.copyFileSync(i._abs, dest); i.copy = rel(root, dest); }
  const ready = !missing.some((m) => m.required) && approvals.every((a) => a.status === 'Approved');
  const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
  const index = [
    `# ${gate}: gate pack`, '',
    `Assembled ${day}. ${ready ? 'All required artefacts are approved and all approvals are recorded.' : '**Not complete:** see the open items.'}`, '',
    '## Artefacts', '', '| Artefact | Status | File | Version | Approved by | Approved on |', '|---|---|---|---|---|---|',
    ...included.map((i) => `| ${cell(i.name)} | Included | ${cell(i.file)} | ${cell(i.version)} | ${cell(i.approver)} | ${cell(i.approvedAt)} |`),
    ...missing.map((m) => `| ${cell(m.name)} | ${m.required ? 'Missing' : 'Missing (optional)'} | ${cell(m.path)} | | | |`), '',
    '## Approvals', '', '| Approval | Status | By | Date | Source |', '|---|---|---|---|---|',
    ...(approvals.length ? approvals.map((a) => `| ${cell(a.role)} | ${a.status} | ${cell(a.approver)} | ${cell(a.date)} | ${cell(a.source)} |`) : ['| (none listed) | | | | |']), '',
    '## Open items', '', ...(openItems.length ? ['| Type | Item | Detail |', '|---|---|---|', ...openItems.map((o) => `| ${cell(o.type)} | ${cell(o.item)} | ${cell(o.detail)} |`)] : ['None.']), '',
  ].join('\n');
  const indexFile = freeName(path.join(dir, `${gate} - index.md`));
  fs.writeFileSync(indexFile, index, 'utf8');

  const demote = (md) => String(md || '').replace(/^(#{1,5})\s/gm, '#$1 ');
  const parts = [index];
  for (const i of included) {
    const body = i._body != null ? i._body : docx.docxToText(i._abs);
    parts.push(`# ${i.name}`, '', `*${i.file}${i.version ? `, version ${i.version}` : ''}${i.approver ? `, approved by ${i.approver}${i.approvedAt ? ` on ${i.approvedAt}` : ''}` : ''}*`, '', demote(body.replace(/^#\s+.+\n/, '')));
  }
  const pack = freeName(path.join(dir, `${gate} - gate pack.docx`));
  const r = await require('./md-export').toDocx(parts.join('\n\n'), { title: `${gate}: gate pack`, template, fields: { date: day }, properties: { Gate: gate, 'Assembled at': now.toISOString(), Status: ready ? 'Complete' : 'Open items' } });
  if (r.warning) warnings.push(r.warning);
  fs.writeFileSync(pack, r.buffer);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Open items');
  ws.addRow(['#', 'Type', 'Item', 'Detail', 'Owner', 'Due', 'Status']);
  styleHeader(ws, [5, 18, 40, 70, 18, 12, 12]);
  openItems.forEach((o, n) => { ws.addRow([n + 1, o.type, o.item, o.detail, '', '', 'Open']).alignment = { vertical: 'top', wrapText: true }; });
  const log = freeName(path.join(dir, `${gate} - open items.xlsx`));
  await wb.xlsx.writeFile(log);

  return {
    gate, ready, folder: rel(root, dir), saved: { pack: rel(root, pack), index: rel(root, indexFile), openItems: rel(root, log) },
    included: included.map(({ _abs, _body, ...i }) => i), missing, approvals, openItems, warnings,
    summary: `${gate}: ${included.length} of ${specs.length} artefacts included (approved versions only), ${missing.length} missing, ${approvals.filter((a) => a.status === 'Open').length} approval${approvals.filter((a) => a.status === 'Open').length === 1 ? '' : 's'} open, ${plural(openItems.length, 'open item')}.`,
  };
}

// ------------------------------------------------------------------ 4. inventory
const RETIRE = /\b(retir\w*|decommission\w*|sunset\w*|remov\w*|switch(?:ed)? off|turn(?:ed)? off|replac\w*)\b/i;
const GENERIC_DIRS = new Set(['src', 'services', 'service', 'apps', 'app', 'packages', 'libs', 'lib', 'modules', 'components', 'integrations', 'apis', 'api', 'infra', 'infrastructure', 'deploy', 'test', 'tests', 'docs']);
const humanize = (s) => { const t = String(s).replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const ADD_RE = /\b(?:new|add(?:s|ed)?|build(?:s)?|introduc\w*|creat\w*|adopt\w*|use)\s+(?:the\s+|an?\s+)?((?:[\w-]+\s+){0,3}?[\w-]+\s+(?:service|API|integration|interface|gateway|engine|store|queue|portal|library))\b/gi;

/** Parse `git log --name-only` text into [{ hash, date, message, files }]. */
function parseGitLog(text) {
  const out = [];
  let cur = null;
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const c = /^commit\s+([0-9a-f]{7,40})/i.exec(line);
    if (c) { cur = { hash: c[1].slice(0, 7), date: '', message: '', files: [] }; out.push(cur); continue; }
    if (!cur) continue;
    const d = /^Date:\s+(.+)$/.exec(line);
    if (d) { const t = new Date(d[1]); cur.date = isNaN(t) ? d[1].trim() : t.toISOString().slice(0, 10); continue; }
    if (/^(Author|Merge):/.test(line)) continue;
    if (/^\s{4}/.test(line)) { cur.message += (cur.message ? ' ' : '') + line.trim(); continue; }
    if (line.trim()) cur.files.push(line.trim());
  }
  return out;
}
/** The component a path belongs to: the first folder that isn't a generic one (src, services, apps…). */
function componentOfPath(p) {
  const segs = p.split(/[\\/]/).filter(Boolean);
  if (segs.length < 2) return null;
  const dirs = segs.slice(0, -1);
  for (let i = 0; i < dirs.length; i++) if (!GENERIC_DIRS.has(dirs[i].toLowerCase())) return { name: dirs[i], parent: (dirs[i - 1] || '').toLowerCase() };
  return null;
}

async function readInventory(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const rows = [], sheets = [];
  for (const ws of wb.worksheets) {
    if (ws.name === 'Proposed changes') continue;
    const head = [];
    ws.getRow(1).eachCell((c, n) => { head[n] = cellText(c).trim(); });
    const col = (re) => head.findIndex((h) => h && re.test(h));
    const name = col(/^(name|component|api|integration|dependency|service|system|asset|interface)( name)?$/i);
    if (name < 1) continue;
    const s = { name: ws.name, head, cols: { name, status: col(/^(status|lifecycle)/i), lastChanged: col(/last (changed|updated)|^updated|^changed/i), notes: col(/^(notes?|comments?|remarks)$/i), type: col(/^type$/i), source: col(/^(source|evidence)$/i) } };
    sheets.push(s);
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const n = cellText(row.getCell(name)).trim();
      const all = []; row.eachCell((c) => { all.push(cellText(c)); });
      if (n) rows.push({ sheet: ws.name, row: r, name: n, text: all.join(' · '), status: s.cols.status > 0 ? cellText(row.getCell(s.cols.status)).trim() : '', lastChanged: s.cols.lastChanged > 0 ? cellText(row.getCell(s.cols.lastChanged)).trim() : '' });
    });
  }
  if (!sheets.length) throw friendly(`"${path.basename(file)}" needs at least one sheet with a "Name" (or Component, API, Integration) column.`);
  return { wb, rows, sheets };
}

function readChangeItems(wb, file) {
  const items = [];
  for (const ws of wb.worksheets) {
    const head = [];
    ws.getRow(1).eachCell((c, n) => { head[n] = cellText(c).trim(); });
    const col = (re) => head.findIndex((h) => h && re.test(h));
    const title = col(/^title$/i);
    if (title < 1) continue;
    const c = { id: col(/^id$/i), state: col(/^state$/i), tags: col(/^tags$/i), desc: col(/^description$/i), changed: col(/changed date|closed date|resolved date/i) };
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const g = (i) => (i > 0 ? cellText(row.getCell(i)).trim() : '');
      if (g(title)) items.push({ id: g(c.id), title: g(title), state: g(c.state), text: [g(title), g(c.tags), g(c.desc)].join(' '), date: g(c.changed).slice(0, 10), at: `${path.basename(file)} ${ws.name}!A${r}` });
    });
  }
  return items;
}

/**
 * inventory: the catalogue workbook. sources: { adoExports: [files], gitLogs: [files], adrs: folder, documents: [files] }.
 * opts: { root }. Writes "<inventory> (proposed).xlsx": affected rows highlighted, new rows appended (Status
 * "Proposed (new)"), and a "Proposed changes" sheet with an "Approve? (Yes/No)" column. The inventory is unchanged.
 */
async function diffInventory(inventory, sources = {}, { root } = {}) {
  const { wb, rows, sheets } = await readInventory(inventory);
  const signals = [];
  const match = (name) => rows.find((r) => slug(r.name) === slug(name)) || rows.find((r) => slug(r.name).replace(/(service|api|component)$/, '') === slug(name).replace(/(service|api|component)$/, '') && slug(name).length > 4);
  const mentioned = (text) => rows.filter((r) => mentions(text, r.name));
  const signal = (s) => signals.push(s);
  const known = (name) => !!match(name) || rows.some((r) => mentions(r.text, name));
  const kindOfName = (n, parent = '') => (/\bapi$/i.test(n) || /^apis?$/.test(parent) ? 'API' : /integration|interface/i.test(n) || /^integrations?$/.test(parent) ? 'integration' : 'component');
  const used = { ado: 0, git: 0, adrs: 0, documents: 0 };

  for (const f of [].concat(sources.adoExports || [])) {
    for (const it of readChangeItems(await excel.open(f), f)) {
      used.ado++;
      const ev = { source: 'Azure DevOps', ref: `${it.id ? `#${it.id} ` : ''}${it.title}`, at: it.at, date: it.date };
      for (const r of mentioned(it.text)) signal({ action: RETIRE.test(it.title) && new RegExp(`${RETIRE.source}[^.]*${r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(it.title) ? 'Retire' : 'Update', row: r, ...ev });
      for (const m of it.title.matchAll(ADD_RE)) if (!known(m[1]) && !mentioned(m[1]).length) signal({ action: 'Add', name: humanize(m[1]).replace(/\bapi\b/i, 'API'), kind: kindOfName(m[1]), ...ev });
    }
  }
  for (const f of [].concat(sources.gitLogs || [])) {
    for (const c of parseGitLog(fs.readFileSync(f, 'utf8'))) {
      used.git++;
      const ev = { source: 'git log', ref: `${c.hash} ${c.message}`.trim(), at: path.basename(f), date: c.date };
      const comps = new Map();
      for (const p of c.files) { const k = componentOfPath(p); if (k && !comps.has(k.name.toLowerCase())) comps.set(k.name.toLowerCase(), { ...k, files: 0 }); if (k) comps.get(k.name.toLowerCase()).files++; }
      const retireNamed = RETIRE.test(c.message) ? mentioned(c.message) : [];
      for (const r of retireNamed) signal({ action: 'Retire', row: r, ...ev });
      for (const k of comps.values()) {
        const r = match(k.name) || match(humanize(k.name));
        if (r) { if (!retireNamed.includes(r)) signal({ action: RETIRE.test(c.message) && mentions(c.message, humanize(k.name)) ? 'Retire' : 'Update', row: r, ...ev, ref: `${ev.ref} (${plural(k.files, 'file')} in ${k.name}/)` }); }
        else if (!RETIRE.test(c.message)) signal({ action: 'Add', name: humanize(k.name), kind: kindOfName(k.name, k.parent), ...ev, ref: `${ev.ref} (new folder ${k.name}/)` });
      }
    }
  }
  if (sources.adrs) {
    const idx = readAdrs(sources.adrs, { root });
    for (const a of idx.index) {
      const full = idx._byId.get(a.id);
      if (!full || full.status !== 'Accepted' || full.supersededBy) continue;
      used.adrs++;
      const text = `${full.title}. ${full.decision}`;
      const ev = { source: 'ADR', ref: `${a.id} ${full.title}`, at: a.file, date: full.date || '' };
      for (const r of mentioned(text)) signal({ action: RETIRE.test(text) && new RegExp(`${RETIRE.source}[^.]*${r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text) ? 'Retire' : 'Update', row: r, ...ev });
      for (const m of text.matchAll(ADD_RE)) if (!known(m[1]) && !mentioned(m[1]).length) signal({ action: 'Add', name: humanize(m[1]).replace(/\bapi\b/i, 'API'), kind: kindOfName(m[1]), ...ev });
    }
  }
  for (const f of [].concat(sources.documents || [])) {
    used.documents++;
    for (const n of extractNames(readText(f)).names) if (!known(n.name) && !rows.some((r) => mentions(n.name, r.name) || mentions(r.name, n.name))) signal({ action: 'Add', name: n.name, kind: n.kind, source: 'Design document', ref: `${rel(root, f)} (${n.heading || 'top'})`, at: rel(root, f), date: '' });
  }
  if (!Object.values(used).some(Boolean)) throw friendly('Give at least one change source: an Azure DevOps export, a git log text file, an ADR folder or design documents.');

  // One proposal per row (Retire beats Update) and per new name.
  const proposals = [];
  for (const s of signals) {
    const key = s.row ? `${s.row.sheet}!${s.row.row}` : `new:${slug(s.name).replace(/(service|api|component)$/, '')}`;
    let p = proposals.find((x) => x.key === key);
    if (!p) { p = { key, action: s.action, row: s.row, name: s.row ? s.row.name : s.name, kind: s.kind, evidence: [] }; proposals.push(p); }
    if (s.action === 'Retire') p.action = 'Retire';
    if (!p.evidence.some((e) => e.ref === s.ref)) p.evidence.push({ source: s.source, ref: s.ref, at: s.at, date: s.date });
  }
  for (const p of proposals) {
    p.date = p.evidence.map((e) => e.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop() || '';
    if (p.action === 'Retire' && /retir|decommission/i.test(p.row.status)) p.skip = true;
  }
  const live = proposals.filter((p) => !p.skip);

  const sheetFor = (kind) => sheets.find((s) => (kind === 'API' ? /api/i : kind === 'integration' ? /integration|interface/i : /component|solution|system|application/i).test(s.name)) || sheets[0];
  const fields = [];
  for (const p of live) {
    const ev = p.evidence.map((e) => `${e.source}: ${e.ref}`).join('; ');
    if (p.action === 'Add') {
      const s = sheetFor(p.kind), ws = wb.getWorksheet(s.name);
      const r = ws.getRow(Math.max(ws.rowCount, 1) + 1);
      r.getCell(s.cols.name).value = p.name;
      if (s.cols.status > 0) r.getCell(s.cols.status).value = 'Proposed (new)';
      if (s.cols.type > 0) r.getCell(s.cols.type).value = humanize(p.kind).replace(/^Api$/, 'API');
      if (s.cols.lastChanged > 0 && p.date) r.getCell(s.cols.lastChanged).value = p.date;
      if (s.cols.notes > 0) r.getCell(s.cols.notes).value = `Proposed from ${ev}`;
      r.eachCell({ includeEmpty: true }, (c, n) => { if (n <= s.head.length - 1) c.fill = NEW_ROW; });
      p.sheet = s.name; p.at = `${s.name}!A${r.number}`;
      fields.push({ p, field: '(new row)', current: '', proposed: `${p.name} (${humanize(p.kind).replace(/^Api$/, 'API')})` });
      continue;
    }
    const s = sheets.find((x) => x.name === p.row.sheet), ws = wb.getWorksheet(s.name), r = ws.getRow(p.row.row);
    p.sheet = s.name; p.at = `${s.name}!A${p.row.row}`;
    r.eachCell({ includeEmpty: true }, (c, n) => { if (n <= s.head.length - 1) c.fill = p.action === 'Retire' ? RETIRE_ROW : HIGHLIGHT; });
    if (p.action === 'Retire') fields.push({ p, field: s.head[s.cols.status] || 'Status', current: p.row.status, proposed: 'Retired' });
    if (s.cols.lastChanged > 0 && p.date && p.date > (p.row.lastChanged || '')) fields.push({ p, field: s.head[s.cols.lastChanged], current: p.row.lastChanged, proposed: p.date });
    if (p.action === 'Update' && !(s.cols.lastChanged > 0 && p.date && p.date > (p.row.lastChanged || ''))) fields.push({ p, field: 'Review', current: '', proposed: 'Check the row against the change' });
  }
  const old = wb.getWorksheet('Proposed changes'); if (old) wb.removeWorksheet(old.id);
  const rs = wb.addWorksheet('Proposed changes', { properties: { tabColor: { argb: 'FFFFC000' } } });
  rs.addRow(['#', 'Approve? (Yes/No)', 'Change', 'Sheet', 'Row', 'Name', 'Field', 'Current', 'Proposed', 'Evidence']);
  styleHeader(rs, [4, 18, 10, 18, 10, 34, 16, 16, 30, 80]);
  fields.forEach((f, n) => {
    const r = rs.addRow([n + 1, '', f.p.action, f.p.sheet, f.p.at, f.p.name, f.field, f.current, f.proposed, f.p.evidence.map((e) => `${e.source}: ${e.ref} (${e.at})`).join('\n')]);
    r.alignment = { vertical: 'top', wrapText: true };
    r.getCell(2).fill = HIGHLIGHT;
    r.getCell(2).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
  });
  wb.views = [{ activeTab: wb.worksheets.indexOf(rs) }];
  const out = path.join(path.dirname(inventory), `${path.basename(inventory, path.extname(inventory)).replace(/\s*\((proposed|updated)\)\s*$/i, '')} (proposed).xlsx`);
  await wb.xlsx.writeFile(out);
  const count = (a) => live.filter((p) => p.action === a).length;
  return {
    saved: out, sourcesRead: used,
    proposals: live.map((p) => ({ action: p.action, name: p.name, at: p.at, evidence: p.evidence })),
    alreadyRetired: proposals.filter((p) => p.skip).map((p) => p.name),
    summary: `${count('Add')} to add, ${count('Update')} changed, ${count('Retire')} to retire, from ${[used.ado && `${used.ado} work items`, used.git && `${used.git} commits`, used.adrs && `${used.adrs} accepted ADRs`, used.documents && plural(used.documents, 'design document')].filter(Boolean).join(', ')}.`,
    next: 'Open the "(proposed)" workbook, set Approve? to Yes or No on each row of "Proposed changes", and update the inventory with the approved rows. The inventory itself has not been changed.',
  };
}

module.exports = { parseAdr, readAdrs, adrRefs, extractNames, mentions, readDataModel, checkConsistency, assembleGatePack, diffInventory, parseGitLog, componentOfPath, scan, readText };
