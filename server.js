// Lumen — a friendly local chat workspace on top of AI command-line tools.
// Zero-framework Node server: static UI + a small JSON API + NDJSON streaming chat.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const store = require('./lib/store');
const registry = require('./providers');
const skills = require('./lib/skills');

const PORT = Number(process.env.PORT) || 4317;
const HOST = '127.0.0.1'; // local only
const PUBLIC = path.join(__dirname, 'public');
const VENDOR = {
  '/vendor/marked.js': path.join(__dirname, 'node_modules', 'marked', 'lib', 'marked.umd.js'),
  '/vendor/purify.js': path.join(__dirname, 'node_modules', 'dompurify', 'dist', 'purify.min.js'),
  '/vendor/hljs.js': path.join(__dirname, 'node_modules', '@highlightjs', 'cdn-assets', 'highlight.min.js'),
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

const running = new Map(); // conversationId -> AbortController

// ---------- helpers ----------
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req, limit = 25 * 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const json = async (req) => { const b = await readBody(req); return b.length ? JSON.parse(b.toString('utf8')) : {}; };

function defaultWorkspace() {
  const dir = path.join(os.homedir(), 'Documents', 'Lumen');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function resolveWorkspace(ws) {
  if (ws && fs.existsSync(ws) && fs.statSync(ws).isDirectory()) return ws;
  return store.settings.get().workspace && fs.existsSync(store.settings.get().workspace) ? store.settings.get().workspace : defaultWorkspace();
}
const inside = (child, parent) => { const rel = path.relative(parent, child); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assistant';

function buildSystemPrompt(assistant, settings, activeSkills = [], access = 'read') {
  const parts = [];
  if (assistant?.instructions) parts.push(assistant.instructions);
  if (settings.userName) parts.push(`The user's name is ${settings.userName}.`);
  parts.push(`You are running inside Lumen, a chat app for non-technical business users. Format answers in GitHub-flavored Markdown. Never ask the user to run terminal commands; do the work yourself or explain in plain language. Refer to the working directory as "your project folder". Today is ${new Date().toDateString()}.`);
  const sk = skills.promptFor(activeSkills, access);
  if (sk) parts.push(sk);
  return parts.join('\n\n');
}

function historyPrompt(conv, message) {
  const recent = conv.messages.slice(-12).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
  return recent ? `Conversation so far:\n\n${recent}\n\n---\n\nUser: ${message}` : message;
}

async function autoTitle(conv, provider, firstMessage) {
  const fallback = firstMessage.replace(/\s+/g, ' ').trim().slice(0, 48) + (firstMessage.length > 48 ? '…' : '');
  conv.title = fallback;
  store.conversations.save(conv);
  const t = await provider.complete({ prompt: `Write a 2-5 word title (no quotes, no punctuation at the end) for a chat that starts with:\n\n${firstMessage.slice(0, 1500)}` }).catch(() => '');
  const clean = t.split('\n')[0].replace(/^["'#*\s]+|["'.*\s]+$/g, '').slice(0, 60);
  if (clean) { const fresh = store.conversations.get(conv.id); if (fresh) { fresh.title = clean; store.conversations.save(fresh); } return clean; }
  return fallback;
}

// ---------- chat streaming ----------
async function handleChat(req, res) {
  const body = await json(req);
  const settings = store.settings.get();
  const providerId = body.providerId || settings.providerId;
  const provider = registry.get(providerId);
  if (!provider) return send(res, 400, { error: `Unknown provider ${providerId}` });

  let conv = body.conversationId ? store.conversations.get(body.conversationId) : null;
  const isNew = !conv;
  if (!conv) conv = store.conversations.create({ assistantId: body.assistantId || 'lumen', workspace: resolveWorkspace(body.workspace), access: body.access || settings.access });
  if (body.access) conv.access = body.access;
  if (body.workspace) conv.workspace = resolveWorkspace(body.workspace);
  const assistant = store.assistants.get(conv.assistantId) || store.assistants.get('lumen');

  let message = String(body.message || '').trim();
  const attachments = (body.attachments || []).filter((p) => fs.existsSync(p));
  const rel = (p) => { const r = path.relative(conv.workspace, p); return r.startsWith('..') || path.isAbsolute(r) ? p : r; };
  if (attachments.length) message += `\n\n[Attached files: ${attachments.map((p) => `"${rel(p)}"`).join(', ')}]`;
  let access = conv.access || 'read';
  if (attachments.length && access === 'chat') access = 'read';
  const activeSkills = skills.resolve(assistant?.skills || [], attachments);
  const tools = skills.toolConfig(activeSkills, access, conv.workspace);

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  const out = (ev) => { try { res.write(JSON.stringify(ev) + '\n'); } catch {} };

  const userMsg = { id: store.id(), role: 'user', content: String(body.message || '').trim(), attachments: attachments.map((p) => ({ path: p, name: path.basename(p) })), createdAt: Date.now() };
  const asstMsg = { id: store.id(), role: 'assistant', content: '', tools: [], files: [], createdAt: Date.now(), providerId };
  const priorMessages = conv.messages.slice();
  conv.messages.push(userMsg);
  store.conversations.save(conv);
  out({ type: 'conversation', conversation: { id: conv.id, title: conv.title, assistantId: conv.assistantId, isNew } });

  const ac = new AbortController();
  running.set(conv.id, ac);
  // Note: closing the tab does NOT cancel the reply — it finishes and is saved. Use the Stop button (/api/chat/:id/stop) to cancel.

  const sessionId = provider.supportsResume ? conv.sessions?.[providerId] : null;
  // If this provider has no session yet but the conversation has history (e.g. switched engines), replay it.
  const prompt = (!sessionId && priorMessages.length) ? historyPrompt({ messages: priorMessages }, message) : message;

  const emit = (ev) => {
    if (ev.type === 'session') { conv.sessions = { ...(conv.sessions || {}), [providerId]: ev.id }; return; }
    if (ev.type === 'text') asstMsg.content += ev.text;
    if (ev.type === 'tool') asstMsg.tools.push({ id: ev.id, icon: ev.icon, label: ev.label, file: ev.file });
    if (ev.type === 'tool' && ev.file && ev.writes && !asstMsg.files.includes(ev.file)) asstMsg.files.push(ev.file);
    if (ev.type === 'tool_done') { const t = asstMsg.tools.find((x) => x.id === ev.id); if (t) t.ok = ev.ok; }
    if (ev.type === 'file' && ev.path && !asstMsg.files.includes(ev.path)) asstMsg.files.push(ev.path);
    if (ev.type === 'error') asstMsg.error = ev.message;
    out(ev);
  };

  const titlePromise = isNew ? autoTitle(conv, provider, userMsg.content || 'New chat') : null;

  await provider.run({
    prompt, sessionId, cwd: conv.workspace, model: body.model || settings.model, access, signal: ac.signal, tools,
    systemPrompt: buildSystemPrompt(assistant, settings, activeSkills, access),
  }, emit);

  running.delete(conv.id);
  if (ac.signal.aborted) asstMsg.stopped = true;
  const fresh = store.conversations.get(conv.id) || conv;
  fresh.sessions = conv.sessions; fresh.access = conv.access; fresh.workspace = conv.workspace;
  fresh.messages = [...priorMessages, userMsg, asstMsg];
  store.conversations.save(fresh);
  out({ type: 'done', message: { id: asstMsg.id, files: asstMsg.files.filter((f) => fs.existsSync(f)) } });
  if (titlePromise) out({ type: 'title', title: await titlePromise });
  res.end();
}

// ---------- assistant helpers ----------
async function draftAssistant(description) {
  const provider = registry.get(store.settings.get().providerId) || registry.get('claude-cli');
  const raw = await provider.complete({ prompt: `Design a helpful AI assistant persona for business users based on this description:\n\n"${description}"\n\nReturn ONLY minified JSON with keys: name (2-3 words), emoji (one emoji), tagline (under 8 words), instructions (a 4-6 sentence system prompt in second person: "You are..."), starters (array of 3 short example requests a user might type), skills (array of skill ids this assistant clearly needs, chosen only from: ${skills.all().map((s) => `"${s.id}" = ${s.description}`).join('; ')}; empty array if none). No markdown fences.` });
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Could not draft the assistant — try describing it differently.');
  return JSON.parse(m[0]);
}

const yamlStr = (v) => JSON.stringify(String(v).replace(/\n/g, ' '));

/** Write the files that make assistants + skills + the office tools work in VS Code and the CLIs (Claude Code and GitHub Copilot). */
function writeVsCodeKit(ws, assistants) {
  const written = [];
  const put = (rel, content) => { const f = path.join(ws, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); written.push(f); };
  const used = new Set(assistants.flatMap((a) => a.skills || []));
  for (const s of skills.all().filter((x) => used.has(x.id))) {
    const md = `---\nname: ${s.id}\ndescription: ${yamlStr(s.description)}\n---\n\n${s.body}\n`;
    put(path.join('.claude', 'skills', s.id, 'SKILL.md'), md);
    put(path.join('.github', 'skills', s.id, 'SKILL.md'), md);
  }
  for (const a of assistants) {
    const name = slug(a.name);
    const sk = a.skills || [];
    const skillNote = sk.length ? `\n\nUse the ${sk.join(' and ')} skill${sk.length > 1 ? 's' : ''} and the "office" MCP tools for documents, Excel workbooks, Microsoft Project plans and traceability.` : '';
    put(path.join('.claude', 'agents', `${name}.md`), `---\nname: ${name}\ndescription: ${yamlStr(a.tagline || a.name)}\n---\n\n${a.instructions}${skillNote}\n`);
    const skillText = skills.all().filter((x) => sk.includes(x.id)).map((x) => `\n\n## ${x.title}\n\n${x.body}`).join('');
    put(path.join('.github', 'agents', `${name}.agent.md`), `---\nname: ${yamlStr(a.name)}\ndescription: ${yamlStr(a.tagline || a.name)}\n---\n\n${a.instructions}${skillText}\n`);
  }
  if (used.size) {
    const server = { command: 'node', args: [skills.MCP_SERVER] };
    put('.mcp.json', JSON.stringify({ mcpServers: { office: { type: 'stdio', ...server, env: { OFFICE_MCP_ROOT: ws } } } }, null, 2));
    put(path.join('.vscode', 'mcp.json'), JSON.stringify({ servers: { office: { type: 'stdio', ...server, env: { OFFICE_MCP_ROOT: '${workspaceFolder}' } } } }, null, 2));
  }
  return written;
}

function exportAssistant(a, workspace) {
  const ws = resolveWorkspace(workspace);
  return { files: writeVsCodeKit(ws, [a]), workspace: ws };
}

// Sample packs offered on the home screen. Each is copied into a sibling of the user's project folder.
const PACKS = {
  crm: { dir: path.join(__dirname, 'demo'), folder: 'Contoso CRM Migration (demo)', assistants: ['schedule-analyst', 'budget-controller', 'project-partner'] },
  aidlc: { dir: path.join(__dirname, 'samples', 'aidlc'), folder: 'Online Permit Renewal (AIDLC sample)', assistants: ['requirements-refiner', 'functional-designer', 'technical-designer', 'story-writer', 'traceability-analyst'] },
};
function copyMissing(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name), dest = path.join(to, e.name);
    if (e.isDirectory()) copyMissing(src, dest);
    else if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  }
}
function installDemo(packId = 'crm') {
  const pack = PACKS[packId];
  if (!pack || !fs.existsSync(pack.dir)) throw new Error(`The ${packId} sample isn't available in this copy of Lumen.`);
  const base = resolveWorkspace(store.settings.get().workspace);
  const parent = Object.values(PACKS).some((p) => path.basename(base) === p.folder) ? path.dirname(base) : base;
  const target = path.join(parent, pack.folder);
  copyMissing(pack.dir, target);
  writeVsCodeKit(target, store.assistants.all().filter((a) => pack.assistants.includes(a.id)));
  return target;
}

function pickFolderNative() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Choose a project folder for Lumen'; $f.UseDescriptionForTitle = $true; $top = New-Object System.Windows.Forms.Form -Property @{TopMost=$true}; if ($f.ShowDialog($top) -eq 'OK') { [Console]::Out.Write($f.SelectedPath) }`;
    execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { windowsHide: false, timeout: 300000 }, (err, stdout) => resolve(err ? null : (String(stdout).trim() || '')));
  });
}

function openPath(p) {
  if (process.platform === 'win32') spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [p], { detached: true, stdio: 'ignore' }).unref();
}

function listFolder(dir, depth = 0, out = []) {
  if (out.length > 300 || depth > 2) return out;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFolder(full, depth + 1, out);
    else { try { const st = fs.statSync(full); out.push({ path: full, name: e.name, rel: path.relative(dir, full), size: st.size, mtime: st.mtimeMs }); } catch {} }
  }
  return out;
}

// ---------- router ----------
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const [resource, rid, action] = parts;
  const m = req.method;

  if (resource === 'status' && m === 'GET') {
    const s = store.settings.get();
    return send(res, 200, { providers: await registry.status(url.searchParams.has('refresh')), settings: { ...s, workspace: resolveWorkspace(s.workspace) }, platform: process.platform, user: os.userInfo().username });
  }
  if (resource === 'skills' && m === 'GET') return send(res, 200, skills.all().map(({ body, raw, file, ...rest }) => rest));
  if (resource === 'demo' && rid === 'install' && m === 'POST') {
    const pack = (await json(req)).pack || 'crm';
    let target;
    try { target = installDemo(pack); } catch (e) { return send(res, 400, { error: e.message }); }
    store.settings.set({ workspace: target, demoInstalled: target, demoPack: pack });
    return send(res, 200, { path: target, pack, files: fs.readdirSync(target).filter((f) => !f.startsWith('.')) });
  }
  if (resource === 'reset' && m === 'POST') { store.assistants.reset(); store.recipes.reset(); return send(res, 200, { ok: true }); }
  if (resource === 'settings' && m === 'PUT') return send(res, 200, store.settings.set(await json(req)));

  if (resource === 'assistants' || resource === 'recipes') {
    const col = store[resource];
    if (m === 'GET' && !rid) return send(res, 200, col.all());
    if (resource === 'assistants' && rid === 'draft' && m === 'POST') {
      try { return send(res, 200, await draftAssistant((await json(req)).description || '')); } catch (e) { return send(res, 500, { error: e.message }); }
    }
    if (resource === 'assistants' && action === 'export' && m === 'POST') {
      const a = col.get(rid); if (!a) return send(res, 404, { error: 'Not found' });
      return send(res, 200, exportAssistant(a, (await json(req)).workspace));
    }
    if (m === 'POST' && !rid) { const item = await json(req); delete item.builtin; return send(res, 200, col.upsert(item)); }
    if (m === 'PUT' && rid) return send(res, 200, col.upsert({ ...(await json(req)), id: rid }));
    if (m === 'DELETE' && rid) { col.remove(rid); return send(res, 200, { ok: true }); }
  }

  if (resource === 'conversations') {
    if (m === 'GET' && !rid) return send(res, 200, store.conversations.list());
    if (m === 'GET' && rid) { const c = store.conversations.get(rid); return c ? send(res, 200, { ...c, running: running.has(c.id) }) : send(res, 404, { error: 'Not found' }); }
    if (m === 'PATCH' && rid) { const c = store.conversations.get(rid); if (!c) return send(res, 404, {}); const p = await json(req); for (const k of ['title', 'pinned', 'access', 'workspace']) if (k in p) c[k] = p[k]; return send(res, 200, store.conversations.save(c)); }
    if (m === 'DELETE' && rid) { store.conversations.remove(rid); return send(res, 200, { ok: true }); }
  }

  if (resource === 'chat' && m === 'POST' && !rid) return handleChat(req, res);
  if (resource === 'chat' && action === 'stop' && m === 'POST') { running.get(rid)?.abort(); return send(res, 200, { ok: true }); }

  if (resource === 'upload' && m === 'POST') {
    const ws = resolveWorkspace(url.searchParams.get('workspace'));
    const name = path.basename(decodeURIComponent(url.searchParams.get('name') || 'file')).replace(/[<>:"/\\|?*]/g, '_');
    const dir = path.join(ws, 'Attachments');
    fs.mkdirSync(dir, { recursive: true });
    let target = path.join(dir, name);
    const { name: stem, ext } = path.parse(name);
    for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, `${stem} (${i})${ext}`);
    fs.writeFileSync(target, await readBody(req));
    return send(res, 200, { path: target, name: path.basename(target) });
  }

  if (resource === 'folder') {
    if (rid === 'pick' && m === 'POST') { const p = await pickFolderNative(); return send(res, 200, { path: p, native: process.platform === 'win32' }); }
    if (rid === 'open' && m === 'POST') { const { path: p, workspace } = await json(req); const ws = resolveWorkspace(workspace); const target = p && (p === ws || inside(p, ws)) ? p : ws; if (fs.existsSync(target)) openPath(target); return send(res, 200, { ok: true }); }
    if (rid === 'files' && m === 'GET') { const ws = resolveWorkspace(url.searchParams.get('workspace')); return send(res, 200, { workspace: ws, files: listFolder(ws).sort((a, b) => b.mtime - a.mtime).slice(0, url.searchParams.has('all') ? 500 : 60) }); }
    if (rid === 'check' && m === 'POST') { const { path: p } = await json(req); const ok = !!p && fs.existsSync(p) && fs.statSync(p).isDirectory(); return send(res, 200, { ok }); }
  }

  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  // Basic CSRF/DNS-rebinding guard: only accept requests addressed to localhost.
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end(); }
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (VENDOR[url.pathname]) { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return fs.createReadStream(VENDOR[url.pathname]).pipe(res); }
    const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message }); else res.end();
  }
});

server.listen(PORT, HOST, () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\n  ✨ Lumen is running at ${link}\n`);
  if (process.argv.includes('--open')) openPath(link);
});
