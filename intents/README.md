# Intents — Lumen

Each file in this folder describes one **user intent**: something a person using Lumen wants to accomplish,
extracted from what the application *currently implements* (not from a wish list). Every file follows the same shape:

- **Intent** — the goal in user terms ("As a … I want … so that …")
- **Where** — the screen, control, agent or prompt that serves it
- **Inputs & controls** — what the user can set
- **Behaviour (as implemented)** — the rules the code actually applies
- **Outputs** — what the user sees or gets
- **Acceptance criteria** — testable statements derived from the implementation
- **Limits** — known simplifications or gaps
- **Source** — where it lives in the code

## Index

### Get started and set up the workspace
| # | Intent | File |
|---|--------|------|
| 01 | Get started: welcome steps, home screen, my name and theme | [01-get-started.md](01-get-started.md) |
| 02 | Choose the notebook folder Lumen works in | [02-choose-notebook-folder.md](02-choose-notebook-folder.md) |
| 03 | Choose and check the AI engine | [03-choose-ai-engine.md](03-choose-ai-engine.md) |
| 04 | Install the PM demo and the sample packs | [04-install-demo-and-samples.md](04-install-demo-and-samples.md) |

### Chat
| # | Intent | File |
|---|--------|------|
| 05 | Chat and watch the reply stream | [05-chat-with-lumen.md](05-chat-with-lumen.md) |
| 06 | Choose what Lumen may do and the response mode | [06-control-access-and-response-mode.md](06-control-access-and-response-mode.md) |
| 07 | Find and organize chats | [07-organize-chats.md](07-organize-chats.md) |
| 08 | Attach and reference files | [08-attach-and-reference-files.md](08-attach-and-reference-files.md) |
| 09 | Pin files to a chat | [09-pin-files-to-chat.md](09-pin-files-to-chat.md) |
| 10 | Act on a reply (copy, next steps, feedback, shortcuts) | [10-act-on-a-reply.md](10-act-on-a-reply.md) |
| 11 | Edit and resend, rewind, and branch a chat | [11-edit-resend-and-branch.md](11-edit-resend-and-branch.md) |
| 12 | Save a reply as Word, Excel, PowerPoint or Markdown | [12-export-a-reply.md](12-export-a-reply.md) |
| 13 | See what files changed and compare before/after | [13-see-file-changes.md](13-see-file-changes.md) |

### Agents and prompts
| # | Intent | File |
|---|--------|------|
| 14 | Pick an agent and pin favourites | [14-use-and-pin-agents.md](14-use-and-pin-agents.md) |
| 71 | Ask Lumen about its own agents, prompts and features | [71-ask-lumen-about-itself.md](71-ask-lumen-about-itself.md) |
| 15 | Create or customize an agent | [15-build-an-agent.md](15-build-an-agent.md) |
| 16 | Run a guided task | [16-run-a-prompt.md](16-run-a-prompt.md) |
| 72 | Quick prompts and the Prompt Lab | [72-quick-prompts-and-prompt-lab.md](72-quick-prompts-and-prompt-lab.md) |
| 17 | Save a chat as a prompt and build prompts | [17-save-and-build-prompts.md](17-save-and-build-prompts.md) |
| 18 | Run prompts on a schedule | [18-schedule-prompts.md](18-schedule-prompts.md) |
| 19 | See usage and feedback insights | [19-see-usage-insights.md](19-see-usage-insights.md) |
| 20 | Take agents and prompts to Microsoft 365 Copilot | [20-export-to-m365-copilot.md](20-export-to-m365-copilot.md) |
| 21 | Use agents in VS Code and export engineering packs | [21-use-in-vscode.md](21-use-in-vscode.md) |

### Manage a project plan
| # | Intent | File |
|---|--------|------|
| 22 | Health-check a Microsoft Project plan | [22-plan-health-check.md](22-plan-health-check.md) |
| 23 | Ask the plan questions in plain English | [23-ask-the-plan.md](23-ask-the-plan.md) |
| 24 | Update the plan from progress and see what changed | [24-update-plan-and-track-changes.md](24-update-plan-and-track-changes.md) |
| 25 | Build an Excel tracker with a variance Gantt | [25-excel-tracker-and-variance-gantt.md](25-excel-tracker-and-variance-gantt.md) |
| 26 | Read, create and update Excel workbooks | [26-work-with-excel.md](26-work-with-excel.md) |
| 27 | Produce the weekly executive status pack | [27-weekly-executive-status.md](27-weekly-executive-status.md) |
| 28 | Turn a meeting transcript into RAID log updates | [28-huddle-to-raid.md](28-huddle-to-raid.md) |
| 29 | Model alternative delivery scenarios | [29-model-delivery-scenarios.md](29-model-delivery-scenarios.md) |
| 30 | Check capacity, budget variance and timesheets | [30-capacity-budget-timesheets.md](30-capacity-budget-timesheets.md) |
| 31 | Sync backlog progress into the plan and status | [31-progress-from-backlog.md](31-progress-from-backlog.md) |

### Deliver from requirements to stories
| # | Intent | File |
|---|--------|------|
| 32 | Ground answers in program knowledge documents | [32-program-knowledge.md](32-program-knowledge.md) |
| 33 | Refine requirements into design and stories | [33-requirements-to-stories.md](33-requirements-to-stories.md) |
| 34 | Run the lifecycle as stages with approval gates | [34-guided-lifecycle-runs.md](34-guided-lifecycle-runs.md) |
| 35 | Check requirements traceability and change impact | [35-requirements-traceability.md](35-requirements-traceability.md) |
| 36 | Save drafts in the program's Word and PowerPoint templates | [36-save-in-program-templates.md](36-save-in-program-templates.md) |

### Work with Azure DevOps
| # | Intent | File |
|---|--------|------|
| 37 | Connect Azure DevOps | [37-connect-azure-devops.md](37-connect-azure-devops.md) |
| 38 | Search and read work items and wiki pages | [38-search-and-read-ado.md](38-search-and-read-ado.md) |
| 39 | Propose and approve Azure DevOps changes | [39-approve-ado-changes.md](39-approve-ado-changes.md) |

### Quality engineering
| # | Intent | File |
|---|--------|------|
| 40 | Generate test cases, coverage gaps and the test strategy | [40-test-cases-and-strategy.md](40-test-cases-and-strategy.md) |
| 41 | Triage defects | [41-defect-triage.md](41-defect-triage.md) |
| 42 | Turn test cases into Playwright tests | [42-playwright-tests.md](42-playwright-tests.md) |

### Data and integration
| # | Intent | File |
|---|--------|------|
| 43 | Profile a dataset for quality issues | [43-profile-data.md](43-profile-data.md) |
| 44 | Draft source-to-target mappings and generate pipeline code | [44-sttm-and-pipeline-code.md](44-sttm-and-pipeline-code.md) |
| 45 | Compare schemas and canonical models | [45-compare-schemas.md](45-compare-schemas.md) |
| 46 | Draft and check an interface control document | [46-draft-icd.md](46-draft-icd.md) |
| 47 | Design, review and scaffold an OpenAPI spec | [47-openapi.md](47-openapi.md) |

### Security, change and bilingual
| # | Intent | File |
|---|--------|------|
| 48 | Map security controls, check evidence, draft the security design | [48-security-controls-and-evidence.md](48-security-controls-and-evidence.md) |
| 49 | Turn interviews into change impacts and training needs | [49-change-impacts-and-training-needs.md](49-change-impacts-and-training-needs.md) |
| 50 | Draft training materials | [50-training-materials.md](50-training-materials.md) |
| 51 | Draft French versions and run bilingual QA | [51-bilingual-qa.md](51-bilingual-qa.md) |

### Release and cutover
| # | Intent | File |
|---|--------|------|
| 52 | Check release readiness and coordinate cutover | [52-readiness-and-cutover.md](52-readiness-and-cutover.md) |
| 53 | Draft the runbook and the hypercare closure report | [53-runbook-and-hypercare.md](53-runbook-and-hypercare.md) |

### Architecture, governance and engineering
| # | Intent | File |
|---|--------|------|
| 54 | Review design consistency across documents | [54-architecture-review.md](54-architecture-review.md) |
| 55 | Draft and index ADRs, assess reuse vs. build | [55-adrs-and-reuse.md](55-adrs-and-reuse.md) |
| 56 | Assemble a stage-gate pack | [56-gate-packs.md](56-gate-packs.md) |
| 57 | Keep the technical inventory current | [57-technical-inventory.md](57-technical-inventory.md) |
| 58 | Publish knowledge snapshots and check freshness | [58-knowledge-publishing.md](58-knowledge-publishing.md) |
| 59 | Compare environment configs and lint pipelines | [59-environment-drift-and-pipelines.md](59-environment-drift-and-pipelines.md) |
| 60 | Use the developer skill pack | [60-developer-pack.md](60-developer-pack.md) |

### Trust and privacy
| # | Intent | File |
|---|--------|------|
| 61 | Keep everything local and safe | [61-local-and-private.md](61-local-and-private.md) |

### Proposed (not implemented)
New drafts go in `proposed/` with the same shape, using **Behaviour (proposed)**, **Open questions** and
**Touches** (files expected to change) in place of the as-implemented sections. Move a file up into this folder
and rewrite it as-implemented once it ships. Enhancement plans and the AI use-case tracker live in
[docs/plans/](../docs/plans/README.md); [INVENTORY.md](../docs/plans/INVENTORY.md) tracks the 42 catalogue use cases
that intents 22–60 implement.

Out of scope: the `film/` explainer and how-to video pipeline and the `scripts/make-*.js` sample generators are
tooling that films or seeds the app; they are not end-user intents.
