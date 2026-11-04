# AI engine providers

Lumen doesn't talk to any AI service directly. It drives whichever AI command-line tool is installed on the computer. Each engine is one file in this folder, and `index.js` loads every `*.js` file it finds here automatically.

| File | Engine | Conversation memory |
|---|---|---|
| `claude-cli.js` | Claude Code CLI (`claude -p --output-format stream-json`) | Native: resumes the CLI session |
| `copilot-cli.js` | GitHub Copilot CLI 1.0+ (`copilot --output-format json`, prompt on stdin; also what `gh copilot` runs) | Native: Lumen picks the session UUID and passes `--session-id`, which creates the session on the first turn and resumes it afterwards. Copilot has no system-prompt flag, so the assistant's instructions open the first message of each session |

Both providers launch their CLI through `lib/cli-bin.js`. It runs the real executable, or unwraps npm's `.cmd` shim to `node <entry.js>`, and never goes through `cmd.exe`, so multi-line prompts, quotes and JSON arguments survive on Windows.

## Adding an engine

Create `providers/my-engine.js` that exports:

```js
module.exports = {
  id: 'my-engine',                 // unique, stored in settings
  name: 'My Engine',               // shown to users
  vendor: 'Who makes it',
  description: 'One line for the settings screen',
  models: [{ id: 'default', label: 'Balanced', hint: 'Shown in the Response style menu' }],
  supportsResume: false,           // true if run() emits {type:'session'} and accepts sessionId

  async detect() { return { available: true, version: '1.0' }; },  // or { available:false, message }

  // One turn. Call emit() as things happen; resolve when finished.
  async run({ prompt, sessionId, systemPrompt, cwd, model, access, signal }, emit) {
    emit({ type: 'session', id: '...' });                         // optional
    emit({ type: 'tool', id: 't1', icon: 'file', label: 'Reading report.docx', file: '/abs/path', writes: false });
    emit({ type: 'tool_done', id: 't1', ok: true });
    emit({ type: 'text', text: 'Streaming markdown…' });
    emit({ type: 'error', message: 'Plain-language problem description' });
  },

  async complete({ prompt }) { return 'short text'; },  // small helper calls (chat titles, drafting assistants)
};
```

`access` is one of the plain-language permission levels the user picks in the UI. Map each one to your tool's own permission flags:

- `chat`: no file access (web search is fine)
- `read`: read files in `cwd`
- `edit`: read, create and edit files in `cwd`
- `full`: no restrictions (not shown in the UI, kept for power users)

Icons available for `tool` events: `file`, `pen`, `search`, `globe`, `terminal`, `list`, `spark`.
