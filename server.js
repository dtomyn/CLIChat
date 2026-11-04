// Lumen — a friendly local chat workspace on top of AI command-line tools.
// Zero-framework Node server: static UI + a small JSON API + NDJSON streaming chat.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const store = require('./lib/store');
const scheduler = require('./lib/scheduler');
const registry = require('./providers');
const skills = require('./lib/skills');
const mdExport = require('./tools/md-export');
const excel = require('./tools/excel');
const project = require('./tools/project');

const PORT = process.env.PORT === undefined ? 4317 : Number(process.env.PORT);
const HOST = '127.0.0.1'; // local only
const PUBLIC = path.join(__dirname, 'public');
const VENDOR = {
  '/vendor/marked.js': path.join(__dirname, 'node_modules', 'marked', 'lib', 'marked.umd.js'),
  '/vendor/purify.js': path.join(__dirname, 'node_modules', 'dompurify', 'dist', 'purify.min.js'),
  '/vendor/hljs.js': path.join(__dirname, 'node_modules', '@highlightjs', 'cdn-assets', 'highlight.min.js'),
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

const running = new Map(); // conversationId -> AbortController
let scheduleRunner;

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
function workspaceFile(file, workspace) {
  if (typeof file !== 'string' || !file) return false;
  try {
    const root = fs.realpathSync(workspace);
    const resolved = fs.realpathSync(path.resolve(workspace, file));
    return inside(resolved, root) && fs.statSync(resolved).isFile();
  } catch { return false; }
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assistant';

function buildSystemPrompt(assistant, settings, activeSkills = [], access = 'read') {
  const parts = [];
  if (assistant?.instructions) parts.push(assistant.instructions);
  if (settings.userName) parts.push(`The user's name is ${settings.userName}.`);
  parts.push(`You are running inside Lumen, a chat app for non-technical business users. Format answers in GitHub-flavored Markdown. Never ask the user to run terminal commands; do the work yourself or explain in plain language. Refer to the working directory as "your project folder". Today is ${new Date().toDateString()}.`);
  // Suggestion chips (plan 01, optional): a predictable closing line makes the UI's "suggested next step" extraction reliable.
  // Remove this push to revert.
  parts.push('When it genuinely helps, end a substantive reply with a final line in the form "**Suggested next step:** <one short imperative sentence>". Skip it for quick factual answers and small talk.');
  const sk = skills.promptFor(activeSkills, access);
  if (sk) parts.push(sk);
  return parts.join('\n\n');
}

// Replays only the last 12 messages, so after a rewind or engine switch older context is dropped.
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
const modelLabel = (provider, id) => (provider.models || []).find((m) => m.id === id)?.label || id || 'Default';

async function handleChat(req, res) {
  const body = await json(req);
  if (body.conversationId && running.has(body.conversationId)) return send(res, 409, { error: 'Wait for the current reply to finish first.' });
  if (body.conversationId && store.runs.list().some((r) => r.stages.some((s) => s.conversationId === body.conversationId && s.status === 'approved'))) return send(res, 409, { error: 'Send this approved stage back before changing it.' });
  if (body.conversationId) {
    for (const run of store.runs.list()) {
      const index = run.stages.findIndex((s) => s.conversationId === body.conversationId);
      if (index < 0) continue;
      const stage = run.stages[index], later = run.stages.slice(index + 1);
      if (stage.checkRunning || later.some((s) => s.status === 'running' || s.checkRunning || running.has(s.conversationId))) return send(res, 409, { error: 'Wait for the traceability check and later stages to finish first.' });
      if (stage.status === 'review' && later.some((s) => s.status !== 'pending')) return send(res, 409, { error: 'Send this stage back before changing inputs used by later stages.' });
      stage.checkSummary = ''; stage.gateConversationId = null; store.runs.save(run);
    }
  }
  if (body.providerId && !registry.get(body.providerId)) return send(res, 400, { error: `Unknown provider ${body.providerId}` });
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  try { await runTurn(body, (ev) => { if (!res.destroyed) res.write(JSON.stringify(ev) + '\n'); }); }
  catch (e) { res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n'); }
  res.end();
}

async function runTurn(body, out = () => {}) {
  const settings = store.settings.get();
  const providerId = body.providerId || settings.providerId;
  const provider = registry.get(providerId);
  if (!provider) throw new Error(`Unknown provider ${providerId}`);

  let conv = body.conversationId ? store.conversations.get(body.conversationId) : null;
  const isNew = !conv;
  if (conv && body.truncateFrom) {
    // Rewind (edit / retry): drop the message and everything after it. The engine's own session still remembers the
    // dropped turns, so forget it; the next turn then replays the stored history through historyPrompt.
    if (running.has(conv.id)) throw new Error('Wait for the current reply to finish first.');
    const idx = conv.messages.findIndex((x) => x.id === body.truncateFrom);
    if (idx >= 0) { conv.messages = conv.messages.slice(0, idx); conv.sessions = {}; }
  }
  if (!conv) conv = store.conversations.create({ assistantId: body.assistantId || 'lumen', workspace: resolveWorkspace(body.workspace), access: body.access || settings.access, pinned_files: Array.isArray(body.pinned_files) ? body.pinned_files.filter((p) => typeof p === 'string') : [] });
  if (running.has(conv.id)) throw new Error('Wait for the current reply to finish first.');
  if (body.access) conv.access = body.access;
  if (body.workspace) conv.workspace = resolveWorkspace(body.workspace);
  const assistant = store.assistants.get(conv.assistantId) || store.assistants.get('lumen');

  let message = String(body.message || '').trim();
  const attachments = (body.attachments || []).filter((p) => fs.existsSync(p));
  const rel = (p) => { const r = path.relative(conv.workspace, p); return r.startsWith('..') || path.isAbsolute(r) ? p : r; };
  if (attachments.length) message += `\n\n[Attached files: ${attachments.map((p) => `"${rel(p)}"`).join(', ')}]`;
  const pinned = (conv.pinned_files || []).filter((p) => workspaceFile(p, conv.workspace));
  let access = conv.access || 'read';
  if ((attachments.length || pinned.length) && access === 'chat') access = 'read';
  const activeSkills = skills.resolve(assistant?.skills || [], [...attachments, ...pinned]);
  const tools = skills.toolConfig(activeSkills, access, conv.workspace);

  const userMsg = { id: store.id(), role: 'user', content: String(body.message || '').trim(), attachments: attachments.map((p) => ({ path: p, name: path.basename(p) })), createdAt: Date.now() };
  if (body.recipeId) userMsg.recipeId = String(body.recipeId);
  const asstMsg = { id: store.id(), role: 'assistant', content: '', tools: [], files: [], createdAt: Date.now(), providerId };
  if (tools?.servers?.office && (access === 'edit' || access === 'full')) tools.servers.office.env.LUMEN_SNAPSHOT_DIR = path.join(conv.workspace, '.lumen', 'snapshots', asstMsg.id);
  const priorMessages = conv.messages.slice();
  conv.messages.push(userMsg);
  store.conversations.save(conv);
  out({ type: 'conversation', conversation: { id: conv.id, title: conv.title, assistantId: conv.assistantId, isNew }, userMessageId: userMsg.id, assistantMessageId: asstMsg.id });

  const ac = new AbortController();
  running.set(conv.id, ac);
  // Note: closing the tab does NOT cancel the reply — it finishes and is saved. Use the Stop button (/api/chat/:id/stop) to cancel.

  const sessionId = provider.supportsResume ? conv.sessions?.[providerId] : null;
  // If this provider has no session yet but the conversation has history (e.g. switched engines), replay it.
  const prompt = (!sessionId && priorMessages.length) ? historyPrompt({ messages: priorMessages }, message) : message;

  let reported = null; // the engine's own { costUsd, durationMs }, when it reports one
  const emit = (ev) => {
    if (ev.type === 'session') { conv.sessions = { ...(conv.sessions || {}), [providerId]: ev.id }; return; }
    if (ev.type === 'text') asstMsg.content += ev.text;
    if (ev.type === 'tool') asstMsg.tools.push({ id: ev.id, icon: ev.icon, label: ev.label, file: ev.file });
    if (ev.type === 'tool' && ev.file && ev.writes) { const file = path.resolve(conv.workspace, ev.file); if (!asstMsg.files.includes(file)) asstMsg.files.push(file); }
    if (ev.type === 'tool_done') { const t = asstMsg.tools.find((x) => x.id === ev.id); if (t) t.ok = ev.ok; }
    if (ev.type === 'file' && ev.path) { const file = path.resolve(conv.workspace, ev.path); if (!asstMsg.files.includes(file)) asstMsg.files.push(file); }
    if (ev.type === 'error') asstMsg.error = ev.message;
    if (ev.type === 'usage') { reported = ev; return; }
    out(ev);
  };

  const titlePromise = isNew ? autoTitle(conv, provider, userMsg.content || 'New chat') : null;

  const started = Date.now();
  try {
    await provider.run({
      prompt, sessionId, cwd: conv.workspace, model: body.model || settings.model, access, signal: ac.signal, tools,
      systemPrompt: [buildSystemPrompt(assistant, settings, activeSkills, access), pinned.length ? `Key files for this chat (read them when relevant): ${pinned.map((p) => JSON.stringify(rel(path.resolve(conv.workspace, p)))).join(', ')}` : ''].filter(Boolean).join('\n\n'),
    }, emit);
  } catch (e) { emit({ type: 'error', message: e.message }); }

  running.delete(conv.id);
  if (ac.signal.aborted) asstMsg.stopped = true;
  asstMsg.usage = reported
    ? { durationMs: reported.durationMs ?? Date.now() - started, costUsd: reported.costUsd, model: modelLabel(provider, body.model || settings.model) }
    : { durationMs: Date.now() - started };
  const fresh = store.conversations.get(conv.id) || conv;
  fresh.sessions = conv.sessions; fresh.access = conv.access; fresh.workspace = conv.workspace;
  // Take earlier messages from disk, so feedback given while this reply was running isn't lost.
  fresh.messages = [...priorMessages.map((pm) => fresh.messages.find((x) => x.id === pm.id) || pm), userMsg, asstMsg];
  store.conversations.save(fresh);
  for (const run of store.runs.list()) {
    const stage = run.stages.find((s) => s.conversationId === conv.id && s.status === 'rework');
    if (stage && !asstMsg.error && !asstMsg.stopped && workspaceFile(stage.outputPath, run.workspace)) {
      if (stage.unapprovedInputs) labelUnapproved(stage);
      stage.status = 'review'; store.runs.save(run);
    }
  }
  out({ type: 'done', message: { id: asstMsg.id, files: asstMsg.files.filter((f) => fs.existsSync(f)), usage: asstMsg.usage } });
  if (titlePromise) out({ type: 'title', title: await titlePromise });
  return { conversation: fresh, message: asstMsg };
}

function reconcileRun(run) {
  for (const stage of run.stages) {
    if (stage.status === 'running' && !running.has(stage.conversationId)) {
      stage.status = 'rework';
      stage.error = 'The stage was interrupted. Open its chat to continue or start it again.';
    }
    if (stage.checkRunning && !running.has(stage.gateConversationId)) stage.checkRunning = false;
  }
  return store.runs.save(run);
}

function stampOutput(stage, approvedBy, approvedAt) {
  const contents = fs.readFileSync(stage.outputPath, 'utf8').replace(/^> Approved by .* on .*\r?\n(?:\r?\n)?/, '');
  fs.writeFileSync(stage.outputPath, `> Approved by ${approvedBy.replace(/[\r\n]/g, ' ')} on ${new Date(approvedAt).toISOString()}\n\n${contents}`);
}

function labelUnapproved(stage) {
  const text = fs.readFileSync(stage.outputPath, 'utf8');
  if (!text.includes('> Based on unapproved inputs')) fs.writeFileSync(stage.outputPath, `> Based on unapproved inputs\n\n${text}`);
}
function clearUnapproved(stage) {
  const text = fs.readFileSync(stage.outputPath, 'utf8');
  const clean = text.replace(/^> Based on unapproved inputs\r?\n(?:\r?\n)?/, '');
  if (clean !== text) fs.writeFileSync(stage.outputPath, clean);
}

function startRunTurn(run, stage, prompt, isCheck = false) {
  const conversationId = isCheck ? stage.gateConversationId : stage.conversationId;
  runTurn({ conversationId, message: prompt }).then(({ message }) => {
    const fresh = store.runs.get(run.id);
    if (!fresh) return;
    const s = fresh.stages.find((x) => x.id === stage.id);
    if (isCheck) {
      s.checkRunning = false;
      s.checkSummary = message.error || (message.stopped ? 'Check stopped.' : message.content || 'The check returned no findings.');
    } else {
      s.status = !message.error && !message.stopped && workspaceFile(s.outputPath, fresh.workspace) ? 'review' : 'rework';
      s.error = message.error || (message.stopped ? 'The stage was stopped.' : s.status === 'rework' ? 'The stage did not create its output file.' : '');
      if (s.status === 'review') { if (s.unapprovedInputs) labelUnapproved(s); else clearUnapproved(s); }
    }
    store.runs.save(fresh);
  }).catch((e) => {
    console.error('Lifecycle turn failed:', e);
    const fresh = store.runs.get(run.id);
    if (!fresh) return;
    const s = fresh.stages.find((x) => x.id === stage.id);
    if (isCheck) { s.checkRunning = false; s.checkSummary = `Check failed: ${e.message}`; }
    else { s.status = 'rework'; s.error = e.message; }
    store.runs.save(fresh);
  });
}

async function diffFiles(a, b) {
  const changes = [];
  const add = (sheet, cell, before, after) => { if (before !== after && changes.length < 500) changes.push({ sheet, cell, before, after }); };
  if (/\.xml$/i.test(a) && /\.xml$/i.test(b)) {
    const left = project.load(a), right = project.load(b);
    const ids = new Set([...left.tasks.map((t) => t.uid), ...right.tasks.map((t) => t.uid)]);
    for (const id of ids) {
      const x = left.byUid.get(id), y = right.byUid.get(id);
      for (const key of ['name', 'start', 'finish', 'durationDays', 'percent', 'notes']) {
        const val = (t) => t?.[key] instanceof Date ? t[key].toISOString().slice(0, 10) : String(t?.[key] ?? '');
        add('Tasks', `${id}: ${key}`, val(x), val(y));
      }
    }
  } else {
    if (!/\.xlsx$/i.test(a) || !/\.xlsx$/i.test(b)) throw new Error('Choose two Excel workbooks or two Project XML files.');
    const [left, right] = await Promise.all([excel.open(a), excel.open(b)]);
    const sheets = new Set([...left.worksheets.map((s) => s.name), ...right.worksheets.map((s) => s.name)]);
    for (const name of sheets) {
      const cells = new Map();
      const text = (cell) => {
        const v = cell.value;
        if (v == null) return '';
        if (v instanceof Date) return v.toISOString();
        if (typeof v !== 'object') return String(v);
        if (v.formula || v.sharedFormula) return `${v.result == null ? '' : `${v.result instanceof Date ? v.result.toISOString() : String(v.result)} `}⟨=${cell.formula || v.formula || v.sharedFormula}⟩`;
        if (v.richText) return v.richText.map((t) => t.text).join('');
        if (v.hyperlink) return `${v.text || ''} (${v.hyperlink})`;
        if (v.error) return v.error;
        return JSON.stringify(v);
      };
      for (const [wb, index] of [[left, 0], [right, 1]]) {
        wb.getWorksheet(name)?.eachRow((row) => row.eachCell((cell) => {
          const pair = cells.get(cell.address) || ['', '']; pair[index] = text(cell); cells.set(cell.address, pair);
        }));
      }
      for (const [cell, [before, after]] of cells) add(name, cell, before, after);
    }
  }
  return changes;
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

// The "Suggested next step" line is a prompt for the chat UI, not part of the deliverable.
const stripSuggestion = (text) => String(text).replace(/\n+[ \t]*[*_]*suggested next steps?:?[*_]*:?[^\n]*\s*$/i, '').trimEnd();

/** Usage numbers for the Insights page, read from every saved conversation. Feedback never leaves this computer. */
function insights() {
  const assistants = new Map(), recipes = new Map(), down = [];
  const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2); };
  const bucket = (map, key) => { if (!map.has(key)) map.set(key, { id: key, chats: 0, runs: 0, replies: 0, up: 0, down: 0, times: [] }); return map.get(key); };
  for (const { id } of store.conversations.list()) {
    const c = store.conversations.get(id); if (!c) continue;
    const a = bucket(assistants, c.assistantId || 'lumen');
    a.chats++;
    let recipe = null;
    for (const msg of c.messages) {
      if (msg.copied) continue; // copied into a branch: already counted in the original chat
      if (msg.role === 'user') { recipe = msg.recipeId ? bucket(recipes, msg.recipeId) : null; if (recipe) recipe.runs++; continue; }
      if (!msg.content && !msg.error) continue;
      a.replies++;
      if (msg.usage?.durationMs) a.times.push(msg.usage.durationMs);
      const r = msg.feedback?.rating;
      if (r) { a[r]++; if (recipe) recipe[r]++; }
      if (r === 'down') down.push({ conversationId: c.id, title: c.title, messageId: msg.id, assistantId: c.assistantId, reason: msg.feedback.reason || '', note: msg.feedback.note || '', at: msg.feedback.at, excerpt: String(msg.content || msg.error).replace(/\s+/g, ' ').slice(0, 160) });
    }
  }
  const allAssistants = store.assistants.all(), allRecipes = store.recipes.all();
  return {
    assistants: [...assistants.values()].map(({ id, chats, replies, up, down: dn, times }) => {
      const def = allAssistants.find((x) => x.id === id);
      return { id, name: def?.name || 'Deleted assistant', emoji: def?.emoji || '🗑️', chats, replies, up, down: dn, medianMs: median(times) };
    }).sort((x, y) => y.replies - x.replies),
    recipes: [...recipes.values()].map(({ id, runs, up, down: dn }) => {
      const def = allRecipes.find((x) => x.id === id);
      return { id, name: def?.name || 'Deleted quick start', emoji: def?.emoji || '🗑️', runs, up, down: dn };
    }).sort((x, y) => y.runs - x.runs),
    recentDown: down.sort((x, y) => y.at - x.at).slice(0, 20),
  };
}

// ---------- router ----------
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const [resource, rid, action, sub] = parts;
  const m = req.method;

  if (resource === 'status' && m === 'GET') {
    const s = store.settings.get();
    return send(res, 200, { providers: await registry.status(url.searchParams.has('refresh')), settings: { ...s, workspace: resolveWorkspace(s.workspace) }, platform: process.platform, user: os.userInfo().username });
  }
  if (resource === 'skills' && m === 'GET') return send(res, 200, skills.all().map(({ body, raw, file, ...rest }) => rest));
  if (resource === 'pipelines' && m === 'GET') return send(res, 200, store.pipelines.all());
  if (resource === 'runs') {
    if (!rid && m === 'GET') return send(res, 200, store.runs.list().map(reconcileRun));
    if (!rid && m === 'POST') {
      const body = await json(req), pipeline = store.pipelines.get(body.pipelineId);
      if (!pipeline) return send(res, 400, { error: 'Choose a pipeline.' });
      const workspace = resolveWorkspace(body.workspace);
      const name = String(body.name || '').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/, '').slice(0, 80);
      if (!name || name === '.' || name === '..') return send(res, 400, { error: 'Enter a valid run name.' });
      if (!Array.isArray(body.sources) || !body.sources.length || body.sources.some((p) => !workspaceFile(p, workspace))) return send(res, 400, { error: 'Choose existing source files in your project folder.' });
      const dir = path.join(workspace, 'Lifecycle', name);
      if (fs.existsSync(dir)) return send(res, 409, { error: 'A lifecycle folder with that name already exists.' });
      const lifecycle = path.dirname(dir);
      if (fs.existsSync(lifecycle) && !inside(fs.realpathSync(lifecycle), fs.realpathSync(workspace))) return send(res, 400, { error: 'The lifecycle folder must be inside your project folder.' });
      fs.mkdirSync(dir, { recursive: true });
      if (!inside(fs.realpathSync(dir), fs.realpathSync(workspace))) return send(res, 400, { error: 'The lifecycle folder must be inside your project folder.' });
      const run = { id: store.id(), pipelineId: pipeline.id, name, workspace, sources: body.sources.map((p) => path.resolve(workspace, p)), createdAt: Date.now(),
        stages: pipeline.stages.map((s) => ({ id: s.id, status: 'pending', outputPath: path.join(dir, s.output) })) };
      return send(res, 200, store.runs.save(run));
    }
    const run = store.runs.get(rid);
    if (!run) return send(res, 404, { error: 'Run not found.' });
    if (m === 'GET' && !action) return send(res, 200, reconcileRun(run));
    if (m === 'POST' && action === 'stages' && sub && parts[4]) {
      const stage = run.stages.find((s) => s.id === sub), pipeline = store.pipelines.get(run.pipelineId);
      const def = pipeline?.stages.find((s) => s.id === sub);
      if (!stage || !def) return send(res, 404, { error: 'Stage not found.' });
      const operation = parts[4], index = run.stages.indexOf(stage), prev = run.stages[index - 1];
      const body = await json(req);
      if (operation === 'start') {
        if (!['pending', 'rework'].includes(stage.status) || (stage.conversationId && running.has(stage.conversationId))) return send(res, 409, { error: 'This stage cannot be started now.' });
        if (prev && prev.status !== 'approved' && !body.override) return send(res, 409, { error: 'Approve the previous stage or explicitly override the approval gate.' });
        if (prev && (prev.status === 'running' || running.has(prev.conversationId))) return send(res, 409, { error: 'Wait for the previous stage to finish first.' });
        if (prev && !workspaceFile(prev.outputPath, run.workspace)) return send(res, 400, { error: 'The previous stage output is missing.' });
        if (!run.sources.every((p) => workspaceFile(p, run.workspace))) return send(res, 400, { error: 'A source file is missing from your project folder.' });
        if (!store.assistants.get(def.assistantId)) return send(res, 400, { error: 'The stage assistant is missing.' });
        const pinned = [...run.sources, ...(prev ? [prev.outputPath] : [])];
        const c = stage.conversationId && store.conversations.get(stage.conversationId) || store.conversations.create({ assistantId: def.assistantId, workspace: run.workspace, access: 'edit', pinned_files: pinned, title: `${run.name}: ${def.name}` });
        c.workspace = run.workspace; c.access = 'edit'; c.pinned_files = pinned; store.conversations.save(c);
        stage.conversationId = c.id; stage.status = 'running'; stage.error = ''; stage.unapprovedInputs = !!prev && (prev.status !== 'approved' || !!prev.unapprovedInputs);
        store.runs.save(run);
        const prompt = def.prompt.replaceAll('{{sources}}', run.sources.map((p) => JSON.stringify(path.relative(run.workspace, p))).join(', ')).replaceAll('{{prev}}', prev ? JSON.stringify(path.relative(run.workspace, prev.outputPath)) : '');
        startRunTurn(run, stage, `${prompt}\n\nSave your final output as a Markdown file at ${JSON.stringify(path.relative(run.workspace, stage.outputPath))}.${stage.unapprovedInputs ? ' Clearly label it as based on unapproved inputs.' : ''}`);
        return send(res, 200, run);
      }
      if (operation === 'approve') {
        if (stage.status !== 'review' || running.has(stage.conversationId)) return send(res, 409, { error: 'The stage must be ready for review.' });
        if (!workspaceFile(stage.outputPath, run.workspace)) return send(res, 400, { error: 'The output file is missing.' });
        const name = String(store.settings.get().userName || '').trim();
        if (!name) return send(res, 400, { error: 'Set your name in Settings before approving.' });
        stage.approvedBy = name; stage.approvedAt = Date.now(); stampOutput(stage, name, stage.approvedAt); stage.status = 'approved';
        return send(res, 200, store.runs.save(run));
      }
      if (operation === 'rework') {
        if (!['review', 'approved'].includes(stage.status) || running.has(stage.conversationId)) return send(res, 409, { error: 'This stage cannot be sent back now.' });
        const later = run.stages.slice(index + 1);
        if (later.some((s) => s.status === 'running' || s.checkRunning || running.has(s.conversationId))) return send(res, 409, { error: 'Wait for later stages and checks to finish first.' });
        if (stage.status === 'approved' && workspaceFile(stage.outputPath, run.workspace)) fs.writeFileSync(stage.outputPath, fs.readFileSync(stage.outputPath, 'utf8').replace(/^> Approved by .* on .*\r?\n(?:\r?\n)?/, ''));
        stage.status = 'rework'; delete stage.approvedBy; delete stage.approvedAt;
        for (const downstream of later.filter((s) => s.status !== 'pending')) {
          if (workspaceFile(downstream.outputPath, run.workspace)) {
            fs.writeFileSync(downstream.outputPath, fs.readFileSync(downstream.outputPath, 'utf8').replace(/^> Approved by .* on .*\r?\n(?:\r?\n)?/, ''));
            labelUnapproved(downstream);
          }
          downstream.status = 'rework'; downstream.unapprovedInputs = true; delete downstream.approvedBy; delete downstream.approvedAt;
        }
        return send(res, 200, store.runs.save(run));
      }
      if (operation === 'check') {
        if (stage.status !== 'review' || stage.checkRunning) return send(res, 409, { error: 'The stage must be ready for review.' });
        const inputs = prev ? [prev.outputPath] : run.sources;
        if (![...inputs, stage.outputPath].every((p) => workspaceFile(p, run.workspace))) return send(res, 400, { error: 'A source or output file is missing.' });
        if (!store.assistants.get(pipeline.gateCheck.assistantId)) return send(res, 400, { error: 'The traceability assistant is missing.' });
        const c = store.conversations.create({ assistantId: pipeline.gateCheck.assistantId, workspace: run.workspace, access: 'read', pinned_files: [...inputs, stage.outputPath], title: `${run.name}: ${def.name} traceability` });
        stage.gateConversationId = c.id; stage.checkRunning = true; stage.checkSummary = ''; store.runs.save(run);
        const prompt = pipeline.gateCheck.prompt.replaceAll('{{prev}}', inputs.map((p) => JSON.stringify(path.relative(run.workspace, p))).join(', ')).replaceAll('{{current}}', JSON.stringify(path.relative(run.workspace, stage.outputPath)));
        startRunTurn(run, stage, prompt, true);
        return send(res, 200, run);
      }
      return send(res, 404, { error: 'Unknown stage action.' });
    }
  }
  if (resource === 'diff' && m === 'GET') {
    const ws = resolveWorkspace(url.searchParams.get('workspace'));
    const a = url.searchParams.get('a'), b = url.searchParams.get('b');
    if (!workspaceFile(a, ws) || !workspaceFile(b, ws)) return send(res, 400, { error: 'Choose two existing files in your project folder.' });
    return send(res, 200, { changes: await diffFiles(path.resolve(ws, a), path.resolve(ws, b)), limit: 500 });
  }
  if (resource === 'file-pair' && m === 'GET') {
    const ws = resolveWorkspace(url.searchParams.get('workspace')), file = url.searchParams.get('file'), mid = url.searchParams.get('message');
    if (!workspaceFile(file, ws)) return send(res, 400, { error: 'File not found in your project folder.' });
    const full = path.resolve(ws, file), parsed = path.parse(full);
    const original = path.join(parsed.dir, parsed.name.replace(/ \(updated\)$/i, '') + parsed.ext);
    const updated = path.join(parsed.dir, parsed.name + ' (updated)' + parsed.ext);
    const snapshot = mid && /^[a-zA-Z0-9-]+$/.test(mid) ? path.join(ws, '.lumen', 'snapshots', mid, path.relative(ws, full)) : '';
    const pair = workspaceFile(snapshot, ws) ? snapshot : original !== full && workspaceFile(original, ws) ? original : workspaceFile(updated, ws) ? updated : '';
    return send(res, 200, { pair });
  }
  if (resource === 'file-status' && m === 'POST') {
    const body = await json(req), ws = resolveWorkspace(body.workspace);
    if (!Array.isArray(body.paths)) return send(res, 400, { error: 'Provide a list of files.' });
    const exists = body.paths.map((p) => workspaceFile(p, ws));
    return send(res, 200, { exists, mtime: body.paths.map((p, i) => exists[i] ? fs.statSync(path.resolve(ws, p)).mtimeMs : null) });
  }
  if (resource === 'demo' && rid === 'install' && m === 'POST') {
    const pack = (await json(req)).pack || 'crm';
    let target;
    try { target = installDemo(pack); } catch (e) { return send(res, 400, { error: e.message }); }
    store.settings.set({ workspace: target, demoInstalled: target, demoPack: pack });
    return send(res, 200, { path: target, pack, files: fs.readdirSync(target).filter((f) => !f.startsWith('.')) });
  }
  if (resource === 'reset' && m === 'POST') { store.assistants.reset(); store.recipes.reset(); return send(res, 200, { ok: true }); }
  if (resource === 'settings' && m === 'PUT') return send(res, 200, store.settings.set(await json(req)));

  if (resource === 'schedules') {
    if (m === 'GET' && !rid) return send(res, 200, store.schedules.all().map((s) => ({ ...s, nextRunAt: s.enabled ? scheduler.nextDue(s, scheduler.dueFrom(s)).getTime() : null, running: scheduleRunner.isPending(s.id) })));
    if (m === 'POST' && rid && action === 'run-now') {
      if (!store.schedules.get(rid)) return send(res, 404, { error: 'Schedule not found.' });
      if (!scheduleRunner.runNow(rid)) return send(res, 409, { error: 'This schedule is already running or waiting to run.' });
      return send(res, 202, { ok: true });
    }
    if ((m === 'POST' && !rid) || (m === 'PUT' && rid && !action)) {
      const old = rid ? store.schedules.get(rid) : null;
      if (rid && !old) return send(res, 404, { error: 'Schedule not found.' });
      const body = await json(req);
      if (old && Object.keys(body).length === 1 && typeof body.enabled === 'boolean') {
        return send(res, 200, store.schedules.upsert({ id: rid, enabled: body.enabled, ...(!old.enabled && body.enabled ? { resumedAt: Date.now() } : {}) }));
      }
      const recipeId = body.recipeId ?? old?.recipeId;
      const recipe = store.recipes.get(recipeId);
      if (!recipe) return send(res, 400, { error: 'Choose an existing quick start.' });
      const when = body.when ?? old?.when;
      try { scheduler.validateWhen(when); } catch (e) { return send(res, 400, { error: e.message }); }
      const values = body.values ?? old?.values;
      if (!values || typeof values !== 'object' || Array.isArray(values) || Object.values(values).some((v) => typeof v !== 'string')) return send(res, 400, { error: 'Schedule answers must be text values.' });
      if ('enabled' in body && typeof body.enabled !== 'boolean') return send(res, 400, { error: 'Enabled must be true or false.' });
      if ('allowEdit' in body && typeof body.allowEdit !== 'boolean') return send(res, 400, { error: 'File permission must be true or false.' });
      const allowEdit = body.allowEdit ?? old?.allowEdit ?? false;
      if (old && recipeId !== old.recipeId && recipe.access === 'edit' && body.allowEdit !== true) return send(res, 400, { error: 'Explicitly allow saving files for the new quick start.' });
      if (recipe.access === 'edit' && !allowEdit) return send(res, 400, { error: 'Allow saving files to schedule this quick start.' });
      if (allowEdit && recipe.access !== 'edit') return send(res, 400, { error: 'Only quick starts that save files can receive this permission.' });
      const workspace = body.workspace ?? old?.workspace ?? resolveWorkspace();
      if (typeof workspace !== 'string' || !fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) return send(res, 400, { error: 'Choose an existing project folder.' });
      const enabled = body.enabled ?? old?.enabled ?? true;
      const item = { ...(old || {}), recipeId, values, workspace: path.resolve(workspace), when, allowEdit, enabled };
      if (old && !old.enabled && enabled) item.resumedAt = Date.now();
      if (old && body.when) item.resumedAt = Date.now();
      return send(res, 200, store.schedules.upsert(item));
    }
    if (m === 'DELETE' && rid && !action) { if (!store.schedules.get(rid)) return send(res, 404, { error: 'Schedule not found.' }); store.schedules.remove(rid); return send(res, 200, { ok: true }); }
  }

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
    if (m === 'POST' && rid && action === 'fork') {
      const c = store.conversations.get(rid); if (!c) return send(res, 404, { error: 'Not found' });
      const { uptoMessageId } = await json(req);
      // No uptoMessageId → an empty branch (used when branching before the first message).
      const idx = uptoMessageId ? c.messages.findIndex((x) => x.id === uptoMessageId) : -1;
      if (uptoMessageId && idx < 0) return send(res, 400, { error: "That message isn't in this chat any more." });
      const messages = JSON.parse(JSON.stringify(c.messages.slice(0, idx + 1))).map(({ feedback, ...x }) => ({ ...x, id: store.id(), copied: true })); // copied: insights skip them
      const fork = store.conversations.create({ assistantId: c.assistantId, access: c.access, workspace: c.workspace, pinned_files: c.pinned_files || [], title: `${c.title} (branch)`, messages, sessions: {}, forkedFrom: { id: c.id, messageId: uptoMessageId || null, title: c.title } });
      return send(res, 200, fork);
    }
    if (m === 'GET' && rid) { const c = store.conversations.get(rid); return c ? send(res, 200, { ...c, running: running.has(c.id) }) : send(res, 404, { error: 'Not found' }); }
    if (m === 'PATCH' && rid && action === 'messages' && sub) {
      const c = store.conversations.get(rid); if (!c) return send(res, 404, { error: 'Not found' });
      const msg = c.messages.find((x) => x.id === sub); if (!msg || msg.role !== 'assistant') return send(res, 404, { error: "That reply isn't in this chat any more." });
      const { feedback } = await json(req);
      if (!feedback || !feedback.rating) delete msg.feedback;
      else if (['up', 'down'].includes(feedback.rating)) {
        msg.feedback = { rating: feedback.rating, at: Date.now() };
        const reason = String(feedback.reason || '').trim().slice(0, 80), note = String(feedback.note || '').trim().slice(0, 2000);
        if (reason) msg.feedback.reason = reason;
        if (note) msg.feedback.note = note;
      } else return send(res, 400, { error: 'Unknown rating.' });
      store.conversations.save(c);
      return send(res, 200, { feedback: msg.feedback || null });
    }
    if (m === 'PATCH' && rid) { const c = store.conversations.get(rid); if (!c) return send(res, 404, {}); const p = await json(req); if ('pinned_files' in p && (!Array.isArray(p.pinned_files) || p.pinned_files.some((x) => typeof x !== 'string'))) return send(res, 400, { error: 'Pinned files must be a list of paths.' }); if ('unread' in p && typeof p.unread !== 'boolean') return send(res, 400, { error: 'Unread must be true or false.' }); for (const k of ['title', 'pinned', 'pinned_files', 'access', 'workspace', 'unread']) if (k in p) c[k] = p[k]; return send(res, 200, store.conversations.save(c)); }
    if (m === 'DELETE' && rid) { store.conversations.remove(rid); return send(res, 200, { ok: true }); }
  }

  if (resource === 'chat' && m === 'POST' && !rid) return handleChat(req, res);
  if (resource === 'chat' && action === 'stop' && m === 'POST') { running.get(rid)?.abort(); return send(res, 200, { ok: true }); }

  if (resource === 'export' && m === 'POST') {
    const { conversationId, messageId, format } = await json(req);
    if (!['docx', 'xlsx'].includes(format)) return send(res, 400, { error: 'Choose Word or Excel.' });
    const c = store.conversations.get(conversationId); if (!c) return send(res, 404, { error: 'That chat could not be found.' });
    const msg = c.messages.find((x) => x.id === messageId); if (!msg || !msg.content) return send(res, 404, { error: "That reply isn't in this chat any more." });
    const content = stripSuggestion(msg.content);
    if (format === 'xlsx' && !mdExport.hasTable(content)) return send(res, 400, { error: 'This reply has no tables' });
    const dir = path.join(resolveWorkspace(c.workspace), 'Exports');
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const stem = `${String(c.title || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/, '').slice(0, 80) || 'Lumen reply'} - ${day}`;
    let target = path.join(dir, `${stem}.${format}`);
    for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, `${stem} (${i}).${format}`);
    try {
      if (format === 'docx') fs.writeFileSync(target, await mdExport.markdownToDocx(content, { title: c.title }), { flag: 'wx' });
      else await mdExport.markdownTablesToXlsx(content, target);
    } catch (e) { return send(res, 500, { error: `Couldn't save the file: ${e.message}` }); }
    // Keep the file card after a reload. Skip while a reply is running: handleChat writes the messages back when it ends.
    if (!running.has(c.id)) { msg.files = [...new Set([...(msg.files || []), target])]; store.conversations.save(c); }
    return send(res, 200, { path: target, name: path.basename(target) });
  }

  if (resource === 'insights' && m === 'GET') return send(res, 200, insights());

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
    if (rid === 'browse' && m === 'GET') { try { return send(res, 200, browseFolder(url.searchParams.get('path') || '')); } catch (e) { return send(res, 400, { error: e.message }); } }
    if (rid === 'mkdir' && m === 'POST') {
      const { parent, name } = await json(req);
      const clean = String(name || '').trim().replace(/[<>:"/\\|?*]/g, '').replace(/[. ]+$/, '');
      if (!clean || !parent || !fs.existsSync(parent)) return send(res, 400, { error: 'Type a name for the new folder.' });
      const target = path.join(parent, clean);
      try { fs.mkdirSync(target, { recursive: true }); } catch (e) { return send(res, 400, { error: `Couldn't create the folder: ${e.message}` }); }
      return send(res, 200, { path: target });
    }
    if (rid === 'open' && m === 'POST') { const { path: p, workspace } = await json(req); const ws = resolveWorkspace(workspace); const target = p && (p === ws || inside(p, ws)) ? p : ws; if (fs.existsSync(target)) openPath(target); return send(res, 200, { ok: true }); }
    if (rid === 'files' && m === 'GET') { const ws = resolveWorkspace(url.searchParams.get('workspace')); const all = url.searchParams.has('all'); const files = listFolder(ws, 0, [], ws, all).sort((a, b) => b.mtime - a.mtime); return send(res, 200, { workspace: ws, files: all ? files : files.slice(0, 60) }); }
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
  scheduleRunner = scheduler.start({ runTurn, store, workspaceFile });
  const link = `http://localhost:${server.address().port}`;
  console.log(`\n  ✨ Lumen is running at ${link}\n`);
  if (process.argv.includes('--open')) openPath(link);
});
server.on('close', () => scheduleRunner?.stop());

module.exports = server;
