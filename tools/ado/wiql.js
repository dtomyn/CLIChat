// Builds WIQL from a structured filter, so the AI never writes raw WIQL (no injection, no syntax errors).
// Every literal is validated and quoted; field names come from a fixed list.

const { friendly } = require('./auth');

const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;
const CONTROL = /[\u0000-\u001f\u007f]/;

function text(v, what, max = 256) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (CONTROL.test(s)) throw friendly(`The ${what} contains characters Azure DevOps can't search for.`);
  if (s.length > max) throw friendly(`The ${what} is too long (${s.length} characters, max ${max}).`);
  return s;
}
const list = (v, what) => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(',')).map((x) => text(x, what, 128)).filter(Boolean).slice(0, 25);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const ORDER = {
  changed: '[System.ChangedDate] DESC',
  created: '[System.CreatedDate] DESC',
  priority: '[Microsoft.VSTS.Common.Priority] ASC, [System.ChangedDate] DESC',
  id: '[System.Id] ASC',
  backlog: '[Microsoft.VSTS.Common.BacklogPriority] ASC, [System.Id] ASC',
};

/**
 * @param {object} f  { text, types, states, excludeStates, assignedTo ('@me' | name | 'unassigned'), area, iteration ('@current' | path),
 *                      tags, changedSince (YYYY-MM-DD), changedBefore, parentId, ids, orderBy }
 */
function build(f = {}) {
  const where = ['[System.TeamProject] = @project'];
  const t = text(f.text, 'search text');
  if (t) where.push(`([System.Title] CONTAINS ${quote(t)} OR [System.Description] CONTAINS WORDS ${quote(t)})`);
  const types = list(f.types, 'work item type');
  if (types.length) where.push(`[System.WorkItemType] IN (${types.map(quote).join(', ')})`);
  const states = list(f.states, 'state');
  if (states.length) where.push(`[System.State] IN (${states.map(quote).join(', ')})`);
  const notStates = list(f.excludeStates, 'state');
  if (notStates.length) where.push(`[System.State] NOT IN (${notStates.map(quote).join(', ')})`);
  const who = text(f.assignedTo, 'person');
  if (/^@me$/i.test(who)) where.push('[System.AssignedTo] = @me');
  else if (/^unassigned$/i.test(who)) where.push("[System.AssignedTo] = ''");
  else if (who) where.push(`[System.AssignedTo] = ${quote(who)}`);
  const area = text(f.area, 'area path');
  if (area) where.push(`[System.AreaPath] UNDER ${quote(area)}`);
  const it = text(f.iteration, 'iteration');
  if (/^@current(iteration)?$/i.test(it)) where.push('[System.IterationPath] = @currentIteration');
  else if (it) where.push(`[System.IterationPath] UNDER ${quote(it)}`);
  for (const tag of list(f.tags, 'tag')) where.push(`[System.Tags] CONTAINS ${quote(tag)}`);
  for (const [key, op] of [['changedSince', '>='], ['changedBefore', '<']]) {
    if (!f[key]) continue;
    if (!DATE.test(String(f[key]))) throw friendly(`${key} must be a date like 2026-11-06.`);
    where.push(`[System.ChangedDate] ${op} ${quote(f[key])}`);
  }
  if (f.parentId != null && f.parentId !== '') {
    const p = Number(f.parentId);
    if (!Number.isInteger(p) || p <= 0) throw friendly('parentId must be a work item number.');
    where.push(`[System.Parent] = ${p}`);
  }
  if (f.ids) {
    const ids = (Array.isArray(f.ids) ? f.ids : [f.ids]).map(Number);
    if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw friendly('Work item IDs must be numbers.');
    if (ids.length) where.push(`[System.Id] IN (${ids.slice(0, 200).join(', ')})`);
  }
  const order = ORDER[f.orderBy] || ORDER.changed;
  return `SELECT [System.Id] FROM WorkItems WHERE ${where.join(' AND ')} ORDER BY ${order}`;
}

module.exports = { build, quote };
