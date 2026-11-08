// Microsoft Project support.
// Works on MSPDI (Microsoft Project XML) — the open format Project itself reads and writes.
// Binary .mpp files are converted through Microsoft Project (if installed) via COM automation.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { XMLParser } = require('fast-xml-parser');

// ------------------------------------------------------------------ dates & durations
const DAY = 86400000;
const toDate = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00') : null);
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);
const isWorkday = (d) => d.getDay() !== 0 && d.getDay() !== 6;
function workdaysBetween(a, b) { // signed count of working days from a to b (b exclusive)
  if (!a || !b) return 0;
  let sign = 1; if (b < a) { [a, b] = [b, a]; sign = -1; }
  let n = 0; for (let d = new Date(a); d < b; d = new Date(+d + DAY)) if (isWorkday(d)) n++;
  return n * sign;
}
function addWorkdays(d, n) { let x = new Date(d); let k = 0; while (k < n) { x = new Date(+x + DAY); if (isWorkday(x)) k++; } return x; }
function durHours(s) { const m = /PT(\d+(?:\.\d+)?)H(\d+)M/.exec(String(s || '')); return m ? +m[1] + +m[2] / 60 : 0; }
const durDays = (s, hpd = 8) => Math.round((durHours(s) / hpd) * 10) / 10;
const pt = (hours) => `PT${Math.round(hours)}H0M0S`;

// ------------------------------------------------------------------ .mpp conversion
function hasMsProject() {
  if (process.platform !== 'win32') return false;
  try { execFileSync('reg', ['query', 'HKCR\\MSProject.Application'], { stdio: 'ignore' }); return true; } catch { return false; }
}
function runProjectCom(script) {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'pipe', timeout: 180000, windowsHide: true });
}
// PowerShell treats typographic quotes (‘ ’ ‚ ‛) as single quotes too, so double all of them.
const psq = (s) => `'${String(s).replace(/['‘’‚‛]/g, (q) => q + q)}'`;
function mppToXml(mpp) {
  if (!hasMsProject()) {
    const e = new Error(`"${path.basename(mpp)}" is a binary Microsoft Project file, and Microsoft Project is not installed on this computer. Open it in Project and choose File › Save As › "XML Format (*.xml)", then use the .xml file.`);
    e.friendly = true; throw e;
  }
  const out = path.join(os.tmpdir(), `lumen-${Date.now()}-${path.basename(mpp, path.extname(mpp))}.xml`);
  runProjectCom(`$p = New-Object -ComObject MSProject.Application; $p.Visible = $false; $p.DisplayAlerts = $false; $p.FileOpenEx(${psq(mpp)}, $true) | Out-Null; $p.FileSaveAs(${psq(out)}, 0, $false, $false, $false, $false, '', '', '', 'MSProject.XML') | Out-Null; $p.FileCloseEx(0) | Out-Null; $p.Quit()`);
  return out;
}
function xmlToMpp(xml, mpp) {
  runProjectCom(`$p = New-Object -ComObject MSProject.Application; $p.Visible = $false; $p.DisplayAlerts = $false; $p.FileOpenEx(${psq(xml)}, $false, '', '', '', '', '', '', '', 'MSProject.XML') | Out-Null; $p.FileSaveAs(${psq(mpp)}) | Out-Null; $p.FileCloseEx(0) | Out-Null; $p.Quit()`);
}

// ------------------------------------------------------------------ reading
const ARRAYS = new Set(['Task', 'Resource', 'Assignment', 'PredecessorLink', 'Baseline', 'Calendar', 'WeekDay', 'WorkingTime', 'ExtendedAttribute', 'TimephasedData']);
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, isArray: (name) => ARRAYS.has(name) });

function xmlPathFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.mpp') return { xml: mppToXml(file), converted: true };
  if (ext === '.xml') return { xml: file, converted: false };
  const e = new Error(`"${path.basename(file)}" isn't a Microsoft Project file (.mpp or .xml).`); e.friendly = true; throw e;
}

function load(file) {
  const { xml, converted } = xmlPathFor(file);
  const raw = fs.readFileSync(xml, 'utf8');
  const doc = parser.parse(raw).Project;
  if (!doc) { const e = new Error(`"${path.basename(file)}" doesn't look like a Microsoft Project XML file.`); e.friendly = true; throw e; }
  const hpd = (+doc.MinutesPerDay || 480) / 60;
  const resources = (doc.Resources?.Resource || []).filter((r) => r.Name && r.IsNull !== '1').map((r) => ({
    uid: +r.UID, id: +r.ID, name: r.Name, group: r.Group || '', type: r.Type === '0' ? 'Material' : r.Type === '2' ? 'Cost' : 'Work',
    maxUnits: r.MaxUnits ? +r.MaxUnits : 1, rate: r.StandardRate ? +r.StandardRate : 0,
  }));
  const resByUid = new Map(resources.map((r) => [r.uid, r]));
  const assignments = (doc.Assignments?.Assignment || []).filter((a) => +a.ResourceUID >= 0 && resByUid.has(+a.ResourceUID)).map((a) => ({
    uid: +a.UID, taskUid: +a.TaskUID, resourceUid: +a.ResourceUID, units: a.Units ? +a.Units : 1, workHours: durHours(a.Work),
  }));
  const tasks = (doc.Tasks?.Task || []).filter((t) => +t.UID !== 0 && t.IsNull !== '1' && t.Name).map((t) => {
    const bl = (t.Baseline || []).find((b) => (b.Number ?? '0') === '0');
    return {
      uid: +t.UID, id: +t.ID, name: t.Name, wbs: t.WBS || t.OutlineNumber || '', level: +t.OutlineLevel || 1,
      summary: t.Summary === '1', milestone: t.Milestone === '1',
      start: toDate(t.Start), finish: toDate(t.Finish), durationDays: durDays(t.Duration, hpd),
      percent: +t.PercentComplete || 0, critical: t.Critical === '1',
      actualStart: toDate(t.ActualStart), actualFinish: toDate(t.ActualFinish),
      baselineStart: toDate(bl?.Start), baselineFinish: toDate(bl?.Finish),
      cost: t.Cost ? +t.Cost / 100 : 0, baselineCost: bl?.Cost ? +bl.Cost / 100 : 0,
      notes: t.Notes || '',
      preds: (t.PredecessorLink || []).map((p) => ({ uid: +p.PredecessorUID, type: ['FF', 'FS', 'SF', 'SS'][+p.Type] || 'FS', lagDays: p.LinkLag ? +p.LinkLag / 10 / 60 / hpd : 0 })),
    };
  });
  const byUid = new Map(tasks.map((t) => [t.uid, t]));
  for (const t of tasks) t.resources = assignments.filter((a) => a.taskUid === t.uid).map((a) => resByUid.get(a.resourceUid).name + (a.units !== 1 ? ` [${Math.round(a.units * 100)}%]` : ''));
  return {
    file, xml, converted, raw,
    name: doc.Title || doc.Name || path.basename(file, path.extname(file)),
    manager: doc.Manager || '', company: doc.Company || '',
    start: toDate(doc.StartDate), finish: toDate(doc.FinishDate), statusDate: toDate(doc.StatusDate) || null,
    currency: doc.CurrencySymbol || '$', hoursPerDay: hpd, tasks, resources, assignments, byUid, resByUid,
  };
}

// ------------------------------------------------------------------ analysis
function criticalPath(p) {
  // Backward pass on working-day indices using the dates in the file. Float = latest finish - scheduled finish.
  const work = p.tasks.filter((t) => !t.summary && t.start && t.finish);
  if (!work.length) return [];
  const origin = work.reduce((m, t) => (t.start < m ? t.start : m), work[0].start);
  const idx = (d) => workdaysBetween(origin, d);
  const info = new Map(work.map((t) => [t.uid, { t, s: idx(t.start), f: idx(t.finish), succ: [] }]));
  for (const t of work) for (const pr of t.preds) if (info.has(pr.uid)) info.get(pr.uid).succ.push({ uid: t.uid, type: pr.type, lag: Math.round(pr.lagDays) });
  const end = Math.max(...[...info.values()].map((x) => x.f));
  const lf = new Map([...info.keys()].map((k) => [k, end]));
  for (let pass = 0; pass < work.length; pass++) {
    let changed = false;
    for (const x of info.values()) {
      const d = x.f - x.s;
      let late = end;
      for (const sc of x.succ) {
        const y = info.get(sc.uid);
        const yLf = lf.get(sc.uid), yLs = yLf - (y.f - y.s);
        const lim = sc.type === 'FS' ? yLs - 1 - sc.lag : sc.type === 'SS' ? yLs - sc.lag + d : sc.type === 'FF' ? yLf - sc.lag : yLf - sc.lag + d;
        late = Math.min(late, lim);
      }
      if (late !== lf.get(x.t.uid)) { lf.set(x.t.uid, late); changed = true; }
    }
    if (!changed) break;
  }
  for (const x of info.values()) { x.t.floatDays = Math.max(0, lf.get(x.t.uid) - x.f); x.t.onCriticalPath = x.t.floatDays === 0; }
  return work.filter((t) => t.onCriticalPath && t.percent < 100);
}

function overallocations(p, from, to) {
  const out = new Map();
  const active = p.assignments.map((a) => ({ a, t: p.byUid.get(a.taskUid), r: p.resByUid.get(a.resourceUid) })).filter((x) => x.t && !x.t.summary && x.t.percent < 100 && x.t.start && x.t.finish && x.r.type === 'Work');
  for (let d = new Date(from); d <= to; d = new Date(+d + DAY)) {
    if (!isWorkday(d)) continue;
    const load = new Map();
    for (const x of active) if (x.t.start <= d && x.t.finish >= d) { const l = load.get(x.r.uid) || { units: 0, tasks: new Set() }; l.units += x.a.units; l.tasks.add(x.t.name); load.set(x.r.uid, l); }
    for (const [ruid, l] of load) {
      const r = p.resByUid.get(ruid);
      if (l.units > r.maxUnits + 1e-6) {
        const o = out.get(r.name) || { resource: r.name, peakLoad: 0, days: 0, firstDay: iso(d), lastDay: iso(d), tasks: new Set() };
        o.peakLoad = Math.max(o.peakLoad, Math.round(l.units * 100)); o.days++; o.lastDay = iso(d); l.tasks.forEach((n) => o.tasks.add(n)); out.set(r.name, o);
      }
    }
  }
  return [...out.values()].map((o) => ({ ...o, peakLoad: `${o.peakLoad}%`, tasks: [...o.tasks] }));
}

function analyze(file, statusDateStr) {
  const p = load(file);
  const status = toDate(statusDateStr) || p.statusDate || toDate(iso(new Date()));
  const leaf = p.tasks.filter((t) => !t.summary);
  const totalDur = leaf.reduce((s, t) => s + Math.max(t.durationDays, 0.1), 0);
  const pct = Math.round(leaf.reduce((s, t) => s + t.percent * Math.max(t.durationDays, 0.1), 0) / totalDur);
  const expected = Math.round(leaf.reduce((s, t) => {
    if (!t.start || !t.finish) return s;
    const total = Math.max(1, workdaysBetween(t.start, addWorkdays(t.finish, 1)));
    const done = Math.min(total, Math.max(0, workdaysBetween(t.start, addWorkdays(status, 1))));
    return s + (done / total) * 100 * Math.max(t.durationDays, 0.1);
  }, 0) / totalDur);
  const critical = criticalPath(p);
  const late = leaf.filter((t) => t.finish && t.finish < status && t.percent < 100);
  const behind = leaf.filter((t) => t.start && t.start <= status && t.percent < 100 && !late.includes(t)).map((t) => {
    const total = Math.max(1, workdaysBetween(t.start, addWorkdays(t.finish, 1)));
    const exp = Math.min(100, Math.round((workdaysBetween(t.start, addWorkdays(status, 1)) / total) * 100));
    return { t, exp };
  }).filter((x) => x.exp - x.t.percent >= 25);
  const notStarted = leaf.filter((t) => t.start && t.start < status && t.percent === 0 && !t.milestone);
  const slipped = leaf.filter((t) => t.baselineFinish && t.finish && workdaysBetween(t.baselineFinish, t.finish) > 0)
    .map((t) => ({ t, slip: workdaysBetween(t.baselineFinish, t.finish) })).sort((a, b) => b.slip - a.slip);
  const projBaselineFinish = leaf.reduce((m, t) => (t.baselineFinish && (!m || t.baselineFinish > m) ? t.baselineFinish : m), null);
  const projFinish = leaf.reduce((m, t) => (t.finish && (!m || t.finish > m) ? t.finish : m), null);
  const horizon = new Date(+status + 42 * DAY);
  const milestones = leaf.filter((t) => t.milestone).map((t) => ({ name: t.name, date: iso(t.finish), baseline: iso(t.baselineFinish), slipDays: t.baselineFinish ? workdaysBetween(t.baselineFinish, t.finish) : 0, done: t.percent === 100 }));
  const over = overallocations(p, status, horizon);
  const cost = leaf.reduce((s, t) => s + t.cost, 0), baseCost = leaf.reduce((s, t) => s + t.baselineCost, 0);

  const scheduleSlip = projBaselineFinish && projFinish ? workdaysBetween(projBaselineFinish, projFinish) : 0;
  const rag = scheduleSlip > 10 || late.length > 3 ? 'Red' : scheduleSlip > 0 || late.length || over.length ? 'Amber' : 'Green';
  const row = (t, extra = {}) => ({ id: t.id, wbs: t.wbs, task: t.name, start: iso(t.start), finish: iso(t.finish), percentComplete: t.percent, resources: t.resources.join(', '), ...extra });

  return {
    project: p.name, file: path.basename(file), statusDate: iso(status), suggestedRag: rag,
    schedule: { start: iso(p.start), forecastFinish: iso(projFinish), baselineFinish: iso(projBaselineFinish), slipWorkingDays: scheduleSlip },
    progress: { percentComplete: pct, expectedByNow: expected, varianceVsPlan: pct - expected, tasks: leaf.length, complete: leaf.filter((t) => t.percent === 100).length, inProgress: leaf.filter((t) => t.percent > 0 && t.percent < 100).length },
    cost: baseCost ? { currency: p.currency, forecast: Math.round(cost), baseline: Math.round(baseCost), variance: Math.round(cost - baseCost) } : undefined,
    lateTasks: late.map((t) => row(t, { daysOverdue: workdaysBetween(t.finish, status) })),
    behindSchedule: behind.map(({ t, exp }) => row(t, { expectedPercent: exp })),
    shouldHaveStarted: notStarted.map((t) => row(t)),
    biggestSlips: slipped.slice(0, 10).map(({ t, slip }) => row(t, { baselineFinish: iso(t.baselineFinish), slipWorkingDays: slip })),
    criticalPath: critical.map((t) => row(t, { floatDays: t.floatDays })),
    milestones,
    overallocatedResources_next6Weeks: over,
  };
}

function readPlan(file, { includeNotes = false } = {}) {
  const p = load(file);
  return {
    project: p.name, file: path.basename(file), manager: p.manager, start: iso(p.start), finish: iso(p.finish), statusDate: iso(p.statusDate),
    convertedFromMpp: p.converted || undefined,
    tasks: p.tasks.map((t) => ({
      id: t.id, uid: t.uid, wbs: t.wbs, level: t.level, name: t.name, type: t.summary ? 'summary' : t.milestone ? 'milestone' : 'task',
      start: iso(t.start), finish: iso(t.finish), durationDays: t.durationDays, percentComplete: t.percent,
      baselineFinish: iso(t.baselineFinish), predecessors: t.preds.map((x) => `${p.byUid.get(x.uid)?.id ?? x.uid}${x.type !== 'FS' ? x.type : ''}`).join(','),
      resources: t.resources.join(', ') || undefined, cost: t.cost || undefined, notes: includeNotes && t.notes ? t.notes : undefined,
    })),
    resources: p.resources.map((r) => ({ id: r.id, name: r.name, group: r.group, maxUnits: `${Math.round(r.maxUnits * 100)}%`, ratePerHour: r.rate })),
  };
}

// ------------------------------------------------------------------ updating (surgical XML edits keep everything else intact)
const TASK_ORDER = ['UID', 'ID', 'Name', 'Type', 'IsNull', 'CreateDate', 'Contact', 'WBS', 'WBSLevel', 'OutlineNumber', 'OutlineLevel', 'Priority', 'Start', 'Finish', 'Duration', 'ManualStart', 'ManualFinish', 'ManualDuration', 'DurationFormat', 'Work', 'Stop', 'Resume', 'ResumeValid', 'EffortDriven', 'Recurring', 'OverAllocated', 'Estimated', 'Milestone', 'Summary', 'DisplayAsSummary', 'Critical', 'IsSubproject', 'IsSubprojectReadOnly', 'SubprojectName', 'ExternalTask', 'ExternalTaskProject', 'EarlyStart', 'EarlyFinish', 'LateStart', 'LateFinish', 'StartVariance', 'FinishVariance', 'WorkVariance', 'FreeSlack', 'TotalSlack', 'StartSlack', 'FinishSlack', 'FixedCost', 'FixedCostAccrual', 'PercentComplete', 'PercentWorkComplete', 'Cost', 'OvertimeCost', 'OvertimeWork', 'ActualStart', 'ActualFinish', 'ActualDuration', 'ActualCost', 'ActualOvertimeCost', 'ActualWork', 'ActualOvertimeWork', 'RegularWork', 'RemainingDuration', 'RemainingCost', 'RemainingWork', 'RemainingOvertimeCost', 'RemainingOvertimeWork', 'ACWP', 'CV', 'ConstraintType', 'CalendarUID', 'ConstraintDate', 'Deadline', 'LevelAssignments', 'LevelingCanSplit', 'LevelingDelay', 'LevelingDelayFormat', 'PreLeveledStart', 'PreLeveledFinish', 'Hyperlink', 'HyperlinkAddress', 'HyperlinkSubAddress', 'IgnoreResourceCalendar', 'Notes', 'HideBar', 'Rollup', 'BCWS', 'BCWP', 'PhysicalPercentComplete', 'EarnedValueMethod', 'PredecessorLink', 'ActualWorkProtected', 'ActualOvertimeWorkProtected', 'ExtendedAttribute', 'Baseline'];
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function setField(block, tag, value) {
  const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>|<${tag}\\s*/>`);
  const el = value === null ? '' : `<${tag}>${xmlEsc(value)}</${tag}>`;
  if (re.test(block)) return block.replace(re, () => el); // a function, so "$&" in notes stays literal
  if (value === null) return block;
  const idx = TASK_ORDER.indexOf(tag);
  for (const later of TASK_ORDER.slice(idx + 1)) {
    const m = new RegExp(`\\n?([ \\t]*)<${later}[\\s>/]`).exec(block);
    if (m) return block.slice(0, m.index) + `\n${m[1]}${el}` + block.slice(m.index);
  }
  return block.replace(/(\s*)<\/Task>\s*$/, (_, ws) => `${ws}  ${el}${ws}</Task>`);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function updatePlan(file, { updates = [], statusDate, saveAs } = {}, workspace) {
  for (const d of [statusDate, ...updates.flatMap((u) => [u.start, u.finish])]) {
    if (d && !DATE.test(String(d))) throw Object.assign(new Error(`"${d}" isn't a date. Use YYYY-MM-DD.`), { friendly: true });
  }
  const p = load(file);
  let raw = p.raw;
  const changed = [];
  for (const u of updates) {
    const t = u.taskId != null ? p.tasks.find((x) => x.id === +u.taskId) : p.tasks.find((x) => x.name.toLowerCase() === String(u.taskName || '').toLowerCase());
    if (!t) { changed.push({ task: u.taskId ?? u.taskName, error: 'not found' }); continue; }
    const re = new RegExp(`<Task>\\s*<UID>${t.uid}</UID>[\\s\\S]*?</Task>`);
    const m = re.exec(raw); if (!m) continue;
    let block = m[0];
    const fields = [];
    if (u.percentComplete != null) {
      const pc = Math.max(0, Math.min(100, Math.round(+u.percentComplete)));
      block = setField(block, 'PercentComplete', pc);
      block = setField(block, 'PercentWorkComplete', pc);
      if (pc > 0 && !t.actualStart) block = setField(block, 'ActualStart', `${iso(t.start)}T08:00:00`);
      if (pc === 100) block = setField(block, 'ActualFinish', `${u.finish || iso(t.finish)}T17:00:00`);
      fields.push(`percentComplete=${pc}`);
    }
    if (u.start) { block = setField(block, 'Start', `${u.start}T08:00:00`); fields.push(`start=${u.start}`); }
    if (u.finish) { block = setField(block, 'Finish', `${u.finish}T17:00:00`); fields.push(`finish=${u.finish}`); }
    if (u.durationDays != null) { block = setField(block, 'Duration', pt(+u.durationDays * p.hoursPerDay)); fields.push(`duration=${u.durationDays}d`); }
    if (u.name) { block = setField(block, 'Name', u.name); fields.push(`name=${u.name}`); }
    if (u.notes != null) { block = setField(block, 'Notes', u.notes); fields.push('notes'); }
    raw = raw.replace(m[0], () => block);
    changed.push({ id: t.id, task: t.name, changed: fields.join(', ') });
  }
  if (statusDate) raw = /<StatusDate>/.test(raw) ? raw.replace(/<StatusDate>[^<]*<\/StatusDate>/, `<StatusDate>${statusDate}T17:00:00</StatusDate>`) : raw.replace(/(<\/FinishDate>)/, `$1\n  <StatusDate>${statusDate}T17:00:00</StatusDate>`);

  // Never overwrite the original: save a new version next to it unless told otherwise.
  const ext = path.extname(file).toLowerCase();
  const baseOut = saveAs ? path.resolve(workspace || path.dirname(file), saveAs) : path.join(path.dirname(file), `${path.basename(file, ext)} (updated)${ext}`);
  let outXml = baseOut.toLowerCase().endsWith('.mpp') ? baseOut.replace(/\.mpp$/i, '.xml') : baseOut;
  fs.writeFileSync(outXml, raw, 'utf8');
  let saved = outXml;
  if (baseOut.toLowerCase().endsWith('.mpp')) {
    if (hasMsProject()) { xmlToMpp(outXml, baseOut); fs.rmSync(outXml, { force: true }); saved = baseOut; }
  }
  const history = [];
  if (workspace) {
    try {
      // Keep the version before and after this update, so the tracker can show week-over-week movement.
      history.push(recordVersion(p, workspace), recordVersion({ file: baseOut, raw, statusDate: toDate(statusDate) || p.statusDate }, workspace));
    } catch { /* history is a convenience; never fail the update over it */ }
  }
  return { saved, note: 'Microsoft Project recalculates dependent dates when the file is opened.', changes: changed, versionsRecorded: history.filter(Boolean).length };
}

// ------------------------------------------------------------------ plan history (dated versions for week-over-week trends)
// Versions live in <project folder>/.lumen/plan-history/<plan name>/<status date>.xml. "(updated)" copies share the
// original's history, so recording progress builds up the timeline. One version per status date; the latest wins.
const historyKey = (file) => path.basename(file, path.extname(file)).replace(/\s*\((updated|proposed)\)\s*$/i, '').replace(/[<>:"/\\|?*]/g, '_').trim() || 'plan';
const historyDir = (root, file) => path.join(root, '.lumen', 'plan-history', historyKey(file));

/** Save this plan's XML as the version for its status date. Returns the saved path, or null when unchanged or undated. */
function recordVersion(p, root) {
  if (!root || !p.statusDate) return null;
  const dir = historyDir(root, p.file);
  const out = path.join(dir, `${iso(p.statusDate)}.xml`);
  if (fs.existsSync(out) && fs.readFileSync(out, 'utf8') === p.raw) return null;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(out, p.raw, 'utf8');
  return out;
}

/** Earlier saved versions of a plan (status date before `before`), newest last, at most `limit`. */
function earlierVersions(root, file, before, limit = 4) {
  const dir = historyDir(root, file);
  if (!root || !fs.existsSync(dir)) return [];
  const cutoff = before ? iso(before) : '9999-12-31';
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.xml$/.test(f) && f.slice(0, 10) < cutoff).sort().slice(-limit).map((f) => path.join(dir, f));
}

// ------------------------------------------------------------------ querying
const STATUSES = ['late', 'behind', 'not_started', 'in_progress', 'complete', 'should_have_started'];

/** Classify every task the same way analyze() does, plus float and baseline slip. */
function taskFacts(p, status) {
  criticalPath(p); // sets floatDays / onCriticalPath on scheduled leaf tasks
  const facts = new Map();
  for (const t of p.tasks) {
    const slip = t.baselineFinish && t.finish ? workdaysBetween(t.baselineFinish, t.finish) : null;
    let expected = null;
    if (t.start && t.finish && !t.summary) {
      const total = Math.max(1, workdaysBetween(t.start, addWorkdays(t.finish, 1)));
      expected = Math.min(100, Math.max(0, Math.round((workdaysBetween(t.start, addWorkdays(status, 1)) / total) * 100)));
    }
    const late = !t.summary && t.finish && t.finish < status && t.percent < 100;
    const behind = !t.summary && !late && t.start && t.start <= status && t.percent < 100 && expected - t.percent >= 25;
    const state = t.percent === 100 ? 'complete' : late ? 'late' : behind ? 'behind' : t.percent > 0 ? 'in_progress' : 'not_started';
    facts.set(t.uid, { slip, expected, state, shouldHaveStarted: !t.summary && !t.milestone && t.start && t.start < status && t.percent === 0 });
  }
  return facts;
}

/** Transitive predecessors (upstream) or successors (downstream) of a task, with the number of links away. */
function related(p, uid, direction, maxDepth = 50) {
  const succ = new Map();
  for (const t of p.tasks) for (const pr of t.preds) { if (!succ.has(pr.uid)) succ.set(pr.uid, []); succ.get(pr.uid).push(t.uid); }
  const next = (u) => (direction === 'downstream' ? succ.get(u) || [] : (p.byUid.get(u)?.preds || []).map((x) => x.uid));
  const depth = new Map();
  let frontier = [uid];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const nf = [];
    for (const u of frontier) for (const v of next(u)) if (v !== uid && !depth.has(v)) { depth.set(v, d); nf.push(v); }
    frontier = nf;
  }
  return depth;
}

function findTask(p, ref) {
  if (ref == null || ref === '') return null;
  if (/^\d+$/.test(String(ref))) return p.tasks.find((t) => t.id === +ref) || null;
  const s = String(ref).toLowerCase();
  return p.tasks.find((t) => t.name.toLowerCase() === s) || p.tasks.find((t) => t.name.toLowerCase().includes(s)) || null;
}

/**
 * Answer a question about a plan with exact rows. All filters are optional and combine with AND.
 * opts: { under, owner, text, status: [..], critical, milestones, slippedMoreThan, from, to, dateMode: 'active'|'finishing'|'starting',
 *         relatedTo: { task, direction: 'upstream'|'downstream', depth }, changedSince: 'last'|'YYYY-MM-DD', includeSummaries,
 *         statusDate, sort: 'start'|'finish'|'slip'|'float'|'id', limit }
 */
function queryPlan(file, opts = {}, root) {
  const p = load(file);
  const status = toDate(opts.statusDate) || p.statusDate || toDate(iso(new Date()));
  const facts = taskFacts(p, status);
  const applied = [];
  const notes = [];
  let rows = p.tasks.filter((t) => opts.includeSummaries || !t.summary);

  if (opts.under) {
    const branch = /^[\d.]+$/.test(String(opts.under)) ? p.tasks.find((t) => t.wbs === String(opts.under)) : findTask(p, opts.under);
    if (!branch) { notes.push(`No task or WBS "${opts.under}" found. Check the name with read_project_plan.`); rows = []; applied.push(`under "${opts.under}" (not found)`); }
    else { rows = rows.filter((t) => t.wbs === branch.wbs || t.wbs.startsWith(`${branch.wbs}.`)); applied.push(`under ${branch.wbs} ${branch.name}`); }
  }
  if (opts.owner) { const o = String(opts.owner).toLowerCase(); rows = rows.filter((t) => t.resources.some((r) => r.toLowerCase().includes(o))); applied.push(`owner contains "${opts.owner}"`); }
  if (opts.text) { const s = String(opts.text).toLowerCase(); rows = rows.filter((t) => t.name.toLowerCase().includes(s) || (t.notes || '').toLowerCase().includes(s)); applied.push(`name or notes contain "${opts.text}"`); }
  const statuses = [].concat(opts.status || []).map((s) => String(s).toLowerCase().replace(/[\s-]+/g, '_')).filter(Boolean);
  if (statuses.length) {
    const bad = statuses.filter((s) => !STATUSES.includes(s));
    if (bad.length) notes.push(`Unknown status ${bad.join(', ')}; use ${STATUSES.join(', ')}.`);
    rows = rows.filter((t) => statuses.some((s) => (s === 'should_have_started' ? facts.get(t.uid).shouldHaveStarted : facts.get(t.uid).state === s)));
    applied.push(`status ${statuses.join(' or ')}`);
  }
  if (opts.critical) { rows = rows.filter((t) => t.onCriticalPath && t.percent < 100); applied.push('on the critical path (zero float, not complete)'); }
  if (opts.milestones) { rows = rows.filter((t) => t.milestone); applied.push('milestones only'); }
  if (opts.slippedMoreThan != null) { const n = +opts.slippedMoreThan; rows = rows.filter((t) => facts.get(t.uid).slip > n); applied.push(`slipped more than ${n} working days vs. baseline`); }
  if (opts.from || opts.to) {
    const from = toDate(opts.from) || new Date(-8e15), to = toDate(opts.to) || new Date(8e15);
    const mode = opts.dateMode || 'active';
    rows = rows.filter((t) => (mode === 'finishing' ? t.finish && t.finish >= from && t.finish <= to
      : mode === 'starting' ? t.start && t.start >= from && t.start <= to
        : t.start && t.finish && t.start <= to && t.finish >= from));
    applied.push(`${mode} between ${opts.from || 'the start'} and ${opts.to || 'the end'}`);
  }
  let depth = null;
  if (opts.relatedTo?.task != null) {
    const anchor = findTask(p, opts.relatedTo.task);
    const dir = opts.relatedTo.direction === 'downstream' ? 'downstream' : 'upstream';
    if (!anchor) { notes.push(`Task "${opts.relatedTo.task}" not found. Check the name with read_project_plan.`); rows = []; applied.push(`related to "${opts.relatedTo.task}" (not found)`); }
    else {
      depth = related(p, anchor.uid, dir, opts.relatedTo.depth || 50);
      rows = rows.filter((t) => depth.has(t.uid));
      applied.push(`${dir === 'upstream' ? 'what' : 'what depends on'} #${anchor.id} ${anchor.name}${dir === 'upstream' ? ' depends on' : ''}`);
    }
  }
  let changes = null;
  if (opts.changedSince) {
    const before = opts.changedSince === 'last' ? status : new Date(+toDate(opts.changedSince) + DAY);
    const versions = earlierVersions(root, file, before, 50);
    const pick = versions.at(-1);
    if (!pick) notes.push('No earlier saved version of this plan to compare with. Lumen saves one each time a tracker is built or progress is recorded.');
    else {
      const old = load(pick);
      changes = new Map();
      for (const t of p.tasks) {
        const o = old.byUid.get(t.uid);
        if (!o) { changes.set(t.uid, 'new task'); continue; }
        const c = [];
        if (iso(o.finish) !== iso(t.finish)) c.push(`finish ${iso(o.finish)} → ${iso(t.finish)} (${workdaysBetween(o.finish, t.finish) > 0 ? '+' : ''}${workdaysBetween(o.finish, t.finish)} days)`);
        if (iso(o.start) !== iso(t.start)) c.push(`start ${iso(o.start)} → ${iso(t.start)}`);
        if (o.percent !== t.percent) c.push(`${o.percent}% → ${t.percent}%`);
        if (o.name !== t.name) c.push(`renamed from "${o.name}"`);
        if (c.length) changes.set(t.uid, c.join('; '));
      }
      const removed = old.tasks.filter((o) => !p.byUid.has(o.uid)).map((o) => `#${o.id} ${o.name}`);
      if (removed.length) notes.push(`Removed since then: ${removed.join(', ')}.`);
      rows = rows.filter((t) => changes.has(t.uid));
      applied.push(`changed since the version of ${iso(old.statusDate) || path.basename(pick, '.xml')}`);
    }
  }

  const key = { start: (t) => +t.start || 0, finish: (t) => +t.finish || 0, slip: (t) => -(facts.get(t.uid).slip ?? -1e9), float: (t) => t.floatDays ?? 1e9, id: (t) => t.id }[opts.sort] || (depth ? (t) => depth.get(t.uid) * 1e6 + t.id : (t) => t.id);
  rows.sort((a, b) => key(a) - key(b) || a.id - b.id);
  const total = rows.length;
  const limit = Math.max(1, Math.min(500, +opts.limit || 50));
  const out = rows.slice(0, limit).map((t) => {
    const f = facts.get(t.uid);
    return {
      id: t.id, wbs: t.wbs, task: t.name, ...(t.summary ? { summary: true } : {}), ...(t.milestone ? { milestone: true } : {}),
      start: iso(t.start), finish: iso(t.finish), baselineFinish: iso(t.baselineFinish), slipWorkingDays: f.slip,
      percentComplete: t.percent, ...(f.expected != null && t.percent < 100 ? { expectedPercent: f.expected } : {}), status: f.state.replace('_', ' '),
      ...(t.floatDays != null ? { floatDays: t.floatDays } : {}), resources: t.resources.join(', '),
      predecessors: t.preds.map((x) => p.byUid.get(x.uid)?.id).filter(Boolean).join(','),
      ...(depth ? { linksAway: depth.get(t.uid) } : {}), ...(changes ? { change: changes.get(t.uid) } : {}),
    };
  });
  return {
    plan: p.name, statusDate: iso(status), filters: applied.length ? applied : ['none (all tasks)'], matches: total,
    ...(total > limit ? { showing: limit, note: `Showing the first ${limit} of ${total}. Narrow the filters or raise limit.` } : {}),
    ...(notes.length ? { warnings: notes } : {}), tasks: out,
  };
}

// ------------------------------------------------------------------ change log (version vs. version)
const sgn = (n) => (n > 0 ? '+' : '') + n;

/** The saved version to compare with: 'last' (before the status date) or a YYYY-MM-DD date. Null when none exists. */
function pickVersion(root, file, status, against) {
  const before = !against || against === 'last' ? status : new Date(+toDate(against) + DAY);
  return earlierVersions(root, file, before, 50).at(-1) || null;
}

/**
 * Compare the plan with an earlier version and sort every change into "material" (moves a milestone or the finish,
 * critical-path or large date moves, logic changes, added or removed work that matters) or "administrative"
 * (renames, notes, resources, small date moves, minor tasks). Progress (% complete) is only counted.
 * opts: { against: 'last'|'YYYY-MM-DD', compareFile, thresholdDays (default 3), statusDate }
 */
function changeLog(file, opts = {}, root) {
  const p = load(file);
  const status = toDate(opts.statusDate) || p.statusDate || toDate(iso(new Date()));
  const pick = opts.compareFile || pickVersion(root, file, status, opts.against);
  if (!pick) return { plan: p.name, warnings: ['No earlier saved version of this plan to compare with. Lumen saves one each time a tracker is built or progress is recorded; or pass compareFile.'], material: [], administrative: [] };
  const old = load(pick);
  const threshold = opts.thresholdDays != null ? +opts.thresholdDays : 3;
  criticalPath(p);
  const milestonesAfter = (uid) => [...related(p, uid, 'downstream').keys()].map((u) => p.byUid.get(u)).filter((t) => t?.milestone).map((t) => `#${t.id} ${t.name}`);
  const material = [], administrative = [];
  let progress = 0;
  const add = (t, kind, detail, reasons) => (reasons.length ? material : administrative).push({ id: t.id, task: t.name, kind, detail, ...(reasons.length ? { why: reasons.join('; ') } : {}) });
  const predKey = (x) => x.preds.map((q) => `${q.uid}${q.type}${q.lagDays}`).sort().join(',');
  const predIds = (x, other) => x.preds.map((q) => p.byUid.get(q.uid)?.id ?? other.byUid.get(q.uid)?.id).join(',') || 'none';

  for (const t of p.tasks) {
    const o = old.byUid.get(t.uid);
    if (!o) {
      if (t.summary) { add(t, 'added', 'new summary task', []); continue; }
      const r = [];
      if (t.milestone) r.push('new milestone');
      if (t.onCriticalPath) r.push('on the critical path');
      if (!t.milestone && t.durationDays > threshold) r.push(`${t.durationDays} days of new work`);
      add(t, 'added', `new task ${iso(t.start)} → ${iso(t.finish)}`, r);
      continue;
    }
    const fin = o.finish && t.finish ? workdaysBetween(o.finish, t.finish) : 0;
    const sta = o.start && t.start ? workdaysBetween(o.start, t.start) : 0;
    if ((fin || sta) && !t.summary) {
      const r = [];
      if (fin) {
        if (t.milestone) r.push(`milestone moved ${sgn(fin)} working days`);
        else if (t.onCriticalPath) r.push(`critical-path task finish moved ${sgn(fin)} working days`);
        else if (Math.abs(fin) > threshold) r.push(`finish moved ${sgn(fin)} working days (more than ${threshold})`);
        const ms = r.length && !t.milestone ? milestonesAfter(t.uid) : [];
        if (ms.length) r.push(`feeds ${ms.slice(0, 3).join(', ')}${ms.length > 3 ? ` +${ms.length - 3} more` : ''}`);
      }
      add(t, 'dates', `${iso(o.start)} → ${iso(t.start)}; finish ${iso(o.finish)} → ${iso(t.finish)} (${sgn(fin)} working days)`, r);
    }
    if (predKey(o) !== predKey(t)) add(t, 'logic', `predecessors ${predIds(o, old)} → ${predIds(t, old)}`, ['dependency logic changed']);
    if (!t.summary && !fin && o.durationDays !== t.durationDays) {
      const d = t.durationDays - o.durationDays;
      add(t, 'duration', `${o.durationDays} → ${t.durationDays} days`, Math.abs(d) > threshold ? [`duration changed by ${sgn(d)} days`] : []);
    }
    if (o.name !== t.name) add(t, 'renamed', `"${o.name}" → "${t.name}"`, []);
    if (o.resources.join('|') !== t.resources.join('|')) add(t, 'resources', `${o.resources.join(', ') || 'unassigned'} → ${t.resources.join(', ') || 'unassigned'}`, []);
    if ((o.notes || '') !== (t.notes || '')) add(t, 'notes', 'notes edited', []);
    if (!t.summary && o.percent !== t.percent) progress++;
  }
  for (const o of old.tasks) {
    if (p.byUid.has(o.uid) || o.summary) continue;
    const r = [];
    if (o.milestone) r.push('milestone removed');
    if (!o.milestone && o.durationDays > threshold) r.push(`${o.durationDays} days of work removed`);
    (r.length ? material : administrative).push({ id: o.id, task: o.name, kind: 'removed', detail: `removed (was ${iso(o.start)} → ${iso(o.finish)})`, ...(r.length ? { why: r.join('; ') } : {}) });
  }

  const milestones = p.tasks.filter((t) => t.milestone).map((t) => {
    const o = old.byUid.get(t.uid);
    return { id: t.id, milestone: t.name, before: iso(o?.finish), now: iso(t.finish), movedWorkingDays: o?.finish && t.finish ? workdaysBetween(o.finish, t.finish) : null, baseline: iso(t.baselineFinish) };
  });
  // Use the latest task finish, not the plan header: the header isn't recalculated until Microsoft Project opens the file.
  const lastFinish = (x) => x.tasks.filter((t) => !t.summary && t.finish).reduce((m, t) => (!m || t.finish > m ? t.finish : m), null);
  const [fBefore, fNow] = [lastFinish(old), lastFinish(p)];
  const projectFinish = { before: iso(fBefore), now: iso(fNow), movedWorkingDays: fBefore && fNow ? workdaysBetween(fBefore, fNow) : null };
  const moved = milestones.filter((x) => x.movedWorkingDays).length;
  return {
    plan: p.name, comparedWith: path.basename(pick), versionDate: iso(old.statusDate) || path.basename(pick, '.xml'), statusDate: iso(status), thresholdDays: threshold,
    summary: `${material.length} material and ${administrative.length} administrative change${administrative.length === 1 ? '' : 's'}; ${moved} milestone${moved === 1 ? '' : 's'} moved; project finish ${projectFinish.movedWorkingDays ? `moved ${sgn(projectFinish.movedWorkingDays)} working days` : 'unchanged'}; ${progress} task${progress === 1 ? '' : 's'} with progress updates (not listed).`,
    projectFinish, milestones, material, administrative,
  };
}

// ------------------------------------------------------------------ look-ahead (what is on each workstream's radar)
/** The workstream a task belongs to: its summary ancestor one level below the project root (or the top level when there are several). */
function workstreamOf(p, t) {
  const tops = p.tasks.filter((x) => x.summary && x.level === 1);
  const level = tops.length === 1 && p.tasks.some((x) => x.summary && x.level === 2) ? 2 : 1;
  const key = t.wbs.split('.').slice(0, level).join('.');
  return p.tasks.find((x) => x.summary && x.wbs === key) || null;
}

/**
 * Forward-looking readout for the coming week, grouped by workstream: what starts, what finishes, milestones, late carry-overs,
 * and unfinished work these tasks are waiting on (from another workstream, or overdue).
 * opts: { from (default the day after the status date), days (default 7), statusDate, under, owner }
 */
function lookahead(file, opts = {}) {
  const p = load(file);
  const status = toDate(opts.statusDate) || p.statusDate || toDate(iso(new Date()));
  const facts = taskFacts(p, status);
  const from = toDate(opts.from) || new Date(+status + DAY);
  const days = Math.max(1, Math.min(60, +opts.days || 7));
  const to = new Date(+from + (days - 1) * DAY);
  const warnings = [];
  let pool = p.tasks.filter((t) => !t.summary);
  if (opts.under) {
    const b = /^[\d.]+$/.test(String(opts.under)) ? p.tasks.find((t) => t.wbs === String(opts.under)) : findTask(p, opts.under);
    if (!b) { warnings.push(`No task or WBS "${opts.under}" found.`); pool = []; } else pool = pool.filter((t) => t.wbs === b.wbs || t.wbs.startsWith(`${b.wbs}.`));
  }
  if (opts.owner) { const o = String(opts.owner).toLowerCase(); pool = pool.filter((t) => t.resources.some((r) => r.toLowerCase().includes(o))); }
  const row = (t) => ({ id: t.id, task: t.name, start: iso(t.start), finish: iso(t.finish), percentComplete: t.percent, resources: t.resources.join(', '), ...(t.onCriticalPath ? { critical: true } : {}) });
  const wsName = (w) => (w ? `${w.wbs} ${w.name}` : '(no workstream)');
  const groups = new Map();
  const grp = (t) => { const k = wsName(workstreamOf(p, t)); if (!groups.has(k)) groups.set(k, { workstream: k, starting: [], finishing: [], milestones: [], lateCarryOver: [], waitingOn: [] }); return groups.get(k); };
  const inWin = (d) => d && d >= from && d <= to;
  criticalPath(p);
  for (const t of pool) {
    const f = facts.get(t.uid);
    if (t.percent >= 100) continue;
    if (t.milestone) { if (inWin(t.finish)) grp(t).milestones.push({ ...row(t), baselineFinish: iso(t.baselineFinish), slipWorkingDays: f.slip }); }
    else {
      if (inWin(t.start)) grp(t).starting.push(row(t));
      if (inWin(t.finish)) grp(t).finishing.push(row(t));
      if (f.state === 'late') grp(t).lateCarryOver.push({ ...row(t), workingDaysLate: workdaysBetween(t.finish, status) });
    }
    if (t.start && t.finish && t.start <= to && t.finish >= from) {
      const tw = workstreamOf(p, t);
      for (const pr of t.preds) {
        const d = p.byUid.get(pr.uid);
        if (!d || d.summary || d.percent >= 100) continue;
        const dw = workstreamOf(p, d);
        const overdue = !!(d.finish && d.finish < status), cross = dw?.wbs !== tw?.wbs;
        if (!overdue && !cross) continue; // same workstream and on track: already on its own list
        grp(t).waitingOn.push({ task: `#${t.id} ${t.name}`, waitsFor: `#${d.id} ${d.name}`, owner: d.resources.join(', '), finish: iso(d.finish), percentComplete: d.percent, overdue, ...(cross ? { fromWorkstream: wsName(dw) } : {}) });
      }
    }
  }
  const list = [...groups.values()].filter((g) => g.starting.length || g.finishing.length || g.milestones.length || g.lateCarryOver.length || g.waitingOn.length)
    .sort((a, b) => a.workstream.localeCompare(b.workstream, undefined, { numeric: true }));
  const n = (k) => list.reduce((s, g) => s + g[k].length, 0);
  return {
    plan: p.name, statusDate: iso(status), window: { from: iso(from), to: iso(to) },
    summary: `${n('starting')} starting, ${n('finishing')} finishing, ${n('milestones')} milestone(s), ${n('lateCarryOver')} late carry-over(s), ${n('waitingOn')} dependenc${n('waitingOn') === 1 ? 'y' : 'ies'} to watch.`,
    ...(warnings.length ? { warnings } : {}), workstreams: list,
  };
}

module.exports = { load, readPlan, analyze, updatePlan, queryPlan, changeLog, lookahead, hasMsProject, iso, toDate, addWorkdays, workdaysBetween, isWorkday, recordVersion, earlierVersions, historyKey };
