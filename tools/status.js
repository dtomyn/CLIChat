// Weekly status from a Microsoft Project plan and a RAID log.
// One status model (facts calculated in code, every fact with a source) drives both outputs:
// a detailed status report (Markdown) and a one-page executive dashboard (self-contained HTML).
// The AI may add a narrative and decisions needed; those are stored and shown as AI-written, separate from the facts.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const project = require('./project');
const raidTools = require('./raid');

const iso = project.iso;
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
const CLOSED = /\b(closed|resolved|done|complete[d]?|retired|cancel+ed|mitigated)\b/i;
const HML = { h: 3, high: 3, m: 2, med: 2, medium: 2, l: 1, low: 1 };

// ------------------------------------------------------------------ RAID log
function cellValue(c) {
  const v = c.value;
  if (v == null) return '';
  if (v instanceof Date) return iso(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === 'object') {
    if ('result' in v) return v.result instanceof Date ? iso(v.result) : v.result ?? '';
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.text) return v.text;
  }
  return v;
}

const KINDS = [['risk', /risk/i], ['issue', /issue/i], ['decision', /decision/i], ['dependency', /depend/i], ['assumption', /assum/i], ['action', /action/i]];
const kindOf = (s) => (KINDS.find(([, re]) => re.test(String(s))) || [null])[0];

/** Read a RAID workbook: one sheet per type, or one sheet with a Type column. Columns are recognised by header name. */
async function readRaid(file) {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(file)) await wb.csv.readFile(file); else await wb.xlsx.readFile(file);
  const items = [];
  for (const ws of wb.worksheets) {
    const headers = [];
    ws.getRow(1).eachCell((c, n) => { headers[n] = String(cellValue(c)).trim(); });
    const col = (...res) => headers.findIndex((h) => h && res.some((re) => re.test(h)));
    const c = {
      id: col(/^id$/i, /\bref\b/i, /^#$/), type: col(/^type$/i, /category type/i),
      title: col(/^(risk|issue|decision|dependency|assumption|action|title|summary)$/i, /description/i),
      prob: col(/probab|likelihood/i), impact: col(/impact/i), score: col(/score|rating|severity/i), priority: col(/priority/i),
      owner: col(/owner/i), status: col(/status/i), due: col(/^due|next review|target|date needed/i), action: col(/mitigation|action|response/i),
      task: col(/related task|task id|plan task|milestone/i),
    };
    const sheetKind = kindOf(ws.name);
    if (!sheetKind && c.type < 0) continue;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = (i) => (i > 0 ? cellValue(row.getCell(i)) : '');
      const title = String(get(c.title) || '').trim();
      if (!title) continue;
      const kind = sheetKind || kindOf(get(c.type)) || 'risk';
      const score = +get(c.score) || ((HML[String(get(c.prob)).toLowerCase()] || 0) * (HML[String(get(c.impact)).toLowerCase()] || 0)) || null;
      const priority = String(get(c.priority) || '');
      const status = String(get(c.status) || '');
      items.push({
        kind, id: String(get(c.id) || `${ws.name}-${r}`), title, owner: String(get(c.owner) || ''), status,
        open: !CLOSED.test(status), score, priority, severity: severity(kind, score, priority),
        due: get(c.due) ? String(get(c.due)).slice(0, 10) : null, action: String(get(c.action) || ''),
        relatedTask: get(c.task) ? String(get(c.task)) : null, source: { type: 'raid', ref: `${ws.name}!A${r}` },
      });
    }
  }
  return items;
}

function severity(kind, score, priority) {
  if (score != null) return score >= 6 ? 'High' : score >= 3 ? 'Medium' : 'Low';
  const p = String(priority).toLowerCase();
  return /crit|high|^h$/.test(p) ? 'High' : /med|^m$/.test(p) ? 'Medium' : p ? 'Low' : 'Unrated';
}

// ------------------------------------------------------------------ status model
/**
 * Build the status model. Every number and list comes from the plan and RAID log; nothing here is written by the AI.
 * opts: { raid, root, statusDate, narrative, decisionsNeeded, author }
 */
async function buildModel(planFile, opts = {}) {
  const root = opts.root;
  const a = project.analyze(planFile, opts.statusDate);
  const p = project.load(planFile);
  const status = project.toDate(a.statusDate);
  const q = (o) => project.queryPlan(planFile, { statusDate: a.statusDate, limit: 500, ...o }, root);

  // Milestones with week-over-week movement against the last saved version.
  const versions = root ? project.earlierVersions(root, planFile, status, 1) : [];
  const prev = versions.length ? project.load(versions[0]) : null;
  const milestones = p.tasks.filter((t) => t.milestone).map((t) => {
    const before = prev?.byUid.get(t.uid);
    const variance = t.baselineFinish && t.finish ? project.workdaysBetween(t.baselineFinish, t.finish) : null;
    const change = before?.finish && t.finish ? project.workdaysBetween(before.finish, t.finish) : null;
    const upstream = t.percent < 100 ? q({ relatedTo: { task: String(t.id) }, status: ['late', 'behind', 'not_started', 'in_progress', 'should_have_started'], sort: 'float', limit: 8 }).tasks : [];
    return {
      id: t.id, name: t.name, baseline: iso(t.baselineFinish), forecast: iso(t.finish), varianceDays: variance, changeSinceLast: change,
      state: t.percent === 100 ? 'Complete' : variance == null ? 'No baseline' : variance > 10 ? 'Slipped badly' : variance > 0 ? 'Slipped' : variance < 0 ? 'Early' : 'On baseline',
      daysToGo: t.percent < 100 && t.finish ? project.workdaysBetween(status, t.finish) : null,
      atRiskWork: upstream.filter((x) => x.status !== 'not started' || x.floatDays === 0).slice(0, 6).map((x) => ({ id: x.id, task: x.task, finish: x.finish, status: x.status, floatDays: x.floatDays, owner: x.resources })),
      source: { type: 'plan', ref: `task #${t.id}` },
    };
  });

  const changes = prev ? q({ changedSince: 'last' }) : null;
  // Read the newest approved RAID log (never a "(proposed)" review copy) and note any huddle changes still waiting.
  const raidInput = opts.raid ? await raidTools.latestRaid(opts.raid) : null;
  const raidFile = raidInput?.used || null;
  const raid = raidFile ? await readRaid(raidFile) : [];
  const open = raid.filter((x) => x.open);
  const bySeverity = (x, y) => (y.score ?? { High: 6, Medium: 3, Low: 1 }[y.severity] ?? 0) - (x.score ?? { High: 6, Medium: 3, Low: 1 }[x.severity] ?? 0);
  const risks = open.filter((x) => x.kind === 'risk').sort(bySeverity);
  const issues = open.filter((x) => x.kind === 'issue').sort(bySeverity);
  const overdueRaid = open.filter((x) => x.due && x.due < a.statusDate);

  // RAG: the plan's suggested rating, raised by severe open RAID items. Reasons are listed so a reviewer can disagree with a rule, not a feeling.
  const reasons = [];
  if (a.schedule.slipWorkingDays > 10) reasons.push(`Forecast finish is ${a.schedule.slipWorkingDays} working days behind baseline (more than 10 = Red).`);
  else if (a.schedule.slipWorkingDays > 0) reasons.push(`Forecast finish is ${a.schedule.slipWorkingDays} working days behind baseline.`);
  if (a.lateTasks.length) reasons.push(`${a.lateTasks.length} task${a.lateTasks.length === 1 ? ' is' : 's are'} past finish and not complete${a.lateTasks.length > 3 ? ' (more than 3 = Red)' : ''}.`);
  if (a.overallocatedResources_next6Weeks.length) reasons.push(`${a.overallocatedResources_next6Weeks.length} ${a.overallocatedResources_next6Weeks.length === 1 ? 'person is' : 'people are'} over-allocated in the next 6 weeks.`);
  const highIssues = issues.filter((x) => x.severity === 'High');
  const topRisks = risks.filter((x) => (x.score ?? 0) >= 9);
  if (highIssues.length) reasons.push(`${highIssues.length} high-priority issue${highIssues.length === 1 ? '' : 's'} open.`);
  if (topRisks.length) reasons.push(`${topRisks.length} risk${topRisks.length === 1 ? '' : 's'} at the highest score (9).`);
  let rag = a.suggestedRag;
  if (rag === 'Green' && (highIssues.length || topRisks.length)) rag = 'Amber';
  if (!reasons.length) reasons.push('On baseline, nothing late, no severe open risks or issues.');
  const narrative = opts.narrative ? String(opts.narrative).trim() : null;
  const warnings = [];
  const named = narrative ? [...new Set((narrative.match(/\b(red|amber|green)\b/gi) || []).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()))] : [];
  if (named.length && !named.includes(rag)) warnings.push(`The AI summary calls the project ${named.join('/')}, but the calculated rating is ${rag}. Correct the summary or record why the rating should differ.`);

  const sources = [{ kind: 'plan', file: path.basename(planFile), statusDate: a.statusDate, modified: fs.statSync(planFile).mtime.toISOString(), sha256: sha(planFile) }];
  if (prev) sources.push({ kind: 'plan (previous version)', file: path.relative(root, versions[0]).replace(/\\/g, '/'), statusDate: iso(prev.statusDate), sha256: sha(versions[0]) });
  if (raidFile) sources.push({ kind: 'RAID log', file: path.basename(raidFile), modified: fs.statSync(raidFile).mtime.toISOString(), sha256: sha(raidFile) });

  return {
    schemaVersion: 1,
    project: a.project, statusDate: a.statusDate, generatedAt: new Date().toISOString(),
    rag: { rating: rag, planSuggested: a.suggestedRag, reasons, rule: 'Red if forecast slips more than 10 working days or more than 3 tasks are late; Amber if any slip, late task or over-allocation, or a high-priority issue or top-scored risk is open; otherwise Green.' },
    schedule: { ...a.schedule, percentComplete: a.progress.percentComplete, expectedByNow: a.progress.expectedByNow, tasks: a.progress.tasks, complete: a.progress.complete, source: { type: 'plan', ref: 'whole plan' } },
    cost: a.cost || null,
    milestones,
    changesSinceLast: prev ? { comparedWith: iso(prev.statusDate), items: changes.tasks.map((t) => ({ id: t.id, task: t.task, change: t.change, source: { type: 'plan', ref: `task #${t.id}` } })) } : null,
    attention: {
      late: a.lateTasks.map((t) => ({ ...t, source: { type: 'plan', ref: `task #${t.id}` } })),
      behind: a.behindSchedule.map((t) => ({ ...t, source: { type: 'plan', ref: `task #${t.id}` } })),
      overallocated: a.overallocatedResources_next6Weeks,
      overdueRaid: overdueRaid.map((x) => ({ id: x.id, kind: x.kind, title: x.title, owner: x.owner, due: x.due, source: x.source })),
    },
    raidInput: raidInput && { requested: raidInput.requested, used: path.basename(raidInput.used), notes: raidInput.notes, pending: raidInput.pending },
    risks, issues,
    decisions: raid.filter((x) => x.kind === 'decision').slice(-5),
    dependencies: open.filter((x) => x.kind === 'dependency'),
    ai: {
      note: 'Written by the AI from the facts above. Check it before sending.',
      narrative,
      warnings,
      decisionsNeeded: (opts.decisionsNeeded || []).map(String).filter(Boolean),
    },
    provenance: { generatedBy: 'Lumen build_status_report', sources, review: { status: 'Draft', reviewedBy: null, reviewedAt: null }, author: opts.author || null },
  };
}

// ------------------------------------------------------------------ rendering
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const signed = (n) => (n == null ? '—' : n > 0 ? `+${n}` : String(n));
const RAG = { Red: { cls: 'critical', icon: '■' }, Amber: { cls: 'warning', icon: '▲' }, Green: { cls: 'good', icon: '●' } };
const MS_STATE = { Complete: ['good', '✓'], Early: ['good', '●'], 'On baseline': ['good', '●'], Slipped: ['warning', '▲'], 'Slipped badly': ['critical', '■'], 'No baseline': ['muted', '–'] };

function renderMarkdown(m) {
  const L = [];
  const t = (rows, head) => { L.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`); for (const r of rows) L.push(`| ${r.map((x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`); L.push(''); };
  L.push(`# ${m.project}: status report, ${fmtDate(m.statusDate)}`, '', `> **${m.provenance.review.status}.** Facts come from the plan and RAID log; the summary and decisions marked *AI-written* need checking before this is sent.`, '');
  L.push(`**Overall: ${m.rag.rating}**`, '', ...m.rag.reasons.map((r) => `- ${r}`), '');
  if (m.ai.narrative) L.push('## Summary *(AI-written)*', '', ...m.ai.warnings.flatMap((w) => [`> **Check:** ${w}`, '']), m.ai.narrative, '');
  L.push('## Schedule', '');
  t([[fmtDate(m.schedule.forecastFinish), fmtDate(m.schedule.baselineFinish), signed(m.schedule.slipWorkingDays), `${m.schedule.percentComplete}%`, `${m.schedule.expectedByNow}%`]], ['Forecast finish', 'Baseline finish', 'Slip (working days)', '% complete', 'Planned by now']);
  if (m.cost) t([[`${m.cost.currency}${m.cost.forecast.toLocaleString()}`, `${m.cost.currency}${m.cost.baseline.toLocaleString()}`, `${m.cost.currency}${m.cost.variance.toLocaleString()}`]], ['Cost forecast', 'Cost baseline', 'Variance']);
  L.push('## Milestones', '');
  t(m.milestones.map((x) => [`#${x.id}`, x.name, x.baseline, x.forecast, signed(x.varianceDays), signed(x.changeSinceLast), x.state]), ['ID', 'Milestone', 'Baseline', 'Forecast', 'Variance', 'Change since last', 'Status']);
  if (m.changesSinceLast) {
    L.push(`## What changed since ${fmtDate(m.changesSinceLast.comparedWith)}`, '');
    if (m.changesSinceLast.items.length) t(m.changesSinceLast.items.map((x) => [`#${x.id}`, x.task, x.change]), ['ID', 'Task', 'Change']); else L.push('No task dates, progress or names changed.', '');
  }
  L.push('## Needs attention', '');
  if (m.attention.late.length) t(m.attention.late.map((x) => [`#${x.id}`, x.task, x.finish, `${x.percentComplete}%`, x.daysOverdue, x.resources]), ['ID', 'Late task', 'Was due', 'Done', 'Days overdue', 'Owner']);
  if (m.attention.behind.length) t(m.attention.behind.map((x) => [`#${x.id}`, x.task, `${x.percentComplete}%`, `${x.expectedPercent}%`, x.resources]), ['ID', 'Behind schedule', 'Done', 'Expected', 'Owner']);
  if (m.attention.overallocated.length) t(m.attention.overallocated.map((x) => [x.resource, x.peakLoad, `${x.firstDay} to ${x.lastDay}`, x.tasks.join('; ')]), ['Person', 'Peak load', 'When', 'Tasks']);
  if (m.attention.overdueRaid.length) t(m.attention.overdueRaid.map((x) => [x.id, x.title, x.owner, x.due]), ['RAID item', 'Overdue for review or action', 'Owner', 'Due']);
  if (m.risks.length || m.issues.length) {
    L.push('## Risks and issues', '');
    t([...m.issues, ...m.risks].map((x) => [x.id, x.kind, x.title, x.severity + (x.score ? ` (${x.score})` : ''), x.owner, x.status, x.action]), ['ID', 'Type', 'Description', 'Severity', 'Owner', 'Status', 'Mitigation / action']);
  }
  if (m.ai.decisionsNeeded.length) L.push('## Decisions needed *(AI-written)*', '', ...m.ai.decisionsNeeded.map((d) => `- ${d}`), '');
  if (m.raidInput?.notes.length) {
    L.push('## RAID log: what was used', '', ...m.raidInput.notes.map((n) => `- ${n}`), '');
    if (m.raidInput.pending?.items.length) t(m.raidInput.pending.items.map((x) => [x.n, x.state, `${x.change} ${x.kind} ${x.id}`.trim(), x.what]), ['#', 'Status', 'Change', 'What changes']);
  }
  L.push('## Sources', '');
  t(m.provenance.sources.map((s) => [s.kind, s.file, s.statusDate || s.modified?.slice(0, 10), s.sha256]), ['Source', 'File', 'As of', 'Fingerprint']);
  L.push(`*Generated ${m.generatedAt.slice(0, 16).replace('T', ' ')} UTC by ${m.provenance.generatedBy}. RAG rule: ${m.rag.rule}*`);
  return L.join('\n');
}

function renderHtml(m) {
  const rag = RAG[m.rag.rating];
  const pill = (cls, icon, label) => `<span class="pill ${cls}"><span aria-hidden="true">${icon}</span> ${esc(label)}</span>`;
  const src = (s) => (s ? `<span class="src" title="Source">${esc(s.type === 'raid' ? `RAID ${s.ref}` : `Plan ${s.ref}`)}</span>` : '');
  const maxVar = Math.max(5, ...m.milestones.map((x) => Math.abs(x.varianceDays || 0)));
  const behindPts = m.schedule.expectedByNow - m.schedule.percentComplete;
  const tile = (label, value, sub, cls = '') => `<div class="tile"><div class="label">${esc(label)}</div><div class="value ${cls}">${esc(value)}</div><div class="sub">${sub}</div></div>`;

  const msRows = m.milestones.map((x) => {
    const [cls, icon] = MS_STATE[x.state] || ['muted', '–'];
    const w = x.varianceDays ? Math.round((Math.abs(x.varianceDays) / maxVar) * 100) : 0;
    const bar = x.varianceDays ? `<div class="vbar" title="${esc(`${x.name}: ${signed(x.varianceDays)} working days vs. baseline`)}"><span class="${x.varianceDays > 0 ? (x.varianceDays > 10 ? 'critical' : 'warning') : 'good'}" style="width:${w}%"></span></div>` : '<div class="vbar"></div>';
    const work = x.atRiskWork.length ? `<table class="inner"><thead><tr><th>ID</th><th>Work this milestone is waiting on</th><th>Finish</th><th>Status</th><th>Float</th><th>Owner</th></tr></thead><tbody>${x.atRiskWork.map((w2) => `<tr><td>#${w2.id}</td><td>${esc(w2.task)}</td><td class="num">${esc(w2.finish)}</td><td>${esc(w2.status)}</td><td class="num">${w2.floatDays ?? '—'}</td><td>${esc(w2.owner)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing outstanding upstream.</p>';
    return `<details class="ms"><summary><span class="msname">#${x.id} ${esc(x.name)}</span><span class="num">${esc(x.baseline || '—')}</span><span class="num">${esc(x.forecast || '—')}</span><span class="num strong">${signed(x.varianceDays)}</span>${bar}<span class="num">${x.changeSinceLast == null ? '—' : signed(x.changeSinceLast)}</span>${pill(cls, icon, x.state)}</summary><div class="drill">${work}<div class="srcrow">${src(x.source)}</div></div></details>`;
  }).join('');

  const raidRows = [...m.issues, ...m.risks].slice(0, 8).map((x) => {
    const cls = x.severity === 'High' ? 'critical' : x.severity === 'Medium' ? 'warning' : 'muted';
    return `<tr><td>${esc(x.id)}</td><td>${esc(x.kind)}</td><td>${esc(x.title)}${x.action ? `<div class="muted small">${esc(x.action)}</div>` : ''}</td><td>${pill(cls, cls === 'critical' ? '■' : cls === 'warning' ? '▲' : '●', `${x.severity}${x.score ? ` · ${x.score}` : ''}`)}</td><td>${esc(x.owner)}</td><td>${esc(x.status)}</td><td>${src(x.source)}</td></tr>`;
  }).join('');

  const att = [
    ...m.attention.late.map((x) => `<li>${pill('critical', '■', 'Late')} <b>#${x.id} ${esc(x.task)}</b>: due ${esc(x.finish)}, ${x.percentComplete}% done, ${x.daysOverdue} working day${x.daysOverdue === 1 ? '' : 's'} overdue (${esc(x.resources)}) ${src(x.source)}</li>`),
    ...m.attention.behind.map((x) => `<li>${pill('warning', '▲', 'Behind')} <b>#${x.id} ${esc(x.task)}</b>: ${x.percentComplete}% done, ${x.expectedPercent}% expected (${esc(x.resources)}) ${src(x.source)}</li>`),
    ...m.attention.overallocated.map((x) => `<li>${pill('warning', '▲', 'Overloaded')} <b>${esc(x.resource)}</b>: ${esc(x.peakLoad)} from ${esc(x.firstDay)} to ${esc(x.lastDay)} (${esc(x.tasks.join('; '))})</li>`),
    ...m.attention.overdueRaid.map((x) => `<li>${pill('warning', '▲', 'Overdue review')} <b>${esc(x.id)}</b> ${esc(x.title)}: due ${esc(x.due)} (${esc(x.owner)}) ${src(x.source)}</li>`),
  ];

  const changes = m.changesSinceLast
    ? `<section><h2>What changed since ${esc(fmtDate(m.changesSinceLast.comparedWith))}</h2>${m.changesSinceLast.items.length ? `<ul class="list">${m.changesSinceLast.items.slice(0, 12).map((x) => `<li><b>#${x.id} ${esc(x.task)}</b>: ${esc(x.change)} ${src(x.source)}</li>`).join('')}</ul>${m.changesSinceLast.items.length > 12 ? `<p class="muted">and ${m.changesSinceLast.items.length - 12} more in the status report.</p>` : ''}` : '<p class="muted">No task dates, progress or names changed.</p>'}</section>`
    : '<section><h2>What changed since last time</h2><p class="muted">This is the first saved version of the plan. Next time, this section lists what moved.</p></section>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.project)} · Executive status · ${esc(m.statusDate)}</title>
<style>
:root{--bg:#fafaf7;--surface:#fff;--ink:#0b0b0b;--ink2:#52514c;--muted:#7a7970;--line:#e1e0d9;--axis:#c3c2b7;--good:#0ca30c;--goodtext:#006300;--warning:#fab219;--serious:#ec835a;--critical:#d03b3b;--accent:#3b5bdb}
@media (prefers-color-scheme:dark){:root{--bg:#121211;--surface:#1a1a19;--ink:#f2f1ec;--ink2:#c3c2b7;--muted:#9a998f;--line:#2c2c2a;--axis:#383835;--goodtext:#0ca30c;--accent:#7b93ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 "Segoe UI",system-ui,-apple-system,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px}
.draft{background:color-mix(in srgb,var(--warning) 22%,var(--surface));border:1px solid var(--warning);border-radius:8px;padding:8px 12px;margin-bottom:16px;font-weight:600}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:16px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:0 0 10px}.sub,.muted{color:var(--muted)}.small{font-size:12px}
section{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:16px}
.hero{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.hero .rating{font-size:48px;font-weight:600;line-height:1;display:flex;align-items:center;gap:12px}
.hero .rating .dot{width:20px;height:20px;border-radius:4px;display:inline-block}
.reasons{margin:0;padding-left:18px;color:var(--ink2)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.tile .label{color:var(--ink2);font-size:12px}
.tile .value{font-size:24px;font-weight:600;margin:2px 0}.tile .sub{font-size:12px}
.pill{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:1px 8px;font-size:12px;font-weight:600;white-space:nowrap;border:1px solid}
.pill.good{border-color:var(--good);color:var(--goodtext)}.pill.warning{border-color:var(--warning);color:var(--ink)}.pill.warning span{color:#b07800}.pill.critical{border-color:var(--critical);color:var(--critical)}.pill.muted{border-color:var(--line);color:var(--muted)}
.good-bg{background:var(--good)}.warning-bg{background:var(--warning)}.critical-bg{background:var(--critical)}
.ai{border-left:4px solid var(--accent)}.warn{color:var(--critical);font-weight:600}.ai .tag{font-size:12px;color:var(--accent);font-weight:600}
.mshead,.ms summary{display:grid;grid-template-columns:minmax(180px,2.2fr) 88px 88px 64px minmax(80px,1.4fr) 70px 130px;gap:10px;align-items:center}
.mshead{font-size:12px;color:var(--muted);padding:0 8px 6px 24px;border-bottom:1px solid var(--line)}
.ms summary{cursor:pointer;padding:8px;border-radius:6px;list-style:none;position:relative;padding-left:24px}
.ms summary::before{content:"▸";position:absolute;left:8px;color:var(--muted)}.ms[open] summary::before{content:"▾"}
.ms summary:hover{background:color-mix(in srgb,var(--accent) 7%,transparent)}.ms summary:focus-visible{outline:2px solid var(--accent)}
.ms+.ms{border-top:1px solid var(--line)}
.num{font-variant-numeric:tabular-nums;text-align:right}.strong{font-weight:600}
.vbar{height:8px;background:transparent;border-left:1px solid var(--axis)}.vbar span{display:block;height:8px;border-radius:0 4px 4px 0}
.critical-text{color:var(--critical)}.vbar .critical{background:var(--critical)}.vbar .warning{background:var(--warning)}.vbar .good{background:var(--good)}
.drill{padding:4px 8px 12px 24px}
table{width:100%;border-collapse:collapse}th{font-size:12px;color:var(--muted);text-align:left;font-weight:600;border-bottom:1px solid var(--line);padding:6px}
td{border-bottom:1px solid var(--line);padding:6px;vertical-align:top}table.inner td,table.inner th{font-size:13px}
.list{margin:0;padding-left:0;list-style:none}.list li{padding:6px 0;border-bottom:1px solid var(--line)}.list li:last-child{border:0}
.src{font-size:11px;color:var(--muted);border:1px dashed var(--line);border-radius:4px;padding:0 4px;white-space:nowrap}
.srcrow{margin-top:6px}footer{color:var(--muted);font-size:12px}
@media print{.draft{border-width:2px}details{open:true}section{break-inside:avoid}}
@media (max-width:800px){.mshead{display:none}.ms summary{grid-template-columns:1fr auto auto}.ms summary .vbar,.ms summary .num:nth-of-type(2),.ms summary .num:nth-of-type(1){display:none}}
</style></head><body><main>
<div class="draft" role="status">${esc(m.provenance.review.status)}: for PMO review before it is shared. Facts come from the plan and RAID log; boxes marked AI-written need checking.</div>
${m.raidInput?.notes.length ? `<div class="draft" role="note"><b>RAID log:</b> ${m.raidInput.notes.map(esc).join(' ')}</div>` : ''}
<header><div><h1>${esc(m.project)}</h1><div class="sub">Executive status · status date ${esc(fmtDate(m.statusDate))}</div></div><div class="sub small">Generated ${esc(m.generatedAt.slice(0, 16).replace('T', ' '))} UTC</div></header>

<section class="hero" aria-label="Overall status">
  <div class="rating"><span class="dot ${rag.cls}-bg" aria-hidden="true"></span>${esc(m.rag.rating)}</div>
  <div><ul class="reasons">${m.rag.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><div class="muted small" style="margin-top:6px">Rule: ${esc(m.rag.rule)}</div></div>
</section>

<div class="tiles">
${tile('Forecast finish', fmtDate(m.schedule.forecastFinish), `Baseline ${esc(fmtDate(m.schedule.baselineFinish))}`)}
${tile('Schedule slip', `${signed(m.schedule.slipWorkingDays)} days`, 'working days vs. baseline', m.schedule.slipWorkingDays > 10 ? 'critical-text' : '')}
${tile('Complete', `${m.schedule.percentComplete}%`, behindPts > 0 ? `${m.schedule.expectedByNow}% planned by now (${behindPts} points behind)` : `${m.schedule.expectedByNow}% planned by now`)}
${tile('Open risks and issues', String(m.risks.length + m.issues.length), `${[...m.risks, ...m.issues].filter((x) => x.severity === 'High').length} high severity`)}
${m.cost ? tile('Cost forecast', `${m.cost.currency}${Math.round(m.cost.forecast / 1000).toLocaleString()}K`, `${m.cost.variance >= 0 ? '+' : '−'}${m.cost.currency}${Math.abs(Math.round(m.cost.variance / 1000)).toLocaleString()}K vs. baseline`) : ''}
</div>

${m.ai.narrative ? `<section class="ai"><div class="tag">AI-written summary · check before sending</div>${m.ai.warnings.map((w) => `<p class="warn" role="alert">▲ ${esc(w)}</p>`).join('')}<p>${esc(m.ai.narrative).replace(/\n+/g, '</p><p>')}</p></section>` : ''}

<section><h2>Milestones</h2><p class="muted small" style="margin-top:-6px">Select a milestone to see the unfinished work it depends on.</p>
<div class="mshead"><span>Milestone</span><span class="num">Baseline</span><span class="num">Forecast</span><span class="num">Variance</span><span>Working days vs. baseline</span><span class="num">Since last</span><span>Status</span></div>
${msRows}</section>

${changes}

<section><h2>Needs attention</h2>${att.length ? `<ul class="list">${att.join('')}</ul>` : '<p class="muted">Nothing late, behind or overloaded.</p>'}</section>

${raidRows ? `<section><h2>Top risks and issues</h2><table><thead><tr><th>ID</th><th>Type</th><th>Description</th><th>Severity</th><th>Owner</th><th>Status</th><th>Source</th></tr></thead><tbody>${raidRows}</tbody></table></section>` : ''}

${m.ai.decisionsNeeded.length ? `<section class="ai"><div class="tag">AI-written · decisions needed · check before sending</div><ul>${m.ai.decisionsNeeded.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></section>` : ''}

<footer><b>Sources:</b> ${m.provenance.sources.map((s) => `${esc(s.kind)}: ${esc(s.file)}${s.statusDate ? ` (status ${esc(s.statusDate)})` : ''} · fingerprint ${esc(s.sha256)}`).join(' &nbsp;|&nbsp; ')}<br>Generated by ${esc(m.provenance.generatedBy)}. Review status: ${esc(m.provenance.review.status)}.</footer>
</main></body></html>`;
}

/** Build the model and write status.json, the status report (Markdown) and the executive dashboard (HTML). */
async function buildReport(planFile, opts = {}) {
  const m = await buildModel(planFile, opts);
  const dir = opts.outputDir || path.join(opts.root || path.dirname(planFile), 'Status reports', m.statusDate);
  fs.mkdirSync(dir, { recursive: true });
  const base = String(m.project).replace(/[<>:"/\\|?*]/g, '_');
  const files = {
    model: path.join(dir, 'status.json'),
    report: path.join(dir, `${base} - Status report.md`),
    dashboard: path.join(dir, `${base} - Executive dashboard.html`),
  };
  fs.writeFileSync(files.model, JSON.stringify(m, null, 2), 'utf8');
  fs.writeFileSync(files.report, renderMarkdown(m), 'utf8');
  fs.writeFileSync(files.dashboard, renderHtml(m), 'utf8');
  return {
    saved: Object.values(files), overall: m.rag.rating, reasons: m.rag.reasons,
    milestonesSlipped: m.milestones.filter((x) => /Slipped/.test(x.state)).length,
    changedSinceLast: m.changesSinceLast ? m.changesSinceLast.items.length : 'no earlier version saved yet',
    openRisks: m.risks.length, openIssues: m.issues.length,
    ...(m.ai.warnings.length ? { warnings: m.ai.warnings } : {}),
    note: 'Saved as a draft for PMO review. Facts are calculated from the files; only the narrative and decisions you supplied are AI-written.',
  };
}

module.exports = { readRaid, buildModel, buildReport, renderMarkdown, renderHtml };
