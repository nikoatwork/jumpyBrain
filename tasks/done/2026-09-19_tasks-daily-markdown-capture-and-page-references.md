# Daily Markdown Capture and Page References

Completed and validated on 2026-09-19. Shipped dated quick capture, shared-search reference insertion, and neutral cream editor chrome; optional title editing remains deliberately deferred.

## Goal

Make jumpyBrain a comfortable daily Markdown editor: open the start page, create a dated note with Cmd+N, write with trustworthy autosave, and reference other pages through the same search experience used by Cmd+K. Prioritize quick capture and page-reference insertion over visual polish or richer editing.

## Notes and Scope

- Execution approved end to end. Implementation details remain intentionally flexible; no additional product clarification is required.
- “New node” means a new canonical Markdown note, not a new graph-specific entity. “Page reference/tag” means literal `[[Exact Page Title]]` text in the document body, not a new frontmatter taxonomy. Existing notes/documents are eligible targets; do not limit selection to the synthesized `pages/` bucket.
- Default a new note to a visible local-calendar date, e.g. `2026-09-19`, with a lightweight time/suffix when useful to distinguish multiple notes created that day. Persist the date indication so it survives reload; do not use a relative `today` label as the only identifier. Each intentional create makes a separate note, not a singleton daily journal.
- Global unique page-name enforcement is explicitly deferred. Keep canonical memory IDs as document identity; do not rename existing pages or redesign storage around titles.
- Rich Markdown/WYSIWYG, block editing, backlink panels, graph expansion, automatic target creation, rename propagation, and a new linking/indexing subsystem are out of scope. Reuse existing link semantics where applicable.
- Keep the calm, raw-Markdown editor and dependency-light browser shell. Add only small, clearly useful daily-driver improvements.
- Visual direction: a more Notion-like restraint with a neutral cream palette, warm off-white surfaces, charcoal text, subtle borders, and muted secondary controls. Reduce prominent orange/saturated accents where present. Borrow the calm appearance, not Notion's block editor or broader feature set.
- Existing autosave/search/navigation fixes are the baseline, not features to rebuild. There are in-progress changes in editor-related files; preserve and build on them.

## Current Baseline

- `/` already has Cmd/Ctrl+K search; `/?note=<canonical-id>` opens the full-page raw Markdown editor.
- The editor already supports 750 ms/blur autosave, serialized If-Match writes, save-state feedback, retained failed drafts/retry, caret preservation, and guarded navigation. Validate these rather than assuming autosave is broken.
- Authenticated note creation already exists at `POST /memories/all/notes` and requires an `Idempotency-Key`; prefer composing this flow over adding a new write API.
- Search is indexed and can lag confirmed writes. Existing UI reports freshness and must continue doing so for new notes and references.

## Relevant Files

- `src/architecture.docs.md` and nearest co-located `*docs.md` — read before changing source modules; preserve core/app/adapter boundaries.
- `src/adapters/http-server/notes-browser.ts` — start page, search, editor, keyboard handling, and navigation.
- `src/adapters/http-server/graph-page.ts` — shared browser transport and document save controller.
- `src/adapters/http-server/routes.ts` and `src/app/server-memory/` — existing authenticated note creation, idempotency, writes, and indexing.
- `src/core/canonical/` and `src/core/writing/` — existing reference resolution, canonical identity, and note metadata policy.
- `test/notes-browser.test.js`, `test/daily-notes-browser.test.js`, `test/remote-blank-note.test.js`, `test/server-http.test.js`, `scripts/graph-editor-smoke.mjs`, and `scripts/daily-capture-smoke.mjs` — deterministic and disposable real-browser regression coverage.
- `src/app/writing/remote-writer.ts` and `src/app/writing/writing.docs.md` — blank remote-note support; all other empty-content validation remains unchanged.
- `docs/cloud-shared-memory.md`, `docs/shared-memory-protocol.md`, and `package.json` — user workflow/protocol docs and `smoke:daily-capture` command.
- `tasks/done/2026-09-12_tasks-minimal-notes-web-editor.md` — prior editor scope and validation history.

## Tasks

- [x] 1.0 Add fast, dated note creation — highest priority
  - [x] 1.1 Add a discoverable New note action on the start page and in the editor, with Cmd+N and the appropriate non-Mac shortcut. Keep Cmd/Ctrl+K search unchanged. Verify real-browser shortcut delivery: Cmd/Ctrl+N can be browser-reserved, so retain an always-working button and document any platform limitation or alternate shortcut honestly.
  - [x] 1.2 Open a new dated note and focus the body immediately, without a required title, tag, or metadata form. Let users distinguish several notes created on the same day; use the existing canonical creation/metadata policy.
  - [x] 1.3 Reuse authenticated creation and idempotency so repeated key events, double clicks, and retries of the same attempt cannot create duplicates. Handle connection, loading, and failure states without losing typed draft text; leave immediate versus first-edit persistence to implementation judgment.
  - [x] 1.4 Apply the existing unsaved-change guard when creating from another note. After creation, use the canonical note URL, support reload/Back/Forward, and communicate search-index freshness rather than claiming immediate search visibility.

- [x] 2.0 Reuse page search for deterministic in-document references
  - [x] 2.1 Give the existing search/picker an insertion mode, triggered by typing `[[` and a discoverable Insert page reference action. Reuse result retrieval, keyboard selection, pointer interaction, accessibility, and error/freshness handling rather than building a separate search experience.
  - [x] 2.2 Selecting a result inserts `[[Exact Page Title]]` at the saved caret/selection, completes any partially typed reference without doubled brackets, and returns focus to the editor. Insertion must not navigate away or modify the target document.
  - [x] 2.3 Keep Escape/cancel non-destructive, preserve native undo and surrounding Markdown, and make reference insertion participate in ordinary autosave. Protect the insertion range against stale search responses or a changed/closed document.
  - [x] 2.4 Show enough result context to distinguish duplicate titles. Do not silently claim an ambiguous title identifies one unique page: explain or block ambiguous insertion as appropriate without enforcing global uniqueness. Handle missing/unsafe titles and unmatched queries honestly; no automatic target creation is required.
  - [x] 2.5 Preserve literal double-bracket syntax in canonical Markdown and check compatibility with existing link extraction/resolution. Opening references is optional only if cheaply supported by existing behavior; deeper linking and rename semantics remain deferred.

- [x] 3.0 Verify reliable autosave and add restrained editing polish
  - [x] 3.1 Exercise autosave for existing and newly created notes: pause/blur, rapid edits during an in-flight save, reference insertion, navigation, and reload after confirmed save. Fix demonstrated gaps without replacing the save controller unnecessarily.
  - [x] 3.2 Keep save state unobtrusive but trustworthy: distinguish unsaved/saving/saved/failed, retain drafts after failures, offer retry, and never abandon a dirty note after blocked navigation. Preserve existing conflict and unload protections; do not promise offline or crash recovery that is not implemented.
  - [x] 3.3 Review readable line width, spacing, long-note scrolling, caret/focus stability, and mobile controls. Make only obvious low-cost improvements; plain Markdown remains the primary editing mode.
  - [~] 3.4 Title editing deferred: the current body editor deliberately keeps title/frontmatter read-only; introducing a metadata/rename workflow is not needed for quick capture. Date/time titles distinguish captures, and body text remains searchable.
  - [x] 3.5 Give the home, editor, search picker, and dialogs a cohesive neutral-cream refresh: warm off-white backgrounds, charcoal typography, quiet borders, restrained hover/selection states, and minimal saturated accents. Aim for a calm, Notion-like writing surface without copying its layout or adding feature chrome. Preserve accessible text contrast, visible keyboard focus, and clearly distinguishable save/error states; do not rely on color alone.

- [x] 4.0 Validate the daily workflow and document completion
  - [x] 4.1 Add focused automated coverage for dated creation (including local date boundaries and multiple same-day notes), duplicate-create prevention/retry, guarded navigation, reference insertion/cancel/undo, duplicate titles, and autosave failures/races.
  - [x] 4.2 Run a disposable-root real-browser smoke: home → New note/shortcut → type → insert a searched `[[page]]` reference → wait for Saved → reload → find/open through Cmd+K once indexed. Exercise actual keyboard and pointer interactions, including search selection while autosave finishes, plus a mobile/button fallback. Never use live team memory as a write fixture.
  - [x] 4.3 Run `npm test`, the relevant editor browser smoke, and `git diff --check`; record observed browser shortcut limitations and any unverified platform behavior in this task list. Review desktop/mobile screenshots of the cream palette, including search, keyboard focus, and save/error states.
  - [x] 4.4 Update relevant user/module docs with creation/date defaults, shortcuts, reference syntax, and limitations. Only on completion, record the shipped result in `tasks/CHANGELOG.md` and archive this list under `tasks/done/` with the completion date.

## Acceptance

- From the start page, creating a note is one action, its date is apparent, and writing can begin immediately.
- New and existing notes save without a manual-save workflow, with honest status and recoverable failures.
- The existing page search can insert literal `[[Exact Page Title]]` references without leaving the current document or disturbing the draft.
- The experience remains focused raw Markdown; global unique names and deeper linking are not prerequisites.

## Implemented Decisions and Limits

- Create immediately through the existing authenticated/idempotent notes POST. Allow blank bodies only for remote `note` creation; the existing writer emits a date/title heading. Local CLI and all other remote memory types keep their content validation.
- Use browser-local `YYYY-MM-DD HH:mm:ss.SSS` titles and focus after the persisted heading. Repeated keys/double clicks share one in-flight creation; retry reuses the exact request/key until successful navigation.
- Support Cmd/Ctrl+N plus Cmd/Ctrl+Shift+Enter and visible buttons. Avoid an Option/Alt+N fallback because macOS uses Option+N for a dead-key accent.
- Keep creation retries in tab memory. Reload/crash recovery is not implemented, and canonical file creation plus the existing server idempotency receipt are not crash-atomic. The duplicate-suppression claim covers normal concurrent input and response-loss retries, not arbitrary server crashes.
- Insert plain `[[Exact Page Title]]` text using native textarea undo. Refuse unsafe/missing and visibly duplicate titles; keep errors stable during freshness updates. Search is bounded/indexed, so the picker cannot guarantee collection-wide uniqueness. Existing canonical graph resolution uses filenames, not frontmatter titles; references can remain unresolved and are not clickable editor navigation.
- Preserve the existing autosave/navigation controller. Fix creation-failure history restoration before unlocking the draft, replace complete references correctly even with a mid-reference caret, and keep no-op edits/undo to a confirmed body visibly Saved. Unconfirmed saves still require retry.
- Refresh ordinary chrome to warm cream/charcoal with quiet borders and visible focus/error feedback; retain categorical colors in the optional graph.

## Validation Results

- `npm test`: 235 tests pass in the isolated commit snapshot (236 with the pre-existing search-click regression), including local date rollover, same-day captures, lost-response retry keys, creation/save/history guards, reference ranges/title safety/stale drafts/native-insertion fallback, and no-op save-state regressions.
- Disposable daily-capture Chromium smoke: all 15 scenarios pass across desktop and mobile emulation, including real authenticated empty-note creation, response-loss replay without duplicate Markdown, repeated-key/double-click suppression, reference button/typing/pointer/keyboard/cancel/native undo, save failures/auth retry, and new-note discovery via Cmd/Ctrl+K after explicit server indexing.
- The isolated commit snapshot also passes all 15 daily-capture browser scenarios and the baseline editor/graph smoke. Combined-worktree disposable editor/graph smoke passes: long-note autosave/freshness/history, mobile retry/auth/reload, mouse result selection while autosave finishes, and graph-to-editor navigation.
- Desktop/mobile home, editor, search/focus, and failure screenshots reviewed. Development screenshots/logs remain under temporary directories, not canonical memory or repository fixtures.
- `npm run cli:pack` passes; an extracted-package server smoke confirms the shipped shell, shortcuts/palette, authenticated blank-note creation, and canonical readback. `git diff --check` passes.
- Browser automation confirms delivered Cmd/Ctrl+N and Cmd/Ctrl+Shift+Enter handling; it cannot prove OS-level delivery in all headed browsers. Safari/Firefox, physical mobile devices, and IME/platform shortcut behavior remain unverified. If native undo-preserving insertion is unavailable, the UI leaves the draft intact and explains manual insertion.
- No live memory roots or remote/team memory were written. Pre-existing editor/search fixes and unrelated migration/companion work were preserved. Initial validation included pre-existing uncommitted search-click fixes. At the user's request, the daily-capture commit isolates this task's changes; those earlier fixes and the unrelated migration work remain outside the commit.
