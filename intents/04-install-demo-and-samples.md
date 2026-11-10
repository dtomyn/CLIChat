# 04 — Install the PM demo and the sample packs

## Intent
As a project manager, delivery lead or data engineer trying Lumen for the first time, I want to install realistic
sample files with one click and be shown what to try, so that I can see the agents and prompts work before using my
own documents.

## Where
- **Samples** in the app rail (at the bottom, above the chats toggle; route `#/samples`) opens the **Sample data** page:
  one card per pack (**PM demo**, **AIDLC sample**, **Data sample**, **Security sample**, **Change sample**) with a
  one-line summary, the agent it starts with and **Use this sample**. The card of the active pack shows **You're here**,
  its quick prompt buttons and **See the files** instead.
- Home screen: while a pack is the active folder, a **You're in the …** banner with quick prompt buttons. Otherwise,
  only for someone with no chats who has never installed a pack, a one-line hint **New to Lumen? Try it on sample
  data** (link to the Samples page, × to hide). Regular users see nothing about samples on the home screen.

## Inputs & controls
| Control | Effect |
|---|---|
| **Use this sample** on **PM demo** | Installs the Contoso CRM Migration pack. |
| … on **AIDLC sample** | Installs the Online Permit Renewal delivery-lifecycle pack. |
| … on **Data sample** | Installs the Permit Applications data pack. |
| … on **Security sample** | Installs the Permit Renewal security (SA&A) pack. |
| … on **Change sample** | Installs the Permit Renewal change, training and bilingual pack. |
| Home hint **Try it on sample data** | Opens the Samples page. |
| Home hint × (**Hide**) | Sets `demoDismissed`; the hint no longer shows (the Samples page and in-pack banner still do). |
| In-pack buttons (home banner or **You're here** card) | Open the named prompt's form ([16](16-run-a-prompt.md)); **See the files** opens the Notebook drawer ([02](02-choose-notebook-folder.md)); **Leave sample** switches the project folder back to the one used before the sample (remembered as `demoPrevWorkspace`), or opens the folder picker if there was none or it no longer exists. |

## Behaviour (as implemented)
- **Packs** (`PACKS` in `server.js`):
  | Pack | Copied from | Folder name | Agents whose VS Code files are written |
  |---|---|---|---|
  | `crm` | `demo/` | `Contoso CRM Migration (demo)` | `schedule-analyst`, `ask-the-plan`, `budget-controller`, `project-partner` |
  | `aidlc` | `samples/aidlc/` | `Online Permit Renewal (AIDLC sample)` | `requirements-refiner`, `functional-designer`, `technical-designer`, `story-writer`, `traceability-analyst` |
  | `data` | `samples/data/` | `Permit Applications (data sample)` | `data-profiler`, `mapping-analyst`, `data-engineer` |
  | `security` | `samples/security/` | `Permit Renewal Security (SA&A sample)` | `security-control-mapper`, `security-documentation`, `cae-evidence` |
  | `change` | `samples/change/` | `Permit Renewal Change (change sample)` | `change-impact-analyst`, `training-content`, `bilingual-reviewer` |
- **Where it goes** (`installDemo`): into a subfolder of the current notebook folder named as above. If the current
  folder is already one of the pack folders, the new pack goes next to it instead, so packs never nest.
- **Copy rule** (`copyMissing`): files are copied recursively but an existing file is never overwritten, so
  reinstalling keeps the user's edits and only restores missing files.
- The pack folder also gets the VS Code / CLI kit for its agents (`writeVsCodeKit`: `.claude/agents`,
  `.claude/skills`, `.github/agents`, `.github/skills`, `.mcp.json`, `.vscode/mcp.json`; see
  [21](21-use-in-vscode.md)).
- After install the server sets `workspace` to the pack folder plus `demoInstalled` and `demoPack`. The UI picks the
  pack's starting agent (**Schedule Analyst** for `crm`, **Traceability Analyst** for `aidlc`, **Data Profiler** for
  `data`, **Security Control Mapper** for `security`, **Change Impact Analyst** for `change`), sets access to **Read my files**, shows confetti and the toast **Demo ready — your project folder is now
  "<folder>"** (**Sample ready …** for the other packs), and goes to the home screen.
- The pack names, summaries, starting agents and quick prompts come from one list, `SAMPLE_PACKS` in `public/app.js`.
- **In-pack banner** (`demoBanner`, shown while `workspace` equals `demoInstalled`; the same prompts show on the
  **You're here** card):
  - PM demo 📦: 🩺 **Health check**, 📣 **Status report**, 🔄 **Update the plan**, 💰 **Budget review**.
  - AIDLC 🧬: 📚 **Knowledge inventory**, 🔬 **Refine requirements**, 🔗 **Traceability check**, 🌊 **Change impact**.
  - Data 📊: 📊 **Profile a dataset**, 🔀 **Compare schemas**, 🗺️ **Draft the STTM**, 🧱 **Generate pipeline code**.
  - Security 🛡️: 🛡️ **Draft the SCTM**, 🗂️ **Evidence gap check**, 📘 **Security design document**.
  - Change 🔄: 🔄 **Interview → change impacts**, 🧩 **Consolidate the CIA**, 🎓 **Training materials**, 🔍 **Bilingual QA**.
- An unknown pack (only the packs' own names, never inherited object keys) or a missing source folder returns 400 "The <pack> sample isn't available in this copy of Lumen.".
- Contents: the PM demo has the 42-task Project XML plan (`Contoso CRM Migration.xml`), budget tracker, RAID log,
  timesheets, weekly progress update, capacity, ADO backlog export, huddle transcript, readiness checklist, cutover
  run-sheet, hypercare defects, `Evidence/` and `START HERE.md`. The AIDLC, data, security and change packs each have a `START HERE.md`.
  Packs are regenerated with `node scripts/make-demo.js`, `scripts/make-aidlc-sample.js` and
  `scripts/make-data-sample.js`.

## Outputs
- A new folder `<notebook>\<pack folder>` with the sample files and the VS Code kit; it becomes the default notebook.
- The home banner with that pack's suggested prompts.

## Acceptance criteria
- `POST /api/demo/install` with `{ pack: 'crm' | 'aidlc' | 'data' }` returns the target path and its non-hidden files,
  and sets `settings.workspace`, `demoInstalled` and `demoPack`.
- Installing twice does not overwrite a file the user changed.
- Installing a second pack while inside the first puts it beside the first, not inside it.
- Hiding the home hint does not hide the in-pack banner or the Samples page.
- The home hint never shows once there is a chat or a pack has been installed.
- The pack's prompts and many tool tests run on these files (e.g. `e2e/real-engine.spec.js` › Weekly look-ahead,
  `e2e/real-engine-plans.spec.js` › Data: profiling finds the seeded data quality defects); no test calls
  `/api/demo/install` itself.

## Limits
- The samples are synthetic.
- Installing switches the default notebook; switching back is manual ([02](02-choose-notebook-folder.md)).
- The in-pack banner and **You're here** show only while the default notebook is exactly the most recently installed
  pack; other packs installed earlier show **Use this sample** again (reinstalling only restores missing files).

## Source
`server.js` (`PACKS`, `copyMissing`, `installDemo`, `writeVsCodeKit`, `POST /api/demo/install`); `public/app.js`
(`SAMPLE_PACKS`, `demoBanner`, `renderSamplesPage`, `installDemo`, `homeClicks`, `celebrate`); `public/index.html`
(rail **Samples**); `demo/`, `samples/aidlc/`, `samples/data/`;
`scripts/make-demo.js`, `scripts/make-aidlc-sample.js`, `scripts/make-data-sample.js`.
