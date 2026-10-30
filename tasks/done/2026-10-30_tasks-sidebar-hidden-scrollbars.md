# Hidden sidebar scrollbars

Completed 2026-10-30.

- [x] Hide scrollbar chrome for the sidebar, pinned/attention/settled sections and narrow horizontal lists using standard scrollbar-width plus a WebKit fallback. Preserve existing native overflow behavior.
- [x] Verify the build and existing sidebar layout/scroll checks, update owning docs and pending release notes, and archive for the scoped commit.

## Verification

Tested `cc21c76` plus this scoped change:

- `npm run build` passed.
- `npx --package=playwright node scripts/sidebar-layout-smoke.mjs` passed: scroll isolation, footer placement, 12 layouts, eight palette/scheme combinations, hover/focus and Settings. A final rebuild restored the unrelated slash-menu scrollbar rule; sidebar CSS was unchanged from the smoke.
- `git diff --check` passed.

## Limits

CSS-only change; no scroll handlers or overflow settings changed. Chromium layout checks use disposable notes and production companion/native update renderer code. Physical touch devices, Firefox/Safari and a full Electron rerun were not tested. No installation, push or release.
