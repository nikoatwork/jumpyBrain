# Graph linked-topic previews

## Outcome

Missing graph links now open a read-only topic preview with useful linked/related notes. Explicit permission-gated page creation retains linked context during indexing. Completed 2026-10-28; no release or installation.

## Goal

Make graph links without a Markdown destination useful: open a transient topic preview with linked notes and related search, with explicit page creation on writable companion brains.

## Decisions

- Opening a missing target is read-only. Creating its canonical page is a separate explicit action using the existing guarded ensure-title operation.
- Linked notes come from the current bounded map packet; related results use shared authenticated search. Neither is generated synthesis or an exhaustive backlink claim.
- Unsafe path-like targets remain previewable but cannot be created as literal-title pages. Existing write permissions and navigation guards apply.

## Tasks

- [x] Add scoped, cancellable topic preview and guarded optional creation.
- [x] Preserve linked-note context when opening a newly created page.
- [x] Verify unit/integration behavior and real browser layouts, failures and cancellation.
- [x] Update owning docs/release notes and archive scoped work; commit recorded in repository history.

## Relevant Files

- `src/adapters/http-server/graph-topic-preview.ts`
- `src/adapters/http-server/graph-page.ts`
- `src/adapters/http-server/notes-browser.ts`
- `src/adapters/http-server/related-pages.ts`
- `src/adapters/http-server/browser-entry.ts`
- `src/adapters/http-server/browser.docs.md`

## Verification

- Tested working-tree implementation on base `0629830`, app `0.3.11`, browser build `1e199496343a34ba`.
- Build passes; production browser bundle is 183,706 bytes gzip (15 existing packages), under the reviewed 185,000-byte gate.
- Real disposable companion/Markdown smoke passes at 1280/390/320px in light/dark: keyboard graph activation, no writes on preview, linked navigation, path-title rejection, failed search, failed creation/retry and linked context after canonical creation.
- Final complete `node --test`: 1,419 tests, 1,418 passed, zero failures, one existing skipped test. Includes scoped cancellation, uncertain creation retry/status races, explicit-edge bounds, shared relevance/deduplication, stale-index context and existing architecture/editor/permission regressions.
- `git diff --check` passes.

## Remaining limits

- Linked notes come from the bounded current map (up to 40 openable unique IDs), not a full backlink scan. Related search uses 24 candidates and returns up to five strong matches.
- Preview context is transient; saved-page linked context survives within the current tab for its most recent created/opened target, not a reload. No synthesized content is generated.
- Explicit page creation is companion-only and permission-gated. Hosted/read-only previews retain linked navigation and related search.
- Chromium desktop/narrow automation does not establish physical-device, assistive-technology or other-browser coverage. No installation, push or release performed.

## Completion

Owning browser docs, pending release notes and the task changelog are updated. This list is archived under `tasks/done/2026-10-28_tasks-graph-linked-topic-preview.md` with the scoped implementation and verification.
