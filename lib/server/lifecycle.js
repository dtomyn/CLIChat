// Lumen server: Guided lifecycle runs: pipeline validation, starting stage turns and file diffs.
const fs = require('fs');
const path = require('path');
const store = require('../store');
const excel = require('../../tools/excel');
const project = require('../../tools/project');
const ROOT = path.join(__dirname, '../..');
const { runTurn, running } = require('./chat');
const { workspaceFile } = require('./workspace');
const { clearUnapproved, labelUnapproved } = require('./stage-output');

// Called on every GET of a run (the run page polls it), so it only writes when a stage was actually interrupted.
function reconcileRun(run) {
  let changed = false;
  for (const stage of run.stages) {
    if (stage.status === 'running' && !running.has(stage.conversationId)) {
      stage.status = 'rework';
      stage.error = 'The stage was interrupted. Open its chat to continue or start it again.';
      changed = true;
    }
    if (stage.checkRunning && !running.has(stage.gateConversationId)) { stage.checkRunning = false; changed = true; }
  }
  return changed ? store.runs.save(run) : run;
}

// The Word template for a lifecycle stage. Saved pipelines predate the setting, so fall back to the built-in one.
const DEFAULT_PIPELINES = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'defaults', 'pipelines.json'), 'utf8')); } catch { return []; } })();
function stageWordTemplate(pipelineId, def) {
  if (def.wordTemplate !== undefined) return def.wordTemplate || '';
  return DEFAULT_PIPELINES.find((p) => p.id === pipelineId)?.stages.find((s) => s.id === def.id)?.wordTemplate || '';
}

function validatePipeline(body, id) {
  const invalid = (error) => ({ error });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Enter a workflow definition.');
  const name = String(body.name || '').trim();
  const emoji = String(body.emoji || '').trim();
  if (!name || name.length > 80) return invalid('Give the workflow a name of 1 to 80 characters.');
  if (emoji.length > 8 || /[\x00-\x1f]/.test(emoji)) return invalid('Choose a short workflow icon.');
  if (!Array.isArray(body.stages) || !body.stages.length || body.stages.length > 30) return invalid('A workflow needs between 1 and 30 stages.');
  const ids = new Set();
  const stages = [];
  for (const stage of body.stages) {
    if (!stage || typeof stage !== 'object' || typeof stage.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/i.test(stage.id) || ids.has(stage.id)) return invalid('Each stage needs a unique, simple identifier.');
    ids.add(stage.id);
    const stageName = String(stage.name || '').trim();
    const output = String(stage.output || '').trim();
    const prompt = String(stage.prompt || '').trim();
    if (!stageName || stageName.length > 80) return invalid('Give each stage a name of 1 to 80 characters.');
    if (output.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,115}\.(md|markdown)$/i.test(output) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(output)) return invalid('Each output must be a valid Markdown filename, such as 01-requirements.md.');
    if (!prompt || prompt.length > 8000) return invalid('Each stage needs instructions of 1 to 8,000 characters.');
    if (!stage.assistantId || !store.assistants.get(stage.assistantId)) return invalid(`Choose an available agent for "${stageName}".`);
    if (stage.optional !== undefined && typeof stage.optional !== 'boolean') return invalid(`Set whether "${stageName}" is optional.`);
    const wordTemplate = String(stage.wordTemplate || '').trim();
    if (wordTemplate.length > 240 || /[\x00-\x1f]/.test(wordTemplate) || path.isAbsolute(wordTemplate) || /(^|[\\/])\.\.([\\/]|$)/.test(wordTemplate)) return invalid('Word template paths must stay inside the project folder.');
    let after;
    if (stage.after !== undefined) {
      if (!Array.isArray(stage.after) || stage.after.some((x) => typeof x !== 'string' || !stages.some((s) => s.id === x)) || new Set(stage.after).size !== stage.after.length) return invalid(`"${stageName}" can only start after stages listed above it.`);
      // Store only when it differs from the default (the stage directly above), so sequential workflows stay unchanged.
      const fallback = stages.length ? [stages[stages.length - 1].id] : [];
      if (stage.after.length !== fallback.length || stage.after.some((x) => !fallback.includes(x))) after = [...stage.after];
    }
    stages.push({ id: stage.id, name: stageName, assistantId: stage.assistantId, output, prompt, ...(stage.optional ? { optional: true } : {}), ...(after ? { after } : {}), wordTemplate });
  }
  if (new Set(stages.map((s) => s.output.toLowerCase())).size !== stages.length) return invalid('Each stage must have a different output filename.');
  let gateCheck = null;
  if (body.gateCheck) {
    const assistantId = String(body.gateCheck.assistantId || '');
    const prompt = String(body.gateCheck.prompt || '').trim();
    if (!store.assistants.get(assistantId)) return invalid('Choose an available agent for the traceability check.');
    if (!prompt || prompt.length > 8000) return invalid('Traceability check instructions must be 1 to 8,000 characters.');
    gateCheck = { assistantId, prompt };
  }
  return { pipeline: { id: id || body.id, name, emoji, stages, gateCheck } };
}

// Stages run in list order unless a stage names the stages it starts `after`; stages that share inputs can then run
// in parallel. Without `after`, a stage depends on the stage directly above it (older workflows stay sequential).
function stageDeps(defs, id) {
  const i = defs.findIndex((s) => s.id === id);
  if (i < 0) return [];
  return Array.isArray(defs[i].after) ? defs[i].after.filter((x) => defs.slice(0, i).some((s) => s.id === x)) : i ? [defs[i - 1].id] : [];
}

// The run stages whose outputs feed this stage: its dependencies, looking through skipped stages to what they used.
function stageInputs(run, defs, id, seen = new Set()) {
  const out = [];
  for (const dep of stageDeps(defs, id)) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    const s = run.stages.find((x) => x.id === dep);
    if (!s) continue;
    if (s.status === 'skipped') out.push(...stageInputs(run, defs, dep, seen));
    else out.push(s);
  }
  return out;
}

// Every stage that depends on this one, directly or through other stages.
function stageDependents(run, defs, id) {
  const found = new Set([id]);
  for (const s of defs) if (!found.has(s.id) && stageDeps(defs, s.id).some((d) => found.has(d))) found.add(s.id);
  found.delete(id);
  return run.stages.filter((s) => found.has(s.id));
}

function snapshotRunPipeline(run) {
  if (!run) return run;
  if (run.pipelineDefinition) return run;
  const pipeline = store.pipelines.get(run.pipelineId);
  if (pipeline) {
    run.pipelineDefinition = {
      ...JSON.parse(JSON.stringify(pipeline)),
      stages: pipeline.stages.map((stage) => ({ ...stage, wordTemplate: stageWordTemplate(pipeline.id, stage) })),
    };
    store.runs.save(run);
  }
  return run;
}

function startRunTurn(run, stage, prompt, isCheck = false) {
  const conversationId = isCheck ? stage.gateConversationId : stage.conversationId;
  runTurn({ conversationId, message: prompt }).then(({ message }) => {
    const fresh = store.runs.get(run.id);
    if (!fresh) return;
    const s = fresh.stages.find((x) => x.id === stage.id);
    if (isCheck) {
      s.checkRunning = false;
      s.checkSummary = message.error || (message.stopped ? 'Check stopped.' : message.content || 'The check returned no findings.');
    } else {
      s.status = !message.error && !message.stopped && workspaceFile(s.outputPath, fresh.workspace) ? 'review' : 'rework';
      s.error = message.error || (message.stopped ? 'The stage was stopped.' : s.status === 'rework' ? 'The stage did not create its output file.' : '');
      if (s.status === 'review') { if (s.unapprovedInputs) labelUnapproved(s); else clearUnapproved(s); }
    }
    store.runs.save(fresh);
  }).catch((e) => {
    console.error('Lifecycle turn failed:', e);
    const fresh = store.runs.get(run.id);
    if (!fresh) return;
    const s = fresh.stages.find((x) => x.id === stage.id);
    if (isCheck) { s.checkRunning = false; s.checkSummary = `Check failed: ${e.message}`; }
    else { s.status = 'rework'; s.error = e.message; }
    store.runs.save(fresh);
  });
}

async function diffFiles(a, b) {
  const changes = [];
  const add = (sheet, cell, before, after) => { if (before !== after && changes.length < 500) changes.push({ sheet, cell, before, after }); };
  if (/\.xml$/i.test(a) && /\.xml$/i.test(b)) {
    const left = project.load(a), right = project.load(b);
    const ids = new Set([...left.tasks.map((t) => t.uid), ...right.tasks.map((t) => t.uid)]);
    for (const id of ids) {
      const x = left.byUid.get(id), y = right.byUid.get(id);
      for (const key of ['name', 'start', 'finish', 'durationDays', 'percent', 'notes']) {
        const val = (t) => t?.[key] instanceof Date ? t[key].toISOString().slice(0, 10) : String(t?.[key] ?? '');
        add('Tasks', `${id}: ${key}`, val(x), val(y));
      }
    }
  } else {
    if (!/\.xlsx$/i.test(a) || !/\.xlsx$/i.test(b)) throw new Error('Choose two Excel workbooks or two Project XML files.');
    const [left, right] = await Promise.all([excel.open(a), excel.open(b)]);
    const sheets = new Set([...left.worksheets.map((s) => s.name), ...right.worksheets.map((s) => s.name)]);
    for (const name of sheets) {
      const cells = new Map();
      const text = (cell) => {
        const v = cell.value;
        if (v == null) return '';
        if (v instanceof Date) return v.toISOString();
        if (typeof v !== 'object') return String(v);
        if (v.formula || v.sharedFormula) return `${v.result == null ? '' : `${v.result instanceof Date ? v.result.toISOString() : String(v.result)} `}⟨=${cell.formula || v.formula || v.sharedFormula}⟩`;
        if (v.richText) return v.richText.map((t) => t.text).join('');
        if (v.hyperlink) return `${v.text || ''} (${v.hyperlink})`;
        if (v.error) return v.error;
        return JSON.stringify(v);
      };
      for (const [wb, index] of [[left, 0], [right, 1]]) {
        wb.getWorksheet(name)?.eachRow((row) => row.eachCell((cell) => {
          const pair = cells.get(cell.address) || ['', '']; pair[index] = text(cell); cells.set(cell.address, pair);
        }));
      }
      for (const [cell, [before, after]] of cells) add(name, cell, before, after);
    }
  }
  return changes;
}

module.exports = { DEFAULT_PIPELINES, stageDependents, stageDeps, stageInputs, diffFiles, reconcileRun, snapshotRunPipeline, stageWordTemplate, startRunTurn, validatePipeline };
