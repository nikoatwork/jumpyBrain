# Quieter page references

## Goal

Make page references easy to read without distracting bracket syntax in ordinary note reading.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=f9af6356-e336-474f-8e5f-43a4813c9983); triaged 2026-10-27.
- Keep canonical [[reference]] Markdown and existing reference navigation/insertion semantics. Improve the existing editor presentation rather than introducing a second storage representation.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/lexical-editor.ts`, page-reference styling and `browser.docs.md`; existing page-reference editor smoke.

## Tasks

- [ ] Inspect reference presentation in reading, focus and editing states; hide or visually soften brackets while keeping linked text discoverable.
- [ ] Preserve reference editing, caret/selection, missing-page behavior, accessible activation and literal bracket text inside code.
- [ ] Check dense-reference notes in both themes, plus mouse/keyboard navigation and save/reopen round trips without source changes.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
