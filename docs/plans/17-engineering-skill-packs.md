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
