---
name: microsoft-365
title: SharePoint & Microsoft 365 (WorkIQ)
emoji: 🟦
description: Find and read documents on SharePoint and OneDrive, plus related emails, meetings and Teams messages, through Microsoft's WorkIQ. Read-only; turn it on in Settings › Connections.
server: m365
readTools: *
writeTools:
---

# SharePoint & Microsoft 365 (WorkIQ)

Use the Microsoft 365 connection identified by the engine-specific instructions for content outside the project folder. **GitHub Copilot uses its existing managed Work IQ connector**, supplied by Lumen as `workiqmcp` at `https://api.github.com/copilot-connectors/api/v1/connectors/workiqmcp/mcp` with engine-owned GitHub authentication, not the standalone Work IQ CLI application. **Claude uses the standalone m365 server**, which requires separate consent. These identities are not interchangeable. Do not create a duplicate connection or substitute another user server, plugin or identity when the selected connection is unavailable or denied. Files in the project folder still use Lumen's file tools.

## Choosing tools

- Discover the actual tool names and schemas offered by the selected connection. Do not guess signatures or identify a connector solely by a similar name. Use `search_paths` and `get_schema` to resolve unfamiliar entity operations. These paths only borrow Graph conventions: familiar Graph endpoints are NOT automatically supported. Call only a path and operation actually advertised by discovery and checked with `get_schema`. Empty discovery is not permission to try a guessed endpoint.
- For workplace evidence and summaries, use `retrieve` and synthesize the answer locally. Set strategy `grounding` for indexed Microsoft 365 content; use `copilot` only when the user's scope includes external/unknown sources. Limit capabilities only when the user specified sources.
- For exact files, metadata and filtered lists, use supported entity reads directly. Discover supported filters and ordering; never infer that "last modified by me" includes every document I edited.
- For SharePoint document searches, including "the last document I updated", start with the exact prefix `search_paths(query="/search/query")`, not repeated broad natural-language path searches. If it advertises an action, check `get_schema(path="/search/query", operationType="action")` and use `do_action` for this documented read-only search. A search uses POST but does not mutate Microsoft 365 data.
- For "I updated", resolve the signed-in user's identity through discovered `/me` fetch schema, selecting only the needed identity fields; do not guess an email address from a name. Keep the editor, SharePoint location and document-only constraints. Use schema-supported search fields and descending modification-time sorting, with a small bounded result set. Validate returned editor, source link and modification timestamp before naming a result. Return documents, not sites or folders.
- Preserve the requested source: SharePoint sites/libraries are not interchangeable with personal OneDrive. For a SharePoint-only request, use supported location constraints and verify the returned link is in a SharePoint site/library; do not silently include personal OneDrive because it is SharePoint-backed. If the required scope cannot be established, explain the uncertainty or ask for the site, rather than substituting another location.
- For a business user's "document", do not present JavaScript libraries, source code, generated build outputs or dependency files as the answer merely because search marks them `IsDocument:true`. Use supported document-type filters and inspect metadata. If the bounded results contain only irrelevant files, refine the same read-only search while keeping the editor and location constraints; do not call an irrelevant match the latest document. Never claim to have found a qualifying document if none was verified.
- Do not substitute `/me/drive/recent` for this search: it is not necessarily exposed by Work IQ, and "recent" is not proof of modification by the user. If exact-prefix discovery or schema inspection does not support the required search, explain that limitation without attempting an unadvertised route. Do not remove constraints or fall back to `ask` to manufacture an answer.
- Report the latest verified match in the indexed search results, with its source link, editor and timestamp. Search indexing and last-editor metadata cannot prove the globally latest edit or every historical edit by this user; state these limits rather than asserting completeness. If returned metadata cannot verify the requested editor or ordering, say so instead of naming a definite latest document.
- Use `ask` only when the user explicitly requests Microsoft 365 Copilot's or another named agent's answer. Missing retrieval is not permission to fall back to `ask`.
- Read metadata with `fetch`; download bytes with `fetch_blob`. Use authoritative drive/item identities, not fabricated paths. An empty or pointer response is not a document's contents.

## Boundaries and evidence

- **Read only.** Never send, create, edit, delete, mark mail read, or perform another Microsoft 365 mutation, even when a tool offers it. A POST is permitted only for a documented read-only action such as search.
- Cite returned titles and actual source links, with dates and owners only when provided. Do not invent links or facts. Report capped or partial results honestly; use only supported continuation links.
- An empty result means no matches for that query, not a broken connection or global absence. Do not remove filters or broaden sources to manufacture results.
- Stop on authentication, policy or access denial; do not retry through other routes or identities after denial. A path-specific error such as "Access denied for GET path" does not by itself prove a broken sign-in or denied document permissions. Preserve the error, explain that the operation was refused, and do not recommend reconnecting unless the actual diagnostic indicates an authentication problem. For an actual sign-in error, direct the user to **Settings > Connections > SharePoint & Microsoft 365**: **Open Work IQ connector** for Copilot or **Sign in / check connection** for Claude, using the same engine as their chat. Only attribute a failure to administrator consent when the actual diagnostic says consent is required.
- Preserve the returned error and distinguish sign-in needed, connection failure, missing tools and no results. A connected engine and discovered tools do not prove document access.
- To use a source in a deliverable, summarize supported content with citations. To edit the original with Lumen's file tools, ask the user to sync or save it into their project folder.
