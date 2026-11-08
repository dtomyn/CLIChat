const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const g = require('../tools/glossary');

const SAMPLE = path.join(__dirname, '..', 'samples', 'change');
const EN = path.join(SAMPLE, 'Renewal guide (EN).docx');
const FR = path.join(SAMPLE, 'Guide de renouvellement (FR).docx');
const GLOSSARY = path.join(SAMPLE, 'EN-FR Glossary.xlsx');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-glossary-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const TERMS = [
  { en: 'renewal application', fr: ['demande de renouvellement'], keep: false, at: 'G!A2' },
  { en: 'renewal', fr: ['renouvellement'], keep: false, at: 'G!A3' },
  { en: 'upload', fr: ['téléverser', 'téléversez'], keep: false, at: 'G!A4' },
  { en: 'GCKey', fr: ['GCKey'], keep: true, at: 'G!A5' },
];

test('the sample glossary has 30 terms, longest first, with a do-not-translate term', async () => {
  const terms = await g.readGlossary(GLOSSARY);
  assert.equal(terms.length, 30);
  assert.ok(terms.findIndex((t) => t.en === 'renewal application') < terms.findIndex((t) => t.en === 'renewal'));
  assert.ok(terms.find((t) => t.en === 'GCKey').keep);
  assert.deepEqual(terms.find((t) => t.en === 'applicant').fr, ['demandeur', 'demandeuse']);
});

test('bilingual QA finds exactly the three seeded issues in the sample pair, and changes nothing', async () => {
  const before = [hash(EN), hash(FR)];
  const r = await g.checkTerminology(EN, FR, GLOSSARY);
  assert.deepEqual([hash(EN), hash(FR)], before);
  assert.deepEqual(r.summary, { terminology: 1, untranslated: 0, numbers: 1, missing: 1, total: 3 });
  const [term, nums, missing] = ['terminology', 'numbers', 'missing'].map((t) => r.findings.find((f) => f.type === t));
  assert.equal(term.term, 'renewal application');
  assert.match(term.frText, /requête de renouvellement/);
  assert.deepEqual([nums.english, nums.french], [['30'], ['60']]);
  assert.equal(missing.fr, null);
  assert.match(missing.enText, /refund is issued/);
  assert.equal(r.paragraphs.en - r.paragraphs.fr, 1);
});

test('numbers, amounts, dates and IDs are compared in each language format', () => {
  assert.deepEqual(g.anchors('Pay $1,250.50 by 15 January 2027 for BR-002 in 2027.', 'en'), g.anchors('Payez 1 250,50 $ avant le 15 janvier 2027 pour BR-002 en 2027.', 'fr'));
  assert.deepEqual(g.anchors('Due January 5, 2027', 'en'), ['date:2027-01-05']);
  const r = g.compare('Form IMM 5444 is due on 2027-03-01.', 'Le formulaire IMM 5445 est dû le 2027-03-01.');
  assert.equal(r.findings.length, 1);
  assert.deepEqual([r.findings[0].english, r.findings[0].french], [['IMM-5444'], ['IMM-5445']]);
});

test('untranslated English, kept terms and missing paragraphs on either side', () => {
  const r = g.compare(
    'Submit your renewal application today.\n\nSign in with GCKey.\n\nUpload your photo.',
    'Soumettez votre demande de renouvellement aujourd’hui.\n\nConnectez-vous avec votre clé.\n\nPlease upload your photo.\n\nParagraphe ajouté sans équivalent anglais, beaucoup plus long que les autres pour être sûr.',
    TERMS,
  );
  const types = r.findings.map((f) => [f.type, f.en, f.fr]);
  assert.ok(types.some(([t, e]) => t === 'terminology' && e === 2), 'GCKey must stay GCKey');
  const upload = r.findings.filter((f) => f.en === 3);
  assert.deepEqual(upload.map((f) => f.type), ['untranslated', 'untranslated'], 'left-in English is not also reported as terminology');
  assert.ok(upload.some((f) => f.words && f.words.includes('please')));
  assert.ok(types.some(([t, e, f]) => t === 'missing' && e === null && f === 4));
  assert.ok(!r.findings.some((f) => f.en === 1), 'renewal application is translated correctly; "renewal" is not checked twice');
});

test('glossary sheets need English and French columns', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Terms').addRow(['Term', 'Meaning']);
  const f = path.join(temp, 'bad.xlsx');
  await wb.xlsx.writeFile(f);
  await assert.rejects(g.readGlossary(f), /English column and a French column/);
  assert.throws(() => g.readText(path.join(temp, 'x.pdf')), /Word document/);
});

test('a French draft saved by save_draft_document is checked without its label and sources, and its title appears once', async () => {
  const change = require('../tools/change');
  const paras = (await g.readText(FR)).replace(/\r/g, '').split(/\n\s*\n/);
  const title = 'Renouveler votre permis en ligne (ébauche)';
  const markdown = `# ${title}\n\n${paras.slice(1).join('\n\n')}`; // the sample's text, as an AI drafts it: its own "# Title" first
  const r = await change.saveDraft(path.join(temp, 'Renewal guide (FR draft).docx'), markdown, { label: 'Machine-drafted, needs translator review', sources: ['Renewal guide (EN).docx'], title });
  const text = await g.readText(r.saved);
  assert.equal(text.split(title).length - 1, 1, 'the title is not repeated under the Word title');
  assert.match(text, /Machine-drafted/);
  const c = await g.checkTerminology(EN, r.saved, GLOSSARY);
  assert.deepEqual(c.summary, { terminology: 1, untranslated: 0, numbers: 1, missing: 1, total: 3 }, c.findings.map((f) => f.detail).join('\n'));
  assert.match(c.findings.find((f) => f.type === 'missing').enText, /refund is issued/);
});
