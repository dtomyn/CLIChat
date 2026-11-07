// Meeting transcript -> RAID log updates, with a human approval step.
//
// 1. read_transcript: parse a Teams transcript (.vtt, .docx export, or text) into timestamped segments.
// 2. propose_raid_updates: the AI proposes adds/updates/closes. Each proposal must quote the transcript;
//    quotes are checked against the text and proposals that can't be found are rejected, not written.
//    The result is "<RAID> (proposed).xlsx": changes are applied and highlighted, and a "Proposed changes"
//    sheet lists each one with its evidence and an "Approve?" column.
// 3. apply_raid_updates: after a person marks Approve? = Yes/No, only approved changes are written to
//    "<RAID> (updated).xlsx". The original RAID log is never overwritten.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const docx = require('./docx');

// ------------------------------------------------------------------ transcripts
const toSeconds = (t) => { const p = String(t).split(':').map(Number); return p.reduce((s, x) => s * 60 + x, 0); };
const hhmmss = (sec) => { sec = Math.floor(sec); return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((n) => String(n).padStart(2, '0')).join(':'); };

function parseVtt(text) {
  const out = [];
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split('\n').filter(Boolean);
    const ti = lines.findIndex((l) => /-->/.test(l));
    if (ti < 0) continue;
    const start = lines[ti].split('-->')[0].trim().replace(/\.\d+$/, '');
    let body = lines.slice(ti + 1).join(' ');
    let speaker = '';
    const v = /<v\s+([^>]+)>/.exec(body);
    if (v) speaker = v[1].trim();
    body = body.replace(/<[^>]+>/g, '').trim();
    const colon = !speaker && /^([A-Z][\w .'-]{1,40}):\s+(.*)$/.exec(body);
    if (colon) { speaker = colon[1]; body = colon[2]; }
    if (body) out.push({ time: hhmmss(toSeconds(start)), speaker, text: body });
  }
  // Teams splits long turns into several cues; join consecutive cues from the same speaker.
  return out.reduce((acc, s) => { const last = acc.at(-1); if (last && last.speaker === s.speaker && s.speaker) last.text += ` ${s.text}`; else acc.push({ ...s }); return acc; }, []);
}

function parsePlain(text) {
  const out = [];
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  // Teams .docx export: "Name   0:03" (or "0:03 Name") on one line, then what they said.
  const header = /^(.{1,60}?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/;
  const header2 = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.{1,60})$/;
  // Inline: "[00:01:02] Name: text" or "Name: text"
  const inline = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)?\]?\s*([A-Z][\w .'-]{1,40}):\s+(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/^#+\s*/, '');
    let m;
    if ((m = header.exec(l)) && lines[i + 1] && !header.test(lines[i + 1])) { out.push({ time: hhmmss(toSeconds(m[2])), speaker: m[1].trim(), text: lines[++i] }); continue; }
    if ((m = header2.exec(l)) && lines[i + 1] && !header2.test(lines[i + 1]) && !/:\s/.test(l)) { out.push({ time: hhmmss(toSeconds(m[1])), speaker: m[2].trim(), text: lines[++i] }); continue; }
    if ((m = inline.exec(l))) { out.push({ time: m[1] ? hhmmss(toSeconds(m[1])) : '', speaker: m[2].trim(), text: m[3] }); continue; }
    if (out.length) out.at(-1).text += ` ${l}`; else out.push({ time: '', speaker: '', text: l });
  }
  return out;
}

function readTranscript(file) {
  const ext = path.extname(file).toLowerCase();
  const raw = ext === '.docx' ? docx.docxToText(file) : fs.readFileSync(file, 'utf8');
  const segments = ext === '.vtt' || /^WEBVTT/.test(raw) ? parseVtt(raw) : parsePlain(raw);
  return segments.map((s, i) => ({ n: i + 1, ...s }));
}

const norm = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Find the segment a quote comes from. Short or missing quotes don't count as evidence. */
function locateQuote(segments, quote) {
  const q = norm(quote);
  if (q.split(' ').length < 4) return null;
  const seg = segments.find((s) => norm(s.text).includes(q));
  if (seg) return seg;
  // A quote can run across two consecutive turns by the same speaker or a split cue.
  for (let i = 0; i < segments.length - 1; i++) if (norm(`${segments[i].text} ${segments[i + 1].text}`).includes(q)) return segments[i];
  return null;
}

// ------------------------------------------------------------------ RAID workbook structure
const KIND_SHEETS = { risk: /risk/i, issue: /issue/i, action: /action/i, decision: /decision/i, dependency: /depend/i, assumption: /assum/i };
const FIELD_HEADERS = {
  id: [/^id$/i, /\bref\b/i],
  title: [/^(risk|issue|action|decision|dependency|assumption|title|summary|description)$/i],
  owner: [/owner/i, /^made by$/i, /^on whom$/i, /assigned/i],
  status: [/^status$/i, /^validated\??$/i],
  due: [/^due/i, /next review/i, /needed by/i, /target/i],
  date: [/^date$/i, /^raised$/i],
  action: [/mitigation/i, /^action$/i, /response/i],
  priority: [/priority/i],
  probability: [/probab|likelihood/i],
  impact: [/impact/i],
  category: [/category/i],
};

function cellText(c) {
  const v = c.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return String(v.result ?? v.text ?? (v.richText ? v.richText.map((r) => r.text).join('') : ''));
  return String(v);
}

function columns(ws) {
  const headers = [];
  ws.getRow(1).eachCell((c, n) => { headers[n] = cellText(c).trim(); });
  const map = {};
  for (const [field, res] of Object.entries(FIELD_HEADERS)) {
    const i = headers.findIndex((h, n) => h && res.some((re) => re.test(h)) && !Object.values(map).includes(n));
    if (i > 0) map[field] = i;
  }
  // The title column is usually the one named after the sheet ("Risk", "Issue"); fall back to column B.
  if (!map.title) { const i = headers.findIndex((h) => h && KIND_SHEETS[sheetKind(ws.name)]?.test(h)); map.title = i > 0 ? i : 2; }
  return { map, headers };
}

const sheetKind = (name) => Object.keys(KIND_SHEETS).find((k) => KIND_SHEETS[k].test(name)) || null;
const sheetFor = (wb, kind) => wb.worksheets.find((ws) => sheetKind(ws.name) === kind);
const lastRow = (ws) => { for (let r = ws.rowCount; r > 1; r--) if (cellText(ws.getRow(r).getCell(1)).trim() || cellText(ws.getRow(r).getCell(2)).trim()) return r; return 1; };

function findRow(ws, map, id) {
  const want = String(id).trim().toLowerCase();
  for (let r = 2; r <= lastRow(ws); r++) if (cellText(ws.getRow(r).getCell(map.id || 1)).trim().toLowerCase() === want) return r;
  return null;
}

function nextId(ws, map, kind) {
  const ids = [];
  for (let r = 2; r <= lastRow(ws); r++) ids.push(cellText(ws.getRow(r).getCell(map.id || 1)).trim());
  const parsed = ids.map((x) => /^(.*?)(\d+)$/.exec(x)).filter(Boolean);
  const prefix = parsed.length ? parsed.at(-1)[1] : `${{ risk: 'R', issue: 'I', action: 'ACT', decision: 'DEC', dependency: 'D', assumption: 'A' }[kind]}-`;
  const width = parsed.length ? parsed.at(-1)[2].length : 2;
  const max = Math.max(0, ...parsed.filter((m) => m[1] === prefix).map((m) => +m[2]));
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

/** Copy a formula from the row above into a new row, shifting same-row references. */
function copyFormula(ws, col, fromRow, toRow) {
  const c = ws.getRow(fromRow).getCell(col);
  let formula = c.value?.formula, base = fromRow;
  if (!formula && c.value?.sharedFormula) { const master = ws.getCell(c.value.sharedFormula); formula = master.value?.formula; base = +master.row; }
  if (!formula) return false;
  ws.getRow(toRow).getCell(col).value = { formula: formula.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)\b/g, (m, colRef, abs, row) => (abs || +row !== base ? m : `${colRef}${toRow}`)) };
  return true;
}

const HIGHLIGHT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const NEW_ROW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } };
const CLOSED_WORD = { risk: 'Closed', issue: 'Closed', action: 'Done', dependency: 'Received', assumption: 'Yes', decision: '' };

/** Apply one proposal to a workbook. Returns a description of what changed, or throws a friendly reason. */
function applyOne(wb, p, { mark = true } = {}) {
  const kind = String(p.kind || '').toLowerCase().replace(/s$/, '');
  if (!KIND_SHEETS[kind]) throw new Error(`unknown type "${p.kind}"`);
  let ws = sheetFor(wb, kind);
  if (!ws && kind === 'action' && p.change === 'add') {
    ws = wb.addWorksheet('Actions');
    ws.addRow(['ID', 'Action', 'Owner', 'Due', 'Status', 'Raised']);
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    [8, 60, 16, 12, 12, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  }
  if (!ws) throw new Error(`the RAID log has no ${kind} sheet`);
  const { map } = columns(ws);
  const fields = { ...(p.fields || {}) };
  if (p.change === 'close') { if (!fields.status) fields.status = CLOSED_WORD[kind] || 'Closed'; }

  let row, id, created = false;
  if (p.change === 'add') {
    row = lastRow(ws) + 1;
    id = nextId(ws, map, kind);
    created = true;
    const prev = row - 1;
    ws.getRow(1).eachCell((_, col) => { if (prev > 1) copyFormula(ws, col, prev, row); });
    if (prev > 1) ws.getRow(1).eachCell((_, col) => { const from = ws.getRow(prev).getCell(col); const to = ws.getRow(row).getCell(col); if (from.numFmt) to.numFmt = from.numFmt; if (from.alignment) to.alignment = from.alignment; });
    ws.getRow(row).getCell(map.id || 1).value = id;
    if (!fields.status && map.status) fields.status = kind === 'assumption' ? 'No' : 'Open';
    if (!fields.date && map.date && p.meetingDate) fields.date = p.meetingDate;
    if (!fields.title) throw new Error('a new item needs a title');
  } else if (p.change === 'update' || p.change === 'close') {
    if (!p.id) throw new Error('updates need the existing ID');
    row = findRow(ws, map, p.id);
    if (!row) throw new Error(`${p.id} isn't in the ${ws.name} sheet`);
    id = String(p.id);
  } else throw new Error(`unknown change "${p.change}" (use add, update or close)`);

  const changes = [];
  for (const [field, value] of Object.entries(fields)) {
    if (value == null || value === '') continue;
    const col = map[field];
    if (!col) { changes.push(`${field}: no matching column, skipped`); continue; }
    const cell = ws.getRow(row).getCell(col);
    if (cell.value?.formula || cell.value?.sharedFormula) { changes.push(`${field}: calculated column, left as is`); continue; }
    const before = cellText(cell);
    let v = value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) && (field === 'due' || field === 'date')) v = new Date(`${v}T00:00:00Z`);
    if (field === 'action' && p.change !== 'add' && before && !String(value).includes(before)) v = `${before}; ${value}`; // add to the mitigation, don't replace it
    cell.value = v;
    if (mark) cell.fill = created ? NEW_ROW : HIGHLIGHT;
    changes.push(created ? `${field}: ${value}` : `${field}: ${before || '(empty)'} → ${cellText(cell)}`);
  }
  if (created && mark) ws.getRow(row).getCell(map.id || 1).fill = NEW_ROW;
  return { sheet: ws.name, row, id, created, changes };
}

// ------------------------------------------------------------------ propose / apply
const outPath = (raid, tag) => path.join(path.dirname(raid), `${path.basename(raid, path.extname(raid)).replace(/\s*\((proposed|updated)\)\s*$/i, '')} (${tag}).xlsx`);

/**
 * proposals: [{ change: 'add'|'update'|'close', kind, id?, fields: { title, owner, due, status, action, priority, probability, impact, category },
 *               evidence: { quote, speaker? }, reason? }]
 */
async function propose(raidFile, transcriptFile, proposals = [], { meetingDate } = {}) {
  const segments = readTranscript(transcriptFile);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(raidFile);
  const accepted = [], rejected = [];
  for (const [i, p] of proposals.entries()) {
    const seg = locateQuote(segments, p.evidence?.quote);
    if (!seg) { rejected.push({ n: i + 1, proposal: summary(p), reason: 'The quote was not found in the transcript (quotes must be copied word for word, at least 4 words).' }); continue; }
    try {
      const done = applyOne(wb, { ...p, meetingDate });
      accepted.push({ n: accepted.length + 1, p, seg, done });
    } catch (e) { rejected.push({ n: i + 1, proposal: summary(p), reason: e.message }); }
  }

  // Review sheet: one row per proposed change, with evidence and an approval column.
  const old = wb.getWorksheet('Proposed changes'); if (old) wb.removeWorksheet(old.id);
  const rs = wb.addWorksheet('Proposed changes', { properties: { tabColor: { argb: 'FFFFC000' } } });
  rs.addRow(['#', 'Approve? (Yes/No)', 'Change', 'Type', 'ID', 'Sheet', 'Row', 'What changes', 'Evidence (transcript)', 'Speaker', 'Time', 'Why', 'Change data']);
  rs.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rs.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  for (const a of accepted) {
    const r = rs.addRow([a.n, '', a.p.change, a.p.kind, a.done.id, a.done.sheet, a.done.row, a.done.changes.join('\n'), `"${a.p.evidence.quote}"`, a.seg.speaker, a.seg.time, a.p.reason || '', JSON.stringify({ change: a.p.change, kind: a.p.kind, id: a.p.change === 'add' ? undefined : a.p.id, fields: a.p.fields, meetingDate })]);
    r.alignment = { vertical: 'top' };
    for (const col of [8, 9, 12]) r.getCell(col).alignment = { wrapText: true, vertical: 'top' };
    r.getCell(2).fill = HIGHLIGHT;
    r.getCell(2).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
  }
  [4, 18, 9, 11, 9, 13, 6, 46, 50, 16, 9, 30, 10].forEach((w, i) => { rs.getColumn(i + 1).width = w; });
  rs.getColumn(13).hidden = true;
  rs.views = [{ state: 'frozen', ySplit: 1 }];
  if (rejected.length) {
    rs.addRow([]);
    rs.addRow(['', 'Not proposed (could not be checked)']).font = { bold: true };
    for (const x of rejected) rs.addRow(['', '', '', '', '', '', '', x.proposal, x.reason]).alignment = { wrapText: true, vertical: 'top' };
  }
  wb.views = [{ activeTab: wb.worksheets.indexOf(rs) }];
  const out = outPath(raidFile, 'proposed');
  await wb.xlsx.writeFile(out);

  const meetingChecks = huddleChecks(accepted.map((a) => a.p));
  return {
    saved: out, proposed: accepted.length, notProposed: rejected,
    changes: accepted.map((a) => ({ n: a.n, change: a.p.change, kind: a.p.kind, id: a.done.id, what: a.done.changes, evidence: `${a.seg.speaker || 'Someone'} at ${a.seg.time || '?'}: "${a.p.evidence.quote}"` })),
    meetingChecks,
    next: 'Open the "(proposed)" workbook, review the "Proposed changes" sheet and set Approve? to Yes or No for each row, save it, then ask me to apply the approved changes. The original RAID log has not been changed.',
  };
}

/** "AI-ready meeting" checks: things that make huddle outcomes hard to act on. */
function huddleChecks(proposals) {
  const out = [];
  const adds = proposals.filter((p) => p.change === 'add');
  const noOwner = adds.filter((p) => !p.fields?.owner && p.kind !== 'decision');
  const noDue = adds.filter((p) => ['action', 'issue'].includes(String(p.kind).toLowerCase()) && !p.fields?.due);
  if (noOwner.length) out.push(`${noOwner.length} new item${noOwner.length === 1 ? ' has' : 's have'} no owner: ${noOwner.map((p) => `"${p.fields?.title}"`).join(', ')}.`);
  if (noDue.length) out.push(`${noDue.length} new action${noDue.length === 1 ? '' : 's'} or issue${noDue.length === 1 ? '' : 's'} with no due date: ${noDue.map((p) => `"${p.fields?.title}"`).join(', ')}.`);
  if (!out.length && proposals.length) out.push('Every new item has an owner, and every action or issue has a due date.');
  return out;
}

const summary = (p) => `${p.change || '?'} ${p.kind || '?'}${p.id ? ` ${p.id}` : ''}${p.fields?.title ? `: ${p.fields.title}` : ''}`;

/** Write only the approved changes from a reviewed "(proposed)" workbook into "<RAID> (updated).xlsx". */
async function applyApproved(proposedFile, { original } = {}) {
  const pwb = new ExcelJS.Workbook();
  await pwb.xlsx.readFile(proposedFile);
  const rs = pwb.getWorksheet('Proposed changes');
  if (!rs) throw Object.assign(new Error(`"${path.basename(proposedFile)}" has no "Proposed changes" sheet. Run the huddle review first.`), { friendly: true });
  const items = [];
  for (let r = 2; r <= rs.rowCount; r++) {
    const row = rs.getRow(r);
    const data = cellText(row.getCell(13));
    if (!data.startsWith('{')) continue;
    items.push({ n: +cellText(row.getCell(1)), decision: cellText(row.getCell(2)).trim().toLowerCase(), data: JSON.parse(data), evidence: cellText(row.getCell(9)), speaker: cellText(row.getCell(10)), time: cellText(row.getCell(11)) });
  }
  const undecided = items.filter((x) => !/^(y|yes|n|no)$/.test(x.decision));
  if (undecided.length) return { saved: null, applied: 0, undecided: undecided.map((x) => x.n), note: `Rows ${undecided.map((x) => x.n).join(', ')} have no Yes/No in "Approve?". Nothing was applied. Mark every row, save the workbook and try again.` };

  const src = original || path.join(path.dirname(proposedFile), `${path.basename(proposedFile, '.xlsx').replace(/\s*\(proposed\)\s*$/i, '')}.xlsx`);
  if (!fs.existsSync(src)) throw Object.assign(new Error(`Can't find the original RAID log "${path.basename(src)}" next to the proposed copy.`), { friendly: true });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(src);
  const applied = [], skipped = [];
  for (const x of items) {
    if (!/^y/.test(x.decision)) { skipped.push(x.n); continue; }
    try { const d = applyOne(wb, x.data, { mark: false }); applied.push({ n: x.n, id: d.id, sheet: d.sheet, what: d.changes, evidence: `${x.speaker} at ${x.time}: ${x.evidence}` }); }
    catch (e) { skipped.push(x.n); applied.push({ n: x.n, error: e.message }); }
  }
  const out = outPath(src, 'updated');
  await wb.xlsx.writeFile(out);
  return { saved: out, applied: applied.filter((a) => !a.error).length, rejectedByReviewer: skipped, details: applied, note: 'Approved changes were written to the "(updated)" copy. The original RAID log is unchanged.' };
}

/**
 * Which RAID file should a report read? The huddle flow leaves three files side by side:
 *   "<RAID>.xlsx" (original), "<RAID> (proposed).xlsx" (changes highlighted, not yet approved) and "<RAID> (updated).xlsx" (approved only).
 * A report should read the newest approved log, never the proposed copy (it already contains unreviewed changes), and say
 * which huddle changes are still waiting so nobody assumes the log is complete.
 * Returns { requested, used, notes: [], pending: null | { file, awaitingReview, approvedNotApplied, items: [] } }.
 */
async function latestRaid(file) {
  const dir = path.dirname(file), ext = path.extname(file);
  const base = path.basename(file, ext).replace(/\s*\((proposed|updated)\)\s*$/i, '');
  const at = (tag) => path.join(dir, tag ? `${base} (${tag}).xlsx` : `${base}${ext}`);
  const [orig, upd, prop] = [at(''), at('updated'), at('proposed')];
  const mtime = (f) => fs.statSync(f).mtimeMs;
  const name = (f) => path.basename(f);
  const notes = [];
  let use = fs.existsSync(orig) ? orig : file;
  if (/\(proposed\)\s*$/i.test(path.basename(file, ext))) {
    notes.push(fs.existsSync(orig) || fs.existsSync(upd)
      ? `"${name(file)}" is a review copy that already contains unapproved changes, so the approved RAID log was used instead.`
      : `"${name(file)}" is a review copy and contains unapproved changes. There is no approved RAID log next to it to use instead.`);
  }
  if (fs.existsSync(upd)) {
    if (!fs.existsSync(use) || mtime(upd) >= mtime(use)) {
      if (use !== upd) notes.push(`Used "${name(upd)}" (approved huddle changes) because it is newer than "${name(use)}".`);
      use = upd;
    } else notes.push(`"${name(upd)}" is older than "${name(use)}", so it was not used. Re-apply the approved huddle changes if they are missing.`);
  }

  let pending = null;
  if (fs.existsSync(prop)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(prop);
    const rs = wb.getWorksheet('Proposed changes');
    if (rs) {
      const applied = fs.existsSync(upd) && mtime(upd) >= mtime(prop); // approved rows were written to the updated copy
      const items = [];
      let awaiting = 0, approved = 0;
      for (let r = 2; r <= rs.rowCount; r++) {
        const row = rs.getRow(r);
        if (!cellText(row.getCell(13)).startsWith('{')) continue;
        const decision = cellText(row.getCell(2)).trim().toLowerCase();
        const state = /^y/.test(decision) ? (applied ? 'applied' : 'approved') : /^n/.test(decision) ? 'declined' : 'awaiting';
        if (state === 'awaiting') awaiting++; else if (state === 'approved') approved++;
        if (state === 'awaiting' || state === 'approved') items.push({ n: +cellText(row.getCell(1)), state: state === 'awaiting' ? 'awaiting review' : 'approved, not yet applied', change: cellText(row.getCell(3)), kind: cellText(row.getCell(4)), id: cellText(row.getCell(5)), what: cellText(row.getCell(8)).replace(/\n/g, '; '), evidence: cellText(row.getCell(9)) });
      }
      if (awaiting || approved) pending = { file: name(prop), awaitingReview: awaiting, approvedNotApplied: approved, items: items.slice(0, 12) };
    }
  }
  if (pending) {
    const bits = [pending.awaitingReview && `${pending.awaitingReview} awaiting review`, pending.approvedNotApplied && `${pending.approvedNotApplied} approved but not yet applied`].filter(Boolean);
    notes.push(`Huddle changes are still pending in "${pending.file}": ${bits.join(', ')}. They are not in this report.`);
  }
  return { requested: name(file), used: use, notes, pending };
}

module.exports = { readTranscript, parseVtt, parsePlain, locateQuote, propose, applyApproved, huddleChecks, columns, latestRaid };
