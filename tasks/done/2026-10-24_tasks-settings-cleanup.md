# Lean Settings

Completed 2026-10-24. Settings now starts with a compact brain list and one refresh icon beside the page heading. Extension reload is an icon, palette selection appears only when custom themes exist, and connection forms use shorter copy. Explicit write approval, save barriers and recovery remain intact.

## Work

- [x] Remove the search-index heading and paragraph; expose target, busy state and disabled reason through the icon's accessible metadata/tooltip.
- [x] Put brains first in a semantic list with muted health dots, small named actions, active-row accessibility and truncated paths with full tooltips. Keep failure/read-only captions visible.
- [x] Put Extensions below connections, align reload with its heading, hide empty status spacing and omit the palette control when there are no custom themes.
- [x] Shorten connection copy while preserving per-brain editing/index consent and Keychain behavior.
- [x] Verify desktop/390px/320px layouts in both themes, stable focused row controls across polls, remote read-only behavior and existing browser workflows.
- [x] Update owning docs, consolidate pending release notes, record the result in the repository changelog and archive the list.
- [x] Commit scoped implementation, verification scripts, docs and this archive together.

## Verification

Tested base `4c0d4d7` plus the scoped cleanup, without modifying personal memory or the installed app.

- `npm run build`: passed. Browser bundle 175,589 bytes gzip; optional extensions bundle 5,600 bytes gzip.
- Full `node --test`: 1,329 passed, one skipped. After the final conditional-palette adjustment, the focused companion/extension/theme/architecture suites passed all 45 tests.
- Production `scripts/companion-browser-smoke.mjs`: passed, including registration, controls, permissions, serialized polling, two-tab save/freeze/switch, conflicts, unconfirmed creation and session recovery.
- Reviewed six Settings screenshots at 1280/390/320px in light/dark; no horizontal overflow, icons have accessible names and 32px desktop/40px narrow targets. Screenshots retained locally in `/tmp/jumpybrain-settings-qa`.
- Production sidebar, theme and feedback smokes: passed.
- Extension controller smoke: passed, including palette visibility with available custom themes, theme fallback, command/panel lifetimes and write confirmation.
- `git diff --check`: passed.

The companion smoke's older search fixture lacked the recognition version required by the current UI. Updated the synthetic response and added settled empty-extension support; no production search behavior changed.

## Limits

Verified the shared production browser shell in Chromium over disposable fixtures. No native Mac installation, release, physical-device or assistive-technology verification was performed. Ordinary hosted servers retain their existing connection dialog; the full Settings screen is companion-only.

## Relevant files

- `src/adapters/http-server/companion-browser.ts`
- `src/adapters/http-server/extensions-view.ts`
- `src/adapters/http-server/extensions-browser.ts`
- `scripts/companion-browser-smoke.mjs`
- `scripts/extensions-browser-controller-smoke.mjs`
- `docs/design-system.md`
- `src/adapters/http-server/browser.docs.md`
- `src/adapters/http-server/extensions-browser.docs.md`
- `tasks/todo/release-next.md`
- `tasks/CHANGELOG.md`
