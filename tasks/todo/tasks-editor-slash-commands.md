# Editor formatting slash commands

## Goal

Offer the existing editor formatting actions through keyboard-friendly slash commands such as /h1 and /checkbox.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=c9f9de1c-9709-41b5-8002-809c5c055ac8); triaged 2026-10-27.
- Reuse existing formatting operations and canonical Markdown, autosave and history. Cover Text, H1/H2/H3, bold, italic, checkbox, inline code and code block; do not create a separate document model.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/{lexical-editor,browser-commands}.ts`, `browser.docs.md`; `scripts/lexical-editor-smoke.mjs`.

## Tasks

- [ ] Define aliases for current toolbar actions, the slash trigger context and selection behavior; leave literal slashes and code content untouched.
- [ ] Add a small filtered command menu with keyboard navigation, Enter selection and Escape dismissal, preserving caret and undo behavior.
- [ ] Invoke the existing formatting operations and consume only the chosen command token; honor read-only, composition input and session/save guards.
- [ ] Verify each action, cancellation, literal slash typing, empty/nonempty blocks and save/reopen; check menu placement, keyboard access and narrow layouts.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
