const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const publish = require('../tools/publish');
const mdExport = require('../tools/md-export');

const TEMPLATES = path.join(__dirname, '..', 'samples', 'aidlc', 'Templates');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-publish-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function workspace() {
  const root = fs.mkdtempSync(path.join(temp, 'ws-'));
  const run = path.join(root, 'Lifecycle', 'R1');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, '02-functional-design.md'), '> Approved by Priya Shah on 2026-11-02T10:00:00.000Z\n\n# Functional design\n\n| FD ID | Title |\n|---|---|\n| FD-012 | Renewal form |\n');
  fs.writeFileSync(path.join(run, '03-technical-design.md'), '# Technical design\n\nDraft (AI)\n');
  fs.writeFileSync(path.join(run, '04-stories.md'), '> Based on unapproved inputs\n\n# Stories\n');
  fs.mkdirSync(path.join(root, 'Templates'));
  fs.copyFileSync(path.join(TEMPLATES, 'FDD Template.dotx'), path.join(root, 'Templates', 'FDD Template.dotx'));
  return { root, run };
}

test('publishes approved Markdown with properties and a log; skips unapproved sources', async () => {
  const { root } = workspace();
  const r = await publish.publishSnapshot(['Lifecycle'], { root, library: 'Design', formats: ['docx', 'html'], template: 'Templates/FDD Template.dotx', now: new Date('2026-11-07T09:00:00Z') });
  assert.equal(r.published.length, 2);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.skipped.map((s) => s.source).sort(), ['Lifecycle/R1/03-technical-design.md', 'Lifecycle/R1/04-stories.md']);
  const docx = path.join(root, 'Published', 'Design', 'R1', '02-functional-design.docx');
  const html = path.join(root, 'Published', 'Design', 'R1', '02-functional-design.html');
  assert.ok(fs.existsSync(docx) && fs.existsSync(html));
  const props = await mdExport.readDocxProperties(fs.readFileSync(docx));
  assert.equal(props.Version, '1.0');
  assert.equal(props.Approver, 'Priya Shah');
  assert.equal(props.Source, 'Lifecycle/R1/02-functional-design.md');
  assert.equal(props['Source revision'], r.published[0].Revision);
  assert.match(fs.readFileSync(html, 'utf8'), /<meta name="approver" content="Priya Shah">[\s\S]*FD-012/);
  assert.doesNotMatch(fs.readFileSync(html, 'utf8'), /Approved by Priya Shah on/); // the stamp becomes metadata
  const log = await publish.readLog(root);
  assert.equal(log.length, 2);
  assert.deepEqual(Object.keys(log[0]).slice(0, 6), ['Source', 'Revision', 'Published at', 'Approver', 'Version', 'Destination']);
  assert.equal(log[0]['Published at'], '2026-11-07T09:00:00Z');
});

test('an approver given explicitly publishes an unstamped source, never an unapproved-inputs one', async () => {
  const { root } = workspace();
  const r = await publish.publishSnapshot(['Lifecycle/R1/03-technical-design.md', 'Lifecycle/R1/04-stories.md'], { root, approver: 'Sam Lee' });
  assert.deepEqual(r.published.map((p) => p.Source), ['Lifecycle/R1/03-technical-design.md']);
  assert.equal(r.skipped[0].reason, 'based on unapproved inputs');
});

test('editing a source after publishing makes it stale; republishing bumps the version', async () => {
  const { root, run } = workspace();
  await publish.publishSnapshot(['Lifecycle'], { root });
  let f = await publish.freshnessCheck({ root, sources: ['Lifecycle'] });
  assert.equal(f.stale.length, 0);
  assert.equal(f.current.length, 1);
  assert.deepEqual(f.neverPublished.sort(), ['Lifecycle/R1/03-technical-design.md', 'Lifecycle/R1/04-stories.md']);

  // Unchanged → skipped, not republished.
  const again = await publish.publishSnapshot(['Lifecycle'], { root });
  assert.equal(again.published.length, 0);
  assert.ok(again.skipped.some((s) => s.reason === 'unchanged since last published'));

  const src = path.join(run, '02-functional-design.md');
  fs.appendFileSync(src, '| FD-013 | Photo upload |\n');
  f = await publish.freshnessCheck({ root });
  assert.equal(f.stale.length, 1);
  assert.equal(f.stale[0].source, 'Lifecycle/R1/02-functional-design.md');
  assert.equal(f.stale[0].destination, 'Published/Knowledge/R1/02-functional-design.docx');
  assert.notEqual(f.stale[0].currentRevision, f.stale[0].publishedRevision);
  assert.match(f.summary, /^1 stale/);

  const re = await publish.publishSnapshot(['Lifecycle'], { root });
  assert.equal(re.published[0].Version, '2.0');
  assert.equal((await publish.readLog(root)).length, 1); // the row is replaced, not duplicated
  assert.equal((await publish.freshnessCheck({ root })).stale.length, 0);
});

test('CRLF-only changes do not count as edits', async () => {
  const { root, run } = workspace();
  await publish.publishSnapshot(['Lifecycle'], { root });
  const src = path.join(run, '02-functional-design.md');
  fs.writeFileSync(src, fs.readFileSync(src, 'utf8').replace(/\n/g, '\r\n'));
  assert.equal((await publish.freshnessCheck({ root })).stale.length, 0);
});

test('orphans, missing sources and missing snapshots', async () => {
  const { root, run } = workspace();
  await publish.publishSnapshot(['Lifecycle'], { root, formats: ['docx', 'html'] });
  fs.writeFileSync(path.join(root, 'Published', 'Knowledge', 'old.docx'), 'x');
  fs.rmSync(path.join(root, 'Published', 'Knowledge', 'R1', '02-functional-design.html'));
  let f = await publish.freshnessCheck({ root });
  assert.deepEqual(f.orphans, ['Published/Knowledge/old.docx']);
  assert.deepEqual(f.missingSnapshot.map((m) => m.destination), ['Published/Knowledge/R1/02-functional-design.html']);
  fs.rmSync(path.join(run, '02-functional-design.md'));
  f = await publish.freshnessCheck({ root });
  assert.equal(f.missingSource.length, 2);
});

test('nothing published yet, and bad input', async () => {
  const { root } = workspace();
  assert.match((await publish.freshnessCheck({ root })).summary, /Nothing has been published yet/);
  await assert.rejects(publish.publishSnapshot(['Nope'], { root }), /Can't find/);
  await assert.rejects(publish.publishSnapshot(['Templates/FDD Template.dotx'], { root }), /not a Markdown file/);
  await assert.rejects(publish.publishSnapshot([], { root }), /at least one/);
});
