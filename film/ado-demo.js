// Azure DevOps stand-in for the how-to film (ADO_MOCK=film/ado-demo.js). Nothing here reaches a real organisation.
// A small "Permit Renewal" project: one epic, two features, a sprint of stories and bugs, and a wiki.
// Created work items get new numbers, so an Apply in the film shows a believable result.

const { FIELDS } = require('../test/helpers/ado-fixture');

const ORG = 'https://dev.azure.com/contoso';
const PROJECT = 'Permit Renewal';
const SPRINT = `${PROJECT}\\Sprint 4`;
const url = (id) => `${ORG}/_apis/wit/workItems/${id}`;
const person = (displayName) => ({ displayName, uniqueName: `${displayName.split(' ')[0].toLowerCase()}@contoso.com` });

let nextId = 231;
const item = (id, type, title, state, extra = {}) => ({
  id, rev: extra.rev || 4,
  fields: {
    'System.WorkItemType': type, 'System.Title': title, 'System.State': state, 'System.TeamProject': PROJECT,
    'System.AreaPath': `${PROJECT}\\Payments`, 'System.IterationPath': extra.iteration || SPRINT,
    'System.ChangedDate': extra.changed || '2026-11-04T15:20:00Z', 'System.CreatedDate': '2026-10-12T09:00:00Z',
    ...(extra.assigned ? { 'System.AssignedTo': person(extra.assigned) } : {}),
    ...(extra.points ? { 'Microsoft.VSTS.Scheduling.StoryPoints': extra.points } : {}),
    ...(extra.tags ? { 'System.Tags': extra.tags } : {}),
    ...(extra.description ? { 'System.Description': extra.description } : {}),
    'Microsoft.VSTS.Common.Priority': extra.priority || 2,
  },
  relations: extra.parent ? [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: url(extra.parent), attributes: { name: 'Parent' } }] : [],
});

const ITEMS = [
  item(200, 'Epic', 'Online permit renewal', 'Active', { iteration: PROJECT, assigned: 'Dana Lee' }),
  item(210, 'Feature', 'Renew and pay online', 'Active', { iteration: PROJECT, assigned: 'Dana Lee', parent: 200, tags: 'FD-010; FD-012',
    description: '<div>Citizens renew an expiring permit and pay the fee online, without visiting a counter.</div>' }),
  item(211, 'Feature', 'Renewal reminders', 'New', { iteration: PROJECT, parent: 200, tags: 'FD-020' }),
  item(212, 'User Story', 'Check renewal eligibility', 'Closed', { assigned: 'Marcus Chen', points: 3, parent: 210, tags: 'FD-010', changed: '2026-11-02T11:00:00Z' }),
  item(213, 'User Story', 'Pay the renewal fee by card', 'Active', { assigned: 'Priya Shah', points: 5, parent: 210, tags: 'FD-012; TD-004' }),
  item(214, 'User Story', 'Upload a new permit photo', 'Active', { assigned: 'Sam Ortiz', points: 5, parent: 210, tags: 'FD-014', rev: 9 }),
  item(215, 'User Story', 'Email a receipt after payment', 'New', { points: 2, parent: 210, tags: 'FD-012' }),
  item(216, 'User Story', 'Send a renewal reminder by email', 'New', { points: 3, parent: 211, tags: 'FD-020' }),
  item(217, 'User Story', 'Send a renewal reminder by SMS', 'New', { points: 3, parent: 211, tags: 'FD-021', changed: '2026-10-20T10:00:00Z' }),
  item(218, 'Bug', 'Fee shows twice on the payment summary', 'Active', { priority: 1, parent: 213 }),
  item(219, 'Bug', 'Photo upload rejects HEIC images', 'New', { priority: 2, parent: 214 }),
  item(220, 'User Story', 'Show renewal status on the dashboard', 'Resolved', { assigned: 'Marcus Chen', points: 3, parent: 210, tags: 'FD-016' }),
];
const byId = (id) => ITEMS.find((w) => w.id === Number(id));

const PAGES = {
  '/Home': '# Permit Renewal\n\nTeam wiki for the Online Permit Renewal program.\n',
  '/Design/Renewal fee rules': '# Renewal fee rules\n\n| Rule | Detail |\n|---|---|\n| FD-012 | The fee is charged once, at submission |\n| FD-013 | Card payments only in release 1 |\n| FD-015 | Fee waived for applicants over 65 |\n',
  '/Design/Functional design': '# Functional design\n\n[[_TOC_]]\n\n| ID | Behaviour |\n|---|---|\n| FD-010 | Check eligibility |\n| FD-012 | Pay the renewal fee |\n| FD-014 | Upload a new photo |\n',
  '/Ways of working/Definition of Ready': '# Definition of Ready\n\n- Traces to an approved FD or TD ID (tag it)\n- Given/When/Then acceptance criteria\n- Estimated in story points\n',
};
const tree = { path: '/', subPages: [
  { path: '/Home' },
  { path: '/Design', subPages: [{ path: '/Design/Renewal fee rules' }, { path: '/Design/Functional design' }] },
  { path: '/Ways of working', subPages: [{ path: '/Ways of working/Definition of Ready' }] },
] };
const pathOf = (u) => { try { return new URL(u).searchParams.get('path') || '/'; } catch { return '/'; } };
const idIn = (u) => Number((/\/workitems\/(\d+)/i.exec(u) || [])[1]);

const routes = [
  { method: 'GET', match: '/_apis/connectionData', body: { authenticatedUser: { providerDisplayName: 'Alex Rivera', id: 'u-alex' } } },
  { method: 'GET', match: '/teams', body: { value: [{ name: 'Permit Renewal Team' }, { name: 'Payments Squad' }] } },
  { method: 'GET', match: '/_apis/projects?', body: { value: [{ name: PROJECT }, { name: 'Contoso CRM Migration' }, { name: 'Platform' }] } },
  { method: 'GET', match: '/_apis/wiki/wikis?', body: { value: [{ id: 'w1', name: 'Permit-Renewal.wiki', type: 'projectWiki' }, { id: 'w2', name: 'Architecture', type: 'codeWiki' }] } },
  { method: 'GET', match: 'recursionLevel=full', body: tree },
  { method: 'GET', match: 'includeContent=true', status: (call) => (PAGES[pathOf(call.url)] ? 200 : 404),
    body: (call) => (PAGES[pathOf(call.url)] ? { path: pathOf(call.url), content: PAGES[pathOf(call.url)] } : { message: 'The page does not exist.' }), headers: { etag: '"film-1"' } },
  { method: 'PUT', match: '/_apis/wiki/wikis/', body: (call) => ({ path: pathOf(call.url), content: 'saved' }), headers: { etag: '"film-2"' } },
  { method: 'GET', match: '/_apis/work/teamsettings/iterations', body: { value: [{ name: 'Sprint 4', path: SPRINT, attributes: { startDate: '2026-10-26T00:00:00Z', finishDate: '2026-11-13T00:00:00Z' } }] } },
  { method: 'GET', match: '/fields', body: { value: FIELDS } },
  { method: 'GET', match: '/states', body: { value: [{ name: 'New', category: 'Proposed' }, { name: 'Active', category: 'InProgress' }, { name: 'Resolved', category: 'Resolved' }, { name: 'Closed', category: 'Completed' }, { name: 'Removed', category: 'Removed' }] } },
  { method: 'GET', match: '/_apis/wit/workitemtypes?', body: { value: [{ name: 'Epic' }, { name: 'Feature' }, { name: 'User Story' }, { name: 'Task' }, { name: 'Bug' }] } },
  { method: 'GET', match: '/_apis/wit/workitemtypecategories', body: { value: [
    { referenceName: 'Microsoft.EpicCategory', defaultWorkItemType: { name: 'Epic' }, workItemTypes: [{ name: 'Epic' }] },
    { referenceName: 'Microsoft.FeatureCategory', defaultWorkItemType: { name: 'Feature' }, workItemTypes: [{ name: 'Feature' }] },
    { referenceName: 'Microsoft.RequirementCategory', defaultWorkItemType: { name: 'User Story' }, workItemTypes: [{ name: 'User Story' }] },
    { referenceName: 'Microsoft.TaskCategory', defaultWorkItemType: { name: 'Task' }, workItemTypes: [{ name: 'Task' }] },
    { referenceName: 'Microsoft.BugCategory', defaultWorkItemType: { name: 'Bug' }, workItemTypes: [{ name: 'Bug' }] },
  ] } },
  { method: 'GET', match: '/_apis/wit/classificationnodes', body: { value: [
    { structureType: 'area', name: PROJECT, path: `\\${PROJECT}\\Area`, children: [{ name: 'Payments', path: `\\${PROJECT}\\Area\\Payments` }, { name: 'Notifications', path: `\\${PROJECT}\\Area\\Notifications` }] },
    { structureType: 'iteration', name: PROJECT, path: `\\${PROJECT}\\Iteration`, children: [
      { name: 'Sprint 3', path: `\\${PROJECT}\\Iteration\\Sprint 3`, attributes: { startDate: '2026-10-05T00:00:00Z', finishDate: '2026-10-23T00:00:00Z' } },
      { name: 'Sprint 4', path: `\\${PROJECT}\\Iteration\\Sprint 4`, attributes: { startDate: '2026-10-26T00:00:00Z', finishDate: '2026-11-13T00:00:00Z' } },
      { name: 'Sprint 5', path: `\\${PROJECT}\\Iteration\\Sprint 5`, attributes: { startDate: '2026-11-16T00:00:00Z', finishDate: '2026-12-04T00:00:00Z' } },
    ] },
  ] } },
  { method: 'POST', match: '/_apis/wit/wiql', body: { workItems: ITEMS.map((w) => ({ id: w.id })) } },
  { method: 'POST', match: '/_apis/wit/workitemsbatch', body: (call) => ({ value: (call.body?.ids || []).map(byId).filter(Boolean) }) },
  { method: 'GET', match: '/comments', body: { comments: [] } },
  { method: 'GET', match: '/updates', body: { value: [] } },
  { method: 'GET', match: '/_apis/wit/workitems/', status: (call) => (byId(idIn(call.url)) ? 200 : 404), body: (call) => byId(idIn(call.url)) || { message: 'Work item not found.' } },
  { method: 'POST', match: '/_apis/wit/workitems/$', body: (call) => {
    const title = (call.body || []).find((op) => op.path === '/fields/System.Title')?.value || 'New work item';
    return { id: nextId++, rev: 1, fields: { 'System.Title': title } };
  } },
  { method: 'PATCH', match: '/_apis/wit/workitems/', body: (call) => ({ id: idIn(call.url), rev: (byId(idIn(call.url))?.rev || 1) + 1 }) },
  { method: 'POST', match: '/comments', body: { id: 1 } },
];

module.exports = { routes, ORG, PROJECT };
