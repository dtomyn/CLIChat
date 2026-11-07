const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const raid = require('../tools/raid');

const DEMO = path.join(__dirname, '..', 'demo');
const VTT = path.join(DEMO, 'Huddle 10-30 - 30 Oct 2026.vtt');
const RAID = path.join(DEMO, 'CRM Migration - RAID Log.xlsx');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-raid-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function workspace() {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  fs.copyFileSync(VTT, path.join(root, 'huddle.vtt'));
  fs.copyFileSync(RAID, path.join(root, 'RAID.xlsx'));
  return root;
}

const PROPOSALS = [
  { change: 'close', kind: 'issue', id: 'I-01', evidence: { quote: 'So I think we can close the sandbox issue' } },
  { change: 'add', kind: 'risk', fields: { title: 'Performance environment not ready', owner: 'Grace Kim', probability: 'M', impact: 'H', due: '2026-11-06' }, evidence: { quote: "the performance environment won't be ready before performance testing starts" } },
  { change: 'add', kind: 'action', fields: { title: 'Chase identity team about SSO' }, evidence: { quote: 'someone needs to chase the identity team' } },
  { change: 'update', kind: 'dependency', id: 'D-03', fields: { status: 'In progress', due: '2026-11-20' }, evidence: { quote: 'marketing automation sandbox will be ready' } },
  { change: 'add', kind: 'risk', fields: { title: 'Invented' }, evidence: { quote: 'the budget has been cut in half' } },
  { change: 'update', kind: 'issue', id: 'I-99', fields: { status: 'Closed' }, evidence: { quote: 'Good news on ERP. The vendor fixed' } },
  { change: 'add', kind: 'risk', fields: { title: 'Too short' }, evidence: { quote: 'close it' } },
];

test('parses Teams WebVTT, joining split cues from the same speaker', () => {
  const segs = raid.readTranscript(VTT);
  assert.equal(segs[0].speaker, 'Priya Shah');
  assert.equal(segs[0].time, '00:00:02');
  assert.match(segs[1].text, /stable for two days\. So I think we can close/); // two Aisha cues joined
  assert.ok(segs.every((s) => !/<v|<\/v>/.test(s.text)));
});

test('parses Teams Word-export and inline text transcripts', () => {
  const exported = raid.parsePlain('Priya Shah   0:03\nMorning all.\nAisha Khan   1:05\nThe sandbox is fixed now.');
  assert.deepEqual(exported.map((s) => [s.speaker, s.time]), [['Priya Shah', '00:00:03'], ['Aisha Khan', '00:01:05']]);
  const inline = raid.parsePlain('[00:02:10] Ben Carter: Duplicates are still high.\nand getting worse');
  assert.equal(inline[0].speaker, 'Ben Carter');
  assert.match(inline[0].text, /getting worse/);
});

test('quotes must appear in the transcript, ignoring punctuation and case', () => {
  const segs = raid.readTranscript(VTT);
  assert.equal(raid.locateQuote(segs, 'so i think we can CLOSE the sandbox issue!').speaker, 'Aisha Khan');
  assert.equal(raid.locateQuote(segs, 'the budget has been cut in half'), null);
  assert.equal(raid.locateQuote(segs, 'close it'), null); // fewer than 4 words is not evidence
});

test('propose writes a reviewable copy, rejects unverifiable proposals and leaves the original alone', async () => {
  const root = workspace();
  const before = fs.readFileSync(path.join(root, 'RAID.xlsx'));
  const res = await raid.propose(path.join(root, 'RAID.xlsx'), path.join(root, 'huddle.vtt'), PROPOSALS, { meetingDate: '2026-10-30' });
  assert.ok(fs.readFileSync(path.join(root, 'RAID.xlsx')).equals(before), 'original RAID log must not change');
  assert.equal(res.saved, path.join(root, 'RAID (proposed).xlsx'));
  assert.equal(res.proposed, 4);
  assert.deepEqual(res.notProposed.map((x) => x.n), [5, 6, 7]);
  assert.match(res.notProposed.find((x) => x.n === 6).reason, /I-99 isn't in the Issues sheet/);
  assert.equal(res.changes.find((c) => c.kind === 'risk').id, 'R-08');
  assert.equal(res.changes.find((c) => c.kind === 'action').id, 'ACT-01');
  assert.match(res.changes[0].evidence, /Aisha Khan at 00:00:09/);
  assert.ok(res.meetingChecks.some((m) => /no owner: "Chase identity team about SSO"/.test(m)));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(res.saved);
  const rs = wb.getWorksheet('Proposed changes');
  assert.equal(rs.getRow(1).getCell(2).value, 'Approve? (Yes/No)');
  assert.ok(!rs.getRow(2).getCell(2).value); // nothing pre-approved
  const risks = wb.getWorksheet('Risks');
  assert.equal(risks.getRow(9).getCell(1).value, 'R-08');
  assert.match(risks.getRow(9).getCell(6).value.formula, /D9="H"/); // score formula copied to the new row
  assert.ok(wb.getWorksheet('Actions'), 'an Actions sheet is created when the log has none');
});

test('apply refuses until every row is decided, then writes only approved changes to an (updated) copy', async () => {
  const root = workspace();
  const res = await raid.propose(path.join(root, 'RAID.xlsx'), path.join(root, 'huddle.vtt'), PROPOSALS.slice(0, 4), { meetingDate: '2026-10-30' });
  const pending = await raid.applyApproved(res.saved);
  assert.equal(pending.saved, null);
  assert.deepEqual(pending.undecided, [1, 2, 3, 4]);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(res.saved);
  const rs = wb.getWorksheet('Proposed changes');
  ['Yes', 'Yes', 'No', 'yes'].forEach((v, i) => { rs.getRow(i + 2).getCell(2).value = v; });
  await wb.xlsx.writeFile(res.saved);

  const done = await raid.applyApproved(res.saved);
  assert.equal(done.saved, path.join(root, 'RAID (updated).xlsx'));
  assert.equal(done.applied, 3);
  assert.deepEqual(done.rejectedByReviewer, [3]);
  const u = new ExcelJS.Workbook();
  await u.xlsx.readFile(done.saved);
  assert.equal(u.getWorksheet('Issues').getRow(2).getCell(7).value, 'Closed');
  assert.equal(u.getWorksheet('Risks').getRow(9).getCell(1).value, 'R-08');
  assert.ok(!u.getWorksheet('Proposed changes'));
  assert.ok(!u.getWorksheet('Actions'), 'the rejected action was not applied');
  assert.equal(u.getWorksheet('Dependencies').getRow(4).getCell(5).value, 'In progress');
  assert.equal(u.getWorksheet('Risks').getRow(9).getCell(10).value.toISOString().slice(0, 10), '2026-10-30'); // Raised = meeting date
});

test('RAID tools are exposed; proposing needs edit access', () => {
  const root = workspace();
  const run = (readonly, name, args) => {
    const input = [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }].map((x) => JSON.stringify(x)).join('\n') + '\n';
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: readonly ? '1' : '0' } });
    return out.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const [list, read] = run(true, 'read_transcript', { path: 'huddle.vtt' });
  assert.ok(['read_transcript', 'propose_raid_updates', 'apply_raid_updates'].every((n) => list.result.tools.some((t) => t.name === n)));
  assert.match(read.result.content[0].text, /\[2\] 00:00:09 Aisha Khan:/);
  const [, denied] = run(true, 'propose_raid_updates', { raid: 'RAID.xlsx', transcript: 'huddle.vtt', proposals: PROPOSALS.slice(0, 1) });
  assert.ok(denied.result.isError);
  const [, ok] = run(false, 'propose_raid_updates', { raid: 'RAID.xlsx', transcript: 'huddle.vtt', proposals: PROPOSALS.slice(0, 1) });
  assert.ok(!ok.result.isError, ok.result.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'RAID (proposed).xlsx')));
});

test('latestRaid prefers the approved copy, never the proposed one, and reports pending huddle changes', async () => {
  const root = workspace();
  const orig = path.join(root, 'RAID.xlsx');
  assert.deepEqual(await raid.latestRaid(orig), { requested: 'RAID.xlsx', used: orig, notes: [], pending: null });

  const res = await raid.propose(orig, path.join(root, 'huddle.vtt'), PROPOSALS.slice(0, 4), { meetingDate: '2026-10-30' });
  const waiting = await raid.latestRaid(orig);
  assert.equal(waiting.used, orig, 'unreviewed proposals are not read as if they were approved');
  assert.equal(waiting.pending.awaitingReview, 4);
  assert.match(waiting.notes[0], /4 awaiting review.*not in this report/);
  // Handing over the review copy by mistake still reads the approved log.
  const viaProposed = await raid.latestRaid(res.saved);
  assert.equal(viaProposed.used, orig);
  assert.match(viaProposed.notes[0], /review copy that already contains unapproved changes/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(res.saved);
  ['Yes', 'Yes', 'No', 'Yes'].forEach((v, i) => { wb.getWorksheet('Proposed changes').getRow(i + 2).getCell(2).value = v; });
  await wb.xlsx.writeFile(res.saved);
  const approved = await raid.latestRaid(orig);
  assert.equal(approved.pending.approvedNotApplied, 3);
  assert.match(approved.notes[0], /3 approved but not yet applied/);

  const done = await raid.applyApproved(res.saved);
  fs.utimesSync(done.saved, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
  const after = await raid.latestRaid(orig);
  assert.equal(after.used, done.saved);
  assert.equal(after.pending, null);
  assert.match(after.notes[0], /Used "RAID \(updated\)\.xlsx".*newer/);

  // An original edited after the update wins, with a warning.
  fs.utimesSync(orig, new Date(Date.now() + 60000), new Date(Date.now() + 60000));
  const stale = await raid.latestRaid(orig);
  assert.equal(stale.used, orig);
  assert.match(stale.notes[0], /older than "RAID\.xlsx"/);
});
