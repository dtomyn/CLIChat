// Record / replay for filming demos. Inactive unless an environment variable is set.
//   LUMEN_RECORD=<file.json>  wraps the real engines and saves every streamed event (and any files the AI created)
//   LUMEN_REPLAY=<file.json>  replays those events at a brisk, readable pace, so a demo video shows real answers
//                              without real waiting. The engine keeps its name, so the UI looks exactly the same.
// Exported as a helper (no `id`), so the registry doesn't list it as an engine.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const keyOf = (prompt) => crypto.createHash('sha1').update(String(prompt).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
const load = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { runs: {}, completes: {} }; } };
// Azure DevOps proposals are staged as files (tools/ado/changesets.js) that the Approve card reads. Recordings keep a copy,
// and a replay re-stages it for the new conversation, so Apply works in the film too (against ADO_MOCK, never a real org).
const adoEnv = (opts) => opts.tools?.servers?.ado?.env || {};
const pendingFile = (env, id) => path.join(env.LUMEN_DATA || '', 'ado-pending', String(env.LUMEN_CONVERSATION_ID || '').replace(/[^a-zA-Z0-9-]/g, ''), `${String(id).replace(/[^a-zA-Z0-9-]/g, '')}.json`);
const sleep = (ms, signal) => new Promise((resolve) => { const t = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true }); });

function record(provider, file) {
  const artifacts = path.join(path.dirname(file), 'artifacts');
  const save = (mutate) => { const db = load(file); mutate(db); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 1)); };
  const run = provider.run.bind(provider);
  const complete = provider.complete.bind(provider);
  // LUMEN_RECORD_RESUME=1: requests already in the recording are replayed instead of re-run, so a failed pass can pick up where it stopped.
  const resume = process.env.LUMEN_RECORD_RESUME ? (() => { const shadow = {}; replay(shadow, file); return shadow; })() : null;
  const known = (bucket, prompt) => resume && (load(file)[bucket][keyOf(prompt)] || []).length > 0;
  provider.run = async (opts, emit) => {
    if (known('runs', opts.prompt)) return resume.run(opts, emit);
    const events = []; const t0 = Date.now(); const written = new Set();
    await run(opts, (ev) => {
      events.push({ ...ev, t: Date.now() - t0 });
      if (ev.type === 'file') written.add(ev.path);
      if (ev.type === 'tool' && ev.writes && ev.file) written.add(ev.file);
      emit(ev);
    });
    const files = {};
    for (const f of written) {
      if (!fs.existsSync(f)) continue;
      fs.mkdirSync(artifacts, { recursive: true });
      const copy = `${keyOf(f)}-${path.basename(f)}`;
      fs.copyFileSync(f, path.join(artifacts, copy));
      files[f] = copy;
    }
    const changesets = {};
    for (const ev of events) if (ev.type === 'approval') { try { changesets[ev.id] = JSON.parse(fs.readFileSync(pendingFile(adoEnv(opts), ev.id), 'utf8')); } catch {} }
    const key = keyOf(opts.prompt);
    save((db) => { (db.runs[key] ||= []).push({ prompt: opts.prompt.slice(0, 300), events, files, ...(Object.keys(changesets).length ? { changesets } : {}) }); });
    console.log(`[record] run ${key} (${events.length} events, ${Object.keys(files).length} files)`);
  };
  provider.complete = async (opts) => {
    if (known('completes', opts.prompt)) return resume.complete(opts);
    const result = await complete(opts);
    const key = keyOf(opts.prompt);
    save((db) => { (db.completes[key] ||= []).push({ prompt: opts.prompt.slice(0, 200), result }); });
    return result;
  };
}

function replay(provider, file) {
  const db = load(file);
  const artifacts = path.join(path.dirname(file), 'artifacts');
  const used = {};
  const take = (bucket, key) => { const list = db[bucket][key] || []; const i = used[`${bucket}:${key}`] = (used[`${bucket}:${key}`] ?? -1) + 1; return list[Math.min(i, list.length - 1)]; };
  const CPS = Number(process.env.LUMEN_REPLAY_CPS) || 650; // characters per second for streamed text
  const STEP = Number(process.env.LUMEN_REPLAY_STEP_MS) || 900; // how long each tool step "runs"

  provider.run = async (opts, emit) => {
    const key = keyOf(opts.prompt);
    const rec = take('runs', key);
    if (!rec) { emit({ type: 'error', message: `No recording for this request (${key}).` }); return; }
    const { signal } = opts;
    await sleep(900, signal);
    let pending = '';
    const flush = async () => {
      while (pending && !signal?.aborted) {
        const n = Math.max(4, Math.round(CPS * 0.033));
        emit({ type: 'text', text: pending.slice(0, n) });
        pending = pending.slice(n);
        await sleep(33, signal);
      }
    };
    for (const ev of rec.events) {
      if (signal?.aborted) return;
      if (ev.type === 'text') { pending += ev.text; continue; }
      await flush();
      const { t, ...clean } = ev;
      if (ev.type === 'tool') { emit(clean); await sleep(STEP, signal); continue; }
      if (ev.type === 'file' && rec.files?.[ev.path]) { fs.mkdirSync(path.dirname(ev.path), { recursive: true }); fs.copyFileSync(path.join(artifacts, rec.files[ev.path]), ev.path); }
      if (ev.type === 'usage') continue;
      if (ev.type === 'approval' && rec.changesets?.[ev.id]) {
        const env = adoEnv(opts);
        if (env.LUMEN_DATA && env.LUMEN_CONVERSATION_ID) {
          const file = pendingFile(env, ev.id);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, JSON.stringify({ ...rec.changesets[ev.id], conversationId: path.basename(path.dirname(file)), status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 86400000 }, null, 1));
        }
      }
      emit(clean);
    }
    await flush();
    for (const [f, copy] of Object.entries(rec.files || {})) if (!fs.existsSync(f)) fs.copyFileSync(path.join(artifacts, copy), f);
  };
  // Replayed answers need no CLI, so every engine counts as ready (a film can show an engine this computer doesn't have).
  const detect = provider.detect?.bind(provider);
  provider.detect = async () => { const d = await (detect ? detect().catch(() => ({})) : {}); return d.available ? d : { available: true }; };
  provider.complete = async (opts) => {
    const rec = take('completes', keyOf(opts.prompt));
    await sleep(Number(process.env.LUMEN_REPLAY_COMPLETE_MS) || 1600);
    return rec ? rec.result : '';
  };
}

module.exports = { record, replay, keyOf };
