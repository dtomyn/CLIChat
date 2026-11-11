// Lumen front-end: Home page and sample packs.
import { icon } from './icons.js';
import { $, api, baseName, esc, firstName, toast } from './utils.js';
import { md } from './markdown.js';
import { S, assistantById } from './state.js';
import { saveSettings } from './main.js';
import { go, setNav } from './router.js';
import { bindComposer, composerHTML } from './composer.js';
import { rerenderCurrent } from './chat-actions.js';
import { openDrawer, pickFolder } from './folder.js';
import { openAssistantBuilder } from './agents.js';
import { openRecipeRunner } from './prompts.js';
import { celebrate } from './onboarding.js';
import { bindPromptTabs, promptTabsHTML } from './prompt-lab.js';

function greetingWord() { const h = new Date().getHours(); return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

function renderHome() {
  S.view = 'home'; setNav('home');
  const a = assistantById(S.draft.assistantId || 'lumen');
  $('#view').innerHTML = `
    <div class="home">
      <div class="home-inner">
        <div class="greeting">
          ${a.id === 'lumen' ? '' : `<span class="a-badge md" data-color="${esc(a.color)}">${esc(a.emoji)}</span>`}
          <h1>${a.id === 'lumen' ? `${greetingWord()}${firstName() ? `, ${esc(firstName())}` : ''}` : esc(a.name)}</h1>
        </div>
        <p class="home-sub">${a.id === 'lumen' ? 'How can I help today?' : esc(a.tagline || '')}</p>
        ${composerHTML({ home: true })}

        ${promptTabsHTML(a.id)}

        ${demoBanner()}

        <div class="section-label"><span>Guided delivery ${lumenOnlyBadge()}</span><a data-go="runs">View workflows</a></div>
        ${S.pipelines.slice(0, 3).map((p) => `<button class="starter" data-go="runs"><span>${esc(p.emoji || '🔄')} ${esc(p.name)} · ${p.stages.length} guided stages</span>${icon('right')}</button>`).join('') || '<p>No workflows yet.</p>'}
      </div>
    </div>`;
  const root = $('#view');
  bindComposer(root);
  bindPromptTabs(root, a.id);
  root.firstElementChild.addEventListener('click', homeClicks);
  setTimeout(() => { if (!$('#modalRoot').children.length) $('#input')?.focus(); }, 50);
}

// Sample packs: one list drives the Samples page (rail) and the "You're in the …" banner on the home screen.
const SAMPLE_PACKS = [
  { id: 'crm', emoji: '📦', name: 'PM demo', title: 'Contoso CRM Migration demo', agent: 'schedule-analyst',
    summary: 'A Microsoft Project plan with an Excel budget tracker, RAID log, timesheets and a weekly progress update.',
    inside: 'A Microsoft Project plan plus a budget tracker, RAID log, timesheets and a progress update in Excel. Try one:',
    prompts: [['plan-health-check', '🩺 Health check'], ['plan-status-report', '📣 Status report'], ['plan-update-progress', '🔄 Update the plan'], ['budget-variance', '💰 Budget review']] },
  { id: 'aidlc', emoji: '🧬', name: 'AIDLC sample', title: 'Online Permit Renewal AIDLC sample', agent: 'traceability-analyst',
    summary: 'Program documents (BRD, design, Ways of Working) and a traceability workbook for the requirements, design, story and traceability agents.',
    inside: 'Synthetic program documents (PID, BRD, Solution Blueprint, Ways of Working, data model) and a traceability workbook. Try one:',
    prompts: [['aidlc-knowledge-inventory', '📚 Knowledge inventory'], ['aidlc-refine-requirements', '🔬 Refine requirements'], ['aidlc-trace-check', '🔗 Traceability check'], ['aidlc-change-impact', '🌊 Change impact']] },
  { id: 'data', emoji: '📊', name: 'Data sample', title: 'Permit Applications data sample', agent: 'data-profiler',
    summary: 'A source extract, schemas and a data dictionary for profiling, mapping and pipeline code.',
    inside: 'A synthetic source extract with seeded data quality problems, the source tables, a Silver canonical model, a Gold model and a data dictionary. Try them in order:',
    prompts: [['data-profile', '📊 Profile a dataset'], ['data-compare-schemas', '🔀 Compare schemas'], ['data-draft-sttm', '🗺️ Draft the STTM'], ['data-generate-code', '🧱 Generate pipeline code']] },
  { id: 'security', emoji: '🛡️', name: 'Security sample', title: 'Permit Renewal security sample', agent: 'security-control-mapper',
    summary: 'A control catalogue, a partly filled SCTM and an evidence folder for security assessment work.',
    inside: 'A synthetic control catalogue, a partly filled SCTM, the security design and an evidence folder with a missing, a stale and an orphan file. Try one:',
    prompts: [['security-draft-sctm', '🛡️ Draft the SCTM'], ['security-evidence-gaps', '🗂️ Evidence gap check'], ['security-design-document', '📘 Security design document']] },
  { id: 'change', emoji: '🔄', name: 'Change sample', title: 'Permit Renewal change sample', agent: 'change-impact-analyst',
    summary: 'Interview transcripts, change impact assessments and an English/French guide for change, training and bilingual work.',
    inside: 'Two interview transcripts, change impact assessments, a role list, an English/French glossary and a guide in both languages. Try one:',
    prompts: [['change-interview-impacts', '🔄 Interview → change impacts'], ['change-consolidate-cia', '🧩 Consolidate the CIA'], ['change-training-materials', '🎓 Training materials'], ['bilingual-qa', '🔍 Bilingual QA']] },
];
const samplePack = (id) => SAMPLE_PACKS.find((p) => p.id === id) || SAMPLE_PACKS[0];
const activeSamplePack = () => (S.settings.demoInstalled && S.settings.workspace === S.settings.demoInstalled ? samplePack(S.settings.demoPack || 'crm') : null);
const samplePromptButtons = (p) => p.prompts.map(([id, label]) => `<button class="btn soft sm" data-recipe="${esc(id)}">${esc(label)}</button>`).join('');

// Home: only the "You're in the …" banner while a sample is the notebook. The offer itself lives on the Samples page
// (rail), plus a one-line hint for someone who has never chatted or tried a sample.
function demoBanner() {
  const p = activeSamplePack();
  if (p) {
    return `<div class="demo-banner active">
      <div class="demo-icon">${p.emoji}</div>
      <div class="demo-text"><b>You're in the ${esc(p.title)}</b><span>${esc(p.inside)}</span>
        <div class="demo-actions">
          ${samplePromptButtons(p)}
          <button class="btn ghost sm" data-open-drawer>${icon('folder')}See the files</button>
          <button class="btn ghost sm" data-leave-sample>${icon('x')}Leave sample</button>
        </div>
      </div></div>`;
  }
  if (S.settings.demoDismissed || S.settings.demoInstalled || S.convs.length) return '';
  return `<div class="sample-hint">${icon('package')}<span>New to Lumen? <a data-go="samples">Try it on sample data</a> first. You can always find it under <b>Samples</b> on the left.</span><button class="icon-btn" data-dismiss-demo title="Hide">${icon('x')}</button></div>`;
}

function renderSamplesPage() {
  S.view = 'samples'; setNav('samples');
  const active = activeSamplePack();
  $('#view').innerHTML = `
    <div class="page"><div class="page-inner">
      <div class="page-head"><div><h1>Sample data</h1><p>Realistic, made-up project files to try the agents and prompts on before using your own documents. Each sample is copied into a new folder inside your notebook, which then becomes your project folder.</p></div></div>
      <div class="card-grid">
        ${SAMPLE_PACKS.map((p, i) => {
          const a = assistantById(p.agent), here = active?.id === p.id;
          return `<div class="a-card sample-card${here ? ' here' : ''}" data-color="${esc(a.color)}" style="animation-delay:${i * 40}ms">
            <div class="a-card-top"><span class="a-badge lg">${p.emoji}</span>${here ? '<span class="badge accent">You’re here</span>' : ''}</div>
            <div><h3>${esc(p.name)}</h3></div>
            <p class="tagline">${esc(p.summary)}</p>
            <p class="sample-agent">Starts with <span class="a-badge sm" data-color="${esc(a.color)}">${esc(a.emoji)}</span>${esc(a.name)}</p>
            ${here ? `<div class="demo-actions">${samplePromptButtons(p)}</div>` : ''}
            <div class="a-card-actions">
              ${here ? `<button class="btn soft sm" data-open-drawer>${icon('folder')}See the files</button><button class="btn ghost sm" data-leave-sample>${icon('x')}Leave sample</button>`
                : `<button class="btn primary sm" data-install-demo="${esc(p.id)}">${icon('package')}Use this sample</button>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div></div>`;
  $('#view').firstElementChild.addEventListener('click', homeClicks);
}

async function installDemo(btn) {
  const pack = btn?.dataset.installDemo || 'crm';
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Setting up…'; }
  try {
    const r = await api('/api/demo/install', { method: 'POST', body: { pack } });
    const st = await api('/api/status'); S.settings = st.settings;
    S.draft.assistantId = samplePack(pack).agent; S.draft.access = 'read';
    celebrate(); toast(`${pack === 'crm' ? 'Demo' : 'Sample'} ready — your project folder is now “${baseName(r.path)}”`, 'package');
    go('');
  } catch (e) { toast(e.message, 'alert'); if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}

// Back to the project folder used before the sample (or pick one if there wasn't any).
async function leaveSample() {
  const prev = S.settings.demoPrevWorkspace;
  try {
    if (prev) { await saveSettings({ workspace: prev }); toast(`Back in ${baseName(prev)}`, 'folder'); }
    else { const p = await pickFolder(); if (!p) return; await saveSettings({ workspace: p }); toast(`Now working in ${baseName(p)}`, 'folder'); }
  } catch (e) {
    // Previous folder may have been moved or deleted; let the user choose another.
    const p = await pickFolder(); if (!p) return;
    await saveSettings({ workspace: p }); toast(`Now working in ${baseName(p)}`, 'folder');
  }
  if (S.view === 'samples') renderSamplesPage(); else rerenderCurrent();
}

function homeClicks(e) {
  const t = e.target.closest('[data-pick-assistant],[data-new-assistant],[data-starter],[data-recipe],[data-go],[data-install-demo],[data-dismiss-demo],[data-open-drawer],[data-leave-sample]');
  if (!t) return;
  if ('leaveSample' in t.dataset) leaveSample();
  else if ('installDemo' in t.dataset) installDemo(t);
  else if ('dismissDemo' in t.dataset) { saveSettings({ demoDismissed: true }).then(renderHome); }
  else if ('openDrawer' in t.dataset) openDrawer();
  else if (t.dataset.pickAssistant) { S.draft.assistantId = t.dataset.pickAssistant; const a = assistantById(t.dataset.pickAssistant); S.draft.access = a.access || null; renderHome(); }
  else if ('newAssistant' in t.dataset) openAssistantBuilder();
  else if (t.dataset.starter) { S.draft.text = t.dataset.starter; const i = $('#input'); i.value = t.dataset.starter; i.dispatchEvent(new Event('input')); i.focus(); }
  else if (t.dataset.recipe) openRecipeRunner(t.dataset.recipe);
  else if (t.dataset.go) go(t.dataset.go);
}

function recipeCard(r, showCategory = false) {
  const a = assistantById(r.assistantId);
  return `<button class="recipe-card" data-recipe="${esc(r.id)}" data-color="${esc(a.color)}">
    <span class="recipe-emoji">${esc(r.emoji || '✨')}</span>
    ${showCategory ? `<span class="recipe-cat">${esc(r.category || 'Other')}</span>` : ''}
    <span class="recipe-name">${esc(r.name)}</span>
    <span class="recipe-desc">${esc(r.description || '')}</span>
    <span class="recipe-meta"><span class="a-badge sm" data-color="${esc(a.color)}" style="width:18px;height:18px;font-size:10px">${esc(a.emoji)}</span>${esc(a.name)}${r.access === 'edit' ? ' · <span class="badge accent">Saves a file</span>' : ''}${needsLocalTools(r) ? ` ${lumenOnlyBadge('This prompt relies on Lumen’s local document tools (saving files, or reading Microsoft Project plans). In Microsoft 365 Copilot you’d do those steps by hand.')}` : ''}</span>
  </button>`;
}

// Marks features that won't be in Microsoft 365 Copilot, so nobody builds a habit that breaks on switch-over day.
const LUMEN_ONLY_TIP = 'Lumen only: this runs on your computer and isn’t part of Microsoft 365 Copilot.';
// A prompt is Lumen-only when it saves or updates files, or works from Microsoft Project plans. Reading Word or
// Excel files and writing a reply is something Copilot does too.
const needsLocalTools = (r) => r.access === 'edit' || (r.fields || []).some((f) => /\.(mpp|xml)\b/i.test(f.accept || ''));
const lumenOnlyBadge = (tip = LUMEN_ONLY_TIP) => `<span class="badge lumen-only" title="${esc(tip)}">Lumen only</span>`;

export { LUMEN_ONLY_TIP, lumenOnlyBadge, recipeCard, renderHome, renderSamplesPage };
