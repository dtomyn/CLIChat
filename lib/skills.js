// Skills = a capability pack an assistant can switch on: instructions (SKILL.md) + the tools that back them.
// Lumen ships skills in ./skills/<id>/SKILL.md. The tools come from the bundled "office" MCP server.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'skills');
const MCP_SERVER = path.join(__dirname, '..', 'tools', 'office-mcp.js');

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
  return {
    id: meta.name || path.basename(path.dirname(file)),
    title: meta.title || meta.name, emoji: meta.emoji || '🧩', description: meta.description || '',
    extensions: list(meta.extensions).map((e) => e.toLowerCase()),
    readTools: list(meta.readTools), writeTools: list(meta.writeTools),
    body: (m ? m[2] : raw).trim(), raw, file,
  };
}

function all() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(DIR, d.name, 'SKILL.md'))).map((d) => parse(path.join(DIR, d.name, 'SKILL.md')));
}

/** Skills for a chat turn: the assistant's own, plus any implied by attached file types. */
function resolve(assistantSkills = [], attachments = []) {
  const skills = all();
  const ids = new Set(assistantSkills);
  for (const a of attachments) { const ext = path.extname(a).toLowerCase(); for (const s of skills) if (s.extensions.includes(ext)) ids.add(s.id); }
  return skills.filter((s) => ids.has(s.id));
}

/** Provider-neutral tool wiring for the chosen skills and access level. */
function toolConfig(skills, access, cwd) {
  if (!skills.length || access === 'chat') return null;
  const canWrite = access === 'edit' || access === 'full';
  const tools = new Set();
  for (const s of skills) { s.readTools.forEach((t) => tools.add(t)); if (canWrite) s.writeTools.forEach((t) => tools.add(t)); }
  return {
    servers: { office: { command: process.execPath, args: [MCP_SERVER], env: { OFFICE_MCP_ROOT: cwd, OFFICE_MCP_READONLY: canWrite ? '0' : '1' } } },
    allow: [...tools].map((t) => ({ server: 'office', tool: t })),
  };
}

function promptFor(skills, access) {
  if (!skills.length) return '';
  const head = access === 'chat'
    ? 'The user turned file access off for this chat ("Just chat"), so you cannot open their files. If they ask about a plan or workbook, ask them to switch "What can Lumen do?" to "Read my files".'
    : access === 'read' ? 'File access is read-only in this chat. If the user asks you to change or create a file, explain that they need to switch "What can Lumen do?" to "Create & edit files".' : '';
  return [head, ...skills.map((s) => `## Skill: ${s.title}\n\n${s.body}`)].filter(Boolean).join('\n\n');
}

module.exports = { all, resolve, toolConfig, promptFor, MCP_SERVER };
