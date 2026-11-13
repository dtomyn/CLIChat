# 59 — Compare environment configs and lint pipelines

## Intent
As a DevOps engineer or release manager, I want the configuration of STE, UAT and PRD compared and the release pipeline
checked before go-live, so that a missing setting, an image that skipped testing, a plain-text secret or a PRD stage with
no approval gate is caught before it causes an incident.

## Where
- Agent **Pipeline & Environment Readiness** 🔧.
- Prompts **Compare environment configs** and **Check a pipeline** (category **Engineering**).
- The `pipeline-readiness` skill (also exported to VS Code with the **Engineering packs**, see [21](21-use-in-vscode.md)).

## Inputs & controls
| Control | Effect |
|---|---|
| **Compare environment configs** › **Folder with the environment configs**, **Config rules** (optional .md/.txt/.json) | Calls `compare_configs` with the folder and rules. |
| **Check a pipeline** › **Pipeline YAML** (.yml/.yaml) | Calls `lint_pipeline` with STE, UAT, PRD. |
| `compare_configs` › `files` | Paths, or `{ path, environment }` to name the environment. |
| `compare_configs` › `folder` | Instead of files: every `.env`/`.properties`/`.json`/`.yaml`/`.yml` under it whose path names an environment, except the rules file and files named *pipeline*/*workflow*. |
| `environments` | Promotion order; default DEV, STE, QA, UAT, PREPROD, PRD (`compare_configs`), required STE, UAT, PRD (`lint_pipeline`). |

## Behaviour (as implemented)
- **Environments** come from a folder or file-name token, or the given name. Aliases are normalised: SIT/INT → STE,
  test/TST → QA, STG/staging/pre-prod → PREPROD, prod/production/live → PRD.
- At least two files in two environments are needed.
- **Parsing** (`parseConfig`) flattens each file to keys:
  - `.env`/`.properties`: `KEY=value` or `KEY: value`, with comments and quotes handled.
  - JSON.
  - YAML with several documents. Kubernetes / OpenShift objects are prefixed `Kind/name`, and named list items are keyed
    by name (`Deployment/permit-api.spec.template.spec.containers[api].image`).
  - Several files per environment are compared file by file (`app-settings.env › KEY`).
- **Rules** (`parseRules`): a Markdown `Key | Rule` table, `KEY: rule` / `- KEY — rule` lines, or JSON.
  - Rules are `env-specific`, `must-match`, `optional` and `ignore`. `*` is a wildcard.
  - A key without dots also matches the last part of a nested key. The most specific pattern wins.
- **Findings**:
  - **missing** (error): a key absent in some environments, unless optional.
  - **differs**: a value that differs where it should match. With a rules file anything not env-specific must match
    (error); without one every difference is a warning to review.
  - **drift**: image tags and version-like keys always. It is an error when the last environment (usually PRD) runs a tag
    no lower environment runs, or the environments run different images; otherwise a warning.
  - **secret** (warning): a secret-looking key (password, token, API key, connection string…) or value (private key, JWT,
    GitHub/Slack/AWS/`sk-` keys) stored as plain text. Key Vault, `${VAR}`, `secretKeyRef` and placeholder values are
    references, not secrets. Kubernetes Secret data counts as secret.
- **Secret values are always masked** (`•••••• (hidden)`) in every part of the output. The agent never shows or repeats
  one and says to move it to Key Vault or a secret reference and rotate it.
- **Pipeline lint** (`lintPipeline`): GitHub Actions is detected by `on:` or a `jobs` map, Azure Pipelines by stages, jobs,
  steps, trigger, pool or extends. Anything else, or a non-YAML file, is refused. It checks:
  - **missing-stage** (error): no stage or job deploys to a required environment.
  - **no-approval** (error): a PRD unit with no deployment to a named environment and no `ManualValidation@` step.
    Otherwise an **approval** reminder (info) to confirm approvals on that environment, which the YAML can't show.
  - **order** (error): PRD with an empty `dependsOn`/`needs`, or not depending, directly or through the chain, on the
    last environment before it.
  - **unpinned**: an Azure task without `@version` or a GitHub action without a ref or on a branch (error); a container
    image with no tag or `:latest` (warning).
- Each finding has a JSON path and, where known, a line.
- Both tools are read-only: nothing is deployed, run or connected to a cluster.
- **Fixes for a pull request**: on request the agent drafts changed files under `Proposed changes/` (e.g.
  `Proposed changes/PRD/app-settings.env`, `Proposed changes/azure-pipelines.yml`) with a README of each change.
  - This uses edit access; originals are never overwritten.
  - Unknown values are written as `TODO: confirm with <owner>`.

## Outputs
- Blockers first (missing keys, must-match differences, an unpromoted PRD tag, missing stages, no approval gate, PRD not
  waiting for UAT), then warnings (other drift, unpinned versions, plain-text secrets), each with key or line.
- A PRD readiness verdict and the YAML fix per pipeline finding, plus the reminders to confirm outside the YAML.

## Acceptance criteria
- Files of each format parse to flat keys (`test/drift.test.js` › config files parse to flat keys: .env, JSON and
  multi-document Kubernetes YAML).
- Rules files parse, and the most specific pattern wins (› rules: Markdown table, lines and JSON; the most specific
  pattern wins).
- On the AIDLC sample with `Config rules.md`, nothing about env-specific keys is reported and the seeded password never
  appears (› compare_configs on the STE/UAT/PRD sample finds the seeded missing key and tag drift, and masks the secret).
  It finds:
  - PRD missing `NOTIFY_QUEUE_NAME`.
  - Image tags STE 1.4.2 / UAT 1.4.1 / PRD 1.3.9-hotfix, flagged as not promoted.
  - `PHOTO_MAX_AGE_MONTHS` differing although it must match.
  - `DB_PASSWORD` stored as plain text in PRD.
- Without rules differences are warnings, a differing secret is masked, Key Vault references are not secrets, and one
  file or one environment is refused (› without rules every difference is a warning; secret values are hidden even when
  they differ).
- The sample pipeline gives missing UAT stage, no approval before PRD and two unpinned tasks with lines (› lint_pipeline
  on the sample: missing UAT stage, no approval gate before PRD, unpinned tasks).
- A good Azure pipeline has no errors and an approvals reminder. PRD skipping UAT is an order error. GitHub Actions on a
  branch, unversioned, ungated or with empty `needs` are each flagged (› lint_pipeline: a good Azure pipeline passes with
  an approvals reminder; GitHub Actions checks).
- Both tools run read-only through the MCP server and never return the secret (› engineering tools are exposed;
  generating tests needs edit access).
- With the real engine: `e2e/real-engine-plans.spec.js` › Engineering: config comparison finds the drift and never shows
  the secret; `e2e/real-engine-plans-2.spec.js` › Engineering: the pipeline check finds the missing UAT stage, the PRD
  gate and the unpinned tasks.

## Decisions
- Approvals live on the environment, not in the YAML, so a deployment to a named PRD environment passes with a reminder.
- Only the last environment is flagged for an unpromoted tag; lower environments being ahead is normal promotion lag.

## Limits
- YAML uses Lumen's subset parser (no new package).
- Pipelines are not run and clusters are not queried; manifests must be exported (`oc get … -o yaml`).
- Approvals, variable groups and branch policies must be confirmed in Azure DevOps or GitHub.

## Source
- `tools/drift.js` (`parseConfig`, `parseRules`, `ruleFor`, `looksSecret`, `compareConfigs`, `lintPipelineText`,
  `lintPipeline`, `envFromPath`, `canonicalEnv`, `MASK`); `tools/openapi.js` (`parseYaml`).
- `tools/office-mcp.js` (tools `compare_configs`, `lint_pipeline`).
- `skills/pipeline-readiness/SKILL.md` and `references/config-rules-example.md`, `references/pipeline-checklist.md`.
- `agents/<id>.json` (agent **Pipeline & Environment Readiness**).
- `defaults/recipes.json` (prompts **Compare environment configs**, **Check a pipeline**).
- `samples/aidlc/Environments/`.
