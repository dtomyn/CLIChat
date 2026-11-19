// "From laptop to enterprise": productionizing LangGraph agents with Microsoft Foundry hosted agents. Storyboard:
// the Claude Doc "Storyboard: From laptop to enterprise". The journey (LangGraph → the
// enterprise gap → ways into Foundry → deploy + identity → access → reaching users (Lumen UI + code) → safety →
// observability), with six architect's questions as chapter labels.
//
//   node film/make_e2e2.js --voice    Narration only (Kokoro), with each line's length.
//   node film/make_e2e2.js            Film and encode film/out/lumen-laptop-to-enterprise.mp4 + .srt + .vtt + thumbnail.
//   node film/make_e2e2.js --remix    Re-voice and re-encode from the last run's frames (narration changes of similar length).
//   node film/make_e2e2.js --stills   Film, then write a contact sheet instead of encoding.
//
// Uses make_e2e.js's signed-in Edge profile (film/.work-e2e/edge-profile; sign in with `node film/make_e2e.js
// --login`), its portal masking and its multi-tab capture. The portal is navigated on camera in one tab. Lumen replays recorded agent replies on 127.0.0.1:4395.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createKit } = require('./filmkit');
const { grab, buildDeck } = require('./code-deck');
const E = require('./make_e2e');

const FILM = __dirname;
const ROOT = path.resolve(FILM, '..');
const REPO = E.REPO;
const WORK = path.join(FILM, '.work-e2e2');
const NAME = 'lumen-laptop-to-enterprise';
const PORT = E.PORT;
const BRR = E.BRR;
const ICD = 'contoso-interface-documentation';
const INPUTS = path.join(FILM, '.work-foundry', 'CSP Release 2');
const args = new Set(process.argv.slice(2));

// ------------------------------------------------------------------ narration: [spoken, caption]
const LINES = {
  hook1: ["A LangGraph agent runs on your laptop in an afternoon. Getting it in front of a whole organization, safely, is the real project.",
    "A LangGraph agent runs on your laptop in an afternoon. Getting it in front of a whole organization, safely, is the real project."],
  hook2: ["In this video, we follow one set of agents from a developer's laptop into Microsoft Foundry. Along the way, we answer the six questions an enterprise architect will ask, and I'll show you where each answer livz in the Foundry portal, and how to get there.",
    "In this video, we follow one set of agents from a developer's laptop into Microsoft Foundry. Along the way, we answer the six questions an enterprise architect will ask, and I'll show you where each answer lives in the Foundry portal, and how to get there."],
  lg1: ["LangGraph is where the agent's behaviour livz. Each agent is a graph of small steps sharing typed state. Some steps are plain Python, and some call a model.",
    "LangGraph is where the agent's behaviour lives. Each agent is a graph of small steps sharing typed state. Some steps are plain Python, and some call a model."],
  lg2: ["One step pauses the whole graph for a person to approve a change. The state is saved, and the run picks up exactly where it stopped.",
    "One step pauses the whole graph for a person to approve a change. The state is saved, and the run picks up exactly where it stopped."],
  lg3: ["Because the model can be scripted out, close to seven hundred tests run in seconds, with no network.",
    "Because the model can be scripted out, close to 700 tests run in seconds, with no network."],
  maf1: ["LangGraph is not the only choice. Microsoft Agent Framework is one alternative, the successor to Semantic Kernel and AutoGen, with graph based workflows of its own. I chose LangGraph for its explicit graphs and checkpointing. The rest of this story is the same either way.",
    "LangGraph isn't the only choice. Microsoft Agent Framework is one alternative, the successor to Semantic Kernel and AutoGen, with graph-based workflows of its own. I chose LangGraph for its explicit graphs and checkpointing. The rest of this story is the same either way."],
  gap1: ["On a laptop, none of these has an answer. Where does it run? Who is it? Who can call it? Where do people yooz it? Is it safe? And can we see what it did? An enterprise architect will ask all six.",
    "On a laptop, none of these has an answer. Where does it run? Who is it? Who can call it? Where do people use it? Is it safe? And can we see what it did? An enterprise architect will ask all six."],
  ways1: ["Microsoft Foundry is Microsoft's platform for building and running AI apps and agents, and there is more than one way in. The simplest is a model deployment. Your own app calls the model, and all of the agent logic stays in your app.",
    "Microsoft Foundry is Microsoft's platform for building and running AI apps and agents, and there's more than one way in. The simplest is a model deployment: your own app calls the model, and all of the agent logic stays in your app."],
  ways2: ["A prompt agent is configured in the portal. Instructions, a model and tools, with no code at all.",
    "A prompt agent is configured in the portal: instructions, a model and tools, with no code at all."],
  ways2b: ["A workflow agent chains prompt agents together, with branches and approval steps, built visually or in YAML.",
    "A workflow agent chains prompt agents together, with branches and approval steps, built visually or in YAML."],
  ways3: ["And a hosted agent is your own code, in a container that Foundry runs for you, whatever framework is inside. A hosted agent does its orchestration in its own code. Here, that's the LangGraph graph.",
    "And a hosted agent is your own code, in a container that Foundry runs for you, whatever framework is inside. A hosted agent does its orchestration in its own code. Here, that's the LangGraph graph."],
  ways4: ["Guardrails apply to every model call, whichever way in you choose. Agents also get tracing, monitoring and evaluations built in. With a plain model deployment, your app opts in, through OpenTelemetry and the evaluation SDK. These agents are code first, so they're hosted agents.",
    "Guardrails apply to every model call, whichever way in you choose. Agents also get tracing, monitoring and evaluations built in. With a plain model deployment, your app opts in, through OpenTelemetry and the evaluation SDK. These agents are code first, so they're hosted agents."],
  dep1: ["A build step turns each agent into a deployable folder. The graph, a small entry point, and its requirements. Then one A-Z-D deploy publishes all twenty three, and Foundry builds each container in the cloud.",
    "A build step turns each agent into a deployable folder: the graph, a small entry point, and its requirements. Then one azd deploy publishes all 23, and Foundry builds each container in the cloud."],
  nav1: ["Here's the project in the Foundry portal. The left navigation follows an agent's life. Create holds agents, models and guardrails. Observe has monitoring and traces. And Improve has data and evaluations.",
    "Here's the project in the Foundry portal. The left navigation follows an agent's life. Create holds agents, models and guardrails. Observe has monitoring and traces. And Improve has data and evaluations."],
  dep2: ["Under Create, select Agents. All twenty three are listed. Each one is a hosted agent, it is running, and every deployment gets a new version.",
    "Under Create, select Agents. All 23 are listed. Each one is a hosted agent, it is running, and every deployment gets a new version."],
  dep3a: ["Select an agent to open it. It opens in the playground, where you can try it straight away. The Details tab shows how it runs.",
    "Select an agent to open it. It opens in the playground, where you can try it straight away. The Details tab shows how it runs."],
  dep3: ["Under Identity and access, the agent has its own Entra agent identity. That identity is granted access to the project's models, so no keys or secrets ever sit in the code. That answers questions one and two. It runs in Foundry, and it is its own identity.",
    "Under Identity & access, the agent has its own Entra agent identity. That identity is granted access to the project's models, so no keys or secrets ever sit in the code. That answers questions one and two: it runs in Foundry, and it is its own identity."],
  acc1: ["Under Endpoints, every agent exposes a standard Responses endpoint. Only people with the right Azure role can call it, using their own sign in. So who can call it is decided by Azure role based access, not by the agent.",
    "Under Endpoints, every agent exposes a standard Responses endpoint. Only people with the right Azure role can call it, using their own sign-in. So who can call it is decided by Azure role-based access, not by the agent."],
  reach1: ["So how do people actually reach it? Under Channels, Foundry can publish an agent to Teams and Microsoft 365 Copilot. That needs tenant permissions I don't have here, so I built the front end myself.",
    "So how do people actually reach it? Under Channels, Foundry can publish an agent to Teams and Microsoft 365 Copilot. That needs tenant permissions I don't have here, so I built the front end myself."],
  reach2: ["Lumen is a simple chat app. It calls the agent's endpoint with the user's own Azure sign in, and sends any attached files. Here, a business analyst hands the requirements agent a business requirements document.",
    "Lumen is a simple chat app. It calls the agent's endpoint with the user's own Azure sign-in, and sends any attached files. Here, a business analyst hands the requirements agent a business requirements document."],
  brr1: ["Back come structured requirements, with ambiguities and gaps flagged for review. It also caught an instruction hidden in the document, and a section the content filter blocked. More on that in a moment.",
    "Back come structured requirements, with ambiguities and gaps flagged for review. It also caught an instruction hidden in the document, and a section the content filter blocked. More on that in a moment."],
  reach3a: ["Some agents pause for a person. The interface documentation agent drafts an interface control document from the specs it is given.",
    "Some agents pause for a person. The interface documentation agent drafts an interface control document from the specs it's given."],
  reach3: ["When it needs a decision, Lumen shows an approval card. The architect approves, and the agent resumes exactly where it stopped.",
    "When it needs a decision, Lumen shows an approval card. The architect approves, and the agent resumes exactly where it stopped."],
  reach4: ["On the code side, it is one provider file. It builds the request, calls the Responses endpoint, and sends the approval decision back. Any front end could do the same.",
    "On the code side, it's one provider file. It builds the request, calls the Responses endpoint, and sends the approval decision back. Any front end could do the same."],
  safe1: ["Is it safe? Back in the portal, Guardrails is also under Create. A guardrail is attached to the model deployment, so it checks every call to that model, from any agent or app.",
    "Is it safe? Back in the portal, Guardrails is also under Create. A guardrail is attached to the model deployment, so it checks every call to that model, from any agent or app."],
  safe1b: ["Open the default guardrail to see its controls. It blocks harmful content, detects jailbreaks, and checks documents for indirect prompt injection.",
    "Open the default guardrail to see its controls. It blocks harmful content, detects jailbreaks, and checks documents for indirect prompt injection."],
  safe2a: ["Guardrails are one layer. The other is testing. The AI Red Teaming Agent attacks each deployed agent. At the time of recording, its reports open in the classic Foundry view, so switch New Foundry off, then select Evaluation, and the AI red teaming tab.",
    "Guardrails are one layer. The other is testing. The AI Red Teaming Agent attacks each deployed agent. At the time of recording, its reports open in the classic Foundry view, so switch New Foundry off, then select Evaluation, and the AI red teaming tab."],
  safe2: ["Each scan hides attacks inside the documents the agent reads. Open the requirements agent scan. It found one real failure, in the agent you just saw.",
    "Each scan hides attacks inside the documents the agent reads. Open the requirements agent scan. It found one real failure, in the agent you just saw."],
  safe3: ["The fix is layered. The content filter, a prompt rule, and a deterministic scan that drops anything built from harmful text.",
    "The fix is layered: the content filter, a prompt rule, and a deterministic scan that drops anything built from harmful text."],
  safe4: ["Back in the list, the re scan after the fix found nothing, and the case is now part of the test suite.",
    "Back in the list, the re-scan after the fix found nothing, and the case is now part of the test suite."],
  obs1: ["Last question. Can we see what it did? Switch back to the new Foundry, open the agent from Agents, and select its Traces tab. Every request is traced with OpenTelemetry.",
    "Last question: can we see what it did? Switch back to the new Foundry, open the agent from Agents, and select its Traces tab. Every request is traced with OpenTelemetry."],
  obs1b: ["Open a trace, and you see each LangGraph step, and every model call underneath, with its timing and tokens.",
    "Open a trace, and you see each LangGraph step, and every model call underneath, with its timing and tokens."],
  obs2: ["Under Observe, Monitor rolls it up across all the agents. Runs, tokens, and what it actually costs. You get all of this, whatever framework is inside the container.",
    "Under Observe, Monitor rolls it up across all the agents: runs, tokens, and what it actually costs. You get all of this, whatever framework is inside the container."],
  recap1: ["So, the six questions. It runs as a hosted agent. It is its own Entra identity. Azure roles decide who can call it. People reach it through Lumen, or Teams and Copilot. Guardrails and red teaming keep it safe. And traces and the monitor show what it did.",
    "So, the six questions. It runs as a hosted agent. It is its own Entra identity. Azure roles decide who can call it. People reach it through Lumen, or Teams and Copilot. Guardrails and red teaming keep it safe. And traces and the monitor show what it did."],
  close1: ["So where does Foundry fit? Your framework decides how the agent behaves. Foundry decides how it runs. Hosting, identity, access, safety and visibility. And people reach it however suits them.",
    "So where does Foundry fit? Your framework decides how the agent behaves. Foundry decides how it runs: hosting, identity, access, safety and visibility. And people reach it however suits them."],
  end: ["From laptop to enterprise. LangGraph agents, on Microsoft Foundry.",
    "From laptop to enterprise. LangGraph agents, on Microsoft Foundry."],
};

// ------------------------------------------------------------------ slides (from the real source)
const R = (p) => path.join(REPO, p);
const Lm = (p) => path.join(ROOT, p);
function code(id, kicker, title, file, start, opts, lang, repo, notes) {
  const g = grab(file, start, opts);
  return { type: 'code', id, kicker, title, path: path.relative(repo === 'Lumen' ? ROOT : REPO, file).replace(/\\/g, '/'), repo: repo === 'Lumen' ? 'CLIChat (Lumen)' : 'contoso-sdlc-agents', lang, first: g.first, text: g.text, notes };
}
function slides() {
  const graphs = JSON.parse(fs.readFileSync(path.join(FILM, 'code-graphs.json'), 'utf8'));
  return [
    { type: 'graph', id: 's-g01', kicker: 'Built with LangGraph', title: 'Each agent is a <em>graph of small steps</em>', graph: graphs['01'],
      kinds: { det: ['intake', 'parse', 'retrieve_context', 'normalise', 'self_check', 'assemble', 'apply_edits', 'render', 'propose_publish', 'apply'], llm: ['extract_section', 'classify', 'analyse_quality', 'gap_analysis'], hitl: ['approve'], io: ['finalize'] },
      note: 'Agent 01, exported from LangGraph with get_graph(). Green: Python · purple: model · amber: a person.' },
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
    code('s-lumen', 'Lumen · providers/foundry-agents.js', 'Lumen\'s Foundry engine: <em>one provider file</em>', Lm('providers/foundry-agents.js'), 'async run({', { count: 44 }, 'javascript', 'Lumen', [
      'Agent + attachments → request (<code>buildPayload</code>)',
      'Responses endpoint, your Azure sign-in, conversation = previous response id',
      'Approval request → <b>Approve card</b> → <code>mcp_approval_response</code>']),
    code('s-harm', 'agents/01 · nodes.py', 'The fix: <em>harmful text is never a requirement</em>', R('agents/01-business-requirements-refinement/src/contoso_brr/nodes.py'), 'if scan_injection(md):', { count: 16 }, 'python', 'Agents', [
      'Layer 1: Foundry content filter on the model deployment',
      'Layer 2: the extraction prompt says such text is never a requirement',
      'Layer 3: <code>scan_harmful()</code> flags it and drops any requirement built from it']),
  ];
}

// ------------------------------------------------------------------ cards
const LOGO = E.LOGO;
const hidden = 'opacity:0;transition:opacity .6s ease, transform .6s ease;transform:translateY(12px)';
const glass = 'border-radius:20px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);text-align:left';
const TITLE = `<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s;font-size:70px">From laptop <em>to enterprise</em></h1><p class="rise" style="animation-delay:.45s">LangGraph agents on Microsoft Foundry hosted agents</p>`;
const MAF = `<div class="kicker rise">One alternative among several</div><h1 class="rise" style="animation-delay:.15s;font-size:64px">Microsoft <em>Agent Framework</em></h1><div class="pills rise" style="animation-delay:.45s"><span>Agents and tools</span><span>Graph-based workflows</span><span>Successor to Semantic Kernel + AutoGen</span><span>Also a Foundry hosted agent</span></div>`;
const Q = ['Where does it run?', 'Who is it?', 'Who can call it?', 'Where do people use it?', 'Is it safe?', 'Can we see what it did?'];
const GAP = `<div class="kicker rise">The enterprise gap</div><h1 class="rise" style="animation-delay:.15s;font-size:58px">Six questions <em>a laptop can't answer</em></h1>
<div style="display:grid;grid-template-columns:repeat(3,320px);gap:18px;justify-content:center;margin-top:34px">${Q.map((q, i) => `<div id="q${i + 1}" style="${hidden};${glass};padding:20px 22px;font-size:22px"><span style="opacity:.6;font-size:16px;display:block;margin-bottom:6px">${i + 1}</span>${q}</div>`).join('')}</div>`;
const wbox = (id, name, lines, main) => `<div id="${id}" style="${hidden};${glass};width:262px;padding:20px 20px;${main ? 'background:rgba(124,92,255,.28);border:2px solid #b8a6ff' : ''}"><b style="font-size:24px">${name}</b><div style="font-size:17px;opacity:.88;line-height:1.55;margin-top:10px">${lines.join('<br>')}</div></div>`;
const WAYS = `<div class="kicker rise">Ways into Microsoft Foundry</div><h1 class="rise" style="animation-delay:.15s;font-size:52px">Code-first agents enter as <em>hosted agents</em></h1>
<div style="display:flex;gap:16px;justify-content:center;margin-top:30px;align-items:stretch">
${wbox('w1', 'Model deployment', ['Your app calls the model', 'Agent logic stays in your app'])}
${wbox('w2', 'Prompt agent', ['Instructions, model, tools', 'Configured, no code'])}
${wbox('w2b', 'Workflow agent', ['Chains prompt agents', 'Branches, approvals', 'Visual designer or YAML'])}
${wbox('w3', 'Hosted agent', ['Your code in a container', 'Any framework inside', 'Orchestrates in its own code', 'Its own Entra identity'], true)}</div>
<div id="w4" style="${hidden};${glass};width:1110px;margin:18px auto 0;padding:14px 24px;font-size:19px;text-align:center"><b>Guardrails</b> on every model deployment, whichever way in</div>
<div id="w5" style="${hidden};width:1110px;margin:12px auto 0;padding:14px 24px;border-radius:20px;background:rgba(255,255,255,.16);font-size:19px;text-align:center"><b>Tracing · monitoring · evaluations</b> built in for agents · opt-in for your own app (OpenTelemetry, evaluation SDK)</div>`;
const A = ['A Foundry hosted agent', 'Its own Entra agent identity', 'Azure roles (RBAC)', 'Lumen · Teams · Microsoft 365 Copilot', 'Guardrails + red teaming', 'Traces + Monitor'];
const RECAP = `<div class="kicker rise">The six questions, answered</div><h1 class="rise" style="animation-delay:.15s;font-size:54px">From laptop <em>to enterprise</em></h1>
<div style="display:grid;grid-template-columns:repeat(3,340px);gap:16px;justify-content:center;margin-top:30px">${Q.map((q, i) => `<div id="r${i + 1}" style="${hidden};${glass};padding:16px 20px;font-size:18px"><span style="opacity:.65">${i + 1} · ${q}</span><b style="display:block;font-size:22px;margin-top:6px">${A[i]}</b></div>`).join('')}</div>`;
const band = (who, what) => `<div style="${glass};width:1000px;margin:14px auto 0;padding:20px 28px;font-size:24px;display:flex;gap:24px"><b style="width:390px">${who}</b><span style="opacity:.88">${what}</span></div>`;
const CLOSE = `<div class="kicker rise">Who owns what</div><h1 class="rise" style="animation-delay:.15s;font-size:58px">Where <em>Foundry</em> fits</h1><div class="rise" style="animation-delay:.4s">
${band('Your agent framework', 'how the agent behaves')}${band('Microsoft Foundry', 'how it runs: hosting, identity, access, safety, visibility')}${band('Any front end', 'how people reach it: Lumen, Teams, Microsoft 365 Copilot')}</div>`;
const END = `<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s;font-size:70px">From laptop <em>to enterprise</em></h1><p class="rise" style="animation-delay:.45s">Synthetic data · fictional organization · a proof of concept</p>`;
const badge = (n, text) => `<span style="opacity:.6">${n}</span>${text}`;

// ------------------------------------------------------------------ the film
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

  // ---------------- 1. Title
  await cardOn(TITLE, 0.3);
  await d.js(() => window.Film.hideCursor(true));
  await d.say('hook1'); await d.waitVoice(0.3);
  await d.say('hook2'); await d.waitVoice(0.4);

  // ---------------- 2. Built with LangGraph
  await show('s-g01'); await d.uncard(800);
  await d.say('lg1');
  await d.wait(2.6); await dk('mark', 's-g01', ['intake', 'parse', 'retrieve_context', 'normalise', 'self_check', 'assemble', 'apply_edits', 'render', 'propose_publish', 'apply']); await d.wait(2.2);
  await dk('mark', 's-g01', ['extract_section', 'classify', 'analyse_quality', 'gap_analysis']); await d.waitVoice(); await dk('mark', 's-g01', ['approve']);
  await show('s-hitl');
  await d.say('lg2');
  await focus('s-hitl', 'def request_approval(', '"""Pause the graph', 0.3); await notes('s-hitl', 1, 0.3);
  await d.wait(Math.max(0.8, d.voiceLeft() - 3.2));
  await focus('s-hitl', 'raw = interrupt(request)', 'raw = interrupt(request)', 0.3); await notes('s-hitl', 2, 0.3);
  await d.waitVoice(); await dk('focus', 's-hitl', null); await dk('mark', 's-g01', null);
  await show('s-test');
  await d.say('lg3');
  await focus('s-test', 'with ScriptedLLM', 'run(graph', 0.3); await notes('s-test', 3, 0.5);
  await d.waitVoice(); await dk('focus', 's-test', null);
  await cardOn(MAF, 0.3);
  await d.say('maf1'); await d.waitVoice(0.3);

  // ---------------- 3. The enterprise gap
  await cardOn(GAP, 0.4);
  await d.say('gap1');
  await d.wait(2.4);
  for (let i = 1; i <= 6; i++) { await reveal(`q${i}`); await d.wait(i < 6 ? 1.25 : 0.4); }
  await d.waitVoice(0.3);

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
  // ---------------- 4. Ways into Foundry
  await cardOn(WAYS, 0.3);
  await d.say('ways1'); await d.wait(Math.max(0.5, d.voiceLeft() - 4.5)); await reveal('w1'); await d.waitVoice();
  await d.say('ways2'); await reveal('w2'); await d.waitVoice();
  await d.say('ways2b'); await reveal('w2b'); await d.waitVoice();
  await d.say('ways3'); await d.wait(1.0); await reveal('w3'); await d.waitVoice();
  await d.say('ways4'); await reveal('w4'); await d.wait(3.6); await reveal('w5'); await d.waitVoice(0.4);

  // ---------------- 5. Getting there (Q1, Q2)
  await setLabel(badge('1–2', 'Where does it run? · Who is it?'));
  await show('s-deploy'); await d.uncard(800); await d.js(() => window.Film.hideCursor(false));
  await d.say('dep1');
  await focus('s-deploy', 'MAIN = ', 'serve(build_graph)', 0.3); await notes('s-deploy', 1, 0.6);
  await d.wait(Math.max(0.5, d.voiceLeft() - 3.0)); await notes('s-deploy', 3, 0.3);
  await d.waitVoice(); await dk('focus', 's-deploy', null);
  await homeLoad; // loaded in the background while the slide ran
  await use(portal);
  await d.say('nav1');
  await d.wait(3.2);
  for (const t of ['Agents', 'Models', 'Guardrails']) await hoverNav(t);
  await d.wait(Math.max(0.3, d.voiceLeft() - 6.2));
  for (const t of ['Monitor', 'Traces']) await hoverNav(t);
  await d.wait(Math.max(0.3, d.voiceLeft() - 3.0));
  for (const t of ['Data', 'Evaluations']) await hoverNav(t);
  await d.waitVoice();
  await d.say('dep2');
  await navNew('Agents', BRR);
  for (let i = 0; i < 3; i++) { const t = portal.getByText('Hosted', { exact: true }).nth(i); if (await t.count()) await d.hover(t, 520); }
  await d.hover(portal.getByText('Running', { exact: true }).first(), 600);
  await d.hover(portal.getByText('Version', { exact: true }).first(), 600);
  await d.waitVoice();
  await d.say('dep3a');
  await d.click(portal.getByRole('link', { name: BRR }).first(), 800, 0.6);
  await portal.getByRole('tab', { name: 'Details', exact: true }).first().waitFor({ state: 'visible', timeout: 90000 }); await E.settle(portal, 1500); await applyLabel(portal);
  await d.wait(Math.max(0.5, d.voiceLeft() - 3.0));
  await tab('Details', 'Identity & access');
  await d.waitVoice();
  await d.say('dep3');
  await E.zoomTo(d, portal.getByText('Identity & access').first().locator('xpath=ancestor::div[.//text()[contains(.,"Entra agent identity")]][1]'), 1.45, 14);
  await d.waitVoice(); await d.unzoom(700);

  // ---------------- 6. Access (Q3)
  await setLabel(badge('3', 'Who can call it?'));
  await d.say('acc1');
  await E.zoomTo(d, portal.getByText('Responses protocol').first().locator('xpath=ancestor::div[.//text()[contains(.,"Endpoint")]][1]'), 1.5, 14);
  await d.hover(portal.getByText('People with Azure RBAC permissions can access').first(), 800);
  await d.waitVoice(); await d.unzoom(700);

  // ---------------- 7. Reaching users (Q4)
  await setLabel(badge('4', 'Where do people use it?'));
  await d.say('reach1');
  await portal.getByText('Teams & Microsoft 365 Copilot').first().scrollIntoViewIfNeeded().catch(() => {});
  await d.wait(0.8);
  await E.zoomTo(d, portal.getByText('Teams & Microsoft 365 Copilot').first().locator('xpath=ancestor::div[.//text()[contains(.,"Preview web app")]][1]'), 1.4, 14);
  await d.hover(portal.getByText('Teams & Microsoft 365 Copilot').first(), 800);
  await d.waitVoice(); await d.unzoom(700);
  // Lumen: the requirements agent, then the approval beat
  d.page = lumen; await api0(); await lumenReset();
  await use(lumen);
  await d.third('<div class="av" style="background:linear-gradient(135deg,#12a594,#3fc5e8)">🧭</div><div><b>Amira</b><span>Business Analyst</span></div>');
  await d.say('reach2');
  await openAgent('requirements refinement', BRR);
  await attach(['INTAKE_BRD_v1.2.md']);
  let n = await send('Refine this BRD into structured requirements.');
  await d.waitVoice();
  await waitReply(n); await d.wait(0.6);
  await d.reveal('.msg.assistant:last-child .md', 'start', 1.0);
  await d.zoom('.msg.assistant:last-child .md', 1.25, 1000);
  await d.say('brr1');
  await d.waitVoice(); await d.unzoom(600);
  await lumenReset(); await use(lumen);
  await d.third('<div class="av" style="background:linear-gradient(135deg,#7c5cff,#c757d6)">🔌</div><div><b>Theo</b><span>Integration Architect</span></div>');
  await d.say('reach3a');
  await openAgent('interface documentation', ICD);
  await attach(['namesearch-openapi.yaml', 'requirements-name-search.md', 'canonical-person.schema.json', 'interface-name-search.json']);
  n = await send('Draft the interface control document for the Name Search lookup.');
  await d.waitVoice();
  await waitReply(n);
  await lumen.waitForSelector('.approval-card [data-ap-apply]', { timeout: 60000 });
  await d.reveal('.approval-card', 'center', 1.0);
  await d.zoom('.approval-card', 1.4, 1000, 16);
  await d.say('reach3');
  await d.wait(Math.max(1.0, d.voiceLeft() - 4.5));
  await d.unzoom(600);
  n = await replies();
  await d.click('.approval-card [data-ap-apply]', 800, 0.6);
  await waitReply(n);
  await d.reveal('.msg.assistant:last-child .md', 'start', 1.0);
  await d.waitVoice();
  await d.third(null);
  d.page = deck; await show('s-lumen'); await use(deck);
  await d.say('reach4');
  await focus('s-lumen', 'try { built = buildPayload', 'previous_response_id: sessionId', 0.3); await notes('s-lumen', 2, 0.6);
  await d.wait(Math.max(0.5, d.voiceLeft() - 4.0));
  await focus('s-lumen', 'if (approval?.id) {', "input: [{ type: 'mcp_approval_response'", 0.3); await notes('s-lumen', 3, 0.3);
  await d.waitVoice(); await dk('focus', 's-lumen', null);

  // ---------------- 8. Safety (Q5)
  await setLabel(badge('5', 'Is it safe?'));
  await use(portal);
  await d.say('safe1');
  await navNew('Guardrails', 'Microsoft.DefaultV2');
  await d.hover(portal.getByText('Microsoft.DefaultV2', { exact: true }).first(), 700);
  await d.waitVoice();
  await d.say('safe1b');
  await d.click(portal.getByText('Microsoft.DefaultV2', { exact: true }).first(), 800, 1.2);
  await portal.getByText('Indirect prompt injections', { exact: false }).first().waitFor({ timeout: 30000 });
  for (const t of ['Jailbreak', 'Indirect prompt injections', 'Content safety']) await d.hover(portal.getByText(t, { exact: false }).last(), 650);
  await d.waitVoice();
  // red teaming: classic view, Evaluation, AI red teaming tab, the scan
  await d.say('safe2a');
  await d.wait(Math.max(0.5, d.voiceLeft() - 7.5));
  await toggleFoundry(false);
  await d.click(portal.locator('a[aria-label^="Evaluation"]').first(), 750, 0.4);
  await ready('AI red teaming', 1500);
  await d.click(portal.getByRole('tab', { name: 'AI red teaming' }).first(), 700, 0.4);
  await ready('AI red teaming scans', 1500);
  await d.waitVoice();
  await d.say('safe2');
  const before = portal.locator(`a[href*="${E.RT_BEFORE.match(/redteaming\/([0-9a-f-]+)/)[1]}"]`).first();
  await d.hover(before, 700);
  await d.click(before, 700, 0.4);
  await ready('Metric dashboard', 2000); await E.dismissBubbles(portal);
  await E.zoomTo(d, portal.getByText('Successful attacks', { exact: true }).first().locator('xpath=ancestor::*[.//text()[contains(.,"Violence")]][1]'), 1.35, 16);
  await d.wait(Math.max(0.5, d.voiceLeft() - 2.5));
  await d.hover(portal.getByText('1/10 attacks', { exact: false }).first(), 800);
  await d.waitVoice(); await d.unzoom(700);
  d.page = deck; await show('s-harm'); await use(deck);
  await d.say('safe3');
  await focus('s-harm', 'harmful = scan_harmful(md)', 'requirement; the functional lead', 0.3);
  await notes('s-harm', 3, Math.max(0.8, d.voiceLeft() / 3 - 0.2));
  await d.waitVoice(); await dk('focus', 's-harm', null);
  await use(portal);
  await d.say('safe4');
  await portal.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await ready('AI red teaming scans', 1500);
  const after = portal.locator(`a[href*="${E.RT_AFTER.match(/redteaming\/([0-9a-f-]+)/)[1]}"]`).first();
  await d.click(after, 700, 0.4);
  await ready('Metric dashboard', 2000); await E.dismissBubbles(portal);
  await E.zoomTo(d, portal.getByText('Successful attacks', { exact: true }).first().locator('xpath=ancestor::*[.//text()[contains(.,"Violence")]][1]'), 1.35, 16);
  await d.waitVoice(); await d.unzoom(700);

  // ---------------- 9. Observability (Q6)
  await setLabel(badge('6', 'Can we see what it did?'));
  await d.say('obs1');
  await toggleFoundry(true);
  await ready('Agents', 1500);
  await navNew('Agents', BRR);
  await d.click(portal.getByRole('link', { name: BRR }).first(), 800, 0.6);
  await portal.getByRole('tab', { name: 'Details', exact: true }).first().waitFor({ state: 'visible', timeout: 90000 }); await E.settle(portal, 1500); await applyLabel(portal);
  await tab('Traces', 'Trace ID');
  await d.hover(portal.getByText('Completed', { exact: true }).first(), 600);
  await d.waitVoice();
  await d.say('obs1b');
  await d.click(portal.locator('[role=row]').nth(1).locator('button').first(), 800, 0.8);
  await portal.getByText('Trajectories', { exact: true }).first().waitFor({ timeout: 60000 });
  await E.settle(portal, 2000);
  for (const t of ['fan_out', 'chat gpt-5-mini', 'POST /api/projects']) { const l = portal.getByText(t, { exact: false }).first(); if (await l.count()) await d.hover(l, 800); }
  await d.waitVoice();
  await portal.keyboard.press('Escape').catch(() => {});
  await d.say('obs2');
  await navNew('Monitor', 'Agent runs');
  await E.zoomTo(d, { x: 244, y: 260, width: 1316, height: 198 }, 1.15, 8);
  for (const t of ['Agent runs', 'Total token usage', 'Estimated cost']) await d.hover(portal.getByText(t, { exact: true }).first(), 700);
  await d.waitVoice(); await d.unzoom(700);

  // ---------------- 9b. Recap
  await setLabel(null);
  await cardOn(RECAP, 0.3);
  await d.js(() => window.Film.hideCursor(true));
  await d.say('recap1');
  await d.wait(1.6);
  for (let i = 1; i <= 6; i++) { await reveal(`r${i}`); await d.wait(i < 6 ? 1.75 : 0.4); }
  await d.waitVoice(0.4);

  // ---------------- 10. Close
  await cardOn(CLOSE, 0.3);
  await d.say('close1'); await d.waitVoice(0.5);
  await cardOn(END, 0.3);
  await d.say('end'); await d.waitVoice(1.5);
}
async function api0() { await E.api('PUT', '/api/settings', { userName: 'Amira' }); }

// ------------------------------------------------------------------ main
async function main() {
  const kit = createKit({ name: NAME, lines: LINES, vo: path.join(FILM, 'vo-e2e2'), work: WORK, out: path.join(FILM, 'out'), musicGain: 0.4 });
  const lengths = kit.makeVoice();
  if (args.has('--voice')) { let total = 0; for (const [k, v] of Object.entries(lengths)) { total += v; console.log(k.padEnd(8), `${v.toFixed(1)}s`); } console.log(`total narration ${total.toFixed(0)}s`); return; }
  if (args.has('--remix')) { // re-voice without re-filming: the last run's frames and events, the current narration
    const { events, frame_list } = JSON.parse(fs.readFileSync(path.join(WORK, 'events.json'), 'utf8'));
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
