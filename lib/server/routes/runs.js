// Lumen server: Guided lifecycle runs and their stages.
const fs = require('fs');
const path = require('path');
const store = require('../../store');
const skills = require('../../skills');
const mdExport = require('../../../tools/md-export');
const { json, send } = require('../http-util');
const { reconcileRun, snapshotRunPipeline, stageDependents, stageDeps, stageInputs, stageWordTemplate, startRunTurn, validatePipeline } = require('../lifecycle');
const { inside, resolveWorkspace, workspaceFile } = require('../workspace');
const { runTurn, running } = require('../chat');
const { labelUnapproved, stampOutput } = require('../stage-output');

/** Handles the request if it is one of these routes; otherwise returns without responding. */
module.exports = async function route(req, res, url, { resource, rid, action, sub, m, parts }) {
  if (resource === 'runs') {
    if (!rid && m === 'GET') return send(res, 200, store.runs.list().map((run) => reconcileRun(snapshotRunPipeline(run))));
    if (!rid && m === 'POST') {
      const body = await json(req), pipeline = store.pipelines.get(body.pipelineId);
      if (!pipeline) return send(res, 400, { error: 'Choose a pipeline.' });
      const { error: pipelineError } = validatePipeline(pipeline, pipeline.id);
      if (pipelineError) return send(res, 400, { error: `This workflow needs attention before it can be run: ${pipelineError}` });
      const workspace = resolveWorkspace(body.workspace);
      const name = String(body.name || '').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/, '').slice(0, 80);
      if (!name || name === '.' || name === '..') return send(res, 400, { error: 'Enter a valid run name.' });
      if (!Array.isArray(body.sources) || !body.sources.length || body.sources.some((p) => !workspaceFile(p, workspace))) return send(res, 400, { error: 'Choose existing source files in your project folder.' });
      const dir = path.join(workspace, 'Lifecycle', name);
      if (fs.existsSync(dir)) return send(res, 409, { error: 'A lifecycle folder with that name already exists.' });
      const lifecycle = path.dirname(dir);
      if (fs.existsSync(lifecycle) && !inside(fs.realpathSync(lifecycle), fs.realpathSync(workspace))) return send(res, 400, { error: 'The lifecycle folder must be inside your project folder.' });
      fs.mkdirSync(dir, { recursive: true });
      if (!inside(fs.realpathSync(dir), fs.realpathSync(workspace))) return send(res, 400, { error: 'The lifecycle folder must be inside your project folder.' });
      const pipelineDefinition = {
        ...JSON.parse(JSON.stringify(pipeline)),
        stages: pipeline.stages.map((stage) => ({ ...stage, wordTemplate: stageWordTemplate(pipeline.id, stage) })),
      };
      const run = { id: store.id(), pipelineId: pipeline.id, pipelineDefinition, name, workspace, sources: body.sources.map((p) => path.resolve(workspace, p)), createdAt: Date.now(),
        stages: pipeline.stages.map((s) => ({ id: s.id, status: 'pending', outputPath: path.join(dir, s.output) })) };
      return send(res, 200, store.runs.save(run));
    }
    let run = snapshotRunPipeline(store.runs.get(rid));
    if (!run) return send(res, 404, { error: 'Run not found.' });
    if (m === 'GET' && !action) return send(res, 200, reconcileRun(run));
    if (m === 'POST' && action === 'stages' && sub && parts[4]) {
      const body = await json(req);
      // Re-read after the body arrives: parallel stages may have finished and saved the run meanwhile.
      run = store.runs.get(rid) || run;
      const stage = run.stages.find((s) => s.id === sub), pipeline = run.pipelineDefinition || store.pipelines.get(run.pipelineId);
      const def = pipeline?.stages.find((s) => s.id === sub);
      if (!stage || !def) return send(res, 404, { error: 'Stage not found.' });
      const operation = parts[4];
      const deps = stageDeps(pipeline.stages, stage.id).map((d) => run.stages.find((s) => s.id === d)).filter(Boolean);
      const inputs = stageInputs(run, pipeline.stages, stage.id);
      const gateOpen = deps.every((s) => ['approved', 'skipped'].includes(s.status));
      if (operation === 'start') {
        if (!['pending', 'rework'].includes(stage.status) || (stage.conversationId && running.has(stage.conversationId))) return send(res, 409, { error: 'This stage cannot be started now.' });
        if (!gateOpen && !body.override) return send(res, 409, { error: 'Approve the stages this one starts after, or explicitly override the approval gate.' });
        if (deps.some((s) => s.status === 'running' || running.has(s.conversationId))) return send(res, 409, { error: 'Wait for the stages this one starts after to finish first.' });
        if (inputs.some((s) => !workspaceFile(s.outputPath, run.workspace))) return send(res, 400, { error: 'An earlier stage output is missing.' });
        if (!run.sources.every((p) => workspaceFile(p, run.workspace))) return send(res, 400, { error: 'A source file is missing from your project folder.' });
        if (!store.assistants.get(def.assistantId)) return send(res, 400, { error: 'The stage assistant is missing.' });
        const pinned = [...run.sources, ...inputs.map((s) => s.outputPath)];
        const c = stage.conversationId && store.conversations.get(stage.conversationId) || store.conversations.create({ assistantId: def.assistantId, workspace: run.workspace, access: 'edit', pinned_files: pinned, title: `${run.name}: ${def.name}` });
        c.workspace = run.workspace; c.access = 'edit'; c.pinned_files = pinned; store.conversations.save(c);
        stage.conversationId = c.id; stage.status = 'running'; stage.error = ''; stage.unapprovedInputs = inputs.some((s) => s.status !== 'approved' || !!s.unapprovedInputs);
        store.runs.save(run);
        const prompt = def.prompt.replaceAll('{{sources}}', run.sources.map((p) => JSON.stringify(path.relative(run.workspace, p))).join(', ')).replaceAll('{{prev}}', inputs.map((s) => JSON.stringify(path.relative(run.workspace, s.outputPath))).join(', '));
        startRunTurn(run, stage, `${prompt}\n\nSave your final output as a Markdown file at ${JSON.stringify(path.relative(run.workspace, stage.outputPath))}.${stage.unapprovedInputs ? ' Clearly label it as based on unapproved inputs.' : ''}`);
        return send(res, 200, run);
      }
      if (operation === 'skip') {
        if (!def.optional || !['pending', 'rework'].includes(stage.status) || (stage.conversationId && running.has(stage.conversationId))) return send(res, 409, { error: 'Only an optional stage that has not started can be skipped.' });
        if (!gateOpen) return send(res, 409, { error: 'Approve the stages this one starts after before skipping it.' });
        stage.status = 'skipped'; stage.error = ''; delete stage.unapprovedInputs;
        return send(res, 200, store.runs.save(run));
      }
      if (operation === 'include') {
        if (stage.status !== 'skipped' || stageDependents(run, pipeline.stages, stage.id).some((s) => !['pending', 'skipped'].includes(s.status))) return send(res, 409, { error: 'This optional stage cannot be added back after a later stage has started.' });
        stage.status = 'pending';
        return send(res, 200, store.runs.save(run));
      }
      if (operation === 'approve') {
        if (stage.status !== 'review' || running.has(stage.conversationId)) return send(res, 409, { error: 'The stage must be ready for review.' });
        if (!workspaceFile(stage.outputPath, run.workspace)) return send(res, 400, { error: 'The output file is missing.' });
        const name = String(store.settings.get().userName || '').trim();
        if (!name) return send(res, 400, { error: 'Set your name in Settings before approving.' });
        stage.approvedBy = name; stage.approvedAt = Date.now(); stampOutput(stage, name, stage.approvedAt); stage.status = 'approved'; stage.version = (stage.version || 0) + 1;
        return send(res, 200, store.runs.save(run));
      }
      if (operation === 'rework') {
        if (!['review', 'approved'].includes(stage.status) || running.has(stage.conversationId)) return send(res, 409, { error: 'This stage cannot be sent back now.' });
        const later = stageDependents(run, pipeline.stages, stage.id);
        if (later.some((s) => s.status === 'running' || s.checkRunning || running.has(s.conversationId))) return send(res, 409, { error: 'Wait for later stages and checks to finish first.' });
        if (stage.status === 'approved' && workspaceFile(stage.outputPath, run.workspace)) fs.writeFileSync(stage.outputPath, fs.readFileSync(stage.outputPath, 'utf8').replace(/^> Approved by .* on .*\r?\n(?:\r?\n)?/, ''));
        stage.status = 'rework'; delete stage.approvedBy; delete stage.approvedAt;
        for (const downstream of later.filter((s) => !['pending', 'skipped'].includes(s.status))) {
          if (workspaceFile(downstream.outputPath, run.workspace)) {
            fs.writeFileSync(downstream.outputPath, fs.readFileSync(downstream.outputPath, 'utf8').replace(/^> Approved by .* on .*\r?\n(?:\r?\n)?/, ''));
            labelUnapproved(downstream);
          }
          downstream.status = 'rework'; downstream.unapprovedInputs = true; delete downstream.approvedBy; delete downstream.approvedAt;
        }
        return send(res, 200, store.runs.save(run));
      }
      if (operation === 'word') {
        if (stage.status !== 'approved') return send(res, 409, { error: 'Approve the stage before saving it as Word.' });
        if (!workspaceFile(stage.outputPath, run.workspace)) return send(res, 400, { error: 'The output file is missing.' });
        const rel = stageWordTemplate(pipeline.id, def);
        const template = rel ? path.resolve(run.workspace, rel) : null;
        if (template && !inside(template, run.workspace)) return send(res, 400, { error: 'The Word template must be inside your project folder.' });
        const text = fs.readFileSync(stage.outputPath, 'utf8').replace(/^> Approved by .* on .*\r?\n(?:\r?\n)?/, '');
        const version = `${stage.version || 1}.0`, date = new Date(stage.approvedAt).toISOString().slice(0, 10);
        const target = stage.outputPath.replace(/\.(md|markdown)$/i, '') + '.docx';
        try {
          const r = await mdExport.toDocx(text, { title: `${run.name}: ${def.name}`, template, fields: { version, date, approver: stage.approvedBy },
            properties: { Version: version, Approver: stage.approvedBy, 'Approved at': new Date(stage.approvedAt).toISOString(), Source: path.relative(run.workspace, stage.outputPath).split(path.sep).join('/') } });
          fs.writeFileSync(target, r.buffer);
          return send(res, 200, { path: target, name: path.basename(target), template: r.template ? rel : '', warning: r.warning });
        } catch (e) { return send(res, e.code === 'EBUSY' || e.code === 'EPERM' ? 409 : 500, { error: e.code === 'EBUSY' || e.code === 'EPERM' ? `Close ${path.basename(target)} in Word and try again.` : `Couldn't save the Word file: ${e.message}` }); }
      }
      if (operation === 'check') {
        if (!pipeline.gateCheck) return send(res, 400, { error: 'This workflow has no traceability check.' });
        if (stage.status !== 'review' || stage.checkRunning) return send(res, 409, { error: 'The stage must be ready for review.' });
        const checkInputs = inputs.length ? inputs.map((s) => s.outputPath) : run.sources;
        if (![...checkInputs, stage.outputPath].every((p) => workspaceFile(p, run.workspace))) return send(res, 400, { error: 'A source or output file is missing.' });
        if (!store.assistants.get(pipeline.gateCheck.assistantId)) return send(res, 400, { error: 'The traceability assistant is missing.' });
        const c = store.conversations.create({ assistantId: pipeline.gateCheck.assistantId, workspace: run.workspace, access: 'read', pinned_files: [...checkInputs, stage.outputPath], title: `${run.name}: ${def.name} traceability` });
        stage.gateConversationId = c.id; stage.checkRunning = true; stage.checkSummary = ''; store.runs.save(run);
        const prompt = pipeline.gateCheck.prompt.replaceAll('{{prev}}', checkInputs.map((p) => JSON.stringify(path.relative(run.workspace, p))).join(', ')).replaceAll('{{current}}', JSON.stringify(path.relative(run.workspace, stage.outputPath)));
        startRunTurn(run, stage, prompt, true);
        return send(res, 200, run);
      }
      if (operation === 'azure-devops') {
        // Hand an approved stage to Azure DevOps: design stages are published to the wiki, the story stage becomes work items.
        // The chat ends in Approve cards; nothing is written until a person clicks Apply.
        if (stage.status !== 'approved') return send(res, 409, { error: 'Approve the stage first.' });
        if (!workspaceFile(stage.outputPath, run.workspace)) return send(res, 400, { error: 'The output file is missing.' });
        if (!skills.adoReady(store.settings.get().ado)) return send(res, 400, { error: 'Connect Azure DevOps in Settings › Connections first.' });
        const target = body.target === 'workitems' ? 'workitems' : 'wiki';
        const assistantId = target === 'workitems' ? 'story-writer' : def.assistantId;
        if (!store.assistants.get(assistantId)) return send(res, 400, { error: 'The stage assistant is missing.' });
        const out = JSON.stringify(path.relative(run.workspace, stage.outputPath));
        const prompt = target === 'workitems'
          ? `Turn the approved backlog in ${out} into Azure DevOps work items.\n\n1. Call ado_describe_work_item_type to learn this project's epic, feature and story types and required fields.\n2. Search for existing epics and features with the same titles, and reuse them instead of proposing duplicates.\n3. Propose missing epics and features first with ado_propose_work_items. Stories need their parent's number, so propose stories (with parentId) only after their parents have been applied. Tell me when I need to click Apply before you continue.\n4. Tag each story with the FD/TD IDs it implements, and put its Given/When/Then criteria in acceptanceCriteria.\n\nAsk me for any required value you can't take from the file. Don't invent owners, estimates or sprints.`
          : `Publish the approved ${def.name.toLowerCase()} in ${out} to the Azure DevOps wiki.\n\n1. Look for an existing page for it (ado_search_wiki or ado_list_wiki_pages). If there is one, read it and keep its path; otherwise use "/Lifecycle/${run.name}/${def.name}".\n2. Propose the page with ado_propose_wiki_page, keeping the Markdown, IDs and tables exactly as in the file. Pass the etag when updating.\n3. Tell me what you proposed. It is applied only when I click Apply.`;
        const c = store.conversations.create({ assistantId, workspace: run.workspace, access: 'edit', pinned_files: [stage.outputPath], skills: ['azure-devops'], title: `${run.name}: ${def.name} → Azure DevOps` });
        runTurn({ conversationId: c.id, message: prompt }).catch((e) => console.error('Azure DevOps hand-off failed:', e));
        return send(res, 200, { conversationId: c.id });
      }
      return send(res, 404, { error: 'Unknown stage action.' });
    }
  }
};
