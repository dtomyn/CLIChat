// Estimates and capacity. Reads a team capacity workbook (people, roles, weekly hours and availability, leave, optional
// sprint dates), the plan's assignments and, optionally, an Azure DevOps backlog export for sprint demand. Returns weekly
// demand vs. capacity per person and role, conflicts (overloaded weeks, leave during assigned work, overloaded sprints) and
// estimate outliers (story points far from the team median for that work item type). Read-only.

const path = require('path');
const excel = require('./excel');
const project = require('./project');
const backlogTools = require('./backlog');

const { iso, toDate, isWorkday } = project;
const DAY = 86400000;
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const round1 = (n) => Math.round(n * 10) / 10;

function val(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return iso(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === 'object') {
    if ('result' in v) return v.result instanceof Date ? iso(new Date(v.result.getUTCFullYear(), v.result.getUTCMonth(), v.result.getUTCDate())) : v.result ?? '';
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.text) return v.text;
  }
  return v;
}
const asDate = (x) => (/^\d{4}-\d{2}-\d{2}/.test(String(x)) ? toDate(String(x).slice(0, 10)) : null);
function asShare(x) { // 0.8, 80, "80%" → 0.8
  if (x === '' || x == null) return null;
  const n = parseFloat(String(x).replace('%', ''));
  if (!Number.isFinite(n)) return null;
  return /%/.test(String(x)) || n > 1.5 ? n / 100 : n;
}

function sheetRows(ws, fields) {
  const headers = [];
  ws.getRow(1).eachCell((c, n) => { headers[n] = String(val(c)).trim(); });
  const map = {};
  for (const [f, res] of Object.entries(fields)) {
    const i = headers.findIndex((h, n) => h && res.some((re) => re.test(h)) && !Object.values(map).includes(n));
    if (i > 0) map[f] = i;
  }
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r === 1) return;
    const o = { row: r, ref: `${ws.name}!A${r}` };
    for (const [f, i] of Object.entries(map)) o[f] = val(row.getCell(i));
    rows.push(o);
  });
  return { map, rows };
}

const TEAM = { person: [/^(person|name|team member|resource|who)$/i], role: [/^(role|group|team|discipline)$/i], hours: [/hours.*week|weekly hours|contracted/i], availability: [/availab|allocation|on (this )?project|^capacity ?%?$/i] };
const LEAVE = { person: [/^(person|name|team member|resource|who)$/i], from: [/^(from|start|first day)/i], to: [/^(to|end|until|last day)/i], reason: [/reason|type|note/i] };
const SPRINTS = { sprint: [/^(sprint|iteration|name)( path| name)?$/i], start: [/^start/i], end: [/^(end|finish)/i] };

/** Read the capacity workbook: a team sheet (person, role, hours per week, availability), plus optional Leave and Sprints sheets. */
async function readCapacity(file) {
  const wb = await excel.open(file);
  const sheets = wb.worksheets.filter((ws) => ws.state !== 'veryHidden');
  const leaveWs = sheets.find((ws) => /leave|absence|holiday|time ?off|vacation/i.test(ws.name));
  const sprintWs = sheets.find((ws) => /sprint|iteration/i.test(ws.name));
  const teamWs = sheets.find((ws) => ws !== leaveWs && ws !== sprintWs && sheetRows(ws, TEAM).map.person);
  if (!teamWs) throw friendly(`"${path.basename(file)}" needs a sheet with a "Person" column (and ideally Role, Hours per week and Availability %).`);
  const warnings = [];
  const people = sheetRows(teamWs, TEAM).rows.filter((r) => String(r.person || '').trim()).map((r) => {
    const hours = parseFloat(r.hours), share = asShare(r.availability);
    if (!Number.isFinite(hours)) warnings.push(`${r.ref}: no hours per week for ${r.person}; 40 assumed.`);
    if (share == null) warnings.push(`${r.ref}: no availability for ${r.person}; 100% assumed.`);
    return { person: String(r.person).trim(), role: String(r.role || '').trim() || '(no role)', hoursPerWeek: Number.isFinite(hours) ? hours : 40, availability: share ?? 1, source: r.ref };
  });
  const leave = leaveWs ? sheetRows(leaveWs, LEAVE).rows.map((r) => ({ person: String(r.person || '').trim(), from: asDate(r.from), to: asDate(r.to) || asDate(r.from), reason: String(r.reason || ''), source: r.ref }))
    .filter((l) => { if (l.person && l.from) return true; if (l.person) warnings.push(`${l.source}: leave for ${l.person} has no start date; ignored.`); return false; }) : [];
  const sprints = sprintWs ? sheetRows(sprintWs, SPRINTS).rows.map((r) => ({ sprint: String(r.sprint || '').trim(), start: asDate(r.start), end: asDate(r.end), source: r.ref })).filter((s) => s.sprint && s.start && s.end) : [];
  return { people, leave, sprints, sheets: { team: teamWs.name, leave: leaveWs?.name || null, sprints: sprintWs?.name || null }, warnings };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mondayOf = (d) => { const x = new Date(d); const k = (x.getDay() + 6) % 7; return new Date(+x - k * DAY); };
const workdays = (from, to) => { const out = []; for (let d = new Date(from); d <= to; d = new Date(+d + DAY)) if (isWorkday(d)) out.push(d); return out; };

/**
 * Weekly demand vs. capacity, conflicts and estimate outliers.
 * opts: { plan, backlog, from (YYYY-MM-DD, default the plan's status date), weeks (default 8), hoursPerPoint, tagPrefix }
 */
async function analyzeCapacity(capacityFile, opts = {}) {
  const cap = await readCapacity(capacityFile);
  const warnings = [...cap.warnings];
  const p = opts.plan ? project.load(opts.plan) : null;
  const status = toDate(opts.from) || p?.statusDate || toDate(iso(new Date()));
  const start = mondayOf(status);
  const nWeeks = Math.max(1, Math.min(26, +opts.weeks || 8));
  const weeks = Array.from({ length: nWeeks }, (_, i) => new Date(+start + i * 7 * DAY));
  const end = new Date(+weeks.at(-1) + 4 * DAY);
  const key = (d) => iso(mondayOf(d));

  const byName = (name) => { const n = String(name || '').toLowerCase().trim(); return n ? cap.people.find((x) => x.person.toLowerCase() === n) || cap.people.find((x) => x.person.toLowerCase().includes(n) || n.includes(x.person.toLowerCase())) : null; };
  const onLeave = (person, d) => cap.leave.find((l) => l.person.toLowerCase() === person.toLowerCase() && d >= l.from && d <= l.to);
  const dailyCap = (x, d) => (onLeave(x.person, d) ? 0 : (x.hoursPerWeek / 5) * x.availability);
  const capacityBetween = (x, a, b) => workdays(a, b).reduce((s, d) => s + dailyCap(x, d), 0);

  // Plan demand: each unfinished assignment adds units x hours per day on every working day the task is active.
  const demand = new Map(cap.people.map((x) => [x.person, new Map()]));
  const demandTasks = new Map(cap.people.map((x) => [x.person, new Map()]));
  const notInCapacity = new Map();
  const leaveClashes = [];
  if (p) {
    project.criticalPath(p);
    for (const a of p.assignments) {
      const t = p.byUid.get(a.taskUid), r = p.resByUid.get(a.resourceUid);
      if (!t || !r || t.summary || r.type !== 'Work' || t.percent >= 100 || !t.start || !t.finish) continue;
      const x = byName(r.name);
      const days = workdays(t.start > start ? t.start : start, t.finish < end ? t.finish : end);
      if (!x) { if (days.length) notInCapacity.set(r.name, (notInCapacity.get(r.name) || 0) + days.length * a.units * p.hoursPerDay); continue; }
      for (const d of days) {
        const k = key(d);
        demand.get(x.person).set(k, (demand.get(x.person).get(k) || 0) + a.units * p.hoursPerDay);
        if (!demandTasks.get(x.person).has(k)) demandTasks.get(x.person).set(k, new Set());
        demandTasks.get(x.person).get(k).add(`#${t.id} ${t.name}`);
      }
      // Leave during assigned work, over the whole remaining task (not just the window).
      for (const l of cap.leave.filter((q) => q.person.toLowerCase() === x.person.toLowerCase())) {
        const overlap = workdays(l.from > t.start ? l.from : t.start, l.to < t.finish ? l.to : t.finish);
        if (!overlap.length) continue;
        leaveClashes.push({
          person: x.person, leave: `${iso(l.from)} to ${iso(l.to)}`, reason: l.reason || undefined, taskId: t.id, task: t.name,
          taskDates: `${iso(t.start)} to ${iso(t.finish)}`, workingDaysAffected: overlap.length, criticalPath: !!t.onCriticalPath, floatDays: t.floatDays ?? null,
          sources: [l.source, `plan task #${t.id}`],
        });
      }
    }
  }
  leaveClashes.sort((a, b) => b.criticalPath - a.criticalPath || b.workingDaysAffected - a.workingDaysAffected);

  const people = cap.people.map((x) => ({
    person: x.person, role: x.role, hoursPerWeek: x.hoursPerWeek, availability: `${Math.round(x.availability * 100)}%`, source: x.source,
    weeks: weeks.map((w) => {
      const c = round1(capacityBetween(x, w, new Date(+w + 4 * DAY))), dmd = round1(demand.get(x.person).get(iso(w)) || 0);
      const leaveDays = workdays(w, new Date(+w + 4 * DAY)).filter((d) => onLeave(x.person, d)).length;
      return { week: iso(w), capacityHours: c, planDemandHours: dmd, loadPercent: c ? Math.round((dmd / c) * 100) : dmd ? null : 0, ...(leaveDays ? { leaveDays } : {}) };
    }),
  }));
  const overloadedWeeks = [];
  for (const x of people) for (const w of x.weeks) if (w.planDemandHours > w.capacityHours + 0.05) {
    overloadedWeeks.push({ person: x.person, role: x.role, week: w.week, capacityHours: w.capacityHours, demandHours: w.planDemandHours, overByHours: round1(w.planDemandHours - w.capacityHours), ...(w.leaveDays ? { leaveDays: w.leaveDays } : {}), tasks: [...(demandTasks.get(x.person).get(w.week) || [])] });
  }
  const roles = [...new Set(people.map((x) => x.role))].map((role) => {
    const members = people.filter((x) => x.role === role);
    return { role, people: members.map((x) => x.person), weeks: weeks.map((w, i) => { const c = round1(members.reduce((s, x) => s + x.weeks[i].capacityHours, 0)), d = round1(members.reduce((s, x) => s + x.weeks[i].planDemandHours, 0)); return { week: iso(w), capacityHours: c, planDemandHours: d, loadPercent: c ? Math.round((d / c) * 100) : d ? null : 0 }; }) };
  });

  // Sprint demand and estimates from the backlog export.
  let sprints = null, estimateOutliers = [], noEstimate = [];
  const dq = { notInCapacityFile: [...notInCapacity].map(([resource, hours]) => ({ resource, planDemandHours: round1(hours) })), unknownSprints: [], unassignedOpenItems: [], assigneesNotInCapacityFile: [] };
  if (opts.backlog) {
    const { items, sheet } = await backlogTools.linkedItems(opts.backlog, { tagPrefix: opts.tagPrefix });
    const cite = (it) => `${sheet}!A${it.row}`;
    const hpp = +opts.hoursPerPoint || 0;
    const sprintOf = (it) => { const it2 = String(it.iteration || '').toLowerCase(); if (!it2) return null; const last = it2.split(/[\\/]/).pop().trim(); return cap.sprints.find((s) => s.sprint.toLowerCase() === it2 || s.sprint.toLowerCase() === last) || null; };
    const open = items.filter((it) => it.pct < 100);
    const table = new Map();
    for (const it of open) {
      if (!it.iteration) continue;
      const s = sprintOf(it);
      if (!s) { dq.unknownSprints.push({ item: it.id, title: it.title, iteration: it.iteration, source: cite(it) }); continue; }
      if (!it.assigned) { dq.unassignedOpenItems.push({ item: it.id, title: it.title, sprint: s.sprint, points: it.points, remainingHours: it.remaining, source: cite(it) }); continue; }
      const x = byName(it.assigned);
      if (!x) { dq.assigneesNotInCapacityFile.push({ item: it.id, assigned: it.assigned, source: cite(it) }); continue; }
      const k = `${s.sprint}|${x.person}`;
      if (!table.has(k)) table.set(k, { sprint: s, person: x, items: [], points: 0, remaining: 0, converted: 0, noHours: 0 });
      const e = table.get(k);
      e.items.push(`${it.id} ${it.title} (${cite(it)})`);
      e.points += it.points || 0;
      if (it.remaining != null) e.remaining += it.remaining;
      else if (hpp && it.points) e.converted += it.points * hpp;
      else e.noHours++;
    }
    sprints = [...table.values()].map((e) => {
      const c = round1(capacityBetween(e.person, e.sprint.start, e.sprint.end));
      const d = round1(e.remaining + e.converted);
      return { sprint: e.sprint.sprint, dates: `${iso(e.sprint.start)} to ${iso(e.sprint.end)}`, person: e.person.person, role: e.person.role, openItems: e.items.length, storyPoints: e.points, demandHours: d, capacityHours: c, loadPercent: c ? Math.round((d / c) * 100) : null, ...(e.noHours ? { itemsWithoutHours: e.noHours } : {}), items: e.items };
    }).sort((a, b) => a.sprint.localeCompare(b.sprint, undefined, { numeric: true }) || a.person.localeCompare(b.person));
    if (!cap.sprints.length && open.some((it) => it.iteration)) warnings.push(`The capacity workbook has no Sprints sheet (Sprint, Start, End), so sprint demand can't be compared with capacity.`);

    // Estimate outliers: story points at least double, or at most half, the median for the same work item type (3+ estimates).
    const byType = new Map();
    for (const it of items) if (it.points > 0) { const k = it.type || '(no type)'; if (!byType.has(k)) byType.set(k, []); byType.get(k).push(it); }
    for (const [type, list] of byType) {
      if (list.length < 3) continue;
      const med = median(list.map((x) => x.points));
      for (const it of list) if (it.points >= 2 * med || it.points <= med / 2) estimateOutliers.push({ item: it.id, title: it.title, type, points: it.points, typeMedian: med, ratio: round1(it.points / med), direction: it.points > med ? 'large' : 'small', state: it.state, source: cite(it) });
    }
    estimateOutliers.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
    noEstimate = open.filter((it) => !(it.points > 0) && it.remaining == null).map((it) => ({ item: it.id, title: it.title, type: it.type, state: it.state, source: cite(it) }));
  }
  const sprintOverloads = (sprints || []).filter((s) => s.capacityHours != null && s.demandHours > s.capacityHours + 0.05).map(({ items, ...s }) => ({ ...s, overByHours: round1(s.demandHours - s.capacityHours), items }));

  const who = (xs) => [...new Set(xs.map((x) => x.person))];
  const summary = [
    `${cap.people.length} people over ${nWeeks} week${nWeeks === 1 ? '' : 's'} from ${iso(start)}`,
    p ? `${who(overloadedWeeks).length} overloaded in at least one week${who(overloadedWeeks).length ? ` (${who(overloadedWeeks).join(', ')})` : ''}` : 'no plan given, so no plan demand',
    leaveClashes.length ? `${leaveClashes.length} leave clash${leaveClashes.length === 1 ? '' : 'es'} with assigned work${leaveClashes.some((x) => x.criticalPath) ? `, ${leaveClashes.filter((x) => x.criticalPath).length} on the critical path` : ''}` : 'no leave clashes',
    ...(sprints ? [`${sprintOverloads.length} overloaded sprint assignment${sprintOverloads.length === 1 ? '' : 's'}`, `${estimateOutliers.length} estimate outlier${estimateOutliers.length === 1 ? '' : 's'}`] : []),
  ].join('; ') + '.';

  return {
    capacityFile: path.basename(capacityFile), sheets: cap.sheets, ...(p ? { plan: p.name } : {}), ...(opts.backlog ? { backlog: path.basename(opts.backlog) } : {}),
    window: { from: iso(start), to: iso(end), weeks: nWeeks },
    summary,
    conflicts: { leaveClashes, overloadedWeeks, sprintOverloads },
    people, roles, ...(sprints ? { sprints } : {}),
    ...(opts.backlog ? { estimateOutliers, openItemsWithoutEstimate: noEstimate } : {}),
    dataQuality: dq,
    assumptions: [
      'Capacity = hours per week x availability, less leave, on Monday to Friday working days (public holidays are not included).',
      p ? `Plan demand = assignment units x ${p.hoursPerDay} hours on each working day an unfinished task is scheduled.` : null,
      opts.backlog ? `Sprint demand = Remaining Work hours${+opts.hoursPerPoint ? `, or story points x ${+opts.hoursPerPoint} hours where there is no Remaining Work` : ''}. It is shown separately from plan demand so the same work isn't counted twice.` : null,
    ].filter(Boolean),
    ...(warnings.length ? { warnings } : {}),
  };
}

module.exports = { readCapacity, analyzeCapacity };
