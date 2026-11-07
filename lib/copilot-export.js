// "Export to Copilot": turn Lumen agents and prompts into things people can bring into Microsoft 365 Copilot.
//
// Agents → a declarative agent (the same fields Copilot's Agent Builder asks for: name, description,
// instructions, starter prompts) in two forms:
//   1. "Copy into Agent Builder.txt"   — paste-ready text for anyone with Microsoft 365 Copilot (no IT needed)
//   2. "<name> (Teams app).zip"         — an app package (manifest.json + declarativeAgent.json + icons) IT can
//                                         upload or validate with the Microsoft 365 Agents Toolkit
// Prompts → one Markdown file of plain prompts ready to save into Copilot's prompt gallery.
//
// Anything Lumen-only (skills backed by the local office tools, editing files in the project folder) is listed
// as "not carried over" so nobody is surprised on switch-over day.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const JSZip = require('jszip');

const FOLDER = 'Microsoft 365 Copilot';
const LIMITS = { name: 100, description: 1000, instructions: 8000, starters: 6, shortName: 30, shortDescription: 80 };
const COLORS = { violet: '#7c5cff', teal: '#12a594', amber: '#f59e0b', rose: '#e5487a', blue: '#3b6cf5', green: '#2f9e54', slate: '#556070' };

const clip = (s, n) => { s = String(s || '').trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
const fileSafe = (s) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/, '').slice(0, 80) || 'Agent';
// Stable app id per agent so re-exporting updates the same app instead of creating a new one.
const stableUuid = (seed) => {
  const h = crypto.createHash('sha1').update(`lumen-agent:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// ---------------------------------------------------------------- tiny PNG writer (icons for the app package)
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x, y); raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4); }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// color.png: 192×192 full-bleed agent colour with a white four-point spark. outline.png: 32×32 white spark on transparent.
const inSpark = (x, y, size) => { const c = (size - 1) / 2, dx = Math.abs(x - c) / (size * 0.36), dy = Math.abs(y - c) / (size * 0.36); return Math.sqrt(dx) + Math.sqrt(dy) <= 1; };
const colorIcon = (hex) => { const [r, g, b] = hexRgb(hex); return png(192, (x, y) => (inSpark(x, y, 192) ? [255, 255, 255, 255] : [r, g, b, 255])); };
const outlineIcon = () => png(32, (x, y) => (inSpark(x, y, 32) ? [255, 255, 255, 255] : [0, 0, 0, 0]));

// ---------------------------------------------------------------- agents
/** What this agent does in Lumen that Microsoft 365 Copilot won't do the same way. */
function lumenOnly(agent, skillList) {
  const out = (agent.skills || []).map((id) => skillList.find((s) => s.id === id)).filter(Boolean).map((s) => `${s.title} skill (uses Lumen's local document tools)`);
  if (agent.access === 'edit') out.push('Creating and editing files directly in your project folder');
  return out;
}

function starters(agent) {
  return (agent.starters || []).filter((s) => String(s).trim()).slice(0, LIMITS.starters).map((text) => ({ title: clip(text.split(/[.?!:]/)[0], 50), text: String(text).trim() }));
}

function declarativeAgent(agent) {
  return {
    $schema: 'https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.3/schema.json',
    version: 'v1.3',
    name: clip(agent.name, LIMITS.name),
    description: clip(agent.tagline || agent.name, LIMITS.description),
    instructions: clip(agent.instructions || `You are ${agent.name}, a helpful assistant.`, LIMITS.instructions),
    conversation_starters: starters(agent),
  };
}

function appManifest(agent) {
  const desc = agent.tagline || `${agent.name}, brought over from Lumen.`;
  return {
    $schema: 'https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json',
    manifestVersion: '1.19',
    version: '1.0.0',
    id: stableUuid(agent.id || agent.name),
    developer: {
      name: 'Your organization (edit before publishing)',
      websiteUrl: 'https://www.example.com',
      privacyUrl: 'https://www.example.com/privacy',
      termsOfUseUrl: 'https://www.example.com/terms',
    },
    name: { short: clip(agent.name, LIMITS.shortName), full: clip(agent.name, 100) },
    description: { short: clip(desc, LIMITS.shortDescription), full: clip(`${desc}\n\nExported from Lumen.`, 4000) },
    icons: { color: 'color.png', outline: 'outline.png' },
    accentColor: COLORS[agent.color] || COLORS.blue,
    copilotAgents: { declarativeAgents: [{ id: 'declarativeAgent', file: 'declarativeAgent.json' }] },
  };
}

function agentBuilderText(agent, skillList) {
  const da = declarativeAgent(agent);
  const missing = lumenOnly(agent, skillList);
  return [
    `${agent.name} — ready for Microsoft 365 Copilot`,
    '='.repeat(60),
    '',
    'In Microsoft 365 Copilot, open Agents › Create agent, choose Configure, and paste each field below.',
    '',
    `NAME\n${da.name}`,
    '',
    `DESCRIPTION\n${da.description}`,
    '',
    `INSTRUCTIONS\n${da.instructions}`,
    '',
    `STARTER PROMPTS\n${da.conversation_starters.length ? da.conversation_starters.map((s) => `- Title: ${s.title}\n  Message: ${s.text}`).join('\n') : '(none)'}`,
    '',
    'KNOWLEDGE\nAdd the OneDrive or SharePoint folder that holds the documents you use with this agent in Lumen.',
    '',
    missing.length ? `NOT CARRIED OVER (Lumen only)\n${missing.map((m) => `- ${m}`).join('\n')}\nCopilot can still read and summarise these files, but plan for these steps to be manual.` : 'NOT CARRIED OVER\nNothing: this agent works the same way in Copilot.',
    '',
  ].join('\n');
}

async function writeAgent(agent, root, skillList) {
  const dir = path.join(root, 'Agents', fileSafe(agent.name));
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    'manifest.json': JSON.stringify(appManifest(agent), null, 2),
    'declarativeAgent.json': JSON.stringify(declarativeAgent(agent), null, 2),
    'color.png': colorIcon(COLORS[agent.color] || COLORS.blue),
    'outline.png': outlineIcon(),
  };
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  const builder = path.join(dir, 'Copy into Agent Builder.txt');
  const pkg = path.join(dir, `${fileSafe(agent.name)} (Teams app).zip`);
  const text = agentBuilderText(agent, skillList);
  fs.writeFileSync(builder, text);
  fs.writeFileSync(pkg, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return { agent: agent.name, folder: dir, builder, package: pkg, text, lumenOnly: lumenOnly(agent, skillList) };
}

const README = `# Bringing your Lumen work to Microsoft 365 Copilot

Lumen uses the same ideas as Microsoft 365 Copilot, so most of what you've built carries straight over.

| In Lumen | In Microsoft 365 Copilot |
|---|---|
| Agents | Agents (Create agent › Configure) |
| Prompt gallery | Prompt gallery (save a prompt from any chat) |
| Scheduled prompts | Scheduled prompts |
| Notebook (your project folder) | Notebooks, and files in OneDrive / SharePoint |
| Type / to reference a file | Type / to reference a file |

## Agents

Each folder in **Agents** has two ways in:

1. **Copy into Agent Builder.txt**: anyone with Microsoft 365 Copilot can paste these fields into
   *Agents › Create agent › Configure*. No IT help needed.
2. **(Teams app).zip**: an app package (manifest.json, declarativeAgent.json and icons). Before uploading,
   your Microsoft 365 admin should fill in the developer details in manifest.json and validate the package
   with the Microsoft 365 Agents Toolkit.

## Prompts

**Prompts.md** lists every Lumen prompt as plain text. Words in [square brackets] are the blanks Lumen used to
ask you about. Fill them in, then use *Save prompt* in Copilot to keep the ones you use often.

## What doesn't carry over

Some Lumen features run on this computer and aren't part of Microsoft 365 Copilot. In Lumen they're marked
**Lumen only**: the Microsoft Project, Excel, delivery-lifecycle and traceability skills, lifecycle runs,
before/after file comparisons, and editing files directly in your project folder.
`;

async function exportAgents(agents, workspace, skillList) {
  const root = path.join(workspace, FOLDER);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), README);
  const results = [];
  for (const a of agents) results.push(await writeAgent(a, root, skillList));
  return { folder: root, agents: results };
}

// ---------------------------------------------------------------- prompts
/** A Lumen prompt template as plain text: {{key}} becomes [Field label]. */
function promptText(recipe) {
  const label = (key) => (recipe.fields || []).find((f) => f.key === key)?.label || key;
  return String(recipe.template || '').replace(/\{\{(\w+)\}\}/g, (_, k) => `[${label(k).replace(/[[\]]/g, '')}]`);
}

function exportPrompts(recipes, agents, workspace) {
  const root = path.join(workspace, FOLDER);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), README);
  const byCat = new Map();
  for (const r of recipes) { const c = r.category || 'Other'; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(r); }
  const agentName = (id) => agents.find((a) => a.id === id)?.name;
  const md = ['# Lumen prompts for Microsoft 365 Copilot', '', 'Fill in the [blanks], paste into Copilot, then choose **Save prompt** to keep it in your prompt gallery.', ''];
  for (const [cat, list] of byCat) {
    md.push(`## ${cat}`, '');
    for (const r of list) {
      md.push(`### ${r.emoji ? `${r.emoji} ` : ''}${r.name}`, '');
      if (r.description) md.push(`*${r.description}*`, '');
      const who = agentName(r.assistantId);
      if (who && r.assistantId !== 'lumen') md.push(`Use with the **${who}** agent.`, '');
      md.push('```text', promptText(r), '```', '');
    }
  }
  const file = path.join(root, 'Prompts.md');
  fs.writeFileSync(file, md.join('\n'));
  return { folder: root, file, count: recipes.length };
}

module.exports = { FOLDER, exportAgents, exportPrompts, declarativeAgent, appManifest, agentBuilderText, promptText, lumenOnly, png };
