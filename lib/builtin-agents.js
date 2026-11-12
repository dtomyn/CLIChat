// The built-in agents that ship with Lumen: one file per agent in <repo>/agents/<id>.json,
// listed by their `order` number (then name). Users' own copies live in data/agents/.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'agents');

function all() {
  let names = [];
  try { names = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch { /* folder missing */ }
  const items = [];
  for (const f of names) {
    try { const a = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); if (a && a.id) items.push(a); } catch { /* skip unreadable file */ }
  }
  return items.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || String(a.name).localeCompare(String(b.name)));
}

module.exports = { DIR, all };
