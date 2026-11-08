// Regression tests for the security review: launching CLIs through cmd.exe, and the Office tools' folder boundary.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const cli = require('../lib/cli-bin');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-security-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('without a shell, arguments pass through untouched', () => {
  const c = cli.command({ command: 'node', prefix: ['entry.js'], shell: false }, ['a & b']);
  assert.deepEqual(c, { command: 'node', args: ['entry.js', 'a & b'], options: {} });
});

test('a .cmd shim run through cmd.exe gets every argument intact and runs nothing else', { skip: process.platform !== 'win32' }, () => {
  const dir = path.join(temp, 'dir with space');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'echo.js'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
  fs.writeFileSync(path.join(dir, 'fake cli.cmd'), '@ECHO off\r\nnode "%~dp0echo.js" %*\r\n');
  const marker = path.join(temp, 'pwned.txt');
  const args = [
    `a & echo pwned > "${marker}"`, 'x|y', 'say "hi" there', '100% done', '%PATH%', 'trail\\', 'C:\\dir\\"q"', '^caret',
    'multi\nline', '{"mcpServers":{"o":{"args":["a b"]}}}', '!bang!', '(paren) ; comma,', '',
  ];
  const c = cli.command({ command: path.join(dir, 'fake cli.cmd'), prefix: [], shell: true }, args);
  const out = JSON.parse(execFileSync(c.command, c.args, { ...c.options, encoding: 'utf8', cwd: temp }));
  assert.deepEqual(out, args.map((a) => a.replace(/\n/g, ' ')));
  assert.ok(!fs.existsSync(marker), 'an injected command ran');
});

test('Office tools refuse to write through a link that points outside the project folder', () => {
  const root = path.join(temp, 'project'), outside = path.join(temp, 'outside');
  fs.mkdirSync(root); fs.mkdirSync(outside);
  try { fs.symlinkSync(outside, path.join(root, 'linked'), 'junction'); } catch (e) { return test.skip?.(`can't create a link here: ${e.code}`); }
  const call = (args) => {
    const input = `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'save_draft_document', arguments: args } })}\n`;
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'office-mcp.js')], { input, encoding: 'utf8', env: { ...process.env, OFFICE_MCP_ROOT: root, OFFICE_MCP_READONLY: '0' } });
    return JSON.parse(out.stdout.trim().split('\n').pop()).result;
  };
  // The folder "new" doesn't exist yet, so only resolving the nearest existing ancestor catches the link.
  for (const p of ['linked/new/escape.md', 'linked/escape.md']) {
    const r = call({ path: p, markdown: '# x' });
    assert.ok(r.isError, `${p} was written: ${r.content[0].text}`);
    assert.match(r.content[0].text, /outside the project folder/);
  }
  assert.deepEqual(fs.readdirSync(outside), []);
  const ok = call({ path: 'inside/new/draft.md', markdown: '# x' });
  assert.ok(!ok.isError, ok.content[0].text);
  assert.ok(fs.existsSync(path.join(root, 'inside', 'new', 'draft.md')));
});
