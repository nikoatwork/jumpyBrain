# Readable bold text and Markdown tables

## Goal

Render supported bold text and Markdown tables clearly in the Mac editor while preserving canonical source.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=6289f3bb-617f-482d-9d80-1c71d08715e4); triaged 2026-10-27.
- Tables were explicitly deferred in [the earlier editor work](../done/2026-10-25_tasks-markdown-checkboxes-code-tables.md); this request reopens that scope. Reproduce the reported spaced bold delimiters and distinguish valid Markdown from ambiguous literal text before changing parsing.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/lexical-editor.ts`, `browser.docs.md`, `scripts/lexical-editor-smoke.mjs`.

## Tasks

- [ ] Create minimal disposable examples for standard/spaced bold and tables; identify current parsing/rendering gaps and define supported syntax and literal fallback.
- [ ] Fix supported bold rendering and add the smallest readable table treatment that fits the editor; preserve unsupported/ambiguous Markdown without silent normalization or content loss.
- [ ] Verify open/save/reopen and unrelated edits retain table/bold source; check undo, external updates, code literals, links and guarded autosave where affected.
- [ ] Inspect table overflow and bold readability in both themes and narrow layouts; run focused editor checks and document the supported rendering/editing limits.
- [ ] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.
