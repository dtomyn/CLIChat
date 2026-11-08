// Generates the data engineering sample pack in ./samples/data (synthetic permit applications, no real data):
//   - Applications - source extract.csv: 40 source rows with seeded defects the profiler must catch:
//       bad dates (lines 8 and 20), a blank mandatory APP_TYPE (lines 13 and 28), an orphan CLIENT_ID (line 24),
//       a STATUS_CD outside the allowed list (line 32), a duplicate APP_ID (line 36), an APP_ID that breaks the
//       pattern (line 39) and a fee outlier (line 16).
//   - Clients - source extract.csv: the 20 clients the applications point at (foreign key target).
//   - Source DDL - Applications.sql: CREATE TABLE for the two source tables (Bronze).
//   - Silver - Canonical Application.schema.json: the Silver / EDR canonical model (JSON Schema) with two fields the
//     source does not have (channelCode, languageCode); INTERNAL_NOTE_TXT has no target.
//   - Gold - Application model.sql: the Gold star schema (fact_application, dim_client).
//   - Data Dictionary - Applications.xlsx: fields with type, required, allowed values, pattern, unique and references.
// Run:  node scripts/make-data-sample.js

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const OUT = process.env.DATA_OUT ? path.resolve(process.env.DATA_OUT) : path.join(__dirname, '..', 'samples', 'data');
fs.mkdirSync(OUT, { recursive: true });
const CREATED = new Date('2026-11-01T00:00:00Z');
const HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
const csv = (rows) => rows.map((r) => r.map((v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n') + '\n';

// ------------------------------------------------------------------ clients
const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Robin', 'Drew', 'Charlie', 'Emerson', 'Hayden', 'Kai', 'Logan', 'Parker', 'Rowan', 'Skyler'];
const LAST = ['Tremblay', 'Martin', 'Roy', 'Gagnon', 'Lee', 'Wilson', 'Johnson', 'MacDonald', 'Taylor', 'Campbell', 'Anderson', 'Smith', 'Brown', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'White'];
const PROV = ['ON', 'QC', 'BC', 'AB', 'NS', 'MB', 'SK', 'NB'];
const clients = FIRST.map((f, i) => [`C-${1001 + i}`, f, LAST[i], `19${60 + ((i * 7) % 40)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + ((i * 3) % 28)).padStart(2, '0')}`, PROV[i % PROV.length], i % 3 === 0 ? 'FR' : 'EN']);
fs.writeFileSync(path.join(OUT, 'Clients - source extract.csv'), csv([['CLIENT_ID', 'FIRST_NM', 'LAST_NM', 'BIRTH_DT', 'PROVINCE_CD', 'PREF_LANG_CD'], ...clients]));

// ------------------------------------------------------------------ applications
const TYPES = ['RENEWAL', 'RENEWAL', 'NEW', 'AMEND'];
const FEES = { RENEWAL: '120.00', NEW: '340.00', AMEND: '60.00' };
const STATUS = ['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'APPROVED', 'REFUSED', 'DRAFT'];
const apps = [];
for (let i = 0; i < 40; i++) {
  const type = TYPES[i % TYPES.length];
  const c = clients[(i * 3) % clients.length];
  const d = new Date(Date.UTC(2026, 0, 5) + i * 4 * 86400000);
  const day = d.toISOString().slice(0, 10);
  apps.push([
    `AP${String(1001001 + i).padStart(7, '0')}`, c[0], type, day, STATUS[i % STATUS.length], FEES[type], c[4],
    `${c[1].toLowerCase()}.${c[2].toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
    i % 5 === 0 ? 'Called client to confirm address' : '', `${day} ${String(9 + (i % 8)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`,
  ]);
}
// Seeded defects. Data row k is on line k + 1 of the file (the header is line 1).
const at = (line) => apps[line - 2];
at(8)[3] = '2026-02-30';          // a date that does not exist
at(20)[3] = '15/13/2026';         // month 13
at(13)[2] = '';                   // mandatory APP_TYPE blank
at(28)[2] = '';
at(24)[1] = 'C-1999';             // no such client
at(32)[4] = 'PENDING';            // not an allowed status
at(36)[0] = at(35)[0];            // duplicate key
at(39)[0] = 'ap1001038';          // breaks the AP9999999 pattern
at(16)[5] = '12000.00';           // fee outlier
const HEAD = ['APP_ID', 'CLIENT_ID', 'APP_TYPE', 'SUBMIT_DT', 'STATUS_CD', 'FEE_AMT', 'PROVINCE_CD', 'EMAIL_ADDR', 'INTERNAL_NOTE_TXT', 'LAST_UPD_TS'];
fs.writeFileSync(path.join(OUT, 'Applications - source extract.csv'), csv([HEAD, ...apps]));

// ------------------------------------------------------------------ source DDL (Bronze)
fs.writeFileSync(path.join(OUT, 'Source DDL - Applications.sql'), `-- Source system extract tables (synthetic), landed as-is in the Bronze layer.

CREATE TABLE src.CLIENTS (
  CLIENT_ID     VARCHAR(10)  NOT NULL PRIMARY KEY, -- Client number, C-9999
  FIRST_NM      VARCHAR(60)  NOT NULL,             -- Given name
  LAST_NM       VARCHAR(60)  NOT NULL,             -- Family name
  BIRTH_DT      DATE,                              -- Date of birth
  PROVINCE_CD   CHAR(2),                           -- Province or territory of residence
  PREF_LANG_CD  CHAR(2)                            -- Preferred official language, EN or FR
);

CREATE TABLE src.APPLICATIONS (
  APP_ID            VARCHAR(9)    NOT NULL,        -- Application number, AP9999999
  CLIENT_ID         VARCHAR(10)   NOT NULL REFERENCES src.CLIENTS (CLIENT_ID), -- Applicant
  APP_TYPE          VARCHAR(10)   NOT NULL,        -- NEW, RENEWAL or AMEND
  SUBMIT_DT         DATE          NOT NULL,        -- Date the application was submitted
  STATUS_CD         VARCHAR(12)   NOT NULL,        -- Processing status
  FEE_AMT           DECIMAL(10,2) NOT NULL,        -- Fee paid
  PROVINCE_CD       CHAR(2),                       -- Province of the application
  EMAIL_ADDR        VARCHAR(120),                  -- Contact email
  INTERNAL_NOTE_TXT VARCHAR(500),                  -- Free-text officer note (not migrated)
  LAST_UPD_TS       TIMESTAMP     NOT NULL,        -- Last change in the source system
  CONSTRAINT PK_APPLICATIONS PRIMARY KEY (APP_ID),
  CONSTRAINT CK_APP_TYPE CHECK (APP_TYPE IN ('NEW', 'RENEWAL', 'AMEND'))
);
`);

// ------------------------------------------------------------------ Silver canonical model
const silver = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://example.org/schemas/silver/application.json',
  title: 'Application',
  description: 'Canonical permit application (Silver / EDR layer). Synthetic sample.',
  'x-layer': 'Silver',
  type: 'object',
  required: ['applicationId', 'clientId', 'applicationType', 'submittedOn', 'statusCode', 'feeAmount', 'channelCode', 'lastUpdatedAt'],
  properties: {
    applicationId: { type: 'string', pattern: 'AP[0-9]{7}', description: 'Application number' },
    clientId: { type: 'string', description: 'Client number', 'x-references': 'Client.clientId' },
    applicationType: { type: 'string', enum: ['NEW', 'RENEWAL', 'AMEND'], description: 'Kind of application' },
    submittedOn: { type: 'string', format: 'date', description: 'Date submitted' },
    statusCode: { type: 'string', enum: ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REFUSED'] },
    feeAmount: { type: 'number', description: 'Fee paid, in dollars' },
    provinceCode: { type: ['string', 'null'], description: 'Province or territory (ISO 3166-2:CA suffix)' },
    emailAddress: { type: ['string', 'null'], format: 'email' },
    channelCode: { type: 'string', enum: ['ONLINE', 'PAPER', 'COUNTER'], description: 'How the application arrived (not in the source extract)' },
    languageCode: { type: ['string', 'null'], enum: ['EN', 'FR', null], description: 'Language of correspondence' },
    lastUpdatedAt: { type: 'string', format: 'date-time', description: 'Last change in the source' },
  },
};
fs.writeFileSync(path.join(OUT, 'Silver - Canonical Application.schema.json'), JSON.stringify(silver, null, 2) + '\n');

// ------------------------------------------------------------------ Gold model
fs.writeFileSync(path.join(OUT, 'Gold - Application model.sql'), `-- Gold layer star schema for reporting (synthetic).

CREATE TABLE gold.dim_client (
  client_key      BIGINT      NOT NULL, -- Surrogate key
  client_id       VARCHAR(10) NOT NULL, -- Business key from Silver
  province_code   CHAR(2),
  language_code   CHAR(2),
  CONSTRAINT pk_dim_client PRIMARY KEY (client_key)
);

CREATE TABLE gold.fact_application (
  application_key  BIGINT        NOT NULL, -- Surrogate key
  application_id   VARCHAR(9)    NOT NULL, -- Business key from Silver
  client_key       BIGINT        NOT NULL REFERENCES gold.dim_client (client_key),
  application_type VARCHAR(10)   NOT NULL,
  submitted_date   DATE          NOT NULL,
  status_code      VARCHAR(12)   NOT NULL,
  channel_code     VARCHAR(10),
  fee_amount       DECIMAL(10,2) NOT NULL,
  CONSTRAINT pk_fact_application PRIMARY KEY (application_key)
);
`);

// ------------------------------------------------------------------ data dictionary
async function dictionary() {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Lumen sample'; wb.created = CREATED; wb.modified = CREATED;
  const ws = wb.addWorksheet('Dictionary');
  const cols = [['Entity', 16], ['Field', 20], ['Type', 14], ['Required', 10], ['Unique', 8], ['Allowed values', 40], ['Pattern', 14], ['References', 20], ['Description', 50]];
  ws.addRow(cols.map((c) => c[0]));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = HEADER; ws.views = [{ state: 'frozen', ySplit: 1 }];
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; });
  const rows = [
    ['APPLICATIONS', 'APP_ID', 'VARCHAR(9)', 'Yes', 'Yes', '', 'AP[0-9]{7}', '', 'Application number'],
    ['APPLICATIONS', 'CLIENT_ID', 'VARCHAR(10)', 'Yes', '', '', '', 'CLIENTS.CLIENT_ID', 'Applicant'],
    ['APPLICATIONS', 'APP_TYPE', 'VARCHAR(10)', 'Yes', '', 'NEW, RENEWAL, AMEND', '', '', 'Kind of application'],
    ['APPLICATIONS', 'SUBMIT_DT', 'DATE', 'Yes', '', '', '', '', 'Date the application was submitted'],
    ['APPLICATIONS', 'STATUS_CD', 'VARCHAR(12)', 'Yes', '', 'DRAFT, SUBMITTED, IN_REVIEW, APPROVED, REFUSED', '', '', 'Processing status'],
    ['APPLICATIONS', 'FEE_AMT', 'DECIMAL(10,2)', 'Yes', '', '', '', '', 'Fee paid'],
    ['APPLICATIONS', 'PROVINCE_CD', 'CHAR(2)', 'No', '', 'NL, PE, NS, NB, QC, ON, MB, SK, AB, BC, YT, NT, NU', '', '', 'Province of the application'],
    ['APPLICATIONS', 'EMAIL_ADDR', 'VARCHAR(120)', 'No', '', '', '', '', 'Contact email (personal information)'],
    ['APPLICATIONS', 'INTERNAL_NOTE_TXT', 'VARCHAR(500)', 'No', '', '', '', '', 'Free-text officer note. Not migrated'],
    ['APPLICATIONS', 'LAST_UPD_TS', 'TIMESTAMP', 'Yes', '', '', '', '', 'Last change in the source system'],
    ['CLIENTS', 'CLIENT_ID', 'VARCHAR(10)', 'Yes', 'Yes', '', 'C-[0-9]{4}', '', 'Client number'],
    ['CLIENTS', 'FIRST_NM', 'VARCHAR(60)', 'Yes', '', '', '', '', 'Given name (personal information)'],
    ['CLIENTS', 'LAST_NM', 'VARCHAR(60)', 'Yes', '', '', '', '', 'Family name (personal information)'],
    ['CLIENTS', 'BIRTH_DT', 'DATE', 'No', '', '', '', '', 'Date of birth (personal information)'],
    ['CLIENTS', 'PROVINCE_CD', 'CHAR(2)', 'No', '', 'NL, PE, NS, NB, QC, ON, MB, SK, AB, BC, YT, NT, NU', '', '', 'Province of residence'],
    ['CLIENTS', 'PREF_LANG_CD', 'CHAR(2)', 'No', '', 'EN, FR', '', '', 'Preferred official language'],
  ];
  for (const r of rows) ws.addRow(r).alignment = { vertical: 'top', wrapText: true };
  const about = wb.addWorksheet('About');
  about.addRow(['Synthetic data dictionary for the Lumen data engineering sample. Required, Unique, Allowed values, Pattern (regular expression) and References (ENTITY.FIELD) are checked by the profiler.']);
  about.getColumn(1).width = 120;
  await wb.xlsx.writeFile(path.join(OUT, 'Data Dictionary - Applications.xlsx'));
}

// ------------------------------------------------------------------ start here
fs.writeFileSync(path.join(OUT, 'START HERE.md'), `# Data engineering sample (synthetic)

Permit applications moving from a source extract (Bronze) to a Silver canonical model and a Gold star schema. All names and values are made up. Open this folder as the notebook.

| File | What it is |
|---|---|
| **Applications - source extract.csv** | 40 source rows with seeded data quality defects |
| **Clients - source extract.csv** | The 20 clients the applications point at (foreign key target) |
| **Source DDL - Applications.sql** | CREATE TABLE for the two source tables |
| **Silver - Canonical Application.schema.json** | The Silver / EDR canonical model (JSON Schema) |
| **Gold - Application model.sql** | Gold star schema: fact_application and dim_client |
| **Data Dictionary - Applications.xlsx** | Type, required, unique, allowed values, pattern and references for each field |

What profiling *Applications - source extract.csv* against the dictionary should find (line numbers count the header as line 1):

- **Bad dates:** SUBMIT_DT on line 8 (2026-02-30) and line 20 (15/13/2026).
- **Mandatory field blank:** APP_TYPE on lines 13 and 28.
- **Orphan foreign key:** CLIENT_ID C-1999 on line 24 is not in the clients file.
- **Value not allowed:** STATUS_CD PENDING on line 32.
- **Duplicate key:** APP_ID on line 36 repeats line 35.
- **Pattern:** APP_ID ap1001038 on line 39.
- **Outlier:** FEE_AMT 12000.00 on line 16.

Comparing the source *APPLICATIONS* table with the Silver model should match 9 fields, and leave INTERNAL_NOTE_TXT (source) and channelCode and languageCode (target) unmatched.

Try the **Data** prompts in order: **Profile a dataset**, **Compare schemas**, **Draft the STTM**, then approve a few rows in the STTM workbook (Status = Approved, your name in Reviewer) and run **Generate pipeline code from the STTM**.

Regenerate with \`node scripts/make-data-sample.js\`.
`);

dictionary().then(() => console.log(`Data sample written to ${OUT}`));
