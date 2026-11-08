const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { XMLValidator } = require('fast-xml-parser');
const pptx = require('../tools/pptx');
const change = require('../tools/change');

const TEMPLATE = path.join(__dirname, '..', 'samples', 'change', 'Templates', 'Training Deck Template.potx');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-pptx-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const DECK = `# Processing officer training
The new screen-based review, November 2026

## Why the process changes
- Screen-based review **replaces** paper files
  - Eligibility flags are set automatically
- Overrides need a supervisor's approval
1. Open the case
2. Check the flags

Source: CIA - consolidated.xlsx › TNA!A2

Notes: Start with the story of a renewal that waited three weeks.
- Ask who has used the new screen

## Who is affected
| Role | Headcount | Priority |
|---|---:|---|
| Processing officer | 42 | High |
| Client support agent | 35 | Medium |

> **Notes:** Read the table from the top.

## Every step
${Array.from({ length: 11 }, (_, i) => `- Step ${i + 1}`).join('\n')}

## Links & symbols
See [the guide](https://example.org/guide?a=1&b=2), \`code\` and 5 < 6 > 4 "quoted" 'single' \u0001.
`;

async function open(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (n) => (zip.file(n) ? zip.file(n).async('string') : null);
  return { zip, read, names: Object.keys(zip.files).filter((n) => !zip.files[n].dir) };
}

/** Every part is well-formed XML, has a content type, every relationship target exists, and the slide list is consistent. */
async function checkPackage(buffer) {
  const { zip, read, names } = await open(buffer);
  for (const n of names.filter((f) => /\.(xml|rels)$/.test(f))) assert.equal(XMLValidator.validate(await read(n)), true, `${n} is not well-formed XML`);
  const types = await read('[Content_Types].xml');
  const overrides = [...types.matchAll(/<Override PartName="([^"]+)" ContentType="([^"]+)"\/>/g)].map((m) => ({ part: m[1].slice(1), ct: m[2] }));
  const defaults = [...types.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1]);
  for (const n of names.filter((f) => f !== '[Content_Types].xml')) assert.ok(overrides.some((o) => o.part === n) || defaults.includes(n.split('.').pop()), `${n} has no content type`);
  for (const o of overrides) assert.ok(zip.file(o.part), `content type for missing part ${o.part}`);
  assert.equal(new Set(overrides.map((o) => o.part)).size, overrides.length, 'a part has two content types');
  for (const n of names.filter((f) => f.endsWith('.rels'))) {
    const dir = path.posix.dirname(path.posix.dirname(n)); // "ppt/slides/_rels/slide1.xml.rels" → "ppt/slides"
    for (const m of (await read(n)).matchAll(/<Relationship\b([^>]*)\/>/g)) {
      if (/TargetMode="External"/.test(m[1])) continue;
      const target = /Target="([^"]+)"/.exec(m[1])[1];
      const resolved = target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(dir, target));
      assert.ok(zip.file(resolved), `${n} points at missing ${resolved}`);
    }
  }
  const pres = await read('ppt/presentation.xml');
  const presRels = await read('ppt/_rels/presentation.xml.rels');
  const ids = [...pres.matchAll(/<p:sldId id="(\d+)" r:id="([^"]+)"\/>/g)];
  assert.equal(new Set(ids.map((m) => m[1])).size, ids.length);
  for (const m of ids) { assert.ok(+m[1] >= 256); assert.match(presRels, new RegExp(`Id="${m[2]}" Type="[^"]+/slide"`)); }
  assert.equal(ids.length, names.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length, 'every slide part is in the slide list');
  // Element order PowerPoint insists on.
  const order = ['<p:sldMasterIdLst', '<p:notesMasterIdLst', '<p:sldIdLst', '<p:sldSz', '<p:notesSz'].map((t) => pres.indexOf(t)).filter((i) => i >= 0);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  return { zip, read, names, types, pres };
}

test('a deck outline becomes a title slide, one slide per ##, a real table and speaker notes', async () => {
  const r = await pptx.toPptx(DECK, { label: 'Draft (AI) for review' });
  assert.equal(r.template, false);
  assert.equal(r.warning, '');
  const { read, names, types, pres } = await checkPackage(r.buffer);
  assert.match(types, /presentationml\.presentation\.main\+xml/);
  assert.match(pres, /<p:notesMasterIdLst>/);
  assert.ok(names.includes('ppt/notesMasters/notesMaster1.xml'));
  const slides = await pptx.readPptx(r.buffer);
  assert.deepEqual(slides.map((s) => s.title), ['Processing officer training', 'Why the process changes', 'Who is affected', 'Every step', 'Every step (cont.)', 'Links & symbols']);
  assert.equal(r.slides, 6);
  assert.deepEqual(slides[0].text.slice(0, 2), ['The new screen-based review, November 2026', 'Draft (AI) for review']);
  assert.deepEqual(slides[1].text.slice(0, 6), ['Screen-based review replaces paper files', 'Eligibility flags are set automatically', "Overrides need a supervisor's approval", 'Open the case', 'Check the flags', 'Source: CIA - consolidated.xlsx › TNA!A2']);
  assert.deepEqual(slides[1].notes, ['Start with the story of a renewal that waited three weeks.', '• Ask who has used the new screen']);
  assert.ok(!slides[1].text.some((t) => /Notes|who has used/.test(t)), 'notes are not on the slide');
  const s2 = await read('ppt/slides/slide2.xml');
  assert.match(s2, /<a:pPr lvl="1"\/><a:r>/); // nested bullet
  assert.match(s2, /<a:buAutoNum type="arabicPeriod" startAt="2"\/>/);
  assert.match(s2, /b="1"[^>]*><a:t>replaces<\/a:t>/);
  assert.match(s2, /<p:ph type="title"\/>/);
  assert.match(s2, /<p:ph type="body" idx="1"\/>|<p:ph idx="1"\/>/);
  // the table
  assert.equal(slides[2].table, true);
  const s3 = await read('ppt/slides/slide3.xml');
  assert.equal((s3.match(/<a:tr /g) || []).length, 3);
  assert.equal((s3.match(/<a:gridCol /g) || []).length, 3);
  assert.match(s3, /<a:tableStyleId>\{5C22544A-7EE6-4342-B048-85BDC9FD1C3A\}<\/a:tableStyleId>/);
  assert.match(s3, /<a:pPr algn="r"\/>/);
  assert.deepEqual(slides[2].notes, ['Read the table from the top.']);
  // overflow: 11 steps → 8 + 3
  assert.equal(slides[3].text.filter((t) => /^Step/.test(t)).length, 8);
  assert.deepEqual(slides[4].text.filter((t) => /^Step/.test(t)), ['Step 9', 'Step 10', 'Step 11']);
  // escaping, links and code
  const s6 = await read('ppt/slides/slide6.xml');
  assert.match(s6, /5 &lt; 6 &gt; 4 &quot;quoted&quot; &apos;single&apos;/);
  assert.doesNotMatch(s6, /\u0001/);
  assert.match(s6, /<a:hlinkClick r:id="rIdLink1"\/>/);
  assert.match(await read('ppt/slides/_rels/slide6.xml.rels'), /Target="https:\/\/example\.org\/guide\?a=1&amp;b=2" TargetMode="External"/);
  assert.match(s6, /<a:latin typeface="Consolas"\/>/);
  // notes slides only where there are notes
  assert.deepEqual(names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).sort(), ['ppt/notesSlides/notesSlide2.xml', 'ppt/notesSlides/notesSlide3.xml']);
  assert.match(await read('docProps/app.xml'), /<Slides>6<\/Slides><Notes>2<\/Notes>/);
});

test('without notes there is no notes master; a missing title falls back to the option', async () => {
  const r = await pptx.toPptx('## Only slide\n\n- One\n', { title: 'From the chat title' });
  const { names, pres } = await checkPackage(r.buffer);
  assert.ok(!names.some((n) => n.includes('notesMaster')));
  assert.doesNotMatch(pres, /notesMasterIdLst/);
  assert.deepEqual((await pptx.readPptx(r.buffer)).map((s) => s.title), ['From the chat title', 'Only slide']);
});

test('a template keeps its master, theme, layouts and footer, and its own slides are dropped', async () => {
  const r = await pptx.toPptx(DECK, { template: TEMPLATE, label: 'Draft (AI) for review' });
  assert.equal(r.template, true);
  assert.equal(r.warning, '');
  const { zip, read, names, types } = await checkPackage(r.buffer);
  const original = await JSZip.loadAsync(fs.readFileSync(TEMPLATE));
  const same = async (part) => assert.equal(await read(part), await original.file(part).async('string'), `${part} changed`);
  for (const part of ['ppt/theme/theme1.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/slideLayouts/slideLayout2.xml', 'ppt/notesMasters/notesMaster1.xml']) await same(part);
  assert.match(await read('ppt/theme/theme1.xml'), /<a:latin typeface="Georgia"\/>/);
  assert.match(await read('ppt/theme/theme1.xml'), /<a:accent1><a:srgbClr val="0F5C6E"\/>/);
  // a template becomes a presentation
  assert.doesNotMatch(types, /presentationml\.template\.main/);
  assert.match(types, /PartName="\/ppt\/presentation\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation\.main\+xml"/);
  // the template's example slide is gone
  const slides = await pptx.readPptx(r.buffer);
  assert.equal(slides.length, 6);
  assert.ok(!slides.some((s) => /How to use this template/.test(s.title)));
  for (const n of names.filter((f) => /^ppt\/(slides|notesSlides)\/.*\.xml$/.test(f))) assert.doesNotMatch(await read(n), /How to use this template|Delete this example slide/);
  assert.equal((await original.file('ppt/presentation.xml').async('string')).match(/<p:sldId /g).length, 2, 'the sample template has two example slides');
  assert.ok(!slides.some((s) => /Training deck title/.test(s.title)));
  // title slide on "Title Slide", content on "Title and Content"; placeholders filled, footer copied from the layout
  assert.match(await read('ppt/slides/_rels/slide1.xml.rels'), /Target="\.\.\/slideLayouts\/slideLayout1\.xml"/);
  assert.match(await read('ppt/slides/_rels/slide2.xml.rels'), /Target="\.\.\/slideLayouts\/slideLayout2\.xml"/);
  assert.match(await read('ppt/slides/slide1.xml'), /<p:ph type="ctrTitle"\/>[\s\S]*<p:ph type="subTitle" idx="1"\/>/);
  assert.ok(slides.every((s) => s.text.includes('Online Permit Renewal · Training · Protected A')), 'the footer is on every slide');
  assert.deepEqual(slides[1].notes, ['Start with the story of a renewal that waited three weeks.', '• Ask who has used the new screen']);
  assert.equal(zip.file('ppt/theme/theme2.xml') !== null, true); // the template's notes master theme, kept
});

test('a template without a notes master gets the built-in one when the deck has notes', async () => {
  const bare = await pptx.basePackage({ name: 'Bare', colors: { accent1: '123456' } }, { template: true }).generateAsync({ type: 'nodebuffer' });
  const r = await pptx.toPptx('# T\n\n## S\n\n- a\n\nNotes: say hello', { template: bare });
  assert.equal(r.template, true);
  const { read, names } = await checkPackage(r.buffer);
  assert.ok(names.includes('ppt/notesMasters/notesMaster1.xml'));
  assert.match(await read('ppt/theme/theme1.xml'), /123456/);
  assert.deepEqual((await pptx.readPptx(r.buffer))[1].notes, ['say hello']);
});

test('a missing or wrong template falls back to the built-in design with a warning', async () => {
  const missing = await pptx.toPptx('# T\n\n## S\n\n- a', { template: path.join(temp, 'nope.potx') });
  assert.equal(missing.template, false);
  assert.match(missing.warning, /was not found/);
  await checkPackage(missing.buffer);
  const wrong = await pptx.toPptx('# T', { template: path.join(__dirname, '..', 'samples', 'aidlc', 'Templates', 'FDD Template.dotx') });
  assert.match(wrong.warning, /not a \.potx or \.pptx/);
  const junk = path.join(temp, 'junk.potx');
  fs.writeFileSync(junk, 'not a zip');
  assert.match((await pptx.toPptx('# T', { template: junk })).warning, /could not be read/);
});

test('a long table continues on (cont.) slides with its header repeated', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => `| R${i + 1} | ${i} |`).join('\n');
  const r = await pptx.toPptx(`# T\n\n## Big table\n\n| Name | N |\n|---|---|\n${rows}\n`);
  await checkPackage(r.buffer);
  const slides = await pptx.readPptx(r.buffer);
  assert.ok(slides.length >= 4);
  assert.deepEqual(slides.slice(2).map((s) => s.title), slides.slice(2).map(() => 'Big table (cont.)'));
  for (const s of slides.slice(1)) assert.deepEqual(s.text.slice(0, 2), ['Name', 'N']);
  assert.equal(slides.slice(1).reduce((n, s) => n + s.text.filter((t) => /^R\d+$/.test(t)).length, 0), 25);
});

test('saveDraft saves a PowerPoint deck in the project deck template, with the label and a Sources slide', async () => {
  const root = fs.mkdtempSync(path.join(temp, 'project-'));
  fs.mkdirSync(path.join(root, 'Templates'));
  fs.copyFileSync(TEMPLATE, path.join(root, 'Templates', 'Training Deck Template.potx'));
  assert.equal(change.findDeckTemplate(root), path.join(root, 'Templates', 'Training Deck Template.potx'));
  fs.mkdirSync(path.join(root, 'Training'));
  const f = path.join(root, 'Training', 'Deck outline.md');
  const r = await change.saveDraft(f, DECK, { sources: ['CIA - consolidated.xlsx › TNA!A2'], powerpoint: true, root });
  assert.equal(r.saved, f);
  assert.equal(r.powerpoint, path.join(root, 'Training', 'Deck outline.pptx'));
  assert.deepEqual(r.deck, { slides: 7, speakerNotes: 2, template: 'Training Deck Template.potx' });
  assert.match(fs.readFileSync(f, 'utf8'), /^> \*\*Draft \(AI\) for review\*\*/);
  const slides = await pptx.readPptx(fs.readFileSync(r.powerpoint));
  assert.equal(slides[0].title, 'Processing officer training');
  assert.ok(slides[0].text.includes('Draft (AI) for review'));
  assert.equal(slides[slides.length - 1].title, 'Sources');
  assert.ok(slides[slides.length - 1].text.includes('CIA - consolidated.xlsx › TNA!A2'));
  assert.equal((await pptx.readPptx(fs.readFileSync(r.powerpoint))).length, 7);
  const props = await (await JSZip.loadAsync(fs.readFileSync(r.powerpoint))).file('docProps/custom.xml').async('string');
  assert.match(props, /name="Status"><vt:lpwstr>Draft \(AI\) for review</);
  await checkPackage(fs.readFileSync(r.powerpoint));

  // A .pptx path saves only the deck; never overwrites; Word and deck templates go to their own format.
  const deckOnly = await change.saveDraft(path.join(root, 'Training', 'Deck outline.pptx'), '## One\n\n- a\n\nSource: x', { template: path.join(root, 'Templates', 'Training Deck Template.potx'), word: true });
  assert.equal(deckOnly.saved, path.join(root, 'Training', 'Deck outline (2).pptx'));
  assert.equal(deckOnly.word, path.join(root, 'Training', 'Deck outline.docx'));
  assert.equal(deckOnly.deck.template, 'Training Deck Template.potx');
  assert.ok(!deckOnly.warnings.some((w) => /Word template/.test(w)), deckOnly.warnings.join(' '));
  // No template in the project: built-in design, no warning.
  const plain = await change.saveDraft(path.join(temp, 'Plain.pptx'), '# Plain\n\n## A\n\n- b\n\nSource: y');
  assert.equal(plain.deck.template, null);
  assert.deepEqual(plain.warnings, []);
  await assert.rejects(change.saveDraft(path.join(root, 'x.pdf'), 'x'), /\.md .*\.docx .*\.pptx/);
});

test('the sample template and the generator agree', async () => {
  const { read, types } = await checkPackage(fs.readFileSync(TEMPLATE));
  assert.match(types, /presentationml\.template\.main\+xml/);
  assert.match(await read('ppt/slideMasters/slideMaster1.xml'), /Online Permit Renewal · Training · Protected A/);
  assert.match(await read('ppt/slideMasters/slideMaster1.xml'), /<a:t>OPR<\/a:t>/);
  const names = [];
  for (const n of ['ppt/slideLayouts/slideLayout1.xml', 'ppt/slideLayouts/slideLayout2.xml', 'ppt/slideLayouts/slideLayout3.xml']) names.push(/<p:cSld name="([^"]+)"/.exec(await read(n))[1]);
  assert.deepEqual(names, ['Title Slide', 'Title and Content', 'Title Only']);
});
