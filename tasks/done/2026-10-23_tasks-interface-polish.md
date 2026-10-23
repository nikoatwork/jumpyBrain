# Interface polish

## Outcome

Completed a cosmetic pass over the shared browser/Mac interface. Home is a house beside New note and Search; connected brain health is a muted green dot. Navigation, Home refresh, graph controls and Settings use named icons with tooltips. Settings has compact profile rows and a collapsed connection form. Field labels, write approval, read-only information, failures and recovery language remain explicit.

## Scope

- Keep writing as the main visual surface; retain existing editor typography and behavior.
- Use shared decorative SVGs and theme-aware connection colors without new dependencies.
- Keep transport, memory policy, save barriers and connection permissions unchanged.
- Preserve the native update injection, including full-width details below the compact footer.

## Tasks

- [x] Apply compact navigation and connection presentation.
- [x] Simplify Settings and routine dialog/Home chrome.
- [x] Build, run relevant existing regressions and inspect desktop/narrow layouts in both themes.
- [x] Update design docs/release notes, archive and commit the scoped work.

## Verification

- Tested snapshot: base `740dbbf` plus this task's scoped working-tree changes on 2026-10-23; Node 26.7.0. Build passed (editor bundle 170,023 bytes gzip).
- All 120 targeted tests passed: browser-theme, notes-browser, companion-browser, daily-notes-browser, dream-handoff and feedback.
- Production sidebar, theme, feedback and companion-browser Playwright smoke suites passed. The final companion run includes confirmed host health before any memory fetch, collapsed form opening, profile editing and read-only checks.
- Theme smoke covers 1280/390/320px, both palettes, OS/manual/reload/cross-tab/storage behavior, drafts, dialogs and graph. Updated its stale `.node text` selector to the existing `.graph-labels text` overlay; no graph behavior changed.
- Visually inspected production-shell Settings and editor screenshots at desktop and narrow widths, dark and light. Browser preview confirmed no horizontal overflow and aligned Home/New/Search targets.
- Injected the actual `mountInlineUpdates` implementation into a disposable shell. Available-update controls fit, and failed-update details wrap below utilities without overlap or overflow at 1280/390/320px. No native update action was invoked.
- Opened the graph Filters icon successfully in the narrow browser preview. The standalone `graph-ui-smoke.mjs` command requires an explicitly configured indexed server and exited before running when none was supplied; graph rendering/theme and Dream guards are covered by the passing checks above.
- `git diff --check` passed. Screenshots reside in `/tmp/jumpybrain-interface-qa` and T3 browser artifacts.

## Limits

- Disposable fixtures only; no personal memory, installed app, credentials, release or remote writes were changed.
- Full repository tests, native packaging, physical devices, assistive-technology sessions and non-Chromium browsers were outside this cosmetic pass.
