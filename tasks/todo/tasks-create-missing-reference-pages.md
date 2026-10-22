# Create missing reference pages

## Goal

In the Mac app, clicking `[[alla]]` when no page has that title should create and open a page titled `alla`. Completing `[[alla]]` while writing should also create that page, while keeping the user in the source note.

Status: planned only, 2026-10-22. Implementation is deferred at the user's request.

## Current behavior

- Missing reference activation shows “No page has this title. Your draft is retained.”
- Inline autocomplete searches existing pages and inserts literal title references; it does not create targets.
- Fresh canonical title lookup already distinguishes found, missing, ambiguous and unopenable outcomes independently of the search index.
- The Mac app uses the shared browser/editor over the existing memory app. Keep creation policy in app use cases and HTTP routes thin.

## Scope and constraints

- Store new pages as canonical Markdown under `pages/`, with a normal generated document ID and the requested title. Indexing remains derived.
- Reuse a uniquely matching existing page using the current normalized exact-title rules. Do not create duplicates for ambiguous titles, invalid identities, failed scans, retries or repeated clicks.
- Creation on typing must require a completed, valid reference; unfinished `[[alla`, code examples and escaped/inert references must not create pages.
- Opening or hydrating an old note must not create every unresolved reference it contains. External refreshes and history restoration must not masquerade as user input.
- Preserve source drafts, save/history guards, authentication and companion brain/session fencing. Read-only connections must not create pages.
- Proposed timing: create newly completed references after the source note is successfully saved. Confirm this timing during implementation; the user specified creation on typing, without choosing an autosave boundary.
- No version bump, installation or publication is part of this task.

## Tasks

- [ ] 1. Define the creation contract and typed-reference trigger.
  - [ ] Specify empty-page content and metadata, preserving the exact display title.
  - [ ] Finalize when completed references create targets, including paste, autocomplete insertion, edits, undo/redo and IME composition.
  - [ ] Distinguish newly entered references from pre-existing references and external updates.
- [ ] 2. Add a canonical find-or-create app operation.
  - [ ] Resolve titles freshly at the active editor memory root, independently of QMD/search freshness.
  - [ ] Serialize missing-title lookup and publication with existing server writes; document limits across processes and external filesystem writers.
  - [ ] Reuse existing targets and refuse ambiguous/unopenable outcomes without writing.
  - [ ] Make concurrent requests and uncertain-response retries reuse the saved page. Separate successful canonical publication from index bookkeeping failures.
  - [ ] Expose the operation through authenticated, validated transport while retaining read-only title lookup semantics.
- [ ] 3. Create and open missing references on activation.
  - [ ] Save the source through the existing navigation guard before creating a missing target.
  - [ ] Fetch and validate the confirmed target before replacing the editor; preserve browser history and keyboard/touch activation.
  - [ ] Coalesce repeated activation and fence late responses after note, credential or brain changes.
  - [ ] Give clear retry feedback for real failures and explain read-only/ambiguous outcomes without losing the draft.
- [ ] 4. Create targets for completed references while writing.
  - [ ] Recognize valid newly entered references using the editor's conservative reference rules.
  - [ ] Create missing targets without navigating away, changing source text, moving the caret or breaking undo history.
  - [ ] Reuse existing pages and refresh search/map freshness after actual creation.
  - [ ] Retain a clear recovery path when creation cannot be confirmed; avoid silent duplicate retries.
- [ ] 5. Verify behavior and document the result.
  - [ ] Test click-to-create/open, typed `[[alla]]` creation, exact titles, existing-page reuse and blank-page editing/save/reload.
  - [ ] Test duplicate/normalized titles, concurrent requests, repeated clicks, lost responses, deletion/rename races and stale indexes.
  - [ ] Test failed source saves, read-only/auth failures, brain switches and cancelled navigation.
  - [ ] Test partial syntax, escaped/code/inert references, paste, IME, undo/redo, hydration and external refresh.
  - [ ] Extend production reference browser smokes for desktop and narrow touch; verify the Mac companion path and record any installed-app limits.
  - [ ] Update owning browser/server-memory/writing/protocol docs and add a short pending release note only after implementation lands.
  - [ ] Record the tested snapshot, results and remaining limits here; assess any changelog entry against repository hygiene rules.

## Relevant files

- `src/adapters/http-server/notes-browser.ts` — activation, navigation/save guard and note-save callbacks.
- `src/adapters/http-server/{lexical-editor,reference-autocomplete,reference-ranges,reference-policy}.ts` — literal reference editing, recognition and suggestions.
- `src/adapters/http-server/{routes,browser-transport}.ts`, `src/adapters/http-protocol.ts` — authenticated browser transport and route ownership.
- `src/app/server-memory/resolve-title.ts`, `src/app/server-memory/index.ts` — canonical lookup and server-local write orchestration.
- `src/app/writing/remote-writer.ts`, `src/core/document-title.ts` — page publication and shared normalized-title policy.
- `test/server-title-resolution.test.js`, `test/daily-notes-browser.test.js`, reference policy/range tests — deterministic regression coverage.
- `scripts/{page-reference,reference-autocomplete,page-reference-editor}-smoke.mjs` — production editor/reference integration coverage.

## Planning outcome

Source investigation completed. Initial implementation edits were undone when the user requested planning only. No implementation, test run, release-note change or changelog change is included in this task-list work.
