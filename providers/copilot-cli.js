// GitHub Copilot CLI provider (`copilot`, also what `gh copilot` runs).
// Drives Copilot in prompt mode with JSONL output (`--output-format json`, Copilot CLI 1.0+) and translates
// its session events (assistant.message_delta, tool.execution_start/complete, session.error…) into the
// simple event stream every Lumen provider speaks (see providers/README.md).
//
// - The prompt goes in on stdin, so long prompts and quotes survive on Windows.
// - Conversation memory: Lumen picks the session UUID and passes it with --session-id (or --resume=<id> on
//   older CLIs), which creates the session on the first turn and resumes it afterwards.
// - Copilot has no "append system prompt" flag, so the assistant's instructions are sent at the top of the
//   first message of a session (and again only if they change).

const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const cli = require('../lib/cli-bin');
const { officeLabel, adoLabel, savedFile, pendingChangeSet, base } = require('../lib/tool-labels');

const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const BIN = cli.resolve('copilot', process.platform === 'win32'
  ? [path.join(LOCAL, 'Microsoft', 'WinGet', 'Links', 'copilot.exe'), path.join(LOCAL, 'GitHubCopilotCLI', 'copilot.exe'), path.join(process.env.APPDATA || '', 'npm', 'copilot.cmd')]
  : [path.join(os.homedir(), '.local', 'bin', 'copilot'), '/usr/local/bin/copilot', '/opt/homebrew/bin/copilot'], process.env.COPILOT_CLI_PATH);
const launch = (args, opts) => { const c = cli.command(BIN, args); return spawn(c.command, c.args, { windowsHide: true, ...c.options, ...opts }); };
const run = (args, opts, cb) => { const c = cli.command(BIN, args); return execFile(c.command, c.args, { windowsHide: true, ...c.options, ...opts }, cb); };

// Flags every run shares: machine-readable output, no prompts, no self-update, no GitHub MCP server
// (Lumen users work with documents, not repositories).
const COMMON = ['--output-format', 'json', '--no-color', '--no-auto-update', '--no-ask-user', '--disable-builtin-mcps'];

// With --no-auto-update the launcher may run an older bundled CLI than `copilot --version` reports.
// Newer CLIs set or resume a session with --session-id; older ones (e.g. 1.0.10) only have --resume=<id>,
// which also starts a new session with that UUID. Ask the CLI that will actually run which one it knows.
function sessionArgs(helpText, id) {
  return /--session-id\b/.test(String(helpText || '')) ? ['--session-id', id] : [`--resume=${id}`];
}
let helpText = null;
function runHelp() {
  if (!helpText) {
    helpText = new Promise((resolve) => {
      run(['--no-auto-update', '--help'], { timeout: 15000 },
        (err, stdout) => resolve(err ? '' : String(stdout)));
    });
  }
  return helpText;
}

// Plain-language access levels → Copilot permission flags. Denials win over --allow-all-tools.
const ACCESS_FLAGS = {
  chat: ['--available-tools=web_fetch', '--allow-all-tools', '--allow-all-urls', '--deny-tool=shell', '--deny-tool=write'],
  read: ['--allow-all-tools', '--allow-all-urls', '--deny-tool=shell', '--deny-tool=write'],
  edit: ['--allow-all-tools', '--allow-all-urls', '--deny-tool=shell'],
  full: ['--allow-all'],
};

function friendlyTool(name, input = {}, d = {}) {
  if (d.mcpServerName === 'office' && d.mcpToolName) return officeLabel(d.mcpToolName, input);
  if (d.mcpServerName === 'ado' && d.mcpToolName) return adoLabel(d.mcpToolName, input);
  const file = input.path || input.file_path || input.filePath;
  switch (name) {
    case 'view': case 'read': case 'show_file': return { icon: 'file', label: `Reading ${base(file) || 'a file'}`, file };
    case 'create': return { icon: 'pen', label: `Creating ${base(file) || 'a file'}`, file, writes: true };
    case 'edit': case 'str_replace': case 'str_replace_editor': case 'apply_patch': case 'write':
      return { icon: 'pen', label: `Updating ${base(file) || 'a file'}`, file, writes: !!file };
    case 'glob': return { icon: 'search', label: 'Looking through your files' };
    case 'grep': case 'rg': return { icon: 'search', label: input.pattern ? `Searching for “${String(input.pattern).slice(0, 40)}”` : 'Searching your files' };
    case 'web_fetch': {
      let host = '';
      try { host = new URL(input.url).hostname; } catch {}
      return { icon: 'globe', label: host ? `Reading ${host}` : 'Reading a web page' };
    }
    case 'web_search': return { icon: 'globe', label: input.query ? `Searching the web for “${String(input.query).slice(0, 50)}”` : 'Searching the web' };
    case 'bash': case 'powershell': case 'shell': return { icon: 'terminal', label: input.description || 'Running a command' };
    case 'report_intent': return { icon: 'spark', label: input.intent || 'Thinking it through' };
    case 'update_todo': case 'todo': return { icon: 'list', label: 'Planning the steps' };
    case 'task': return { icon: 'spark', label: input.description || 'Bringing in a helper' };
    case 'skill': return { icon: 'spark', label: `Using skill ${input.skill || input.name || ''}`.trim() };
    default: return { icon: 'spark', label: `Using ${String(d.mcpToolName || name).replace(/_/g, ' ')}` };
  }
}

function friendlyError(msg) {
  if (/no authentication|not (logged|signed) in|\/login|unauthori[sz]ed|401/i.test(msg)) {
    return 'GitHub Copilot isn\'t signed in on this computer. Open a terminal, run `copilot` and type `/login` (or run `gh auth login`), then try again.';
  }
  if (/subscription|not enabled|access denied|policy|403/i.test(msg)) return `Your GitHub account doesn't have Copilot CLI access (check your Copilot subscription or your organization's policy). ${msg}`;
  if (/quota|rate.?limit|429/i.test(msg)) return `Copilot's usage limit was reached. Try again later or pick a different model. ${msg}`;
  return msg;
}

/** Reads Copilot's JSONL stream line by line. */
function lineReader(onJson, onOther) {
  let buf = '';
  return (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg = null;
      try { msg = JSON.parse(line); } catch {}
      if (msg && typeof msg.type === 'string') onJson(msg); else onOther(line);
    }
  };
}

const sentInstructions = new Map(); // sessionId -> instructions already given to that session

module.exports = {
  id: 'copilot-cli',
  name: 'GitHub Copilot',
  vendor: 'GitHub · Copilot CLI',
  description: 'Uses the GitHub Copilot CLI (`copilot` / `gh copilot`). Requires a Copilot subscription.',
  models: [
    { id: 'default', label: 'Default', hint: 'Whatever your Copilot plan selects' },
    { id: 'auto', label: 'Auto', hint: 'Copilot picks the best model for each request' },
  ],
  supportsResume: true,
  sessionArgs, // exported for tests

  detect() {
    return new Promise((resolve) => {
      run(['--no-auto-update', '--version'], { timeout: 15000 }, (err, stdout) => {
        if (err) return resolve({ available: false, message: 'GitHub Copilot CLI not found. Install it (`winget install GitHub.Copilot` or `npm i -g @github/copilot`), then run `copilot` and `/login` once — or sign in with `gh auth login`.' });
        const version = String(stdout).trim().split('\n')[0];
        const major = Number((/(\d+)\.\d+/.exec(version) || [])[1]);
        if (major < 1) return resolve({ available: false, version, message: `${version} is too old for Lumen. Update it with \`copilot update\` (1.0 or later is needed).` });
        resolve({ available: true, version });
      });
    });
  },

  run({ prompt, sessionId, systemPrompt, cwd, model, access = 'read', signal, tools: extra }, emit) {
    return runHelp().then((help) => new Promise((resolve) => {
      const session = sessionId || crypto.randomUUID();
      emit({ type: 'session', id: session });

      let full = prompt;
      if (systemPrompt && sentInstructions.get(session) !== systemPrompt) {
        full = `Follow these instructions for the whole conversation:\n<instructions>\n${systemPrompt}\n</instructions>\n\n${prompt}`;
      }

      const args = [...COMMON, ...sessionArgs(help, session), ...(ACCESS_FLAGS[access] || ACCESS_FLAGS.read)];
      if (model && model !== 'default' && module.exports.models.some((m) => m.id === model)) args.push('--model', model);
      // Skills' tools: hand Copilot the same MCP server Claude gets, limited to the allowed tools.
      if (extra?.servers) {
        const mcpServers = Object.fromEntries(Object.entries(extra.servers).map(([k, v]) => [k, {
          type: 'local', command: v.command, args: v.args, env: v.env || {},
          tools: (extra.allow || []).filter((t) => t.server === k).map((t) => t.tool),
        }]));
        args.push('--additional-mcp-config', JSON.stringify({ mcpServers }));
      }

      const child = launch(args, { cwd, env: { ...process.env, NO_COLOR: '1' } });
      child.stdin.on('error', () => {});
      child.stdin.end(full); // prompt mode reads the prompt from stdin

      let stderr = '';
      let plain = '';
      let sawJson = false;
      let sawText = false;
      let failed = false;
      let lastMessage = null;
      const streamed = new Set(); // assistant messageIds already shown via deltas
      const tools = {};
      const onAbort = () => { try { child.kill(); } catch {} };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      const text = (t, messageId) => {
        if (!t) return;
        if (sawText && messageId && messageId !== lastMessage) emit({ type: 'text', text: '\n\n' });
        sawText = true; lastMessage = messageId || lastMessage;
        emit({ type: 'text', text: t });
      };

      const handle = (ev) => {
        sawJson = true;
        const d = ev.data || {};
        if (ev.agentId || d.parentToolCallId) return; // a helper agent's inner steps: keep the timeline tidy
        switch (ev.type) {
          case 'assistant.message_delta':
            streamed.add(d.messageId);
            text(d.deltaContent, d.messageId);
            break;
          case 'assistant.message':
            if (!streamed.has(d.messageId)) text(d.content, d.messageId);
            break;
          case 'tool.execution_start': {
            let input = d.arguments || {};
            if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = {}; } }
            tools[d.toolCallId] = d;
            const f = friendlyTool(d.toolName, input, d);
            if (f.file) f.file = path.resolve(cwd || '.', f.file);
            emit({ type: 'tool', id: d.toolCallId, ...f });
            break;
          }
          case 'tool.execution_complete': {
            emit({ type: 'tool_done', id: d.toolCallId, ok: d.success !== false });
            for (const e of d.fileEdits || []) if (e?.path) emit({ type: 'file', path: e.path });
            const started = tools[d.toolCallId];
            if (d.success !== false && ['office', 'ado'].includes(started?.mcpServerName)) {
              const text = d.result?.content || (d.result?.contents || []).map((c) => c.text || '').join('');
              const saved = savedFile(text);
              if (saved) emit({ type: 'file', path: saved });
              const pending = started.mcpServerName === 'ado' && /^ado_propose_/.test(started.mcpToolName || '') && pendingChangeSet(text);
              if (pending) emit({ type: 'approval', id: pending });
            }
            break;
          }
          case 'session.mcp_servers_loaded': {
            const office = (d.servers || []).find((s) => s.name === 'office');
            if (office?.status === 'failed') {
              emit({ type: 'tool', id: 'office-mcp', icon: 'sheet', label: 'Couldn\'t start the document and spreadsheet tools' });
              emit({ type: 'tool_done', id: 'office-mcp', ok: false });
            }
            const ado = (d.servers || []).find((s) => s.name === 'ado');
            if (ado?.status === 'failed') {
              emit({ type: 'tool', id: 'ado-mcp', icon: 'board', label: 'Couldn\'t connect to Azure DevOps' });
              emit({ type: 'tool_done', id: 'ado-mcp', ok: false });
            }
            break;
          }
          case 'session.error':
            failed = true;
            emit({ type: 'error', message: friendlyError(d.message || 'Copilot reported an error.') });
            break;
          default: break;
        }
      };

      child.stdout.on('data', lineReader(handle, (line) => { plain += `${line}\n`; }));
      child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
      child.on('error', (err) => { failed = true; emit({ type: 'error', message: `Could not start Copilot: ${err.message}` }); });
      child.on('close', (code) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        if (!sawJson && plain.trim() && code === 0) text(plain.trim()); // very old CLIs ignore --output-format
        if (code === 0 && sawText && systemPrompt) sentInstructions.set(session, systemPrompt);
        if (signal?.aborted || failed) return resolve();
        if (code !== 0) {
          const msg = (stderr.trim() || plain.trim()).split('\n').slice(-4).join(' ') || `Copilot exited with code ${code}`;
          emit({ type: 'error', message: friendlyError(msg) });
        } else if (!sawText) {
          emit({ type: 'error', message: 'Copilot returned no answer.' });
        }
        resolve();
      });
    }));
  },

  /** One-shot, tool-less completion used for small helper tasks (titles, drafting assistants). */
  complete({ prompt, cwd }) {
    return new Promise((resolve) => {
      const child = launch([...COMMON, '--available-tools=', '--deny-tool=shell', '--deny-tool=write'], { cwd: cwd || os.tmpdir(), env: { ...process.env, NO_COLOR: '1' } });
      let out = '';
      child.stdout.on('data', lineReader((ev) => {
        if (ev.type === 'assistant.message' && !ev.agentId && ev.data?.content) out = ev.data.content;
      }, () => {}));
      child.stdin.on('error', () => {});
      child.on('error', () => resolve(''));
      child.on('close', () => resolve(out.trim()));
      child.stdin.end(prompt);
      setTimeout(() => { try { child.kill(); } catch {} }, 90000);
    });
  },
};
