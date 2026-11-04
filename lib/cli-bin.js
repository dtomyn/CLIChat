// Finds an AI CLI on this computer and returns how to launch it WITHOUT a shell.
// Going through cmd.exe breaks long, multi-line arguments (system prompts, MCP JSON), so:
//   - native executables are spawned directly;
//   - npm's .cmd shims are unwrapped to `node <entry.js>`;
//   - a bare name is looked up on PATH first (where.exe / which).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function onPath(name) {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8', windowsHide: true, timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
    const hits = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    // Prefer a real executable over a shim when both exist.
    return hits.find((h) => /\.exe$/i.test(h)) || hits.find((h) => /\.cmd$/i.test(h)) || hits[0] || null;
  } catch { return null; }
}

/** The JS entry an npm .cmd shim points at, e.g. "%dp0%\node_modules\@github\copilot\npm-loader.js". */
function shimTarget(cmdFile) {
  try {
    const m = /%~?dp0%?\\([^"\r\n]+?\.(?:js|mjs|cjs))/i.exec(fs.readFileSync(cmdFile, 'utf8'));
    if (m) { const js = path.join(path.dirname(cmdFile), m[1]); if (fs.existsSync(js)) return js; }
  } catch {}
  return null;
}

/**
 * @param {string} name       command name, e.g. "copilot"
 * @param {string[]} candidates well-known install locations, checked first
 * @param {string} [override] explicit path from an environment variable
 * @returns {{ command: string, prefix: string[], shell: boolean, found: string|null }}
 */
function resolve(name, candidates = [], override) {
  const found = (override && fs.existsSync(override) && override) || candidates.find((c) => c && fs.existsSync(c)) || onPath(name);
  if (!found) return { command: name, prefix: [], shell: false, found: null };
  if (/\.(js|mjs|cjs)$/i.test(found)) return { command: process.execPath, prefix: [found], shell: false, found };
  if (/\.(cmd|bat)$/i.test(found)) {
    const js = shimTarget(found);
    // Last resort: run the shim through the shell (short arguments only work reliably then).
    return js ? { command: process.execPath, prefix: [js], shell: false, found } : { command: found, prefix: [], shell: true, found };
  }
  return { command: found, prefix: [], shell: false, found };
}

module.exports = { resolve };
