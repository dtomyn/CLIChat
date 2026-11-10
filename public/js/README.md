# Lumen UI modules

The browser UI is made of native ES modules. There is no bundler and no build step. `index.html` loads the vendored `marked`, DOMPurify and highlight.js as classic scripts (they set globals), then `<script type="module" src="/js/main.js">`.

## Rules

- Each module imports what it uses by name and exports only what other modules use.
- Modules may import each other in a cycle. That is safe because each module's top level only declares functions and literal constants. Do work at load time only in `main.js` (`boot()`), never in other modules.
- Shared mutable state lives on the `S` object in `state.js`. Don't add module-level `let` that other modules reassign; an imported binding is read-only.
- Inline `onclick="…"` in generated HTML cannot see module scope. Use `data-*` attributes and the delegated click handlers instead.

## Map

| Module | What it holds |
| --- | --- |
| `main.js` | Entry point: `boot`, theme, `saveSettings`, user badge, `bindChrome` (global keys, drag and drop) |
| `router.js` | Hash routing (`route`, `go`, `setNav`) |
| `state.js` | `S`, `ACCESS`, `COLORS`, `EMOJIS`, lookups (`assistantById`, `provider`, `isLive`) |
| `utils.js` | `$`, `$$`, `esc`, `api`, formatting helpers, `toast` |
| `icons.js` | SVG icon paths, `icon`, `hydrateIcons` |
| `markdown.js` | `md()`, the `marked` renderer, DOMPurify hook, `highlight` |
| `menu.js`, `modal.js` | Pop-up menus and dialogs |
| `sidebar.js` | Pinned agents and the chats list |
| `composer.js` | Message box: attachments, access level, `/` file picker, suggested next steps |
| `home.js` | Home page, sample packs, Lumen-only badges |
| `chat.js` | Chat page and message rendering (`renderChat`, `msgHTML`, `assistantInner`, `rerenderMsg`) |
| `chat-clicks.js` | `chatClicks`, the chat page's click handler (message actions, file cards, Approve buttons, copy code/table) |
| `ado-approvals.js` | Azure DevOps Approve cards (`approvalCard`, `decideApproval`) |
| `chat-actions.js` | Save a reply as a file, feedback, quick starts, edit, retry and branch |
| `streaming.js` | `sendMessage` and folding the streamed NDJSON reply |
| `folder.js` | Project folder picker and files drawer |
| `runs.js` | Guided lifecycle runs, workflow editor, `showDiff` |
| `agents.js` | Agents page and agent builder |
| `prompts.js` | Prompt gallery, prompt runner and schedules |
| `insights.js` | Insights page |
| `settings.js` | Settings dialog |
| `connections.js` | SharePoint & Microsoft 365 (WorkIQ) and Azure DevOps connection dialogs |
| `onboarding.js` | First-run onboarding |
