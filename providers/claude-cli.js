// Claude Code CLI provider.
// Drives `claude -p` in streaming JSON mode and translates its events into
// the simple event stream every Lumen provider speaks (see providers/README.md).

const { spawn, execFile } = require('child_process');
const path = require('path');
const os = require('os');
const cli = require('../lib/cli-bin');
const workiq = require('../lib/workiq');
const { officeLabel, adoLabel, savedFile, pendingChangeSet } = require('../lib/tool-labels');

const ACCESS_TOOLS = {
  // Plain-language access levels → the Claude Code tools they unlock.
  chat: ['WebSearch', 'WebFetch'],
  read: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
  edit: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'NotebookEdit', 'WebSearch', 'WebFetch', 'TodoWrite'],
  full: ['default'],
};

const BIN = cli.resolve('claude', process.platform === 'win32'
  ? [path.join(os.homedir(), '.local', 'bin', 'claude.exe'), path.join(process.env.APPDATA || '', 'npm', 'claude.cmd')]
  : [path.join(os.homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/opt/homebrew/bin/claude'], process.env.CLAUDE_CLI_PATH);
const launch = (args, opts) => { const c = cli.command(BIN, args); return spawn(c.command, c.args, { windowsHide: true, ...c.options, ...opts }); };

function friendlyTool(name, input = {}) {
  const base = (p) => (p ? path.basename(String(p)) : '');
  switch (name) {
    case 'Read': return { icon: 'file', label: `Reading ${base(input.file_path) || 'a file'}`, file: input.file_path };
    case 'Write': return { icon: 'pen', label: `Creating ${base(input.file_path) || 'a file'}`, file: input.file_path, writes: true };
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return { icon: 'pen', label: `Updating ${base(input.file_path || input.notebook_path) || 'a file'}`, file: input.file_path || input.notebook_path, writes: true };
    case 'Glob': return { icon: 'search', label: 'Looking through your files' };
    case 'Grep': return { icon: 'search', label: input.pattern ? `Searching for “${String(input.pattern).slice(0, 40)}”` : 'Searching your files' };
    case 'WebSearch': return { icon: 'globe', label: input.query ? `Searching the web for “${String(input.query).slice(0, 50)}”` : 'Searching the web' };
    case 'WebFetch': {
      let host = '';
      try { host = new URL(input.url).hostname; } catch {}
      return { icon: 'globe', label: host ? `Reading ${host}` : 'Reading a web page' };
    }
    case 'Bash': case 'PowerShell': return { icon: 'terminal', label: input.description || 'Running a command' };
    case 'TodoWrite': return { icon: 'list', label: 'Planning the steps' };
    case 'Task': case 'Agent': return { icon: 'spark', label: input.description || 'Bringing in a helper' };
    case 'Skill': return { icon: 'spark', label: `Using skill ${input.skill || ''}`.trim() };
    default:
      if (name.startsWith('mcp__office__')) return officeLabel(name.slice('mcp__office__'.length), input); // Lumen's bundled Office tools
      if (name.startsWith('mcp__ado__')) return adoLabel(name.slice('mcp__ado__'.length), input); // Lumen's Azure DevOps tools
      return { icon: 'spark', label: `Using ${name.replace(/^mcp__[^_]+__/, '').replace(/_/g, ' ')}` };
  }
}

module.exports = {
  id: 'claude-cli',
  name: 'Claude',
  vendor: 'Anthropic · Claude Code CLI',
  description: 'Uses the Claude Code command-line tool you are already signed in to.',
  models: [
    // Labels follow Microsoft 365 Copilot's response modes so people learn one vocabulary.
    { id: 'default', label: 'Auto', hint: 'Your Claude Code default model' },
    { id: 'haiku', label: 'Quick response', hint: 'Haiku — fast answers for simple asks' },
    { id: 'sonnet', label: 'Balanced', hint: 'Sonnet — a great all-rounder' },
    { id: 'opus', label: 'Think deeper', hint: 'Opus — careful reasoning, slower' },
  ],
  supportsResume: true,

  async connectWorkiq({ cwd }) {
    const config = workiq.mcpServers({ m365: workiq.server() }, [], 'claude-cli');
    await workiq.openWindow(BIN, ['--mcp-config', JSON.stringify({ mcpServers: config }), '--strict-mcp-config', '--tools', '', '/mcp'], cwd);
  },

  detect() {
    return new Promise((resolve) => {
      const c = cli.command(BIN, ['--version']);
      execFile(c.command, c.args, { ...c.options, timeout: 15000, windowsHide: true }, (err, stdout) => {
        if (err) return resolve({ available: false, message: 'Claude Code CLI not found. Install it from https://claude.com/claude-code and run `claude` once to sign in.' });
        resolve({ available: true, version: String(stdout).trim() });
      });
    });
  },

  /**
   * Run one turn. Calls `emit(event)` for each event; resolves when finished.
   * Events: {type:'session', id} {type:'text', text} {type:'tool', id, icon, label}
   *         {type:'tool_done', id, ok} {type:'usage', costUsd, durationMs} {type:'error', message}
   */
  run({ prompt, sessionId, systemPrompt, cwd, model, access = 'read', signal, tools: extra }, emit) {
    return new Promise((resolve) => {
      const tools = ACCESS_TOOLS[access] || ACCESS_TOOLS.read;
      const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
      if (model && model !== 'default') args.push('--model', model);
      if (sessionId) args.push('--resume', sessionId);
      if (systemPrompt) args.push('--append-system-prompt', systemPrompt);
      // Skills' tools arrive as MCP servers; only Lumen's servers load, and only the listed tools are allowed.
      const mcpAllowed = (extra?.allow || []).map((t) => t.tool === '*' ? `mcp__${t.server}` : `mcp__${t.server}__${t.tool}`); // '*' = every tool the server offers
      if (extra?.servers) {
        const mcpServers = workiq.mcpServers(extra.servers, extra.allow || [], 'claude-cli');
        args.push('--mcp-config', JSON.stringify({ mcpServers }), '--strict-mcp-config');
      }
      if (access === 'full') {
        args.push('--permission-mode', 'acceptEdits');
        if (mcpAllowed.length) args.push('--allowedTools', mcpAllowed.join(','));
      } else {
        args.push('--tools', tools.join(','));
        args.push('--allowedTools', [...tools, ...mcpAllowed].join(','));
        if (access === 'edit') args.push('--permission-mode', 'acceptEdits');
      }

      let workiqStatus;
      if (extra?.servers?.m365) workiq.emitStatus(emit, 'pending');
      const child = launch(args, { cwd, env: { ...process.env } });
      child.stdin.end(prompt); // prompt via stdin: no quoting/length issues

      let buf = '';
      let stderr = '';
      let sawText = false;
      let finished = false;
      const toolNames = {};

      const onAbort = () => { try { child.kill(); } catch {} };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      let sentSession = false;
      const handle = (msg) => {
        if (msg.session_id && !sentSession) { sentSession = true; emit({ type: 'session', id: msg.session_id }); }
        if (msg.type === 'system' && msg.subtype === 'init' && extra?.servers?.m365) {
          const m365 = (msg.mcp_servers || []).find((s) => s.name === 'm365');
          workiqStatus = m365?.status || 'not_configured';
          const count = (msg.tools || []).filter((t) => typeof t === 'string' && t.startsWith('mcp__m365__')).length;
          workiq.emitStatus(emit, workiqStatus, m365?.error, count);
        } else if (msg.type === 'stream_event' && !msg.parent_tool_use_id) {
          const ev = msg.event || {};
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            sawText = true;
            emit({ type: 'text', text: ev.delta.text });
          } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'text' && sawText) {
            emit({ type: 'text', text: '\n\n' });
          }
        } else if (msg.type === 'assistant') {
          for (const block of msg.message?.content || []) {
            if (block.type === 'tool_use') {
              toolNames[block.id] = block.name;
              emit({ type: 'tool', id: block.id, ...friendlyTool(block.name, block.input) });
            }
          }
        } else if (msg.type === 'user') {
          for (const block of msg.message?.content || []) {
            if (block.type !== 'tool_result') continue;
            emit({ type: 'tool_done', id: block.tool_use_id, ok: !block.is_error });
            // Lumen's tools report the file they saved (a file card) or a staged Azure DevOps change (an Approve card).
            if (!block.is_error && /^mcp__(office|ado)__/.test(toolNames[block.tool_use_id] || '')) {
              const text = Array.isArray(block.content) ? block.content.map((c) => c.text || '').join('') : block.content;
              const saved = savedFile(text);
              if (saved) emit({ type: 'file', path: saved });
              const pending = /^mcp__ado__ado_propose_/.test(toolNames[block.tool_use_id]) && pendingChangeSet(text);
              if (pending) emit({ type: 'approval', id: pending });
            }
          }
        } else if (msg.type === 'result') {
          finished = true;
          if (msg.is_error && msg.result) emit({ type: 'error', message: String(msg.result) });
          else if (!sawText && msg.result) emit({ type: 'text', text: String(msg.result) });
          emit({ type: 'usage', costUsd: msg.total_cost_usd, durationMs: msg.duration_ms });
        }
      };

      child.stdout.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try { handle(JSON.parse(line)); } catch { /* ignore non-JSON noise */ }
        }
      });
      child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
      child.on('error', (err) => { emit({ type: 'error', message: `Could not start Claude: ${err.message}` }); });
      child.on('close', (code) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        if (extra?.servers?.m365 && (!workiqStatus || workiqStatus === 'pending')) workiq.emitStatus(emit, 'not-checked',
          workiqStatus ? 'The AI engine ended before the Microsoft 365 connection check finished.' : 'The AI engine did not report a Microsoft 365 connection status.');
        if (!finished && !signal?.aborted && code !== 0) {
          const hint = /resume|session/i.test(stderr) ? ' (the previous conversation could not be resumed)' : '';
          emit({ type: 'error', message: (stderr.trim().split('\n').slice(-3).join(' ') || `Claude exited with code ${code}`) + hint });
        }
        resolve();
      });
    });
  },

  /** One-shot, tool-less completion used for small helper tasks (titles, drafting assistants). */
  complete({ prompt, cwd }) {
    return new Promise((resolve) => {
      const child = launch(['-p', '--model', 'haiku', '--tools', '', '--no-session-persistence'], { cwd: cwd || os.tmpdir() });
      let out = '';
      child.stdout.on('data', (c) => { out += c; });
      child.on('error', () => resolve(''));
      child.on('close', () => resolve(out.trim()));
      child.stdin.end(prompt);
      setTimeout(() => { try { child.kill(); } catch {} }, 60000);
    });
  },
};
