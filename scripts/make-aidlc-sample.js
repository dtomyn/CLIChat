// Generates the "Online Permit Renewal" AIDLC sample pack in ./samples/aidlc:
//   - Knowledge/   the program knowledge layer: PID (scope), BRD (Word), Solution Blueprint, Ways of Working, Data Model
//   - Requirements Traceability (sample).xlsx: business requirements → refined requirements → functional design
//                  → technical design → backlog, plus a change log
// All data is synthetic. It follows the meeting suggestion of building local-development data on the Excel
// structure, and deliberately includes one-to-many links, a changed requirement, a withdrawn requirement,
// a scope conflict between sources, ambiguity, a broken link, a duplicate ID and a story that skips design.
// Swap the sheet/column layout for the program's real TRM structure when it is agreed.
// Run:  node scripts/make-aidlc-sample.js

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const OUT = path.join(__dirname, '..', 'samples', 'aidlc');
const KB = path.join(OUT, 'Knowledge');
fs.mkdirSync(KB, { recursive: true });
const PROGRAM = 'Online Permit Renewal';
const AGENCY = 'Contoso Licensing Agency';

// ------------------------------------------------------------------ tiny .docx writer (stored zip, no dependencies)
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8'), fname = Buffer.from(name, 'utf8'), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fname.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fname.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, fname, data); centrals.push(central, fname);
    offset += 30 + fname.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (t, bold) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
const para = (t, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${run(t)}</w:p>`;
const bullet = (t) => `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(t)}</w:p>`;
const tableXml = (rows) => `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${rows.map((r, i) => `<w:tr>${r.map((c) => `<w:tc><w:p>${run(c, i === 0)}</w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240"/></w:pPr><w:rPr><w:b/><w:color w:val="2F3B8F"/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
function docx(file, blocks) {
  const body = blocks.join('');
  fs.writeFileSync(file, zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>',
    'word/styles.xml': STYLES,
    'word/numbering.xml': NUMBERING,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200"/></w:sectPr></w:body></w:document>`,
  }));
}

// ------------------------------------------------------------------ the requirements (single source for the BRD and the workbook)
// [id, requirement, priority, BRD section, status, last changed]
const BR = [
  ['BR-001', 'Applicants can renew an existing permit online without visiting an office.', 'Must', '§3.1', 'Approved', '2026-09-01'],
  ['BR-002', 'The system checks that an applicant is eligible to renew before they pay: the permit expired no more than 90 days ago and there is no active enforcement hold.', 'Must', '§3.2', 'Approved', '2026-09-01'],
  ['BR-003', 'Applicants pay the renewal fee online by credit or debit card and receive a receipt.', 'Must', '§3.3', 'Approved', '2026-09-01'],
  ['BR-004', 'Applicants upload a photo that meets the photo standard and was taken within the last 6 months.', 'Must', '§3.4', 'Changed', '2026-10-28'],
  ['BR-005', 'Agents review renewals that fail automated checks in a timely manner, in the case management system.', 'Must', '§3.5', 'Approved', '2026-09-01'],
  ['BR-006', 'The online service meets WCAG 2.1 AA and is fully available in English and French.', 'Must', '§4.1', 'Approved', '2026-09-01'],
  ['BR-007', 'Applicants receive status notifications by email and SMS when they submit, and when the renewal is approved or refused.', 'Should', '§3.6', 'Approved', '2026-09-01'],
  ['BR-008', 'Applicants can ask for a paper permit to be mailed to them.', 'Could', '§3.7', 'Withdrawn', '2026-10-15'],
];

const RR = [
  ['BR-001.1', 'BR-001', 'A signed-in applicant can start a renewal for any permit they hold that is inside the renewal window.', 'Functional', 'Given a permit inside the window, when the applicant selects Renew, then a renewal application opens pre-filled with the permit details.', 'Approved', '2026-09-08'],
  ['BR-001.2', 'BR-001', 'An applicant can save a renewal and resume it within 30 days.', 'Functional', 'Given a saved renewal less than 30 days old, when the applicant signs in, then they can continue where they stopped.', 'Approved', '2026-09-08'],
  ['BR-002.1', 'BR-002', 'Renewal is blocked if the permit expired more than 90 days ago, with a message explaining what to do instead.', 'Business rule', 'Given a permit expired 91+ days ago, when eligibility is checked, then renewal is blocked and the new-application route is shown.', 'Approved', '2026-09-08'],
  ['BR-002.2', 'BR-002', 'Renewal is blocked if there is an active enforcement hold, without disclosing the hold details.', 'Business rule', 'Given an active hold, when eligibility is checked, then renewal is blocked with a generic "contact us" message.', 'Approved', '2026-09-08'],
  ['BR-002.3', 'BR-002', 'The eligibility decision and its reason are recorded on the case.', 'Data', 'Every eligibility check writes outcome, reason code and timestamp to the case.', 'Approved', '2026-09-08'],
  ['BR-003.1', 'BR-003', 'The fee is calculated from the permit type and paid by credit or debit card before the application is submitted.', 'Functional', 'Given a permit type, the fee shown matches the fee schedule; submission is only possible after a successful payment.', 'Approved', '2026-09-08'],
  ['BR-003.2', 'BR-003', 'The applicant receives a receipt for the payment.', 'Functional', 'A receipt with amount, date and reference is shown and emailed.', 'Approved', '2026-09-08'],
  ['BR-004.1', 'BR-004', 'The uploaded photo is a JPEG or PNG, at most 5 MB, and was taken within the last 12 months.', 'Business rule', 'Files that fail any check are rejected with a reason.', 'Approved', '2026-09-08'],
  ['BR-005.1', 'BR-005', 'Renewals that fail automated checks are routed to the agent review queue.', 'Functional', 'Given a failed check, a work item is created in the agent queue with the failure reason.', 'Approved', '2026-09-08'],
  ['BR-006.1', 'BR-006', 'All screens meet WCAG 2.1 AA.', 'Non-functional', 'Automated and manual accessibility tests pass at AA.', 'Approved', '2026-09-08'],
  ['BR-006.2', 'BR-006', 'All screens and notifications are available in English and French.', 'Non-functional', 'Language toggle on every screen; all notifications in the applicant\'s chosen language.', 'Approved', '2026-09-08'],
  ['BR-007.1', 'BR-007', 'Status notifications are sent by email and SMS on submission, approval and refusal.', 'Functional', 'Each status change sends one email and one SMS.', 'Draft', '2026-09-08', 'PID v1.2 puts SMS out of scope for Release 1. Which source is right?'],
  ['BR-008.1', 'BR-008', 'The applicant can choose to have a paper permit mailed.', 'Functional', 'A "mail me a paper permit" option appears on the summary page.', 'Approved', '2026-09-08'],
];

// [id, title, type, description, business rules, traces to, status, last changed]
const FD = [
  ['FD-010', 'My permits — start renewal', 'Screen', 'Lists the applicant\'s permits with a Renew action on those inside the renewal window.', 'Renew shown only inside the window (90 days before to 90 days after expiry).', 'BR-001.1', 'Approved', '2026-09-20'],
  ['FD-011', 'Renewal application and save/resume', 'Process', 'Multi-step form pre-filled from the permit; Save and exit at any step; drafts kept 30 days.', 'Drafts older than 30 days are deleted with an email warning at day 25.', 'BR-001.1, BR-001.2', 'Approved', '2026-09-20'],
  ['FD-012', 'Eligibility checks', 'Business rule', 'Runs expiry and enforcement-hold checks before payment and records the outcome on the case.', 'Expired > 90 days → new-application route. Active hold → generic contact message (no details).', 'BR-002.1, BR-002.2, BR-002.3', 'Approved', '2026-09-20'],
  ['FD-013', 'Fee and payment', 'Process', 'Shows the fee for the permit type and hands off to the payment page; returns with the payment result.', 'Submission only after an approved payment. Receipt shown and emailed.', 'BR-003.1, BR-003.2', 'Approved', '2026-09-15'],
  ['FD-014', 'Photo upload and validation', 'Screen', 'Upload or take a photo; checks file type, size and photo date.', 'JPEG/PNG, ≤ 5 MB, taken within 12 months.', 'BR-004.1', 'Approved', '2026-09-30'],
  ['FD-015', 'Status notifications', 'Notification', 'Sends submission, approval and refusal messages, including the payment receipt on submission.', 'Email and SMS, in the applicant\'s language.', 'BR-007.1, BR-003.2', 'Draft (AI)', '2026-10-02'],
  ['FD-016', 'Renewal dashboard', 'Screen', 'Shows the status of all of the applicant\'s renewals.', 'Statuses: Draft, Submitted, In review, Approved, Refused.', 'BR-009.1', 'Draft (AI)', '2026-10-05'],
  ['FD-017', 'Paper permit option', 'Screen', 'Option on the summary page to have a paper permit mailed.', 'Mailing address must be a Canadian address.', 'BR-008.1', 'Approved', '2026-09-20'],
  ['FD-018', 'Agent review queue', 'Process', 'Failed checks create a work item for agents, with the failure reason and the eligibility record.', 'Queue ordered by permit expiry date.', 'BR-002.3, BR-005.1', 'Approved', '2026-09-20'],
];

// [id, component, approach, interfaces/data, NFRs, traces to, status, last changed]
const TD = [
  ['TD-100', 'Renewal portal (web)', 'Extend the existing applicant portal with the renewal journey.', 'Enterprise sign-in; Case API; Document store', 'WCAG 2.1 AA, EN/FR', 'FD-010, FD-011, FD-014', 'Approved', '2026-09-25'],
  ['TD-101', 'Eligibility service', 'Rules in the case management rules engine, exposed as an API.', 'Case API (read permit, holds); writes Eligibility Decision', 'p95 < 2 s', 'FD-012', 'Approved', '2026-09-25'],
  ['TD-102', 'Payment gateway integration', 'Hosted payment page on the enterprise payment gateway (no card data in our systems).', 'Gateway redirect + webhook; Payment entity', 'PCI scope stays with the gateway', 'FD-013', 'Approved', '2026-09-25'],
  ['TD-103', 'Notification integration', 'Use the enterprise notification service. Email channel only today.', 'Notification API; templates EN/FR', 'Retry 3× with back-off', 'FD-015', 'Draft (AI)', '2026-10-03'],
  ['TD-104', 'Case management integration', 'Create and update renewal cases and agent work items in the case management system.', 'Case API; work item queue', 'Idempotent writes', 'FD-012, FD-018', 'Approved', '2026-09-25'],
  ['TD-105', 'Photo validation', 'Server-side checks of type, size and EXIF date; store in the document store.', 'Document store API', 'Max 5 MB; virus scan', 'FD-014', 'Approved', '2026-09-30'],
];

// [id, type, title, parent, description, acceptance criteria, implements, status, last changed]
const BL = [
  ['EP-1', 'Epic', 'Online renewal', '', 'Applicants renew permits online end to end.', '', '', 'Active', '2026-10-01'],
  ['EP-2', 'Epic', 'Agent processing', '', 'Agents handle renewals that need review.', '', '', 'Active', '2026-10-01'],
  ['FT-1.1', 'Feature', 'Start and complete a renewal', 'EP-1', '', '', '', 'Active', '2026-10-01'],
  ['FT-1.2', 'Feature', 'Pay and submit', 'EP-1', '', '', '', 'Active', '2026-10-01'],
  ['FT-2.1', 'Feature', 'Review flagged renewals', 'EP-2', '', '', '', 'Active', '2026-10-01'],
  ['US-101', 'Story', 'Start a renewal from My permits', 'FT-1.1', 'As an applicant, I want to start a renewal from my permit list so that I don\'t re-enter my details.', 'Given a permit inside the window, when I select Renew, then the form opens pre-filled.', 'FD-010, TD-100', 'Ready', '2026-10-01'],
  ['US-102', 'Story', 'Save and resume a renewal', 'FT-1.1', 'As an applicant, I want to save my renewal so that I can finish it later.', 'Given a saved draft under 30 days old, when I sign in, then I can resume it.', 'FD-011, TD-100', 'Ready', '2026-10-01'],
  ['US-103', 'Story', 'Check eligibility before payment', 'FT-1.1', 'As an applicant, I want to know early if I can renew so that I don\'t pay for nothing.', 'Given an expired-91-days permit, when I continue, then I am shown the new-application route.', 'FD-012, TD-101', 'Ready', '2026-10-01'],
  ['US-104', 'Story', 'Upload my photo', 'FT-1.1', 'As an applicant, I want to upload my photo so that my permit has a current picture.', 'Given a JPEG under 5 MB taken within 12 months, when I upload it, then it is accepted.', 'FD-014, TD-105', 'Ready', '2026-10-01'],
  ['US-105', 'Story', 'Pay the renewal fee', 'FT-1.2', 'As an applicant, I want to pay by card so that I can submit my renewal.', 'Given a successful payment, when I return from the payment page, then I can submit.', 'FD-013, TD-102', 'Ready', '2026-10-01'],
  ['US-106', 'Story', 'Get an email when I submit', 'FT-1.2', 'As an applicant, I want an email confirmation so that I know my renewal was received.', 'Given I submit, then I receive an email with my receipt in my language.', 'FD-015, TD-103', 'New', '2026-10-03'],
  ['US-106', 'Story', 'Get an SMS when I submit', 'FT-1.2', 'As an applicant, I want an SMS confirmation so that I know my renewal was received.', 'Given I submit, then I receive an SMS.', 'FD-015', 'New', '2026-10-03'],
  ['US-107', 'Story', 'Work the review queue', 'FT-2.1', 'As an agent, I want flagged renewals in a queue so that I can review them in order.', 'Given a failed check, then a work item appears in my queue with the reason.', 'FD-018, TD-104', 'Ready', '2026-10-01'],
  ['US-108', 'Story', 'Show my receipt', 'FT-1.2', 'As an applicant, I want to see my receipt so that I have proof of payment.', 'Given a successful payment, then a receipt is shown.', 'BR-003', 'New', '2026-10-04'],
  ['US-109', 'Story', 'Renewal reminders', 'FT-1.1', 'As an applicant, I want a reminder before my permit expires so that I renew on time.', 'Given 60 days to expiry, then I get a reminder.', '', 'New', '2026-10-06'],
  ['US-110', 'Story', 'Choose a paper permit', 'FT-1.2', 'As an applicant, I want a paper permit mailed so that I have a physical copy.', 'Given I tick the option, then a mailing request is created.', 'FD-017', 'Ready', '2026-10-01'],
];

const CHANGES = [
  ['2026-10-15', 'BR-008', 'Withdrawn: paper permits descoped from Release 1 (steering committee decision SC-14).', 'Business owner', 'BRD v1.3'],
  ['2026-10-28', 'BR-004', 'Changed: photo must be taken within the last 6 months (was 12 months), following the updated photo standard.', 'Business owner', 'BRD v1.3'],
];

// ------------------------------------------------------------------ Excel helpers
const HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F3B8F' } };
function sheet(wb, name, cols, rows, tab) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: tab ? { argb: tab } : undefined } });
  ws.columns = cols.map(([h, w]) => ({ header: h, key: h, width: w || 14 }));
  rows.forEach((r) => ws.addRow(r));
  const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = HEADER; h.height = 24; h.alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  ws.eachRow((row, i) => { if (i > 1) row.alignment = { vertical: 'top', wrapText: true }; });
  return ws;
}
const date = (s) => new Date(`${s}T00:00:00Z`);
const highlight = (ws, col, re, argb) => ws.eachRow((row, i) => { if (i > 1 && re.test(String(row.getCell(col).value || ''))) row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }; });

async function traceabilityWorkbook() {
  const wb = new ExcelJS.Workbook(); wb.creator = 'AIDLC sample generator';
  const br = sheet(wb, 'Business Requirements', [['Req ID', 10], ['Requirement', 70], ['Priority', 10], ['Source', 22], ['Status', 12], ['Last Changed', 14]],
    BR.map(([id, t, p, s, st, d]) => [id, t, p, `BRD v1.3 ${s}`, st, date(d)]), 'FF2F3B8F');
  const rr = sheet(wb, 'Refined Requirements', [['Req ID', 11], ['Parent BR', 11], ['Statement', 60], ['Type', 15], ['Acceptance Criteria', 60], ['Status', 12], ['Last Changed', 14], ['Open Questions', 40]],
    RR.map(([id, p, s, t, ac, st, d, q]) => [id, p, s, t, ac, st, date(d), q || '']), 'FF3A7BD5');
  const fd = sheet(wb, 'Functional Design', [['FD ID', 9], ['Title', 32], ['Type', 14], ['Description', 55], ['Business Rules', 50], ['Traces To', 26], ['Status', 12], ['Last Changed', 14]],
    FD.map((r) => [...r.slice(0, 7), date(r[7])]), 'FF7C5CFF');
  const td = sheet(wb, 'Technical Design', [['TD ID', 9], ['Component', 28], ['Approach', 50], ['Interfaces / Data', 40], ['NFRs', 26], ['Traces To', 26], ['Status', 12], ['Last Changed', 14]],
    TD.map((r) => [...r.slice(0, 7), date(r[7])]), 'FFC757D6');
  const bl = sheet(wb, 'Backlog', [['Item ID', 9], ['Type', 9], ['Title', 32], ['Parent', 9], ['Description', 55], ['Acceptance Criteria', 55], ['Implements', 20], ['Status', 10], ['Last Changed', 14]],
    BL.map((r) => [...r.slice(0, 8), date(r[8])]), 'FFFF8A5B');
  sheet(wb, 'Change Log', [['Date', 12], ['Req ID', 10], ['Change', 80], ['Changed By', 16], ['Version', 10]], CHANGES.map(([d, ...r]) => [date(d), ...r]), 'FF888888');
  for (const ws of [br, rr, fd, td, bl]) {
    const statusCol = ws.getRow(1).values.indexOf('Status');
    highlight(ws, statusCol, /^Changed/, 'FFFFE08A'); highlight(ws, statusCol, /^Withdrawn/, 'FFF4B6B6'); highlight(ws, statusCol, /Draft/, 'FFE6E0FF');
  }
  for (const ws of wb.worksheets) ws.eachRow((row, i) => { if (i > 1) row.eachCell((c) => { if (c.value instanceof Date) c.numFmt = 'yyyy-mm-dd'; }); });
  await wb.xlsx.writeFile(path.join(OUT, 'Requirements Traceability (sample).xlsx'));
}

async function dataModel() {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Data architecture';
  sheet(wb, 'Entities', [['Entity', 22], ['Description', 60], ['System of record', 26], ['Owner', 18]], [
    ['Applicant', 'A person who holds or applies for a permit.', 'Identity + Case management', 'Client Services'],
    ['Permit', 'A permit issued to an applicant, with type, number and expiry date.', 'Case management', 'Licensing'],
    ['Renewal Application', 'A request to renew one permit; draft until submitted.', 'Case management', 'Licensing'],
    ['Eligibility Decision', 'Outcome and reason code of an eligibility check.', 'Case management', 'Licensing'],
    ['Enforcement Hold', 'A restriction that blocks renewal. Protected — details are never shown to applicants.', 'Enforcement system', 'Compliance'],
    ['Payment', 'Fee payment reference and status returned by the payment gateway.', 'Payment gateway', 'Finance'],
    ['Photo', 'Applicant photo with capture date and validation result.', 'Document store', 'Licensing'],
    ['Notification', 'A message sent to an applicant, with channel and language.', 'Notification service', 'Client Services'],
  ], 'FF2F3B8F');
  sheet(wb, 'Attributes', [['Entity', 20], ['Attribute', 22], ['Type', 12], ['Required', 10], ['Rules / reference data', 60]], [
    ['Permit', 'permitNumber', 'Text', 'Yes', 'Format PR-########'],
    ['Permit', 'permitType', 'Code', 'Yes', 'Fee schedule: STANDARD $120, COMMERCIAL $340, TEMPORARY $60'],
    ['Permit', 'expiryDate', 'Date', 'Yes', 'Renewal window: 90 days before to 90 days after expiry'],
    ['Renewal Application', 'status', 'Code', 'Yes', 'DRAFT, SUBMITTED, IN_REVIEW, APPROVED, REFUSED'],
    ['Renewal Application', 'draftExpiresOn', 'Date', 'No', 'Created + 30 days'],
    ['Eligibility Decision', 'reasonCode', 'Code', 'Yes', 'OK, EXPIRED_90, HOLD_ACTIVE'],
    ['Photo', 'capturedOn', 'Date', 'Yes', 'Must be within the photo standard\'s age limit'],
    ['Photo', 'fileSizeBytes', 'Number', 'Yes', '≤ 5,242,880'],
    ['Notification', 'channel', 'Code', 'Yes', 'EMAIL (Release 1). SMS planned for Release 2.'],
    ['Notification', 'language', 'Code', 'Yes', 'EN, FR'],
  ], 'FF3A7BD5');
  await wb.xlsx.writeFile(path.join(KB, 'Data Model - Permit Renewal.xlsx'));
}

function documents() {
  docx(path.join(KB, 'PID - Online Permit Renewal v1.2.docx'), [
    para(`${PROGRAM} — Project Initiation Document`, 'Title'),
    para(`${AGENCY} · Version 1.2 · Approved 2026-09-01 by the Program Board · Owner: Program Director (fictional)`),
    para('1. Purpose', 'Heading1'),
    para('Let permit holders renew online, cutting office visits and processing time while keeping eligibility and identity controls.'),
    para('2. Objectives', 'Heading1'),
    bullet('70% of renewals completed online within 12 months of launch.'),
    bullet('Average processing time for straightforward renewals under 2 business days.'),
    bullet('No reduction in the accuracy of eligibility decisions.'),
    para('3. Scope — Release 1', 'Heading1'),
    para('In scope', 'Heading2'),
    bullet('Online renewal of existing permits (all permit types).'),
    bullet('Automated eligibility checks before payment.'),
    bullet('Online card payment through the enterprise payment gateway.'),
    bullet('Photo upload and validation.'),
    bullet('Email notifications of status changes.'),
    bullet('Agent review of renewals that fail automated checks.'),
    para('Out of scope', 'Heading2'),
    bullet('New permit applications.'),
    bullet('SMS notifications (planned for Release 2, when the enterprise notification service adds an SMS channel).'),
    bullet('Changes to the fee schedule.'),
    bullet('Integration with the legacy kiosk system.'),
    para('4. Constraints', 'Heading1'),
    bullet('Bilingual service (English and French) and WCAG 2.1 AA accessibility are mandatory.'),
    bullet('Applicant data is Protected B and must stay in Canadian data centres.'),
    bullet('Reuse enterprise platforms (sign-in, payment, notifications, case management) — no new point solutions.'),
    para('5. Governance', 'Heading1'),
    para('Scope changes require a Program Board decision. Requirements are approved by the Business Owner; design by the Design Authority.'),
  ]);
  docx(path.join(KB, 'BRD - Online Permit Renewal v1.3.docx'), [
    para(`${PROGRAM} — Business Requirements Document`, 'Title'),
    para(`${AGENCY} · Version 1.3 · 2026-10-28 · Owner: Business Owner, Licensing (fictional)`),
    para('1. Background', 'Heading1'),
    para('Permit holders must currently renew in person. Offices handle about 180,000 renewals a year, most of them straightforward.'),
    para('2. Stakeholders', 'Heading1'),
    tableXml([['Stakeholder', 'Interest'], ['Applicants', 'Fast, simple renewal without an office visit'], ['Licensing agents', 'Fewer routine cases; clear queue for exceptions'], ['Compliance', 'Holds respected; hold details never disclosed'], ['Finance', 'Reconciled card payments']]),
    para('3. Business requirements', 'Heading1'),
    tableXml([['ID', 'Requirement', 'Priority', 'Section'], ...BR.map(([id, t, p, s, st]) => [id, st === 'Withdrawn' ? `[WITHDRAWN 2026-10-15] ${t}` : t, p, s])]),
    para('4. Non-functional requirements', 'Heading1'),
    para('See BR-006. Pages load in under 3 seconds for 95% of requests. The service is available 99.5% of the time outside maintenance windows.'),
    para('5. Change history', 'Heading1'),
    tableXml([['Version', 'Date', 'Change'], ['1.2', '2026-09-01', 'Approved baseline'], ['1.3', '2026-10-15', 'BR-008 withdrawn (paper permits descoped, decision SC-14)'], ['1.3', '2026-10-28', 'BR-004 photo age changed from 12 months to 6 months (updated photo standard)']]),
  ]);
  fs.writeFileSync(path.join(KB, 'Solution Blueprint - Permit Renewal.md'), `# ${PROGRAM} — Solution Blueprint

${AGENCY} · Version 0.9 · 2026-09-18 · Owner: Solution Architect (fictional) · Status: Endorsed by the Design Authority

## Target architecture
| Capability | Platform | Notes |
|---|---|---|
| Applicant portal | Existing applicant portal (web) | Extend with the renewal journey; EN/FR; WCAG 2.1 AA |
| Sign-in | Enterprise sign-in | Applicants must be signed in to renew |
| Case management | Case management platform | System of record for permits, renewals, eligibility decisions and agent work items |
| Rules | Case management rules engine | Eligibility rules live here, exposed by an API |
| Payments | Enterprise payment gateway | Hosted payment page; no card data in our systems |
| Notifications | Enterprise notification service | **Email only today.** SMS channel on the platform roadmap for 2027 |
| Documents | Enterprise document store | Photos and receipts |

## Principles
1. Reuse enterprise platforms; no new point solutions.
2. The case management platform is the single system of record for renewal data.
3. Integrations are API-based and idempotent; no file drops.
4. Protected B data stays in Canadian regions.
5. Every screen is bilingual and accessible from day one.

## Open architecture decisions
- AD-07: Where to run photo validation (portal vs. a new service). Leaning toward a server-side service called by the portal.
`);
  fs.writeFileSync(path.join(KB, 'Ways of Working - Delivery.md'), `# Ways of Working — Delivery

${AGENCY} · Version 2.1 · 2026-08-20 · Owner: Delivery Lead (fictional)

## Artifacts and where they live
| Artifact | Lives in | Approved by |
|---|---|---|
| Business requirements (BR-###) | BRD and the Requirements Traceability workbook (TRM) | Business Owner |
| Refined requirements (BR-###.#) | TRM | Business Owner |
| Functional design (FD-###) | TRM + functional design document | Functional Lead |
| Technical design (TD-###) | TRM + technical design document | Solution Architect (Design Authority) |
| Epics, features, stories (EP-#, FT-#.#, US-###) | Azure DevOps (mirrored in TRM "Backlog") | Product Owner |

**Epics, features and stories are delivery containers, not requirements.** Every story must list the FD/TD IDs it implements in the "Implements" field. A story that only references a BR is not Ready.

## Definition of Ready (story)
- Implements at least one approved FD or TD element.
- "As a… I want… so that…" plus 3–6 Given/When/Then acceptance criteria.
- Small enough to finish in one sprint (≤ 8 points).
- Bilingual and accessibility impacts noted.

## Definition of Done (story)
- Acceptance criteria pass in the test environment; accessibility checks pass at AA; EN and FR content reviewed.
- TRM updated (status and links).

## Change control
A changed or withdrawn requirement is logged in the TRM Change Log. All linked design elements and stories are reviewed within 5 business days. AI-generated content is marked "Draft (AI)" until a named approver signs it off.
`);
}

(async () => {
  documents();
  await dataModel();
  await traceabilityWorkbook();
  fs.writeFileSync(path.join(OUT, 'START HERE.md'), `# ${PROGRAM} — AIDLC sample

Synthetic data for trying Lumen's delivery-lifecycle assistants locally: Requirements Refiner, Functional Designer, Technical Designer, Story Writer and Traceability Analyst. Everything here is fictional.

| File | What it is |
|---|---|
| **Requirements Traceability (sample).xlsx** | The traceability workbook (TRM): Business Requirements → Refined Requirements → Functional Design → Technical Design → Backlog, plus a Change Log |
| **Knowledge/PID - Online Permit Renewal v1.2.docx** | Scope, objectives and constraints (Word) |
| **Knowledge/BRD - Online Permit Renewal v1.3.docx** | Business requirements BR-001 to BR-008 (Word) |
| **Knowledge/Solution Blueprint - Permit Renewal.md** | Target architecture and principles |
| **Knowledge/Ways of Working - Delivery.md** | Artifact ownership, Definition of Ready/Done, change control |
| **Knowledge/Data Model - Permit Renewal.xlsx** | Entities and attributes |

## Built-in scenarios
- **One-to-many and many-to-many links:** BR-002 has three refined requirements, and FD-012 realises all three.
- **A changed requirement:** BR-004 (photo age 12 → 6 months). FD-014, TD-105 and US-104 still say 12 months.
- **A withdrawn requirement still linked:** BR-008 (paper permit) → FD-017 → US-110.
- **Conflicting sources:** BR-007 asks for SMS, but the PID and the Solution Blueprint put SMS out of Release 1.
- **Ambiguity:** BR-005 says "in a timely manner".
- **Traceability defects:** FD-016 links to a requirement that doesn't exist (BR-009.1), US-106 is used twice, US-108 traces straight to BR-003 without a design element, US-109 traces to nothing, and BR-006 (accessibility, bilingual) has no design.

## Things to try
- *"Inventory the program knowledge in this folder."*
- *"Refine BR-001 to BR-007 from the BRD and check them against the PID."*
- *"Run a traceability check on the traceability workbook."*
- *"BR-004 has changed. What is affected downstream?"*
- *"Write stories for FD-012 and FD-018."*

Regenerate with \`node scripts/make-aidlc-sample.js\`.
`);
  console.log(`AIDLC sample written to ${OUT}`);
})();
