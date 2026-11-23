// "From 23 agents to 9": the follow-on to "built for real". Why 23 hosted agents were too many, how use cases became
// skills mounted on 9 hosted agents grouped by trust boundary, how a host routes, how the cut-over was proven
// (old vs new on the same cases, red team through the hosts, then retire), Foundry skills for the wording the business
// owns, and continuous improvement in two halves: my pre-release gate plus Foundry's hourly trace evaluation, which
// now scores live traffic with custom rubric evaluators (the same standards the agents load) and code-based ones.
// Then an aside: Microsoft-Decision-1.1, live in its Foundry playground, and the two pilots that tested it against
// the agents' own model (ircc-sdlc-agents/evals/decision_pilot): faster and cheaper, not more accurate. Always test.
//
//   node film/make_e2e5.js --voice       Narration only (Kokoro), with each line's length.
//   node film/make_e2e5.js --deck        Build the slide deck only (film/.work-e2e5/deck.html) to check the diagrams.
//   node film/make_e2e5.js --storyboard  Write the storyboard page (IRCC-info/videos/lumen-23-to-9-storyboard.html).
//   node film/make_e2e5.js               Film and encode film/out/lumen-23-to-9.mp4 + .srt + .vtt + thumbnail.
//   node film/make_e2e5.js --remix       Re-voice and re-encode from the last run's frames.
//   node film/make_e2e5.js --stills      Film, then write a contact sheet instead of encoding.
//
// Uses make_e2e.js's signed-in Edge profile and portal masking; the portal is navigated on camera. No Lumen scenes.
// Real data only: router replies captured from the deployed host (.work-e2e5/routing.json), the old-vs-new comparison
// and the retirement log from the 2026-11-21 cut-over (IRCC-info/foundry-test-deploy/contoso, ircc-sdlc-agents/out).
const fs = require('fs');
const path = require('path');
const { createKit } = require('./filmkit');
const { grab, buildDeck } = require('./code-deck');
const FXK = require('./e2e5-fx');
const E = require('./make_e2e');

const FILM = __dirname;
const ROOT = path.resolve(FILM, '..');
const REPO = E.REPO;
const INFO = path.resolve(REPO, '..');
const DEPLOY = path.join(INFO, 'foundry-test-deploy', 'contoso');
const WORK = path.join(FILM, '.work-e2e5');
const NAME = 'lumen-23-to-9';
const HOST = 'contoso-design-author';
// Foundry evaluators shown in the portal (published by ircc-sdlc-agents/evals/rubric_evaluators.py, 2026-11-22).
const CUSTOM_EVALS = ['Contoso requirements quality', 'Contoso decision-support writing', 'Contoso source fidelity', 'Contoso verbatim excerpts', 'Contoso unsupported identifiers'];
const HOURLY_EVAL = 'continuous-contoso-design-author-v6'; // the hourly rule's eval: built-ins + 2 rubrics + 2 code evaluators
const CODE_READY = 'Foundry code-based evaluator'; // first line on the verbatim-excerpts evaluator's Code tab
const args = new Set(process.argv.slice(2));

// ------------------------------------------------------------------ narration: [spoken, caption]
const L = (spoken, caption = spoken) => [spoken, caption];
const LINES = {
  t1: L('Last time, I built twenty three agents on Microsoft Foundry. Each one hosted, with its own identity, endpoint, evaluations and red teaming.',
    'Last time, I built 23 agents on Microsoft Foundry. Each one hosted, with its own identity, endpoint, evaluations and red teaming.'),
  t2: L('Then I asked the question I should have asked first. Did each of these really need to be an agent?'),
  b1: L('Every use case on the list became its own agent. Twenty three deployments, twenty three identities, twenty three things to secure, test and watch.',
    'Every use case on the list became its own agent. 23 deployments, 23 identities, 23 things to secure, test and watch.'),
  b2: L('The list itself had a hint. Fourteen of the twenty three were marked as skills, or skill first. I built them all as agents anyway.',
    'The list itself had a hint. 14 of the 23 were marked as skills, or skill-first. I built them all as agents anyway.'),
  b3: L('Then the code. Six agents run the same document pipeline. Draft by section, check citations, render, and ask to publish. Only the template and the checks differ.',
    'Then the code. Six agents run the same document pipeline: draft by section, check citations, render, and ask to publish. Only the template and the checks differ.'),
  b4: L('Seven agents each built their own question and answer mode. Five are really batch jobs, on a timer or a webhook. And one, schema mapping, is a tool that another agent already calls.',
    'Seven agents each built their own Q&A mode. Five are really batch jobs, on a timer or a webhook. And one, schema mapping, is a tool that another agent already calls.'),
  s1: L("So I split two ideas. This is my rule of thumb, not a Foundry definition. The hosted agent is the who. In Foundry, that is a running service with its own Entra identity and permissions, a stable endpoint with the protocols set for that deployment, a defined boundary for its sessions and paused work, and its own deployments and versions. And by agent, I mean that deployed service, not a persona in a coding tool. That matters, because the hosted agent is also a security and operational boundary.",
    "So I split two ideas. This is my rule of thumb, not a Foundry definition. The hosted agent is the who. In Foundry, that's a running service with its own Entra identity and permissions, a stable endpoint with the protocols set for that deployment, a defined boundary for its sessions and paused work, and its own deployments and versions. And by agent, I mean that deployed service, not a persona in a coding tool. That matters, because the hosted agent is also a security and operational boundary."),
  s1b: L("None of those settings say which business job it does. They say who is acting, and what it is allowed to touch.",
    "None of those settings say which business job it does. They say who is acting, and what it is allowed to touch."),
  s2: L("A skill is the what: a traceable business capability. Take requirements refinement. Its graph parses the document, extracts requirements section by section, checks them, renders the result, and asks for approval. It has its own prompts, checks, reviewers and tests. But no identity. When it calls the model, it does so as the host it runs on.",
    "A skill is the what: a traceable business capability. Take requirements refinement. Its graph parses the document, extracts requirements section by section, checks them, renders the result, and asks for approval. It has its own prompts, checks, reviewers and tests. But no identity. When it calls the model, it does so as the host it runs on."),
  s3: L('If you have built web apps, you know this shape. One app has one address, one managed identity and one configuration, and many routes. The host is the app. Each skill is a route, and the router picks it.',
    "If you've built web apps, you know this shape. One app has one address, one managed identity and one configuration, and many routes. The host is the app. Each skill is a route, and the router picks it."),
  s3b: L("Before, those five design skills were five agents, with five identities. But every one had the same permissions, the same data and the same callers. Separate identities bought no real isolation here, just five identities and their role assignments to run. If one had needed different access, it would have stayed its own agent.",
    "Before, those five design skills were five agents, with five identities. But every one had the same permissions, the same data and the same callers. Separate identities bought no real isolation here, just five identities and their role assignments to run. If one had needed different access, it would have stayed its own agent."),
  s4: L("Group the skills by trust and operational boundary, and twenty three agents become nine. Six that people chat with, and three that run jobs.",
    "Group the skills by trust and operational boundary, and 23 agents become 9: six that people chat with, and three that run jobs."),
  s4b: L("There are really two security boundaries here. Endpoint authorization decides who may call a host. The host's Entra identity decides what it can reach downstream. Skills can share a host only when both still make sense for every one of them.",
    "There are really two security boundaries here. Endpoint authorization decides who may call a host. The host's Entra identity decides what it can reach downstream. Skills can share a host only when both still make sense for every one of them."),
  s5: L("In my design, security and architecture keep their own encrypted workflow state. And nothing that writes to the backlog shares an identity with security work.",
    "In my design, security and architecture keep their own encrypted workflow state. And nothing that writes to the backlog shares an identity with security work."),
  s6: L('Some skills sit on two hosts. The status report runs in chat when you ask for it, and on a timer every Thursday. Same code, different front door.'),
  s7: L("So the rule of thumb. New behaviour usually means a new skill. A different identity, caller, data, state, protocol, scaling or compliance boundary may mean a new agent.",
    "So the rule of thumb: new behaviour usually means a new skill. A different identity, caller, data, state, protocol, scaling or compliance boundary may mean a new agent."),
  s8: L("The diagram was cleaner. But consolidation also means a bigger shared blast radius. Fewer deployments did not make it safe, so I had to prove it.",
    "The diagram was cleaner. But consolidation also means a bigger shared blast radius. Fewer deployments didn't make it safe, so I had to prove it."),
  f1: L("At this point the runtime was consolidated. But I found a second duplication problem. The business standards were still copied into prompts across several Python skills. Those standards have their own owners and their own release cadence. They needed a governed home of their own. That is where Foundry skills came in.",
    "At this point the runtime was consolidated. But I found a second duplication problem. The business standards were still copied into prompts across several Python skills. Those standards have their own owners and their own release cadence. They needed a governed home of their own. That's where Foundry skills came in."),
  f1b: L("A Foundry skill is a versioned bundle built around a skill dot M D manifest. It can hold instructions, scripts, reference files and other resources. It is stored in the project, with immutable versions you can roll back.",
    "A Foundry skill is a versioned bundle built around a SKILL.md manifest. It can hold instructions, scripts, reference files and other resources. It's stored in the project, with immutable versions you can roll back."),
  f2: L("Mine are Python packages: a graph, its prompts, checks and tests. Here, I use Foundry skills for the reusable instructions the business owns. My Python skills are the executable workflows.",
    "Mine are Python packages: a graph, its prompts, checks and tests. Here, I use Foundry skills for the reusable instructions the business owns. My Python skills are the executable workflows."),
  f2b: L("So there are three layers. The hosted agent is the deployment boundary. The Python skill is the executable workflow. The Foundry skill carries the business owned instructions. Keeping them apart lets each one change at its own pace.",
    "So there are three layers. The hosted agent is the deployment boundary. The Python skill is the executable workflow. The Foundry skill carries the business-owned instructions. Keeping them apart lets each one change at its own pace."),
  f2c: L("Foundry skills follow the open Agent Skills convention, built around skill dot M D, so the same package can work in compatible coding agents too. A coding subagent and a skill are different things. The portable part is the skill.",
    "Foundry skills follow the open Agent Skills convention, built around SKILL.md, so the same package can work in compatible coding agents too. A coding subagent and a skill are different things. The portable part is the skill."),
  f3: L("So which wording moved? The wording the business owns. My prompts hold three kinds of text.",
    "So which wording moved? The wording the business owns. My prompts hold three kinds of text."),
  f4: L('Standards the business owns. How Contoso writes requirements, user stories, and plain English. Those moved into three Foundry skills, each with an owner.',
    'Standards the business owns: how Contoso writes requirements, user stories, and plain English. Those moved into three Foundry skills, each with an owner.'),
  f5: L("Rules the code checks stayed in code. The source excerpt must be verbatim, untrusted text is only data, claims are cited, and nothing harmful becomes a requirement. I did not want hard safety rules governed only as instruction text. Whoever can publish or promote a skill version could change them outside code review.",
    "Rules the code checks stayed in code: the source excerpt must be verbatim, untrusted text is only data, claims are cited, and nothing harmful becomes a requirement. I didn't want hard safety rules governed only as instruction text. Whoever can publish or promote a skill version could change them outside code review."),
  f6: L("In a prompt, it is one line. The standard comes first, then the checked rules, and the wrapper tells the model to follow those rules if the two conflict. But I do not rely on that ordering. The code checks the rules again.",
    "In a prompt, it's one line. The standard comes first, then the checked rules, and the wrapper tells the model to follow those rules if the two conflict. But I don't rely on that ordering. The code checks the rules again."),
  f7: L('In Foundry, under Tools, Skills. The three standards, at version one. Open one, and there is the text a functional lead can own.',
    "In Foundry, under Tools, Skills: the three standards, at version 1. Open one, and there's the text a functional lead can own."),
  f8: L('Agent Framework agents let the model decide when to load a skill. My graph already knows which step needs which standard, so it loads it directly, through the same Skills API.'),
  f9: L('Production pins the version, so behaviour only changes on a deploy. Downloaded text is checked, there is a bundled copy if Foundry is unreachable, and every load is audited with its version.',
    "Production pins the version, so behaviour only changes on a deploy. Downloaded text is checked, there's a bundled copy if Foundry is unreachable, and every load is audited with its version."),
  f10: L('Then it went live. Three skills published, nine hosts redeployed. And in the traces, each prompt carries its standard at version one, straight from Foundry, with no fallbacks.',
    'Then it went live. Three skills published, 9 hosts redeployed. And in the traces, each prompt carries its standard at version 1, straight from Foundry, with no fallbacks.'),
  h1: L('Inside a host, the graph is tiny. One router, one node per skill, and a node that asks when it is not sure.',
    "Inside a host, the graph is tiny: one router, one node per skill, and a node that asks when it isn't sure."),
  h2: L('The router tries the cheap things first. A skill name in the request, then an old agent name, so existing callers keep working, then a use case number. Only plain chat goes to a small model.',
    'The router tries the cheap things first: a skill name in the request, then an old agent name, so existing callers keep working, then a use case number. Only plain chat goes to a small model.'),
  h3: L('And if the model is not confident, the host asks you, instead of guessing.', "And if the model isn't confident, the host asks you, instead of guessing."),
  h4: L("Each skill's original graph is mounted unchanged, as a stateful subgraph. Its state survives between turns. When it reaches an approval, that conversation's run is saved and waits for the decision. Other sessions on the host carry on.",
    "Each skill's original graph is mounted unchanged, as a stateful subgraph. Its state survives between turns. When it reaches an approval, that conversation's run is saved and waits for the decision. Other sessions on the host carry on."),
  h5: L('Here is that router, live in Foundry. A plain request with a document goes to requirements refinement. A vague one gets the list of skills back.'),
  h6: L("Registering an existing graph as a skill is about ten lines. A name, its use case number, the agent it used to be, and its graph. The real work was proving it could safely share the host.",
    "Registering an existing graph as a skill is about ten lines: a name, its use case number, the agent it used to be, and its graph. The real work was proving it could safely share the host."),
  x1: L("One thing changes when skills share an agent. The deployment boundary no longer keeps their work apart. So state, settings and traces carry every dimension that matters: the conversation, its run, and now the skill. The running skill also sets its own phase, so a read only skill still cannot write, even on a host where another skill can. Otherwise two skills, or two users, could mix their work on one host.",
    "One thing changes when skills share an agent. The deployment boundary no longer keeps their work apart. So state, settings and traces carry every dimension that matters: the conversation, its run, and now the skill. The running skill also sets its own phase, so a read-only skill still can't write, even on a host where another skill can. Otherwise two skills, or two users, could mix their work on one host."),
  x2: L("In return, my host calls sibling skills directly, in process. The status report now calls schedule variance without the network hop, endpoint or extra role the old deployment needed.",
    "In return, my host calls sibling skills directly, in process. The status report now calls schedule variance without the network hop, endpoint or extra role the old deployment needed."),
  c1: L('Then the cut over. The nine hosts went up next to the old twenty three, in nine minutes.', 'Then the cut-over. The 9 hosts went up next to the old 23, in nine minutes.'),
  c2: L('In Foundry, nine hosted agents, and each description lists its skills.', 'In Foundry, 9 hosted agents, and each description lists its skills.'),
  c3: L('Before deleting anything, the same test case went to each old agent and to its new host. Twenty two of twenty two scored the same, or better. The one error came from a content filter, and the old agent failed it too.',
    'Before deleting anything, the same test case went to each old agent and to its new host. 22 of 22 scored the same, or better. The one error came from a content filter, and the old agent failed it too.'),
  c4: L("Then the red team again, now through the hosts, so the router was under attack as well. Two hundred and forty attacks. None succeeded. Behaviour and security both held.",
    "Then the red team again, now through the hosts, so the router was under attack as well. 240 attacks. None succeeded. Behaviour and security both held."),
  c5: L('Only then were the old agents deleted. Their role assignments went with them, along with twenty three orphaned ones from an earlier build. Forty seven assignments, down to ten.',
    'Only then were the old agents deleted. Their role assignments went with them, along with 23 orphaned ones from an earlier build. 47 assignments, down to 10.'),
  i1: L('Last time, I said Foundry had built in continuous improvement that I had not tried. Now I have. The loop has two halves.',
    "Last time, I said Foundry had built-in continuous improvement that I hadn't tried. Now I have. The loop has two halves."),
  i2: L('Before release, my gate. Test cases with exact checks, and red teaming with attacks hidden inside documents. Those found the real bugs.'),
  i3: L("After release, I set Foundry to sample recent traces every hour and score them with judge models. It can also evaluate continuously as responses complete. Hourly was my choice. The built in evaluators cover task adherence, intent resolution, and safety.",
    "After release, I set Foundry to sample recent traces every hour and score them with judge models. It can also evaluate continuously as responses complete. Hourly was my choice. The built-in evaluators cover task adherence, intent resolution and safety."),
  i4: L('On the agent\'s Evaluation tab, those are the recurring runs.', "On the agent's Evaluation tab, those are the recurring runs."),
  i5: L('And the scores land on the Monitor tab, next to runs, tokens and cost.'),
  r1: L("But the built in judges know generic quality, not Contoso's. So the same business standard now does two jobs. It tells the skill what good looks like. And it is the rubric the evaluator scores live traffic against. The rules my code checks became code based evaluators.",
    "But the built-in judges know generic quality, not Contoso's. So the same business standard now does two jobs. It tells the skill what good looks like. And it's the rubric the evaluator scores live traffic against. The rules my code checks became code-based evaluators."),
  r2: L('In Foundry, under Evaluations, the Evaluator catalog. Microsoft\'s built in evaluators, and five of mine, marked custom.',
    "In Foundry, under Evaluations, the Evaluator catalog: Microsoft's built-in evaluators, and five of mine, marked custom."),
  r3: L('Open requirements quality. It is a rubric. Eight dimensions, each with a weight, that a judge model scores from one to five. Keep the scope of the source. One requirement per need. Flag vague terms, with a question for the business owner.',
    "Open requirements quality. It's a rubric: eight dimensions, each with a weight, that a judge model scores from 1 to 5. Keep the scope of the source. One requirement per need. Flag vague terms, with a question for the business owner."),
  r3b: L("That score is still a model's judgment, not ground truth. I check the rubric against labelled examples, and anything I can verify exactly stays a code check.",
    "That score is still a model's judgment, not ground truth. I check the rubric against labelled examples, and anything I can verify exactly stays a code check."),
  r4: L('Two of mine are code based, in preview. No judge model, just Python. They are the exact checks from my release gate. Excerpts must be quoted word for word, and an interface document cannot invent an endpoint or a status code.',
    "Two of mine are code-based, in preview. No judge model, just Python. They're the exact checks from my release gate: excerpts must be quoted word for word, and an interface document can't invent an endpoint or a status code."),
  r5: L("The hourly rule runs them next to the built in evaluators. Each rubric comes back with a pass or fail and a score. And for every dimension, a score and a written reason. That is more detail than the built in evaluators I was using here.",
    "The hourly rule runs them next to the built-in evaluators. Each rubric comes back with a pass or fail and a score. And for every dimension, a score and a written reason. That's more detail than the built-in evaluators I was using here."),
  i8: L('Every result is attached to its trace, too. Open one, and there is the host, the router and the skill\'s steps, with the evaluation results beside them.',
    "Every result is attached to its trace, too. Open one, and there's the host, the router and the skill's steps, with the evaluation results beside them."),
  i9: L("And that closes the loop. A low score points at a real trace. I review it. If it is a real failure or an important edge case, it becomes a new labelled golden case, and the fix goes back through my gate before it is redeployed.",
    "And that closes the loop. A low score points at a real trace. I review it. If it's a real failure or an important edge case, it becomes a new labelled golden case, and the fix goes back through my gate before it's redeployed."),
  // Aside: the decision model, tested (evals/decision_pilot, 2026-11-22)
  d1: L("Before the takeaways, one related aside. Breaking the agents into skills showed me something else. Not every step inside a skill needs a generative model. Some only need a bounded decision. Decision models are getting a lot of attention, and Microsoft's Decision one point one just went generally available in Foundry. It makes bounded decisions instead of writing text: yes or no, which allowed option, or where something sits on a scale. And it returns probabilities I can use as an uncertainty signal. The claims are bold: much faster and much cheaper than a general model, for routing, classifying and checking.",
    "Before the takeaways, one related aside. Breaking the agents into skills showed me something else. Not every step inside a skill needs a generative model. Some only need a bounded decision. Decision models are getting a lot of attention, and Microsoft's Decision-1.1 just went generally available in Foundry. It makes bounded decisions instead of writing text: yes or no, which allowed option, or where something sits on a scale. And it returns probabilities I can use as an uncertainty signal. The claims are bold: much faster and much cheaper than a general model, for routing, classifying and checking."),
  d2: L("It's already deployed in my project, next to the agents' model. And it has its own playground. You give it the evidence, and the decisions you want made. It gives you back structured probabilities. No generated answer, and no written reasons.",
    "It's already deployed in my project, next to the agents' model. And it has its own playground. You give it the evidence, and the decisions you want made. It gives you back structured probabilities. No generated answer, and no written reasons."),
  d3: L('Here\'s a real case from my link judge. The requirement: email the applicant when the status changes. The candidate: an email template branding refresh. Same word, different behaviour. Does it implement the requirement?',
    "Here's a real case from my link judge. The requirement: email the applicant when the status changes. The candidate: an email template branding refresh. Same word, different behaviour. Does it implement the requirement?"),
  d4: L('A low probability. Correctly, a no. Now swap in the story that really does email the applicant, and run it again.'),
  d4b: L('Close to certain. A couple of output tokens, back in seconds. No essay, no reasoning. Just a number you can act on.'),
  d5: L('So where exactly did I try it? Inside two real agent flows. In the backlog agent, the requirements traceability skill has one step that asks a model: does this work item implement this requirement? In the evidence job, the CAE evidence skill has one step that sorts each artifact into direct, supporting, or not evidence. I swapped only that step\'s model. Everything around it stayed the same: the inputs, the code checks after it, and the human approval.',
    "So where exactly did I try it? Inside two real agent flows. In the backlog agent, the requirements traceability skill has one step that asks a model: does this work item implement this requirement? In the evidence job, the CAE evidence skill has one step that sorts each artifact into direct, supporting, or not evidence. I swapped only that step's model. Everything around it stayed the same: the inputs, the code checks after it, and the human approval."),
  d5b: L("And there's a third contender. G P T six Luna is in my project too, and I'd heard it's cheaper and faster than G P T five mini. Luna is a general chat model, not a decision model. So, three models on the same two steps: today's, Luna, and Decision one point one.",
    "And there's a third contender. gpt-6-luna is in my project too, and I'd heard it's cheaper and faster than gpt-5-mini. Luna is a general chat model, not a decision model. So, three models on the same two steps: today's, Luna, and Decision-1.1."),
  d5c: L("The first surprise came before a single result. Luna refused my agents' settings. Every agent asks for temperature zero, to keep answers as consistent as possible. Luna only accepts one. Swap it in blind, and every call fails. To test it fairly, I ran it at one, three times.",
    "The first surprise came before a single result. Luna refused my agents' settings. Every agent asks for temperature 0, to keep answers as consistent as possible. Luna only accepts 1. Swap it in blind, and every call fails. To test it fairly, I ran it at 1, three times."),
  d6: L("Then the race, in real time. The median per requirement. Decision one point one is done in about two seconds. Luna in under seven. G P T five mini takes twelve. And the output volume: under a hundred output tokens, against nine thousand, against almost twenty thousand.",
    "Then the race, in real time: the median per requirement. Decision-1.1 is done in about 2 seconds. Luna in under 7. gpt-5-mini takes 12. And the output volume: under a hundred output tokens, against 9,000, against almost 20,000."),
  d6b: L("A word on scale. This tests my workload, not models in general. Forty eight link pairs and sixty evidence pairs, all synthetic, labelled with my AI coding assistant, not by a subject matter expert. Accuracy is the share that matched those labels. Luna's ranges are across its three runs.",
    "A word on scale. This tests my workload, not models in general: 48 link pairs and 60 evidence pairs, all synthetic, labelled with my AI coding assistant, not by a subject-matter expert. Accuracy is the share that matched those labels. Luna's ranges are across its three runs."),
  d7: L('Now accuracy. On links, Luna was the best, ninety six to ninety eight percent, with no traps. Decision one point one tied G P T five mini at ninety four, but missed three partial matches. On security evidence, G P T five mini won at ninety three. Luna got ninety to ninety two. And Decision one point one twice called something direct evidence when it wasn\'t.',
    "Now accuracy. On links, Luna was the best, 96 to 98%, with no traps. Decision-1.1 tied gpt-5-mini at 94%, but missed three partial matches. On security evidence, gpt-5-mini won at 93%. Luna got 90 to 92%. And Decision-1.1 twice called something direct evidence when it wasn't."),
  d8: L("Two twists. On evidence, six of Decision one point one's seven mistakes fell below the zero point eight threshold I set before the run. Both chat models were confident even when they were wrong. And combining them, Decision one point one first, and only its unsure answers to Luna, averaged ninety three percent on evidence. A tie with today's model, with one chat call instead of three.",
    "Two twists. On evidence, six of Decision-1.1's seven mistakes fell below the 0.8 threshold I set before the run. Both chat models were confident even when they were wrong. And combining them, Decision-1.1 first, and only its unsure answers to Luna, averaged 93% on evidence. A tie with today's model, with one chat call instead of three."),
  d9: L('So what changed in production? Nothing, yet. A cheaper model that rejects my settings. A faster one that isn\'t more accurate on its own. And a combination that only ties. The hype is real, and so are the benchmarks. But on my agents and my data, the answers were different. Always test. Don\'t assume.',
    "So what changed in production? Nothing, yet. A cheaper model that rejects my settings. A faster one that isn't more accurate on its own. And a combination that only ties. The hype is real, and so are the benchmarks. But on my agents and my data, the answers were different. Always test. Don't assume."),
  d10: L("That's the end of the aside. One test won't change my production models. But it taught the same lesson that took me from twenty three agents to nine: use the right abstraction for the job.",
    "That's the end of the aside. One test won't change my production models. But it taught the same lesson that took me from 23 agents to 9: use the right abstraction for the job."),
  k1: L("So, back to the main story. What did I learn from rebuilding this? The biggest lesson was not that twenty three agents became nine. It is that the use case list should not dictate the deployment architecture. I still have twenty three traceable capabilities. But the deployment boundaries now follow identity, callers, permissions, state, protocol and how each one runs.",
    "So, back to the main story. What did I learn from rebuilding this? The biggest lesson wasn't that 23 agents became 9. It's that the use case list shouldn't dictate the deployment architecture. I still have 23 traceable capabilities. But the deployment boundaries now follow identity, callers, permissions, state, protocol and how each one runs."),
  k2: L('Keep every use case traceable, as a skill with its own tests. Put the wording the business owns in Foundry skills, and score live traffic against that same wording. Keep the rules your code checks in code. And add Foundry\'s monitoring to your own release gate. Don\'t replace it.',
    "Keep every use case traceable, as a skill with its own tests. Put the wording the business owns in Foundry skills, and score live traffic against that same wording. Keep the rules your code checks in code. And add Foundry's monitoring to your own release gate. Don't replace it."),
  k3: L("A use case is not necessarily an agent. A behaviour is not necessarily a deployment. A business instruction is not necessarily code. And a decision is not necessarily a generative task. Use the right abstraction at each layer.",
    "A use case isn't necessarily an agent. A behaviour isn't necessarily a deployment. A business instruction isn't necessarily code. And a decision isn't necessarily a generative task. Use the right abstraction at each layer."),
  end: L("Twenty three use cases. Twenty three skills. Nine hosts. One evaluation loop.",
    "23 use cases. 23 skills. 9 hosts. One evaluation loop."),
};

// ------------------------------------------------------------------ diagram helpers (SVG for code-deck diagram slides)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function B(k, cls, x, y, w, h, title, lines = [], { faded = false, lh = 26, ty = 36 } = {}) {
  return `<g data-k="${k}"${faded ? ' class="faded"' : ''}><rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>`
    + `<text class="t" x="${x + 20}" y="${y + ty}">${esc(title)}</text>`
    + lines.map((l, i) => `<text class="m" x="${x + 20}" y="${y + ty + 30 + i * lh}">${esc(l)}</text>`).join('') + '</g>';
}
const A = (k, d, label, lx, ly) => `<g data-k="${k}"><path class="ln2" d="${d}" marker-end="url(#MARKER)"/>${label ? `<text class="s" x="${lx}" y="${ly}">${esc(label)}</text>` : ''}</g>`;
const T = (x, y, cls, text, anchor = 'start') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(text)}</text>`;
const G = (k, inner) => `<g data-k="${k}">${inner}</g>`;

// View 1 · the 23 agents, coloured by what the code review found
const UC = [
  ['00', 'Knowledge layer', 'qa'], ['01', 'Requirements', 'doc'], ['02', 'Functional design', 'doc'], ['03', 'Traceability', 'qa'],
  ['04', 'Technical design', 'doc'], ['05', 'Story writing', 'rest'], ['06', 'Plan Q&A', 'qa'], ['07', 'ADO → plan progress', 'job'],
  ['08', 'Status report', 'rest'], ['09', 'RAID capture', 'rest'], ['10', 'Schedule variance', 'job'], ['11', 'Interface docs', 'doc'],
  ['12', 'Schema mapping', 'tool'], ['13', 'Delivery scenario', 'rest'], ['14', 'Control mapping', 'rest'], ['15', 'Security docs', 'doc'],
  ['16', 'CAE evidence', 'job'], ['17', 'Architecture review', 'rest'], ['18', 'ADRs', 'doc'], ['19', 'Gate pack', 'rest'],
  ['20', 'Publishing freshness', 'job'], ['21', 'Backlog Q&A', 'qa'], ['22', 'Tech inventory', 'job'],
];
const QA = new Set(['00', '03', '06', '07', '20', '21', '22']);
const SKILLISH = new Set(['01', '02', '04', '11', '12', '15', '18', '05', '06', '09', '10', '13', '14', '19']);
const CLS = { doc: 'md', qa: 'py', job: 'pl', tool: 'wa', rest: 'bx' };
function dBefore() {
  const out = [];
  out.push(G('cat', `<rect x="20" y="8" width="1460" height="54" rx="27" fill="rgba(255,176,143,.10)" stroke="#ffb08f" stroke-width="1.4"/>${T(750, 43, 's', 'The client\'s catalogue: 9 marked "AI agent" · 7 "AI skill" · 7 "skill-first"  →  14 of 23 were skills on paper', 'middle')}`));
  UC.forEach(([n, name, k], i) => {
    const col = i % 6; const row = Math.floor(i / 6); const x = 20 + col * 245; const y = 84 + row * 132;
    out.push(B(k, CLS[k], x, y, 230, 116, `${n}`, [name], { ty: 40 }));
    if (QA.has(n)) out.push(G('qa', `<rect x="${x + 150}" y="${y + 14}" width="64" height="28" rx="14" fill="rgba(63,197,182,.28)" stroke="rgba(63,197,182,.9)"/>${T(x + 182, y + 34, 's', 'Q&A', 'middle')}`));
    if (SKILLISH.has(n)) out.push(G('cat', `<circle cx="${x + 64}" cy="${y + 31}" r="7" fill="#ffb08f"/>`));
  });
  out.push(`<g data-k="doc"><rect x="20" y="618" width="300" height="40" rx="10" class="md"/>${T(36, 645, 's', 'document pipeline ×6')}</g>`);
  out.push(`<g data-k="qa"><rect x="336" y="618" width="300" height="40" rx="10" class="py"/>${T(352, 645, 's', 'own Q&A mode ×7')}</g>`);
  out.push(`<g data-k="job"><rect x="652" y="618" width="300" height="40" rx="10" class="pl"/>${T(668, 645, 's', 'really a batch job ×5')}</g>`);
  out.push(`<g data-k="tool"><rect x="968" y="618" width="300" height="40" rx="10" class="wa"/>${T(984, 645, 's', 'really a tool ×1')}</g>`);
  out.push(`<g data-k="cat">${T(1290, 645, 's', '● skill on paper')}</g>`);
  return out.join('');
}

const D_SPLIT = [
  B('who', 'ac', 20, 20, 640, 400, 'Hosted agent = the WHO', ['Entra identity: calls the model, ADO, SharePoint', 'RBAC: what it may touch, who may call it', 'endpoint: protocols set per deployment', 'state: its sessions and paused work', 'deployment + versions: one container'], { lh: 44 }),
  A('mount', 'M662 220 H836', 'a host mounts skills', 670, 204),
  B('what', 'md', 840, 20, 640, 400, 'Skill = the WHAT · e.g. brd (01)', ['graph: parse → extract → check', '  → render → ask for approval', 'prompts · checks · reviewer group', 'golden tests + evals', 'no identity of its own:', '  runs as the host it is on'], { lh: 44 }),
  B('none', 'bx', 20, 450, 1460, 70, 'My rule of thumb, not a Foundry definition: the host\'s settings say who acts and what it may touch', [], { ty: 44 }),
].join('');

const chips = (k, x, y, names, cls) => names.map((n, i) => `<g data-k="${k}"><rect class="${cls}" x="${x + i * 128}" y="${y}" width="118" height="40" rx="10"/>${T(x + i * 128 + 59, y + 27, 's', n, 'middle')}</g>`).join('');
const D_ANALOGY = [
  B('app', 'bx', 20, 20, 620, 250, 'One web app', ['one address · one managed identity', 'one configuration', '', 'many routes:']),
  chips('app', 40, 200, ['/orders', '/invoices', '/reports'], 'bx'),
  A('same', 'M642 145 H776', 'same shape', 662, 128),
  B('host', 'ac', 780, 20, 700, 250, 'One hosted agent: design-author', ['one endpoint · one Entra identity', 'one state boundary', '', 'many skills:']),
  chips('host', 800, 200, ['brd', 'fdd', 'tdd', 'icd', 'schema_map'], 'md'),
  G('flow', `<rect x="20" y="300" width="1460" height="120" rx="14" class="py"/>${T(44, 340, 't', 'One request')}`
    + T(44, 378, 'm', '{"skill": "brd", ...} → route → run_brd (the old agent\'s graph, unchanged) → reply')
    + T(44, 406, 'm', 'the model is called as contoso-design-author: the host\'s identity, not the skill\'s')),
  B('before', 'wa', 20, 450, 1460, 70, 'Before: 5 agents · 5 identities · same access, data and callers. No real isolation, just more to run.', [], { ty: 44 }),
].join('');

const D_FVS = [
  B('fs', 'pl', 20, 20, 700, 430, 'Foundry skill', ['a versioned bundle: SKILL.md +', '  scripts, references, resources', 'stored in the Foundry project', 'immutable versions, rollback', 'agent framework: the model', '  decides when to load it', '', 'here: governed business instructions'], { lh: 40 }),
  B('mine', 'md', 780, 20, 700, 430, 'My skill', ['a Python package', 'LangGraph graph + prompts', 'checks + golden tests', 'decides the STEPS it TAKES', 'mostly plain Python; the model', '  only at specific steps', '', 'here: the executable workflow'], { lh: 40 }),
  G('meet', `<rect x="20" y="470" width="1460" height="60" rx="30" fill="rgba(255,176,143,.12)" stroke="#ffb08f"/>${T(750, 508, 's', 'Three layers: hosted agent · Python skill · Foundry skill', 'middle')}`),
].join('');

const D_MOVE = [
  B('std', 'py', 20, 20, 470, 330, 'Standards the business owns', ['how Contoso writes:', '  requirements', '  user stories', '  plain English', '', '→ Foundry skills'], { lh: 38 }),
  B('rules', 'wa', 515, 20, 470, 330, 'Rules the code checks', ['excerpt must be verbatim', 'untrusted text is data', 'every claim is cited', 'nothing harmful', '', '→ stay in code'], { lh: 38 }),
  B('mech', 'bx', 1010, 20, 470, 330, 'Mechanics', ['output field names', '$variables', 'flag lists', '', '', '→ stay in code'], { lh: 38 }),
  B('skills', 'py', 20, 380, 470, 130, 'contoso-requirements-standard', ['functional leads · used by 01']),
  B('skills', 'py', 515, 380, 470, 130, 'contoso-user-story-standard', ['product owners · used by 05']),
  B('skills', 'py', 1010, 380, 470, 130, 'contoso-writing-style', ['PMO + architects · 08, 10–15']),
].join('');

const D_LOAD = [
  B('af', 'pl', 20, 20, 700, 300, 'Agent Framework agent', ['skill names + descriptions', '  go in the system prompt', 'the MODEL calls load_skill(name)', '  when it decides it is relevant', '', '"progressive disclosure"'], { lh: 38 }),
  B('mine', 'md', 780, 20, 700, 300, 'My LangGraph host', ['the GRAPH knows the step:', '  extract_section needs', '  contoso-requirements-standard', 'loads it directly, pinned v1', '', 'same Skills API'], { lh: 38 }),
  B('gov', 'ac', 20, 350, 1460, 140, 'Governance', ['pinned versions · checked text (name, size, injection) · bundled fallback · every load audited with its version', 'a wording change → new prompt_version → evals compare before and after']),
].join('');

const HOSTS = [
  // key, cls, title, skills lines, tags
  ['chat', 'ac', 'contoso-knowledge', ['knowledge 00', 'freshness 20', 'inventory 22'], 'cosmos'],
  ['chat', 'ac', 'contoso-design-author', ['brd 01 · fdd 02', 'tdd 04 · icd 11', 'schema_map 12'], ''],
  ['chat', 'ac', 'contoso-backlog', ['stories 05', 'backlog 21', 'traceability 03'], ''],
  ['chat', 'ac', 'contoso-delivery-planning', ['plan_qa 06', 'progress 07', 'variance 10', 'scenario 13', 'status_report 08', 'raid 09'], ''],
  ['chat', 'ac', 'contoso-security', ['sctm 14', 'sdd 15'], 'cosmos'],
  ['chat', 'ac', 'contoso-architecture', ['arch_review 17', 'adr 18', 'gate_pack 19'], 'cosmos'],
  ['jobs', 'pl', 'contoso-knowledge-jobs', ['knowledge 00 · freshness 20', 'inventory 22'], 'cosmos'],
  ['jobs', 'pl', 'contoso-planning-jobs', ['progress 07 · status_report 08', 'variance 10'], ''],
  ['jobs', 'pl', 'contoso-evidence-job', ['evidence 16'], 'cosmos'],
];
function dAfter() {
  const out = [T(20, 30, 'tag', 'CHAT · RESPONSES PROTOCOL'), T(20, 420, 'tag', 'JOBS · INVOCATIONS · TIMERS + WEBHOOKS')];
  HOSTS.forEach(([k, cls, title, lines, tag], i) => {
    const chat = k === 'chat'; const j = chat ? i : i - 6;
    const w = chat ? 236 : 480; const x = 20 + j * (chat ? 245 : 493); const y = chat ? 46 : 436; const h = chat ? 250 : 200;
    out.push(B(k, cls, x, y, w, h, title.replace('contoso-', ''), lines, { lh: 26 }));
    if (tag) out.push(G('cosmos', `<rect x="${x + 16}" y="${y + h - 46}" width="166" height="30" rx="15" fill="rgba(245,158,11,.22)" stroke="#f5b041"/>${T(x + 99, y + h - 25, 's', '🔒 Cosmos · CMK', 'middle')}`));
  });
  out.push(G('twice', `<rect x="20" y="318" width="1460" height="56" rx="28" fill="rgba(124,92,255,.14)" stroke="#a48bff"/>${T(750, 353, 's', 'On two hosts (same code, different front door): knowledge · freshness · inventory · progress · variance · status_report', 'middle')}`));
  out.push(G('count', `${T(1480, 30, 'tag', '23 AGENTS → 9 HOSTS · 23 SKILLS', 'end')}`));
  return out.join('');
}

const D_HOSTGRAPH = (() => {
  const runs = ['run_brd', 'run_fdd', 'run_tdd', 'run_icd', 'run_schema_map'];
  const out = [G('route', '<circle cx="60" cy="270" r="34" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.4)"/>' + T(60, 276, 's', 'START', 'middle')), A('route', 'M96 270 H176')];
  out.push(B('route', 'md', 180, 210, 240, 120, 'route', ['conditional edge']));
  runs.forEach((r, i) => { const y = 30 + i * 84; out.push(A('runs', `M422 270 C470 270 470 ${y + 32} 516 ${y + 32}`), B('runs', 'py', 520, y, 380, 66, r, [], { ty: 42 }), A('runs', `M902 ${y + 32} C960 ${y + 32} 960 270 1046 270`)); });
  out.push(A('ask', 'M422 290 C470 290 470 482 516 482'), B('ask', 'hu', 520, 450, 380, 66, 'clarify', [], { ty: 42 }), A('ask', 'M902 482 C960 482 960 290 1046 290'));
  out.push(G('end', '<circle cx="1084" cy="280" r="34" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.4)"/>' + T(1084, 286, 's', 'END', 'middle')));
  out.push(B('note', 'bx', 1160, 150, 320, 260, 'get_graph()', ['7 nodes · 13 edges', '1 conditional fan-out', 'each run_* node is a', 'whole use-case graph', '(16 nodes for brd)']));
  return out.join('');
})();

const D_HOST = [
  B('req', 'bx', 20, 150, 250, 210, 'Request', ['JSON or chat', 'trigger · API · person']),
  A('req', 'M272 255 H316'),
  B('route', 'md', 320, 40, 430, 430, 'route', ['1  "skill": "brd"', '2  old agent name', '    (old callers still work)', '3  "use_case": "01"', '4  plain chat → small model', '', 'not confident → ask'], { lh: 40 }),
  A('run', 'M752 180 H806'),
  B('run', 'py', 810, 40, 380, 330, 'run_<skill>', ['run_brd', 'run_fdd', 'run_tdd', 'run_icd', 'run_schema_map', 'original graph, unchanged', 'stateful subgraph'], { lh: 36 }),
  A('ask', 'M752 420 H806'),
  B('ask', 'hu', 810, 390, 380, 90, 'clarify', ['"which skill?" + the list']),
  B('hitl', 'hu', 1215, 40, 285, 230, 'Approval', ['interrupt() pauses', 'that conversation\'s run', 'other sessions', 'carry on']),
  B('scope', 'bx', 1215, 290, 285, 190, 'Per skill', ['phase', 'audit · approvals', 'carry the skill']),
].join('');

const D_SHARE = [
  B('key', 'wa', 20, 20, 710, 300, 'Keep every dimension, add the skill', ['conversation · run · skill', 'skill phase: read-only still can\'t write', 'audit records · traces', '', 'otherwise two skills (or two users)', '  mix their work on one host'], { lh: 36 }),
  B('calls', 'pl', 770, 20, 710, 300, 'In return: my host calls siblings in process', ['status report → schedule variance', 'gate pack → architecture review', '', 'no network hop', 'no extra endpoint or role'], { lh: 36 }),
].join('');

const D_CUTOVER = [
  B('dep', 'pl', 20, 60, 340, 250, '1 · Deploy beside', ['9 hosts next to the 23', 'azd deploy: 9 minutes', 'Foundry User per host']),
  A('cmp', 'M362 185 H396'),
  B('cmp', 'py', 400, 60, 340, 250, '2 · Same case, old vs new', ['golden case → old agent', '  and → its new host', '22 / 22 same or better']),
  A('rt', 'M742 185 H776'),
  B('rt', 'wa', 780, 60, 340, 250, '3 · Red team the hosts', ['240 attacks, skill named', 'direct + inside documents', '0 succeeded']),
  A('ret', 'M1122 185 H1156'),
  B('ret', 'ac', 1160, 60, 320, 250, '4 · Retire', ['23 agents deleted', 'role assignments', '  47 → 10']),
  G('held', `<rect x="450" y="326" width="600" height="44" rx="22" fill="rgba(139,233,168,.14)" stroke="#8be9a8"/>${T(750, 355, 's', 'Behaviour held · security held', 'middle')}`),
  G('roll', T(750, 396, 's', 'Rollback until step 4: the old agents kept running, and their deploy config is kept', 'middle')),
].join('');

const D_LOOP2 = [
  T(20, 30, 'tag', 'BEFORE RELEASE · MY GATE'), T(780, 30, 'tag', 'AFTER RELEASE · FOUNDRY'),
  '<path d="M760 14 V330" stroke="rgba(255,255,255,.3)" stroke-dasharray="6 6" fill="none"/>',
  B('pre', 'py', 20, 46, 710, 136, 'Golden cases, exact checks', ['excerpts · precision/recall · computed numbers · thresholds + baseline']),
  B('pre', 'py', 20, 194, 710, 136, 'Red team, local', ['direct + attacks hidden inside documents · through the host']),
  B('post', 'pl', 780, 46, 700, 88, 'Hourly trace evaluation (my schedule)', ['built-in judges: task adherence · intent resolution · safety']),
  B('custom', 'md', 780, 144, 700, 88, 'Custom evaluators', ['2 rubrics = the Foundry skill standards · 2 code checks from my gate']),
  B('post', 'pl', 780, 242, 700, 88, 'Monitor · Traces', ['scores beside runs, tokens, cost · results on every trace']),
  `<g data-k="loop"><path class="lp" d="M1482 188 H1494 V372 H6 V188 H16" marker-end="url(#MARKER)"/>${T(750, 400, 's', 'a low score → human review → a labelled golden case → through the gate → redeploy', 'middle')}</g>`,
].join('');

// Same standard, told and scored: the Foundry skill feeds the prompt, the rubric restates it for the judge.
const D_RUBRIC = [
  B('std', 'py', 20, 70, 540, 260, 'contoso-requirements-standard', ['Foundry skill · SKILL.md · v1', 'owned by functional leads', '', 'contoso-writing-style', '  the same, for narrative output'], { lh: 34 }),
  A('told', 'M562 160 C620 160 630 90 696 90', 'told', 600, 112),
  B('told', 'md', 700, 20, 780, 140, 'Told: the agent\'s prompt', ['{{foundry_skill:…}} in extract_requirements.md', 'the model writes to the standard']),
  A('scored', 'M562 240 C620 240 630 260 696 260', 'scored', 596, 236),
  B('scored', 'pl', 700, 190, 780, 140, 'Scored: rubric evaluators (judge model)', ['contoso-requirements-quality · 8 weighted dimensions, 1–5', 'contoso-decision-support-writing · 7 dimensions', ], { lh: 28 }),
  B('code', 'wa', 20, 370, 1460, 120, 'Rules the code checks → code-based evaluators (preview)', ['verbatim excerpts · no invented endpoints or status codes: the same checks as my gate, now on live traces, no judge']),
].join('');

const D_TAKES2 = [
  B('a1', 'md', 20, 30, 700, 170, 'Deployment shape ≠ use-case list', ['decide it separately, on purpose']),
  B('a2', 'ac', 780, 30, 700, 170, 'Group by trust + operational boundary', ['caller · identity · permissions · state · protocol']),
  B('a3', 'py', 20, 230, 700, 170, 'Keep use cases traceable', ['one skill per use case, its own tests', 'business wording → Foundry skills + rubrics', 'checked rules → code'], { lh: 30 }),
  B('a4', 'pl', 780, 230, 700, 170, 'Add, don\'t replace', ['your release gate + Foundry\'s monitoring', 'your own standards as its evaluators'], { lh: 30 }),
].join('');


// Two security boundaries, and the risk consolidation creates (answered by the cut-over).
const D_BOUND = [
  B('callers', 'bx', 20, 60, 300, 230, 'Callers', ['people in chat', 'timers · webhooks', 'other agents']),
  A('callers', 'M322 175 H446', '', 0, 0),
  G('callers', `<rect x="336" y="100" width="100" height="44" rx="10" class="hu"/>${T(386, 128, 's', 'gate 1', 'middle')}`),
  B('host', 'ac', 450, 20, 600, 310, 'contoso-design-author', ['one hosted agent · five skills', '', 'Gate 1 · endpoint authorization', '  who may CALL the host', '  (a Foundry role on the project)', 'Gate 2 · the host\'s Entra identity', '  what the host can REACH'], { lh: 34 }),
  A('down', 'M1052 175 H1176', '', 0, 0),
  G('down', `<rect x="1066" y="100" width="100" height="44" rx="10" class="hu"/>${T(1116, 128, 's', 'gate 2', 'middle')}`),
  B('down', 'pl', 1180, 60, 300, 230, 'Downstream', ['the model', 'Azure DevOps', 'SharePoint · Cosmos']),
  B('rule', 'py', 20, 350, 1460, 70, 'Skills share a host only when both gates make sense for every skill on it', [], { ty: 44 }),
  B('risk', 'wa', 20, 440, 1460, 80, 'Cleaner diagram, bigger shared blast radius. Did behaviour and security hold?', [], { ty: 50 }),
].join('');

// The second duplication problem, and the three layers that answer it.
const D_LAYERS = [
  B('dup', 'wa', 20, 20, 1460, 90, 'A second duplication problem', ['one business standard, copied into the prompts of several Python skills · its own owner, its own release cadence']),
  B('l1', 'ac', 20, 140, 470, 250, 'Hosted agent', ['deployment · identity', 'endpoint · runtime', 'operational boundary', '', 'changes: rarely'], { lh: 32 }),
  B('l2', 'md', 515, 140, 470, 250, 'Python skill', ['executable workflow', 'LangGraph graph · tools', 'checks + golden tests', '', 'changes: with a code release'], { lh: 32 }),
  B('l3', 'py', 1010, 140, 470, 250, 'Foundry skill', ['governed instructions', 'business standards', 'versioned, pinned', '', 'changes: when its owner publishes'], { lh: 32 }),
  B('port', 'pl', 20, 420, 1460, 90, 'Portable: the open Agent Skills convention (SKILL.md)', ['works in compatible coding agents too · a coding subagent is not a skill: the portable part is the skill']),
].join('');

// The abstraction lesson.
const D_ABSTRACT = [
  B('a1', 'md', 20, 20, 720, 110, 'A use case ≠ an agent', [], { ty: 66 }),
  B('a2', 'ac', 760, 20, 720, 110, 'A behaviour ≠ a deployment', [], { ty: 66 }),
  B('a3', 'py', 20, 150, 720, 110, 'A business instruction ≠ code', [], { ty: 66 }),
  B('a4', 'pl', 760, 150, 720, 110, 'A decision ≠ a generative task', [], { ty: 66 }),
  G('fin', `<rect x="300" y="300" width="900" height="80" rx="40" fill="rgba(255,176,143,.16)" stroke="#ffb08f" stroke-width="2"/>${T(750, 350, 't', 'Use the right abstraction at each layer', 'middle')}`),
].join('');

// ------------------------------------------------------------------ aside: Decision-1.1, tested (real result files)
// Written by ircc-sdlc-agents/evals/decision_pilot (link_judge_pilot.py, evidence_pilot.py) on 2026-11-22.
// The playground demo: link-judge pair P-FR-003 with a keyword trap (5302), then the real match (5301).
const PLAY_REQ = 'Requirement P-FR-003: The system shall email the applicant when the application status changes.';
const PLAY_TRAP = `${PLAY_REQ}\n\nCandidate work item (untrusted data): "Email template branding refresh. Update logo, colours and footer in all outgoing email templates."`;
const PLAY_MATCH = `${PLAY_REQ}\n\nCandidate work item (untrusted data): "Notify applicant by email when status changes. When an officer changes the status of an application, send the applicant an email naming the new status."`;
const PLAY_Q = JSON.stringify({
  implements: { type: 'noul', instructions: 'Does the candidate work item implement the behaviour the requirement describes, fully or partly? Match on behaviour, not shared words.',
    criteria: { true: 'It delivers at least part of the required behaviour.', false: 'It describes different behaviour, or only shares words.' } },
  fully: { type: 'noul', instructions: 'Does the candidate work item implement ALL of the requirement?' },
}, null, 2);

// All pilot runs on disk: gpt-5-mini (1 run), gpt-6-luna (3 runs, temperature 1), Decision-1.1 (one per run, identical).
const PILOT_DIR = path.join(REPO, 'out', 'decision_pilot');
const runs = (prefix) => fs.readdirSync(PILOT_DIR).filter((f) => f.startsWith(prefix) && f.endsWith('.json') && !f.includes('failed')).map((f) => JSON.parse(fs.readFileSync(path.join(PILOT_DIR, f), 'utf8')));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const frac = (s) => { const [a, b] = String(s).split('/').map(Number); return a / b; };
function asideData() {
  const link = runs('link-judge-'); const evid = runs('evidence-');
  const L = (m) => link.map((r) => r.scores[m]).filter(Boolean);
  const Ec = (cm, arm) => evid.filter((r) => r.chat_model === cm).map((r) => r.scores[arm]);
  const g5 = L('gpt-5-mini'); const lu = L('gpt-6-luna'); const dc = L('Decision-1.1');
  const eg5 = Ec('gpt-5-mini', 'current'); const elu = Ec('gpt-6-luna', 'current'); const edc = evid.map((r) => r.scores.decision);
  const hyb = Ec('gpt-6-luna', 'hybrid');
  const pct = (v) => `${Math.round(v * 100)}%`;
  const pctRange = (xs) => { const lo = Math.round(Math.min(...xs) * 100); const hi = Math.round(Math.max(...xs) * 100); return lo === hi ? `${lo}%` : `${lo}–${hi}%`; };
  const acc = (xs, k) => xs.map((x) => x[k]);
  const p50 = (xs) => mean(acc(xs, 'latency_s p50'));
  const tok = (xs) => Math.round(mean(acc(xs, 'output_tokens')));
  const errs = (xs) => xs.reduce((a, x) => { const [f, t] = x['errors flagged (< 0.8)'].split('/').map(Number); return [a[0] + f, a[1] + t]; }, [0, 0]);
  const [lf, lt] = errs(elu); const [gf, gt] = errs(eg5); const [df, dt] = errs(edc.slice(0, 1));
  const failed = JSON.parse(fs.readFileSync(path.join(PILOT_DIR, fs.readdirSync(PILOT_DIR).find((f) => f.includes('luna-temp0-failed'))), 'utf8'));
  const seen = new Set(); const errors = [];
  for (const r of failed.rows) {
    if (r.model === 'gpt-6-luna' && r.error && !seen.has(r.req_id)) {
      seen.add(r.req_id);
      errors.push(`  gpt-6-luna   ${r.req_id.padEnd(10)} ${r.call_secs.toFixed(1)}s  ERR ${r.error.replace(/^OpenAIInvalidRequestError: Error code: 400 - /, 'HTTP 400 · ').replace(/Unsupported value: /, '').replace(/^(.*?is supported\.).*$/, '$1').slice(0, 104)}`);
    }
  }
  const partials = (xs) => xs.map((x) => Math.round(frac(x['partials found']) * 12));
  return {
    linkPairs: g5[0].pairs, evidPairs: eg5[0].pairs,
    raceNote: `gpt-5-mini 1 run · gpt-6-luna ${lu.length} runs · Decision-1.1 ${dc.length} runs (identical answers)`,
    race: [{ k: 'dc', secs: p50(dc), tokens: tok(dc) }, { k: 'lu', secs: p50(lu), tokens: tok(lu) }, { k: 'g5', secs: p50(g5), tokens: tok(g5) }],
    link: [
      ['accuracy', { g5: pct(g5[0]['accuracy (yes/no)']), lu: pctRange(acc(lu, 'accuracy (yes/no)')), dc: pct(dc[0]['accuracy (yes/no)']) },
        { g5: g5[0]['accuracy (yes/no)'], lu: mean(acc(lu, 'accuracy (yes/no)')), dc: dc[0]['accuracy (yes/no)'] }, 'hi'],
      ['partial matches found', { g5: g5[0]['partials found'], lu: `${Math.min(...partials(lu))}–${Math.max(...partials(lu))}/12`, dc: dc[0]['partials found'] },
        { g5: frac(g5[0]['partials found']), lu: mean(lu.map((x) => frac(x['partials found']))), dc: frac(dc[0]['partials found']) }, 'hi'],
      ['keyword traps linked', { g5: g5[0]['keyword traps wrongly linked'], lu: lu[0]['keyword traps wrongly linked'], dc: dc[0]['keyword traps wrongly linked'] },
        { g5: frac(g5[0]['keyword traps wrongly linked']), lu: mean(lu.map((x) => frac(x['keyword traps wrongly linked']))), dc: frac(dc[0]['keyword traps wrongly linked']) }, 'lo'],
    ],
    evid: [
      ['accuracy', { g5: pct(eg5[0]['accuracy (3-class)']), lu: pctRange(acc(elu, 'accuracy (3-class)')), dc: pct(edc[0]['accuracy (3-class)']) },
        { g5: eg5[0]['accuracy (3-class)'], lu: mean(acc(elu, 'accuracy (3-class)')), dc: edc[0]['accuracy (3-class)'] }, 'hi'],
      ['wrongly rated "direct"', { g5: String(eg5[0]['over-claims to direct']), lu: String(Math.max(...acc(elu, 'over-claims to direct'))), dc: String(edc[0]['over-claims to direct']) },
        { g5: eg5[0]['over-claims to direct'], lu: Math.max(...acc(elu, 'over-claims to direct')), dc: edc[0]['over-claims to direct'] }, 'lo'],
    ],
    flag: [['evidence · own errors flagged as unsure', { g5: `${gf}/${gt}`, lu: `${lf}/${lt}`, dc: `${df}/${dt}` }, { g5: gf / gt, lu: lf / lt, dc: df / dt }, 'hi', 'confidence below 0.8, fixed before the run']],
    combo: {
      title: 'Combined: Decision-1.1 first, only its unsure answers to gpt-6-luna',
      sub: `evidence classifier · ${hyb.length} runs: ${hyb.map((h) => pct(h['accuracy (3-class)'])).join(', ')} · ties today's model with 1 chat call instead of 3`,
      value: `${pct(mean(acc(hyb, 'accuracy (3-class)')))} avg`,
    },
    foot: `My workload, not a general benchmark · ${g5[0].pairs} link + ${eg5[0].pairs} evidence pairs, synthetic, AI-labelled (not an SME) · accuracy = share matching the labels · gpt-6-luna: ${lu.length} runs at temperature 1, ranges shown, 👑 on its mean`,
    errors: errors.slice(0, 8),
    errSummary: `${failed.scores['gpt-6-luna'].failed_calls} of ${failed.scores['gpt-6-luna'].failed_calls} calls failed · HTTP 400 · 0 answers`,
    verdicts: [
      ['g5', ['today\'s model: stays', `best alone on evidence: ${pct(eg5[0]['accuracy (3-class)'])}`, 'slowest, most tokens', 'confident even when wrong']],
      ['lu', [`best on links: ${pctRange(acc(lu, 'accuracy (yes/no)'))}, no traps`, `~${(p50(g5) / p50(lu)).toFixed(1)}× faster than gpt-5-mini`, 'rejects temperature 0', 'its confidence isn\'t a probability']],
      ['dc', [`~${Math.round(p50(g5) / p50(dc))}× faster, ~${Math.round(tok(g5) / tok(dc))}× fewer tokens`, 'identical answers run to run', `knows when it's unsure: ${df} of ${dt} errors`, 'not more accurate on its own']],
    ],
  };
}

// ------------------------------------------------------------------ real data for terminal slides
function routingLines() {
  const r = JSON.parse(fs.readFileSync(path.join(WORK, 'routing.json'), 'utf8'));
  const skills = (r.vague.result.skills || []).map((s) => `${s.skill} (${s.use_case})`).join(' · ');
  return [
    ['cmd', `POST …/agents/${HOST}/endpoint/protocols/openai/responses`], ['dim', '  (no "skill" in the request: the router decides)'], ['dim', ''],
    ['', '> "Turn this business requirements document into structured requirements."'], ['dim', '  + document_text: booking.md'],
    ['hl', `< skill: ${r.plain.result.skill}   status: ${r.plain.result.status}   (${r.plain.seconds}s)`],
    ['', `< ${r.plain.summary.slice(0, 92)}`], ['', `  ${r.plain.summary.slice(92, 190)}`], ['dim', ''],
    ['', `> "${r.vague.request.message}"`],
    ['hl', `< status: ${r.vague.result.status}`], ['', `< ${r.vague.summary}`], ['url', `  skills: ${skills}`],
  ];
}
// From the cut-over comparison (evals/compare_live.py, 2026-11-21): host run vs old agent run on the same golden case.
const CMP = [
  ['00', 'knowledge', 'ok 0.33', 'ok 0.33'], ['01', 'brd', 'ok 1.00', 'ok 1.00'], ['02', 'fdd', 'ok 1.00', 'ok 0.67'], ['03', 'traceability', 'error 0.20', 'error 0.20'],
  ['04', 'tdd', 'ok 0.50', 'ok 0.50'], ['05', 'stories', 'ok 1.00', 'ok 1.00'], ['06', 'plan_qa', 'ok 1.00', 'ok 1.00'], ['07', 'progress', 'ok 1.00', 'ok 1.00'],
  ['08', 'status_report', 'ok 0.67', 'ok 0.67'], ['09', 'raid', 'ok 0.55', 'ok 0.55'], ['10', 'variance', 'ok 1.00', 'ok 1.00'], ['11', 'icd', 'ok 1.00 *', 'ok 1.00 *'],
  ['12', 'schema_map', 'ok', 'ok'], ['13', 'scenario', 'ok 1.00', 'ok 1.00'], ['14', 'sctm', 'ok', 'ok'], ['15', 'sdd', 'ok', 'ok'],
  ['16', 'evidence', 'same refusal', 'same refusal'], ['17', 'arch_review', 'ok', 'ok'], ['18', 'adr', 'ok', 'no status'], ['19', 'gate_pack', 'ok', 'ok'],
  ['20', 'freshness', 'ok 0.25', 'ok 0.25'], ['21', 'backlog', 'ok 1.00', 'ok 1.00'], ['22', 'inventory', 'ok', 'ok'],
];
function compareLines() {
  const cell = ([n, s, a, b]) => `${n} ${s.padEnd(13)} ${a.padEnd(12)} ${b.padEnd(12)}`;
  const out = [['cmd', '$ python evals/compare_live.py      # same golden case → new host and old agent'], ['dim', ''],
    ['dim', `UC skill          host         old agent    │ UC skill          host         old agent`]];
  for (let i = 0; i < 12; i++) { const r = CMP[i]; const s = CMP[i + 12]; out.push(['', `${cell(r)}│ ${s ? cell(s) : ''}`]); }
  out.push(['dim', ''], ['dim', '* paused for approval, approved, resumed'], ['dim', 'fdd: one run hit a content-filter 500; the old agent fails that case the same way'],
    ['ok', '22/22 comparable skills: same or better · evidence (16): identical refusal']);
  return out;
}
function deleteLines() {
  let rows = [];
  try { rows = fs.readFileSync(path.join(DEPLOY, 'delete-old-agents.log'), 'utf8').split(/\r?\n/).filter(Boolean); } catch { /* keep empty */ }
  const names = rows.map((l) => (l.match(/Agent "([^"]+)" deleted/) || [])[1]).filter(Boolean);
  const out = [['cmd', '$ azd ai agent delete <old agent> --force   # after its Foundry User role is removed'], ['dim', '']];
  names.slice(0, 13).forEach((n) => out.push(['', `Agent "${n}" deleted.`]));
  out.push(['dim', `… ${Math.max(0, names.length - 13)} more`], ['dim', ''], ['hl', 'Foundry User assignments on the project: 47 → 10'], ['ok', `${names.length} old agents deleted · 9 hosts remain`]);
  return out;
}

// Real output from publishing and verifying the Foundry skills (2026-11-22), kept in .work-e2e5/foundry-skills.json.
function proofLines() {
  const r = JSON.parse(fs.readFileSync(path.join(WORK, 'foundry-skills.json'), 'utf8'));
  return [
    ['cmd', '$ python tools/publish_foundry_skills.py --endpoint <project> --apply'], ...r.publish.map((l) => ['', l]), ['dim', ''],
    ['cmd', '$ azd ai skill list'], ...r.list.map((l) => ['', l]), ['dim', ''],
    ['cmd', '# App Insights: <contoso_standard name=… version=…> in the prompts the hosts sent'],
    ...r.traces.map(([host, name, v, n]) => ['hl', `${host.padEnd(26)} ${name.padEnd(30)} v${v}   ${n} spans`]),
    ['ok', 'no bundled, no fallback warnings: every standard came from Foundry'],
  ];
}

// ------------------------------------------------------------------ slides
const R = (p) => path.join(REPO, p);
function code(id, kicker, title, file, start, opts, lang, notes, shown) {
  const g = grab(file, start, opts);
  const text = g.text.replace(/darektomyn-\d+/g, 'foundry-project');
  return { type: 'code', id, kicker, title, path: shown || path.relative(REPO, file).replace(/\\/g, '/'), repo: 'contoso-sdlc-agents', lang, first: g.first, text, notes };
}
const dg = (id, kicker, title, viewBox, svg) => ({ type: 'diagram', id, kicker, title, viewBox, svg });
const SK = 'libs/contoso_agent_core/src/contoso_agent_core/skills.py';
// Microsoft Learn diagrams (CC BY 4.0, credited on the slide), downloaded to film/foundry-inputs/learn.
const learnImg = (f) => fs.readFileSync(path.join(FILM, 'foundry-inputs', 'learn', f)).toString('base64');
function slides() {
  return [
    { type: 'image', id: 's-before', kicker: 'Last time · built for real', title: '23 hosted agents, <em>one per use case</em>', file: path.join(FILM, 'foundry-inputs', 'agents-23-before.png') },
    dg('d-before', 'What the code said', 'Twenty-three agents, <em>four patterns</em>', '0 0 1500 670', dBefore()),
    dg('d-split', 'Agents and skills · my rule of thumb', 'The host is the <em>who</em>. A skill is the <em>what</em>.', '0 0 1500 540', D_SPLIT),
    dg('d-analogy', 'Agents and skills', 'Like one web app <em>with many routes</em>', '0 0 1500 540', D_ANALOGY),
    dg('d-after', 'Agents and skills', '23 agents → <em>9 hosts</em>, grouped by trust and operational boundary', '0 0 1500 650', dAfter()),
    dg('d-bound', 'Agents and skills', 'Two gates, <em>one shared host</em>', '0 0 1500 540', D_BOUND),
    dg('d-hostgraph', 'agents/design-author · get_graph()', 'A whole host: <em>route, then one skill</em>', '0 0 1500 540', D_HOSTGRAPH),
    dg('d-host', 'Inside a host', 'Cheap routing first, <em>ask when unsure</em>', '0 0 1500 500', D_HOST),
    { type: 'term', id: 's-routing', kicker: 'Live · deployed host', title: 'The router, <em>in Foundry</em>', label: `responses · ${HOST}`, note: 'real replies, captured 2026-11-21', lines: routingLines() },
    dg('d-share', 'Inside a host', 'What changes when <em>skills share an agent</em>', '0 0 1500 340', D_SHARE),
    dg('d-cutover', 'Cutting over', 'Prove it, <em>then</em> retire', '0 0 1500 410', D_CUTOVER),
    { type: 'term', id: 's-compare', kicker: 'Cut-over check · live', title: 'Old agent vs new host, <em>same case</em>', label: 'PowerShell · ircc-sdlc-agents', note: 'status and mean score per run', lines: compareLines() },
    { type: 'term', id: 's-delete', kicker: 'Retirement · 2026-11-21', title: 'Only then: <em>delete the 23</em>', label: 'PowerShell · foundry-test-deploy/contoso', note: 'delete-old-agents.log', lines: deleteLines() },
    dg('d-fvs', 'Foundry skills', 'Same word, <em>different thing</em>', '0 0 1500 550', D_FVS),
    dg('d-layers', 'Foundry skills', 'Three layers, <em>three cadences</em>', '0 0 1500 530', D_LAYERS),
    dg('d-move', 'Foundry skills', 'What moved, and <em>what stayed in code</em>', '0 0 1500 530', D_MOVE),
    dg('d-load', 'Foundry skills', "The model doesn't choose. <em>The graph does.</em>", '0 0 1500 510', D_LOAD),
    { type: 'term', id: 's-fproof', kicker: 'Live · 2026-11-22', title: 'Published, deployed, <em>proven in the traces</em>', label: 'PowerShell · ircc-sdlc-agents', note: 'publish tool · azd ai skill list · App Insights', lines: proofLines() },
    dg('d-loop2', 'Continuous improvement', 'Same loop, <em>two halves</em>', '0 0 1500 420', D_LOOP2),
    dg('d-rubric', 'Continuous improvement', 'Told and scored <em>by the same standard</em>', '0 0 1500 500', D_RUBRIC),
    ...FXK.asideSlides(asideData()),
    ...FXK.learnSlides({ hostImg: learnImg('hosted-agent-architecture.png'), lifeImg: learnImg('lifecycle.png') }),
    ...FXK.extraSlides(),
    dg('d-abstract', 'What I learned', 'Pick the <em>right abstraction</em>', '0 0 1500 400', D_ABSTRACT),
    dg('d-takes2', 'What I learned', 'The use case list <em>shouldn\'t dictate the deployment</em>', '0 0 1500 420', D_TAKES2),
  ];
}

// ------------------------------------------------------------------ cards
const LOGO = E.LOGO;
const TITLE = `<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s;font-size:66px">From <em>23 agents</em> to 9</h1><p class="rise" style="animation-delay:.45s">Agents, skills, Foundry skills, and the loop that keeps them honest · LangGraph on Microsoft Foundry</p>`;
const END = `<div class="logo rise">${LOGO}</div><h1 class="rise" style="animation-delay:.2s;font-size:58px">23 use cases. 23 skills.<br><em>9 hosts.</em> One evaluation loop.</h1><p class="rise" style="animation-delay:.45s">Synthetic data · fictional organization · a proof of concept</p>`;
const ASIDE_END = `<h1 class="rise" style="font-size:60px">End of the <em>aside</em>.</h1><p class="rise" style="animation-delay:.35s">Use the right abstraction for the job · back to the main story</p>`;
const chap = (t) => `<span>${t}</span>`;

// ------------------------------------------------------------------ storyboard (same lines and diagrams as the film)
const SCENES = [
  ['Cold open', 'Title card, then the 23-agent portal list from the last video (image).', ['t1', 't2'], 's-before'],
  ['What the code said', 'Diagram: 23 use cases, catalogue strip lights first, then each pattern group.', ['b1', 'b2', 'b3', 'b4'], 'd-before'],
  ['Agents and skills', 'Microsoft Learn diagram (Hosted agents in Foundry Agent Service), callouts light its own identity, endpoint, state and versions; then the who/what diagram, labelled as my rule of thumb; skill = what, brd as the example.', ['s1', 's1b', 's2'], 'd-split'],
  ['Agents and skills', 'Diagram: one web app with many routes ↔ one hosted agent with many skills; one real request flow; "before: 5 agents, 5 identities".', ['s3', 's3b'], 'd-analogy'],
  ['Agents and skills', 'Diagram: the 9 hosts, chat row then jobs row, Cosmos tags, skills on two hosts.', ['s4'], 'd-after'],
  ['Agents and skills', 'Diagram: two gates. Caller → gate 1 (endpoint authorization: who may call) → host → gate 2 (its Entra identity: what it can reach) → downstream.', ['s4b'], 'd-bound'],
  ['Agents and skills', 'Back to the 9 hosts: Cosmos tags, then skills on two hosts. Then the rule of thumb.', ['s5', 's6', 's7'], 'd-after'],
  ['Agents and skills', 'The two-gates diagram again: "bigger shared blast radius" lights, the question the cut-over answers.', ['s8'], 'd-bound'],
  ['Inside a host', 'Graph slide (real get_graph() of contoso-design-author), then the routing diagram.', ['h1', 'h2', 'h3'], 'd-host'],
  ['Inside a host', 'Diagram: the routing flow with run and approval lit (each skill graph runs unchanged as a stateful subgraph).', ['h4'], 'd-host'],
  ['Inside a host', 'Terminal: real replies from the deployed host (plain request → brd; vague → the list of skills).', ['h5'], 's-routing'],
  ['Inside a host', 'Animated: the old hosted agent (crossed out) → a skill (name, use case, was agent, graph) → mounted on contoso-design-author beside its four sibling skills.', ['h6'], null],
  ['Shared agents', 'Diagram: what changes when skills share an agent: keep conversation, run and skill dimensions; skill phase; in return, my host calls sibling skills in process.', ['x1', 'x2'], 'd-share'],
  ['Cutting over', 'Diagram: deploy beside → compare → red team → retire. Portal: Agents list with 9 hosted agents.', ['c1', 'c2'], 'd-cutover'],
  ['Cutting over', 'Terminal: old vs new comparison (22/22).', ['c3'], 's-compare'],
  ['Cutting over', 'Diagram: red team step lit (240 attacks, 0 succeeded), then "Behaviour held · security held".', ['c4'], 'd-cutover'],
  ['Cutting over', 'Terminal: retirement log (azd ai agent delete), 47 → 10 role assignments.', ['c5'], 's-delete'],
  ['Foundry skills', 'Diagram: the second duplication problem (one standard copied into several skills\' prompts).', ['f1'], 'd-layers'],
  ['Foundry skills', 'Diagram: Foundry skill (a versioned bundle) vs my skill (the executable workflow), side by side.', ['f1b', 'f2'], 'd-fvs'],
  ['Foundry skills', 'Diagram: three layers and their cadences; then the portability note (open Agent Skills convention, SKILL.md).', ['f2b', 'f2c'], 'd-layers'],
  ['Foundry skills', 'Diagram: three kinds of prompt text; standards → 3 Foundry skills with owners; checked rules and mechanics stay in code.', ['f3', 'f4', 'f5'], 'd-move'],
  ['Foundry skills', 'Animated: one prompt, two owners. The Foundry skill (portal, pinned version) fills slot 1, the checked rules from code fill slot 2, "follow the checked rules on conflict", into the model, output re-checked in code.', ['f6'], null],
  ['Foundry skills', 'Portal: Tools → Skills (preview): the three standards at v1; open contoso-requirements-standard and read its body in the portal.', ['f7'], null],
  ['Foundry skills', 'Diagram: Agent Framework load_skill (model decides) vs our graph (step decides); governance row.', ['f8'], 'd-load'],
  ['Foundry skills', 'Diagram: the governance row lit: pinned version, checked text, bundled fallback, every load audited.', ['f9'], 'd-load'],
  ['Foundry skills', 'Terminal: publish output, azd ai skill list, App Insights proof (each host sends its standard at v1).', ['f10'], 's-fproof'],
  ['Continuous improvement', 'Microsoft Learn diagram (Enterprise GenAIOps lifecycle): pre-production and continuous evaluation lit. Then diagram: two halves (my gate | Foundry built-ins). Portal: Agents → contoso-design-author → Evaluation tab (recurring runs), then Monitor tab (evaluation scores card).', ['i1', 'i2', 'i3', 'i4', 'i5'], 'd-loop2'],
  ['Continuous improvement', 'Diagram: one standard, told and scored. The Foundry skill feeds the prompt; the rubric evaluators restate it for the judge; the checked rules become code-based evaluators.', ['r1'], 'd-rubric'],
  ['Continuous improvement', 'Portal: Evaluations → Evaluator catalog. The five Contoso evaluators (Custom · Rubric / Code · Preview) above the Microsoft built-ins.', ['r2'], null],
  ['Continuous improvement', 'Portal: open Contoso requirements quality. Rubric-based, score range 1–5, Dimensions (8) with weight bars: source_scope_kept 10, atomic_requirements 8, quality_flags_with_questions 8. Then the caveat: a model\'s judgment, not ground truth.', ['r3', 'r3b'], null],
  ['Continuous improvement', 'Portal: back to the catalog, open Contoso verbatim excerpts (Code-based), then its Code tab: the Python grade() function.', ['r4'], null],
  ['Continuous improvement', 'Portal: Evaluations → the hourly continuous-contoso-design-author run: columns for the built-ins, requirements_quality and decision_support_writing (Rubric), verbatim_excerpts and unsupported_identifiers. Open View details on a rubric: per-dimension score and reason.', ['r5'], null],
  ['Continuous improvement', 'Portal: agent Traces tab → open a scored trace: invoke_agent contoso-design-author, the router and skill steps, then its Evaluations tab.', ['i8'], null],
  ['Continuous improvement', 'Diagram: the loop lit (a low score → human review → a labelled golden case → through the gate → redeploy).', ['i9'], 'd-loop2'],
  ['Aside · the hype check', 'Opens on "not every step needs a generative model". Animated: glowing orb, "Decision models" headline; Microsoft\'s three claims fly in (quoted, attributed); a stamp lands: "Does it help my agents?"', ['d1'], null],
  ['Aside · the hype check', 'Portal: Models → Deployments (Decision-1.1 beside the GPT deployments) → Decision-1.1 Playground.', ['d2'], null],
  ['Aside · the hype check', 'Portal, live: State = requirement P-FR-003 + "Email template branding refresh"; Decisions JSON = implements / fully; Run → low probability. Swap in "Notify applicant by email when status changes"; Run → close to certain. Zoom on the response panel.', ['d3', 'd4', 'd4b'], null],
  ['Aside · where it was tried', 'Animated flow chart: two real agent flows. contoso-backlog → requirements traceability (load_requirements → deterministic_links → suggest_links → verify_candidates → detect_exceptions → approve) and contoso-evidence-job → CAE evidence (discover → prefilter → classify_candidates → build_index_and_gaps → self_check → approve). The swapped step pulses; its model slot cycles gpt-5-mini / gpt-6-luna / Decision-1.1; a pulse travels each flow.', ['d5', 'd5b'], null],
  ['Aside · first surprise', 'Animated terminal: the real first gpt-6-luna run, every call HTTP 400 (temperature 0 not supported), the window shakes; then the agents\' temperature setting.', ['d5c'], null],
  ['Aside · the race', 'Animated race in real time: three lanes fill at each model\'s median seconds per requirement (Decision-1.1 ≈2 s, gpt-6-luna ≈7 s, gpt-5-mini ≈12 s) with a running clock and finish flags; then output-token counters count up.', ['d6', 'd6b'], null],
  ['Aside · the results', 'Animated scoreboard: three models × link judge and evidence rows flip in, crowns on the winners; footer: 48 link + 60 evidence pairs, synthetic, AI-labelled; then "evidence · errors flagged as unsure" (0.8 fixed before the run); then the combined result banner (evidence: Decision-1.1 → gpt-6-luna, 93% avg, ties today).', ['d7', 'd8'], null],
  ['Aside · the verdict', 'Animated: one verdict card per model; "Always test. Don\'t assume." blurs in with sparkles. Then the "End of the aside" card.', ['d9', 'd10'], null],
  ['What I learned', 'Diagram: four takeaways (deployment shape ≠ use-case list; group by trust + operational boundary; business wording → Foundry skills + rubrics, checked rules → code; add Foundry\'s monitoring to your gate).', ['k1', 'k2'], 'd-takes2'],
  ['What I learned', 'Diagram: the abstraction list, then "Use the right abstraction at each layer". End card: 23 use cases. 23 skills. 9 hosts. One evaluation loop.', ['k3', 'end'], 'd-abstract'],
];
function writeStoryboard(lengths) {
  const all = Object.fromEntries(slides().map((s) => [s.id, s]));
  const css = fs.readFileSync(path.join(FILM, 'code-deck.js'), 'utf8').match(/\.dg \.t \{[\s\S]*?\.dg svg\.dimming g\[data-k\]\.faded\.on \{[^}]*\}/)?.[0] || '';
  const dgcss = `.dg { display:flex; justify-content:center; } .dg svg { width: 100%; height: auto; } .dg text { fill:#fff; font-family:'Segoe UI',sans-serif; white-space:pre; } .dg .t { font: 600 24px 'Segoe UI'; } .dg .m { font: 400 19px 'Segoe UI'; fill: rgba(255,255,255,.82); } ${css}`;
  let t = 0; let total = 0;
  for (const k of Object.keys(LINES)) total += lengths[k] || 0;
  const rows = SCENES.map(([chapter, visual, keys, slide], i) => {
    const s = slide ? all[slide] : null;
    const dur = keys.reduce((a, k) => a + (lengths[k] || 0), 0);
    const start = t; t += dur;
    const pic = s && s.type === 'diagram' ? `<div class="dg"><svg viewBox="${s.viewBox}"><defs><marker id="ah-${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,.55)"/></marker></defs>${s.svg.replace(/MARKER/g, `ah-${i}`)}</svg></div>`
      : s && s.type === 'term' ? `<pre class="term">${s.lines.map(([, l]) => esc(l)).join('\n')}</pre>`
        : s && s.type === 'code' ? `<pre class="code">${esc(s.text.split('\n').slice(0, 16).join('\n'))}</pre><div class="path">${esc(s.path)}</div>` : '';
    return `<section class="scene"><div class="meta"><span class="no">${i + 1}</span><span class="ch">${esc(chapter)}</span><span class="tm">${Math.floor(start / 60)}:${String(Math.round(start % 60)).padStart(2, '0')} · ${dur.toFixed(0)}s</span></div>
      <div class="grid"><div class="vis"><p class="what">${esc(visual)}</p>${pic}</div>
      <div class="vo">${keys.map((k) => `<p><b>${k}</b> ${esc(LINES[k][1])}</p>`).join('')}</div></div></section>`;
  }).join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>From 23 agents to 9: storyboard</title>
<style>
:root { --bg:#0e0b1d; --card:#17132c; --ink:#ece9f7; --mut:rgba(236,233,247,.66); --acc:#ffb08f; --vio:#b8a6ff; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 'Segoe UI',system-ui,sans-serif; }
main { max-width:1280px; margin:0 auto; padding:40px 24px 80px; }
h1 { font:500 40px/1.15 Georgia,serif; margin:0 0 6px; } h1 em { font-style:normal; color:var(--acc); }
.sub { color:var(--mut); margin:0 0 26px; } .facts { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:30px; }
.facts span { background:var(--card); border:1px solid rgba(255,255,255,.12); border-radius:999px; padding:6px 14px; font-size:14px; }
.scene { background:var(--card); border:1px solid rgba(255,255,255,.1); border-radius:16px; padding:18px 20px; margin:0 0 18px; }
.meta { display:flex; gap:12px; align-items:center; margin-bottom:10px; } .no { background:var(--acc); color:#1a1030; font-weight:700; border-radius:50%; width:28px; height:28px; display:grid; place-items:center; }
.ch { font-weight:600; letter-spacing:.06em; text-transform:uppercase; font-size:13px; color:var(--acc); } .tm { margin-left:auto; color:var(--mut); font-size:13px; }
.grid { display:grid; grid-template-columns: 1.35fr 1fr; gap:22px; } @media (max-width:900px){ .grid { grid-template-columns:1fr; } }
.what { margin:0 0 10px; color:var(--mut); font-size:14px; } .vo p { margin:0 0 10px; } .vo b { color:var(--vio); font:600 12px Consolas,monospace; margin-right:6px; }
pre { background:#0d1117; border:1px solid rgba(255,255,255,.1); border-radius:10px; padding:12px; overflow:auto; font:12.5px/1.5 Consolas,monospace; color:#d6d3e6; max-height:340px; }
.path { color:var(--mut); font-size:12px; margin-top:4px; } .dg { background:#120e26; border-radius:10px; padding:10px; }
${dgcss}
</style></head><body><main>
<h1>From <em>23 agents</em> to 9</h1>
<p class="sub">Storyboard · follow-on to "Microsoft's agent platform, built for real" · narration ${Math.floor(total / 60)} min ${Math.round(total % 60)} s · internal technical audience · generated by film/make_e2e5.js --storyboard</p>
<div class="facts"><span>23 use cases → 23 skills</span><span>23 hosted agents → 9 hosts (6 chat · 3 jobs)</span><span>old vs new: 22/22 same or better</span><span>red team through hosts: 0/240</span><span>role assignments 47 → 10</span><span>3 standards → Foundry skills, live at v1</span><span>2 rubric + 2 code-based evaluators, hourly on live traces</span><span>aside: Decision-1.1 and gpt-6-luna vs gpt-5-mini on 2 agent steps · nothing shipped</span></div>
${rows}
</main></body></html>`;
  const out = path.join(INFO, 'videos', `${NAME}-storyboard.html`);
  fs.writeFileSync(out, html, 'utf8');
  return out;
}

// ------------------------------------------------------------------ the film
async function runFilm(d, cap, pages) {
  const { deck, portal } = pages;
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
  const term = async (id, n) => { for (let i = 1; i <= n; i++) { await dk('term', id, i); d.log('key'); await d.wait(Math.min(0.5, Math.max(0.1, (d.voiceLeft() - 1.5) / (n - i + 1)))); } };
  const cardOn = async (html, hold = 0) => {
    d.page = deck;
    await deck.evaluate(([h, ms]) => { window.Film.card(h, { fadeMs: ms }); const c = document.getElementById('film-card'); void c.offsetWidth; c.classList.add('show'); }, [html, 600]);
    d.log('whoosh'); await applyLabel(deck); await d.wait(hold);
  };

  // portal moves
  const ready = async (text, ms = 2000) => { await portal.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 90000 }); await E.settle(portal, ms); await E.closeDialogs(portal); await applyLabel(portal); };
  const tab = async (name, readyText) => {
    const t = portal.getByRole('tab', { name, exact: true }).first();
    for (let k = 0; k < 4; k++) {
      await d.click(t, k ? 500 : 700, 0.4);
      try { await portal.getByText(readyText, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 }); break; } catch { console.log('tab retry', name, k + 1); await E.settle(portal, 1500); }
    }
    await ready(readyText, 1500);
  };
  const openHost = async () => {
    await d.click(portal.getByRole('link', { name: HOST }).first(), 800, 0.6);
    await portal.getByRole('tab', { name: 'Details', exact: true }).first().waitFor({ state: 'visible', timeout: 90000 });
    await E.settle(portal, 2500); await applyLabel(portal);
  };
  const hoverAll = async (texts, ms = 650, exact = false) => { for (const t of texts) { const l = portal.getByText(t, { exact }).first(); if (await l.count().catch(() => 0)) await d.hover(l, ms); } };
  // Left-nav move on camera; falls back to a direct load if the nav item isn't there.
  const nav = async (label, url, readyText) => {
    const link = portal.locator(`a[aria-label="${label}"]:visible`).first();
    if (await link.count().catch(() => 0)) await d.click(link, 750, 0.4);
    else await E.gotoPortal(portal, E.nextgen(url), readyText);
    await ready(readyText, 1500);
  };
  // On an evaluation run's results: open "View details" in the requirements_quality column of the first scored row.
  const openRubricDetails = async () => {
    try {
      const heads = portal.getByText('requirements_quality', { exact: true });
      let head = null; let hy = -1;
      for (let i = 0; i < await heads.count(); i++) { const b = await heads.nth(i).boundingBox(); if (b && b.y > hy) { hy = b.y; head = heads.nth(i); } }
      if (!head) { console.log('no requirements_quality column'); return; }
      await head.scrollIntoViewIfNeeded(); await E.settle(portal, 600);
      const hb = await head.boundingBox();
      // The first row that has links (the overall-metrics table also uses role=row).
      const links = portal.locator('[role=row]').filter({ has: portal.getByText('View details', { exact: true }) }).first().getByText('View details', { exact: true });
      let best = null; let bd = 1e9;
      for (let i = 0; i < await links.count(); i++) { const b = await links.nth(i).boundingBox(); if (b && b.x >= hb.x - 4 && b.x - hb.x < bd) { bd = b.x - hb.x; best = links.nth(i); } }
      if (!best) { console.log('no rubric details link'); return; }
      await d.click(best, 800, 0.6);
      const dlg = portal.locator('[role=dialog]').last();
      await dlg.getByText('Weight: 10', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => console.log('no dimension reasons'));
      await E.settle(portal, 1200); await applyLabel(portal);
      const each = Math.max(800, (d.voiceLeft() - 1.5) * 250);
      for (const l of [dlg.getByText(/^(Pass|Fail)$/).first(), dlg.getByText('Weight: 10', { exact: true }).first(), dlg.getByText('Weight: 8', { exact: true }).first(), dlg.getByText('Reason', { exact: true }).first()]) if (await l.count().catch(() => 0)) await d.hover(l, each).catch(() => {});
    } catch (e) { console.log('rubric details', e.message); }
  };

  // ---------------- 1. Cold open
  await cardOn(TITLE, 1.4);
  await d.js(() => window.Film.hideCursor(true));
  await show('s-before'); await d.uncard(800);
  await setLabel(chap('Twenty-three agents'));
  await d.say('t1'); await d.waitVoice();
  await d.say('t2'); await d.waitVoice(0.4);

  // ---------------- 2. What the code said
  await setLabel(chap('What the code said'));
  await show('d-before'); await part('d-before', 'all', 0.2);
  await d.say('b1'); await d.waitVoice();
  await part('d-before', ['cat']); await d.say('b2'); await d.waitVoice();
  await part('d-before', ['doc']); await d.say('b3'); await d.waitVoice();
  await part('d-before', ['qa']); await d.say('b4');
  await d.wait(Math.max(1.6, d.voiceLeft() * 0.4)); await part('d-before', ['job']);
  await d.wait(Math.max(1.4, d.voiceLeft() - 3.4)); await part('d-before', ['tool']);
  await d.waitVoice(); await part('d-before', 'all', 0.3);

  // ---------------- 3. Agents and skills
  await setLabel(chap('Agents and skills'));
  await show('x-learn-host'); await dk('fx', 'x-learn-host', null);
  await d.say('s1');
  await d.wait(Math.max(1.2, d.voiceLeft() * 0.3)); await dk('fx', 'x-learn-host', ['identity']); d.log('whoosh', { soft: true });
  await d.wait(Math.max(1.0, d.voiceLeft() * 0.3)); await dk('fx', 'x-learn-host', ['identity', 'endpoint']);
  await d.wait(Math.max(1.0, d.voiceLeft() * 0.4)); await dk('fx', 'x-learn-host', ['identity', 'endpoint', 'state']);
  await d.wait(Math.max(0.8, d.voiceLeft() - 2.2)); await dk('fx', 'x-learn-host', ['identity', 'endpoint', 'state', 'versions']);
  await d.waitVoice(0.6);
  await show('d-split'); await part('d-split', ['who', 'none'], 0.2); await d.say('s1b'); await d.waitVoice();
  await part('d-split', ['what', 'mount']); await d.say('s2'); await d.waitVoice(); await part('d-split', 'all', 0.2);
  await show('d-analogy'); await part('d-analogy', ['app'], 0.2);
  await d.say('s3');
  await d.wait(Math.max(1.5, d.voiceLeft() - 5.0)); await part('d-analogy', ['app', 'same', 'host']);
  await d.wait(Math.max(1.2, d.voiceLeft() - 2.2)); await part('d-analogy', ['host', 'flow']);
  await d.waitVoice();
  await part('d-analogy', ['before']); await d.say('s3b'); await d.waitVoice(); await part('d-analogy', 'all', 0.2);
  await show('d-after'); await part('d-after', ['count'], 0.2);
  await d.say('s4');
  await d.wait(Math.max(1.5, d.voiceLeft() - 4.2)); await part('d-after', ['chat', 'count']);
  await d.wait(Math.max(1.2, d.voiceLeft() - 2.0)); await part('d-after', ['jobs', 'count']);
  await d.waitVoice();
  // two gates: who may call the host, and what the host can reach
  await show('d-bound'); await part('d-bound', ['callers', 'host'], 0.2);
  await d.say('s4b');
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.45)); await part('d-bound', ['host', 'down']);
  await d.wait(Math.max(1.0, d.voiceLeft() - 3.0)); await part('d-bound', ['callers', 'host', 'down', 'rule']);
  await d.waitVoice(0.3);
  await show('d-after'); await part('d-after', ['cosmos'], 0.2); await d.say('s5'); await d.waitVoice();
  await part('d-after', ['twice']); await d.say('s6'); await d.waitVoice(); await part('d-after', 'all', 0.3);
  await d.say('s7'); await d.waitVoice(0.4);
  // the risk consolidation creates; the cut-over answers it
  await show('d-bound'); await part('d-bound', ['risk'], 0.2);
  await d.say('s8'); await d.waitVoice(0.5);

  // ---------------- 4. Inside a host
  await setLabel(chap('Inside a host'));
  await show('d-hostgraph'); await part('d-hostgraph', 'all', 0.2);
  await d.say('h1');
  await d.wait(Math.max(1.2, d.voiceLeft() * 0.25)); await part('d-hostgraph', ['route']);
  await d.wait(Math.max(1.2, d.voiceLeft() * 0.45)); await part('d-hostgraph', ['runs', 'note']);
  await d.wait(Math.max(0.8, d.voiceLeft() - 1.6)); await part('d-hostgraph', ['ask']);
  await d.waitVoice(); await part('d-hostgraph', 'all', 0.2);
  await show('d-host'); await part('d-host', ['req', 'route'], 0.2);
  await d.say('h2'); await d.waitVoice();
  await part('d-host', ['route', 'ask']); await d.say('h3'); await d.waitVoice();
  await part('d-host', ['run', 'hitl'], 0.2);
  await d.say('h4');
  await d.waitVoice(0.3);
  await show('s-routing'); await dk('term', 's-routing', 0);
  await d.say('h5');
  const nR = routingLines().length; await term('s-routing', nR);
  await d.waitVoice(0.6);
  await show('x-skill'); await dk('fx', 'x-skill', 0);
  await d.say('h6');
  await d.wait(1.2); await dk('fx', 'x-skill', 1); d.log('whoosh', { soft: true });
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.45)); await dk('fx', 'x-skill', 2); d.log('whoosh', { soft: true });
  await d.waitVoice(0.8);

  // ---------------- 5. What changes when skills share an agent
  await setLabel(chap('Skills sharing an agent'));
  await d.js(() => window.Film.hideCursor(true));
  await show('d-share'); await part('d-share', ['key'], 0.2);
  await d.say('x1'); await d.waitVoice();
  await part('d-share', ['calls']); await d.say('x2'); await d.waitVoice(); await part('d-share', 'all', 0.3);

  // ---------------- 6. Cutting over
  await setLabel(chap('Cutting over'));
  await show('d-cutover'); await part('d-cutover', ['dep'], 0.2);
  await d.say('c1'); await d.waitVoice();
  await use(portal);
  await d.say('c2');
  await hoverAll(['Hosted'], 520, true);
  const desc = portal.getByText('Skills: brd (01)', { exact: false }).first();
  if (await desc.count().catch(() => 0)) await E.zoomTo(d, desc, 1.35, 12);
  await d.waitVoice(); await d.unzoom(700);
  await onDeck('d-cutover'); await part('d-cutover', ['cmp'], 0.2);
  await show('s-compare'); await dk('term', 's-compare', 0);
  await d.say('c3');
  await term('s-compare', compareLines().length);
  await d.waitVoice();
  await show('d-cutover'); await part('d-cutover', ['rt'], 0.2);
  await d.say('c4');
  await d.wait(Math.max(1.5, d.voiceLeft() - 2.2)); await part('d-cutover', ['rt', 'held']);
  await d.waitVoice();
  await part('d-cutover', ['ret', 'roll']);
  await show('s-delete'); await dk('term', 's-delete', 0);
  await d.say('c5');
  await term('s-delete', deleteLines().length);
  await d.waitVoice(0.4);

  // ---------------- 7. Foundry skills: where the two kinds of skill meet
  await setLabel(chap('Foundry skills'));
  await show('d-layers'); await part('d-layers', ['dup'], 0.2);
  await d.say('f1'); await d.waitVoice(0.3);
  await show('d-fvs'); await part('d-fvs', ['fs'], 0.2);
  await d.say('f1b'); await d.waitVoice();
  await part('d-fvs', ['fs', 'mine']); await d.say('f2'); await d.waitVoice();
  await part('d-fvs', ['meet'], 0.4);
  await show('d-layers'); await part('d-layers', ['l1', 'l2', 'l3'], 0.2);
  await d.say('f2b');
  await d.wait(Math.max(1.2, d.voiceLeft() * 0.3)); await part('d-layers', ['l1']);
  await d.wait(Math.max(1.0, d.voiceLeft() * 0.35)); await part('d-layers', ['l2']);
  await d.wait(Math.max(1.0, d.voiceLeft() * 0.5)); await part('d-layers', ['l3']);
  await d.waitVoice(); await part('d-layers', ['l1', 'l2', 'l3']);
  await part('d-layers', ['port']); await d.say('f2c'); await d.waitVoice(); await part('d-layers', 'all', 0.3);
  await show('d-move'); await part('d-move', 'all', 0.2);
  await d.say('f3'); await d.waitVoice();
  await part('d-move', ['std', 'skills']); await d.say('f4'); await d.waitVoice();
  await part('d-move', ['rules']); await d.say('f5'); await d.waitVoice(); await part('d-move', 'all', 0.2);
  await show('x-prompt'); await dk('fx', 'x-prompt', 0);
  await d.say('f6');
  await d.wait(0.8); await dk('fx', 'x-prompt', 1); d.log('whoosh', { soft: true });
  await d.wait(Math.max(1.2, d.voiceLeft() * 0.35)); await dk('fx', 'x-prompt', 2); d.log('whoosh', { soft: true });
  await d.wait(Math.max(1.0, d.voiceLeft() - 2.4)); await dk('fx', 'x-prompt', 3);
  await d.waitVoice(0.6);
  // portal: Tools → Skills (preview) → open the requirements standard
  await use(portal);
  const toolsNav = portal.locator('a[aria-label="Tools"]:visible').first();
  if (await toolsNav.count().catch(() => 0)) await d.click(toolsNav, 750, 0.4);
  else await E.gotoPortal(portal, E.nextgen('/build/tools'), 'Tools');
  const skillsTab = portal.getByRole('tab', { name: /^Skills/ }).first();
  await skillsTab.waitFor({ state: 'visible', timeout: 60000 }).catch(() => console.log('no skills tab'));
  await d.click(skillsTab, 700, 0.4);
  await portal.getByText('contoso-requirements-standard', { exact: true }).first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => console.log('no skills list'));
  await E.settle(portal, 1500); await applyLabel(portal);
  await d.say('f7');
  await hoverAll(['contoso-writing-style', 'contoso-user-story-standard', 'contoso-requirements-standard'], 600, true);
  await d.click(portal.getByText('contoso-requirements-standard', { exact: true }).first(), 800, 0.6);
  await portal.getByText('Shape of a requirement', { exact: false }).first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => console.log('skill body not shown'));
  await E.settle(portal, 1200); await applyLabel(portal);
  await hoverAll(['v1 saved', 'Shape of a requirement', 'The system shall'], 700);
  await d.waitVoice(0.6);
  await d.wait(1.4);
  await onDeck('d-load'); await d.js(() => window.Film.hideCursor(true)); await part('d-load', ['af'], 0.2);
  await d.say('f8');
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.5)); await part('d-load', ['mine']);
  await d.waitVoice();
  await part('d-load', ['gov']);
  await d.say('f9'); await d.waitVoice(0.4);
  await d.js(() => window.Film.hideCursor(true));
  await show('s-fproof'); await dk('term', 's-fproof', 0);
  await d.say('f10');
  await term('s-fproof', proofLines().length);
  await d.waitVoice(0.6);

  // ---------------- 8. Continuous improvement: my gate, Foundry's hourly evaluation, and my own evaluators in it
  await setLabel(chap('Continuous improvement'));
  await d.js(() => window.Film.hideCursor(true));
  await show('x-learn-life'); await dk('fx', 'x-learn-life', null);
  await d.say('i1');
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.45)); await dk('fx', 'x-learn-life', ['pre']); d.log('whoosh', { soft: true });
  await d.wait(Math.max(1.0, d.voiceLeft() - 2.6)); await dk('fx', 'x-learn-life', ['pre', 'post']);
  await d.waitVoice(0.6);
  await show('d-loop2'); await part('d-loop2', 'all', 0.2);
  await part('d-loop2', ['pre']); await d.say('i2'); await d.waitVoice();
  await part('d-loop2', ['post']); await d.say('i3'); await d.waitVoice();
  // portal: Agents → the host → Evaluation tab → Monitor tab
  await use(portal);
  await d.say('i4');
  await nav('Agents', '/build/agents', HOST);
  await openHost();
  await tab('Evaluation', 'Automatic Evaluation');
  await hoverAll(['continuous-contoso', 'Recurring', 'Completed'], 650);
  await d.waitVoice();
  // The Monitor tab fills its Evaluations card a few seconds after the page: wait for the scores, then speak.
  await tab('Monitor', 'Operational metrics');
  const details = portal.getByText('View details', { exact: true }).first();
  await details.waitFor({ state: 'visible', timeout: 90000 }).catch(() => console.log('no eval scores'));
  await E.settle(portal, 1200);
  await d.say('i5');
  // The card's box, from its "Evaluations" heading (not the left-nav item of the same name) down to "View details".
  // Metric names on the card vary by run, so neither is used as an anchor.
  try {
    const db = await details.boundingBox();
    const heads = portal.getByText('Evaluations', { exact: true });
    let hb = null;
    for (let i = 0; i < await heads.count(); i++) { const b = await heads.nth(i).boundingBox(); if (b && b.x > 300 && b.y < db.y && (!hb || b.y > hb.y)) hb = b; }
    if (hb) await E.zoomTo(d, { x: hb.x - 18, y: hb.y - 18, width: 520, height: db.y + db.height - hb.y + 36 }, 1.6, 6);
    else console.log('eval zoom: no heading');
  } catch (e) { console.log('eval zoom', e.message); }
  await d.hover(details, 700).catch(() => {});
  await d.waitVoice(); await d.unzoom(700);
  // deck: one standard, told and scored
  await onDeck('d-loop2'); await part('d-loop2', ['custom'], 0.8);
  await show('d-rubric'); await part('d-rubric', ['std'], 0.2);
  await d.say('r1');
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.2)); await part('d-rubric', ['std', 'told']);
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.35)); await part('d-rubric', ['std', 'scored']);
  await d.wait(Math.max(1.0, d.voiceLeft() - 4.5)); await part('d-rubric', ['code']);
  await d.waitVoice(); await part('d-rubric', 'all', 0.3);
  // portal: Evaluations → Evaluator catalog
  await use(portal);
  await nav('Evaluations', '/build/evaluations', 'Evaluator catalog');
  await tab('Evaluator catalog', 'Contoso requirements quality');
  await d.say('r2');
  await hoverAll(CUSTOM_EVALS, 520, true);
  await hoverAll(['Task-Adherence-Evaluator-(Preview)'], 700, true);
  await d.waitVoice();
  // the rubric: weighted dimensions
  await d.click(portal.getByText('Contoso requirements quality', { exact: true }).first(), 800, 0.6);
  await ready('Dimensions (8)', 1500);
  await d.say('r3');
  await hoverAll(['Rubric-based'], 650, true);
  try {
    const hb = await portal.getByText('Dimensions (8)', { exact: true }).first().boundingBox();
    if (hb) await E.zoomTo(d, { x: hb.x - 16, y: hb.y - 16, width: 1060, height: 560 }, 1.45, 6);
  } catch (e) { console.log('dims zoom', e.message); }
  await hoverAll(['source_scope_kept', 'atomic_requirements', 'quality_flags_with_questions'], Math.max(900, (d.voiceLeft() - 2) * 330), true);
  await d.waitVoice(); await d.unzoom(700);
  await d.say('r3b'); await hoverAll(['Rubric-based'], 800, true); await d.waitVoice(0.4);
  // the code-based evaluator and its Python
  await portal.goBack().catch(() => {});
  await ready('Contoso verbatim excerpts', 1200);
  await d.say('r4');
  await d.click(portal.getByText('Contoso verbatim excerpts', { exact: true }).first(), 800, 0.6);
  await ready('Code-based', 1200);
  await hoverAll(['Code-based'], 600, true);
  await tab('Code', CODE_READY);
  await portal.mouse.wheel(0, 420); await E.settle(portal, 700);
  await hoverAll(['Production twin of the', 'standard library only', 'def _squash'], Math.max(800, (d.voiceLeft() - 1) * 330));
  await d.waitVoice(0.4);
  // the hourly run: built-ins, rubrics and code evaluators side by side, then one rubric's per-dimension reasons
  await nav('Evaluations', '/build/evaluations', HOURLY_EVAL);
  await tab('Evaluations', HOURLY_EVAL);
  await d.click(portal.getByText(HOURLY_EVAL, { exact: true }).first(), 800, 0.6);
  await ready('Evaluation runs', 1000);
  await portal.locator('[role=row] a').first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => console.log('no run rows'));
  await E.settle(portal, 1200);
  // The newest hourly run is "Skipped" when the agent had no traffic that hour: open the newest run that has results.
  const done = portal.locator('[role=row]').filter({ has: portal.locator('a') }).filter({ hasText: /Completed|Succeeded/ }).first();
  const runRow = (await done.count().catch(() => 0)) ? done : portal.locator('[role=row]').filter({ has: portal.locator('a') }).filter({ hasNotText: 'Skipped' }).first();
  console.log('run row:', ((await runRow.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 120));
  await d.click(runRow.locator('a').first(), 800, 0.6);
  await ready('requirements_quality', 1000);
  await portal.getByText('View details', { exact: true }).first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => console.log('no result rows'));
  await E.settle(portal, 1500);
  await d.say('r5');
  await hoverAll(['requirements_quality', 'decision_support_writing', 'verbatim_excerpts', 'unsupported_identifiers'], 600, true);
  await openRubricDetails();
  await d.waitVoice(0.6);
  await portal.keyboard.press('Escape').catch(() => {});
  // Open a trace that the hourly evaluation has scored, then speak.
  await nav('Agents', '/build/agents', HOST);
  await openHost();
  await tab('Traces', 'Trace view');
  const scored = portal.locator('[role=row]').filter({ hasText: 'requirements_quality' }).first();
  await scored.waitFor({ state: 'visible', timeout: 90000 }).catch(() => console.log('no scored trace row'));
  await E.settle(portal, 1000);
  const row = (await scored.count().catch(() => 0)) ? scored : portal.locator('[role=row]').nth(1);
  await d.click(row.locator('button').first(), 800, 0.8);
  await portal.getByText('Trajectories', { exact: true }).first().waitFor({ timeout: 60000 }).catch(() => {});
  await portal.getByText(`invoke_agent ${HOST}`, { exact: false }).first().waitFor({ timeout: 60000 }).catch(() => {});
  await E.settle(portal, 1500); await applyLabel(portal);
  await d.say('i8');
  await hoverAll([`invoke_agent ${HOST}`, '_after_route', 'chat gpt-5-mini'], 800);
  const evTab = portal.locator('[role=dialog]').getByRole('tab', { name: /^Evaluations/ }).first();
  if (await evTab.count().catch(() => 0)) { await d.click(evTab, 700, 0.8); await E.settle(portal, 1200); await hoverAll(['requirements_quality', 'verbatim_excerpts'], 700); }
  await d.waitVoice(0.8);
  await portal.keyboard.press('Escape').catch(() => {});
  await onDeck('d-loop2'); await part('d-loop2', ['loop'], 0.2);
  await d.say('i9'); await d.waitVoice(); await part('d-loop2', 'all', 0.3);

  // ---------------- Aside: the decision model, tested
  await setLabel(chap('Aside · the hype check'));
  const fx = async (id, step) => { await dk('fx', id, step); };
  await show('x-hype'); await fx('x-hype', 0);
  await d.say('d1');
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.42)); await fx('x-hype', 1); d.log('whoosh', { soft: true });
  await d.wait(Math.max(1.5, d.voiceLeft() - 3.2)); await fx('x-hype', 2); d.log('whoosh');
  await d.waitVoice(0.6);
  try {
    // Models → Deployments, then the Decision-1.1 playground, live.
    await use(portal);
    await nav('Models', '/build/models/deployments', 'Microsoft-Decision-1.1');
    await d.say('d2');
    await hoverAll(['Microsoft-Decision-1.1', 'gpt-5.1'], 800, true);
    await d.click(portal.getByText('Decision-1.1', { exact: true }).first(), 800, 0.6);
    await ready('Provide content to evaluate', 1500);
    await hoverAll(['State', 'Decisions', 'Guided'], 700, true);
    await d.waitVoice(0.3);
    const state = portal.locator('[contenteditable=true]').first();
    const setState = async (text) => {
      await d.click(state, 650, 0.3);
      await portal.keyboard.press('Control+A'); await portal.keyboard.press('Delete');
      await portal.keyboard.insertText(text); await E.settle(portal, 500);
    };
    // The response panel text from "Input tokens" on; a new result is in when it changes and names the decision.
    const snap = () => portal.evaluate(() => { const t = document.body.innerText; const i = t.lastIndexOf('Input tokens'); return i < 0 ? '' : t.slice(i, i + 700); });
    const runAndWait = async () => {
      const before = await snap();
      await d.click(portal.getByRole('button', { name: 'Run' }).first(), 700, 0.2);
      const t0 = Date.now();
      for (;;) {
        const now = await snap().catch(() => '');
        if (now && now !== before && now.includes('implements')) break;
        if (Date.now() - t0 > 60000) { console.log('no playground result'); break; }
        await portal.waitForTimeout(250);
      }
      console.log('playground result', ((Date.now() - t0) / 1000).toFixed(1), 's:', (await snap()).replace(/\s+/g, ' ').slice(0, 160));
      await E.settle(portal, 900);
    };
    await d.say('d3');
    await setState(PLAY_TRAP);
    await d.click(portal.getByText('JSON', { exact: true }).first(), 650, 0.4);
    const editor = portal.locator('[contenteditable=true]').nth(1);
    await d.click(editor, 600, 0.2);
    await portal.keyboard.press('Control+A'); await portal.keyboard.press('Delete');
    await portal.keyboard.insertText(PLAY_Q); await E.settle(portal, 600);
    await d.wait(Math.max(0.3, d.voiceLeft() - 2.2));
    await runAndWait();
    await d.waitVoice(0.2);
    const tokens = portal.getByText('Input tokens', { exact: false }).first();
    try { const b = await tokens.boundingBox(); if (b) await E.zoomTo(d, { x: b.x - 16, y: b.y - 16, width: 800, height: 420 }, 1.5, 6); } catch (e) { console.log('result zoom', e.message); }
    await d.say('d4');
    await hoverAll(['implements'], 900, true);
    await d.wait(Math.max(0.5, d.voiceLeft() * 0.45));
    await d.unzoom(600);
    await setState(PLAY_MATCH);
    await d.waitVoice(0.1);
    await runAndWait();
    try { const b = await tokens.boundingBox(); if (b) await E.zoomTo(d, { x: b.x - 16, y: b.y - 16, width: 800, height: 420 }, 1.5, 6); } catch (e) { console.log('result zoom', e.message); }
    await d.say('d4b');
    await hoverAll(['implements', 'Output tokens'], 900, true);
    await d.waitVoice(0.6); await d.unzoom(700);
  } catch (e) {
    console.log('aside portal failed, staying on the deck:', e.message);
    await onDeck('x-hype'); await d.waitVoice(0.3);
  }
  // where it was tried: the two agent flows, the swapped step, the three models
  await onDeck('x-where'); await fx('x-where', 0);
  await d.say('d5');
  await d.wait(1.0); await fx('x-where', 1); d.log('whoosh', { soft: true });
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.5)); await fx('x-where', 2); d.log('whoosh', { soft: true });
  await d.wait(Math.max(1.5, d.voiceLeft() - 6)); await fx('x-where', 3);
  await d.waitVoice(0.3);
  await d.say('d5b'); await d.waitVoice(0.4);
  // the first surprise: luna rejects temperature 0
  await show('x-gotcha'); await fx('x-gotcha', 0); d.log('key');
  await d.say('d5c');
  await d.wait(Math.max(2, d.voiceLeft() * 0.5)); await fx('x-gotcha', 1);
  await d.waitVoice(0.5);
  // the race, real time
  await show('x-race'); await d.wait(0.4);
  await d.say('d6'); await d.wait(1.4); await fx('x-race', 1);
  await d.wait(12.6); await fx('x-race', 2); d.log('whoosh', { soft: true });
  await d.waitVoice(0.8);
  // the scoreboard, after saying what the numbers are (and aren't)
  await show('x-score'); await fx('x-score', 0);
  await d.say('d6b'); await d.waitVoice(0.3);
  await d.say('d7');
  await d.wait(0.8); await fx('x-score', 1); d.log('whoosh', { soft: true });
  await d.wait(Math.max(2, d.voiceLeft() * 0.48)); await fx('x-score', 2); d.log('whoosh', { soft: true });
  await d.waitVoice(0.2);
  await fx('x-score', 3); await d.say('d8');
  await d.wait(Math.max(2, d.voiceLeft() * 0.5)); await fx('x-score', 4); d.log('whoosh');
  await d.waitVoice(0.6);
  // the verdict
  await show('x-verdict'); await fx('x-verdict', 0);
  await d.say('d9');
  await d.wait(0.8); await fx('x-verdict', 1);
  await d.wait(Math.max(1.5, d.voiceLeft() - 3.6)); await fx('x-verdict', 2); d.log('whoosh');
  await d.waitVoice(1.2);
  // close the aside, then back to the main story
  await cardOn(ASIDE_END, 0.3);
  await d.say('d10'); await d.waitVoice(0.8);

  // ---------------- 9. What I'd do differently
  await setLabel(chap('What I learned'));
  await show('d-takes2'); await d.uncard(700); await part('d-takes2', ['a1', 'a2'], 0.2);
  await d.say('k1');
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.5)); await part('d-takes2', ['a2']);
  await d.waitVoice();
  await part('d-takes2', ['a3']); await d.say('k2');
  await d.wait(Math.max(1.5, d.voiceLeft() * 0.45)); await part('d-takes2', ['a4']);
  await d.waitVoice(); await part('d-takes2', 'all', 0.6);
  await show('d-abstract'); await part('d-abstract', ['a1'], 0.2);
  await d.say('k3');
  for (const k of ['a2', 'a3', 'a4']) { await d.wait(Math.max(1.0, (d.voiceLeft() - 3.0) / 4)); await part('d-abstract', ['a1', 'a2', 'a3', 'a4'].slice(0, ['a1', 'a2', 'a3', 'a4'].indexOf(k) + 1)); }
  await d.wait(Math.max(0.8, d.voiceLeft() - 2.6)); await part('d-abstract', 'all');
  await d.waitVoice(0.6);
  await setLabel(null);
  await cardOn(END, 0.3);
  await d.say('end'); await d.waitVoice(1.6);
}

// ------------------------------------------------------------------ main
async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const deckFile = () => buildDeck({ slides: slides(), hljsDir: path.join(ROOT, 'node_modules', '@highlightjs', 'cdn-assets'), out: path.join(WORK, 'deck.html'), css: FXK.THEME_CSS, js: FXK.THEME_JS });
  if (args.has('--deck')) { console.log('wrote', deckFile()); return; }
  const kit = createKit({ name: NAME, lines: LINES, vo: path.join(FILM, 'vo-e2e5'), work: WORK, out: path.join(FILM, 'out'), musicGain: 0.4 });
  const lengths = kit.makeVoice();
  if (args.has('--voice')) { let total = 0; for (const [k, v] of Object.entries(lengths)) { total += v; console.log(k.padEnd(6), `${v.toFixed(1)}s`); } console.log(`total narration ${total.toFixed(0)}s`); return; }
  if (args.has('--storyboard')) { console.log('wrote', writeStoryboard(lengths)); return; }
  if (args.has('--remix')) {
    let { events, frame_list } = JSON.parse(fs.readFileSync(path.join(WORK, 'events.json'), 'utf8'));
    const t0 = events.find((e) => e.kind === 'voice' && e.id === 't1').t - 1.5;
    events = events.filter((e) => e.t >= t0); frame_list = frame_list.filter(([, t]) => t >= t0);
    const res = kit.finish(frame_list, events, { thumbAt: 0.33 });
    if (res?.srt) fs.writeFileSync(res.srt.replace(/\.srt$/, '.vtt'), `WEBVTT\n\n${fs.readFileSync(res.srt, 'utf8').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2')}`, 'utf8');
    return;
  }
  const deckPath = deckFile();
  let ctx;
  try {
    ctx = await E.edge(false);
    await ctx.addInitScript({ path: path.join(FILM, 'overlay.js') });
    await ctx.addInitScript({ content: E.MASK_JS });
    const deck = await ctx.newPage();
    const portal = await ctx.newPage(); portal.setDefaultNavigationTimeout(120000);
    const errors = [];
    deck.on('pageerror', (e) => errors.push(String(e)));
    await deck.goto(`file:///${deckPath.replace(/\\/g, '/')}`);
    await deck.waitForFunction(() => !!window.Deck && !!window.Film);
    console.log('loading portal');
    await E.gotoPortal(portal, E.nextgen('/build/agents'), HOST);
    console.log('portal ready');
    const cap = new E.MultiCapture();
    for (const p of [deck, portal]) await cap.add(p);
    await cap.show(deck);
    const d = new kit.Director(deck, lengths);
    const t0 = Date.now();
    try { await runFilm(d, cap, { deck, portal }); } catch (e) { await d.page.screenshot({ path: path.join(WORK, 'failed.png') }).catch(() => {}); throw e; }
    await cap.stop();
    console.log('page errors', errors, 'took', Math.round((Date.now() - t0) / 1000), 's');
    const res = kit.finish(cap.frames, d.events, { stills: args.has('--stills'), thumbAt: 0.33 });
    if (res?.srt) fs.writeFileSync(res.srt.replace(/\.srt$/, '.vtt'), `WEBVTT\n\n${fs.readFileSync(res.srt, 'utf8').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2')}`, 'utf8');
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
