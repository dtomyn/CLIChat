const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-pipeline-editor-'));
const workspace = path.join(temp, 'workspace');
fs.mkdirSync(workspace);
process.env.LUMEN_DATA = path.join(temp, 'data');
process.env.PORT = '0';
const registry = require('../providers');
const calls = [];
const fake = {
  id: 'fake', models: [], supportsResume: false,
  complete: async () => 'Test chat',
  run: async (opts, emit) => {
    calls.push(opts);
    const output = /Save your final output as a Markdown file at ("(?:[^"\\]|\\.)*")/.exec(opts.prompt);
    if (output) fs.writeFileSync(path.resolve(opts.cwd, JSON.parse(output[1])), '# Test output\n');
    emit({ type: 'text', text: 'Done' });
  },
};
const originalGet = registry.get;
registry.get = (id) => id === 'fake' ? fake : originalGet(id);
const server = require('../server');
const store = require('../lib/store');
let base;

async function request(url, method = 'GET', body) {
  const res = await fetch(base + url, {
    method,
    headers: { Connection: 'close', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: JSON.parse(await res.text()) };
}

async function runState(id, predicate) {
  for (let i = 0; i < 100; i++) {
    const { data } = await request(`/api/runs/${id}`);
    if (predicate(data)) return data;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for run');
}

test.before(async () => {
  if (!server.listening) await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  store.settings.set({ workspace, providerId: 'fake', userName: 'Reviewer' });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
});

test('workflows can be created, customized and removed without changing existing runs', async () => {
  const source = path.join(workspace, 'requirements.md');
  fs.writeFileSync(source, '# Requirements');
  const definition = {
    name: 'Snapshot workflow',
    emoji: '🧪',
    gateCheck: null,
    stages: [
      { id: 'review', name: 'Review requirements', assistantId: 'requirements-refiner', output: '01-review.md', prompt: 'Original snapshot prompt {{sources}}' },
      { id: 'optional', name: 'Optional detail', assistantId: 'requirements-refiner', output: '02-optional.md', prompt: 'Create a detail from {{prev}}', optional: true },
    ],
  };
  const createdPipeline = await request('/api/pipelines', 'POST', definition);
  assert.equal(createdPipeline.status, 200);
  assert.notEqual(createdPipeline.data.id, 'aidlc');
  assert.equal((await request('/api/pipelines', 'POST', { ...definition, stages: [{ ...definition.stages[0], output: '../outside.md' }] })).status, 400);

  const run = await request('/api/runs', 'POST', { pipelineId: createdPipeline.data.id, name: 'Snapshot run', workspace, sources: [source] });
  assert.equal(run.status, 200);
  const changedDefinition = {
    ...definition,
    name: 'Changed workflow',
    stages: definition.stages.map((stage, i) => i ? stage : { ...stage, prompt: 'Changed after run {{sources}}' }),
  };
  assert.equal((await request(`/api/pipelines/${createdPipeline.data.id}`, 'PUT', changedDefinition)).status, 200);

  assert.equal((await request(`/api/runs/${run.data.id}/stages/review/start`, 'POST', {})).status, 200);
  const review = await runState(run.data.id, (r) => r.stages[0].status === 'review');
  assert.equal(review.pipelineDefinition.name, 'Snapshot workflow');
  assert.match(calls.at(-1).prompt, /Original snapshot prompt/);
  assert.equal((await request(`/api/runs/${run.data.id}/stages/review/approve`, 'POST', {})).status, 200);

  assert.equal((await request(`/api/runs/${run.data.id}/stages/optional/skip`, 'POST', {})).data.stages[1].status, 'skipped');
  assert.equal((await request(`/api/runs/${run.data.id}/stages/optional/include`, 'POST', {})).data.stages[1].status, 'pending');
  assert.equal((await request(`/api/pipelines/${createdPipeline.data.id}`, 'DELETE')).status, 200);
  assert.equal((await request(`/api/runs/${run.data.id}`)).data.pipelineDefinition.name, 'Snapshot workflow');
  assert.equal((await request(`/api/runs/${run.data.id}/stages/optional/start`, 'POST', {})).status, 200);
  await runState(run.data.id, (r) => r.stages[1].status === 'review');
});

test('stages can fan out to run side by side and fan back in', async () => {
  const source = path.join(workspace, 'brief.md');
  fs.writeFileSync(source, '# Brief');
  const stage = (id, extra = {}) => ({ id, name: id, assistantId: 'requirements-refiner', output: `${id}.md`, prompt: `Write ${id} from {{prev}} {{sources}}`, ...extra });
  const bad = { name: 'Bad', stages: [stage('a', { after: ['b'] }), stage('b')] };
  assert.equal((await request('/api/pipelines', 'POST', bad)).status, 400);
  const created = await request('/api/pipelines', 'POST', { name: 'Diamond', stages: [stage('a'), stage('b'), stage('c', { after: ['a'] }), stage('d', { after: ['b', 'c'] })] });
  assert.equal(created.status, 200);
  assert.equal(created.data.stages[1].after, undefined);
  assert.deepEqual(created.data.stages[3].after, ['b', 'c']);
  const run = (await request('/api/runs', 'POST', { pipelineId: created.data.id, name: 'Diamond run', workspace, sources: [source] })).data;
  const go = async (id, op) => (await request(`/api/runs/${run.id}/stages/${id}/${op}`, 'POST', {})).status;
  const status = (r, id) => r.stages.find((s) => s.id === id).status;

  assert.equal(await go('a', 'start'), 200);
  await runState(run.id, (r) => status(r, 'a') === 'review');
  assert.equal(await go('a', 'approve'), 200);
  assert.equal(await go('b', 'start'), 200);
  assert.equal(await go('c', 'start'), 200);
  await runState(run.id, (r) => status(r, 'b') === 'review' && status(r, 'c') === 'review');
  assert.equal(await go('d', 'start'), 409);
  assert.equal(await go('b', 'approve'), 200);
  assert.equal(await go('c', 'approve'), 200);
  assert.equal(await go('d', 'start'), 200);
  await runState(run.id, (r) => status(r, 'd') === 'review');
  const prompt = calls.at(-1).prompt;
  assert.match(prompt, /b\.md/);
  assert.match(prompt, /c\.md/);

  // Sending c back reworks d (which uses it) but not b (a sibling branch).
  assert.equal(await go('c', 'rework'), 200);
  const after = (await request(`/api/runs/${run.id}`)).data;
  assert.equal(status(after, 'd'), 'rework');
  assert.equal(status(after, 'b'), 'approved');
});
