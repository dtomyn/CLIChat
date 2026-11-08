// "Save as Word (program template)" on an approved lifecycle stage (Plan 18).
// The run is created through the API, then its stages are marked approved in the throw-away data folder,
// because approving needs a stage the engine has finished. The button, the server route and md-export are real.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const mdExport = require('../tools/md-export');
const { DATA } = require('./paths');

const SHOTS = path.join(__dirname, 'screenshots');
let sample, run;

test.beforeAll(async ({ request }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const res = await request.post('/api/demo/install', { data: { pack: 'aidlc' } });
  expect(res.ok()).toBeTruthy();
  sample = (await res.json()).path;
  expect(fs.existsSync(path.join(sample, 'Templates', 'FDD Template.dotx'))).toBeTruthy();

  const created = await request.post('/api/runs', { data: { pipelineId: 'aidlc', name: `Word export ${Date.now()}`, workspace: sample, sources: ['Knowledge/Solution Blueprint - Permit Renewal.md'] } });
  expect(created.ok(), await created.text()).toBeTruthy();
  run = await created.json();

  // Approve the first two stages, as the approve route would: stamp the output and record who and when.
  const approvedAt = Date.parse('2026-11-06T15:00:00Z');
  const outputs = {
    refine: '# Refined requirements\n\n| Req ID | Statement |\n|---|---|\n| BR-001.1 | A permit holder can renew online. |\n',
    functional: '# 1. Overview\n\nThe renewal journey for **permit holders**.\n\n## 1.1 Screens\n\n- Sign in\n- Renewal form\n\n| FD ID | Title | Traces To |\n|---|---|---|\n| FD-012 | Renewal form | BR-002.1 |\n',
  };
  for (const stage of run.stages.filter((s) => outputs[s.id])) {
    fs.mkdirSync(path.dirname(stage.outputPath), { recursive: true });
    fs.writeFileSync(stage.outputPath, `> Approved by Priya Shah on ${new Date(approvedAt).toISOString()}\n\n${outputs[stage.id]}`);
    Object.assign(stage, { status: 'approved', approvedBy: 'Priya Shah', approvedAt, version: 1 });
  }
  fs.writeFileSync(path.join(DATA, 'runs', `${run.id}.json`), JSON.stringify(run, null, 2));
});

async function openStage(page, name) {
  await page.goto(`/#run/${run.id}`);
  await expect(page.locator('.run-stepper')).toBeVisible({ timeout: 15_000 });
  await page.locator('.run-step', { hasText: name }).click();
  await expect(page.locator('#view h2')).toHaveText(name);
}

test('approved Functional design saves as Word with the program template', async ({ page }) => {
  await openStage(page, 'Functional design');
  const button = page.getByRole('button', { name: 'Save as Word (program template)' });
  await expect(button).toHaveAttribute('title', 'Uses Templates/FDD Template.dotx');
  await button.click();

  const dialog = page.locator('.modal');
  await expect(dialog.locator('.modal-head h2')).toHaveText('Saved as Word');
  await expect(dialog).toContainText('02-functional-design.docx · Templates/FDD Template.dotx');
  await dialog.screenshot({ path: path.join(SHOTS, 'lifecycle-word-saved.png') });

  const file = run.stages.find((s) => s.id === 'functional').outputPath.replace(/\.md$/, '.docx');
  expect(fs.existsSync(file)).toBeTruthy();
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const doc = await zip.file('word/document.xml').async('string');
  const footer = await zip.file('word/footer1.xml').async('string');
  expect(doc).toContain(`${run.name}: Functional design`); // title content control on the cover
  expect(doc).toContain('Priya Shah');
  expect(doc).toContain('2026-11-06');
  expect(doc).not.toMatch(/\{\{|Approved by Priya Shah on/); // placeholders filled, approval stamp moved to the cover
  expect(doc).toContain('FD-012');
  expect(footer).toContain('Version 1.0 · Approved by Priya Shah');
  expect(await zip.file('word/styles.xml').async('string')).toContain('Georgia'); // the template's styles
  const props = await mdExport.readDocxProperties(fs.readFileSync(file));
  expect(props).toMatchObject({ Version: '1.0', Approver: 'Priya Shah' });
});

test('a stage without a template saves with the built-in styles', async ({ page }) => {
  await openStage(page, 'Refine requirements');
  const button = page.getByRole('button', { name: 'Save as Word', exact: true });
  await expect(button).toHaveAttribute('title', "Uses Lumen's built-in Word styles");
  await button.click();
  await expect(page.locator('.modal .modal-head h2')).toHaveText('Saved as Word');
  await expect(page.locator('.modal')).toContainText('01-requirements.docx');
  await expect(page.locator('.modal')).not.toContainText('Template');
  expect(fs.existsSync(run.stages.find((s) => s.id === 'refine').outputPath.replace(/\.md$/, '.docx'))).toBeTruthy();
});

test('stages that are not approved do not offer Save as Word', async ({ page }) => {
  await openStage(page, 'Technical design');
  await expect(page.getByRole('button', { name: /Save as Word/ })).toHaveCount(0);
});
