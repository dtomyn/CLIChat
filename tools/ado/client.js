// Azure DevOps REST client (Services only, plan 08 decision D6). Plain fetch, no packages.
// Every error that reaches a person is turned into plain language ({ friendly: true }).

const { friendly } = require('./auth');

const API = '7.1';
const COMMENTS_API = '7.1-preview.4';

/** "https://dev.azure.com/contoso", "dev.azure.com/contoso/", "https://contoso.visualstudio.com" → "https://dev.azure.com/contoso". */
function normalizeOrgUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw friendly('Enter your Azure DevOps address, for example https://dev.azure.com/contoso.');
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw friendly('That doesn\'t look like an Azure DevOps address. It should look like https://dev.azure.com/contoso.'); }
  const host = u.hostname.toLowerCase();
  let org = '';
  if (host === 'dev.azure.com') org = u.pathname.split('/').filter(Boolean)[0] || '';
  else if (host.endsWith('.visualstudio.com')) org = host.slice(0, -'.visualstudio.com'.length);
  else throw friendly('Lumen works with Azure DevOps in the cloud (dev.azure.com). On-premises Azure DevOps Server isn\'t supported.');
  if (!/^[a-z0-9][a-z0-9-]{0,49}$/i.test(org)) throw friendly('Add your organisation name to the address, for example https://dev.azure.com/contoso.');
  return `https://dev.azure.com/${org}`;
}

const enc = encodeURIComponent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{ orgUrl: string, project?: string, team?: string, auth: { get(): Promise<string>, refresh(): void }, fetchImpl?: Function, wait?: Function }} opts
 */
function createClient({ orgUrl, project, team, auth, fetchImpl = globalThis.fetch, wait = sleep }) {
  const org = normalizeOrgUrl(orgUrl);
  const orgName = org.split('/').pop();
  const needProject = () => { if (!project) throw friendly('Choose an Azure DevOps project in Settings › Connections first.'); return project; };
  const proj = () => `${org}/${enc(needProject())}`;
  const projTeam = () => (team ? `${proj()}/${enc(team)}` : proj());
  const search = (p) => `https://almsearch.dev.azure.com/${orgName}/${enc(needProject())}/_apis/search/${p}`;

  async function request(method, url, { body, contentType = 'application/json', headers = {}, apiVersion = API, notFound, raw = false } = {}) {
    // Append api-version by hand: URLSearchParams would re-encode the query (spaces in page paths become "+").
    const full = apiVersion && !/[?&]api-version=/.test(url) ? `${url}${url.includes('?') ? '&' : '?'}api-version=${apiVersion}` : url;
    for (let attempt = 0, refreshed = false; ; attempt++) {
      let res;
      try {
        res = await fetchImpl(full, {
          method,
          headers: { Authorization: await auth.get(), Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': contentType } : {}), ...headers },
          body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
          redirect: 'manual',
        });
      } catch (e) {
        if (e.friendly) throw e;
        throw friendly(`Lumen couldn't reach Azure DevOps. Check your internet connection. (${e.cause?.code || e.message})`, { code: 'NETWORK' });
      }
      const type = res.headers.get('content-type') || '';
      // An expired or wrong token is often answered with a 203 or a redirect to a sign-in page instead of a 401.
      const signInPage = res.status === 203 || (res.status >= 300 && res.status < 400) || (res.ok && /text\/html/i.test(type));
      if (res.status === 401 || signInPage) {
        if (!refreshed) { refreshed = true; auth.refresh(); continue; }
        throw friendly('Lumen couldn\'t sign in to Azure DevOps. Open Settings › Connections and choose Check again.', { code: 'AUTH', status: 401 });
      }
      if ((res.status === 429 || res.status === 503) && attempt < 3) {
        const after = Number(res.headers.get('retry-after'));
        await wait(Math.min(10000, (Number.isFinite(after) && after > 0 ? after : 2 ** attempt) * 1000));
        continue;
      }
      const text = await res.text();
      let data = null;
      if (text && /json/i.test(type)) { try { data = JSON.parse(text); } catch {} }
      if (!res.ok) {
        const msg = String(data?.message || '').replace(/\s+/g, ' ').trim();
        if (res.status === 412 || res.status === 409 || /\brev\b|revision|precondition|mismatch|has been modified/i.test(msg)) {
          throw friendly(msg || 'Someone changed this in Azure DevOps in the meantime.', { code: 'CONFLICT', status: res.status });
        }
        if (res.status === 403) throw friendly('Your account doesn\'t have permission to do this in Azure DevOps.', { code: 'FORBIDDEN', status: 403 });
        if (res.status === 404) throw friendly(notFound || msg || 'Azure DevOps couldn\'t find that.', { code: 'NOT_FOUND', status: 404 });
        throw friendly(msg ? `Azure DevOps said: ${msg.slice(0, 400)}` : `Azure DevOps returned an error (${res.status}).`, { status: res.status });
      }
      return raw ? { data: data ?? text, headers: res.headers, status: res.status } : (data ?? text);
    }
  }

  const get = (url, o) => request('GET', url, o);
  const post = (url, body, o) => request('POST', url, { ...o, body });

  const api = {
    org, orgName, project, team, request,
    workItemUrl: (id) => `${proj()}/_workitems/edit/${id}`,
    workItemApiUrl: (id) => `${org}/_apis/wit/workItems/${id}`,

    // ---- connection
    async me() { const d = await get(`${org}/_apis/connectionData`, { apiVersion: null }); return { name: d?.authenticatedUser?.providerDisplayName || d?.authenticatedUser?.customDisplayName || '', id: d?.authenticatedUser?.id }; },
    async projects() { return ((await get(`${org}/_apis/projects?$top=500`)).value || []).map((p) => p.name).sort((a, b) => a.localeCompare(b)); },
    async teams() { return ((await get(`${org}/_apis/projects/${enc(needProject())}/teams?$top=500`)).value || []).map((t) => t.name).sort((a, b) => a.localeCompare(b)); },
    async wikis() { return ((await get(`${proj()}/_apis/wiki/wikis`)).value || []).map((w) => ({ id: w.id, name: w.name, type: w.type === 'codeWiki' ? 'code' : 'project' })); },

    // ---- work items
    async wiql(query, top = 50) { return ((await post(`${projTeam()}/_apis/wit/wiql?$top=${Math.max(1, Math.min(20000, top))}`, { query })).workItems || []).map((w) => w.id); },
    async workItems(ids) {
      const out = [];
      for (let i = 0; i < ids.length; i += 200) {
        const d = await post(`${proj()}/_apis/wit/workitemsbatch`, { ids: ids.slice(i, i + 200), $expand: 'Relations', errorPolicy: 'Omit' });
        out.push(...(d.value || []).filter(Boolean));
      }
      const order = new Map(ids.map((id, i) => [Number(id), i]));
      return out.sort((a, b) => order.get(a.id) - order.get(b.id));
    },
    async workItem(id) { return get(`${proj()}/_apis/wit/workitems/${Number(id)}?$expand=relations`, { notFound: `Can't find work item ${id} in ${project}.` }); },
    async comments(id, top = 5) { return ((await get(`${proj()}/_apis/wit/workItems/${Number(id)}/comments?$top=${top}&order=desc`, { apiVersion: COMMENTS_API })).comments || []); },
    async updates(id, top = 10) { const v = (await get(`${proj()}/_apis/wit/workItems/${Number(id)}/updates`)).value || []; return v.slice(-top); },
    async types() { return ((await get(`${proj()}/_apis/wit/workitemtypes`)).value || []).filter((t) => !t.isDisabled).map((t) => t.name); },
    async categories() { return (await get(`${proj()}/_apis/wit/workitemtypecategories`)).value || []; },
    async typeFields(type) { return (await get(`${proj()}/_apis/wit/workitemtypes/${enc(type)}/fields?$expand=allowedValues`, { notFound: `There's no work item type called "${type}" in ${project}.` })).value || []; },
    async typeStates(type) { return ((await get(`${proj()}/_apis/wit/workitemtypes/${enc(type)}/states`)).value || []).map((s) => ({ name: s.name, category: s.category })); },
    async classification() { return (await get(`${proj()}/_apis/wit/classificationnodes?$depth=6`)).value || []; },
    async currentIteration() {
      if (!team) return null;
      const v = (await get(`${projTeam()}/_apis/work/teamsettings/iterations?$timeframe=current`).catch(() => ({ value: [] }))).value || [];
      return v[0] ? { name: v[0].name, path: v[0].path, start: v[0].attributes?.startDate, finish: v[0].attributes?.finishDate } : null;
    },
    async searchWorkItems(body) { return post(search('workitemsearchresults'), body); },
    async createWorkItem(type, ops) { return request('POST', `${proj()}/_apis/wit/workitems/$${enc(type)}`, { body: ops, contentType: 'application/json-patch+json' }); },
    async updateWorkItem(id, ops) { return request('PATCH', `${proj()}/_apis/wit/workitems/${Number(id)}`, { body: ops, contentType: 'application/json-patch+json', notFound: `Can't find work item ${id} in ${project}.` }); },
    async addComment(id, html) { return post(`${proj()}/_apis/wit/workItems/${Number(id)}/comments`, { text: html }, { apiVersion: COMMENTS_API }); },

    // ---- wiki
    async searchWiki(body) { return post(search('wikisearchresults'), body); },
    async pageTree(wiki, path = '/') { return get(`${proj()}/_apis/wiki/wikis/${enc(wiki)}/pages?path=${enc(path)}&recursionLevel=full`, { notFound: `Can't find "${path}" in the wiki.` }); },
    async readPage(wiki, path) {
      const r = await request('GET', `${proj()}/_apis/wiki/wikis/${enc(wiki)}/pages?path=${enc(path)}&includeContent=true`, { raw: true, notFound: `There's no wiki page "${path}".` });
      return { ...r.data, etag: r.headers.get('etag') || null };
    },
    async pageExists(wiki, path) {
      try { return await api.readPage(wiki, path); } catch (e) { if (e.code === 'NOT_FOUND') return null; throw e; }
    },
    async savePage(wiki, path, content, etag) {
      const r = await request('PUT', `${proj()}/_apis/wiki/wikis/${enc(wiki)}/pages?path=${enc(path)}`, { body: { content }, headers: etag ? { 'If-Match': etag } : {}, raw: true });
      return { ...r.data, etag: r.headers.get('etag') || null };
    },
  };
  return api;
}

module.exports = { createClient, normalizeOrgUrl, API };
