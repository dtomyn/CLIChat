// End-to-end explainer, Microsoft Foundry first: the hosted agents in the Foundry portal (agent, identity, guardrails,
// red teaming, traces, monitor), a little of the code, and the agents working in Lumen. Built on the short Viva Engage
// post ("Building the agents was the easy part").
//
//   node film/make_e2e.js --login   Open the film's Edge profile so you can sign in to ai.azure.com (once).
//   node film/make_e2e.js --voice   Narration only (Kokoro), with each line's length.
//   node film/make_e2e.js           Film and encode film/out/lumen-foundry-e2e.mp4 + .srt + .vtt + thumbnail.
//   node film/make_e2e.js --stills  Film, then write a contact sheet instead of encoding.
//
// The portal is filmed live from a signed-in, HEADED Edge window (its own profile in film/.work-e2e/edge-profile;
// your normal browser is untouched). Don't use that window while it records. Identifying text (your name, the
// subscription id, resource names) is replaced on the page before it is captured. Lumen replays the recorded agent
// replies (film/recordings/foundry) through film/foundry-server.js on 127.0.0.1:4395, so Lumen needs no Azure.
//
// Config: film/foundry.local.json (portal addresses, red-team scan ids, masking; see below). Env: AGENTS_REPO,
// KOKORO_PYTHON, FFMPEG_PATH, and FOUNDRY_PORTAL_BASE / FOUNDRY_CLASSIC_WSID / FOUNDRY_TID / RT_BEFORE / RT_AFTER overrides.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');
const { createKit } = require('./filmkit');
const { grab, buildDeck } = require('./code-deck');

const FILM = __dirname;
const ROOT = path.resolve(FILM, '..');
const REPO = process.env.AGENTS_REPO || 'C:/01-Clients-and-Engagements/IRCC-info/ircc-sdlc-agents';
const WORK = path.join(FILM, '.work-e2e');
const PROFILE = path.join(WORK, 'edge-profile');
const NAME = 'lumen-foundry-e2e';
const PORT = 4395;
const VIEW = { width: 1600, height: 900 };
const args = new Set(process.argv.slice(2));
const ONLY = [...args].find((a) => a.startsWith('--only='))?.slice(7) || null;

// Your Foundry project's addresses and the on-screen masking live in film/foundry.local.json (git-ignored), so no
// tenant, subscription or personal details are committed. Shape:
//   { "tid": "<tenant id>", "portalBase": "https://ai.azure.com/nextgen/r/<project path>",
//     "classicWsid": "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<acct>/projects/<proj>",
//     "redTeamBefore": "<scan id>", "redTeamAfter": "<scan id>", "mask": [["real text", "shown instead"], ...] }
// Environment variables (FOUNDRY_TID, FOUNDRY_PORTAL_BASE, FOUNDRY_CLASSIC_WSID, RT_BEFORE, RT_AFTER) override it.
const LOCAL = (() => { try { return JSON.parse(fs.readFileSync(path.join(FILM, 'foundry.local.json'), 'utf8')); } catch { return {}; } })();
const TID = process.env.FOUNDRY_TID || LOCAL.tid || '';
const BASE = process.env.FOUNDRY_PORTAL_BASE || LOCAL.portalBase || '';
const WSID = process.env.FOUNDRY_CLASSIC_WSID || LOCAL.classicWsid || '';
const nextgen = (p) => `${BASE}${p}${p.includes('?') ? '&' : '?'}tid=${TID}`;
const classic = (p) => `https://ai.azure.com${p}?wsid=${WSID}&tid=${TID}`;
const RT_BEFORE = process.env.RT_BEFORE || classic(`/resource/build/redteaming/${LOCAL.redTeamBefore || ''}`);
const RT_AFTER = process.env.RT_AFTER || classic(`/resource/build/redteaming/${LOCAL.redTeamAfter || ''}`);
const BRR = 'contoso-business-requirements-refinement';

// Text swapped on portal pages before capture: [find, replace]. Longest first.
const MASK = [...(LOCAL.mask || []), ...(TID ? [[TID, '00000000-0000-0000-0000-000000000000']] : [])];

// ------------------------------------------------------------------ narration: [spoken, caption]
const LINES = {
  intro1: ['Twenty three ay-eye agents for everyday delivery work. Requirements, interface documentation, schedule variance and status reporting. Written in LangGraph, and running as Microsoft Foundry hosted agents.',
    'Twenty-three AI agents for everyday delivery work: requirements, interface documentation, schedule variance and status reporting. Written in LangGraph, and running as Microsoft Foundry hosted agents.'],
  intro2: ['Standing them up was quick. Proving they behave took longer, and was more interesting. This is the end to end view, starting in Foundry.',
    'Standing them up was quick. Proving they behave took longer, and was more interesting. This is the end-to-end view, starting in Foundry.'],
  agents1: ['In the Foundry portal, all twenty three agents are listed as hosted agents. Foundry built each container from the Python code, and each one is running.',
    'In the Foundry portal, all 23 agents are listed as hosted agents. Foundry built each container from the Python code, and each one is running.'],
  agents2: ['Open one, and you can see what the platform gives it. Its own Entra agent identity, versioned deployments, and a Responses endpoint that only people with Azure access can call. No secrets anywhere.',
    'Open one, and you can see what the platform gives it: its own Entra agent identity, versioned deployments, and a Responses endpoint that only people with Azure access can call. No secrets anywhere.'],
  code1: ['Inside, each agent is a LangGraph graph. Green steps are plain Python, purple steps call the model, and amber is a person approving a change.',
    'Inside, each agent is a LangGraph graph. Green steps are plain Python, purple steps call the model, and amber is a person approving a change.'],
  code2: ['A build step turns every agent into a deployable folder, and one a z d deploy publishes all twenty three to Foundry.',
    'A build step turns every agent into a deployable folder, and one azd deploy publishes all 23 to Foundry.'],
  lumen1: ['People never see any of that. They use Lumen, a simple chat app that calls the same Foundry endpoint with their own Azure sign in.',
    'People never see any of that. They use Lumen, a simple chat app that calls the same Foundry endpoint with their own Azure sign-in.'],
  lumen2: ['A business analyst attaches a requirements document, and asks for structured requirements.',
    'A business analyst attaches a requirements document, and asks for structured requirements.'],
  lumen3: ['The agent splits the document into sections, extracts every requirement with its exact source text, and checks the quality of each one.',
    'The agent splits the document into sections, extracts every requirement with its exact source text, and checks the quality of each one.'],
  lumen4: ['Notice the safety checks. One section hides an instruction aimed at the ay-eye. The agent flagged it, and the platform blocked it.',
    'Notice the safety checks. One section hides an instruction aimed at the AI. The agent flagged it, and the platform blocked it.'],
  guard1: ['That second layer is Foundry guardrails. The model deployment blocks harmful content, detects jailbreaks, and checks documents for indirect prompt injection.',
    'That second layer is Foundry guardrails. The model deployment blocks harmful content, detects jailbreaks, and checks documents for indirect prompt injection.'],
  guard2: ['Injection detection is set to annotate, not block. So the agent flags the hostile text itself, instead of rejecting the whole document.',
    'Injection detection is set to annotate, not block. So the agent flags the hostile text itself, instead of rejecting the whole document.'],
  prove1: ['Then the question every architect asks. How do you know it behaves? Three practices made the difference.',
    'Then the question every architect asks: how do you know it behaves? Three practices made the difference.'],
  prove2: ['First, evaluate the deployed agent, not just the code. Running the test cases against the live endpoints found a defect that close to seven hundred unit tests had missed. Gap recall went from zero point four four, to one.',
    'First, evaluate the deployed agent, not just the code. Running the test cases against the live endpoints found a defect that close to 700 unit tests had missed. Gap recall went from 0.44 to 1.00.'],
  rt1: ['Second, red team the way the agent is actually attacked. Foundry\'s ay-eye Red Teaming Agent sent eighty attacks to each deployed agent, many of them hidden inside the documents it reads.',
    "Second, red-team the way the agent is actually attacked. Foundry's AI Red Teaming Agent sent 80 attacks to each deployed agent, many of them hidden inside the documents it reads."],
  rt2: ['It found one genuine failure. A planted harmful sentence became a requirement, because that is exactly what the agent is built to do.',
    'It found one genuine failure. A planted harmful sentence became a requirement, because that is exactly what the agent is built to do.'],
  rt3: ['The fix is layered. The content filter, a prompt rule, and a deterministic scan that flags the text and drops any requirement built from it.',
    'The fix is layered: the content filter, a prompt rule, and a deterministic scan that flags the text and drops any requirement built from it.'],
  rt4: ['The re scan after the fix found nothing, and that case is now part of the test suite.',
    'The re-scan after the fix found nothing, and that case is now part of the test suite.'],
  trace1: ['Third, trace every step. Every run of every agent appears in Foundry, with its status and duration.',
    'Third, trace every step. Every run of every agent appears in Foundry, with its status and duration.'],
  trace2: ['Open one, and you see the LangGraph steps, each model call, and the H T T P calls underneath. When a test fails, you can see which step went wrong, instead of guessing.',
    'Open one, and you see the LangGraph steps, each model call, and the HTTP calls underneath. When a test fails, you can see which step went wrong, instead of guessing.'],
  mon1: ['And the monitor shows the whole project at a glance. Agent runs, token usage, and what all of this testing has actually cost.',
    'And the monitor shows the whole project at a glance: agent runs, token usage, and what all of this testing has actually cost.'],
  close1: ['Still to do. Evaluation on real documents, multi turn attacks, and a proper cost model per agent.',
    'Still to do: evaluation on real documents, multi-turn attacks, and a proper cost model per agent.'],
  end: ['LangGraph inside. Microsoft Foundry underneath. And evidence that it behaves.', 'LangGraph inside. Microsoft Foundry underneath. And evidence that it behaves.'],
};

// ------------------------------------------------------------------ slides (from the real source)
const R = (p) => path.join(REPO, p);
function code(id, kicker, title, file, start, opts, lang, notes) {
  const g = grab(file, start, opts);
  return { type: 'code', id, kicker, title, path: path.relative(REPO, file).replace(/\\/g, '/'), repo: 'contoso-sdlc-agents', lang, first: g.first, text: g.text, notes };
}
function slides() {
  const graphs = JSON.parse(fs.readFileSync(path.join(FILM, 'code-graphs.json'), 'utf8'));
  return [
    { type: 'graph', id: 's-g01', kicker: 'Agent 01 · Requirements Refinement', title: 'Each agent is a <em>LangGraph graph</em>', graph: graphs['01'],
      kinds: { det: ['intake', 'parse', 'retrieve_context', 'normalise', 'self_check', 'assemble', 'apply_edits', 'render', 'propose_publish', 'apply'], llm: ['extract_section', 'classify', 'analyse_quality', 'gap_analysis'], hitl: ['approve'], io: ['finalize'] },
      note: 'Exported from LangGraph with get_graph(). extract_section runs once per BRD section, in parallel.' },
    code('s-deploy', 'tools · build_deploy.py', 'Generated deployment to <em>Foundry hosted agents</em>', R('tools/build_deploy.py'), 'MAIN = ', { count: 40 }, 'python', [
      'One flat folder per agent: <code>main.py</code> + <code>requirements.txt</code> + vendored libs',
      '<code>azure.yaml</code> generated from each agent\'s metadata',
      '<code>azd deploy</code> → 23 hosted agents, each with its own identity']),
    code('s-harm', 'agents/01 · nodes.py', 'The fix: <em>harmful text is never a requirement</em>', R('agents/01-business-requirements-refinement/src/contoso_brr/nodes.py'), 'if scan_injection(md):', { count: 16 }, 'python', [
      'Layer 1: Foundry content filter on the model deployment',
      'Layer 2: the extraction prompt says such text is never a requirement',
      'Layer 3: <code>scan_harmful()</code> flags it and drops any requirement built from it',
      'Regression case <code>brr-013-harmful</code> in the golden set']),
  ];
}

// ------------------------------------------------------------------ cards
const LOGO = '<svg viewBox="0 0 32 32"><path d="M16 4l2.6 7.4L26 14l-7.4 2.6L16 24l-2.6-7.4L6 14l7.4-2.6z" fill="#fff"/></svg>';
const TITLE = `<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s;font-size:62px">Building the agents was <em>the easy part</em></h1><p class="rise" style="animation-delay:.45s">23 LangGraph agents · Microsoft Foundry hosted agents · end to end</p>`;
const chapter = (kicker, title, pills = []) => `<div class="kicker rise">${kicker}</div><h1 class="rise" style="animation-delay:.15s;font-size:66px">${title}</h1>${pills.length ? `<div class="pills rise" style="animation-delay:.45s">${pills.map((p) => `<span>${p}</span>`).join('')}</div>` : ''}`;
const STAT = `<div class="kicker rise">1 · Evaluate the deployed agent</div><h1 class="rise" style="animation-delay:.15s;font-size:60px">Live evals found what <em>unit tests missed</em></h1>
<div class="pills rise" style="animation-delay:.45s"><span>Interface gap recall <b>0.44 → 1.00</b></span><span>Precision unchanged</span><span>~700 unit tests, model scripted out</span></div>
<p class="rise" style="animation-delay:.7s;max-width:1100px;margin:28px auto 0">"Timeouts are not specified" had been counted as documenting timeouts.</p>`;
const CLOSE = `<div class="kicker rise">What's still open</div><h1 class="rise" style="animation-delay:.15s;font-size:62px">Next: <em>real documents</em></h1><div class="pills rise" style="animation-delay:.4s"><span>📄 Evaluation on real documents</span><span>🔁 Multi-turn attacks</span><span>💲 Cost model per agent</span><span>🔌 Live connectors</span></div>`;
const END = `<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s">LangGraph inside · <em>Foundry</em> underneath</h1><p class="rise" style="animation-delay:.45s">Synthetic data · fictional organization · a proof of concept</p>`;

// ------------------------------------------------------------------ portal masking (init script)
const MASK_JS = `(() => {
  if (!/ai\\.azure\\.com$/.test(location.hostname)) return;
  const pairs = ${JSON.stringify(MASK)};
  const skip = (n) => { const p = n.parentNode; return !!p && /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(p.nodeName); };
  const fix = (s) => { if (!s) return s; let o = s; for (const [a, b] of pairs) if (o.includes(a)) o = o.split(a).join(b); return o; };
  const walk = (root) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) { if (skip(n)) continue; const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    if (root.querySelectorAll) for (const el of root.querySelectorAll('input:not([type=hidden]),textarea')) { const v = fix(el.value); if (v !== el.value) el.value = v; }
  };
  const css = document.createElement('style');
  css.textContent = 'button[aria-label*="profile" i] img, button[aria-label*="Account manager" i] img, [data-testid*="avatar" i] img, .fui-Avatar img { visibility: hidden !important; }';
  const start = () => {
    document.head.appendChild(css); walk(document.body);
    new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') { if (skip(m.target)) continue; const v = fix(m.target.nodeValue); if (v !== m.target.nodeValue) m.target.nodeValue = v; } else for (const n of m.addedNodes) { if (n.nodeType === 3) { if (skip(n)) continue; const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } else if (n.nodeType === 1) walk(n); } } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();`;

// ------------------------------------------------------------------ multi-page capture
class MultiCapture {
  constructor() { this.dir = path.join(WORK, 'frames'); fs.rmSync(this.dir, { recursive: true, force: true }); fs.mkdirSync(this.dir, { recursive: true }); this.frames = []; this.sessions = new Map(); this.active = null; }
  async add(page) {
    const cdp = await page.context().newCDPSession(page);
    cdp.on('Page.screencastFrame', (f) => {
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      if (this.active !== cdp) return;
      const p = path.join(this.dir, `${String(this.frames.length).padStart(6, '0')}.jpg`);
      fs.writeFileSync(p, Buffer.from(f.data, 'base64'));
      this.frames.push([p, f.metadata.timestamp]);
    });
    this.sessions.set(page, cdp);
  }
  async show(page) {
    const cdp = this.sessions.get(page);
    if (this.active === cdp) return;
    if (this.active) await this.active.send('Page.stopScreencast').catch(() => {});
    await page.bringToFront();
    this.active = cdp;
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }
  async stop() { if (this.active) await this.active.send('Page.stopScreencast').catch(() => {}); this.active = null; }
}

// ------------------------------------------------------------------ helpers
async function api(method, p, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}`, 'Sec-Fetch-Site': 'same-origin' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
async function waitForServer() {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/status`); if (r.ok) return; } catch { /* starting */ } await new Promise((s) => setTimeout(s, 500)); }
  throw new Error('film server did not start');
}
/** Zoom the camera onto a Playwright locator (or a fixed layout rect). */
async function zoomTo(d, target, scale = 1.4, pad = 12, ms = 1000) {
  let r = target;
  if (!('x' in target)) { await target.first().waitFor({ state: 'visible', timeout: 60000 }); const b = await target.first().boundingBox(); r = { x: b.x, y: b.y, width: b.width, height: b.height }; }
  await d.js(([rr, s, m]) => window.Film.zoom(rr, s, m), [{ x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 }, scale, ms]);
  d.log('whoosh', { soft: true });
  await d.wait(ms / 1000);
}
async function settle(page, ms = 2500) { await page.waitForLoadState('domcontentloaded').catch(() => {}); await page.waitForTimeout(ms); }
async function filmReady(page) { await page.waitForFunction(() => !!window.Film, null, { timeout: 60000 }); }

/** Switch the portal between the new Foundry and the classic view (the red-team report lives in classic). */
async function setNewFoundry(page, on) {
  await settle(page, 4000);
  const sw = page.locator('[role=switch]').first();
  await sw.waitFor({ state: 'visible', timeout: 60000 });
  const state = await sw.evaluate((el) => el.getAttribute('aria-checked') === 'true' || el.checked === true);
  if (state === on) return;
  await closeDialogs(page);
  await sw.click();
  await page.waitForTimeout(3000);
  const skip = page.getByRole('button', { name: 'Continue without feedback' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForTimeout(6000);
}
/** Close welcome / what's-new dialogs that sit over the portal. */
async function closeDialogs(page) {
  for (let i = 0; i < 4; i++) {
    const dlg = page.locator('[role=dialog]:visible, .fui-DialogSurface:visible').first();
    if (!(await dlg.count())) return;
    const close = dlg.locator('button[aria-label="Close" i], button[aria-label*="dismiss" i], button:has-text("Skip"), button:has-text("Maybe later"), button:has-text("Got it")').first();
    if (await close.count()) await close.click().catch(() => {}); else await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
}
async function gotoPortal(page, url, readyText) {
  // The portal's sign-in occasionally lands on "Close the browser and retry again": go home, then try again.
  for (let attempt = 1; ; attempt++) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    try {
      if (readyText) await page.getByText(readyText, { exact: false }).first().waitFor({ state: 'visible', timeout: attempt < 3 ? 45000 : 90000 });
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`portal retry ${attempt}: ${url.slice(0, 90)}`);
      await page.goto(nextgen('/home'), { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(8000);
    }
  }
  await settle(page, 3000);
  await closeDialogs(page);
  await filmReady(page);
}
async function dismissBubbles(page) {
  for (const sel of ['.ms-TeachingBubble button[aria-label*="lose" i]', '[class*="TeachingBubble"] button', 'button[aria-label="Close"]:near(:text("Metrics scores"))']) {
    const b = page.locator(sel).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(600); }
  }
}

// ------------------------------------------------------------------ the film
async function runFilm(d, cap, pages) {
  const { deck, portal, lumen, pD, pG, pT, pM, pC, pC2 } = pages;
  const use = async (page) => { d.page = page; await cap.show(page); };
  const dk = (fn, ...a) => d.js(([f, x]) => window.Deck[f](...x), [fn, a]);
  const show = async (id) => { await dk('show', id); d.log('whoosh', { soft: true }); await d.wait(0.7); };
  const notes = async (id, n, gap) => { for (let i = 1; i <= n; i++) { await dk('note', id, i); await d.wait(gap); } };
  const focus = async (id, from, to, hold = 0.6) => { await dk('focus', id, from, to); await d.wait(0.9); await d.wait(hold); };
  // A card goes up on the deck tab (shown at once, no gap), and only then does the capture switch to it.
  const cardOn = async (html, hold = 0) => {
    d.page = deck;
    const hidden = cap.active !== cap.sessions.get(deck); // off camera: no fade, so nothing underneath shows through
    await deck.evaluate(([h, ms]) => {
      const old = document.getElementById('film-card'); // crossfade: keep the old card underneath until the new one is in
      if (old) old.id = 'film-card-old';
      window.Film.card(h, { fadeMs: ms }); const c = document.getElementById('film-card'); void c.offsetWidth; c.classList.add('show');
      if (old) setTimeout(() => old.remove(), ms + 100);
    }, [html, hidden ? 0 : 600]);
    d.log('whoosh');
    if (cap.active !== cap.sessions.get(deck)) { await deck.waitForTimeout(800); await cap.show(deck); }
    await d.wait(hold);
  };
  const want = (s) => !ONLY || ONLY.split(',').includes(s);

  // Every portal page was loaded in its own tab before recording started.
  await cardOn(TITLE, 0.4);
  await d.js(() => window.Film.hideCursor(true));
  if (want('intro')) { await d.say('intro1'); await d.waitVoice(); await d.say('intro2'); await d.waitVoice(0.3); }

  // ---------------- Foundry: the hosted agents
  if (want('agents')) {
    await use(portal);
    await d.js(() => window.Film.hideCursor(false));
    await d.say('agents1');
    await d.wait(1.2);
    for (let i = 0; i < 4; i++) { const t = portal.getByText('Hosted', { exact: true }).nth(i); if (await t.count()) await d.hover(t, 520); }
    await d.hover(portal.getByText('Running', { exact: true }).first(), 600);
    await d.waitVoice();
    await d.click(portal.getByRole('link', { name: BRR }).first(), 800, 0.6);
    let pa = portal;
    try { await portal.getByRole('tab', { name: 'Details' }).first().waitFor({ timeout: 15000 }); await settle(portal, 1500); }
    catch { pa = pD; await use(pD); } // the in-app link didn't open: cut to the preloaded agent page
    await d.say('agents2');
    await d.click(pa.getByRole('tab', { name: 'Details' }).first(), 700, 0.4);
    await pa.getByText('Identity & access').first().waitFor({ timeout: 60000 });
    await settle(pa, 1500);
    await zoomTo(d, pa.getByText('Identity & access').first().locator('xpath=ancestor::div[.//text()[contains(.,"Entra agent identity")]][1]'), 1.45, 14);
    await d.wait(Math.max(1, d.voiceLeft() - 5));
    await d.unzoom(700);
    await zoomTo(d, pa.getByText('Responses protocol').first().locator('xpath=ancestor::div[.//text()[contains(.,"Endpoint")]][1]'), 1.5, 14);
    await d.waitVoice();
    await d.unzoom(700);
  }

  // ---------------- The code
  if (want('code')) {
    await use(deck);
    await show('s-g01');
    await d.uncard(800);
    await d.say('code1');
    await d.wait(2.8); await dk('mark', 's-g01', ['intake', 'parse', 'retrieve_context', 'normalise', 'self_check', 'assemble', 'apply_edits', 'render', 'propose_publish', 'apply']); await d.wait(2.0);
    await dk('mark', 's-g01', ['extract_section', 'classify', 'analyse_quality', 'gap_analysis']); await d.wait(1.8);
    await dk('mark', 's-g01', ['approve']); await d.waitVoice(); await dk('mark', 's-g01', null);
    await show('s-deploy');
    await d.say('code2');
    await focus('s-deploy', 'MAIN = ', 'serve(build_graph)', 0.3); await notes('s-deploy', 1, 0.6);
    await d.wait(Math.max(0.5, d.voiceLeft() - 2.5)); await notes('s-deploy', 3, 0.3);
    await d.waitVoice(); await dk('focus', 's-deploy', null);
  }

  // ---------------- Lumen
  if (want('lumen')) {
    await cardOn(chapter('Where people use it', 'Lumen <em>→</em> Microsoft Foundry', ['💬 Lumen chat app', '🔐 Your Azure sign-in', '☁️ Hosted agent endpoint']), 0.3);
    await d.say('lumen1');
    for (const c of await api('GET', '/api/conversations')) await api('DELETE', `/api/conversations/${c.id}`);
    await api('PUT', '/api/settings', { userName: 'Amira' });
    await lumen.goto(`http://127.0.0.1:${PORT}/`); await lumen.waitForSelector('.greeting', { timeout: 30000 }); await filmReady(lumen);
    await d.waitVoice(0.3);
    await use(lumen);
    await d.js(() => window.Film.hideCursor(false));
    await d.third('<div class="av" style="background:linear-gradient(135deg,#12a594,#3fc5e8)">🧭</div><div><b>Amira</b><span>Business Analyst</span></div>');
    await d.click('.rail-item[data-nav="assistants"]', 700, 0.6);
    await lumen.waitForSelector('#agentSearch');
    await d.click('#agentSearch', 500, 0.2);
    await d.type('requirements refinement');
    await d.wait(0.5);
    await d.click(`[data-chat-with="${BRR}"]`, 700, 0.8);
    await d.say('lumen2');
    await d.click('#attachBtn', 650, 0.5);
    await lumen.keyboard.press('Escape');
    await lumen.setInputFiles('#fileInput', [path.join(FILM, '.work-foundry', 'CSP Release 2', 'INTAKE_BRD_v1.2.md')]);
    d.log('click');
    await lumen.waitForFunction(() => document.querySelectorAll('.attach-chip:not(.uploading)').length > 0 && !document.querySelector('.attach-chip.uploading'), null, { timeout: 30000 });
    await d.wait(0.6);
    await d.click('#input', 500, 0.2);
    await d.type('Refine this BRD into structured requirements.');
    const before = await d.js(() => document.querySelectorAll('.msg.assistant .msg-actions').length);
    await d.click('#sendBtn', 500, 0.3);
    await d.waitVoice();
    await d.say('lumen3');
    await lumen.waitForFunction((n) => { const b = document.querySelector('#sendBtn'); return document.querySelectorAll('.msg.assistant .msg-actions').length > n && b && !b.classList.contains('stop'); }, before, { timeout: 120000, polling: 250 });
    await d.wait(0.6);
    await d.waitVoice();
    await d.reveal('.msg.assistant:last-child .md', 'start', 1.0);
    await d.zoom('.msg.assistant:last-child .md', 1.25, 1000);
    await d.say('lumen4');
    await d.waitVoice();
    await d.unzoom(700);
    await d.third(null);
  }

  // ---------------- Guardrails
  if (want('guard')) {
    await cardOn(chapter('Defence in depth', 'Foundry <em>guardrails</em>'), 0.2);
    await use(pG);
    await d.say('guard1');
    await d.click(pG.getByText('Microsoft.DefaultV2', { exact: true }).first(), 800, 1.2);
    await pG.getByText('Indirect prompt injections', { exact: false }).first().waitFor({ timeout: 30000 });
    for (const t of ['Jailbreak', 'Indirect prompt injections', 'Content safety']) await d.hover(pG.getByText(t, { exact: false }).last(), 650);
    await d.waitVoice();
    await d.say('guard2');
    await d.click(pG.getByText('Indirect prompt injections', { exact: false }).last(), 700, 1.0);
    await zoomTo(d, pG.getByText('Annotate', { exact: true }).first().locator('xpath=ancestor::div[.//text()[contains(.,"Risk type")]][1]'), 1.5, 16);
    await d.waitVoice();
    await d.unzoom(700);
  }

  // ---------------- Proving it: live evals, red teaming, the fix
  if (want('prove')) {
    await cardOn(chapter('Proving it', 'How do you know <em>it behaves?</em>', ['1 · Evaluate the deployed agent', '2 · Red-team it as it is attacked', '3 · Trace every step']), 0.3);
    await d.js(() => window.Film.hideCursor(true));
    await d.say('prove1'); await d.waitVoice(0.3);
    await cardOn(STAT, 0.3);
    await d.say('prove2'); await d.waitVoice(0.3);
    await use(pC);
    await d.js(() => window.Film.hideCursor(false));
    await dismissBubbles(pC);
    await d.say('rt1');
    await d.hover(pC.getByText('AI red teaming scan details').first(), 700);
    await d.wait(Math.max(0.5, d.voiceLeft() - 3));
    await zoomTo(d, pC.getByText('Successful attacks', { exact: true }).first().locator('xpath=ancestor::*[.//text()[contains(.,"Violence")]][1]'), 1.35, 16);
    await d.waitVoice();
    await d.say('rt2');
    await d.hover(pC.getByText('1/10 attacks', { exact: false }).first(), 800);
    await d.waitVoice();
    await d.unzoom(700);
    await use(deck);
    await show('s-harm');
    await d.uncard(800);
    await d.js(() => window.Film.hideCursor(false));
    await d.say('rt3');
    await focus('s-harm', 'harmful = scan_harmful(md)', 'requirement; the functional lead', 0.3);
    await notes('s-harm', 4, Math.max(0.8, d.voiceLeft() / 4 - 0.2));
    await d.waitVoice(); await dk('focus', 's-harm', null);
    await use(pC2);
    await dismissBubbles(pC2);
    await d.say('rt4');
    await zoomTo(d, pC2.getByText('Successful attacks', { exact: true }).first().locator('xpath=ancestor::*[.//text()[contains(.,"Violence")]][1]'), 1.35, 16);
    await d.waitVoice();
    await d.unzoom(700);
  }

  // ---------------- Tracing and monitor
  if (want('trace')) {
    await cardOn(chapter('3 · Trace every step', 'OpenTelemetry → <em>Foundry tracing</em>'), 0.2);
    await use(pT);
    await d.say('trace1');
    await d.hover(pT.getByText('Completed', { exact: true }).first(), 700);
    await d.hover(pT.getByText('Duration (s)', { exact: true }).first(), 700);
    await d.waitVoice();
    await d.say('trace2');
    await d.click(pT.locator('[role=row]').nth(1).locator('button').first(), 800, 0.8);
    await pT.getByText('Trajectories', { exact: true }).first().waitFor({ timeout: 60000 });
    await settle(portal, 2500);
    for (const t of ['fan_out', 'chat gpt-5-mini', 'POST /api/projects']) { const l = pT.getByText(t, { exact: false }).first(); if (await l.count()) await d.hover(l, 800); }
    await d.waitVoice();
    await pT.keyboard.press('Escape');
    await d.wait(0.6);
  }
  if (want('monitor')) {
    await use(pM);
    await d.say('mon1');
    await zoomTo(d, { x: 244, y: 260, width: 1316, height: 198 }, 1.15, 8);
    for (const t of ['Agent runs', 'Total token usage', 'Estimated cost']) await d.hover(pM.getByText(t, { exact: true }).first(), 700);
    await d.waitVoice();
    await d.unzoom(700);
  }

  // ---------------- Close
  await cardOn(CLOSE, 0.3);
  await d.js(() => window.Film.hideCursor(true));
  await d.say('close1'); await d.waitVoice(0.5);
  await cardOn(END, 0.3);
  await d.say('end'); await d.waitVoice(1.5);
}

// ------------------------------------------------------------------ main
function edge(headless) {
  return chromium.launchPersistentContext(PROFILE, { channel: 'msedge', headless, viewport: VIEW, deviceScaleFactor: 1.2,
    args: ['--force-color-profile=srgb', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
}

async function login() {
  const ctx = await edge(false);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://ai.azure.com/');
  console.log('Sign in in the Edge window, then close it.');
  await new Promise((r) => ctx.on('close', r));
}

async function main() {
  if (args.has('--login')) return login();
  const kit = createKit({ name: NAME, lines: LINES, vo: path.join(FILM, 'vo-e2e'), work: WORK, out: path.join(FILM, 'out') });
  const lengths = kit.makeVoice();
  if (args.has('--voice')) { let total = 0; for (const [k, v] of Object.entries(lengths)) { total += v; console.log(k.padEnd(8), `${v.toFixed(1)}s`); } console.log(`total narration ${total.toFixed(0)}s`); return; }
  const deckFile = buildDeck({ slides: slides(), hljsDir: path.join(ROOT, 'node_modules', '@highlightjs', 'cdn-assets'), out: path.join(WORK, 'deck.html') });
  const server = spawn(process.execPath, [path.join(FILM, 'foundry-server.js'), 'film'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'inherit', 'inherit'] });
  let ctx;
  try {
    await waitForServer();
    ctx = await edge(false);
    await ctx.addInitScript({ path: path.join(FILM, 'overlay.js') });
    await ctx.addInitScript({ content: MASK_JS });
    const deck = ctx.pages()[0] || await ctx.newPage();
    const portal = await ctx.newPage();
    const lumen = await ctx.newPage();
    const [pD, pG, pT, pM, pC, pC2] = [await ctx.newPage(), await ctx.newPage(), await ctx.newPage(), await ctx.newPage(), await ctx.newPage(), await ctx.newPage()];
    console.log('loading portal pages');
    await gotoPortal(portal, nextgen('/home'));
    await setNewFoundry(portal, true);
    await gotoPortal(portal, nextgen('/build/agents'), BRR);
    await gotoPortal(pD, nextgen(`/build/agents/${BRR}/build`), 'Details');
    await gotoPortal(pG, nextgen('/build/guardrails'), 'Microsoft.DefaultV2');
    await gotoPortal(pT, nextgen(`/build/agents/${BRR}/traces`), 'Trace ID');
    await gotoPortal(pM, nextgen('/build/observe'), 'Agent runs');
    await gotoPortal(pC, nextgen('/home'));
    await setNewFoundry(pC, false);
    await gotoPortal(pC, RT_BEFORE, 'Metric dashboard'); await dismissBubbles(pC);
    await gotoPortal(pC2, RT_AFTER, 'Metric dashboard'); await dismissBubbles(pC2);
    console.log('portal pages ready');
    const errors = [];
    deck.on('pageerror', (e) => errors.push(String(e)));
    lumen.on('pageerror', (e) => errors.push(String(e)));
    await deck.goto(`file:///${deckFile.replace(/\\/g, '/')}`);
    await deck.waitForFunction(() => !!window.Deck && !!window.Film);
    await lumen.goto(`http://127.0.0.1:${PORT}/`);
    await lumen.waitForSelector('.greeting', { timeout: 30000 });
    const cap = new MultiCapture();
    for (const p of [deck, portal, lumen, pD, pG, pT, pM, pC, pC2]) await cap.add(p);
    const d = new kit.Director(deck, lengths);
    const t0 = Date.now();
    try { await runFilm(d, cap, { deck, portal, lumen, pD, pG, pT, pM, pC, pC2 }); } catch (e) { await d.page.screenshot({ path: path.join(WORK, 'failed.png') }).catch(() => {}); throw e; }
    await cap.stop();
    console.log('page errors', errors, 'took', Math.round((Date.now() - t0) / 1000), 's');
    const res = kit.finish(cap.frames, d.events, { stills: args.has('--stills'), thumbAt: 0.3 });
    if (res?.srt) {
      const vtt = `WEBVTT\n\n${fs.readFileSync(res.srt, 'utf8').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2')}`;
      fs.writeFileSync(res.srt.replace(/\.srt$/, '.vtt'), vtt, 'utf8');
    }
  } finally {
    if (ctx) {
      try { const p = await ctx.newPage(); await gotoPortal(p, nextgen('/home')); await setNewFoundry(p, true); console.log('New Foundry toggle restored'); } catch (e) { console.log('could not restore the New Foundry toggle:', e.message); }
      await ctx.close().catch(() => {});
    }
    server.kill();
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });

// Shared with make_e2e2.js (the "laptop to enterprise" cut).
module.exports = { MultiCapture, api, waitForServer, zoomTo, settle, filmReady, setNewFoundry, closeDialogs, gotoPortal, dismissBubbles, MASK_JS, nextgen, edge, RT_BEFORE, RT_AFTER, BRR, PORT, WORK, REPO, LOGO };
