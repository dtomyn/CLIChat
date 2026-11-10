// Lumen front-end: Project folder picker and files drawer.
import { icon } from './icons.js';
import { $, api, baseName, esc, extOf, fmtSize, timeAgo, toast } from './utils.js';
import { S } from './state.js';
import { saveSettings } from './main.js';
import { go } from './router.js';
import { openMenu } from './menu.js';
import { modal } from './modal.js';
import { currentWorkspace } from './composer.js';
import { rerenderCurrent } from './chat-actions.js';

// In-app folder browser. (A native dialog started by the server can open behind the browser or on another
// screen, which looks like a dead button, so Lumen browses folders itself.)
function pickFolder(start = currentWorkspace(), opts = {}) {
  return new Promise((resolve) => {
    let current = '';
    let settled = false;
    const finish = (p) => { if (!settled) { settled = true; resolve(p); } };
    modal({
      title: opts.title || 'Choose a project folder', sub: opts.sub || 'Open the folder Lumen should work in, then choose “Use this folder”.', wide: true,
      body: `<div class="fp">
        <div class="fp-places" id="fpPlaces"></div>
        <div class="fp-main">
          <div class="row" style="gap:6px;align-items:center"><button class="btn ghost sm" id="fpUp" title="Up one level">${icon('right', 'fp-up')}Up</button><input class="input" id="fpPath" spellcheck="false" placeholder="Type or paste a folder path and press Enter"></div>
          <div class="fp-list" id="fpList"><div class="fp-empty"><span class="spinner"></span></div></div>
          <div class="row" style="gap:6px;align-items:center"><input class="input" id="fpNew" placeholder="New folder name (optional)"><button class="btn soft sm" id="fpMk" style="flex:0 0 auto">${icon('plus')}Create folder</button></div>
        </div></div>`,
      actions: [{ label: 'Cancel', run: () => finish(null) }, { label: opts.action || 'Use this folder', primary: true, run: () => {
        if (!current) { toast('Open a folder first', 'alert'); return false; }
        finish(current);
      } }],
      onOpen: (el) => {
        // Closing with ×, Escape or the backdrop counts as Cancel.
        new MutationObserver((_, obs) => { if (!el.isConnected) { obs.disconnect(); finish(null); } }).observe($('#modalRoot'), { childList: true });
        const go = async (p) => {
          const list = $('#fpList', el);
          let r;
          try { r = await api(`/api/folder/browse?path=${encodeURIComponent(p || '')}`); } catch (e) { toast(e.message, 'alert'); return false; }
          current = r.path;
          $('#fpPath', el).value = r.path;
          $('#fpUp', el).disabled = r.parent === null;
          $('#fpUp', el).onclick = () => go(r.parent);
          $('#fpPlaces', el).innerHTML = [...r.places, { name: 'Drives', path: '' }]
            .map((x) => `<button class="fp-place ${x.path === r.path ? 'active' : ''}" data-fp="${esc(x.path)}">${icon('folder')}<span>${esc(x.name)}</span></button>`).join('');
          list.innerHTML = r.dirs.length ? r.dirs.map((d) => `<button class="fp-item" data-fp="${esc(d.path)}">${icon('folder')}<span>${esc(d.name)}</span>${icon('right', 'fp-go')}</button>`).join('')
            : `<div class="fp-empty">${r.path ? 'No folders inside. You can use this one, or create a new folder below.' : 'No drives found.'}</div>`;
          list.scrollTop = 0;
          return true;
        };
        el.addEventListener('click', (e) => { const b = e.target.closest('[data-fp]'); if (b) go(b.dataset.fp); });
        $('#fpPath', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.target.value.trim()); } });
        $('#fpMk', el).addEventListener('click', async () => {
          const name = $('#fpNew', el).value.trim();
          if (!current) return toast('Open a folder first', 'alert');
          try { const r = await api('/api/folder/mkdir', { method: 'POST', body: { parent: current, name } }); $('#fpNew', el).value = ''; go(r.path); } catch (e) { toast(e.message, 'alert'); }
        });
        go(start).then((ok) => { if (!ok) go(''); });
      },
    });
  });
}

async function changeFolder() {
  const p = await pickFolder(); if (!p) return;
  if (S.current?.id) {
    S.current.workspace = p;
    await api(`/api/conversations/${S.current.id}`, { method: 'PATCH', body: { workspace: p } });
  } else await saveSettings({ workspace: p });
  toast(`Now working in ${baseName(p)}`, 'folder');
  rerenderCurrent();
  if ($('#filesDrawer').classList.contains('open')) openDrawer();
}

function folderMenu(anchor) {
  openMenu(anchor, [
    { heading: currentWorkspace() },
    { icon: 'list', label: 'Show files', run: () => openDrawer() },
    { icon: 'external', label: 'Open in Explorer', run: () => api('/api/folder/open', { method: 'POST', body: { workspace: currentWorkspace() } }) },
    { icon: 'folder', label: 'Change folder…', run: changeFolder },
  ], { align: 'right' });
}

async function openDrawer() {
  const d = $('#filesDrawer');
  d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
  $('#drawerFiles').innerHTML = '<div class="conv-empty"><span class="spinner" style="width:18px;height:18px"></span></div>';
  const r = await api(`/api/folder/files?workspace=${encodeURIComponent(currentWorkspace())}`);
  $('#drawerPath').textContent = `Project folder · ${r.workspace}`;
  $('#drawerTip').innerHTML = /onedrive/i.test(r.workspace) ? ''
    : `${icon('alert')}<span>This folder isn't in OneDrive. Keep your notebook in OneDrive so Microsoft 365 Copilot can find these files later.</span>`;
  const changed = new Map();
  for (const msg of S.current?.messages || []) for (const file of msg.files || []) changed.set(file, msg.id);
  const paths = [...changed.keys()];
  const status = paths.length ? await api('/api/file-status', { method: 'POST', body: { workspace: r.workspace, paths } }) : { mtime: [] };
  const section = paths.length ? `<div class="conv-group">Files changed in this chat</div>` + paths.map((p, i) => `<button class="file-row" data-jump-message="${esc(changed.get(p))}" title="Go to the reply that changed this file"><span class="file-icon">${esc(extOf(p))}</span><span class="file-info"><b>${esc(baseName(p))}</b><small>${status.mtime[i] ? esc(timeAgo(status.mtime[i])) : 'Missing'} · Go to reply</small></span></button>`).join('') : '';
  $('#drawerFiles').innerHTML = section + (r.files.length ? `<div class="conv-group" style="padding-top:4px">Recently changed</div>` + r.files.map((f) => `
    <div class="drawer-file"><button class="file-row" data-open-file="${esc(f.path)}" title="${esc(f.rel)}"><span class="file-icon">${esc(extOf(f.name))}</span><span class="file-info"><b>${esc(f.name)}</b><small>${esc(f.rel.includes('\\') || f.rel.includes('/') ? f.rel.replace(/[\\/][^\\/]+$/, '') + ' · ' : '')}${fmtSize(f.size)} · ${timeAgo(f.mtime)}</small></span></button><button class="btn ghost sm" data-pin-file="${esc(f.path)}" title="Pin to this chat">📌</button></div>`).join('')
    : `<div class="conv-empty">This notebook is empty.<br>Files Lumen creates will appear here.</div>`);
}
function closeDrawer() { const d = $('#filesDrawer'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }

export { changeFolder, closeDrawer, folderMenu, openDrawer, pickFolder };
