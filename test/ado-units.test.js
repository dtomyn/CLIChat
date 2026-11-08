// Unit tests for the Azure DevOps helpers: markup conversion, WIQL building and the REST client.
const test = require('node:test');
const assert = require('node:assert/strict');
const { htmlToMd, mdToHtml, lineDiff } = require('../tools/ado/markup');
const wiql = require('../tools/ado/wiql');
const { createClient, normalizeOrgUrl } = require('../tools/ado/client');
const { createMockFetch } = require('../tools/ado/mock');
const { createAuth } = require('../tools/ado/auth');

test('htmlToMd keeps structure, decodes entities and drops scripts', () => {
  const md = htmlToMd('<div><b>As a</b> citizen&nbsp;I want <a href="https://x.test">to renew</a> &amp; pay<br>now</div><ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1|x</td><td>2</td></tr></table><h2>Rules</h2><p>ok <script>alert(1)</script>done</p><ol><li>first<li>second</ol>');
  assert.match(md, /\*\*As a\*\* citizen I want \[to renew\]\(https:\/\/x\.test\) & pay {2}\nnow/);
  assert.match(md, /- one\n {2}- nested\n- two/);
  assert.match(md, /\| A \| B \|\n\| --- \| --- \|\n\| 1\\\|x \| 2 \|/);
  assert.match(md, /## Rules/);
  assert.doesNotMatch(md, /alert/);
  assert.match(md, /1\. first\n2\. second/);
  assert.equal(htmlToMd(''), '');
  assert.equal(htmlToMd('plain &lt;text&gt;'), 'plain <text>');
});

test('mdToHtml strips scripts, handlers and javascript: links', () => {
  const html = mdToHtml('**hi** [x](javascript:alert(1)) <img src=x onerror=alert(1)><script>bad()</script>\n\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.match(html, /<strong>hi<\/strong>/);
  assert.doesNotMatch(html, /javascript:|onerror|<script/i);
  assert.match(html, /<table>/);
});

test('lineDiff shows removals before additions and collapses unchanged runs', () => {
  const d = lineDiff('a\nb\nc\nd\ne\nf\ng\nh\ni', 'a\nb\nC\nd\ne\nf\ng\nh\ni');
  assert.equal(d.added, 1); assert.equal(d.removed, 1);
  assert.deepEqual(d.lines.filter((l) => l.t !== ' ').map((l) => l.t + l.s), ['-c', '+C', '…4 unchanged lines']);
  assert.equal(lineDiff('x', 'y', { maxLines: 0 }).tooLarge, true);
});

test('WIQL builder quotes literals and maps the friendly filters', () => {
  const q = wiql.build({ text: "O'Brien fee", types: ['User Story', 'Bug'], assignedTo: '@me', iteration: '@current', tags: ['FD-012'], changedSince: '2026-10-01', parentId: 210 });
  assert.match(q, /^SELECT \[System\.Id\] FROM WorkItems WHERE \[System\.TeamProject\] = @project/);
  assert.match(q, /CONTAINS 'O''Brien fee'/);
  assert.match(q, /\[System\.WorkItemType\] IN \('User Story', 'Bug'\)/);
  assert.match(q, /\[System\.AssignedTo\] = @me/);
  assert.match(q, /\[System\.IterationPath\] = @currentIteration/);
  assert.match(q, /\[System\.Tags\] CONTAINS 'FD-012'/);
  assert.match(q, /\[System\.ChangedDate\] >= '2026-10-01'/);
  assert.match(q, /\[System\.Parent\] = 210/);
  assert.match(wiql.build({ area: "x' OR 1=1 --" }), /UNDER 'x'' OR 1=1 --'/);
  assert.throws(() => wiql.build({ changedSince: '1 Jan' }), /date like/);
  assert.throws(() => wiql.build({ parentId: 'abc' }), /number/);
  assert.throws(() => wiql.build({ text: 'a\u0000b' }), /characters/);
  assert.throws(() => wiql.build({ ids: ['1; DROP'] }), /numbers/);
});

test('normalizeOrgUrl accepts cloud addresses only', () => {
  assert.equal(normalizeOrgUrl('dev.azure.com/contoso/'), 'https://dev.azure.com/contoso');
  assert.equal(normalizeOrgUrl('https://dev.azure.com/contoso/Permit%20Renewal/_workitems'), 'https://dev.azure.com/contoso');
  assert.equal(normalizeOrgUrl('https://contoso.visualstudio.com'), 'https://dev.azure.com/contoso');
  assert.throws(() => normalizeOrgUrl('https://tfs.contoso.local/tfs/DefaultCollection'), /On-premises/);
  assert.throws(() => normalizeOrgUrl('https://dev.azure.com/'), /organisation name/);
});

function fakeAuth() { let refreshed = 0; return { get: async () => `Bearer t${refreshed}`, refresh() { refreshed++; }, get count() { return refreshed; } }; }

test('client refreshes sign-in once on 401, then reports a friendly error', async () => {
  const auth = fakeAuth();
  let calls = 0;
  const fetchImpl = createMockFetch([{ method: 'GET', match: 'connectionData', status: 200, body: { authenticatedUser: { providerDisplayName: 'Dana' } } }], null);
  const flaky = async (url, init) => (++calls === 1 ? { status: 401, ok: false, headers: { get: () => 'application/json' }, text: async () => '{}' } : fetchImpl(url, init));
  const c = createClient({ orgUrl: 'https://dev.azure.com/contoso', project: 'P', auth, fetchImpl: flaky });
  assert.equal((await c.me()).name, 'Dana');
  assert.equal(auth.count, 1);
  const always401 = async () => ({ status: 401, ok: false, headers: { get: () => '' }, text: async () => '' });
  await assert.rejects(createClient({ orgUrl: 'https://dev.azure.com/contoso', auth: fakeAuth(), fetchImpl: always401 }).me(), (e) => e.code === 'AUTH' && e.friendly);
});

test('client treats a 203 HTML sign-in page as an auth failure', async () => {
  const html = async () => ({ status: 203, ok: true, headers: { get: () => 'text/html' }, text: async () => '<html>sign in</html>' });
  await assert.rejects(createClient({ orgUrl: 'https://dev.azure.com/contoso', auth: fakeAuth(), fetchImpl: html }).projects(), (e) => e.code === 'AUTH');
});

test('client retries 429 using Retry-After, and maps conflicts and 404s', async () => {
  const waits = [];
  let n = 0;
  const busy = async (url, init) => (++n < 3 ? { status: 429, ok: false, headers: { get: (k) => (k === 'retry-after' ? '2' : 'application/json') }, text: async () => '{}' } : { status: 200, ok: true, headers: { get: () => 'application/json' }, text: async () => '{"value":[{"name":"P"}]}' });
  const c = createClient({ orgUrl: 'https://dev.azure.com/contoso', auth: fakeAuth(), fetchImpl: busy, wait: async (ms) => waits.push(ms) });
  assert.deepEqual(await c.projects(), ['P']);
  assert.deepEqual(waits, [2000, 2000]);
  const conflict = createMockFetch([{ method: 'PATCH', match: 'workitems/5', status: 400, body: { message: 'TF26071: This work item has been modified since you last opened it.' } }, { method: 'GET', match: 'workitems/9', status: 404, body: {} }]);
  const c2 = createClient({ orgUrl: 'https://dev.azure.com/contoso', project: 'P', auth: fakeAuth(), fetchImpl: conflict });
  await assert.rejects(c2.updateWorkItem(5, []), (e) => e.code === 'CONFLICT');
  await assert.rejects(c2.workItem(9), /Can't find work item 9 in P/);
  const noNet = async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }); };
  await assert.rejects(createClient({ orgUrl: 'https://dev.azure.com/contoso', auth: fakeAuth(), fetchImpl: noNet }).projects(), (e) => e.code === 'NETWORK' && /internet/.test(e.message));
});

test('PAT auth without a saved token asks the user to add one', async () => {
  const prev = process.env.LUMEN_DATA;
  process.env.LUMEN_DATA = require('node:path').join(require('node:os').tmpdir(), `lumen-nopat-${process.pid}`);
  try { await assert.rejects(createAuth('pat').get(), (e) => e.code === 'NO_PAT' && e.friendly); }
  finally { if (prev === undefined) delete process.env.LUMEN_DATA; else process.env.LUMEN_DATA = prev; }
});

test('secrets round-trip through DPAPI on Windows', { skip: process.platform !== 'win32' }, async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const prev = process.env.LUMEN_DATA;
  process.env.LUMEN_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-secrets-'));
  const secrets = require('../lib/secrets');
  try {
    await secrets.save('t', 'pat "with" $quotes');
    assert.equal(secrets.has('t'), true);
    assert.doesNotMatch(fs.readFileSync(path.join(process.env.LUMEN_DATA, 'secrets', 't.dpapi'), 'utf8'), /quotes/);
    assert.equal(await secrets.load('t'), 'pat "with" $quotes');
    secrets.clear('t');
    assert.equal(secrets.has('t'), false);
  } finally { fs.rmSync(process.env.LUMEN_DATA, { recursive: true, force: true }); if (prev === undefined) delete process.env.LUMEN_DATA; else process.env.LUMEN_DATA = prev; }
});
