# 21 — Use agents in VS Code / Claude Code and export engineering packs

## Intent
As a developer or tester, I want the same agents, skills and local tools I use in Lumen available in VS Code (GitHub
Copilot Chat) and Claude Code, and the engineering packs committed to our code repository, so that the whole team
works to the same standards outside Lumen.

## Where
- **Agents › ⋯ › Use in VS Code** ("Save for Claude Code & GitHub Copilot"): one agent, into the current notebook.
- **Agents › Engineering packs**: the three engineering agents, into a code repository folder the user picks.

## Inputs & controls
| Control | Effect |
|---|---|
| **Use in VS Code** | Writes the agent's files; dialog **<name> is ready for VS Code** with the Claude Code and GitHub Copilot file paths, **Open folder**, **Done**. |
| **Engineering packs** | Folder picker **Choose the code repository** (**Save packs here**); dialog **Engineering packs are ready for VS Code**, **Open folder**, **Done**. |

## Behaviour (as implemented)
- `writeVsCodeKit` writes, for each agent (file name = `slug(name)`):
  - `.claude/agents/<slug>.md`: front matter `name`, `description` (tagline), then the instructions, a note to use its
    skills and the "office" MCP tools, and the paths of the skills' reference files.
  - `.github/agents/<slug>.agent.md`: the instructions with each skill's full text appended, plus reference paths.
  - For every skill used: `.claude/skills/<id>/SKILL.md` and `.github/skills/<id>/SKILL.md`, with the skill's reference
    files copied next to it (e.g. `skills/dev-pack/references/`).
  - Only when the agents use any skill: `.mcp.json` and `.vscode/mcp.json`, pointing the `office` server at this
    computer's `tools/office-mcp.js` with the folder as its root.
- The Azure DevOps server is added only when an agent uses `azure-devops` and a connection is set up, and it is
  **read-only** (`ADO_READONLY: '1'`), because there are no Approve cards outside Lumen. No credentials are written
  (PAT or Azure CLI sign-in is resolved at run time).
- **Engineering packs** (`ENGINEERING_PACKS`): **Developer Copilot** 👩‍💻, **Test Automation Copilot** 🤖 and
  **Pipeline & Environment Readiness** 🔧, with their skills (`dev-pack`, `test-automation`, `pipeline-readiness`
  plus `program-knowledge`, `azure-devops`, `test-design`), and `.github/Engineering skill packs.md` (a table of agents,
  skills and file paths; how to load them in GitHub Copilot and Claude Code; the tools `compare_configs`,
  `lint_pipeline`, `generate_playwright_tests`).
- Refused: "Choose the code repository folder first.", "That folder doesn't exist.", and "The engineering agents were
  removed. Restore the built-in agents in Settings first." when all three were deleted.
- Existing files with the same names are replaced.
- Installing a demo or sample pack writes the same kit for its agents (see [04](04-install-demo-and-samples.md)).

## Outputs
- Agent, skill and MCP files in the notebook or repository, ready to open in VS Code or run with `claude`.

## Acceptance criteria
- Skill reference files are copied next to both `SKILL.md` files and the agents point to them
  (`test/copilot-export.test.js` › VS Code kit copies skill reference files next to SKILL.md and points the agents to
  them).
- The packs README names the three shipped agents and how to load them (`test/copilot-export.test.js` › the
  engineering packs bundle names three shipped agents and explains how to load them).
- The engineering agents exist with their skills (`test/drift.test.js` › engineering agents, prompts, skills and
  labels are wired up).
- The exported Azure DevOps server cannot propose changes and holds no credentials.

## Limits
- The MCP files hold an absolute path to this computer's Lumen; other developers must change it to their copy.
- **Use in VS Code** always writes into the current notebook, not a chosen repository.
- Prompts and scheduled prompts are not exported to VS Code.

## Source
`server.js` (`writeVsCodeKit`, `exportAssistant`, `exportEngineeringPacks`, `/api/assistants/:id/export`,
`/api/assistants/export-engineering`), `lib/copilot-export.js` (`vsCodeKitFiles`, `ENGINEERING_PACKS`,
`ENGINEERING_README`, `slug`), `lib/skills.js` (`MCP_SERVER`, `ADO_SERVER`, `adoReady`), `public/app.js`
(`exportAssistant`, `exportEngineeringPacks`, `pickFolder`), `skills/dev-pack/`, `skills/test-automation/`,
`skills/pipeline-readiness/`, `defaults/assistants.json`.
