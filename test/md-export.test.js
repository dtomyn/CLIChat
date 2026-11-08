const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const mdExport = require('../tools/md-export');

const FDD = path.join(__dirname, '..', 'samples', 'aidlc', 'Templates', 'FDD Template.dotx');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-mdexport-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const MD = '# Overview\n\nThe **permit** portal.\n\n## Screens\n\n- Login\n- Renew\n  - Upload photo\n\n1. First\n2. Second\n\n#### Detail\n\n| ID | Title |\n|---|---|\n| FD-012 | Renewal form |\n\nSee [the wiki](https://example.org/wiki).\n';
const FIELDS = { version: '2.0', date: '2026-11-07', approver: 'Priya Shah' };

async function parts(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (n) => (zip.file(n) ? zip.file(n).async('string') : null);
  return { zip, read, doc: await read('word/document.xml'), styles: await read('word/styles.xml'), types: await read('[Content_Types].xml') };
}
const styleIds = (doc) => [...doc.matchAll(/<w:pStyle w:val="([^"]+)"/g)].map((m) => m[1]);

test('the built-in output still works without a template', async () => {
  const r = await mdExport.toDocx(MD, { title: 'FDD' });
  assert.equal(r.template, false);
  assert.equal(r.warning, '');
  const { doc, types } = await parts(r.buffer);
  assert.match(types, /wordprocessingml\.document\.main\+xml/);
  assert.ok(styleIds(doc).includes('Heading1') && styleIds(doc).includes('Title'));
  assert.ok(Buffer.isBuffer(await mdExport.markdownToDocx(MD, { title: 'x' })));
});

test('a template keeps its styles, header, footer and cover page, and fills the placeholders', async () => {
  const r = await mdExport.toDocx(MD, { title: 'Permit Renewal: Functional design', template: FDD, fields: FIELDS });
  assert.equal(r.template, true);
  const { zip, read, doc, styles, types } = await parts(r.buffer);
  const original = await JSZip.loadAsync(fs.readFileSync(FDD));
  // Template styles kept as they were (Georgia headings in the program colour).
  assert.equal(styles, await original.file('word/styles.xml').async('string'));
  assert.match(styles, /Georgia/);
  // .dotx becomes a document.
  assert.match(types, /wordprocessingml\.document\.main\+xml/);
  assert.doesNotMatch(types, /template\.main\+xml/);
  // Header and footer kept and filled.
  assert.ok(zip.file('word/header1.xml') && zip.file('word/footer1.xml'));
  assert.match(await read('word/header1.xml'), /Permit Renewal: Functional design/);
  const footer = await read('word/footer1.xml');
  assert.match(footer, /Version 2\.0 · Approved by Priya Shah/);
  assert.doesNotMatch(footer, /\{\{/);
  assert.match(footer, /<w:tab\/>[\s\S]*PAGE/); // runs around the placeholder are kept
  assert.doesNotMatch(doc, /E7E3FB/); // tables follow the template's table style, not Lumen's colours
  // Cover page: title content control filled, placeholders filled, no {{…}} left, body after the cover.
  assert.match(doc, /<w:tag w:val="title"\/>[\s\S]*Permit Renewal: Functional design/);
  assert.doesNotMatch(doc, /showingPlcHdr|PlaceholderText/);
  for (const v of ['2.0', '2026-11-07', 'Priya Shah', 'Online Permit Renewal']) assert.ok(doc.includes(v), v);
  assert.doesNotMatch(doc, /\{\{/);
  assert.ok(doc.indexOf('Priya Shah') < doc.indexOf('Overview'));
  assert.ok(doc.indexOf('Overview') < doc.lastIndexOf('<w:sectPr'));
  // Markdown mapped to the template's styles by name.
  const ids = styleIds(doc);
  for (const id of ['Heading1', 'Heading2', 'Heading4', 'ListBullet', 'ListNumber']) assert.ok(ids.includes(id), id);
  assert.match(doc, /<w:tblStyle w:val="TableGrid"\/>/);
  // Lists use numbering added after the template's own, and hyperlinks get their own relationships.
  assert.match(await read('word/numbering.xml'), /<w:abstractNum /);
  assert.match(await read('word/_rels/document.xml.rels'), /rIdLumenLink1[^>]*example\.org/);
  assert.match(doc, /r:id="rIdLumenLink1"/);
  assert.match(await read('docProps/core.xml'), /<dc:title>Permit Renewal: Functional design<\/dc:title>/);
});

test('styles a template lacks fall back to the built-in definitions', async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(FDD));
  const styles = (await zip.file('word/styles.xml').async('string')).replace(/<w:style w:type="paragraph" w:styleId="Heading2">[\s\S]*?<\/w:style>/, '').replace(/<w:style w:type="paragraph" w:styleId="Code">[\s\S]*?<\/w:style>/, '');
  zip.file('word/styles.xml', styles);
  const r = await mdExport.toDocx('## Sub\n\n```\ncode\n```\n', { template: await zip.generateAsync({ type: 'nodebuffer' }) });
  const out = await parts(r.buffer);
  assert.match(out.styles, /w:styleId="Heading2"/); // injected from the built-in set
  assert.match(out.styles, /w:styleId="Code"/);
  assert.ok(styleIds(out.doc).includes('Heading2'));
});

test('a template with differently named style IDs is matched by style name', async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(FDD));
  zip.file('word/styles.xml', (await zip.file('word/styles.xml').async('string')).replace('w:styleId="Heading1"', 'w:styleId="ProgH1"'));
  const r = await mdExport.toDocx('# Top', { template: await zip.generateAsync({ type: 'nodebuffer' }) });
  assert.ok(styleIds((await parts(r.buffer)).doc).includes('ProgH1'));
});

test('a missing or unreadable template falls back to the built-in styles with a warning', async () => {
  const missing = await mdExport.toDocx(MD, { title: 'x', template: path.join(temp, 'Nope.dotx'), fields: FIELDS });
  assert.equal(missing.template, false);
  assert.match(missing.warning, /Nope\.dotx" was not found/);
  const { doc } = await parts(missing.buffer);
  assert.match(doc, /Version 2\.0 · 2026-11-07 · Approved by Priya Shah/);
  const junk = path.join(temp, 'Junk.dotx');
  fs.writeFileSync(junk, 'not a zip');
  const bad = await mdExport.toDocx(MD, { template: junk });
  assert.equal(bad.template, false);
  assert.match(bad.warning, /could not be read/);
  const macro = await mdExport.toDocx(MD, { template: path.join(temp, 'Macro.dotm') });
  assert.equal(macro.template, false);
});

test('placeholders split across runs and unknown placeholders', () => {
  const xml = '<w:p><w:r><w:t>Version {{ver</w:t></w:r><w:r><w:t>sion}} by {{who}}</w:t></w:r></w:p>';
  const out = mdExport.fillFields(xml, { version: '3.0' });
  assert.match(out, /Version 3\.0 by \{\{who\}\}/);
  assert.equal(mdExport.fillFields(xml, {}), xml);
});

test('custom document properties are written and can be read back', async () => {
  for (const template of [undefined, FDD]) {
    const r = await mdExport.toDocx(MD, { title: 'T', template, properties: { Version: '1.0', Approver: 'A & B', 'Source revision': 'abc123' } });
    const props = await mdExport.readDocxProperties(r.buffer);
    assert.equal(props.Version, '1.0');
    assert.equal(props.Approver, 'A & B');
    assert.equal(props['Source revision'], 'abc123');
    assert.equal(props.title, 'T');
  }
});
