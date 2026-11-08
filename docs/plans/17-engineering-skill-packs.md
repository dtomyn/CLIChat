# Plan 17: Engineering skill packs

**Use cases:** 35 Test automation (Playwright) skill pack · 36 Developer skill pack · 41 Pipeline and environment readiness / drift
**Size:** medium (two sessions)
**Files:** new `skills/dev-pack/`, `skills/test-automation/`, `skills/pipeline-readiness/` (each a `SKILL.md` plus reference files), new `tools/drift.js`, `lib/copilot-export.js`, `lib/skills.js`, `defaults/assistants.json`, `defaults/recipes.json`, `test/drift.test.js`, `test/copilot-export.test.js`

## Why

These use cases live in developers' IDEs (GitHub Copilot in VS Code), not in Lumen's chat. Lumen's job is to **author and export** consistent skill packs, so every developer gets the same program standards. The **⋯ › Use in VS Code** export (`.github/agents`, `.github/skills`, `.claude/...`) already exists, so this plan adds content plus one small analysis tool.

## Design

### 1. Developer skill pack (UC 36)
`skills/dev-pack/SKILL.md` covers TDD → code workflow: read the ADO story and TDD section, write unit tests first, follow coding standards, write a PR description with traceability (`AB#<id>`, `TD-###`), and what to check before requesting review. References: coding standards, PR template, branch naming. Agent: **Developer Copilot** 👩‍💻 (export target VS Code).

### 2. Test automation pack (UC 35)
`skills/test-automation/SKILL.md` covers Playwright conventions: page objects, test-data factories, tagging by story/test-case ID, evidence capture (screenshots/trace attached to CI), and turning a Plan 09 test-case workbook into specs. Lumen's own `e2e/` is the worked example. Agent: **Test Automation Copilot** 🤖.

### 3. Pipeline and environment readiness (UC 41)
- `tools/drift.js` → `compareConfigs(files)` compares config manifests across environments (YAML/JSON/`.env`-style key=value; Kubernetes/OpenShift manifests exported as YAML). It reports keys missing per environment, values that differ where they're expected to match (per a rules file listing env-specific keys), and image tag/version drift. Secrets-looking values are masked in output.
- `lintPipeline(file)` gives basic Azure Pipelines / GitHub Actions YAML checks: missing stages for required environments, no approval gate before PRD, unpinned task versions.
- MCP tools: `compare_configs` and `lint_pipeline` (read-only). Agent: **Pipeline & Environment Readiness** 🔧, which drafts pipeline/config changes as files for a PR.
- YAML parsing: same rule as Plan 12 (subset parser; ask before adding a package).

### 4. Export
Make sure `lib/copilot-export.js` copies skill reference files, and add a **Engineering packs** bundle export that writes all three packs into a chosen repo folder.

## Acceptance checks
- Exported packs load in VS Code Copilot and Claude Code, checked by hand in a scratch repo.
- `compare_configs` on a sample STE/UAT/PRD set finds the seeded missing key and tag drift, and masks the seeded secret.

## Out of scope
Running pipelines, or connecting to clusters.

## Status: implemented (7 Nov 2026)

Shipped: three skills with reference files (`skills/dev-pack/`, `skills/test-automation/`, `skills/pipeline-readiness/`), the Developer Copilot 👩‍💻, Test Automation Copilot 🤖 and Pipeline & Environment Readiness 🔧 agents, four *Engineering* prompts (Write a PR description, Turn test cases into Playwright tests, Compare environment configs, Check a pipeline), `tools/drift.js` with the read-only MCP tools `compare_configs` and `lint_pipeline`, the **Engineering packs** export, the sample additions and `test/drift.test.js` plus new cases in `test/copilot-export.test.js`.

Deviations from the design:
- **Export code moved.** The "Use in VS Code" files were written by `writeVsCodeKit` in `server.js`, not by `lib/copilot-export.js`. The skill and agent files now come from a pure `vsCodeKitFiles()` in `lib/copilot-export.js` (unit-tested), which copies each skill's reference files next to its `SKILL.md` in `.github/skills` and `.claude/skills` and lists them in the agent files. `server.js` still adds `.mcp.json` / `.vscode/mcp.json`. `lib/skills.js` now lists each skill's reference files and names them in the chat prompt.
- **Engineering packs bundle.** **Agents › Engineering packs** asks for the code repository folder (the existing folder picker, with its own title) and calls `POST /api/assistants/export-engineering`, which writes the three agents, their skills (including the supporting `program-knowledge`, `azure-devops` and `test-design` skills) and `.github/Engineering skill packs.md`. Existing files with the same names are replaced, as "Use in VS Code" already did.
- **One extra write tool.** `generate_playwright_tests` (in `tools/tests.js`, edit mode) turns a Plan 09 test-case workbook into Playwright specs: one spec per story, one `test.fixme` per case tagged `@TC-###`, its traced IDs and SIT/UAT, a `test.step` per step with the expected result, plus a data factory, a base page object and a `playwright.config.js` (traces and screenshots on failure, HTML and JUnit reports). Tests stay `fixme` until someone writes the assertions. A second run goes to a numbered folder. The generated suite was checked with `npx playwright test --list`.
- **Config comparison.** Environments come from folder or file names (aliases such as SIT→STE, prod→PRD) or are given per file. With a rules file, every key not listed as env-specific must match; without one, differences are warnings. Image tags and versions are always reported as drift, and only the last environment (PRD) is flagged when it runs a tag no lower environment runs, since lower environments being ahead is normal. Key Vault and secret references are not counted as secrets. YAML uses the Plan 12 subset parser; multi-document files are split on `---` here.
- **Pipeline lint.** Approvals live on the environment, not in the YAML, so a PRD deployment to a named environment passes with a reminder to confirm approvals; one with no environment and no `ManualValidation` step is an error. GitHub Actions pinned to a major tag (`@v4`) pass; branch refs and missing versions don't.
- **The Pipeline agent drafts fixes** as files under `Proposed changes/` through the normal edit access; no separate write tool was added.
- **Sample.** `samples/aidlc/Environments/` (STE/UAT/PRD `app-settings.env` and OpenShift `deployment.yaml` exports, `Config rules.md`, a flawed `azure-pipelines.yml`) and `Quality/Test cases - Photo upload (SIT).xlsx`, from `scripts/make-aidlc-sample.js`.
- **Not verified by hand.** Loading the exported packs in VS Code Copilot and Claude Code (the first acceptance check) and running the prompts with the AI engine were not done. The export endpoint was exercised against the test server.
