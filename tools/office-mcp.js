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
const scenario = require('./scenario');
const capacity = require('./capacity');
const change = require('./change');
const glossary = require('./glossary');
const release = require('./release');
const governance = require('./governance');
const controls = require('./controls');
const data = require('./data');

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
    name: 'model_scenario',
    description: 'Model a "what if" delivery scenario on a copy of a Microsoft Project plan, without changing it. Changes: add or take off working days on a task (durationDelta), hold a task until a date (startNoEarlierThan), add or take away capacity for a person (resource + unitsDelta, e.g. 0.5 = another person at half time, optionally on one task), or remove a dependency (removeDependency {from, to}). The plan is rescheduled forward through its links (FS/SS/FF/SF with lags, Monday to Friday) and compared with the same calculation without the changes: milestone and project-finish movement in working days, tasks that move, the new critical path (who joined and left it), and people newly over-allocated. Returns planUpdates in the shape update_project_plan takes, for saving an approved scenario as an "(updated)" copy. Call it once per named scenario. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The project plan' },
        name: { type: 'string', description: 'Scenario name, e.g. "UAT slips two weeks"' },
        changes: { type: 'array', items: { type: 'object', properties: {
          task: { type: 'string', description: 'Task ID or name' },
          durationDelta: { type: 'number', description: 'Working days added (negative to shorten). On a milestone it moves the milestone' },
          startNoEarlierThan: { type: 'string', description: 'YYYY-MM-DD' },
          resource: { type: 'string', description: 'Person, for a capacity change' },
          unitsDelta: { type: 'number', description: 'Capacity added to that person\'s unfinished tasks (1 = one more full-time person, -0.5 = half a person fewer)' },
          removeDependency: { type: 'object', properties: { from: { type: 'string', description: 'Predecessor task ID or name' }, to: { type: 'string', description: 'Successor task ID or name' } }, required: ['from', 'to'] },
        } } },
        statusDate: { type: 'string', description: 'YYYY-MM-DD; defaults to the plan status date' },
      },
      required: ['path', 'changes'],
    },
    run: (a) => scenario.runScenario(resolveIn(a.path), a.changes || [], { name: a.name, statusDate: a.statusDate }),
  },
  {
    name: 'analyze_capacity',
    description: 'Check team capacity against demand. Reads a capacity workbook (a sheet with Person, Role, Hours per week and Availability %; optional Leave sheet with Person, From, To, Reason; optional Sprints sheet with Sprint, Start, End), the plan\'s assignments and, optionally, an Azure DevOps backlog export (Iteration Path, Assigned To, Remaining Work, Story Points). Returns weekly demand vs. capacity per person and role, conflicts (overloaded weeks, leave during assigned work with critical-path tasks first, overloaded sprints), estimate outliers (story points at least double or half the median for the same work item type), open items without an estimate, and data-quality gaps (people in the plan or backlog but not in the capacity file). Every row cites its cell or plan task. Read-only.',
    inputSchema: { type: 'object', properties: {
      capacity: { type: 'string', description: 'The team capacity workbook' },
      plan: { type: 'string', description: 'Optional Microsoft Project plan, for weekly demand and leave clashes' },
      backlog: { type: 'string', description: 'Optional Azure DevOps work-item export, for sprint demand and estimate outliers' },
      from: { type: 'string', description: 'YYYY-MM-DD; default the plan status date (the window starts on that Monday)' },
      weeks: { type: 'number', description: 'Weeks to cover (default 8, max 26)' },
      hoursPerPoint: { type: 'number', description: 'Hours per story point for items with no Remaining Work (default: not converted)' },
      tagPrefix: { type: 'string' },
    }, required: ['capacity'] },
    run: (a) => capacity.analyzeCapacity(resolveIn(a.capacity), { plan: a.plan ? resolveIn(a.plan) : null, backlog: a.backlog ? resolveIn(a.backlog) : null, from: a.from, weeks: a.weeks, hoursPerPoint: a.hoursPerPoint, tagPrefix: a.tagPrefix }),
  },
  {
    name: 'get_status_facts',
    description: 'Calculate the weekly status facts for a Microsoft Project plan, optionally with a RAID log: overall RAG with the rule-based reasons, schedule and cost vs. baseline, milestones with variance and movement since the last saved version (plus the unfinished work each depends on), what changed since then, late and behind tasks, over-allocation, overdue RAID items, and the top open risks and issues. The RAID log is read from the newest approved copy next to the one you pass (an "(updated)" file from the huddle flow, never a "(proposed)" review copy); raidInput says which file was used and lists huddle changes still pending review, which are not in the facts. With an Azure DevOps backlog export it adds delivery progress: items by state per epic (Parent/Epic column, else plan workstream), story points done, open items on late or behind plan tasks, and started critical-path tasks with items not yet started (which raises the rating to at least Amber). Every fact has a source reference (plan task, RAID cell or backlog cell). Read-only. Use it before writing a status summary, then pass your summary to build_status_report.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The project plan' }, raid: { type: 'string', description: 'Optional RAID log workbook (.xlsx/.csv)' }, backlog: { type: 'string', description: 'Optional Azure DevOps work-item export (.xlsx/.csv), items tagged MPP-<task ID>' }, tagPrefix: { type: 'string', description: 'Tag prefix linking items to plan tasks (default MPP)' }, statusDate: { type: 'string', description: 'YYYY-MM-DD; defaults to the plan status date' } }, required: ['path'] },
    run: async (a) => { const m = await status.buildModel(resolveIn(a.path), { raid: a.raid ? resolveIn(a.raid) : null, backlog: a.backlog ? resolveIn(a.backlog) : null, tagPrefix: a.tagPrefix, root: ROOT, statusDate: a.statusDate }); delete m.ai; return m; },
  },
  {
    name: 'build_status_report',
    description: 'Write the weekly status pack into "Status reports/<status date>/": status.json (the status model, with a Delivery progress block when a backlog export is given), a detailed status report (Markdown, which can be saved as Word) and a one-page executive dashboard (HTML, with milestones you can open to see the work they depend on). All facts are calculated from the files. Your narrative and decisionsNeeded are shown separately and labelled as AI-written; if the narrative names a different RAG rating from the calculated one, the pack flags it. Everything is saved as a Draft for PMO review.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The project plan' }, raid: { type: 'string', description: 'Optional RAID log workbook' }, backlog: { type: 'string', description: 'Optional Azure DevOps work-item export, for the Delivery progress section' }, tagPrefix: { type: 'string' }, statusDate: { type: 'string' }, narrative: { type: 'string', description: '3 to 5 sentences for executives, based only on get_status_facts' }, decisionsNeeded: { type: 'array', items: { type: 'string' }, description: 'Decisions or support needed from leadership, each citing the task or RAID ID' } }, required: ['path'] },
    run: write((a) => status.buildReport(resolveIn(a.path), { raid: a.raid ? resolveIn(a.raid) : null, backlog: a.backlog ? resolveIn(a.backlog) : null, tagPrefix: a.tagPrefix, root: ROOT, statusDate: a.statusDate, narrative: a.narrative, decisionsNeeded: a.decisionsNeeded })),
  },
  {
    name: 'read_transcript',
    description: 'Read a meeting transcript (Teams .vtt, a Teams transcript saved as Word .docx, or a .txt/.md file) as numbered turns with time, speaker and text. Use it before proposing RAID log updates or change impacts from an interview, and quote from it word for word.',
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
    name: 'propose_change_impacts',
    description: 'Propose change impacts from stakeholder interview transcripts, for a change lead to approve. Each impact needs a stakeholder group, business process, change description, impact level (H/M/L) and evidence.quote copied word for word from a transcript (at least 4 words); impacts whose quote cannot be found are rejected, and the speaker and time are taken from the transcript. Saves "<CIA> (proposed).xlsx" (or "Change impacts (proposed).xlsx" next to the first transcript when no CIA workbook is given) with the new rows highlighted, Status Proposed, and a "Proposed changes" sheet with an "Approve? (Yes/No)" column. The original CIA workbook is not changed.',
    inputSchema: {
      type: 'object',
      properties: {
        transcripts: { type: 'array', items: { type: 'string' }, description: 'Interview transcripts (.vtt, .docx or .txt)' },
        cia: { type: 'string', description: 'Optional CIA workbook to add to (e.g. the CIA template)' },
        interviewDate: { type: 'string', description: 'YYYY-MM-DD, recorded with the source' },
        impacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              stakeholderGroup: { type: 'string' },
              role: { type: 'string', description: 'Affected roles, comma-separated, if the interview names them' },
              process: { type: 'string', description: 'Business process that changes' },
              change: { type: 'string', description: 'What changes for these people, in one sentence' },
              level: { type: 'string', enum: ['H', 'M', 'L'], description: 'H = new skills or way of working; M = changed steps or tools; L = awareness only' },
              skillGap: { type: 'string', description: 'Optional skill gap or training need' },
              trainingType: { type: 'string', description: 'Optional, e.g. instructor-led, job aid' },
              evidence: { type: 'object', properties: { quote: { type: 'string', description: 'At least 4 words copied exactly from a transcript' } }, required: ['quote'] },
              reason: { type: 'string' },
            },
            required: ['stakeholderGroup', 'process', 'change', 'level', 'evidence'],
          },
        },
      },
      required: ['transcripts', 'impacts'],
    },
    run: write((a) => change.proposeImpacts([].concat(a.transcripts || a.transcript || []).map((t) => resolveIn(t)), a.cia ? resolveIn(a.cia) : null, a.impacts || [], { interviewDate: a.interviewDate })),
  },
  {
    name: 'apply_change_impacts',
    description: 'Write only the approved impacts (rows marked Yes in "Approve?") from a reviewed "(proposed)" CIA workbook to "<CIA> (updated).xlsx" with Status Approved. Refuses if any row is not marked Yes or No. Only call this after the person says they have reviewed the proposed workbook. The original is never overwritten.',
    inputSchema: { type: 'object', properties: { proposed: { type: 'string', description: 'The reviewed "(proposed)" workbook' } }, required: ['proposed'] },
    run: write((a) => change.applyImpacts(resolveIn(a.proposed))),
  },
  {
    name: 'consolidate_cia',
    description: 'Consolidate several Change Impact Assessment workbooks (every sheet with Stakeholder group, Change description and Impact level columns). Merges duplicate impacts (same stakeholder group and process, similar description; the higher level is kept), leaves out Rejected impacts, builds a heat map of stakeholder group by impact level, and derives training needs (TNA: group, role, headcount, skill gap, training type, priority) from approved impacts, using an optional role list for groups without named roles. Saves "CIA - consolidated.xlsx" (sheets Consolidated impacts, Heat map, TNA, Merged duplicates, Sources) and "Training actions - ADO import.xlsx" (one Task per role and training type). Never overwrites; source workbooks are not changed. Every impact cites its file and cell.',
    inputSchema: { type: 'object', properties: {
      files: { type: 'array', items: { type: 'string' }, description: 'CIA workbooks to consolidate' },
      roles: { type: 'string', description: 'Optional role list workbook (Role, Stakeholder group, Headcount)' },
      output: { type: 'string', description: 'Optional output path (default "CIA - consolidated.xlsx" next to the first file)' },
    }, required: ['files'] },
    run: write((a) => change.consolidateCia((a.files || []).map((f) => resolveIn(f)), { roles: a.roles ? resolveIn(a.roles) : undefined, output: outputIn(a.output) })),
  },
  {
    name: 'check_terminology',
    description: 'Bilingual QA: compare an English document with its French version (.docx, .md or .txt) against an EN/FR terminology sheet (columns English and Français; optional Do not translate). Paragraphs are aligned first. Reports glossary terms translated differently from the approved French term, English left in the French text, numbers, dates, amounts and IDs that differ between the versions, and paragraphs missing from either version, each with paragraph numbers and excerpts. Read-only. It is a machine check: a translator still reviews the French.',
    inputSchema: { type: 'object', properties: {
      english: { type: 'string', description: 'The approved English document' },
      french: { type: 'string', description: 'The French version or draft' },
      glossary: { type: 'string', description: 'The EN/FR terminology workbook' },
    }, required: ['english', 'french'] },
    run: (a) => glossary.checkTerminology(resolveIn(a.english), resolveIn(a.french), a.glossary ? resolveIn(a.glossary) : null),
  },
  {
    name: 'save_draft_document',
    description: 'Save AI-written Markdown (training material, job aids, FAQs, knowledge checks, a French draft) as a draft document: .md, .docx (Word), or .md with a Word copy (word: true). The label is put at the top (default "Draft (AI) for review"; for French drafts use "Machine-drafted, needs translator review") and the sources it cites are listed at the end. An optional Word template gives the program styles. Never overwrites: a numbered copy is saved instead. Warns when nothing cites a source.',
    inputSchema: { type: 'object', properties: {
      path: { type: 'string', description: 'Output path ending in .md or .docx, e.g. "Training/Processing officer - job aid.md"' },
      markdown: { type: 'string' },
      label: { type: 'string' },
      sources: { type: 'array', items: { type: 'string' }, description: 'Approved sections this draft is based on, e.g. "CIA - consolidated.xlsx › TNA!A3"' },
      word: { type: 'boolean', description: 'Also save a Word copy of a .md draft' },
      template: { type: 'string', description: 'Optional Word template (.dotx/.docx)' },
      title: { type: 'string' },
    }, required: ['path', 'markdown'] },
    run: write((a) => { const out = outputIn(a.path); if (!out) throw Object.assign(new Error('A file path is required.'), { friendly: true }); fs.mkdirSync(path.dirname(out), { recursive: true }); return change.saveDraft(out, a.markdown, { label: a.label, sources: a.sources, word: !!a.word, template: a.template ? resolveIn(a.template) : undefined, title: a.title }); }),
  },
  {
    name: 'check_readiness',
    description: 'Release readiness check of a checklist workbook (columns like Gate item, Environment STE/UAT/STG/PRD, Owner, Due, Evidence, Status, Must have; an optional "Go-live date" cell). Checks that every evidence reference is a file in the project folder (by path, then by file name; links are not checked). Rates Red/Amber/Green with the rule: Red if a must-have item is marked complete without its evidence, a must-have item is overdue, or must-have items are open 10 days or fewer before go-live; Amber if anything is open, missing evidence or unowned. Returns findings by environment, each citing its Sheet!Cell. Read-only.',
    inputSchema: { type: 'object', properties: {
      path: { type: 'string', description: 'The readiness checklist (.xlsx/.csv)' },
      goLive: { type: 'string', description: 'YYYY-MM-DD; default the checklist\'s "Go-live date" cell' },
      asOf: { type: 'string', description: 'YYYY-MM-DD (default today)' },
      redDays: { type: 'number', description: 'Open must-have items this many days or fewer before go-live make it Red (default 10)' },
    }, required: ['path'] },
    run: (a) => release.readinessCheck(resolveIn(a.path), { root: ROOT, goLive: a.goLive, asOf: a.asOf, redDays: a.redDays }),
  },
  {
    name: 'cutover_status',
    description: 'Live cutover status from a run-sheet workbook (ID, Step, Owner, Planned start, Planned end or Duration, Depends on, Actual start, Actual end, optional Forecast end, Status). Reports late steps, steps that should have started, blocked steps, the critical path to the projected finish (worked out from the dependencies and actuals), the next steps due, and the projected vs. planned finish with a Red/Amber/Green rating. Times are read as typed. With snapshot: true (needs "Create & edit files") it also saves the summary as Cutover/<date time>.md. The run-sheet is never changed.',
    inputSchema: { type: 'object', properties: {
      path: { type: 'string', description: 'The cutover run-sheet' },
      asOf: { type: 'string', description: 'YYYY-MM-DD HH:MM (default now)' },
      aheadMinutes: { type: 'number', description: 'List steps planned to start within this many minutes (default 60)' },
      toleranceMinutes: { type: 'number', description: 'A projected finish later than plan by more than this is Red (default 30)' },
      snapshot: { type: 'boolean', description: 'Also save Cutover/<date time>.md' },
    }, required: ['path'] },
    run: async (a) => {
      const r = await release.cutoverStatus(resolveIn(a.path), { asOf: a.asOf, aheadMinutes: a.aheadMinutes, toleranceMinutes: a.toleranceMinutes, snapshotDir: a.snapshot && !READ_ONLY ? path.join(ROOT, 'Cutover') : undefined });
      if (a.snapshot && READ_ONLY) r.warnings.push('The snapshot was not saved because editing files is turned off for this chat. Switch "What can Lumen do?" to "Create & edit files" to save it.');
      return r;
    },
  },
  {
    name: 'hypercare_trends',
    description: 'Hypercare trends from a defect export (Azure DevOps query as .xlsx/.csv, with Created Date and ideally Closed Date): weekly opened, closed, open at week end and average age, by severity, plus a Pass/Fail for each exit criterion, e.g. "No Sev1 open for 10 days", "No Sev2 open" (SevN means N or worse), "Fewer than 10 open defects", "No open defect older than 14 days", "Open defects falling for 2 weeks". Includes the analyze_defects triage headline. Every defect cites its Sheet!Cell. Read-only.',
    inputSchema: { type: 'object', properties: {
      path: { type: 'string', description: 'The defect export' },
      exitCriteria: { type: 'array', items: { type: 'string' }, description: 'Hypercare exit criteria in plain words (default: no Sev1 open for 10 days, no Sev2 open, fewer than 10 open, open defects falling for 2 weeks)' },
      asOf: { type: 'string', description: 'YYYY-MM-DD (default today)' },
      start: { type: 'string', description: 'Hypercare start date YYYY-MM-DD (default the first defect)' },
    }, required: ['path'] },
    run: (a) => release.hypercareTrends(resolveIn(a.path), { exitCriteria: a.exitCriteria, asOf: a.asOf, start: a.start }),
  },
  {
    name: 'index_adrs',
    description: 'Index the architecture decision records (ADRs) in a folder (MADR or Nygard style Markdown: title, status, date, context, decision, consequences, supersedes / superseded by). Flags ADRs with no status, superseded ADRs that are still referenced (by other ADRs or by the documents you pass), supersede links that disagree with the status, references to ADRs that do not exist, and decisions that look duplicated. Read-only.',
    inputSchema: { type: 'object', properties: {
      folder: { type: 'string', description: 'The ADR folder, e.g. "Architecture/ADRs"' },
      referencedIn: { type: 'array', items: { type: 'string' }, description: 'Optional design documents to scan for references to superseded ADRs' },
    }, required: ['folder'] },
    run: (a) => governance.readAdrs(resolveIn(a.folder), { root: ROOT, referencedIn: (a.referencedIn || []).map((p) => resolveIn(p)) }),
  },
  {
    name: 'check_consistency',
    description: 'Architecture consistency check across design documents (solution blueprint, FDD, TDD, API specs; .md/.docx/.txt). Pulls out named components, APIs and integrations (from table columns like Component/Platform/Service/API and from component sections), endpoints (GET /path…) and standards (WCAG, ISO, PCI DSS…), and reports names one document uses that the others never mention, standards cited with different versions, references to unknown or superseded ADRs (with adrs), and entities or fields the data model does not have (with dataModel). Each finding cites the file and heading. Pattern-based evidence for your review, not a verdict. Read-only.',
    inputSchema: { type: 'object', properties: {
      documents: { type: 'array', items: { type: 'string' }, description: 'Design documents to compare (two or more)' },
      adrs: { type: 'string', description: 'Optional ADR folder' },
      dataModel: { type: 'string', description: 'Optional data model workbook (Entities sheet with Entity; Attributes sheet with Entity and Attribute)' },
    }, required: ['documents'] },
    run: (a) => governance.checkConsistency((a.documents || []).map((p) => resolveIn(p)), { root: ROOT, adrs: a.adrs ? resolveIn(a.adrs) : undefined, dataModel: a.dataModel ? resolveIn(a.dataModel) : undefined }),
  },
  {
    name: 'assemble_gate_pack',
    description: 'Assemble a stage-gate pack. For each required artefact it takes the latest APPROVED version (Lumen\'s lifecycle approval stamp, a "Status: Approved" line, or Approver properties on a Word file; versioned siblings like "v1.0"/"v1.1" are compared) and leaves newer unapproved drafts out. Writes only into "Gate packs/<gate>/": a combined Word pack, an index (artefacts, approval status, open items), an open-item log workbook and copies of the included artefacts. Lists missing artefacts and open approvals. Give the gate definition inline or as a JSON file (manifest).',
    inputSchema: { type: 'object', properties: {
      manifest: { type: 'string', description: 'Optional gate definition JSON file, e.g. "Architecture/Design gate.json" ({ gate, artefacts: [{ name, path, required }], approvals: [{ role, artefact }], openItems })' },
      gate: { type: 'string', description: 'Gate name, e.g. "Design gate"' },
      artefacts: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, path: { type: 'string', description: 'File or folder' }, required: { type: 'boolean' } } }, description: 'Required artefacts' },
      approvals: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, artefact: { type: 'string', description: 'Artefact whose approval counts for this role' }, approver: { type: 'string' }, date: { type: 'string' } } }, description: 'Required approvals. Only give approver and date when the person tells you they were recorded.' },
      openItems: { type: 'array', items: { type: 'string' } },
      raid: { type: 'string', description: 'Optional RAID log: its open Medium/High items are added to the open items' },
      template: { type: 'string', description: 'Optional Word template, e.g. "Templates/TDD Template.dotx"' },
    } },
    run: write(async (a) => {
      let m = {};
      if (a.manifest) { try { m = JSON.parse(fs.readFileSync(resolveIn(a.manifest), 'utf8')); } catch (e) { throw Object.assign(new Error(e.friendly ? e.message : `The gate definition "${a.manifest}" is not valid JSON: ${e.message}`), { friendly: true }); } }
      const manifest = { gate: a.gate || m.gate, artefacts: a.artefacts || m.artefacts, approvals: a.approvals || m.approvals, openItems: a.openItems || m.openItems };
      for (const x of manifest.artefacts || []) if (x && x.path) resolveIn(x.path, { mustExist: false });
      return governance.assembleGatePack(manifest, { root: ROOT, raid: a.raid ? resolveIn(a.raid) : undefined, template: a.template ? resolveIn(a.template) : undefined });
    }),
  },
  {
    name: 'propose_inventory_updates',
    description: 'Propose updates to a technical inventory workbook (solution components, APIs, integrations, dependencies) from delivery changes: an Azure DevOps export (.xlsx/.csv with Title), git log --name-only output saved as a text file, an ADR folder (accepted decisions) and design documents. Proposes rows to add (new components), change (last changed date, or a review) and retire (retire/decommission/replace wording), each with its evidence. Writes "<inventory> (proposed).xlsx" with the rows highlighted and a "Proposed changes" sheet with an "Approve? (Yes/No)" column. The inventory itself is never changed.',
    inputSchema: { type: 'object', properties: {
      inventory: { type: 'string', description: 'The technical inventory workbook' },
      adoExports: { type: 'array', items: { type: 'string' } },
      gitLogs: { type: 'array', items: { type: 'string' }, description: 'Text files with git log --name-only output' },
      adrs: { type: 'string', description: 'ADR folder' },
      documents: { type: 'array', items: { type: 'string' }, description: 'Design documents' },
    }, required: ['inventory'] },
    run: write((a) => governance.diffInventory(resolveIn(a.inventory), { adoExports: (a.adoExports || []).map((p) => resolveIn(p)), gitLogs: (a.gitLogs || []).map((p) => resolveIn(p)), adrs: a.adrs ? resolveIn(a.adrs) : undefined, documents: (a.documents || []).map((p) => resolveIn(p)) }, { root: ROOT })),
  },
  {
    name: 'analyze_controls',
    description: 'Security control analysis for SA&A. Reads the program\'s control catalogue workbook (Control ID, Family, Title, Statement, Baseline/Profile) and the SCTM (Control ID, Applicability, Implementation statement, Responsible party, Design reference, Evidence references, Status Planned/Implemented/Gap). Reports catalogue coverage (controls in the profile not yet in the SCTM), statements whose design reference is not a real heading in the FDD/TDD you pass (needs input), applicable controls with no statement, gaps, and with an evidence folder: per control the evidence found (by control ID in the file name, an evidence index workbook in the folder, or the SCTM reference), missing evidence (named but not there, or an implemented control with none), stale evidence (older than staleDays, from the date in the index or file name) and orphan files. Every finding cites its Sheet!Cell or file. Read-only.',
    inputSchema: { type: 'object', properties: {
      catalogue: { type: 'string', description: 'Control catalogue workbook' },
      sctm: { type: 'string', description: 'SCTM workbook' },
      evidence: { type: 'string', description: 'Optional evidence folder, e.g. "Evidence"' },
      documents: { type: 'array', items: { type: 'string' }, description: 'Optional FDD/TDD documents whose headings the design references must cite' },
      staleDays: { type: 'number', description: 'Evidence older than this many days is stale (default 365)' },
      asOf: { type: 'string', description: 'Date to check against, YYYY-MM-DD (default today)' },
    } },
    run: (a) => controls.analyzeControls({ catalogue: a.catalogue ? resolveIn(a.catalogue) : undefined, sctm: a.sctm ? resolveIn(a.sctm) : undefined, evidence: a.evidence ? resolveIn(a.evidence) : undefined, documents: (a.documents || []).map((p) => resolveIn(p)) }, { root: ROOT, asOf: a.asOf, staleDays: a.staleDays }),
  },
  {
    name: 'write_sctm',
    description: 'Propose SCTM rows (implementation statements, applicability, responsible party, design reference, evidence references, status) for an assessor to approve. Saves "<SCTM> (proposed).xlsx" (or "SCTM (proposed).xlsx" next to the catalogue when no SCTM is given) with changed cells highlighted, new rows in green, and a "Proposed changes" sheet with an "Approve? (Yes/No)" column and a design citation check. A statement whose design reference is missing or is not a real heading in the FDD/TDD you pass is marked Status "Needs input". Controls not in the catalogue are rejected. Remediation items (and every Gap row) are saved as "<SCTM> - remediation (ADO import).xlsx". The original SCTM is never changed.',
    inputSchema: { type: 'object', properties: {
      sctm: { type: 'string', description: 'The SCTM to propose changes to (optional when starting one)' },
      catalogue: { type: 'string', description: 'Control catalogue workbook (controls not in it are rejected)' },
      documents: { type: 'array', items: { type: 'string' }, description: 'FDD/TDD documents the design references must cite' },
      rows: { type: 'array', items: { type: 'object', properties: {
        control: { type: 'string' }, applicability: { type: 'string', description: 'Applicable, Not applicable, Inherited or Shared' },
        statement: { type: 'string', description: 'Implementation statement, drafted only from the design' }, responsible: { type: 'string' },
        designReference: { type: 'string', description: 'Document and heading the statement is based on, e.g. "Technical Design - Security.md > 3.2 Encryption at rest"' },
        evidence: { type: 'array', items: { type: 'string' } }, status: { type: 'string', description: 'Planned, Implemented, Partially implemented or Gap' }, notes: { type: 'string' },
      }, required: ['control'] } },
      remediation: { type: 'array', items: { type: 'object', properties: { control: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'number', description: '1 (highest) to 4' }, owner: { type: 'string' } } }, description: 'Optional remediation items for the Azure DevOps import workbook' },
    }, required: ['rows'] },
    run: write((a) => controls.proposeSctm(a.sctm ? resolveIn(a.sctm) : null, a.rows || [], { catalogue: a.catalogue ? resolveIn(a.catalogue) : undefined, documents: (a.documents || []).map((p) => resolveIn(p)), remediation: a.remediation || [], root: ROOT })),
  },
  {
    name: 'profile_data',
    description: 'Profile a data extract saved in the notebook (.csv or .xlsx, up to 200,000 rows). Per column: inferred type, nulls and null %, distinct count, min/max, top values, pattern classes (e.g. AA9999) and numeric outliers. With a data dictionary (workbook, SQL DDL or JSON Schema) it also checks each field\'s rules: required, type (bad dates and numbers), allowed values, pattern, maximum length, unique, and foreign keys into another extract (found next to the file by entity name, or given in lookups). Each finding has a severity, a count and at most 5 example rows; values in columns that look personal are masked. scripts: true adds PySpark and Spark SQL to re-run the profile on the full table in Fabric. Read-only.',
    inputSchema: { type: 'object', properties: {
      path: { type: 'string', description: 'The extract to profile, e.g. "Applications - source extract.csv"' },
      dictionary: { type: 'string', description: 'Optional data dictionary workbook, SQL DDL or JSON Schema with the rules' },
      entity: { type: 'string', description: 'Dictionary entity for this file (default: by file name or matching columns)' },
      sheet: { type: 'string', description: 'Sheet to profile in a workbook (default the first)' },
      lookups: { type: 'object', additionalProperties: { type: 'string' }, description: 'Optional files for foreign keys, e.g. { "CLIENTS": "Clients - source extract.csv" }' },
      scripts: { type: 'boolean', description: 'Also return PySpark and Spark SQL profiling scripts' },
      table: { type: 'string', description: 'Lakehouse table name for the scripts, e.g. "bronze.applications"' },
    }, required: ['path'] },
    run: (a) => data.profileTable(resolveIn(a.path), { dictionary: a.dictionary ? resolveIn(a.dictionary) : undefined, entity: a.entity, sheet: a.sheet, lookups: Object.fromEntries(Object.entries(a.lookups || {}).map(([k, v]) => [k, resolveIn(v)])), scripts: !!a.scripts, table: a.table, root: ROOT }),
  },
  {
    name: 'read_schema',
    description: 'Read a schema: SQL DDL (CREATE TABLE, with NOT NULL, PRIMARY KEY, REFERENCES, CHECK IN and -- comments), a JSON Schema (properties, required, enum, pattern, format, $defs) or a data dictionary / data model workbook (Entity, Field, Type, Required, Allowed values, Pattern, Unique, References, Description). Returns each entity with its fields: name, type, type family, nullable, description and rules. Read-only.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'The .sql, .json or .xlsx schema file' } }, required: ['path'] },
    run: (a) => data.readSchema(resolveIn(a.path)).then((s) => ({ ...s, file: path.relative(ROOT, s.file) })),
  },
  {
    name: 'compare_schemas',
    description: 'Compare a source schema with a target schema (SQL DDL, JSON Schema or data dictionary; e.g. source extract → Silver canonical model, or Silver → Gold). Finds exact, normalized (case and underscores) and fuzzy name matches (abbreviations such as DT, CD, AMT, ADDR expanded), checks type compatibility (compatible, widening, narrowing, conversion, incompatible) and blanks into required fields, and lists the unmatched fields on both sides. Fuzzy matches are suggestions to confirm. Read-only.',
    inputSchema: { type: 'object', properties: {
      source: { type: 'string', description: 'Source schema file' },
      target: { type: 'string', description: 'Target schema file' },
      sourceEntity: { type: 'string', description: 'Source table/entity to compare (default all of them)' },
      targetEntity: { type: 'string', description: 'Target table/entity to compare (default all of them)' },
      threshold: { type: 'number', description: 'Fuzzy name similarity, 0 to 1 (default 0.55)' },
    }, required: ['source', 'target'] },
    run: (a) => data.compareSchemas(resolveIn(a.source), resolveIn(a.target), { sourceEntity: a.sourceEntity, targetEntity: a.targetEntity, threshold: a.threshold }),
  },
  {
    name: 'write_sttm',
    description: 'Save a source-to-target mapping (STTM) workbook: ID, source entity/field/type, transformation rule, target layer (Bronze/Silver/Gold), target entity/field/type, match, DQ rule, Status, Reviewer, notes. Every row is saved as Draft with no reviewer; only a person sets Approved. With source and target schemas, the match evidence is filled in, every unmatched source and target field is added as a "Needs input" row, and "Unmatched fields" and "Match evidence" sheets are added. Never overwrites: a numbered copy is saved instead.',
    inputSchema: { type: 'object', properties: {
      path: { type: 'string', description: 'Output .xlsx path, e.g. "STTM - Applications to Silver.xlsx"' },
      source: { type: 'string', description: 'Optional source schema file (to list unmatched fields)' },
      target: { type: 'string', description: 'Optional target schema file' },
      sourceEntity: { type: 'string' }, targetEntity: { type: 'string' },
      rows: { type: 'array', items: { type: 'object', properties: {
        sourceEntity: { type: 'string' }, sourceField: { type: 'string' }, sourceType: { type: 'string' },
        rule: { type: 'string', description: 'Transformation rule in plain words: direct, trim, upper, parse date format \'yyyy-MM-dd\', cast to decimal(10,2), default \'X\', constant \'X\', or "expr: <PySpark>" / "sql: <Spark SQL>"' },
        targetLayer: { type: 'string', description: 'Bronze, Silver or Gold' }, targetEntity: { type: 'string' }, targetField: { type: 'string' }, targetType: { type: 'string' },
        match: { type: 'string' }, dqRule: { type: 'string', description: 'e.g. not null, in NEW, RENEWAL, AMEND, > 0' }, notes: { type: 'string' },
      } } },
    }, required: ['path'] },
    run: write(async (a) => {
      const out = outputIn(a.path);
      if (!out || !/\.xlsx$/i.test(out)) throw Object.assign(new Error('Save the STTM as an .xlsx file.'), { friendly: true });
      const comparison = a.source && a.target ? await data.compareSchemas(resolveIn(a.source), resolveIn(a.target), { sourceEntity: a.sourceEntity, targetEntity: a.targetEntity }) : undefined;
      const r = await data.writeSttm(out, a.rows || [], { comparison });
      return { ...r, saved: path.relative(ROOT, r.saved) };
    }),
  },
  {
    name: 'generate_pipeline_code',
    description: 'Generate pipeline code from the APPROVED rows of an STTM workbook (Status = Approved). For each target layer and table it writes, under "Pipelines/<layer> - <table>/": a PySpark notebook (.py), Spark SQL (CREATE TABLE and INSERT … SELECT), a Data Factory / Fabric pipeline JSON, pytest unit tests and a reconciliation query (row counts and checksums per layer). Plain-word rules are turned into code; any rule it can\'t translate is marked TODO and listed. Rows that are not Approved are refused and listed, and no code is written for them. Never overwrites: numbered copies are saved instead.',
    inputSchema: { type: 'object', properties: {
      sttm: { type: 'string', description: 'The STTM workbook' },
      layer: { type: 'string', description: 'Only rows for this target layer (Bronze, Silver, Gold)' },
      entity: { type: 'string', description: 'Only rows for this target table' },
      outDir: { type: 'string', description: 'Output folder (default "Pipelines")' },
      sourceTables: { type: 'object', additionalProperties: { type: 'string' }, description: 'Lakehouse table per source entity, e.g. { "APPLICATIONS": "bronze.src_applications" }' },
    }, required: ['sttm'] },
    run: write((a) => data.generatePipelineCode(resolveIn(a.sttm), { layer: a.layer, entity: a.entity, outDir: outputIn(a.outDir), sourceTables: a.sourceTables, root: ROOT })),
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
  require('./mcp-stdio').serve({ name: 'office', instructions: 'Tools for Excel workbooks, Microsoft Project plans (including delivery scenarios and team capacity), Word documents, requirements traceability, test cases, defect triage, change impacts and training needs, bilingual QA, release readiness, cutover and hypercare, architecture reviews, ADRs, gate packs and technical inventories, security controls (SCTM and SA&A evidence), data profiling, schemas, source-to-target mappings (STTM) and pipeline code, and knowledge publishing in the project folder.', tools: TOOLS });
}

module.exports = { TOOLS };
