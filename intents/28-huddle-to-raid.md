# 28 — Turn a meeting transcript into RAID log updates

## Intent
As a project manager, I want Lumen to read this morning's huddle transcript and propose RAID log changes (new risks,
issues, actions, decisions and dependencies, and updates or closures to existing items), each backed by a quote, so
that I can approve them in Excel instead of re-listening to the meeting.

## Where
- Prompt **Huddle → RAID log** 🗣️ (category *Project plans*, agent **Project Partner**, access `edit`, badge **Saves a
  file**). Related: **RAID log review** 🛡️ (Project Partner, `read`): top risks, overdue reviews, issues without an
  action, escalation suggestions.
- Skill **Meeting → RAID log** 🗣️ (`huddle-raid`) on **Project Partner**; attaching a `.vtt` turns it on.
- Tools `read_transcript` ("Reading transcript <file>"), `read_spreadsheet`, `propose_raid_updates` ("Proposing N RAID
  changes for review"), `apply_raid_updates` ("Applying approved RAID changes from <file>").

## Inputs & controls
| Control | Effect |
|---|---|
| **Meeting transcript** (`.vtt,.docx,.txt,.md`) | Teams WebVTT, a Teams transcript saved as Word, or text. |
| **RAID log** (`.xlsx,.xlsm`) | The log to update. |
| `meetingDate` | Raised date for new items; the prompt takes it from the transcript file name, else today. |
| `proposals[]` | `change` (`add`/`update`/`close`), `kind` (risk, issue, action, decision, dependency, assumption), `id` (for update/close), `fields` (title, owner, due, status, action, priority, probability, impact, category, date), `evidence.quote`, `reason`. |
| **Approve? (Yes/No)** column | Set by the person in Excel on every proposed row. |

## Behaviour (as implemented)
- **Transcript parsing**: WebVTT cues with `<v Speaker>` or "Name:" prefixes, consecutive cues from one speaker
  joined; Word/text exports with "Name 0:03" headers or "[00:01:02] Name: text" lines. Output: numbered turns with
  time and speaker.
- **Quotes are checked**: each proposal needs at least 4 words found in one turn (or across two consecutive turns),
  ignoring case and punctuation. Unverifiable proposals are rejected, not written, and listed under "Not proposed".
- **Propose** writes `<RAID> (proposed).xlsx` next to the log: new rows filled green with the next ID in the sheet's
  pattern (default prefixes R-, I-, ACT-, DEC-, D-, A-) and formulas/formats copied from the row above; changed cells
  yellow. Updates to mitigation/action append to the existing text. Calculated columns are left alone. `close` sets
  Closed / Done / Received / Yes by type. An Actions sheet is created if a new action has none.
- A **Proposed changes** sheet (active tab) lists #, **Approve? (Yes/No)** (a Yes/No drop-down), change, type, ID,
  sheet, row, what changes, quoted evidence, speaker, time, why, and a hidden change-data column.
- **Meeting checks** flag new items with no owner (except decisions) and new actions or issues with no due date.
- **Apply** refuses (writes nothing) until every row is Yes or No, then replays only the Yes rows onto the original
  and saves `<RAID> (updated).xlsx`. The original RAID log is never overwritten.
- The skill forbids calling `apply_raid_updates` until the person says they have reviewed the proposed workbook, and
  says to prefer updating existing items, never invent owners or dates, and use ISO dates.
- Both write tools need **Create & edit files**. The weekly status pack then reads the `(updated)` copy and reports
  pending rows ([27](27-weekly-executive-status.md)).

## Outputs
- `<RAID> (proposed).xlsx`, then `<RAID> (updated).xlsx` after approval.
- Chat: a table of proposals (change, type, ID, what changes, who said it and when), what was not proposed and why,
  the meeting checks, and how to approve.

## Acceptance criteria
- `test/huddle-raid.test.js` › parses Teams WebVTT, joining split cues from the same speaker.
- `test/huddle-raid.test.js` › parses Teams Word-export and inline text transcripts.
- `test/huddle-raid.test.js` › quotes must appear in the transcript, ignoring punctuation and case.
- `test/huddle-raid.test.js` › propose writes a reviewable copy, rejects unverifiable proposals and leaves the
  original alone.
- `test/huddle-raid.test.js` › apply refuses until every row is decided, then writes only approved changes to an
  (updated) copy.
- `test/huddle-raid.test.js` › RAID tools are exposed; proposing needs edit access.
- `test/huddle-raid.test.js` › latestRaid prefers the approved copy, never the proposed one, and reports pending
  huddle changes.

## Decisions
- A transcript is evidence, not truth: changes go through a reviewable Excel copy and an explicit Yes/No per row.

## Limits
- Quote checking proves the words were said, not that the interpretation is right; the reviewer still decides.
- Re-proposing overwrites the existing `(proposed)` copy; apply always starts again from the original log.
- RAID columns are recognised by header names; unusual layouts may leave fields "no matching column, skipped".
- The demo includes **Huddle 10-30 - 30 Oct 2026.vtt** and **CRM Migration - RAID Log.xlsx**
  ([04](04-install-demo-and-samples.md)).

## Source
`tools/raid.js` (`readTranscript`, `parseVtt`, `parsePlain`, `locateQuote`, `verifyQuotes`, `applyOne`, `propose`,
`huddleChecks`, `applyApproved`, `latestRaid`), `tools/office-mcp.js` (`read_transcript`, `propose_raid_updates`,
`apply_raid_updates`), `skills/huddle-raid/SKILL.md`, `defaults/assistants.json` (agent **Project Partner**),
`defaults/recipes.json` (prompts **Huddle → RAID log** `huddle-to-raid`, **RAID log review** `raid-review`).
