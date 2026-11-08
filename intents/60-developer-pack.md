# 60 — Use the developer skill pack (PR descriptions, standards)

## Intent
As a developer, I want a test-first workflow, the program's coding standards, branch naming and a pull request template
that traces my change to the story and the design, so that every PR a reviewer opens carries the same traceability and
checks.

## Where
- Agent **Developer Copilot** 👩‍💻 (skills `dev-pack`, `program-knowledge`, `azure-devops`).
- Prompt **Write a PR description** (category **Engineering**).
- Mostly used from VS Code / Claude Code: **Agents › Engineering packs** writes this agent with the test automation and
  pipeline packs into a code repository (see [21](21-use-in-vscode.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| **Story** (e.g. `AB#1234 Reject photos older than 6 months`) | The Azure DevOps story the change delivers. |
| **Technical design** (.md/.docx) | The TDD whose `TD-###` sections the story implements. |
| **What changed** (optional) | The change summary; if blank the agent asks. |
| Chat starters | "Plan the tests for this story before I code", "Write the PR description for my change", "What should I check before asking for review?", "Which branch name should I use for AB#1234?" |

## Behaviour (as implemented)
- No dedicated tool. The skill's read tools are `list_office_files`, `read_document`, `read_spreadsheet`, and its write
  tool is `save_draft_document`.
- The `azure-devops` skill adds work item reading when a connection is set up (see [38](38-search-and-read-ado.md)).
- **Reference files** ship with the skill and are named, with their full paths, in the chat prompt:
  - `references/coding-standards.md`: naming, structure, error handling, logging, security, tests.
  - `references/pr-template.md`.
  - `references/branch-naming.md`: `feature/AB<id>-…`, `bugfix/…`, `hotfix/…`, `release/<version>`; commits under 72
    characters, imperative, mentioning `AB#<id>`.
- **Workflow** the skill and agent apply:
  - Read the story (`AB#id`) and its acceptance criteria, and the `TD-###` section it implements. Never guess an
    acceptance criterion; ask.
  - Write unit tests first, at least one per criterion, named after the behaviour, carrying the AB# and TD- IDs, and
    confirm they fail.
  - Code to the standards with the smallest change, with no secrets in code or config.
  - Branch and commit by the naming rules.
  - Write the PR from the template.
- **PR description**: what and why; traceability (`AB#id`, `TD-###`, BR/FD IDs); acceptance criteria → tests; how it was
  verified; risks and rollback; the checklist.
  - The prompt saves it with `save_draft_document` as `Pull requests/<story> - PR description.md` (needs **Create & edit
    files**).
  - It then lists what a reviewer will ask that wasn't given (tests for a criterion, config changes per environment,
    differences from the TDD).
- **Before review**: tests pass with no new warnings, every criterion maps to a test, no secrets, personal data or debug
  code, the PR links the story and design sections, and any difference from the TDD is raised with the designer.
- The coding standards are a starting point the program replaces or extends; headings must stay so agents can find them.

## Outputs
- A test plan per acceptance criterion, a branch name, and `Pull requests/<story> - PR description.md`.

## Acceptance criteria
- The `dev-pack` skill ships at least two reference files, its body points to each, and its tools exist. The Developer
  Copilot agent uses known skills, the **Write a PR description** prompt is wired to it with every field used, and the
  chat prompt names `references/coding-standards.md` with its path (`test/drift.test.js` › engineering agents, prompts,
  skills and labels are wired up).
- The VS Code kit copies the reference files next to `SKILL.md` and points the agents to them, and the Engineering packs
  bundle names the three agents (`test/copilot-export.test.js` › VS Code kit copies skill reference files next to
  SKILL.md and points the agents to them, › the engineering packs bundle names three shipped agents and explains how to
  load them).
- With the real engine: `e2e/real-engine-plans-2.spec.js` › Engineering: the PR description traces the story and is
  saved under Pull requests.

## Limits
- Lumen does not run the developer's tests or build; the checklist is guidance.
- Loading the exported packs in VS Code Copilot and Claude Code was not checked by hand.
- The standards and templates are generic until the program edits them.

## Source
- `skills/dev-pack/SKILL.md`, `skills/dev-pack/references/coding-standards.md`, `references/pr-template.md`,
  `references/branch-naming.md`.
- `lib/skills.js` (`promptFor`, reference files); `lib/copilot-export.js` (`ENGINEERING_PACKS`, `ENGINEERING_README`,
  `vsCodeKitFiles`).
- `server.js` (`POST /api/assistants/export-engineering`).
- `defaults/assistants.json` (agent **Developer Copilot**); `defaults/recipes.json` (prompt **Write a PR description**).
