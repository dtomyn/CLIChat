#!/usr/bin/env node
// "ado" MCP server: Azure DevOps work items and wiki for Lumen (plan 08).
//
// Read tools search and read live data. Proposal tools NEVER change Azure DevOps: they validate and stage a change set
// that a person must approve in Lumen (decision D3). There are no delete tools (D7).
//
// Environment (no credentials; sign-in is fetched at runtime by tools/ado/auth.js):
//   ADO_ORG_URL, ADO_PROJECT, ADO_TEAM, ADO_AUTH (azcli|pat), ADO_WIKIS (preferred wiki names, comma-separated)
//   ADO_READONLY=1      hide everything that proposes changes or writes files
//   ADO_NO_PROPOSALS=1  hide proposal tools (scheduled runs: nobody is there to approve)
//   ADO_ROOT            project folder for ado_export_backlog
//   LUMEN_CONVERSATION_ID, LUMEN_DATA  where change sets are staged

const path = require('path');
const { serve } = require('./mcp-stdio');
const { fromEnv } = require('./ado/connection');
const read = require('./ado/read');
const cs = require('./ado/changesets');
const { exportBacklog } = require('./ado/backlog');

const READ_ONLY = process.env.ADO_READONLY === '1';
const NO_PROPOSALS = READ_ONLY || process.env.ADO_NO_PROPOSALS === '1';
const PREFERRED = String(process.env.ADO_WIKIS || '').split(',').map((s) => s.trim()).filter(Boolean);
const CONV = process.env.LUMEN_CONVERSATION_ID || '';
const ROOT = path.resolve(process.env.ADO_ROOT || process.cwd());

let client;
const c = () => (client ||= fromEnv());

const filterProps = {
  types: { type: 'array', items: { type: 'string' }, description: 'Work item types, e.g. ["User Story","Bug"]' },
  states: { type: 'array', items: { type: 'string' }, description: 'States to include, e.g. ["Active","New"]' },
  excludeStates: { type: 'array', items: { type: 'string' }, description: 'States to leave out, e.g. ["Closed","Removed"]' },
  assignedTo: { type: 'string', description: '"@me", "unassigned", or a person\'s display name' },
  area: { type: 'string', description: 'Area path (includes everything under it)' },
  iteration: { type: 'string', description: '"@current" for the team\'s current sprint, or an iteration path' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Items must have all these tags (e.g. "FD-012")' },
  changedSince: { type: 'string', description: 'YYYY-MM-DD' },
  changedBefore: { type: 'string', description: 'YYYY-MM-DD (for stale-item checks)' },
  parentId: { type: 'number', description: 'Only children of this work item' },
  orderBy: { type: 'string', enum: ['changed', 'created', 'priority', 'id', 'backlog'] },
  top: { type: 'number', description: 'Max results (default 50, max 200)' },
};
const richItem = {
  title: { type: 'string' },
  description: { type: 'string', description: 'Markdown' },
  acceptanceCriteria: { type: 'string', description: 'Markdown, e.g. Given/When/Then' },
  reproSteps: { type: 'string', description: 'Markdown (bugs)' },
  state: { type: 'string' }, assignedTo: { type: 'string' }, area: { type: 'string' },
  iteration: { type: 'string', description: 'Iteration path, or "@current"' },
  priority: { type: 'number' }, storyPoints: { type: 'number' }, effort: { type: 'number' },
  fields: { type: 'object', description: 'Other fields by name or reference name, e.g. {"Value Area":"Business"}' },
};
const reason = { type: 'string', description: 'One or two sentences on why, shown to the person approving' };

const READ_TOOLS = [
  {
    name: 'ado_search_work_items',
    description: 'Search Azure DevOps work items in the connected project by free text (full-text search over titles, descriptions and more), optionally narrowed by type, state, person, area, sprint, tags or dates. Returns a table with links.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Words to search for' }, ...filterProps } },
    run: (a) => read.searchWorkItems(c(), a),
  },
  {
    name: 'ado_query_work_items',
    description: 'List work items by structured filters only (no free text), e.g. everything in the current sprint, bugs with no owner, or items tagged FD-012. Returns a table with links.',
    inputSchema: { type: 'object', properties: filterProps },
    run: (a) => read.queryWorkItems(c(), a),
  },
  {
    name: 'ado_get_work_items',
    description: 'Read one or more work items in full: fields, description and acceptance criteria (as Markdown), parent/child/related links with titles, the revision number (rev), and optionally recent comments and change history.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'number' } }, comments: { type: 'boolean' }, history: { type: 'boolean' } }, required: ['ids'] },
    run: (a) => read.getWorkItems(c(), a),
  },
  {
    name: 'ado_describe_work_item_type',
    description: 'Without a type: list the project\'s work item types and which type is used for epics, features, stories (backlog items), tasks and bugs. With a type: its fields, required fields, allowed values and states. Use before proposing new items.',
    inputSchema: { type: 'object', properties: { type: { type: 'string' } } },
    run: (a) => read.describeType(c(), a),
  },
  {
    name: 'ado_list_paths',
    description: 'List the project\'s area paths and iterations (sprints), and the team\'s current sprint.',
    inputSchema: { type: 'object', properties: {} },
    run: () => read.listPaths(c()),
  },
  {
    name: 'ado_search_wiki',
    description: 'Search the project\'s wiki pages by text. Returns page paths, links and matching snippets.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, wiki: { type: 'string', description: 'Optional wiki name' }, top: { type: 'number' } }, required: ['text'] },
    run: (a) => read.searchWiki(c(), a, PREFERRED),
  },
  {
    name: 'ado_list_wiki_pages',
    description: 'Show the page tree of a wiki (or part of it).',
    inputSchema: { type: 'object', properties: { wiki: { type: 'string' }, path: { type: 'string', description: 'Optional sub-path, e.g. "/Design"' } } },
    run: (a) => read.listWikiPages(c(), a, PREFERRED),
  },
  {
    name: 'ado_read_wiki_page',
    description: 'Read a wiki page\'s Markdown and its etag (needed to propose changes to it). Long pages come back in parts; call again with startAt.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, wiki: { type: 'string' }, startAt: { type: 'number' } }, required: ['path'] },
    run: (a) => read.readWikiPage(c(), a, PREFERRED),
  },
];

const PROPOSAL_TOOLS = [
  {
    name: 'ado_propose_work_items',
    description: `Propose new work items (up to ${cs.MAX_ITEMS}). Nothing is created: the person reviews the proposal in Lumen and clicks Apply. Required fields are checked first. Put lifecycle IDs (BR-/FD-/TD-…) in tags. "Lumen" is added as a tag.`,
    inputSchema: { type: 'object', properties: {
      items: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', description: 'Work item type, or story/feature/epic/bug/task' }, ...richItem,
        tags: { type: 'array', items: { type: 'string' } }, parentId: { type: 'number' }, relatedIds: { type: 'array', items: { type: 'number' } },
        wikiLinks: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, label: { type: 'string' } } }, description: 'Hyperlinks to wiki pages (e.g. the design element\'s page)' } }, required: ['type', 'title'] } },
      reason }, required: ['items'] },
    run: (a) => cs.proposeWorkItems(c(), CONV, a),
  },
  {
    name: 'ado_propose_work_item_update',
    description: 'Propose changes to one work item\'s fields or tags. Nothing changes until the person clicks Apply. Pass the rev you read so a stale read is caught.',
    inputSchema: { type: 'object', properties: { id: { type: 'number' }, rev: { type: 'number' }, ...richItem, tagsAdd: { type: 'array', items: { type: 'string' } }, tagsRemove: { type: 'array', items: { type: 'string' } }, reason }, required: ['id'] },
    run: (a) => cs.proposeUpdate(c(), CONV, a),
  },
  {
    name: 'ado_propose_links',
    description: 'Propose links between work items (parent, child, related, predecessor, successor) or hyperlinks (e.g. to a wiki page). Existing links are skipped; links are never removed.',
    inputSchema: { type: 'object', properties: { links: { type: 'array', items: { type: 'object', properties: { sourceId: { type: 'number' }, type: { type: 'string', enum: Object.keys(cs.REL_TYPES) }, targetId: { type: 'number' }, url: { type: 'string' }, comment: { type: 'string' } }, required: ['sourceId', 'type'] } }, reason }, required: ['links'] },
    run: (a) => cs.proposeLinks(c(), CONV, a),
  },
  {
    name: 'ado_propose_comment',
    description: 'Propose a discussion comment (Markdown) on a work item. Posted only after the person clicks Apply, prefixed "🤖 Lumen:".',
    inputSchema: { type: 'object', properties: { id: { type: 'number' }, text: { type: 'string' }, reason }, required: ['id', 'text'] },
    run: (a) => cs.proposeComment(c(), CONV, a),
  },
  {
    name: 'ado_propose_wiki_page',
    description: 'Propose creating a wiki page, or replacing an existing page\'s content (pass the etag from ado_read_wiki_page). The person sees a diff and clicks Apply. Content is Markdown and is saved exactly as given.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, etag: { type: 'string' }, wiki: { type: 'string' }, reason }, required: ['path', 'content'] },
    run: (a) => cs.proposeWikiPage(c(), CONV, a, PREFERRED),
  },
];

const FILE_TOOLS = [
  {
    name: 'ado_export_backlog',
    description: 'Save the live backlog (epics, features, stories) as an Excel traceability sheet in the project folder: ID (ADO-<number>), type, title, state, parent, and Traces To from lifecycle tags. With workbook, saves a copy of that TRM workbook whose backlog sheets are replaced by the live backlog. Then run analyze_traceability on the saved file. Does not change Azure DevOps.',
    inputSchema: { type: 'object', properties: { workbook: { type: 'string', description: 'Optional TRM workbook to merge with' }, output: { type: 'string' }, area: { type: 'string' }, includeClosed: { type: 'boolean' } } },
    run: (a) => exportBacklog(c(), ROOT, a),
  },
];

const TOOLS = [...READ_TOOLS, ...(NO_PROPOSALS ? [] : PROPOSAL_TOOLS), ...(READ_ONLY ? [] : FILE_TOOLS)];

if (require.main === module) {
  serve({ name: 'ado', instructions: `Azure DevOps work items and wiki for project "${process.env.ADO_PROJECT || ''}". Changes are proposals that a person approves in Lumen.`, tools: TOOLS });
}

module.exports = { TOOLS, READ_TOOLS, PROPOSAL_TOOLS, FILE_TOOLS };
