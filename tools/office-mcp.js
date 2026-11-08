#!/usr/bin/env node
// "office" MCP server: Excel, Microsoft Project, Word/text documents and traceability tools over stdio (JSON-RPC, newline-delimited).
// Used by Lumen, and usable directly from Claude Code / GitHub Copilot in VS Code via .mcp.json / .vscode/mcp.json.
//
// Paths are resolved against the working folder. Writes are confined to that folder (or OFFICE_MCP_ROOT).

const path = require('path');
const fs = require('fs');
const excel = require('./excel');
const project = require('./project');
const backlog = require('./backlog');
const docx = require('./docx');
const traceability = require('./traceability');
const status = require('./status');
const raid = require('./raid');
const publish = require('./publish');
const qe = require('./tests');

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
    description: 'Check a requirements traceability workbook (TRM/RTM). Recognises sheets for business requirements, refined requirements, functional design, technical design, the delivery backlog (epics/features/stories) and test cases (a Tests sheet whose cases trace to stories or requirements), or a single trace-matrix sheet. Reports item counts, coverage per layer, coverage gaps, untraced items, broken links to IDs that do not exist, duplicate IDs, stories that trace straight to requirements without a design element, withdrawn requirements still linked downstream, requirements and stories with no test, tests tracing to withdrawn items, and the downstream impact of changed requirements. Every finding has a Sheet!Cell reference. Read-only.',
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
    name: 'plan_change_log',
    description: 'Compare a Microsoft Project plan with an earlier version (the last saved one, the one on or before a date, or a file you name) and produce the change log: every change sorted into material (moves a milestone or the finish, critical-path or large date moves, dependency logic changes, added or removed work that matters) or administrative (renames, notes, resources, small date moves), each with the reason it is material, plus milestone movement and the project finish. Progress updates are only counted. Read-only. Use it for the monthly change log or "what changed since the last baseline?".',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The current plan' }, against: { type: 'string', description: '"last" (default) or YYYY-MM-DD: compare with the saved version on or before that date' }, compareFile: { type: 'string', description: 'Optional: an earlier version of the plan to compare with, instead of the saved history' }, thresholdDays: { type: 'number', description: 'Working days of date movement that count as material for non-critical tasks (default 3)' }, statusDate: { type: 'string' } }, required: ['path'] },
    run: (a) => project.changeLog(resolveIn(a.path), { ...a, compareFile: a.compareFile ? resolveIn(a.compareFile) : undefined }, ROOT),
  },
  {
    name: 'plan_lookahead',
    description: 'Forward-looking readout from a Microsoft Project plan for the coming week (or N days), grouped by workstream: tasks starting, tasks finishing, milestones, late carry-overs, and unfinished work these tasks are waiting on (from other workstreams or overdue). Read-only. Use it for "what do teams need on their radar next week?".',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, from: { type: 'string', description: 'YYYY-MM-DD; default the day after the status date' }, days: { type: 'number', description: 'Window length in days (default 7)' }, under: { type: 'string', description: 'Limit to a WBS branch or summary task' }, owner: { type: 'string', description: 'Limit to a person' }, statusDate: { type: 'string' } }, required: ['path'] },
    run: (a) => project.lookahead(resolveIn(a.path), a),
  },
  {
    name: 'plan_progress_from_backlog',
    description: "Propose % complete for Microsoft Project tasks from an Azure DevOps backlog export (.xlsx or .csv from a work-item query with ID, State, Tags and optionally Story Points). Items are linked to plan tasks by a tag such as MPP-23 (tagPrefix changes MPP), by a mapping sheet, or by a Plan task column. Each task's % complete is calculated from its items' states (or story points), items removed from the backlog are ignored, and a % that would go down is held back for confirmation. Also returns data-quality findings: items not linked to any task, links to tasks that do not exist or are summary tasks, unknown states, stale in-progress items, and plan tasks that should be moving but have no items. Read-only: show the proposals, and after approval pass them to update_project_plan.",
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The project plan' }, backlog: { type: 'string', description: 'The Azure DevOps work-item export (.xlsx/.csv)' }, tagPrefix: { type: 'string', description: 'Tag prefix that links an item to a plan task (default MPP, e.g. MPP-23)' }, basis: { type: 'string', enum: ['state', 'points'], description: 'Weight items equally by state (default) or by story points' }, stateMap: { type: 'object', description: 'Override the % counted as done for a state, e.g. {"Ready for test": 90}' }, staleDays: { type: 'number', description: 'Days without a change before an in-progress item is called stale (default 14)' }, allowDecrease: { type: 'boolean', description: 'Also propose lower percentages (default false)' }, statusDate: { type: 'string' } }, required: ['path', 'backlog'] },
    run: (a) => backlog.progressFromBacklog(resolveIn(a.path), resolveIn(a.backlog), a),
  },
  {
    name: 'get_status_facts',
    description: 'Calculate the weekly status facts for a Microsoft Project plan, optionally with a RAID log: overall RAG with the rule-based reasons, schedule and cost vs. baseline, milestones with variance and movement since the last saved version (plus the unfinished work each depends on), what changed since then, late and behind tasks, over-allocation, overdue RAID items, and the top open risks and issues. The RAID log is read from the newest approved copy next to the one you pass (an "(updated)" file from the huddle flow, never a "(proposed)" review copy); raidInput says which file was used and lists huddle changes still pending review, which are not in the facts. Every fact has a source reference. Read-only. Use it before writing a status summary, then pass your summary to build_status_report.',
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
    name: 'write_test_cases',
    description: 'Save test cases as an Excel workbook in the Azure DevOps Test Plans import layout: one row per step (ID, Work Item Type, Title, Test Step, Step Action, Step Expected, Traces To, Priority, Type SIT/UAT, Preconditions), with the case fields on its first step row, plus a Coverage sheet with one row per case. Cases without an ID get TC-001, TC-002… An existing file is never overwritten; a numbered copy is saved instead. Returns warnings for cases without steps, expected results or traces.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Output .xlsx path, e.g. "Test cases - Release 1.xlsx"' },
        title: { type: 'string', description: 'Optional workbook title' },
        cases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Optional, e.g. TC-001' },
              title: { type: 'string' },
              type: { type: 'string', enum: ['SIT', 'UAT'] },
              priority: { type: ['string', 'number'], description: '1 (highest) to 4' },
              tracesTo: { type: 'array', items: { type: 'string' }, description: 'Story or requirement IDs this case verifies, e.g. ["US-103", "BR-002.1"]' },
              preconditions: { type: 'string' },
              technique: { type: 'string', description: 'e.g. positive, negative, boundary' },
              steps: { type: 'array', items: { type: 'object', properties: { action: { type: 'string' }, expected: { type: 'string' } }, required: ['action'] } },
            },
            required: ['title', 'steps'],
          },
        },
      },
      required: ['path', 'cases'],
    },
    run: write((a) => qe.writeTestCases(outputIn(a.path) || resolveIn(null), a.cases || [], { title: a.title })),
  },
  {
    name: 'analyze_defects',
    description: 'Triage a defect export (Azure DevOps query saved as .xlsx or .csv). Reports counts by severity, state and area; the age of open defects and the oldest ones; probable duplicates (similar titles in the same area path); severity–priority mismatches; open defects without an owner or severity; and defects not changed recently. Every defect has a Sheet!Cell reference. Returns proposed changes only and never changes the file.',
    inputSchema: { type: 'object', properties: {
      path: { type: 'string', description: 'The defect export' },
      asOf: { type: 'string', description: 'YYYY-MM-DD for ages (default today)' },
      duplicateThreshold: { type: 'number', description: 'Title similarity for a probable duplicate, 0 to 1 (default 0.6)' },
      staleDays: { type: 'number', description: 'Open defects unchanged for longer than this are listed (default 30)' },
    }, required: ['path'] },
    run: (a) => qe.analyzeDefects(resolveIn(a.path), { asOf: a.asOf, duplicateThreshold: a.duplicateThreshold, staleDays: a.staleDays }),
  },
  {
    name: 'propose_defect_changes',
    description: 'Record proposed defect changes (severity, priority, state, owner, area or tags) for a person to approve. Saves "<export> (proposed).xlsx" with the changed cells highlighted and a "Proposed changes" sheet with an "Approve? (Yes/No)" column. The original export is never changed. Use it only after the person has agreed which triage proposals to record.',
    inputSchema: { type: 'object', properties: {
      path: { type: 'string', description: 'The defect export' },
      changes: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, field: { type: 'string', enum: ['severity', 'priority', 'state', 'owner', 'area', 'tags'] }, value: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'field', 'value'] } },
    }, required: ['path', 'changes'] },
    run: write((a) => qe.proposeDefectChanges(resolveIn(a.path), a.changes || [])),
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
    description: 'Export a Microsoft Project plan to a formatted Excel tracker: Summary, Tasks (status colour-coded), a weekly variance Gantt (baseline drawn under each bar, weeks past the baseline finish hatched red, a variance column, a status-date line, baseline vs. forecast milestones), Milestone variance, and Resources. Lumen keeps a dated version of the plan each time a tracker is built or progress is recorded, and compares against the most recent earlier versions automatically; pass history only to compare against specific files.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The project plan' }, output: { type: 'string', description: 'Output .xlsx path' }, history: { type: 'array', items: { type: 'string' }, description: "Optional earlier versions of the same plan (.mpp/.xml), e.g. last week's copy, for the milestone slip trend" } }, required: ['path', 'output'] },
    run: write((a) => excel.projectToWorkbook(resolveIn(a.path), resolveIn(a.output, { mustExist: false }), { history: (a.history || []).map((h) => resolveIn(h)), historyRoot: ROOT })),
  },
  {
    name: 'check_freshness',
    description: 'Knowledge freshness check against Published/publishing-log.xlsx: re-hashes each published source and lists stale snapshots (the source changed since it was published), sources that were never published (Markdown under the folders you pass), orphan snapshots (files under Published/ that no log row points at), and sources or snapshots that have gone missing. Read-only. Use it for "is the published knowledge up to date?" and the scheduled freshness check.',
    inputSchema: { type: 'object', properties: { sources: { type: 'array', items: { type: 'string' }, description: 'Optional Markdown files or folders that should be published (e.g. ["Lifecycle", "Wiki export"]), to find never-published sources' } } },
    run: (a) => publish.freshnessCheck({ root: ROOT, sources: (a.sources || []).map((s) => resolveIn(s)) }),
  },
  {
    name: 'publish_snapshot',
    description: 'Publish approved Markdown (lifecycle stage outputs, or a wiki export folder) as Word and/or HTML snapshots under "Published/<library>/", with version, approver, source and source revision in the document properties, and record each one in Published/publishing-log.xlsx (source, revision, published at, approver, version, destination). Sources without Lumen\'s approval stamp are skipped unless you pass the approver the person names; sources unchanged since their last publish are skipped. A Word template (.dotx/.docx, e.g. from the Templates folder) gives the program styles and cover page. Only publish what the person asked for.',
    inputSchema: { type: 'object', properties: {
      sources: { type: 'array', items: { type: 'string' }, description: 'Markdown files or folders to publish' },
      library: { type: 'string', description: 'Published/<library> folder name (default Knowledge)' },
      formats: { type: 'array', items: { type: 'string', enum: ['docx', 'html'] }, description: 'Default ["docx"]' },
      approver: { type: 'string', description: 'Only when the person tells you who approved sources that have no approval stamp' },
      version: { type: 'string', description: 'Optional version; default goes up by one per republish' },
      template: { type: 'string', description: 'Optional Word template, e.g. "Templates/FDD Template.dotx"' },
      force: { type: 'boolean', description: 'Republish even when the source is unchanged' },
    }, required: ['sources'] },
    run: write((a) => publish.publishSnapshot((a.sources || []).map((s) => resolveIn(s)), { root: ROOT, library: a.library, formats: a.formats, approver: a.approver, version: a.version, template: a.template ? resolveIn(a.template) : undefined, force: !!a.force })),
  },
];

// ------------------------------------------------------------------ JSON-RPC over stdio
if (require.main === module) {
  require('./mcp-stdio').serve({ name: 'office', instructions: 'Tools for Excel workbooks, Microsoft Project plans, Word documents, requirements traceability, test cases, defect triage and knowledge publishing in the project folder.', tools: TOOLS });
}

module.exports = { TOOLS };
