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
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
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
  if (re.test(block)) return block.replace(re, el);
  if (value === null) return block;
  const idx = TASK_ORDER.indexOf(tag);
  for (const later of TASK_ORDER.slice(idx + 1)) {
    const m = new RegExp(`\\n?([ \\t]*)<${later}[\\s>/]`).exec(block);
    if (m) return block.slice(0, m.index) + `\n${m[1]}${el}` + block.slice(m.index);
  }
  return block.replace(/(\s*)<\/Task>\s*$/, `$1  ${el}$1</Task>`);
}

function updatePlan(file, { updates = [], statusDate, saveAs } = {}, workspace) {
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
    raw = raw.replace(m[0], block);
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
  return { saved, note: 'Microsoft Project recalculates dependent dates when the file is opened.', changes: changed };
}

module.exports = { load, readPlan, analyze, updatePlan, hasMsProject, iso, toDate, addWorkdays, workdaysBetween, isWorkday };
