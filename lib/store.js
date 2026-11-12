// Tiny JSON-file storage. Everything lives in one data folder so it is easy to back up or reset.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { migratePipelines } = require('./pipeline-migrate');
const builtinAgents = require('./builtin-agents');

const DATA = process.env.LUMEN_DATA || path.join(__dirname, '..', 'data');
const CONV_DIR = path.join(DATA, 'conversations');
const RUN_DIR = path.join(DATA, 'runs');
fs.mkdirSync(CONV_DIR, { recursive: true });
fs.mkdirSync(RUN_DIR, { recursive: true });

const DEFAULTS = path.join(__dirname, '..', 'defaults');

const id = () => crypto.randomUUID();

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
let tmpSeq = 0;
function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.${++tmpSeq}.tmp`;
  const text = JSON.stringify(value, null, 2);
  fs.writeFileSync(tmp, text);
  // On Windows the rename fails with EPERM/EBUSY/EACCES while another handle (a concurrent read, antivirus, the
  // search indexer) has the target open. Those locks usually clear in milliseconds, so retry briefly; if the file
  // stays busy, write it in place instead (allowed while others are reading it), so a save never fails just
  // because something was looking at the file.
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, file); return; }
    catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { fs.rmSync(tmp, { force: true }); throw e; }
      if (attempt >= 8) {
        try { fs.writeFileSync(file, text); } finally { fs.rmSync(tmp, { force: true }); }
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 + attempt * 5);
    }
  }
}

// Collections seeded from defaults/ on first run (assistants, recipes = guided tasks, prompts = quick prompts).
// migrate(items, defaults) -> { items, changed } updates saved built-ins in place when a newer version
// adds to them (used for lifecycle pipeline stages, see lib/pipeline-migrate.js).
function collection(name, { migrate } = {}) {
  const file = path.join(DATA, `${name}.json`);
  const removedFile = path.join(DATA, `${name}.removed.json`);
  const defaults = readJson(path.join(DEFAULTS, `${name}.json`), []);
  const migrated = (items) => { const r = migrate ? migrate(items, defaults) : null; return r && r.changed ? r.items : null; };
  if (!fs.existsSync(file)) writeJson(file, migrated(defaults) || defaults);
  else { // pick up built-ins added in newer versions (unless the user deleted them)
    const items = readJson(file, []);
    const removed = new Set(readJson(removedFile, []));
    const have = new Set(items.map((x) => x.id));
    const missing = defaults.filter((d) => !have.has(d.id) && !removed.has(d.id));
    const next = [...items, ...missing];
    const updated = migrated(next);
    if (missing.length || updated) writeJson(file, updated || next);
  }
  return {
    all: () => readJson(file, []),
    get: (itemId) => readJson(file, []).find((x) => x.id === itemId),
    upsert(item) {
      const items = readJson(file, []);
      if (!item.id) item.id = id();
      const i = items.findIndex((x) => x.id === item.id);
      if (i >= 0) items[i] = { ...items[i], ...item, updatedAt: Date.now() };
      else items.push({ ...item, createdAt: Date.now(), updatedAt: Date.now() });
      writeJson(file, items);
      return items.find((x) => x.id === item.id);
    },
    remove(itemId) {
      writeJson(file, readJson(file, []).filter((x) => x.id !== itemId));
      if (defaults.some((d) => d.id === itemId)) writeJson(removedFile, [...new Set([...readJson(removedFile, []), itemId])]);
    },
    reset() { writeJson(file, migrated(defaults) || defaults); writeJson(removedFile, []); },
  };
}

// One JSON file per item in data/<dir>/<id>.json (agents). Same API as collection(). Seeded from
// the built-in `defaults` (agents/ in the repo); an older single-file data/<legacyName>.json is split into the folder once
// and kept as <legacyName>.json.bak. Items come back in default order, then custom ones by creation time.
function folderCollection(dir, legacyName, defaults) {
  const folder = path.join(DATA, dir);
  const legacyFile = path.join(DATA, `${legacyName}.json`);
  const removedFile = path.join(DATA, `${legacyName}.removed.json`);
  const rank = new Map(defaults.map((d, i) => [d.id, i]));
  const fileOf = (itemId) => path.join(folder, `${safeId(itemId)}.json`);
  const load = () => {
    let names = [];
    try { names = fs.readdirSync(folder).filter((f) => f.endsWith('.json')); } catch { /* folder missing */ }
    return names.map((f) => readJson(path.join(folder, f), null)).filter((x) => x && x.id)
      .sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e9) - (rank.has(b.id) ? rank.get(b.id) : 1e9) || (a.createdAt || 0) - (b.createdAt || 0));
  };
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    const legacy = fs.existsSync(legacyFile) ? readJson(legacyFile, null) : null;
    for (const item of Array.isArray(legacy) ? legacy : defaults) if (item && item.id) writeJson(fileOf(item.id), item);
    if (Array.isArray(legacy)) fs.renameSync(legacyFile, `${legacyFile}.bak`);
  }
  { // pick up built-ins added in newer versions (unless the user deleted them)
    const have = new Set(load().map((x) => x.id));
    const removed = new Set(readJson(removedFile, []));
    for (const d of defaults) if (!have.has(d.id) && !removed.has(d.id)) writeJson(fileOf(d.id), d);
  }
  return {
    all: load,
    get: (itemId) => readJson(fileOf(itemId), undefined),
    upsert(item) {
      if (!item.id) item.id = id();
      const prev = readJson(fileOf(item.id), null);
      const next = prev ? { ...prev, ...item, updatedAt: Date.now() } : { ...item, createdAt: Date.now(), updatedAt: Date.now() };
      writeJson(fileOf(item.id), next);
      return next;
    },
    remove(itemId) {
      fs.rmSync(fileOf(itemId), { force: true });
      if (defaults.some((d) => d.id === itemId)) writeJson(removedFile, [...new Set([...readJson(removedFile, []), itemId])]);
    },
    reset() {
      for (const x of load()) fs.rmSync(fileOf(x.id), { force: true });
      for (const d of defaults) writeJson(fileOf(d.id), d);
      writeJson(removedFile, []);
    },
  };
}

const settingsFile = path.join(DATA, 'settings.json');
const settings = {
  get: () => ({
    providerId: 'claude-cli',
    model: 'default',
    access: 'read',
    workspace: '',
    userName: '',
    theme: 'system',
    ...readJson(settingsFile, {}),
  }),
  set(patch) { const next = { ...settings.get(), ...patch }; writeJson(settingsFile, next); return next; },
};

const safeId = (s) => String(s).replace(/[^a-zA-Z0-9-]/g, '');
const conversations = {
  list() {
    return fs.readdirSync(CONV_DIR).filter((f) => f.endsWith('.json')).map((f) => {
      const c = readJson(path.join(CONV_DIR, f), null);
      if (!c) return null;
      const last = c.messages[c.messages.length - 1];
      return { id: c.id, title: c.title, assistantId: c.assistantId, pinned: !!c.pinned, scheduled: c.scheduled || null, unread: !!c.unread, updatedAt: c.updatedAt, preview: last ? String(last.content).slice(0, 120) : '' };
    }).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get: (cid) => readJson(path.join(CONV_DIR, `${safeId(cid)}.json`), null),
  save(c) { c.updatedAt = Date.now(); writeJson(path.join(CONV_DIR, `${safeId(c.id)}.json`), c); return c; },
  create(fields) { return conversations.save({ id: id(), title: 'New chat', messages: [], sessions: {}, createdAt: Date.now(), ...fields }); },
  remove(cid) { fs.rmSync(path.join(CONV_DIR, `${safeId(cid)}.json`), { force: true }); },
};

const runs = {
  list() { return fs.readdirSync(RUN_DIR).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(RUN_DIR, f), null)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt); },
  get: (rid) => readJson(path.join(RUN_DIR, `${safeId(rid)}.json`), null),
  save(run) { run.updatedAt = Date.now(); writeJson(path.join(RUN_DIR, `${safeId(run.id)}.json`), run); return run; },
};

module.exports = { DATA, id, assistants: folderCollection('agents', 'assistants', builtinAgents.all()), recipes: collection('recipes'), prompts: collection('prompts'), pipelines: collection('pipelines', { migrate: (items, defaults) => { const r = migratePipelines(items, defaults); return { items: r.pipelines, changed: r.changed }; } }), schedules: collection('schedules'), settings, conversations, runs };
