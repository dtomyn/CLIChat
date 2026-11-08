// Generates the security and SA&A sample pack in ./samples/security (Online Permit Renewal, synthetic):
//   - Control Catalogue (synthetic).xlsx: 20 controls with IDs in the ITSG-33 / NIST style. The wording is Lumen's own
//     short paraphrase, not ITSG-33 or NIST text: a program supplies its own catalogue.
//   - Technical Design - Security.md: the security sections of the TDD that implementation statements cite.
//   - SCTM - Online Permit Renewal.xlsx: a partially filled SCTM with the defects the tools must catch:
//     4 controls in the profile not mapped (AC-7, CM-6, IA-5, SC-12), a statement citing a heading that does not exist
//     (SC-13), a statement with no design reference (IR-4), an applicable Gap with no statement (SI-4), evidence named
//     but not in the folder (CM-2) and an implemented control with no evidence (AC-3).
//   - Evidence/: files named with control IDs, an evidence index workbook that tags one file without an ID in its name
//     (SC-7), one stale file (SI-2, August 2025) and one orphan file (the firewall rule export).
// Run:  node scripts/make-security-sample.js

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { writeSctm } = require('../tools/controls');

const OUT = process.env.SECURITY_OUT ? path.resolve(process.env.SECURITY_OUT) : path.join(__dirname, '..', 'samples', 'security');
const EVIDENCE = path.join(OUT, 'Evidence');
fs.mkdirSync(EVIDENCE, { recursive: true });
const CREATED = new Date('2026-11-01T00:00:00Z');
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
const book = () => { const wb = new ExcelJS.Workbook(); wb.creator = 'Lumen sample'; wb.created = CREATED; wb.modified = CREATED; return wb; };

// ------------------------------------------------------------------ catalogue
const CONTROLS = [
  ['AC-2', 'Access control', 'Account management', 'Accounts are requested, approved, created, reviewed on a schedule and removed when no longer needed.'],
  ['AC-3', 'Access control', 'Access enforcement', 'The system enforces approved permissions when people and services use information and functions.'],
  ['AC-6', 'Access control', 'Least privilege', 'People and services get only the access they need for their role.'],
  ['AC-7', 'Access control', 'Unsuccessful sign-in attempts', 'Repeated failed sign-ins lock the account or slow further attempts.'],
  ['AC-17', 'Access control', 'Remote access', 'Remote administration is allowed only through approved, protected channels.'],
  ['AU-2', 'Audit and accountability', 'Event logging', 'The events the system must log are defined and logged.'],
  ['AU-6', 'Audit and accountability', 'Audit record review', 'Logs are reviewed on a schedule and findings are reported.'],
  ['AU-9', 'Audit and accountability', 'Protection of audit information', 'Logs are protected from change and deletion, and kept for the retention period.'],
  ['CM-2', 'Configuration management', 'Baseline configuration', 'An approved baseline configuration is kept and checked.'],
  ['CM-6', 'Configuration management', 'Configuration settings', 'Security settings follow the approved hardening guide, and exceptions are recorded.'],
  ['IA-2', 'Identification and authentication', 'User identification and authentication', 'Staff are uniquely identified and sign in with multi-factor authentication.'],
  ['IA-5', 'Identification and authentication', 'Authenticator management', 'Passwords, keys and certificates are issued, protected, changed and revoked under a process.'],
  ['IR-4', 'Incident response', 'Incident handling', 'Security incidents are detected, contained, resolved and reviewed under a defined process.'],
  ['SC-7', 'System and communications protection', 'Boundary protection', 'Traffic at the system boundary is controlled and only approved connections are allowed.'],
  ['SC-8', 'System and communications protection', 'Transmission confidentiality and integrity', 'Data in transit is protected with approved encryption.'],
  ['SC-12', 'System and communications protection', 'Cryptographic key management', 'Keys are generated, stored, rotated and destroyed under a process.'],
  ['SC-13', 'System and communications protection', 'Cryptographic protection', 'Only approved cryptographic algorithms are used.'],
  ['SC-28', 'System and communications protection', 'Protection of information at rest', 'Stored data is encrypted with approved encryption.'],
  ['SI-2', 'System and information integrity', 'Flaw remediation', 'Security patches are tested and applied within the agreed time frames.'],
  ['SI-4', 'System and information integrity', 'System monitoring', 'The system is monitored for attacks and unusual activity, and alerts are acted on.'],
];

async function catalogue() {
  const wb = book();
  sheet(wb, 'Controls', [['Control ID', 'Family', 'Title', 'Statement', 'Baseline'], ...CONTROLS.map((c) => [...c, 'Protected B / Medium'])], [11, 30, 36, 80, 20]);
  sheet(wb, 'About', [['About this catalogue'], ['Synthetic sample: 20 controls with ITSG-33 / NIST style IDs. The statements are short paraphrases written for Lumen\'s sample, not the official control text.'], ['Programs supply their own catalogue (Control ID, Family, Title, Statement, Baseline/Profile).']], [110]);
  await wb.xlsx.writeFile(path.join(OUT, 'Control Catalogue (synthetic).xlsx'));
}

// ------------------------------------------------------------------ design
const TDD = `# Online Permit Renewal — Technical Design: Security

Status: Approved · Approved by: Priya Natarajan (Security Architect) · 2026-10-12

## 1 Identity and access

### 1.1 Sign-in and multi-factor authentication
Staff sign in through the department's identity provider (Entra ID) with multi-factor authentication enforced by conditional access. Applicants sign in with the government sign-in service; no applicant passwords are stored in the solution.

### 1.2 Roles and permissions
Permissions are granted through four roles: Applicant, Case Officer, Supervisor and Administrator. Each API checks the caller's role before it reads or changes a case. Administrators cannot approve renewals.

### 1.3 Account lifecycle
Staff accounts come from the HR joiner-mover-leaver feed. Access is requested in the service portal and approved by the supervisor. Supervisors review their team's access every quarter; leavers are disabled within one business day.

### 1.4 Remote administration
Administration is done only from privileged access workstations through the platform's bastion service. There is no direct internet access to management ports.

## 2 Logging and monitoring

### 2.1 Audit events
The solution logs sign-ins, role changes, case decisions, document downloads and configuration changes to the central log workspace.

### 2.2 Log review and alerting
The operations team reviews the security log dashboard weekly. Alerts for repeated failed sign-ins and role changes go to the service desk queue.

### 2.3 Log retention and protection
Logs are kept for two years in an immutable store. Only the security operations group can read them, and nobody can delete them before the retention period ends.

## 3 Data protection

### 3.1 Encryption in transit
All traffic uses TLS 1.2 or higher. Internal service-to-service calls use mutual TLS through the API gateway.

### 3.2 Encryption at rest
Databases and document storage are encrypted with platform-managed encryption. Backups are encrypted the same way.

### 3.3 Key management
Keys and certificates are held in the department's key vault. Certificates are renewed automatically 30 days before expiry.

## 4 Network boundary
The portal is published through the web application firewall. Back-end services sit in a private network with no public addresses; only the API gateway can reach them.

## 5 Configuration and patching

### 5.1 Configuration baseline
Servers and services are built from the platform's hardened templates. Drift from the baseline is reported monthly.

### 5.2 Patch management
Security patches are applied monthly, and critical patches within 14 days, through the platform patching service.
`;

// ------------------------------------------------------------------ SCTM
const T = 'Technical Design - Security.md';
const SCTM = [
  { control: 'AC-2', applicability: 'Applicable', statement: 'Staff accounts are created from the HR joiner-mover-leaver feed, approved by the supervisor, reviewed every quarter and disabled within one business day of leaving.', responsible: 'Program security team', designReference: `${T} > 1.3 Account lifecycle`, evidence: ['AC-2 - Quarterly user access review 2026-10-15.md'], status: 'Implemented' },
  { control: 'AC-3', applicability: 'Applicable', statement: 'Every API checks the caller\'s role (Applicant, Case Officer, Supervisor, Administrator) before reading or changing a case.', responsible: 'Development team', designReference: 'TDD > 1.2 Roles and permissions', evidence: [], status: 'Implemented' },
  { control: 'AC-6', applicability: 'Applicable', statement: 'Four roles limit access to what each job needs; administrators cannot approve renewals.', responsible: 'Development team', designReference: 'TDD > Roles and permissions', evidence: [], status: 'Planned' },
  { control: 'AC-17', applicability: 'Inherited', statement: 'Administration only from privileged access workstations through the platform bastion service.', responsible: 'Cloud platform team', designReference: 'TDD > 1.4 Remote administration', evidence: [], status: 'Planned' },
  { control: 'AU-2', applicability: 'Applicable', statement: 'Sign-ins, role changes, case decisions, document downloads and configuration changes are logged to the central log workspace.', responsible: 'Development team', designReference: `${T} > Audit events`, evidence: ['AU-2 - Audit event list 2026-10-01.md'], status: 'Implemented' },
  { control: 'AU-6', applicability: 'Applicable', statement: 'Operations reviews the security log dashboard weekly; alerts go to the service desk queue.', responsible: 'Operations', designReference: 'TDD > 2.2 Log review and alerting', evidence: [], status: 'Implemented' },
  { control: 'AU-9', applicability: 'Applicable', statement: 'Logs are kept for two years in an immutable store readable only by security operations.', responsible: 'Cloud platform team', designReference: 'TDD > Log retention and protection', evidence: [], status: 'Planned' },
  { control: 'CM-2', applicability: 'Applicable', statement: 'Services are built from the platform\'s hardened templates and drift is reported monthly.', responsible: 'Cloud platform team', designReference: 'TDD > 5.1 Configuration baseline', evidence: ['CM-2 - Configuration baseline scan.md'], status: 'Implemented' },
  { control: 'IA-2', applicability: 'Applicable', statement: 'Staff sign in through Entra ID with multi-factor authentication enforced by conditional access.', responsible: 'Identity team', designReference: 'TDD > 1.1 Sign-in and multi-factor authentication', evidence: ['IA-2 - MFA policy settings 2026-10-20.md'], status: 'Implemented' },
  { control: 'SC-7', applicability: 'Applicable', statement: 'The portal is published through the web application firewall; back-end services have no public addresses.', responsible: 'Cloud platform team', designReference: 'TDD > 4 Network boundary', evidence: [], status: 'Implemented' },
  { control: 'SC-8', applicability: 'Applicable', statement: 'All traffic uses TLS 1.2 or higher, with mutual TLS between services.', responsible: 'Development team', designReference: 'TDD > Encryption in transit', evidence: ['SC-8 - TLS configuration scan 2026-10-02.md'], status: 'Implemented' },
  { control: 'SC-13', applicability: 'Applicable', statement: 'Cryptographic operations use hardware security modules with approved algorithms.', responsible: 'Cloud platform team', designReference: 'TDD > 6.1 Hardware security modules', evidence: ['SC-13 - Approved algorithms 2026-09-15.md'], status: 'Implemented' },
  { control: 'SC-28', applicability: 'Applicable', statement: 'Databases, document storage and backups are encrypted at rest.', responsible: 'Cloud platform team', designReference: `${T} > 3.2 Encryption at rest`, evidence: ['SC-28 - Storage encryption settings 2026-10-02.md'], status: 'Implemented' },
  { control: 'SI-2', applicability: 'Applicable', statement: 'Security patches are applied monthly, and critical patches within 14 days.', responsible: 'Cloud platform team', designReference: 'TDD > Patch management', evidence: ['SI-2 - Monthly patch report 2025-08-29.md'], status: 'Implemented' },
  { control: 'SI-4', applicability: 'Applicable', statement: '', responsible: '', designReference: '', evidence: [], status: 'Gap', notes: 'Onboarding to the department SIEM has not started.' },
  { control: 'IR-4', applicability: 'Applicable', statement: 'Security incidents follow the department\'s incident handling process.', responsible: 'Operations', designReference: '', evidence: [], status: 'Planned' },
];

// ------------------------------------------------------------------ evidence
const EVIDENCE_FILES = {
  'AC-2 - Quarterly user access review 2026-10-15.md': 'Quarterly access review for Q3 2026. 42 staff accounts reviewed by supervisors; 3 removed. Signed off by the program security lead.',
  'AU-2 - Audit event list 2026-10-01.md': 'List of logged events with sample entries from the central log workspace.',
  'AU-6 - Weekly log review 2026-10-28.md': 'Weekly review of the security log dashboard: no high alerts, two failed sign-in alerts closed.',
  'IA-2 - MFA policy settings 2026-10-20.md': 'Conditional access policy export showing MFA required for all staff sign-ins.',
  'SC-8 - TLS configuration scan 2026-10-02.md': 'TLS scan of the portal and API gateway: TLS 1.2 and 1.3 only.',
  'SC-13 - Approved algorithms 2026-09-15.md': 'Key vault and gateway cipher settings compared with the approved algorithm list.',
  'SC-28 - Storage encryption settings 2026-10-02.md': 'Encryption settings for the databases, document storage and backup vault.',
  'SI-2 - Monthly patch report 2025-08-29.md': 'Patch compliance report from August 2025 (before the platform patching service).',
  'Network boundary diagram.md': 'Diagram and description of the web application firewall, API gateway and private network.',
  'Firewall rule export 2026-10-01.md': 'Raw export of the firewall rules. Not yet tied to a control.',
};

async function evidence() {
  for (const f of fs.readdirSync(EVIDENCE)) if (f.endsWith('.md')) fs.rmSync(path.join(EVIDENCE, f));
  for (const [name, body] of Object.entries(EVIDENCE_FILES)) fs.writeFileSync(path.join(EVIDENCE, name), `# ${name.replace(/\.md$/, '')}\n\n${body}\n\n*Synthetic sample evidence.*\n`, 'utf8');
  const wb = book();
  sheet(wb, 'Evidence index', [
    ['File', 'Control(s)', 'Date', 'Description'],
    ['Network boundary diagram.md', 'SC-7', '2026-10-05', 'Boundary design walk-through with the platform team'],
    ['AC-2 - Quarterly user access review 2026-10-15.md', 'AC-2', '2026-10-15', 'Q3 access review'],
  ], [50, 14, 12, 60]);
  await wb.xlsx.writeFile(path.join(EVIDENCE, 'Evidence index.xlsx'));
}

const README = `# Security and SA&A sample (synthetic)

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

Try the prompts **Draft the SCTM**, **Security design document** and **Evidence gap check**. For a Word Security Design Document in the program style, use the TDD template from \`samples/aidlc/Templates\`.

Regenerate with \`node scripts/make-security-sample.js\`.
`;

(async () => {
  await catalogue();
  fs.writeFileSync(path.join(OUT, 'Technical Design - Security.md'), TDD, 'utf8');
  await writeSctm(path.join(OUT, 'SCTM - Online Permit Renewal.xlsx'), SCTM.map((r) => ({ ...r, title: CONTROLS.find((c) => c[0] === r.control)[2] })), { created: CREATED });
  await evidence();
  fs.writeFileSync(path.join(OUT, 'START HERE.md'), README, 'utf8');
  console.log(`Security sample written to ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
