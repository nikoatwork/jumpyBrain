# Fresh-note editing and error feedback

## Outcome

Completed: clearing a fresh note now saves through the empty-paragraph boundary. Live/editor failures use plain-language recovery toasts, preserve private drafts, and keep content-free diagnostic events.

## Scope

Fix the fresh daily-note deletion failure and replace technical live-editor errors with actionable, plain-language toasts while retaining draft/recovery safeguards and safe diagnostics. No installation, push or release.

## Tasks

- [x] Reproduce the fresh-note deletion and fix its source tracking.
- [x] Keep technical failures in diagnostics and show action-oriented feedback only when needed.
- [x] Test actual editor deletion, saving/reload, recovery feedback and collaboration regressions.
- [x] Record verification/limits, update release notes and changelog, archive and commit scoped changes.

## Findings

- Reproduced in the production shell: rapid Backspace through the daily prompt, its empty heading and remaining blank paragraphs produced unproven input. Further edits tried to compose onto the previous proven source and replaced that first failure with the reported intent mismatch.
- Empty paragraphs removed at a collapsed caret now carry their exact source interval and node-removal proof; no text diff or broad replacement is inferred. Later edits to a conflicted draft remain private and preserve the original failure.
- Live-editor errors use an action-oriented, dismissible system toast with state deduplication and recovery clearing. Raw exception/backend messages are excluded from banners, accessible status text and tooltips; existing content-free save/editor diagnostic events remain.

## Verification

Tested snapshot: `master` based on `16abb48` plus this task's scoped source, tests and docs; package version remains 0.3.17.

- `npm run build` — passed. Editor bundle: 219,948 gzip bytes, within the unchanged 220,000-byte gate.
- `node --test` — 1,792 passed, one skipped, zero failures (1,793 total).
- `npx --package=playwright node scripts/fresh-note-feedback-smoke.mjs` — passed at 1280px and 390px: real daily-note creation, rapid/delayed/held-ack deletion through the blank-note boundary, selected/select-all deletion, exact canonical publication, replacement text/reload, plain-language feedback, dismissal/deduplication, safe diagnostic retention and explicit recovery.
- `npx --package=playwright node scripts/collaboration-editor-smoke.mjs` — passed: two-context convergence, selective Undo, external/agent writes, IME, offline body/title recovery, positional intent/cursors, restart/review and bounded CLI actor churn.
- `git diff --check` — passed.

The first full run caught the bundle ceiling; rendering the standalone notification policy into the existing shell keeps the bundle within its unchanged limit. The collaboration runner's storage-denial assertion now expects the plain-language action. Its cursor proof now waits for the actual visible marker before checking exact geometry, avoiding an observed layout race without weakening positional assertions.

## Relevant files

- `src/adapters/http-server/lexical-editor.ts`, `collaboration-editor.ts`: exact deletion capture and retained-draft input handling.
- `src/adapters/http-server/collaboration-feedback.ts`, `notes-browser.ts`, `graph-page.ts`: feedback policy and toast presentation.
- `test/collaboration-feedback.test.js`, `scripts/fresh-note-feedback-smoke.mjs`: focused policy and production-shell regressions.
- `scripts/collaboration-editor-smoke.mjs`, `scripts/collaboration-cursor-proof.mjs`: updated feedback expectation and cursor-layout synchronization.

## Remaining limits

Automated browser checks use Chromium and disposable local brains. No packaged Electron installation, physical IME, Safari/Firefox or real remote deployment was exercised in this task. No personal notes were modified; no installation, release or push was requested.
