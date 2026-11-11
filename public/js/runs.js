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

// Mirrors stageDeps in lib/server/lifecycle.js: without `after`, a stage follows the one above it.
function stageDeps(defs, id) {
  const i = defs.findIndex((s) => s.id === id);
  if (i < 0) return [];
  return Array.isArray(defs[i].after) ? defs[i].after.filter((x) => defs.slice(0, i).some((s) => s.id === x)) : i ? [defs[i - 1].id] : [];
}

// A left-to-right flow diagram: each stage sits one column after the latest stage it starts after,
// so stages that can run at the same time share a column.
function flowHTML(defs, { run = null, selected = '' } = {}) {
  if (!defs.length) return '';
  const W = 168, H = 52, GX = 44, GY = 14, PAD = 8;
  const col = {}, rows = [];
  for (const d of defs) {
    const c = Math.max(-1, ...stageDeps(defs, d.id).map((x) => col[x] ?? -1)) + 1;
    col[d.id] = c; (rows[c] ||= []).push(d.id);
  }
  const tallest = Math.max(...rows.map((r) => r.length));
  let height = tallest * H + (tallest - 1) * GY + PAD * 2;
  const pos = {};
  rows.forEach((ids, c) => ids.forEach((id, r) => {
    const top = (height - (ids.length * H + (ids.length - 1) * GY)) / 2;
    pos[id] = { x: PAD + c * (W + GX), y: top + r * (H + GY) };
  }));
  const width = PAD * 2 + rows.length * W + (rows.length - 1) * GX;
  // A link that skips columns would cut through the cards in between, so it runs in its own lane above or below them
  // (whichever side is nearer its ends). Lanes stack outwards so several long links don't overlap.
  const LANE = 10, used = { above: 0, below: 0 };
  const links = defs.flatMap((d) => stageDeps(defs, d.id).map((from) => {
    const span = col[d.id] - col[from];
    if (span < 2) return { from, to: d.id };
    const between = rows.slice(col[from] + 1, col[d.id]).flat().map((id) => pos[id].y);
    const top = Math.min(...between), bottom = Math.max(...between) + H;
    const mid = (pos[from].y + pos[d.id].y + H) / 2;
    const side = mid - top <= bottom - mid ? 'above' : 'below';
    const lane = side === 'above' ? top - GY / 2 - LANE * used.above++ : bottom + GY / 2 + LANE * used.below++;
    return { from, to: d.id, lane };
  }));
  // Grow the drawing to fit lanes that fall outside the cards.
  const lanes = links.filter((l) => l.lane !== undefined).map((l) => l.lane);
  const shift = Math.max(0, PAD - Math.min(PAD, ...lanes));
  if (shift) { for (const id in pos) pos[id].y += shift; links.forEach((l) => { if (l.lane !== undefined) l.lane += shift; }); }
  height = Math.max(height + shift, ...lanes.map((y) => y + shift + PAD));
  const edges = links.map(({ from, to, lane }) => {
    const d = defs.find((x) => x.id === to);
    const a = pos[from], b = pos[to], x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2;
    const q = GX / 2;
    const path = lane === undefined ? `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2 - 4} ${y2}`
      : `M${x1} ${y1} C${x1 + q / 2} ${y1} ${x1 + q / 2} ${lane} ${x1 + q} ${lane} L${x2 - q} ${lane} C${x2 - q / 2} ${lane} ${x2 - q / 2} ${y2} ${x2 - 4} ${y2}`;
    const names = `${defs.find((x) => x.id === from)?.name || from} → ${d.name}`;
    return `<g class="flow-edge"><path d="${path}" marker-end="url(#flowArrow)"/>${run ? '' : `<path class="flow-edge-hit" d="${path}" data-link-from="${esc(from)}" data-link-to="${esc(d.id)}"><title>${esc(names)}: click to remove this link</title></path>`}</g>`;
  }).join('');
  const nodes = defs.map((d, i) => {
    const s = run?.stages.find((x) => x.id === d.id);
    const { x, y } = pos[d.id];
    const status = s?.status || '';
    const label = d.name.length > 22 ? `${d.name.slice(0, 21)}…` : d.name;
    return `<g class="flow-node${status ? ` st-${esc(status)}` : ''}${d.id === selected ? ' selected' : ''}${d.optional ? ' optional' : ''}" data-flow-id="${esc(d.id)}" ${run ? `data-stage="${esc(d.id)}" tabindex="0" role="button"` : ''} transform="translate(${x} ${y})">
      <title>${esc(d.name)}${d.optional ? ' (optional)' : ''}${status ? ` · ${esc(status)}` : ''}</title>
      ${run ? '' : `<line class="flow-mark flow-mark-before" x1="${-GX / 2}" y1="-6" x2="${-GX / 2}" y2="${H + 6}"/><line class="flow-mark flow-mark-after" x1="${W + GX / 2}" y1="-6" x2="${W + GX / 2}" y2="${H + 6}"/>`}
      <rect width="${W}" height="${H}" rx="10"/><text x="12" y="21" class="flow-name">${i + 1}. ${esc(label)}</text>
      <text x="12" y="39" class="flow-sub">${esc(status || (d.optional ? 'optional' : (d.output || '')))}</text>
      ${run ? '' : `<circle class="flow-handle" cx="${W}" cy="${H / 2}" r="6"><title>Drag to another stage to make it start after this one</title></circle>`}</g>`;
  }).join('');
  return `<div class="flow-diagram"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Workflow diagram">
    <defs><marker id="flowArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L8 4L0 8z"/></marker></defs>
    <g class="flow-edges">${edges}</g>${nodes}<path class="flow-temp" d=""/></svg></div>`;
}

// Drag-and-drop in the editor's diagram. `where` is 'before' or 'after' the target (in sequence) or 'with' it (side by
// side). The moved stage is first taken out of the flow (stages that followed it inherit what it started after), then
// placed, and the list is re-ordered so every stage still comes after the stages it starts after.
function moveStage(stages, moved, target, where) {
  if (moved === target) return stages;
  const deps = new Map(stages.map((st) => [st.id, stageDeps(stages, st.id)]));
  const uniq = (a) => [...new Set(a)];
  const own = deps.get(moved);
  for (const [id, d] of deps) if (id !== moved && d.includes(moved)) deps.set(id, uniq([...d.filter((v) => v !== moved), ...own]));
  const others = [...deps.keys()].filter((id) => id !== moved && id !== target);
  if (where === 'with') {
    deps.set(moved, [...deps.get(target)]);
    for (const id of others) if (deps.get(id).includes(target)) deps.set(id, uniq([...deps.get(id), moved]));
  } else if (where === 'after') {
    deps.set(moved, [target]);
    for (const id of others) if (deps.get(id).includes(target)) deps.set(id, uniq(deps.get(id).map((v) => v === target ? moved : v)));
  } else {
    deps.set(moved, [...deps.get(target)]);
    deps.set(target, [moved]);
  }
  const rank = new Map(stages.map((st, i) => [st.id, i]));
  rank.set(moved, rank.get(target) + (where === 'before' ? -0.5 : 0.5));
  return orderStages(stages, deps, rank);
}

// Every stage `id` starts after, directly or through other stages.
function upstream(deps, id, seen = new Set()) {
  for (const v of deps.get(id) || []) if (!seen.has(v)) { seen.add(v); upstream(deps, v, seen); }
  return seen;
}

// Make `to` also start after `from`. Returns null when that would make a loop.
function linkStages(stages, from, to) {
  const deps = new Map(stages.map((st) => [st.id, stageDeps(stages, st.id)]));
  if (from === to || upstream(deps, from).has(to)) return null;
  if (deps.get(to).includes(from)) return stages;
  deps.set(to, [...deps.get(to), from]);
  return orderStages(stages, deps, new Map(stages.map((st, i) => [st.id, i])), false);
}

// Remove one link; a stage left with none starts from the source files.
function unlinkStages(stages, from, to) {
  const deps = new Map(stages.map((st) => [st.id, stageDeps(stages, st.id)]));
  deps.set(to, deps.get(to).filter((v) => v !== from));
  return orderStages(stages, deps, new Map(stages.map((st, i) => [st.id, i])), false);
}

// Turn a dependency map back into a stage list: optionally drop links already implied by another one (d after a and c,
// where c is already after a, becomes d after c), order stages so each follows what it starts after (keeping `rank`
// order where free), and store `after` only where it differs from "the stage above".
function orderStages(stages, deps, rank, reduce = true) {
  if (reduce) for (const [id, d] of [...deps]) deps.set(id, d.filter((v) => !d.some((w) => w !== v && upstream(deps, w).has(v))));
  const order = [], left = new Set(deps.keys());
  while (left.size) {
    const next = [...left].filter((id) => deps.get(id).every((d) => !left.has(d))).sort((a, b) => rank.get(a) - rank.get(b))[0];
    if (!next) return stages; // a loop: keep the workflow unchanged rather than break it
    order.push(next); left.delete(next);
  }
  return order.map((id, i) => {
    const st = { ...stages.find((x) => x.id === id) }, d = deps.get(id), fallback = i ? [order[i - 1]] : [];
    if (d.length === fallback.length && d.every((x) => fallback.includes(x))) delete st.after; else st.after = d;
    return st;
  });
}

// One-line summary shown in a collapsed stage header.
function stageSummary(s) {
  const agent = S.assistants.find((a) => a.id === s.assistantId);
  return [s.name, agent && `${agent.emoji || ''} ${agent.name}`.trim(), s.output, s.optional && 'optional'].filter(Boolean).join(' · ');
}

function pipelineEditorHTML(pipeline, collapsed = new Set()) {
  return `<div class="pipeline-editor">
    <div class="pipeline-editor-top"><label>Workflow name<input class="input" id="pipelineName" maxlength="80" value="${esc(pipeline.name)}"></label><label>Icon<input class="input" id="pipelineEmoji" maxlength="8" value="${esc(pipeline.emoji || '🔄')}"></label></div>
    <div class="section-label"><span>Flow</span></div>
    <p class="pipeline-help">Drag a stage onto another one: drop on its left or right edge to put it before or after, or in the middle to run alongside it. To connect two stages, drag from the dot on a stage's right edge to another stage. Click a link to remove it.</p>
    <div id="pipelineFlow">${flowHTML(pipeline.stages)}</div>
    <div class="section-label"><span>Stages, in order</span><div class="pipeline-stage-tools"><button class="btn ghost sm" type="button" data-collapse-all="${pipeline.stages.every((s) => collapsed.has(s.id)) ? '0' : '1'}">${pipeline.stages.every((s) => collapsed.has(s.id)) ? 'Expand all' : 'Collapse all'}</button><button class="btn soft sm" type="button" data-add-stage>${icon('plus')}Add stage</button></div></div>
    <p class="pipeline-help">Use {{sources}} for the selected project files and {{prev}} for the approved outputs of the stages it starts after. By default a stage starts after the one above it; tick other stages under "Starts after" to run stages side by side, or untick all to work from the source files only. After a skipped stage, the stages that follow it use what it would have used. Optional stages can be skipped during a run.</p>
    <div class="pipeline-stage-list">${pipeline.stages.map((s, i) => `<section class="pipeline-stage${collapsed.has(s.id) ? ' collapsed' : ''}" data-stage-index="${i}" data-stage-id="${esc(s.id)}">
      <div class="pipeline-stage-head"><button class="pipeline-stage-toggle" type="button" data-toggle-stage aria-expanded="${collapsed.has(s.id) ? 'false' : 'true'}" title="Show or hide this stage's settings"><span class="pipeline-chevron" aria-hidden="true">▾</span><b>Stage ${i + 1}</b><span class="pipeline-stage-summary">${esc(stageSummary(s))}</span></button><div><button class="btn ghost sm" type="button" data-move-stage="-1" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button><button class="btn ghost sm" type="button" data-move-stage="1" ${i === pipeline.stages.length - 1 ? 'disabled' : ''} title="Move down">↓</button><button class="btn ghost sm" type="button" data-remove-stage title="Remove stage">${icon('trash')}</button></div></div>
      <div class="pipeline-stage-body">
      <label>Stage name<input class="input" data-stage-field="name" maxlength="80" value="${esc(s.name)}"></label>
      <label>Agent<select class="select" data-stage-field="assistantId">${S.assistants.map((a) => `<option value="${esc(a.id)}" ${a.id === s.assistantId ? 'selected' : ''}>${esc(a.emoji)} ${esc(a.name)}</option>`).join('')}</select></label>
      <label>Output filename<input class="input" data-stage-field="output" maxlength="120" value="${esc(s.output)}" placeholder="01-deliverable.md"></label>
      <label>Instructions<textarea class="input" data-stage-field="prompt" rows="3" maxlength="8000">${esc(s.prompt)}</textarea></label>
      <label>Word template path <span class="muted">(optional, relative to the project folder)</span><input class="input" data-stage-field="wordTemplate" maxlength="240" value="${esc(s.wordTemplate || '')}" placeholder="Templates/Design Template.dotx"></label>
      ${i ? `<fieldset class="pipeline-after"><legend>Starts after</legend>${pipeline.stages.slice(0, i).map((p) => `<label class="pipeline-check"><input type="checkbox" data-after="${esc(p.id)}" ${stageDeps(pipeline.stages, s.id).includes(p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}<span class="muted">${stageDeps(pipeline.stages, s.id).length ? '' : 'None: starts from the source files'}</span></fieldset>` : ''}
      <label class="pipeline-check"><input type="checkbox" data-stage-field="optional" ${s.optional ? 'checked' : ''}> Optional stage (can be skipped)</label>
      </div>
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
  // Existing workflows open with stages collapsed so the diagram and the list fit on screen; new ones open expanded.
  const collapsed = new Set(existing && pipeline.stages.length > 1 ? pipeline.stages.map((s) => s.id) : []);
  const readForm = (wrap) => {
    pipeline.name = $('#pipelineName', wrap).value.trim();
    pipeline.emoji = $('#pipelineEmoji', wrap).value.trim();
    const before = pipeline.stages;
    pipeline.stages = $$('.pipeline-stage', wrap).map((el, i) => ({
      id: el.dataset.stageId,
      ...(i ? { after: $$('[data-after]', el).filter((x) => x.checked).map((x) => x.dataset.after) } : {}),
      name: $('[data-stage-field="name"]', el).value.trim(),
      assistantId: $('[data-stage-field="assistantId"]', el).value,
      output: $('[data-stage-field="output"]', el).value.trim(),
      prompt: $('[data-stage-field="prompt"]', el).value.trim(),
      wordTemplate: $('[data-stage-field="wordTemplate"]', el).value.trim(),
      ...($('[data-stage-field="optional"]', el).checked ? { optional: true } : {}),
    }));
    // Keep the default "after the stage above" implicit, so moving a stage keeps a sequential workflow sequential.
    pipeline.stages.forEach((st, i) => {
      if (!st.after) return;
      const fallback = i ? [pipeline.stages[i - 1].id] : [];
      const wasDefault = !Array.isArray(before.find((b) => b.id === st.id)?.after);
      if (wasDefault && st.after.length === fallback.length && st.after.every((x) => fallback.includes(x))) delete st.after;
    });
    pipeline.gateCheck = $('#pipelineGateEnabled', wrap).checked ? {
      assistantId: $('#pipelineGateAgent', wrap).value,
      prompt: $('#pipelineGatePrompt', wrap).value.trim(),
    } : null;
  };
  let flowDragged = false;
  const bindFlowDrag = (wrap) => {
    const flow = $('#pipelineFlow', wrap);
    let drag = null;
    const clear = () => $$('.flow-node', flow).forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-with', 'drop-link', 'drop-bad'));
    const toSvg = (svg, x, y) => { const pt = svg.createSVGPoint(); pt.x = x; pt.y = y; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
    const end = () => {
      if (!drag) return;
      drag.ghost?.remove(); drag.node.classList.remove('dragging'); flow.classList.remove('is-dragging', 'is-linking'); clear();
      $('.flow-temp', flow)?.setAttribute('d', '');
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', end);
      drag = null;
    };
    flow.addEventListener('pointerdown', (e) => {
      const node = e.target.closest('.flow-node');
      if (!node || e.button !== 0) return;
      drag = { id: node.dataset.flowId, node, x: e.clientX, y: e.clientY, started: false, target: null, link: !!e.target.closest('.flow-handle') };
      if (drag.link) e.preventDefault();
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', end);
    });
    function move(e) {
      if (!drag) return;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
        drag.started = true;
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'flow-ghost';
        document.body.append(drag.ghost);
        if (drag.link) flow.classList.add('is-linking'); else { drag.node.classList.add('dragging'); flow.classList.add('is-dragging'); }
      }
      const name = pipeline.stages.find((x) => x.id === drag.id)?.name || '';
      clear(); drag.target = null;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('#pipelineFlow .flow-node');
      let label = name;
      if (drag.link) {
        const svg = $('svg', flow), h = $('.flow-handle', drag.node).getBoundingClientRect();
        const a = toSvg(svg, h.left + h.width / 2, h.top + h.height / 2), b = toSvg(svg, e.clientX, e.clientY), mx = (a.x + b.x) / 2;
        $('.flow-temp', flow).setAttribute('d', `M${a.x} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`);
        label = `Connect ${name} to…`;
        if (over && over !== drag.node) {
          const tname = pipeline.stages.find((x) => x.id === over.dataset.flowId)?.name || '';
          const ok = !!linkStages(pipeline.stages, drag.id, over.dataset.flowId);
          over.classList.add(ok ? 'drop-link' : 'drop-bad');
          drag.target = ok ? { id: over.dataset.flowId, where: 'link' } : null;
          label = ok ? `${tname} starts after ${name}` : `Can't connect: ${tname} comes before ${name}`;
        }
      } else if (over && over !== drag.node) {
        const r = $('rect', over).getBoundingClientRect(), f = (e.clientX - r.left) / r.width;
        const where = f < 0.3 ? 'before' : f > 0.7 ? 'after' : 'with';
        over.classList.add(`drop-${where}`);
        drag.target = { id: over.dataset.flowId, where };
        const tname = pipeline.stages.find((x) => x.id === drag.target.id)?.name || '';
        label = `${name} → ${where === 'with' ? 'alongside' : where} ${tname}`;
      }
      drag.ghost.textContent = label;
      drag.ghost.style.left = `${e.clientX + 14}px`; drag.ghost.style.top = `${e.clientY + 14}px`;
    }
    function up() {
      if (!drag) return;
      const { started, target, id } = drag;
      end();
      if (!started) return;
      flowDragged = true; setTimeout(() => { flowDragged = false; }, 0);
      if (!target) return;
      readForm(wrap);
      pipeline.stages = target.where === 'link' ? linkStages(pipeline.stages, id, target.id) : moveStage(pipeline.stages, id, target.id, target.where);
      redraw(wrap);
    }
  };
  const redraw = (wrap) => {
    $('.modal-body', wrap).innerHTML = pipelineEditorHTML(pipeline, collapsed);
    bindFlowDrag(wrap);
    $('#pipelineGateEnabled', wrap).addEventListener('change', (e) => { $('#pipelineGateFields', wrap).hidden = !e.target.checked; });
    $('.pipeline-editor', wrap).addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-toggle-stage]');
      if (toggle) {
        const el = toggle.closest('.pipeline-stage'), open = el.classList.toggle('collapsed') === false;
        if (open) collapsed.delete(el.dataset.stageId); else collapsed.add(el.dataset.stageId);
        toggle.setAttribute('aria-expanded', String(open));
        const all = $('[data-collapse-all]', wrap), every = $$('.pipeline-stage', wrap).every((x) => x.classList.contains('collapsed'));
        all.dataset.collapseAll = every ? '0' : '1'; all.textContent = every ? 'Expand all' : 'Collapse all';
        return;
      }
      const hit = e.target.closest('#pipelineFlow [data-link-from]');
      if (hit) {
        readForm(wrap);
        pipeline.stages = unlinkStages(pipeline.stages, hit.dataset.linkFrom, hit.dataset.linkTo);
        return redraw(wrap);
      }
      const node = e.target.closest('#pipelineFlow .flow-node');
      if (node && flowDragged) return;
      if (node) {
        const el = $$('.pipeline-stage', wrap)[$$('#pipelineFlow .flow-node', wrap).indexOf(node)];
        if (el?.classList.contains('collapsed')) $('[data-toggle-stage]', el).click();
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const button = e.target.closest('[data-add-stage],[data-move-stage],[data-remove-stage],[data-collapse-all]');
      if (!button) return;
      readForm(wrap);
      if (button.dataset.collapseAll) {
        if (button.dataset.collapseAll === '1') pipeline.stages.forEach((st) => collapsed.add(st.id)); else collapsed.clear();
      } else if ('addStage' in button.dataset) {
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
      // A stage can only start after stages above it.
      pipeline.stages.forEach((st, i) => { if (st.after) st.after = st.after.filter((x) => pipeline.stages.slice(0, i).some((p) => p.id === x)); });
      redraw(wrap);
    });
    // Refresh the diagram as dependencies and names change.
    $('.pipeline-editor', wrap).addEventListener('change', (e) => {
      if (!e.target.matches('[data-after],[data-stage-field]')) return;
      readForm(wrap);
      $('#pipelineFlow', wrap).innerHTML = flowHTML(pipeline.stages);
      const stageEl = e.target.closest('.pipeline-stage');
      if (stageEl) { const st = pipeline.stages.find((x) => x.id === stageEl.dataset.stageId); if (st) $('.pipeline-stage-summary', stageEl).textContent = stageSummary(st); }
      const box = e.target.closest('.pipeline-after');
      if (box) $('.muted', box).textContent = $$('[data-after]', box).some((x) => x.checked) ? '' : 'None: starts from the source files';
    });
  };
  modal({ title: isEdit ? 'Customize workflow' : 'Create workflow', sub: 'Configure the stages and review checks for your delivery process.', wide: true, className: 'modal-workflow',
    body: pipelineEditorHTML(pipeline, collapsed),
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
    const depsOf = (sid) => stageDeps(pipeline.stages, sid).map((d) => run.stages.find((s) => s.id === d)).filter(Boolean);
    const gateOpen = (sid) => depsOf(sid).every((s) => ['approved', 'skipped'].includes(s.status));
    const ready = run.stages.filter((s) => s.status === 'pending' && gateOpen(s.id));
    $('#view').innerHTML = `<div class="page"><div class="page-inner">
      <a data-back-runs>← Lifecycle runs</a><h1>${esc(run.name)}</h1><p>${esc(pipeline.name)} · ${esc(run.workspace)}</p>
      ${flowHTML(pipeline.stages, { run, selected: stage.id })}
      ${ready.length > 1 ? `<div class="run-actions"><button class="btn soft" data-start-ready>Start all ${ready.length} ready stages</button></div>` : ''}
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
      ${!gateOpen(stage.id) && stage.status === 'pending' ? `<p>Waiting for approval of ${depsOf(stage.id).filter((s) => !['approved', 'skipped'].includes(s.status)).map((s) => esc(pipeline.stages.find((d) => d.id === s.id)?.name || s.id)).join(', ')}. Starting now requires an explicit override and the output will be labelled.</p>` : ''}
      </div></div>`;
    highlight($('#view'));
    $('#view').onclick = async (e) => {
      const b = e.target.closest('[data-back-runs],[data-start-ready],[data-stage],[data-run-action],[data-open-chat],[data-run-file],[data-run-ado],[data-run-word]'); if (!b) return;
      if ('backRuns' in b.dataset) return go('runs');
      if ('startReady' in b.dataset) {
        b.disabled = true;
        const failed = [];
        for (const s of ready) { try { await api(`/api/runs/${id}/stages/${s.id}/start`, { method: 'POST', body: {} }); } catch (err) { failed.push(err.message); } }
        if (failed.length) toast(failed[0], 'alert');
        await refreshConvs();
        return renderRun(id, stage.id);
      }
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
      if (operation === 'start' && !gateOpen(stage.id)) {
        return modal({ title: 'Use unapproved inputs?', sub: 'The output will be labelled as based on unapproved inputs.', actions: [{ label: 'Cancel' }, { label: 'Start anyway', primary: true, run: () => act(true) }] });
      }
      b.disabled = true;
      try { await act(); } catch (err) { toast(err.message, 'alert'); b.disabled = false; }
    };
    $('#view').onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.flow-node[data-stage]')) { e.preventDefault(); renderRun(id, e.target.dataset.stage); } };
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
