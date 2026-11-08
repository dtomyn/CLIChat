// Excel support (.xlsx / .xlsm / .csv) using exceljs — no Excel installation required.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const project = require('./project');

const { execFileSync } = require('child_process');

// Files written by code have formulas without cached values. Let real Excel recalculate when it's available
// (every PM has it); otherwise flag the workbook so Excel recalculates when it is opened.
let excelAvailable = null;
function hasExcel() {
  if (excelAvailable === null) {
    excelAvailable = false;
    if (process.platform === 'win32') { try { execFileSync('reg', ['query', 'HKCR\\Excel.Application'], { stdio: 'ignore' }); excelAvailable = true; } catch {} }
  }
  return excelAvailable;
}
function recalc(file) {
  if (!hasExcel() || !/\.xlsx?m?$/i.test(file)) return false;
  // PowerShell treats typographic quotes (‘ ’ ‚ ‛) as single quotes too, so a file name such as "Bob’s plan.xlsx"
  // would end the string early and the rest of the name would run as a command. Double all of them.
  const q = `'${String(file).replace(/['‘’‚‛]/g, (c) => c + c)}'`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$x = New-Object -ComObject Excel.Application; $x.Visible = $false; $x.DisplayAlerts = $false; try { $wb = $x.Workbooks.Open(${q}); $x.CalculateFull(); $wb.Save(); $wb.Close($false) } finally { $x.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($x) }`],
      { stdio: 'ignore', timeout: 90000, windowsHide: true });
    return true;
  } catch { return false; }
}
async function save(wb, file, { recalculate = true } = {}) {
  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
  if (path.extname(file).toLowerCase() === '.csv') await wb.csv.writeFile(file);
  else { await wb.xlsx.writeFile(file); if (recalculate) recalc(file); }
}

const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

function cellText(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v || 'formula' in v || 'sharedFormula' in v) {
      const f = cell.formula || v.formula || v.sharedFormula; // cell.formula translates shared formulas to this cell
      let r = cell.result ?? v.result;
      if (r === undefined && cell.value.sharedFormula) r = 0; // Excel omits zero results on shared formulas
      const shown = r instanceof Date ? r.toISOString().slice(0, 10) : r && typeof r === 'object' && r.error ? r.error : r;
      return shown == null ? `=${f}` : `${typeof shown === 'number' ? +shown.toFixed(4) : shown} ⟨=${f}⟩`;
    }
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text) return v.text;
    if (v.error) return v.error;
  }
  return typeof v === 'number' ? String(+v.toFixed(4)) : String(v);
}

async function open(file) {
  const ext = path.extname(file).toLowerCase();
  const wb = new ExcelJS.Workbook();
  if (ext === '.csv') await wb.csv.readFile(file);
  else if (['.xlsx', '.xlsm'].includes(ext)) await wb.xlsx.readFile(file);
  else if (ext === '.xls') { const e = new Error(`"${path.basename(file)}" is an old .xls file. Open it in Excel and save it as .xlsx first.`); e.friendly = true; throw e; }
  else { const e = new Error(`"${path.basename(file)}" isn't a spreadsheet (.xlsx, .xlsm or .csv).`); e.friendly = true; throw e; }
  return wb;
}

/** Text rendering of sheets with real cell addresses so the AI can cite and update cells. */
async function read(file, { sheet, maxRows = 300, showFormulas = true } = {}) {
  const wb = await open(file);
  const sheets = wb.worksheets.filter((ws) => ws.state !== 'veryHidden');
  const picked = sheet ? sheets.filter((ws) => ws.name.toLowerCase() === String(sheet).toLowerCase()) : sheets;
  if (sheet && !picked.length) return `No sheet named "${sheet}". Sheets: ${sheets.map((s) => s.name).join(', ')}`;
  const out = [`Workbook: ${path.basename(file)} — sheets: ${sheets.map((ws) => `${ws.name} (${ws.actualRowCount} rows)`).join(', ')}`];
  for (const ws of picked) {
    const cols = ws.actualColumnCount || ws.columnCount;
    out.push(`\n## Sheet "${ws.name}"  (${ws.actualRowCount} rows × ${cols} columns)`);
    out.push(['Row', ...Array.from({ length: cols }, (_, i) => colLetter(i + 1))].join(' | '));
    let shown = 0;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (shown >= maxRows) return;
      const cells = [];
      for (let c = 1; c <= cols; c++) { let t = cellText(row.getCell(c)); if (!showFormulas) t = t.replace(/ ⟨=.*⟩$/, ''); cells.push(t.replace(/\|/g, '/').replace(/\n/g, ' ')); }
      out.push([r, ...cells].join(' | '));
      shown++;
    });
    if (ws.actualRowCount > maxRows) out.push(`… ${ws.actualRowCount - maxRows} more rows (ask for a specific sheet or raise maxRows)`);
  }
  out.push('\n(Formulas are shown as: value ⟨=formula⟩)');
  return out.join('\n');
}

const FORMATS = { currency: '"$"#,##0', currency2: '"$"#,##0.00', percent: '0%', percent1: '0.0%', number: '#,##0', decimal: '#,##0.00', date: 'yyyy-mm-dd', text: '@' };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B3FD9' } };

function coerce(v, fmt) {
  if (typeof v === 'string' && v.startsWith('=')) return { formula: v.slice(1) };
  if (fmt === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v.slice(0, 10) + 'T00:00:00Z');
  return v;
}

function styleSheet(ws, columns, rowCount) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (rowCount) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.format && FORMATS[c.format]) col.numFmt = FORMATS[c.format];
    let w = String(c.header).length;
    col.eachCell({ includeEmpty: false }, (cell) => { w = Math.max(w, Math.min(60, cellText(cell).replace(/ ⟨=.*⟩$/, '').length)); });
    col.width = c.width || Math.max(10, w + 2);
  });
}

/** Create (or replace) a workbook. sheets: [{ name, columns: [{header, format?, width?}] | ["A","B"], rows: [[...]], totals?: ["sum"|"average"|null,...] }] */
async function write(file, sheets, { recalculate = true } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lumen';
  for (const s of sheets) {
    const ws = wb.addWorksheet(String(s.name || 'Sheet1').slice(0, 31));
    const columns = (s.columns || []).map((c) => (typeof c === 'string' ? { header: c } : c));
    ws.addRow(columns.map((c) => c.header));
    for (const r of s.rows || []) ws.addRow(r.map((v, i) => coerce(v, columns[i]?.format)));
    if (s.totals && (s.rows || []).length) {
      const last = ws.rowCount;
      const t = ws.addRow(columns.map((c, i) => {
        const fn = s.totals[i];
        if (i === 0 && !fn) return 'Total';
        return fn ? { formula: `${String(fn).toUpperCase()}(${colLetter(i + 1)}2:${colLetter(i + 1)}${last})` } : null;
      }));
      t.font = { bold: true };
      t.border = { top: { style: 'thin' } };
    }
    styleSheet(ws, columns, (s.rows || []).length);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await save(wb, file, { recalculate }); // recalculate: false skips the Excel round trip when there are no formulas
  return { saved: file, sheets: sheets.map((s) => `${s.name} (${(s.rows || []).length} rows)`) };
}

/** Change cells in an existing workbook (formatting preserved). updates: [{ sheet?, cell: "C7", value }], appendRows: [{ sheet, rows }] */
async function update(file, { updates = [], appendRows = [], saveAs } = {}) {
  const wb = await open(file);
  const sheetOf = (name) => (name ? wb.getWorksheet(name) : wb.worksheets[0]);
  const done = [];
  for (const u of updates) {
    const ws = sheetOf(u.sheet);
    if (!ws) { done.push(`sheet "${u.sheet}" not found`); continue; }
    const cell = ws.getCell(u.cell);
    const before = cellText(cell);
    cell.value = coerce(u.value, typeof u.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(u.value) ? 'date' : null);
    done.push(`${ws.name}!${u.cell}: ${before || '(empty)'} → ${u.value}`);
  }
  for (const a of appendRows) {
    const ws = sheetOf(a.sheet);
    if (!ws) { done.push(`sheet "${a.sheet}" not found`); continue; }
    for (const r of a.rows || []) { const row = ws.addRow(r.map((v) => coerce(v))); done.push(`${ws.name}: added row ${row.number}`); }
  }
  const out = saveAs ? path.resolve(path.dirname(file), saveAs) : file;
  if (path.resolve(out) === path.resolve(file) && process.env.LUMEN_SNAPSHOT_DIR && process.env.OFFICE_MCP_ROOT) {
    const root = path.resolve(process.env.OFFICE_MCP_ROOT);
    const rel = path.relative(root, path.resolve(file));
    const snapshot = path.resolve(process.env.LUMEN_SNAPSHOT_DIR, rel);
    const snapshotRel = path.relative(root, snapshot);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !snapshotRel || snapshotRel.startsWith('..') || path.isAbsolute(snapshotRel)) throw new Error('Cannot snapshot a file outside the project folder.');
    const realRoot = fs.realpathSync(root);
    let dir = root;
    for (const part of path.dirname(snapshotRel).split(path.sep)) {
      dir = path.join(dir, part);
      fs.mkdirSync(dir, { recursive: true });
      const actual = path.relative(realRoot, fs.realpathSync(dir));
      if (!actual || actual.startsWith('..') || path.isAbsolute(actual)) throw new Error('Snapshot folder must stay inside the project folder.');
    }
    if (!fs.existsSync(snapshot)) fs.copyFileSync(file, snapshot, fs.constants.COPYFILE_EXCL);
  }
  await save(wb, out);
  return { saved: out, changes: done };
}

/** Turn a Microsoft Project plan into a formatted Excel tracker with a weekly variance Gantt.
 *  history: optional earlier versions of the same plan, for the milestone week-over-week trend. */
async function projectToWorkbook(planFile, outFile, { history = [], historyRoot } = {}) {
  const p = project.load(planFile);
  // Remember this version of the plan, and fall back to earlier saved versions when none are given.
  let historySource = history.length ? 'given' : 'none';
  if (historyRoot) {
    try { project.recordVersion(p, historyRoot); } catch { /* best effort */ }
    if (!history.length) { history = project.earlierVersions(historyRoot, planFile, p.statusDate); if (history.length) historySource = 'saved versions'; }
  }
  const a = project.analyze(planFile);
  const critical = new Set(a.criticalPath.map((t) => t.id));
  const late = new Set(a.lateTasks.map((t) => t.id));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lumen';
  const ss = wb.addWorksheet('Summary'); // first tab

  // Tasks
  const ws = wb.addWorksheet('Tasks');
  const cols = [
    { header: 'ID', width: 6 }, { header: 'WBS', width: 8 }, { header: 'Task', width: 46 }, { header: 'Start', width: 12, format: 'date' }, { header: 'Finish', width: 12, format: 'date' },
    { header: 'Duration (days)', width: 10 }, { header: '% Complete', width: 11, format: 'percent' }, { header: 'Baseline finish', width: 14, format: 'date' }, { header: 'Slip (days)', width: 10 },
    { header: 'Resources', width: 30 }, { header: 'Status', width: 14 },
  ];
  ws.addRow(cols.map((c) => c.header));
  for (const t of p.tasks) {
    const slip = t.baselineFinish && t.finish ? project.workdaysBetween(t.baselineFinish, t.finish) : '';
    const status = t.summary ? '' : t.percent === 100 ? 'Complete' : late.has(t.id) ? 'Late' : critical.has(t.id) ? 'Critical' : t.percent > 0 ? 'In progress' : 'Not started';
    const row = ws.addRow([t.id, t.wbs, `${'   '.repeat(t.level - 1)}${t.name}`, t.start, t.finish, t.durationDays, t.percent / 100, t.baselineFinish, slip, t.resources.join(', '), status]);
    if (t.summary) row.font = { bold: true };
    const sc = row.getCell(11);
    const color = { Complete: 'FFD7F5E3', Late: 'FFFADBD8', Critical: 'FFFFE8CC', 'In progress': 'FFDCE8FF' }[status];
    if (color) sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  }
  styleSheet(ws, cols, p.tasks.length);

  // Gantt (one column per week), with the baseline drawn under each bar so schedule variance is visible.
  const gs = wb.addWorksheet('Gantt');
  const status = toLocalDate(a.statusDate);
  const weeks = ganttWeeks(p);
  const FIRST_WEEK_COL = 5;
  const statusWeek = weeks.findIndex((w) => status >= w && status < new Date(+w + 7 * DAY));
  gs.addRow(['Task', 'Baseline finish', 'Forecast finish', 'Variance (days)', ...weeks.map((w) => project.iso(w).slice(5))]);
  const fill = (argb, pattern = 'solid', bg) => ({ type: 'pattern', pattern, fgColor: { argb }, ...(bg ? { bgColor: { argb: bg } } : {}) });
  for (const t of p.tasks) {
    const variance = finishVariance(t);
    const row = gs.addRow([`${'  '.repeat(t.level - 1)}${t.name}`, t.baselineFinish, t.finish, variance ?? '']);
    if (t.summary) row.font = { bold: true };
    row.getCell(2).numFmt = row.getCell(3).numFmt = FORMATS.date;
    const vc = row.getCell(4);
    vc.alignment = { horizontal: 'center' };
    const vColor = varianceColor(variance);
    if (vColor) vc.fill = fill(vColor);
    const barColor = t.summary ? 'FF9AA3B5' : t.milestone ? 'FF111111' : t.percent === 100 ? 'FF34B27A' : late.has(t.id) ? 'FFE5484D' : critical.has(t.id) ? 'FFF59E0B' : 'FF6D4DFF';
    weeks.forEach((w, i) => {
      const s = ganttWeek(t, w);
      const c = row.getCell(i + FIRST_WEEK_COL);
      if (t.milestone) {
        if (s.current) { c.value = '◆'; c.font = { bold: true, color: { argb: s.base || !t.baselineFinish ? 'FF111111' : 'FFE5484D' } }; }
        else if (s.base) { c.value = '◇'; c.font = { color: { argb: 'FF6B7280' } }; }
        c.alignment = { horizontal: 'center' };
      } else if (s.slip) c.fill = fill('FFE5484D', 'darkUp', 'FFFADBD8'); // scheduled past the baseline
      else if (s.current) c.fill = fill(barColor);
      else if (s.base) c.fill = fill('FFE5E7EB'); // baseline weeks the task no longer occupies
      const border = {};
      if (s.base && !t.milestone) border.bottom = { style: 'thick', color: { argb: 'FF374151' } };
      if (i === statusWeek) border.left = { style: 'medium', color: { argb: 'FFE5484D' } };
      if (Object.keys(border).length) c.border = border;
    });
  }
  const hdr = gs.getRow(1); hdr.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }; hdr.fill = HEADER_FILL; hdr.alignment = { textRotation: 90, horizontal: 'center' };
  for (let i = 1; i <= 4; i++) hdr.getCell(i).alignment = { vertical: 'bottom', wrapText: true };
  if (statusWeek >= 0) hdr.getCell(statusWeek + FIRST_WEEK_COL).fill = fill('FFE5484D');
  hdr.height = 44;
  gs.getColumn(1).width = 44; gs.getColumn(2).width = 11; gs.getColumn(3).width = 11; gs.getColumn(4).width = 9;
  for (let i = FIRST_WEEK_COL; i < weeks.length + FIRST_WEEK_COL; i++) gs.getColumn(i).width = 3.2;
  gs.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];
  gs.addRow([]);
  for (const line of [
    'Bars: purple = scheduled · amber = critical path · red = late · green = complete · grey = summary',
    'Variance: dark line under a bar = baseline dates · red hatching = weeks scheduled past the baseline finish · light grey = baseline weeks no longer used',
    `◆ = forecast milestone (red when it has moved off its baseline week) · ◇ = baseline milestone · red column = status date ${a.statusDate}`,
    'Variance (days) = working days between baseline finish and forecast finish; positive means later than baseline.',
  ]) { const r = gs.addRow([line]); r.font = { italic: true, color: { argb: 'FF666666' } }; }

  // Milestone variance, with a week-over-week trend when earlier versions of the plan are supplied.
  const snapshots = loadSnapshots(history, planFile);
  const trend = milestoneTrend(p, snapshots);
  const ms = wb.addWorksheet('Milestone variance');
  const mcols = [{ header: 'ID', width: 6 }, { header: 'Milestone', width: 34 }, { header: 'Baseline', width: 12, format: 'date' },
    ...trend.versions.map((v) => ({ header: `Forecast ${v.label}`, width: 14, format: 'date' })),
    { header: 'Variance (days)', width: 10 }, { header: 'Change vs. last (days)', width: 12 }, { header: 'Trend', width: 12 }, { header: 'Status', width: 14 }];
  ms.addRow(mcols.map((c) => c.header));
  for (const m of trend.rows) {
    const r = ms.addRow([m.id, m.name, m.baseline, ...m.forecasts, m.variance ?? '', m.change ?? '', m.trend, m.status]);
    const vCol = 4 + trend.versions.length;
    const vColor = varianceColor(m.variance);
    if (vColor) r.getCell(vCol).fill = fill(vColor);
    const tColor = { Worse: 'FFFADBD8', Better: 'FFD7F5E3' }[m.trend];
    if (tColor) r.getCell(vCol + 2).fill = fill(tColor);
  }
  styleSheet(ms, mcols, trend.rows.length);
  ms.getRow(1).alignment = { vertical: 'middle', wrapText: true }; ms.getRow(1).height = 32;
  if (!snapshots.length) {
    ms.addRow([]);
    const r = ms.addRow(['', 'No earlier versions yet. Lumen keeps a dated copy each time this tracker is built or progress is recorded, so next week this sheet shows how each milestone moved.']);
    r.font = { italic: true, color: { argb: 'FF666666' } };
  }

  // Resources
  const rs = wb.addWorksheet('Resources');
  const rcols = [{ header: 'Resource' }, { header: 'Group' }, { header: 'Max units', format: 'percent' }, { header: 'Rate / hr', format: 'currency' }, { header: 'Assigned tasks' }, { header: 'Over-allocated?' }];
  rs.addRow(rcols.map((c) => c.header));
  const over = new Set(a.overallocatedResources_next6Weeks.map((o) => o.resource));
  for (const r of p.resources) rs.addRow([r.name, r.group, r.maxUnits, r.rate, p.assignments.filter((x) => x.resourceUid === r.uid).length, over.has(r.name) ? 'Yes — next 6 weeks' : '']);
  styleSheet(rs, rcols, p.resources.length);

  // Summary
  const lines = [['Project', a.project], ['Status date', a.statusDate], ['Suggested RAG', a.suggestedRag], ['% complete', `${a.progress.percentComplete}% (plan: ${a.progress.expectedByNow}%)`],
    ['Forecast finish', a.schedule.forecastFinish], ['Baseline finish', a.schedule.baselineFinish], ['Schedule slip (working days)', a.schedule.slipWorkingDays], ['Late tasks', a.lateTasks.length], ['Critical-path tasks remaining', a.criticalPath.length]];
  const slippedMs = trend.rows.filter((m) => m.status === 'Slipped');
  const worst = trend.rows.reduce((w, m) => (m.variance > (w?.variance ?? 0) ? m : w), null);
  lines.push(['Milestones slipped vs. baseline', `${slippedMs.length} of ${trend.rows.length}`]);
  if (worst) lines.push(['Biggest milestone slip', `${worst.name} (${worst.variance} working days)`]);
  if (snapshots.length) {
    const worse = trend.rows.filter((m) => m.trend === 'Worse').length;
    lines.push(['Compared with', `${trend.versions.slice(0, -1).map((v) => v.label).join(', ')} (${worse} milestone${worse === 1 ? '' : 's'} moved later)`]);
  }
  for (const l of lines) ss.addRow(l);
  ss.getColumn(1).width = 30; ss.getColumn(2).width = 40; ss.getColumn(1).font = { bold: true };

  await save(wb, outFile, { recalculate: false }); // no formulas, so no Excel round trip needed
  return {
    saved: outFile, sheets: ['Summary', 'Tasks', 'Gantt', 'Milestone variance', 'Resources'], tasks: p.tasks.length,
    milestonesSlipped: slippedMs.length, comparedWith: snapshots.map((s) => (s.plan.statusDate ? `version of ${project.iso(s.plan.statusDate)}` : path.basename(s.file))), historySource,
  };
}

// ------------------------------------------------------------------ schedule-variance helpers (pure, tested)
const DAY = 86400000;
const toLocalDate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`) : null);
const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

/** Week starts (Mondays) spanning both the current schedule and the baseline. */
function ganttWeeks(p) {
  const dates = [p.start, p.finish];
  for (const t of p.tasks) dates.push(t.start, t.finish, t.baselineStart, t.baselineFinish);
  const valid = dates.filter(Boolean);
  if (!valid.length) return [monday(new Date())];
  const first = monday(new Date(Math.min(...valid))), last = new Date(Math.max(...valid));
  const weeks = [];
  for (let w = first; w <= last; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) weeks.push(w);
  return weeks;
}

/** How a task occupies one week: current bar, baseline bar, and whether the current bar runs past the baseline finish. */
function ganttWeek(t, weekStart) {
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const overlaps = (s, f) => !!(s && f && s <= weekEnd && f >= weekStart);
  const current = overlaps(t.start, t.finish);
  const base = overlaps(t.baselineStart || t.baselineFinish, t.baselineFinish);
  const slip = current && !!t.baselineFinish && weekEnd > t.baselineFinish && !base;
  return { current, base, slip };
}

/** Working days from baseline finish to forecast finish (positive = later), or null without a baseline. */
function finishVariance(t) {
  return t.baselineFinish && t.finish ? project.workdaysBetween(t.baselineFinish, t.finish) : null;
}

function varianceColor(v) {
  if (v == null || v === 0) return null;
  return v < 0 ? 'FFD7F5E3' : v > 10 ? 'FFFADBD8' : 'FFFFE8CC';
}

/** Load earlier versions of the plan, oldest first by status date. The current plan itself is skipped. */
function loadSnapshots(files = [], currentFile) {
  const out = [];
  for (const f of files || []) {
    if (!f || path.resolve(f) === path.resolve(currentFile)) continue;
    const s = project.load(f);
    out.push({ file: f, plan: s, date: s.statusDate || fs.statSync(f).mtime });
  }
  return out.sort((x, y) => x.date - y.date);
}

/** Milestone forecasts across versions. Milestones are matched by UID, then by name. */
function milestoneTrend(current, snapshots = []) {
  const label = (plan, fallback) => (plan.statusDate ? project.iso(plan.statusDate) : fallback);
  const versions = [...snapshots.map((s) => ({ label: label(s.plan, path.basename(s.file)) })), { label: `${label(current, 'current')} (current)` }];
  const rows = current.tasks.filter((t) => t.milestone).map((t) => {
    const forecasts = snapshots.map(({ plan }) => {
      const m = plan.byUid.get(t.uid);
      const match = m && m.name === t.name ? m : plan.tasks.find((x) => x.milestone && x.name === t.name) || m;
      return match?.finish || null;
    });
    forecasts.push(t.finish);
    const variance = finishVariance(t);
    const prev = forecasts.length > 1 ? forecasts[forecasts.length - 2] : null;
    const change = prev && t.finish ? project.workdaysBetween(prev, t.finish) : null;
    const trend = change == null ? '' : change > 0 ? 'Worse' : change < 0 ? 'Better' : 'No change';
    const status = t.percent === 100 ? 'Complete' : variance == null ? 'No baseline' : variance > 0 ? 'Slipped' : variance < 0 ? 'Early' : 'On baseline';
    return { id: t.id, uid: t.uid, name: t.name, baseline: t.baselineFinish, forecasts, variance, change, trend, status };
  });
  return { versions, rows };
}

module.exports = { open, cellText, read, write, update, projectToWorkbook, recalc, ganttWeeks, ganttWeek, finishVariance, milestoneTrend };
