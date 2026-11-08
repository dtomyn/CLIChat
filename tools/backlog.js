// Backlog → plan progress. Reads an Azure DevOps work-item export (.xlsx or .csv from a query), links items to plan tasks,
// and proposes each task's % complete from its items' states. Pure calculation: nothing is written here. The proposals are
// in the shape update_project_plan takes, so a person approves before the plan changes.

const path = require('path');
const excel = require('./excel');
const project = require('./project');

const HEADERS = {
  id: [/^(work item )?id$/i],
  type: [/^(work item )?type$/i],
  title: [/^title$/i],
  state: [/^state$/i],
  tags: [/^tags?$/i],
  points: [/story ?points|^effort$|^size$|original estimate/i],
  changed: [/state change date|^changed date$|^last updated/i],
  assigned: [/^assigned to$/i],
  plan: [/^plan task( id)?$|^mpp( task)?( id)?$/i], // optional custom column holding the plan task ID
  iteration: [/^iteration( path)?$|^sprint$/i],
  remaining: [/^remaining work$|^remaining( hours)?$/i],
  parent: [/^parent( title)?$|^epic( title)?$/i],
};

// Share of an item that counts as done, by state name. Anything not listed counts as 0. "Removed" items are left out entirely.
const DEFAULT_STATE_PERCENT = {
  done: 100, closed: 100, completed: 100, resolved: 100, accepted: 100,
  'ready for test': 75, 'in test': 75, testing: 75, 'in review': 75, review: 75,
  active: 50, doing: 50, 'in progress': 50, committed: 50, approved: 25,
  new: 0, proposed: 0, 'to do': 0, todo: 0, backlog: 0,
};
const EXCLUDED_STATES = new Set(['removed', 'cut', 'deleted', 'rejected']);
const FINISHED = (pct) => pct >= 100;
const DAY = 86400000;

const cellText = excel.cellText;

function headerMap(ws) {
  const headers = [];
  ws.getRow(1).eachCell((c, n) => { headers[n] = cellText(c).trim(); });
  const map = {};
  for (const [field, res] of Object.entries(HEADERS)) {
    const i = headers.findIndex((h, n) => h && res.some((re) => re.test(h)) && !Object.values(map).includes(n));
    if (i > 0) map[field] = i;
  }
  return { map, headers };
}

/** Rows of the backlog sheet as plain objects. The mapping sheet (if any) is read separately. */
async function readBacklog(file) {
  const wb = await excel.open(file);
  const sheets = wb.worksheets.filter((ws) => ws.state !== 'veryHidden');
  const isMap = (ws) => /^map/i.test(ws.name);
  const main = sheets.find((ws) => !isMap(ws) && headerMap(ws).map.state && headerMap(ws).map.id) || sheets.find((ws) => !isMap(ws));
  if (!main) { const e = new Error(`No backlog sheet found in "${path.basename(file)}".`); e.friendly = true; throw e; }
  const { map } = headerMap(main);
  if (!map.state || !map.id) { const e = new Error(`"${path.basename(file)}" needs at least "ID" and "State" columns (the usual Azure DevOps query export).`); e.friendly = true; throw e; }
  const items = [];
  main.eachRow({ includeEmpty: false }, (row, r) => {
    if (r === 1) return;
    const get = (f) => (map[f] ? cellText(row.getCell(map[f])).trim() : '');
    const id = get('id');
    if (!id) return;
    const pts = parseFloat(get('points'));
    const ch = get('changed');
    const rem = parseFloat(get('remaining'));
    items.push({
      id, type: get('type'), title: get('title'), state: get('state'), tags: get('tags'), points: Number.isFinite(pts) ? pts : null,
      changed: /^\d{4}-\d{2}-\d{2}/.test(ch) ? new Date(ch.slice(0, 10) + 'T00:00:00') : null, assigned: get('assigned'), planTask: get('plan'),
      iteration: get('iteration'), remaining: Number.isFinite(rem) ? rem : null, parent: get('parent'), row: r,
    });
  });
  // Optional mapping sheet: one column with the Azure DevOps ID, one with the plan task ID.
  const mapping = new Map();
  const ms = sheets.find(isMap);
  if (ms) {
    const hs = []; ms.getRow(1).eachCell((c, n) => { hs[n] = cellText(c).trim(); });
    const a = hs.findIndex((h) => /ado|work item|^id$|backlog/i.test(h || '')), b = hs.findIndex((h) => /plan|task|mpp/i.test(h || ''));
    if (a > 0 && b > 0) ms.eachRow({ includeEmpty: false }, (row, r) => { if (r > 1) { const k = cellText(row.getCell(a)).trim(), v = cellText(row.getCell(b)).trim(); if (k && v) mapping.set(k, v); } });
  }
  return { items, mapping, sheet: main.name, mappingSheet: ms?.name || null };
}

/** How an item names its plan task: a Plan task column, the mapping sheet, or a <prefix>-<task ID> tag (or title). */
function linker(mapping, tagPrefix) {
  const prefix = String(tagPrefix || 'MPP').replace(/[^\w-]/g, '');
  const tagRe = new RegExp(`(?:^|[^\\w])${prefix}[-_ ]?(\\d+)(?![\\w])`, 'i');
  return { prefix, ref: (it) => it.planTask || mapping.get(it.id) || tagRe.exec(it.tags)?.[1] || tagRe.exec(it.title)?.[1] || null };
}
const stateMapFor = (over) => ({ ...DEFAULT_STATE_PERCENT, ...Object.fromEntries(Object.entries(over || {}).map(([k, v]) => [k.toLowerCase(), +v])) });

/**
 * Read a backlog export and link each item to its plan task (by ID). Removed items are left out.
 * Returns { items: [{ ...item, taskId|null, pct }], sheet, mappingSheet, removed }.
 */
async function linkedItems(backlogFile, opts = {}) {
  const { items, mapping, sheet, mappingSheet } = await readBacklog(backlogFile);
  const { ref } = linker(mapping, opts.tagPrefix);
  const stateMap = stateMapFor(opts.stateMap);
  let removed = 0;
  const out = [];
  for (const it of items) {
    const st = it.state.toLowerCase();
    if (EXCLUDED_STATES.has(st)) { removed++; continue; }
    const r = ref(it);
    out.push({ ...it, taskId: r ? +String(r).replace(/\D/g, '') || null : null, pct: stateMap[st] ?? 0, knownState: st in stateMap });
  }
  return { items: out, sheet, mappingSheet, removed };
}

/**
 * Propose % complete for plan tasks from a backlog export.
 * opts: { tagPrefix: 'MPP' (items tagged MPP-23 belong to plan task #23), basis: 'state'|'points', stateMap: {state: percent},
 *         staleDays: 14, allowDecrease: false, statusDate }
 */
async function progressFromBacklog(planFile, backlogFile, opts = {}) {
  const p = project.load(planFile);
  const status = project.toDate(opts.statusDate) || p.statusDate || project.toDate(project.iso(new Date()));
  const { items, mapping, sheet, mappingSheet } = await readBacklog(backlogFile);
  const { prefix, ref: linkRef } = linker(mapping, opts.tagPrefix);
  const stateMap = stateMapFor(opts.stateMap);
  const byPoints = opts.basis === 'points';
  const staleDays = opts.staleDays != null ? +opts.staleDays : 14;
  const dq = { unmappedItems: [], unknownTaskRefs: [], summaryTargets: [], unknownStates: [], staleItems: [], noPoints: [], ignoredRemoved: 0 };
  const groups = new Map();

  for (const it of items) {
    const st = it.state.toLowerCase();
    if (EXCLUDED_STATES.has(st)) { dq.ignoredRemoved++; continue; }
    const ref = linkRef(it);
    const label = `${it.type ? it.type + ' ' : ''}${it.id} "${it.title}"`.trim();
    if (!ref) { dq.unmappedItems.push({ item: label, state: it.state }); continue; }
    const taskId = +String(ref).replace(/\D/g, '');
    const t = p.tasks.find((x) => x.id === taskId);
    if (!t) { dq.unknownTaskRefs.push({ item: label, ref: String(ref) }); continue; }
    if (t.summary) { dq.summaryTargets.push({ item: label, task: `#${t.id} ${t.name}` }); continue; }
    if (!(st in stateMap)) { dq.unknownStates.push({ item: label, state: it.state }); }
    if (byPoints && it.points == null) dq.noPoints.push({ item: label });
    if (!FINISHED(stateMap[st] ?? 0) && it.changed && (+status - +it.changed) / DAY > staleDays && (stateMap[st] ?? 0) > 0) dq.staleItems.push({ item: label, state: it.state, daysSinceChange: Math.round((+status - +it.changed) / DAY) });
    if (!groups.has(t.uid)) groups.set(t.uid, { t, items: [] });
    groups.get(t.uid).items.push({ ...it, pct: stateMap[st] ?? 0, weight: byPoints && it.points != null ? it.points : 1 });
  }

  const proposals = [], unchanged = [], decreases = [];
  for (const { t, items: its } of groups.values()) {
    const w = its.reduce((s, x) => s + x.weight, 0) || 1;
    const proposed = Math.round(its.reduce((s, x) => s + x.pct * x.weight, 0) / w);
    const row = { taskId: t.id, task: t.name, currentPercent: t.percent, percentComplete: proposed, items: its.length, done: its.filter((x) => FINISHED(x.pct)).length, basis: byPoints ? 'story points' : 'item state' };
    if (proposed === t.percent) unchanged.push({ taskId: t.id, task: t.name, percent: t.percent });
    else if (proposed < t.percent && !opts.allowDecrease) decreases.push({ ...row, note: 'Backlog says less is done than the plan. Not proposed; confirm with the tower lead.' });
    else proposals.push(row);
  }
  proposals.sort((a, b) => a.taskId - b.taskId);

  // Work that should be moving but has no linked backlog items.
  const horizon = new Date(+status + 14 * DAY);
  const noItems = p.tasks.filter((t) => !t.summary && !t.milestone && t.percent < 100 && !groups.has(t.uid) && t.start && t.start <= horizon)
    .map((t) => ({ taskId: t.id, task: t.name, start: project.iso(t.start), finish: project.iso(t.finish), percentComplete: t.percent, owner: t.resources.join(', ') }));
  const mapped = [...groups.values()].reduce((s, g) => s + g.items.length, 0);
  const total = items.length - dq.ignoredRemoved;
  const issues = dq.unmappedItems.length + dq.unknownTaskRefs.length + dq.summaryTargets.length + dq.unknownStates.length + dq.staleItems.length + dq.noPoints.length + noItems.length;

  return {
    plan: p.name, statusDate: project.iso(status), backlog: path.basename(backlogFile), sheet, ...(mappingSheet ? { mappingSheet } : {}),
    linking: `${prefix}-<task ID> tag or title${mappingSheet ? ', "' + mappingSheet + '" sheet' : ''}${items.some((i) => i.planTask) ? ', plan task column' : ''}`,
    basis: byPoints ? 'story points' : 'item state', stateMap,
    summary: `${items.length} backlog items; ${mapped} of ${total} linked to ${groups.size} plan task${groups.size === 1 ? '' : 's'}; ${proposals.length} % complete change${proposals.length === 1 ? '' : 's'} proposed, ${unchanged.length} unchanged, ${decreases.length} held back; ${issues} data-quality finding${issues === 1 ? '' : 's'}.`,
    proposals, unchanged, heldBack: decreases,
    dataQuality: { ...dq, tasksWithoutItems: noItems },
    next: 'Show the proposals and data-quality findings. After approval, pass proposals (taskId, percentComplete) to update_project_plan.',
  };
}

module.exports = { progressFromBacklog, readBacklog, linkedItems, DEFAULT_STATE_PERCENT };
