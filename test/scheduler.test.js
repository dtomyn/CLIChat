const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-scheduler-'));
process.env.LUMEN_DATA = path.join(temp, 'data');
const store = require('../lib/store');
const { nextDue, start } = require('../lib/scheduler');
const workspace = path.join(temp, 'project');
fs.mkdirSync(workspace);
const source = path.join(workspace, 'plan.xml');
fs.writeFileSync(source, 'plan');

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('nextDue handles weekdays, month ends and local daylight saving time', () => {
  const weekly = { when: { kind: 'weekly', days: [1, 5], time: '09:00' } };
  assert.equal(nextDue(weekly, new Date(2026, 10, 2, 9)).getDay(), 5);
  const monthly = { when: { kind: 'monthly', day: 31, time: '09:00' } };
  const next = nextDue(monthly, new Date(2026, 0, 31, 9));
  assert.equal(next.getMonth(), 2); assert.equal(next.getDate(), 31);
  const script = `const {nextDue}=require(${JSON.stringify(path.join(__dirname, '..', 'lib', 'scheduler'))});
    const daily={when:{kind:'daily',time:'02:30'}};
    const spring=nextDue(daily,new Date(2026,2,7,3));
    if(spring.getDate()!==8||spring.getHours()!==3||spring.getMinutes()!==30) process.exit(1);
    const fall={when:{kind:'daily',time:'01:30'}};
    const repeated=nextDue(fall,new Date('2026-11-01T01:45:00-04:00'));
    if(repeated.getDate()!==2||repeated.getHours()!==1) process.exit(2);`;
  execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: 'America/New_York' } });
  assert.throws(() => nextDue({ when: { kind: 'weekly', days: [], time: '09:00' } }, new Date()), /day/);
});

test('catch-up, serialization, access, missing files, pause and manual runs', async () => {
  let clock = new Date(2026, 10, 4, 12).getTime();
  const recipe = store.recipes.upsert({ name: 'Scheduled test', assistantId: 'lumen', access: 'read', fields: [{ key: 'plan', label: 'Plan', type: 'file' }], template: 'Review {{plan}}' });
  const make = (extra = {}) => {
    const s = store.schedules.upsert({ recipeId: recipe.id, values: { plan: source }, workspace, when: { kind: 'daily', time: '09:00' }, enabled: true, allowEdit: false, ...extra });
    return store.schedules.upsert({ id: s.id, createdAt: new Date(2026, 10, 1, 8).getTime() });
  };
  const a = make(), b = make(), paused = make({ enabled: false });
  let active = 0, maxActive = 0;
  const calls = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const runner = start({
    store, now: () => clock, workspaceFile: (p) => fs.existsSync(p),
    runTurn: async (body) => {
      active++; maxActive = Math.max(maxActive, active); calls.push(body);
      if (calls.length === 1) await blocked;
      active--; return { message: {} };
    },
  });
  const wait = async (predicate) => {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 5)); }
    throw new Error('Timed out waiting for scheduler');
  };
  try {
    await wait(() => calls.length === 1);
    runner.tick(); assert.equal(runner.runNow(a.id), false);
    release();
    await wait(() => store.schedules.get(b.id).lastStatus === 'late');
    assert.equal(maxActive, 1); assert.equal(calls.length, 2);
    assert.equal(store.schedules.get(a.id).lastStatus, 'late');
    assert.equal(store.schedules.get(paused.id).lastStatus, undefined);
    const chat = store.conversations.get(store.schedules.get(a.id).lastConversationId);
    assert.equal(chat.unread, true); assert.equal(chat.access, 'read');
    assert.equal(chat.scheduled.scheduleId, a.id);
    assert.equal(calls[0].message, 'Review "plan.xml"');
    runner.tick(); await new Promise((resolve) => setTimeout(resolve, 20)); assert.equal(calls.length, 2);
    assert.equal(runner.runNow(paused.id), true);
    await wait(() => store.schedules.get(paused.id).lastStatus === 'ok');
    assert.equal(calls.length, 3);
    fs.unlinkSync(source);
    clock += 86400000;
    runner.tick();
    await wait(() => store.schedules.get(a.id).lastStatus === 'error');
    assert.match(store.schedules.get(a.id).lastError, /Source file.*missing/);
    assert.equal(store.schedules.get(a.id).lastConversationId, null);
    assert.equal(calls.length, 3);
    await wait(() => !runner.isPending(a.id) && !runner.isPending(b.id));
    fs.writeFileSync(source, 'plan');
    store.recipes.upsert({ id: recipe.id, access: 'edit' });
    assert.equal(runner.runNow(a.id), true);
    await wait(() => store.schedules.get(a.id).lastError.includes('permission to save files'));
    assert.equal(calls.length, 3);
  } finally { runner.stop(); release(); }
});

test('a live weekly slot runs once at its due time and is not repeated on restart', async () => {
  const recipe = store.recipes.upsert({ name: 'Weekly', access: 'chat', fields: [], template: 'Check' });
  let clock = new Date(2026, 10, 2, 8, 58).getTime();
  const item = store.schedules.upsert({ recipeId: recipe.id, values: {}, workspace, when: { kind: 'weekly', days: [1], time: '09:00' }, enabled: true, allowEdit: false });
  store.schedules.upsert({ id: item.id, createdAt: clock });
  // Isolate this check from the schedules used by the earlier test.
  for (const s of store.schedules.all()) if (s.id !== item.id) store.schedules.upsert({ id: s.id, enabled: false });
  let calls = 0;
  const options = { store, now: () => clock, workspaceFile: () => true, runTurn: async () => { calls++; return { message: {} }; } };
  let runner = start(options);
  try {
    runner.tick(); await new Promise((resolve) => setTimeout(resolve, 10)); assert.equal(calls, 0);
    clock += 120000;
    runner.tick();
    for (let i = 0; i < 100 && runner.isPending(item.id); i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(calls, 1); assert.equal(store.schedules.get(item.id).lastStatus, 'ok');
    runner.tick(); await new Promise((resolve) => setTimeout(resolve, 10)); assert.equal(calls, 1);
    runner.stop(); runner = start(options);
    await new Promise((resolve) => setTimeout(resolve, 10)); assert.equal(calls, 1);
  } finally { runner.stop(); }
});
