const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migratePipelines } = require('../lib/pipeline-migrate');

const DEFAULTS = require('../defaults/pipelines.json');
const ids = (p) => p.stages.map((s) => s.id);
// A pipeline saved by a version before the optional "tests" stage, with a stage the user customised.
const legacy = () => [{ ...DEFAULTS[0], stages: DEFAULTS[0].stages.filter((s) => s.id !== 'tests').map((s) => (s.id === 'stories' ? { ...s, name: 'Our stories', prompt: 'Custom prompt' } : { ...s })) }];

test('a saved pipeline from before the tests stage gets it once, after Stories, without touching other stages', () => {
  const saved = legacy();
  const r = migratePipelines(saved, DEFAULTS);
  assert.equal(r.changed, true);
  assert.deepEqual(r.added, [{ pipelineId: 'aidlc', stageId: 'tests' }]);
  const p = r.pipelines[0];
  assert.deepEqual(ids(p), ['refine', 'functional', 'technical', 'stories', 'tests']);
  assert.equal(p.stages.find((s) => s.id === 'tests').optional, true);
  assert.equal(p.stages.find((s) => s.id === 'stories').name, 'Our stories', 'customised stage kept');
  assert.equal(p.stages.find((s) => s.id === 'stories').prompt, 'Custom prompt');
  assert.deepEqual(p.defaultStagesSeen, ids(DEFAULTS[0]));
  assert.deepEqual(ids(saved[0]), ['refine', 'functional', 'technical', 'stories'], 'input not changed');
  // Idempotent: a second pass changes nothing.
  const again = migratePipelines(r.pipelines, DEFAULTS);
  assert.equal(again.changed, false);
  assert.equal(again.pipelines[0], p);
});

test('a stage the user removed is not added back', () => {
  const once = migratePipelines(legacy(), DEFAULTS).pipelines;
  const removed = [{ ...once[0], stages: once[0].stages.filter((s) => s.id !== 'tests') }];
  const r = migratePipelines(removed, DEFAULTS);
  assert.equal(r.changed, false);
  assert.deepEqual(ids(r.pipelines[0]), ['refine', 'functional', 'technical', 'stories']);
  // A first-release stage removed before the record existed stays removed too.
  const old = [{ ...DEFAULTS[0], stages: DEFAULTS[0].stages.filter((s) => !['technical', 'tests'].includes(s.id)) }];
  const r2 = migratePipelines(old, DEFAULTS);
  assert.deepEqual(ids(r2.pipelines[0]), ['refine', 'functional', 'stories', 'tests']);
});

test('only built-in pipelines are touched, and odd data is tolerated', () => {
  const own = { id: 'mine', name: 'Mine', stages: [{ id: 'a' }] };
  const r = migratePipelines([own, { id: 'aidlc' }, null], DEFAULTS);
  assert.equal(r.changed, false);
  assert.equal(r.pipelines[0], own);
  assert.deepEqual(migratePipelines(undefined, DEFAULTS), { pipelines: [], changed: false, added: [] });
  // A new stage goes before the next built-in stage when its predecessors are gone, and a fresh copy is just stamped.
  const r2 = migratePipelines([{ id: 'p', stages: [{ id: 'c' }] }], [{ id: 'p', stages: [{ id: 'b' }, { id: 'c' }] }]);
  assert.deepEqual(ids(r2.pipelines[0]), ['b', 'c']);
  const fresh = migratePipelines(DEFAULTS, DEFAULTS);
  assert.equal(fresh.changed, true);
  assert.deepEqual(fresh.added, []);
  assert.deepEqual(ids(fresh.pipelines[0]), ids(DEFAULTS[0]));
});

test('the store applies the migration to a saved pipelines file on start-up', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-pipelines-'));
  try {
    fs.writeFileSync(path.join(temp, 'pipelines.json'), JSON.stringify(legacy()));
    process.env.LUMEN_DATA = temp;
    const store = require('../lib/store');
    const p = store.pipelines.get('aidlc');
    assert.deepEqual(ids(p), ['refine', 'functional', 'technical', 'stories', 'tests']);
    assert.equal(p.stages.find((s) => s.id === 'stories').name, 'Our stories');
    assert.deepEqual(p.defaultStagesSeen, ids(DEFAULTS[0]));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
