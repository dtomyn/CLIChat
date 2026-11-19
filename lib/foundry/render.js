// Turns a Contoso agent's reply (a summary line + a ```json result block) into readable Markdown for the chat.
// Facts come from the agent's own result JSON; nothing is reworded here.

const PREFERRED = ['id', 'requirement_id', 'control_id', 'entry_id', 'temp_id', 'uid', 'wbs', 'title', 'name', 'statement',
  'type', 'kind', 'category', 'priority', 'severity', 'band', 'status', 'decision', 'confidence', 'owner', 'due_date',
  'section_anchor', 'source', 'target', 'description', 'summary', 'rationale', 'recommendation'];
const SKIP_ARRAYS = new Set(['messages', 'artifacts', 'apply_results', 'errors', 'guardrail_findings', 'open_questions']);
const MAX_ROWS = 25;
const MAX_TABLES = 4;

function splitReply(text) {
  const s = String(text || '');
  const i = s.indexOf('```json');
  if (i < 0) return { summary: s.trim(), result: null };
  const body = s.slice(i + 7);
  const j = body.lastIndexOf('```'); // last fence: result strings may contain ``` themselves (e.g. mermaid)
  const jsonText = (j >= 0 ? body.slice(0, j) : body).trim();
  try { return { summary: s.slice(0, i).trim(), result: JSON.parse(jsonText) }; } catch { return { summary: s.trim(), result: null }; }
}

const humanize = (k) => String(k).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
function cell(v) {
  if (v == null) return '';
  let s;
  if (typeof v === 'object') s = Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? (x.id || x.title || x.uri || JSON.stringify(x)) : x)).join(', ')
    : (v.title || v.uri || v.id || JSON.stringify(v));
  else s = String(v);
  s = s.replace(/\s+/g, ' ').replace(/\|/g, '\\|');
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
}

function table(rows) {
  const keys = Object.keys(rows[0] || {});
  const filled = (k) => rows.some((r) => r[k] != null && r[k] !== '' && !(Array.isArray(r[k]) && !r[k].length));
  const cols = [...PREFERRED.filter((k) => keys.includes(k) && filled(k)), ...keys.filter((k) => !PREFERRED.includes(k) && filled(k) && rows.some((r) => typeof r[k] !== 'object'))].slice(0, 6);
  if (!cols.length) return '';
  const head = `| ${cols.map(humanize).join(' | ')} |\n|${cols.map(() => '---').join('|')}|`;
  const body = rows.slice(0, MAX_ROWS).map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`).join('\n');
  const more = rows.length > MAX_ROWS ? `\n\n_…and ${rows.length - MAX_ROWS} more in the full result below._` : '';
  return `${head}\n${body}${more}`;
}

/** Arrays of objects worth showing as tables: top level first, then one level down (e.g. requirement_set.requirements). */
function findTables(result) {
  const out = [];
  const visit = (obj, prefix, depth) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (SKIP_ARRAYS.has(k)) continue;
      if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) out.push({ key: prefix ? `${prefix} · ${humanize(k)}` : humanize(k), rows: v });
      else if (depth < 1 && v && typeof v === 'object' && !Array.isArray(v)) visit(v, humanize(k), depth + 1);
    }
  };
  visit(result, '', 0);
  return out.slice(0, MAX_TABLES); // the agent's own order (e.g. requirements before gaps)
}

function glance(result) {
  const counts = result.counts && typeof result.counts === 'object' ? result.counts : null;
  const simple = Object.entries(counts || {}).filter(([, v]) => typeof v === 'number' || typeof v === 'string');
  if (!simple.length) return '';
  return `**At a glance:** ${simple.map(([k, v]) => `${humanize(k)} **${v}**`).join(' · ')}`;
}

function renderReply(text) {
  const { summary, result } = splitReply(text);
  if (!result) return summary;
  const parts = [];
  if (summary) parts.push(summary);
  if (result.status === 'error') {
    parts.push((result.errors || []).map((e) => `- ${e}`).join('\n') || '- The agent stopped without saying why.');
  }
  const g = glance(result);
  if (g) parts.push(g);
  const guard = result.guardrail_findings || [];
  if (guard.length) parts.push(`> **Safety checks flagged ${guard.length} item${guard.length === 1 ? '' : 's'}:**\n${guard.map((f) => `> - ${f.title || f.description}`).join('\n')}`);
  for (const t of findTables(result)) parts.push(`#### ${t.key} (${t.rows.length})\n\n${table(t.rows)}`);
  const qs = result.open_questions || result.requirement_set?.open_questions || [];
  if (qs.length) parts.push(`#### Open questions\n\n${qs.slice(0, 15).map((q) => `- ${q}`).join('\n')}${qs.length > 15 ? `\n- …and ${qs.length - 15} more` : ''}`);
  const arts = result.artifacts || [];
  if (arts.length) parts.push(`_The agent also produced ${arts.map((a) => `**${a.name}**`).join(', ')}. In this demo those files stay in the agent's workspace in Microsoft Foundry._`);
  if (Array.isArray(result.apply_results) && result.apply_results.length) {
    const dry = result.apply_results.every((r) => r.status === 'dry_run');
    parts.push(dry ? '_Approved changes were checked but not written: this agent is in practice mode (no changes to real systems)._' : table(result.apply_results));
  }
  parts.push(`<details><summary>Full result from the agent</summary>\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n\n</details>`);
  return parts.join('\n\n');
}

module.exports = { renderReply, splitReply, table, findTables };
