# Restore note footer and simplify actions

- [x] Restore related pages below the editor, remove section navigation/counts, and use compact metadata details.
- [x] Put accessible icon-only Copy and Delete actions together in the toolbar.
- [x] Verify workspace, related-page and deletion behavior; update docs and finalize.

## Outcome and verification

Completed 2026-10-29 against `05b9f32` plus this scoped change. Related pages are again a footer in the writing column, independent of metadata visibility. Removed chapter navigation, section counts and the resizing context rail. Compact Details holds saved-version/editor/date/location, source checks and raw metadata. It dismisses with outside pointer, Close or Escape; Close/Escape restore focus. Copy and Delete are adjacent icon-only toolbar actions with accessible names and tooltips; the existing guarded delete dialog remains authoritative.

- `npm run build`: passed; editor 186,144 bytes gzip, below the existing gate.
- Focused notes-browser/related-pages/note-workspace tests: 84 passed, zero failures.
- Updated `scripts/note-workspace-smoke.mjs`: passed, including copy of a live unsaved draft, read-only behavior, metadata dismissal/focus/reset, formatting/selection, failed-save navigation and 1280/1180/900/390/320px light/dark layouts.
- Updated `scripts/related-pages-smoke.mjs`: passed with Details closed, real lexical discovery, link cap/filtering, stale/unavailable abstention, brain switching/read-only, navigation and both schemes at 1280/390/320px.
- `scripts/note-lifecycle-smoke.mjs`: passed, including immediate search, stale-save recovery, delete cancel/apply and preserved backlink files/index refresh.
- Inspected desktop metadata and narrow related-footer screenshots in `.local-pack/desktop/note-workspace/` and `/tmp/jb-feedback-related-qa/`. Logs: `/tmp/jumpybrain-note-footer-{workspace,related,lifecycle,tests}.log`.
- No full release suite, native app rebuild, installation or publication performed. Existing transports, canonical writing and deletion policy unchanged.
