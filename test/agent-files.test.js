// Agents live one-per-file in data/agents/<id>.json; an older data/assistants.json is split once.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const run = (data, code) => {
  const r = spawnSync(process.execPath, ['-e', code], { cwd: path.join(__dirname, '..'), env: { ...process.env, LUMEN_DATA: data }, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-agents-'));
const defaults = require('../defaults/assistants.json');

test('fresh install writes one file per built-in agent, in default order', () => {
  const d = tmp();
  const ids = JSON.parse(run(d, "console.log(JSON.stringify(require('./lib/store').assistants.all().map(a=>a.id)))"));
  assert.deepStrictEqual(ids, defaults.map((a) => a.id));
  assert.strictEqual(fs.readdirSync(path.join(d, 'agents')).length, defaults.length);
  assert.ok(fs.existsSync(path.join(d, 'agents', 'lumen.json')));
  assert.ok(!fs.existsSync(path.join(d, 'assistants.json')));
});

test('legacy assistants.json is split into files and kept as .bak', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'assistants.json'), JSON.stringify([{ id: 'mine', name: 'Mine', instructions: 'x', skills: [] }, { ...defaults[0], name: 'Renamed' }]));
  const out = JSON.parse(run(d, "const s=require('./lib/store').assistants;console.log(JSON.stringify([s.get('mine'),s.get('lumen').name]))"));
  assert.strictEqual(out[0].name, 'Mine');
  assert.strictEqual(out[1], 'Renamed');
  assert.ok(fs.existsSync(path.join(d, 'agents', 'mine.json')));
  assert.ok(fs.existsSync(path.join(d, 'assistants.json.bak')));
  assert.ok(!fs.existsSync(path.join(d, 'assistants.json')));
});

test('upsert, remove and reset behave like the other collections', () => {
  const d = tmp();
  const out = JSON.parse(run(d, `
    const s = require('./lib/store').assistants;
    const a = s.upsert({ name: 'Custom', instructions: 'hi' });
    s.upsert({ id: a.id, tagline: 'tag' });
    const merged = s.get(a.id);
    s.remove('lumen');
    const afterRemove = s.all().some((x) => x.id === 'lumen');
    s.remove(a.id);
    s.reset();
    console.log(JSON.stringify({ merged, afterRemove, back: !!s.get('lumen'), gone: !s.get(a.id) }));
  `));
  assert.strictEqual(out.merged.name, 'Custom');
  assert.strictEqual(out.merged.tagline, 'tag');
  assert.strictEqual(out.afterRemove, false);
  assert.ok(out.back && out.gone);
});

test('a built-in the user deleted is not re-added on restart', () => {
  const d = tmp();
  run(d, "require('./lib/store').assistants.remove('lumen')");
  const has = run(d, "console.log(require('./lib/store').assistants.all().some(a=>a.id==='lumen'))");
  assert.strictEqual(has, 'false');
});
