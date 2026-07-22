# Graph Inline Markdown Editing

## Goal

Make notes easy to edit directly from the `/graph` slide-in sidebar. A user selects a document node, clicks the rendered note body, edits the Markdown in place with a simple Logseq-like experience, and sees changes autosave without leaving the graph.

## Completion Summary

- Added dependency-free, document-level Markdown body editing to the `/graph` note panel with accessible click/keyboard activation, 750 ms autosave, save-before-navigation guards, visible save/retry feedback, and mobile support.
- Reused authenticated GET/PUT optimistic concurrency, including sequential queued saves, guarded canonical reconciliation, and one clearly marked temporary last-write-wins retry while preserving read-only frontmatter and canonical Markdown.
- Added deterministic editor/state coverage, an isolated desktop/mobile Playwright smoke, and durable architecture/protocol documentation without changing core/app policy, adding routes, or introducing a frontend/editor dependency.

## Notes

- The backend edit API already exists; do **not** add PATCH for this work. Use authenticated `GET` and `PUT /memories/all/documents/:id` with `If-Match`.
- Markdown files remain canonical. Do not introduce a block database or rewrite documents into Logseq's outline-specific Markdown format.
- V1 is a document-level hybrid editor: the sidebar normally renders Markdown; clicking the body swaps the same surface to a plain Markdown textarea. This is intentionally simpler than true independently movable blocks.
- Use the existing dependency-free graph shell. Do not hand-build a rich `contenteditable` document model or add a frontend framework for V1; preserving body Markdown without a lossy HTML round-trip is more important than WYSIWYG behavior. The backend may normalize frontmatter and refresh protected metadata such as `updated_at`.
- The leading frontmatter block stays collapsed/read-only. The editor changes only the body and reconstructs the whole document for the existing PUT contract.
- Autosave after 750 ms of typing inactivity and on blur. Show explicit `Saving…`, `Saved`, and `Save failed` states.
- Product decision for V1 is last-write-wins. On `412 precondition_failed`, fetch the latest document/hash, preserve its current frontmatter, reapply the local body draft, and retry once. Mark this path clearly in code as temporary conflict-resolution debt; future work should add visible conflict/merge UX rather than silently overwriting.
- The public demo is intentionally a resettable writable sandbox. Enable editing for anyone with demo access. The editor can work with the demo's current accepted credentials, but unauthenticated public editing depends on `tasks/todo/tasks-public-sandbox-hardening.md`; do not duplicate that task's auth, rate-limit, reseeding, or deployment scope here.
- All currently accepted API keys have the same server privileges. Read/write roles and browser capability discovery remain out of scope.
- Unresolved nodes, missing/invalid document IDs, failed document reads, and noncanonical graph nodes remain non-editable.

## Research Findings

- `src/adapters/http-server/graph-page.ts` already fetches a selected note by `node.documentId` and receives raw `content` plus `contentHash`, but currently discards the hash and only renders the Markdown.
- `PUT /memories/all/documents/:id` already performs protected whole-document replacement, requires `If-Match`, serializes writes through the server queue, returns `newContentHash`, and marks the derived index stale.
- Existing stale-write behavior is `412 precondition_failed`; missing preconditions return `428`. The editor must use this contract rather than bypassing it.
- Logseq's useful interaction pattern is hybrid rendered/editable Markdown. Its true outliner model prefixes blocks and uses a Logseq-specific Markdown flavor, which is not suitable for jumpyBrain's standard canonical Markdown.
- The linked Notion-editor article demonstrates `contenteditable` blocks and future slash-command ideas, but its React/HTML block state should be treated as inspiration only, not adopted as jumpyBrain's storage or V1 editing architecture.
- The document update response does not return canonical content, so the client must retain the accepted draft and advance to `newContentHash`; a later GET refreshes server-normalized metadata.

## Relevant Files

- `src/architecture.docs.md` - Graph ownership and dependency direction.
- `src/adapters/http-server/http-server.docs.md` - HTTP shell/route responsibilities; update if the reusable graph-shell responsibility changes.
- `src/adapters/http-server/graph-page.ts` - Entire inline graph UI, note reader, Markdown renderer, API-key handling, and client state.
- `src/adapters/http-server/routes.ts` - Existing GET/PUT document protocol and status mapping; expected to need no route change.
- `src/adapters/http-protocol.ts` - Existing document route literals/helpers.
- `src/app/server-memory/server-memory.docs.md` - Existing remote document update behavior.
- `src/app/local-memory/index.ts` - Existing content-hash precondition behavior.
- `src/types.ts` - `MemoryDocumentReadResult` and `MemoryDocumentUpdateResult` packet shapes.
- `test/graph.test.js` - Graph-page markup, client behavior, and renderer tests.
- `test/server-http.test.js` - Existing authenticated document-update and stale-hash coverage.
- `scripts/graph-ui-smoke.mjs` - Existing read-only browser smoke; must not mutate an arbitrary live note.
- `scripts/graph-editor-smoke.mjs` - Disposable-root desktop/mobile editor smoke with persistence verification.
- `scripts/playwright-runtime.mjs` - Shared local/npx Playwright runtime resolver used by graph smokes.
- `docs/shared-memory-protocol.md` - Durable graph editor behavior, conflict policy, and smoke instructions.
- `package.json` - Disposable editor smoke command.
- `tasks/todo/tasks-public-sandbox-hardening.md` - Public writable-demo rate limiting and reseeding coordination.
- `tasks/done/2026-07-04-tasks-memory-document-editing.md` - Original document-editing contract and deferred browser UI.
- `tasks/done/2026-07-09_tasks-graph-note-slidein.md` - Existing sidebar reader decisions and behavior.

## Tasks

- [x] 1.0 Define the browser editing state machine
  - [x] 1.1 Read the relevant co-located architecture docs before editing source.
  - [x] 1.2 Extend graph-page state with the selected document ID, exact fetched content, read `contentHash`, separated frontmatter/body, detected newline/trailing-newline state, local body draft, dirty flag, save timer, in-flight save, queued-save flag, save status, and selection generation/token.
  - [x] 1.3 Keep one save in flight per selected document. If typing continues during a save, queue one follow-up save using the returned `newContentHash` rather than sending parallel PUTs.
  - [x] 1.4 Ensure late reads/saves cannot render into or update the state of a newly selected node.
  - [x] 1.5 Centralize authenticated graph-page fetch options so GET and PUT consistently use the current Bearer key when present and also work with the planned no-auth public-demo mode.

- [x] 2.0 Add the Logseq-like inline editor surface
  - [x] 2.1 Keep the existing rendered `#note-content` view as the default state.
  - [x] 2.2 Add a keyboard-accessible click-to-edit action that swaps the rendered body for an auto-sizing Markdown `<textarea>` in the same panel surface and focuses it. Provide an explicit accessible Edit control or equivalent keyboard path in addition to pointer activation.
  - [x] 2.3 Style the editor to feel native to the current forest/cream sidebar, preserve independent panel scrolling, support long lines/content, and remain usable at the existing mobile breakpoint.
  - [x] 2.4 Keep frontmatter visible only through the existing collapsed metadata treatment and exclude it from the editable textarea.
  - [x] 2.5 On blur, render the optimistic local body back through the existing escaped Markdown renderer while the save finishes.
  - [x] 2.6 Keep unresolved and non-editable nodes in reader/status behavior without presenting editable affordances.
  - [x] 2.7 Keep the V1 editor implementation behind focused functions/state transitions so slash commands or a richer editor can replace the textarea later without changing the document API or canonical Markdown model.

- [x] 3.0 Implement debounced autosave with the existing PUT API
  - [x] 3.1 Mark the draft dirty on input and debounce saves for 750 ms after the last change.
  - [x] 3.2 Flush a dirty draft before completing a node switch, panel close, or Escape action. While that flush is pending, prevent a second navigation action; on failure, keep the current note panel open with its draft and retry action instead of orphaning an unreachable failed draft.
  - [x] 3.3 Reconstruct the submitted whole document from the preserved frontmatter prefix plus edited body. Preserve the body's newline style, blank lines, fenced `---` text, and trailing-newline state where browser controls permit; document that backend frontmatter is canonicalized separately.
  - [x] 3.4 Send `PUT /memories/all/documents/:id` with `Content-Type: application/json`, `{ "content": reconstructedDocument }`, the current authorization header, and `If-Match: <contentHash>`.
  - [x] 3.5 On success, advance state to `newContentHash`; only clear dirty state if no newer draft exists. If newer input exists, immediately process the one queued save.
  - [x] 3.6 When the save queue is idle and editing has ended, reconcile with one guarded GET so collapsed frontmatter and exact canonical content reflect server normalization without replacing a newer local draft.
  - [x] 3.7 Do not save unchanged content and do not create repeated save loops from blur/render transitions.
  - [x] 3.8 Handle validation, authorization, rate-limit, network, and 5xx failures by retaining the draft, stopping automatic retry loops, and showing a useful `Save failed` state with a manual retry action.
  - [x] 3.9 Warn on page unload while a draft is dirty or a save is in flight; do not claim a save completed when the browser cannot confirm it.

- [x] 4.0 Implement the temporary last-write-wins stale-write policy
  - [x] 4.1 On the first `412`, GET the latest version of the same document and obtain its latest `contentHash`.
  - [x] 4.2 Preserve the newly fetched frontmatter, combine it with the user's current local body draft, and retry the PUT once with the latest hash.
  - [x] 4.3 If that retry is also stale or fails, stop retrying, retain the local draft, and show `Save failed` with manual retry rather than looping indefinitely.
  - [x] 4.4 Add an explicit code comment/TODO naming this behavior `temporary last-write-wins` and pointing to future conflict/merge UX work.
  - [x] 4.5 Ensure an older retry response cannot clear a newer dirty draft or overwrite a different selected document's state.

- [x] 5.0 Add clear editing and save feedback
  - [x] 5.1 Add stable test IDs for the edit affordance, textarea, save state, and retry action.
  - [x] 5.2 Display concise `Editing`, `Saving…`, `Saved`, and `Save failed` feedback without replacing graph-load errors or making the global status pill misleading.
  - [x] 5.3 Make save state available to assistive technology through an appropriate live region.
  - [x] 5.4 Preserve existing close/re-click/Escape behavior for clean notes; for dirty notes, apply the save-before-navigation lifecycle defined in task 3.2.
  - [x] 5.5 Keep graph titles, links, and layout as the loaded snapshot after a body save. Document that `Refresh map` reloads body-derived graph changes; do not rebuild the graph on every keystroke or save.

- [x] 6.0 Add deterministic automated coverage
  - [x] 6.1 Extend `test/graph.test.js` for editor markup, stable test IDs, read-only frontmatter, keyboard activation, and responsive styling.
  - [x] 6.2 Test that clicking rendered content enters inline editing with the fetched body and `contentHash`, while unresolved/missing-ID nodes cannot edit.
  - [x] 6.3 Test that a burst of input produces one PUT after the 750 ms debounce with the correct URL, authorization, JSON body, and `If-Match` header.
  - [x] 6.4 Test blur-triggered save, unchanged-content no-op, successful hash advancement, guarded post-edit reconciliation, and sequential saves using successive hashes.
  - [x] 6.5 Test typing during an in-flight save: no parallel PUT, one queued follow-up save, and no loss of the newest draft.
  - [x] 6.6 Test `412` last-write-wins behavior: latest GET, latest frontmatter retained, local body retained, one retry with the new hash, and no unbounded retry.
  - [x] 6.7 Test network/401/403/413/422/429/5xx failures retain the draft and expose retry feedback.
  - [x] 6.8 Test node switch, close, Escape, failed save-before-navigation, stale responses, and unload protection so drafts cannot cross document boundaries or become unreachable.
  - [x] 6.9 Test body round-tripping for CRLF input, blank lines, fenced `---` content, and present/absent trailing newlines, plus canonical frontmatter reconciliation after save.
  - [x] 6.10 Preserve existing escaped Markdown rendering and graph reader/pan/zoom/filter tests.

- [x] 7.0 Add safe browser-level validation
  - [x] 7.1 Do not modify the first arbitrary node in the existing live `scripts/graph-ui-smoke.mjs` flow.
  - [x] 7.2 Add a disposable-root browser smoke fixture with a known ID-bearing note and server instance.
  - [x] 7.3 Verify select node → click to edit → type → debounce/blur autosave → rendered view → reread persisted Markdown.
  - [~] 7.4 Keep repeated-conflict and race behavior in deterministic tests; browser-smoke only one controlled stale-hash retry if it can remain stable and isolated. - Skipped browser conflict injection: deterministic controller tests cover the bounded retry without making the isolated browser smoke timing-dependent.
  - [x] 7.5 Verify desktop and mobile sidebar editing and no browser console errors.

- [x] 8.0 Document and validate
  - [x] 8.1 Update graph help text and relevant docs to describe click-to-edit, autosave timing, whole-document writes, temporary last-write-wins behavior, and public-sandbox expectations.
  - [x] 8.2 Update `src/adapters/http-server/http-server.docs.md` if the graph shell's durable reader/editor responsibility needs recording; do not move browser behavior into core/app.
  - [x] 8.3 Confirm no new PATCH route, block storage model, frontend framework, or unnecessary editor dependency was introduced.
  - [x] 8.4 Run `npm test`, the disposable editor browser smoke, `npm run cli:pack`, and `git diff --check`.
  - [x] 8.5 After implementation is complete, add a dated result/decision entry to `tasks/CHANGELOG.md` and archive this task under `tasks/done/`.

## Decisions

- Use a Logseq-inspired hybrid rendered/editable Markdown experience, not a fully hidden Markdown WYSIWYG editor.
- V1 uses simple document-level click-to-edit inline behavior, not true movable/indented outline blocks.
- Autosave after a 750 ms pause and on blur, with visible save state.
- Frontmatter remains collapsed and read-only; only the note body is edited.
- V1 intentionally uses a clearly marked last-write-wins retry rather than visible conflict resolution.
- Enable editing in the public resettable demo for everyone with demo access; sandbox limits/reseeding are handled by the existing public-sandbox task.
- Reuse the existing GET/PUT optimistic-concurrency API; no PATCH endpoint is needed.
- Preserve standard canonical Markdown and leave slash commands/richer editor behavior for later.

## Deep Dive

- [How to Build a Text Editor Like Notion](https://konstantin.digital/blog/how-to-build-a-text-editor-like-notion) - Useful interaction and future slash-command inspiration; its custom React `contenteditable` block model is not the chosen V1 architecture.
- [Logseq editor source](https://github.com/logseq/logseq/blob/master/src/main/frontend/components/editor.cljs) - Evidence for Logseq's hybrid rendered-block/plain-textarea editing pattern.
- [Logseq Markdown/outliner behavior discussion](https://github.com/logseq/logseq/issues/3457) - Evidence for why jumpyBrain should not adopt Logseq's outline-specific file transformation.

## Changelog

- Update `tasks/CHANGELOG.md` only when this task is completed/archived or a structural product decision is finalized during implementation.
