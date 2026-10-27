# Find text inside a note

## Goal

Let Mac users press Command-F to find text in the current note with familiar match navigation.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=57d9b028-8fff-49ec-8fec-a9ea0c15e3f8); triaged 2026-10-27.
- Keep in-note find distinct from Command-K memory search. Reuse native or existing editor capabilities where they fit; searching must not mutate Markdown or interrupt autosave.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/{notes-browser,lexical-editor}.ts`, `integrations/electron/` shortcut/menu ownership, `browser.docs.md`.

## Tasks

- [ ] Inspect native/editor find support and choose the smallest integration scoped to the current note, without intercepting unrelated modal input.
- [ ] Add Command-F, query entry, visible matches/count, next/previous and Escape dismissal with sensible focus restoration.
- [ ] Verify zero/multiple matches, Unicode, repeated searches, edited text and note switches; confirm highlights do not change saved Markdown or editor history.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
