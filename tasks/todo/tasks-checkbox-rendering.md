# Render Markdown task checkboxes in the editor

## Goal

Answer the [November 13 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=37afc713-3035-4beb-acc8-f02cee4104b5) ([index](../feedback.md)): an agent-written task line such as

    - [ ] Shape Vicky Calls You as the next Agent initiative: second and later calls, recurring-call triggers. Start in the product brain note "Open (PM to plan): Vicky …"

shows as literal source in the Mac app instead of a checkbox. The user suggests treating `- [ ]` / `- [x]` like links: keep the Markdown source canonical and render it as a pretty, clickable checkbox. Also covers the open [nested checkboxes after Obsidian import](tasks-feedback-follow-ups.md) item.

## Tasks

- [ ] Reproduce in the browser editor (Chromium, disposable brain) with the exact shape above plus: `- [x]`, `* [ ]`, checkbox with inline code/emphasis/links/quotes/colons/parentheses, nested checkbox lists (2–3 levels, mixed checked state, Obsidian-style tab/2/4-space indentation), and ordered `1. [ ]`. Record which render, which fall back to literal source, and why.
- [ ] Render task items as checkboxes whose state lives in the source `[ ]`/`[x]`; toggling (click, keyboard) changes exactly those bytes and goes through the normal save/live path with Undo. Inline content renders as on ordinary bullets.
- [ ] Nested task items keep hierarchy and state; preserve source bytes (indent style, `x` vs `X`) on round-trip. If a construct stays unsupported, it must stay as editable literal source, never silently altered.
- [ ] Keep the editor bundle under its gzip ceiling (`npm run build`, `npm run check:package-size`).
- [ ] Tests: relevant `test/editor-markdown*.test.js` / source-map cases; one Chromium smoke at 1280 and 390px covering render, toggle, Undo, reopen exact bytes.
- [ ] Update `src/adapters/http-server/browser.docs.md`, add a release note to `tasks/todo/release-next.md`, mark the nested-checkbox follow-up, finalize per `docs/task-workflow.md`.
