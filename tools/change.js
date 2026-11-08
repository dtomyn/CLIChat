// Change management: interviews → change impacts → consolidated CIA and TNA → training actions. No AI here:
// the AI proposes, this code checks and writes.
//
// 1. proposeImpacts: AI-proposed impacts from interview transcripts. Each one must quote the transcript word for word
//    (the RAID check, shared through raid.verifyQuotes); unverified quotes are rejected. Writes "<CIA> (proposed).xlsx"
//    with the new rows highlighted and a "Proposed changes" sheet with an "Approve? (Yes/No)" column.
// 2. applyImpacts: only rows marked Yes go into "<CIA> (updated).xlsx" with Status "Approved".
// 3. consolidateCia: merges several CIA workbooks/sheets, de-duplicates impacts (same group + process + similar text),
//    builds a heat map (group × H/M/L), derives TNA rows from approved impacts and writes "CIA - consolidated.xlsx"
//    plus "Training actions - ADO import.xlsx". Inputs are never changed.
// 4. saveDraft: saves AI-written Markdown (training material, French drafts) as .md, Word and/or PowerPoint with a draft label.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const excel = require('./excel');
const raid = require('./raid');
const { similarity } = require('./tests');

const cellText = excel.cellText;
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
const HIGHLIGHT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const NEW_ROW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } };
const LEVEL_NAME = { H: 'High', M: 'Medium', L: 'Low' };
const LEVEL_RANK = { H: 3, M: 2, L: 1 };

/** The CIA template's columns. Existing workbooks may use other wording; CIA_HEADERS recognises the usual variants. */
const CIA_COLUMNS = ['Impact ID', 'Stakeholder group', 'Role(s)', 'Business process', 'Change description', 'Impact level (H/M/L)', 'Skill gap / training need', 'Training type', 'Evidence (quote)', 'Speaker', 'Time', 'Source', 'Status'];
const CIA_HEADERS = {
  id: [/^(impact )?id$/i, /^ref/i, /impact id/i],
  group: [/stakeholder/i, /^group$/i, /audience/i, /business unit/i],
  role: [/^roles?(\s*\(s\))?$/i, /job role/i, /^role/i],
  process: [/process/i],
  change: [/change desc/i, /^description$/i, /what changes/i, /^change$/i, /^impact$/i],
  level: [/impact level/i, /^level$/i, /rating/i, /^impact \(h\/m\/l\)/i, /severity/i],
  gap: [/skill/i, /training need/i, /\bgap\b/i],
  type: [/training type/i, /intervention/i],
  quote: [/evidence/i, /quote/i],
  speaker: [/speaker/i, /interviewee/i],
  time: [/^time/i],
  source: [/^source/i, /interview/i],
  status: [/^status$/i, /approv/i],
};

function headerMap(ws) {
  const headers = [];
  ws.getRow(1).eachCell((c, n) => { headers[n] = cellText(c).trim(); });
  const map = {};
  for (const [field, res] of Object.entries(CIA_HEADERS)) {
    for (const re of res) {
      const i = headers.findIndex((h, n) => h && re.test(h) && !Object.values(map).includes(n));
      if (i > 0) { map[field] = i; break; }
    }
  }
  return { map, headers };
}
const isImpactSheet = (ws) => { const { map } = headerMap(ws); return !!(map.group && map.change && map.level); };

function level(v) {
  const t = String(v ?? '').trim();
  if (/^h/i.test(t) || t === '3') return 'H';
  if (/^m/i.test(t) || t === '2') return 'M';
  if (/^l/i.test(t) || t === '1') return 'L';
  return null;
}
const statusOf = (s) => (/reject|withdrawn|^no$|declin|cancel/i.test(s || '') ? 'rejected' : /propos|draft|pending|review/i.test(s || '') ? 'proposed' : 'approved');
const outPath = (file, tag) => path.join(path.dirname(file), `${path.basename(file, path.extname(file)).replace(/\s*\((proposed|updated)\)\s*$/i, '')} (${tag}).xlsx`);

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

function addImpactSheet(wb, name = 'Impacts') {
  const ws = wb.addWorksheet(name);
  ws.addRow(CIA_COLUMNS);
  styleHeader(ws, [10, 20, 22, 22, 50, 12, 36, 22, 46, 16, 9, 26, 11]);
  return ws;
}

const lastRow = (ws) => { for (let r = ws.rowCount; r > 1; r--) { let any = false; ws.getRow(r).eachCell((c) => { if (cellText(c).trim()) any = true; }); if (any) return r; } return 1; };

function nextImpactId(ws, map) {
  let max = 0, prefix = 'CI-', width = 3;
  for (let r = 2; r <= lastRow(ws); r++) {
    const m = /^(.*?)(\d+)$/.exec(cellText(ws.getRow(r).getCell(map.id || 1)).trim());
    if (m) { prefix = m[1] || prefix; width = m[2].length; max = Math.max(max, +m[2]); }
  }
  return (n = 1) => `${prefix}${String(max + n).padStart(width, '0')}`;
}

function writeImpactRow(ws, map, row, impact, { fill } = {}) {
  const r = ws.getRow(row);
  const put = (field, v) => { if (map[field] && v != null && v !== '') { r.getCell(map[field]).value = v; if (fill) r.getCell(map[field]).fill = fill; } };
  put('id', impact.id); put('group', impact.group); put('role', impact.role); put('process', impact.process); put('change', impact.change);
  put('level', impact.level); put('gap', impact.gap); put('type', impact.type); put('quote', impact.quote ? `"${impact.quote}"` : '');
  put('speaker', impact.speaker); put('time', impact.time); put('source', impact.source); put('status', impact.status);
  r.alignment = { vertical: 'top', wrapText: true };
}

// ------------------------------------------------------------------ 1. propose
/**
 * impacts: [{ stakeholderGroup, role?, process, change, level: 'H'|'M'|'L', skillGap?, trainingType?,
 *             evidence: { quote } | quote, speaker?, reason? }]
 * transcripts: a file or files (interviews). cia: the CIA workbook to add to (optional; a new one is made next to the
 * first transcript when there is none). Returns { saved, proposed, notProposed, impacts, next }.
 */
async function proposeImpacts(transcripts, cia, impacts = [], { interviewDate } = {}) {
  const files = (Array.isArray(transcripts) ? transcripts : [transcripts]).filter(Boolean);
  if (!files.length) throw friendly('Give at least one interview transcript.');
  if (!Array.isArray(impacts) || !impacts.length) throw friendly('Give at least one proposed impact.');
  const wb = new ExcelJS.Workbook();
  if (cia) await wb.xlsx.readFile(cia);
  let ws = wb.worksheets.find(isImpactSheet) || addImpactSheet(wb);
  let { map } = headerMap(ws);
  const nextId = nextImpactId(ws, map);
  const quoteOf = (p) => p?.evidence?.quote ?? p?.quote;
  const accepted = [], rejected = [], warnings = [];
  let row = lastRow(ws);
  for (const { n, p, seg, reason } of raid.verifyQuotes(files, impacts, quoteOf).results) {
    const label = `${p.stakeholderGroup || p.group || '?'} · ${p.process || '?'}: ${String(p.change || '').slice(0, 80)}`;
    if (!seg) { rejected.push({ n, impact: label, reason }); continue; }
    const missing = ['stakeholderGroup', 'process', 'change'].filter((k) => !String(p[k] ?? (k === 'stakeholderGroup' ? p.group : '') ?? '').trim());
    if (missing.length) { rejected.push({ n, impact: label, reason: `Missing ${missing.join(', ').replace('stakeholderGroup', 'stakeholder group')}.` }); continue; }
    const lv = level(p.level);
    if (!lv) { rejected.push({ n, impact: label, reason: `Impact level "${p.level ?? ''}" must be H, M or L.` }); continue; }
    if (p.speaker && seg.speaker && p.speaker.trim().toLowerCase() !== seg.speaker.toLowerCase()) warnings.push(`Impact ${n}: the quote was said by ${seg.speaker}, not ${p.speaker}. The transcript's speaker is recorded.`);
    const impact = {
      id: nextId(accepted.length + 1), group: String(p.stakeholderGroup || p.group).trim(), role: [].concat(p.role || []).join(', '), process: String(p.process).trim(),
      change: String(p.change).trim(), level: lv, gap: p.skillGap || '', type: p.trainingType || '', quote: quoteOf(p), speaker: seg.speaker, time: seg.time,
      source: `${seg.file}${interviewDate ? ` (${interviewDate})` : ''}`, status: 'Proposed', reason: p.reason || '',
    };
    row += 1;
    writeImpactRow(ws, map, row, impact, { fill: NEW_ROW });
    accepted.push({ n: accepted.length + 1, impact, row });
  }

  const old = wb.getWorksheet('Proposed changes'); if (old) wb.removeWorksheet(old.id);
  const rs = wb.addWorksheet('Proposed changes', { properties: { tabColor: { argb: 'FFFFC000' } } });
  rs.addRow(['#', 'Approve? (Yes/No)', 'Impact ID', 'Stakeholder group', 'Business process', 'Change', 'Level', 'Evidence (transcript)', 'Speaker', 'Time', 'Source', 'Why', 'Change data']);
  styleHeader(rs, [4, 18, 10, 20, 22, 50, 8, 50, 16, 9, 30, 30, 10]);
  for (const a of accepted) {
    const i = a.impact;
    const r = rs.addRow([a.n, '', i.id, i.group, i.process, i.change, i.level, `"${i.quote}"`, i.speaker, i.time, i.source, i.reason, JSON.stringify(i)]);
    r.alignment = { vertical: 'top', wrapText: true };
    r.getCell(2).fill = HIGHLIGHT;
    r.getCell(2).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
  }
  rs.getColumn(13).hidden = true;
  if (rejected.length) {
    rs.addRow([]);
    rs.addRow(['', 'Not proposed (could not be checked)']).font = { bold: true };
    for (const x of rejected) rs.addRow(['', '', '', '', '', x.impact, '', x.reason]).alignment = { wrapText: true, vertical: 'top' };
  }
  wb.views = [{ activeTab: wb.worksheets.indexOf(rs) }];
  const out = cia ? outPath(cia, 'proposed') : path.join(path.dirname(files[0]), 'Change impacts (proposed).xlsx');
  await wb.xlsx.writeFile(out);
  return {
    saved: out, proposed: accepted.length, notProposed: rejected, warnings,
    impacts: accepted.map((a) => ({ n: a.n, id: a.impact.id, group: a.impact.group, process: a.impact.process, level: a.impact.level, change: a.impact.change, evidence: `${a.impact.speaker || 'Someone'} at ${a.impact.time || '?'} (${a.impact.source}): "${a.impact.quote}"`, at: `${ws.name}!A${a.row}` })),
    next: `Open the "(proposed)" workbook, set Approve? to Yes or No on every row of "Proposed changes", save it, then ask me to apply the approved impacts.${cia ? ' The original CIA workbook has not been changed.' : ''}`,
  };
}

// ------------------------------------------------------------------ 2. apply
async function applyImpacts(proposedFile, { original } = {}) {
  const pwb = new ExcelJS.Workbook();
  await pwb.xlsx.readFile(proposedFile);
  const rs = pwb.getWorksheet('Proposed changes');
  if (!rs) throw friendly(`"${path.basename(proposedFile)}" has no "Proposed changes" sheet. Propose the impacts first.`);
  const items = [];
  for (let r = 2; r <= rs.rowCount; r++) {
    const data = cellText(rs.getRow(r).getCell(13));
    if (!data.startsWith('{')) continue;
    items.push({ n: +cellText(rs.getRow(r).getCell(1)), decision: cellText(rs.getRow(r).getCell(2)).trim().toLowerCase(), impact: JSON.parse(data) });
  }
  const undecided = items.filter((x) => !/^(y|yes|n|no)$/.test(x.decision));
  if (undecided.length) return { saved: null, applied: 0, undecided: undecided.map((x) => x.n), note: `Rows ${undecided.map((x) => x.n).join(', ')} have no Yes/No in "Approve?". Nothing was applied. Mark every row, save the workbook and try again.` };

  const src = original || path.join(path.dirname(proposedFile), `${path.basename(proposedFile, '.xlsx').replace(/\s*\(proposed\)\s*$/i, '')}.xlsx`);
  const wb = new ExcelJS.Workbook();
  const fresh = !fs.existsSync(src);
  if (!fresh) await wb.xlsx.readFile(src);
  const ws = wb.worksheets.find(isImpactSheet) || addImpactSheet(wb);
  const { map } = headerMap(ws);
  const nextId = nextImpactId(ws, map);
  const applied = [], declined = [];
  let row = lastRow(ws);
  for (const x of items) {
    if (!/^y/.test(x.decision)) { declined.push(x.n); continue; }
    const impact = { ...x.impact, id: nextId(applied.length + 1), status: 'Approved' };
    writeImpactRow(ws, map, ++row, impact);
    applied.push({ n: x.n, id: impact.id, group: impact.group, process: impact.process, level: impact.level, at: `${ws.name}!A${row}` });
  }
  const out = outPath(src, 'updated');
  await wb.xlsx.writeFile(out);
  return { saved: out, applied: applied.length, rejectedByReviewer: declined, details: applied, note: `Approved impacts were written to the "(updated)" copy with Status Approved.${fresh ? '' : ' The original CIA workbook is unchanged.'}` };
}

// ------------------------------------------------------------------ 3. consolidate
async function readImpacts(file) {
  const wb = await excel.open(file);
  const proposedCopy = /\(proposed\)\s*$/i.test(path.basename(file, path.extname(file)));
  const out = [], sheets = [];
  for (const ws of wb.worksheets) {
    if (ws.state === 'veryHidden' || ws.name === 'Proposed changes' || !isImpactSheet(ws)) continue;
    const { map } = headerMap(ws);
    sheets.push(ws.name);
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const get = (f) => (map[f] ? cellText(row.getCell(map[f])).trim() : '');
      const change = get('change');
      if (!change) return;
      out.push({
        file: path.basename(file), sheet: ws.name, row: r, at: `${path.basename(file)} › ${ws.name}!${colLetter(map.id || map.change)}${r}`,
        id: get('id'), group: get('group'), role: get('role'), process: get('process'), change, level: level(get('level')), levelText: get('level'),
        gap: get('gap'), type: get('type'), quote: get('quote').replace(/^"|"$/g, ''), speaker: get('speaker'), source: get('source'),
        status: statusOf(get('status')), statusText: get('status'),
      });
    });
  }
  return { file, impacts: out, sheets, proposedCopy };
}

async function readRoles(file) {
  if (!file) return [];
  const wb = await excel.open(file);
  for (const ws of wb.worksheets) {
    const headers = [];
    ws.getRow(1).eachCell((c, n) => { headers[n] = cellText(c).trim(); });
    const col = (re) => headers.findIndex((h) => h && re.test(h));
    const role = col(/^role/i), group = col(/stakeholder|group|business unit/i), count = col(/headcount|count|people|number/i);
    if (role < 1 || group < 1) continue;
    const out = [];
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const name = cellText(row.getCell(role)).trim();
      if (name) out.push({ role: name, group: cellText(row.getCell(group)).trim(), headcount: count > 0 ? Number(cellText(row.getCell(count))) || null : null, at: `${ws.name}!A${r}` });
    });
    return out;
  }
  throw friendly(`"${path.basename(file)}" needs a sheet with "Role" and "Stakeholder group" columns.`);
}

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const TRAINING_FOR = { H: 'Instructor-led session + job aid', M: 'Walkthrough or e-learning + job aid', L: 'Communication + quick reference' };
const PRIORITY = { H: 'High', M: 'Medium', L: 'Low' };

/**
 * files: CIA workbooks (any number of impact sheets each). opts: { roles: roles workbook, output, threshold (0.5) }.
 * Impacts with Status Rejected are left out; Proposed ones are counted in the heat map but not used for the TNA.
 */
async function consolidateCia(files, { roles, output, threshold = 0.5, trainingActions } = {}) {
  if (!Array.isArray(files) || !files.length) throw friendly('Give at least one CIA workbook.');
  const notes = [], sources = [];
  const all = [];
  for (const f of files) {
    const r = await readImpacts(f);
    if (!r.sheets.length) { notes.push(`"${path.basename(f)}" has no impact sheet (columns Stakeholder group, Change description and Impact level), so it was skipped.`); continue; }
    if (r.proposedCopy) notes.push(`"${path.basename(f)}" is a review copy: its Proposed impacts are counted in the heat map but are not in the training needs until they are approved.`);
    sources.push({ file: path.basename(f), sheets: r.sheets, impacts: r.impacts.length });
    all.push(...r.impacts);
  }
  const roleList = await readRoles(roles);
  const rejected = all.filter((i) => i.status === 'rejected');
  const noLevel = all.filter((i) => i.status !== 'rejected' && !i.level);
  for (const i of noLevel) notes.push(`${i.id || 'An impact'} at ${i.at} has no H/M/L impact level ("${i.levelText}"), so it is shown as Medium.`);

  // De-duplicate: same stakeholder group and process, and similar change text.
  const merged = [], duplicates = [];
  for (const i of all.filter((x) => x.status !== 'rejected')) {
    const lv = i.level || 'M';
    const hit = merged.find((m) => key(m.group) === key(i.group) && key(m.process) === key(i.process) && similarity(m.change, i.change) >= threshold);
    if (hit) {
      duplicates.push({ kept: hit.id || hit.at, keptAt: hit.at, merged: i.id || i.at, mergedAt: i.at, similarity: +similarity(hit.change, i.change).toFixed(2), group: i.group, process: i.process });
      if (LEVEL_RANK[lv] > LEVEL_RANK[hit.level]) hit.level = lv;
      hit.sources.push(i.at); hit.ids.push(i.id);
      if (i.status === 'approved') hit.status = 'approved';
      for (const f of ['role', 'gap', 'type']) if (i[f] && !hit[f].toLowerCase().includes(i[f].toLowerCase())) hit[f] = hit[f] ? `${hit[f]}, ${i[f]}` : i[f];
      continue;
    }
    merged.push({ ...i, level: lv, sources: [i.at], ids: [i.id] });
  }
  merged.forEach((m, n) => { m.cid = `CIA-${String(n + 1).padStart(3, '0')}`; });

  // Heat map: stakeholder group × impact level.
  const groups = [...new Set(merged.map((m) => m.group || '(no group)'))].sort();
  const heatMap = groups.map((g) => {
    const rows = merged.filter((m) => (m.group || '(no group)') === g);
    const c = (l) => rows.filter((m) => m.level === l).length;
    return { group: g, H: c('H'), M: c('M'), L: c('L'), total: rows.length, notYetApproved: rows.filter((m) => m.status !== 'approved').length };
  });

  // TNA: one row per approved impact and role (roles from the impact, else every role in the group from the role list).
  const tna = [];
  for (const m of merged.filter((x) => x.status === 'approved')) {
    let roleNames = m.role ? m.role.split(/\s*[,;\n]\s*/).filter(Boolean) : [];
    if (!roleNames.length) roleNames = roleList.filter((r) => key(r.group) === key(m.group)).map((r) => r.role);
    if (!roleNames.length) roleNames = [`All ${m.group || 'affected staff'}`];
    for (const role of roleNames) {
      const info = roleList.find((r) => key(r.role) === key(role));
      tna.push({ group: m.group, role, headcount: info?.headcount ?? null, gap: m.gap || `New way of working: ${m.change}`, type: m.type || TRAINING_FOR[m.level], priority: PRIORITY[m.level], impact: m.cid, sources: m.sources.join('; ') });
    }
  }
  const unknownRoles = [...new Set(merged.flatMap((m) => (m.role ? m.role.split(/\s*[,;\n]\s*/) : [])).filter((r) => r && roleList.length && !roleList.some((x) => key(x.role) === key(r))))];
  if (unknownRoles.length) notes.push(`Roles not in the role list: ${unknownRoles.join(', ')}.`);

  // Workbook
  const wb = new ExcelJS.Workbook();
  const ci = wb.addWorksheet('Consolidated impacts');
  ci.addRow(['ID', 'Stakeholder group', 'Role(s)', 'Business process', 'Change description', 'Impact level', 'Status', 'Skill gap / training need', 'Training type', 'Merged from', 'Sources']);
  styleHeader(ci, [10, 20, 24, 22, 54, 10, 14, 36, 24, 18, 50]);
  const LEVEL_FILL = { H: 'FFF8CBAD', M: 'FFFFE699', L: 'FFC6EFCE' };
  for (const m of merged) {
    const r = ci.addRow([m.cid, m.group, m.role, m.process, m.change, LEVEL_NAME[m.level], m.status === 'approved' ? 'Approved' : 'Not yet approved', m.gap, m.type, m.ids.filter(Boolean).join(', '), m.sources.join('\n')]);
    r.alignment = { vertical: 'top', wrapText: true };
    r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LEVEL_FILL[m.level] } };
  }
  const hm = wb.addWorksheet('Heat map');
  hm.addRow(['Stakeholder group', 'High', 'Medium', 'Low', 'Total', 'Not yet approved']);
  styleHeader(hm, [28, 10, 10, 10, 10, 16]);
  const max = Math.max(1, ...heatMap.flatMap((h) => [h.H, h.M, h.L]));
  const shade = (n, rgb) => { const a = Math.round(40 + 215 * (n / max)).toString(16).padStart(2, '0'); return { type: 'pattern', pattern: 'solid', fgColor: { argb: `${a.toUpperCase()}${rgb}` } }; };
  for (const h of heatMap) {
    const r = hm.addRow([h.group, h.H, h.M, h.L, h.total, h.notYetApproved]);
    if (h.H) r.getCell(2).fill = shade(h.H, 'E06666');
    if (h.M) r.getCell(3).fill = shade(h.M, 'F1C232');
    if (h.L) r.getCell(4).fill = shade(h.L, '93C47D');
  }
  hm.addRow(['Total', ...['H', 'M', 'L', 'total', 'notYetApproved'].map((k) => heatMap.reduce((s, h) => s + h[k], 0))]).font = { bold: true };
  const tn = wb.addWorksheet('TNA');
  tn.addRow(['Stakeholder group', 'Role', 'Headcount', 'Skill gap / training need', 'Training type', 'Priority', 'Impact', 'Sources']);
  styleHeader(tn, [20, 26, 10, 50, 30, 10, 10, 50]);
  for (const t of tna) tn.addRow([t.group, t.role, t.headcount, t.gap, t.type, t.priority, t.impact, t.sources]).alignment = { vertical: 'top', wrapText: true };
  const dup = wb.addWorksheet('Merged duplicates');
  dup.addRow(['Kept', 'Kept at', 'Merged', 'Merged at', 'Similarity', 'Stakeholder group', 'Business process']);
  styleHeader(dup, [12, 40, 12, 40, 10, 20, 22]);
  for (const d of duplicates) dup.addRow([d.kept, d.keptAt, d.merged, d.mergedAt, d.similarity, d.group, d.process]);
  const src = wb.addWorksheet('Sources');
  src.addRow(['File', 'Sheets', 'Impacts read']);
  styleHeader(src, [40, 30, 12]);
  for (const s of sources) src.addRow([s.file, s.sheets.join(', '), s.impacts]);
  if (rejected.length) src.addRow([`${rejected.length} rejected impact${rejected.length === 1 ? '' : 's'} left out`]);
  for (const n of notes) src.addRow([n]);

  const dir = path.dirname(files[0]);
  const out = freeName(output || path.join(dir, 'CIA - consolidated.xlsx'));
  await wb.xlsx.writeFile(out);

  // Training actions in the Azure DevOps work-item import layout (one Task per role and training type).
  const actions = [];
  for (const t of tna) {
    const hit = actions.find((a) => a.role === t.role && a.type === t.type);
    if (hit) { hit.gaps.push(t.gap); hit.impacts.push(t.impact); if (PRIORITY_NUM[t.priority] < hit.priority) hit.priority = PRIORITY_NUM[t.priority]; continue; }
    actions.push({ role: t.role, group: t.group, type: t.type, gaps: [t.gap], impacts: [t.impact], priority: PRIORITY_NUM[t.priority] });
  }
  let actionsFile = null;
  if (actions.length) {
    const aw = new ExcelJS.Workbook();
    const as = aw.addWorksheet('Training actions');
    as.addRow(['ID', 'Work Item Type', 'Title', 'Description', 'Priority', 'Tags']);
    styleHeader(as, [8, 16, 60, 80, 9, 24]);
    for (const a of actions) as.addRow(['', 'Task', `Training: ${a.type} for ${a.role} (${a.group})`, `Skill gaps: ${a.gaps.join('; ')}. From impacts ${[...new Set(a.impacts)].join(', ')} in ${path.basename(out)}.`, a.priority, 'Training; CIA']).alignment = { vertical: 'top', wrapText: true };
    actionsFile = freeName(trainingActions || path.join(path.dirname(out), 'Training actions - ADO import.xlsx'));
    await aw.xlsx.writeFile(actionsFile);
  }

  return {
    saved: out, trainingActions: actionsFile, sources,
    impactsRead: all.length, rejectedLeftOut: rejected.length, consolidated: merged.length,
    duplicatesMerged: duplicates, heatMap, tna: { rows: tna.length, byPriority: Object.fromEntries(['High', 'Medium', 'Low'].map((p) => [p, tna.filter((t) => t.priority === p).length])) },
    trainingActionCount: actions.length, notes,
    summary: `${all.length} impacts read from ${sources.length} file${sources.length === 1 ? '' : 's'}; ${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'} merged; ${merged.length} consolidated impacts (${heatMap.reduce((s, h) => s + h.H, 0)} high); ${tna.length} training needs and ${actions.length} training actions.`,
    next: 'Review the consolidated CIA with the change lead. The training actions workbook can be imported into Azure DevOps (or proposed through the Azure DevOps tools). The source CIA workbooks have not been changed.',
  };
}
const PRIORITY_NUM = { High: 1, Medium: 2, Low: 3 };

// ------------------------------------------------------------------ 4. drafts
/** The program deck template in the project's Templates folder ("… Deck Template.potx"), if there is one. */
function findDeckTemplate(root) {
  const dir = root && path.join(root, 'Templates');
  if (!dir || !fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /\.(potx|pptx)$/i.test(f) && !f.startsWith('~$'));
  const pick = files.find((f) => /deck template\.potx$/i.test(f)) || files.find((f) => /template\.potx$/i.test(f)) || files.find((f) => /\.potx$/i.test(f));
  return pick ? path.join(dir, pick) : null;
}

/**
 * Save AI-written Markdown as a draft: "<name>.md" and/or a Word copy and/or a PowerPoint deck. The label goes at the
 * top of the document (on the title slide of a deck), and the sources it cites are listed at the end (a "Sources"
 * slide in a deck). Never overwrites: a numbered copy is saved instead.
 * opts: { label, sources: [..], word: true|false, powerpoint: true|false, template (a Word template, or a .potx/.pptx
 * deck template), deckTemplate, root (the project folder: its Templates/"… Deck Template.potx" is used when no deck
 * template is given), title }
 */
async function saveDraft(file, markdown, { label = 'Draft (AI) for review', sources = [], word = false, powerpoint = false, template, deckTemplate, root, title } = {}) {
  if (!String(markdown || '').trim()) throw friendly('There is nothing to save.');
  const ext = path.extname(file).toLowerCase();
  if (!['.md', '.docx', '.pptx'].includes(ext)) throw friendly('Save drafts as .md (Markdown), .docx (Word) or .pptx (PowerPoint).');
  const src = [].concat(sources || []).map(String).filter(Boolean);
  const sourcesMd = src.length ? ['', '## Sources', '', ...src.map((s) => `- ${s}`)] : [];
  const body = [`> **${label}**`, '', String(markdown).trim(), ...sourcesMd].join('\n') + '\n';
  const warnings = [];
  if (!src.length && !/source/i.test(markdown)) warnings.push('This draft does not cite any source. Add the approved sections it is based on.');
  // A template goes to the format its extension belongs to.
  const isDeck = (t) => typeof t === 'string' && /\.(potx|pptx)$/i.test(t);
  const wordTemplate = template && !isDeck(template) ? template : undefined;
  const h1 = /^\s*#\s+(.+?)\s*#*\s*$/m.exec(String(markdown).trim().split('\n')[0] || '');
  const out = {};
  if (ext === '.md') { out.saved = freeName(file); fs.writeFileSync(out.saved, body, 'utf8'); }
  if (ext === '.docx' || word) {
    const target = freeName(ext === '.docx' ? file : file.replace(/\.(md|pptx)$/i, '.docx'));
    // Without a template Word puts the title at the top. A draft that starts with its own "# Heading" gives that title
    // (unless another one was asked for), and the heading is not repeated under it.
    const sameTitle = h1 && (!title || h1[1].trim().toLowerCase() === String(title).trim().toLowerCase());
    const wordTitle = sameTitle ? h1[1].trim() : title || path.basename(target, '.docx');
    const wordBody = sameTitle && !wordTemplate ? body.replace(h1[0].trim(), '').replace(/\n{3,}/, '\n\n') : body;
    const r = await require('./md-export').toDocx(wordBody, { title: wordTitle, template: wordTemplate, properties: { Status: label } });
    fs.writeFileSync(target, r.buffer);
    if (r.warning) warnings.push(r.warning);
    if (ext === '.docx') out.saved = target; else out.word = target;
  }
  if (ext === '.pptx' || powerpoint) {
    const target = freeName(ext === '.pptx' ? file : file.replace(/\.(md|docx)$/i, '.pptx'));
    // The deck outline: "# Title" is the title slide (with the draft label under it), each "##" a slide, Sources last.
    const deckTitle = h1 ? h1[1].trim() : title || path.basename(target, '.pptx');
    const deckMd = [h1 ? '' : `# ${deckTitle}`, String(markdown).trim(), ...sourcesMd].join('\n').trim() + '\n';
    const tpl = deckTemplate || (isDeck(template) ? template : undefined) || findDeckTemplate(root) || undefined;
    const r = await require('./pptx').toPptx(deckMd, { title: deckTitle, template: tpl, label, properties: { Status: label } });
    fs.writeFileSync(target, r.buffer);
    if (r.warning) warnings.push(r.warning);
    out.deck = { slides: r.slides, speakerNotes: r.notes, template: r.template ? path.basename(String(tpl)) : null };
    if (ext === '.pptx') out.saved = target; else out.powerpoint = target;
  }
  return { ...out, label, sources: src.length, warnings };
}

module.exports = { proposeImpacts, applyImpacts, consolidateCia, readImpacts, readRoles, saveDraft, findDeckTemplate, level, CIA_COLUMNS };
