#!/usr/bin/env node
// "office" MCP server: Excel, Microsoft Project, Word/text documents and traceability tools over stdio (JSON-RPC, newline-delimited).
// Used by Lumen, and usable directly from Claude Code / GitHub Copilot in VS Code via .mcp.json / .vscode/mcp.json.
//
// Paths are resolved against the working folder. Writes are confined to that folder (or OFFICE_MCP_ROOT).

const path = require('path');
const fs = require('fs');
const excel = require('./excel');
const project = require('./project');
const docx = require('./docx');
const traceability = require('./traceability');

const ROOT = path.resolve(process.env.OFFICE_MCP_ROOT || process.cwd());
const READ_ONLY = process.env.OFFICE_MCP_READONLY === '1';

function resolveIn(p, { mustExist = true } = {}) {
  if (!p) throw Object.assign(new Error('A file path is required.'), { friendly: true });
  const full = path.resolve(ROOT, String(p).replace(/^["']|["']$/g, ''));
  const rel = path.relative(ROOT, full);
  // A link inside the folder that points outside it counts as outside.
  let realRel = rel;
  try {
    const real = fs.existsSync(full) ? fs.realpathSync(full) : path.join(fs.realpathSync(path.dirname(full)), path.basename(full));
    realRel = path.relative(fs.realpathSync(ROOT), real);
  } catch {} // a folder that doesn't exist yet: the lexical check above applies
  if (rel.startsWith('..') || path.isAbsolute(rel) || realRel.startsWith('..') || path.isAbsolute(realRel)) throw Object.assign(new Error(`"${p}" is outside the project folder (${ROOT}).`), { friendly: true });
  if (mustExist && !fs.existsSync(full)) {
    // Be forgiving: match by file name anywhere in the folder.
    const want = path.basename(full).toLowerCase();
    const hit = walk(ROOT).find((f) => path.basename(f).toLowerCase() === want);
    if (hit) return hit;
    throw Object.assign(new Error(`Can't find "${p}" in the project folder.`), { friendly: true });
  }
  return full;
}
/** A "save as" target, resolved like the tool does (relative to `base`) but confined to the project folder. */
function outputIn(p, base = ROOT) {
  if (p == null || p === '') return undefined;
  const full = path.resolve(base, String(p).replace(/^["']|["']$/g, ''));
  const rel = path.relative(ROOT, full);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw Object.assign(new Error(`"${p}" is outside the project folder (${ROOT}).`), { friendly: true });
  return full;
}
function walk(dir, depth = 0, out = []) {
  if (depth > 3) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, depth + 1, out); else out.push(f);
  }
  return out;
}

const write = (fn) => (READ_ONLY ? () => { throw Object.assign(new Error('Editing files is turned off for this chat. Switch "What can Lumen do?" to "Create & edit files".'), { friendly: true }); } : fn);

const TOOLS = [
  {
    name: 'list_office_files',
    description: 'List the documents (.docx/.md/.txt/.pdf), Excel workbooks (.xlsx/.xlsm/.csv) and Microsoft Project plans (.mpp/.xml) in the project folder, with size and last-modified date.',
    inputSchema: { type: 'object', properties: {} },
    run: () => {
      const files = walk(ROOT).filter((f) => /\.(xlsx|xlsm|csv|mpp|xml|docx|docm|md|txt|pdf)$/i.test(f) && !/[\\/]\.?(claude|github|vscode)[\\/]/i.test(f));
      return files.map((f) => `${path.relative(ROOT, f)}  (${Math.round(fs.statSync(f).size / 1024)} KB, modified ${new Date(fs.statSync(f).mtimeMs).toISOString().slice(0, 10)})`).join('\n') || 'No documents, workbooks or plans found.';
    },
  },
  {
    name: 'read_document',
    description: 'Read a Word document (.docx) or a text/Markdown file as Markdown-style text: headings, lists and tables are kept so you can cite sections. Use for BRDs, scope documents (PID), solution blueprints, ways of working and other program documents. Long documents come back in pages; call again with startAt to continue.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to the project folder' }, startAt: { type: 'number', description: 'Character offset to continue from (default 0)' } }, required: ['path'] },
    run: (a) => docx.readDocument(resolveIn(a.path), { startAt: Number(a.startAt) || 0 }),
  },
  {
    name: 'analyze_traceability',
    description: 'Check a requirements traceability workbook (TRM/RTM). Recognises sheets for business requirements, refined requirements, functional design, technical design and the delivery backlog (epics/features/stories), or a single trace-matrix sheet. Reports item counts, coverage per layer, coverage gaps, untraced items, broken links to IDs that do not exist, duplicate IDs, stories that trace straight to requirements without a design element, withdrawn requirements still linked downstream, and the downstream impact of changed requirements. Every finding has a Sheet!Cell reference. Read-only.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The traceability workbook' }, changed: { type: 'array', items: { type: 'string' }, description: 'Optional requirement or design IDs that have changed, for impact analysis (e.g. ["BR-004"]). Items whose Status says Changed are always included.' } }, required: ['path'] },
    run: (a) => traceability.analyze(resolveIn(a.path), { changed: Array.isArray(a.changed) ? a.changed : [] }),
  },
  {
    name: 'read_spreadsheet',
    description: 'Read an Excel workbook or CSV. Returns every sheet (or one sheet) as rows with real cell addresses (row numbers and column letters) and shows formulas. Use this before answering any question about a spreadsheet.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to the project folder' }, sheet: { type: 'string', description: 'Optional sheet name' }, maxRows: { type: 'number', description: 'Max rows per sheet (default 300)' } }, required: ['path'] },
    run: (a) => excel.read(resolveIn(a.path), a),
  },
  {
    name: 'create_spreadsheet',
    description: 'Create a new, nicely formatted Excel workbook (bold coloured header row, filters, frozen header, sized columns). Cell values that start with "=" become formulas. Column formats: currency, currency2, percent (0.25 = 25%), number, decimal, date (YYYY-MM-DD), text. Optional totals row per column: "sum" | "average" | "count" | null.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Output .xlsx path relative to the project folder' },
        sheets: { type: 'array', items: { type: 'object', properties: {
          name: { type: 'string' },
          columns: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'object', properties: { header: { type: 'string' }, format: { type: 'string' }, width: { type: 'number' } }, required: ['header'] }] } },
          rows: { type: 'array', items: { type: 'array' } },
          totals: { type: 'array', items: { type: ['string', 'null'] } },
        }, required: ['name', 'columns', 'rows'] } },
      },
      required: ['path', 'sheets'],
    },
    run: write((a) => excel.write(resolveIn(a.path, { mustExist: false }), a.sheets)),
  },
  {
    name: 'update_spreadsheet',
    description: 'Change specific cells and/or append rows in an existing workbook while keeping its formatting and formulas. Use cell addresses from read_spreadsheet. Saves over the file unless saveAs is given.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        updates: { type: 'array', items: { type: 'object', properties: { sheet: { type: 'string' }, cell: { type: 'string', description: 'e.g. "D7"' }, value: {} }, required: ['cell', 'value'] } },
        appendRows: { type: 'array', items: { type: 'object', properties: { sheet: { type: 'string' }, rows: { type: 'array', items: { type: 'array' } } }, required: ['rows'] } },
        saveAs: { type: 'string', description: 'Optional new file name to save a copy instead of overwriting' },
      },
      required: ['path'],
    },
    run: write((a) => { const file = resolveIn(a.path); return excel.update(file, { ...a, saveAs: outputIn(a.saveAs, path.dirname(file)) }); }),
  },
  {
    name: 'read_project_plan',
    description: 'Read a Microsoft Project plan (.mpp or Project XML). Returns every task with ID, WBS, outline level, dates, duration, % complete, baseline finish, predecessors and assigned resources, plus the resource list.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, includeNotes: { type: 'boolean' } }, required: ['path'] },
    run: (a) => project.readPlan(resolveIn(a.path), a),
  },
  {
    name: 'analyze_project_plan',
    description: 'Schedule health check for a Microsoft Project plan: % complete vs. expected, forecast vs. baseline finish, late tasks, tasks behind schedule, biggest slips, critical path (with float), milestones, over-allocated resources in the next 6 weeks, cost vs. baseline, and a suggested RAG status.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, statusDate: { type: 'string', description: 'YYYY-MM-DD. Defaults to the plan\'s status date, else today.' } }, required: ['path'] },
    run: (a) => project.analyze(resolveIn(a.path), a.statusDate),
  },
  {
    name: 'update_project_plan',
    description: 'Update tasks in a Microsoft Project plan (percent complete, start, finish, duration, name, notes) and optionally the status date. Identify tasks by taskId (the ID column) or exact taskName. Never overwrites the original: saves "<name> (updated).xml" (or saveAs). Microsoft Project recalculates dependent dates when the file is opened.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        updates: { type: 'array', items: { type: 'object', properties: { taskId: { type: 'number' }, taskName: { type: 'string' }, percentComplete: { type: 'number' }, start: { type: 'string' }, finish: { type: 'string' }, durationDays: { type: 'number' }, name: { type: 'string' }, notes: { type: 'string' } } } },
        statusDate: { type: 'string' },
        saveAs: { type: 'string' },
      },
      required: ['path', 'updates'],
    },
    run: write((a) => project.updatePlan(resolveIn(a.path), { ...a, saveAs: outputIn(a.saveAs) }, ROOT)),
  },
  {
    name: 'project_plan_to_spreadsheet',
    description: 'Export a Microsoft Project plan to a formatted Excel tracker with Summary, Tasks (status colour-coded), a weekly Gantt chart, and Resources sheets.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The project plan' }, output: { type: 'string', description: 'Output .xlsx path' } }, required: ['path', 'output'] },
    run: write((a) => excel.projectToWorkbook(resolveIn(a.path), resolveIn(a.output, { mustExist: false }))),
  },
];

// ------------------------------------------------------------------ JSON-RPC over stdio
if (require.main === module) {
  require('./mcp-stdio').serve({ name: 'office', instructions: 'Tools for Excel workbooks, Microsoft Project plans, Word documents and requirements traceability in the project folder.', tools: TOOLS });
}

module.exports = { TOOLS };
