// GitHub Copilot CLI provider (preview).
// Uses `copilot -p` in non-interactive mode. Copilot's prompt mode does not hand
// back a session id in text output, so the server replays recent conversation
// history into the prompt instead (supportsResume: false).

const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function findBinary() {
  if (process.env.COPILOT_CLI_PATH && fs.existsSync(process.env.COPILOT_CLI_PATH)) return process.env.COPILOT_CLI_PATH;
  const candidates = process.platform === 'win32'
    ? [path.join(process.env.LOCALAPPDATA || '', 'GitHubCopilotCLI', 'copilot.exe'), path.join(process.env.APPDATA || '', 'npm', 'copilot.cmd')]
    : ['/usr/local/bin/copilot', '/opt/homebrew/bin/copilot', path.join(os.homedir(), '.local', 'bin', 'copilot')];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  return 'copilot';
}

const BIN = findBinary();
const needsShell = (bin) => /\.(cmd|bat)$/i.test(bin) || bin === 'copilot';

// Plain-language access levels → Copilot permission flags.
const ACCESS_FLAGS = {
  chat: ['--allow-all-tools', '--deny-tool=shell', '--deny-tool=write'],
  read: ['--allow-all-tools', '--deny-tool=shell', '--deny-tool=write'],
  edit: ['--allow-all-tools', '--deny-tool=shell'],
  full: ['--allow-all-tools'],
};

module.exports = {
  id: 'copilot-cli',
  name: 'GitHub Copilot',
  vendor: 'GitHub · Copilot CLI (preview)',
  description: 'Uses the GitHub Copilot CLI. Requires an active Copilot subscription.',
  models: [
    { id: 'default', label: 'Copilot default', hint: 'Whatever your Copilot plan selects' },
  ],
  supportsResume: false,

  detect() {
    return new Promise((resolve) => {
      execFile(BIN, ['--version'], { shell: needsShell(BIN), timeout: 15000, windowsHide: true }, (err, stdout) => {
        if (err) return resolve({ available: false, message: 'GitHub Copilot CLI not found. Install it with `npm i -g @github/copilot` and sign in.' });
        resolve({ available: true, version: String(stdout).trim().split('\n')[0] });
      });
    });
  },

  run({ prompt, systemPrompt, cwd, model, access = 'read', signal, tools: extra }, emit) {
    return new Promise((resolve) => {
      const full = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
      const args = ['-p', full, '-s', '--no-color', '--no-auto-update', ...(ACCESS_FLAGS[access] || ACCESS_FLAGS.read)];
      if (model && model !== 'default') args.push('--model', model);
      // Skills' tools: hand Copilot the same MCP servers (it uses its own config shape).
      if (extra?.servers) {
        const mcpServers = Object.fromEntries(Object.entries(extra.servers).map(([k, v]) => [k, {
          type: 'local', command: v.command, args: v.args, env: v.env || {},
          tools: (extra.allow || []).filter((t) => t.server === k).map((t) => t.tool),
        }]));
        args.push('--additional-mcp-config', JSON.stringify({ mcpServers }));
      }

      const child = spawn(BIN, args, { cwd, shell: needsShell(BIN), windowsHide: true });
      let stderr = '';
      let any = false;
      const onAbort = () => { try { child.kill(); } catch {} };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      emit({ type: 'tool', id: 'copilot', icon: 'spark', label: 'Copilot is working' });
      child.stdout.on('data', (c) => { any = true; emit({ type: 'text', text: c.toString('utf8') }); });
      child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
      child.on('error', (err) => emit({ type: 'error', message: `Could not start Copilot: ${err.message}` }));
      child.on('close', (code) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        emit({ type: 'tool_done', id: 'copilot', ok: code === 0 });
        if (code !== 0 && !signal?.aborted) {
          const msg = stderr.trim() || `Copilot exited with code ${code}`;
          emit({ type: 'error', message: /auth|login|subscription|unauthor/i.test(msg) ? `Copilot needs you to sign in or have an active subscription. ${msg}` : msg });
        } else if (!any && !signal?.aborted) {
          emit({ type: 'error', message: 'Copilot returned no answer.' });
        }
        resolve();
      });
    });
  },

  complete() { return Promise.resolve(''); },
};
