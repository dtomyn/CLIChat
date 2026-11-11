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
    case 'publish_snapshot': { const n = (input.sources || []).length; return { icon: 'file', label: `Publishing ${n === 1 ? base(input.sources[0]) : `${n} sources`} to Published/${input.library || 'Knowledge'}` }; }
    case 'write_test_cases': { const n = (input.cases || []).length; return { icon: 'sheet', label: `Writing ${n} test case${n === 1 ? '' : 's'} to ${base(input.path)}` }; }
    case 'analyze_defects': return { icon: 'list', label: `Triaging defects in ${base(input.path)}` };
    case 'propose_defect_changes': { const n = (input.changes || []).length; return { icon: 'sheet', label: `Proposing ${n} defect change${n === 1 ? '' : 's'} for review` }; }
    case 'propose_change_impacts': { const n = (input.impacts || []).length; return { icon: 'sheet', label: `Proposing ${n} change impact${n === 1 ? '' : 's'} for review` }; }
    case 'apply_change_impacts': return { icon: 'sheet', label: `Applying approved change impacts from ${base(input.proposed)}` };
    case 'consolidate_cia': { const n = (input.files || []).length; return { icon: 'sheet', label: `Consolidating ${n} change impact assessment${n === 1 ? '' : 's'}` }; }
    case 'check_terminology': return { icon: 'list', label: `Checking ${base(input.french)} against ${base(input.english)}` };
    case 'save_draft_document': return { icon: 'file', label: `Saving draft ${base(input.path)}${input.powerpoint && !/\.pptx$/i.test(input.path || '') ? ' with a PowerPoint deck' : ''}` };
    case 'check_readiness': return { icon: 'list', label: `Checking release readiness in ${base(input.path)}` };
    case 'cutover_status': return { icon: 'gantt', label: `Checking cutover progress in ${base(input.path)}` };
    case 'hypercare_trends': return { icon: 'list', label: `Looking at hypercare trends in ${base(input.path)}` };
    case 'index_adrs': return { icon: 'list', label: `Indexing the decision records in ${base(input.folder)}` };
    case 'check_consistency': { const n = (input.documents || []).length; return { icon: 'search', label: `Checking ${n} design document${n === 1 ? '' : 's'} for consistency` }; }
    case 'assemble_gate_pack': return { icon: 'file', label: `Assembling the ${input.gate || 'gate'} pack` };
    case 'propose_inventory_updates': return { icon: 'sheet', label: `Proposing updates to ${base(input.inventory)}` };
    case 'analyze_controls': return { icon: 'search', label: `Checking security controls${input.evidence ? ' and evidence' : ''} in ${base(input.sctm || input.catalogue) || 'the SCTM'}` };
    case 'write_sctm': {
      const n = (input.rows || []).length, r = (input.remediation || []).length;
      if (!n) return { icon: 'sheet', label: `Saving ${r} remediation item${r === 1 ? '' : 's'} for Azure DevOps` };
      return { icon: 'sheet', label: `Proposing ${n} SCTM row${n === 1 ? '' : 's'} for review` };
    }
    case 'profile_data': return { icon: 'sheet', label: `Profiling ${base(input.path)}${input.dictionary ? ` against ${base(input.dictionary)}` : ''}` };
    case 'read_schema': return { icon: 'file', label: `Reading schema ${base(input.path)}` };
    case 'compare_schemas': return { icon: 'search', label: `Comparing ${base(input.source)} with ${base(input.target)}` };
    case 'write_sttm': { const n = (input.rows || []).length; return { icon: 'sheet', label: `Saving ${n} mapping row${n === 1 ? '' : 's'} to ${base(input.path)}` }; }
    case 'generate_pipeline_code': return { icon: 'file', label: `Generating pipeline code from the approved rows of ${base(input.sttm)}` };
    case 'validate_openapi': return { icon: 'search', label: `Checking the API spec ${base(input.path)}${input.standards ? ` against ${base(input.standards)}` : ''}` };
    case 'check_icd': return { icon: 'search', label: `Checking ${base(input.path)} for missing ICD sections` };
    case 'write_openapi': return { icon: 'file', label: `Saving the API spec ${base(input.path)}` };
    case 'generate_api_scaffold': return { icon: 'file', label: `Generating a mock and code stubs from ${base(input.spec)}` };
    case 'compare_configs': return { icon: 'search', label: input.folder ? `Comparing environment configs in ${base(input.folder)}` : `Comparing ${(input.files || []).length} environment config files` };
    case 'lint_pipeline': return { icon: 'search', label: `Checking the pipeline ${base(input.path)}` };
    case 'generate_playwright_tests': return { icon: 'file', label: `Writing Playwright tests from ${base(input.workbook)}` };
    case 'check_freshness': return { icon: 'search', label: 'Checking published knowledge is up to date' };
    case 'query_plan': return { icon: 'gantt', label: `Looking up tasks in ${base(input.path)}` };
    case 'plan_change_log': return { icon: 'gantt', label: `Comparing ${base(input.path)} with an earlier version` };
    case 'plan_progress_from_backlog': return { icon: 'gantt', label: `Matching ${base(input.backlog)} to ${base(input.path)}` };
    case 'plan_lookahead': return { icon: 'gantt', label: `Looking ahead in ${base(input.path)}` };
    case 'model_scenario': return { icon: 'gantt', label: `Modelling ${input.name ? `“${String(input.name).slice(0, 40)}”` : 'a scenario'} on ${base(input.path)}` };
    case 'analyze_capacity': return { icon: 'sheet', label: `Checking capacity in ${base(input.capacity)}${input.plan ? ` against ${base(input.plan)}` : ''}` };
    case 'analyze_project_plan': return { icon: 'gantt', label: `Analyzing schedule in ${base(input.path)}` };
    case 'update_project_plan': { const n = (input.updates || []).length; return { icon: 'gantt', label: `Updating ${n} task${n === 1 ? '' : 's'} in ${base(input.path)}` }; }
    case 'project_plan_to_spreadsheet': return { icon: 'sheet', label: `Building Excel tracker ${base(input.output)}` };
    default: return { icon: 'spark', label: `Using ${String(tool).replace(/_/g, ' ')}` };
  }
}

// Friendly progress labels for the bundled "ado" (Azure DevOps) tools.
function adoLabel(tool, input = {}) {
  const n = (v) => (Array.isArray(v) ? v.length : 0);
  const q = (s) => `“${String(s).slice(0, 40)}”`;
  switch (tool) {
    case 'ado_search_work_items': return { icon: 'board', label: input.text ? `Searching Azure DevOps for ${q(input.text)}` : 'Looking through work items' };
    case 'ado_query_work_items': return { icon: 'board', label: /^@current/i.test(input.iteration || '') ? 'Looking at the current sprint' : 'Looking through work items' };
    case 'ado_get_work_items': { const ids = (input.ids || []).slice(0, 3).map((x) => `#${x}`).join(', '); return { icon: 'board', label: `Reading work item${n(input.ids) === 1 ? '' : 's'} ${ids}${n(input.ids) > 3 ? '…' : ''}` }; }
    case 'ado_describe_work_item_type': return { icon: 'board', label: input.type ? `Checking the fields of ${input.type}` : 'Checking the work item types' };
    case 'ado_list_paths': return { icon: 'board', label: 'Checking areas and sprints' };
    case 'ado_search_wiki': return { icon: 'book', label: `Searching the wiki for ${q(input.text || '')}` };
    case 'ado_list_wiki_pages': return { icon: 'book', label: 'Looking through the wiki' };
    case 'ado_read_wiki_page': return { icon: 'book', label: `Reading wiki page ${base(input.path) || ''}`.trim() };
    case 'ado_propose_work_items': return { icon: 'board', label: `Preparing ${n(input.items)} new work item${n(input.items) === 1 ? '' : 's'} for your approval` };
    case 'ado_propose_work_item_update': return { icon: 'board', label: `Preparing changes to #${input.id} for your approval` };
    case 'ado_propose_links': return { icon: 'board', label: `Preparing ${n(input.links)} link${n(input.links) === 1 ? '' : 's'} for your approval` };
    case 'ado_propose_comment': return { icon: 'board', label: `Preparing a comment on #${input.id} for your approval` };
    case 'ado_propose_wiki_page': return { icon: 'book', label: `Preparing wiki page ${base(input.path) || ''} for your approval` };
    case 'ado_export_backlog': return { icon: 'sheet', label: 'Exporting the Azure DevOps backlog to Excel' };
    default: return { icon: 'board', label: `Using ${String(tool).replace(/^ado_/, '').replace(/_/g, ' ')}` };
  }
}

// Friendly progress labels for the bundled "lumen" tools (questions about Lumen itself).
function lumenLabel(tool, input = {}) {
  const q = input.query ? ` matching “${String(input.query).slice(0, 40)}”` : '';
  switch (tool) {
    case 'lumen_overview': return { icon: 'list', label: 'Taking stock of your agents and prompts' };
    case 'lumen_list_agents': return { icon: 'list', label: `Looking through your agents${q}` };
    case 'lumen_list_prompts': return { icon: 'list', label: `Looking through your prompts${q}` };
    case 'lumen_list_workflows': return { icon: 'list', label: `Looking through your workflows${q}` };
    case 'lumen_list_schedules': return { icon: 'list', label: 'Checking your scheduled prompts' };
    case 'lumen_list_skills': return { icon: 'list', label: `Looking through skills${q}` };
    case 'lumen_get_item': return { icon: 'list', label: `Reading the ${input.kind || 'item'} ${input.id ? `“${String(input.id).slice(0, 40)}”` : ''}`.trim() };
    case 'lumen_how_to': return { icon: 'book', label: `Checking the Lumen guide on “${String(input.topic || '').slice(0, 40)}”` };
    default: return { icon: 'list', label: `Using ${String(tool).replace(/^lumen_/, '').replace(/_/g, ' ')}` };
  }
}

/** A proposal tool's result ends with `{"pending": "<change set id>"}`: Lumen shows an Approve card for it. */
function pendingChangeSet(text) {
  const m = /\{"pending":\s*"([0-9a-f-]{36})"\}/i.exec(String(text || ''));
  return m ? m[1] : null;
}

/** Office tools report the file they saved as `"saved": "<path>"` in their result text. */
function savedFile(text) {
  const m = /"saved":\s*"((?:[^"\\]|\\.)+)"/.exec(String(text || ''));
  if (!m) return null;
  try { return JSON.parse(`"${m[1]}"`); } catch { return null; }
}

module.exports = { officeLabel, adoLabel, lumenLabel, pendingChangeSet, savedFile, base };
