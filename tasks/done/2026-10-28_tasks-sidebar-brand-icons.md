# Sidebar brand, icons and brain placement

Completed 2026-10-28. Pin/refresh now use Lucide shapes, the header uses an italic/semibold serif wordmark, and the active brain sits above the footer icons.

## Goal

Replace the broken-looking pin/refresh glyphs, give the sidebar wordmark more personality, and move the active brain above the bottom utility controls.

## Decisions

- Use locally embedded Lucide pin and refresh-cw shapes with their license notice; share the pin through the existing icon module.
- Use a compact serif wordmark with italic jumpy and emphasized Brain.
- Keep brain health and switching behavior intact; place the existing control inside the footer above its icons.

## Tasks

- [x] Implement the icon, wordmark and footer presentation changes.
- [x] Build, run relevant existing tests and browser smokes, inspect light/dark desktop and narrow captures.
- [x] Update owning docs and pending release notes, record verification/limits, archive and commit the scoped change.

## Relevant files

- `src/adapters/http-server/browser-icons.ts`
- `src/adapters/http-server/browser-page-navigation.ts`
- `src/adapters/http-server/notes-browser.ts`
- `src/adapters/http-server/companion-browser.ts`
- `integrations/electron/update-inline.mjs`
- `scripts/companion-browser-smoke.mjs`
- `docs/design-system.md`
- `src/adapters/http-server/browser.docs.md`


## Verification

Tested snapshot: `f031a2c` plus this scoped implementation.

- `npm run build` — passed; editor bundle 184,969 bytes gzip, within the existing 185,000-byte gate. A pure initializer keeps unused server-side glyphs out of the browser bundle.
- Existing sidebar/theme/page-navigation/notes/companion/updater and bundle tests — 146 passed, 0 failed.
- `scripts/sidebar-smoke.mjs` — passed pin/unpin, persistence, rename, cross-tab, autosave/save guards, themes and narrow layout; repeated against the final tree-shaken bundle.
- `scripts/companion-browser-smoke.mjs` — passed brain switching, registration, Settings, failed saves, session recovery and new footer geometry assertions at 1280/390/320px in both themes, with the native header inset enabled.
- Electron `smoke-inline-updates.mjs` — passed production-shell update states, keyboard/focus, themes, narrow layout, reduced motion and draft stability.
- Inspected desktop dark, narrow light, pinned-note and native update captures under `.local-pack/sidebar-brand-ui/` and `.local-pack/update-inline-ui/`.
- `git diff --check` — passed.

## Limits

- Disposable Chromium/Electron fixtures only; no installed app, personal memory, push or release was changed. Physical native traffic lights, assistive technology and other browsers were not manually tested.
- The broader icon set remains in place; pin and refresh were replaced with Lucide shapes without adding a package or network asset dependency.
