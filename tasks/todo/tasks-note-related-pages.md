# Related pages below a note

## Goal

Show up to five relevant related pages below the current note as small clickable pills or cards.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=ef728ccd-e6d4-4839-962e-d60c11212d89); triaged 2026-10-27.
- Return fewer or none when relevance is insufficient. Reuse bounded shared retrieval and inspect the existing Related notes extension before choosing the smallest integration. A ranking score is not automatically a calibrated semantic similarity.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/notes-browser.ts`, existing search app operations, `docs/extensions.md`; [existing extension work](../done/2026-10-24_tasks-executable-extensions.md).

## Tasks

- [ ] Define a bounded query from the saved note and a conservative relevance cutoff using the existing retrieval contract; exclude the current note and duplicate results.
- [ ] Render at most five compact related-page links at the bottom, with guarded navigation and no irrelevant filler for an empty result.
- [ ] Fence late results to the current brain/note revision; handle unavailable or stale search without saving, reindexing or expanding permissions implicitly.
- [ ] Check strong, weak, empty and duplicate matches plus fast navigation/brain switching; verify opening a related page respects unsaved-draft guards.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
