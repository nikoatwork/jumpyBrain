# Empty page title while renaming

Completed 2026-11-05. Clearing the title no longer submits invalid metadata or enters conflict. Replacement typing resumes normal autosave; body editing, durable drafts and save barriers remain intact.

## Goal

Keep the Mac page editor usable when deleting the final title character before typing a replacement. Preserve canonical Markdown and navigation/save protection while the name is blank.

## Tasks

- [x] Trace the empty-title autosave rejection and retained-conflict behavior.
- [x] Reproduce with a focused regression and native Electron input.
- [x] Keep blank/whitespace titles as editable local drafts; resume normal publication on valid input.
- [x] Verify body editing, pending title acknowledgments, draft persistence, save barriers and existing conflict behavior.
- [x] Run focused tests, real backend/editor and focused production Electron smoke; record results and limits.
- [x] Update owning docs and pending release notes; archive and commit scoped changes.

## Findings

- The 35 ms live autosave submits an empty title; the backend correctly rejects it as `invalid_title`, but the client enters conflict and later input cannot autosave without manual recovery.
- Canonical titles remain nonblank. Empty input should remain a private draft and must never be reported as Saved or silently discarded during navigation.

## Verification

Tested snapshot: base `49795af177ae7722bc3aa71cd4d8158d9c0549c8` plus this scoped change. Compiled collaboration editor SHA-256 `eba175f217cefebbc6df253ca70edb5f5086722fbe1a51166d41758a310c5729`; compiled notes shell SHA-256 `942fa02a0e1e896f11ebee6811481d7bd0c71ff9344854c806091db220910526`.

- The new empty-title regression failed against the original compiled runtime with unexpected `conflict`, then passed after the fix.
- `npm run build` and 52 focused editor, feedback, workspace, companion and canonical-write tests passed.
- `npx --yes --package=playwright node scripts/collaboration-editor-smoke.mjs` passed against the real backend, including two contexts, exact positional intent, offline recovery, title normalization, real foreign conflicts, IME and 132 fresh CLI actors.
- `node scripts/electron-smoke.mjs --title-rename` passed in the sandboxed production Mac window against a disposable real gateway/root: native final-character Backspace, selection deletion, whitespace, focus retention, blur/save barrier, unchanged canonical bytes while blank, replacement publication, unchanged body, reload and tab cleanup.
- Broader `node scripts/electron-smoke.mjs` fails at the existing onboarding starter unpin/reload checkpoint (waiting for the starter's `[data-page-link]` to disappear), before reaching the rename checks. It failed at the same checkpoint before the production source fix and again after rebuilding. The focused mode exercises the same production window and rename helper independently of onboarding; no claim is made that the entire desktop smoke passes.
- Full `node --test`: 1,919 tests, 1,917 passed, 2 skipped, 0 failed (87.2 seconds). `git diff --check` passed.

## Limits

- Disposable fixture validation only; no installed app update, release or private brain mutation.
- Canonical blank titles remain rejected; the client retains unfinished renames and blocks save barriers until a valid replacement or restoration of the saved name.
