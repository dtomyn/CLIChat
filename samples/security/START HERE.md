# Security and SA&A sample (synthetic)

Online Permit Renewal, synthetic data for the **Security** prompts. Open this folder as the notebook.

| File | What it is |
|---|---|
| **Control Catalogue (synthetic).xlsx** | 20 controls (Control ID, Family, Title, Statement, Baseline). Short paraphrases, not ITSG-33 or NIST text |
| **SCTM - Online Permit Renewal.xlsx** | A partially filled SCTM: 16 of the 20 controls |
| **Technical Design - Security.md** | The security sections of the TDD that the implementation statements cite |
| **Evidence/** | Evidence files named with control IDs, and *Evidence index.xlsx* for a file without an ID in its name |

What the checks should find (as of 2026-11-07, evidence older than 365 days is stale):

- **Not mapped:** AC-7, CM-6, IA-5 and SC-12 are in the profile but not in the SCTM.
- **Needs input:** SC-13 cites "6.1 Hardware security modules", which is not a heading in the TDD. IR-4 has no design reference. SI-4 is a Gap with no statement.
- **Missing evidence:** CM-2 names *CM-2 - Configuration baseline scan.md*, which is not in the folder. AC-3 is Implemented but has no evidence.
- **Stale evidence:** *SI-2 - Monthly patch report 2025-08-29.md*.
- **Orphan file:** *Firewall rule export 2026-10-01.md* has no control ID and is not in the SCTM or the index.

Try the prompts **Draft the SCTM**, **Security design document** and **Evidence gap check**. For a Word Security Design Document in the program style, use the TDD template from `samples/aidlc/Templates`.

Regenerate with `node scripts/make-security-sample.js`.
