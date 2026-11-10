// Lumen server: Lifecycle workflow definitions.
const store = require('../../store');
const { json, send } = require('../http-util');
const { DEFAULT_PIPELINES, stageWordTemplate, validatePipeline } = require('../lifecycle');

/** Handles the request if it is one of these routes; otherwise returns without responding. */
module.exports = async function route(req, res, url, { resource, rid, action, sub, m, parts }) {
  if (resource === 'pipelines') {
    if (m === 'GET' && !rid) return send(res, 200, store.pipelines.all().map((p) => ({ ...p, builtin: DEFAULT_PIPELINES.some((d) => d.id === p.id), stages: p.stages.map((s) => ({ ...s, wordTemplate: stageWordTemplate(p.id, s) })) })));
    if (m === 'POST' && !rid) {
      const { pipeline, error } = validatePipeline(await json(req));
      if (error) return send(res, 400, { error });
      if (store.pipelines.all().length >= 100) return send(res, 400, { error: 'You can save up to 100 workflows.' });
      return send(res, 200, store.pipelines.upsert({ ...pipeline, id: store.id() }));
    }
    if (m === 'PUT' && rid) {
      if (!store.pipelines.get(rid)) return send(res, 404, { error: 'Workflow not found.' });
      const { pipeline, error } = validatePipeline(await json(req), rid);
      if (error) return send(res, 400, { error });
      const existing = store.pipelines.get(rid);
      return send(res, 200, store.pipelines.upsert({ ...pipeline, ...(existing.defaultStagesSeen ? { defaultStagesSeen: existing.defaultStagesSeen } : {}) }));
    }
    if (m === 'DELETE' && rid) {
      if (!store.pipelines.get(rid)) return send(res, 404, { error: 'Workflow not found.' });
      if (DEFAULT_PIPELINES.some((p) => p.id === rid)) return send(res, 400, { error: 'Built-in workflows cannot be deleted. You can still customize or duplicate them.' });
      store.pipelines.remove(rid);
      return send(res, 200, { ok: true });
    }
  }
};
