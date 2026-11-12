#!/usr/bin/env node
// "lumen" MCP server: read-only questions about Lumen itself — its agents, prompts, workflows, schedules, skills
// and how-to guides (intents/). Reads the data folder (LUMEN_DATA) directly and never writes to it.

const fs = require('fs');
const path = require('path');
const { serve } = require('./mcp-stdio');

const APP = path.join(__dirname, '..');
const DATA = path.resolve(process.env.LUMEN_DATA || path.join(APP, 'data'));
const INTENTS = path.join(APP, 'intents');
const SKILLS = path.join(APP, 'skills');

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const agentFiles = () => { try { return fs.readdirSync(path.join(DATA, 'agents')).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(DATA, 'agents', f), null)).filter(Boolean); } catch { return null; } };
const list = (name) => { if (name === 'assistants') { const a = agentFiles(); if (a) return a; } const v = readJson(path.join(DATA, `${name}.json`), null) ?? readJson(path.join(APP, 'defaults', `${name}.json`), []); return Array.isArray(v) ? v : []; };
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);
const clip = (s, n = 200) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

function skillsAll() {
  let dirs = [];
  try { dirs = fs.readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return []; }
  return dirs.map((d) => {
    const raw = readText(path.join(SKILLS, d.name, 'SKILL.md'));
    if (!raw) return null;
    const m = /^---\n([\s\S]*?)\n---/.exec(raw.replace(/\r\n/g, '\n'));
    const meta = {};
    if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    return { id: meta.name || d.name, title: meta.title || meta.name || d.name, description: meta.description || '', fileTypes: (meta.extensions || '').split(',').map((x) => x.trim()).filter(Boolean) };
  }).filter(Boolean);
}
function readText(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }

/** Usage from saved chats: when each agent and prompt was last used, and how often. Read once per call. */
function usage() {
  const agents = {}, prompts = {};
  const bump = (map, key, at) => { if (!key) return; const u = map[key] || (map[key] = { uses: 0, lastUsed: 0 }); u.uses++; u.lastUsed = Math.max(u.lastUsed, at || 0); };
  let files = [];
  try { files = fs.readdirSync(path.join(DATA, 'conversations')).filter((f) => f.endsWith('.json')); } catch {}
  for (const f of files) {
    const c = readJson(path.join(DATA, 'conversations', f), null);
    if (!c) continue;
    bump(agents, c.assistantId || 'lumen', c.updatedAt || c.createdAt);
    for (const m of c.messages || []) if (m.role === 'user' && m.recipeId) bump(prompts, m.recipeId, m.createdAt);
  }
  return { agents, prompts };
}

// Simple relevance: every word of the query must appear somewhere in the item's text; names count more.
function matches(query, name, text) {
  const words = String(query || '').toLowerCase().split(/[^a-z0-9]+/i).filter((w) => w.length > 1);
  if (!words.length) return 1;
  const n = String(name || '').toLowerCase(), t = String(text || '').toLowerCase();
  let score = 0;
  for (const w of words) { if (n.includes(w)) score += 3; else if (t.includes(w)) score += 1; else return 0; }
  return score;
}
function filterSort(items, query, limit = 50) {
  return items.map((x) => ({ x, s: matches(query, x.name, x._text) })).filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s).slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200))
    .map(({ x }) => { const { _text, ...rest } = x; return rest; });
}

function agentRows() {
  const prompts = list('recipes'), u = usage().agents;
  return list('assistants').map((a) => ({
    kind: 'agent', id: a.id, name: a.name, emoji: a.emoji, tagline: a.tagline || '', builtIn: !!a.builtin,
    skills: a.skills || [], prompts: prompts.filter((r) => (r.assistantId || 'lumen') === a.id).map((r) => r.name),
    chats: u[a.id]?.uses || 0, lastUsed: day(u[a.id]?.lastUsed),
    _text: [a.tagline, a.instructions, (a.skills || []).join(' '), (a.starters || []).join(' ')].join(' '),
  }));
}
function promptRows() {
  const agents = list('assistants'), u = usage().prompts;
  const quick = list('prompts').map((p) => ({
    kind: 'prompt', type: 'quick prompt', id: p.id, name: p.title, topic: p.topic || '', builtIn: !!p.builtin,
    agent: agents.find((a) => a.id === (p.agentId || 'lumen'))?.name || p.agentId || 'Lumen', text: p.text,
    blanks: (String(p.text || '').match(/\[[^[\]\n]{1,80}\]/g) || []), _text: [p.topic, p.group, p.text].join(' '),
  }));
  return [...list('recipes').map((r) => ({
    kind: 'prompt', type: 'guided task', id: r.id, name: r.name, emoji: r.emoji, category: r.category || '', description: r.description || '', builtIn: !!r.builtin,
    agent: agents.find((a) => a.id === (r.assistantId || 'lumen'))?.name || r.assistantId || 'Lumen', access: r.access || '',
    asks: (r.fields || []).map((f) => f.label), uses: u[r.id]?.uses || 0, lastUsed: day(u[r.id]?.lastUsed),
    _text: [r.category, r.description, r.template, (r.fields || []).map((f) => f.label).join(' ')].join(' '),
  })), ...quick];
}
function workflowRows() {
  const agents = list('assistants');
  return list('pipelines').map((p) => ({
    kind: 'workflow', id: p.id, name: p.name, emoji: p.emoji, builtIn: !!p.builtin,
    stages: (p.stages || []).map((s) => ({ name: s.name, agent: agents.find((a) => a.id === s.assistantId)?.name || s.assistantId, output: s.output })),
    _text: (p.stages || []).map((s) => `${s.name} ${s.prompt || ''} ${s.assistantId || ''}`).join(' '),
  }));
}
function scheduleRows() {
  const prompts = list('recipes');
  return list('schedules').map((s) => ({
    kind: 'schedule', id: s.id, name: s.name || prompts.find((r) => r.id === s.recipeId)?.name || s.recipeId,
    prompt: prompts.find((r) => r.id === s.recipeId)?.name || s.recipeId, when: s.when, paused: !!s.paused,
    folder: s.workspace, lastRun: day(s.lastRunAt), lastStatus: s.lastStatus || '',
    _text: `${s.recipeId} ${JSON.stringify(s.when || {})}`,
  }));
}
function skillRows() {
  const agents = list('assistants');
  return skillsAll().map((s) => ({ kind: 'skill', id: s.id, name: s.title, description: s.description, opensFileTypes: s.fileTypes,
    usedBy: agents.filter((a) => (a.skills || []).includes(s.id)).map((a) => a.name), _text: `${s.id} ${s.description}` }));
}

function intents() {
  let files = [];
  try { files = fs.readdirSync(INTENTS).filter((f) => /^\d+.*\.md$/.test(f)); } catch {}
  return files.map((f) => { const text = readText(path.join(INTENTS, f)); return { file: f, title: (/^#\s+(.+)$/m.exec(text) || [])[1] || f, text }; });
}
// Only the user-facing parts of a guide; the Source section points at code and isn't useful to business users.
const userPart = (text) => text.split(/^##\s+Source\b/im)[0].trim();

const queryProp = { query: { type: 'string', description: 'Optional words to filter by, e.g. "excel", "status report", "RAID".' }, limit: { type: 'number', description: 'Most results to return (default 50).' } };
const TOOLS = [
  { name: 'lumen_overview', description: 'Counts of agents, prompts, workflows, schedules and skills in this Lumen, plus the most and least used agents and prompts. Start here for broad questions.',
    inputSchema: { type: 'object', properties: {} },
    run() {
      const a = agentRows(), all = promptRows(), p = all.filter((x) => x.type === 'guided task'), q = all.filter((x) => x.type === 'quick prompt');
      const top = (rows, key) => rows.filter((r) => r[key]).sort((x, y) => y[key] - x[key]).slice(0, 5).map((r) => `${r.name} (${r[key]})`);
      // "prompts" counts guided tasks (they have usage); quick prompts are counted on their own.
      return { agents: a.length, customAgents: a.filter((x) => !x.builtIn).length, prompts: p.length, customPrompts: p.filter((x) => !x.builtIn).length,
        quickPrompts: q.length, savedQuickPrompts: q.filter((x) => !x.builtIn).length,
        workflows: workflowRows().length, schedules: scheduleRows().length, skills: skillRows().length,
        mostUsedAgents: top(a, 'chats'), mostUsedPrompts: top(p, 'uses'), neverUsedPrompts: p.filter((x) => !x.uses).length,
        promptCategories: [...new Set(p.map((x) => x.category).filter(Boolean))] };
    } },
  { name: 'lumen_list_agents', description: 'List agents with their skills, linked prompts, number of chats and last use. Filter with query.',
    inputSchema: { type: 'object', properties: { ...queryProp, skill: { type: 'string', description: 'Only agents that use this skill id.' } } },
    run: ({ query, limit, skill }) => filterSort(agentRows().filter((a) => !skill || a.skills.includes(skill)), query, limit) },
  { name: 'lumen_list_prompts', description: 'List prompts. type "guided task": a form (category, agent, the inputs it asks for, use count, last use), found under Tasks. type "quick prompt": one line of text with [blanks], found under Prompts and the tabs under the home message box. Filter with query.',
    inputSchema: { type: 'object', properties: { ...queryProp, agent: { type: 'string', description: 'Only prompts run by this agent id or name.' } } },
    run: ({ query, limit, agent }) => filterSort(promptRows().filter((r) => !agent || r.agent.toLowerCase() === String(agent).toLowerCase() || [...list('recipes'), ...list('prompts')].find((x) => x.id === r.id && (x.assistantId || x.agentId) === agent)), query, limit) },
  { name: 'lumen_list_workflows', description: 'List guided workflows (staged lifecycle runs) with their stages and the agent for each stage.',
    inputSchema: { type: 'object', properties: queryProp }, run: ({ query, limit }) => filterSort(workflowRows(), query, limit) },
  { name: 'lumen_list_schedules', description: 'List scheduled prompts: what runs, how often, whether paused, and the last run result.',
    inputSchema: { type: 'object', properties: queryProp }, run: ({ query, limit }) => filterSort(scheduleRows(), query, limit) },
  { name: 'lumen_list_skills', description: 'List skills (capability packs such as Excel, MS Project, Azure DevOps): what each does, which file types switch it on, and which agents use it.',
    inputSchema: { type: 'object', properties: queryProp }, run: ({ query, limit }) => filterSort(skillRows(), query, limit) },
  { name: 'lumen_get_item', description: 'Full details of one agent, prompt, workflow or schedule, including agent instructions and prompt wording.',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['agent', 'prompt', 'workflow', 'schedule'] }, id: { type: 'string', description: 'The id or exact name.' } }, required: ['kind', 'id'] },
    run({ kind, id }) {
      const file = { agent: 'assistants', prompt: 'recipes', workflow: 'pipelines', schedule: 'schedules' }[kind];
      if (!file) throw friendly('kind must be agent, prompt, workflow or schedule.');
      const want = String(id || '').toLowerCase();
      const pool = kind === 'prompt' ? [...list('recipes'), ...list('prompts')] : list(file);
      const item = pool.find((x) => String(x.id).toLowerCase() === want || String(x.name || x.title || '').toLowerCase() === want);
      if (!item) throw friendly(`No ${kind} called "${id}". Use lumen_list_${kind}s to find it.`);
      return item;
    } },
  { name: 'lumen_how_to', description: 'Search Lumen\'s how-to guides (what each feature does and how to use it). Returns the best matching guides.',
    inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'What the user wants to do, e.g. "schedule a prompt", "export to Copilot".' } }, required: ['topic'] },
    run({ topic }) {
      const hits = intents().map((g) => ({ g, s: matches(topic, g.title, g.text) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
      if (!hits.length) {
        // Fall back to any-word matching so loose phrasing still finds something.
        const words = String(topic || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
        const loose = intents().map((g) => ({ g, s: words.filter((w) => g.text.toLowerCase().includes(w)).length })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
        if (!loose.length) return { guides: [], note: 'No guide matches. Try different words, or use lumen_overview.' };
        hits.push(...loose);
      }
      return { guides: hits.slice(0, 3).map(({ g }, i) => ({ guide: g.title, file: g.file, ...(i === 0 ? { content: clip(userPart(g.text), 6000) } : { summary: clip(userPart(g.text).replace(/^#.*$/m, ''), 300) }) })) };
    } },
];

if (require.main === module) {
  serve({ name: 'lumen', instructions: 'Read-only facts about this Lumen install: its agents, prompts, workflows, schedules, skills and how-to guides.', tools: TOOLS });
}

module.exports = { TOOLS };
