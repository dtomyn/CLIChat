// Tiny JSON-file storage. Everything lives in one data folder so it is easy to back up or reset.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = process.env.LUMEN_DATA || path.join(__dirname, '..', 'data');
const CONV_DIR = path.join(DATA, 'conversations');
fs.mkdirSync(CONV_DIR, { recursive: true });

const DEFAULTS = path.join(__dirname, '..', 'defaults');

const id = () => crypto.randomUUID();

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

// Collections seeded from defaults/ on first run (assistants, recipes).
function collection(name) {
  const file = path.join(DATA, `${name}.json`);
  const removedFile = path.join(DATA, `${name}.removed.json`);
  const defaults = readJson(path.join(DEFAULTS, `${name}.json`), []);
  if (!fs.existsSync(file)) writeJson(file, defaults);
  else { // pick up built-ins added in newer versions (unless the user deleted them)
    const items = readJson(file, []);
    const removed = new Set(readJson(removedFile, []));
    const have = new Set(items.map((x) => x.id));
    const missing = defaults.filter((d) => !have.has(d.id) && !removed.has(d.id));
    if (missing.length) writeJson(file, [...items, ...missing]);
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
    reset() { writeJson(file, defaults); writeJson(removedFile, []); },
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
      return { id: c.id, title: c.title, assistantId: c.assistantId, pinned: !!c.pinned, updatedAt: c.updatedAt, preview: last ? String(last.content).slice(0, 120) : '' };
    }).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get: (cid) => readJson(path.join(CONV_DIR, `${safeId(cid)}.json`), null),
  save(c) { c.updatedAt = Date.now(); writeJson(path.join(CONV_DIR, `${safeId(c.id)}.json`), c); return c; },
  create(fields) { return conversations.save({ id: id(), title: 'New chat', messages: [], sessions: {}, createdAt: Date.now(), ...fields }); },
  remove(cid) { fs.rmSync(path.join(CONV_DIR, `${safeId(cid)}.json`), { force: true }); },
};

module.exports = { DATA, id, assistants: collection('assistants'), recipes: collection('recipes'), settings, conversations };
