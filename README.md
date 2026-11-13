# ✨ Lumen

A friendly AI workspace that runs on your own computer. It's built for business analysts, project managers and anyone else who'd rather chat than configure.

Lumen is meant as a bridge to **Microsoft 365 Copilot**. It uses Copilot's words, layout and habits (agents, ready-made prompts, notebooks, `/` to reference a file), so moving over later feels familiar. Your agents and prompts export straight into Copilot. See [Moving to Microsoft 365 Copilot](#moving-to-microsoft-365-copilot).

Lumen sits on top of the AI command-line tools your organization already deploys (Claude Code or the GitHub Copilot CLI), so there are no API keys to manage and no new accounts to create.

see: https://youtu.be/6uLWQEaM1PM

### Why "Lumen"?

A *lumen* is the unit of light, the measure of how much useful light a source gives off. That fits what the app is for: it shines light on the documents, plans and backlogs you already have, so you can see what's in them without learning new tools. The name is also short, easy to say, and doesn't sound like jargon, which suits an app built for business users rather than developers. It sits comfortably beside "Copilot" without copying it, and the ✨ icon nods to the same idea.

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
| **Agents**: "Requirements Coach", "Project Partner"… | A persona/system prompt appended to the CLI session (`--append-system-prompt`). Can be exported as a Claude Code subagent (`.claude/agents/*.md`) and a Copilot custom agent (`.github/agents/*.agent.md`) with **⋯ → Use in VS Code**, or as a Microsoft 365 Copilot declarative agent with **⋯ → Export to Microsoft 365 Copilot**. Pin favourites to the sidebar with **⋯ → Pin to sidebar**. |
| **Prompts** (Prompt Lab) and topic tabs under the message box | One-line prompts you click, adjust and send (`defaults/prompts.json`). Tab moves between the [blanks]. Open the Prompt Lab from **Prompts** in the left rail, **…** after the topic tabs, or **+ › Use a prompt**. Save your own from any chat with **Save prompt**. |
| **Guided tasks** (**Tasks** in the left rail): "Weekly executive status", "Write user stories"… | Reusable prompt templates with a small form (short answer, long answer, pick-one, file) that produce a finished deliverable (`defaults/recipes.json`). A friendlier version of skills or slash commands. Every guided task also appears in the Prompt Lab. |
| **"What can Lumen do?"**: Just chat / Read my files / Create & edit files | Maps to the CLI's tool allow-list and permission mode. Shell commands are never enabled from the UI. |
| **Notebook** (project folder) | The CLI's working directory. Type `/` in the message box (or use **+ › Reference a file in your notebook**) to attach a file from it. Uploads are saved to `Attachments/` inside it, and files the AI writes show up as clickable cards. New installs default to `OneDrive\Lumen` when OneDrive is set up. |
| **Response mode**: Auto / Quick response / Balanced / Think deeper (Claude); Default / Auto (GitHub Copilot) | Claude: no `--model` flag for Auto, otherwise `--model haiku / sonnet / opus`. Copilot: no flag for Default, `--model auto` for Auto |

Other touches: streaming markdown with tables and code highlighting, friendly progress steps ("Reading budget.xlsx…"), auto-titled chats, pin/rename/search, drag-and-drop or paste to attach, light/dark themes, a 3-step welcome, keyboard shortcuts, and replies that keep running if the tab is closed. Under a reply you can **Retry** it, continue from it in a new chat (**Branch**), or **Export** it to Word, Excel (its tables), PowerPoint or Markdown in the notebook; your own messages can be edited and resent. The **Insights** page in the left rail shows which agents and prompts are working, from chat counts, reply times and 👍/👎 feedback, all computed from chats on this computer.

**Ask Lumen about itself.** In any chat, ask things like "which agent handles RAID logs?" or "what runs every week?". The always-on **Ask about Lumen** skill answers from Lumen's own agents, prompts, guided tasks, workflows, schedules and skills through a small read-only tool server, [tools/lumen-mcp.js](tools/lumen-mcp.js).

Pin frequently used files to a chat with **+ Add** above the composer or the pin action in the notebook. Pins persist with the chat and automatically enable matching file skills; missing or out-of-folder files are marked missing and not included in prompts. The project folder also lists files changed in the current chat, linked to the reply. Excel workbook cards can compare an original and an `(updated)` copy, or an in-place Office-tool update against its per-reply snapshot; choose another workbook when no pair is found. Project XML comparisons show task-field changes. Comparisons are limited to 500 changes.

Use **Repeat…** on a guided task (opened from **Tasks**, not from inside a chat) to schedule a daily, weekly, or monthly run, or one every few minutes between two times (for a cutover weekend). Schedules run only while Lumen is running; on startup, missed checks run once and are marked late. Times use the computer's local time; monthly dates absent from a month are skipped. Pause, resume, run now and open the last result from the **Scheduled** tab on the **Tasks** page. Scheduled runs use the prompt's file access, and those that save files require explicit permission. Missing source files are reported on the schedule.

## Project managers: Microsoft Project + Excel

Lumen ships 20 **skills** that agents can switch on (Agents › Customize › Capabilities); the two below are the project manager's. Skills are marked **Lumen only** because they run on this computer:

| Skill | What the AI can do |
|---|---|
| 📅 **Microsoft Project plans** | Read plans; run a health check (RAG, late tasks, critical path with float, slips vs. baseline, milestones, over-allocated people, cost vs. baseline); update % complete, dates, durations and notes (always saved as an "(updated)" copy); export to an Excel tracker with a weekly variance Gantt (baseline under each bar, slip weeks hatched, status-date line) and a milestone variance sheet that shows week-over-week movement. Lumen keeps a dated copy of the plan in `.lumen/plan-history/` each time a tracker is built or progress is recorded, and compares against it automatically |
| 📗 **Excel workbooks** | Read every sheet with real cell addresses and formulas; create formatted workbooks with live formulas; update cells or append rows without losing formatting |

They're backed by a small local tool server, [tools/office-mcp.js](tools/office-mcp.js), an MCP server that every engine can use. It can only read or write inside the project folder, and its editing tools work only when the chat is set to "Create & edit files": in other modes they're left off the engine's allowed tools and refused if called. Attaching or pinning a file turns on the skill that handles its type automatically: for example `.mpp` or `.xml` (Project), `.xlsx`, `.xlsm` or `.csv` (Excel), `.vtt` (Huddle → RAID), `.docx` (program knowledge), `.sql`, `.yaml` or `.env` (the data, integration and pipeline skills). Each skill's `extensions` front matter sets the list.

**PM agents:** Schedule Analyst 📅, Ask the Plan 🔎, Budget Controller 💰 and Project Partner 📋. **Ask the Plan** answers plain-English questions ("what's late in Testing?", "what does Go-live depend on that hasn't started?", "what changed since last week?") through the `query_plan` tool, which filters the plan in code by workstream, person, status, critical path, milestones, slip, date window, free text in names and notes, dependency chain or change since the last saved version, and returns exact rows. **Weekly executive status** builds a status pack in `Status reports/<status date>/` from the plan and RAID log. It has three files from one status model: `status.json`, a detailed report (Markdown) and a one-page HTML executive dashboard where each milestone opens to the unfinished work it depends on. Facts, the RAG rating and its rule-based reasons are calculated in code, and every fact cites its source (plan task or RAID `Sheet!Cell`). The AI writes only the summary and decisions needed, which are labelled AI-written; if the summary names a different rating, the pack flags it. The pack reads the newest approved RAID log, so changes you approved from the huddle (`<RAID log> (updated).xlsx`) are included automatically. A `(proposed)` review copy is never read as fact, and the pack says how many huddle changes are still waiting for review. Packs are saved as Drafts for PMO review.

**Huddle → RAID log** turns a meeting transcript (Teams `.vtt`, a transcript saved as Word, or text) into proposed RAID updates: new risks, issues, actions, decisions and dependencies, plus updates and closures to existing items. Every proposal must quote the transcript word for word, and proposals whose quote can't be found are rejected. Lumen writes `<RAID log> (proposed).xlsx` with the changes highlighted and a **Proposed changes** sheet (evidence, speaker, time, an **Approve? (Yes/No)** column), then flags meeting gaps such as actions with no owner. After you mark every row and save, ask Lumen to apply them: only approved changes go into `<RAID log> (updated).xlsx`, and the original is never touched. The PM demo includes a sample 10:30 huddle transcript.

**PM guided tasks:** Project health check, Status report from my files, Weekly executive status, Huddle → RAID log, Update plan from progress sheet, Update plan from ADO backlog, Monthly plan change log, Weekly look-ahead, Delivery scenarios, Plan → Excel tracker, Who's overloaded?, Budget variance review, Timesheets vs. plan, and RAID log review. File questions pre-select the best-matching file from the project folder.

**About .mpp files:** `.mpp` is Microsoft's closed binary format, and only Microsoft Project can read or write it. Lumen works with **Project XML** (File › Save As › XML in Project), which Project opens natively. On computers with Microsoft Project installed, Lumen converts `.mpp` to and from XML automatically through Project itself. That path hasn't been tested yet, because this build machine doesn't have Project.

### The demo

The **Samples** page (bottom of the left rail) offers **PM demo**, **AIDLC sample**, **Data sample**, **Security sample** and **Change sample**. Each copies its pack into a new subfolder of your project folder (for example *Contoso CRM Migration (demo)* from [demo/](demo/)), never replacing a file that is already there, and switches to it. Installing another pack while you're in one puts it beside that one, and **Leave sample** takes you back to your previous project folder. Each pack starts with a suggested agent and offers a few quick-start prompts.

The PM demo contains a 42-task Microsoft Project plan (baseline, progress, 8 resources, a 10-day slip, a late task and an over-allocated developer), plus Excel workbooks for the budget, RAID log, timesheets, a weekly progress update, an Azure DevOps backlog export, team capacity, a release readiness checklist (with an `Evidence/` folder, one item missing on purpose), a cutover run-sheet and hypercare defects, a 10:30 huddle transcript, and a `START HERE.md`. Regenerate it with:

```bash
node scripts/make-demo.js
```

The other packs come from [samples/](samples/) and are regenerated by the matching `scripts/make-*-sample.js`. Each pack folder also gets VS Code and CLI files for that pack's agents, so the same agents, skills and tools work in Claude Code (`.claude/agents`, `.claude/skills`, `.mcp.json`) and GitHub Copilot (`.github/agents`, `.github/skills`, `.vscode/mcp.json`). The same files are written for any assistant through **⋯ › Use in VS Code**.

## Delivery lifecycle (AIDLC): requirements → design → stories, with traceability

These agents follow the staged flow from the *Functional Design walk-through* (3 Nov 2026). Business requirements are refined, then turned into functional design, then technical design, then delivery stories. Traceability runs across every stage, and everything is grounded in a shared knowledge layer of program documents. **Epics, features and stories are kept separate from requirements.** A story implements design elements, and those design elements realise requirements.

| Agent | Stage | Produces |
|---|---|---|
| 🔬 **Requirements Refiner** | Business requirements refinement | Atomic, testable requirements (`BR-###.#`) with acceptance criteria, sources, ambiguities and conflicts |
| 🧩 **Functional Designer** | Functional design | Design elements (`FD-###`): behaviour, screens, rules, data, each traced to requirements |
| 🛠️ **Technical Designer** | Technical design | Technical elements (`TD-###`): components, integrations, data changes, NFRs, traced to FD |
| ✍️ **Story Writer** | Story writing | Epics, features and stories that *implement* FD/TD IDs, with Given/When/Then criteria |
| 🧪 **Test Designer** | Test cases (optional) | SIT/UAT test cases from acceptance criteria, with coverage gaps |
| 🔗 **Traceability Analyst** | Across all stages | Coverage, gaps, broken links, stories that skip design, and change impact. It proposes fixes and doesn't apply them silently |

| Skill | What it adds |
|---|---|
| 🧬 **AI-assisted delivery lifecycle** | The shared layer model, ID conventions, hand-off contracts, approval gates and table layouts, so every stage's output lines up |
| 📚 **Program knowledge layer** | Grounding in the PID/scope, BRDs, Solution Blueprint, Ways of Working and data models. It cites sources, applies source precedence and flags conflicts. New tool: `read_document` (Word .docx and text, no Word needed) |
| 🔗 **Requirements traceability** | New tool: `analyze_traceability`. It reads a TRM/RTM workbook laid out either as one sheet per layer with "Traces To" columns or as a single trace-matrix sheet, and reports coverage, gaps, broken links, duplicate IDs, design bypass, withdrawn items still linked, and the downstream impact of changed requirements, with Sheet!Cell references. It's read-only. Changes go into a "(proposed)" copy for human approval |

**Guided tasks** (category *Delivery lifecycle*): Inventory the program knowledge, Knowledge freshness, Refine business requirements, Draft the functional design, Draft the technical design, Write the backlog from the design, Traceability check, and Impact of a requirement change.

**Guided lifecycle runs** (Lumen only)**:** Select **Lifecycle** in the left rail to see the saved **workflows**. The built-in *Requirements to stories* workflow has five stages: Refine requirements → Functional design → Technical design → Stories → Test cases (optional). Click **Start**, name the run and choose source files from the current project folder. The run keeps its own copy of the workflow, so later edits don't change it. Each stage has its own edit-enabled chat and writes Markdown under `Lifecycle/<run name>/`; a flow diagram shows every stage coloured by status. Review the output and optionally run a read-only advisory traceability check before approving it. Set your name in Settings to approve; the output records your name and time.

A stage waits for the stages it starts after (by default the one above it). Several stages can start after the same one and run side by side, and a stage can wait for several (fan-in); **Start all ready stages** starts every stage whose inputs are approved. Starting before inputs are approved needs an explicit override, which labels downstream outputs as based on unapproved inputs. Optional stages can be skipped or added back. Sending a stage back sends only the started stages that depend on it to rework; stages on other branches keep their approvals. Approved stages can be saved as Word in the program's template or published to Azure DevOps (see below). If a run is interrupted, open the stage chat or run the stage again.

**Create workflow**, **Customize** and **Duplicate** open a workflow editor: stage order, agent, instructions, output file, optional Word template, whether the stage is optional, which stages it starts after, and the traceability-check agent, with a live flow preview. Built-in workflows can be customized or duplicated but not deleted.

**AIDLC sample:** the **Samples** page installs [samples/aidlc/](samples/aidlc/). It's a synthetic "Online Permit Renewal" program with a PID and a BRD (Word), a Solution Blueprint, Ways of Working, a data model and a five-layer traceability workbook. As the meeting suggested, it is generated sample data for local development, and it deliberately includes one-to-many links, a changed requirement, a withdrawn requirement, a scope conflict between the BRD and the PID, ambiguity, a broken link, a duplicate ID and a story that skips design. Regenerate it with `node scripts/make-aidlc-sample.js`. The workbook layout is a placeholder: change it to the program's real TRM Excel structure once that's agreed (the tool recognises sheets and columns by name).

Still open from the meeting, and worth settling before production use: the authoritative requirement source and ID scheme, the traceability system of record (TRM workbook, Azure DevOps or both), whether the traceability agent may write links or only report them (it only reports today), the approval gates between stages, and the program's real Excel structure.

## Moving to Microsoft 365 Copilot

Lumen is a stepping stone. People who learn it now should feel at home in Microsoft 365 Copilot later.

| Lumen | Microsoft 365 Copilot |
|---|---|
| Left rail: Chat, Agents, Prompts, Tasks, Notebook (plus Lumen-only Lifecycle, Insights and Samples) | Chat, Agents, Prompts, Notebooks |
| Agents (name, description, instructions, starter prompts) | Agents, built in Agent Builder with the same fields |
| Prompts (Prompt Lab), guided tasks, **Save prompt**, scheduled prompts | Prompt Lab, Save prompt, scheduled prompts (guided tasks export as prompts with [blanks]) |
| `/` or **+ › Reference a file in your notebook** | `/` to reference a file |
| Response mode: Auto / Quick response / Balanced / Think deeper (Claude) | Copilot's response modes (labels vary by tenant) |
| Reply footer: Copy, 👍/👎, Export, "AI-generated content may be incorrect" | Same pattern |

**Take your work with you.**
- **Agents › ⋯ › Export to Microsoft 365 Copilot** (or **Export all to Copilot**) writes `Microsoft 365 Copilot/Agents/<name>/` into your notebook. It contains:
  - `Copy into Agent Builder.txt`: paste-ready fields for *Agents › Create agent › Configure*. No IT help needed.
  - `<name> (Teams app).zip`: a declarative agent app package (`manifest.json` v1.19, `declarativeAgent.json` v1.3 and icons). Your admin fills in the developer details, validates it with the Microsoft 365 Agents Toolkit and publishes it.
- **Export to Copilot** on the **Prompts** or **Tasks** page writes `Microsoft 365 Copilot/Prompts.md`, with every quick prompt and guided task as plain text and guided-task questions as `[blanks]`. Each guided task's dialog also has **Copy for Copilot**.
- Keep your notebook in **OneDrive** so Copilot can find the same files. The Notebook panel warns you when it isn't.

**What stays different.** Lumen keeps its own name and logo, and every message box says *"You're in Lumen, powered by Claude/GitHub Copilot. This isn't Microsoft 365 Copilot."* That way nobody pastes in something they'd only trust to Copilot's data protections. Anything that won't carry over is marked **Lumen only**: the document skills, lifecycle runs, before/after file comparisons, and prompts that save files or read Microsoft Project plans.

## SharePoint and Microsoft 365 (WorkIQ)

Lumen reaches SharePoint two ways. Files in a notebook kept in **OneDrive** sync to your computer and are read like any other file. For documents you haven't synced (plus email, meetings and Teams), switch on **Settings › Connections › SharePoint & Microsoft 365**. Its skill is included automatically for every agent in new and existing chats; allow file-read access and use an attended chat. No separate skill selection is needed. **GitHub Copilot uses its existing [managed Work IQ connector](https://docs.github.com/en/copilot/concepts/customizations/copilot-connectors)**, the same `workiqmcp` integration available in the Copilot app. Lumen explicitly supplies GitHub's connector endpoint to its engine process and uses the engine's signed-in GitHub authentication, without copying credentials. Update Copilot if Lumen reports that this authentication option is unavailable. On Windows, **Open Work IQ connector** opens the engine dashboard: select the **Connectors** view, then **Work IQ**, not a similarly named user server or plugin. Lumen adds no duplicate `m365` server or separate Work IQ CLI sign-in to Copilot. **Claude's standalone `m365` connection is different** and requires its own Work IQ CLI consent; a connected Copilot connector does not grant that consent. Credentials and organisational policies remain engine-owned. Return to Lumen and send a Microsoft 365 question to update reported connection/tool status. Lumen instructs the engine not to use Microsoft 365 when it is off or the request is unattended; native managed connectors may still appear in the engine inventory. Read-only use is instructed, not enforced by a Microsoft 365 write-permission boundary. Details: [intents/70-sharepoint-workiq.md](intents/70-sharepoint-workiq.md).

### Search results and troubleshooting

- **"What is the last document I updated in SharePoint?"** uses the connector's supported, read-only search. Lumen checks the editor, modification date and source link. Give a site or library name for a narrower search.
- SharePoint sites and personal OneDrive are separate search scopes. Lumen should not substitute a personal OneDrive result or a generated code/build file for a business document in SharePoint.
- Results come from the search index, not a complete editing history. "Latest" means the latest verified match in the searched scope; no matches do not prove that you never edited a document.
- **Access not enabled:** check that the Microsoft 365 connection is on and the chat allows **Read my files** or **Create & edit files**. No agent skill change is needed. Scheduled prompts cannot use this connection.
- **An operation was refused:** an error such as `Access denied for GET path: /me/drive/recent` is not, by itself, a sign-in failure. Lumen must not guess unsupported paths or retry through another identity. Reconnect only when the actual error calls for sign-in.
- **Connected / tools discovered:** these confirm connection setup, not access to a particular document. **Refresh status** shows the last status reported by a chat, not a fresh document search.

## Azure DevOps: work items and wiki

Connect a project in **Settings › Connections › Azure DevOps**. Paste the organisation address (`https://dev.azure.com/<org>`), choose how Lumen signs in, click **Check connection**, then pick the project, team and wikis. Lumen signs in with the **Azure CLI** if you've run `az login`, or (on Windows only) with a **personal access token** (Work Items and Wiki, Read & write). The token is stored encrypted for your Windows account (DPAPI) under `data/secrets/`, never in settings, and never passed to the AI. Lumen works with Azure DevOps in the cloud only (`dev.azure.com`; older `<org>.visualstudio.com` addresses are converted), not on-premises Azure DevOps Server.

The **🔷 Azure DevOps** skill lets an agent search and read work items (full-text search, sprints, tags, links, comments, history) and wiki pages. It can also **propose** changes: new work items, field and tag changes, links, comments, and new or updated wiki pages. **A proposal never changes Azure DevOps.** It shows up as an **Approve card** in the chat with a table of exactly what will change (and a diff for wiki pages). Nothing is written until you click **Apply**. Apply checks that nobody changed the item or page in the meantime, records your name in Azure DevOps, and writes to a local audit log (`data/ado-audit.jsonl`). The next reply tells the AI whether you applied or discarded it. Lumen has no delete tools. Proposals need "Create & edit files", expire after 24 hours, and are never offered in scheduled checks.

- **Agents:** Backlog Helper 🔷, plus Story Writer, Traceability Analyst, Project Partner, Defect Triage and Developer Copilot.
- **Guided tasks** (category *Azure DevOps*): My open work items, Sprint status summary, Find it in the wiki, Stories from the design → Azure DevOps, Publish a document to the wiki, Stale items check, Release notes from closed items, and Traceability against Azure DevOps.
- **Traceability:** lifecycle IDs go in **tags** (`FD-012`). `ado_export_backlog` copies the TRM workbook with its backlog sheets replaced by the live backlog, so `analyze_traceability` checks requirements and design against what is really in Azure DevOps.
- **Lifecycle runs:** every approved stage except Stories offers **Publish to the Azure DevOps wiki**, and the approved story stage offers **Create work items in Azure DevOps**. Each opens a chat that ends in Approve cards.

The tools come from [tools/ado-mcp.js](tools/ado-mcp.js), with its code in [tools/ado/](tools/ado/). **Use in VS Code** exports it read-only, because there are no Approve cards outside Lumen. If you already ran Lumen before this feature, the built-in agents keep their old skills: use **Settings › Advanced › Restore defaults**, or switch the skill on in the agent's Customize screen.

## Making agents without writing prompts

On **Agents → Create agent**, describe the helper in one sentence ("Helps me write UAT scripts for our HR rollout") and click **Draft it**. Lumen asks the engine to propose a name, icon, tagline, instructions, up to three example requests and the skills to switch on, which you can tweak before saving.

The Agents page also has **Engineering packs**, which saves the developer, test automation and pipeline packs into a code repository for VS Code.

## More agents

Beyond project management and the delivery lifecycle, the built-in agents cover:

- **Testing:** Test Designer 🧪 and Test Planner 🗺️ (test cases, coverage gaps, test strategy), Defect Triage 🐞, and Test Automation Copilot 🤖 (Playwright specs).
- **Data and integration:** Data Profiler 📊, Mapping Analyst 🔀 and Data Engineer 🧱 (source-to-target mapping, then code for approved rows), schema comparison, Interface Designer 🔌 (ICDs) and API Designer 🧾 (OpenAPI review, mocks and stubs).
- **Security:** Security Control Mapper 🛡️, Security Documentation 📘 and CAE Evidence 🗂️.
- **Change and training:** Change Impact Analyst 🔄, Training Content 🎓 and Bilingual Reviewer 🍁 (EN/FR glossary).
- **Release:** Release Readiness 🚦, Cutover Coordinator ⏱️, Runbook Writer 📗, Hypercare Analyst 📉, and Pipeline & Environment Readiness 🔧.
- **Architecture and governance:** Architecture Reviewer 🏛️, ADR & Reuse Advisor 🧭, Gate Pack Assembler 📦, Inventory Keeper 🗃️, and knowledge publishing.
- **Developers:** Developer Copilot 👩‍💻 (test-first workflow, PR descriptions with traceability).

Each capability is documented as implemented in [intents/](intents/README.md).

## Pluggable engines

See [providers/README.md](providers/README.md). Each engine is one file that turns a CLI's output into a small event stream (`session`, `text`, `tool`, `tool_done`, `file`, `approval`, `usage`, `connection`, `error`). Drop a new file in `providers/` and it appears in **Settings → AI engine**.

## Where things live

- `data/` holds settings, agents, quick prompts, guided tasks, workflows, lifecycle runs, schedules and chat history (plain JSON; delete the folder to reset), plus the encrypted Azure DevOps token (`secrets/`) and its audit log. Override the location with `LUMEN_DATA`.
- `agents/` holds the built-in agents, one file each (`agents/<id>.json`; `order` sets their position). `defaults/` holds guided tasks (`recipes.json`), quick prompts (`prompts.json`) and workflows (`pipelines.json`). They're copied in on first run, and built-ins added in later versions are merged into existing installs unless you deleted them. Edit these to ship your own organization-wide set.
- `PORT` changes the port (default `4317`). The server only listens on `127.0.0.1`.
- `CLAUDE_CLI_PATH` / `COPILOT_CLI_PATH` / `AZ_CLI_PATH` point at a specific CLI binary if it isn't on the usual path.

## Project layout

```
server.js            HTTP shell: static files, security headers, API route list
lib/server/          Chat turns, lifecycle runs, exports, folders; routes/ has one file per API area
public/js/           Browser UI as ES modules (main.js is the entry point)
lib/store.js         JSON file storage
lib/cli-bin.js       Finds an engine's CLI and launches it without a shell (safe for long prompts on Windows)
lib/skills.js        Active skills and the tool allow-list for each access level
lib/scheduler.js     Scheduled guided tasks
lib/copilot-export.js  Microsoft 365 Copilot and VS Code exports
lib/workiq.js        SharePoint & Microsoft 365 (Work IQ) connection
lib/secrets.js       Encrypted storage for the Azure DevOps access token (Windows DPAPI)
providers/           Pluggable AI engines (claude-cli, copilot-cli) and the film recorder
skills/              Skills (SKILL.md) agents can switch on
tools/               Document, plan, data, release and governance tools behind tools/office-mcp.js
tools/ado-mcp.js     Azure DevOps tool server (read + propose); tools/ado/ has the client, sign-in and change sets
tools/lumen-mcp.js   Read-only tool server for questions about Lumen itself
demo/                Contoso CRM Migration demo pack (generated by scripts/make-demo.js)
samples/             AIDLC, data, security and change sample packs (generated by scripts/make-*-sample.js)
agents/              Built-in agents, one file each
defaults/            Quick prompts, guided tasks and workflows
intents/             Each user-facing capability, documented as implemented
public/              The UI (vanilla HTML/CSS/JS, no build step)
e2e/                 Playwright browser tests
film/                Explainer and how-to video pipeline
Start Lumen.cmd      Double-click launcher for Windows
```

## Dev container

`.devcontainer/` opens the project in a Linux container from VS Code (**Dev Containers: Reopen in Container**). It has Node 24, Claude Code, GitHub Copilot CLI and Microsoft Edge (for the Playwright tests; x64 hosts only), and runs `npm ci` on first start. Run `claude` or `copilot` once in the container terminal to sign in; sign-ins, `node_modules` and Lumen's data (`LUMEN_DATA=/home/node/lumen-data`) are kept in Docker volumes, so the host's `data/` folder is not used. Port 4317 is forwarded to <http://localhost:4317>.

Windows-only features don't work in the container: saving the Azure DevOps token (it uses Windows DPAPI) and the Microsoft 365 sign-in window.

## Tests

`node --test test/*.test.js` runs the unit and tool tests.

`npm run test:e2e` runs browser tests ([Playwright](https://playwright.dev), using the Microsoft Edge already installed) against a throw-away copy of Lumen on 127.0.0.1:4391. It uses a stand-in engine that calls the real plan tools but has no AI, so it checks the screens, file pickers and tool results, not the wording of a real reply. Data goes to a temporary folder, and screenshots are saved in `e2e/screenshots/`. Set `E2E_ENGINE=claude` or `E2E_ENGINE=copilot` to also run the opt-in real-engine tests (slow, and they use the real CLI).

## The explainer video

[film/make_video.py](film/make_video.py) films a narrated demo of the real app with three personas: Marcus, a business analyst (the agent picker and quick prompts, user stories, reply actions, Save as Word, searching agents and building one); Priya, a project manager starting from the Samples page with the Microsoft Project plan and Excel workbooks (health check, a weekly task, See changes, Gantt tracker); and Dana, a delivery lead (traceability check, reshaping the workflow so the design stages run side by side, and a guided lifecycle run with an approval gate). It closes with Insights, Ask about Lumen, engines and connections (Azure DevOps, SharePoint & Microsoft 365), and exports. It drives Lumen in Microsoft Edge the way a person would. A cursor moves and clicks, the camera zooms in on what matters, and text is typed key by key. The narration is read by **Kokoro** (`af_heart`), running locally the same way as in IRISIdeas, over click and keyboard sounds and a soft generated music bed.

```bash
.venv/Scripts/python.exe film/make_video.py --record
```

```bash
.venv/Scripts/python.exe film/make_video.py
```

1. `--record` starts from the v2 recording (`film/recordings/v2/`), replays every request that is unchanged, sends only new ones to the real AI engine, and saves the result to `film/recordings/v3/`.
2. Without flags, the script films the app while Lumen **replays** that recording at a brisk pace (`providers/recorder.js`, active only when `LUMEN_REPLAY` is set). Every answer on screen is a genuine AI answer, without the waiting.
3. The output is `film/out/lumen-explainer-v3.mp4` (1080p, 30 fps, about −14 LUFS), plus captions (`.srt`) and a thumbnail. Any stretch where the screen froze for more than 3 seconds without narration is trimmed in the edit.

If a recording pass fails partway, `--record --resume` replays what was already recorded and only sends the missing requests to the engine. `--refinish` re-runs just the edit and encode from the last film's kept frames (`--keep-frames`).

**How-to video.** [film/make_howto.py](film/make_howto.py) films a step-by-step guide to every feature, opening with Lumen as a GitHub Copilot workspace for plans, spreadsheets and documents (the same Copilot agent the team uses in VS Code Copilot Chat) and covering the Microsoft 365 Copilot alignment. It uses the same pipeline and flags (`--record`, `--resume`, `--refinish`, `--keep-frames`, plus `--voice` and `--stills`) and writes `film/out/lumen-howto-v2.mp4`. Recording goes to `film/recordings/howto-v2/`, starts from the first how-to's recording (`film/recordings/howto/`) and only sends new requests to the engine. Filming replays the answers with GitHub Copilot selected, because in replay mode every engine reports ready. Azure DevOps runs against the offline stand-in in [film/ado-demo.js](film/ado-demo.js) (`ADO_MOCK`), so **Apply** never reaches a real organisation.

Setup: `pip install playwright imageio-ffmpeg kokoro-onnx soundfile numpy` into `.venv`, then copy `kokoro-v1.0.onnx` and `voices-v1.0.bin` into `.venv/kokoro`. Narration lines live in each script (`make_video.py`, `make_howto.py`) and are re-voiced only when they change.
