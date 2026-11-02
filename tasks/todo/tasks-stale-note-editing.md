# Reliable editing after a note has been idle

Priority: P0 — ordinary editing can leave an unpublished draft. Status: planned; the reported failure has not been reproduced in this triage.

## Goal

Deleting text from a note left open for a while should save normally when its source is unchanged. If the source changed or the edit cannot be proven, preserve the draft and offer clear recovery without guessing a replacement.

## Evidence and boundaries

- [Direct user report, 2026-11-02 09:32 UTC](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=c85a4812-1f2f-4e79-bdc9-73c5684890f0): deleting existing text after an idle period failed source-range mapping, with no reported intervening agent edits. Idle duration, exact selection/input and installed build are unknown.
- The report includes diagnostic attachment metadata; its contents were not downloaded or inspected during triage. Do not put private notes or raw diagnostics in Git.
- [Fresh-note deletion](../done/2026-11-02_tasks-fresh-note-edit-feedback.md) is fixed in source at `11f9951`; Git history was checked during triage. That does not establish an installed or published fix for the reporter.
- The existing fresh-note outcome and calm error presentation do not establish that idle-note mapping is fixed. Establish the reporter's installed build and compare it with current source before choosing a change.

## Relevant files

- `src/architecture.docs.md`, `src/adapters/http-server/browser.docs.md`, `src/app/collaboration/collaboration.docs.md` — ownership and source/draft contracts.
- `src/adapters/http-server/lexical-editor.ts`, `src/adapters/http-server/collaboration-editor.ts` — input proof, selection mapping and source reconciliation.
- `scripts/fresh-note-feedback-smoke.mjs`, `scripts/collaboration-editor-smoke.mjs` — existing real editor regression paths.

## Tasks

- [ ] 1.0 Reproduce and classify the failure.
  - [ ] 1.1 Record exact source/build, backend epoch, note revision, input/selection and elapsed idle period using disposable notes. Compare unchanged source with external modification, reconnect and backend restart.
  - [ ] 1.2 Exercise deletion by Backspace/Delete, selected text and selection across paragraphs, including existing empty blocks. Establish whether stale projection, selection, source metadata or a genuine conflict causes the failure.
  - [ ] 1.3 If the disposable reproduction is insufficient, inspect the report's diagnostic attachment through the documented API and retain only sanitized findings. State unavailable evidence rather than inventing a cause.
- [ ] 2.0 Repair the proven failure at its owning seam.
  - [ ] 2.1 Refresh/reconcile invalid derived editor state before accepting a provable input; preserve source operation identity and exact publication semantics.
  - [ ] 2.2 Retain private drafts on ambiguity, avoid broad diff/whole-document replacement, and preserve the first actionable recovery outcome.
- [ ] 3.0 Verify and finalize.
  - [ ] 3.1 Add a regression reproducing the actual idle/edit sequence; assert exact canonical bytes after save and reload, plus retained draft on real conflicts.
  - [ ] 3.2 Run focused source/selection tests and real editor/collaboration smokes on disposable roots. Verify no concurrent-edit, Undo or reconnect regression; record packaged-Mac coverage or its absence.
  - [ ] 3.3 Update owning docs and pending release notes where relevant; record source/build, results and remaining limits, then archive and commit under [task completion](../../docs/task-workflow.md).
