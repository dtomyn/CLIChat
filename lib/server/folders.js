// Lumen server: In-app folder browser, opening files, and folder listings.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

/**
 * Folder browser data for the in-app folder picker (a native dialog spawned by the server can open behind the
 * browser or on another screen, so Lumen browses folders itself). No path → drives and well-known places.
 */
function browseFolder(dir) {
  const home = os.homedir();
  const places = [['Home', home], ['Documents', path.join(home, 'Documents')], ['Desktop', path.join(home, 'Desktop')],
    ...Object.entries(process.env).filter(([k, v]) => /^OneDrive/i.test(k) && v).map(([k, v]) => [k === 'OneDrive' ? 'OneDrive' : k.replace(/^OneDrive/i, 'OneDrive '), v])]
    .filter(([, p], i, all) => fs.existsSync(p) && all.findIndex(([, q]) => q === p) === i).map(([name, p]) => ({ name, path: p }));
  if (!dir) {
    const drives = process.platform === 'win32'
      ? 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((d) => `${d}:\\`).filter((d) => { try { return fs.existsSync(d); } catch { return false; } })
      : ['/'];
    return { path: '', parent: null, places, dirs: drives.map((d) => ({ name: d, path: d })) };
  }
  const full = path.resolve(dir);
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) throw new Error("That folder doesn't exist.");
  let entries = [];
  try { entries = fs.readdirSync(full, { withFileTypes: true }); } catch { throw new Error("Lumen isn't allowed to open that folder."); }
  const dirs = entries.filter((e) => { try { return e.isDirectory() && !/^[.$]/.test(e.name) && !['node_modules', 'System Volume Information'].includes(e.name); } catch { return false; } })
    .map((e) => ({ name: e.name, path: path.join(full, e.name) })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const parent = path.dirname(full);
  return { path: full, parent: parent === full ? '' : parent, places, dirs };
}

// Files Lumen opens directly in their app. Anything else (programs, scripts, shortcuts, macro-enabled Office files and
// the many other types Windows runs on open) is shown in its folder instead, because the AI can write files here.
const OPENABLE = /\.(docx|dotx|doc|xlsx|xltx|xls|csv|tsv|pptx|potx|ppt|pdf|txt|md|markdown|json|xml|ya?ml|mpp|vtt|srt|log|sql|png|jpe?g|gif|bmp|webp|html?)$/i;
function openPath(p) {
  if (process.platform === 'win32') spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [p], { detached: true, stdio: 'ignore' }).unref();
}

function listFolder(dir, depth = 0, out = [], root = dir, all = false) {
  if (!all && (out.length > 300 || depth > 2)) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFolder(full, depth + 1, out, root, all);
    else { try { const st = fs.statSync(full); out.push({ path: full, name: e.name, rel: path.relative(root, full), size: st.size, mtime: st.mtimeMs }); } catch {} }
  }
  return out;
}

module.exports = { OPENABLE, browseFolder, listFolder, openPath };
