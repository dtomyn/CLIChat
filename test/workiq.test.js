const test = require('node:test');
const assert = require('node:assert');
const skills = require('../lib/skills');
const workiq = require('../lib/workiq');

const wq = () => skills.resolve(['microsoft-365']);

test('workiq skill is discovered and targets the m365 server', () => {
  const [s] = wq();
  assert.equal(s.server, 'm365');
  assert.deepEqual(s.readTools, ['*']);
  assert.deepEqual(s.writeTools, []);
});

test('Work IQ instructions require advertised search routes and verified latest-editor evidence', () => {
  const prompt = skills.promptFor(wq(), 'read', { providerId: 'copilot-cli', workiq: { enabled: true } });
  assert.match(prompt, /search_paths\(query="\/search\/query"\)/);
  assert.match(prompt, /get_schema\(path="\/search\/query", operationType="action"\)/);
  assert.match(prompt, /use `do_action`/);
  assert.match(prompt, /Empty discovery is not permission to try a guessed endpoint/);
  assert.match(prompt, /Do not substitute `\/me\/drive\/recent`/);
  assert.match(prompt, /resolve the signed-in user's identity/);
  assert.match(prompt, /Validate returned editor, source link and modification timestamp/);
  assert.match(prompt, /do not silently include personal OneDrive/);
  assert.match(prompt, /do not present JavaScript libraries, source code, generated build outputs or dependency files/);
  assert.match(prompt, /cannot prove the globally latest edit/);
  assert.match(prompt, /do not recommend reconnecting unless the actual diagnostic indicates an authentication problem/);
  assert.match(prompt, /do not retry through other routes or identities after denial/);
});

test('workiq tools load only when switched on, attended, and files are not "chat"', () => {
  const s = wq();
  assert.equal(skills.toolConfig(s, 'read', '/w', {}), null, 'off by default');
  assert.equal(skills.toolConfig(s, 'read', '/w', { workiq: { enabled: true }, scheduled: true }), null, 'never scheduled');
  assert.equal(skills.toolConfig(s, 'chat', '/w', { workiq: { enabled: true } }), null);
  const cfg = skills.toolConfig(s, 'read', '/w', { workiq: { enabled: true, tenantId: 'contoso.onmicrosoft.com' } });
  assert.deepEqual(cfg.allow, [{ server: 'm365', tool: '*' }]);
  assert.deepEqual(cfg.servers.m365, workiq.server());
  assert.equal(cfg.servers.m365.type, 'http');
  assert.equal(cfg.servers.m365.url, 'https://workiq.svc.cloud.microsoft/mcp');
  assert.equal(cfg.servers.m365.command, undefined);
});

test('workiq ignores a malformed tenant id and explains when off', () => {
  const s = wq();
  const cfg = skills.toolConfig(s, 'edit', '/w', { workiq: { enabled: true, tenantId: 'x; calc' } });
  assert.equal(JSON.stringify(cfg).includes('tenant'), false, 'legacy tenant settings do not affect hosted authentication');
  assert.match(skills.promptFor(s, 'read', {}), /isn't turned on/);
});

test('Claude receives standalone OAuth while Copilot never injects a duplicate WorkIQ connection', () => {
  const local = { command: process.execPath, args: ['office.js'], env: { ROOT: 'workspace' } };
  const servers = { office: local, m365: workiq.server() };
  const allow = [{ server: 'office', tool: 'read_sheet' }, { server: 'm365', tool: '*' }];
  const copilot = workiq.mcpServers(servers, allow, 'copilot-cli');
  assert.deepEqual(copilot.office, { ...local, type: 'local', tools: ['read_sheet'] });
  assert.equal(copilot.m365, undefined);
  const claude = workiq.mcpServers(servers, allow, 'claude-cli');
  assert.deepEqual(claude.office, { ...local, type: 'stdio' });
  assert.deepEqual(claude.m365, { type: 'http', url: workiq.URL, oauth: { clientId: workiq.CLIENT_ID, callbackPort: 12798 } });
  assert.equal(claude.m365.oauthClientId, undefined);
  assert.equal(servers.m365.tools, undefined, 'mapping does not mutate the source config');
});

test('Copilot requests its existing managed connector only for enabled attended file-reading chats', () => {
  const ctx = { providerId: 'copilot-cli', workiq: { enabled: true } };
  assert.deepEqual(skills.toolConfig(wq(), 'read', 'workspace', ctx), { servers: {}, allow: [], workiq: 'managed' });
  assert.equal(skills.toolConfig(wq(), 'chat', 'workspace', ctx), null);
  assert.equal(skills.toolConfig(wq(), 'read', 'workspace', { ...ctx, scheduled: true }), null);
  assert.equal(skills.toolConfig(wq(), 'read', 'workspace', { ...ctx, workiq: { enabled: false } }), null);
  assert.match(skills.promptFor(wq(), 'read', ctx), /existing managed "Work IQ" connector/);
  assert.match(skills.promptFor(wq(), 'read', { workiq: { enabled: true }, providerId: 'claude-cli' }), /standalone m365 server/);
});

test('Copilot targets the published GitHub connector, not standalone Work IQ OAuth', () => {
  assert.equal(workiq.CONNECTOR_NAME, 'workiqmcp');
  assert.deepEqual(workiq.connector(), {
    type: 'http',
    url: 'https://api.github.com/copilot-connectors/api/v1/connectors/workiqmcp/mcp',
    tools: ['*'],
  });
  assert.equal(workiq.connector().headers, undefined, 'credentials are owned by the engine');
  assert.notEqual(workiq.CONNECTOR_URL, workiq.URL);
});

test('status separates connection, discovery, failure and a newly opened sign-in window', () => {
  const id = 'status-test';
  assert.equal(workiq.status(id).status, 'not-checked');
  workiq.record(id, { status: 'pending', message: '' });
  workiq.record(id, { toolCount: 12 });
  assert.equal(workiq.status(id).status, 'pending', 'discovery alone is not a connection');
  workiq.record(id, { status: 'connected', message: '' });
  assert.equal(workiq.status(id).toolCount, 12, 'cached discovery may precede the connected event');
  workiq.record(id, { status: 'needs-auth', message: 'Sign in again' });
  assert.equal(workiq.status(id).toolCount, undefined, 'failure clears stale tool counts');
  workiq.record(id, { toolCount: 2 });
  assert.equal(workiq.status(id).message, 'Sign in again');
  workiq.record(id, { status: 'sign-in-opened', message: 'Not confirmed' });
  assert.equal(workiq.status(id).status, 'sign-in-opened');
  assert.equal(workiq.status(id).toolCount, undefined);
  assert.equal(workiq.status('another-engine').status, 'not-checked');
});

test('connection diagnostics preserve reasons but redact credential values', () => {
  const events = [];
  workiq.emitStatus((ev) => events.push(ev), 'failed', 'Policy refused: Bearer fake-secret https://example.test?access_token=fake-token&code=fake-code {"refresh_token":"fake-refresh"}');
  assert.match(events[0].message, /Policy refused/);
  assert.doesNotMatch(JSON.stringify(events), /fake-secret|fake-token|fake-code|fake-refresh/);
  assert.equal(events.at(-1).ok, false);
  const discovery = [];
  workiq.emitStatus((ev) => discovery.push(ev), undefined, undefined, 0);
  assert.deepEqual(discovery, [{ type: 'connection', server: 'm365', toolCount: 0 }]);
});
