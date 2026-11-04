# ✨ Lumen

A friendly, Claude-style AI workspace that runs on your own computer. It's built for business analysts, project managers and anyone else who'd rather chat than configure.

Lumen sits on top of the AI command-line tools your organization already deploys (Claude Code today, GitHub Copilot CLI as a pluggable alternative), so there are no API keys to manage and no new accounts to create.

## Start it

**Windows:** double-click **`Start Lumen.cmd`**. The first run installs dependencies, and then your browser opens at <http://localhost:4317>.

**Any OS:**

```bash
npm install
```

```bash
npm start
```

Requirements: Node.js 18+ and at least one engine installed and signed in:
- [Claude Code](https://claude.com/claude-code) (run `claude` once to sign in), or
- [GitHub Copilot CLI](https://github.com/github/copilot-cli) (needs a Copilot subscription)

## What users see

| Concept in Lumen | What it really is |
|---|---|
| **Assistants**: "Requirements Coach", "Project Partner"… | A persona/system prompt appended to the CLI session (`--append-system-prompt`). Can be exported as a Claude Code subagent (`.claude/agents/*.md`) and a Copilot custom agent (`.github/agents/*.agent.md`) with **⋯ → Use in VS Code**. |
| **Quick starts**: "Weekly status report", "Write user stories"… | Reusable prompt templates with a small form (short answer, long answer, pick-one, file). A friendlier version of skills or slash commands. |
| **"What can Lumen do?"**: Just chat / Read my files / Create & edit files | Maps to the CLI's tool allow-list and permission mode. Shell commands are never enabled from the UI. |
| **Project folder** | The CLI's working directory. Attachments are saved to `Attachments/` inside it, and files the AI writes show up as clickable cards. |
| **Response style**: Quickest / Smart & fast / Most capable | `--model haiku / sonnet / opus` |

Other touches: streaming markdown with tables and code highlighting, friendly progress steps ("Reading budget.xlsx…"), auto-titled chats, pin/rename/search, drag-and-drop or paste to attach, light/dark themes, a 3-step welcome, and replies that keep running if the tab is closed.

## Project managers: Microsoft Project + Excel

Lumen ships two **skills** that assistants can switch on (Assistants › Customize › Skills):

| Skill | What the AI can do |
|---|---|
| 📅 **Microsoft Project plans** | Read plans; run a health check (RAG, late tasks, critical path with float, slips vs. baseline, milestones, over-allocated people, cost vs. baseline); update % complete, dates, durations and notes (always saved as an "(updated)" copy); export to an Excel tracker with a weekly Gantt chart |
| 📗 **Excel workbooks** | Read every sheet with real cell addresses and formulas; create formatted workbooks with live formulas; update cells or append rows without losing formatting |

They're backed by a small local tool server, [tools/office-mcp.js](tools/office-mcp.js), an MCP server that every engine can use. It can only read or write inside the project folder, and its editing tools exist only when the chat is set to "Create & edit files". Attaching a `.mpp`, `.xml`, `.xlsx` or `.csv` turns on the matching skill automatically.

**PM assistants:** Schedule Analyst 📅, Budget Controller 💰 and Project Partner 📋. **PM quick starts:** Project health check, Status report from my files, Update plan from progress sheet, Plan → Excel tracker, Who's overloaded?, Budget variance review, Timesheets vs. plan, and RAID log review. File questions pre-select the best-matching file from the project folder.

**About .mpp files:** `.mpp` is Microsoft's closed binary format, and only Microsoft Project can read or write it. Lumen works with **Project XML** (File › Save As › XML in Project), which Project opens natively. On computers with Microsoft Project installed, Lumen converts `.mpp` to and from XML automatically through Project itself. That path hasn't been tested yet, because this build machine doesn't have Project.

### The demo

The home screen offers **Set up demo**. It copies the **Contoso CRM Migration** pack from [demo/](demo/) into your project folder and switches to it. The pack contains a 42-task Microsoft Project plan (baseline, progress, 8 resources, a 10-day slip, a late task and an over-allocated developer), plus a budget tracker, RAID log, timesheets and a weekly progress update in Excel. Regenerate it with:

```bash
node scripts/make-demo.js
```

The demo folder also gets VS Code files, so the same assistants, skills and tools work in Claude Code (`.claude/agents`, `.claude/skills`, `.mcp.json`) and GitHub Copilot (`.github/agents`, `.vscode/mcp.json`). The same files are written for any assistant through **⋯ › Use in VS Code**.

## Making assistants without writing prompts

On **Assistants → Create assistant**, describe the helper in one sentence ("Helps me write UAT scripts for our HR rollout") and click **Draft it**. Lumen asks the engine to propose a name, icon, behaviour and example requests, which you can tweak before saving.

## Pluggable engines

See [providers/README.md](providers/README.md). Each engine is one file that turns a CLI's output into a small event stream (`text`, `tool`, `tool_done`, `session`, `error`). Drop a new file in `providers/` and it appears in **Settings → AI engine**.

## Where things live

- `data/` holds settings, assistants, quick starts and chat history (plain JSON; delete the folder to reset). Override the location with `LUMEN_DATA`.
- `defaults/` holds the built-in assistants and quick starts copied in on first run. Edit these to ship your own organization-wide set.
- `PORT` changes the port (default `4317`). The server only listens on `127.0.0.1`.
- `CLAUDE_CLI_PATH` / `COPILOT_CLI_PATH` point at a specific CLI binary if it isn't on the usual path.

## Project layout

```
server.js            HTTP server, JSON API, NDJSON chat streaming
lib/store.js         JSON file storage
providers/           Pluggable AI engines (claude-cli, copilot-cli)
skills/              Skills (SKILL.md) assistants can switch on
tools/               Office tools: Excel + MS Project engine and MCP server
demo/                Contoso CRM Migration demo pack (generated by scripts/make-demo.js)
defaults/            Starter assistants & quick starts
public/              The UI (vanilla HTML/CSS/JS, no build step)
Start Lumen.cmd      Double-click launcher for Windows
```

## The explainer video

[film/make_video.py](film/make_video.py) films a narrated demo of the real app with two personas: Marcus, a business analyst, and Priya, a project manager using the Microsoft Project plan and Excel workbooks. It drives Lumen in Microsoft Edge the way a person would. A cursor moves and clicks, the camera zooms in on what matters, and text is typed key by key. The narration is read by **Kokoro** (`af_heart`), running locally the same way as in IRISIdeas, over click and keyboard sounds and a soft generated music bed.

```bash
.venv/Scripts/python.exe film/make_video.py --record
```

```bash
.venv/Scripts/python.exe film/make_video.py
```

1. `--record` runs every conversation once against the real AI engine and saves the streamed answers and any files created to `film/recordings/`.
2. Without flags, the script films the app while Lumen **replays** that recording at a brisk pace (`providers/recorder.js`, active only when `LUMEN_REPLAY` is set). Every answer on screen is a genuine AI answer, without the waiting.
3. The output is `film/out/lumen-explainer.mp4` (1080p, 30 fps, about −14 LUFS), plus captions (`.srt`) and a thumbnail.

Setup: `pip install playwright imageio-ffmpeg kokoro-onnx soundfile numpy` into `.venv`, then copy `kokoro-v1.0.onnx` and `voices-v1.0.bin` into `.venv/kokoro`. Narration lines live at the top of `make_video.py` and are re-voiced only when they change.
