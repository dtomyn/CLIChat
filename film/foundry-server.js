// Lumen, set up for filming the IRCC Foundry agents explainer (film/make_foundry.js). 127.0.0.1 only, throw-away data.
//   node film/foundry-server.js record   real hosted agents in Microsoft Foundry (your az login); every reply is saved
//   node film/foundry-server.js film     replays the saved replies (no Azure), with a short "thinking" delay
// The Foundry project address comes from FOUNDRY_PROJECT_ENDPOINT (shown in Settings in the film).
const fs = require('fs');
const path = require('path');

const MODE = process.argv[2] === 'record' ? 'record' : 'film';
const FILM = __dirname;
const WORK = path.join(FILM, '.work-foundry');
const DATA = path.join(WORK, 'data');
const PROJECT = path.join(WORK, 'IRCC CMP Release 2');
const REC = path.join(FILM, 'recordings', 'foundry', 'recording.json');
const INPUTS = path.join(FILM, 'foundry-inputs');
const ENDPOINT = process.env.FOUNDRY_PROJECT_ENDPOINT || 'https://darektomyn-2719-resource.services.ai.azure.com/api/projects/darektomyn-2719';

fs.rmSync(DATA, { recursive: true, force: true });
fs.rmSync(PROJECT, { recursive: true, force: true });
fs.mkdirSync(PROJECT, { recursive: true });
for (const f of fs.readdirSync(INPUTS)) fs.copyFileSync(path.join(INPUTS, f), path.join(PROJECT, f));
process.env.LUMEN_DATA = DATA;
process.env.PORT = process.env.PORT || '4395';

const store = require('../lib/store');
store.settings.set({ workspace: PROJECT, providerId: 'film', access: 'read', onboarded: true, userName: 'Amira', foundry: { endpoint: ENDPOINT } });

// A quiet engine for everyday chats (the film only uses the IRCC agents).
const registry = require('../providers');
registry.providers.film = {
  id: 'film', name: 'Claude Code', vendor: 'Anthropic', description: 'Everyday chats', models: [], supportsResume: false, agentOnly: true, // hidden: the real engines are listed
  async detect() { return { available: true, version: 'installed' }; },
  async run(_o, emit) { emit({ type: 'text', text: 'Hello!' }); },
  async complete() { return 'Chat'; },
};

const client = require('../lib/foundry/client');
const auth = require('../lib/foundry/auth');
const db = fs.existsSync(REC) ? JSON.parse(fs.readFileSync(REC, 'utf8')) : { calls: {} };
const counters = {};
const keyFor = (url) => {
  const agent = /\/agents\/([^/]+)\//.exec(url)?.[1] || 'unknown';
  counters[agent] = (counters[agent] || 0) + 1;
  return `${agent}#${counters[agent]}`;
};
const shrink = (body) => JSON.parse(JSON.stringify(body, (k, v) => (typeof v === 'string' && v.length > 400 ? `${v.slice(0, 120)}…(${v.length} chars)` : v)));

if (MODE === 'record') {
  const real = (...a) => fetch(...a);
  client._setFetch(async (url, init) => {
    const key = keyFor(url);
    const t0 = Date.now();
    const res = await real(url, init);
    const text = await res.text();
    db.calls[key] = { request: shrink(JSON.parse(init.body)), status: res.status, text, sessionId: res.headers.get('x-agent-session-id'), seconds: (Date.now() - t0) / 1000 };
    fs.mkdirSync(path.dirname(REC), { recursive: true });
    fs.writeFileSync(REC, JSON.stringify(db, null, 1));
    console.log(`recorded ${key} status=${res.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    return { status: res.status, text: async () => text, headers: { get: (h) => res.headers.get(h) } };
  });
} else {
  auth._setTokenSource(async () => ({ token: 'film', expiresAt: Date.now() + 3600_000 }));
  client._setFetch(async (url) => {
    const key = keyFor(url);
    const hit = db.calls[key];
    if (!hit) throw new Error(`no recording for ${key}`);
    await new Promise((s) => setTimeout(s, Number(process.env.FILM_THINK_MS || 4500)));
    return { status: hit.status, text: async () => hit.text, headers: { get: (h) => (h.toLowerCase() === 'x-agent-session-id' ? hit.sessionId : null) } };
  });
}

require('../server');
console.log(`film server (${MODE}) on 127.0.0.1:${process.env.PORT}`);
