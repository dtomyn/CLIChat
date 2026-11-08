// Quality engineering: test-case workbooks and defect triage. Pure calculation and file writing, no AI here.
//
// 1. writeTestCases: an Excel test-case workbook in the Azure DevOps Test Plans import layout (one row per step;
//    the case's ID, title and fields sit on its first step row), plus a "Coverage" sheet with one row per case.
// 2. analyzeDefects: reads a defect export (.xlsx/.csv from an Azure DevOps query) and reports probable duplicates,
//    counts by severity/state/area, ages, severity–priority mismatches and unowned defects. Read-only: it returns
//    proposals, people decide.
// 3. proposeDefectChanges: writes "<export> (proposed).xlsx" with the proposed cells highlighted and a
//    "Proposed changes" sheet with an "Approve? (Yes/No)" column (the RAID pattern). The export itself is never changed.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const excel = require('./excel');

const cellText = excel.cellText;
const DAY = 86400000;
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
const HIGHLIGHT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const iso = (d) => (d ? d.toISOString().slice(0, 10) : undefined);

// ------------------------------------------------------------------ test cases
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
const testType = (t) => (/uat|accept|user/i.test(t || '') ? 'UAT' : /sit|system|integrat/i.test(t || '') ? 'SIT' : String(t || 'SIT').toUpperCase());

/** A free file name next to `file`: "Name.xlsx", else "Name (2).xlsx", "Name (3).xlsx"… so nothing is overwritten. */
function freeName(file) {
  if (!fs.existsSync(file)) return file;
  const ext = path.extname(file), stem = file.slice(0, -ext.length);
  for (let i = 2; ; i++) { const f = `${stem} (${i})${ext}`; if (!fs.existsSync(f)) return f; }
}

/**
 * cases: [{ id?, title, type: 'SIT'|'UAT', priority?, tracesTo: ['US-101'] | 'US-101, BR-002', preconditions?, technique?,
 *           steps: [{ action, expected }] }]
 */
async function writeTestCases(file, cases = [], { title } = {}) {
  if (!Array.isArray(cases) || !cases.length) throw friendly('Give at least one test case.');
  if (!/\.xlsx$/i.test(file)) file = `${file.replace(/\.[^./\\]+$/, '')}.xlsx`;
  const warnings = [];
  const used = new Set(cases.map((c) => String(c.id || '').toUpperCase()).filter(Boolean));
  let seq = 0;
  const nextId = () => { let id; do id = `TC-${String(++seq).padStart(3, '0')}`; while (used.has(id)); used.add(id); return id; };
  const norm = cases.map((c, i) => {
    const id = String(c.id || '').trim() || nextId();
    const steps = (Array.isArray(c.steps) ? c.steps : []).map((s) => (typeof s === 'string' ? { action: s } : s || {})).filter((s) => String(s.action || '').trim());
    if (!String(c.title || '').trim()) warnings.push(`Case ${i + 1} (${id}) has no title.`);
    if (!steps.length) warnings.push(`${id} has no steps.`);
    steps.forEach((s, k) => { if (!String(s.expected || '').trim()) warnings.push(`${id} step ${k + 1} has no expected result.`); });
    const traces = list(c.tracesTo);
    if (!traces.length) warnings.push(`${id} doesn't trace to a story or requirement.`);
    return { id, title: String(c.title || '').trim() || '(untitled)', type: testType(c.type), priority: c.priority ?? '', traces, preconditions: c.preconditions || '', technique: c.technique || '', steps };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lumen';
  const ws = wb.addWorksheet('Test cases');
  const cols = [['ID', 10], ['Work Item Type', 14], ['Title', 44], ['Test Step', 9], ['Step Action', 55], ['Step Expected', 55], ['Traces To', 20], ['Priority', 9], ['Type', 7], ['Preconditions', 36]];
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = HEADER_FILL;
  for (const c of norm) {
    const steps = c.steps.length ? c.steps : [{ action: '', expected: '' }];
    steps.forEach((s, k) => {
      const first = k === 0;
      const only = (v) => (first && v !== '' ? v : null); // case fields sit on the first step row only (the import layout)
      const r = ws.addRow([only(c.id), only('Test Case'), only(c.title), k + 1, s.action || null, s.expected || null, only(c.traces.join(', ')), only(c.priority), only(c.type), only(c.preconditions)]);
      r.alignment = { vertical: 'top', wrapText: true };
      if (first) r.getCell(3).font = { bold: true };
    });
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  const cov = wb.addWorksheet('Coverage');
  cov.columns = [['Test ID', 10], ['Title', 44], ['Type', 7], ['Priority', 9], ['Traces To', 22], ['Steps', 7], ['Technique', 18]].map(([header, width]) => ({ header, width }));
  cov.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cov.getRow(1).fill = HEADER_FILL;
  for (const c of norm) cov.addRow([c.id, c.title, c.type, c.priority, c.traces.join(', '), c.steps.length, c.technique]).alignment = { vertical: 'top', wrapText: true };
  cov.views = [{ state: 'frozen', ySplit: 1 }];
  if (title) wb.title = String(title);

  const out = freeName(file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await wb.xlsx.writeFile(out);
  const byType = norm.reduce((m, c) => ({ ...m, [c.type]: (m[c.type] || 0) + 1 }), {});
  const traced = [...new Set(norm.flatMap((c) => c.traces))].sort();
  return {
    saved: out, cases: norm.length, steps: norm.reduce((s, c) => s + c.steps.length, 0), byType, tracesTo: traced,
    ...(out !== file ? { note: `"${path.basename(file)}" already exists, so the cases were saved as "${path.basename(out)}".` } : {}),
    ...(warnings.length ? { warnings } : {}),
    layout: 'One row per step in the Azure DevOps Test Plans import layout (ID, Work Item Type, Title, Test Step, Step Action, Step Expected); a Coverage sheet lists one row per case.',
  };
}

// ------------------------------------------------------------------ defect export
const DEFECT_HEADERS = {
  id: [/^(work item )?id$/i, /^(bug|defect) ?(id|#)$/i, /^key$/i],
  type: [/^(work item )?type$/i],
  title: [/^title$/i, /^summary$/i],
  state: [/^state$/i, /^status$/i],
  severity: [/severity/i],
  priority: [/^priority$/i],
  area: [/area ?path|^area$/i],
  assigned: [/^assigned to$/i, /^owner$/i, /^assignee$/i],
  created: [/^created date$/i, /^created$/i, /^opened/i, /^raised/i],
  changed: [/^changed date$/i, /state change date/i, /^last updated/i],
  closed: [/^closed date$/i, /^resolved date$/i, /^(date )?(closed|resolved)$/i],
  tags: [/^tags?$/i],
  found: [/found in|environment|^env$/i],
};
const CLOSED = /closed|done|resolved|removed|rejected|duplicate|won'?t fix|cancel/i;
const STOP = new Set('a an the and or of on in to for with when is are be by at from not no does doesn t it its as after before into this that'.split(' '));
const stem = (w) => w.replace(/(ing|ed|es|s|e)$/, '').replace(/(.)\1$/, '$1');
const tokens = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).map((w) => (w.length > 3 ? stem(w) : w)));
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
// Severity and priority as 1 (highest) … 4 (lowest). Azure DevOps uses "1 - Critical" … "4 - Low" and priorities 1…4.
function rank(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const d = /^(\d)/.exec(t);
  if (d) return Math.min(4, Math.max(1, +d[1]));
  if (/critical|blocker|urgent|sev ?1|\bp1\b/i.test(t)) return 1;
  if (/high|major/i.test(t)) return 2;
  if (/medium|moderate|normal/i.test(t)) return 3;
  if (/low|minor|trivial|cosmetic/i.test(t)) return 4;
  return null;
}
const toDate = (t) => { if (!t) return null; const s = String(t).trim(); const d = /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : new Date(s); return Number.isNaN(+d) ? null : d; };

function headerMap(ws) {
  const headers = [];
  ws.getRow(1).eachCell((c, n) => { headers[n] = cellText(c).trim(); });
  const map = {};
  for (const [field, res] of Object.entries(DEFECT_HEADERS)) {
    for (const re of res) {
      const i = headers.findIndex((h, n) => h && re.test(h) && !Object.values(map).includes(n));
      if (i > 0) { map[field] = i; break; }
    }
  }
  return { map, headers };
}

async function readDefects(file) {
  const wb = await excel.open(file);
  const sheets = wb.worksheets.filter((ws) => ws.state !== 'veryHidden' && ws.name !== 'Proposed changes');
  const ws = sheets.find((s) => { const { map } = headerMap(s); return map.id && map.title; }) || sheets[0];
  if (!ws) throw friendly(`No sheet found in "${path.basename(file)}".`);
  const { map, headers } = headerMap(ws);
  if (!map.id || !map.title) throw friendly(`"${path.basename(file)}" needs at least "ID" and "Title" columns (the usual Azure DevOps query export).`);
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r === 1) return;
    const get = (f) => (map[f] ? cellText(row.getCell(map[f])).trim() : '');
    const id = get('id');
    if (!id) return;
    rows.push({ id, type: get('type'), title: get('title'), state: get('state'), severity: get('severity'), priority: get('priority'), area: get('area'), assigned: get('assigned'), created: toDate(get('created')), changed: toDate(get('changed')), closed: toDate(get('closed')), tags: get('tags'), found: get('found'), row: r, at: `${ws.name}!${colLetter(map.id)}${r}` });
  });
  return { wb, ws, map, headers, rows };
}

/** opts: { asOf: 'YYYY-MM-DD' (default today), duplicateThreshold: 0.6, staleDays: 30 } */
async function analyzeDefects(file, opts = {}) {
  const { ws, map, rows: all } = await readDefects(file);
  const asOf = toDate(opts.asOf) || toDate(new Date().toISOString().slice(0, 10));
  const threshold = opts.duplicateThreshold != null ? +opts.duplicateThreshold : 0.6;
  const staleDays = opts.staleDays != null ? +opts.staleDays : 30;
  const bugs = all.filter((d) => /bug|defect|issue/i.test(d.type));
  const rows = map.type && bugs.length ? bugs : all;
  const isOpen = (d) => !CLOSED.test(d.state || '');
  const open = rows.filter(isOpen);
  const label = (d) => ({ id: d.id, title: d.title, state: d.state || undefined, severity: d.severity || undefined, priority: d.priority || undefined, area: d.area || undefined, at: d.at });

  // Probable duplicates: similar titles in the same area path, at least one still open.
  const duplicates = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (map.area && (a.area || '').toLowerCase() !== (b.area || '').toLowerCase()) continue;
      if (!isOpen(a) && !isOpen(b)) continue;
      const score = similarity(a.title, b.title);
      if (score < threshold) continue;
      const [keep, dup] = (a.created && b.created ? a.created <= b.created : a.row <= b.row) ? [a, b] : [b, a];
      duplicates.push({ keep: label(keep), probableDuplicate: label(dup), similarity: Math.round(score * 100) / 100 });
    }
  }
  duplicates.sort((x, y) => y.similarity - x.similarity);

  const count = (key) => rows.reduce((m, d) => { const k = d[key] || '(blank)'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const countOpen = (key) => open.reduce((m, d) => { const k = d[key] || '(blank)'; m[k] = (m[k] || 0) + 1; return m; }, {});

  // Ages of open defects.
  const age = (d) => (d.created ? Math.max(0, Math.round((+asOf - +d.created) / DAY)) : null);
  const buckets = { '0-7 days': 0, '8-30 days': 0, '31-90 days': 0, 'over 90 days': 0, 'no created date': 0 };
  for (const d of open) { const a = age(d); buckets[a == null ? 'no created date' : a <= 7 ? '0-7 days' : a <= 30 ? '8-30 days' : a <= 90 ? '31-90 days' : 'over 90 days']++; }
  if (!buckets['no created date']) delete buckets['no created date'];
  const oldest = open.filter((d) => d.created).sort((a, b) => a.created - b.created).slice(0, 10).map((d) => ({ ...label(d), ageDays: age(d) }));
  const stale = open.filter((d) => d.changed && (+asOf - +d.changed) / DAY > staleDays).map((d) => ({ ...label(d), daysSinceChange: Math.round((+asOf - +d.changed) / DAY) }));

  // Severity and priority that disagree by two or more steps.
  const mismatches = open.map((d) => ({ d, s: rank(d.severity), p: rank(d.priority) })).filter((x) => x.s && x.p && Math.abs(x.s - x.p) >= 2)
    .map(({ d, s, p }) => ({ ...label(d), note: s < p ? `Severity ${d.severity} but priority ${d.priority}: a serious defect is queued as low priority` : `Severity ${d.severity} but priority ${d.priority}: a minor defect is queued ahead of serious ones` }));
  const unowned = map.assigned ? open.filter((d) => !d.assigned).map(label) : [];
  const noSeverity = map.severity ? open.filter((d) => !d.severity).map(label) : [];

  // Proposals only, in the shape propose_defect_changes takes.
  const proposals = [
    ...duplicates.map((x) => ({ id: x.probableDuplicate.id, field: 'state', value: 'Duplicate', reason: `Probable duplicate of ${x.keep.id} "${x.keep.title}" (title similarity ${x.similarity}, same area)` })),
    ...mismatches.map((m) => ({ id: m.id, field: 'priority', value: String(rank(m.severity)), reason: m.note })),
  ];

  const critOpen = open.filter((d) => rank(d.severity) === 1).length;
  return {
    export: path.basename(file), sheet: ws.name, asOf: iso(asOf),
    summary: `${rows.length} defect${rows.length === 1 ? '' : 's'}, ${open.length} open (${critOpen} critical); ${duplicates.length} probable duplicate pair${duplicates.length === 1 ? '' : 's'}; ${mismatches.length} severity–priority mismatch${mismatches.length === 1 ? '' : 'es'}; ${unowned.length} open without an owner.`,
    counts: { bySeverity: count('severity'), byState: count('state'), ...(map.area ? { openByArea: countOpen('area') } : {}) },
    ageOfOpenDefects: buckets, oldestOpen: oldest,
    findings: { probableDuplicates: duplicates, severityPriorityMismatches: mismatches, openWithoutOwner: unowned, openWithoutSeverity: noSeverity, notChangedRecently: stale },
    proposals,
    note: 'Cell references (Sheet!A12) point at each defect\'s ID cell. Nothing was changed. To record agreed changes, pass the approved proposals to propose_defect_changes, which writes a "(proposed)" copy for review.',
  };
}

const FIELD_ALIASES = { severity: 'severity', priority: 'priority', state: 'state', status: 'state', owner: 'assigned', assigned: 'assigned', 'assigned to': 'assigned', area: 'area', 'area path': 'area', tags: 'tags', title: 'title' };
const outPath = (file, tag) => path.join(path.dirname(file), `${path.basename(file, path.extname(file)).replace(/\s*\((proposed|updated)\)(\s*\(\d+\))?\s*$/i, '')} (${tag}).xlsx`);

/** changes: [{ id, field: 'severity'|'priority'|'state'|'owner'|'area'|'tags', value, reason }] */
async function proposeDefectChanges(file, changes = []) {
  if (!Array.isArray(changes) || !changes.length) throw friendly('Give at least one proposed change.');
  const { wb, ws, map, rows } = await readDefects(file);
  const accepted = [], rejected = [];
  for (const [i, c] of changes.entries()) {
    const field = FIELD_ALIASES[String(c.field || '').toLowerCase().trim()];
    const d = rows.find((x) => x.id.replace(/^#/, '') === String(c.id || '').replace(/^#/, '').trim());
    if (!d) { rejected.push({ n: i + 1, id: c.id, reason: `${c.id} isn't in the export.` }); continue; }
    if (!field) { rejected.push({ n: i + 1, id: c.id, reason: `"${c.field}" isn't a field that can be proposed (use severity, priority, state, owner, area or tags).` }); continue; }
    if (!map[field]) { rejected.push({ n: i + 1, id: c.id, reason: `The export has no ${field} column.` }); continue; }
    if (c.value == null || String(c.value).trim() === '') { rejected.push({ n: i + 1, id: c.id, reason: 'No proposed value.' }); continue; }
    const cell = ws.getRow(d.row).getCell(map[field]);
    const before = cellText(cell);
    cell.value = String(c.value);
    cell.fill = HIGHLIGHT;
    accepted.push({ n: accepted.length + 1, id: d.id, field, before, after: String(c.value), reason: c.reason || '', row: d.row, at: `${ws.name}!${colLetter(map[field])}${d.row}` });
  }
  const old = wb.getWorksheet('Proposed changes'); if (old) wb.removeWorksheet(old.id);
  const rs = wb.addWorksheet('Proposed changes', { properties: { tabColor: { argb: 'FFFFC000' } } });
  rs.addRow(['#', 'Approve? (Yes/No)', 'Defect', 'Field', 'Current', 'Proposed', 'Why', 'Cell']);
  rs.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rs.getRow(1).fill = HEADER_FILL;
  for (const a of accepted) {
    const r = rs.addRow([a.n, '', a.id, a.field, a.before, a.after, a.reason, a.at]);
    r.alignment = { vertical: 'top', wrapText: true };
    r.getCell(2).fill = HIGHLIGHT;
    r.getCell(2).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
  }
  [4, 18, 10, 10, 18, 18, 60, 14].forEach((w, i) => { rs.getColumn(i + 1).width = w; });
  rs.views = [{ state: 'frozen', ySplit: 1 }];
  if (rejected.length) {
    rs.addRow([]);
    rs.addRow(['', 'Not proposed']).font = { bold: true };
    for (const x of rejected) rs.addRow(['', '', x.id, '', '', '', x.reason]);
  }
  wb.views = [{ activeTab: wb.worksheets.indexOf(rs) }];
  const out = freeName(outPath(file, 'proposed')); // never replace a review copy that may already be marked up
  await wb.xlsx.writeFile(out);
  return {
    saved: out, proposed: accepted.length, notProposed: rejected, changes: accepted.map(({ row, ...a }) => a),
    next: 'Open the "(proposed)" workbook, set Approve? to Yes or No on each row of "Proposed changes", then make the approved changes in Azure DevOps (or ask me to prepare them). The original export has not been changed.',
  };
}

// ------------------------------------------------------------------ Playwright regression tests (Plan 17)
// Turns a test-case workbook in the write_test_cases layout (one row per step) into Playwright specs, one file per
// story. Each case becomes a test tagged with its ID, the IDs it traces to and SIT/UAT, and each step becomes a
// test.step with the expected result as a comment. Tests are marked fixme until someone writes the actions and
// assertions, so a generated suite never passes without testing anything.

const CASE_HEADERS = {
  id: [/^(test )?id$/i, /^test case id$/i], title: [/^title$/i], step: [/^test step$/i, /^step$/i, /^step #$/i], action: [/^step action$/i, /^action$/i],
  expected: [/^step expected$/i, /^expected( result)?$/i], traces: [/^traces? to$/i, /^requirements?$/i], priority: [/^priority$/i], type: [/^type$/i], preconditions: [/^preconditions?$/i],
};

/** A test-case workbook → [{ id, title, type, priority, tracesTo: [], preconditions, steps: [{ action, expected }] }]. */
async function readTestCases(file) {
  if (!fs.existsSync(file)) throw friendly(`Can't find "${file}".`);
  if (/\.csv$/i.test(file)) throw friendly('Give the test-case workbook as .xlsx (the layout write_test_cases saves).');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  for (const ws of [wb.getWorksheet('Test cases'), ...wb.worksheets].filter(Boolean)) {
    let headRow = 0, map = {};
    for (let r = 1; r <= Math.min(ws.rowCount, 10) && !headRow; r++) {
      const m = {};
      ws.getRow(r).eachCell((cell, c) => { const t = cellText(cell).trim(); for (const [k, res] of Object.entries(CASE_HEADERS)) if (!m[k] && res.some((re) => re.test(t))) m[k] = c; });
      if (m.title && m.action) { headRow = r; map = m; }
    }
    if (!headRow) continue;
    const cases = [];
    let cur = null;
    for (let r = headRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = (k) => (map[k] ? cellText(row.getCell(map[k])).trim() : '');
      const id = get('id'), title = get('title');
      if (id || title) {
        cur = { id: id || `TC-${String(cases.length + 1).padStart(3, '0')}`, title: title || '(untitled)', type: testType(get('type') || 'SIT'), priority: get('priority'), tracesTo: list(get('traces')), preconditions: get('preconditions'), steps: [] };
        cases.push(cur);
      }
      if (cur && get('action')) cur.steps.push({ action: get('action'), expected: get('expected') });
    }
    if (cases.length) return cases;
  }
  throw friendly(`"${path.basename(file)}" has no test-case sheet (columns Title and Step Action). Save cases with write_test_cases first.`);
}

const tag = (s) => `@${String(s).trim().replace(/\s+/g, '-')}`;
const q = (s) => JSON.stringify(String(s ?? ''));
const comment = (s) => String(s || '').replace(/\*\//g, '* /').replace(/\r?\n/g, ' ');
const specName = (s) => String(s).replace(/[<>:"/\\|?*#\u0000-\u001F]/g, '-').replace(/\s+/g, '-').toLowerCase();

/** Spec file contents for a list of cases: { 'tests/us-104.spec.js': '...', ... } plus shared files. */
function playwrightFiles(cases, { source = 'the test-case workbook' } = {}) {
  const groups = new Map();
  for (const c of cases) {
    const story = c.tracesTo.find((t) => /^(US|PBI|AB#?)-?\d+/i.test(t)) || c.tracesTo[0] || c.type;
    if (!groups.has(story)) groups.set(story, []);
    groups.get(story).push(c);
  }
  const files = {};
  const index = [];
  for (const [story, list0] of groups) {
    const f = `tests/${specName(story)}.spec.js`;
    const body = list0.map((c) => {
      const tags = [...new Set([c.id, ...c.tracesTo, c.type, ...(c.priority !== '' && c.priority != null ? [`P${c.priority}`] : [])].filter(Boolean).map(tag))];
      index.push({ id: c.id, title: c.title, file: f, tags });
      const steps = c.steps.length ? c.steps : [{ action: 'TODO: the case has no steps in the workbook', expected: '' }];
      return `// ${c.id}: ${comment(c.title)}${c.preconditions ? `\n// Preconditions: ${comment(c.preconditions)}` : ''}
test.fixme(${q(`${c.id} ${c.title}`)}, { tag: ${JSON.stringify(tags)} }, async ({ page }, testInfo) => {
  // Remove .fixme once the actions and assertions below are written.
${steps.map((s, i) => `  await test.step(${q(`${i + 1}. ${s.action}`)}, async () => {
    // Expected: ${comment(s.expected) || 'TODO: no expected result in the workbook'}
    // TODO: use the page objects in ../pages and data from ../fixtures/test-data.js
  });`).join('\n')}
  await testInfo.attach('evidence', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});`;
    }).join('\n\n');
    files[f] = `// Generated by Lumen from ${comment(source)} for ${comment(story)}. Review before use.
// Each test is tagged with its test case ID, the stories and requirements it traces to, and SIT or UAT,
// so "npx playwright test --grep @${specName(list0[0].id).toUpperCase()}" runs one case and "--grep @${String(story).replace(/\s+/g, '-')}" runs the story.
const { test } = require('@playwright/test');

test.describe(${q(story)}, () => {
${body.split('\n').map((l) => (l ? `  ${l}` : l)).join('\n')}
});
`;
  }
  files['fixtures/test-data.js'] = `// Test-data factories: every test builds the data it needs, with unique values, so tests can run in any order.
// Generated by Lumen as a starting point. Replace the fields with the program's real entities.
let seq = 0;
const unique = (prefix) => \`\${prefix}-\${Date.now().toString(36)}-\${++seq}\`;

/** A permit holder (or other primary user) with overridable fields. */
function makeUser(overrides = {}) {
  return { id: unique('user'), firstName: 'Test', lastName: unique('User'), email: \`\${unique('test')}@example.test\`, ...overrides };
}

module.exports = { unique, makeUser };
`;
  files['pages/BasePage.js'] = `// Page objects keep selectors in one place. Prefer getByRole / getByLabel / getByTestId over CSS.
class BasePage {
  constructor(page) { this.page = page; }
  async open(path = '/') { await this.page.goto(path); }
}

module.exports = { BasePage };
`;
  files['playwright.config.js'] = `// Generated by Lumen. Evidence for CI: a trace and screenshots on failure, HTML and JUnit reports.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'results/junit.xml' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
`;
  files['README.md'] = `# Playwright regression tests (draft)

Generated by Lumen from ${source}. Every test is marked \`test.fixme\` until its actions and assertions are written.

| Test case | Title | Spec | Tags |
|---|---|---|---|
${index.map((x) => `| ${x.id} | ${x.title.replace(/\|/g, '/')} | \`${x.file}\` | ${x.tags.join(' ')} |`).join('\n')}

Run one story: \`npx playwright test --grep @US-104\`. Set BASE_URL to the test environment. Attach \`results/\` and the HTML report to the CI run as evidence.
`;
  return { files, index };
}

/** Write Playwright specs from a test-case workbook. Never overwrites: numbered copies are saved instead. */
async function generatePlaywrightTests(file, { outDir, root } = {}) {
  const cases = await readTestCases(file);
  let dir = outDir || path.join(path.dirname(file), 'Playwright');
  // A folder that already has files gets a numbered sibling, so earlier specs (and edits to them) are kept.
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) { const base = dir; for (let i = 2; fs.existsSync(dir) && fs.readdirSync(dir).length; i++) dir = `${base} (${i})`; }
  const relOf = (f) => (root ? path.relative(root, f).split(path.sep).join('/') : f);
  const { files, index } = playwrightFiles(cases, { source: `\`${root ? relOf(file) : path.basename(file)}\`` });
  const saved = [];
  for (const [f, text] of Object.entries(files)) {
    const target = freeName(path.join(dir, ...f.split('/')));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    saved.push(relOf(target));
  }
  const noSteps = cases.filter((c) => !c.steps.length).map((c) => c.id);
  const noTrace = cases.filter((c) => !c.tracesTo.length).map((c) => c.id);
  return {
    folder: relOf(dir), saved, cases: index,
    ...(noSteps.length || noTrace.length ? { warnings: [...noSteps.map((id) => `${id} has no steps.`), ...noTrace.map((id) => `${id} doesn't trace to a story or requirement.`)] } : {}),
    summary: `Wrote ${cases.length} Playwright test${cases.length === 1 ? '' : 's'} in ${Object.keys(files).filter((f) => f.startsWith('tests/')).length} spec file(s), tagged by test case and story. They are marked fixme until the actions and assertions are written.`,
  };
}

module.exports = { writeTestCases, analyzeDefects, proposeDefectChanges, readDefects, similarity, rank, readTestCases, playwrightFiles, generatePlaywrightTests };
