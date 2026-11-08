// Exports the live Azure DevOps backlog as a traceability sheet (plan 08, Phase 4), so the existing
// analyze_traceability tool can check requirements and design (from the TRM workbook) against the real backlog.
// Trace IDs come from tags (decision D5); the parent link becomes "Parent".

const fs = require('fs');
const path = require('path');
const { friendly } = require('./auth');
const wiql = require('./wiql');
const read = require('./read');
const excel = require('../excel');
const { LAYERS } = require('../traceability');

const TRACE_TAG = /^(BR|RR|FD|TD|NFR|REQ)[-_.]?\d+(?:[.-]\d+)*$/i;
const COLUMNS = [{ header: 'ID', width: 12 }, { header: 'Type', width: 16 }, { header: 'Title', width: 60 }, { header: 'Status', width: 14 }, { header: 'Parent', width: 12 }, { header: 'Traces To', width: 28 }, { header: 'Last Changed', format: 'date', width: 14 }, { header: 'Azure DevOps link', width: 50 }];
const ado = (id) => `ADO-${id}`;

async function backlogRows(c, { includeClosed = false, area } = {}) {
  const cats = await c.categories();
  const types = ['Microsoft.EpicCategory', 'Microsoft.FeatureCategory', 'Microsoft.RequirementCategory']
    .flatMap((ref) => (cats.find((x) => x.referenceName === ref)?.workItemTypes || []).map((t) => t.name));
  if (!types.length) throw friendly('Couldn\'t find the backlog levels (epics, features, stories) for this project.');
  const filter = { types, orderBy: 'id', area, excludeStates: includeClosed ? [] : ['Removed'] };
  const ids = await c.wiql(wiql.build(filter), 20000);
  const items = await c.workItems(ids);
  return items.map((w) => {
    const s = read.summary(c, w);
    const traces = s.tags.filter((t) => TRACE_TAG.test(t));
    return [ado(s.id), s.type, s.title, s.state, s.parent ? ado(s.parent) : '', traces.join(', '), s.changed, s.url];
  });
}

/** Saves a workbook and returns { saved, rows }. With `workbook`, its backlog sheets are replaced by the live one in a copy. */
async function exportBacklog(c, root, args = {}) {
  const inRoot = (p) => {
    const full = path.resolve(root, String(p));
    const rel = path.relative(root, full);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw friendly(`"${p}" is outside the project folder.`);
    return full;
  };
  const rows = await backlogRows(c, args);
  const sheet = { name: 'Backlog (Azure DevOps)', columns: COLUMNS, rows };
  if (!args.workbook) {
    const out = inRoot(args.output || `Azure DevOps backlog - ${c.project} - ${new Date().toISOString().slice(0, 10)}.xlsx`);
    await excel.write(out, [sheet], { recalculate: false });
    return { saved: out, rows: rows.length, note: 'Run analyze_traceability on this file, or pass workbook to merge it with the TRM.' };
  }
  const src = inRoot(args.workbook);
  if (!fs.existsSync(src)) throw friendly(`Can't find "${args.workbook}" in the project folder.`);
  const wb = await excel.open(src);
  const bl = LAYERS.find((l) => l.key === 'BL').re;
  const removed = wb.worksheets.filter((ws) => bl.test(ws.name)).map((ws) => ws.name);
  for (const name of removed) wb.removeWorksheet(wb.getWorksheet(name).id);
  const ws = wb.addWorksheet(sheet.name);
  ws.addRow(COLUMNS.map((x) => x.header));
  for (const r of rows) ws.addRow(r.map((v, i) => (COLUMNS[i].format === 'date' && v ? new Date(`${v}T00:00:00Z`) : v)));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  COLUMNS.forEach((col, i) => { ws.getColumn(i + 1).width = col.width; if (col.format === 'date') ws.getColumn(i + 1).numFmt = 'yyyy-mm-dd'; });
  const { dir, name } = path.parse(src);
  const out = inRoot(args.output || path.join(path.relative(root, dir), `${name} (with Azure DevOps).xlsx`));
  await wb.xlsx.writeFile(out);
  return { saved: out, rows: rows.length, replacedSheets: removed, note: 'The original workbook is unchanged. Run analyze_traceability on the saved copy.' };
}

module.exports = { exportBacklog, backlogRows, TRACE_TAG };
