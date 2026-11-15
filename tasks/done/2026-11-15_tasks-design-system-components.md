# Design system: shared tokens and components

Status: completed in source and merged into `master` (fast-forward). Pending release.

Goal: centralize browser UI tokens and reusable components so future designs are predictable. Trigger: the sidebar brain switcher (`● Local brain ▼`) showed a hover fill that excluded its status dot, used the native triangle instead of the app chevron, and was a 48px row among 36px rows; footer controls beside it used different hover models.

Five parallel audits (tokens, buttons, selection/switchers, rows/disclosures, surfaces/fields/feedback) were reconciled into one set of rulings. A foundation pass, four file-disjoint migrations, and an integration pass followed. Independent Codex (gpt-6.1-sol) and Mistral (Large 4) reviews were run on the result and their strongest findings applied.

## Rulings

- Existing class names (`.button`, `.button-primary`, `.quiet-button`, `.quiet-button--plain`, `.icon-button`, `.dropdown`) are the API; modifiers add variants. Classes are the only API; no markup helpers.
- Glyphs are inline SVG from `browser-icons.ts` (CSP `img-src 'self'` forbids `data:` masks). One chevron rotates right→down; dropdowns use chevron-down; the brain switcher uses chevrons-up-down.
- Icon buttons are ghost 32px targets (40px narrow/coarse) with glyph-only hover; one shared pressed/current/expanded state with an accent ring on icon buttons; disabled is .5 opacity with `not-allowed`.
- Dialog actions right-aligned, Cancel first, primary last; destructive confirms use `.button--danger`.
- Floating surfaces use `--line-strong`, `--radius-md`, `--shadow-md`. Errors use `.status-text[data-error="true"]`; warning keeps `--accent`.
- Native onboarding/update windows, writing-surface values, graph geometry and appearance miniatures are out of scope.

## Checklist

- [x] Foundation: tokens + TS `media`/`motion`/`breakpoints`/`viewportMargin` exports, palette parity (`--shadow-md`, find fills, `--map-wash`), shared chevron/close/arrow icons.
- [x] Primitives: `browser-button.ts`, `browser-list.ts` (+ `setDisclosure`), `browser-components.ts`, dropdown chevron + `.dropdown--switcher`.
- [x] Enforcement: `test/design-tokens.test.js` — ratcheted raw-literal baseline (stylesheets, `<style>`, `cssText`, inline `style=` and JS-set styles), defined-token check, palette parity, and a primitive re-declaration rule.
- [x] Migrate all browser views onto primitives; raw literals fell from ~490 to 8 baseline exceptions (appearance miniatures, reading whitespace).
- [x] Brain switcher: one 36px (40px narrow) row whose hover covers the dot, shared glyph, aligned with Settled and footer icons, one tooltip source.
- [x] Sidebar page rows compose `.list-row--page` (were bespoke; now 40px on narrow like other rows).
- [x] `docs/design-system.md` restructured: Primitives owns look rules; Screens names composed primitives.
- [x] Build and selected unit and Chromium smoke checks.

## Verification (final build of the branch working tree, 2026-11-15)

- `npm run build`; `node --test` on 70 http-server UI test files including design-tokens, lexical-bundle (editor 184,838 B gzip under the restored 185,000 budget), graph, notes-browser, browser-theme: 698/698 pass.
- Chromium smokes passing: dropdown, sidebar-layout, sidebar-settle, theme, note-workspace, board-sidebar, boards, board-settings, related-pages, access-keys, reference-autocomplete, note-lifecycle, note-outline, dream-handoff, simple-recovery, collaboration-retained-versions, task-completion.
- Codex review: 10 requested smokes passed in an isolated worktree; danger-text contrast ≥4.7:1 in all palettes/modes; dropdown preparation idempotent; reduced motion and disabled-hover verified.
- Screenshots at 1280/390, light/dark, of footer switcher, Settings, page card, board view, search and sidebar rows were inspected.

## Limits

- Smokes that fail identically on `master` (pre-existing, not fixed here): sidebar (:41 default width), companion-browser (:179), feedback (:32), folder-explorer (:291 timeout), folder-explorer-actions (:112), graph-topic (:135), note-attention (:201), workspace-history (:49), editor-feedback (:59), graph-editor (save hang), graph-ui (related-notes message), recent-notes (:34 expects text on the icon-only Connect button). Steps after those failure points remain unverified on either branch.
- Single-brain switcher state was checked from static rendering only; native Electron smokes (`smoke-inline-updates`, `smoke-boards`) were not run.
- On narrow screens with a mouse, a hovered page row reserves 128px for actions, leaving a short title; a hovered narrow row still widens (pre-existing).
- Visible changes: toolbar icons 36→32px; board/drawing/settings rows 36px; Dream dialog 680→760px; access-keys compact layout at 480px; collaborator labels 10→12px; dialog action order.
