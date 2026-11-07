// Friendly progress labels for Lumen's bundled "office" MCP tools, shared by every engine.

const path = require('path');

const base = (p) => (p ? path.basename(String(p)) : '');

function officeLabel(tool, input = {}) {
  switch (tool) {
    case 'list_office_files': return { icon: 'search', label: 'Looking for documents, workbooks and plans' };
    case 'read_document': return { icon: 'file', label: `Reading ${base(input.path) || 'a document'}` };
    case 'read_spreadsheet': return { icon: 'sheet', label: `Reading ${base(input.path)}${input.sheet ? ` › ${input.sheet}` : ''}` };
    case 'create_spreadsheet': return { icon: 'sheet', label: `Creating ${base(input.path)}` };
    case 'update_spreadsheet': return { icon: 'sheet', label: `Updating ${base(input.path)}` };
    case 'analyze_traceability': return { icon: 'list', label: `Checking traceability in ${base(input.path)}` };
    case 'read_project_plan': return { icon: 'gantt', label: `Reading plan ${base(input.path)}` };
    case 'get_status_facts': return { icon: 'gantt', label: `Gathering status facts from ${base(input.path)}${input.raid ? ` and ${base(input.raid)}` : ''}` };
    case 'build_status_report': return { icon: 'file', label: `Writing the status pack for ${base(input.path)}` };
    case 'read_transcript': return { icon: 'file', label: `Reading transcript ${base(input.path)}` };
    case 'propose_raid_updates': { const n = (input.proposals || []).length; return { icon: 'sheet', label: `Proposing ${n} RAID change${n === 1 ? '' : 's'} for review` }; }
    case 'apply_raid_updates': return { icon: 'sheet', label: `Applying approved RAID changes from ${base(input.proposed)}` };
    case 'query_plan': return { icon: 'gantt', label: `Looking up tasks in ${base(input.path)}` };
    case 'plan_change_log': return { icon: 'gantt', label: `Comparing ${base(input.path)} with an earlier version` };
    case 'plan_progress_from_backlog': return { icon: 'gantt', label: `Matching ${base(input.backlog)} to ${base(input.path)}` };
    case 'plan_lookahead': return { icon: 'gantt', label: `Looking ahead in ${base(input.path)}` };
    case 'analyze_project_plan': return { icon: 'gantt', label: `Analyzing schedule in ${base(input.path)}` };
    case 'update_project_plan': { const n = (input.updates || []).length; return { icon: 'gantt', label: `Updating ${n} task${n === 1 ? '' : 's'} in ${base(input.path)}` }; }
    case 'project_plan_to_spreadsheet': return { icon: 'sheet', label: `Building Excel tracker ${base(input.output)}` };
    default: return { icon: 'spark', label: `Using ${String(tool).replace(/_/g, ' ')}` };
  }
}

/** Office tools report the file they saved as `"saved": "<path>"` in their result text. */
function savedFile(text) {
  const m = /"saved":\s*"((?:[^"\\]|\\.)+)"/.exec(String(text || ''));
  if (!m) return null;
  try { return JSON.parse(`"${m[1]}"`); } catch { return null; }
}

module.exports = { officeLabel, savedFile, base };
