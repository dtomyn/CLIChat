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

// cmd.exe metacharacters. Each is caret-escaped twice: once for cmd.exe, once more because a .cmd/.bat shim
// re-parses its own arguments (the approach cross-spawn uses).
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;
function cmdArg(arg) {
  // cmd.exe can't carry a line break inside an argument: it ends the command there. Flatten to spaces.
  let a = String(arg).replace(/\r?\n|\r/g, ' ');
  // Quote for CommandLineToArgvW: double the backslashes before a quote or the closing quote, escape quotes.
  a = `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`;
  return a.replace(CMD_META, '^$1').replace(CMD_META, '^$1');
}

/**
 * How to spawn `bin` (from resolve) with `args`. Without a shell this is the plain command and argument list.
 * When the shim needs cmd.exe, every argument is escaped so text such as system prompts, file names or MCP JSON
 * can't break out of its argument and run other commands. Use the result with spawn/execFile and NO `shell` option.
 * @returns {{ command: string, args: string[], options: object }}
 */
function command(bin, args = []) {
  const all = [...bin.prefix, ...args];
  if (!bin.shell) return { command: bin.command, args: all, options: {} };
  const line = [String(bin.command).replace(CMD_META, '^$1'), ...all.map(cmdArg)].join(' ');
  return { command: process.env.comspec || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], options: { windowsVerbatimArguments: true } };
}

module.exports = { resolve, command, cmdArg };
