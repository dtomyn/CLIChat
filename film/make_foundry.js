// Lumen × IRCC explainer: the 23 IRCC agents hosted in Microsoft Foundry, filmed from the real app.
//
//   node film/make_foundry.js --record    Run the scenes against the REAL hosted agents (your az login) and save replies.
//   node film/make_foundry.js --voice     Make only the narration (Kokoro, af_heart) and print each line's length.
//   node film/make_foundry.js             Film (replaying the saved replies), mix and encode film/out/lumen-ircc-foundry.mp4
//                                          and film/out/lumen-ircc-foundry.srt.
//   node film/make_foundry.js --stills    Film, then write a contact sheet instead of encoding.
//
// Node twin of make_video.py (same overlay, cards, cursor and sound design) so it runs with what Lumen already has:
// Playwright (Microsoft Edge) from devDependencies, Kokoro narration (film/kokoro_tts.py), and an ffmpeg from
// FFMPEG_PATH (or imageio-ffmpeg / PATH). No new npm packages.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const FILM = __dirname;
const WORK = path.join(FILM, '.work-foundry');
const OUT = path.join(FILM, 'out');
const VO = path.join(FILM, 'vo-foundry');
const NAME = 'lumen-ircc-foundry';
const PORT = 4395;
const VIEW = { width: 1600, height: 900 };
const DSF = 1.2; // 1920x1080
const RATE = 48000;
// Narration: Kokoro (af_heart), like make_video.py. KOKORO_PYTHON = a Python with kokoro-onnx + soundfile.
// FILM_VOICE=windows falls back to the Windows built-in voice (no downloads).
const ENGINE = process.env.FILM_VOICE === 'windows' ? 'windows' : 'kokoro';
const VOICE = ENGINE === 'kokoro' ? `kokoro:${process.env.KOKORO_VOICE || 'af_heart'}:${process.env.KOKORO_SPEED || '1.0'}` : 'Microsoft Mark';
const args = new Set(process.argv.slice(2));
const FILMING = !args.has('--record');

// ------------------------------------------------------------------ narration: [spoken, caption]
const LINES = {
  intro1: ['I R C C has twenty three A I agents for its software delivery lifecycle. They run as LangGraph agents, hosted in Microsoft Foundry.',
    'IRCC has 23 AI agents for its software delivery lifecycle. They run as LangGraph agents, hosted in Microsoft Foundry.'],
  intro2: ['Now business users can work with all of them, from one friendly chat window. Lumen.', 'Now business users can work with all of them, from one friendly chat window. Lumen.'],
  arch1: ['Here is how it fits together. Lumen runs on your own computer. When you pick an I R C C agent, Lumen sends your request and your attached files to that agent in Foundry.',
    "Here's how it fits together. Lumen runs on your own computer. When you pick an IRCC agent, Lumen sends your request and your attached files to that agent in Foundry."],
  arch2: ['It signs in with your own Azure account, stores no secrets, and nothing changes in any system until a person approves it.',
    'It signs in with your own Azure account, stores no secrets, and nothing changes in any system until a person approves it.'],
  setup1: ['Setup is one field. In Settings, paste your Foundry project address. Lumen checks it, and the agents are ready.',
    'Setup is one field. In Settings, paste your Foundry project address. Lumen checks it, and the agents are ready.'],
  agents1: ['On the Agents page, every I R C C agent carries a Microsoft Foundry tag. Requirements, design, backlog, planning, integration, security and architecture.',
    'On the Agents page, every IRCC agent carries a Microsoft Foundry tag. Requirements, design, backlog, planning, integration, security and architecture.'],
  amira1: ['Meet Amira, a business analyst on C M P Release 2. She has a new business requirements document, and the functional design starts next week.',
    'Meet Amira, a business analyst on CMP Release 2. She has a new business requirements document, and the functional design starts next week.'],
  amira2: ['She opens the Requirements Refinement agent. It tells her exactly what to attach.', 'She opens the Requirements Refinement agent. It tells her exactly what to attach.'],
  amira3: ['She attaches the B R D and asks for structured requirements.', 'She attaches the BRD and asks for structured requirements.'],
  amira4: ['The agent is working in Microsoft Foundry. It splits the document into sections, extracts every requirement with its exact source text, and checks the quality of each one.',
    'The agent is working in Microsoft Foundry. It splits the document into sections, extracts every requirement with its exact source text, and checks the quality of each one.'],
  amira5: ['A summary, and the numbers at a glance. Notice the safety checks. One section of this B R D hides an instruction aimed at the A I. The agent flagged it, and the platform blocked it. No requirement was invented from it.',
    'A summary, and the numbers at a glance. Notice the safety checks. One section of this BRD hides an instruction aimed at the AI. The agent flagged it, and the platform blocked it. No requirement was invented from it.'],
  amira6: ['Every requirement has a stable I D, a type, and a priority taken only from the B R D itself. Never guessed.',
    'Every requirement has a stable ID, a type, and a priority taken only from the BRD itself. Never guessed.'],
  amira7: ['She can keep refining in plain words. Merge these two requirements. The agent remembers the conversation, and retires the merged I D so it is never reused.',
    'She can keep refining in plain words. "Merge these two requirements." The agent remembers the conversation, and retires the merged ID so it is never reused.'],
  theo1: ['Meet Theo, an integration architect. He needs an interface control document for the C M P to Name Search lookup.',
    'Meet Theo, an integration architect. He needs an interface control document for the CMP to Name Search lookup.'],
  theo2: ['He attaches the partner contract, the requirements, the canonical model, and a short description of the interface.',
    'He attaches the partner contract, the requirements, the canonical model, and a short description of the interface.'],
  theo3: ['Before drafting, the agent pauses. It wants the architect to confirm the integration pattern. The decision appears as an approval card, right in the chat.',
    'Before drafting, the agent pauses. It wants the architect to confirm the integration pattern. The decision appears as an approval card, right in the chat.'],
  theo4: ['Theo approves. Lumen sends his decision back to the agent, and it picks up exactly where it stopped.',
    'Theo approves. Lumen sends his decision back to the agent, and it picks up exactly where it stopped.'],
  theo5: ['A complete draft, checked section by section against the I R C C standards, with every gap called out for review.',
    'A complete draft, checked section by section against the IRCC standards, with every gap called out for review.'],
  priya1: ['And meet Priya, the planner. The steering committee wants to know why the dates moved.', 'And meet Priya, the planner. The steering committee wants to know why the dates moved.'],
  priya2: ['She attaches the integrated plan, exported from Microsoft Project, and asks the Schedule Variance agent.', 'She attaches the integrated plan, exported from Microsoft Project, and asks the Schedule Variance agent.'],
  priya3: ['The numbers are computed in code. Baseline against current, slip in working days, the critical path. The A I only explains them, and every finding is banded red, amber or green.',
    'The numbers are computed in code: baseline against current, slip in working days, the critical path. The AI only explains them, and every finding is banded red, amber or green.'],
  close1: ['All twenty three agents are live in Foundry today, in practice mode. They read what you attach, and they never write to Azure DevOps, SharePoint or Teams without a person approving it.',
    'All 23 agents are live in Foundry today, in practice mode. They read what you attach, and they never write to Azure DevOps, SharePoint or Teams without a person approving it.'],
  end: ['Lumen and Microsoft Foundry. I R C C agents, made friendly for everyone on the team.', 'Lumen and Microsoft Foundry. IRCC agents, made friendly for everyone on the team.'],
};

// ------------------------------------------------------------------ voice (Windows speech, cached)
function wavInfo(file) {
  const b = fs.readFileSync(file);
  let o = 12; let fmt = null; let data = null;
  while (o < b.length - 8) {
    const id = b.toString('ascii', o, o + 4); const size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = { start: o + 8, size };
    o += 8 + size + (size % 2);
  }
  return { ...fmt, data, buf: b, seconds: data.size / (fmt.rate * fmt.channels * fmt.bits / 8) };
}

function makeVoice() {
  fs.mkdirSync(VO, { recursive: true });
  const book = path.join(VO, 'made.json');
  const made = fs.existsSync(book) ? JSON.parse(fs.readFileSync(book, 'utf8')) : {};
  const todo = [];
  for (const [key, [spoken]] of Object.entries(LINES)) {
    const sig = crypto.createHash('sha1').update(`${VOICE}|${spoken}`).digest('hex');
    if (made[key] !== sig || !fs.existsSync(path.join(VO, `${key}.wav`))) todo.push({ key, spoken, sig });
  }
  if (todo.length) {
    const jobs = path.join(WORK, 'voice-jobs.json');
    fs.mkdirSync(WORK, { recursive: true });
    fs.writeFileSync(jobs, JSON.stringify(todo.map((t) => ({ text: t.spoken, out: path.join(VO, `${t.key}.wav`) }))));
    if (ENGINE === 'kokoro') {
      const py = process.env.KOKORO_PYTHON || (process.platform === 'win32' ? 'python.exe' : 'python3');
      execFileSync(py, [path.join(FILM, 'kokoro_tts.py'), jobs], { stdio: 'inherit', windowsHide: true });
      for (const t of todo) made[t.key] = t.sig;
      fs.writeFileSync(book, JSON.stringify(made, null, 1));
      return Object.fromEntries(Object.keys(LINES).map((k) => [k, wavInfo(path.join(VO, `${k}.wav`)).seconds]));
    }
    const ps = `Add-Type -AssemblyName System.Speech
$jobs = Get-Content -Raw -LiteralPath '${jobs.replace(/'/g, "''")}' | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s.SelectVoice('${VOICE}') } catch { $s.SelectVoice('Microsoft David Desktop') }
$s.Rate = 0
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($j in $jobs) { $s.SetOutputToWaveFile($j.out, $fmt); $s.Speak($j.text); $s.SetOutputToNull() }
$s.Dispose()`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit', windowsHide: true });
    for (const t of todo) { made[t.key] = t.sig; console.log('voice', t.key); }
    fs.writeFileSync(book, JSON.stringify(made, null, 1));
  }
  return Object.fromEntries(Object.keys(LINES).map((k) => [k, wavInfo(path.join(VO, `${k}.wav`)).seconds]));
}

// ------------------------------------------------------------------ director
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class Director {
  constructor(page, lengths) { this.page = page; this.lengths = lengths; this.events = []; this.voiceEnd = 0; }
  log(kind, extra = {}) { this.events.push({ t: Date.now() / 1000, kind, ...extra }); }
  async wait(s) { if (s > 0) await this.page.waitForTimeout(s * 1000); }
  async say(key) { if (!FILMING) return; await this.waitVoice(); this.log('voice', { id: key }); this.voiceEnd = Date.now() / 1000 + this.lengths[key]; }
  async waitVoice(pad = 0.25) { if (FILMING) await this.wait(this.voiceEnd - Date.now() / 1000 + pad); }
  js(fn, arg) { return this.page.evaluate(fn, arg); }
  async center(target) {
    const loc = typeof target === 'string' ? this.page.locator(target).first() : target;
    await loc.waitFor({ state: 'visible', timeout: 60000 });
    let box = await loc.boundingBox();
    if (box.y < 0 || box.y + box.height > VIEW.height) {
      await loc.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await this.wait(FILMING ? 0.9 : 0.3);
      box = await loc.boundingBox();
    }
    return { loc, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  async hover(target, ms = 750) { const { x, y } = await this.center(target); await this.js(([a, b, m]) => window.Film.moveTo(a, b, m), [x, y, FILMING ? ms : 50]); await this.page.mouse.move(x, y); await this.wait(FILMING ? ms / 1000 : 0.05); }
  async click(target, ms = 750, after = 0.4) {
    const { x, y } = await this.center(target);
    await this.js(([a, b, m]) => window.Film.moveTo(a, b, m), [x, y, FILMING ? ms : 50]);
    await this.wait(FILMING ? ms / 1000 : 0.05);
    await this.js(() => window.Film.press());
    this.log('click');
    await this.page.mouse.click(x, y);
    await this.wait(FILMING ? after : 0.3);
  }
  async type(text, delay = 0.034) {
    for (const ch of text) { await this.page.keyboard.type(ch); this.log('key'); if (FILMING) await this.wait(delay + Math.random() * 0.03 - 0.01); }
  }
  async zoom(selector, scale = 1.5, ms = 1100, pad = 0) {
    if (!FILMING) return;
    await this.js(([sel, s, m, p]) => { const el = document.querySelector(sel); if (!el) return; const r = window.Film.layoutRect(el); window.Film.zoom({ x: r.x - p, y: r.y - p, width: r.width + p * 2, height: r.height + p * 2 }, s, m); }, [selector, scale, ms, pad]);
    this.log('whoosh', { soft: true });
    await this.wait(ms / 1000);
  }
  async unzoom(ms = 900) { if (!FILMING) return; await this.js((m) => window.Film.unzoom(m), ms); this.log('whoosh', { soft: true }); await this.wait(ms / 1000); }
  async reveal(selector, block = 'center', wait = 0.9) { await this.js(([s, b]) => { const el = document.querySelector(s); if (el) el.scrollIntoView({ behavior: 'smooth', block: b }); }, [selector, block]); await this.wait(FILMING ? wait : 0.2); }
  async card(html, hold = 0) { await this.js((h) => window.Film.card(h, {}), html); this.log('whoosh'); await this.wait(hold); }
  async uncard(ms = 800) { await this.js((m) => window.Film.uncard(m), ms); this.log('whoosh', { soft: true }); await this.wait(ms / 1000); }
  async third(html = null) { await this.js((h) => window.Film.third(h), html); }
  async replies() { return this.js(() => document.querySelectorAll('.msg.assistant .msg-actions').length); }
  async waitReply(before, timeout = 900) {
    await this.page.waitForFunction((n) => { const b = document.querySelector('#sendBtn'); return document.querySelectorAll('.msg.assistant .msg-actions').length > n && b && !b.classList.contains('stop'); }, before, { timeout: timeout * 1000, polling: 250 });
    await this.wait(0.6);
  }
  async attach(files) {
    await this.click('#attachBtn', 650, 0.5);
    const item = this.page.locator('.menu-item').filter({ hasText: /upload|computer|file/i }).first();
    if (await item.count()) { await this.hover(item, 450); }
    await this.page.keyboard.press('Escape');
    await this.page.setInputFiles('#fileInput', files);
    this.log('click');
    await this.page.waitForFunction(() => document.querySelectorAll('.attach-chip:not(.uploading)').length > 0 && !document.querySelector('.attach-chip.uploading'), null, { timeout: 30000 });
    await this.wait(FILMING ? 0.8 : 0.2);
  }
}

// ------------------------------------------------------------------ the film
const LOGO = '<svg viewBox="0 0 32 32"><path d="M16 4l2.6 7.4L26 14l-7.4 2.6L16 24l-2.6-7.4L6 14l7.4-2.6z" fill="#fff"/></svg>';
const persona = (emoji, grad, name, role, need) => `<div class="avatar rise" style="background:${grad}">${emoji}</div><div class="kicker rise" style="animation-delay:.15s">${role}</div><h1 class="rise" style="animation-delay:.25s">Meet <em>${name}</em></h1><div class="need rise" style="animation-delay:.5s">🎯 ${need}</div>`;
const third = (emoji, grad, name, role) => `<div class="av" style="background:${grad}">${emoji}</div><div><b>${name}</b><span>${role}</span></div>`;
const AMIRA = ['🧭', 'linear-gradient(135deg,#12a594,#3fc5e8)'];
const THEO = ['🔌', 'linear-gradient(135deg,#7c5cff,#c757d6)'];
const PRIYA = ['📋', 'linear-gradient(135deg,#f59e0b,#f2643a)'];
const PROJECT = path.join(WORK, 'IRCC CMP Release 2');
const input = (f) => path.join(PROJECT, f);

const ARCH = `<div class="kicker rise">How it works</div><h1 class="rise" style="animation-delay:.15s;font-size:70px">Lumen <em>→</em> Microsoft Foundry</h1>
<div class="pills rise" style="animation-delay:.45s"><span>💬 Lumen chat on your PC</span><span>🔐 Your Azure sign-in (az login)</span><span>☁️ 23 hosted LangGraph agents</span></div>
<div class="pills rise" style="animation-delay:.75s"><span>📎 Attach a document</span><span>📊 Cited, structured answers</span><span>✅ Approve before anything changes</span></div>`;

const AGENT_PILLS = ['Requirements Refinement', 'Functional Design', 'Technical Design', 'Story Writing', 'Traceability', 'Backlog Q&A', 'Plan Q&A',
  'ADO → Plan', 'Status Report', 'RAID Capture', 'Schedule Variance', 'Delivery Scenarios', 'Interface Docs', 'Schema Mapping', 'Security Controls',
  'Security Docs', 'CAE Evidence', 'Architecture Review', 'ADRs & Reuse', 'Gate Packs', 'Knowledge Layer', 'Knowledge Publishing', 'Tech Inventory'];

async function api(method, p, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}`, 'Sec-Fetch-Site': 'same-origin' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

async function freshPersona(page, name) {
  for (const c of await api('GET', '/api/conversations')) await api('DELETE', `/api/conversations/${c.id}`);
  await api('PUT', '/api/settings', { userName: name });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('.greeting', { timeout: 30000 });
  await page.waitForTimeout(800);
}

async function startChat(d, page, agentId) {
  await d.click('.rail-item[data-nav="assistants"]', 700, 0.6);
  await page.waitForSelector('#agentSearch');
  await d.click('#agentSearch', 500, 0.2);
  await d.type(agentId === 'ircc-business-requirements-refinement' ? 'requirements refinement' : agentId === 'ircc-interface-documentation' ? 'interface documentation' : 'schedule variance');
  await d.wait(0.6);
  await d.click(`[data-chat-with="${agentId}"]`, 700, 0.8);
}

async function send(d, text) {
  await d.click('#input', 500, 0.2);
  await d.type(text);
  await d.wait(0.3);
  const before = await d.replies();
  await d.click('#sendBtn', 500, 0.3);
  return before;
}

async function runFilm(d) {
  const page = d.page;
  await d.js(() => window.Film.hideCursor(true));
  // Title
  await d.card(`<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s"><em>IRCC agents</em> in Lumen</h1><p class="rise" style="animation-delay:.45s">23 LangGraph agents · hosted in Microsoft Foundry · one friendly chat</p>`, 1.2);
  await d.say('intro1'); await d.waitVoice();
  await d.say('intro2'); await d.waitVoice(0.4);
  await d.card(ARCH, 0.4);
  await d.say('arch1'); await d.waitVoice();
  await d.say('arch2'); await d.waitVoice(0.5);
  await d.uncard(1000);
  await d.js(() => window.Film.hideCursor(false));

  // Setup: Settings → Microsoft Foundry project
  await d.say('setup1');
  await d.click('#settingsBtn', 800, 0.8);
  await page.waitForSelector('#foundryField');
  await d.wait(0.6);
  await d.reveal('#foundryField', 'center', 1.1); // it sits below the fold inside the dialog
  await d.zoom('#foundryField', 1.6, 1000, 14);
  await d.hover('#sFoundry', 700);
  await d.waitVoice();
  await d.unzoom(700);
  await page.keyboard.press('Escape');
  await d.wait(0.6);

  // Agents page
  await d.click('.rail-item[data-nav="assistants"]', 800, 0.6);
  await page.waitForSelector('#agentSearch');
  await d.say('agents1');
  await d.click('#agentSearch', 500, 0.2);
  await d.type('IRCC');
  await d.wait(0.8);
  for (let i = 0; i < 4; i++) { const tag = page.locator('.a-card .status-tag:has-text("Microsoft Foundry")').nth(i); if (await tag.count()) await d.hover(tag, 520); }
  await d.waitVoice();

  // ---------------- Amira: Requirements Refinement
  await d.card(persona(...AMIRA, 'Amira', 'Business Analyst · CMP Release 2', 'Structured requirements from the new BRD'));
  await freshPersona(page, 'Amira');
  await d.say('amira1'); await d.waitVoice(0.4);
  await d.uncard();
  await d.third(third(...AMIRA, 'Amira', 'Business Analyst'));
  await d.say('amira2');
  await startChat(d, page, 'ircc-business-requirements-refinement');
  await d.zoom('.chat-empty', 1.4, 900, 30);
  await d.waitVoice();
  await d.unzoom(700);
  await d.say('amira3');
  await d.attach([input('INTAKE_BRD_v1.2.md')]);
  let before = await send(d, 'Refine this BRD into structured requirements.');
  await d.say('amira4');
  await d.waitReply(before);
  await d.waitVoice();
  await d.reveal('.msg.assistant:last-child .md', 'start', 1.0);
  await d.zoom('.msg.assistant:last-child .md', 1.25, 1000);
  await d.say('amira5');
  await d.waitVoice();
  await d.unzoom(700);
  await d.reveal('.msg.assistant:last-child .md table', 'center', 1.0);
  await d.zoom('.msg.assistant:last-child .md table', 1.3, 1000, 10);
  await d.say('amira6');
  await d.waitVoice();
  await d.unzoom(700);
  await d.say('amira7');
  before = await send(d, 'Merge INTAKE-FR-001 and INTAKE-FR-002.');
  await d.waitReply(before);
  await d.reveal('.msg.assistant:last-child .md', 'start', 1.0);
  await d.waitVoice(0.6);
  await d.third(null);

  // ---------------- Theo: Interface Documentation with an approval pause
  await d.card(persona(...THEO, 'Theo', 'Integration Architect', 'An ICD for the CMP → Name Search lookup'));
  await freshPersona(page, 'Theo');
  await d.say('theo1'); await d.waitVoice(0.4);
  await d.uncard();
  await d.third(third(...THEO, 'Theo', 'Integration Architect'));
  await startChat(d, page, 'ircc-interface-documentation');
  await d.say('theo2');
  await d.attach([input('namesearch-openapi.yaml'), input('requirements-name-search.md'), input('canonical-person.schema.json'), input('interface-name-search.json')]);
  before = await send(d, 'Draft the interface control document for the Name Search lookup.');
  await d.waitVoice();
  await d.waitReply(before);
  await page.waitForSelector('.approval-card [data-ap-apply]', { timeout: 60000 });
  await d.reveal('.approval-card', 'center', 1.0);
  await d.zoom('.approval-card', 1.4, 1000, 16);
  await d.say('theo3');
  await d.waitVoice();
  await d.unzoom(700);
  await d.say('theo4');
  before = await d.replies();
  await d.click('.approval-card [data-ap-apply]', 800, 0.6);
  await d.waitReply(before);
  await d.waitVoice();
  await d.reveal('.msg.assistant:last-child .md', 'start', 1.0);
  await d.zoom('.msg.assistant:last-child .md', 1.25, 1000);
  await d.say('theo5');
  await d.waitVoice();
  await d.unzoom(700);
  await d.third(null);

  // ---------------- Priya: Schedule Variance
  await d.card(persona(...PRIYA, 'Priya', 'Planner · Integrated Plan', 'Explain the schedule variance before steering committee'));
  await freshPersona(page, 'Priya');
  await d.say('priya1'); await d.waitVoice(0.4);
  await d.uncard();
  await d.third(third(...PRIYA, 'Priya', 'Planner'));
  await startChat(d, page, 'ircc-schedule-variance');
  await d.say('priya2');
  await d.attach([input('CMP R2 Integrated Plan.xml')]);
  before = await send(d, 'Explain the schedule variance against the baseline for the steering committee.');
  await d.waitVoice();
  await d.waitReply(before);
  await d.reveal('.msg.assistant:last-child .md', 'start', 1.0);
  await d.zoom('.msg.assistant:last-child .md', 1.25, 1000);
  await d.say('priya3');
  await d.waitVoice();
  await d.unzoom(700);
  await d.third(null);

  // Close
  await d.js(() => window.Film.hideCursor(true));
  await d.card(`<div class="kicker rise">Live in Microsoft Foundry</div><h1 class="rise" style="animation-delay:.15s;font-size:64px">All <em>23</em> IRCC agents</h1><div class="pills rise" style="animation-delay:.4s;max-width:1300px;margin-left:auto;margin-right:auto">${AGENT_PILLS.map((p) => `<span style="font-size:17px;padding:8px 16px">${p}</span>`).join('')}</div>`, 0.4);
  await d.say('close1'); await d.waitVoice(0.6);
  await d.card(`<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s"><em>Lumen</em> + Foundry</h1><p class="rise" style="animation-delay:.45s">IRCC agents, made friendly for everyone on the team</p>`, 0.3);
  await d.say('end'); await d.waitVoice(1.5);
}

// ------------------------------------------------------------------ capture (CDP screencast, like make_video.py)
class Capture {
  constructor(page, cdp) { this.page = page; this.cdp = cdp; this.dir = path.join(WORK, 'frames'); fs.rmSync(this.dir, { recursive: true, force: true }); fs.mkdirSync(this.dir, { recursive: true }); this.frames = []; this.on = true;
    cdp.on('Page.screencastFrame', (f) => { if (!this.on) return; const p = path.join(this.dir, `${String(this.frames.length).padStart(6, '0')}.jpg`); fs.writeFileSync(p, Buffer.from(f.data, 'base64')); this.frames.push([p, f.metadata.timestamp]); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); }); }
  start() { return this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(VIEW.width * DSF), maxHeight: Math.round(VIEW.height * DSF), everyNthFrame: 1 }); }
  async stop() { await this.page.waitForTimeout(300); await this.cdp.send('Page.stopScreencast'); this.on = false; }
}

// ------------------------------------------------------------------ sound (ported from make_video.py)
function rng(seed) { let s = seed >>> 0; const u = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); return { u, n: () => { const a = Math.max(u(), 1e-9); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u()); } }; }
function clickSound(r) { const n = Math.round(0.06 * RATE); const o = new Float32Array(n); let prev = 0; for (let i = 0; i < n; i++) { const t = i / RATE; const x = r.n() * Math.exp(-t * 900) * 0.9; o[i] = (x - prev) + Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 90) * 0.35; prev = x; } return o; }
function keySound(r) { const n = Math.round(0.03 * RATE); const o = new Float32Array(n); let prev = 0; const g = 0.18 + r.u() * 0.12; for (let i = 0; i < n; i++) { const x = r.n(); o[i] = (x - prev) * Math.exp(-(i / RATE) * 1400) * g; prev = x; } return o; }
function whoosh(r, soft) { const n = Math.round((soft ? 0.45 : 0.8) * RATE); const acc = new Float64Array(n); let s = 0; for (let i = 0; i < n; i++) { s += r.n(); acc[i] = s; } const o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / (n - 1); const w = Math.round(40 - 34 * Math.sin(Math.PI * t)); const lo = Math.max(0, i - w); o[i] = ((acc[i] - acc[lo]) / (i - lo + 1)) * Math.sin(Math.PI * t) ** 2 * (soft ? 0.5 : 0.9); } return o; }
function music(seconds, r) {
  const n = Math.round(seconds * RATE); const bed = new Float32Array(n);
  const chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 52, 55, 59, 62], [55, 59, 62, 66, 69]];
  const bar = 4 * 60 / 96 * 2; const hz = (m) => 440 * 2 ** ((m - 69) / 12); const step = 60 / 96 / 2;
  for (let k = 0; k <= seconds / bar; k++) {
    const notes = chords[k % 4]; const s0 = Math.round(k * bar * RATE); const s1 = Math.min(n, Math.round(((k + 1) * bar + 1.5) * RATE)); if (s0 >= n) break;
    for (let i = s0; i < s1; i++) { const tt = (i - s0) / RATE; const env = Math.min(1, tt / 1.6) * Math.min(1, Math.max(0, (bar + 1.5 - tt) / 1.5)); let v = 0.03 * env * Math.sin(2 * Math.PI * hz(notes[0] - 12) * tt); for (const m of notes) for (const det of [-0.08, 0.08]) v += 0.022 * env * Math.sin(2 * Math.PI * hz(m) * (1 + det / 100) * tt); bed[i] += v; }
    for (let j = 0; j < Math.floor(bar / step); j++) { const a0 = s0 + Math.round(j * step * RATE); const a1 = Math.min(n, a0 + Math.round(0.9 * RATE)); if (a0 >= n) break; const m = notes[[0, 2, 4, 3, 1, 3, 4, 2][j % 8]] + 12; const g = 0.6 + 0.4 * r.u(); for (let i = a0; i < a1; i++) { const ta = (i - a0) / RATE; bed[i] += 0.018 * Math.exp(-ta * 5) * Math.sin(2 * Math.PI * hz(m) * ta) * g; } }
  }
  for (let i = 0; i < n; i++) { const t = i / RATE; bed[i] *= Math.max(0, Math.min(1, t / 2.5, (seconds - t) / 3.5)); }
  return bed;
}
function readVoice(key) {
  const w = wavInfo(path.join(VO, `${key}.wav`)); const n = w.data.size / 2 / w.channels; const out = new Float32Array(Math.round(n * RATE / w.rate));
  const sample = (i) => w.buf.readInt16LE(w.data.start + i * 2 * w.channels) / 32768;
  for (let i = 0; i < out.length; i++) { const x = i * w.rate / RATE; const i0 = Math.floor(x); out[i] = sample(Math.min(i0, n - 1)) * (1 - (x - i0)) + sample(Math.min(i0 + 1, n - 1)) * (x - i0); }
  return out;
}
function buildAudio(events, start, seconds, file) {
  const r = rng(7); const n = Math.round(seconds * RATE) + RATE; const voice = new Float32Array(n); const fx = new Float32Array(n); const cues = [];
  const put = (track, at, clip, gain = 1) => { for (let i = 0; i < clip.length && at + i < n; i++) track[at + i] += clip[i] * gain; };
  for (const e of events) {
    const at = Math.round((e.t - start) * RATE); if (at < 0 || at >= n) continue;
    if (e.kind === 'voice') { const a = readVoice(e.id); put(voice, at, a); cues.push([e.t - start, e.t - start + a.length / RATE, LINES[e.id][1]]); }
    else if (e.kind === 'click') put(fx, at, clickSound(r), 0.55);
    else if (e.kind === 'key') put(fx, at, keySound(r), 0.5);
    else if (e.kind === 'whoosh') put(fx, at, whoosh(r, e.soft), e.soft ? 0.16 : 0.26);
  }
  const bed = music(n / RATE, r); const k = Math.round(0.25 * RATE); let acc = 0; const env = new Float32Array(n);
  for (let i = 0; i < n; i++) { acc += Math.abs(voice[i]); if (i >= k) acc -= Math.abs(voice[i - k]); env[i] = acc / k; }
  const pcm = Buffer.alloc(44 + n * 4);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(RATE, 24); pcm.writeUInt32LE(RATE * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const duck = 1 - 0.55 * Math.min(1, Math.max(0, env[Math.min(i + k / 2 | 0, n - 1)] * 25)); const v = Math.max(-1, Math.min(1, voice[i] * 1.15 + fx[i] + (bed[i] || 0) * duck * 0.9)); const s = Math.round(v * 32767); pcm.writeInt16LE(s, 44 + i * 4); pcm.writeInt16LE(s, 46 + i * 4); }
  fs.writeFileSync(file, pcm);
  return cues;
}
function writeSrt(cues, file) {
  const stamp = (s) => { const ms = Math.round(s * 1000); const p = (v, w = 2) => String(v).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  const out = []; let i = 0;
  for (const [a, b, text] of cues) {
    const parts = text.split(/(?<=[.?!])\s+/).filter(Boolean); const total = parts.reduce((s, p) => s + p.length, 0); let at = a;
    for (const p of parts) { const end = at + (b - a) * p.length / total; i += 1; out.push(String(i), `${stamp(at)} --> ${stamp(end)}`, p, ''); at = end; }
  }
  fs.writeFileSync(file, out.join('\n'), 'utf8');
}

// ------------------------------------------------------------------ edit and encode
function ffmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try { return execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['ffmpeg'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim(); } catch { /* not on PATH */ }
  throw new Error('Set FFMPEG_PATH to a full ffmpeg (e.g. from the imageio-ffmpeg Python package).');
}
function trimDeadAir(frames, events, longest = 3.0) {
  const voices = events.filter((e) => e.kind === 'voice').map((e) => [e.t, e.t + wavInfo(path.join(VO, `${e.id}.wav`)).seconds]);
  const cuts = [];
  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i][1]; const b = frames[i + 1][1]; if (b - a <= longest) continue;
    const talking = Math.max(a, ...voices.filter(([v0, v1]) => v0 < b && v1 > a).map(([, v1]) => v1));
    const keep = Math.max(longest, talking - a + 0.6); if (b - a > keep + 0.5) cuts.push([a + keep, b - a - keep]);
  }
  if (!cuts.length) return [frames, events];
  const shift = (t) => t - cuts.filter(([at, n]) => t >= at + n).reduce((s, [, n]) => s + n, 0) - cuts.filter(([at, n]) => at <= t && t < at + n).reduce((s, [at]) => s + (t - at), 0);
  console.log('trimmed dead air:', cuts.map(([, n]) => `${n.toFixed(1)}s`).join(', '));
  return [frames.map(([f, t]) => [f, shift(t)]), events.map((e) => ({ ...e, t: shift(e.t) }))];
}
function finish(capFrames, rawEvents) {
  const ffmpeg = ffmpegPath();
  fs.mkdirSync(OUT, { recursive: true });
  let frames = [...capFrames].sort((a, b) => a[1] - b[1]);
  fs.writeFileSync(path.join(WORK, 'events.json'), JSON.stringify({ events: rawEvents, frame_list: frames }, null, 1));
  let events; [frames, events] = trimDeadAir(frames, rawEvents);
  const start = frames[0][1]; const end = Math.max(frames[frames.length - 1][1], ...events.map((e) => e.t)) + 0.5; const seconds = end - start;
  console.log(`frames ${frames.length} over ${seconds.toFixed(1)}s (${(frames.length / seconds).toFixed(1)} fps captured)`);
  if (args.has('--stills')) {
    const picks = Array.from({ length: 24 }, (_, i) => frames[Math.floor(i * (frames.length - 1) / 23)][0]);
    const grid = `${picks.map((_, i) => `[${i}:v]scale=480:270[s${i}];`).join('')}${picks.map((_, i) => `[s${i}]`).join('')}xstack=inputs=24:layout=${picks.map((_, i) => `${(i % 6) * 480}_${Math.floor(i / 6) * 270}`).join('|')}`;
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...picks.flatMap((f) => ['-i', f]), '-filter_complex', grid, path.join(OUT, `${NAME}-contact-sheet.jpg`)]);
    console.log('wrote', path.join(OUT, `${NAME}-contact-sheet.jpg`)); return;
  }
  const listing = path.join(WORK, 'frames.txt');
  fs.writeFileSync(listing, frames.map(([f, t], i) => `file '${f.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, (i + 1 < frames.length ? frames[i + 1][1] : end) - t).toFixed(4)}\n`).join('') + `file '${frames[frames.length - 1][0].replace(/\\/g, '/')}'\n`);
  const wav = path.join(WORK, 'mix.wav');
  const cues = buildAudio(events, start, seconds, wav);
  const srt = path.join(OUT, `${NAME}.srt`);
  writeSrt(cues, srt);
  const mp4 = path.join(OUT, `${NAME}.mp4`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listing, '-i', wav,
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', mp4], { stdio: 'inherit' });
  const thumbAt = frames[Math.floor(frames.length * 0.42)][0];
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', thumbAt, '-vf', 'scale=1280:720', path.join(OUT, `${NAME}-thumbnail.jpg`)]);
  console.log('wrote', mp4, '\nwrote', srt);
}

// ------------------------------------------------------------------ main
async function waitForServer() {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/api/status`); if (r.ok) return; } catch { /* starting */ } await sleep(500); }
  throw new Error('film server did not start');
}

async function main() {
  const lengths = makeVoice();
  if (args.has('--voice')) { let total = 0; for (const [k, v] of Object.entries(lengths)) { total += v; console.log(k.padEnd(10), v.toFixed(1) + 's'); } console.log(`total narration ${total.toFixed(0)}s`); return; }
  const server = spawn(process.execPath, [path.join(FILM, 'foundry-server.js'), FILMING ? 'film' : 'record'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'inherit', 'inherit'] });
  try {
    await waitForServer();
    const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--force-color-profile=srgb'] });
    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DSF });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript({ path: path.join(FILM, 'overlay.js') });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForSelector('.greeting', { timeout: 30000 });
    await page.waitForTimeout(1500);
    const d = new Director(page, lengths);
    let cap = null;
    if (FILMING) { cap = new Capture(page, await context.newCDPSession(page)); await cap.start(); }
    const t0 = Date.now();
    try { await runFilm(d); } catch (e) { await page.screenshot({ path: path.join(WORK, 'failed.png') }); throw e; }
    if (cap) await cap.stop();
    await browser.close();
    console.log('page errors', errors, 'took', Math.round((Date.now() - t0) / 1000), 's');
    if (FILMING) finish(cap.frames, d.events);
  } finally {
    server.kill();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
