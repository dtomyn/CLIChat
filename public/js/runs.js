// Lumen front-end: Guided lifecycle runs and the workflow editor.
import { icon } from './icons.js';
import { $, $$, api, baseName, esc, toast } from './utils.js';
import { highlight, md } from './markdown.js';
import { S } from './state.js';
import { go, setNav } from './router.js';
import { refreshConvs } from './sidebar.js';
import { modal } from './modal.js';
import { chooseWorkspaceFiles } from './composer.js';
import { lumenOnlyBadge } from './home.js';
import { adoReady } from './connections.js';

async function renderRuns() {
  S.view = 'runs'; setNav('runs');
  try { [S.pipelines, S.runs] = await Promise.all([api('/api/pipelines'), api('/api/runs')]); }
  catch (e) { toast(e.message, 'alert'); return; }
  if (S.view !== 'runs') return;
  $('#view').innerHTML = `<div class="page"><div class="page-inner">
    <div class="page-head"><div><h1>Lifecycle ${lumenOnlyBadge()}</h1><p>Build reusable delivery workflows, then run them with review and approval at each stage.</p></div>
      <button class="btn primary" data-new-pipeline>${icon('plus')}Create workflow</button></div>
    <h2>Workflows</h2>
    <div class="workflow-list">${S.pipelines.length ? S.pipelines.map((p) => `<article class="workflow-card">
      <div class="workflow-info"><span class="workflow-emoji">${esc(p.emoji || '🔄')}</span><div><h3>${esc(p.name)}</h3><p>${p.stages.length} ${p.stages.length === 1 ? 'stage' : 'stages'}${p.gateCheck ? ' · traceability check' : ''}</p></div></div>
      <div class="workflow-actions"><button class="btn primary sm" data-start-pipeline="${esc(p.id)}">Start</button><button class="btn soft sm" data-edit-pipeline="${esc(p.id)}">${icon('edit')}Customize</button>
      <button class="btn ghost sm" data-copy-pipeline="${esc(p.id)}">${icon('copy')}Duplicate</button>${p.builtin ? '' : `<button class="btn ghost sm" data-delete-pipeline="${esc(p.id)}" title="Delete workflow">${icon('trash')}</button>`}</div>
    </article>`).join('') : '<p>No workflows yet. Create one to get started.</p>'}</div>
    <h2 class="lifecycle-runs-heading">Your runs</h2>
    <div class="lifecycle-list">${S.runs.length ? S.runs.map((r) => {
      const skipped = r.stages.filter((s) => s.status === 'skipped').length;
      return `<button class="starter" data-run="${esc(r.id)}"><span><b>${esc(r.name)}</b> · ${r.stages.filter((s) => s.status === 'approved').length}/${r.stages.length} approved${skipped ? ` · ${skipped} skipped` : ''}</span>${icon('right')}</button>`;
    }).join('') : '<p>No runs yet.</p>'}</div></div></div>`;
  $('#view').onclick = (e) => {
    const b = e.target.closest('[data-run],[data-new-pipeline],[data-start-pipeline],[data-edit-pipeline],[data-copy-pipeline],[data-delete-pipeline]');
    if (!b) return;
    if (b.dataset.run) return go(`run/${b.dataset.run}`);
    if ('newPipeline' in b.dataset) return openPipelineEditor();
    if (b.dataset.startPipeline) return startNewRun(b.dataset.startPipeline);
    if (b.dataset.editPipeline) return openPipelineEditor(S.pipelines.find((p) => p.id === b.dataset.editPipeline));
    if (b.dataset.copyPipeline) return openPipelineEditor(S.pipelines.find((p) => p.id === b.dataset.copyPipeline), true);
    if (b.dataset.deletePipeline) return modal({ title: 'Delete this workflow?', sub: 'Existing runs will keep their saved workflow. This workflow will no longer be available for new runs.', actions: [{ label: 'Cancel' }, { label: 'Delete', danger: true, run: async () => {
      await api(`/api/pipelines/${encodeURIComponent(b.dataset.deletePipeline)}`, { method: 'DELETE' });
      await renderRuns(); toast('Workflow deleted', 'trash');
    } }] });
  };
}

function pipelineEditorHTML(pipeline) {
  return `<div class="pipeline-editor">
    <div class="pipeline-editor-top"><label>Workflow name<input class="input" id="pipelineName" maxlength="80" value="${esc(pipeline.name)}"></label><label>Icon<input class="input" id="pipelineEmoji" maxlength="8" value="${esc(pipeline.emoji || '🔄')}"></label></div>
    <div class="section-label"><span>Stages, in order</span><button class="btn soft sm" type="button" data-add-stage>${icon('plus')}Add stage</button></div>
    <p class="pipeline-help">Use {{sources}} for the selected project files and {{prev}} for the previous approved output. After a skipped stage, the next stage uses the most recent prior output. Optional stages can be skipped during a run.</p>
    <div class="pipeline-stage-list">${pipeline.stages.map((s, i) => `<section class="pipeline-stage" data-stage-index="${i}" data-stage-id="${esc(s.id)}">
      <div class="pipeline-stage-head"><b>Stage ${i + 1}</b><div><button class="btn ghost sm" type="button" data-move-stage="-1" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button><button class="btn ghost sm" type="button" data-move-stage="1" ${i === pipeline.stages.length - 1 ? 'disabled' : ''} title="Move down">↓</button><button class="btn ghost sm" type="button" data-remove-stage title="Remove stage">${icon('trash')}</button></div></div>
      <label>Stage name<input class="input" data-stage-field="name" maxlength="80" value="${esc(s.name)}"></label>
      <label>Agent<select class="select" data-stage-field="assistantId">${S.assistants.map((a) => `<option value="${esc(a.id)}" ${a.id === s.assistantId ? 'selected' : ''}>${esc(a.emoji)} ${esc(a.name)}</option>`).join('')}</select></label>
      <label>Output filename<input class="input" data-stage-field="output" maxlength="120" value="${esc(s.output)}" placeholder="01-deliverable.md"></label>
      <label>Instructions<textarea class="input" data-stage-field="prompt" rows="3" maxlength="8000">${esc(s.prompt)}</textarea></label>
      <label>Word template path <span class="muted">(optional, relative to the project folder)</span><input class="input" data-stage-field="wordTemplate" maxlength="240" value="${esc(s.wordTemplate || '')}" placeholder="Templates/Design Template.dotx"></label>
      <label class="pipeline-check"><input type="checkbox" data-stage-field="optional" ${s.optional ? 'checked' : ''}> Optional stage (can be skipped)</label>
    </section>`).join('')}</div>
    <section class="pipeline-gate">
      <label class="pipeline-check"><input type="checkbox" id="pipelineGateEnabled" ${pipeline.gateCheck ? 'checked' : ''}> Include a traceability check at review</label>
      <div id="pipelineGateFields" ${pipeline.gateCheck ? '' : 'hidden'}>
        <label>Check agent<select class="select" id="pipelineGateAgent">${S.assistants.map((a) => `<option value="${esc(a.id)}" ${a.id === pipeline.gateCheck?.assistantId ? 'selected' : ''}>${esc(a.emoji)} ${esc(a.name)}</option>`).join('')}</select></label>
        <label>Check instructions<textarea class="input" id="pipelineGatePrompt" rows="3" maxlength="8000">${esc(pipeline.gateCheck?.prompt || 'Check the previous approved output against the current stage. Report gaps and findings only; do not change any files.')}</textarea></label>
      </div>
    </section>
  </div>`;
}

function openPipelineEditor(existing = null, duplicate = false) {
  const firstAgent = S.assistants.find((a) => a.id === 'requirements-refiner') || S.assistants[0];
  const pipeline = existing ? JSON.parse(JSON.stringify(existing)) : {
    name: 'New workflow', emoji: '🔄', stages: [{ id: `stage-${Date.now().toString(36)}`, name: 'First stage', assistantId: firstAgent?.id || '', output: '01-first-stage.md', prompt: 'Create the first deliverable from {{sources}}. Preserve important details and identify gaps.' }],
    gateCheck: null,
  };
  if (duplicate) { delete pipeline.id; delete pipeline.defaultStagesSeen; pipeline.name = `${pipeline.name} (copy)`.slice(0, 80); }
  const isEdit = !!pipeline.id;
  const readForm = (wrap) => {
    pipeline.name = $('#pipelineName', wrap).value.trim();
    pipeline.emoji = $('#pipelineEmoji', wrap).value.trim();
    pipeline.stages = $$('.pipeline-stage', wrap).map((el) => ({
      id: el.dataset.stageId,
      name: $('[data-stage-field="name"]', el).value.trim(),
      assistantId: $('[data-stage-field="assistantId"]', el).value,
      output: $('[data-stage-field="output"]', el).value.trim(),
      prompt: $('[data-stage-field="prompt"]', el).value.trim(),
      wordTemplate: $('[data-stage-field="wordTemplate"]', el).value.trim(),
      ...($('[data-stage-field="optional"]', el).checked ? { optional: true } : {}),
    }));
    pipeline.gateCheck = $('#pipelineGateEnabled', wrap).checked ? {
      assistantId: $('#pipelineGateAgent', wrap).value,
      prompt: $('#pipelineGatePrompt', wrap).value.trim(),
    } : null;
  };
  const redraw = (wrap) => {
    $('.modal-body', wrap).innerHTML = pipelineEditorHTML(pipeline);
    $('#pipelineGateEnabled', wrap).addEventListener('change', (e) => { $('#pipelineGateFields', wrap).hidden = !e.target.checked; });
    $('.pipeline-editor', wrap).addEventListener('click', (e) => {
      const button = e.target.closest('[data-add-stage],[data-move-stage],[data-remove-stage]');
      if (!button) return;
      readForm(wrap);
      if ('addStage' in button.dataset) {
        const n = pipeline.stages.length + 1;
        pipeline.stages.push({ id: `stage-${Date.now().toString(36)}`, name: `Stage ${n}`, assistantId: firstAgent?.id || '', output: `${String(n).padStart(2, '0')}-stage-${n}.md`, prompt: 'Create the next deliverable using {{prev}} as the approved input. Preserve traceability.' });
      } else {
        const index = Number(button.closest('.pipeline-stage').dataset.stageIndex);
        if ('removeStage' in button.dataset) pipeline.stages.splice(index, 1);
        else {
          const next = index + Number(button.dataset.moveStage);
          if (next >= 0 && next < pipeline.stages.length) [pipeline.stages[index], pipeline.stages[next]] = [pipeline.stages[next], pipeline.stages[index]];
        }
      }
      redraw(wrap);
    });
  };
  modal({ title: isEdit ? 'Customize workflow' : 'Create workflow', sub: 'Configure the stages and review checks for your delivery process.', wide: true,
    body: pipelineEditorHTML(pipeline),
    actions: [{ label: 'Cancel' }, { label: isEdit ? 'Save workflow' : 'Create workflow', primary: true, run: async (wrap) => {
      readForm(wrap);
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? `/api/pipelines/${encodeURIComponent(pipeline.id)}` : '/api/pipelines';
      const saved = await api(url, { method, body: pipeline });
      S.pipelines = await api('/api/pipelines');
      await renderRuns();
      toast(isEdit ? 'Workflow saved' : 'Workflow created');
      return saved;
    } }],
    onOpen: redraw,
  });
}

async function startNewRun(pipelineId) {
  try {
    const pipeline = S.pipelines.find((p) => p.id === pipelineId);
    if (!pipeline) throw new Error('The lifecycle pipeline is not available.');
    const { files } = await api(`/api/folder/files?workspace=${encodeURIComponent(S.settings.workspace)}&all=1`);
    modal({ title: `Start ${pipeline.name}`, sub: 'Choose a unique run name and the source documents in your project folder.', wide: true,
      body: `<label>Run name<input class="input" id="runName" maxlength="80"></label><div class="section-label"><span>Source files</span></div><div class="file-picker">${files.map((f, i) => `<label><input type="checkbox" name="run-source" value="${i}"> ${esc(f.rel)}</label>`).join('') || 'No files found.'}</div>`,
      actions: [{ label: 'Cancel' }, { label: 'Create run', primary: true, run: async (el) => {
        const name = $('#runName', el).value.trim();
        const sources = $$('input[name="run-source"]:checked', el).map((x) => files[+x.value].path);
        if (!name || !sources.length) { toast('Enter a name and choose source files', 'alert'); return false; }
        const run = await api('/api/runs', { method: 'POST', body: { pipelineId: pipeline.id, name, sources, workspace: S.settings.workspace } });
        go(`run/${run.id}`);
      } }] });
  } catch (e) { toast(e.message, 'alert'); }
}

let runTimer = null;
async function renderRun(id, selected = null) {
  clearTimeout(runTimer);
  S.view = 'run'; setNav('runs');
  try {
    const run = await api(`/api/runs/${encodeURIComponent(id)}`);
    if (location.hash.replace(/^#\/?/, '') !== `run/${id}`) return;
    const pipeline = run.pipelineDefinition || S.pipelines.find((p) => p.id === run.pipelineId);
    if (!pipeline) throw new Error('The pipeline definition is missing.');
    const stage = run.stages.find((s) => s.id === selected) || run.stages.find((s) => !['approved', 'skipped'].includes(s.status)) || run.stages[run.stages.length - 1];
    const def = pipeline.stages.find((s) => s.id === stage.id);
    const index = run.stages.indexOf(stage), gatePrev = run.stages[index - 1];
    const prev = run.stages.slice(0, index).reverse().find((s) => s.status !== 'skipped');
    $('#view').innerHTML = `<div class="page"><div class="page-inner">
      <a data-back-runs>← Lifecycle runs</a><h1>${esc(run.name)}</h1><p>${esc(pipeline.name)} · ${esc(run.workspace)}</p>
      <div class="run-stepper">${run.stages.map((s, i) => `<button class="run-step ${s.id === stage.id ? 'selected' : ''}" data-stage="${esc(s.id)}"><b>${i + 1}. ${esc(pipeline.stages[i]?.name || s.id)}${pipeline.stages[i]?.optional ? ' (optional)' : ''}</b><span>${esc(s.status)}</span></button>`).join('')}</div>
      <h2>${esc(def.name)}</h2><p>Status: <b>${esc(stage.status)}</b>${stage.unapprovedInputs ? ' · Based on unapproved inputs' : ''}</p>
      ${stage.error ? `<p class="run-error">${esc(stage.error)}</p>` : ''}
      ${stage.approvedAt ? `<p>Approved by ${esc(stage.approvedBy)} on ${esc(new Date(stage.approvedAt).toLocaleString())}</p>` : ''}
      <div class="run-actions">
        ${['pending', 'rework'].includes(stage.status) ? `<button class="btn primary" data-run-action="start">${stage.status === 'rework' ? 'Run again' : 'Start stage'}</button>` : ''}
        ${def.optional && ['pending', 'rework'].includes(stage.status) ? '<button class="btn soft" data-run-action="skip">Skip optional stage</button>' : ''}
        ${stage.status === 'skipped' ? '<button class="btn soft" data-run-action="include">Add this stage to the run</button>' : ''}
        ${stage.conversationId && stage.status !== 'skipped' ? `<button class="btn soft" data-open-chat="${esc(stage.conversationId)}">Open stage chat</button>` : ''}
        ${['review', 'approved'].includes(stage.status) ? `<button class="btn soft" data-run-file="${esc(stage.outputPath)}">Open output</button>` : ''}
        ${stage.status === 'review' ? `${pipeline.gateCheck ? `<button class="btn soft" data-run-action="check" ${stage.checkRunning ? 'disabled' : ''}>${stage.checkRunning ? 'Checking…' : 'Traceability check'}</button>` : ''}<button class="btn primary" data-run-action="approve">Approve</button>` : ''}
        ${stage.status === 'approved' ? `<button class="btn soft" data-run-word title="${def.wordTemplate ? `Uses ${esc(def.wordTemplate)}` : "Uses Lumen's built-in Word styles"}">${def.wordTemplate ? 'Save as Word (program template)' : 'Save as Word'}</button>` : ''}
        ${['review', 'approved'].includes(stage.status) ? '<button class="btn soft" data-run-action="rework">Send back</button>' : ''}
        ${stage.status === 'approved' && adoReady() ? `<button class="btn soft" data-run-ado="${stage.id === 'stories' ? 'workitems' : 'wiki'}">${icon(stage.id === 'stories' ? 'board' : 'book')}${stage.id === 'stories' ? 'Create work items in Azure DevOps' : 'Publish to the Azure DevOps wiki'}</button>` : ''}
      </div>
      ${stage.checkSummary ? `<div class="run-findings"><h3>Traceability findings</h3><div class="md">${md(stage.checkSummary)}</div>${stage.gateConversationId ? `<button class="btn ghost sm" data-open-chat="${esc(stage.gateConversationId)}">Open check chat</button>` : ''}</div>` : ''}
      ${gatePrev && !['approved', 'skipped'].includes(gatePrev.status) && stage.status === 'pending' ? '<p>Previous stage is not approved. Starting requires an explicit override and the output will be labelled.</p>' : ''}
      </div></div>`;
    highlight($('#view'));
    $('#view').onclick = async (e) => {
      const b = e.target.closest('[data-back-runs],[data-stage],[data-run-action],[data-open-chat],[data-run-file],[data-run-ado],[data-run-word]'); if (!b) return;
      if ('backRuns' in b.dataset) return go('runs');
      if (b.dataset.runAdo) {
        b.disabled = true;
        try {
          const r = await api(`/api/runs/${id}/stages/${stage.id}/azure-devops`, { method: 'POST', body: { target: b.dataset.runAdo } });
          await refreshConvs();
          toast('Lumen is preparing the changes. You approve them in the chat.', 'spark');
          return go(`c/${r.conversationId}`);
        } catch (err) { toast(err.message, 'alert'); b.disabled = false; return; }
      }
      if (b.dataset.stage) return renderRun(id, b.dataset.stage);
      if (b.dataset.openChat) return go(`c/${b.dataset.openChat}`);
      if (b.dataset.runFile) return api('/api/folder/open', { method: 'POST', body: { path: b.dataset.runFile, workspace: run.workspace } });
      if ('runWord' in b.dataset) {
        b.disabled = true;
        try {
          const r = await api(`/api/runs/${id}/stages/${stage.id}/word`, { method: 'POST', body: {} });
          if (r.warning) toast(r.warning, 'alert');
          modal({ title: 'Saved as Word', sub: `${r.name}${r.template ? ` · ${r.template}` : ''}`, actions: [{ label: 'Close' }, { label: 'Open', primary: true, run: () => api('/api/folder/open', { method: 'POST', body: { path: r.path, workspace: run.workspace } }) }] });
        } catch (err) { toast(err.message, 'alert'); }
        b.disabled = false;
        return;
      }
      const operation = b.dataset.runAction;
      const act = async (override = false) => {
        await api(`/api/runs/${id}/stages/${stage.id}/${operation}`, { method: 'POST', body: { override } });
        if (operation === 'start' || operation === 'check') await refreshConvs();
        if (operation === 'rework' && stage.conversationId) return go(`c/${stage.conversationId}`);
        renderRun(id, stage.id);
      };
      if (operation === 'start' && gatePrev && !['approved', 'skipped'].includes(gatePrev.status)) {
        return modal({ title: 'Use unapproved inputs?', sub: 'The output will be labelled as based on unapproved inputs.', actions: [{ label: 'Cancel' }, { label: 'Start anyway', primary: true, run: () => act(true) }] });
      }
      b.disabled = true;
      try { await act(); } catch (err) { toast(err.message, 'alert'); b.disabled = false; }
    };
    if (run.stages.some((s) => s.status === 'running' || s.checkRunning)) runTimer = setTimeout(() => { if (S.view === 'run') renderRun(id, stage.id); }, 2000);
  } catch (e) { toast(e.message, 'alert'); }
}

async function showDiff(file, mid, workspace) {
  try {
    const r = await api(`/api/file-pair?workspace=${encodeURIComponent(workspace)}&file=${encodeURIComponent(file)}&message=${encodeURIComponent(mid || '')}`);
    const compare = async (other) => {
      const currentIsOriginal = !/ \(updated\)\.[^.]+$/i.test(file) && / \(updated\)\.[^.]+$/i.test(other);
      const a = currentIsOriginal ? file : other, b = currentIsOriginal ? other : file;
      const result = await api(`/api/diff?workspace=${encodeURIComponent(workspace)}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
      modal({ title: 'File changes', sub: `${baseName(a)} → ${baseName(b)} · Up to 500 changes`, wide: true,
        body: result.changes.length ? `<div class="diff-table"><table><thead><tr><th>Sheet / section</th><th>Cell / field</th><th>Before</th><th>After</th></tr></thead><tbody>${result.changes.map((c) => `<tr><td>${esc(c.sheet)}</td><td>${esc(c.cell)}</td><td>${esc(c.before)}</td><td>${esc(c.after)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No cell or task changes found.</p>', actions: [{ label: 'Done', primary: true }] });
    };
    if (r.pair) await compare(r.pair);
    else await chooseWorkspaceFiles(workspace, 'Compare with…', (files) => compare(files[0].path), false);
  } catch (e) { toast(e.message, 'alert'); }
}
// ---------------------------------------------------------------- assistants page

export { renderRun, renderRuns, showDiff };
