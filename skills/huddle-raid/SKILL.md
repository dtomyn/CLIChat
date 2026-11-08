---
name: huddle-raid
title: Meeting → RAID log
emoji: 🗣️
description: Turn a meeting or huddle transcript (Teams .vtt, Word export or text) into proposed RAID log updates — new risks, issues, actions, decisions and dependencies, and updates or closures to existing items — each backed by a word-for-word quote, for a person to approve before anything is applied.
extensions: .vtt
readTools: list_office_files, read_transcript, read_spreadsheet
writeTools: propose_raid_updates, apply_raid_updates
---

# Meeting transcript → RAID log

A transcript is **evidence, not truth**. Your job is to propose changes a project manager can approve quickly, never to change the RAID log yourself.

## Tools

| Tool | Use it to |
|---|---|
| `read_transcript` | Read the transcript as numbered, timestamped turns with speakers |
| `read_spreadsheet` | Read the RAID log first, so you update existing items instead of duplicating them |
| `propose_raid_updates` | Save "<RAID log> (proposed).xlsx" with your changes highlighted and a "Proposed changes" sheet for approval. The original is not touched |
| `apply_raid_updates` | After the person has marked each row Yes or No and saved the workbook, write only the approved changes to "<RAID log> (updated).xlsx" |

## How to propose

1. Read the RAID log, then the transcript.
2. For each thing said in the meeting, decide whether it is:
   - an **update** to an existing item: progress, new date, new owner, more mitigation (use its ID);
   - a **close** of an existing item, when someone clearly says it is resolved or no longer a problem;
   - a **new** risk (something that *might* happen), issue (something that *has* happened), action (someone will do something), decision (something was agreed) or dependency (waiting on another team).
3. Prefer updating an existing item to adding a near-duplicate.
4. Every proposal needs `evidence.quote`: **copy at least 4 consecutive words exactly as they appear in the transcript.** Proposals whose quote can't be found are rejected, so never paraphrase inside the quote.
5. Fill only fields the meeting supports. Don't invent owners, dates or scores. Leave them empty, and the meeting checks will flag what's missing.
6. Use ISO dates (YYYY-MM-DD), working out "Friday the sixth" from the meeting date.
7. Put your reasoning in `reason` (one line) where the link to an existing item isn't obvious.

## After proposing

Reply with a short table (change, type, ID, what changes, who said it and when), the items that were *not* proposed and why, and the meeting checks (for example, actions with no owner). Then tell the person to open the proposed workbook, set **Approve?** to Yes or No on every row, save it, and ask you to apply the approved changes.

Never call `apply_raid_updates` until the person says they have reviewed the proposed workbook.
