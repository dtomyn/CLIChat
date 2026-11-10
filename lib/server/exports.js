// Lumen server: Agent drafting, VS Code / Microsoft 365 Copilot exports and sample packs.
const fs = require('fs');
const path = require('path');
const store = require('../store');
const registry = require('../../providers');
const skills = require('../skills');
const copilotExport = require('../copilot-export');
const ROOT = path.join(__dirname, '../..');
const { resolveWorkspace, slug } = require('./workspace');

async function draftAssistant(description) {
  const provider = registry.get(store.settings.get().providerId) || registry.get('claude-cli');
  const raw = await provider.complete({ prompt: `Design a helpful AI assistant persona for business users based on this description:\n\n"${description}"\n\nReturn ONLY minified JSON with keys: name (2-3 words), emoji (one emoji), tagline (under 8 words), instructions (a 4-6 sentence system prompt in second person: "You are..."), starters (array of 3 short example requests a user might type), skills (array of skill ids this assistant clearly needs, chosen only from: ${skills.all().map((s) => `"${s.id}" = ${s.description}`).join('; ')}; empty array if none). No markdown fences.` });
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Could not draft the assistant — try describing it differently.');
  return JSON.parse(m[0]);
}

/** Write the files that make assistants + skills + the office tools work in VS Code and the CLIs (Claude Code and GitHub Copilot). */
function writeVsCodeKit(ws, assistants) {
  const written = [];
  const put = (rel, content) => { const f = path.join(ws, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); written.push(f); };
  const used = new Set(assistants.flatMap((a) => a.skills || []));
  // Skills (with their reference files) and agents for .claude and .github.
  for (const f of copilotExport.vsCodeKitFiles(assistants, skills.all())) put(f.rel, f.content);
  if (used.size) {
    const server = { command: 'node', args: [skills.MCP_SERVER] };
    // Outside Lumen there are no Approve cards, so the Azure DevOps tools are exported read-only. No credentials are written.
    const ado = store.settings.get().ado;
    const adoServer = used.has('azure-devops') && skills.adoReady(ado) ? { type: 'stdio', command: 'node', args: [skills.ADO_SERVER], env: { ADO_ORG_URL: ado.orgUrl, ADO_PROJECT: ado.project, ADO_TEAM: ado.team || '', ADO_AUTH: ado.auth === 'pat' ? 'pat' : 'azcli', ADO_WIKIS: (ado.wikis || []).join(','), ADO_READONLY: '1', LUMEN_DATA: store.DATA } } : null;
    put('.mcp.json', JSON.stringify({ mcpServers: { office: { type: 'stdio', ...server, env: { OFFICE_MCP_ROOT: ws } }, ...(adoServer ? { ado: adoServer } : {}) } }, null, 2));
    put(path.join('.vscode', 'mcp.json'), JSON.stringify({ servers: { office: { type: 'stdio', ...server, env: { OFFICE_MCP_ROOT: '${workspaceFolder}' } }, ...(adoServer ? { ado: adoServer } : {}) } }, null, 2));
  }
  return written;
}

function exportAssistant(a, workspace) {
  const ws = resolveWorkspace(workspace);
  const files = writeVsCodeKit(ws, [a]);
  const agentFile = (dir, ext) => files.find((f) => f.endsWith(path.join(dir, 'agents', `${slug(a.name)}${ext}`)));
  return { files, claude: agentFile('.claude', '.md'), github: agentFile('.github', '.agent.md'), workspace: ws };
}

/** The three engineering skill packs (developer, test automation, pipeline readiness) into a code repository folder. */
function exportEngineeringPacks(folder) {
  if (!folder) throw new Error('Choose the code repository folder first.');
  const ws = path.resolve(String(folder));
  if (!fs.existsSync(ws) || !fs.statSync(ws).isDirectory()) throw new Error("That folder doesn't exist.");
  const agents = copilotExport.ENGINEERING_PACKS.map((id) => store.assistants.get(id)).filter(Boolean);
  if (!agents.length) throw new Error('The engineering agents were removed. Restore the built-in agents in Settings first.');
  const files = writeVsCodeKit(ws, agents);
  const readme = path.join(ws, '.github', 'Engineering skill packs.md');
  fs.writeFileSync(readme, copilotExport.ENGINEERING_README(agents));
  return { folder: ws, agents: agents.map((a) => a.name), files: [...files, readme], readme };
}

// Sample packs offered on the home screen. Each is copied into a sibling of the user's project folder.
const PACKS = {
  crm: { dir: path.join(ROOT, 'demo'), folder: 'Contoso CRM Migration (demo)', assistants: ['schedule-analyst', 'ask-the-plan', 'budget-controller', 'project-partner'] },
  aidlc: { dir: path.join(ROOT, 'samples', 'aidlc'), folder: 'Online Permit Renewal (AIDLC sample)', assistants: ['requirements-refiner', 'functional-designer', 'technical-designer', 'story-writer', 'traceability-analyst'] },
  data: { dir: path.join(ROOT, 'samples', 'data'), folder: 'Permit Applications (data sample)', assistants: ['data-profiler', 'mapping-analyst', 'data-engineer'] },
  security: { dir: path.join(ROOT, 'samples', 'security'), folder: 'Permit Renewal Security (SA&A sample)', assistants: ['security-control-mapper', 'security-documentation', 'cae-evidence'] },
  change: { dir: path.join(ROOT, 'samples', 'change'), folder: 'Permit Renewal Change (change sample)', assistants: ['change-impact-analyst', 'training-content', 'bilingual-reviewer'] },
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
  const pack = Object.hasOwn(PACKS, packId) ? PACKS[packId] : null;
  if (!pack || !fs.existsSync(pack.dir)) throw new Error(`The ${packId} sample isn't available in this copy of Lumen.`);
  const base = resolveWorkspace(store.settings.get().workspace);
  const parent = Object.values(PACKS).some((p) => path.basename(base) === p.folder) ? path.dirname(base) : base;
  const target = path.join(parent, pack.folder);
  copyMissing(pack.dir, target);
  writeVsCodeKit(target, store.assistants.all().filter((a) => pack.assistants.includes(a.id)));
  return target;
}

module.exports = { draftAssistant, exportAssistant, exportEngineeringPacks, installDemo };
