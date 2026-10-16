# Minimal Notes Web Editor

## Goal

Make the web experience feel like the most bare-bones, functional version of Notion: an almost-empty entrance, instant access to search, and a calm full-page writing surface. The core loop is **⌘K → find a note → Enter → edit raw Markdown → autosave**.

## Implementation Results — 2026-09-10

- Implemented the empty `/` entrance, Cmd/Ctrl+K title/body search, reloadable `/?note=<id>` full-page raw body editing, autosave, and optional graph navigation without new runtime dependencies or search/write APIs.
- Reused the existing canonical Markdown/If-Match controller, extended it for persistent caret-safe editing, and added adapter-owned search/history/dialog state in `notes-browser.ts`.
- Independent review found and regression tests now cover failed-save → undo → Retry, locally stale search during an in-flight save, connection dialogs during Back, and unavailable search hits crowding usable results. Added explicit modal Tab wrapping after a real browser focus check exposed focus leaving the dialog.
- `npm test`: **217 passed**. Desktop/mobile Chromium browser smokes passed with real disposable QMD indexing, persistence verification, long-note caret/scroll checks, mobile auth/failure recovery, history guards, and a read-only graph smoke on the same fixture server.
- `npm run cli:pack` and an extracted-tarball server smoke passed for `/`, direct note URLs, and `/graph`; `git diff --check` passed. Screenshots were reviewed from `/tmp/jumpybrain-notes-review/` (temporary QA artifacts, not repository memory).
- Boundaries unchanged: no note creation/title editing, no rich editor, no frontend service, no live-memory writes. Search retains the existing `normal` ranking across canonical buckets and validates IDs from indexed metadata; no protocol extension was needed.
- Remaining known limitations: browser QA covered Chromium/Chrome, not Safari/Firefox or a physical mobile keyboard. Indexed search is eventually consistent; existing bounded temporary last-write-wins behavior is retained. Archival was approved and completed on 2026-09-12.

## Confirmed Product Decisions

- Home is intentionally empty and opinionated: something like **“⌘K to enter your jumpyBrain.”** No note list, dashboard, recent-note feed, or graph on arrival.
- Opening a note goes straight to a full-page editor. The graph remains an optional, secondary view.
- Start with raw Markdown, not WYSIWYG or a block editor.
- ⌘K searches titles and contents across all notes; Enter opens the selected result.
- Keep autosave with understated Saving / Saved / Retry feedback, rather than a manual Save button.
- Scope is existing note bodies only, with titles unchanged. The user's affirmative response to that recommendation was explicitly restated during clarification.

## Investigation Findings (pre-implementation)

- `src/adapters/http-server/graph-page.ts` currently owns the entire dependency-free browser shell. Notes open in a desktop slide-in panel, expanding to viewport width only on mobile; there is no durable note navigation/history model.
- The existing toolbar search is a graph metadata filter, not body search. `src/app/local-memory/graph.ts` matches title, file, type, bucket, and tags; reusing that filter would not satisfy this task.
- Authenticated `POST /memories/all/search` already provides indexed search, snippets, provenance, and index freshness through `searchServerMemory`. Reuse it rather than building browser-side search over downloaded note bodies.
- Search result `id` is a QMD hit identifier, **not** a canonical document ID. Current results include indexed frontmatter in `provenance.metadata`, where a valid `metadata.id` can identify the document. Multiple hits may refer to one document; missing/stale IDs need explicit handling.
- Existing authenticated `GET` / `PUT /memories/all/documents/:id` support body editing through whole-document replacement with `If-Match`. The frontend already has a body/frontmatter codec, editor controller, 750 ms debounce, sequential saves, retry feedback, unload warning, and save-before-navigation guards.
- Current editing swaps a rendered reader for a textarea and exits editing on blur. The proposed full-page surface should instead stay in raw Markdown mode when focus moves to search or navigation.
- Writes mark the derived index stale; default server auto-indexing checks every five minutes. A successful note save does not mean new text is immediately searchable. The existing search packet carries this freshness state.
- `/graph` and `/graph/` are currently the only browser HTML routes. The shell is content-free, uses a nonce-based CSP, and authenticates data requests with the existing browser API key.
- Existing deterministic tests cover editor races, failures, conflicts, and Markdown preservation. The disposable-root browser editor smoke is the safe place to validate writes, not an arbitrary live note.
- Prior implementation deliberately uses a bounded, temporary last-write-wins retry after a stale hash. This task must preserve and document that debt, not silently invent a different conflict policy.
- Investigation was static code/doc inspection; no browser validation or test run was performed for this plan. Bounded local-memory recall found no matching notes; archived tasks and current source supplied the evidence.

## Implementation Defaults

The following recommendations were adopted during implementation without expanding the confirmed product scope.

- Serve the minimal home at `/`; use `/?note=<canonical-document-id>` for reloadable full-page notes. Keep `/graph` working as the optional map. Reuse one browser shell/controller where practical rather than building separate editor implementations.
- Home's main prompt is a real button: ⌘K on macOS, Ctrl+K elsewhere, with a plain “Search notes” accessible name and a tap/click path on mobile. A small secondary Graph link and discreet connection/settings access are sufficient chrome.
- Full-page notes have a read-only title, a readable centered column, a borderless/minimally framed monospace textarea, and a small header with Home, Search, and save status. Hide graph controls and routine metadata from the writing surface.
- The search palette contains one input and a short result list with title, body excerpt, and muted relative-path context when useful. No command categories, filters, AI answers, or empty-query recent-note feed.
- Retain the dependency-light browser approach and canonical Markdown files. Small adapter-owned browser modules are appropriate if needed to avoid further expanding the monolithic graph template; no frontend framework or editor dependency is required for this scope.

## Non-goals

- Note creation, title/frontmatter editing, rename, move, delete, or folder management.
- WYSIWYG, slash commands, draggable blocks, databases, comments, collaboration, or a formatting toolbar.
- New canonical storage, path-based document reads, or a new write endpoint.
- Offline draft persistence, conflict/merge redesign, automatic per-keystroke indexing, or a new search engine.
- Public-demo auth/rate limiting/reseeding; those remain in `tasks/todo/tasks-public-sandbox-hardening.md`.

## Relevant Files

- `src/architecture.docs.md`, `src/adapters/http-server/http-server.docs.md` — browser ownership and dependency boundaries.
- `src/adapters/http-server/graph-page.ts` — shell, credentials, graph UI, Markdown codec, editor controller, and navigation guards to reuse.
- `src/adapters/http-server/notes-browser.ts` — adapter-owned home/editor/dialog presentation, search controller, history controller, and document UI wiring.
- `test/notes-browser.test.js` — deterministic search, safe rendering, history, and stale document-read coverage.
- `src/adapters/http-server/routes.ts`, `src/adapters/http-protocol.ts` — shell routing, CSP, and existing search/document contracts.
- `src/app/server-memory/index.ts`, `src/app/server-memory/server-memory.docs.md` — remote search packets and index freshness.
- `src/types.ts` — search result/provenance and document read/update packet types.
- `src/adapters/qmd/qmd-driver.ts`, `src/adapters/qmd/qmd.docs.md` — evidence for search hit identity and indexed frontmatter; do not import QMD internals into the browser/CLI/core.
- `src/app/local-memory/graph.ts` — existing metadata-only graph filter, distinct from note search.
- `test/graph.test.js`, `test/server-http.test.js`, `test/architecture-boundaries.test.js` — controller, route, search, auth, and layer regression coverage.
- `scripts/graph-editor-smoke.mjs`, `scripts/graph-ui-smoke.mjs`, `scripts/playwright-runtime.mjs` — isolated writable smoke and read-only graph regression patterns.
- `package.json` — test/smoke/pack commands.
- `docs/shared-memory-protocol.md`, `docs/cloud-shared-memory.md` — browser entrypoints, operator access, and durable behavior documentation.
- `tasks/done/2026-07-22_tasks-graph-inline-markdown-editing.md` — existing editor decisions and completed safety work.

## Tasks

- [x] 1.0 Establish the minimal home and shared browser shell
  - [x] 1.1 Read `src/architecture.docs.md` and nearest co-located `*docs.md` before source edits. Keep browser presentation in the HTTP adapter and canonical/search/write policy in existing app/core seams.
  - [x] 1.2 Add the root HTML entrypoint, retaining `/graph` and `/graph/` compatibility. Preserve content-free HTML, nonce CSP, existing API-key handling, and authenticated data endpoints; never place keys in note query parameters or generated links.
  - [x] 1.3 Render the near-empty home with the clickable “⌘K to enter your jumpyBrain” prompt, platform-appropriate shortcut label, small Graph entry, and discreet connection access. Do not fetch/layout the graph or download note bodies on home arrival.
  - [x] 1.4 Separate home, note, and graph view state from graph-node selection. Reuse the editor/transport helpers; extract focused adapter-owned browser pieces only where needed, avoiding a parallel UI stack.

- [x] 2.0 Implement keyboard-first note search
  - [x] 2.1 Add a shared search dialog available from home, graph, and note editing. Handle Cmd+K / Ctrl+K, including when the textarea has focus; prevent the browser's default shortcut without intercepting unrelated input or IME composition.
  - [x] 2.2 Focus the input on open, constrain focus to the dialog, support Arrow Up/Down and Enter, and close with Escape. Restore focus and the editor selection/caret on dismissal. Escape closes the palette first and must not also navigate away from the note.
  - [x] 2.3 Use the authenticated search endpoint with a short debounce, bounded results, and abort/generation guards so late responses cannot replace newer results. Empty input shows a quiet prompt rather than executing a broad query.
  - [x] 2.4 Verify title-only and body-only queries against real indexed fixtures across memory buckets. Do not inherit graph filters or accidentally restrict search to `notes/` or synthesized `pages/`; use the existing retrieval-depth contract deliberately.
  - [x] 2.5 Normalize result titles/snippets and canonical IDs using validated `provenance.metadata.id`, never the QMD hit `id`. Deduplicate document hits while preserving ranking. Add regression coverage for the existing metadata contract; only extend the remote packet through app/types if this contract proves insufficient.
  - [x] 2.6 Show loading, no results, unavailable/unindexed search, authentication failure, and retryable request errors distinctly. Missing/invalid document IDs must produce an honest unavailable result, not a broken path-based read or silent mutation to stamp IDs.
  - [x] 2.7 Show a compact stale-index hint when supplied by the server. Do not imply “Saved” means “search index updated,” and do not trigger indexing on every search or save.
  - [x] 2.8 Make result selection open a full-page document through the same guarded navigation path used elsewhere; selecting a result must not depend on loading the graph first.

- [x] 3.0 Build the full-page raw Markdown editor
  - [x] 3.1 Open fetched documents directly in raw body-editing mode with a read-only title and small save indicator; remove the click-to-edit prerequisite and persistent preview/edit toggle from the primary flow.
  - [x] 3.2 Use a calm full-page layout: generous whitespace, readable maximum width, legible monospace text, soft wrapping for prose, and no panel border/card treatment dominating the page. Handle long notes, long lines, and narrow screens without horizontal page overflow.
  - [x] 3.3 Keep frontmatter outside the textarea and preserve it through the existing codec/PUT lifecycle. Keep any metadata disclosure secondary and collapsed; do not change title metadata or introduce new Markdown transformations.
  - [x] 3.4 Keep the textarea mounted and in editing mode on blur, palette open/close, and save-state updates. Preserve caret, selection, scroll, and undo behavior; do not replace the textarea value unnecessarily during reconciliation.
  - [x] 3.5 Reuse 750 ms autosave, blur flush, one in-flight save plus queued updates, current hash advancement, and guarded canonical reconciliation. Adapt reconciliation to persistent editing without ever replacing a newer draft.
  - [x] 3.6 Retain failed drafts, explicit Retry, unload protection, and the existing bounded stale-write retry. Keep saving/status updates accessible but visually quiet; no unbounded retry loops or misleading success feedback.
  - [x] 3.7 Show useful loading, missing/deleted document, invalid-ID, and auth/error states in the full-page shell, with Search/Home recovery rather than a blank page or forced graph load.

- [x] 4.0 Make navigation reliable without losing edits
  - [x] 4.1 Implement document URLs, direct loading/reloading, and browser Back/Forward. Read canonical document details from GET rather than requiring graph-node metadata.
  - [x] 4.2 Route Home, Graph, search-result selection, and graph-node selection through one save-before-navigation lifecycle. Opening a graph document goes full-page rather than retaining the old sidebar as a competing primary interaction.
  - [x] 4.3 On failed save, keep the current document and draft reachable and expose Retry. Prevent overlapping navigation; late reads/saves must not affect a newly selected document.
  - [x] 4.4 Handle `popstate` explicitly: browser history has already moved when it fires. Restore a consistent URL/view when dirty-note navigation fails, without history loops or falsely displaying a different note URL.
  - [x] 4.5 Preserve useful graph pan/zoom/filter state when returning within the shared shell where practical; leave graph refresh explicit rather than rebuilding after each keystroke or save.

- [x] 5.0 Validate simplicity, accessibility, and persistence
  - [x] 5.1 Add deterministic search tests for debounce, stale responses, auth reuse, title/body matching, document-ID mapping, duplicate hits, missing IDs, stale-index hints, empty states, and safe rendering of user-controlled titles/snippets.
  - [x] 5.2 Extend controller/navigation tests for direct note loading, palette focus restoration, persistent raw editing, browser history, queued saves during typing, and blocked navigation after failure. Preserve existing codec, concurrency, conflict, and unload tests.
  - [x] 5.3 Add HTTP shell coverage for `/`, existing graph entrypoints, query-based document entry, CSP, method handling, and no unauthenticated note content in HTML. Keep existing protected document/search endpoint tests passing.
  - [x] 5.4 Extend the disposable-root browser smoke, or add a sibling smoke, for home → Cmd/Ctrl+K → search → Enter → full-page edit → autosave → reread canonical Markdown. Use known ID-bearing fixtures and an isolated server/index; never edit arbitrary live memory.
  - [x] 5.5 Browser-test deep-link reload, Back/Forward, Escape precedence, caret/focus restoration, a controlled failed save with retry, and optional graph navigation. Cover desktop and mobile tap-to-search with no console errors.
  - [x] 5.6 Review the final UI against the simplicity goal: home is mostly empty, search requires no mouse, notes open directly into editable Markdown, save state is obvious but quiet, and graph/admin controls do not crowd writing. Check visible focus, accessible dialog/listbox semantics, contrast, reduced motion, and mobile keyboard/scroll behavior.

- [x] 6.0 Document, validate, and close
  - [x] 6.1 Update browser entrypoint/help and co-located HTTP adapter docs with the home/search/full-page flow, raw-body-only editing, autosave, note URLs, authentication, index freshness limitation, and unchanged temporary conflict policy.
  - [x] 6.2 Run `npm test`, the disposable editor/search browser smoke, the graph smoke against a safe test instance, `npm run cli:pack`, and `git diff --check`. Confirm packaged/self-hosted server assets work without a new frontend deployment service.
  - [x] 6.3 Results and known limitations recorded above; dated completed implementation entry added to `tasks/CHANGELOG.md`. Archived to `tasks/done/2026-09-12_tasks-minimal-notes-web-editor.md` with user approval.

## Acceptance Criteria

- Arrival shows an almost-empty entrance with a clickable/tappable search invitation; the graph is optional.
- Cmd+K / Ctrl+K works from every browser view, including inside the editor. Keyboard or touch selection opens a matching note full-page.
- Search finds title and body matches across the memory collection, not just currently visible graph nodes, and honestly reports errors/staleness.
- Existing notes open directly into raw Markdown body editing; no new-note, title-edit, or rich-editor scope is introduced.
- Edits autosave to canonical Markdown; failures retain the draft and offer retry. Navigation and late responses cannot silently drop or cross-wire drafts.
- A note URL reloads the same note; Back/Forward keeps URL, selected note, and save state consistent.
- Desktop and mobile flows remain uncluttered, accessible, and covered by isolated persistence tests.
