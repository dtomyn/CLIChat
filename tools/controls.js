// Security controls and SA&A evidence (UC 21, 22, 23). No AI here: the code does the matching and gap counting, the AI
// drafts the narrative and an assessor approves.
//
// 1. readControlCatalogue: the program's own control catalogue workbook (ID, family, title, statement, baseline or
//    profile). Lumen ships no ITSG-33 or NIST text; the sample catalogue is synthetic.
// 2. readSctm / writeSctm: the security control traceability matrix (control, applicability, implementation statement,
//    responsible party, design reference, evidence references, status Planned/Implemented/Gap).
// 3. indexEvidence: walk an Evidence/ folder. Files are tied to controls by an ID in the file name ("AC-2 - user access
//    review.pdf"), by an evidence index workbook in the folder, or by the SCTM's evidence references. Returns, per
//    control, the evidence found, missing evidence, stale evidence (older than N days) and orphan files.
// 4. analyzeControls: coverage of the catalogue, implementation statements whose design reference is not a real
//    heading in the FDD/TDD (needs input), gaps, and the evidence check. Read-only.
// 5. proposeSctm: write "<SCTM> (proposed).xlsx" with the changes highlighted, a "Proposed changes" sheet with an
//    "Approve? (Yes/No)" column, statements without a real design citation marked "Needs input", and remediation
//    items as an Azure DevOps import workbook. The original SCTM is never changed.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const excel = require('./excel');
const { readSheet, wall } = require('./release');
const { scan, readText } = require('./governance');

const DAY = 86400000;
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
const HIGHLIGHT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const NEW_ROW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } };
const NEEDS_INPUT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
const norm = (s) => String(s || '').toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const rel = (root, f) => (root ? path.relative(root, f).split(path.sep).join('/') : path.basename(f));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const text = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim());
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

// ------------------------------------------------------------------ control IDs
/** "ac-02", "AC 2", "AC-2 (1)" → "AC-2", "AC-2(1)". Anything else is returned trimmed and upper-cased. */
function normId(s) {
  const t = String(s ?? '').trim();
  const m = /^([A-Za-z]{2,3})[-_ ]?0*(\d{1,3})(?:\s*\(\s*0*(\d{1,3})\s*\))?$/.exec(t);
  return m ? `${m[1].toUpperCase()}-${+m[2]}${m[3] ? `(${+m[3]})` : ''}` : t.toUpperCase();
}
const ID_IN_TEXT = /(?<![A-Za-z0-9])([A-Za-z]{2,3})-0*(\d{1,3})(?:\s*\(\s*0*(\d{1,3})\s*\))?(?!\d)/g;
/** Control IDs written in a text or file name ("AC-2", "SC-13(1)"). */
function idsIn(s) {
  return [...new Set([...String(s || '').matchAll(ID_IN_TEXT)].map((m) => `${m[1].toUpperCase()}-${+m[2]}${m[3] ? `(${+m[3]})` : ''}`))];
}
const baseId = (id) => String(id).replace(/\(\d+\)$/, '');

// ------------------------------------------------------------------ statuses
function statusOf(s) {
  const t = text(s);
  if (!t) return '';
  if (/needs? input|^tb[cd]$|to be confirmed/i.test(t)) return 'Needs input';
  if (/not applicable|^n\/?a$/i.test(t)) return 'Not applicable';
  if (/gap|not (yet )?implemented|missing|non.?compliant|not met/i.test(t)) return 'Gap';
  if (/partial/i.test(t)) return 'Partially implemented';
  if (/implement|in place|complete|done|^met$|compliant/i.test(t)) return 'Implemented';
  if (/plan|progress|scheduled|to ?do|open/i.test(t)) return 'Planned';
  return t;
}
function applicabilityOf(s) {
  const t = text(s);
  if (!t) return '';
  if (/not applicable|^n\/?a$|^no$|excluded/i.test(t)) return 'Not applicable';
  if (/inherit|provider|csp/i.test(t)) return 'Inherited';
  if (/hybrid|shared|common/i.test(t)) return 'Shared';
  return 'Applicable';
}
const needsEvidence = (r) => ['Implemented', 'Partially implemented'].includes(r.status) && r.applicability !== 'Not applicable';

// ------------------------------------------------------------------ 1. catalogue
const CATALOGUE = {
  id: [/^(control )?(id|ref|reference|identifier|number|no\.?)$/i, /^control$/i],
  family: [/family|class/i],
  title: [/^(control )?(title|name)$/i],
  statement: [/statement|requirement|description|text|objective/i],
  baseline: [/baseline|profile|selected|in scope/i],
};
const NOT_SELECTED = /^(no|n|false|not selected|excluded|out of scope|-|—|0)$/i;

/** Read the program's control catalogue. Returns { controls: [{ id, family, title, statement, baseline, inProfile, at }] }. */
async function readControlCatalogue(file) {
  const wb = await excel.open(file);
  const sheet = readSheet(wb, CATALOGUE, ['id']);
  if (!sheet || !(sheet.map.title || sheet.map.statement)) throw friendly(`"${path.basename(file)}" needs a control catalogue sheet with a "Control ID" column and a "Title" or "Statement" column.`);
  const controls = [], dup = [];
  for (const r of sheet.rows) {
    const id = normId(text(r.id));
    if (!id) continue;
    if (controls.some((c) => c.id === id)) { dup.push(id); continue; }
    const baseline = text(r.baseline);
    controls.push({ id, family: text(r.family), title: text(r.title), statement: text(r.statement).replace(/\s+/g, ' '), baseline, inProfile: sheet.map.baseline ? !!baseline && !NOT_SELECTED.test(baseline) : true, at: r.at });
  }
  if (!controls.length) throw friendly(`"${path.basename(file)}" has no controls.`);
  return { file, sheet: sheet.ws.name, controls, warnings: dup.length ? [`Control IDs listed more than once (first row used): ${[...new Set(dup)].join(', ')}.`] : [] };
}

// ------------------------------------------------------------------ 2. SCTM
const SCTM_FIELDS = {
  control: [/^(control( id| ref| number)?|id|ref)$/i, /^control/i],
  title: [/^(control )?(title|name)$/i],
  applicability: [/applicab/i, /^(in scope|scope)$/i],
  status: [/^(implementation )?status$/i, /^state$/i],
  statement: [/implementation (statement|description|detail)/i, /^implementation$/i, /statement/i, /how (it is|we) (implement|meet)/i],
  responsible: [/responsib|owner|^party$|accountable/i],
  design: [/design/i, /^(section|reference|citation)$/i],
  evidence: [/evidence|artefact|artifact|proof/i],
  notes: [/^(notes?|comments?|remarks)$/i],
};
const SCTM_COLUMNS = [
  ['control', 'Control ID', 12], ['title', 'Control title', 28], ['applicability', 'Applicability', 14], ['statement', 'Implementation statement', 60],
  ['responsible', 'Responsible party', 22], ['design', 'Design reference', 36], ['evidence', 'Evidence references', 40], ['status', 'Status', 14], ['notes', 'Notes', 30],
];

/** Read an SCTM workbook. Returns { rows: [{ control, title, applicability, statement, responsible, designReference, evidence: [refs], status, statusText, notes, at, row }] }. */
async function readSctm(file) {
  const wb = await excel.open(file);
  const sheet = readSheet(wb, SCTM_FIELDS, ['control'], /^(about|summary|notes?|instructions?|read me|how to use|proposed changes)$/i);
  if (!sheet || !(sheet.map.statement || sheet.map.status)) throw friendly(`"${path.basename(file)}" needs an SCTM sheet with a "Control ID" column and an "Implementation statement" or "Status" column.`);
  const rows = sheet.rows.map((r) => ({
    control: normId(text(r.control)), title: text(r.title), applicability: applicabilityOf(r.applicability), statement: text(r.statement),
    responsible: text(r.responsible), designReference: text(r.design), evidence: text(r.evidence).split(/[;\n]+/).map((s) => s.trim()).filter(Boolean),
    status: statusOf(r.status), statusText: text(r.status), notes: text(r.notes), at: r.at, row: r.row,
  })).filter((r) => r.control);
  return { file, sheet: sheet.ws.name, map: sheet.map, rows, wb };
}

/** Write a fresh SCTM workbook (one row per control). rows use the readSctm field names; evidence may be an array. */
async function writeSctm(file, rows, { created } = {}) {
  const wb = new ExcelJS.Workbook();
  if (created) { wb.created = created; wb.modified = created; }
  const ws = wb.addWorksheet('SCTM');
  ws.addRow(SCTM_COLUMNS.map((c) => c[1]));
  styleHeader(ws, SCTM_COLUMNS.map((c) => c[2]));
  for (const r of rows || []) {
    const v = { ...r, control: normId(r.control), design: r.designReference ?? r.design ?? '', evidence: [].concat(r.evidence || []).join('; ') };
    ws.addRow(SCTM_COLUMNS.map(([k]) => v[k] ?? '')).alignment = { vertical: 'top', wrapText: true };
  }
  ws.getColumn(3).eachCell((c, n) => { if (n > 1) c.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Applicable,Not applicable,Inherited,Shared"'] }; });
  ws.getColumn(8).eachCell((c, n) => { if (n > 1) c.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Planned,Implemented,Partially implemented,Gap,Needs input"'] }; });
  await wb.xlsx.writeFile(file);
  return { saved: file, rows: (rows || []).length };
}

// ------------------------------------------------------------------ design documents and citations
/** Headings of the FDD/TDD (Markdown, text or Word): [{ file, name, headings: [{ text, title, number, level, line }] }]. */
function readDesignDocs(files = [], root) {
  return [].concat(files || []).map((f) => {
    const headings = scan(readText(f)).headings.map((h) => {
      const m = /^(?:§\s*)?(\d+(?:\.\d+)*)\.?\s+(.+)$/.exec(h.text);
      return { text: h.text, title: (m ? m[2] : h.text).trim(), number: m ? m[1] : '', level: h.level, line: h.line };
    });
    return { file: rel(root, f), name: path.basename(f), headings };
  });
}

const ABBREV = [[/\btdd\b/, /technical design|\btdd\b/i], [/\bfdd\b/, /functional design|\bfdd\b/i], [/\bsdd\b/, /security design|\bsdd\b/i], [/\bsad\b/, /architecture|\bsad\b/i]];
/**
 * Does a design reference ("Technical Design - Security.md > 3.2 Encryption at rest", "TDD §3.2", "TDD > Key
 * management") name a real heading? Returns { ok: true, file, heading, line } or { ok: false, reason }; ok is null
 * when no design documents were given.
 */
function citation(ref, docs = []) {
  const r = text(ref);
  if (!r) return { ok: false, reason: 'no design reference' };
  if (!docs.length) return { ok: null, reason: 'no design documents were given, so the reference was not checked' };
  let nr = ` ${norm(r)} `;
  const named = [];
  for (const d of docs) {
    const stem = norm(d.name.replace(/\.[^.]+$/, ''));
    if (stem && nr.includes(` ${stem} `)) { named.push(d); nr = nr.replace(` ${stem} `, ' '); continue; }
    if (ABBREV.some(([a, full]) => a.test(nr) && full.test(d.name))) named.push(d);
  }
  nr = nr.replace(/ md | docx | txt /g, ' ');
  const pool = named.length ? named : docs;
  let best = null;
  for (const d of pool) for (const h of d.headings) {
    const t = norm(h.title);
    const byTitle = t.length >= 3 && nr.includes(` ${t} `);
    const byNumber = h.number && new RegExp(`(?:^|[\\s§#>]|section\\s*|sec\\.?\\s*)${escape(h.number)}(?![\\d.]\\d)`, 'i').test(r);
    if (!byTitle && !byNumber) continue;
    const score = (byTitle ? t.length : 0) + (byNumber ? 100 : 0) + h.level;
    if (!best || score > best.score) best = { score, file: d.file, heading: h.text, line: h.line };
  }
  if (best) return { ok: true, file: best.file, heading: best.heading, line: best.line };
  return { ok: false, reason: `no heading matching "${r}" in ${pool.map((d) => d.name).join(', ')}` };
}

// ------------------------------------------------------------------ 3. evidence
function walk(dir, depth = 0, out = []) {
  if (depth > 4 || !fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('~$') || e.name === 'node_modules') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, depth + 1, out); else out.push(f);
  }
  return out;
}
const isIndexBook = (f) => /\.(xlsx|xlsm|csv)$/i.test(f) && /index|register|list/i.test(path.basename(f));
const dateInName = (s) => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s); return m && wall(m[0]) != null ? m[0] : null; };
const INDEX_FIELDS = { file: [/^(file|file ?name|document|evidence|artefact|artifact|name|path)$/i, /file|evidence|document/i], controls: [/control/i], date: [/date|collected|captured|as of|dated/i], description: [/descri|title|summary/i] };

/**
 * folder: the Evidence/ folder. sctmRows: readSctm rows (or []). opts: { known: control IDs (Set or array) from the
 * catalogue/SCTM, asOf 'YYYY-MM-DD' (default today), staleDays (365), root (for relative paths) }.
 */
async function indexEvidence(folder, sctmRows = [], { known, asOf, staleDays = 365, root } = {}) {
  if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw friendly(`Can't find the evidence folder "${folder}".`);
  folder = path.resolve(folder);
  root = path.resolve(root || path.dirname(folder));
  const today = asOf ? wall(String(asOf).slice(0, 10)) : wall(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  if (today == null) throw friendly(`"${asOf}" isn't a date. Use YYYY-MM-DD.`);
  staleDays = +staleDays || 365;
  const ids = new Set([...(known || []), ...sctmRows.map((r) => r.control)].map(normId));
  const knownId = (id) => (ids.has(id) ? id : ids.has(baseId(id)) ? baseId(id) : null);
  const all = walk(folder);
  const indexBooks = all.filter(isIndexBook);
  const files = all.filter((f) => !indexBooks.includes(f));
  const byName = new Map(); for (const f of files) { const k = path.basename(f).toLowerCase(); if (!byName.has(k)) byName.set(k, f); }
  const warnings = [];
  const locate = (ref) => {
    const r = ref.replace(/^["']|["']$/g, '').trim();
    if (/^https?:\/\//i.test(r)) return { link: true };
    for (const base of [folder, root]) { const full = path.resolve(base, r); if (fs.existsSync(full) && fs.statSync(full).isFile()) return { file: full }; }
    const hit = byName.get(path.basename(r).toLowerCase());
    return hit ? { file: hit } : { file: null };
  };

  // Evidence index workbooks: File, Control(s), Date.
  const indexed = new Map(); // file → { controls, date, at }
  const missing = [];
  for (const book of indexBooks) {
    let sheet;
    try { sheet = readSheet(await excel.open(book), INDEX_FIELDS, ['file']); } catch (e) { warnings.push(`The evidence index "${path.basename(book)}" could not be read: ${e.message}`); continue; }
    if (!sheet || !sheet.map.controls) { warnings.push(`"${path.basename(book)}" was not used as an evidence index: it needs "File" and "Control" columns.`); continue; }
    for (const r of sheet.rows) {
      const ref = text(r.file), controls = idsIn(text(r.controls)).map((x) => knownId(x) || x);
      if (!ref) continue;
      const at = `${path.basename(book)} ${r.at}`;
      const loc = locate(ref);
      if (loc.link) continue;
      if (!loc.file) { for (const c of controls) missing.push({ control: c, ref, reason: `listed in the evidence index (${at}) but not in the folder` }); continue; }
      const d = r.date instanceof Date ? day(+r.date) : dateInName(text(r.date)) || (wall(text(r.date)) != null ? text(r.date).slice(0, 10) : null);
      indexed.set(loc.file, { controls, date: d, at });
    }
  }

  // Every file: controls from its name and the index, and its date.
  const info = new Map();
  for (const f of files) {
    const nameIds = idsIn(path.basename(f));
    const ix = indexed.get(f);
    const date = ix?.date || dateInName(path.basename(f)) || day(fs.statSync(f).mtimeMs - new Date().getTimezoneOffset() * 60000);
    const dateFrom = ix?.date ? 'evidence index' : dateInName(path.basename(f)) ? 'file name' : 'file date';
    info.set(f, { file: rel(root, f), nameIds, controls: new Set([...nameIds.map(knownId).filter(Boolean), ...(ix ? ix.controls : [])]), unknownIds: nameIds.filter((x) => !knownId(x)), date, dateFrom, ageDays: Math.round((today - wall(date)) / DAY), referenced: false, indexed: !!ix });
  }
  // SCTM evidence references.
  const refsOf = new Map();
  for (const r of sctmRows) {
    for (const ref of r.evidence || []) {
      const loc = locate(ref);
      if (loc.link) continue;
      if (!loc.file) { missing.push({ control: r.control, ref, reason: `named in the SCTM (${r.at}) but not in the evidence folder`, at: r.at }); continue; }
      if (!info.has(loc.file)) { const d = dateInName(path.basename(loc.file)) || day(fs.statSync(loc.file).mtimeMs); info.set(loc.file, { file: rel(root, loc.file), nameIds: [], controls: new Set(), unknownIds: [], date: d, dateFrom: dateInName(path.basename(loc.file)) ? 'file name' : 'file date', ageDays: Math.round((today - wall(d)) / DAY), referenced: false, outside: true }); }
      const i = info.get(loc.file);
      i.referenced = true; i.controls.add(r.control);
      if (!refsOf.has(r.control)) refsOf.set(r.control, new Set());
      refsOf.get(r.control).add(loc.file);
    }
  }

  const stale = [];
  const perControl = [];
  const controlsSeen = [...new Set([...sctmRows.map((r) => r.control), ...[...info.values()].flatMap((i) => [...i.controls])])];
  for (const c of controlsSeen) {
    const row = sctmRows.find((r) => r.control === c);
    const found = [...info.entries()].filter(([, i]) => i.controls.has(c)).map(([f, i]) => ({
      file: i.file, date: i.date, dateFrom: i.dateFrom, ageDays: i.ageDays, stale: i.ageDays > staleDays,
      how: [refsOf.get(c)?.has(f) && 'SCTM reference', i.nameIds.some((x) => knownId(x) === c) && 'file name', i.indexed && indexed.get(f)?.controls.includes(c) && 'evidence index'].filter(Boolean).join(', '),
    }));
    for (const e of found.filter((x) => x.stale)) stale.push({ control: c, file: e.file, date: e.date, dateFrom: e.dateFrom, ageDays: e.ageDays });
    const miss = missing.filter((m) => m.control === c);
    if (row && needsEvidence(row) && !found.length && !miss.length) missing.push({ control: c, ref: '', reason: `marked ${row.status} in the SCTM (${row.at}) but no evidence was found`, at: row.at });
    perControl.push({ control: c, status: row ? row.status || '(no status)' : '(not in the SCTM)', found, missing: missing.filter((m) => m.control === c).map((m) => m.ref || m.reason), stale: found.filter((x) => x.stale).map((x) => x.file) });
  }
  const orphans = [...info.values()].filter((i) => !i.outside && !i.controls.size).map((i) => ({
    file: i.file, date: i.date,
    reason: i.unknownIds.length ? `names ${i.unknownIds.join(', ')}, which ${i.unknownIds.length === 1 ? 'is' : 'are'} not in the catalogue or the SCTM` : 'no control ID in the file name, and not named in the SCTM or the evidence index',
  }));
  return {
    folder: rel(root, folder), asOf: day(today), staleDays, files: files.length, indexBooks: indexBooks.map((f) => rel(root, f)),
    perControl, missing, stale, orphans, warnings,
    summary: `${plural(files.length, 'evidence file')} for ${plural(perControl.filter((p) => p.found.length).length, 'control')}; ${missing.length} missing, ${stale.length} stale (older than ${staleDays} days on ${day(today)}), ${plural(orphans.length, 'orphan file')}.`,
  };
}

// ------------------------------------------------------------------ 4. analysis
/**
 * inputs: { catalogue, sctm, evidence (folder), documents: [FDD/TDD files] }. opts: { root, asOf, staleDays }.
 * Read-only: coverage, statements that need input, gaps and the evidence check, each citing its cell or file.
 */
async function analyzeControls({ catalogue, sctm, evidence, documents = [] } = {}, { root, asOf, staleDays } = {}) {
  if (!catalogue && !sctm) throw friendly('Give the control catalogue, the SCTM, or both.');
  const cat = catalogue ? await readControlCatalogue(catalogue) : null;
  const matrix = sctm ? await readSctm(sctm) : null;
  const rows = matrix ? matrix.rows : [];
  const docs = readDesignDocs(documents, root);
  const notes = [...(cat ? cat.warnings : [])];
  const inProfile = cat ? cat.controls.filter((c) => c.inProfile) : [];
  const catIds = new Set(cat ? cat.controls.map((c) => c.id) : []);
  const coverage = {
    catalogueControls: cat ? cat.controls.length : null, inProfile: cat ? inProfile.length : null, inSctm: rows.length,
    notMapped: matrix ? inProfile.filter((c) => !rows.some((r) => r.control === c.id)).map((c) => ({ control: c.id, title: c.title, at: c.at })) : [],
    notInCatalogue: cat ? rows.filter((r) => !catIds.has(r.control) && !catIds.has(baseId(r.control))).map((r) => ({ control: r.control, at: r.at })) : [],
    byStatus: {}, byApplicability: {},
  };
  for (const r of rows) { const s = r.status || '(no status)'; coverage.byStatus[s] = (coverage.byStatus[s] || 0) + 1; const a = r.applicability || '(not set)'; coverage.byApplicability[a] = (coverage.byApplicability[a] || 0) + 1; }
  const titleOf = (id) => (cat ? (cat.controls.find((c) => c.id === id) || cat.controls.find((c) => c.id === baseId(id)) || {}).title || '' : '');
  const live = rows.filter((r) => r.applicability !== 'Not applicable' && r.status !== 'Not applicable');
  const noStatement = live.filter((r) => !r.statement).map((r) => ({ control: r.control, status: r.status, at: r.at }));
  const citations = [], needsInput = [];
  for (const r of live.filter((x) => x.statement)) {
    const c = citation(r.designReference, docs);
    citations.push({ control: r.control, designReference: r.designReference, ...c, at: r.at });
    if (c.ok === false) needsInput.push({ control: r.control, title: titleOf(r.control) || r.title, reason: c.reason, designReference: r.designReference, at: r.at });
  }
  if (!docs.length && live.some((r) => r.statement)) notes.push('No FDD/TDD was given, so design references were not checked against real headings.');
  const noStatus = rows.filter((r) => !r.status).map((r) => ({ control: r.control, at: r.at }));
  const noResponsible = live.filter((r) => !r.responsible && r.statement).map((r) => ({ control: r.control, at: r.at }));
  const ev = evidence ? await indexEvidence(evidence, rows, { known: [...catIds], asOf, staleDays, root }) : null;
  if (!evidence && rows.some(needsEvidence)) notes.push('No evidence folder was given, so evidence was not checked.');
  const remediation = [];
  for (const r of rows.filter((x) => x.status === 'Gap')) remediation.push({ control: r.control, title: titleOf(r.control) || r.title, reason: `Control gap${r.notes ? `: ${r.notes}` : ''}`, at: r.at });
  if (ev) {
    for (const m of ev.missing) remediation.push({ control: m.control, title: titleOf(m.control), reason: m.ref ? `Missing evidence "${m.ref}"` : 'No evidence for an implemented control', at: m.at || '' });
    for (const s of ev.stale) remediation.push({ control: s.control, title: titleOf(s.control), reason: `Stale evidence "${s.file}" (${s.date}, ${s.ageDays} days old)`, at: s.file });
  }
  const n = (x) => x.length;
  return {
    catalogue: catalogue ? rel(root, catalogue) : null, sctm: sctm ? rel(root, sctm) : null, documents: docs.map((d) => ({ file: d.file, headings: d.headings.length })),
    coverage, statements: { noStatement, needsInput, citations, noStatus, noResponsible }, evidence: ev, remediation, notes,
    summary: [
      cat ? `${coverage.inSctm} of ${coverage.inProfile} controls in the profile are in the SCTM (${n(coverage.notMapped)} not mapped${n(coverage.notInCatalogue) ? `, ${n(coverage.notInCatalogue)} not in the catalogue` : ''})` : `${coverage.inSctm} controls in the SCTM`,
      Object.entries(coverage.byStatus).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', '),
      `${plural(n(needsInput), 'statement')} need${n(needsInput) === 1 ? 's' : ''} input (design reference not found), ${n(noStatement)} applicable control${n(noStatement) === 1 ? ' has' : 's have'} no statement`,
      ev ? `evidence: ${n(ev.missing)} missing, ${n(ev.stale)} stale, ${n(ev.orphans)} orphan` : null,
    ].filter(Boolean).join('; ') + '.',
  };
}

// ------------------------------------------------------------------ 5. proposals
const FIELD_LABEL = { applicability: 'Applicability', statement: 'Implementation statement', responsible: 'Responsible party', design: 'Design reference', evidence: 'Evidence references', status: 'Status', notes: 'Notes', title: 'Control title' };
const asEvidence = (v) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).join('; ') : text(v));

/**
 * sctmFile: the SCTM to propose changes to (or null to start one). rows: [{ control, applicability, statement,
 * responsible, designReference, evidence, status, notes }]. opts: { catalogue, documents: [FDD/TDD], remediation:
 * [{ control, title, description, priority, owner }], root }. Writes "<SCTM> (proposed).xlsx" and, when there are
 * remediation items, "<SCTM> - remediation (ADO import).xlsx". The SCTM itself is never changed.
 */
async function proposeSctm(sctmFile, rows = [], { catalogue, documents = [], remediation = [], root } = {}) {
  if (!Array.isArray(rows)) rows = [];
  const hasRemediation = (remediation || []).some((x) => x && (x.title || x.control));
  if (!rows.length && !hasRemediation) throw friendly('Give at least one SCTM row or remediation item.');
  const cat = catalogue ? await readControlCatalogue(catalogue) : null;
  const docs = readDesignDocs(documents, root);
  const warnings = [];
  if (!docs.length) warnings.push('No FDD/TDD was given, so design references were not checked. Rows without a design reference are still marked Needs input.');
  let wb, ws, map, existing = [];
  if (sctmFile) {
    const m = await readSctm(sctmFile);
    wb = m.wb; ws = wb.getWorksheet(m.sheet); map = { ...m.map }; existing = m.rows;
    let last = ws.getRow(1).cellCount;
    for (const [k, label] of SCTM_COLUMNS) if (!map[k] && k !== 'title') { last++; ws.getRow(1).getCell(last).value = label; ws.getRow(1).getCell(last).font = { bold: true }; map[k] = last; }
  } else {
    wb = new ExcelJS.Workbook(); ws = wb.addWorksheet('SCTM');
    ws.addRow(SCTM_COLUMNS.map((c) => c[1])); styleHeader(ws, SCTM_COLUMNS.map((c) => c[2]));
    map = Object.fromEntries(SCTM_COLUMNS.map(([k], i) => [k, i + 1]));
  }
  const catOf = (id) => (cat ? cat.controls.find((c) => c.id === id) || cat.controls.find((c) => c.id === baseId(id)) : null);
  const changes = [], rejected = [], needsInput = [], results = [];
  const width = ws.getRow(1).cellCount;
  for (const input of rows) {
    const id = normId(input?.control);
    if (!id) { rejected.push({ control: '', reason: 'no control ID' }); continue; }
    if (cat && !catOf(id)) { rejected.push({ control: id, reason: 'not in the control catalogue' }); continue; }
    const want = {
      applicability: input.applicability != null && text(input.applicability) ? applicabilityOf(input.applicability) : '',
      statement: text(input.statement), responsible: text(input.responsible), design: text(input.designReference ?? input.design),
      evidence: asEvidence(input.evidence), status: input.status != null && text(input.status) ? statusOf(input.status) : '', notes: text(input.notes),
    };
    const cur = existing.find((r) => r.control === id);
    const design = want.design || (cur ? cur.designReference : '');
    const statement = want.statement || (cur ? cur.statement : '');
    const applicable = (want.applicability || cur?.applicability) !== 'Not applicable';
    let check = '';
    if (statement && applicable) {
      const c = citation(design, docs);
      if (c.ok) check = `Cites ${c.file} › ${c.heading}`;
      else if (c.ok === null) check = 'Not checked (no design documents given)';
      else { check = `Needs input: ${c.reason}`; want.status = 'Needs input'; needsInput.push({ control: id, reason: c.reason, designReference: design }); }
    }
    let rowObj, isNew = false;
    if (cur) rowObj = ws.getRow(cur.row);
    else { rowObj = ws.getRow(Math.max(ws.rowCount, 1) + 1); isNew = true; rowObj.getCell(map.control).value = id; if (map.title && catOf(id)) rowObj.getCell(map.title).value = catOf(id).title; }
    const curVal = (k) => (cur ? (k === 'design' ? cur.designReference : k === 'evidence' ? cur.evidence.join('; ') : k === 'status' ? cur.statusText : cur[k]) || '' : '');
    for (const k of ['applicability', 'statement', 'responsible', 'design', 'evidence', 'status', 'notes']) {
      if (!want[k]) continue;
      const before = curVal(k);
      if (cur && (k === 'status' ? statusOf(before) === want[k] : k === 'applicability' ? applicabilityOf(before) === want[k] : before === want[k])) continue;
      const cell = rowObj.getCell(map[k]);
      cell.value = want[k];
      cell.alignment = { vertical: 'top', wrapText: true };
      if (!isNew) cell.fill = k === 'status' && want[k] === 'Needs input' ? NEEDS_INPUT : HIGHLIGHT;
      changes.push({ change: isNew ? 'New row' : 'Changed', control: id, field: FIELD_LABEL[k], current: before, proposed: want[k], check: k === 'statement' || k === 'status' || k === 'design' ? check : '', at: `${ws.name}!${String.fromCharCode(64 + Math.min(map[k], 26))}${rowObj.number}` });
    }
    if (isNew) { for (let i = 1; i <= width; i++) rowObj.getCell(i).fill = NEW_ROW; if (want.status === 'Needs input') rowObj.getCell(map.status).fill = NEEDS_INPUT; }
    results.push({ control: id, status: want.status || cur?.status || '', at: `${ws.name}!A${rowObj.number}`, isNew, check });
  }
  if (!changes.length && !hasRemediation) throw friendly(`Nothing to propose: ${rejected.length ? `${plural(rejected.length, 'row')} rejected (${rejected.map((r) => `${r.control || '?'}: ${r.reason}`).join('; ')})` : 'every row already matches the SCTM'}.`);

  const dir = sctmFile ? path.dirname(sctmFile) : catalogue ? path.dirname(catalogue) : root || process.cwd();
  const stem = sctmFile ? path.basename(sctmFile, path.extname(sctmFile)).replace(/\s*\((proposed|updated)\)(\s*\(\d+\))?\s*$/i, '') : 'SCTM';
  // With no SCTM change (remediation items only), no "(proposed)" copy is written.
  let out = null;
  if (changes.length) {
    const old = wb.getWorksheet('Proposed changes'); if (old) wb.removeWorksheet(old.id);
    const rs = wb.addWorksheet('Proposed changes', { properties: { tabColor: { argb: 'FFFFC000' } } });
    rs.addRow(['#', 'Approve? (Yes/No)', 'Change', 'Control', 'Field', 'Current', 'Proposed', 'Design citation check', 'Cell']);
    styleHeader(rs, [4, 18, 10, 10, 22, 40, 60, 46, 12]);
    changes.forEach((c, n) => {
      const r = rs.addRow([n + 1, '', c.change, c.control, c.field, c.current, c.proposed, c.check, c.at]);
      r.alignment = { vertical: 'top', wrapText: true };
      r.getCell(2).fill = HIGHLIGHT;
      r.getCell(2).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
      if (/^Needs input/.test(c.check)) r.getCell(8).fill = NEEDS_INPUT;
    });
    wb.views = [{ activeTab: wb.worksheets.indexOf(rs) }];
    out = freeName(path.join(dir, `${stem} (proposed).xlsx`)); // never replace a review copy that may already be marked up
    await wb.xlsx.writeFile(out);
  }

  // Remediation items: the ones given, plus one per Gap row that has none.
  const items = (remediation || []).filter((x) => x && (x.title || x.control)).map((x) => ({ control: normId(x.control || ''), title: text(x.title), description: text(x.description), priority: Math.min(4, Math.max(1, +x.priority || 2)), owner: text(x.owner) }));
  for (const r of results.filter((x) => x.status === 'Gap')) if (!items.some((i) => i.control === r.control)) items.push({ control: r.control, title: `Close the control gap for ${r.control}${catOf(r.control) ? ` (${catOf(r.control).title})` : ''}`, description: `Proposed SCTM row ${r.at} is a Gap.`, priority: 2, owner: '' });
  let remFile = null;
  if (items.length) {
    const rb = new ExcelJS.Workbook();
    const sh = rb.addWorksheet('Remediation');
    sh.addRow(['ID', 'Work Item Type', 'Title', 'Description', 'Priority', 'Assigned To', 'Tags']);
    styleHeader(sh, [10, 16, 50, 70, 9, 22, 28]);
    items.forEach((i, n) => {
      const title = i.title || `Remediate ${i.control}`;
      sh.addRow([`REM-${String(n + 1).padStart(3, '0')}`, 'Task', title, [i.control && `Control ${i.control}${catOf(i.control) ? ` (${catOf(i.control).title})` : ''}.`, i.description].filter(Boolean).join(' '), i.priority, i.owner, ['Security', 'SA&A', i.control].filter(Boolean).join('; ')]).alignment = { vertical: 'top', wrapText: true };
    });
    remFile = freeName(path.join(dir, `${stem} - remediation (ADO import).xlsx`));
    await rb.xlsx.writeFile(remFile);
  }
  return {
    saved: out, remediation: remFile, changes: changes.length, newRows: results.filter((r) => r.isNew).length,
    needsInput, rejected, remediationItems: items.length, warnings,
    summary: `${plural(changes.length, 'proposed change')} to ${plural(results.length, 'control')} (${results.filter((r) => r.isNew).length} new); ${plural(needsInput.length, 'statement')} marked Needs input; ${rejected.length} rejected${remFile ? `; ${plural(items.length, 'remediation item')} saved for Azure DevOps import` : ''}.`,
    next: !out ? 'No SCTM row changed, so no "(proposed)" copy was saved. Import the remediation workbook into Azure DevOps. The original SCTM has not been changed.' : 'Open the "(proposed)" workbook, check each Needs input row against the design, and set Approve? to Yes or No on each row of "Proposed changes". The original SCTM has not been changed.',
  };
}

module.exports = { readControlCatalogue, readSctm, writeSctm, indexEvidence, analyzeControls, proposeSctm, readDesignDocs, citation, normId, idsIn, statusOf, applicabilityOf, SCTM_COLUMNS };
