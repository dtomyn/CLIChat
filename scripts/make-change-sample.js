// Generates the change, training and bilingual sample pack in ./samples/change (Online Permit Renewal, synthetic):
//   - two stakeholder interview transcripts (Teams .vtt) for "Interview → change impacts"
//   - CIA template.xlsx, and two filled CIA workbooks from earlier rounds with one duplicate impact across them,
//     one rejected impact and one still proposed, for "Consolidate the CIA"
//   - Roles.xlsx (role list with stakeholder group and headcount) for the TNA
//   - EN-FR Glossary.xlsx (30 terms) and an EN/FR guide pair with three seeded inconsistencies for "Bilingual QA":
//     a glossary term translated differently, a number that differs, and a paragraph missing from the French
// Run:  node scripts/make-change-sample.js

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { toDocx } = require('../tools/md-export');
const { CIA_COLUMNS } = require('../tools/change');

const OUT = process.env.CHANGE_OUT ? path.resolve(process.env.CHANGE_OUT) : path.join(__dirname, '..', 'samples', 'change');
fs.mkdirSync(OUT, { recursive: true });
const HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };

function sheet(wb, name, rows, widths) {
  const ws = wb.addWorksheet(name);
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = HEADER;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  (widths || []).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (let r = 2; r <= ws.rowCount; r++) ws.getRow(r).alignment = { vertical: 'top', wrapText: true };
  return ws;
}
const CIA_WIDTHS = [10, 20, 22, 22, 50, 12, 36, 22, 46, 16, 9, 26, 11];

// ------------------------------------------------------------------ interviews
function vtt(file, turns) {
  let t = 3;
  const ts = (s) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000`;
  const cues = turns.map(([who, text]) => { const start = t; t += Math.max(4, Math.round(text.length / 14)); return `${ts(start)} --> ${ts(t - 1)}\n<v ${who}>${text}</v>`; });
  fs.writeFileSync(path.join(OUT, file), `WEBVTT\n\n${cues.join('\n\n')}\n`, 'utf8');
}

function interviews() {
  vtt('Interview - Processing team - 2 Nov 2026.vtt', [
    ['Nadia Roy', 'Thanks for making time, Marc. I want to understand how online renewal changes the work for your processing officers.'],
    ['Marc Tremblay', 'Sure. Today my officers pull the paper file for every renewal and check it against the scanned copy.'],
    ['Marc Tremblay', 'With the new system they will review renewal applications on screen in the case management system, so nobody touches paper any more.'],
    ['Nadia Roy', 'How confident are they with the case management system today?'],
    ['Marc Tremblay', 'Most of them have only used it to look things up. Working a whole file in it is new for about forty officers.'],
    ['Marc Tremblay', 'Eligibility checks used to be manual. The system will flag eligibility automatically and officers only handle the exceptions.'],
    ['Nadia Roy', 'Does that change anything for your senior officers?'],
    ['Marc Tremblay', 'Yes. My senior officers will need to approve eligibility overrides in the system, which is a new step for them.'],
    ['Marc Tremblay', 'Decision letters will be generated from templates instead of being typed in Word, so that part gets easier.'],
    ['Nadia Roy', 'What worries you most about the change?'],
    ['Marc Tremblay', 'Honestly the biggest worry is the first month, when we run paper and online side by side and people switch between both.'],
    ['Nadia Roy', 'That is really helpful. Thank you, Marc.'],
  ]);
  vtt('Interview - Client support - 3 Nov 2026.vtt', [
    ['Nadia Roy', 'Sofia, thanks for joining. Let us talk about what online renewal means for the client support centre.'],
    ['Sofia Alvarez', 'Clients will call us when they cannot sign in with their GCKey, and right now my agents have never seen the new portal.'],
    ['Sofia Alvarez', 'Agents will need to look up application status in the case management system instead of emailing the processing team.'],
    ['Nadia Roy', 'Do you expect the number of calls to change?'],
    ['Sofia Alvarez', 'We expect call volumes to go up by maybe thirty percent in the first six weeks after launch.'],
    ['Sofia Alvarez', 'Refund requests will move to an online form, so agents need to know how to walk clients through it step by step.'],
    ['Nadia Roy', 'And your scripts and articles?'],
    ['Sofia Alvarez', 'Our call scripts and the knowledge articles all have to be rewritten in English and French before launch.'],
    ['Sofia Alvarez', 'My supervisors will also need new reports, because the call reasons will be different from today.'],
    ['Nadia Roy', 'Great, thank you Sofia.'],
  ]);
}

// ------------------------------------------------------------------ CIA workbooks and roles
const row = (id, group, role, process, change, level, gap, type, quote, speaker, time, source, status) => [id, group, role, process, change, level, gap, type, quote, speaker, time, source, status];

async function cia() {
  const t = new ExcelJS.Workbook();
  sheet(t, 'Impacts', [CIA_COLUMNS], CIA_WIDTHS);
  sheet(t, 'How to use', [['Change Impact Assessment (CIA) template'], ['One row per impact: who is affected (stakeholder group and roles), which business process, what changes, and how big the impact is (H, M or L).'], ['Impact level: H = new skills or a new way of working for most people in the group; M = changed steps or tools; L = awareness only.'], ['Evidence: the interview quote, speaker and time the impact comes from. Status: Proposed, Approved or Rejected.']], [110]);
  await t.xlsx.writeFile(path.join(OUT, 'CIA template.xlsx'));

  const p = new ExcelJS.Workbook();
  sheet(p, 'Impacts', [
    CIA_COLUMNS,
    row('CI-001', 'Processing officers', 'Processing officer', 'Application review', 'Processing officers review renewal applications in the case management system instead of the paper file', 'H', 'Working a complete file in the case management system', '', '', '', '', 'Workshop 20 Oct 2026', 'Approved'),
    row('CI-002', 'Finance', 'Finance clerk', 'Fee reconciliation', 'Finance clerks reconcile processing fees from the online payment report instead of mailed cheques', 'M', 'Reading the online payment report', '', '', '', '', 'Workshop 20 Oct 2026', 'Approved'),
    row('CI-003', 'Processing officers', 'Senior processing officer', 'Quality assurance', 'Quality checks sample decisions in the system rather than pulling paper files', 'L', '', '', '', '', '', 'Workshop 20 Oct 2026', 'Approved'),
  ], CIA_WIDTHS);
  await p.xlsx.writeFile(path.join(OUT, 'CIA - Processing.xlsx'));

  const c = new ExcelJS.Workbook();
  sheet(c, 'Impacts', [
    CIA_COLUMNS,
    row('CI-001', 'Client support centre', 'Client support agent', 'Status enquiries', 'Agents answer status enquiries from the case management system instead of emailing the processing team', 'H', 'Finding a file and reading its status', '', '', '', '', 'Workshop 22 Oct 2026', 'Approved'),
    // The same impact as "CIA - Processing" CI-001, captured again at the joint workshop (rated M here).
    row('CI-002', 'Processing officers', 'Processing officer', 'Application review', 'Processing officers review renewal applications in the case management system rather than on the paper file', 'M', '', '', '', '', '', 'Joint workshop 22 Oct 2026', 'Approved'),
    row('CI-003', 'Client support centre', 'Client support agent', 'Call handling', 'Agents use the paper permit request script for clients who ask for a paper permit', 'L', '', '', '', '', '', 'Workshop 22 Oct 2026', 'Rejected'),
    row('CI-004', 'Client support centre', 'Client support agent', 'Refunds', 'Refund requests are submitted through an online form instead of by mail', 'M', 'Walking a client through the refund form', '', '', '', '', 'Workshop 22 Oct 2026', 'Proposed'),
  ], CIA_WIDTHS);
  await c.xlsx.writeFile(path.join(OUT, 'CIA - Client services.xlsx'));

  const r = new ExcelJS.Workbook();
  sheet(r, 'Roles', [
    ['Role', 'Stakeholder group', 'Headcount', 'Notes'],
    ['Processing officer', 'Processing officers', 42, 'Works renewal files end to end'],
    ['Senior processing officer', 'Processing officers', 8, 'Approves overrides and runs quality checks'],
    ['Client support agent', 'Client support centre', 35, 'Phone and chat, English and French'],
    ['Client support supervisor', 'Client support centre', 5, 'Call reports and escalations'],
    ['Finance clerk', 'Finance', 6, 'Fee reconciliation and refunds'],
  ], [28, 24, 11, 44]);
  await r.xlsx.writeFile(path.join(OUT, 'Roles.xlsx'));
}

// ------------------------------------------------------------------ glossary
const GLOSSARY = [
  ['permit', 'permis', ''], ['work permit', 'permis de travail', ''], ['study permit', "permis d'études", ''],
  ['renewal', 'renouvellement', ''], ['renewal application', 'demande de renouvellement', 'Not "requête"'],
  ['applicant', 'demandeur; demandeuse', ''], ['online account', 'compte en ligne', ''], ['processing time', 'délai de traitement', ''],
  ['biometrics', 'données biométriques', ''], ['supporting documents', 'pièces justificatives', ''], ['processing fee', 'frais de traitement', ''],
  ['expiry date', "date d'expiration", ''], ['case officer', 'agent responsable du dossier; agente responsable du dossier', ''],
  ['decision letter', 'lettre de décision', ''], ['eligibility', 'admissibilité', ''], ['notice', 'avis', ''], ['status', 'statut', ''],
  ['identity document', "pièce d'identité", ''], ['proof of payment', 'preuve de paiement', ''],
  ['temporary resident', 'résident temporaire; résidente temporaire', ''], ['permanent resident', 'résident permanent; résidente permanente', ''],
  ['sign in', 'se connecter; connectez-vous', 'Not "login"'], ['upload', 'téléverser; téléversez', ''], ['deadline', 'date limite', ''],
  ['refund', 'remboursement', ''], ['request for information', 'demande de renseignements', ''],
  ['case management system', 'système de gestion des cas', ''], ['service standard', 'norme de service', ''],
  ['client support centre', 'centre de soutien à la clientèle', ''], ['GCKey', 'GCKey', 'Product name'],
];

async function glossary() {
  const wb = new ExcelJS.Workbook();
  sheet(wb, 'Glossary', [['English', 'Français', 'Do not translate', 'Notes'], ...GLOSSARY.map(([en, fr, note]) => [en, fr, en === 'GCKey' ? 'Yes' : '', note])], [28, 44, 16, 30]);
  await wb.xlsx.writeFile(path.join(OUT, 'EN-FR Glossary.xlsx'));
}

// ------------------------------------------------------------------ EN/FR guide pair
const EN = `# Renewing your permit online

This guide explains how an applicant renews a work permit or a study permit through the online account.

## Before you start

Sign in with your GCKey and check the expiry date on your permit. You can submit a renewal application up to 90 days before the expiry date.

Upload your supporting documents and a recent photo. Each file must be smaller than 4 MB.

Pay the processing fee of $85 by credit card. Keep the proof of payment for your records.

## After you apply

Biometrics are reused from your last application if they were collected less than 10 years ago.

The service standard is 30 days. You can check the processing time and your status in the online account.

If the case officer needs more information, you will receive a request for information. Reply before the deadline shown in the notice.

If your renewal application is refused, the processing fee is not returned. A refund is issued only when a renewal application is withdrawn before review starts.

The decision letter is sent to your online account. For help, contact the client support centre at 1-800-555-0199.
`;
// Seeded: "requête de renouvellement" (glossary says "demande de renouvellement"), 60 jours instead of 30 days,
// and the refund paragraph is missing.
const FR = `# Renouveler votre permis en ligne

Ce guide explique comment un demandeur renouvelle un permis de travail ou un permis d'études au moyen du compte en ligne.

## Avant de commencer

Connectez-vous avec votre GCKey et vérifiez la date d'expiration de votre permis. Vous pouvez présenter une requête de renouvellement jusqu'à 90 jours avant la date d'expiration.

Téléversez vos pièces justificatives et une photo récente. Chaque fichier doit être inférieur à 4 Mo.

Payez les frais de traitement de 85 $ par carte de crédit. Conservez la preuve de paiement pour vos dossiers.

## Après avoir présenté votre demande

Les données biométriques de votre dernière demande sont réutilisées si elles ont été recueillies il y a moins de 10 ans.

La norme de service est de 60 jours. Vous pouvez consulter le délai de traitement et votre statut dans le compte en ligne.

Si l'agent responsable du dossier a besoin de plus de renseignements, vous recevrez une demande de renseignements. Répondez avant la date limite indiquée dans l'avis.

La lettre de décision est envoyée à votre compte en ligne. Pour obtenir de l'aide, communiquez avec le centre de soutien à la clientèle au 1-800-555-0199.
`;

async function guides() {
  fs.writeFileSync(path.join(OUT, 'Renewal guide (EN).docx'), (await toDocx(EN, { title: 'Renewing your permit online' })).buffer);
  fs.writeFileSync(path.join(OUT, 'Guide de renouvellement (FR).docx'), (await toDocx(FR, { title: 'Renouveler votre permis en ligne' })).buffer);
}

(async () => {
  interviews(); await cia(); await glossary(); await guides();
  fs.writeFileSync(path.join(OUT, 'START HERE.md'), `# Online Permit Renewal — change, training and bilingual sample

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

Regenerate with \`node scripts/make-change-sample.js\`.
`);
  console.log(`Change sample written to ${OUT}`);
})();
