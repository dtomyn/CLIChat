# 53 — Draft the runbook and the hypercare closure report

## Intent
As a service transition lead, I want an operational runbook drafted from the design and support documents, and after
go-live a hypercare trend against the exit criteria with a draft closure report, so that support has a sourced runbook
and the hypercare exit decision rests on the defect data.

## Where
- Agents **Runbook Writer** 📗 and **Hypercare Analyst** 📉.
- Prompts in the **Release** category: **Draft the runbook**, **Hypercare closure report**.

## Inputs & controls
| Control | Effect |
|---|---|
| **Draft the runbook** › **Technical or solution design**, **Deployment procedures** (optional), **Support model** (optional), **System name**, **Word template** (optional .dotx/.docx) | Drafts the runbook and saves it as Markdown and Word. |
| **Hypercare closure report** › **Hypercare defect export** (.xlsx/.xlsm/.csv), **Exit criteria** (one per line, optional), **As of** | Calls `hypercare_trends` and `analyze_defects`, then drafts the report. |
| `hypercare_trends` options | `exitCriteria` (plain words), `asOf` (default today), `start` (hypercare start, default the first defect). |

## Behaviour (as implemented)
- **Runbook sections**: overview and contacts, system context, routine operations (daily, weekly, monthly checks),
  monitoring and alerts, start-up and shut-down, backup and restore, common incidents and fixes, escalation and support
  hours, change and release steps.
  - Each section ends with `Source:` and the document heading. Anything unsourced is marked *To be confirmed*.
- Saved with `save_draft_document` as `Runbook - <system> (draft).md` with `word: true`
  (see [36](36-save-in-program-templates.md)).
  - Template: the one given, else a runbook template in `Templates/` (such as `Templates/Runbook Template.dotx`), else the
    built-in Word layout.
  - The template's styles, header and cover page are kept and the body goes at `{{content}}`.
- **Hypercare reading**: the defect export goes through the Plan 09 reader (see [41](41-defect-triage.md)). Only rows
  whose type is bug/defect/issue are used when a Type column has them.
  - Closed means a closed, done, resolved, removed, rejected, duplicate, won't fix or cancelled state.
  - The closed date is Closed Date, else Changed Date, with a warning when there is no Closed Date column. Defects with
    no created date are left out of the trend, with a warning.
- Severity is read from `SevN` / `Severity N`, else the triage ranking; values are Sev1–Sev4 or Unrated.
- **Weekly trend**: Monday-to-Sunday weeks from the hypercare start to the as-of date. Each week has opened, closed, open
  at week end, average and oldest open age, and opened / closed / open by severity.
- **Exit criteria** are parsed from plain words (`parseCriterion`). *SevN* means N or worse; "critical" means Sev1.
  - "No Sev1 open for 10 days": no matching defect open at any time in the last N days (weeks convert to days).
  - "No Sev2 open", "Fewer than 10 open defects", "At most 5…": a count of open defects against a limit ("fewer than N"
    allows N−1).
  - "No open defect older than 14 days": open defects past that age.
  - "Open defects falling for 2 weeks": open-at-end must fall over the last N+1 complete weeks. A week still under way is
    not compared; too few weeks gives *Not checked*.
  - Anything else is *Not checked*, with how to phrase it.
- Defaults when none are given: No Sev1 open for 10 days, No Sev2 open, Fewer than 10 open defects, Open defects falling
  for 2 weeks.
- **Verdict**: **Not ready to close** if any criterion fails; *Check the unread criteria* if some are Not checked;
  otherwise **Ready to close**. The agent never rounds a Fail up to a Pass.
- The `analyze_defects` triage headline (duplicates, severity–priority mismatches, unowned, oldest open) is included.
  `hypercare_trends` is read-only; the export is never changed.
- **Closure report**: period and scope, trend table, exit criteria with Pass/Fail and evidence, open defects and owners,
  recurring themes by area, handover to business-as-usual support, and a recommendation (close, or extend until the
  failing criteria pass).
  - Lessons learned come only from what the person or the documents give.
  - Saved as `Hypercare closure report (draft).md` with `word: true` in the built-in Word layout, listing the export as
    the source.
- Both prompts save files, so they need **Create & edit files** (see [06](06-control-access-and-response-mode.md)).

## Outputs
- `Runbook - <system> (draft).md` and its Word copy; a list of sections that still need input and from whom.
- A verdict line, each exit criterion with Pass/Fail and evidence (up to 20 defects each with their cells), the weekly
  trend and open defects by severity, and `Hypercare closure report (draft).md` plus Word.

## Acceptance criteria
- The demo export as of 2027-02-01 is *Not ready to close*: the four default criteria are Pass, Fail, Pass, Pass.
  - "No Sev1 open for 10 days" cites the last Sev1 closed on 2027-01-14, and "No Sev2 open" fails on defect 5108.
  - Weeks start 2027-01-04 and open-at-end runs 5, 6, 5, 4.
  - Custom criteria give Fail, Fail, Pass, Not checked (`test/release.test.js` › hypercare trends: weekly counts by
    severity and exit criteria pass/fail).
- Plain-word criteria parse to the right type, limit, severity, days and weeks (› exit criteria are read from plain
  words).
- The runbook prompt has an optional Word template field and falls back to `Templates/Runbook Template.dotx`. The saved
  Word copy keeps the template's styles and header and fills `{{content}}` (› the runbook is saved as Word in the
  program runbook template).
- With the real engine: `e2e/real-engine-plans-2.spec.js` › Release: the runbook is saved as Word in the program runbook
  template, › Release: hypercare is not ready to close because of the open Sev2, and the closure report is saved.

## Limits
- The closure report has no program template; it uses the built-in Word layout.
- A closed defect with no closed or changed date counts as closed before the period.
- Lessons learned are not inferred from the data.

## Source
- `tools/release.js` (`hypercareTrends`, `parseCriterion`, `DEFAULT_EXIT`); `tools/tests.js` (`readDefects`,
  `analyzeDefects`); `tools/change.js` (`saveDraft`); `tools/md-export.js` (`toDocx`).
- `tools/office-mcp.js` (tools `hypercare_trends`, `analyze_defects`, `save_draft_document`).
- `skills/release-cutover/SKILL.md`.
- `agents/<id>.json` (agents **Runbook Writer**, **Hypercare Analyst**).
- `defaults/recipes.json` (prompts **Draft the runbook**, **Hypercare closure report**).
- `samples/aidlc/Templates/Runbook Template.dotx`; `demo/Hypercare Defects - 1 Feb 2027.xlsx`.
