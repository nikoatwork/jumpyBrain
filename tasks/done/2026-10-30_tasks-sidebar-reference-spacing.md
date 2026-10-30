# Reference sidebar spacing

Completed 2026-10-30.

## Outcome

- [x] Replace the footer separator with open spacing. Keep Graph, Settings and Feedback evenly grouped left; use a flexible last column to anchor the subtle update check right, including desktop Settings.
- [x] Match the reference's quiet Settled treatment: transparent 48px row, muted 14px regular text, 20px left/24px right desktop insets, count pushed right and a trailing disclosure chevron. Native details/summary interaction remains intact.
- [x] Move brain selection above Settled so the shelf flows directly into the icon bar. Preserve health, switching and save barriers. Reduce the narrow Attention minimum from 160px to 120px so the added library row does not clip Settled.
- [x] Verify responsive layout, disclosure interaction and brain selection; update owning docs/release notes and archive for the scoped task commit.

## Verification

Tested snapshot: `ef3f4a5` plus this task's changes.

- `npm run build` passed (189,457-byte gzip editor; 5,669-byte gzip optional extensions UI).
- `npx --package=playwright node scripts/sidebar-layout-smoke.mjs` passed: real companion shell/native update renderer, no divider, left action spacing, right update alignment, roomy Settled, 12 viewport/sidebar configurations, eight palette/scheme combinations, focus/hover, scroll isolation and Settings.
- `npx --package=playwright node scripts/collaborative-sidebar-smoke.mjs` passed: native Settled disclosure, counts, paging, provenance icons, refresh, reactivation, focus preservation and six responsive layouts.
- `npx --package=playwright node scripts/companion-browser-smoke.mjs` passed: multiple-brain selector and switching, settings, two-tab save barriers, read-only and failure recovery. This run preceded the final narrow Attention minimum-height reduction; the final layout/collaborative runs include it.
- `node --test test/browser-sidebar.test.js`: three passed.
- Initial layout validation caught narrow clipping after moving brain selection; fixed and rerun successfully. Replaced a hosted smoke's obsolete absolute Settled cutoff with actual footer/viewport bounds.
- Visually inspected the Ocean dark 280px sidebar and Ocean light 320px viewport captures under `/tmp/jumpybrain-sidebar-layout-qa/`.
- `git diff --check` passed.

## Limits

Presentation-only change, with existing update actions untouched. Chromium checks use disposable notes and production renderer code; no full Electron rerun, real update download, personal brain modification, app installation, push or release.
