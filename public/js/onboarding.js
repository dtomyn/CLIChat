// Lumen front-end: First-run onboarding.
import { icon } from './icons.js';
import { $, baseName, esc } from './utils.js';
import { S, provider } from './state.js';
import { saveSettings } from './main.js';
import { modal } from './modal.js';
import { rerenderCurrent } from './chat-actions.js';
import { pickFolder } from './folder.js';
import { providerCards } from './settings.js';

function openOnboarding() {
  let step = 0;
  const draft = { userName: S.settings.userName || '', providerId: S.settings.providerId, workspace: S.settings.workspace };
  const steps = [
    () => `<div class="welcome"><div class="welcome-orb"><svg viewBox="0 0 32 32"><path d="M16 4l2.6 7.4L26 14l-7.4 2.6L16 24l-2.6-7.4L6 14l7.4-2.6z" fill="#fff"/></svg></div>
      <h2>Welcome to Lumen</h2><p>Your AI workspace for writing, analysis and planning. It works like Microsoft 365 Copilot (agents, prompts, notebooks), so what you learn here carries over when your Copilot licence arrives.</p>
      <input class="input" id="obName" placeholder="Your first name" value="${esc(draft.userName)}"></div>`,
    () => `<div class="welcome" style="padding-bottom:10px"><h2>Choose your AI engine</h2><p>Lumen works with the AI tools installed on this computer. We picked the one that's ready.</p>
      <div class="option-cards" id="obProviders" style="text-align:left;max-width:440px;margin:0 auto">${providerCards(draft.providerId)}</div></div>`,
    () => `<div class="welcome"><h2>Where do you keep your work?</h2><p>Pick a folder for your notebook. Lumen reads documents there and saves new ones, but only when you allow it. A folder in OneDrive means Microsoft 365 Copilot can find them later too.</p>
      <div class="option-card active" style="max-width:420px;margin:0 auto 12px;text-align:left"><span class="oc-icon">📁</span><span class="oc-text"><span class="oc-title" id="obFolderName">${esc(baseName(draft.workspace))}</span><span class="oc-desc" id="obFolder" style="word-break:break-all">${esc(draft.workspace)}</span></span></div>
      <button class="btn soft sm" id="obFolderBtn">${icon('folder')}Choose a different folder</button>
      <div class="feature-list" style="margin-top:22px">
        <div class="feature"><span class="fi">🤝</span><div><b>Agents</b><span>Specialists for requirements, status reports, writing and data.</span></div></div>
        <div class="feature"><span class="fi">⚡</span><div><b>Prompt gallery</b><span>Answer a few questions, get a finished deliverable.</span></div></div>
        <div class="feature"><span class="fi">🛡️</span><div><b>Not Microsoft 365 Copilot</b><span>Lumen runs on ${esc(S.providers.find((p) => p.id === draft.providerId)?.name || 'your AI engine')}, so Copilot's data protections don't apply. Follow your organisation's rules on what you share.</span></div></div>
      </div></div>`,
  ];
  const m = modal({ head: '', body: '<div id="obBody"></div>', dismissable: false, actions: [] });
  const modalEl = m.el.querySelector('.modal');
  const foot = document.createElement('div'); foot.className = 'modal-foot'; modalEl.appendChild(foot);
  const draw = () => {
    $('#obBody', m.el).innerHTML = steps[step]() + `<div class="welcome-steps" style="margin-top:0">${steps.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
    foot.innerHTML = `${step ? `<button class="btn ghost left" data-back>Back</button>` : ''}<button class="btn grad" data-next>${step === steps.length - 1 ? `${icon('spark')}Start using Lumen` : 'Continue'}</button>`;
    const nameInput = $('#obName', m.el);
    if (nameInput) { nameInput.focus(); nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') foot.querySelector('[data-next]').click(); }); }
    $('#obProviders', m.el)?.addEventListener('click', (e) => { const b = e.target.closest('[data-provider]'); if (b) { draft.providerId = b.dataset.provider; $('#obProviders', m.el).innerHTML = providerCards(draft.providerId); } });
    $('#obFolderBtn', m.el)?.addEventListener('click', async () => { const p = await pickFolder(draft.workspace); if (p) { draft.workspace = p; $('#obFolder', m.el).textContent = p; $('#obFolderName', m.el).textContent = baseName(p); } });
  };
  foot.addEventListener('click', async (e) => {
    if (e.target.closest('[data-back]')) { step--; draw(); return; }
    if (!e.target.closest('[data-next]')) return;
    if (step === 0) draft.userName = $('#obName', m.el).value.trim();
    if (step < steps.length - 1) { step++; draw(); return; }
    await saveSettings({ ...draft, onboarded: true });
    m.close(); celebrate(); rerenderCurrent();
  });
  if (!S.providers.find((p) => p.id === draft.providerId)?.available) { const ready = S.providers.find((p) => p.available); if (ready) draft.providerId = ready.id; }
  draw();
}

function celebrate() {
  const colors = ['#0f6cbd', '#479ef5', '#7c5cff', '#12a594', '#f59e0b'];
  for (let i = 0; i < 34; i++) {
    const s = document.createElement('span');
    const angle = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 260;
    Object.assign(s.style, { position: 'fixed', left: '50%', top: '42%', width: '9px', height: '9px', borderRadius: Math.random() > .5 ? '50%' : '2px', background: colors[i % colors.length], zIndex: 100, pointerEvents: 'none' });
    document.body.appendChild(s);
    s.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 120}px)) rotate(${Math.random() * 540}deg) scale(.6)`, opacity: 0 }], { duration: 1100 + Math.random() * 600, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => s.remove();
  }
}

export { celebrate, openOnboarding };
