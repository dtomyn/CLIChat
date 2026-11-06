const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const ex = require('../lib/copilot-export');

const skills = [{ id: 'excel', title: 'Excel workbooks', description: 'Read and write workbooks' }];
const agent = {
  id: 'budget-controller', name: 'Budget Controller', emoji: '💰', color: 'green', tagline: 'Keeps the budget honest',
  instructions: 'You are a budget controller.', starters: ['Review the variance. Then flag risks', '', 'Summarise spend'], skills: ['excel'], access: 'edit',
};

test('declarative agent uses Agent Builder fields and drops empty starters', () => {
  const da = ex.declarativeAgent(agent);
  assert.equal(da.name, 'Budget Controller');
  assert.equal(da.description, 'Keeps the budget honest');
  assert.equal(da.instructions, 'You are a budget controller.');
  assert.deepEqual(da.conversation_starters, [
    { title: 'Review the variance', text: 'Review the variance. Then flag risks' },
    { title: 'Summarise spend', text: 'Summarise spend' },
  ]);
  const long = ex.declarativeAgent({ ...agent, instructions: 'x'.repeat(9000) });
  assert.equal(long.instructions.length, 8000);
});

test('app manifest id is stable and short fields fit the limits', () => {
  const a = ex.appManifest(agent), b = ex.appManifest(agent);
  assert.equal(a.id, b.id);
  assert.match(a.id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const longName = ex.appManifest({ ...agent, name: 'A very long agent name that is far too long' });
  assert.ok(longName.name.short.length <= 30);
  assert.deepEqual(a.copilotAgents.declarativeAgents, [{ id: 'declarativeAgent', file: 'declarativeAgent.json' }]);
});

test('Lumen-only features are listed as not carried over', () => {
  assert.deepEqual(ex.lumenOnly(agent, skills), ['Excel workbooks skill (uses Lumen\'s local document tools)', 'Creating and editing files directly in your project folder']);
  assert.match(ex.agentBuilderText(agent, skills), /NOT CARRIED OVER \(Lumen only\)/);
  assert.match(ex.agentBuilderText({ ...agent, skills: [], access: 'read' }, skills), /Nothing: this agent works the same way/);
});

test('exportAgents writes paste-ready text and a valid app package', async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-copilot-'));
  const r = await ex.exportAgents([agent], ws, skills);
  assert.equal(r.folder, path.join(ws, 'Microsoft 365 Copilot'));
  assert.ok(fs.existsSync(path.join(r.folder, 'README.md')));
  const [one] = r.agents;
  assert.equal(fs.readFileSync(one.builder, 'utf8'), one.text);
  const zip = await JSZip.loadAsync(fs.readFileSync(one.package));
  assert.deepEqual(Object.keys(zip.files).sort(), ['color.png', 'declarativeAgent.json', 'manifest.json', 'outline.png']);
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.equal(manifest.icons.color, 'color.png');
  const png = await zip.file('color.png').async('nodebuffer');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 192); // IHDR width
  const outline = await zip.file('outline.png').async('nodebuffer');
  assert.equal(outline.readUInt32BE(16), 32);
});

test('prompts become plain text with [blanks] for each question', () => {
  const recipe = { name: 'Status', template: 'Write a status report for {{project}} using {{plan}}. Unknown: {{nope}}', fields: [{ key: 'project', label: 'Project name' }, { key: 'plan', label: 'Plan [file]', type: 'file' }] };
  assert.equal(ex.promptText(recipe), 'Write a status report for [Project name] using [Plan file]. Unknown: [nope]');
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-copilot-'));
  const r = ex.exportPrompts([{ ...recipe, id: 'r1', category: 'Reports', assistantId: 'budget-controller' }], [agent], ws);
  const md = fs.readFileSync(r.file, 'utf8');
  assert.equal(r.count, 1);
  assert.match(md, /## Reports/);
  assert.match(md, /Use with the \*\*Budget Controller\*\* agent/);
  assert.match(md, /\[Project name\]/);
});
