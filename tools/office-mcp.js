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
const status = require('./status');
const raid = require('./raid');

const ROOT = path.resolve(process.env.OFFICE_MCP_ROOT || process.cwd());
const READ_ONLY = process.env.OFFICE_MCP_READONLY === '1';

function resolveIn(p, { mustExist = true } = {}) {
  if (!p) throw Object.assign(new Error('A file path is required.'), { friendly: true });
  const full = path.resolve(ROOT, String(p).replace(/^["']|["']$/g, ''));
  const rel = path.relative(ROOT, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw Object.assign(new Error(`"${p}" is outside the project folder (${ROOT}).`), { friendly: true });
  if (mustExist && !fs.existsSync(full)) {
    // Be forgiving: match by file name anywhere in the folder.
    const want = path.basename(full).toLowerCase();
    const hit = walk(ROOT).find((f) => path.basename(f).toLowerCase() === want);
    if (hit) return hit;
    throw Object.assign(new Error(`Can't find "${p}" in the project folder.`), { friendly: true });
  }
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
      const files = walk(ROOT).filter((f) => /\.(xlsx|xlsm|csv|mpp|xml|docx|docm|md|txt|pdf|vtt)$/i.test(f) && !/[\\/]\.?(claude|github|vscode)[\\/]/i.test(f));
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
    run: write((a) => excel.update(resolveIn(a.path), a)),
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
    name: 'query_plan',
    description: 'Answer a question about a Microsoft Project plan with exact task rows, calculated by code. Combine any filters (AND): a WBS branch or summary task ("under"), a person ("owner"), words in the name or notes, status (late, behind, not_started, in_progress, complete, should_have_started), critical path only, milestones only, slipped more than N working days vs. baseline, a date window (tasks active, starting or finishing in it), what a task depends on or what depends on it (relatedTo, any number of links away), and what changed since the last saved version or a date. Use it for questions like "what\'s late in Testing?", "what does Go-live depend on that is at risk?", "what is Priya doing in the next 2 weeks?" or "what moved since last week?". Prefer it over read_project_plan for questions about part of a plan.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The project plan' },
        under: { type: 'string', description: 'WBS number (e.g. "5") or summary task name; includes everything beneath it' },
        owner: { type: 'string', description: 'Part of a resource name' },
        text: { type: 'string', description: 'Words in the task name or notes' },
        status: { type: 'array', items: { type: 'string', enum: ['late', 'behind', 'not_started', 'in_progress', 'complete', 'should_have_started'] } },
        critical: { type: 'boolean', description: 'Only incomplete tasks with zero float' },
        milestones: { type: 'boolean' },
        slippedMoreThan: { type: 'number', description: 'Working days later than baseline finish' },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        dateMode: { type: 'string', enum: ['active', 'starting', 'finishing'], description: 'How from/to apply (default active)' },
        relatedTo: { type: 'object', properties: { task: { type: 'string', description: 'Task ID or name' }, direction: { type: 'string', enum: ['upstream', 'downstream'], description: 'upstream = what it depends on; downstream = what depends on it' }, depth: { type: 'number', description: 'Max links away (default all)' } }, required: ['task'] },
        changedSince: { type: 'string', description: '"last" for the previous saved version, or YYYY-MM-DD for the version saved on or before that date' },
        includeSummaries: { type: 'boolean', description: 'Include summary rows (default false)' },
        statusDate: { type: 'string', description: 'YYYY-MM-DD; defaults to the plan\'s status date' },
        sort: { type: 'string', enum: ['id', 'start', 'finish', 'slip', 'float'] },
        limit: { type: 'number', description: 'Max rows (default 50)' },
      },
      required: ['path'],
    },
    run: (a) => project.queryPlan(resolveIn(a.path), a, ROOT),
  },
  {
    name: 'get_status_facts',
    description: 'Calculate the weekly status facts for a Microsoft Project plan, optionally with a RAID log: overall RAG with the rule-based reasons, schedule and cost vs. baseline, milestones with variance and movement since the last saved version (plus the unfinished work each depends on), what changed since then, late and behind tasks, over-allocation, overdue RAID items, and the top open risks and issues. Every fact has a source reference. Read-only. Use it before writing a status summary, then pass your summary to build_status_report.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The project plan' }, raid: { type: 'string', description: 'Optional RAID log workbook (.xlsx/.csv)' }, statusDate: { type: 'string', description: 'YYYY-MM-DD; defaults to the plan status date' } }, required: ['path'] },
    run: async (a) => { const m = await status.buildModel(resolveIn(a.path), { raid: a.raid ? resolveIn(a.raid) : null, root: ROOT, statusDate: a.statusDate }); delete m.ai; return m; },
  },
  {
    name: 'build_status_report',
    description: 'Write the weekly status pack into "Status reports/<status date>/": status.json (the status model), a detailed status report (Markdown, which can be saved as Word) and a one-page executive dashboard (HTML, with milestones you can open to see the work they depend on). All facts are calculated from the files. Your narrative and decisionsNeeded are shown separately and labelled as AI-written; if the narrative names a different RAG rating from the calculated one, the pack flags it. Everything is saved as a Draft for PMO review.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The project plan' }, raid: { type: 'string', description: 'Optional RAID log workbook' }, statusDate: { type: 'string' }, narrative: { type: 'string', description: '3 to 5 sentences for executives, based only on get_status_facts' }, decisionsNeeded: { type: 'array', items: { type: 'string' }, description: 'Decisions or support needed from leadership, each citing the task or RAID ID' } }, required: ['path'] },
    run: write((a) => status.buildReport(resolveIn(a.path), { raid: a.raid ? resolveIn(a.raid) : null, root: ROOT, statusDate: a.statusDate, narrative: a.narrative, decisionsNeeded: a.decisionsNeeded })),
  },
  {
    name: 'read_transcript',
    description: 'Read a meeting transcript (Teams .vtt, a Teams transcript saved as Word .docx, or a .txt/.md file) as numbered turns with time, speaker and text. Use it before proposing RAID log updates, and quote from it word for word.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The transcript file' } }, required: ['path'] },
    run: (a) => { const segs = raid.readTranscript(resolveIn(a.path)); return { file: path.basename(a.path), turns: segs.length, speakers: [...new Set(segs.map((s) => s.speaker).filter(Boolean))], transcript: segs.map((s) => `[${s.n}] ${s.time ? s.time + ' ' : ''}${s.speaker ? s.speaker + ': ' : ''}${s.text}`).join('\n') }; },
  },
  {
    name: 'propose_raid_updates',
    description: 'Propose RAID log changes from a meeting transcript, for a person to approve. Saves "<RAID log> (proposed).xlsx" with the changes highlighted (green = new row, yellow = changed cell) and a "Proposed changes" sheet listing each change with its transcript evidence and an "Approve? (Yes/No)" column. The original RAID log is not changed. Each proposal must include evidence.quote copied word for word from the transcript (at least 4 words); proposals whose quote cannot be found are rejected. Also returns meeting checks such as new actions with no owner or due date.',
    inputSchema: {
      type: 'object',
      properties: {
        raid: { type: 'string', description: 'The RAID log workbook' },
        transcript: { type: 'string', description: 'The meeting transcript' },
        meetingDate: { type: 'string', description: 'YYYY-MM-DD; used as the Raised date for new items' },
        proposals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              change: { type: 'string', enum: ['add', 'update', 'close'] },
              kind: { type: 'string', enum: ['risk', 'issue', 'action', 'decision', 'dependency', 'assumption'] },
              id: { type: 'string', description: 'Existing ID, for update or close' },
              fields: { type: 'object', description: 'Only what the meeting supports', properties: { title: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string', description: 'YYYY-MM-DD (due, next review or needed-by date)' }, status: { type: 'string' }, action: { type: 'string', description: 'Mitigation or action; added to any existing text' }, priority: { type: 'string' }, probability: { type: 'string', description: 'H/M/L' }, impact: { type: 'string', description: 'H/M/L' }, category: { type: 'string' }, date: { type: 'string' } } },
              evidence: { type: 'object', properties: { quote: { type: 'string', description: 'At least 4 words copied exactly from the transcript' } }, required: ['quote'] },
              reason: { type: 'string', description: 'One line on why, especially when linking to an existing item' },
            },
            required: ['change', 'kind', 'evidence'],
          },
        },
      },
      required: ['raid', 'transcript', 'proposals'],
    },
    run: write((a) => raid.propose(resolveIn(a.raid), resolveIn(a.transcript), a.proposals || [], { meetingDate: a.meetingDate })),
  },
  {
    name: 'apply_raid_updates',
    description: 'Apply only the approved changes from a reviewed "<RAID log> (proposed).xlsx" (rows marked Yes in "Approve?") to "<RAID log> (updated).xlsx". Refuses if any row is not marked Yes or No. Only call this after the person says they have reviewed the proposed workbook. The original RAID log is never overwritten.',
    inputSchema: { type: 'object', properties: { proposed: { type: 'string', description: 'The reviewed "(proposed)" workbook' } }, required: ['proposed'] },
    run: write((a) => raid.applyApproved(resolveIn(a.proposed))),
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
    run: write((a) => project.updatePlan(resolveIn(a.path), a, ROOT)),
  },
  {
    name: 'project_plan_to_spreadsheet',
    description: 'Export a Microsoft Project plan to a formatted Excel tracker: Summary, Tasks (status colour-coded), a weekly variance Gantt (baseline drawn under each bar, weeks past the baseline finish hatched red, a variance column, a status-date line, baseline vs. forecast milestones), Milestone variance, and Resources. Lumen keeps a dated version of the plan each time a tracker is built or progress is recorded, and compares against the most recent earlier versions automatically; pass history only to compare against specific files.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The project plan' }, output: { type: 'string', description: 'Output .xlsx path' }, history: { type: 'array', items: { type: 'string' }, description: "Optional earlier versions of the same plan (.mpp/.xml), e.g. last week's copy, for the milestone slip trend" } }, required: ['path', 'output'] },
    run: write((a) => excel.projectToWorkbook(resolveIn(a.path), resolveIn(a.output, { mustExist: false }), { history: (a.history || []).map((h) => resolveIn(h)), historyRoot: ROOT })),
  },
];

// ------------------------------------------------------------------ JSON-RPC over stdio
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const result = (id, r) => send({ jsonrpc: '2.0', id, result: r });

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return result(id, { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'office', version: '1.0.0' },
      instructions: 'Tools for Excel workbooks, Microsoft Project plans, Word documents and requirements traceability in the project folder.' });
  }
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool ${params?.name}` } });
    try {
      const out = await tool.run(params.arguments || {});
      return result(id, { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }] });
    } catch (e) {
      return result(id, { isError: true, content: [{ type: 'text', text: e.friendly ? e.message : `Error: ${e.message}` }] });
    }
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
}

let buf = '';
process.stdin.on('data', (c) => {
  buf += c.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    pending++;
    handle(msg).catch((e) => process.stderr.write(String(e.stack || e) + '\n')).finally(() => { pending--; if (ended && !pending) process.exit(0); });
  }
});
let pending = 0, ended = false;
process.stdin.on('end', () => { ended = true; if (!pending) process.exit(0); });

module.exports = { TOOLS };
