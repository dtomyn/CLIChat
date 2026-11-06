// Canned Azure DevOps responses for tests (static JSON, so they also work through ADO_MOCK files).

const ORG = 'https://dev.azure.com/contoso';
const PROJECT = 'Permit Renewal';

const item = (id, fields, extra = {}) => ({ id, rev: extra.rev || 3, fields: { 'System.WorkItemType': 'User Story', 'System.State': 'New', 'System.TeamProject': PROJECT, 'System.AreaPath': PROJECT, 'System.IterationPath': `${PROJECT}\\Sprint 4`, 'System.ChangedDate': '2026-11-01T10:00:00Z', ...fields }, relations: extra.relations || [] });

const ITEMS = [
  item(210, { 'System.WorkItemType': 'Feature', 'System.Title': 'Online renewal', 'System.State': 'Active' }),
  item(12, { 'System.Title': 'Pay the renewal fee', 'System.Tags': 'FD-012; TD-004', 'System.Description': '<div>As a <b>citizen</b> I want to pay online.</div>', 'System.AssignedTo': { displayName: 'Dana Lee' } }, { rev: 7, relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: `${ORG}/_apis/wit/workItems/210` }] }),
];

const FIELDS = [
  { referenceName: 'System.Title', name: 'Title', alwaysRequired: true, allowedValues: [] },
  { referenceName: 'System.Description', name: 'Description', alwaysRequired: false, allowedValues: [], type: 'html' },
  { referenceName: 'Microsoft.VSTS.Common.AcceptanceCriteria', name: 'Acceptance Criteria', alwaysRequired: false, allowedValues: [], type: 'html' },
  { referenceName: 'System.State', name: 'State', alwaysRequired: true, allowedValues: ['New', 'Active', 'Resolved', 'Closed', 'Removed'], defaultValue: 'New' },
  { referenceName: 'System.AssignedTo', name: 'Assigned To', alwaysRequired: false, allowedValues: [] },
  { referenceName: 'System.AreaPath', name: 'Area Path', alwaysRequired: true, allowedValues: [] },
  { referenceName: 'System.IterationPath', name: 'Iteration Path', alwaysRequired: true, allowedValues: [] },
  { referenceName: 'Microsoft.VSTS.Common.Priority', name: 'Priority', alwaysRequired: false, allowedValues: [1, 2, 3, 4] },
  { referenceName: 'Microsoft.VSTS.Scheduling.StoryPoints', name: 'Story Points', alwaysRequired: false, allowedValues: [] },
  { referenceName: 'System.Tags', name: 'Tags', alwaysRequired: false, allowedValues: [] },
];

const PAGE = '# Functional design\n\n[[_TOC_]]\n\n::: mermaid\ngraph TD; A-->B\n:::\n\n| ID | Rule |\n|---|---|\n| FD-012 | Pay online |\n';

/** Routes for the mock fetch. Order matters: the first match wins. */
function routes() {
  return [
    { method: 'GET', match: '/_apis/connectionData', body: { authenticatedUser: { providerDisplayName: 'Dana Lee', id: 'u1' } } },
    { method: 'GET', match: '/_apis/projects/Permit%20Renewal/teams', body: { value: [{ name: 'Permit Renewal Team' }] } },
    { method: 'GET', match: '/_apis/projects?', body: { value: [{ name: PROJECT }, { name: 'Other' }] } },
    { method: 'GET', match: '/_apis/wiki/wikis?', body: { value: [{ id: 'w1', name: 'Permit-Renewal.wiki', type: 'projectWiki' }, { id: 'w2', name: 'Docs', type: 'codeWiki' }] } },
    { method: 'GET', match: 'path=%2FDesign%2FFunctional%20Design&includeContent=true', body: { path: '/Design/Functional Design', content: PAGE }, headers: { etag: '"abc123"' } },
    { method: 'GET', match: 'includeContent=true', status: 404, body: { message: 'The page does not exist.' } },
    { method: 'PUT', match: '/_apis/wiki/wikis/w1/pages', body: { path: '/Design/Functional Design', content: 'x' }, headers: { etag: '"def456"' } },
    { method: 'GET', match: '/workitemtypes/User%20Story/fields', body: { value: FIELDS } },
    { method: 'GET', match: '/workitemtypes/Feature/fields', body: { value: FIELDS } },
    { method: 'GET', match: '/workitemtypes/User%20Story/states', body: { value: [{ name: 'New', category: 'Proposed' }, { name: 'Active', category: 'InProgress' }, { name: 'Closed', category: 'Completed' }, { name: 'Removed', category: 'Removed' }] } },
    { method: 'GET', match: '/workitemtypes/Feature/states', body: { value: [{ name: 'New', category: 'Proposed' }, { name: 'Active', category: 'InProgress' }] } },
    { method: 'GET', match: '/_apis/wit/workitemtypes?', body: { value: [{ name: 'Epic' }, { name: 'Feature' }, { name: 'User Story' }, { name: 'Task' }, { name: 'Bug' }] } },
    { method: 'GET', match: '/_apis/wit/workitemtypecategories', body: { value: [
      { referenceName: 'Microsoft.EpicCategory', defaultWorkItemType: { name: 'Epic' }, workItemTypes: [{ name: 'Epic' }] },
      { referenceName: 'Microsoft.FeatureCategory', defaultWorkItemType: { name: 'Feature' }, workItemTypes: [{ name: 'Feature' }] },
      { referenceName: 'Microsoft.RequirementCategory', defaultWorkItemType: { name: 'User Story' }, workItemTypes: [{ name: 'User Story' }] },
    ] } },
    { method: 'GET', match: '/_apis/wit/classificationnodes', body: { value: [
      { structureType: 'area', name: PROJECT, path: `\\${PROJECT}\\Area`, children: [{ name: 'Payments', path: `\\${PROJECT}\\Area\\Payments` }] },
      { structureType: 'iteration', name: PROJECT, path: `\\${PROJECT}\\Iteration`, children: [{ name: 'Sprint 4', path: `\\${PROJECT}\\Iteration\\Sprint 4` }] },
    ] } },
    { method: 'POST', match: '/_apis/wit/wiql', body: { workItems: [{ id: 12 }, { id: 210 }] } },
    { method: 'POST', match: '/_apis/wit/workitemsbatch', body: { value: ITEMS } },
    { method: 'POST', match: '/_apis/wit/workitems/$User%20Story', body: { id: 501, fields: { 'System.Title': 'Pay by card' } } },
    { method: 'PATCH', match: '/_apis/wit/workitems/12', body: { id: 12, rev: 8 } },
    { method: 'POST', match: '/comments', body: { id: 1 } },
  ];
}

module.exports = { ORG, PROJECT, ITEMS, FIELDS, PAGE, routes, item };
