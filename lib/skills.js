// Skills = a capability pack an assistant can switch on: instructions (SKILL.md) + the tools that back them.
// Lumen ships skills in ./skills/<id>/SKILL.md. Each skill's tools come from one of Lumen's bundled MCP servers
// (front matter `server:`): "office" (default, project-folder documents) or "ado" (Azure DevOps).

const fs = require('fs');
const path = require('path');
const workiq = require('./workiq');

const DIR = path.join(__dirname, '..', 'skills');
const MCP_SERVER = path.join(__dirname, '..', 'tools', 'office-mcp.js');
const ADO_SERVER = path.join(__dirname, '..', 'tools', 'ado-mcp.js');
const LUMEN_SERVER = path.join(__dirname, '..', 'tools', 'lumen-mcp.js');
// Microsoft's hosted WorkIQ service; each engine manages its own OAuth credentials.
// "lumen" answers questions about Lumen itself (agents, prompts, …); it is read-only and works even in "Just chat".
const SERVERS = { office: MCP_SERVER, ado: ADO_SERVER, lumen: LUMEN_SERVER, m365: null };

/** Reference files that ship with a skill (everything in its folder except SKILL.md), as forward-slash paths. */
function referencesOf(dir, sub = '') {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(path.join(dir, sub), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...referencesOf(dir, rel));
    else if (rel !== 'SKILL.md' && !e.name.startsWith('.')) out.push({ rel, file: path.join(dir, ...rel.split('/')) });
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
  return {
    id: meta.name || path.basename(path.dirname(file)),
    title: meta.title || meta.name, emoji: meta.emoji || '🧩', description: meta.description || '',
    server: meta.server in SERVERS ? meta.server : 'office',
    extensions: list(meta.extensions).map((e) => e.toLowerCase()),
    readTools: list(meta.readTools), writeTools: list(meta.writeTools),
    body: (m ? m[2] : raw).trim(), raw, file, references: referencesOf(path.dirname(file)),
  };
}

function all() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(DIR, d.name, 'SKILL.md'))).map((d) => parse(path.join(DIR, d.name, 'SKILL.md')));
}

/** Skills for a chat turn: the assistant's own (plus any the chat adds), plus any implied by attached file types. */
function resolve(assistantSkills = [], attachments = []) {
  const skills = all();
  const ids = new Set(assistantSkills);
  for (const a of attachments) { const ext = path.extname(a).toLowerCase(); for (const s of skills) if (s.extensions.includes(ext)) ids.add(s.id); }
  return skills.filter((s) => ids.has(s.id));
}

const adoReady = (ado) => !!(ado && ado.orgUrl && ado.project && ado.enabled !== false);
// WorkIQ is opt-in (Settings › Connections), and never runs unattended: its first-use consent prompt needs a person.
const workiqReady = (w, ctx = {}) => !!(w && w.enabled === true && !ctx.scheduled);

/**
 * Provider-neutral tool wiring for the chosen skills and access level.
 * ctx: { ado, workiq, providerId, dataDir, conversationId, scheduled }. Copilot owns connector authentication.
 * Credentials are never placed here: this object ends up on the AI CLI's command line.
 */
function toolConfig(skills, access, cwd, ctx = {}) {
  if (access === 'chat') skills = skills.filter((s) => s.server === 'lumen'); // reads only Lumen's own library, never the user's files
  if (!skills.length) return null;
  const canWrite = access === 'edit' || access === 'full';
  const servers = {}, allow = [];
  let managedWorkiq = false;
  for (const s of skills) {
    if (s.server === 'ado' && !adoReady(ctx.ado)) continue;
    if (s.server === 'm365' && !workiqReady(ctx.workiq, ctx)) continue;
    if (s.server === 'm365' && ctx.providerId === 'copilot-cli') { managedWorkiq = true; continue; }
    const tools = [...s.readTools, ...(canWrite ? s.writeTools : [])].filter((t) => !(ctx.scheduled && /^ado_propose_/.test(t)));
    for (const t of tools) if (!allow.some((a) => a.server === s.server && a.tool === t)) allow.push({ server: s.server, tool: t });
    if (servers[s.server]) continue;
    if (s.server === 'office') servers.office = { command: process.execPath, args: [MCP_SERVER], env: { OFFICE_MCP_ROOT: cwd, OFFICE_MCP_READONLY: canWrite ? '0' : '1' } };
    if (s.server === 'lumen') servers.lumen = { command: process.execPath, args: [LUMEN_SERVER], env: { LUMEN_DATA: ctx.dataDir || '' } };
    if (s.server === 'm365') {
      servers.m365 = workiq.server();
    }
    if (s.server === 'ado') {
      const a = ctx.ado;
      servers.ado = { command: process.execPath, args: [ADO_SERVER], env: {
        ADO_ORG_URL: a.orgUrl, ADO_PROJECT: a.project, ADO_TEAM: a.team || '', ADO_AUTH: a.auth === 'pat' ? 'pat' : 'azcli', ADO_WIKIS: (a.wikis || []).join(','),
        ADO_READONLY: canWrite ? '0' : '1', ADO_NO_PROPOSALS: ctx.scheduled ? '1' : '0', ADO_ROOT: cwd,
        LUMEN_CONVERSATION_ID: ctx.conversationId || '', LUMEN_DATA: ctx.dataDir || '',
        ...(process.env.ADO_MOCK ? { ADO_MOCK: process.env.ADO_MOCK } : {}),
      } };
    }
  }
  return Object.keys(servers).length || managedWorkiq ? { servers, allow, ...(managedWorkiq ? { workiq: 'managed' } : {}) } : null;
}

function promptFor(skills, access, ctx = {}) {
  if (!skills.length) return '';
  const fileSkills = skills.some((s) => s.server !== 'lumen'); // the always-on Lumen guide alone needs no access note
  const head = !fileSkills ? '' : access === 'chat'
    ? 'The user turned file access off for this chat ("Just chat"), so you cannot open their files. If they ask about a plan or workbook, ask them to switch "What can Lumen do?" to "Read my files".'
    : access === 'read' ? 'File access is read-only in this chat. If the user asks you to change or create a file, explain that they need to switch "What can Lumen do?" to "Create & edit files".' : '';
  const notes = [];
  if (skills.some((s) => s.server === 'ado')) {
    if (!adoReady(ctx.ado)) notes.push('Azure DevOps isn\'t connected yet, so its tools are unavailable. If the user asks about work items or the wiki, ask them to open Settings › Connections and set up Azure DevOps.');
    else {
      notes.push(`Connected Azure DevOps project: "${ctx.ado.project}"${ctx.ado.team ? `, team "${ctx.ado.team}"` : ''}.`);
      if (ctx.scheduled) notes.push('This is a scheduled check with nobody watching, so you can read Azure DevOps but not propose changes. Report findings instead.');
    }
  }
  if (skills.some((s) => s.server === 'm365') && !workiqReady(ctx.workiq, ctx)) {
    notes.push(ctx.scheduled ? 'This is a scheduled check, so Microsoft 365 (WorkIQ) tools are unavailable. Say so if the task needs SharePoint, email or Teams content.'
      : 'Microsoft 365 (WorkIQ) isn\'t turned on, so its tools are unavailable. If the user asks for SharePoint, Teams, email or meeting content, ask them to turn it on in Settings › Connections.');
  }
  if (skills.some((s) => s.server === 'm365') && workiqReady(ctx.workiq, ctx) && access !== 'chat') {
    notes.push(ctx.providerId === 'copilot-cli'
      ? 'Microsoft 365 connection: use only GitHub Copilot\'s existing managed "Work IQ" connector, supplied by Lumen as workiqmcp through GitHub\'s connector gateway. It is not the standalone m365 server, WorkIQ user server, or workiq plugin. Discover its actual tool names; never create a second connection or fall back to another identity after a denial.'
      : 'Microsoft 365 connection: use only the standalone m365 server. Its Work IQ CLI consent is separate from GitHub\'s managed Work IQ connector. Never substitute another connection if consent or access is denied.');
  }
  return [head, ...notes, ...skills.map((s) => `## Skill: ${s.title}\n\n${s.body}${(s.references || []).length ? `\n\nThis skill's reference files (open one when the steps above point to it): ${s.references.map((r) => `${r.rel} = ${r.file}`).join('; ')}` : ''}`)].filter(Boolean).join('\n\n');
}

module.exports = { referencesOf, all, resolve, toolConfig, promptFor, adoReady, workiqReady, MCP_SERVER, ADO_SERVER, LUMEN_SERVER, GUIDE: 'lumen-guide' };
