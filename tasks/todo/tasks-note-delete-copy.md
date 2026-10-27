# Short note deletion confirmation

## Goal

Make deleting a note a clear, compact confirmation with one plain warning sentence.

## Notes

- Source: [feedback received 2026-10-27](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=965ae728-c5fc-4e26-bd47-f7995d80e3fd); triaged 2026-10-27.
- Keep the note title, Cancel and an explicit delete action. Preserve permanent-delete semantics and all existing authorization, conflict and draft guards.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/notes-browser.ts`, `browser.docs.md`; existing note-lifecycle smoke.

## Tasks

- [ ] Replace the explanatory paragraphs and dependency counts in the confirmation with one sentence that clearly says deletion cannot be undone.
- [ ] Keep confirmation tied to the selected note and preserve cancellation, focus handling and guarded deletion.
- [ ] Inspect the dialog in the Mac app at desktop/narrow widths; exercise Cancel and successful deletion using a disposable note, plus existing lifecycle checks.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
