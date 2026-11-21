// "A long list of agent ideas, and one evening to find out": a practitioner's cut. How I built 23 LangGraph agents
// (shared core, one graph shape, the wiring: edges, Send fan-out, a self-check loop, typed model calls, interrupt),
// deployed them to Microsoft Foundry hosted agents, what Foundry adds for the enterprise (identity, access,
// guardrails, red teaming, tracing, cost), and how an app (Lumen) consumes them.
//
//   node film/make_e2e3.js --voice    Narration only (Kokoro), with each line's length.
//   node film/make_e2e3.js            Film and encode film/out/lumen-langgraph-on-foundry.mp4 + .srt + .vtt + thumbnail.
//   node film/make_e2e3.js --remix    Re-voice and re-encode from the last run's frames.
//   node film/make_e2e3.js --stills   Film, then write a contact sheet instead of encoding.
//
// Uses make_e2e.js's signed-in Edge profile (film/.work-e2e/edge-profile; `node film/make_e2e.js --login`), its
// portal masking and multi-tab capture. The portal is navigated on camera. Lumen replays recorded agent replies.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createKit } = require('./filmkit');
const { grab, buildDeck } = require('./code-deck');
const E = require('./make_e2e');

const FILM = __dirname;
const ROOT = path.resolve(FILM, '..');
const REPO = E.REPO;
const WORK = path.join(FILM, '.work-e2e3');
const NAME = 'lumen-langgraph-on-foundry';
const PORT = E.PORT;
const BRR = E.BRR;
const ICD = 'contoso-interface-documentation';
const INPUTS = path.join(FILM, '.work-foundry', 'CSP Release 2');
const args = new Set(process.argv.slice(2));

// ------------------------------------------------------------------ narration: [spoken, caption]
const LINES = {
  hook1: ['A client and I were deciding where a long list of agents would live, and we were landing on simple markdown agents in GitHub Copilot. But if they were ever built as code, LangGraph was the approved framework. So before that window closed, I found out what it would really take.',
    'A client and I were deciding where a long list of agents would live, and we were landing on simple markdown agents in GitHub Copilot. But if they were ever built as code, LangGraph was the approved framework. So before that window closed, I found out what it would really take.'],
  b1: ['Twenty three agents in one evening only works with a plan. I built one shared core first. The graph kit, typed state, model calls, approvals and guardrails. Each agent is then a small package on top.',
    'Twenty-three agents in one evening only works with a plan. I built one shared core first: the graph kit, typed state, model calls, approvals and guardrails. Each agent is then a small package on top.'],
  b2: ['Every agent follows the same graph shape. Take in the request, ground it in sources, analyse, and check its own work. Only then, if it wants to change something, does it stop and ask a person.',
    'Every agent follows the same graph shape: take in the request, ground it in sources, analyse, and check its own work. Only then, if it wants to change something, does it stop and ask a person.'],
  b3: ['Here is a real one, exported straight from LangGraph. Green steps are plain Python, purple steps call the model, and amber is a person.',
    'Here is a real one, exported straight from LangGraph. Green steps are plain Python, purple steps call the model, and amber is a person.'],
  b4: ['And here is the wiring. Plain edges always go to the next step. Conditional edges let a function decide. After retrieving context, one hands off to fan out.',
    'And here is the wiring. Plain edges always go to the next step. Conditional edges let a function decide. After retrieving context, one hands off to fan_out.'],
  b5: ['Fan out returns a list of Send objects. One extraction per document section, all running in parallel.',
    'fan_out returns a list of Send objects: one extraction per document section, all running in parallel.'],
  b6: ['A self check then verifies every quote against its source, and a second conditional edge loops back, only for the sections that failed.',
    'A self-check then verifies every quote against its source, and a second conditional edge loops back, only for the sections that failed.'],
  b7: ['Model calls return typed, validated objects, not free text. And if the content filter blocks a section, the agent records a finding, instead of failing the run.',
    'Model calls return typed, validated objects, not free text. And if the content filter blocks a section, the agent records a finding, instead of failing the run.'],
  b8: ['When an agent wants to change something, interrupt pauses the graph. The checkpoint saves its state, and the run resumes exactly where it stopped, once a person decides.',
    'When an agent wants to change something, interrupt() pauses the graph. The checkpoint saves its state, and the run resumes exactly where it stopped, once a person decides.'],
  b9: ['Because the model can be scripted out, close to seven hundred tests run in a couple of minutes, with no network.',
    'Because the model can be scripted out, close to 700 tests run in a couple of minutes, with no network.'],
  maf1: ['I had deployed agents to Foundry before, with Microsoft Agent Framework. This was my first time deploying LangGraph agents there.',
    'I had deployed agents to Foundry before, with Microsoft Agent Framework. This was my first time deploying LangGraph agents there.'],
  dep1: ['Deployment is generated. A build step makes one folder per agent, writes the azure dot yaml, and one a z d deploy publishes all twenty three.',
    'Deployment is generated. A build step makes one folder per agent, writes the azure.yaml, and one azd deploy publishes all 23.'],
  dep2: ['In Microsoft Foundry, under Agents, all twenty three show up as hosted agents. Foundry built each container in the cloud, runs it, and versions every deployment.',
    'In Microsoft Foundry, under Agents, all 23 show up as hosted agents. Foundry built each container in the cloud, runs it, and versions every deployment.'],
  ent1a: ['This is where Foundry makes them enterprise ready. Open an agent, and select its Details tab.',
    'This is where Foundry makes them enterprise-ready. Open an agent, and select its Details tab.'],
  ent1: ['Each agent gets its own Entra agent identity, granted access to the project\'s models, so there are no keys or secrets in the code.',
    "Each agent gets its own Entra agent identity, granted access to the project's models, so there are no keys or secrets in the code."],
  ent2: ['Each one exposes a standard Responses endpoint, and only people with the right Azure role can call it.',
    'Each one exposes a standard Responses endpoint, and only people with the right Azure role can call it.'],
  ent3: ['Guardrails sit on the model deployment. They block harmful content, detect jailbreaks, and check documents for indirect prompt injection.',
    'Guardrails sit on the model deployment. They block harmful content, detect jailbreaks, and check documents for indirect prompt injection.'],
  ent4a: ['Then I pointed Foundry\'s ay-eye Red Teaming Agent at the deployed agents, with attacks hidden inside the documents they read. At the time of recording, its reports open in the classic view.',
    "Then I pointed Foundry's AI Red Teaming Agent at the deployed agents, with attacks hidden inside the documents they read. At the time of recording, its reports open in the classic view."],
  ent4: ['It found one real failure. A planted harmful sentence became a requirement.',
    'It found one real failure. A planted harmful sentence became a requirement.'],
  ent5: ['The fix is layered. The content filter, a prompt rule, and a deterministic scan that drops anything built from harmful text.',
    'The fix is layered: the content filter, a prompt rule, and a deterministic scan that drops anything built from harmful text.'],
  ent6: ['The re scan found nothing, and that case is now part of the test suite.',
    'The re-scan found nothing, and that case is now part of the test suite.'],
  ent7a: ['Back under Agents, every agent also has a Traces tab.',
    'Back under Agents, every agent also has a Traces tab.'],
  ent7: ['Every request is traced. Open one, and you see each LangGraph step, and every model call underneath, with its timing and tokens.',
    'Every request is traced. Open one, and you see each LangGraph step, and every model call underneath, with its timing and tokens.'],
  ent8: ['And Monitor rolls it all up across the agents. Runs, tokens, and what it cost.',
    'And Monitor rolls it all up across the agents: runs, tokens, and what it cost.'],
  app1: ['Finally, how does an app consume them? I extended Lumen, a chat app I had built earlier. It calls the agent\'s endpoint with the user\'s own Azure sign in, and sends the attached files.',
    "Finally, how does an app consume them? I extended Lumen, a chat app I had built earlier. It calls the agent's endpoint with the user's own Azure sign-in, and sends the attached files."],
  app2: ['When the agent pauses for a decision, Lumen shows an approval card. Approve it, and the agent picks up exactly where it stopped.',
    'When the agent pauses for a decision, Lumen shows an approval card. Approve it, and the agent picks up exactly where it stopped.'],
  app3: ['On the code side, it is one provider file. Build the request, call the Responses endpoint, and send the approval back. Foundry can also publish agents straight to Teams and Microsoft 365 Copilot.',
    'On the code side, it is one provider file: build the request, call the Responses endpoint, and send the approval back. Foundry can also publish agents straight to Teams and Microsoft 365 Copilot.'],
  close1: ['The client stayed with the simple approach, and that was fine. For me, it was a great way to put LangGraph and Microsoft Foundry through their paces, end to end.',
    'The client stayed with the simple approach, and that was fine. For me, it was a great way to put LangGraph and Microsoft Foundry through their paces, end to end.'],
  end: ['A long list of agent ideas, and one evening to find out.', 'A long list of agent ideas, and one evening to find out.'],
};

// ------------------------------------------------------------------ slides (from the real source)
const R = (p) => path.join(REPO, p);
const Lm = (p) => path.join(ROOT, p);
function code(id, kicker, title, file, start, opts, lang, repo, notes) {
  const g = grab(file, start, opts);
  return { type: 'code', id, kicker, title, path: path.relative(repo === 'Lumen' ? ROOT : REPO, file).replace(/\\/g, '/'), repo: repo === 'Lumen' ? 'CLIChat (Lumen)' : 'contoso-sdlc-agents', lang, first: g.first, text: g.text, notes };
}
const BRR_SRC = 'agents/01-business-requirements-refinement/src/contoso_brr';
function slides() {
  const graphs = JSON.parse(fs.readFileSync(path.join(FILM, 'code-graphs.json'), 'utf8'));
  return [
    { type: 'tree', id: 's-repo', kicker: 'The plan', title: 'One <em>shared core</em>, 23 small agents', rows: [
      [0, 'contoso-sdlc-agents/', 'core', ''],
      [1, 'libs/contoso_agent_core/', 'core', 'graph kit, typed state, model calls, approvals (HITL), apply + audit, guardrails, hosting'],
      [1, 'libs/contoso_contracts/', 'contract', 'shared Pydantic models: Requirement, VarianceFinding, ControlMapping…'],
      [1, 'libs/contoso_connectors/', 'conn', 'ADO, SharePoint, Excel, MS Project, knowledge, Teams… fixture + live'],
      [1, 'agents/', 'agent', '23 packages, one per agent'],
      [2, '01-business-requirements-refinement/', 'agent', 'graph.py · state.py · nodes.py · prompts/ · tests/ · evals/'],
      [2, '… 22 more', 'agent', ''],
      [1, 'tools/   evals/   infra/', 'ops', 'build_deploy.py · gen_azure_yaml.py · eval + red-team runners · Bicep'],
    ] },
    { type: 'flow', id: 's-shape', kicker: 'One graph shape', title: 'Every agent: <em>ground, analyse, check</em>, then ask', layout: 'tall', steps: [
      ['📥', 'intake', 'parse the request', ''],
      ['📚', 'retrieve', 'documents, plans, knowledge', ''],
      ['🧠', 'analyse', 'compute, then model', ''],
      ['🔍', 'self-check', 'citations, numbers, loop', ''],
      ['📄', 'render', 'JSON · Markdown · DOCX', ''],
      ['✋', 'approval', 'interrupt()', 'hitl'],
      ['✍️', 'apply', 'the only writer', 'hitl'],
      ['🏁', 'finalize', 'reply', ''],
    ] },
    { type: 'graph', id: 's-g01', kicker: 'Agent 01 · Requirements Refinement', title: 'A real graph: <em>16 working nodes</em>', graph: graphs['01'],
      kinds: { det: ['intake', 'parse', 'retrieve_context', 'normalise', 'self_check', 'assemble', 'apply_edits', 'render', 'propose_publish', 'apply'], llm: ['extract_section', 'classify', 'analyse_quality', 'gap_analysis'], hitl: ['approve'], io: ['finalize'] },
      note: 'Exported from LangGraph with get_graph(). Green: Python · purple: model · amber: a person.' },
    code('s-wiring', 'agents/01 · graph.py', 'Wiring the graph: <em>edges, conditions, a loop</em>', R(`${BRR_SRC}/graph.py`), 'g.add_edge(START, "intake")', { count: 20 }, 'python', 'Agents', [
      '<code>add_edge</code>: always the next step',
      '<code>add_conditional_edges</code>: a function decides',
      '<code>self_check</code> loops back only for failed sections']),
    code('s-fanout', 'agents/01 · nodes.py', 'Fan-out with <em>Send</em>', R(`${BRR_SRC}/nodes.py`), 'def fan_out(', { count: 5 }, 'python', 'Agents', [
      'Returns a list of <code>Send</code>',
      'One <code>extract_section</code> per BRD section, in parallel']),
    code('s-llm', 'contoso_agent_core · llm.py', 'Typed model calls, <em>platform edges handled</em>', R('libs/contoso_agent_core/src/contoso_agent_core/llm.py'), 'def is_content_filter_error', { count: 44 }, 'python', 'Agents', [
      '<code>generate_structured(Schema, …)</code> returns validated <b>Pydantic</b> objects',
      'Content filter → <code>ContentFilteredError</code>: a finding, not a failed run']),
    code('s-hitl', 'contoso_agent_core · hitl.py', 'A person approves <em>before anything changes</em>', R('libs/contoso_agent_core/src/contoso_agent_core/hitl.py'), 'def request_approval(', { count: 28 }, 'python', 'Agents', [
      '<code>interrupt()</code> pauses the graph; the checkpointer keeps its state',
      'Resumes exactly where it stopped, after the decision']),
    code('s-test', 'tests', 'Real graphs, <em>scripted model</em>, no network', R('libs/contoso_agent_core/tests/test_core_graph.py'), 'def test_interrupt_approve_apply_orders_and_substitutes', { count: 18 }, 'python', 'Agents', [
      '<code>ScriptedLLM</code> answers per schema',
      '<code>run</code> → <code>pending_interrupts</code> → <code>resume</code>',
      '~700 tests across core, connectors, 23 agents, triggers, evals']),
    code('s-deploy', 'tools · build_deploy.py', 'Generated deployment to <em>Foundry hosted agents</em>', R('tools/build_deploy.py'), 'MAIN = ', { count: 40 }, 'python', 'Agents', [
      'One flat folder per agent: <code>main.py</code> + <code>requirements.txt</code> + vendored libs',
      '<code>azure.yaml</code> generated from each agent\'s metadata',
      '<code>azd deploy</code> → 23 hosted agents, each with its own identity']),
    code('s-harm', 'agents/01 · nodes.py', 'The fix: <em>harmful text is never a requirement</em>', R(`${BRR_SRC}/nodes.py`), 'if scan_injection(md):', { count: 16 }, 'python', 'Agents', [
      'Layer 1: Foundry content filter on the model deployment',
      'Layer 2: the extraction prompt says such text is never a requirement',
      'Layer 3: <code>scan_harmful()</code> flags it and drops any requirement built from it']),
    code('s-lumen', 'Lumen · providers/foundry-agents.js', 'Lumen\'s Foundry engine: <em>one provider file</em>', Lm('providers/foundry-agents.js'), 'async run({', { count: 44 }, 'javascript', 'Lumen', [
      'Agent + attachments → request (<code>buildPayload</code>)',
      'Responses endpoint, your Azure sign-in, conversation = previous response id',
      'Approval request → <b>Approve card</b> → <code>mcp_approval_response</code>']),
  ];
}

// ------------------------------------------------------------------ cards
const LOGO = E.LOGO;
const TITLE = `<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s;font-size:64px">A long list of agent ideas,<br><em>and one evening to find out</em></h1><p class="rise" style="animation-delay:.45s">23 LangGraph agents · Microsoft Foundry hosted agents</p>`;
const MAF = `<div class="kicker rise">A first for me</div><h1 class="rise" style="animation-delay:.15s;font-size:64px">LangGraph <em>on Foundry</em></h1><div class="pills rise" style="animation-delay:.45s"><span>Before: Microsoft Agent Framework → Foundry</span><span>This time: LangGraph → Foundry</span></div>`;
const CLOSE = `<div class="kicker rise">What I took away</div><h1 class="rise" style="animation-delay:.15s;font-size:60px">Build it, ship it, <em>use it</em></h1><div class="pills rise" style="animation-delay:.4s;max-width:1150px;margin-left:auto;margin-right:auto"><span>One shared core, one graph shape</span><span>One azd deploy, 23 hosted agents</span><span>Identity · guardrails · red teaming · tracing</span><span>Any app can consume them</span></div>`;
const END = `<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s;font-size:60px">A long list of agent ideas,<br><em>and one evening to find out</em></h1><p class="rise" style="animation-delay:.45s">Synthetic data · fictional organization · a proof of concept</p>`;
const chap = (t) => `<span>${t}</span>`;

async function runFilm(d, cap, pages) {
  const { deck, portal, lumen } = pages;
  let label = null;
  const applyLabel = async (page) => { await page.evaluate((h) => window.Film && window.Film.badge(h), label).catch(() => {}); };
  const use = async (page) => { d.page = page; await applyLabel(page); await cap.show(page); };
  const setLabel = async (html) => { label = html; await applyLabel(d.page); };
  const dk = (fn, ...a) => d.js(([f, x]) => window.Deck[f](...x), [fn, a]);
  const show = async (id) => { await dk('show', id); d.log('whoosh', { soft: true }); await d.wait(0.7); };
  const notes = async (id, n, gap) => { for (let i = 1; i <= n; i++) { await dk('note', id, i); await d.wait(gap); } };
  const focus = async (id, from, to, hold = 0.6) => { await dk('focus', id, from, to); await d.wait(0.9); await d.wait(hold); };
  const reveal = async (id) => { await deck.evaluate((i) => { const e = document.getElementById(i); if (e) { e.style.opacity = '1'; e.style.transform = 'none'; } }, id); d.log('whoosh', { soft: true }); };
  const cardOn = async (html, hold = 0) => {
    d.page = deck;
    const off = cap.active !== cap.sessions.get(deck);
    await deck.evaluate(([h, ms]) => {
      const old = document.getElementById('film-card'); if (old) old.id = 'film-card-old';
      window.Film.card(h, { fadeMs: ms }); const c = document.getElementById('film-card'); void c.offsetWidth; c.classList.add('show');
      if (old) setTimeout(() => old.remove(), ms + 100);
    }, [html, off ? 0 : 600]);
    d.log('whoosh');
    await applyLabel(deck);
    if (off) { await deck.waitForTimeout(800); await cap.show(deck); }
    await d.wait(hold);
  };
  const lumenReset = async () => {
    for (const c of await E.api('GET', '/api/conversations')) await E.api('DELETE', `/api/conversations/${c.id}`);
    await lumen.goto(`http://127.0.0.1:${PORT}/`); await lumen.waitForSelector('.greeting', { timeout: 30000 }); await E.filmReady(lumen);
  };
  const openAgent = async (search, id) => {
    await d.click('.rail-item[data-nav="assistants"]', 700, 0.6);
    await lumen.waitForSelector('#agentSearch');
    await d.click('#agentSearch', 500, 0.2);
    await d.type(search);
    await d.wait(0.5);
    await d.click(`[data-chat-with="${id}"]`, 700, 0.8);
  };
  const attach = async (files) => {
    await d.click('#attachBtn', 650, 0.5);
    await lumen.keyboard.press('Escape');
    await lumen.setInputFiles('#fileInput', files.map((f) => path.join(INPUTS, f)));
    d.log('click');
    await lumen.waitForFunction(() => document.querySelectorAll('.attach-chip:not(.uploading)').length > 0 && !document.querySelector('.attach-chip.uploading'), null, { timeout: 30000 });
    await d.wait(0.5);
  };
  const replies = () => lumen.evaluate(() => document.querySelectorAll('.msg.assistant .msg-actions').length);
  const send = async (text) => { await d.click('#input', 500, 0.2); await d.type(text); const n = await replies(); await d.click('#sendBtn', 500, 0.3); return n; };
  const waitReply = (n) => lumen.waitForFunction((k) => { const b = document.querySelector('#sendBtn'); return document.querySelectorAll('.msg.assistant .msg-actions').length > k && b && !b.classList.contains('stop'); }, n, { timeout: 120000, polling: 250 });

  // Portal navigation on camera: the left navigation, tabs and links, as a viewer would click them.
  const ready = async (text, ms = 2000) => { await portal.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 90000 }); await E.settle(portal, ms); await E.closeDialogs(portal); await applyLabel(portal); };
  const NAV = { Agents: '/build/agents', Guardrails: '/build/guardrails', Monitor: '/build/observe' };
  const navNew = async (label, readyText) => {
    await d.click(portal.locator(`a[aria-label="${label}"]:visible`).first(), 750, 0.4);
    try { await ready(readyText); } catch (e) { if (!NAV[label]) throw e; console.log('nav fallback', label, portal.url().slice(0, 60)); await E.gotoPortal(portal, E.nextgen(NAV[label]), readyText); await applyLabel(portal); }
  };
  const hoverNav = async (t) => { const l = portal.locator(`a[aria-label="${t}"]:visible`).first(); if (await l.count()) await d.hover(l, 520); };
  const tab = async (name, readyText) => { await d.click(portal.getByRole('tab', { name, exact: true }).first(), 700, 0.4); if (readyText) await ready(readyText, 1500); };
  const toggleFoundry = async (on) => {
    const sw = portal.locator('[role=switch]').first();
    await d.click(sw, 700, 0.3);
    await portal.waitForTimeout(2500);
    const skip = portal.getByRole('button', { name: 'Continue without feedback' });
    if (await skip.isVisible().catch(() => false)) await d.click(skip, 600, 0.3);
    await E.settle(portal, 5000);
    if (on) { // the new portal greets a returning user with a welcome dialog: close it as a viewer would
      const x = portal.locator('[role=dialog]:visible button[aria-label="Close" i], .fui-DialogSurface:visible button[aria-label="Close" i]').first();
      try { await x.waitFor({ state: 'visible', timeout: 12000 }); await d.click(x, 600, 0.4); } catch { /* no dialog */ }
    }
    await E.closeDialogs(portal); await applyLabel(portal);
  };

  // ---------------- 1. Title: the story
  await cardOn(TITLE, 0.3);
  await d.js(() => window.Film.hideCursor(true));
  await d.say('hook1'); await d.waitVoice(0.4);

  // ---------------- 2. How I built them
  await setLabel(chap('How I built them'));
  d.page = deck; await show('s-repo'); await d.uncard(800);
  await d.say('b1');
  await d.wait(3.0); await dk('tree', 's-repo', ['contoso_agent_core']); await d.wait(Math.max(1.5, d.voiceLeft() - 3.5));
  await dk('tree', 's-repo', ['agents/', '01-business', '… 22 more']); await d.waitVoice(); await dk('tree', 's-repo', null);
  await show('s-shape');
  await d.say('b2');
  for (const i of [0, 1, 2, 3]) { await dk('light', 's-shape', i); await d.wait(Math.max(0.9, (d.voiceLeft() - 4.0) / (4 - i))); }
  for (const i of [5, 6]) { await dk('light', 's-shape', i); await d.wait(1.4); }
  await d.waitVoice(); await dk('light', 's-shape', 'all'); await d.wait(0.4);
  await show('s-g01');
  await d.say('b3');
  await d.wait(3.0); await dk('mark', 's-g01', ['intake', 'parse', 'retrieve_context', 'normalise', 'self_check', 'assemble', 'apply_edits', 'render', 'propose_publish', 'apply']); await d.wait(1.8);
  await dk('mark', 's-g01', ['extract_section', 'classify', 'analyse_quality', 'gap_analysis']); await d.wait(1.6);
  await dk('mark', 's-g01', ['approve']); await d.waitVoice(); await dk('mark', 's-g01', null);
  await show('s-wiring'); await d.js(() => window.Film.hideCursor(false));
  await d.say('b4');
  await focus('s-wiring', 'g.add_edge("extract_section", "normalise")', 'g.add_edge("gap_analysis", "self_check")', 0.3); await notes('s-wiring', 1, 0.3);
  await d.wait(Math.max(0.8, d.voiceLeft() - 4.2));
  await focus('s-wiring', 'add_conditional_edges("retrieve_context"', 'add_conditional_edges("retrieve_context"', 0.3); await notes('s-wiring', 2, 0.3);
  await d.waitVoice();
  await show('s-fanout');
  await d.say('b5');
  await focus('s-fanout', 'def fan_out(', 'for s in _targets(state)]', 0.3); await notes('s-fanout', 2, 1.0);
  await d.waitVoice(); await dk('focus', 's-fanout', null);
  await show('s-wiring');
  await d.say('b6');
  await focus('s-wiring', 'add_conditional_edges("self_check"', 'add_conditional_edges("self_check"', 0.3); await notes('s-wiring', 3, 0.3);
  await d.waitVoice(); await dk('focus', 's-wiring', null);
  await show('s-llm');
  await d.say('b7');
  await focus('s-llm', 'def generate_structured(', 'return _invoke(model, messages)', 0.3); await notes('s-llm', 1, 0.3);
  await d.wait(Math.max(1.0, d.voiceLeft() - 4.5));
  await focus('s-llm', 'def is_content_filter_error', 'raise ContentFilteredError', 0.3); await notes('s-llm', 2, 0.3);
  await d.waitVoice(); await dk('focus', 's-llm', null);
  await show('s-hitl');
  await d.say('b8');
  await focus('s-hitl', 'def request_approval(', '"""Pause the graph', 0.3); await notes('s-hitl', 1, 0.3);
  await d.wait(Math.max(0.8, d.voiceLeft() - 4.0));
  await focus('s-hitl', 'raw = interrupt(request)', 'raw = interrupt(request)', 0.3); await notes('s-hitl', 2, 0.3);
  await d.waitVoice(); await dk('focus', 's-hitl', null);
  await show('s-test');
  await d.say('b9');
  await focus('s-test', 'with ScriptedLLM', 'run(graph', 0.3); await notes('s-test', 3, 0.5);
  await d.waitVoice(); await dk('focus', 's-test', null);
  await cardOn(MAF, 0.3);
  await d.say('maf1'); await d.waitVoice(0.3);

  // the portal home goes stale while the slides run: reload it in the background now, until it is fully drawn
  const homeLoad = (async () => {
    for (let k = 1; k <= 4; k++) {
      try {
        await E.gotoPortal(portal, E.nextgen('/home'), 'Agents');
        await portal.getByText('Welcome', { exact: false }).first().waitFor({ state: 'visible', timeout: 45000 });
        await portal.locator('a[aria-label="Monitor"]:visible').first().waitFor({ timeout: 20000 });
        await E.settle(portal, 2000); await E.closeDialogs(portal); return;
      } catch { console.log('home reload', k); }
    }
  })();

  // ---------------- 3. Deploying to Foundry
  await setLabel(chap('Deploying to Foundry'));
  d.page = deck; await show('s-deploy'); await d.uncard(800);
  await d.say('dep1');
  await focus('s-deploy', 'MAIN = ', 'serve(build_graph)', 0.3); await notes('s-deploy', 1, 0.6);
  await d.wait(Math.max(0.5, d.voiceLeft() - 3.0)); await notes('s-deploy', 3, 0.3);
  await d.waitVoice(); await dk('focus', 's-deploy', null);
  await homeLoad;
  await use(portal);
  await d.say('dep2');
  await navNew('Agents', BRR);
  for (let i = 0; i < 3; i++) { const t = portal.getByText('Hosted', { exact: true }).nth(i); if (await t.count()) await d.hover(t, 520); }
  await d.hover(portal.getByText('Running', { exact: true }).first(), 600);
  await d.hover(portal.getByText('Version', { exact: true }).first(), 600);
  await d.waitVoice();

  // ---------------- 4. Enterprise-ready with Foundry
  await setLabel(chap('Enterprise-ready with Foundry'));
  await d.say('ent1a');
  await d.click(portal.getByRole('link', { name: BRR }).first(), 800, 0.6);
  await portal.getByRole('tab', { name: 'Details', exact: true }).first().waitFor({ state: 'visible', timeout: 90000 }); await E.settle(portal, 1500); await applyLabel(portal);
  await d.wait(Math.max(0.3, d.voiceLeft() - 2.0));
  await tab('Details', 'Identity & access');
  await d.waitVoice();
  await d.say('ent1');
  await E.zoomTo(d, portal.getByText('Identity & access').first().locator('xpath=ancestor::div[.//text()[contains(.,"Entra agent identity")]][1]'), 1.45, 14);
  await d.waitVoice(); await d.unzoom(700);
  await d.say('ent2');
  await E.zoomTo(d, portal.getByText('Responses protocol').first().locator('xpath=ancestor::div[.//text()[contains(.,"Endpoint")]][1]'), 1.5, 14);
  await d.hover(portal.getByText('People with Azure RBAC permissions can access').first(), 800);
  await d.waitVoice(); await d.unzoom(700);
  await d.say('ent3');
  await navNew('Guardrails', 'Microsoft.DefaultV2');
  await d.click(portal.getByText('Microsoft.DefaultV2', { exact: true }).first(), 800, 1.2);
  await portal.getByText('Indirect prompt injections', { exact: false }).first().waitFor({ timeout: 30000 });
  for (const t of ['Jailbreak', 'Indirect prompt injections', 'Content safety']) await d.hover(portal.getByText(t, { exact: false }).last(), 650);
  await d.waitVoice();
  await d.say('ent7a');
  await navNew('Agents', BRR);
  await d.click(portal.getByRole('link', { name: BRR }).first(), 800, 0.6);
  await portal.getByRole('tab', { name: 'Details', exact: true }).first().waitFor({ state: 'visible', timeout: 90000 }); await E.settle(portal, 1500); await applyLabel(portal);
  await tab('Traces', 'Trace ID');
  await d.waitVoice();
  await d.say('ent7');
  await d.click(portal.locator('[role=row]').nth(1).locator('button').first(), 800, 0.8);
  await portal.getByText('Trajectories', { exact: true }).first().waitFor({ timeout: 60000 });
  await E.settle(portal, 2000);
  for (const t of ['fan_out', 'chat gpt-5-mini', 'POST /api/projects']) { const l = portal.getByText(t, { exact: false }).first(); if (await l.count()) await d.hover(l, 800); }
  await d.waitVoice();
  await portal.keyboard.press('Escape').catch(() => {});
  await d.say('ent8');
  await navNew('Monitor', 'Agent runs');
  await E.zoomTo(d, { x: 244, y: 260, width: 1316, height: 198 }, 1.15, 8);
  for (const t of ['Agent runs', 'Total token usage', 'Estimated cost']) await d.hover(portal.getByText(t, { exact: true }).first(), 700);
  await d.waitVoice(); await d.unzoom(700);

  await d.say('ent4a');
  await d.wait(Math.max(0.5, d.voiceLeft() - 8.0));
  await toggleFoundry(false);
  await d.click(portal.locator('a[aria-label^="Evaluation"]').first(), 750, 0.4);
  await ready('AI red teaming', 1500);
  await d.click(portal.getByRole('tab', { name: 'AI red teaming' }).first(), 700, 0.4);
  await ready('AI red teaming scans', 1500);
  await d.waitVoice();
  await d.say('ent4');
  const before = portal.locator(`a[href*="${E.RT_BEFORE.match(/redteaming\/([0-9a-f-]+)/)[1]}"]`).first();
  await d.click(before, 700, 0.4);
  await ready('Metric dashboard', 2000); await E.dismissBubbles(portal);
  await E.zoomTo(d, portal.getByText('Successful attacks', { exact: true }).first().locator('xpath=ancestor::*[.//text()[contains(.,"Violence")]][1]'), 1.35, 16);
  await d.hover(portal.getByText('1/10 attacks', { exact: false }).first(), 800);
  await d.waitVoice(); await d.unzoom(700);
  d.page = deck; await show('s-harm'); await use(deck);
  await d.say('ent5');
  await focus('s-harm', 'harmful = scan_harmful(md)', 'requirement; the functional lead', 0.3);
  await notes('s-harm', 3, Math.max(0.8, d.voiceLeft() / 3 - 0.2));
  await d.waitVoice(); await dk('focus', 's-harm', null);
  await use(portal);
  await d.say('ent6');
  await portal.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await ready('AI red teaming scans', 1500);
  const after = portal.locator(`a[href*="${E.RT_AFTER.match(/redteaming\/([0-9a-f-]+)/)[1]}"]`).first();
  await d.click(after, 700, 0.4);
  await ready('Metric dashboard', 2000); await E.dismissBubbles(portal);
  await E.zoomTo(d, portal.getByText('Successful attacks', { exact: true }).first().locator('xpath=ancestor::*[.//text()[contains(.,"Violence")]][1]'), 1.35, 16);
  await d.waitVoice(); await d.unzoom(700);

  // ---------------- 5. Consumed by an app
  await setLabel(chap('Consumed by an app'));
  d.page = lumen; await lumenReset();
  await use(lumen);
  await d.third('<div class="av" style="background:linear-gradient(135deg,#7c5cff,#c757d6)">🔌</div><div><b>Theo</b><span>Integration Architect</span></div>');
  await d.say('app1');
  await openAgent('interface documentation', ICD);
  await attach(['namesearch-openapi.yaml', 'requirements-name-search.md', 'canonical-person.schema.json', 'interface-name-search.json']);
  let n = await send('Draft the interface control document for the Name Search lookup.');
  await d.waitVoice();
  await waitReply(n);
  await lumen.waitForSelector('.approval-card [data-ap-apply]', { timeout: 60000 });
  await d.reveal('.approval-card', 'center', 1.0);
  await d.zoom('.approval-card', 1.4, 1000, 16);
  await d.say('app2');
  await d.wait(Math.max(1.0, d.voiceLeft() - 4.5));
  await d.unzoom(600);
  n = await replies();
  await d.click('.approval-card [data-ap-apply]', 800, 0.6);
  await waitReply(n);
  await d.reveal('.msg.assistant:last-child .md', 'start', 1.0);
  await d.waitVoice();
  await d.third(null);
  d.page = deck; await show('s-lumen'); await use(deck);
  await d.say('app3');
  await focus('s-lumen', 'try { built = buildPayload', 'previous_response_id: sessionId', 0.3); await notes('s-lumen', 2, 0.6);
  await d.wait(Math.max(0.5, d.voiceLeft() - 5.5));
  await focus('s-lumen', 'if (approval?.id) {', "input: [{ type: 'mcp_approval_response'", 0.3); await notes('s-lumen', 3, 0.3);
  await d.waitVoice(); await dk('focus', 's-lumen', null);

  // ---------------- 6. Close
  await setLabel(null);
  await cardOn(CLOSE, 0.3);
  await d.js(() => window.Film.hideCursor(true));
  await d.say('close1'); await d.waitVoice(0.5);
  await cardOn(END, 0.3);
  await d.say('end'); await d.waitVoice(1.5);
}
async function api0() { await E.api('PUT', '/api/settings', { userName: 'Amira' }); }

async function api0() { await E.api('PUT', '/api/settings', { userName: 'Amira' }); }

// ------------------------------------------------------------------ main
async function main() {
  const kit = createKit({ name: NAME, lines: LINES, vo: path.join(FILM, 'vo-e2e3'), work: WORK, out: path.join(FILM, 'out'), musicGain: 0.4 });
  const lengths = kit.makeVoice();
  if (args.has('--voice')) { let total = 0; for (const [k, v] of Object.entries(lengths)) { total += v; console.log(k.padEnd(8), `${v.toFixed(1)}s`); } console.log(`total narration ${total.toFixed(0)}s`); return; }
  if (args.has('--remix')) { // re-voice without re-filming: the last run's frames and events, the current narration
    let { events, frame_list } = JSON.parse(fs.readFileSync(path.join(WORK, 'events.json'), 'utf8'));
    // start on the title card, just before the first line (also drops a cold open from older takes)
    const t0 = events.find((e) => e.kind === 'voice' && e.id === 'hook1').t - 0.05;
    events = events.filter((e) => e.t >= t0); frame_list = frame_list.filter(([, t]) => t >= t0);
    const res = kit.finish(frame_list, events, { thumbAt: 0.3 });
    if (res?.srt) fs.writeFileSync(res.srt.replace(/\.srt$/, '.vtt'), `WEBVTT\n\n${fs.readFileSync(res.srt, 'utf8').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2')}`, 'utf8');
    return;
  }
  const deckFile = buildDeck({ slides: slides(), hljsDir: path.join(ROOT, 'node_modules', '@highlightjs', 'cdn-assets'), out: path.join(WORK, 'deck.html') });
  const server = spawn(process.execPath, [path.join(FILM, 'foundry-server.js'), 'film'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'inherit', 'inherit'] });
  let ctx;
  try {
    await E.waitForServer();
    ctx = await E.edge(false);
    await ctx.addInitScript({ path: path.join(FILM, 'overlay.js') });
    await ctx.addInitScript({ content: E.MASK_JS });
    const deck = await ctx.newPage(); // not ctx.pages()[0]: the window's first tab ignores deviceScaleFactor
    const pages = { deck };
    for (const k of ['portal', 'lumen']) pages[k] = await ctx.newPage();
    const errors = [];
    deck.on('pageerror', (e) => errors.push(String(e)));
    pages.lumen.on('pageerror', (e) => errors.push(String(e)));
    await deck.goto(`file:///${deckFile.replace(/\\/g, '/')}`);
    await deck.waitForFunction(() => !!window.Deck && !!window.Film);
    await pages.lumen.goto(`http://127.0.0.1:${PORT}/`);
    await pages.lumen.waitForSelector('.greeting', { timeout: 30000 });
    console.log('loading portal pages');
    const { nextgen } = E;
    await E.gotoPortal(pages.portal, nextgen('/home'));
    await E.setNewFoundry(pages.portal, true);
    await E.gotoPortal(pages.portal, nextgen('/home'), 'Agents');
    console.log('portal pages ready');
    const cap = new E.MultiCapture();
    for (const p of Object.values(pages)) await cap.add(p);
    const d = new kit.Director(deck, lengths);
    const t0 = Date.now();
    try { await runFilm(d, cap, pages); } catch (e) { await d.page.screenshot({ path: path.join(WORK, 'failed.png') }).catch(() => {}); throw e; }
    await cap.stop();
    console.log('page errors', errors, 'took', Math.round((Date.now() - t0) / 1000), 's');
    const res = kit.finish(cap.frames, d.events, { stills: args.has('--stills'), thumbAt: 0.3 });
    if (res?.srt) fs.writeFileSync(res.srt.replace(/\.srt$/, '.vtt'), `WEBVTT\n\n${fs.readFileSync(res.srt, 'utf8').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2')}`, 'utf8');
  } finally {
    if (ctx) {
      try { const p = await ctx.newPage(); await E.gotoPortal(p, E.nextgen('/home')); await E.setNewFoundry(p, true); console.log('New Foundry toggle restored'); } catch (e) { console.log('could not restore the New Foundry toggle:', e.message); }
      await ctx.close().catch(() => {});
    }
    server.kill();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
