// Starts Lumen for the browser tests on 127.0.0.1 only, with throw-away data and a stand-in engine.
// The stand-in "engine" has no AI: it recognises which prompt was run, calls the real plan tools from
// tools/*.js on the files named in the prompt, and streams their results back the way a real engine would.
// So the tests exercise the UI and the real tool code, but not the quality of an AI's wording.

const fs = require('fs');
const path = require('path');
const { ROOT, DATA, PROJECT, PORT } = require('./paths');

fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(PROJECT, { recursive: true });
process.env.LUMEN_DATA = DATA;
process.env.PORT = String(PORT);

const store = require('../lib/store');
// E2E_ENGINE=copilot or =claude runs that real CLI (uses your sign-in); otherwise the stand-in engine below.
const REAL_ENGINES = { copilot: 'copilot-cli', claude: 'claude-cli' };
const REAL = !!REAL_ENGINES[process.env.E2E_ENGINE];
store.settings.set({ workspace: PROJECT, providerId: REAL ? REAL_ENGINES[process.env.E2E_ENGINE] : 'fake', access: 'edit', onboarded: true });

const project = require('../tools/project');
const backlog = require('../tools/backlog');
const { officeLabel } = require('../lib/tool-labels');

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!e.name.startsWith('.')) { const f = findFile(p, name); if (f) return f; } }
    else if (e.name === name) return p;
  }
  return null;
}

const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

async function answer(prompt, cwd) {
  const names = [...prompt.matchAll(/"([^"]+\.(?:xml|mpp|xlsx|xlsm|csv))"/g)].map((m) => m[1]);
  const file = (re) => { const n = names.find((x) => re.test(x)); return n && findFile(cwd, n); };
  const plan = file(/\.(xml|mpp)$/i), backlogFile = file(/\.(xlsx|xlsm|csv)$/i);
  const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(prompt)?.[1];
  if (/plan_lookahead/.test(prompt)) {
    const r = project.lookahead(plan, {});
    return { tool: ['plan_lookahead', { path: plan }], text: `**Look-ahead ${r.window.from} to ${r.window.to}:** ${r.summary}\n\n${r.workstreams.map((w) => `### ${w.workstream}\n${w.starting.map((t) => `- Starting: #${t.id} ${t.task}`).join('\n')}\n${w.waitingOn.map((x) => `- Waiting: ${x.task} on ${x.waitsFor}`).join('\n')}`).join('\n\n')}` };
  }
  if (/plan_change_log/.test(prompt)) {
    const r = project.changeLog(plan, { against: 'last' }, cwd);
    return { tool: ['plan_change_log', { path: plan }], text: `**${r.summary || r.warnings?.[0]}**\n\n${table(['ID', 'Task', 'Why it is material'], (r.material || []).map((c) => [c.id, c.task, c.why]))}` };
  }
  if (/plan_progress_from_backlog/.test(prompt)) {
    const r = await backlog.progressFromBacklog(plan, backlogFile, { statusDate: date });
    return { tool: ['plan_progress_from_backlog', { path: plan, backlog: backlogFile }], text: `**${r.summary}**\n\n${table(['ID', 'Task', 'Now', 'Proposed'], r.proposals.map((p) => [p.taskId, p.task, `${p.currentPercent}%`, `${p.percentComplete}%`]))}\n\nHeld back: ${r.heldBack.map((h) => `#${h.taskId}`).join(', ') || 'none'}` };
  }
  return { text: 'This is the test engine. It only answers the new project-plan prompts.' };
}

const registry = require('../providers');
if (!REAL) registry.providers.fake = {
  id: 'fake', name: 'Test engine', vendor: 'Lumen tests', description: 'Stand-in engine for browser tests', models: [], supportsResume: false,
  async detect() { return { available: true, version: 'test' }; },
  async run(opts, emit) {
    try {
      const r = await answer(opts.prompt, opts.cwd);
      if (r.tool) { emit({ type: 'tool', id: 't1', ...officeLabel(r.tool[0], r.tool[1]) }); await new Promise((s) => setTimeout(s, 150)); emit({ type: 'tool_done', id: 't1', ok: true }); }
      emit({ type: 'text', text: r.text });
    } catch (e) { emit({ type: 'error', message: e.message }); }
  },
  async complete() { return 'Test chat'; },
};

// Stand-in Microsoft Foundry (Contoso agents): canned hosted-agent replies, no Azure. E2E_FOUNDRY=live uses the real
// project in Settings (and your az login) instead.
if (process.env.E2E_FOUNDRY !== 'live') {
  process.env.LUMEN_FOUNDRY_ENDPOINT = 'https://e2e-test.services.ai.azure.com/api/projects/e2e';
  require('../lib/foundry/auth')._setTokenSource(async () => ({ token: 'e2e', expiresAt: Date.now() + 3600_000 }));
  const fence = (result, summary) => `${summary}\n\n\`\`\`json\n${JSON.stringify(result, null, 1)}\n\`\`\``;
  const reply = (id, text, extra = []) => ({ id, status: 'completed', output: [...(text ? [{ type: 'message', content: [{ type: 'output_text', text }] }] : []), ...extra] });
  require('../lib/foundry/client')._setFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    let data;
    if (Array.isArray(body.input) && body.input[0]?.type === 'mcp_approval_response') {
      data = reply('caresp_e2e_3', fence({ status: 'ok', counts: { sections: 13 } }, body.input[0].approve ? 'ICD draft for IF-CSP-NS-001: 13 sections, completeness 100%.' : 'Stopped.'));
    } else if (/interface-documentation/.test(url)) {
      data = reply('caresp_e2e_2', '', [{ type: 'mcp_approval_request', id: 'mcpr_e2e', server_label: 'langgraph', name: '__hosted_agent_adapter_interrupt__',
        arguments: JSON.stringify({ value: { type: 'contoso_approval_request', summary: 'Confirm integration pattern for IF-CSP-NS-001: Request-reply (P5 synchronous)', reviewer_group: 'Integration architects', proposals: [] } }) }]);
    } else {
      const input = JSON.parse(body.input || body.message || '{}');
      data = reply('caresp_e2e_1', fence({
        status: 'ok', counts: { functional: 2, non_functional: 1, gaps: 3 },
        guardrail_findings: [{ title: 'Section 3.2 blocked by content filter' }],
        requirement_set: { requirements: [
          { id: 'INTAKE-FR-001', statement: 'The system shall allow an applicant to submit an application online.', type: 'functional', priority: 'must' },
          { id: 'INTAKE-FR-002', statement: 'The system shall issue a confirmation number.', type: 'functional', priority: 'must' },
          { id: 'INTAKE-NFR-001', statement: 'Public pages shall meet WCAG 2.1 AA.', type: 'non_functional', priority: 'unspecified' }] },
        received: { message: input.message || null, filename: input.filename || null },
      }, 'Extracted 2 functional and 1 non-functional requirements from INTAKE. AI-drafted — pending functional lead review.'));
    }
    await new Promise((s) => setTimeout(s, 200));
    return { status: 200, text: async () => JSON.stringify(data), headers: { get: () => null } };
  });
}

require('../server');
