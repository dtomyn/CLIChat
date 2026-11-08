// Delivery scenarios for a Microsoft Project plan: "what if UAT slips two weeks?", "what if we add a tester?",
// "what if we drop that dependency?". Reschedules a copy of the plan forward through its links (FS/SS/FF/SF with lags,
// on the same Monday-to-Friday calendar as tools/project.js) and compares it with the same calculation without the changes.
// Read-only: nothing is written. Saving an approved scenario goes through update_project_plan, which writes an "(updated)" copy.

const path = require('path');
const project = require('./project');

const { iso, toDate, workdaysBetween, addWorkdays, isWorkday } = project;
const DAY = 86400000;
const sgn = (n) => (n > 0 ? `+${n}` : String(n));
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });

function subWorkdays(d, n) { let x = new Date(d); let k = 0; while (k < n) { x = new Date(+x - DAY); if (isWorkday(x)) k++; } return x; }

function findTask(p, ref) {
  if (ref == null || ref === '') return null;
  const s = String(ref).trim().replace(/^#/, '');
  if (/^\d+$/.test(s)) return p.tasks.find((t) => t.id === +s) || null;
  const l = s.toLowerCase();
  return p.tasks.find((t) => t.name.toLowerCase() === l) || p.tasks.find((t) => t.name.toLowerCase().includes(l)) || null;
}

/** The plan as a network on working-day indices, ready to be rescheduled. */
function network(p) {
  const leaves = p.tasks.filter((t) => !t.summary && t.start && t.finish);
  if (!leaves.length) throw friendly('This plan has no scheduled tasks to model.');
  let origin = leaves.reduce((m, t) => (t.start < m ? t.start : m), leaves[0].start);
  while (!isWorkday(origin)) origin = new Date(+origin + DAY);
  const idx = (d) => workdaysBetween(origin, d);
  const dateAt = (i) => (i >= 0 ? addWorkdays(origin, i) : subWorkdays(origin, -i));
  const nodes = new Map();
  for (const t of leaves) {
    const s0 = idx(t.start), f0 = Math.max(s0, idx(t.finish));
    nodes.set(t.uid, {
      t, s0, f0, span: f0 - s0, milestone: t.milestone || (t.durationDays === 0 && f0 === s0),
      mode: t.percent >= 100 ? 'fixed' : t.percent > 0 ? 'started' : 'free', floor: null, delay: 0, preds: [],
    });
  }
  // Links to a summary task stand for links to every scheduled task beneath it.
  const under = (s) => p.tasks.filter((x) => !x.summary && nodes.has(x.uid) && x.wbs.startsWith(`${s.wbs}.`)).map((x) => x.uid);
  for (const n of nodes.values()) {
    for (const pr of n.t.preds) {
      const src = p.byUid.get(pr.uid);
      if (!src) continue;
      const lag = Math.round(pr.lagDays || 0);
      for (const u of src.summary ? under(src) : nodes.has(pr.uid) ? [pr.uid] : []) n.preds.push({ uid: u, type: pr.type, lag });
    }
  }
  return { p, nodes, origin, idx, dateAt };
}

function topoOrder(nodes) {
  const indeg = new Map([...nodes.keys()].map((k) => [k, 0]));
  const succ = new Map([...nodes.keys()].map((k) => [k, []]));
  for (const [k, n] of nodes) for (const l of n.preds) { indeg.set(k, indeg.get(k) + 1); succ.get(l.uid).push(k); }
  const queue = [...nodes.keys()].filter((k) => indeg.get(k) === 0);
  const order = [];
  while (queue.length) {
    const k = queue.shift(); order.push(k);
    for (const s of succ.get(k)) { indeg.set(s, indeg.get(s) - 1); if (indeg.get(s) === 0) queue.push(s); }
  }
  const looped = [...nodes.keys()].filter((k) => !order.includes(k));
  return { order, looped, succ };
}

/** Forward pass (earliest dates) then backward pass (float). Mutates nothing outside the returned maps. */
function schedule(net, nodes) {
  const { order, looped } = topoOrder(nodes);
  const s = new Map(), f = new Map();
  for (const k of looped) { const n = nodes.get(k); s.set(k, n.s0); f.set(k, n.s0 + n.span); }
  for (const k of order) {
    const n = nodes.get(k);
    let start;
    if (n.mode !== 'free') start = n.s0;
    else {
      start = n.preds.length ? -Infinity : n.s0;
      for (const l of n.preds) {
        const ps = s.get(l.uid), pf = f.get(l.uid);
        const need = l.type === 'SS' ? ps + l.lag : l.type === 'FF' ? pf + l.lag - n.span : l.type === 'SF' ? ps + l.lag - n.span : pf + l.lag + (n.milestone ? 0 : 1);
        start = Math.max(start, need);
      }
      if (n.floor != null) start = Math.max(start, n.floor);
      if (!Number.isFinite(start)) start = n.s0;
      start += n.delay;
    }
    s.set(k, start); f.set(k, start + n.span);
  }
  // Backward pass: the latest each task can finish without moving the project finish.
  const end = Math.max(...f.values());
  const lf = new Map();
  const succs = new Map([...nodes.keys()].map((k) => [k, []]));
  for (const [k, n] of nodes) for (const l of n.preds) succs.get(l.uid).push({ k, ...l });
  for (const k of [...order].reverse()) {
    const n = nodes.get(k);
    let late = end;
    for (const sc of succs.get(k)) {
      const m = nodes.get(sc.k);
      if (!lf.has(sc.k)) continue;
      const yLf = lf.get(sc.k), yLs = yLf - m.span;
      const lim = sc.type === 'SS' ? yLs - sc.lag + n.span : sc.type === 'FF' ? yLf - sc.lag : sc.type === 'SF' ? yLf - sc.lag + n.span : yLs - sc.lag - (m.milestone ? 0 : 1);
      late = Math.min(late, lim);
    }
    lf.set(k, late);
  }
  const float = new Map([...nodes.keys()].map((k) => [k, lf.has(k) ? Math.max(0, lf.get(k) - f.get(k)) : null]));
  return { s, f, float, end, looped };
}

/** Daily load per person over [fromIdx, end] for unfinished work, and the days each person is over their maximum. */
function overload(net, nodes, run, from, maxUnits) {
  const p = net.p;
  const load = new Map();
  for (const a of p.assignments) {
    const n = nodes.get(a.taskUid), r = p.resByUid.get(a.resourceUid);
    if (!n || !r || r.type !== 'Work' || n.t.percent >= 100) continue;
    const s = Math.max(from, run.s.get(a.taskUid)), f = run.f.get(a.taskUid);
    if (f < s) continue;
    if (!load.has(r.name)) load.set(r.name, new Map());
    const m = load.get(r.name);
    for (let i = s; i <= f; i++) { const d = m.get(i) || { units: 0, tasks: new Set() }; d.units += a.units; d.tasks.add(`#${n.t.id} ${n.t.name}`); m.set(i, d); }
  }
  const over = new Map();
  for (const [name, m] of load) {
    const cap = maxUnits(name);
    over.set(name, new Map([...m].filter(([, d]) => d.units > cap + 1e-6)));
  }
  return over;
}

function describe(c) {
  if (c.removeDependency) { const d = c.removeDependency; return typeof d === 'string' ? `remove the link ${d}` : `remove the link ${d.from} → ${d.to}`; }
  if (c.resource) return `${c.unitsDelta > 0 ? 'add' : 'take away'} ${Math.abs(Math.round(+c.unitsDelta * 100))}% capacity for ${c.resource}${c.task ? ` on ${c.task}` : ''}`;
  if (c.startNoEarlierThan) return `${c.task} starts no earlier than ${c.startNoEarlierThan}`;
  if (c.durationDelta != null) return `${c.task} ${sgn(+c.durationDelta)} working days`;
  return JSON.stringify(c);
}

/**
 * Model a scenario on a copy of the plan. changes: [
 *   { task, durationDelta }            working days added to (or taken off) a task
 *   { task, startNoEarlierThan }        YYYY-MM-DD
 *   { resource, unitsDelta, task? }     e.g. +0.5 = another person at half time; shortens (or lengthens) the remaining work on their tasks
 *   { removeDependency: { from, to } }  or "from->to", task IDs or names
 * ]  opts: { name, statusDate }
 */
function runScenario(planFile, changes = [], opts = {}) {
  const p = project.load(planFile);
  const status = toDate(opts.statusDate) || p.statusDate || toDate(iso(new Date()));
  const net = network(p);
  const base = new Map([...net.nodes].map(([k, n]) => [k, { ...n, preds: n.preds.map((l) => ({ ...l })) }]));
  const alt = new Map([...net.nodes].map(([k, n]) => [k, { ...n, preds: n.preds.map((l) => ({ ...l })) }]));
  const extraUnits = new Map();
  const applied = [], warnings = [];
  const label = (t) => `#${t.id} ${t.name}`;

  for (const c of [].concat(changes || [])) {
    if (!c || typeof c !== 'object') continue;
    const what = describe(c);
    if (c.removeDependency) {
      const d = c.removeDependency;
      const [fromRef, toRef] = typeof d === 'string' ? d.split(/\s*(?:->|→|>|,)\s*/) : [d.from, d.to];
      const from = findTask(p, fromRef), to = findTask(p, toRef);
      if (!from || !to) { warnings.push(`Couldn't find ${!from ? `"${fromRef}"` : `"${toRef}"`} for "${what}".`); continue; }
      const n = alt.get(to.uid);
      const fromUids = from.summary ? p.tasks.filter((x) => x.wbs.startsWith(`${from.wbs}.`)).map((x) => x.uid) : [from.uid];
      const before = n ? n.preds.length : 0;
      if (n) n.preds = n.preds.filter((l) => !fromUids.includes(l.uid));
      if (!n || n.preds.length === before) { warnings.push(`${label(to)} doesn't depend on ${label(from)}, so "${what}" changes nothing.`); continue; }
      applied.push({ change: `Remove the link ${label(from)} → ${label(to)}` });
      continue;
    }
    if (c.resource) {
      const r = p.resources.find((x) => x.name.toLowerCase() === String(c.resource).toLowerCase()) || p.resources.find((x) => x.name.toLowerCase().includes(String(c.resource).toLowerCase()));
      const delta = +c.unitsDelta;
      if (!r) { warnings.push(`No resource called "${c.resource}" in the plan.`); continue; }
      if (!Number.isFinite(delta) || !delta) { warnings.push(`"${what}" needs unitsDelta, e.g. 0.5 for another person at half time.`); continue; }
      const only = c.task != null ? findTask(p, c.task) : null;
      if (c.task != null && !only) { warnings.push(`Couldn't find task "${c.task}".`); continue; }
      const touched = [];
      for (const a of p.assignments.filter((x) => x.resourceUid === r.uid)) {
        const n = alt.get(a.taskUid);
        if (!n || n.mode === 'fixed' || n.milestone || (only && n.t.uid !== only.uid)) continue;
        const total = p.assignments.filter((x) => x.taskUid === a.taskUid && p.resByUid.get(x.resourceUid)?.type === 'Work').reduce((s, x) => s + x.units, 0);
        if (total + delta <= 0) { warnings.push(`Removing ${Math.round(-delta * 100)}% from ${label(n.t)} leaves nobody on it; skipped.`); continue; }
        const days = n.span + 1, remaining = days * (1 - n.t.percent / 100);
        const newSpan = Math.max(0, Math.round(days - remaining + remaining * (total / (total + delta))) - 1);
        if (newSpan !== n.span) touched.push(`${label(n.t)} ${n.span + 1} → ${newSpan + 1} days`);
        n.span = newSpan;
      }
      if (!only) extraUnits.set(r.name, (extraUnits.get(r.name) || 0) + delta);
      applied.push({ change: `${delta > 0 ? 'Add' : 'Take away'} ${Math.abs(Math.round(delta * 100))}% capacity ${delta > 0 ? 'to' : 'from'} ${r.name}'s ${only ? label(only) : 'unfinished tasks'}`, effect: touched.length ? touched.join('; ') : 'no unfinished task durations change' });
      continue;
    }
    const t = findTask(p, c.task);
    if (!t) { warnings.push(`Couldn't find task "${c.task}".`); continue; }
    if (t.summary) { warnings.push(`${label(t)} is a summary task. Name the task beneath it that changes.`); continue; }
    const n = alt.get(t.uid);
    if (!n) { warnings.push(`${label(t)} has no dates to model.`); continue; }
    if (n.mode === 'fixed') { warnings.push(`${label(t)} is complete, so "${what}" can't apply.`); continue; }
    if (c.startNoEarlierThan) {
      const d = toDate(c.startNoEarlierThan);
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(c.startNoEarlierThan))) { warnings.push(`"${c.startNoEarlierThan}" isn't a date. Use YYYY-MM-DD.`); continue; }
      if (n.mode === 'started') { warnings.push(`${label(t)} has already started, so its start can't move. Use durationDelta to model a later finish.`); continue; }
      n.floor = Math.max(n.floor ?? -Infinity, net.idx(d));
      applied.push({ change: `${label(t)} starts no earlier than ${iso(d)}` });
    }
    if (c.durationDelta != null) {
      const dd = Math.round(+c.durationDelta);
      if (!Number.isFinite(dd) || !dd) { warnings.push(`"${what}" needs a whole number of working days.`); continue; }
      if (n.milestone) { n.delay += dd; applied.push({ change: `${label(t)} (a milestone) moved ${sgn(dd)} working days` }); }
      else { const was = n.span + 1; n.span = Math.max(0, n.span + dd); applied.push({ change: `${label(t)} ${sgn(dd)} working days (${was} → ${n.span + 1} days)` }); }
    }
  }

  const before = schedule(net, base), after = schedule(net, alt);
  if (after.looped.length) warnings.push(`${after.looped.length} task(s) are in a dependency loop and kept their plan dates.`);
  const day = (i) => iso(net.dateAt(i));
  const moved = (k) => after.f.get(k) - before.f.get(k);
  const tasks = [...net.nodes.values()].map((n) => n.t);

  const milestones = tasks.filter((t) => t.milestone).map((t) => ({
    id: t.id, milestone: t.name, before: day(before.f.get(t.uid)), after: day(after.f.get(t.uid)), movedWorkingDays: moved(t.uid),
    baseline: iso(t.baselineFinish), ...(t.baselineFinish ? { vsBaselineWorkingDays: workdaysBetween(t.baselineFinish, net.dateAt(after.f.get(t.uid))) } : {}),
    source: { type: 'plan', ref: `task #${t.id}` },
  }));
  const finish = { before: day(before.end), after: day(after.end), movedWorkingDays: after.end - before.end };
  const movedTasks = tasks.filter((t) => after.s.get(t.uid) !== before.s.get(t.uid) || after.f.get(t.uid) !== before.f.get(t.uid))
    .map((t) => ({ id: t.id, task: t.name, start: `${day(before.s.get(t.uid))} → ${day(after.s.get(t.uid))}`, finish: `${day(before.f.get(t.uid))} → ${day(after.f.get(t.uid))}`, movedWorkingDays: moved(t.uid) }));
  const crit = (run) => tasks.filter((t) => t.percent < 100 && run.float.get(t.uid) === 0).map((t) => t.uid);
  const cpBefore = crit(before), cpAfter = crit(after);
  const criticalPath = {
    tasks: cpAfter.map((u) => { const t = p.byUid.get(u); return { id: t.id, task: t.name, start: day(after.s.get(u)), finish: day(after.f.get(u)) }; }),
    joined: cpAfter.filter((u) => !cpBefore.includes(u)).map((u) => label(p.byUid.get(u))),
    left: cpBefore.filter((u) => !cpAfter.includes(u)).map((u) => label(p.byUid.get(u))),
  };

  // People over their maximum in the scenario on days they weren't before.
  const from = net.idx(status);
  const maxOf = (extra) => (name) => (p.resources.find((r) => r.name === name)?.maxUnits ?? 1) + (extra.get(name) || 0);
  const ovBefore = overload(net, base, before, from, maxOf(new Map())), ovAfter = overload(net, alt, after, from, maxOf(extraUnits));
  const newlyOverallocated = [];
  for (const [name, days] of ovAfter) {
    const fresh = [...days].filter(([i]) => !ovBefore.get(name)?.has(i)).sort((a, b) => a[0] - b[0]);
    if (!fresh.length) continue;
    newlyOverallocated.push({
      resource: name, days: fresh.length, firstDay: day(fresh[0][0]), lastDay: day(fresh.at(-1)[0]),
      peakLoad: `${Math.round(Math.max(...fresh.map(([, d]) => d.units)) * 100)}%`, tasks: [...new Set(fresh.flatMap(([, d]) => [...d.tasks]))],
    });
  }

  // How far Lumen's recalculation without changes is from the file (constraints, levelling or manual dates explain any difference).
  const differ = tasks.filter((t) => before.s.get(t.uid) !== net.nodes.get(t.uid).s0 || before.f.get(t.uid) !== net.nodes.get(t.uid).f0);
  if (differ.length) warnings.push(`Without any changes, ${differ.length} task date${differ.length === 1 ? '' : 's'} recalculate differently from the file (for example ${differ.slice(0, 3).map(label).join(', ')}), usually because of constraints, levelling or manually set dates. Movements are measured against the recalculated dates, so both sides are calculated the same way.`);

  const planUpdates = tasks.filter((t) => {
    const n = net.nodes.get(t.uid), a = alt.get(t.uid);
    return after.s.get(t.uid) !== n.s0 || after.f.get(t.uid) !== n.f0 || a.span !== n.span;
  }).map((t) => {
    const n = net.nodes.get(t.uid), a = alt.get(t.uid);
    return { taskId: t.id, ...(n.mode === 'free' ? { start: day(after.s.get(t.uid)) } : {}), finish: day(after.f.get(t.uid)), ...(a.span !== n.span && !a.milestone ? { durationDays: a.span + 1 } : {}) };
  });

  const key = milestones.filter((m) => m.movedWorkingDays).sort((a, b) => Math.abs(b.movedWorkingDays) - Math.abs(a.movedWorkingDays));
  const goLive = milestones.find((m) => /go[- ]?live/i.test(m.milestone));
  const headline = goLive ? `${goLive.milestone} ${goLive.movedWorkingDays ? `moves ${sgn(goLive.movedWorkingDays)} working days (${goLive.before} → ${goLive.after})` : `stays on ${goLive.after}`}` : `Project finish ${finish.movedWorkingDays ? `moves ${sgn(finish.movedWorkingDays)} working days` : 'is unchanged'}`;
  return {
    plan: p.name, statusDate: iso(status), scenario: opts.name || 'Scenario',
    summary: `${headline}; project finish ${finish.movedWorkingDays ? `${sgn(finish.movedWorkingDays)} working days (${finish.after})` : 'unchanged'}; ${key.length} milestone${key.length === 1 ? ' moves' : 's move'}; ${movedTasks.length} task${movedTasks.length === 1 ? ' moves' : 's move'}; ${newlyOverallocated.length} ${newlyOverallocated.length === 1 ? 'person' : 'people'} newly over-allocated.`,
    changesApplied: applied, ...(warnings.length ? { warnings } : {}),
    projectFinish: finish, milestones, criticalPath, movedTasks, newlyOverallocated, planUpdates,
    calendar: 'Monday to Friday working days; public holidays are not in the calculation.',
    next: 'Nothing has been saved. To keep an approved scenario, pass planUpdates to update_project_plan, which writes an "(updated)" copy and leaves the original plan unchanged.',
    file: path.basename(planFile),
  };
}

module.exports = { runScenario };
