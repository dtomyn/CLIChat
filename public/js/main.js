// Lumen front-end: Entry point: boot, theme, settings save, user badge, global key and drop bindings.
import { hydrateIcons } from './icons.js';
import { $, $$, api, esc, toast } from './utils.js';
import { S, assistantById, isLive, provider } from './state.js';
import { go, route } from './router.js';
import { convMenu, pollSchedules, renderConvList } from './sidebar.js';
import { closeMenu, menuEl } from './menu.js';
import { modal } from './modal.js';
import { currentWorkspace, setPins, uploadFiles } from './composer.js';
import { stopConv } from './streaming.js';
import { changeFolder, closeDrawer, openDrawer } from './folder.js';
import { openSettings } from './settings.js';
import { openOnboarding } from './onboarding.js';

async function boot() {
  hydrateIcons();
  const [status, assistants, recipes, convs, skills, pipelines, runs, schedules] = await Promise.all([api('/api/status'), api('/api/assistants'), api('/api/recipes'), api('/api/conversations'), api('/api/skills'), api('/api/pipelines'), api('/api/runs'), api('/api/schedules')]);
  S.pipelines = pipelines; S.runs = runs;
  S.schedules = schedules;
  S.skills = skills;
  S.settings = status.settings; S.providers = status.providers; S.assistants = assistants; S.recipes = recipes; S.convs = convs; S.osUser = status.user;
  applyTheme(S.settings.theme);
  if (innerWidth <= 860) $('#app').classList.add('collapsed'); // the chats panel overlays the page on small screens
  renderUser();
  renderConvList();
  bindChrome();
  route();
  window.addEventListener('hashchange', route);
  setInterval(pollSchedules, 60000);
  if (!S.settings.onboarded) openOnboarding();
}

function applyTheme(t) {
  if (!t || t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  try { localStorage.setItem('lumen-theme', t || 'system'); } catch {}
}

async function saveSettings(patch) {
  S.settings = await api('/api/settings', { method: 'PUT', body: patch });
  renderUser();
}

function renderUser() {
  const name = S.settings.userName || 'Welcome';
  $('#userName').textContent = name;
  $('#userAvatar').textContent = (S.settings.userName || '✦').trim().charAt(0).toUpperCase();
  const p = provider();
  const ok = p && p.available;
  $('#engineStatus').innerHTML = `<i class="dot ${ok ? 'ok' : 'bad'}"></i><span>${p ? esc(p.name) : 'No engine'} · ${ok ? 'Ready' : 'Not set up'}</span>`;
}

// ---------------------------------------------------------------- chrome bindings
function newChat() { S.draft = { text: '', attachments: [], assistantId: null, access: null }; S.current = null; go(''); }

function openShortcuts() {
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const rows = [
    ['Start a new chat', [MOD, 'K']],
    ['Send your message', ['Enter']],
    ['New line in your message', ['Shift', 'Enter']],
    ['Fill in the suggested next step (empty message box)', ['↑']],
    ['Jump to the message box', ['/']],
    ['Reference a file in your notebook (in the message box)', ['/']],
    ['Stop the reply', ['Esc']],
    ['Copy the last reply', [MOD, 'Shift', 'C']],
    ['Show this list', [MOD, '/']],
  ];
  modal({
    title: 'Keyboard shortcuts', sub: 'Handy keys for working faster. Clicking works just as well.',
    body: `<div class="kbd-list">${rows.map(([label, keys]) => `<span>${esc(label)}</span><span class="kbd-keys">${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('')}</span>`).join('')}</div>`,
    actions: [{ label: 'Done', primary: true }],
  });
}

function bindChrome() {
  $('#newChatBtn').addEventListener('click', newChat);
  $$('[data-nav]').forEach((n) => n.addEventListener('click', () => go(n.dataset.nav === 'home' ? '' : n.dataset.nav)));
  $('#filesNavBtn').addEventListener('click', openDrawer);
  $('#settingsBtn').addEventListener('click', () => openSettings());
  $('#collapseBtn').addEventListener('click', () => $('#app').classList.toggle('collapsed'));
  $('#agentList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-agent]'); if (!b) return;
    const a = assistantById(b.dataset.agent);
    S.draft = { text: '', attachments: [], assistantId: a.id, access: a.access || null }; S.current = null; go('');
  });
  $('#searchInput').addEventListener('input', (e) => { S.search = e.target.value; renderConvList(); });
  $('#convList').addEventListener('click', (e) => {
    const menu = e.target.closest('[data-conv-menu]');
    if (menu) { e.stopPropagation(); return convMenu(menu.dataset.convMenu, menu); }
    const c = e.target.closest('[data-cid]'); if (c) go(`c/${c.dataset.cid}`);
  });
  $('[data-close-drawer]').addEventListener('click', closeDrawer);
  $('#drawerOpenFolder').addEventListener('click', () => api('/api/folder/open', { method: 'POST', body: { workspace: currentWorkspace() } }));
  $('#drawerChangeFolder').addEventListener('click', changeFolder);
  $('#drawerFiles').addEventListener('click', (e) => {
    const pin = e.target.closest('[data-pin-file]'); if (pin) return setPins(S.current, [...new Set([...pinsFor(S.current), pin.dataset.pinFile])]);
    const jump = e.target.closest('[data-jump-message]'); if (jump) { closeDrawer(); const el = $$('[data-mid]').find((x) => x.dataset.mid === jump.dataset.jumpMessage); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const f = e.target.closest('[data-open-file]'); if (f) api('/api/folder/open', { method: 'POST', body: { path: f.dataset.openFile, workspace: currentWorkspace() } });
  });

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const typing = e.target.closest?.('input,textarea,select,[contenteditable="true"]');
    const modalOpen = $('#modalRoot').children.length > 0;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); newChat(); }
    else if (e.key === 'Escape') {
      const open = menuEl || modalOpen || $('#filesDrawer').classList.contains('open');
      closeMenu(); closeDrawer();
      if (!open && S.view === 'chat' && isLive(S.current)) { e.preventDefault(); stopConv(S.current); }
    }
    else if (mod && e.shiftKey && e.code === 'KeyC') {
      e.preventDefault();
      const m = S.view === 'chat' && [...(S.current?.messages || [])].reverse().find((x) => x.role === 'assistant' && x.content);
      if (!m) return toast('No reply to copy yet', 'alert');
      navigator.clipboard.writeText(m.content).then(() => toast('Last reply copied'), () => toast("Couldn't copy the reply", 'alert'));
    }
    else if (mod && e.key === '/') { e.preventDefault(); if (!modalOpen) openShortcuts(); }
    else if (e.key === '/' && !mod && !e.altKey && !typing && !modalOpen) { const i = $('#input'); if (i) { e.preventDefault(); i.focus(); } }
  });

  // drag & drop anywhere
  let depth = 0;
  const overlay = $('#dropOverlay');
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e) || !$('#input')) return; depth++; overlay.classList.add('show'); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) overlay.classList.remove('show'); });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; overlay.classList.remove('show'); if ($('#input')) uploadFiles([...e.dataTransfer.files]); });
}

boot().catch((e) => { document.body.innerHTML = `<div style="padding:40px;font-family:system-ui"><h2>Lumen couldn't start</h2><p>${esc(e.message)}</p></div>`; });

export { applyTheme, openShortcuts, renderUser, saveSettings };
