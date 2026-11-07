// Starts Lumen for the browser tests on 127.0.0.1 only, with throw-away data and a stand-in engine.
// The stand-in "engine" has no AI: it recognises which quick start was run, calls the real plan tools from
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
  return { text: 'This is the test engine. It only answers the new project-plan quick starts.' };
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

require('../server');
