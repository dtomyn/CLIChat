# ✨ Lumen

A friendly, Claude-style AI workspace that runs on your own computer. It's built for business analysts, project managers and anyone else who'd rather chat than configure.

Lumen sits on top of the AI command-line tools your organization already deploys (Claude Code or the GitHub Copilot CLI), so there are no API keys to manage and no new accounts to create.

see: https://youtu.be/6uLWQEaM1PM

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
- [GitHub Copilot CLI](https://github.com/github/copilot-cli) 1.0 or later (`winget install GitHub.Copilot` or `npm i -g @github/copilot`; it's also what `gh copilot` runs). It needs a Copilot subscription. Sign in by running `copilot` and typing `/login`, or with `gh auth login`.

## What users see

| Concept in Lumen | What it really is |
|---|---|
| **Assistants**: "Requirements Coach", "Project Partner"… | A persona/system prompt appended to the CLI session (`--append-system-prompt`). Can be exported as a Claude Code subagent (`.claude/agents/*.md`) and a Copilot custom agent (`.github/agents/*.agent.md`) with **⋯ → Use in VS Code**. |
| **Quick starts**: "Weekly status report", "Write user stories"… | Reusable prompt templates with a small form (short answer, long answer, pick-one, file). A friendlier version of skills or slash commands. |
| **"What can Lumen do?"**: Just chat / Read my files / Create & edit files | Maps to the CLI's tool allow-list and permission mode. Shell commands are never enabled from the UI. |
| **Project folder** | The CLI's working directory. Attachments are saved to `Attachments/` inside it, and files the AI writes show up as clickable cards. |
| **Response style**: Quickest / Smart & fast / Most capable | `--model haiku / sonnet / opus` |

Other touches: streaming markdown with tables and code highlighting, friendly progress steps ("Reading budget.xlsx…"), auto-titled chats, pin/rename/search, drag-and-drop or paste to attach, light/dark themes, a 3-step welcome, and replies that keep running if the tab is closed.

Pin frequently used files to a chat with **+ Add** above the composer or the pin action in the project folder. Pins persist with the chat and automatically enable matching file skills; missing or out-of-folder files are marked missing and not included in prompts. The project folder also lists files changed in the current chat, linked to the reply. Excel workbook cards can compare an original and an `(updated)` copy, or an in-place Office-tool update against its per-reply snapshot; choose another workbook when no pair is found. Project XML comparisons show task-field changes. Comparisons are limited to 500 changes.

Use **Repeat…** in a quick start to schedule a daily, weekly, or monthly check. Schedules run only while Lumen is running; on startup, missed checks run once and are marked late. Times use the computer's local time; monthly dates absent from a month are skipped. Manage schedules and open results from **Quick starts › Scheduled**. Checks use the quick start's file access, and those that save files require explicit permission. Missing source files are reported on the schedule.

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

The home screen offers **PM demo**. It copies the **Contoso CRM Migration** pack from [demo/](demo/) into your project folder and switches to it. The pack contains a 42-task Microsoft Project plan (baseline, progress, 8 resources, a 10-day slip, a late task and an over-allocated developer), plus a budget tracker, RAID log, timesheets and a weekly progress update in Excel. Regenerate it with:

```bash
node scripts/make-demo.js
```

The demo folder also gets VS Code and CLI files, so the same assistants, skills and tools work in Claude Code (`.claude/agents`, `.claude/skills`, `.mcp.json`) and GitHub Copilot (`.github/agents`, `.github/skills`, `.vscode/mcp.json`). The same files are written for any assistant through **⋯ › Use in VS Code**.

## Delivery lifecycle (AIDLC): requirements → design → stories, with traceability

These assistants follow the staged flow from the *Functional Design walk-through* (3 Nov 2026). Business requirements are refined, then turned into functional design, then technical design, then delivery stories. Traceability runs across every stage, and everything is grounded in a shared knowledge layer of program documents. **Epics, features and stories are kept separate from requirements.** A story implements design elements, and those design elements realise requirements.

| Assistant | Stage | Produces |
|---|---|---|
| 🔬 **Requirements Refiner** | Business requirements refinement | Atomic, testable requirements (`BR-###.#`) with acceptance criteria, sources, ambiguities and conflicts |
| 🧩 **Functional Designer** | Functional design | Design elements (`FD-###`): behaviour, screens, rules, data, each traced to requirements |
| 🛠️ **Technical Designer** | Technical design | Technical elements (`TD-###`): components, integrations, data changes, NFRs, traced to FD |
| ✍️ **Story Writer** | Story writing | Epics, features and stories that *implement* FD/TD IDs, with Given/When/Then criteria |
| 🔗 **Traceability Analyst** | Across all stages | Coverage, gaps, broken links, stories that skip design, and change impact. It proposes fixes and doesn't apply them silently |

| Skill | What it adds |
|---|---|
| 🧬 **AI-assisted delivery lifecycle** | The shared layer model, ID conventions, hand-off contracts, approval gates and table layouts, so every stage's output lines up |
| 📚 **Program knowledge layer** | Grounding in the PID/scope, BRDs, Solution Blueprint, Ways of Working and data models. It cites sources, applies source precedence and flags conflicts. New tool: `read_document` (Word .docx and text, no Word needed) |
| 🔗 **Requirements traceability** | New tool: `analyze_traceability`. It reads a TRM/RTM workbook laid out either as one sheet per layer with "Traces To" columns or as a single trace-matrix sheet, and reports coverage, gaps, broken links, duplicate IDs, design bypass, withdrawn items still linked, and the downstream impact of changed requirements, with Sheet!Cell references. It's read-only. Changes go into a "(proposed)" copy for human approval |

**Quick starts** (category *Delivery lifecycle*): Inventory the program knowledge, Refine business requirements, Draft the functional design, Draft the technical design, Write the backlog from the design, Traceability check, and Impact of a requirement change.

**Guided lifecycle runs:** Select **Lifecycle runs**, create a named run, and choose source files from the current project folder. Each stage has its own edit-enabled chat and writes Markdown under `Lifecycle/<run name>/`. Review the output and optionally run a read-only advisory traceability check before approving it. Set your name in Settings to approve; the output records your name and time. The next stage requires approval or an explicit override, which labels downstream outputs as based on unapproved inputs. Sending an earlier stage back invalidates later approvals; revisit those stages before approving them again. If a run is interrupted, open the stage chat or run the stage again.

**AIDLC sample:** the home screen's **AIDLC sample** button installs [samples/aidlc/](samples/aidlc/). It's a synthetic "Online Permit Renewal" program with a PID and a BRD (Word), a Solution Blueprint, Ways of Working, a data model and a five-layer traceability workbook. As the meeting suggested, it is generated sample data for local development, and it deliberately includes one-to-many links, a changed requirement, a withdrawn requirement, a scope conflict between the BRD and the PID, ambiguity, a broken link, a duplicate ID and a story that skips design. Regenerate it with `node scripts/make-aidlc-sample.js`. The workbook layout is a placeholder: change it to the program's real TRM Excel structure once that's agreed (the tool recognises sheets and columns by name).

Still open from the meeting, and worth settling before production use: the authoritative requirement source and ID scheme, the traceability system of record (TRM workbook, Azure DevOps or both), whether the traceability agent may write links or only report them (it only reports today), the approval gates between stages, and the program's real Excel structure.

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
lib/cli-bin.js       Finds an engine's CLI and launches it without a shell (safe for long prompts on Windows)
providers/           Pluggable AI engines (claude-cli, copilot-cli)
skills/              Skills (SKILL.md) assistants can switch on
tools/               Office tools: Excel, MS Project, Word documents, traceability analysis, and the MCP server
demo/                Contoso CRM Migration demo pack (generated by scripts/make-demo.js)
samples/aidlc/       Online Permit Renewal AIDLC sample (generated by scripts/make-aidlc-sample.js)
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
