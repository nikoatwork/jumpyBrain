# Sticky page action card

- [x] Replace toolbar Details popover with a sticky top-right card containing Copy/Delete and folded saved-version facts.
- [x] Verify sticky scrolling, narrow layout, draft/actions and related footer; update docs and finalize.

## Outcome and verification

Completed 2026-10-29 against `ca7d119` and the current clean repository implementation. Rounded top-right Page card contains icon-only Copy/Delete and folded Saved version facts, source checks and Markdown metadata. Desktop card sticks inside the note scroll container; narrow layouts place it above the title. Related pages remain below the note. No chapter navigation or toolbar Page details popover.

- Build passed; editor bundle 186,112 bytes gzip, below the existing gate.
- Focused notes-browser/related-pages/note-workspace tests: 84 passed.
- Workspace smoke passed: card/editor separation and actual scroll stickiness, draft copy, formatting/selection, focus/Escape, read-only, scope reset, failed-save navigation, light/dark at 1280/1180/900/390/320px.
- Note lifecycle and related-pages smokes passed: actual capture/search/deletion confirmation and backlink preservation, real lexical related discovery, weak/stale/unavailable abstention, brain switch and read-only.
- Find/labels/delete smoke passed at 1280/390/320px in both themes with actions in the card.
- Living-topic source-check smoke passed with a fresh disposable fixture: unchanged/changed/missing sources, citation preservation, read-only checks, source navigation, two themes at 1280/390/320px. Initial attempt used stale `/tmp` fixture metadata and failed before browser work; restarted the documented fixture and reran successfully.
- Inspected desktop closed-card and narrow expanded-card screenshots under `.local-pack/desktop/note-workspace/`. Logs `/tmp/jumpybrain-sticky-card-*.log`. Diff whitespace check passed.
- No full suite, native rebuild, installation or release performed. No real semantic model or physical accessibility testing claimed.
