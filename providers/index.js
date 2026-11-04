// Provider registry. Every *.js file in this folder (except this one) that exports
// the provider interface is picked up automatically — drop in a new file to add an engine.

const fs = require('fs');
const path = require('path');

const providers = {};
for (const file of fs.readdirSync(__dirname)) {
  if (!file.endsWith('.js') || file === 'index.js') continue;
  const p = require(path.join(__dirname, file));
  if (p && p.id && typeof p.run === 'function') providers[p.id] = p;
}

// Demo filming support (see recorder.js). Off unless one of these is set.
if (process.env.LUMEN_RECORD || process.env.LUMEN_REPLAY) {
  const rec = require('./recorder');
  for (const p of Object.values(providers)) {
    if (process.env.LUMEN_REPLAY) rec.replay(p, path.resolve(process.env.LUMEN_REPLAY));
    else rec.record(p, path.resolve(process.env.LUMEN_RECORD));
  }
}

let cache = null;
let cacheAt = 0;

async function status(force = false) {
  if (!force && cache && Date.now() - cacheAt < 60_000) return cache;
  const entries = await Promise.all(Object.values(providers).map(async (p) => {
    const d = await p.detect().catch((e) => ({ available: false, message: e.message }));
    return { id: p.id, name: p.name, vendor: p.vendor, description: p.description, models: p.models, supportsResume: p.supportsResume, ...d };
  }));
  cache = entries;
  cacheAt = Date.now();
  return entries;
}

module.exports = { providers, status, get: (id) => providers[id] };
