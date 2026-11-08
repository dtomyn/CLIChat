// Shared by the real-engine specs: open a prompt, choose its files, run it and save the reply for reading afterwards.
const { expect } = require('@playwright/test');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENGINE = process.env.E2E_ENGINE;
const SHOTS = path.join(__dirname, 'screenshots');

async function openPrompt(page, id) {
  await page.goto('/');
  await expect(page.getByText(/Checking/)).toHaveCount(0, { timeout: 90_000 }); // the app checks which engines are installed
  await expect(async () => {
    await page.locator('.nav-item[data-nav="recipes"]').click();
    await expect(page.locator('.page-head h1')).toHaveText('Prompt gallery', { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await page.locator(`[data-recipe="${id}"]`).click();
  await expect(page.locator('.modal-head h2')).toBeVisible();
}

// The label is the file's path inside the project folder; write it with / and it is matched on any OS.
async function pick(page, key, label) {
  const sel = page.locator(`[data-file-select="${key}"]`);
  await expect(sel.locator('option')).not.toHaveCount(1);
  await sel.selectOption({ label: label.split('/').join(path.sep) });
}

// Start, wait for the reply to finish, then save its text, steps and a screenshot.
async function run(page, shot) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.locator('.btn.grad', { hasText: 'Start' }).click();
  const reply = page.locator('.msg.assistant').last();
  await expect(reply).toBeVisible({ timeout: 60_000 });
  await expect(reply.locator('.msg-actions, .error-card').first()).toBeVisible({ timeout: 420_000 }); // actions appear when the reply is complete
  const text = await reply.innerText();
  const steps = await reply.locator('.step').allInnerTexts();
  fs.writeFileSync(path.join(SHOTS, `real-${ENGINE}-${shot}.txt`), `STEPS\n${steps.join('\n')}\n\nREPLY\n${text}\n`);
  await reply.screenshot({ path: path.join(SHOTS, `real-${ENGINE}-${shot}.png`) });
  expect(await page.locator('.msg.assistant .error-card, .msg.assistant .msg-error, .msg.assistant [data-error]').count(), `The reply failed:\n${text}`).toBe(0);
  return { text, steps };
}

// A content hash of every file under a folder, so a test can show that no original file was changed.
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

// Files that changed since the snapshot, and files that are new.
function changes(dir, before) {
  const after = snapshot(dir);
  return {
    modified: Object.keys(before).filter((f) => after[f] !== before[f]),
    added: Object.keys(after).filter((f) => !(f in before)),
  };
}

module.exports = { ENGINE, SHOTS, openPrompt, pick, run, snapshot, changes };
