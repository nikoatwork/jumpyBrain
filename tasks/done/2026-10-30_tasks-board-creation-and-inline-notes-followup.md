# Board creation and inline notes follow-up

## Completed — 2026-10-30

Implemented immediate named-default creation, inline board/column renaming and persistent in-column search/create. Confirmed creation and duplicate-safe membership remain separate; uncertain responses retain exact request/key or the already-created note ID for explicit retry. Personal boards stay local configuration and notes stay canonical Markdown.

## Goal

Make personal boards fast to start and populate: sensible default names, optional inline renaming, and in-column search and note creation. Follow the user's clean, Linear-inspired direction without adding configuration steps.

## Review basis — 2026-10-29

Three independent Mistral Large 4 code reviews covered smart defaults, search/creation, and interaction reliability. They inspected `4de1bc7` plus concurrent working-tree styling; the parent verified the key behavior again at `543ba59` plus the current working tree. This was source review, not a new browser or native test run. No implementation changes were made for this review.

Confirmed evidence in `src/adapters/http-server/boards-view.ts`:

- Lines 40, 90, 146: board creation opens a modal requiring a name before saving. Default columns are already To do / Doing / Done.
- Lines 80, 91, 142–143: adding notes opens the same modal. Enter from the search input submits new-note creation rather than selecting an existing match. Results are buttons and can be reached with Tab, but there is no arrow-key result selection.
- Line 142: each keystroke starts a request with a new abort signal; previous requests are never cancelled. Sequence checks reject stale responses, but there is no debounce or loading feedback.
- Lines 63, 87, 149: rendering replaces the column DOM, including after background title loading and window focus. An inline composer must survive these refreshes.
- `src/adapters/http-server/notes-browser.ts:625`: `createNoteSearch` already supplies debounce, cancellation, normalized results, selection, result retention and status. Reuse it with `searchMemoryNotes`; the Lexical reference UI itself is not reusable as a board widget. Adapt its open-oriented status copy and board membership selection rules.

The reviewers agree on the main changes. Their P0 labels describe UX priority, not established release-blocking severity. Existing code reloads after conflicts; it does not automatically replay a failed mutation.

## Recommended interaction contract

- New board creates and opens `Untitled board` immediately; use the first free numeric suffix for additional defaults. Keep existing name validation. Do not automatically start renaming: the user can begin adding notes straight away.
- Board and column titles can be renamed inline. Enter or valid blur saves; Escape restores the previous title. Blank renames keep the existing name rather than trapping the user in a required field. Keep accessible names and heading semantics.
- A small labeled `+` in each column header opens a focused composer in that column. Use one field, `Search or create note…`, with existing results and an explicit `Create “…”` action.
- Arrow keys choose eligible results/actions; Enter activates the visibly selected action. Bare Enter while search is pending must not silently create a note. Existing memberships stay visible as Added and are not selectable.
- After successful add/create, clear and retain the composer for repeated entry. Escape dismisses and returns focus to the column's `+`. Clicking elsewhere must not steal focus back. Preserve text through loading/errors and ordinary refreshes.
- The note-page Add to board chooser is lower priority. Keep its draft-preserving behavior; a popover or remembered destination is optional future work, not required for this pass.

## Tasks

- [x] Implement immediate board creation and inline board/column renaming in `boards-view.ts`; prevent repeated activation while saving and navigate only after confirmed creation.
- [x] Replace the column modal picker with an inline composer using `createNoteSearch` and `searchMemoryNotes`; provide keyboard/listbox semantics, explicit creation, useful loading/error states and repeated entry.
- [x] Preserve existing duplicate-safe membership, revision conflict recovery, scope fencing, read-only creation restrictions and companion save-barrier behavior. Preserve composer state/focus across board refreshes; cancel search on dismissal/navigation/scope change.
- [x] Keep the same creation request and idempotency key after uncertain responses. If note creation succeeds but board membership fails, retain the created note ID and retry membership without creating another note; clearly report the partial outcome.
- [x] Update `scripts/boards-smoke.mjs`, `integrations/electron/smoke-app.mjs` and relevant companion fixtures. Verify one-click defaults, inline rename/cancel, search keyboard selection, explicit create, repeated entry, refresh during typing, delayed search, retry/conflicts, duplicate membership, read-only targets, scope switches and preserved note drafts.
- [x] Run the build and relevant integration/native checks; inspect narrow/wide and light/dark layouts. Read `src/architecture.docs.md` and owning browser docs before implementation. Update `browser.docs.md` and pending release notes after verified implementation; finalize/archive/commit per `docs/task-workflow.md` when all required work is complete.

## Verification

Tested the scoped implementation on base `d612b20` on 2026-10-30. Concurrent sidebar-age work then landed separately as `342fd32`; rebuilt the combined tree and reran focused integration tests before this commit. That work and its release-note edit remain outside this task's commit.

- `npm run build` — passed; ordinary editor gzip remains about 189 KB.
- Initial full `node --test` — 1,499 passed, one skipped and one obsolete theme assertion failed. Corrected that fixture to verify the existing shared quiet-fill variable. The skipped provisioned-QMD 2.8.3 compatibility test requires `JUMPYBRAIN_TEST_QMD_BIN` and is outside this UI change.
- Rebuilt `node --test test/graph.test.js test/companion-browser.test.js test/collections.test.js test/notes-browser.test.js` — all 141 passed, including the corrected assertion and new board barrier/fencing checks. Final integration rerun also included `test/browser-page-navigation.test.js` with `--test-timeout=30000 --test-reporter=tap`: all 153 passed. An earlier integration attempt reported a gateway failure and stalled; it was terminated, then the gateway test independently and the complete focused command both passed. The transient failure was not reproduced. The full suite was not repeated after its focused assertion correction.
- `npx --package=playwright node scripts/boards-smoke.mjs` — passed against disposable real gateway, Markdown/index/store and loopback read-only server. Covers one-click/default suffixes/repeated activation, heading semantics, inline Enter/blur/Escape/blank rename, arrow/Enter selection, explicit create, repeated entry, delayed/error search, text/caret/outside-focus preservation, accepted-but-lost board and note responses, identical retry request/key, create-then-membership conflict without duplicate creation, duplicate membership, real scope switching, read-only creation restriction, move/restore/reload and retained unsaved note drafts.
- `node scripts/electron-smoke.mjs` — passed in the production sandboxed Mac window/gateway, including the new board flow and existing onboarding, editor, native menu, draft/close and tab cleanup checks. Updated stale starter unpin assertions to check the pinned shelf: edited notes may still appear in Attention.
- `npx --package=playwright node scripts/sidebar-layout-smoke.mjs` — passed 12 layouts and eight palette/scheme combinations with the native update control.
- `npx --package=playwright node scripts/companion-browser-smoke.mjs` — passed registration, two-tab freeze/flush, uncertain creation/conflict blocking, generation reload and read-only/session recovery.
- Inspected final wide/narrow light/dark board captures under `/tmp/jumpybrain-boards-qa/` and the native capture `.local-pack/desktop/board-native.png`. Screenshot capture completes theme transitions to avoid misleading intermediate colors. Shared page-action layout checks also passed at 1820/1280/1180/900/390/320px.

## Remaining limits

Retry state is tab-local. Dismissing an uncertain/partially completed composer or reloading can leave a created note outside the board; the note remains discoverable through ordinary notes/search. No crash-persistent drafts, cross-device board synchronization or automatic conflict replay was added. The note-page chooser remains a draft-preserving modal; optional popovers/remembered destinations are deferred as planned. Physical screen readers, Safari/Firefox and installed release packaging were not tested in this pass. No push, installation or release was performed.
