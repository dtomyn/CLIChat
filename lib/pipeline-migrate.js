// Lifecycle pipelines are copied from defaults/pipelines.json into data/ on first run, so stages added to a built-in
// pipeline in a later version (such as the optional "tests" stage) never reach an existing install. migratePipelines
// adds those new stages to a saved pipeline that is still the built-in one (same id), once:
//   - stages already in the saved pipeline are never changed, so the user's own edits are kept;
//   - each saved pipeline records the built-in stage ids it has been offered in `defaultStagesSeen`, so a stage the
//     user removes later is not added back;
//   - pipelines saved before that record existed are treated as having been offered the first-release stages, so a
//     first-release stage the user removed stays removed and only the stages added since then are offered.
// It is pure: it returns new objects and never touches the files.

const FIRST_RELEASE_STAGES = { aidlc: ['refine', 'functional', 'technical', 'stories'] };

function migratePipelines(saved, defaults) {
  const added = [];
  let changed = false;
  const pipelines = (Array.isArray(saved) ? saved : []).map((p) => {
    const d = (defaults || []).find((x) => x && p && x.id === p.id);
    if (!d || !Array.isArray(d.stages) || !Array.isArray(p.stages)) return p;
    const seen = Array.isArray(p.defaultStagesSeen) ? p.defaultStagesSeen : (FIRST_RELEASE_STAGES[p.id] || []);
    const stages = [...p.stages];
    const has = (sid) => stages.some((s) => s && s.id === sid);
    d.stages.forEach((ds, i) => {
      if (!ds || !ds.id || has(ds.id) || seen.includes(ds.id)) return;
      // Put it after the nearest earlier built-in stage the pipeline still has, else before the nearest later one, else at the end.
      let at = -1;
      for (let j = i - 1; j >= 0 && at < 0; j--) { const k = stages.findIndex((s) => s && s.id === d.stages[j].id); if (k >= 0) at = k + 1; }
      for (let j = i + 1; j < d.stages.length && at < 0; j++) { const k = stages.findIndex((s) => s && s.id === d.stages[j].id); if (k >= 0) at = k; }
      stages.splice(at < 0 ? stages.length : at, 0, { ...ds });
      added.push({ pipelineId: p.id, stageId: ds.id });
    });
    const record = [...new Set([...seen, ...d.stages.map((s) => s && s.id).filter(Boolean)])];
    const same = Array.isArray(p.defaultStagesSeen) && p.defaultStagesSeen.length === record.length && record.every((x) => p.defaultStagesSeen.includes(x));
    if (stages.length === p.stages.length && same) return p;
    changed = true;
    return { ...p, stages, defaultStagesSeen: record };
  });
  return { pipelines, changed, added };
}

module.exports = { migratePipelines, FIRST_RELEASE_STAGES };
