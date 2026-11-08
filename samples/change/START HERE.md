# Online Permit Renewal — change, training and bilingual sample

Synthetic data for trying Lumen's Change Impact Analyst, Training Content and Bilingual Reviewer. Everything here is fictional.

| File | What it is |
|---|---|
| **Interview - Processing team - 2 Nov 2026.vtt** | Teams transcript: the change lead interviews the processing team lead |
| **Interview - Client support - 3 Nov 2026.vtt** | Teams transcript: the change lead interviews the client support supervisor |
| **CIA template.xlsx** | Empty Change Impact Assessment (one row per impact, H/M/L, evidence and status) |
| **CIA - Processing.xlsx**, **CIA - Client services.xlsx** | CIAs from earlier workshops, for **Consolidate the CIA** |
| **Roles.xlsx** | Roles, stakeholder groups and headcount, for the training needs analysis |
| **EN-FR Glossary.xlsx** | 30 approved English/French terms (GCKey stays in English) |
| **Renewal guide (EN).docx**, **Guide de renouvellement (FR).docx** | An approved English guide and its French version, for **Bilingual QA** |

## Built-in scenarios
- **Interviews:** each one has three or four clear impacts (screen-based review, automatic eligibility flags, override approvals, status look-ups, the online refund form, bilingual scripts). Impacts must quote the transcript word for word, or they are rejected.
- **Consolidation:** "Processing officers review renewal applications…" is in both CIAs (rated H and M). It is merged and kept at H. CI-003 in the client services CIA is Rejected and left out, and CI-004 is still Proposed, so it is in the heat map but not in the training needs.
- **Bilingual QA:** the French guide uses "requête de renouvellement" instead of the glossary's "demande de renouvellement", says 60 days instead of 30 for the service standard, and leaves out the refund paragraph.

## Things to try
- **Interview → change impacts** on either transcript, with the CIA template.
- **Consolidate the CIA** on both CIA workbooks with the role list, then **Training needs analysis** and **Draft training materials** for processing officers.
- **Bilingual QA** on the guide pair with the glossary, and **Draft French version** of the English guide.

Regenerate with `node scripts/make-change-sample.js`.
