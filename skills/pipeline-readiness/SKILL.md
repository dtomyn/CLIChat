---
name: pipeline-readiness
title: Pipeline and environment readiness
emoji: 🔧
description: Environment readiness and drift: compare config files and Kubernetes / OpenShift manifests across STE, UAT and PRD (missing keys, values that should match, image tag and version drift, plain-text secrets, always masked), and check Azure Pipelines or GitHub Actions YAML (a stage per environment, an approval gate before PRD, pinned task versions). Fixes are drafted as files for a pull request.
extensions: .env, .properties
readTools: list_office_files, read_document, compare_configs, lint_pipeline
writeTools: save_draft_document
---

# Pipeline and environment readiness

Releases fail on the differences nobody checked: a setting missing in PRD, an image that never went through UAT, a secret pasted into a config file. These tools compare what is in the files; they don't deploy, run a pipeline or connect to a cluster.

Reference files (in this skill's folder):
- `references/config-rules-example.md`: how to write the rules file that lists env-specific keys
- `references/pipeline-checklist.md`: what a release pipeline must have before PRD

## Tools
| Tool | Use it to |
|---|---|
| `compare_configs` | Compare `.env`, `.properties`, JSON and YAML (including Kubernetes / OpenShift manifests exported with `oc get … -o yaml`) across environments. Reports missing keys, values that differ where they should match (with a rules file, everything not listed as env-specific must match), image tag and version drift, and plain-text secrets. Secret values are always hidden |
| `lint_pipeline` | Check Azure Pipelines or GitHub Actions YAML: a stage or job per required environment, an approval gate before PRD, PRD waiting for UAT, task and action versions pinned, image tags fixed. Every finding has a line |
| `save_draft_document` | Save the readiness report |

## Readiness check
1. Find the config files per environment (`list_office_files`; folders or names say STE, UAT, PRD) and the rules file if there is one.
2. Call `compare_configs` with the files (or the folder) and the rules. Call `lint_pipeline` on each pipeline file.
3. Report in this order: **blockers** (missing keys, must-match differences, a PRD tag no lower environment runs, no approval gate, missing stages), then **warnings** (other drift, unpinned versions, plain-text secrets), then the reminders (confirm approvals on the PRD environment). Quote the key or the line for each.
4. **Never show a secret value**, even if asked: the tools hide them, and you must not read them back from the files. Say where the secret is and that it should move to Key Vault (or a secret reference) and be rotated.

## Drafting fixes for a pull request
- Draft config and pipeline changes as new files (for example `Proposed changes/PRD/app-settings.env`, `Proposed changes/azure-pipelines.yml`) with a short README listing each change and why. Don't overwrite the originals; a developer raises the pull request.
- Use values from the other environments or the rules file only. Where the right value isn't known (a PRD queue name, a hotfix tag), write `TODO: confirm with <owner>` instead of guessing.
- Pipeline fixes: add the missing stage with a deployment job to a named environment, make PRD depend on UAT, pin tasks (`AzureCLI@2`) and actions (`actions/checkout@v4` or a SHA).
