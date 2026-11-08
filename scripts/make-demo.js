// Generates the "Contoso CRM Migration" demo pack in ./demo:
//   - a Microsoft Project plan (Project XML / MSPDI — opens directly in Microsoft Project)
//   - a budget tracker, RAID log, timesheets and a weekly progress update (Excel)
// Run:  node scripts/make-demo.js

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { iso, addWorkdays, isWorkday, workdaysBetween } = require('../tools/project');

const OUT = process.env.DEMO_OUT ? path.resolve(process.env.DEMO_OUT) : path.join(__dirname, '..', 'demo');
fs.mkdirSync(OUT, { recursive: true });
const PLAN = 'Contoso CRM Migration.xml';
const PROJECT_START = new Date('2026-08-03T00:00:00');
const STATUS = new Date('2026-10-23T00:00:00'); // last time the PM updated the plan

// ------------------------------------------------------------------ resources
const R = {
  PS: { name: 'Priya Shah', group: 'PMO', rate: 110, initials: 'PS' },
  ML: { name: 'Marcus Lee', group: 'Business Analysis', rate: 85, initials: 'ML' },
  ER: { name: 'Elena Rossi', group: 'Architecture', rate: 130, initials: 'ER' },
  TB: { name: 'Tom Becker', group: 'CRM Development', rate: 95, initials: 'TB' },
  AK: { name: 'Aisha Khan', group: 'Integration', rate: 95, initials: 'AK' },
  BC: { name: 'Ben Carter', group: 'Data', rate: 80, initials: 'BC' },
  GK: { name: 'Grace Kim', group: 'Quality Assurance', rate: 85, initials: 'GK' },
  SM: { name: 'Sales Ops SMEs', group: 'Business', rate: 60, initials: 'SME', maxUnits: 2 },
};
Object.values(R).forEach((r, i) => { r.uid = i + 1; r.maxUnits = r.maxUnits || 1; });

// ------------------------------------------------------------------ tasks
// [wbs, name, days, preds(wbs), resources "KEY:units", slipDays, note]
const T = [
  ['1', 'Project Initiation'],
  ['1.1', 'Project charter & business case', 5, [], ['PS']],
  ['1.2', 'Stakeholder analysis', 3, ['1.1'], ['PS', 'ML']],
  ['1.3', 'Project kickoff', 0, ['1.2'], []],
  ['2', 'Requirements & Planning'],
  ['2.1', 'Current-state process mapping', 8, ['1.3'], ['ML', 'SM']],
  ['2.2', 'Requirements workshops', 10, ['2.1'], ['ML', 'SM'], 3, 'Two workshops rescheduled — Sales VP availability.'],
  ['2.3', 'Detailed project plan & budget', 5, ['1.3'], ['PS']],
  ['2.4', 'Requirements sign-off', 0, ['2.2', '2.3'], []],
  ['3', 'Solution Design'],
  ['3.1', 'Solution architecture', 10, ['2.4'], ['ER']],
  ['3.2', 'Data migration strategy', 6, ['2.4'], ['BC', 'ER:0.5']],
  ['3.3', 'Integration design (ERP, email, marketing)', 8, ['3.1'], ['AK', 'ER:0.5'], 2],
  ['3.4', 'Security & access model', 4, ['3.1'], ['ER']],
  ['3.5', 'Design approval', 0, ['3.2', '3.3', '3.4'], []],
  ['4', 'Build'],
  ['4.1', 'Configure sales pipeline & custom objects', 15, ['3.5'], ['TB']],
  ['4.2', 'Build ERP integration', 18, ['3.5'], ['AK'], 5, 'ERP vendor sandbox API delivered 1 week late.'],
  ['4.3', 'Build marketing automation integration', 10, ['4.2'], ['AK']],
  ['4.4', 'Reports & dashboards', 8, ['4.1'], ['TB']],
  ['4.5', 'Data cleansing (accounts, contacts, opportunities)', 12, ['3.2'], ['BC', 'SM'], 6, 'Duplicate rate higher than estimated (18% vs 8%).'],
  ['4.6', 'Data mapping & transformation scripts', 10, ['4.5'], ['BC', 'TB:0.5']],
  ['4.7', 'Build complete', 0, ['4.3', '4.4', '4.6'], []],
  ['5', 'Testing'],
  ['5.1', 'Test strategy & test scripts', 6, ['3.5'], ['GK']],
  ['5.2', 'System integration testing (SIT)', 10, ['4.7', '5.1'], ['GK', 'AK:0.5']],
  ['5.3', 'Trial data migration (dry run)', 5, ['4.6'], ['BC', 'TB']],
  ['5.4', 'User acceptance testing (UAT)', 10, ['5.2'], ['GK', 'SM', 'ML:0.5']],
  ['5.5', 'Performance testing', 4, ['5.2'], ['ER']],
  ['5.6', 'UAT sign-off', 0, ['5.4', '5.5'], []],
  ['6', 'Training & Change Management'],
  ['6.1', 'Communications plan', 4, ['2.4'], ['PS']],
  ['6.2', 'Training materials', 8, ['4.7'], ['ML']],
  ['6.3', 'Train the trainer', 3, ['6.2'], ['ML']],
  ['6.4', 'End-user training (120 sales reps)', 8, ['6.3', '5.6'], ['ML', 'SM']],
  ['7', 'Deployment & Closure'],
  ['7.1', 'Go / no-go decision', 0, ['6.4', '5.6'], []],
  ['7.2', 'Production data migration', 2, ['7.1'], ['BC', 'TB']],
  ['7.3', 'Go-live', 0, ['7.2'], []],
  ['7.4', 'Hypercare support', 15, ['7.3'], ['TB', 'AK', 'GK:0.5']],
  ['7.5', 'Project closure & lessons learned', 3, ['7.4'], ['PS']],
  ['7.6', 'Project complete', 0, ['7.5'], []],
];
// Reported % complete as of the status date (the "truth" behind the plan's progress fields).
const PROGRESS = { '4.1': 70, '4.2': 35, '4.5': 80, '4.6': 0, '5.3': 0, '5.1': 100, '6.1': 100, '3.3': 100, '4.4': 0 };

const tasks = T.map((r, i) => ({
  uid: i + 1, id: i + 1, wbs: r[0], name: r[1], summary: r.length === 2, days: r[2] ?? 0, preds: r[3] || [],
  res: (r[4] || []).map((k) => { const [key, u] = k.split(':'); return { r: R[key], units: u ? +u : 1 }; }),
  slip: r[5] || 0, note: r[6] || '', level: r[0].split('.').length,
}));
const byWbs = Object.fromEntries(tasks.map((t) => [t.wbs, t]));
const nextWork = (d) => { let x = new Date(d); while (!isWorkday(x)) x = new Date(+x + 86400000); return x; };

function schedule(useSlip) {
  const s = {}; const f = {};
  for (const t of tasks.filter((x) => !x.summary)) {
    const predFinish = t.preds.map((w) => f[w]).filter(Boolean);
    let start = predFinish.length ? new Date(Math.max(...predFinish)) : PROJECT_START;
    if (predFinish.length) start = t.days === 0 ? start : addWorkdays(start, 1);
    start = nextWork(start);
    const d = t.days + (useSlip ? t.slip : 0);
    s[t.wbs] = start; f[t.wbs] = d === 0 ? start : addWorkdays(start, d - 1);
  }
  return { s, f };
}
const base = schedule(false), cur = schedule(true);

for (const t of tasks) {
  if (t.summary) continue;
  t.start = cur.s[t.wbs]; t.finish = cur.f[t.wbs]; t.bStart = base.s[t.wbs]; t.bFinish = base.f[t.wbs];
  t.dur = t.days + t.slip;
  if (PROGRESS[t.wbs] != null) t.pct = PROGRESS[t.wbs];
  else if (t.finish <= STATUS) t.pct = 100;
  else if (t.start <= STATUS) t.pct = Math.round((workdaysBetween(t.start, addWorkdays(STATUS, 1)) / Math.max(1, t.dur)) * 100 / 5) * 5;
  else t.pct = 0;
  const hours = (u) => t.days * 8 * u;
  t.cost = t.res.reduce((sum, x) => sum + x.r.rate * x.units * t.dur * 8, 0);
  t.bCost = t.res.reduce((sum, x) => sum + x.r.rate * hours(x.units), 0);
}
for (const t of tasks.filter((x) => x.summary)) {
  const kids = tasks.filter((k) => !k.summary && k.wbs.startsWith(t.wbs + '.'));
  t.start = new Date(Math.min(...kids.map((k) => k.start))); t.finish = new Date(Math.max(...kids.map((k) => k.finish)));
  t.bStart = new Date(Math.min(...kids.map((k) => k.bStart))); t.bFinish = new Date(Math.max(...kids.map((k) => k.bFinish)));
  t.dur = workdaysBetween(t.start, addWorkdays(t.finish, 1));
  const w = kids.reduce((s, k) => s + Math.max(k.dur, 0.1), 0);
  t.pct = Math.round(kids.reduce((s, k) => s + k.pct * Math.max(k.dur, 0.1), 0) / w);
  t.cost = kids.reduce((s, k) => s + k.cost, 0); t.bCost = kids.reduce((s, k) => s + k.bCost, 0);
}
const projStart = PROJECT_START, projFinish = new Date(Math.max(...tasks.map((t) => t.finish)));

// ------------------------------------------------------------------ MSPDI writer
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dt = (d, end) => `${iso(d)}T${end ? '17:00:00' : '08:00:00'}`;
const pt = (h) => `PT${Math.round(h)}H0M0S`;
const el = (k, v) => (v === undefined || v === null || v === '' ? '' : `<${k}>${esc(v)}</${k}>`);

function taskXml(t) {
  const milestone = !t.summary && t.days === 0;
  const parts = [
    el('UID', t.uid), el('ID', t.id), el('Name', t.name), el('Type', 1), el('IsNull', 0), el('WBS', t.wbs), el('OutlineNumber', t.wbs), el('OutlineLevel', t.level), el('Priority', 500),
    el('Start', dt(t.start)), el('Finish', dt(t.finish, !milestone)), el('Duration', pt(t.dur * 8)), el('DurationFormat', 7), el('Work', pt(t.res.reduce((s, x) => s + x.units * t.dur * 8, 0))),
    el('Estimated', 0), el('Milestone', milestone ? 1 : 0), el('Summary', t.summary ? 1 : 0), el('Critical', 0),
    el('PercentComplete', t.pct), el('PercentWorkComplete', t.pct), el('Cost', Math.round(t.cost * 100)),
    t.pct > 0 ? el('ActualStart', dt(t.start)) : '', t.pct === 100 ? el('ActualFinish', dt(t.finish, !milestone)) : '',
    el('ConstraintType', 0), el('CalendarUID', -1), el('Notes', t.note),
    ...t.preds.map((w) => `<PredecessorLink><PredecessorUID>${byWbs[w].uid}</PredecessorUID><Type>1</Type><CrossProject>0</CrossProject><LinkLag>0</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`),
    `<Baseline><Number>0</Number><Start>${dt(t.bStart)}</Start><Finish>${dt(t.bFinish, !milestone)}</Finish><Duration>${pt((t.summary ? workdaysBetween(t.bStart, addWorkdays(t.bFinish, 1)) : t.days) * 8)}</Duration><DurationFormat>7</DurationFormat><Cost>${Math.round(t.bCost * 100)}</Cost></Baseline>`,
  ];
  return `    <Task>${parts.join('')}</Task>`;
}

const weekDays = [1, 2, 3, 4, 5, 6, 7].map((d) => (d === 1 || d === 7)
  ? `<WeekDay><DayType>${d}</DayType><DayWorking>0</DayWorking></WeekDay>`
  : `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`).join('');

let auid = 1;
const assignments = tasks.filter((t) => !t.summary).flatMap((t) => t.res.map((x) => `    <Assignment><UID>${auid++}</UID><TaskUID>${t.uid}</TaskUID><ResourceUID>${x.r.uid}</ResourceUID><PercentWorkComplete>${t.pct}</PercentWorkComplete><Cost>${Math.round(x.r.rate * x.units * t.dur * 8 * 100)}</Cost><Finish>${dt(t.finish, true)}</Finish><Start>${dt(t.start)}</Start><Units>${x.units}</Units><Work>${pt(x.units * t.dur * 8)}</Work></Assignment>`));

const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>${PLAN}</Name>
  <Title>Contoso CRM Migration</Title>
  <Subject>Replace legacy SalesTrack CRM with a cloud CRM for 120 sales reps</Subject>
  <Company>Contoso Ltd.</Company>
  <Manager>Priya Shah</Manager>
  <Author>Priya Shah</Author>
  <CreationDate>2026-07-20T09:00:00</CreationDate>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${dt(projStart)}</StartDate>
  <FinishDate>${dt(projFinish, true)}</FinishDate>
  <StatusDate>${dt(STATUS, true)}</StatusDate>
  <CurrentDate>${dt(STATUS)}</CurrentDate>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultFinishTime>17:00:00</DefaultFinishTime>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>2400</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <DefaultTaskType>0</DefaultTaskType>
  <DurationFormat>7</DurationFormat>
  <WorkFormat>2</WorkFormat>
  <CurrencySymbol>$</CurrencySymbol>
  <CurrencyCode>USD</CurrencyCode>
  <NewTasksEffortDriven>0</NewTasksEffortDriven>
  <Calendars>
    <Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays>${weekDays}</WeekDays></Calendar>
  </Calendars>
  <Tasks>
    <Task><UID>0</UID><ID>0</ID><Name>Contoso CRM Migration</Name><Type>1</Type><IsNull>0</IsNull><WBS>0</WBS><OutlineNumber>0</OutlineNumber><OutlineLevel>0</OutlineLevel><Start>${dt(projStart)}</Start><Finish>${dt(projFinish, true)}</Finish><Summary>1</Summary></Task>
${tasks.map(taskXml).join('\n')}
  </Tasks>
  <Resources>
    <Resource><UID>0</UID><ID>0</ID><Type>1</Type><IsNull>0</IsNull></Resource>
${Object.values(R).map((r) => `    <Resource><UID>${r.uid}</UID><ID>${r.uid}</ID><Name>${esc(r.name)}</Name><Type>1</Type><IsNull>0</IsNull><Initials>${r.initials}</Initials><Group>${esc(r.group)}</Group><MaxUnits>${r.maxUnits.toFixed(2)}</MaxUnits><StandardRate>${r.rate}</StandardRate><StandardRateFormat>2</StandardRateFormat><OvertimeRate>0</OvertimeRate><OvertimeRateFormat>2</OvertimeRateFormat><CalendarUID>1</CalendarUID></Resource>`).join('\n')}
  </Resources>
  <Assignments>
${assignments.join('\n')}
  </Assignments>
</Project>
`;
fs.writeFileSync(path.join(OUT, PLAN), xml, 'utf8');

// ------------------------------------------------------------------ Excel helpers
const HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
function sheet(wb, name, cols, rows, opts = {}) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: opts.tab ? { argb: opts.tab } : undefined } });
  ws.columns = cols.map((c) => ({ header: c.h, key: c.h, width: c.w || 14, style: c.fmt ? { numFmt: c.fmt } : {} }));
  rows.forEach((r) => ws.addRow(r));
  const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = HEADER; h.height = 24; h.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}
const $ = '"$"#,##0';

async function budget() {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Priya Shah';
  const cats = [
    // category, budget, actual, committed, forecast-to-complete
    ['Internal labour', 412000, 238600, 0, 205000],
    ['Implementation partner (Northwind Consulting)', 285000, 171000, 85500, 64000],
    ['CRM licences (Year 1)', 168000, 168000, 0, 0],
    ['Integration middleware', 54000, 41200, 6000, 18500],
    ['Data migration tooling', 22000, 9800, 4000, 6000],
    ['Training & change management', 38000, 2400, 12000, 22000],
    ['Travel & expenses', 12000, 6900, 0, 4800],
    ['Contingency (10%)', 99000, 0, 0, 25000],
  ];
  const ws = sheet(wb, 'Budget Summary', [
    { h: 'Category', w: 44 }, { h: 'Approved budget', w: 16, fmt: $ }, { h: 'Actual to date', w: 15, fmt: $ }, { h: 'Committed (POs)', w: 16, fmt: $ },
    { h: 'Estimate to complete', w: 18, fmt: $ }, { h: 'Forecast at completion', w: 20, fmt: $ }, { h: 'Variance', w: 14, fmt: '"$"#,##0;[Red]-"$"#,##0' }, { h: '% spent', w: 10, fmt: '0%' }, { h: 'Status', w: 12 },
  ], [], { tab: 'FF1F4E79' });
  cats.forEach((c, i) => {
    const r = i + 2;
    ws.addRow([c[0], c[1], c[2], c[3], c[4], { formula: `C${r}+D${r}+E${r}` }, { formula: `B${r}-F${r}` }, { formula: `IF(B${r}=0,0,C${r}/B${r})` }, { formula: `IF(G${r}<0,"Over",IF(G${r}<B${r}*0.05,"Watch","On track"))` }]);
  });
  const last = cats.length + 1;
  const tot = ws.addRow(['Total', ...['B', 'C', 'D', 'E', 'F', 'G'].map((c) => ({ formula: `SUM(${c}2:${c}${last})` })), { formula: `C${last + 1}/B${last + 1}` }, '']);
  tot.font = { bold: true }; tot.border = { top: { style: 'medium' } }; tot.fill = fill('FFF2F2F2');
  ws.addConditionalFormatting({ ref: `I2:I${last}`, rules: [
    { type: 'containsText', operator: 'containsText', text: 'Over', style: { fill: fill('FFFADBD8'), font: { color: { argb: 'FF9C0006' }, bold: true } } },
    { type: 'containsText', operator: 'containsText', text: 'Watch', style: { fill: fill('FFFFEB9C') } },
    { type: 'containsText', operator: 'containsText', text: 'On track', style: { fill: fill('FFC6EFCE') } },
  ] });
  ws.addRow([]); ws.addRow(['Budget owner: Priya Shah · Sponsor: Dana Whitfield (VP Sales) · Last updated 23 Oct 2026']).font = { italic: true, color: { argb: 'FF666666' } };

  const months = ['Aug-26', 'Sep-26', 'Oct-26', 'Nov-26', 'Dec-26', 'Jan-27', 'Feb-27', 'Mar-27'];
  const spend = [
    [61200, 84300, 93100, 98000, 52000, 31000, 16000, 8000],
    [42000, 61000, 68000, 51000, 38500, 21000, 9000, 0],
    [168000, 0, 0, 0, 0, 0, 0, 0],
    [0, 18200, 23000, 14500, 6000, 4000, 0, 0],
    [0, 3800, 6000, 4000, 4000, 2000, 0, 0],
    [0, 0, 2400, 6000, 9000, 16000, 3000, 0],
    [1200, 2700, 3000, 1800, 1500, 1500, 0, 0],
  ];
  const ms = sheet(wb, 'Monthly Spend', [{ h: 'Category', w: 44 }, ...months.map((m) => ({ h: m, w: 11, fmt: $ })), { h: 'Total', w: 13, fmt: $ }], [], { tab: 'FF2E75B6' });
  cats.slice(0, 7).forEach((c, i) => { const r = i + 2; ms.addRow([c[0], ...spend[i], { formula: `SUM(B${r}:I${r})` }]); });
  const mt = ms.addRow(['Total', ...months.map((_, i) => ({ formula: `SUM(${String.fromCharCode(66 + i)}2:${String.fromCharCode(66 + i)}8)` })), { formula: 'SUM(J2:J8)' }]);
  mt.font = { bold: true }; mt.border = { top: { style: 'medium' } };
  ms.addRow([]); ms.addRow(['Aug–Oct = actuals · Nov onward = forecast']).font = { italic: true, color: { argb: 'FF666666' } };
  for (let c = 5; c <= 9; c++) for (let r = 1; r <= 9; r++) ms.getCell(r, c).font = { ...(ms.getCell(r, c).font || {}), italic: r > 1 };

  const inv = [
    ['2026-08-05', 'CloudCRM Inc.', 'CC-88121', 'CRM licences (Year 1)', 168000, 'Paid', 'PO-4410'],
    ['2026-08-31', 'Northwind Consulting', 'NW-2026-081', 'Implementation partner (Northwind Consulting)', 42000, 'Paid', 'PO-4402'],
    ['2026-09-30', 'Northwind Consulting', 'NW-2026-094', 'Implementation partner (Northwind Consulting)', 61000, 'Paid', 'PO-4402'],
    ['2026-09-15', 'Fabrikam Integration', 'FI-1182', 'Integration middleware', 18200, 'Paid', 'PO-4415'],
    ['2026-10-12', 'Fabrikam Integration', 'FI-1240', 'Integration middleware', 23000, 'Approved', 'PO-4415'],
    ['2026-10-31', 'Northwind Consulting', 'NW-2026-107', 'Implementation partner (Northwind Consulting)', 68000, 'Pending approval', 'PO-4402'],
    ['2026-09-20', 'DataPrep Tools Ltd', 'DP-3391', 'Data migration tooling', 3800, 'Paid', 'PO-4421'],
    ['2026-10-18', 'DataPrep Tools Ltd', 'DP-3477', 'Data migration tooling', 6000, 'Approved', 'PO-4421'],
    ['2026-10-22', 'Adatum Learning', 'AL-0093', 'Training & change management', 2400, 'Pending approval', 'PO-4430'],
  ];
  const is = sheet(wb, 'Invoices', [{ h: 'Invoice date', w: 13, fmt: 'yyyy-mm-dd' }, { h: 'Vendor', w: 24 }, { h: 'Invoice #', w: 14 }, { h: 'Budget category', w: 44 }, { h: 'Amount', w: 13, fmt: $ }, { h: 'Status', w: 17 }, { h: 'PO', w: 10 }], [], { tab: 'FF70AD47' });
  inv.forEach((r) => is.addRow([new Date(r[0] + 'T00:00:00Z'), ...r.slice(1)]));
  await wb.xlsx.writeFile(path.join(OUT, 'CRM Migration - Budget Tracker.xlsx'));
}

async function raid() {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Priya Shah';
  const score = { H: 3, M: 2, L: 1 };
  const risks = [
    ['R-01', 'ERP vendor API changes break the integration late in testing', 'Technical', 'M', 'H', 'Aisha Khan', 'Contract-test the ERP API weekly; vendor change freeze from 1 Dec', 'Open', '2026-08-20', '2026-11-06'],
    ['R-02', 'Duplicate and incomplete customer records delay data migration', 'Data', 'H', 'H', 'Ben Carter', 'Extra SME capacity for cleansing; agree "good enough" quality thresholds', 'Open — escalated', '2026-08-28', '2026-10-24'],
    ['R-03', 'Sales reps resist the new CRM during quarter-end', 'Change', 'M', 'H', 'Marcus Lee', 'Champions network; avoid go-live in last 2 weeks of quarter', 'Open', '2026-09-02', '2026-11-14'],
    ['R-04', 'Key architect (Elena) is a single point of failure', 'Resource', 'M', 'M', 'Priya Shah', 'Partner architect shadows design reviews', 'Open', '2026-09-10', '2026-11-07'],
    ['R-05', 'UAT testers not released by Sales during busy period', 'Resource', 'H', 'M', 'Grace Kim', 'Book UAT slots with Sales leadership now; backfill with Sales Ops', 'Open', '2026-10-01', '2026-11-04'],
    ['R-06', 'Licence count insufficient after territory restructure', 'Commercial', 'L', 'M', 'Priya Shah', 'Confirm headcount with HR by end of November', 'Monitoring', '2026-10-15', '2026-11-28'],
    ['R-07', 'Security review finds gaps in field-level access', 'Security', 'L', 'H', 'Elena Rossi', 'Early review with InfoSec on access model', 'Closed', '2026-09-01', '2026-10-01'],
  ];
  const rs = sheet(wb, 'Risks', [{ h: 'ID', w: 6 }, { h: 'Risk', w: 52 }, { h: 'Category', w: 12 }, { h: 'Probability (H/M/L)', w: 12 }, { h: 'Impact (H/M/L)', w: 11 }, { h: 'Score', w: 8 }, { h: 'Owner', w: 14 }, { h: 'Mitigation', w: 52 }, { h: 'Status', w: 16 }, { h: 'Raised', w: 12, fmt: 'yyyy-mm-dd' }, { h: 'Next review', w: 12, fmt: 'yyyy-mm-dd' }], [], { tab: 'FFC00000' });
  risks.forEach((r, i) => rs.addRow([r[0], r[1], r[2], r[3], r[4], { formula: `IF(D${i + 2}="H",3,IF(D${i + 2}="M",2,1))*IF(E${i + 2}="H",3,IF(E${i + 2}="M",2,1))`, result: score[r[3]] * score[r[4]] }, r[5], r[6], r[7], new Date(r[8] + 'T00:00:00Z'), new Date(r[9] + 'T00:00:00Z')]));
  rs.addConditionalFormatting({ ref: 'F2:F20', rules: [{ type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [6], style: { fill: fill('FFFADBD8'), font: { bold: true, color: { argb: 'FF9C0006' } } } }, { type: 'cellIs', operator: 'between', formulae: [3, 5], style: { fill: fill('FFFFEB9C') } }] });
  rs.getColumn(2).alignment = { wrapText: true, vertical: 'top' }; rs.getColumn(8).alignment = { wrapText: true, vertical: 'top' };

  sheet(wb, 'Issues', [{ h: 'ID', w: 6 }, { h: 'Issue', w: 52 }, { h: 'Priority', w: 10 }, { h: 'Owner', w: 14 }, { h: 'Action', w: 50 }, { h: 'Due', w: 12 }, { h: 'Status', w: 12 }], [
    ['I-01', 'ERP sandbox API delivered 1 week late — ERP integration build behind', 'High', 'Aisha Khan', 'Daily stand-up with vendor; reorder build to start with read-only endpoints', '2026-10-30', 'Open'],
    ['I-02', 'Data cleansing: duplicate rate 18% (estimated 8%)', 'High', 'Ben Carter', 'Two extra SMEs for 2 weeks; dedupe rules signed off by Sales Ops', '2026-10-28', 'Open'],
    ['I-03', 'Two requirements workshops slipped (Sales VP availability)', 'Medium', 'Marcus Lee', 'Completed via async review', '2026-09-18', 'Closed'],
    ['I-04', 'Northwind October invoice (NW-2026-107) exceeds PO run-rate', 'Medium', 'Priya Shah', 'Review timesheets with Northwind before approving', '2026-11-05', 'Open'],
  ], { tab: 'FFED7D31' });
  sheet(wb, 'Assumptions', [{ h: 'ID', w: 6 }, { h: 'Assumption', w: 70 }, { h: 'Owner', w: 14 }, { h: 'Validated?', w: 12 }], [
    ['A-01', 'Legacy SalesTrack stays read-only for 90 days after go-live', 'Priya Shah', 'Yes'],
    ['A-02', 'Only the last 5 years of opportunities are migrated', 'Marcus Lee', 'Yes'],
    ['A-03', 'Sales reps have 4 hours each available for training in January', 'Marcus Lee', 'No'],
  ], { tab: 'FF7F7F7F' });
  sheet(wb, 'Dependencies', [{ h: 'ID', w: 6 }, { h: 'Dependency', w: 60 }, { h: 'On whom', w: 22 }, { h: 'Needed by', w: 12 }, { h: 'Status', w: 14 }], [
    ['D-01', 'ERP production API credentials', 'ERP Platform team', '2026-12-01', 'Requested'],
    ['D-02', 'SSO configuration for CRM', 'Identity team', '2026-11-20', 'In progress'],
    ['D-03', 'Marketing automation sandbox', 'Marketing Ops', '2026-11-16', 'Not started'],
  ], { tab: 'FF5B9BD5' });
  sheet(wb, 'Decisions', [{ h: 'ID', w: 6 }, { h: 'Decision', w: 64 }, { h: 'Made by', w: 20 }, { h: 'Date', w: 12 }], [
    ['DEC-01', 'Go-live will be phased: Enterprise sales first, then SMB two weeks later', 'Steering committee', '2026-09-24'],
    ['DEC-02', 'Use middleware (Fabrikam) rather than point-to-point ERP integration', 'Elena Rossi', '2026-09-30'],
    ['DEC-03', 'No custom mobile app in phase 1', 'Dana Whitfield', '2026-10-08'],
  ], { tab: 'FF70AD47' });
  await wb.xlsx.writeFile(path.join(OUT, 'CRM Migration - RAID Log.xlsx'));
}

async function timesheets() {
  const wb = new ExcelJS.Workbook(); wb.creator = 'PMO';
  const weeks = ['2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'];
  const rows = [];
  const add = (who, task, hrs) => weeks.forEach((w, i) => hrs[i] && rows.push([new Date(w + 'T00:00:00Z'), who, task, hrs[i]]));
  add('Tom Becker', 'Configure sales pipeline & custom objects', [40, 38, 40, 36]);
  add('Tom Becker', 'Data mapping & transformation scripts', [0, 0, 0, 8]);
  add('Aisha Khan', 'Integration design (ERP, email, marketing)', [32, 0, 0, 0]);
  add('Aisha Khan', 'Build ERP integration', [8, 40, 44, 46]);
  add('Ben Carter', 'Data cleansing (accounts, contacts, opportunities)', [40, 44, 46, 45]);
  add('Ben Carter', 'Data mapping & transformation scripts', [0, 0, 0, 6]);
  add('Sales Ops SMEs', 'Data cleansing (accounts, contacts, opportunities)', [30, 48, 64, 60]);
  add('Grace Kim', 'Test strategy & test scripts', [40, 36, 0, 0]);
  add('Grace Kim', 'System integration testing (SIT)', [0, 0, 12, 16]);
  add('Elena Rossi', 'Integration design (ERP, email, marketing)', [20, 0, 0, 0]);
  add('Elena Rossi', 'Security & access model', [0, 8, 0, 0]);
  add('Elena Rossi', 'Build ERP integration', [0, 12, 16, 20]);
  add('Marcus Lee', 'Training materials', [0, 0, 8, 12]);
  add('Priya Shah', 'Project management', [36, 36, 38, 38]);
  const ws = sheet(wb, 'Timesheets', [{ h: 'Week ending', w: 13, fmt: 'yyyy-mm-dd' }, { h: 'Person', w: 18 }, { h: 'Task', w: 50 }, { h: 'Hours', w: 9 }], rows.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])));
  const t = ws.addRow(['', '', 'Total hours', { formula: `SUM(D2:D${rows.length + 1})` }]); t.font = { bold: true };
  await wb.xlsx.writeFile(path.join(OUT, 'Team Timesheets - October 2026.xlsx'));

  const pw = new ExcelJS.Workbook(); pw.creator = 'Team leads';
  const ps = sheet(pw, 'Progress 30 Oct', [{ h: 'Task ID', w: 9 }, { h: 'Task', w: 50 }, { h: 'Reported by', w: 16 }, { h: '% complete (was)', w: 14, fmt: '0%' }, { h: '% complete (now)', w: 14, fmt: '0%' }, { h: 'Forecast finish', w: 14, fmt: 'yyyy-mm-dd' }, { h: 'Comment', w: 56 }], []);
  const upd = [
    ['4.1', 'Tom Becker', 0.95, null, 'Pipeline stages done; custom objects in review.'],
    ['4.2', 'Aisha Khan', 0.55, '2026-11-13', 'Read endpoints done. Write-back blocked on vendor fix (ticket ERP-3321).'],
    ['4.5', 'Ben Carter', 1.0, '2026-10-29', 'Cleansing complete. Dedupe ruleset signed off by Sales Ops.'],
    ['4.6', 'Ben Carter', 0.1, null, 'Started mapping accounts and contacts.'],
    ['4.4', 'Tom Becker', 0.0, null, 'Waiting on pipeline config.'],
    ['5.2', 'Grace Kim', 0.0, null, 'Test environment ready; SIT starts when build completes.'],
  ];
  upd.forEach((u) => {
    const t = byWbs[u[0]];
    ps.addRow([t.id, t.name, u[1], t.pct / 100, u[2], u[3] ? new Date(u[3] + 'T00:00:00Z') : null, u[4]]);
  });
  ps.getColumn(7).alignment = { wrapText: true, vertical: 'top' };
  await pw.xlsx.writeFile(path.join(OUT, 'Weekly Progress Update - 30 Oct 2026.xlsx'));
}

// An Azure DevOps work-item export (the kind a saved query gives you) for the "Update plan from ADO backlog" quick start.
// Items link to plan tasks with an MPP-<task ID> tag. A few are deliberately messy so the data-quality findings have something to show.
async function backlog() {
  const bw = new ExcelJS.Workbook(); bw.creator = 'Azure DevOps';
  const cols = [{ h: 'ID', w: 8 }, { h: 'Work Item Type', w: 16 }, { h: 'Title', w: 52 }, { h: 'State', w: 14 }, { h: 'Tags', w: 22 }, { h: 'Story Points', w: 12 }, { h: 'Assigned To', w: 16 }, { h: 'State Change Date', w: 16, fmt: 'yyyy-mm-dd' }, { h: 'Iteration Path', w: 22 }, { h: 'Remaining Work', w: 14 }, { h: 'Parent', w: 22 }];
  const D = (x) => (x ? new Date(x + 'T00:00:00Z') : null);
  const items = [
    // Task 17 Configure sales pipeline: nearly done
    ['User Story', 'Opportunity pipeline stages', 'Closed', 'MPP-17', 5, 'Tom Becker', '2026-10-16'],
    ['User Story', 'Custom object: Renewal', 'Closed', 'MPP-17', 3, 'Tom Becker', '2026-10-21'],
    ['User Story', 'Custom object: Partner', 'Closed', 'MPP-17', 3, 'Tom Becker', '2026-10-27'],
    ['User Story', 'Page layouts and validation rules', 'Active', 'MPP-17', 2, 'Tom Becker', '2026-10-29'],
    // Task 18 Build ERP integration: blocked on a vendor fix, one item gone quiet
    ['User Story', 'ERP read: accounts', 'Closed', 'MPP-18; erp', 5, 'Aisha Khan', '2026-10-14'],
    ['User Story', 'ERP read: orders', 'Closed', 'MPP-18; erp', 5, 'Aisha Khan', '2026-10-22'],
    ['User Story', 'ERP write-back: orders', 'Active', 'MPP-18; erp', 8, 'Aisha Khan', '2026-10-02'],
    ['User Story', 'ERP error handling and retries', 'Active', 'MPP-18; erp', 5, 'Elena Rossi', '2026-10-28'],
    ['User Story', 'ERP nightly reconciliation job', 'New', 'MPP-18; erp', 3, '', ''],
    ['User Story', 'ERP legacy price list import', 'Removed', 'MPP-18; erp', 5, '', '2026-10-10'],
    // Task 21 Data cleansing: finished
    ['User Story', 'Deduplicate accounts', 'Closed', 'MPP-21', 5, 'Ben Carter', '2026-10-20'],
    ['User Story', 'Deduplicate contacts', 'Closed', 'MPP-21', 5, 'Ben Carter', '2026-10-27'],
    ['User Story', 'Opportunity clean-up rules', 'Closed', 'MPP-21', 3, 'Ben Carter', '2026-10-29'],
    // Task 22 Data mapping: just started
    ['User Story', 'Map accounts and contacts', 'Active', 'MPP-22', 5, 'Ben Carter', '2026-10-29'],
    ['User Story', 'Map opportunities', 'New', 'MPP-22', 5, '', ''],
    ['User Story', 'Transformation scripts', 'New', 'MPP-22', 8, '', ''],
    // Task 20 Reports and 27 Dry run: not started
    ['User Story', 'Sales pipeline dashboard', 'New', 'MPP-20', 5, 'Tom Becker', ''],
    ['User Story', 'Forecast report', 'New', 'MPP-20', 3, 'Tom Becker', ''],
    ['User Story', 'Dry-run migration plan', 'New', 'MPP-27', 3, 'Grace Kim', ''],
    // Task 25 is 100% in the plan, but the backlog still shows work open (held back for a person to confirm)
    ['User Story', 'Add negative test cases to the SIT scripts', 'Active', 'MPP-25', 2, 'Grace Kim', '2026-10-28'],
    // Messy data
    ['User Story', 'E-signature spike', 'Active', 'sprint-7', 3, 'Elena Rossi', '2026-10-27'],
    ['User Story', 'Renewal reminder emails', 'Closed', 'MPP-99', 3, 'Marcus Lee', '2026-10-23'],
    ['Feature', 'Sales pipeline (whole feature)', 'Active', 'MPP-16', 0, 'Tom Becker', '2026-10-26'],
    ['User Story', 'Vendor sandbox access', 'Blocked', 'MPP-18', 2, 'Aisha Khan', '2026-10-24'],
  ].map((r, i) => {
    // Sprint, remaining hours and parent epic, so the status pack and the capacity check have something to show.
    const task = +(/MPP-(\d+)/.exec(r[3]) || [])[1];
    const done = r[2] === 'Closed' || r[2] === 'Removed';
    const iteration = `Contoso CRM\\${done ? (r[6] <= '2026-10-16' ? 'Sprint 6' : 'Sprint 7') : [20, 27].includes(task) ? 'Sprint 9' : 'Sprint 8'}`;
    const remaining = done ? 0 : r[1] === 'ERP write-back: orders' ? 36 : r[4] * 4;
    const parent = { 17: 'Sales pipeline', 18: 'ERP integration', 20: 'Reporting', 21: 'Data migration', 22: 'Data migration', 25: 'Testing', 27: 'Data migration' }[task] || '';
    return [1001 + i, ...r.slice(0, 6), D(r[6]), iteration, remaining, parent];
  });
  sheet(bw, 'Query 1', cols, items);
  await bw.xlsx.writeFile(path.join(OUT, 'ADO Backlog Export - 30 Oct 2026.xlsx'));
}

// Team capacity for Q4: hours, availability and leave per person, plus sprint dates, for the "Who's overloaded?" capacity check.
// Aisha Khan is on leave 2 to 6 Nov, in the middle of #18 Build ERP integration, which is on the critical path.
async function capacity() {
  const cw = new ExcelJS.Workbook(); cw.creator = 'Priya Shah';
  sheet(cw, 'Team', [{ h: 'Person', w: 18 }, { h: 'Role', w: 20 }, { h: 'Hours per week', w: 14 }, { h: 'Availability %', w: 14, fmt: '0%' }, { h: 'Notes', w: 44 }], [
    ['Priya Shah', 'Project management', 40, 1, ''],
    ['Marcus Lee', 'Business analysis', 40, 0.8, 'One day a week on the billing programme'],
    ['Elena Rossi', 'Architecture', 40, 0.5, 'Shared with the data platform team'],
    ['Tom Becker', 'Development', 40, 1, ''],
    ['Aisha Khan', 'Development', 40, 1, ''],
    ['Ben Carter', 'Data', 40, 1, ''],
    ['Grace Kim', 'Testing', 40, 1, ''],
    ['Sales Ops SMEs', 'Business', 80, 0.5, 'Two SMEs, half time each'],
  ]);
  const D = (x) => new Date(x + 'T00:00:00Z');
  sheet(cw, 'Leave', [{ h: 'Person', w: 18 }, { h: 'From', w: 12, fmt: 'yyyy-mm-dd' }, { h: 'To', w: 12, fmt: 'yyyy-mm-dd' }, { h: 'Reason', w: 20 }], [
    ['Aisha Khan', D('2026-11-02'), D('2026-11-06'), 'Annual leave'],
    ['Marcus Lee', D('2026-11-26'), D('2026-11-27'), 'Training course'],
    ['Priya Shah', D('2026-12-28'), D('2026-12-31'), 'Annual leave'],
  ]);
  sheet(cw, 'Sprints', [{ h: 'Sprint', w: 12 }, { h: 'Start', w: 12, fmt: 'yyyy-mm-dd' }, { h: 'End', w: 12, fmt: 'yyyy-mm-dd' }], [
    ['Sprint 6', D('2026-10-05'), D('2026-10-16')], ['Sprint 7', D('2026-10-19'), D('2026-10-30')], ['Sprint 8', D('2026-11-02'), D('2026-11-13')],
    ['Sprint 9', D('2026-11-16'), D('2026-11-27')], ['Sprint 10', D('2026-11-30'), D('2026-12-11')],
  ]);
  await cw.xlsx.writeFile(path.join(OUT, 'Team Capacity - Q4 2026.xlsx'));
}

// The 10:30 huddle on 30 Oct, as a Teams WebVTT transcript, for the "Huddle → RAID log" quick start.
function huddle() {
  const turns = [
    ['Priya Shah', "Morning everyone, it's the 10:30 huddle. Quick round on blockers and anything for the RAID log."],
    ['Aisha Khan', 'Good news on ERP. The vendor fixed the sandbox endpoints yesterday and the read-only calls have been stable for two days.'],
    ['Aisha Khan', "So I think we can close the sandbox issue. We're still behind on the build itself, but the sandbox is no longer the blocker."],
    ['Priya Shah', 'Great, close it. Ben, where are we on cleansing?'],
    ['Ben Carter', 'Still at around eighteen percent duplicates. The two extra SMEs start on Monday, and Sales Ops signed off the dedupe rules on Wednesday.'],
    ['Ben Carter', "If the dedupe run on Thursday doesn't get us under ten percent, the trial migration will slip again."],
    ['Grace Kim', "One new one from me. We haven't booked the performance test environment yet, and the platform team says it's three weeks' lead time."],
    ['Grace Kim', "There's a real risk the performance environment won't be ready before performance testing starts on the thirtieth of November. I'll own that one."],
    ['Priya Shah', "Okay, log it as a risk, Grace as owner, probably medium likelihood but high impact. Grace, can you raise the booking request today?"],
    ['Grace Kim', 'Yes, I will raise the booking request today.'],
    ['Priya Shah', "On UAT testers, I'll confirm the UAT slots with Sales leadership by Friday the sixth."],
    ['Marcus Lee', 'Also, someone needs to chase the identity team about the SSO configuration, it was due on the twentieth and nobody has heard back.'],
    ['Priya Shah', "Noted, let's get that chased."],
    ['Aisha Khan', 'And for the record on the API freeze, are we agreed?'],
    ['Priya Shah', "Yes. So we're agreed: no ERP API changes from the first of December until after go-live. I'll tell the vendor."],
    ['Marcus Lee', 'Marketing Ops told me the marketing automation sandbox will be ready on the twentieth of November, so that dependency is in progress now.'],
    ['Priya Shah', "Thanks all. That's it for today."],
  ];
  let t = 2;
  const ts = (s) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000`;
  const cues = turns.map(([who, text]) => { const start = t; t += Math.max(4, Math.round(text.length / 14)); return `${ts(start)} --> ${ts(t - 1)}\n<v ${who}>${text}</v>`; });
  fs.writeFileSync(path.join(OUT, 'Huddle 10-30 - 30 Oct 2026.vtt'), `WEBVTT\n\n${cues.join('\n\n')}\n`, 'utf8');
}

(async () => {
  await budget(); await raid(); await timesheets(); await backlog(); await capacity(); huddle();
  const { recalc } = require('../tools/excel');
  for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith('.xlsx'))) process.stdout.write(`${f}: ${recalc(path.join(OUT, f)) ? 'calculated in Excel' : 'Excel not available — values calculate on open'}
`);
  fs.writeFileSync(path.join(OUT, 'START HERE.md'), `# Contoso CRM Migration — Project Manager demo

A fictional project used to try Lumen's project-management assistants.

| File | What it is |
|---|---|
| **${PLAN}** | The Microsoft Project plan (Project XML). Double-click to open in Microsoft Project, or File › Save As › .mpp. ${tasks.length} tasks, 8 resources, baseline + progress as of ${iso(STATUS)}. |
| **CRM Migration - Budget Tracker.xlsx** | Budget vs. actuals vs. forecast, monthly spend, invoices |
| **CRM Migration - RAID Log.xlsx** | Risks, issues, assumptions, dependencies, decisions |
| **Team Timesheets - October 2026.xlsx** | Hours booked per person per task |
| **Weekly Progress Update - 30 Oct 2026.xlsx** | Team leads' latest % complete — use it to update the plan |
| **ADO Backlog Export - 30 Oct 2026.xlsx** | Azure DevOps work items tagged MPP-<task ID> — use it to propose plan progress and see the data-quality gaps |
| **Team Capacity - Q4 2026.xlsx** | Hours, availability, leave and sprint dates per person — use it to check who is overloaded and whose leave clashes with the plan |
| **Huddle 10-30 - 30 Oct 2026.vtt** | Teams transcript of the daily 10:30 huddle — use it to update the RAID log |

## Things to try
- *"Give me a health check of the project plan."*
- *"Write this week's status report using the plan, the budget tracker and the RAID log."*
- *"Update the plan with the weekly progress update and tell me what changed."*
- *"Are any budget categories heading over? Which invoices need attention?"*
- *"Compare timesheet hours with the plan — where are we burning more effort than planned?"*
- *"Turn the plan into an Excel tracker with a Gantt chart."*
- *"Update the RAID log from this morning's huddle transcript."*
- *"Update the plan from the ADO backlog export, and tell me what is wrong with the data."*
- *"What if ERP integration slips another two weeks? Compare that with adding a tester."*
- *"Check capacity against the plan and the backlog. Who's overloaded, and whose leave clashes with critical work?"*
`);
  console.log(`Demo written to ${OUT}`);
  console.log(`Plan: ${tasks.length} tasks, ${iso(projStart)} → ${iso(projFinish)} (baseline finish ${iso(new Date(Math.max(...tasks.map((t) => t.bFinish))))})`);
})();
