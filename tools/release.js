// Release and cutover: readiness checklists, the cutover run-sheet and hypercare trends. Pure calculation, no AI here.
//
// 1. readinessCheck: reads a readiness checklist (gate item, environment STE/UAT/STG/PRD, owner, due, evidence, status,
//    must-have) and checks that each evidence reference is in the notebook. Red/Amber/Green with the rule spelled out,
//    every finding citing its cell.
// 2. cutoverStatus: reads a cutover run-sheet (step, owner, planned start/end, actual start/end, status, depends on) and
//    reports late steps, the critical path to the projected finish, and the next steps due. It can save a Markdown
//    snapshot to Cutover/<timestamp>.md.
// 3. hypercareTrends: weekly opened/closed/open/ageing by severity from a defect export (the Plan 09 reader and
//    analyzeDefects), and a pass/fail for each hypercare exit criterion ("No Sev1 open for 10 days").
//
// Run-sheet times are wall-clock times: an Excel date-time is read as typed, without converting time zones.

const fs = require('fs');
const path = require('path');
const excel = require('./excel');
const qe = require('./tests');

const cellText = excel.cellText;
const DAY = 86400000, MIN = 60000;
const friendly = (msg) => Object.assign(new Error(msg), { friendly: true });
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ------------------------------------------------------------------ shared readers
/** A cell as a Date (wall-clock, in UTC fields), a number or text. */
function raw(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) v = 'result' in v ? v.result : v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? v.hyperlink ?? cellText(cell);
  return v == null ? '' : v;
}
/** Wall-clock milliseconds from a Date cell or "YYYY-MM-DD[ HH:MM]" text; null when it isn't a date. */
function wall(v) {
  if (v instanceof Date) return Number.isNaN(+v) ? null : +v;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(String(v || '').trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
}
const fmt = (ms) => (ms == null ? null : new Date(ms).toISOString().slice(0, 16).replace('T', ' '));
const day = (ms) => (ms == null ? null : new Date(ms).toISOString().slice(0, 10));
const nowWall = () => Date.now() - new Date().getTimezoneOffset() * MIN;
const asOfWall = (s) => { if (s == null || s === '') return nowWall(); const w = wall(s); if (w == null) throw friendly(`"${s}" isn't a date. Use YYYY-MM-DD or YYYY-MM-DD HH:MM.`); return w; };
const minutes = (ms) => Math.round(ms / MIN);
function duration(mins) {
  const m = Math.abs(Math.round(mins)), h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`;
}

/** The first sheet whose header row has the `need` fields. Returns { ws, map, rows } with each row's fields and cell refs. */
function readSheet(wb, fields, need, ignore = /^(about|summary|notes?|instructions?|read me)$/i) {
  const sheets = wb.worksheets.filter((ws) => ws.state !== 'veryHidden');
  for (const ws of sheets) {
    if (ignore.test(ws.name)) continue;
    const headers = [];
    ws.getRow(1).eachCell((c, n) => { headers[n] = cellText(c).trim(); });
    const map = {};
    for (const [f, res] of Object.entries(fields)) {
      for (const re of res) {
        const i = headers.findIndex((h, n) => h && re.test(h) && !Object.values(map).includes(n));
        if (i > 0) { map[f] = i; break; }
      }
    }
    if (!need.every((f) => map[f])) continue;
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const o = { row: r, at: `${ws.name}!${colLetter(map[need[0]])}${r}` };
      for (const [f, i] of Object.entries(map)) o[f] = raw(row.getCell(i));
      if (need.every((f) => String(o[f]).trim() === '')) return;
      rows.push(o);
    });
    return { ws, map, rows };
  }
  return null;
}
const text = (v) => (v instanceof Date ? day(+v) : String(v ?? '').trim());

/** A labelled value anywhere in the workbook, e.g. "Go-live date" with the date in the next cell. */
function labelled(wb, re) {
  for (const ws of wb.worksheets) {
    let found = null;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (found) return;
      row.eachCell((c, n) => { if (!found && re.test(cellText(c).trim())) { const v = raw(row.getCell(n + 1)); if (wall(v) != null) found = { value: wall(v), at: `${ws.name}!${colLetter(n + 1)}${r}` }; } });
    });
    if (found) return found;
  }
  return null;
}

function walk(dir, depth = 0, out = []) {
  if (depth > 4 || !fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, depth + 1, out); else out.push(f);
  }
  return out;
}

// ------------------------------------------------------------------ 1. readiness
const CHECKLIST = {
  id: [/^(item |gate |check )?(id|ref|#|no\.?)$/i],
  item: [/^(gate )?item$/i, /^(check|criteri|readiness item|activity|task|description)/i],
  gate: [/^(gate|category|area|workstream)$/i],
  env: [/^env/i],
  owner: [/^(owner|responsible|assigned to)$/i],
  due: [/^due/i, /^(target|by)( date)?$/i],
  evidence: [/evidence/i, /^(link|proof|artefact|artifact)s?$/i],
  status: [/^status$/i, /^state$/i, /^(done|complete)\??$/i],
  must: [/must|mandatory|required|go.?live critical|^critical$/i, /^priority$/i],
};
const DONE = /^(done|complete[d]?|closed|yes|y|pass(ed)?|approved|signed[ -]off|ready|met|n\/?a|not applicable|✓|✔)$/i;
const NA = /^(n\/?a|not applicable)$/i;
const ENVS = ['STE', 'UAT', 'STG', 'PRD'];
const envOf = (s) => { const t = String(s || '').trim(); if (!t) return '(none)'; if (/^ste|system test/i.test(t)) return 'STE'; if (/^uat|accept/i.test(t)) return 'UAT'; if (/^stg|stag|pre.?prod/i.test(t)) return 'STG'; if (/^prd|^prod/i.test(t)) return 'PRD'; return t; };
const isMust = (v) => { const t = String(v ?? '').trim(); return t === '' ? null : /^(y|yes|must|must[ -]have|mandatory|required|true|critical|high|1|p1)$/i.test(t); };

/**
 * opts: { root (notebook folder, default the checklist's folder), goLive: 'YYYY-MM-DD' (else a "Go-live date" cell),
 *         asOf: 'YYYY-MM-DD' (default today), redDays: 10 }
 */
async function readinessCheck(file, opts = {}) {
  const wb = await excel.open(file);
  const sheet = readSheet(wb, CHECKLIST, ['item']);
  if (!sheet || !sheet.map.status) throw friendly(`"${path.basename(file)}" needs a readiness checklist sheet with at least "Gate item" (or "Check") and "Status" columns.`);
  const root = path.resolve(opts.root || path.dirname(file));
  const asOf = asOfWall(opts.asOf && String(opts.asOf).slice(0, 10));
  const today = wall(day(asOf));
  const redDays = opts.redDays != null ? +opts.redDays : 10;
  const goLiveCell = opts.goLive ? { value: asOfWall(String(opts.goLive).slice(0, 10)), at: 'given' } : labelled(wb, /^go.?live( date)?:?$/i);
  const goLive = goLiveCell?.value ?? null;
  const daysToGoLive = goLive == null ? null : Math.round((goLive - today) / DAY);
  const files = walk(root);
  const byName = new Map(); for (const f of files) { const k = path.basename(f).toLowerCase(); if (!byName.has(k)) byName.set(k, f); }
  const anyMust = sheet.map.must && sheet.rows.some((r) => isMust(r.must) != null);
  const warnings = [];
  if (!sheet.map.evidence) warnings.push('The checklist has no Evidence column, so no evidence could be checked.');
  if (goLive == null) warnings.push('No go-live date was given or found (a "Go-live date" cell), so the days-to-go-live rule was not applied.');

  const findEvidence = (ref) => {
    const r = ref.replace(/^["']|["']$/g, '').trim();
    if (/^https?:\/\//i.test(r)) return { ref: r, found: null, note: 'Link: not checked (outside the notebook)' };
    for (const base of [root, path.dirname(file)]) {
      const full = path.resolve(base, r);
      if (fs.existsSync(full) && !path.relative(root, full).startsWith('..')) return { ref: r, found: path.relative(root, full) };
    }
    const hit = byName.get(path.basename(r).toLowerCase());
    return hit ? { ref: r, found: path.relative(root, hit) } : { ref: r, found: false };
  };

  const items = sheet.rows.map((r) => {
    const status = text(r.status), owner = text(r.owner), due = wall(r.due);
    const done = DONE.test(status), na = NA.test(status);
    const must = anyMust ? isMust(r.must) === true : true; // without a must-have column, every item counts
    const refs = text(r.evidence).split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
    const evidence = refs.map(findEvidence);
    const missing = evidence.filter((e) => e.found === false);
    const problems = [];
    if (!done) problems.push(status ? `Status is "${status}"` : 'No status');
    if (done && !na && sheet.map.evidence && !refs.length) problems.push('Marked complete with no evidence reference');
    for (const m of missing) problems.push(`Evidence "${m.ref}" is not in the notebook`);
    if (!owner && sheet.map.owner && !done) problems.push('No owner');
    const overdue = !done && due != null && due < today;
    if (overdue) problems.push(`Overdue (due ${day(due)})`);
    return {
      id: text(r.id) || undefined, item: text(r.item), gate: text(r.gate) || undefined, environment: envOf(r.env), owner: owner || undefined,
      due: due != null ? day(due) : undefined, status: status || undefined, mustHave: must, done, overdue,
      evidence: evidence.map((e) => ({ ref: e.ref, found: e.found === false ? 'missing' : e.found === null ? e.note : e.found })),
      missingEvidence: missing.map((m) => m.ref), problems, at: r.at,
    };
  });
  const brief = (i) => ({ id: i.id, item: i.item, environment: i.environment, owner: i.owner, due: i.due, status: i.status, problems: i.problems, at: i.at });
  const open = items.filter((i) => !i.done);
  const missingEvidence = items.filter((i) => i.missingEvidence.length || i.problems.some((p) => /no evidence reference/.test(p)));
  const mustOpen = open.filter((i) => i.mustHave);
  const mustDoneMissing = items.filter((i) => i.done && i.mustHave && i.missingEvidence.length);
  const overdueMust = open.filter((i) => i.mustHave && i.overdue);
  const unowned = open.filter((i) => !i.owner && sheet.map.owner);

  const reasons = [];
  let rating = 'Green';
  const red = (r) => { rating = 'Red'; reasons.push(r); };
  if (mustDoneMissing.length) red(`${plural(mustDoneMissing.length, 'must-have item is', 'must-have items are')} marked complete but the evidence is not in the notebook: ${mustDoneMissing.map((i) => `${i.id || i.item} (${i.missingEvidence.join(', ')}, ${i.at})`).join('; ')}.`);
  if (mustOpen.length && daysToGoLive != null && daysToGoLive <= redDays) red(`${plural(mustOpen.length, 'must-have item is', 'must-have items are')} still open ${daysToGoLive < 0 ? 'after' : `${plural(daysToGoLive, 'day')} before`} go-live (${redDays} days or fewer = Red).`);
  if (overdueMust.length) red(`${plural(overdueMust.length, 'must-have item is', 'must-have items are')} overdue: ${overdueMust.map((i) => `${i.id || i.item} (due ${i.due}, ${i.at})`).join('; ')}.`);
  if (rating !== 'Red') {
    const amber = [];
    if (open.length) amber.push(`${plural(open.length, 'item is', 'items are')} still open`);
    if (missingEvidence.length) amber.push(`${plural(missingEvidence.length, 'item has', 'items have')} missing evidence`);
    if (unowned.length) amber.push(`${plural(unowned.length, 'open item has', 'open items have')} no owner`);
    if (amber.length) { rating = 'Amber'; reasons.push(`${amber.join('; ')}.`); } else reasons.push('Every item is complete and its evidence is in the notebook.');
  }

  const envNames = [...new Set([...ENVS.filter((e) => items.some((i) => i.environment === e)), ...items.map((i) => i.environment)])];
  const byEnvironment = envNames.map((e) => { const xs = items.filter((i) => i.environment === e); return { environment: e, items: xs.length, complete: xs.filter((i) => i.done).length, open: xs.filter((i) => !i.done).length, missingEvidence: xs.filter((i) => i.missingEvidence.length).length }; });
  return {
    checklist: path.basename(file), sheet: sheet.ws.name, asOf: day(today),
    goLive: goLive != null ? { date: day(goLive), daysAway: daysToGoLive, at: goLiveCell.at } : null,
    rag: { rating, reasons, rule: `Red if a must-have item is marked complete without its evidence in the notebook, a must-have item is overdue, or any must-have item is open ${redDays} days or fewer before go-live; Amber if any item is open, has missing evidence or has no owner; otherwise Green.` },
    summary: `${rating}: ${items.length} checklist items, ${items.length - open.length} complete, ${open.length} open (${mustOpen.length} must-have); ${plural(missingEvidence.length, 'item')} with missing evidence${daysToGoLive != null ? `; go-live in ${plural(daysToGoLive, 'day')}` : ''}.`,
    byEnvironment,
    findings: { missingEvidence: missingEvidence.map(brief), openMustHave: mustOpen.map(brief), overdue: open.filter((i) => i.overdue).map(brief), openWithoutOwner: unowned.map(brief), otherOpen: open.filter((i) => !i.mustHave).map(brief) },
    items, warnings,
    note: 'Evidence references are looked up in the notebook folder by path, then by file name. Links (http…) are not checked. Cell references (Sheet!A5) point at each item. Nothing was changed.',
  };
}

// ------------------------------------------------------------------ 2. cutover run-sheet
const RUNSHEET = {
  id: [/^(step|task|activity)? ?(id|#|no\.?|number)$/i, /^ref$/i],
  name: [/^(step|task|activity)( name| description)?$/i, /^(description|name|title)$/i],
  owner: [/^(owner|responsible|who|assigned to)$/i],
  start: [/^planned start/i, /^(start|begin)( time)?$/i, /^scheduled start/i],
  end: [/^planned (end|finish)/i, /^(end|finish)( time)?$/i, /^scheduled (end|finish)/i],
  mins: [/duration|minutes|mins/i],
  actualStart: [/^actual start/i, /^started/i],
  actualEnd: [/^actual (end|finish)/i, /^(finished|completed)( at)?$/i],
  forecastEnd: [/^(forecast|revised|expected|estimated) (end|finish)/i, /^eta$/i],
  status: [/^status$/i, /^state$/i],
  deps: [/depend|predecessor|after|^pred/i],
  notes: [/^(notes?|comments?|rollback|go\/no.?go)$/i],
};
const stateOf = (s, r) => {
  const t = String(s || '').trim();
  if (/^(done|complete[d]?|closed|finished|✓|✔)$/i.test(t) || (!t && r.actualEnd != null)) return 'done';
  if (/skip|^n\/?a$|not applicable|cancel/i.test(t)) return 'skipped';
  if (/^(not (yet )?started|pending|to ?do|planned|waiting|ready|scheduled|new)$/i.test(t)) return 'not started';
  if (/block|hold|fail|issue/i.test(t)) return 'blocked';
  if (/progress|started|running|underway|active|wip/i.test(t) || (!t && r.actualStart != null)) return 'in progress';
  return 'not started';
};
const STATE_LABEL = { done: 'Done', skipped: 'Skipped', blocked: 'Blocked', 'in progress': 'In progress', 'not started': 'Not started' };

/** opts: { asOf: 'YYYY-MM-DD HH:MM' (default now), aheadMinutes: 60, toleranceMinutes: 30, snapshotDir } */
async function cutoverStatus(file, opts = {}) {
  const wb = await excel.open(file);
  const sheet = readSheet(wb, RUNSHEET, ['name']);
  if (!sheet || !sheet.map.start || !(sheet.map.end || sheet.map.mins)) throw friendly(`"${path.basename(file)}" needs a run-sheet with "Step", "Planned start" and "Planned end" (or "Duration (min)") columns.`);
  const asOf = asOfWall(opts.asOf);
  const ahead = (opts.aheadMinutes != null ? +opts.aheadMinutes : 60) * MIN;
  const tolerance = (opts.toleranceMinutes != null ? +opts.toleranceMinutes : 30) * MIN;
  const warnings = [];

  const steps = sheet.rows.map((r, i) => {
    const start = wall(r.start), end0 = wall(r.end), mins = Number.parseFloat(r.mins);
    const end = end0 ?? (start != null && Number.isFinite(mins) ? start + mins * MIN : null);
    const s = { n: i, id: text(r.id) || String(i + 1), name: text(r.name), owner: text(r.owner) || undefined, plannedStart: start, plannedEnd: end, actualStart: wall(r.actualStart), actualEnd: wall(r.actualEnd), forecastEnd: wall(r.forecastEnd), statusText: text(r.status), depText: text(r.deps), notes: text(r.notes) || undefined, at: r.at };
    s.state = stateOf(s.statusText, s);
    s.dur = start != null && end != null ? Math.max(0, end - start) : 0;
    if (start == null) warnings.push(`Step ${s.id} (${s.at}) has no planned start.`);
    return s;
  });
  const byId = new Map(steps.map((s) => [s.id.toLowerCase(), s]));
  for (const s of steps) {
    s.preds = [];
    for (const ref of s.depText.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)) {
      const p = byId.get(ref.toLowerCase());
      if (!p) warnings.push(`Step ${s.id} depends on "${ref}", which isn't in the run-sheet (${s.at}).`);
      else if (p !== s && !s.preds.includes(p)) s.preds.push(p);
    }
    s.succ = [];
  }
  for (const s of steps) for (const p of s.preds) p.succ.push(s);

  // Topological order (Kahn). Steps in a loop keep their sheet order and their loop links are ignored.
  const indeg = new Map(steps.map((s) => [s, s.preds.length]));
  const order = [], queue = steps.filter((s) => !s.preds.length);
  while (queue.length) { const s = queue.shift(); order.push(s); for (const x of s.succ) { indeg.set(x, indeg.get(x) - 1); if (!indeg.get(x)) queue.push(x); } }
  if (order.length < steps.length) {
    const loop = steps.filter((s) => !order.includes(s));
    warnings.push(`Steps ${loop.map((s) => s.id).join(', ')} depend on each other in a loop. Their dependencies were ignored.`);
    for (const s of loop) s.preds = s.preds.filter((p) => !loop.includes(p));
    order.push(...loop);
    for (const s of steps) s.succ = steps.filter((x) => x.preds.includes(s));
  }

  // Forward pass: done steps end when they ended; running steps end at their forecast end, else their planned duration
  // from when they started (never before now);
  // waiting steps start at the later of their planned start, now, and their predecessors' projected ends.
  for (const s of order) {
    const predEnd = Math.max(-Infinity, ...s.preds.map((p) => p.projEnd ?? -Infinity));
    if (s.state === 'done' || s.state === 'skipped') {
      s.projEnd = s.actualEnd ?? s.plannedEnd ?? asOf;
      s.projStart = s.actualStart ?? s.plannedStart ?? s.projEnd;
    } else if (s.state === 'in progress') {
      s.projStart = s.actualStart ?? s.plannedStart ?? asOf;
      s.projEnd = Math.max(s.forecastEnd ?? s.projStart + s.dur, asOf);
    } else {
      s.projStart = Math.max(s.plannedStart ?? -Infinity, asOf, predEnd);
      s.projEnd = Math.max(s.projStart + s.dur, s.forecastEnd ?? -Infinity);
    }
  }
  const plannedFinish = Math.max(...steps.map((s) => s.plannedEnd ?? -Infinity));
  const projectedFinish = Math.max(...steps.map((s) => s.projEnd));
  // Backward pass for float; steps with no float drive the projected finish.
  for (const s of [...order].reverse()) {
    const open = s.succ.filter((x) => x.state !== 'done' && x.state !== 'skipped');
    s.lateEnd = open.length ? Math.min(...open.map((x) => x.lateEnd - (x.projEnd - x.projStart))) : projectedFinish;
    s.float = s.lateEnd - s.projEnd;
  }
  const remaining = (s) => s.state !== 'done' && s.state !== 'skipped';
  const critical = order.filter((s) => remaining(s) && s.float <= MIN);

  const view = (s, extra = {}) => ({ step: s.id, name: s.name, owner: s.owner, status: STATE_LABEL[s.state], plannedStart: fmt(s.plannedStart), plannedEnd: fmt(s.plannedEnd), ...(s.actualStart != null ? { actualStart: fmt(s.actualStart) } : {}), ...(s.actualEnd != null ? { actualEnd: fmt(s.actualEnd) } : {}), projectedEnd: fmt(s.projEnd), ...extra, at: s.at });
  const late = steps.filter((s) => remaining(s) && s.plannedEnd != null && s.plannedEnd < asOf)
    .map((s) => view(s, { lateBy: duration(minutes(asOf - s.plannedEnd)), lateMinutes: minutes(asOf - s.plannedEnd), why: s.state === 'not started' ? 'Should have finished and has not started' : `Planned to finish at ${fmt(s.plannedEnd)} and is still ${STATE_LABEL[s.state].toLowerCase()}` }));
  const shouldHaveStarted = steps.filter((s) => s.state === 'not started' && s.plannedStart != null && s.plannedStart < asOf && !(s.plannedEnd != null && s.plannedEnd < asOf))
    .map((s) => view(s, { lateBy: duration(minutes(asOf - s.plannedStart)), why: `Planned to start at ${fmt(s.plannedStart)}` }));
  const finishedLate = steps.filter((s) => s.state === 'done' && s.actualEnd != null && s.plannedEnd != null && s.actualEnd - s.plannedEnd > MIN)
    .map((s) => view(s, { lateBy: duration(minutes(s.actualEnd - s.plannedEnd)) }));
  const blocked = steps.filter((s) => s.state === 'blocked').map((s) => view(s, { note: s.statusText }));
  const nextSteps = steps.filter((s) => s.state === 'not started' && (s.preds.every((p) => !remaining(p)) || (s.plannedStart != null && s.plannedStart <= asOf + ahead)))
    .sort((a, b) => a.projStart - b.projStart).slice(0, 10)
    .map((s) => view(s, { projectedStart: fmt(s.projStart), ready: s.preds.every((p) => !remaining(p)), waitingFor: s.preds.filter(remaining).map((p) => p.id) }));

  const variance = projectedFinish - plannedFinish;
  const reasons = [];
  let rating = 'Green';
  if (variance > tolerance) { rating = 'Red'; reasons.push(`Projected finish ${fmt(projectedFinish)} is ${duration(minutes(variance))} after the planned finish ${fmt(plannedFinish)} (more than ${duration(tolerance / MIN)} = Red).`); }
  const blockedCritical = critical.filter((s) => s.state === 'blocked');
  if (blockedCritical.length) { rating = 'Red'; reasons.push(`Critical-path step${blockedCritical.length === 1 ? '' : 's'} ${blockedCritical.map((s) => s.id).join(', ')} ${blockedCritical.length === 1 ? 'is' : 'are'} blocked.`); }
  if (variance > 0 && variance <= tolerance) reasons.push(`Projected finish is ${duration(minutes(variance))} after the planned finish, within the ${duration(tolerance / MIN)} tolerance.`);
  if (late.length) reasons.push(`${plural(late.length, 'step is', 'steps are')} late: ${late.map((s) => `${s.step} ${s.name} (${s.lateBy} past its planned end, ${s.at})`).join('; ')}.`);
  if (blocked.length > blockedCritical.length) reasons.push(`${plural(blocked.length, 'step is', 'steps are')} blocked.`);
  if (rating === 'Green') { if (reasons.length) rating = 'Amber'; else reasons.push('Every step is on time and the projected finish is on plan.'); }
  const done = steps.filter((s) => s.state === 'done').length;
  const result = {
    runsheet: path.basename(file), sheet: sheet.ws.name, asOf: fmt(asOf),
    rag: { rating, reasons, rule: `Red if the projected finish is more than ${duration(tolerance / MIN)} after the planned finish or a critical-path step is blocked; Amber if the finish is later than planned, any step is late or any step is blocked; otherwise Green.` },
    summary: `${rating}: ${done} of ${steps.length} steps done, ${steps.filter((s) => s.state === 'in progress').length} in progress, ${plural(late.length, 'late step')}. Projected finish ${fmt(projectedFinish)} (planned ${fmt(plannedFinish)}, ${variance > 0 ? `${duration(minutes(variance))} late` : variance < 0 ? `${duration(minutes(-variance))} early` : 'on time'}).`,
    plannedFinish: fmt(plannedFinish), projectedFinish: fmt(projectedFinish), varianceMinutes: minutes(variance),
    counts: Object.fromEntries(Object.entries(STATE_LABEL).map(([k, v]) => [v, steps.filter((s) => s.state === k).length]).filter(([, n]) => n)),
    late, shouldHaveStarted, blocked, finishedLate,
    criticalPath: critical.map((s) => view(s, { projectedStart: fmt(s.projStart) })),
    nextSteps, warnings,
    note: 'Times are read as typed in the run-sheet (local wall-clock time). A running step ends at its forecast end if the run-sheet has one, else after its planned duration, and never before now. Waiting steps are projected to start at the later of their planned start, now, and when the steps they depend on are projected to finish. Cell references point at each step. The run-sheet was not changed.',
  };
  if (opts.snapshotDir) {
    const dir = path.resolve(opts.snapshotDir);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = fmt(asOf).replace(':', '');
    let out = path.join(dir, `${stamp}.md`);
    for (let i = 2; fs.existsSync(out); i++) out = path.join(dir, `${stamp} (${i}).md`);
    fs.writeFileSync(out, renderCutover(result), 'utf8');
    result.saved = out;
  }
  return result;
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function table(rows, cols) {
  if (!rows.length) return ['_None._'];
  return [`| ${cols.map(([h]) => h).join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${cols.map(([, k]) => cell(typeof k === 'function' ? k(r) : r[k])).join(' | ')} |`)];
}
function renderCutover(r) {
  return [
    `# Cutover status ${r.asOf}`, '',
    `**Overall: ${r.rag.rating}**. ${r.summary.replace(/^\w+: /, '')}`, '',
    ...r.rag.reasons.map((x) => `- ${x}`), '',
    '## Late steps', '', ...table([...r.late, ...r.shouldHaveStarted.map((s) => ({ ...s, why: `Not started: ${s.why}` }))], [['Step', 'step'], ['Name', 'name'], ['Owner', 'owner'], ['Status', 'status'], ['Planned end', 'plannedEnd'], ['Late by', 'lateBy'], ['Why', 'why'], ['Cell', 'at']]), '',
    '## Blocked', '', ...table(r.blocked, [['Step', 'step'], ['Name', 'name'], ['Owner', 'owner'], ['Status', 'note'], ['Cell', 'at']]), '',
    '## Critical path to the projected finish', '', ...table(r.criticalPath, [['Step', 'step'], ['Name', 'name'], ['Owner', 'owner'], ['Status', 'status'], ['Projected start', 'projectedStart'], ['Projected end', 'projectedEnd']]), '',
    '## Next steps due', '', ...table(r.nextSteps, [['Step', 'step'], ['Name', 'name'], ['Owner', 'owner'], ['Projected start', 'projectedStart'], ['Waiting for', (s) => (s.waitingFor.length ? s.waitingFor.join(', ') : 'Ready')]]), '',
    ...(r.warnings.length ? ['## Data warnings', '', ...r.warnings.map((w) => `- ${w}`), ''] : []),
    `*Snapshot from ${r.runsheet} at ${r.asOf}. Rule: ${r.rag.rule}*`, '',
  ].join('\n');
}

// ------------------------------------------------------------------ 3. hypercare
const sevRank = (s) => { const m = /sev(?:erity)?\s*-?\s*(\d)/i.exec(String(s || '')); return m ? Math.min(4, Math.max(1, +m[1])) : qe.rank(s); };
const SEV = (n) => (n ? `Sev${n}` : 'Unrated');
const mondayUtc = (ms) => { const d = new Date(ms); const k = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - k); };
const CLOSED_STATE = /closed|done|resolved|removed|rejected|duplicate|won'?t fix|cancel/i;

/** "No Sev1 open for 10 days", "No Sev2 open", "Fewer than 5 Sev3 open", "No open defect older than 14 days", "Open defects falling for 2 weeks". */
function parseCriterion(c) {
  if (c && typeof c === 'object') return { text: c.text || c.name || JSON.stringify(c), ...c };
  const t = String(c || '').trim();
  const sev = (() => { const m = /sev(?:erity)?\s*(\d)(?:\s*(?:or|and|\/|,|-|–)\s*(?:sev(?:erity)?\s*)?(\d))?/i.exec(t); if (/critical/i.test(t) && !m) return 1; return m ? +(m[2] || m[1]) : null; })();
  let m;
  if ((m = /falling|trending down|decreas|going down/i.exec(t))) return { text: t, type: 'falling', weeks: +(/(\d+)\s*weeks?/i.exec(t)?.[1] || 2), maxSeverity: sev };
  if ((m = /older than\s*(\d+)\s*days?/i.exec(t))) return { text: t, type: 'maxAge', days: +m[1], maxSeverity: sev };
  if ((m = /^no\b.*\bopen\b.*\bfor\s*(\d+)\s*(day|week)s?/i.exec(t))) return { text: t, type: 'noneFor', days: +m[1] * (/week/i.test(m[2]) ? 7 : 1), maxSeverity: sev };
  if ((m = /(fewer than|less than|under|below|at most|no more than|maximum|max|≤|<=|<)\s*(\d+)/i.exec(t))) return { text: t, type: 'count', max: /fewer|less|under|below|^<$/i.test(m[1]) ? +m[2] - 1 : +m[2], maxSeverity: sev };
  if (/^(no|zero|0)\b.*\bopen\b|\bopen\b.*\b(none|zero)\b/i.test(t)) return { text: t, type: 'count', max: 0, maxSeverity: sev };
  return { text: t, type: 'unknown' };
}
const DEFAULT_EXIT = ['No Sev1 open for 10 days', 'No Sev2 open', 'Fewer than 10 open defects', 'Open defects falling for 2 weeks'];

/** opts: { exitCriteria: [..], asOf: 'YYYY-MM-DD' (default today), start: 'YYYY-MM-DD' (hypercare start; default first defect) } */
async function hypercareTrends(file, opts = {}) {
  const { rows: all, map } = await qe.readDefects(file);
  const triage = await qe.analyzeDefects(file, { asOf: opts.asOf });
  const asOf = asOfWall(opts.asOf && String(opts.asOf).slice(0, 10));
  const endOfAsOf = wall(day(asOf)) + DAY - 1;
  const bugs = all.filter((d) => /bug|defect|issue/i.test(d.type));
  const rows = (map.type && bugs.length ? bugs : all).map((d) => {
    const closed = CLOSED_STATE.test(d.state || '');
    const closedAt = closed ? (d.closed ? +d.closed : d.changed ? +d.changed : null) : null;
    return { ...d, sev: sevRank(d.severity), createdAt: d.created ? +d.created : null, isClosed: closed, closedAt };
  });
  const warnings = [];
  const noCreated = rows.filter((d) => d.createdAt == null);
  if (noCreated.length) warnings.push(`${plural(noCreated.length, 'defect has', 'defects have')} no created date and ${noCreated.length === 1 ? 'is' : 'are'} left out of the weekly trend: ${noCreated.slice(0, 5).map((d) => d.at).join(', ')}.`);
  const closedNoDate = rows.filter((d) => d.isClosed && d.closedAt == null);
  if (closedNoDate.length) warnings.push(`${plural(closedNoDate.length, 'closed defect has', 'closed defects have')} no closed or changed date, so ${closedNoDate.length === 1 ? 'it counts' : 'they count'} as closed before the period.`);
  if (!map.closed) warnings.push('The export has no Closed Date column, so the Changed Date of closed defects is used as their closed date.');
  const openAt = (d, t) => d.createdAt != null && d.createdAt <= t && !(d.isClosed && (d.closedAt == null || d.closedAt <= t));
  const dated = rows.filter((d) => d.createdAt != null);
  const start = opts.start ? asOfWall(String(opts.start).slice(0, 10)) : dated.length ? Math.min(...dated.map((d) => d.createdAt)) : wall(day(asOf));
  const sevs = [...new Set(rows.map((d) => d.sev))].sort((a, b) => (a || 9) - (b || 9));

  const weeks = [];
  for (let w = mondayUtc(start); w <= endOfAsOf; w += 7 * DAY) {
    const end = Math.min(w + 7 * DAY - 1, endOfAsOf);
    const inWeek = (t) => t != null && t >= w && t <= end;
    const openNow = rows.filter((d) => openAt(d, end));
    const ages = openNow.map((d) => (end - d.createdAt) / DAY);
    const per = (fn) => Object.fromEntries(sevs.map((s) => [SEV(s), rows.filter((d) => d.sev === s && fn(d)).length]));
    weeks.push({
      weekOf: day(w), to: day(end),
      opened: rows.filter((d) => inWeek(d.createdAt)).length, closed: rows.filter((d) => inWeek(d.closedAt)).length, openAtEnd: openNow.length,
      averageAgeDays: ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : 0,
      oldestOpenDays: ages.length ? Math.floor(Math.max(...ages)) : 0,
      bySeverity: { opened: per((d) => inWeek(d.createdAt)), closed: per((d) => inWeek(d.closedAt)), openAtEnd: per((d) => openAt(d, end)) },
    });
  }

  const openNow = rows.filter((d) => openAt(d, endOfAsOf));
  const label = (d) => ({ id: d.id, title: d.title, severity: d.severity || undefined, state: d.state || undefined, created: day(d.createdAt), ...(d.closedAt != null ? { closed: day(d.closedAt) } : {}), at: d.at });
  const sevOk = (c, d) => (c.maxSeverity ? d.sev != null && d.sev <= c.maxSeverity : true);
  const sevText = (c) => (c.maxSeverity ? (c.maxSeverity === 1 ? 'Sev1 ' : `Sev1–Sev${c.maxSeverity} `) : '');
  const criteria = (opts.exitCriteria && [].concat(opts.exitCriteria).length ? [].concat(opts.exitCriteria) : DEFAULT_EXIT).map(parseCriterion).map((c) => {
    if (c.type === 'count') {
      const xs = openNow.filter((d) => sevOk(c, d));
      return { criterion: c.text, result: xs.length <= c.max ? 'Pass' : 'Fail', evidence: `${plural(xs.length, `open ${sevText(c)}defect`)} on ${day(asOf)} (limit ${c.max}).`, defects: xs.slice(0, 20).map(label) };
    }
    if (c.type === 'noneFor') {
      const from = endOfAsOf - c.days * DAY;
      const xs = rows.filter((d) => sevOk(c, d) && d.createdAt != null && d.createdAt <= endOfAsOf && !(d.isClosed && (d.closedAt == null || d.closedAt <= from)));
      const lastClosed = Math.max(-Infinity, ...rows.filter((d) => sevOk(c, d) && d.closedAt != null && d.closedAt <= endOfAsOf).map((d) => d.closedAt));
      return { criterion: c.text, result: xs.length ? 'Fail' : 'Pass', evidence: xs.length ? `${plural(xs.length, `${sevText(c)}defect`)} open during the last ${c.days} days (since ${day(from + 1)}).` : `No ${sevText(c)}defect open since ${day(from + 1)}${Number.isFinite(lastClosed) ? `; the last one closed on ${day(lastClosed)}` : ''}.`, defects: xs.slice(0, 20).map(label) };
    }
    if (c.type === 'maxAge') {
      const xs = openNow.filter((d) => sevOk(c, d) && (endOfAsOf - d.createdAt) / DAY > c.days);
      return { criterion: c.text, result: xs.length ? 'Fail' : 'Pass', evidence: xs.length ? `${plural(xs.length, `open ${sevText(c)}defect`)} older than ${c.days} days.` : `No open ${sevText(c)}defect is older than ${c.days} days.`, defects: xs.slice(0, 20).map((d) => ({ ...label(d), ageDays: Math.floor((endOfAsOf - d.createdAt) / DAY) })) };
    }
    if (c.type === 'falling') {
      const full = weeks.filter((w) => wall(w.to) - wall(w.weekOf) >= 6 * DAY); // a week still under way isn't compared
      const counts = full.map((w) => (c.maxSeverity ? Object.entries(w.bySeverity.openAtEnd).filter(([k]) => /^Sev\d$/.test(k) && +k.slice(3) <= c.maxSeverity).reduce((s, [, n]) => s + n, 0) : w.openAtEnd));
      const last = counts.slice(-(c.weeks + 1));
      const ok = last.length === c.weeks + 1 && last.every((n, i) => i === 0 || n < last[i - 1] || n === 0);
      return { criterion: c.text, result: last.length < c.weeks + 1 ? 'Not checked' : ok ? 'Pass' : 'Fail', evidence: last.length < c.weeks + 1 ? `Needs ${c.weeks + 1} complete weeks of data; there ${full.length === 1 ? 'is' : 'are'} ${full.length}.` : `Open ${sevText(c)}defects at the end of the last ${c.weeks + 1} complete weeks: ${last.join(' → ')}.`, defects: [] };
    }
    return { criterion: c.text, result: 'Not checked', evidence: 'Lumen could not read this criterion. Write it like "No Sev1 open for 10 days", "Fewer than 5 Sev3 open", "No open defect older than 14 days" or "Open defects falling for 2 weeks".', defects: [] };
  });
  const failed = criteria.filter((c) => c.result === 'Fail').length, unchecked = criteria.filter((c) => c.result === 'Not checked').length;
  const verdict = failed ? 'Not ready to close' : unchecked ? 'Check the unread criteria' : 'Ready to close';
  return {
    export: path.basename(file), asOf: day(asOf), period: { from: day(start), to: day(asOf) },
    summary: `${verdict}: ${criteria.length - failed - unchecked} of ${criteria.length} exit criteria pass. ${rows.length} defects, ${openNow.length} open now (${sevs.filter(Boolean).map((s) => `${openNow.filter((d) => d.sev === s).length} ${SEV(s)}`).join(', ') || 'no severities'}).`,
    verdict, exitCriteria: criteria,
    openBySeverity: Object.fromEntries(sevs.map((s) => [SEV(s), openNow.filter((d) => d.sev === s).length])),
    weekly: weeks,
    triage: { summary: triage.summary, probableDuplicates: triage.findings.probableDuplicates.length, severityPriorityMismatches: triage.findings.severityPriorityMismatches.length, openWithoutOwner: triage.findings.openWithoutOwner.length, oldestOpen: triage.oldestOpen.slice(0, 5) },
    warnings,
    note: 'Weeks run Monday to Sunday. "Open at end" counts defects created by then and not yet closed. Closed means a closed, resolved, removed or duplicate state. Use analyze_defects for the full triage. The export was not changed.',
  };
}

module.exports = { readinessCheck, cutoverStatus, hypercareTrends, renderCutover, parseCriterion, wall, fmt, readSheet };
