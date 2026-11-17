# Stop false conflicts when editing a brand-new note

Priority: proposed P1, to confirm. Status: planned 2026-11-17 from feedback; not reproduced yet.

## Goal

A single person editing their own new note in the Mac app never sees a conflict. Their edits always win when nobody else has changed the note. Real concurrent or external changes keep the existing conflict and recovery protection.

## Evidence

- [Nov 17 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=d8413d31-aa7a-41e4-9189-adeb9a9c944f) (Mac app, diagnostics attached): deleting the first line of a new note still gives a conflict. Nobody else edited it. The word "still" suggests an earlier fix did not cover this path.
- Related earlier work: [single-user recovery settlement](../done/2026-11-10_tasks-single-user-recovery-settlement.md), [seamless live co-editing](../done/2026-11-10_tasks-seamless-live-coediting.md), [idle session recovery](../done/2026-11-12_tasks-idle-session-recovery.md).
- Unproven hypotheses to test, not assume: the first line of a new note may be its title or a writer-supplied heading (for example the daily `How is your day?` heading), so deleting it may change the title, rename or re-stamp metadata and look like a destructive replacement; or the creation write and the first edit may race on the content hash.

## Relevant files

- `src/adapters/http-server/collaboration-editor.ts` - client conflict and reconciliation handling
- `src/adapters/http-server/live-editor-session.ts`, `editor-session.ts` - save path for the open note
- `src/app/collaboration/index.ts` and `collaboration.docs.md` - hub refresh and destructive-replacement classification
- `src/core/document-update.ts` - title and metadata rewrite on update
- `scripts/ux-update-feedback-smoke.mjs` - existing Chromium editing scenario

## Tasks

- [ ] 1.0 Reproduce
  - [ ] 1.1 Read the attached diagnostics (version, which conflict or recovery message) without copying private content into the repo.
  - [ ] 1.2 In disposable Chromium against a real local server: create a note with New note (and with daily quick capture), then delete the first line. Try the first line as title, as body heading and as plain text. Record the exact message and the request or hub event that triggered it.
  - [ ] 1.3 If it does not reproduce in Chromium, repeat in the packaged Mac app and note the difference.
- [ ] 2.0 Fix the first failing seam
  - [ ] 2.1 Fix the narrowest cause so the author's own save is not classified as a conflict. Keep real external replacement and concurrent-edit protection unchanged.
  - [ ] 2.2 Add a regression test for the reproduced case, plus one test showing a real external change still raises a conflict.
- [ ] 3.0 Verify and finalize
  - [ ] 3.1 Run the changed unit tests and the Chromium editing smoke per [testing](../../docs/testing.md#live-editing-and-websocket-scenarios).
  - [ ] 3.2 Update owning docs only where a contract changes. Update the [email index](../feedback.md) row, add a pending release note, and finalize under [task workflow](../../docs/task-workflow.md).
