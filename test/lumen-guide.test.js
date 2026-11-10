// The always-on "Ask about Lumen" skill: read-only tools over agents, prompts, workflows, schedules, skills and guides.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-guide-'));
const w = (f, v) => { fs.mkdirSync(path.dirname(path.join(DATA, f)), { recursive: true }); fs.writeFileSync(path.join(DATA, f), JSON.stringify(v)); };
w('assistants.json', [
  { id: 'lumen', name: 'Lumen', emoji: '✨', instructions: 'General helper', skills: [] },
  { id: 'sched', name: 'Schedule Analyst', emoji: '📅', tagline: 'Reads MS Project plans', instructions: 'You analyse plans.', skills: ['ms-project', 'excel'], builtin: true },
  { id: 'raid', name: 'RAID Keeper', emoji: '🛡️', instructions: 'You maintain RAID logs.', skills: ['huddle-raid'] },
]);
w('recipes.json', [
  { id: 'health', name: 'Project health check', category: 'Project plans', description: 'RAG status from your plan', assistantId: 'sched', template: 'Check {{plan}}', fields: [{ key: 'plan', label: 'Project plan' }], builtin: true },
  { id: 'huddle', name: 'Huddle to RAID', category: 'RAID', description: 'Turn notes into RAID items', assistantId: 'raid', template: 'x' },
]);
w('pipelines.json', [{ id: 'aidlc', name: 'Requirements to stories', stages: [{ id: 'r', name: 'Refine', assistantId: 'raid', output: '01.md', prompt: 'refine' }] }]);
w('schedules.json', [{ id: 's1', recipeId: 'health', when: { kind: 'weekly', time: '09:00' }, lastRunAt: Date.parse('2026-11-02'), lastStatus: 'ok' }]);
w('conversations/c1.json', { id: 'c1', assistantId: 'sched', updatedAt: Date.parse('2026-11-01'), messages: [{ role: 'user', recipeId: 'health', createdAt: Date.parse('2026-11-01') }] });
w('conversations/c2.json', { id: 'c2', assistantId: 'sched', updatedAt: Date.parse('2026-11-05'), messages: [{ role: 'user', recipeId: 'health', createdAt: Date.parse('2026-11-05') }] });
process.env.LUMEN_DATA = DATA;

const { TOOLS } = require('../tools/lumen-mcp');
const call = (name, args = {}) => TOOLS.find((t) => t.name === name).run(args);

test('overview counts items and usage', () => {
  const o = call('lumen_overview');
  assert.equal(o.agents, 3); assert.equal(o.prompts, 2); assert.equal(o.workflows, 1); assert.equal(o.schedules, 1);
  assert.deepEqual(o.mostUsedAgents, ['Schedule Analyst (2)']);
  assert.equal(o.neverUsedPrompts, 1);
  assert.ok(o.skills > 5, 'reads the shipped skills');
});

test('agents filter by query and skill, with linked prompts and last use', () => {
  const [a] = call('lumen_list_agents', { query: 'project plans' });
  assert.equal(a.id, 'sched'); assert.deepEqual(a.prompts, ['Project health check']); assert.equal(a.chats, 2); assert.equal(a.lastUsed, '2026-11-05');
  assert.deepEqual(call('lumen_list_agents', { skill: 'huddle-raid' }).map((x) => x.id), ['raid']);
  assert.ok(!('_text' in a));
});

test('prompts, workflows, schedules and skills', () => {
  assert.deepEqual(call('lumen_list_prompts', { query: 'raid' }).map((x) => x.id), ['huddle']);
  assert.deepEqual(call('lumen_list_prompts', { agent: 'Schedule Analyst' }).map((x) => x.id), ['health']);
  assert.equal(call('lumen_list_prompts', { query: 'health' })[0].uses, 2);
  assert.equal(call('lumen_list_workflows')[0].stages[0].agent, 'RAID Keeper');
  const [s] = call('lumen_list_schedules');
  assert.equal(s.prompt, 'Project health check'); assert.equal(s.lastRun, '2026-11-02');
  const excel = call('lumen_list_skills', { query: 'excel' }).find((x) => x.id === 'excel');
  assert.deepEqual(excel.usedBy, ['Schedule Analyst']);
});

test('get_item by id or name; friendly error when missing', () => {
  assert.equal(call('lumen_get_item', { kind: 'agent', id: 'raid keeper' }).instructions, 'You maintain RAID logs.');
  assert.throws(() => call('lumen_get_item', { kind: 'prompt', id: 'nope' }), (e) => e.friendly && /No prompt/.test(e.message));
});

test('how_to finds a guide without its Source section', () => {
  const r = call('lumen_how_to', { topic: 'schedule prompts' });
  assert.match(r.guides[0].file, /schedule/);
  assert.doesNotMatch(r.guides[0].content, /^##\s+Source/m);
});

test('the guide is wired into every chat, including "Just chat"', () => {
  const skills = require('../lib/skills');
  const guide = skills.resolve([skills.GUIDE]);
  const chat = skills.toolConfig(guide, 'chat', '/w', { dataDir: DATA });
  assert.deepEqual(Object.keys(chat.servers), ['lumen']);
  assert.equal(chat.servers.lumen.env.LUMEN_DATA, DATA);
  assert.ok(chat.allow.every((t) => t.server === 'lumen' && /^lumen_/.test(t.tool)));
  const mixed = skills.toolConfig(skills.resolve(['excel', skills.GUIDE]), 'chat', '/w', { dataDir: DATA });
  assert.deepEqual(Object.keys(mixed.servers), ['lumen'], 'file tools stay off in Just chat');
  assert.equal(skills.promptFor(guide, 'chat').includes('turned file access off'), false);
  const { lumenLabel } = require('../lib/tool-labels');
  assert.match(lumenLabel('lumen_list_prompts', { query: 'raid' }).label, /prompts matching/);
});

test('MCP server answers over stdio', () => {
  const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'lumen_list_agents', arguments: { query: 'raid' } } }].map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'lumen-mcp.js')], { input, env: { ...process.env, LUMEN_DATA: DATA }, encoding: 'utf8' });
  const [list, called] = r.stdout.trim().split('\n').map((l) => JSON.parse(l)).sort((a, b) => a.id - b.id);
  assert.equal(list.result.tools.length, 8);
  assert.match(called.result.content[0].text, /RAID Keeper/);
});
