// "Inside the agents": a code explainer. How the LangGraph agents are structured and how they work, with a
// representative sample (requirements refinement, schedule variance, backlog Q&A), and how Lumen talks to them.
//
//   node film/make_code.js            Build the slide deck from the real source files, film it, voice it (Kokoro), encode
//                                      film/out/lumen-agents-code.mp4 + .srt + thumbnail.
//   node film/make_code.js --voice    Narration only, with each line's length.
//   node film/make_code.js --stills   Film, then write a contact sheet instead of encoding.
//
// Env: AGENTS_REPO (default C:/01-Clients-and-Engagements/IRCC-info/ircc-sdlc-agents), KOKORO_PYTHON, FFMPEG_PATH,
// GRAPHS_JSON (LangGraph get_graph() export; default film/code-graphs.json).
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { createKit } = require('./filmkit');
const { grab, buildDeck } = require('./code-deck');

const FILM = __dirname;
const ROOT = path.resolve(FILM, '..');
const REPO = process.env.AGENTS_REPO || 'C:/01-Clients-and-Engagements/IRCC-info/ircc-sdlc-agents';
const WORK = path.join(FILM, '.work-code');
const args = new Set(process.argv.slice(2));

// ------------------------------------------------------------------ narration: [spoken, caption]
const LINES = {
  intro1: ['This is a tour of the code behind a proof of concept. Twenty three LangGraph agents, one shared core, deployed as Microsoft Foundry hosted agents, and a small engine in Lumen that talks to them.',
    'This is a tour of the code behind a proof of concept: 23 LangGraph agents, one shared core, deployed as Microsoft Foundry hosted agents, and a small engine in Lumen that talks to them.'],
  repo1: ['Everything lives in one Python monorepo. Three shared libraries do the heavy lifting. The agent core, the contracts, and the connectors.',
    'Everything lives in one Python monorepo. Three shared libraries do the heavy lifting: the agent core, the contracts, and the connectors.'],
  repo2: ['Each agent is its own small package. The tools folder builds what Foundry deploys, and triggers, infrastructure and pipelines sit alongside.',
    'Each agent is its own small package. The tools folder builds what Foundry deploys, and triggers, infrastructure and pipelines sit alongside.'],
  journey1: ['Follow one request. Lumen calls the agent\'s Responses endpoint in Foundry. The hosting adapter from Lang chain Azure A I turns it into a LangGraph run.',
    "Follow one request. Lumen calls the agent's Responses endpoint in Foundry. The hosting adapter from langchain-azure-ai turns it into a LangGraph run."],
  journey2: ['The graph does its work, node by node, saving its state as it goes, and its final message becomes the reply.',
    'The graph does its work, node by node, saving its state as it goes, and its final message becomes the reply.'],
  state1: ['Every agent\'s state extends one base class. It is a LangGraph messages state, which is what the hosting adapter expects, plus the fields every agent shares. Sources, findings, proposals, the approval, and the result.',
    "Every agent's state extends one base class. It is a LangGraph MessagesState, which is what the hosting adapter expects, plus the fields every agent shares: sources, findings, proposals, the approval, and the result."],
  state2: ['Reducers decide how updates merge. Sources and findings accumulate. Errors reset at the start of every turn, so one bad request never poisons a conversation.',
    'Reducers decide how updates merge. Sources and findings accumulate. Errors reset at the start of every turn, so one bad request never poisons a conversation.'],
  shape1: ['Every agent follows the same shape. Take in the request, ground it in sources, analyse, check its own work, and render the result.',
    'Every agent follows the same shape: take in the request, ground it in sources, analyse, check its own work, and render the result.'],
  shape2: ['Only then, if it wants to change anything, does it stop and ask a person. Approval, apply, and finalize are shared nodes from the graph kit.',
    'Only then, if it wants to change anything, does it stop and ask a person. Approval, apply and finalize are shared nodes from the graph kit.'],
  llm1: ['Models are reached through two functions. Generate structured asks for a Pydantic schema, so what comes back is validated, typed data, not free text.',
    'Models are reached through two functions. generate_structured asks for a Pydantic schema, so what comes back is validated, typed data, not free text.'],
  llm2: ['The same layer handles the platform\'s edges. A content filter block becomes a typed error the agent can record and move past. If Azure rejects a schema, it retries with function calling.',
    "The same layer handles the platform's edges. A content filter block becomes a typed error the agent can record and move past. If Azure rejects a schema, it retries with function calling."],
  hitl1: ['Writing is deliberately hard. Agents never call a writer. They build proposals, and request approval calls LangGraph\'s interrupt. The graph pauses, and the checkpointer saves its state.',
    "Writing is deliberately hard. Agents never call a writer. They build proposals, and request_approval calls LangGraph's interrupt. The graph pauses, and the checkpointer saves its state."],
  hitl2: ['In Foundry, the pause surfaces as an M C P approval request. When a person approves, the graph resumes, and apply proposals is the only code that writes. Dry run by default, in dependency order, idempotent, and audited.',
    'In Foundry, the pause surfaces as an MCP approval request. When a person approves, the graph resumes, and apply_proposals is the only code that writes: dry run by default, in dependency order, idempotent, and audited.'],
  brr1: ['Now three real agents. Requirements refinement has sixteen working nodes. Green nodes are plain Python, purple ones call the model, and amber is a person.',
    'Now three real agents. Requirements refinement has 16 working nodes. Green nodes are plain Python, purple ones call the model, and amber is a person.'],
  brr2: ['Here is the wiring. After retrieving context, a conditional edge fans out with LangGraph\'s Send. One extraction per B R D section, in parallel.',
    "Here is the wiring. After retrieving context, a conditional edge fans out with LangGraph's Send: one extraction per BRD section, in parallel."],
  brr3: ['A self check then verifies every requirement\'s quote, word for word, against its section, and loops back only for the sections that failed.',
    "A self check then verifies every requirement's quote, word for word, against its section, and loops back only for the sections that failed."],
  brr4: ['Each section reaches the model wrapped as untrusted data. And a section the content filter blocks becomes a safety finding, not a failed run.',
    'Each section reaches the model wrapped as untrusted data. And a section the content filter blocks becomes a safety finding, not a failed run.'],
  sv1: ['Schedule variance shows the second rule. Deterministic first. Matching tasks, the critical path, the slips, and the impact downstream are all computed in Python.',
    'Schedule variance shows the second rule: deterministic first. Matching tasks, the critical path, the slips and the impact downstream are all computed in Python.'],
  sv2: ['The model only writes the narrative. Then a numeric self check rejects any number that is not in the computed findings, and any cause that has no evidence.',
    'The model only writes the narrative. Then a numeric self check rejects any number that is not in the computed findings, and any cause that has no evidence.'],
  abq1: ['The backlog agent is a tool calling loop inside a single node. The model only sees read only tools, plus propose change, which records a change but cannot make one.',
    'The backlog agent is a tool-calling loop inside a single node. The model only sees read-only tools, plus propose_change, which records a change but cannot make one.'],
  abq2: ['Anything it asks for that is not on the list is refused, and every proposed change still goes through validation and the approval node.',
    'Anything it asks for that is not on the list is refused, and every proposed change still goes through validation and the approval node.'],
  contracts1: ['Agents hand work to each other through shared contracts. The requirement model is defined once, and flows from refinement into design, stories, and traceability.',
    'Agents hand work to each other through shared contracts. The Requirement model is defined once, and flows from refinement into design, stories and traceability.'],
  conn1: ['Connectors follow one pattern. A fixture client for tests and phase one, a live client for phase two, and an injected client always wins. So every agent test runs offline.',
    'Connectors follow one pattern: a fixture client for tests and phase one, a live client for phase two, and an injected client always wins. So every agent test runs offline.'],
  test1: ['Tests script the model, run the real graph, inspect the interrupt, and resume it. Close to seven hundred tests, and none of them touch the network.',
    'Tests script the model, run the real graph, inspect the interrupt, and resume it. Close to 700 tests, and none of them touch the network.'],
  deploy1: ['Deployment is generated. A build step makes a flat folder per agent. Main dot py, pinned requirements, and a copy of the shared libraries, which is what Foundry\'s code deployment expects.',
    "Deployment is generated. A build step makes a flat folder per agent: main.py, pinned requirements, and a copy of the shared libraries, which is what Foundry's code deployment expects."],
  deploy2: ['The azure dot yaml is generated from each agent\'s metadata, and one a z d deploy publishes all twenty three hosted agents.',
    "The azure.yaml is generated from each agent's metadata, and one azd deploy publishes all 23 hosted agents."],
  lumen1: ['On the Lumen side, the Foundry engine is one provider file. It reads the agent from the agent\'s JSON file, maps attachments into the request, and calls the Responses endpoint with your Azure sign in.',
    "On the Lumen side, the Foundry engine is one provider file. It reads the agent from the agent's JSON file, maps attachments into the request, and calls the Responses endpoint with your Azure sign-in."],
  lumen2: ['When the reply holds an approval request, Lumen stores it and shows a card. The decision goes back as an M C P approval response, and the conversation continues where it paused.',
    'When the reply holds an approval request, Lumen stores it and shows a card. The decision goes back as an MCP approval response, and the conversation continues where it paused.'],
  lumen3: ['Each agent file declares how files map into its request. And the renderer turns the agent\'s result into tables and safety checks, without rewording anything.',
    "Each agent file declares how files map into its request. And the renderer turns the agent's result into tables and safety checks, without rewording anything."],
  close1: ['One core, twenty three agents, and a few strict rules. Ground everything, compute what you can, let the model explain, and never change a system without a person.',
    'One core, 23 agents, and a few strict rules: ground everything, compute what you can, let the model explain, and never change a system without a person.'],
  end: ['Delivery agents. LangGraph inside, Microsoft Foundry underneath, and Lumen on top.', 'Delivery agents. LangGraph inside, Microsoft Foundry underneath, and Lumen on top.'],
};

// ------------------------------------------------------------------ slides (from the real source)
const R = (p) => path.join(REPO, p);
const Lm = (p) => path.join(ROOT, p);
function code(id, kicker, title, file, start, opts, lang, repo, notes) {
  const g = grab(file, start, opts);
  return { type: 'code', id, kicker, title, path: path.relative(repo === 'Lumen' ? ROOT : REPO, file).replace(/\\/g, '/'), repo: repo === 'Lumen' ? 'CLIChat (Lumen)' : 'contoso-sdlc-agents', lang, first: g.first, text: g.text, notes };
}

function slides() {
  const graphs = JSON.parse(fs.readFileSync(process.env.GRAPHS_JSON || path.join(FILM, 'code-graphs.json'), 'utf8'));
  return [
    { type: 'tree', id: 's-repo', kicker: 'The repository', title: 'One monorepo: <em>a shared core</em> and 23 small agents', rows: [
      [0, 'contoso-sdlc-agents/', 'core', ''],
      [1, 'libs/contoso_agent_core/', 'core', 'graph kit, state, LLM access, approval (HITL), apply + audit, guardrails, hosting'],
      [1, 'libs/contoso_contracts/', 'contract', 'shared Pydantic models: Requirement, VarianceFinding, ControlMapping…'],
      [1, 'libs/contoso_connectors/', 'conn', 'ADO, SharePoint, Excel, MS Project (CPM), knowledge, Teams… fixture + live'],
      [1, 'agents/', 'agent', '23 packages, one per plan'],
      [2, '01-business-requirements-refinement/', 'agent', 'graph.py · state.py · nodes.py · prompts/ · tests/ · evals/'],
      [2, '10-schedule-variance/', 'agent', ''],
      [2, '21-ado-backlog-qa-update/', 'agent', '… and 20 more'],
      [1, 'tools/', 'ops', 'build_deploy.py · gen_azure_yaml.py'],
      [1, 'triggers/   infra/   .azuredevops/   evals/', 'ops', 'timers & webhooks · Bicep · CI/CD · eval runner'],
      [1, 'azure.yaml', 'ops', '23 Foundry hosted agents (generated)'],
    ] },
    { type: 'flow', id: 's-journey', kicker: 'A request\'s journey', title: 'From a chat message to a <em>LangGraph run</em> and back', steps: [
      ['💬', 'Lumen', 'foundry-agents.js builds the request', ''],
      ['☁️', 'Foundry', 'agent\'s Responses endpoint', ''],
      ['🔌', 'Hosting adapter', 'ResponsesHostServer (langchain-azure-ai)', ''],
      ['🕸️', 'LangGraph', 'build_graph() · nodes · checkpointer', ''],
      ['✅', 'Finalize', 'result JSON → reply message', ''],
    ], footer: 'State is checkpointed between turns (Foundry State Store), so follow-ups and approvals resume the same run.' },
    code('s-state', 'contoso_agent_core', 'One base state for <em>every</em> agent', R('libs/contoso_agent_core/src/contoso_agent_core/state.py'), 'RESET = "__reset__"', { count: 40 }, 'python', 'Agents', [
      '<b>MessagesState</b> underneath: what the Foundry hosting adapter accepts',
      'Shared fields: <code>sources</code>, <code>findings</code>, <code>proposals</code>, <code>approval</code>, <code>result</code>',
      '<b>Reducers</b>: findings accumulate; <code>errors</code> reset every turn']),
    { type: 'flow', id: 's-shape', kicker: 'The standard graph shape', title: 'Every agent: <em>ground, analyse, check</em> — then ask', layout: 'tall', steps: [
      ['📥', 'intake', 'parse request, refuse "skip approval"', ''],
      ['📚', 'retrieve', 'documents, plans, ADO, knowledge', ''],
      ['🧠', 'analyse', 'compute, then model', ''],
      ['🔍', 'self-check', 'citations, numbers, loop', ''],
      ['📄', 'render', 'JSON · Markdown · DOCX', ''],
      ['✋', 'approval', 'interrupt()', 'hitl'],
      ['✍️', 'apply', 'the only writer', 'hitl'],
      ['🏁', 'finalize', 'reply', ''],
    ] },
    code('s-llm', 'contoso_agent_core · llm.py', 'Typed model calls, <em>with the platform\'s edges handled</em>', R('libs/contoso_agent_core/src/contoso_agent_core/llm.py'), 'def is_content_filter_error', { count: 44 }, 'python', 'Agents', [
      '<code>generate_structured(Schema, …)</code> returns validated <b>Pydantic</b> objects',
      'Content filter → <code>ContentFilteredError</code>: record it, keep going',
      'Schema rejected by Azure → retry with <b>function calling</b>']),
    code('s-hitl', 'contoso_agent_core · hitl.py', 'A person approves <em>before anything changes</em>', R('libs/contoso_agent_core/src/contoso_agent_core/hitl.py'), 'def request_approval(', { count: 28 }, 'python', 'Agents', [
      '<code>interrupt()</code> pauses the graph; the checkpointer keeps its state',
      'Foundry shows it as an <b>mcp_approval_request</b>',
      'Scheduled runs also post to the <b>Review Queue</b>',
      '<code>apply_proposals</code>: the only writer · dry-run · ordered · idempotent · audited']),
    { type: 'graph', id: 's-g01', kicker: 'Agent 01 · Requirements Refinement', title: 'The real graph: <em>16 working nodes</em>', graph: graphs['01'],
      kinds: { det: ['intake', 'parse', 'retrieve_context', 'normalise', 'self_check', 'assemble', 'apply_edits', 'render', 'propose_publish', 'apply'], llm: ['extract_section', 'classify', 'analyse_quality', 'gap_analysis'], hitl: ['approve'], io: ['finalize'] },
      note: 'Exported from LangGraph with get_graph(). extract_section runs once per BRD section, in parallel.' },
    code('s-brr-graph', 'agents/01 · graph.py', 'Fan-out with <em>Send</em>, and a self-check loop', R('agents/01-business-requirements-refinement/src/contoso_brr/graph.py'), 'g.add_edge(START, "intake")', { count: 24 }, 'python', 'Agents', [
      'Conditional edge returns a list of <code>Send</code>: one extraction per section',
      '<code>self_check</code> verifies every quote word for word',
      'Loops back only for failed sections (max 2)']),
    code('s-brr-nodes', 'agents/01 · nodes.py', 'Untrusted input, <em>blocked sections become findings</em>', R('agents/01-business-requirements-refinement/src/contoso_brr/nodes.py'), 'def fan_out(', { count: 36 }, 'python', 'Agents', [
      '<code>wrap_untrusted()</code>: section text is data, never instructions',
      'Content filter block → a <b>guardrail finding</b>, the run continues']),
    { type: 'graph', id: 's-g10', kicker: 'Agent 10 · Schedule Variance', title: '<em>Deterministic first</em>: compute, then explain', graph: graphs['10'],
      kinds: { det: ['intake', 'load_plans', 'match_tasks', 'compute_cpm', 'compute_variance', 'impact_propagation', 'numeric_self_check', 'assemble_report', 'render', 'propose_publish', 'apply'], llm: ['narrate', 'followup'], hitl: ['approve'], io: ['finalize'] },
      note: 'Critical path, slips and downstream impact are plain Python (networkx). The model only writes the narrative.' },
    code('s-sv', 'agents/10 · nodes.py', 'A numeric self-check <em>guards the narrative</em>', R('agents/10-schedule-variance/src/contoso_sv/nodes.py'), 'def numeric_self_check', { count: 30 }, 'python', 'Agents', [
      'Every number in the text must exist in the <b>computed findings</b>',
      'A cause without evidence must say <b>"not evidenced"</b>',
      'Fails twice → a fixed, safe sentence']),
    code('s-abq', 'agents/21 · nodes.py', 'A tool-calling loop <em>with read-only tools</em>', R('agents/21-ado-backlog-qa-update/src/contoso_abq/nodes.py'), 'def backlog_agent', { count: 40 }, 'python', 'Agents', [
      '<code>bind_tools()</code> with read tools + <code>propose_change</code> only',
      'Unknown tools are refused',
      'Proposed changes → validation → <b>approval node</b>']),
    code('s-contracts', 'contoso_contracts · sdlc.py', 'Shared contracts <em>connect the agents</em>', R('libs/contoso_contracts/src/contoso_contracts/sdlc.py'), 'class Requirement(BaseModel):', { count: 24 }, 'python', 'Agents', [
      'Defined once by agent 01, used by 02, 03, 04, 05',
      'Every artefact carries <code>schema_version</code>',
      'Every claim carries a <code>SourceRef</code>']),
    code('s-conn', 'contoso_connectors · _common.py', 'One connector pattern: <em>fixture or live</em>', R('libs/contoso_connectors/src/contoso_connectors/_common.py'), 'class ClientSlot', { count: 28 }, 'python', 'Agents', [
      'Injected client &gt; live client (Phase 2 + config) &gt; fixture client',
      'Writers are registered with <code>apply</code>, never bound to the model']),
    code('s-test', 'tests', 'Real graphs, <em>scripted model</em>, no network', R('libs/contoso_agent_core/tests/test_core_graph.py'), 'def test_interrupt_approve_apply_orders_and_substitutes', { count: 18 }, 'python', 'Agents', [
      '<code>ScriptedLLM</code> answers per schema',
      '<code>run</code> → <code>pending_interrupts</code> → <code>resume</code>',
      '~700 tests across core, connectors, 23 agents, triggers, evals']),
    code('s-deploy', 'tools · build_deploy.py', 'Generated deployment to <em>Foundry hosted agents</em>', R('tools/build_deploy.py'), 'MAIN = ', { count: 40 }, 'python', 'Agents', [
      'One flat folder per agent: <code>main.py</code> + <code>requirements.txt</code> + vendored libs',
      '<code>azure.yaml</code> generated from <code>[tool.contoso-agent]</code>',
      '<code>azd deploy</code> → 23 hosted agents, each with its own identity']),
    code('s-lumen', 'Lumen · providers/foundry-agents.js', 'Lumen\'s Foundry engine: <em>one provider file</em>', Lm('providers/foundry-agents.js'), 'async run({', { count: 44 }, 'javascript', 'Lumen', [
      'Agent + attachments → request (<code>buildPayload</code>)',
      'Responses endpoint, Azure CLI sign-in, conversation = previous response id',
      'Approval request → <b>Approve card</b> → <code>mcp_approval_response</code>']),
    code('s-lumen-json', 'Lumen · agents/contoso-*.json', 'Each agent declares <em>how files map in</em>', Lm('agents/contoso-business-requirements-refinement.json'), '"foundry"', { count: 18 }, 'json', 'Lumen', [
      '<code>foundry.agent</code>: the hosted agent',
      '<code>inputs</code>: file-name rules → request fields',
      'The renderer turns result JSON into tables and safety checks']),
    { type: 'image', id: 's-lumen-shot', kicker: 'In Lumen', title: 'The pause, <em>as a person sees it</em>', file: Lm('e2e/screenshots/foundry-approval-card.png') },
  ];
}

// ------------------------------------------------------------------ the film
const LOGO = '<svg viewBox="0 0 32 32"><path d="M16 4l2.6 7.4L26 14l-7.4 2.6L16 24l-2.6-7.4L6 14l7.4-2.6z" fill="#fff"/></svg>';

async function runFilm(d) {
  const deck = (fn, ...a) => d.js(([f, x]) => window.Deck[f](...x), [fn, a]);
  const show = async (id) => { await deck('show', id); d.log('whoosh', { soft: true }); await d.wait(0.7); };
  const notes = async (id, n, gap) => { for (let i = 1; i <= n; i++) { await deck('note', id, i); await d.wait(gap); } };
  const focus = async (id, from, to, hold = 0.6) => { await deck('focus', id, from, to); await d.wait(0.9); const hl = `#${id} .ln.hl`; if (await d.page.locator(hl).count()) await d.hover(d.page.locator(hl).first(), 600); await d.wait(hold); };

  await d.js(() => window.Film.hideCursor(true));
  await d.card(`<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s">Inside the <em>SDLC agents</em></h1><p class="rise" style="animation-delay:.45s">How the LangGraph code is built, and how Lumen talks to it</p>`, 1.0);
  await d.say('intro1'); await d.waitVoice(0.4);
  await show('s-repo'); await d.uncard(900); await d.js(() => window.Film.hideCursor(false));

  // Repo
  await d.say('repo1');
  await d.wait(2.2); await deck('tree', 's-repo', ['contoso_agent_core']); await d.wait(1.6);
  await deck('tree', 's-repo', ['contoso_contracts']); await d.wait(1.4);
  await deck('tree', 's-repo', ['contoso_connectors']); await d.waitVoice();
  await d.say('repo2');
  await deck('tree', 's-repo', ['agents/', '01-business', '10-schedule', '21-ado']); await d.wait(3.0);
  await deck('tree', 's-repo', ['tools/', 'triggers/', 'azure.yaml']); await d.waitVoice();
  await deck('tree', 's-repo', null);

  // Journey
  await show('s-journey');
  await d.say('journey1');
  for (const i of [0, 1, 2]) { await deck('light', 's-journey', i); await d.wait(Math.max(1.2, d.voiceLeft() / (3 - i) - 0.2)); }
  await d.waitVoice();
  await d.say('journey2');
  await deck('light', 's-journey', 3); await d.wait(3.2); await deck('light', 's-journey', 4); await d.waitVoice();
  await deck('light', 's-journey', 'all'); await d.wait(0.8);

  // State
  await show('s-state');
  await d.say('state1');
  await focus('s-state', 'class BaseAgentState', 'result:', 0.4);
  await notes('s-state', 2, 2.4);
  await d.waitVoice();
  await d.say('state2');
  await focus('s-state', 'def turn_errors', 'return list(a or []) + b', 0.3);
  await notes('s-state', 3, 0.5);
  await d.wait(2.2); await focus('s-state', 'errors: Annotated', 'errors: Annotated', 0.2);
  await d.waitVoice(); await deck('focus', 's-state', null);

  // Standard shape
  await show('s-shape');
  await d.say('shape1');
  for (const i of [0, 1, 2, 3, 4]) { await deck('light', 's-shape', i); await d.wait(Math.max(1.0, d.voiceLeft() / (5 - i) - 0.15)); }
  await d.waitVoice();
  await d.say('shape2');
  for (const i of [5, 6, 7]) { await deck('light', 's-shape', i); await d.wait(Math.max(1.2, d.voiceLeft() / (8 - i) - 0.15)); }
  await d.waitVoice(); await deck('light', 's-shape', 'all'); await d.wait(0.6);

  // LLM
  await show('s-llm');
  await d.say('llm1');
  await focus('s-llm', 'def generate_structured(', 'return _invoke(model, messages)', 0.4);
  await notes('s-llm', 1, 0.4);
  await d.waitVoice();
  await d.say('llm2');
  await focus('s-llm', 'def is_content_filter_error', 'raise ContentFilteredError', 0.3); await notes('s-llm', 2, 0.3);
  await d.wait(Math.max(1.5, d.voiceLeft() - 5.5));
  await focus('s-llm', 'if not is_schema_rejection(e):', 'return _invoke(fallback, messages)', 0.2); await notes('s-llm', 3, 0.2);
  await d.waitVoice(); await deck('focus', 's-llm', null);

  // HITL
  await show('s-hitl');
  await d.say('hitl1');
  await focus('s-hitl', 'def request_approval(', '"""Pause the graph', 0.3); await notes('s-hitl', 1, 0.3);
  await d.wait(Math.max(1.0, d.voiceLeft() - 3.0));
  await focus('s-hitl', 'raw = interrupt(request)', 'raw = interrupt(request)', 0.3);
  await d.waitVoice();
  await d.say('hitl2');
  await notes('s-hitl', 2, 2.2);
  await focus('s-hitl', 'decision = parse_decision', 'return decision', 0.3); await notes('s-hitl', 3, 1.6); await notes('s-hitl', 4, 0.2);
  await d.zoom('#s-hitl .notes', 1.25, 900, 10); await d.waitVoice(); await d.unzoom(700);

  // Agent 01
  await show('s-g01');
  await d.say('brr1');
  await d.wait(3.5); await deck('mark', 's-g01', ['intake', 'parse', 'retrieve_context', 'normalise', 'self_check', 'assemble', 'apply_edits', 'render', 'propose_publish', 'apply']); await d.wait(2.0);
  await deck('mark', 's-g01', ['extract_section', 'classify', 'analyse_quality', 'gap_analysis']); await d.wait(1.8);
  await deck('mark', 's-g01', ['approve']); await d.waitVoice(); await deck('mark', 's-g01', null);
  await show('s-brr-graph');
  await d.say('brr2');
  await focus('s-brr-graph', 'add_conditional_edges("retrieve_context"', 'add_conditional_edges("retrieve_context"', 0.3); await notes('s-brr-graph', 1, 0.3);
  await d.waitVoice();
  await d.say('brr3');
  await focus('s-brr-graph', 'add_edge("gap_analysis", "self_check")', 'route_check', 0.3); await notes('s-brr-graph', 3, 1.2);
  await d.waitVoice(); await deck('focus', 's-brr-graph', null);
  await show('s-brr-nodes');
  await d.say('brr4');
  await focus('s-brr-nodes', 'out = generate_structured(SectionExtraction', 'out = generate_structured(SectionExtraction', 0.3); await notes('s-brr-nodes', 1, 0.3);
  await d.wait(Math.max(1.0, d.voiceLeft() - 4.5));
  await focus('s-brr-nodes', 'except ContentFilteredError:', 'title=f"Section {s.anchor} blocked', 0.3); await notes('s-brr-nodes', 2, 0.2);
  await d.waitVoice(); await deck('focus', 's-brr-nodes', null);

  // Agent 10
  await show('s-g10');
  await d.say('sv1');
  await d.wait(2.4); await deck('mark', 's-g10', ['load_plans', 'match_tasks', 'compute_cpm', 'compute_variance', 'impact_propagation']); await d.waitVoice();
  await show('s-sv');
  await d.say('sv2');
  await d.js(() => {}); await deck('mark', 's-g10', null);
  await focus('s-sv', 'bad = checks.unmatched_values(text', 'failures.append(f"{fid}: numbers not in finding', 0.3); await notes('s-sv', 1, 0.3);
  await d.wait(Math.max(1.0, d.voiceLeft() - 3.5));
  await focus('s-sv', 'if checks.uncited_driver', 'causal claim without evidence', 0.3); await notes('s-sv', 3, 0.6);
  await d.waitVoice(); await deck('focus', 's-sv', null);

  // Agent 21
  await show('s-abq');
  await d.say('abq1');
  await focus('s-abq', 'tools = build_tools(ctx)', 'bound = model.bind_tools(tools)', 0.3); await notes('s-abq', 1, 0.3);
  await d.wait(Math.max(1.0, d.voiceLeft() - 3.0));
  await focus('s-abq', 'for _ in range(MAX_AGENT_STEPS):', 'final = _text(ai.content)', 0.3);
  await d.waitVoice();
  await d.say('abq2');
  await focus('s-abq', 'tool = by_name.get(name)', 'is not available', 0.3); await notes('s-abq', 3, 1.0);
  await d.waitVoice(); await deck('focus', 's-abq', null);

  // Contracts and connectors
  await show('s-contracts');
  await d.say('contracts1');
  await focus('s-contracts', 'class Requirement(BaseModel):', 'source_excerpt', 0.3); await notes('s-contracts', 3, 1.6);
  await d.waitVoice(); await deck('focus', 's-contracts', null);
  await show('s-conn');
  await d.say('conn1');
  await focus('s-conn', 'class ClientSlot', 'Resolution:', 0.3); await notes('s-conn', 1, 1.0);
  await d.wait(Math.max(1.0, d.voiceLeft() - 4.0));
  await focus('s-conn', 'use_live = get_settings().live', 'use_live = get_settings().live', 0.3); await notes('s-conn', 2, 0.4);
  await d.waitVoice(); await deck('focus', 's-conn', null);

  // Tests
  await show('s-test');
  await d.say('test1');
  await focus('s-test', 'with ScriptedLLM', 'run(graph', 0.3); await notes('s-test', 1, 0.4);
  await focus('s-test', '[req] = pending_interrupts', '[req] = pending_interrupts', 0.2); await notes('s-test', 2, 0.4);
  await focus('s-test', 'out = resume(graph', 'out = resume(graph', 0.2); await notes('s-test', 3, 0.3);
  await d.waitVoice(); await deck('focus', 's-test', null);

  // Deploy
  await show('s-deploy');
  await d.say('deploy1');
  await focus('s-deploy', 'MAIN = ', 'serve(build_graph)', 0.3); await notes('s-deploy', 1, 0.4);
  await d.wait(Math.max(1.0, d.voiceLeft() - 4.0));
  await focus('s-deploy', 'def build(meta', 'requirements_for(meta)', 0.3);
  await d.waitVoice();
  await d.say('deploy2');
  await notes('s-deploy', 3, 2.0); await d.waitVoice(); await deck('focus', 's-deploy', null);

  // Lumen
  await show('s-lumen');
  await d.say('lumen1');
  await focus('s-lumen', 'const cfg = assistant?.foundry;', 'const protocol', 0.3); await notes('s-lumen', 1, 1.0);
  await d.wait(Math.max(1.0, d.voiceLeft() - 4.0));
  await focus('s-lumen', 'try { built = buildPayload', 'previous_response_id: sessionId', 0.3); await notes('s-lumen', 2, 0.3);
  await d.waitVoice();
  await d.say('lumen2');
  await focus('s-lumen', 'if (approval?.id) {', "input: [{ type: 'mcp_approval_response'", 0.3); await notes('s-lumen', 3, 0.3);
  await d.waitVoice(); await deck('focus', 's-lumen', null);
  await show('s-lumen-json');
  await d.say('lumen3');
  await focus('s-lumen-json', '"agent":', '"agent":', 0.3); await notes('s-lumen-json', 1, 0.4);
  await focus('s-lumen-json', '"inputs":', '"nameField"', 0.3); await notes('s-lumen-json', 3, 0.6);
  await d.wait(Math.max(0.5, d.voiceLeft() - 3.2));
  await show('s-lumen-shot'); await d.zoom('#s-lumen-shot .shot img', 1.15, 1200); await d.waitVoice(0.6); await d.unzoom(700);

  // Close
  await d.js(() => window.Film.hideCursor(true));
  await d.card('<div class="kicker rise">The rules in the code</div><h1 class="rise" style="animation-delay:.15s;font-size:62px">Ground · <em>Compute</em> · Explain · <em>Approve</em></h1><div class="pills rise" style="animation-delay:.4s"><span>🧱 one shared core</span><span>🕸️ 23 LangGraph agents</span><span>☁️ Foundry hosted agents</span><span>💬 Lumen on top</span></div>', 0.4);
  await d.say('close1'); await d.waitVoice(0.5);
  await d.card(`<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s">The <em>SDLC agents</em></h1><p class="rise" style="animation-delay:.45s">LangGraph inside · Microsoft Foundry underneath · Lumen on top</p>`, 0.3);
  await d.say('end'); await d.waitVoice(1.5);
}

// ------------------------------------------------------------------ main
async function main() {
  const kit = createKit({ name: 'lumen-agents-code', lines: LINES, vo: path.join(FILM, 'vo-code'), work: WORK, out: path.join(FILM, 'out') });
  const lengths = kit.makeVoice();
  if (args.has('--voice')) { let total = 0; for (const [k, v] of Object.entries(lengths)) { total += v; console.log(k.padEnd(11), `${v.toFixed(1)}s`); } console.log(`total narration ${total.toFixed(0)}s`); return; }
  const deckFile = buildDeck({ slides: slides(), hljsDir: path.join(ROOT, 'node_modules', '@highlightjs', 'cdn-assets'), out: path.join(WORK, 'deck.html') });
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--force-color-profile=srgb'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript({ path: path.join(FILM, 'overlay.js') });
  await page.goto(`file:///${deckFile.replace(/\\/g, '/')}`);
  await page.waitForFunction(() => !!window.Deck && !!window.Film);
  await page.waitForTimeout(800);
  const d = new kit.Director(page, lengths);
  const cap = new kit.Capture(page, await context.newCDPSession(page));
  await cap.start();
  const t0 = Date.now();
  try { await runFilm(d); } catch (e) { await page.screenshot({ path: path.join(WORK, 'failed.png') }); throw e; }
  await cap.stop();
  await browser.close();
  console.log('page errors', errors, 'took', Math.round((Date.now() - t0) / 1000), 's');
  kit.finish(cap.frames, d.events, { stills: args.has('--stills'), thumbAt: 0.33 });
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
