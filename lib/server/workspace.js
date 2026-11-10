// Lumen server: Notebook (project) folder resolution and the "inside this folder" checks.
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('../store');

// Prefer the work OneDrive, so files people make in Lumen are already where Microsoft 365 Copilot can find them.
function oneDriveRoot() {
  for (const k of ['OneDriveCommercial', 'OneDrive']) {
    const v = process.env[k];
    try { if (v && fs.statSync(v).isDirectory()) return v; } catch {}
  }
  return null;
}
function defaultWorkspace() {
  const od = oneDriveRoot();
  const dir = od ? path.join(od, 'Lumen') : path.join(os.homedir(), 'Documents', 'Lumen');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function resolveWorkspace(ws) {
  if (ws && fs.existsSync(ws) && fs.statSync(ws).isDirectory()) return ws;
  return store.settings.get().workspace && fs.existsSync(store.settings.get().workspace) ? store.settings.get().workspace : defaultWorkspace();
}
const inside = (child, parent) => { const rel = path.relative(parent, child); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
// Access levels the API accepts. The providers also know "full" (shell commands), which is never reachable from the UI.
const ACCESS_LEVELS = ['chat', 'read', 'edit'];
const cleanAccess = (v, fallback = 'read') => (ACCESS_LEVELS.includes(v) ? v : fallback);
const isDir = (p) => { try { return typeof p === 'string' && !!p && fs.statSync(p).isDirectory(); } catch { return false; } };
function workspaceFile(file, workspace) {
  if (typeof file !== 'string' || !file) return false;
  try {
    const root = fs.realpathSync(workspace);
    const resolved = fs.realpathSync(path.resolve(workspace, file));
    return inside(resolved, root) && fs.statSync(resolved).isFile();
  } catch { return false; }
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assistant';

module.exports = { cleanAccess, inside, isDir, resolveWorkspace, slug, workspaceFile };
