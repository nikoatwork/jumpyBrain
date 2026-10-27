# Find text inside a note

## Completed — 2026-10-27

**Implemented: non-mutating in-note find.**

Relevance: there was no browser note-scoped find or native Find menu. Added Cmd/Ctrl+F and Edit → Find in Note…, a sticky query bar, visible literal case-insensitive body matches/count, next/previous buttons and Enter/Shift+Enter, and Escape with prior body-caret/title-focus restoration. Match navigation scrolls the actual range into view. DOM observation refreshes after editing; note navigation clears ranges. CSS Highlight ranges never modify Lexical nodes, Markdown, save state or editor history. Open dialogs retain input ownership.

## Tested snapshot

Base `56c8fe075508a6392417de275856a5190af29b55` plus this commit’s scoped working tree; built on 2026-10-27 with Node v26.7.0. Editor bundle: 540,252 bytes / 178,797 bytes gzip, SHA-256 `e95e3e65e9dcbab2d9e592881c9c8ff84ba2328c9bf7d447209332d758bd2873` (reviewed 180 KB gate, no new dependency).

## Verification

- `npm run build`: PASS. Log `/tmp/jumpybrain-ux-build.log`.
- Focused architecture/core/server/runtime/search/browser/deletion/editor/bundle/Electron tests: **142 passed**, `/tmp/jumpybrain-ux-focused-tests.log` (then superseded by the passing full-suite snapshot).
- `node --test`: **1,392 passed, 1 skipped, 0 failed**, `/tmp/jumpybrain-ux-all-tests-final.log` (60,999ms). An earlier heavily concurrent run hit an unchanged QMD marker-file race, cascading to seven failures; isolated `test/qmd-execution.test.js` rerun passed all 15, and the final full suite passed without concurrent browser work. Evidence: `/tmp/jumpybrain-ux-qmd-rerun.log`, `/tmp/jumpybrain-ux-all-tests.log`.
- `npx --yes --package=playwright node scripts/note-find-smoke.mjs`: PASS six 1280/390/320px light/dark cases: zero/multiple/Unicode/literal punctuation, cross-formatting matches, next/previous/wrap, deep scrolling, repeated search/live edits, note switch, Escape/caret/title focus, modal isolation, no find PUT/unchanged saved bytes and actual edit Undo. Log `/tmp/jumpybrain-ux-find-smoke.log`.
- Final native-menu preservation check: `node --test test/electron-host.test.js` **3 passed** (`/tmp/jumpybrain-ux-native-host-tests.log`), followed by the passing native smoke below. Find appends to the platform Edit menu, preserving its stock roles.
- `node scripts/electron-smoke.mjs`: PASS actual sandboxed Mac Find menu/Command-F, match navigation/Escape, canonical bytes unchanged, 1200/480px light/dark, plus existing autosave/close guards. Log `/tmp/jumpybrain-ux-electron-smoke.log`.
- Browser captures `/tmp/jumpybrain-note-find-qa/find-{width}-{theme}.png` and native `.local-pack/desktop/find-{width}-{theme}.png`; inspected narrow dark/browser and native captures.
- Related required runs also pass: search recognition, note lifecycle and companion browser, with logs `/tmp/jumpybrain-ux-{search,lifecycle,companion}-smoke.log`.

## Remaining limits

Find searches the rendered note body, including supported formatting/literal code/reference text; title/frontmatter are excluded. Decorations stop at 2,000 matches (count shows +); Unicode case matching does not normalize canonically different spellings. CSS Highlight-capable Chromium/Electron were tested; unsupported browsers keep native keyboard behavior. Physical IME/assistive technology and other browsers remain separate checks.

Owning browser/design-system/desktop docs and pending release notes updated. The changelog records the new find capability; routine copy/label/search refinements do not receive separate highlights. No glossary term was needed. No personal installation, real notes, live email, push, release or version change.

## Goal

Let Mac users press Command-F to find text in the current note with familiar match navigation.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=57d9b028-8fff-49ec-8fec-a9ea0c15e3f8); triaged 2026-10-27.
- Keep in-note find distinct from Command-K memory search. Reuse native or existing editor capabilities where they fit; searching must not mutate Markdown or interrupt autosave.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/{notes-browser,lexical-editor}.ts`, `integrations/electron/` shortcut/menu ownership, `browser.docs.md`.

## Tasks

- [x] Inspect native/editor find support and choose the smallest integration scoped to the current note, without intercepting unrelated modal input.
- [x] Add Command-F, query entry, visible matches/count, next/previous and Escape dismissal with sensible focus restoration.
- [x] Verify zero/multiple matches, Unicode, repeated searches, edited text and note switches; confirm highlights do not change saved Markdown or editor history.
- [x] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.

## Combined verification

See [the integrated feedback result](2026-10-27_tasks-feedback-integration.md) for merged-snapshot testing and the cross-feature fixes found after this group was integrated. The measurements above describe this group’s original tested snapshot.
