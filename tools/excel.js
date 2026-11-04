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
  const q = `'${String(file).replace(/'/g, "''")}'`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$x = New-Object -ComObject Excel.Application; $x.Visible = $false; $x.DisplayAlerts = $false; try { $wb = $x.Workbooks.Open(${q}); $x.CalculateFull(); $wb.Save(); $wb.Close($false) } finally { $x.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($x) }`],
      { stdio: 'ignore', timeout: 90000, windowsHide: true });
    return true;
  } catch { return false; }
}
async function save(wb, file) {
  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
  if (path.extname(file).toLowerCase() === '.csv') await wb.csv.writeFile(file);
  else { await wb.xlsx.writeFile(file); recalc(file); }
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

const FORMATS = { currency: '"$"#,##0', currency2: '"$"#,##0.00', percent: '0%', number: '#,##0', decimal: '#,##0.00', date: 'yyyy-mm-dd', text: '@' };
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
async function write(file, sheets) {
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
  await save(wb, file);
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
  await save(wb, out);
  return { saved: out, changes: done };
}

/** Turn a Microsoft Project plan into a formatted Excel tracker with a weekly Gantt view. */
async function projectToWorkbook(planFile, outFile) {
  const p = project.load(planFile);
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

  // Gantt (one column per week)
  const gs = wb.addWorksheet('Gantt');
  const weeks = [];
  const monday = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  for (let w = monday(p.start || new Date()); w <= (p.finish || new Date()); w = new Date(+w + 7 * 86400000)) weeks.push(w);
  gs.addRow(['Task', ...weeks.map((w) => project.iso(w).slice(5))]);
  for (const t of p.tasks) {
    const row = gs.addRow([`${'  '.repeat(t.level - 1)}${t.name}`]);
    if (t.summary) row.font = { bold: true };
    weeks.forEach((w, i) => {
      const we = new Date(+w + 6 * 86400000);
      if (t.start && t.finish && t.start <= we && t.finish >= w) {
        const argb = t.summary ? 'FF9AA3B5' : t.milestone ? 'FF111111' : t.percent === 100 ? 'FF34B27A' : late.has(t.id) ? 'FFE5484D' : critical.has(t.id) ? 'FFF59E0B' : 'FF6D4DFF';
        const c = row.getCell(i + 2);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
        if (t.milestone) { c.value = '◆'; c.font = { color: { argb: 'FFFFFFFF' } }; c.alignment = { horizontal: 'center' }; }
      }
    });
  }
  const hdr = gs.getRow(1); hdr.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }; hdr.fill = HEADER_FILL; hdr.alignment = { textRotation: 90, horizontal: 'center' };
  gs.getColumn(1).width = 44; for (let i = 2; i <= weeks.length + 1; i++) gs.getColumn(i).width = 3.2;
  gs.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  const legend = gs.addRow([]); legend.getCell(1).value = 'Legend: purple = scheduled · amber = critical path · red = late · green = complete · ◆ milestone';
  legend.font = { italic: true, color: { argb: 'FF666666' } };

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
  for (const l of lines) ss.addRow(l);
  ss.getColumn(1).width = 30; ss.getColumn(2).width = 40; ss.getColumn(1).font = { bold: true };

  await save(wb, outFile);
  return { saved: outFile, sheets: ['Summary', 'Tasks', 'Gantt', 'Resources'], tasks: p.tasks.length };
}

module.exports = { open, cellText, read, write, update, projectToWorkbook, recalc };
