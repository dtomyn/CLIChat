const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const engine = path.join(__dirname, 'fixtures', 'workiq-engine.js');
process.env.COPILOT_CLI_PATH = engine;
process.env.CLAUDE_CLI_PATH = engine;
const workiq = require('../lib/workiq');
const providers = [require('../providers/copilot-cli'), require('../providers/claude-cli')];
const standaloneTools = {
  servers: { office: { command: process.execPath, args: ['office.js'], env: { ROOT: 'workspace' } }, m365: workiq.server() },
  allow: [{ server: 'office', tool: 'read_sheet' }, { server: 'm365', tool: '*' }],
};
const managedTools = { servers: { office: standaloneTools.servers.office }, allow: [standaloneTools.allow[0]], workiq: 'managed' };
const toolsFor = (provider) => provider.id === 'copilot-cli' ? managedTools : standaloneTools;

for (const provider of providers) {
  test(`${provider.id} selects the correct integration alongside existing document tools`, async () => {
    process.env.LUMEN_TEST_WORKIQ_STATUS = 'connected';
    const events = [];
    const tools = toolsFor(provider);
    await provider.run({ prompt: 'Read my document', cwd: __dirname, tools, systemPrompt: 'Read only', access: 'read' }, (ev) => events.push(ev));
    const result = JSON.parse(events.filter((ev) => ev.type === 'text').map((ev) => ev.text).join(''));
    const expected = workiq.mcpServers(tools.servers, tools.allow, provider.id);
    if (provider.id === 'copilot-cli') expected[workiq.CONNECTOR_NAME] = workiq.connector();
    assert.deepEqual(result.config.mcpServers, expected);
    if (provider.id === 'copilot-cli') {
      assert.equal(result.config.mcpServers.m365, undefined, 'Copilot uses its existing managed connector, not another OAuth client');
      assert.doesNotMatch(JSON.stringify(result.config), /workiq\.svc|oauthClientId|12798/);
      assert.equal(result.args[result.args.indexOf('--mcp-github-auth') + 1], 'workiqmcp=https://api.github.com');
      assert.equal(result.args.includes('--enable-mcp-server'), false, 'engine connector enablement is not overridden');
      for (const name of ['m365', 'WorkIQ', 'workiq']) assert.ok(result.args.includes(`--disable-mcp-server=${name}`), 'known standalone aliases must not trigger another sign-in');
      assert.match(result.input, /existing GitHub-managed Work IQ connector/);
    } else assert.equal(result.config.mcpServers.m365.command, undefined);
    assert.match(result.input, /Read my document/);
    assert.equal(events.some((ev) => ev.type === 'connection' && ev.status === 'connected'), true);
    assert.equal(events.some((ev) => ev.type === 'connection' && ev.toolCount > 0), true);
    assert.equal(events.some((ev) => ev.type === 'error'), false);
    if (provider.id === 'copilot-cli') assert.ok(result.args.includes('--deny-tool=write'));
    else assert.ok(result.args.includes('--strict-mcp-config'));
  });

  for (const status of ['needs-auth', 'failed', 'missing', 'pending']) {
    test(`${provider.id} surfaces ${status} without a false connected result`, async () => {
      process.env.LUMEN_TEST_WORKIQ_STATUS = status;
      const events = [];
      await provider.run({ prompt: 'Read a document', cwd: __dirname, tools: toolsFor(provider) }, (ev) => events.push(ev));
      const connection = events.filter((ev) => ev.type === 'connection' && ev.status).at(-1);
      assert.equal(connection.status, ['missing', 'pending'].includes(status) ? 'not-checked' : status);
      assert.equal(events.some((ev) => ev.type === 'connection' && ev.status === 'connected'), false);
      assert.ok(events.some((ev) => ev.type === 'tool_done' && ev.id.startsWith('m365-mcp-') && !ev.ok));
      assert.doesNotMatch(JSON.stringify(events), /fake-secret|GitHub account doesn't/);
      if (status === 'failed') assert.match(connection.message, /WorkIQ policy refused/);
    });
  }

  test(`${provider.id} sign-in uses the same server and no global configuration changes`, async () => {
    const original = workiq.openWindow;
    let captured;
    workiq.openWindow = async (bin, args, cwd) => { captured = { bin, args, cwd }; };
    try { await provider.connectWorkiq({ cwd: __dirname }); } finally { workiq.openWindow = original; }
    if (provider.id === 'copilot-cli') {
      const config = JSON.parse(captured.args[captured.args.indexOf('--additional-mcp-config') + 1]);
      assert.deepEqual(config.mcpServers, { [workiq.CONNECTOR_NAME]: workiq.connector() });
      assert.equal(captured.args[captured.args.indexOf('--mcp-github-auth') + 1], 'workiqmcp=https://api.github.com');
      assert.doesNotMatch(JSON.stringify(captured.args), /workiq\.svc|oauthClientId|12798/);
      for (const name of ['m365', 'WorkIQ', 'workiq']) assert.ok(captured.args.includes(`--disable-mcp-server=${name}`));
    } else {
      const config = JSON.parse(captured.args[captured.args.indexOf('--mcp-config') + 1]);
      assert.equal(config.mcpServers.m365.url, workiq.URL);
    }
    assert.equal(captured.cwd, __dirname);
    assert.equal(captured.args.some((arg) => ['add', 'install', '--scope'].includes(arg)), false);
    assert.equal(captured.args.includes('/mcp'), true);
  });
}

test('Copilot does not mislabel a WorkIQ authentication error as GitHub sign-in failure', async () => {
  process.env.LUMEN_TEST_WORKIQ_STATUS = 'session-error';
  const events = [];
  await providers[0].run({ prompt: 'Read a document', cwd: __dirname, tools: managedTools }, (ev) => events.push(ev));
  const error = events.find((ev) => ev.type === 'error');
  assert.match(error.message, /Microsoft 365: WorkIQ OAuth 401/);
  assert.doesNotMatch(error.message, /fake-secret|GitHub Copilot isn't signed in/);
});

test('Copilot ignores lookalike servers when the explicitly configured connector is absent', async () => {
  process.env.LUMEN_TEST_WORKIQ_STATUS = 'lookalikes-only';
  const events = [];
  await providers[0].run({ prompt: 'Read a document', cwd: __dirname, tools: managedTools }, (ev) => events.push(ev));
  const connection = events.filter((ev) => ev.type === 'connection' && ev.status).at(-1);
  assert.equal(connection.status, 'not-checked');
  assert.equal(events.some((ev) => ev.type === 'connection' && ev.status === 'connected'), false);
  assert.equal(events.some((ev) => ev.type === 'connection' && ev.toolCount === 9999), false);
});

test('Copilot handles connector-only requests and discovery cached before identity', async () => {
  process.env.LUMEN_TEST_WORKIQ_STATUS = 'cached';
  const events = [];
  await providers[0].run({ prompt: 'Read a document', cwd: __dirname, tools: { servers: {}, allow: [], workiq: 'managed' } }, (ev) => events.push(ev));
  const result = JSON.parse(events.filter((ev) => ev.type === 'text').map((ev) => ev.text).join(''));
  assert.deepEqual(result.config.mcpServers, { [workiq.CONNECTOR_NAME]: workiq.connector() });
  assert.equal(events.some((ev) => ev.type === 'connection' && ev.status === 'connected'), true);
  assert.equal(events.some((ev) => ev.type === 'connection' && ev.toolCount === 12), true);
  assert.equal(events.some((ev) => ev.type === 'connection' && ev.status === 'needs-auth'), false, 'standalone consent does not determine managed status');
});

test('Copilot forbids Microsoft 365 use when the request did not enable it', async () => {
  process.env.LUMEN_TEST_WORKIQ_STATUS = 'connected';
  const events = [];
  await providers[0].run({ prompt: 'Read a local document', cwd: __dirname }, (ev) => events.push(ev));
  const result = JSON.parse(events.filter((ev) => ev.type === 'text').map((ev) => ev.text).join(''));
  assert.match(result.input, /Microsoft 365 access is not enabled for this request/);
  assert.ok(result.args.includes('--disable-mcp-server=workiqmcp'));
  assert.equal(result.args.includes('--mcp-github-auth'), false);
  assert.equal(result.config.mcpServers.workiqmcp, undefined);
  assert.equal(events.some((ev) => ev.type === 'connection'), false);
});

test('Copilot reports an update requirement rather than falling back when GitHub MCP auth is unavailable', () => {
  const script = `
    const provider = require(${JSON.stringify(require.resolve('../providers/copilot-cli'))});
    const events = [];
    provider.run({ prompt: 'Read a document', tools: { servers: {}, allow: [], workiq: 'managed' } }, e => events.push(e))
      .then(async () => {
        try { await provider.connectWorkiq({ cwd: ${JSON.stringify(__dirname)} }); }
        catch (error) { events.push({ type: 'connect-error', message: error.message }); }
        console.log(JSON.stringify(events));
      });
  `;
  const events = JSON.parse(execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, LUMEN_TEST_WORKIQ_LEGACY_HELP: '1' }, encoding: 'utf8',
  }));
  assert.match(events.find(e => e.type === 'error').message, /Update GitHub Copilot/);
  assert.match(events.find(e => e.type === 'connect-error').message, /Update GitHub Copilot/);
  assert.ok(events.some(e => e.type === 'connection' && e.status === 'failed'));
  assert.equal(events.some(e => e.type === 'text'), false, 'no request launches without approved authentication');
});

test('Windows sign-in window has a real console and preserves quoted arguments', { skip: process.platform !== 'win32', timeout: 20000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-workiq-window-'));
  const marker = path.join(dir, "sign in's result.json");
  const argument = "a' b; $(Write-Output unsafe) \"quoted\"";
  let pid;
  try {
    const script = 'require("fs").writeFileSync(process.argv[1],JSON.stringify({input:!!process.stdin.isTTY,output:!!process.stdout.isTTY,args:process.argv.slice(2)}))';
    pid = await workiq.openWindow({ command: process.execPath, prefix: [], shell: false, found: process.execPath }, ['-e', script, marker, argument], dir);
    for (let i = 0; i < 100 && !fs.existsSync(marker); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(fs.existsSync(marker), 'the window must actually run the command');
    const result = JSON.parse(fs.readFileSync(marker, 'utf8'));
    assert.equal(result.input, true, 'the sign-in engine needs interactive input, not a closed pipe');
    assert.equal(result.output, true, 'the user must be able to see the connection screen');
    assert.deepEqual(result.args, [argument]);
  } finally {
    if (pid) execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Stop-Process -Id ${pid} -ErrorAction Stop`], { windowsHide: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
