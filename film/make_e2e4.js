// "Microsoft's agent platform, built for real": the architect's cut. Starts from Microsoft's end-to-end platform
// picture (build in GitHub, run in Foundry, distribute, continuous improvement), redraws it with the 23 LangGraph
// agents, then zooms each architecture view into the real portal screen and the real code: inside one agent, repo to
// running agent (with real azd output), one request in six hops, and the improvement loop (red team → fix → v3).
//
//   node film/make_e2e4.js --voice    Narration only (Kokoro), with each line's length.
//   node film/make_e2e4.js --deck     Build the slide deck only (film/.work-e2e4/deck.html) to check the diagrams.
//   node film/make_e2e4.js            Film and encode film/out/lumen-foundry-built-for-real.mp4 + .srt + .vtt + thumbnail.
//   node film/make_e2e4.js --remix    Re-voice and re-encode from the last run's frames.
//   node film/make_e2e4.js --stills   Film, then write a contact sheet instead of encoding.
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
const DEPLOY = path.resolve(REPO, '..', 'foundry-test-deploy', 'contoso');
const WORK = path.join(FILM, '.work-e2e4');
const NAME = 'lumen-foundry-built-for-real';
const PORT = E.PORT;
const BRR = E.BRR;
const ICD = 'contoso-interface-documentation';
const INPUTS = path.join(FILM, '.work-foundry', 'CSP Release 2');
const args = new Set(process.argv.slice(2));

// ------------------------------------------------------------------ narration: [spoken, caption]
const L = (spoken, caption = spoken) => [spoken, caption];
const LINES = {
  t1: L('Microsoft draws its agent platform like this. Build in GitHub. Run and optimise in Foundry. Reach people where they work. And feed what you learn back into the next build. I built twenty three real agents, to see what each box actually takes.',
    'Microsoft draws its agent platform like this. Build in GitHub. Run and optimise in Foundry. Reach people where they work. And feed what you learn back into the next build. I built 23 real agents, to see what each box actually takes.'),
  a1: L('Here is that picture, with what I built. On the left, the build. Twenty three LangGraph agents, their prompts, tools and test cases, in one GitHub repo, written with Claude Code.',
    'Here is that picture, with what I built. On the left, the build: 23 LangGraph agents, their prompts, tools and test cases, in one GitHub repo, written with Claude Code.'),
  a2: L('In the middle, Foundry runs them. Each one is a hosted agent, with its own identity and endpoint. Foundry adds the models, guardrails, evaluation, red teaming and tracing.'),
  a3: L('On the right, people reach them through Lumen, a chat app I built. Teams and Copilot are a publish step away, but need tenant rights I do not have.',
    "On the right, people reach them through Lumen, a chat app I built. Teams and Copilot are a publish step away, but need tenant rights I don't have."),
  a4: L('Faded boxes are on Microsoft\'s slide, but not used here. And the loop along the bottom is real. Later, I will follow one failure all the way round it.',
    "Faded boxes are on Microsoft's slide, but not used here. And the loop along the bottom is real. Later, I'll follow one failure all the way round it."),
  a5: L('Keep one split in mind. The purple box is mine. The agent\'s behaviour, written in LangGraph. Everything around it, Foundry provides.',
    "Keep one split in mind. The purple box is mine: the agent's behaviour, written in LangGraph. Everything around it, Foundry provides."),
  d1: L('Every agent follows the same graph shape. Take in the request, ground it in sources, analyse, and check its own work. Only then, if it wants to change something, does it stop and ask a person.',
    'Every agent follows the same graph shape: take in the request, ground it in sources, analyse, and check its own work. Only then, if it wants to change something, does it stop and ask a person.'),
  d2: L('Here is a real one, exported straight from LangGraph. Green steps are plain Python, purple steps call the model, and amber is a person.'),
  d3: L('In code, plain edges go to the next step, and conditional edges let a function decide. Fan out sends one extraction per document section, in parallel, and the self check loops back only for the sections that failed.',
    'In code, plain edges go to the next step, and conditional edges let a function decide. fan_out sends one extraction per document section, in parallel, and the self-check loops back only for the sections that failed.'),
  d4: L('When an agent wants to change something, interrupt pauses the graph. The checkpoint saves its state, and the run resumes exactly where it stopped, once a person decides.',
    'When an agent wants to change something, interrupt() pauses the graph. The checkpoint saves its state, and the run resumes exactly where it stopped, once a person decides.'),
  p1: L('So how does that get into Foundry? Foundry\'s code deploy wants one flat folder per agent, with a main dot pie and a requirements file. My agents share libraries in one repo, so a build step flattens each agent, and copies the shared code in. A second step writes the azure dot yaml.',
    "So how does that get into Foundry? Foundry's code deploy wants one flat folder per agent, with a main.py and a requirements file. My agents share libraries in one repo, so a build step flattens each agent, and copies the shared code in. A second step writes the azure.yaml."),
  p2: L('Then a z d deploy uploads each folder. Foundry builds it in the cloud, with no Dockerfile, and creates a new, immutable version, with its own identity and endpoint.',
    'Then azd deploy uploads each folder. Foundry builds it in the cloud, with no Dockerfile, and creates a new, immutable version, with its own identity and endpoint.'),
  p3: L('This is the real output from redeploying one agent. Package, publish, a new version, and its endpoint, in under two minutes. All twenty three together took about six and a half.',
    'This is the real output from redeploying one agent. Package, publish, a new version, and its endpoint, in under two minutes. All 23 together took about six and a half.'),
  p4: L('Here is one of the twenty three azure dot yaml entries. A hosted agent, the Responses protocol, Python three thirteen, built remotely, with one CPU and two gigabytes.',
    'Here is one of the 23 azure.yaml entries: a hosted agent, the Responses protocol, Python 3.13, built remotely, with one CPU and two gigabytes.'),
  p5: L('And this is the whole entry point. It hands the graph to Foundry\'s LangGraph adapter, which serves the Responses protocol.',
    "And this is the whole entry point. It hands the graph to Foundry's LangGraph adapter, which serves the Responses protocol."),
  p6: L('In Microsoft Foundry, under Agents, all twenty three show up as hosted agents. Each one is running, and every deployment gets a new version.',
    'In Microsoft Foundry, under Agents, all 23 show up as hosted agents. Each one is running, and every deployment gets a new version.'),
  r1: L('Now follow one request, end to end. Six hops. Two of them are my code. The other four, I configured.'),
  r2: L('First, the user\'s view. An integration architect opens the interface documentation agent in Lumen, attaches the specs, and asks for an interface control document. Lumen calls the agent\'s endpoint with the user\'s own Azure sign in.',
    "First, the user's view. An integration architect opens the interface documentation agent in Lumen, attaches the specs, and asks for an interface control document. Lumen calls the agent's endpoint with the user's own Azure sign-in."),
  r3: L('When the agent pauses for a decision, Lumen shows an approval card. Approve it, and the agent picks up exactly where it stopped.'),
  r4: L('That is what the user saw. Underneath, the endpoint checked an Azure role first. Foundry Agent Consumer is the least privileged role that can call it. Then the agent ran in its own sandbox, as its own Entra identity.',
    "That's what the user saw. Underneath, the endpoint checked an Azure role first. Foundry Agent Consumer is the least privileged role that can call it. Then the agent ran in its own sandbox, as its own Entra identity."),
  r5: L('Open the agent, and select its Details tab. Under Identity and access, each agent has its own Entra agent identity, granted access to the project\'s models.',
    "Open the agent, and select its Details tab. Under Identity & access, each agent has its own Entra agent identity, granted access to the project's models."),
  r6: L('Under Endpoints, its Responses endpoint, and who can call it. Users never need access to the model. The agent calls it as itself.',
    'Under Endpoints, its Responses endpoint, and who can call it. Users never need access to the model. The agent calls it as itself.'),
  r7: L('In code, there are no keys. The default Azure credential picks up the agent identity, and the project hands back a model client.'),
  r8: L('Every model call then passes through a guardrail, attached to the model deployment.'),
  r9: L('It blocks harmful content and jailbreaks. Indirect prompt injection is set to annotate, so the agent can flag hostile text in a document, instead of rejecting the whole thing.'),
  r10: L('The approval works because, when the graph pauses, its state is saved in Foundry\'s state store, so the run can pick up exactly where it stopped.',
    "The approval works because, when the graph pauses, its state is saved in Foundry's state store, so the run can pick up exactly where it stopped."),
  r11: L('And every hop is traced.'),
  r12: L('Each agent has a Traces tab. Open a trace, and the span names are the graph\'s node names, with every model call underneath, and its timing and tokens.',
    "Each agent has a Traces tab. Open a trace, and the span names are the graph's node names, with every model call underneath, and its timing and tokens."),
  r13: L('Monitor rolls it up across all the agents. Runs, tokens, and what it cost.', 'Monitor rolls it up across all the agents: runs, tokens, and what it cost.'),
  r14: L('On the app side, it is one provider file. Build the request, call the Responses endpoint, and send the approval back. Any front end could do the same.',
    "On the app side, it's one provider file: build the request, call the Responses endpoint, and send the approval back. Any front end could do the same."),
  e1: L('Now the loop. I pointed Foundry\'s ay-eye Red Teaming Agent at the deployed agents. Eighty attacks each, half of them hidden inside the documents the agents read.',
    "Now the loop. I pointed Foundry's AI Red Teaming Agent at the deployed agents: 80 attacks each, half of them hidden inside the documents the agents read."),
  e2: L('At the time of recording, its reports open in the classic view.'),
  e3: L('It found one real failure. A planted harmful sentence became a requirement, because turning sentences into requirements is exactly what this agent does.'),
  e4: L('The fix is layered. The content filter, a prompt rule, and a deterministic scan that drops anything built from harmful text.',
    'The fix is layered: the content filter, a prompt rule, and a deterministic scan that drops anything built from harmful text.'),
  e5: L('That case went into the test set, the agent was redeployed as version three, and the re scan found nothing.',
    'That case went into the test set, the agent was redeployed as version 3, and the re-scan found nothing.'),
  e6: L('The same loop, testing the deployed agents rather than the code, found a gap the unit tests had missed in another agent. Its gap recall went from zero point four four, to one.',
    'The same loop, testing the deployed agents rather than the code, found a gap the unit tests had missed in another agent. Its gap recall went from 0.44 to 1.00.'),
  c1: L('So, what does it take? You write the graph, the prompts and the tests, a three line main dot pie, and an azure dot yaml entry. Foundry gives you the build, hosting, identity, access control, guardrails, tracing, evaluation and red teaming.',
    'So, what does it take? You write the graph, the prompts and the tests, a three-line main.py, and an azure.yaml entry. Foundry gives you the build, hosting, identity, access control, guardrails, tracing, evaluation and red teaming.'),
  c2: L('You need a Foundry project, the Foundry Project Manager role to deploy, and a z d with the Foundry agent extension. Your framework decides how the agent behaves. Foundry decides how it runs.',
    'You need a Foundry project, the Foundry Project Manager role to deploy, and azd with the Foundry agent extension. Your framework decides how the agent behaves. Foundry decides how it runs.'),
  end: L('Twenty three agents, every box on the slide, built for real.', '23 agents, every box on the slide, built for real.'),
};

// ------------------------------------------------------------------ diagram helpers (SVG for code-deck diagram slides)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A labelled box in its own highlight group. */
function B(k, cls, x, y, w, h, title, lines = [], { faded = false, lh = 26 } = {}) {
  return `<g data-k="${k}"${faded ? ' class="faded"' : ''}><rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>`
    + `<text class="t" x="${x + 20}" y="${y + 36}">${esc(title)}</text>`
    + lines.map((l, i) => `<text class="m" x="${x + 20}" y="${y + 66 + i * lh}">${esc(l)}</text>`).join('') + '</g>';
}
const A = (k, d, label, lx, ly) => `<g data-k="${k}"><path class="ln2" d="${d}" marker-end="url(#MARKER)"/>${label ? `<text class="s" x="${lx}" y="${ly}">${esc(label)}</text>` : ''}</g>`;
const N = (k, x, y, n) => `<g data-k="${k}" class="badge"><circle cx="${x}" cy="${y}" r="16"/><text x="${x}" y="${y + 6}" text-anchor="middle">${n}</text></g>`;
const T = (x, y, cls, text, anchor = 'start') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(text)}</text>`;

const D_MAP = [
  B('build', 'bx', 20, 20, 320, 560, 'Build', ['GitHub · Claude Code']),
  B('build', 'py', 40, 110, 280, 80, 'Code', ['23 LangGraph agents']),
  B('build', 'py', 40, 200, 280, 80, 'Prompts', ['prompts/*.md']),
  B('build', 'py', 40, 290, 280, 80, 'Tools', ['contoso_connectors']),
  B('build', 'py', 40, 380, 280, 80, 'Eval definitions', ['golden sets · thresholds']),
  B('build', 'py', 40, 470, 280, 80, 'Deploy definition', ['build step → azure.yaml']),
  A('build', 'M342 300 H396'), `<g data-k="build">${T(370, 270, 's', 'azd', 'middle')}${T(370, 290, 's', 'deploy', 'middle')}</g>`,
  B('plat', 'pl', 400, 20, 700, 560, 'Run in Microsoft Foundry', ['one project · 23 hosted agents · versioned']),
  B('plat', 'bx', 420, 110, 320, 240, 'Agent runtime', ['hosted agent', 'Entra agent identity', 'Responses endpoint', 'state store']),
  B('graph', 'md', 436, 266, 288, 74, 'LangGraph graph', ['my code']),
  B('plat', 'bx', 760, 110, 320, 240, 'Evaluate & protect', ['✓ live evals', '✓ AI red teaming', '✓ guardrails', '✓ traces + monitor']),
  B('unused', 'bx', 760, 300, 320, 50, '', [], { faded: true }),
  T(780, 333, 'm', '– routing + RL: not used'),
  B('plat', 'bx', 420, 366, 660, 80, 'AI models', ['gpt-5-mini · text-embedding-3-small']),
  B('unused', 'bx', 420, 458, 660, 80, 'Context with IQ', ['knowledge agent designed, not wired yet'], { faded: true }),
  A('dist', 'M1102 300 H1156'), `<g data-k="dist">${T(1130, 288, 's', 'HTTPS', 'middle')}</g>`,
  B('dist', 'bx', 1160, 20, 320, 560, 'Distribute', ['how people reach it']),
  B('dist', 'ac', 1180, 110, 280, 106, 'Lumen', ['your own Azure sign-in', 'approval cards']),
  B('unused', 'bx', 1180, 228, 280, 80, 'Teams · M365 Copilot', ['needs tenant rights'], { faded: true }),
  B('dist', 'bx', 1180, 320, 280, 80, 'Agent → agent', ['same endpoint']),
  B('dist', 'bx', 1180, 412, 280, 106, 'Govern', ['Agent ID per agent', 'Agent Consumer role']),
  `<g data-k="loop"><path class="lp" d="M1320 584 V660 H180 V588" marker-end="url(#MARKER)"/><rect x="400" y="640" width="700" height="42" rx="21" fill="#1a1433" stroke="#ffb08f" stroke-width="1.6"/>`
    + T(750, 668, 's', 'Continuous improvement: production signals feed the next build', 'middle') + '</g>',
].join('');

const D_DEPLOY = [
  `<text class="tag" x="20" y="30" fill="#8be9a8">MINE · ON MY LAPTOP</text><text class="tag" x="800" y="30" fill="#79b8ff">FOUNDRY · IN THE CLOUD</text>`,
  '<path d="M778 14 V420" stroke="rgba(255,255,255,.3)" stroke-dasharray="6 6" fill="none"/>',
  B('repo', 'py', 20, 60, 230, 210, 'Monorepo', ['agents/01-…/', 'libs/…_core', 'uv.lock', 'scripted tests']),
  A('build', 'M252 165 H278'),
  B('build', 'py', 280, 60, 230, 210, 'build_deploy.py', ['flat folder each', 'main.py', 'requirements.txt', 'vendored libs']),
  A('yaml', 'M512 165 H538'),
  B('yaml', 'py', 540, 60, 220, 210, 'gen_azure_yaml', ['23 services', 'azure.ai.agent', 'cpu · memory', 'protocol 2.0.0']),
  A('azd', 'M650 272 V306'),
  B('azd', 'ac', 280, 310, 480, 96, 'azd deploy', ['zip · upload · all 23 in 6m 32s']),
  A('cloud', 'M762 358 H905 V274'),
  B('cloud', 'pl', 800, 60, 210, 210, 'Remote build', ['pip install', 'Python 3.13', 'no Dockerfile']),
  A('cloud', 'M1012 165 H1036'),
  B('cloud', 'pl', 1040, 60, 200, 210, 'New version', ['immutable', 'code · env', 'resources', 'BRR is v3']),
  A('cloud', 'M1242 165 H1266'),
  B('cloud', 'pl', 1270, 60, 210, 346, 'Created for it', ['Entra agent', '  identity', 'Responses', '  endpoint', 'traffic to the', '  new version', 'sessions on', '  demand']),
  T(20, 470, 's', 'Prerequisites: azd + Foundry agent extension · Foundry Project Manager role · App Insights connected to the project'),
].join('');

const D_REQ = [
  B('h1', 'ac', 20, 100, 250, 180, 'Lumen', ['user signs in', 'attaches files', 'token for', 'ai.azure.com']), N('h1', 252, 116, 1),
  A('h1', 'M272 190 H306'),
  B('h2', 'pl', 310, 60, 270, 260, 'Responses endpoint', ['…/agents/<name>/', 'endpoint/protocols/', 'openai/responses', '', 'Azure RBAC check:', 'Agent Consumer']), N('h2', 562, 76, 2),
  A('h2', 'M582 190 H616'),
  B('h3', 'pl', 620, 20, 520, 410, 'Hosted agent session', ['its own Entra agent identity', 'sandbox · 1 vCPU · 2 GiB']), N('h3', 1122, 36, 3),
  B('h3', 'bx', 645, 128, 470, 58, 'ResponsesHostServer :8088'),
  B('graph', 'md', 645, 198, 470, 122, 'LangGraph graph', ['ground → analyse ×N → check → ask', 'typed outputs · harmful-text scan']),
  B('h6', 'hu', 645, 334, 470, 82, 'FoundryCheckpointSaver', ['state saved at interrupt()']), N('h6', 1097, 350, 6),
  A('h4', 'M1142 230 H1176'),
  B('h4', 'wa', 1180, 60, 300, 186, 'Guardrail', ['harmful: block', 'jailbreak: block', 'doc injection:', '  annotate']), N('h4', 1462, 76, 4),
  B('h4', 'md', 1180, 262, 300, 96, 'gpt-5-mini', ['model deployment']),
  A('h5', 'M880 432 V476'),
  B('h5', 'bx', 620, 480, 520, 130, 'App Insights → Traces, Monitor', ['a span per graph step, model call', 'tokens · duration · cost']), N('h5', 1122, 496, 5),
  `<g data-k="h6"><path class="ln2" d="M145 282 V476" stroke-dasharray="7 6" marker-end="url(#MARKER)"/></g>`,
  B('h6', 'hu', 20, 480, 560, 130, 'Approval round trip', ['interrupt() pauses · Lumen shows a card', 'decision posted back · graph resumes']),
].join('');

const D_LOOP = [
  B('rt', 'pl', 20, 60, 260, 190, 'Red team · v2', ['80 attacks each', '40 inside the BRD', '1 failure (2.5%)']),
  A('tr', 'M282 155 H316'),
  B('tr', 'pl', 320, 60, 260, 190, 'Trace + report', ['harmful line became', 'APPTS-FR-004']),
  A('fix', 'M582 155 H616'),
  B('fix', 'py', 620, 60, 260, 190, 'Fix: three layers', ['content filter', '+ prompt rule', '+ scan_harmful()']),
  A('lock', 'M882 155 H916'),
  B('lock', 'py', 920, 60, 260, 190, 'Lock it in', ['golden case', '  brr-013-harmful', '+ unit test']),
  A('v3', 'M1182 155 H1216'),
  B('v3', 'pl', 1220, 60, 260, 190, 'azd deploy → v3', ['re-scan: 0%', 'live evals 17/17']),
  `<g data-k="loop"><path class="lp" d="M1350 254 V330 H150 V258" marker-end="url(#MARKER)"/></g>`,
  `<g data-k="icd">${T(750, 400, 's', 'Same loop, another agent: live evals found an interface-doc defect the unit tests missed (gap recall 0.44 → 1.00)', 'middle')}</g>`,
].join('');

const D_TAKES = [
  B('w1', 'py', 20, 40, 460, 300, 'You write', ['the graph, prompts, tests', '  (most of the effort)', 'main.py (3 lines)', 'requirements.txt', 'an azure.yaml entry', 'a flatten step, if', '  you have a monorepo']),
  B('w2', 'pl', 520, 40, 460, 300, 'Foundry gives you', ['cloud build · hosting', 'versions · sessions', 'Entra agent identity', 'Responses endpoint + RBAC', 'guardrails', 'traces · monitor', 'evals · AI red teaming', 'Teams / M365 channels']),
  B('w3', 'ac', 1020, 40, 460, 300, 'You need', ['a Foundry project', '  (supported region)', 'App Insights connected', 'Foundry Project Manager', '  to deploy', 'Foundry Agent Consumer', '  for each caller', 'azd + agent extension']),
  `<g data-k="cmd">${T(20, 400, 'm', '$ azd ai agent init   ·   azd ai agent run   ·   azd deploy   ·   azd ai agent invoke   ·   azd ai agent monitor')}</g>`,
].join('');

// The real redeploy of agent 01 (version 3), from foundry-test-deploy/contoso/deploy-brr-redteam.log; account names masked.
function deployLines() {
  const raw = fs.readFileSync(path.join(DEPLOY, 'deploy-brr-redteam.log'), 'utf8').split(/\r?\n/);
  const pick = [/Packaging \(Packaging code\)/, /: Publishing/, /Deploying hosted agent \(code deploy\)/, /Agent version created/, /Polling agent status \(7\/48\)/, /Registering agent environment/, /: Done/];
  const svc = (l) => l.replace('contoso-business-requirements-refinement', 'contoso-brr');
  const out = [['cmd', '$ azd deploy contoso-business-requirements-refinement'], ['dim', ''], ['', 'Deploying services (azd deploy)'], ['dim', '']];
  for (const re of pick) { const l = raw.find((x) => re.test(x)); if (l) out.push([/Done/.test(l) ? 'ok' : /version created/.test(l) ? 'hl' : '', svc(l)]); }
  const ep = raw.find((x) => /Agent endpoint \(responses\)/.test(x));
  if (ep) {
    const url = ep.match(/https:\/\/\S+/)[0].replace(/https:\/\/[^/]+\/api\/projects\/[^/]+/, 'https://<resource>.services.ai.azure.com/api/projects/<project>').replace(/\?api-version=v1$/, '').replace('contoso-business-requirements-refinement', 'contoso-brr');
    out.push(['dim', ''], ['url', '- Agent endpoint (responses):'], ['url', `  ${url}`]);
  }
  const ok = raw.find((x) => /^SUCCESS/.test(x));
  out.push(['dim', ''], ['', 'Next:'], ['', "  azd ai agent invoke contoso-business-requirements-refinement '<payload>'"], ['dim', ''], ['ok', ok || 'SUCCESS']);
  return out;
}

// ------------------------------------------------------------------ slides (diagrams + real source)
const R = (p) => path.join(REPO, p);
const Lm = (p) => path.join(ROOT, p);
function code(id, kicker, title, file, start, opts, lang, repo, notes, shown) {
  const g = grab(file, start, opts);
  const base = repo === 'Lumen' ? ROOT : REPO;
  const text = g.text.replace(/darektomyn-\d+/g, 'foundry-project'); // the account's project name stays off screen
  return { type: 'code', id, kicker, title, path: shown || path.relative(base, file).replace(/\\/g, '/'), repo: repo === 'Lumen' ? 'CLIChat (Lumen)' : 'contoso-sdlc-agents', lang, first: g.first, text, notes };
}
const BRR_SRC = 'agents/01-business-requirements-refinement/src/contoso_brr';
const dg = (id, kicker, title, viewBox, svg) => ({ type: 'diagram', id, kicker, title, viewBox, svg });
function slides() {
  const graphs = JSON.parse(fs.readFileSync(path.join(FILM, 'code-graphs.json'), 'utf8'));
  return [
    { type: 'image', id: 's-ms', kicker: "Microsoft's picture", title: 'An <em>end-to-end</em> agent platform', file: path.join(FILM, 'foundry-inputs', 'ms-end-to-end-platform.png') },
    dg('d-map', 'View A · the whole platform', 'Microsoft\'s picture, <em>with what I built</em>', '0 0 1500 700', D_MAP),
    { type: 'flow', id: 's-shape', kicker: 'View D · inside one agent', title: 'Every agent: <em>ground, analyse, check</em>, then ask', layout: 'tall', steps: [
      ['📥', 'intake', 'parse the request', ''], ['📚', 'retrieve', 'documents, plans, knowledge', ''], ['🧠', 'analyse', 'compute, then model', ''],
      ['🔍', 'self-check', 'citations, numbers, loop', ''], ['📄', 'render', 'JSON · Markdown · DOCX', ''], ['✋', 'approval', 'interrupt()', 'hitl'],
      ['✍️', 'apply', 'the only writer', 'hitl'], ['🏁', 'finalize', 'reply', ''],
    ] },
    { type: 'graph', id: 's-g01', kicker: 'Agent 01 · Requirements Refinement', title: 'A real graph: <em>16 working nodes</em>', graph: graphs['01'],
      kinds: { det: ['intake', 'parse', 'retrieve_context', 'normalise', 'self_check', 'assemble', 'apply_edits', 'render', 'propose_publish', 'apply'], llm: ['extract_section', 'classify', 'analyse_quality', 'gap_analysis'], hitl: ['approve'], io: ['finalize'] },
      note: 'Exported from LangGraph with get_graph(). Green: Python · purple: model · amber: a person.' },
    code('s-wiring', 'agents/01 · graph.py', 'Wiring the graph: <em>edges, conditions, a loop</em>', R(`${BRR_SRC}/graph.py`), 'g.add_edge(START, "intake")', { count: 20 }, 'python', 'Agents', [
      '<code>add_edge</code>: always the next step', '<code>add_conditional_edges</code>: a function decides', '<code>fan_out</code> → one <code>Send</code> per section; <code>self_check</code> loops back for failures']),
    code('s-hitl', 'contoso_agent_core · hitl.py', 'A person approves <em>before anything changes</em>', R('libs/contoso_agent_core/src/contoso_agent_core/hitl.py'), 'def request_approval(', { count: 28 }, 'python', 'Agents', [
      '<code>interrupt()</code> pauses the graph; the checkpointer keeps its state', 'Resumes exactly where it stopped, after the decision']),
    dg('d-deploy', 'View B · repo to running agent', 'What one <em>azd deploy</em> does', '0 0 1500 500', D_DEPLOY),
    { type: 'term', id: 's-term', kicker: 'Real output · redeploying agent 01 as version 3', title: '<em>azd deploy</em>, one agent', label: 'PowerShell · foundry-test-deploy/contoso', note: 'deploy-brr-redteam.log · account names masked, service name shortened', lines: deployLines() },
    code('s-yaml', 'foundry-test-deploy/contoso · azure.yaml', 'One of 23 <em>hosted agent</em> entries', path.join(DEPLOY, 'azure.yaml'), '  contoso-business-requirements-refinement:', { count: 36 }, 'yaml', 'Agents', [
      '<code>host: azure.ai.agent</code>, <code>kind: hosted</code>', 'Responses protocol <b>2.0.0</b>', '<code>python_3_13</code>, <code>remote_build</code>: no Dockerfile', '1 vCPU · 2 GiB per session'], 'foundry-test-deploy/contoso/azure.yaml'),
    code('s-main', 'generated · main.py', 'The <em>whole</em> entry point', path.join(REPO, 'dist', 'deploy', BRR, 'main.py'), '"""Foundry hosted-agent entry point', { count: 10 }, 'python', 'Agents', [
      'Generated per agent by <code>build_deploy.py</code>', '<code>serve()</code> → <code>ResponsesHostServer(graph)</code> on port 8088', 'Foundry\'s LangGraph adapter: <code>langchain_azure_ai.agents.hosting</code>'], `dist/deploy/${BRR}/main.py`),
    dg('d-req', 'View C · one request, six hops', 'What happens when <em>the user presses Send</em>', '0 0 1500 640', D_REQ),
    code('s-llm', 'contoso_agent_core · llm.py', 'No keys: <em>the agent is its own identity</em>', R('libs/contoso_agent_core/src/contoso_agent_core/llm.py'), 'def _build_chat_model(', { count: 24 }, 'python', 'Agents', [
      '<code>DefaultAzureCredential()</code> → the Entra agent identity in Foundry', '<code>get_openai_client()</code> from the project endpoint', 'Bearer token, no API key anywhere']),
    code('s-lumen', 'Lumen · providers/foundry-agents.js', 'Lumen\'s Foundry engine: <em>one provider file</em>', Lm('providers/foundry-agents.js'), 'async run({', { count: 44 }, 'javascript', 'Lumen', [
      'Agent + attachments → request (<code>buildPayload</code>)', 'Responses endpoint, your Azure sign-in, conversation = previous response id', 'Approval request → <b>Approve card</b> → <code>mcp_approval_response</code>']),
    dg('d-loop', 'View E · the improvement loop', 'Production signals <em>feed the next build</em>', '0 0 1500 420', D_LOOP),
    code('s-harm', 'agents/01 · nodes.py', 'The fix: <em>harmful text is never a requirement</em>', R(`${BRR_SRC}/nodes.py`), 'if scan_injection(md):', { count: 16 }, 'python', 'Agents', [
      'Layer 1: Foundry content filter on the model deployment', 'Layer 2: the extraction prompt says such text is never a requirement', 'Layer 3: <code>scan_harmful()</code> flags it and drops any requirement built from it']),
    dg('d-takes', 'What it takes', 'Your framework decides how it behaves. <em>Foundry decides how it runs.</em>', '0 0 1500 440', D_TAKES),
  ];
}

// ------------------------------------------------------------------ cards
const LOGO = E.LOGO;
const TITLE = `<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s;font-size:64px">Microsoft's agent platform,<br><em>built for real</em></h1><p class="rise" style="animation-delay:.45s">23 LangGraph agents · Microsoft Foundry hosted agents · an architect's view</p>`;
const END = `<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s;font-size:60px">Every box on the slide,<br><em>built for real</em></h1><p class="rise" style="animation-delay:.45s">Synthetic data · fictional organization · a proof of concept</p>`;
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
  const part = async (id, keys, hold = 0) => { await dk('part', id, keys); d.log('whoosh', { soft: true }); await d.wait(hold); };
  const onDeck = async (id) => { d.page = deck; await show(id); await use(deck); };
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

  // Portal navigation on camera (same moves as make_e2e3.js).
  const ready = async (text, ms = 2000) => { await portal.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 90000 }); await E.settle(portal, ms); await E.closeDialogs(portal); await applyLabel(portal); };
  const NAV = { Agents: '/build/agents', Guardrails: '/build/guardrails', Monitor: '/build/observe' };
  const navNew = async (lbl, readyText) => {
    await d.click(portal.locator(`a[aria-label="${lbl}"]:visible`).first(), 750, 0.4);
    try { await ready(readyText); } catch (e) { if (!NAV[lbl]) throw e; console.log('nav fallback', lbl, portal.url().slice(0, 60)); await E.gotoPortal(portal, E.nextgen(NAV[lbl]), readyText); await applyLabel(portal); }
  };
  // A click that lands while the agent page is still hydrating is ignored: retry until the tab's content shows.
  const tab = async (name, readyText) => {
    const t = portal.getByRole('tab', { name, exact: true }).first();
    for (let k = 0; k < 4; k++) {
      await d.click(t, k ? 500 : 700, 0.4);
      if (!readyText) return;
      try { await portal.getByText(readyText, { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 }); break; } catch { console.log('tab retry', name, k + 1); await E.settle(portal, 1500); }
    }
    if (readyText) await ready(readyText, 1500);
  };
  const openBrr = async () => {
    await navNew('Agents', BRR);
    await d.click(portal.getByRole('link', { name: BRR }).first(), 800, 0.6);
    await portal.getByRole('tab', { name: 'Details', exact: true }).first().waitFor({ state: 'visible', timeout: 90000 });
    await portal.getByText('Agent info', { exact: false }).first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
    await E.settle(portal, 2500); await applyLabel(portal);
  };
  const toggleFoundry = async (on) => {
    const sw = portal.locator('[role=switch]').first();
    await d.click(sw, 700, 0.3);
    await portal.waitForTimeout(2500);
    const skip = portal.getByRole('button', { name: 'Continue without feedback' });
    if (await skip.isVisible().catch(() => false)) await d.click(skip, 600, 0.3);
    await E.settle(portal, 5000);
    if (on) {
      const x = portal.locator('[role=dialog]:visible button[aria-label="Close" i], .fui-DialogSurface:visible button[aria-label="Close" i]').first();
      try { await x.waitFor({ state: 'visible', timeout: 12000 }); await d.click(x, 600, 0.4); } catch { /* no dialog */ }
    }
    await E.closeDialogs(portal); await applyLabel(portal);
  };

  // ---------------- 1. Microsoft's picture → View A
  await cardOn(TITLE, 1.2);
  await d.js(() => window.Film.hideCursor(true));
  d.page = deck; await show('s-ms'); await d.uncard(800);
  await d.say('t1'); await d.waitVoice(0.3);
  await setLabel(chap('The whole platform'));
  await show('d-map'); await part('d-map', ['build'], 0.2);
  await d.say('a1'); await d.waitVoice();
  await part('d-map', ['plat', 'graph']); await d.say('a2'); await d.waitVoice();
  await part('d-map', ['dist']); await d.say('a3'); await d.waitVoice();
  await part('d-map', ['unused']); await d.say('a4'); await d.wait(Math.max(1.2, d.voiceLeft() - 4.0)); await part('d-map', ['loop']); await d.waitVoice();
  await part('d-map', ['graph']); await d.say('a5'); await d.wait(Math.max(1.0, d.voiceLeft() - 2.6)); await part('d-map', ['plat']); await d.waitVoice(); await part('d-map', 'all', 0.3);

  // ---------------- 2. View D · inside one agent
  await setLabel(chap('Inside one agent'));
  await show('s-shape');
  await d.say('d1');
  for (const i of [0, 1, 2, 3]) { await dk('light', 's-shape', i); await d.wait(Math.max(0.9, (d.voiceLeft() - 4.0) / (4 - i))); }
  for (const i of [5, 6]) { await dk('light', 's-shape', i); await d.wait(1.4); }
  await d.waitVoice(); await dk('light', 's-shape', 'all'); await d.wait(0.3);
  await show('s-g01');
  await d.say('d2');
  await d.wait(3.0); await dk('mark', 's-g01', ['intake', 'parse', 'retrieve_context', 'normalise', 'self_check', 'assemble', 'apply_edits', 'render', 'propose_publish', 'apply']); await d.wait(1.8);
  await dk('mark', 's-g01', ['extract_section', 'classify', 'analyse_quality', 'gap_analysis']); await d.wait(1.6);
  await dk('mark', 's-g01', ['approve']); await d.waitVoice(); await dk('mark', 's-g01', null);
  await show('s-wiring'); await d.js(() => window.Film.hideCursor(false));
  await d.say('d3');
  await focus('s-wiring', 'g.add_edge("extract_section", "normalise")', 'g.add_edge("gap_analysis", "self_check")', 0.2); await notes('s-wiring', 1, 0.2);
  await d.wait(Math.max(0.6, d.voiceLeft() * 0.45 - 1.0));
  await focus('s-wiring', 'add_conditional_edges("retrieve_context"', 'add_conditional_edges("retrieve_context"', 0.2); await notes('s-wiring', 2, 0.2);
  await d.wait(Math.max(0.6, d.voiceLeft() - 4.0));
  await focus('s-wiring', 'add_conditional_edges("self_check"', 'add_conditional_edges("self_check"', 0.2); await notes('s-wiring', 3, 0.2);
  await d.waitVoice(); await dk('focus', 's-wiring', null);
  await show('s-hitl');
  await d.say('d4');
  await focus('s-hitl', 'def request_approval(', '"""Pause the graph', 0.3); await notes('s-hitl', 1, 0.3);
  await d.wait(Math.max(0.8, d.voiceLeft() - 4.0));
  await focus('s-hitl', 'raw = interrupt(request)', 'raw = interrupt(request)', 0.3); await notes('s-hitl', 2, 0.3);
  await d.waitVoice(); await dk('focus', 's-hitl', null);

  // the portal home goes stale while the slides run: reload it in the background now
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

  // ---------------- 3. View B · repo to running agent
  await setLabel(chap('Repo to running agent'));
  await show('d-deploy'); await part('d-deploy', ['repo'], 0.2);
  await d.say('p1');
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.35)); await part('d-deploy', ['repo', 'build']);
  await d.wait(Math.max(1.5, d.voiceLeft() - 3.2)); await part('d-deploy', ['build', 'yaml']);
  await d.waitVoice();
  await part('d-deploy', ['azd']); await d.say('p2');
  await d.wait(Math.max(1.2, d.voiceLeft() * 0.3)); await part('d-deploy', ['azd', 'cloud']); await d.waitVoice();
  await part('d-deploy', 'all', 0.2);
  await show('s-term'); await dk('term', 's-term', 0);
  await d.say('p3');
  const nLines = deployLines().length;
  for (let i = 1; i <= nLines; i++) { await dk('term', 's-term', i); d.log('key'); await d.wait(Math.min(0.55, Math.max(0.12, (d.voiceLeft() - 1.5) / (nLines - i + 1)))); }
  await d.waitVoice();
  await show('s-yaml');
  await d.say('p4');
  await focus('s-yaml', 'host: azure.ai.agent', 'kind: hosted', 0.2); await notes('s-yaml', 1, 0.2);
  await d.wait(Math.max(0.5, d.voiceLeft() * 0.25)); await focus('s-yaml', 'protocols:', 'version: 2.0.0', 0.2); await notes('s-yaml', 2, 0.2);
  await d.wait(Math.max(0.5, d.voiceLeft() * 0.35)); await focus('s-yaml', 'codeConfiguration:', 'dependencyResolution', 0.2); await notes('s-yaml', 3, 0.2);
  await d.wait(Math.max(0.3, d.voiceLeft() - 2.2)); await focus('s-yaml', 'container:', "memory: 2Gi", 0.2); await notes('s-yaml', 4, 0.2);
  await d.waitVoice(); await dk('focus', 's-yaml', null);
  await show('s-main');
  await d.say('p5');
  await focus('s-main', 'from contoso_agent_core.hosting import serve', 'serve(build_graph)', 0.3); await notes('s-main', 3, 0.8);
  await d.waitVoice(); await dk('focus', 's-main', null);
  await homeLoad;
  await use(portal);
  await d.say('p6');
  await navNew('Agents', BRR);
  for (let i = 0; i < 3; i++) { const t = portal.getByText('Hosted', { exact: true }).nth(i); if (await t.count()) await d.hover(t, 520); }
  await d.hover(portal.getByText('Running', { exact: true }).first(), 600);
  await d.hover(portal.getByText('Version', { exact: true }).first(), 600);
  await d.waitVoice();

  // ---------------- 4. View C · one request, six hops
  await setLabel(chap('One request, six hops'));
  await onDeck('d-req'); await part('d-req', 'all', 0.2);
  await d.say('r1');
  await d.wait(Math.max(1.0, d.voiceLeft() - 3.6)); await part('d-req', ['graph', 'h6']); await d.wait(1.6); await part('d-req', ['h2', 'h3', 'h4', 'h5']);
  await d.waitVoice(); await part('d-req', ['h1', 'h6'], 0.4);
  d.page = lumen; await lumenReset();
  await use(lumen);
  await d.third('<div class="av" style="background:linear-gradient(135deg,#7c5cff,#c757d6)">🔌</div><div><b>Theo</b><span>Integration Architect</span></div>');
  await d.say('r2');
  await openAgent('interface documentation', ICD);
  await attach(['namesearch-openapi.yaml', 'requirements-name-search.md', 'canonical-person.schema.json', 'interface-name-search.json']);
  let n = await send('Draft the interface control document for the Name Search lookup.');
  await d.waitVoice();
  await waitReply(n);
  await lumen.waitForSelector('.approval-card [data-ap-apply]', { timeout: 60000 });
  await d.reveal('.approval-card', 'center', 1.0);
  await d.zoom('.approval-card', 1.4, 1000, 16);
  await d.say('r3');
  await d.wait(Math.max(1.0, d.voiceLeft() - 4.5));
  await d.unzoom(600);
  n = await replies();
  await d.click('.approval-card [data-ap-apply]', 800, 0.6);
  await waitReply(n);
  await d.reveal('.msg.assistant:last-child .md', 'start', 1.0);
  await d.waitVoice();
  await d.third(null);
  await onDeck('d-req'); await part('d-req', ['h2'], 0.2);
  await d.say('r4');
  await d.wait(Math.max(1.5, d.voiceLeft() - 3.6)); await part('d-req', ['h3', 'graph']);
  await d.waitVoice();
  await use(portal);
  await d.say('r5');
  await openBrr();
  await tab('Details', 'Identity & access');
  await E.zoomTo(d, portal.getByText('Identity & access').first().locator('xpath=ancestor::div[.//text()[contains(.,"Entra agent identity")]][1]'), 1.45, 14);
  await d.waitVoice(); await d.unzoom(700);
  await d.say('r6');
  await E.zoomTo(d, portal.getByText('Responses protocol').first().locator('xpath=ancestor::div[.//text()[contains(.,"Endpoint")]][1]'), 1.5, 14);
  await d.hover(portal.getByText('People with Azure RBAC permissions can access').first(), 800);
  await d.waitVoice(); await d.unzoom(700);
  await onDeck('s-llm');
  await d.say('r7');
  await focus('s-llm', 'credential = DefaultAzureCredential()', 'openai_client = project.get_openai_client()', 0.3); await notes('s-llm', 2, 0.6);
  await d.wait(Math.max(0.4, d.voiceLeft() - 2.0)); await focus('s-llm', 'token_provider = get_bearer_token_provider', 'api_key=token_provider', 0.2); await notes('s-llm', 3, 0.2);
  await d.waitVoice(); await dk('focus', 's-llm', null);
  await show('d-req'); await part('d-req', ['h4']);
  await d.say('r8'); await d.waitVoice();
  await use(portal);
  await d.say('r9');
  await navNew('Guardrails', 'Microsoft.DefaultV2');
  await d.click(portal.getByText('Microsoft.DefaultV2', { exact: true }).first(), 800, 1.0);
  await portal.getByText('Indirect prompt injections', { exact: false }).first().waitFor({ timeout: 30000 });
  for (const t of ['Content safety', 'Jailbreak', 'Indirect prompt injections']) await d.hover(portal.getByText(t, { exact: false }).last(), 700);
  await d.waitVoice();
  await onDeck('d-req'); await part('d-req', ['h6'], 0.2);
  await d.say('r10'); await d.waitVoice();
  await part('d-req', ['h5']); await d.say('r11'); await d.waitVoice();
  await use(portal);
  await d.say('r12');
  await openBrr();
  await tab('Traces', 'Trace view');
  // the list opens on "Last Day"; the recorded runs are older, so widen to 7 days as a viewer would
  const traceId = portal.getByText('Trace ID', { exact: false }).first();
  if (!(await traceId.isVisible().catch(() => false))) { await d.click(portal.getByText('7D', { exact: true }).first(), 650, 0.4); }
  await ready('Trace ID', 1500);
  await d.click(portal.locator('[role=row]').nth(1).locator('button').first(), 800, 0.8);
  await portal.getByText('Trajectories', { exact: true }).first().waitFor({ timeout: 60000 });
  await E.settle(portal, 2000);
  for (const t of ['fan_out', 'extract_section', 'chat gpt-5-mini']) { const l = portal.getByText(t, { exact: false }).first(); if (await l.count()) await d.hover(l, 800); }
  await d.waitVoice();
  await portal.keyboard.press('Escape').catch(() => {});
  await d.say('r13');
  await navNew('Monitor', 'Agent runs');
  await E.zoomTo(d, { x: 244, y: 260, width: 1316, height: 198 }, 1.15, 8);
  for (const t of ['Agent runs', 'Total token usage', 'Estimated cost']) await d.hover(portal.getByText(t, { exact: true }).first(), 700);
  await d.waitVoice(); await d.unzoom(700);
  await onDeck('s-lumen');
  await d.say('r14');
  await focus('s-lumen', 'try { built = buildPayload', 'previous_response_id: sessionId', 0.3); await notes('s-lumen', 2, 0.6);
  await d.wait(Math.max(0.5, d.voiceLeft() - 4.0));
  await focus('s-lumen', 'if (approval?.id) {', "input: [{ type: 'mcp_approval_response'", 0.3); await notes('s-lumen', 3, 0.3);
  await d.waitVoice(); await dk('focus', 's-lumen', null);

  // ---------------- 5. View E · the improvement loop
  await setLabel(chap('The improvement loop'));
  await show('d-loop'); await part('d-loop', ['rt'], 0.2);
  await d.say('e1'); await d.waitVoice();
  await use(portal);
  await d.say('e2');
  await toggleFoundry(false);
  await d.click(portal.locator('a[aria-label^="Evaluation"]').first(), 750, 0.4);
  await ready('AI red teaming', 1500);
  await d.click(portal.getByRole('tab', { name: 'AI red teaming' }).first(), 700, 0.4);
  await ready('AI red teaming scans', 1500);
  await d.waitVoice();
  await d.say('e3');
  const before = portal.locator(`a[href*="${E.RT_BEFORE.match(/redteaming\/([0-9a-f-]+)/)[1]}"]`).first();
  await d.click(before, 700, 0.4);
  await ready('Metric dashboard', 2000); await E.dismissBubbles(portal);
  await E.zoomTo(d, portal.getByText('Successful attacks', { exact: true }).first().locator('xpath=ancestor::*[.//text()[contains(.,"Violence")]][1]'), 1.35, 16);
  await d.hover(portal.getByText('1/10 attacks', { exact: false }).first(), 800);
  await d.waitVoice(); await d.unzoom(700);
  await onDeck('d-loop'); await part('d-loop', ['tr', 'fix'], 0.4);
  await show('s-harm');
  await d.say('e4');
  await focus('s-harm', 'harmful = scan_harmful(md)', 'requirement; the functional lead', 0.3);
  await notes('s-harm', 3, Math.max(0.8, d.voiceLeft() / 3 - 0.2));
  await d.waitVoice(); await dk('focus', 's-harm', null);
  await show('d-loop'); await part('d-loop', ['lock', 'v3'], 0.2);
  await d.say('e5');
  await d.wait(Math.max(1.0, d.voiceLeft() - 3.0));
  await use(portal);
  await portal.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await ready('AI red teaming scans', 1500);
  const after = portal.locator(`a[href*="${E.RT_AFTER.match(/redteaming\/([0-9a-f-]+)/)[1]}"]`).first();
  await d.click(after, 700, 0.4);
  await ready('Metric dashboard', 2000); await E.dismissBubbles(portal);
  await E.zoomTo(d, portal.getByText('Successful attacks', { exact: true }).first().locator('xpath=ancestor::*[.//text()[contains(.,"Violence")]][1]'), 1.35, 16);
  await d.waitVoice(); await d.wait(1.0); await d.unzoom(700);
  await onDeck('d-loop'); await part('d-loop', ['rt', 'tr', 'fix', 'lock', 'v3', 'loop', 'icd'], 0.2);
  await d.say('e6'); await d.waitVoice();

  // ---------------- 6. Close: back to View A, then what it takes
  await setLabel(chap('What it takes'));
  await d.js(() => window.Film.hideCursor(true));
  await show('d-map'); await part('d-map', ['build', 'graph'], 0.2);
  await d.say('c1');
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.45)); await part('d-map', ['plat']);
  await d.waitVoice();
  await show('d-takes'); await part('d-takes', ['w3', 'cmd'], 0.2);
  await d.say('c2');
  await d.wait(Math.max(1.5, d.voiceLeft() - 4.5)); await part('d-takes', 'all');
  await d.waitVoice(0.4);
  await setLabel(null);
  await cardOn(END, 0.3);
  await d.say('end'); await d.waitVoice(1.5);
}

// ------------------------------------------------------------------ main
async function main() {
  const deckOnly = args.has('--deck');
  const deckFile = () => buildDeck({ slides: slides(), hljsDir: path.join(ROOT, 'node_modules', '@highlightjs', 'cdn-assets'), out: path.join(WORK, 'deck.html') });
  if (deckOnly) { fs.mkdirSync(WORK, { recursive: true }); console.log('wrote', deckFile()); return; }
  const kit = createKit({ name: NAME, lines: LINES, vo: path.join(FILM, 'vo-e2e4'), work: WORK, out: path.join(FILM, 'out'), musicGain: 0.4 });
  const lengths = kit.makeVoice();
  if (args.has('--voice')) { let total = 0; for (const [k, v] of Object.entries(lengths)) { total += v; console.log(k.padEnd(8), `${v.toFixed(1)}s`); } console.log(`total narration ${total.toFixed(0)}s`); return; }
  if (args.has('--remix')) {
    let { events, frame_list } = JSON.parse(fs.readFileSync(path.join(WORK, 'events.json'), 'utf8'));
    const t0 = events.find((e) => e.kind === 'voice' && e.id === 't1').t - 1.5;
    events = events.filter((e) => e.t >= t0); frame_list = frame_list.filter(([, t]) => t >= t0);
    const res = kit.finish(frame_list, events, { thumbAt: 0.1 });
    if (res?.srt) fs.writeFileSync(res.srt.replace(/\.srt$/, '.vtt'), `WEBVTT\n\n${fs.readFileSync(res.srt, 'utf8').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2')}`, 'utf8');
    return;
  }
  const deckPath = deckFile();
  const server = spawn(process.execPath, [path.join(FILM, 'foundry-server.js'), 'film'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'inherit', 'inherit'] });
  let ctx;
  try {
    await E.waitForServer();
    ctx = await E.edge(false);
    await ctx.addInitScript({ path: path.join(FILM, 'overlay.js') });
    await ctx.addInitScript({ content: E.MASK_JS });
    const deck = await ctx.newPage();
    const pages = { deck };
    for (const k of ['portal', 'lumen']) pages[k] = await ctx.newPage();
    const errors = [];
    deck.on('pageerror', (e) => errors.push(String(e)));
    pages.lumen.on('pageerror', (e) => errors.push(String(e)));
    await deck.goto(`file:///${deckPath.replace(/\\/g, '/')}`);
    await deck.waitForFunction(() => !!window.Deck && !!window.Film);
    await pages.lumen.goto(`http://127.0.0.1:${PORT}/`);
    await pages.lumen.waitForSelector('.greeting', { timeout: 30000 });
    console.log('loading portal pages');
    await E.gotoPortal(pages.portal, E.nextgen('/home'));
    await E.setNewFoundry(pages.portal, true);
    await E.gotoPortal(pages.portal, E.nextgen('/home'), 'Agents');
    console.log('portal pages ready');
    const cap = new E.MultiCapture();
    for (const p of Object.values(pages)) await cap.add(p);
    const d = new kit.Director(deck, lengths);
    const t0 = Date.now();
    try { await runFilm(d, cap, pages); } catch (e) { await d.page.screenshot({ path: path.join(WORK, 'failed.png') }).catch(() => {}); throw e; }
    await cap.stop();
    console.log('page errors', errors, 'took', Math.round((Date.now() - t0) / 1000), 's');
    const res = kit.finish(cap.frames, d.events, { stills: args.has('--stills'), thumbAt: 0.1 });
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
