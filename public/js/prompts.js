// Lumen front-end: Guided tasks (recipes): the gallery page, the question form (runner), the builder and schedules.
// Quick text prompts and the Prompt Lab live in prompt-lab.js.
import { icon } from './icons.js';
import { $, $$, api, esc, toast } from './utils.js';
import { ACCESS, S, assistantById, isLive } from './state.js';
import { go, setNav } from './router.js';
import { modal } from './modal.js';
import { currentWorkspace } from './composer.js';
import { recipeCard } from './home.js';
import { rerenderCurrent, switchAgent } from './chat-actions.js';
import { sendMessage } from './streaming.js';
import { quickFromRecipe, usePrompt } from './prompt-lab.js';

function renderRecipesPage() {
  S.view = 'recipes'; setNav('recipes');
  const catOf = (r) => r.category || 'Other';
  const cats = ['All', ...[...new Set(S.recipes.map(catOf).filter((c) => c !== 'Scheduled'))].sort((a, b) => a.localeCompare(b)), 'Scheduled'];
  if (!cats.includes(S.recipeTab)) S.recipeTab = 'All';
  const list = S.recipes.filter((r) => S.recipeTab === 'All' || catOf(r) === S.recipeTab)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  $('#view').innerHTML = `
    <div class="page"><div class="page-inner">
      <div class="page-head">
        <div><h1>Guided tasks</h1><p>Answer a few simple questions, choose your files, and the right agent produces a finished deliverable. For a quick prompt you can change yourself, see <a data-go-prompts>Prompts</a>.</p></div>
        <div class="row" style="flex:0 0 auto;gap:8px"><button class="btn soft" data-export-prompts title="Save every prompt as plain text you can use in Microsoft 365 Copilot">${icon('external')}Export to Copilot</button><button class="btn grad" data-new-recipe>${icon('plus')}New guided task</button></div>
      </div>
      <div class="tabs">${cats.map((c) => `<button class="tab ${c === S.recipeTab ? 'active' : ''}" data-tab="${esc(c)}">${esc(c === 'Scheduled' ? 'Scheduled' : c)}</button>`).join('')}</div>
      ${S.recipeTab === 'Scheduled' ? `<div class="help schedule-notice">Scheduled prompts run only while Lumen is running. Missed runs happen once when Lumen starts again. Monthly dates that don't exist in a month are skipped.</div>
      <div class="schedule-list">${S.schedules.length ? S.schedules.map((s) => {
        const r = S.recipes.find((x) => x.id === s.recipeId);
        const result = s.running ? 'Running or waiting' : s.lastStatus === 'error' ? `Error: ${s.lastError || 'The check failed.'}` : s.lastStatus === 'late' ? 'Ran late' : s.lastStatus === 'ok' ? 'Ready' : 'Not run yet';
        return `<div class="schedule-card"><div><strong>${esc(r?.name || 'Deleted prompt')}</strong><div class="help">${!s.enabled ? 'Paused' : s.nextRunAt ? `Next run: ${esc(new Date(s.nextRunAt).toLocaleString())}` : 'Window finished'} · ${esc(result)}</div>${s.lastConversationId ? `<button class="schedule-link" data-schedule-chat="${esc(s.lastConversationId)}">Open last chat</button>` : ''}</div>
          <div class="schedule-actions"><button class="btn soft sm" data-schedule-toggle="${esc(s.id)}">${s.enabled ? 'Pause' : 'Resume'}</button><button class="btn soft sm" data-schedule-run="${esc(s.id)}" ${s.running ? 'disabled' : ''}>Run now</button><button class="btn soft sm" data-schedule-delete="${esc(s.id)}">Delete</button></div></div>`;
      }).join('') : '<div class="conv-empty">No scheduled tasks yet. Open a guided task and choose Repeat…</div>'}</div>` : `<div class="recipe-grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
        ${list.map((r) => recipeCard(r, true)).join('')}
        <button class="recipe-card new-card" data-new-recipe style="min-height:170px"><span class="plus" style="width:40px;height:40px">${icon('plus')}</span><b>Create a guided task</b></button>
      </div>`}
    </div></div>`;
  $('#view').firstElementChild.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab],[data-recipe],[data-new-recipe],[data-schedule-toggle],[data-schedule-run],[data-schedule-delete],[data-schedule-chat],[data-export-prompts],[data-go-prompts]'); if (!t) return;
    if ('goPrompts' in t.dataset) return go('prompts');
    if ('exportPrompts' in t.dataset) exportPromptsToCopilot();
    else if (t.dataset.tab) { S.recipeTab = t.dataset.tab; renderRecipesPage(); }
    else if (t.dataset.recipe) openRecipeRunner(t.dataset.recipe);
    else if (t.dataset.scheduleChat) go(`c/${t.dataset.scheduleChat}`);
    else if (t.dataset.scheduleDelete) modal({ title: 'Delete this schedule?', sub: 'Existing chats and files are kept.', actions: [{ label: 'Cancel' }, { label: 'Delete', danger: true, run: async () => { await api(`/api/schedules/${t.dataset.scheduleDelete}`, { method: 'DELETE' }); S.schedules = await api('/api/schedules'); renderRecipesPage(); } }] });
    else if (t.dataset.scheduleToggle || t.dataset.scheduleRun) {
      try {
        const id = t.dataset.scheduleToggle || t.dataset.scheduleRun;
        if (t.dataset.scheduleToggle) await api(`/api/schedules/${id}`, { method: 'PUT', body: { enabled: !S.schedules.find((s) => s.id === id).enabled } });
        else await api(`/api/schedules/${id}/run-now`, { method: 'POST' });
        S.schedules = await api('/api/schedules'); renderRecipesPage();
      } catch (err) { toast(err.message, 'alert'); }
    } else openRecipeBuilder();
  });
}

function openRecipeRunner(id, { conv = null } = {}) {
  const r = S.recipes.find((x) => x.id === id); if (!r) return;
  const a = assistantById(conv ? conv.assistantId : r.assistantId);
  const built = assistantById(r.assistantId);
  const ws = conv?.workspace || S.settings.workspace;
  const order = ['chat', 'read', 'edit'];
  const needsMore = conv && order.indexOf(r.access || 'chat') > order.indexOf(conv.access || S.settings.access);
  const files = {};
  const readValues = (el, filePaths = false) => {
    const vals = {};
    for (const f of r.fields || []) vals[f.key] = f.type === 'file' ? (files[f.key] ? (filePaths ? files[f.key].path : `"${files[f.key].name}"`) : '') : ($(`[data-field="${f.key}"]`, el)?.value || '').trim();
    const required = (r.fields || []).filter((f) => !f.optional && !/optional/i.test(f.placeholder || '')).find((f) => !vals[f.key]);
    if (required) { toast(`Please ${required.type === 'file' ? 'choose' : 'fill in'} “${required.label}”`, 'alert'); $(`[data-field="${required.key}"],[data-file-select="${required.key}"]`, el)?.focus(); return null; }
    return vals;
  };
  const m = modal({
    head: `<div class="modal-head"><span class="recipe-emoji" style="font-size:24px;width:48px;height:48px;border-radius:14px;margin:0">${esc(r.emoji)}</span><div><h2>${esc(r.name)}</h2><p>${esc(r.description || '')}</p></div><button class="icon-btn" data-x>${icon('x')}</button></div>`,
    body: `${(r.fields || []).map((f) => `<div class="field"><label>${esc(f.label)}</label>${fieldInput(f)}</div>`).join('')}
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);margin-top:4px" data-color="${esc(a.color)}"><span class="a-badge sm">${esc(a.emoji)}</span>${esc(a.name)} will take it from here${r.access === 'edit' ? ' and save the result to your project folder' : ''}.</div>
      ${conv && built.id !== a.id ? `<div class="prompt-agent-hint">Built for ${esc(built.emoji)} ${esc(built.name)}. <button class="link" data-switch-agent>Switch to ${esc(built.name)}</button></div>` : ''}
      <div class="prompt-agent-hint"><button class="link" data-just-prompt>Just give me the prompt</button> to change it yourself in the message box.</div>
      ${needsMore ? `<div class="prompt-agent-hint">This prompt needs “${esc(ACCESS[r.access]?.label || r.access)}”. Starting it changes this chat to that.</div>` : ''}`,
    leftAction: { label: 'Edit', icon: 'edit', run: () => openRecipeBuilder(r) },
    actions: [{ label: 'Cancel' }, { label: 'Copy for Copilot', icon: 'copy', run: async (el) => {
      // Answers filled in so far go in; anything blank stays as a [placeholder]. Files become "/name", the way
      // you'd reference them in Microsoft 365 Copilot.
      const text = r.template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
        const f = (r.fields || []).find((x) => x.key === k);
        const v = f?.type === 'file' ? (files[k]?.name ? `/${files[k].name}` : '') : ($(`[data-field="${k}"]`, el)?.value || '').trim();
        return v || `[${f?.label || k}]`;
      });
      try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into Microsoft 365 Copilot and choose Save prompt'); } catch { toast("Couldn't copy the prompt", 'alert'); }
      return false;
    } }, ...(conv ? [] : [{ label: 'Repeat…', run: (el) => {
      const values = readValues(el, true); if (!values) return false;
      openScheduleForm(r, values, () => m.close()); return false;
    } }]), { label: 'Start', icon: 'play', grad: true, run: async (el) => {
      const vals = readValues(el); if (!vals) return false;
      const text = r.template.replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] || '(not specified)');
      const attachments = Object.values(files).filter(Boolean);
      if (conv) {
        if (S.current !== conv || S.view !== 'chat') { toast('Open the chat again to send this prompt.', 'alert'); return false; }
        if (isLive(conv)) { toast('Wait for the current reply to finish first.', 'alert'); return false; }
        if (needsMore) {
          if (conv.id) { try { await api(`/api/conversations/${conv.id}`, { method: 'PATCH', body: { access: r.access } }); } catch (e) { toast(e.message, 'alert'); return false; } }
          conv.access = r.access;
        }
        sendMessage({ text, attachments, recipeId: r.id });
        return;
      }
      const access = order[Math.max(order.indexOf(r.access || 'chat'), order.indexOf(S.settings.access), attachments.length ? 1 : 0)];
      S.current = null; S.view = 'home';
      sendMessage({ text, attachments, assistantId: r.assistantId, access, recipeId: r.id });
    } }],
  });
  // File fields: offer matching files from the project folder (best guess pre-selected), or upload one.
  const fileFields = (r.fields || []).filter((f) => f.type === 'file');
  if (fileFields.length) {
    api(`/api/folder/files?workspace=${encodeURIComponent(ws)}&all=1`).then(({ files: found }) => {
      for (const f of fileFields) {
        const sel = $(`[data-file-select="${f.key}"]`, m.el); if (!sel) continue;
        const exts = (f.accept || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
        const words = `${f.key} ${f.label}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !['the', 'file', 'workbook', 'your'].includes(w));
        const score = (x) => words.reduce((s, w) => s + (x.name.toLowerCase().includes(w) ? 2 : 0), 0) - (/\(updated\)/i.test(x.name) ? 0 : 0);
        const matches = found.filter((x) => !exts.length || exts.includes(`.${x.name.split('.').pop().toLowerCase()}`)).sort((a, b) => score(b) - score(a) || b.mtime - a.mtime);
        const used = new Set(Object.values(files).filter(Boolean).map((x) => x.path));
        // No name clue? Still preselect when every match is a version of one file (plan and its "(updated)" copy): the newest is first.
        const family = (x) => x.name.replace(/\s*\((updated|proposed)\)(?=\.[^.]+$)/i, '').toLowerCase();
        const oneFamily = matches.length > 0 && matches.every((x) => family(x) === family(matches[0]));
        const pick = matches.find((x) => !used.has(x.path) && (score(x) > 0 || matches.length === 1 || oneFamily));
        sel.innerHTML = `<option value="">${f.optional ? 'None' : matches.length ? 'Choose a file…' : `No ${exts.join('/') || ''} files in your project folder`}</option>`
          + matches.map((x) => `<option value="${esc(x.path)}" ${pick === x ? 'selected' : ''}>${esc(x.rel)}</option>`).join('')
          + '<option value="__upload">⬆ Upload from my computer…</option>';
        if (pick) files[f.key] = { path: pick.path, name: pick.name };
      }
    }).catch(() => {});
  }
  m.el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-just-prompt]')) {
      // Answers so far go in; blank questions stay as [blanks]; chosen files are attached and named in the text.
      const q = quickFromRecipe(r);
      const text = r.template.replace(/\{\{(\w+)\}\}/g, (whole, k) => {
        const f = (r.fields || []).find((x) => x.key === k);
        const v = f?.type === 'file' ? (files[k]?.name ? `"${files[k].name}"` : '') : ($(`[data-field="${k}"]`, m.el)?.value || '').trim();
        return v || quickFromRecipe({ ...r, template: whole }).text;
      });
      const attach = Object.values(files).filter(Boolean);
      m.close();
      for (const f of attach) if (!S.draft.attachments.some((x) => x.path === f.path)) S.draft.attachments.push(f);
      usePrompt({ ...q, agentId: conv ? undefined : q.agentId, text }, conv);
      return;
    }
    const b = e.target.closest('[data-switch-agent]'); if (!b) return;
    if (await switchAgent(conv, built)) { b.parentElement.remove(); const who = $('.modal-body > div[data-color]', m.el); if (who) who.lastChild.textContent = ` ${built.name} will take it from here${r.access === 'edit' ? ' and save the result to your project folder' : ''}.`; }
  });
  m.el.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-file-select]'); if (!sel) return;
    const key = sel.dataset.fileSelect;
    if (sel.value !== '__upload') { files[key] = sel.value ? { path: sel.value, name: sel.selectedOptions[0].textContent.split(/[\\/]/).pop() } : null; return; }
    const input = document.createElement('input'); input.type = 'file';
    const f = fileFields.find((x) => x.key === key); if (f?.accept) input.accept = f.accept;
    input.onchange = async () => {
      const file = input.files[0]; if (!file) { sel.value = ''; return; }
      const res = await fetch(`/api/upload?workspace=${encodeURIComponent(ws)}&name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
      const data = await res.json();
      files[key] = data;
      sel.insertAdjacentHTML('afterbegin', `<option value="${esc(data.path)}">${esc(data.name)}</option>`);
      sel.value = data.path;
    };
    input.click();
  });
  setTimeout(() => $('[data-field]', m.el)?.focus(), 60);
}

function openScheduleForm(recipe, values, onSaved) {
  const m = modal({
    title: `Repeat ${recipe.name}`, sub: 'Scheduled prompts run only while Lumen is running. Missed runs happen once when Lumen starts again.',
    body: `<div class="field"><label>Repeat</label><select class="select" id="scheduleKind"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="interval">Every few minutes, between two times</option></select></div>
      <div id="scheduleWindow" hidden><div class="field"><label>Every</label><select class="select" id="scheduleEvery"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="45">45 minutes</option><option value="60">Hour</option></select></div>
        <div class="field"><label>From</label><input class="input" type="datetime-local" id="scheduleStart"></div>
        <div class="field"><label>Until</label><input class="input" type="datetime-local" id="scheduleEnd"><div class="help">For a cutover or other busy window. It runs only between these times, and runs missed while Lumen was closed are not made up after the window ends.</div></div></div>
      <div class="field" id="scheduleDays" hidden><label>Days</label><div class="schedule-days">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => `<label><input type="checkbox" value="${i}" ${i === 1 ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
      <div class="field" id="scheduleMonth" hidden><label>Day of month</label><input class="input" type="number" min="1" max="31" value="1" id="scheduleDay"><div class="help">Months without this date are skipped.</div></div>
      <div class="field" id="scheduleTimeField"><label>Time (local)</label><input class="input" type="time" value="09:00" id="scheduleTime"></div>
      ${recipe.access === 'edit' ? '<label class="schedule-permission"><input type="checkbox" id="scheduleAllow"> Allow this schedule to save files</label>' : ''}`,
    actions: [{ label: 'Cancel' }, { label: 'Save schedule', primary: true, run: async (el) => {
      const kind = $('#scheduleKind', el).value, time = $('#scheduleTime', el).value;
      const when = kind === 'interval' ? { kind, minutes: Number($('#scheduleEvery', el).value), start: $('#scheduleStart', el).value, end: $('#scheduleEnd', el).value } : { kind, time };
      if (kind === 'weekly') when.days = $$('#scheduleDays input:checked', el).map((x) => Number(x.value));
      if (kind === 'monthly') when.day = Number($('#scheduleDay', el).value);
      await api('/api/schedules', { method: 'POST', body: { recipeId: recipe.id, values, workspace: S.settings.workspace, when, allowEdit: !!$('#scheduleAllow', el)?.checked } });
      S.schedules = await api('/api/schedules'); onSaved(); toast('Schedule saved');
    } }],
  });
  $('#scheduleKind', m.el).addEventListener('change', (e) => { $('#scheduleDays', m.el).hidden = e.target.value !== 'weekly'; $('#scheduleMonth', m.el).hidden = e.target.value !== 'monthly'; $('#scheduleWindow', m.el).hidden = e.target.value !== 'interval'; $('#scheduleTimeField', m.el).hidden = e.target.value === 'interval'; });
}

function fieldInput(f) {
  if (f.type === 'textarea') return `<textarea class="textarea" data-field="${f.key}" placeholder="${esc(f.placeholder || '')}" rows="4"></textarea>`;
  if (f.type === 'select') return `<div class="seg" data-seg="${f.key}">${(f.options || []).map((o) => `<button type="button" class="${o === (f.default || f.options[0]) ? 'active' : ''}" onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active'));this.classList.add('active');this.parentElement.nextElementSibling.value=this.textContent">${esc(o)}</button>`).join('')}</div><input type="hidden" data-field="${f.key}" value="${esc(f.default || f.options?.[0] || '')}">`;
  if (f.type === 'file') return `<select class="select" data-file-select="${f.key}"><option value="">Looking in your project folder…</option></select>${f.optional ? '<div class="help">Optional</div>' : ''}`;
  return `<input class="input" data-field="${f.key}" placeholder="${esc(f.placeholder || '')}">`;
}

function openRecipeBuilder(existing, prefill) {
  const r = existing || prefill ? JSON.parse(JSON.stringify(existing || prefill)) : { name: '', emoji: '⚡', description: '', category: 'My prompts', assistantId: S.assistants[0]?.id || 'lumen', access: '', fields: [{ key: 'topic', label: 'What is it about?', type: 'textarea' }], template: '' };
  const TYPES = { text: 'Short answer', textarea: 'Long answer', select: 'Pick one', file: 'A file' };
  const keyOf = (label, i) => (label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || `field${i + 1}`);
  const fieldsHTML = () => r.fields.map((f, i) => `
    <div class="field-row"><input class="input" data-fl="${i}" value="${esc(f.label)}" placeholder="Question to ask">
      <select class="select" data-ft="${i}">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="icon-btn" data-rmf="${i}" title="Remove">${icon('trash')}</button></div>
    ${f.type === 'select' ? `<input class="input" data-fo="${i}" value="${esc((f.options || []).join(', '))}" placeholder="Choices, separated by commas" style="margin:-2px 0 10px">` : ''}`).join('');
  const chipsHTML = () => r.fields.map((f) => `<button class="chip" data-insert="${f.key}">+ ${esc(f.label || f.key)}</button>`).join('');
  const m = modal({
    title: existing ? 'Edit prompt' : 'New prompt', sub: 'Ask a few questions, then send a prompt built from the answers.', wide: true,
    body: `
      <div class="row">
        <div class="field" style="flex:0 0 90px"><label>Icon</label><input class="input" id="rEmoji" value="${esc(r.emoji)}" maxlength="4" style="text-align:center;font-size:20px;padding:6px"></div>
        <div class="field" style="flex:2"><label>Name</label><input class="input" id="rName" value="${esc(r.name)}" placeholder="e.g. Prepare for a stakeholder interview"></div>
        <div class="field"><label>Category</label><input class="input" id="rCat" value="${esc(r.category || '')}"></div>
      </div>
      <div class="field"><label>Short description</label><input class="input" id="rDesc" value="${esc(r.description || '')}" placeholder="What does it produce?"></div>
      <div class="row">
        <div class="field"><label>Agent</label><select class="select" id="rAsst">${S.assistants.map((a) => `<option value="${esc(a.id)}" ${a.id === r.assistantId ? 'selected' : ''}>${esc(a.emoji)} ${esc(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label>File access</label><select class="select" id="rAccess"><option value="">Use my default</option>${Object.entries(ACCESS).map(([k, v]) => `<option value="${k}" ${r.access === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Questions to ask</label><div id="rFields">${fieldsHTML()}</div><button class="btn ghost sm" id="addField">${icon('plus')}Add a question</button></div>
      <div class="field"><label>The request to send</label>
        <div class="chip-list" id="rChips" style="margin-bottom:8px">${chipsHTML()}</div>
        <textarea class="textarea" id="rTemplate" rows="6" placeholder="Write the request. Click the chips above to drop in the answers. e.g. Prepare 10 interview questions about {{topic}}...">${esc(r.template)}</textarea>
        <div class="help">Answers are inserted wherever you see {{like_this}}.</div></div>`,
    leftAction: existing && !existing.builtin ? { label: 'Delete', icon: 'trash', danger: true, run: async () => { await api(`/api/recipes/${existing.id}`, { method: 'DELETE' }); S.recipes = await api('/api/recipes'); rerenderPage(); toast('Prompt deleted', 'trash'); } } : null,
    actions: [{ label: 'Cancel' }, { label: existing ? 'Save' : 'Create', grad: true, run: async (el) => {
      collect(el);
      if (!r.name.trim()) { toast('Give it a name', 'alert'); return false; }
      if (!r.template.trim()) r.template = r.fields.map((f) => `${f.label}: {{${f.key}}}`).join('\n');
      const { builtin, ...body } = r;
      if (existing) await api(`/api/recipes/${existing.id}`, { method: 'PUT', body }); else await api('/api/recipes', { method: 'POST', body });
      S.recipes = await api('/api/recipes'); rerenderPage();
      toast(existing ? 'Prompt saved' : 'Prompt saved to your gallery', 'spark');
    } }],
  });
  const el = m.el;
  function collect() {
    r.emoji = $('#rEmoji', el).value || '⚡'; r.name = $('#rName', el).value; r.category = $('#rCat', el).value || 'My prompts';
    r.description = $('#rDesc', el).value; r.assistantId = $('#rAsst', el).value; r.access = $('#rAccess', el).value; r.template = $('#rTemplate', el).value;
    r.fields.forEach((f, i) => {
      const l = $(`[data-fl="${i}"]`, el); if (l) f.label = l.value;
      const t = $(`[data-ft="${i}"]`, el); if (t) f.type = t.value;
      const o = $(`[data-fo="${i}"]`, el); if (o) f.options = o.value.split(',').map((s) => s.trim()).filter(Boolean);
      if (f.type === 'select' && !f.options?.length) f.options = ['Option A', 'Option B'];
      if (!existing || !f.key) { const old = f.key; f.key = keyOf(f.label, i); if (old && old !== f.key) r.template = r.template.split(`{{${old}}}`).join(`{{${f.key}}}`); }
    });
    $('#rTemplate', el).value = r.template;
  }
  const redraw = () => { collect(); $('#rFields', el).innerHTML = fieldsHTML(); $('#rChips', el).innerHTML = chipsHTML(); };
  el.addEventListener('change', (e) => { if (e.target.matches('[data-ft]')) redraw(); });
  el.addEventListener('focusout', (e) => { if (e.target.matches('[data-fl]')) { collect(); $('#rChips', el).innerHTML = chipsHTML(); } });
  el.addEventListener('click', (e) => {
    const t = e.target.closest('#addField,[data-rmf],[data-insert]'); if (!t) return;
    if (t.id === 'addField') { collect(); r.fields.push({ key: '', label: '', type: 'text' }); redraw(); $(`[data-fl="${r.fields.length - 1}"]`, el).focus(); }
    else if (t.dataset.rmf) { collect(); r.fields.splice(+t.dataset.rmf, 1); redraw(); }
    else if (t.dataset.insert) { const ta = $('#rTemplate', el); const tok = `{{${t.dataset.insert}}}`; const s = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, s) + tok + ta.value.slice(ta.selectionEnd ?? s); ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length; }
  });
}
async function exportPromptsToCopilot() {
  try {
    const r = await api('/api/recipes/export-copilot', { method: 'POST', body: { workspace: currentWorkspace() } });
    modal({
      title: `${r.count} prompts are ready for Microsoft 365 Copilot`,
      sub: 'Saved as Prompts.md in your notebook. Fill in the [blanks], paste into Copilot, then choose Save prompt to keep the ones you use often.',
      body: `<div class="help" style="word-break:break-all">${esc(r.file)}</div>`,
      actions: [{ label: 'Open file', icon: 'external', run: () => { api('/api/folder/open', { method: 'POST', body: { path: r.file, workspace: currentWorkspace() } }); return false; } }, { label: 'Done', primary: true }],
    });
  } catch (e) { toast(e.message, 'alert'); }
}

function rerenderPage() { if (S.view === 'recipes') renderRecipesPage(); else rerenderCurrent(); }

export { openRecipeBuilder, openRecipeRunner, renderRecipesPage };
