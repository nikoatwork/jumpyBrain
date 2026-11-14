# Design system: shared tokens and components

Goal: centralize browser UI tokens and reusable components so future designs are predictable. Trigger: the sidebar brain switcher (`● Local brain ▼`) shows a hover fill that excludes its status dot, uses the native triangle instead of the app chevron and a 48px row among 36px rows; footer controls beside it use different hover models.

Branch: `design-system-components`. Five parallel audits (tokens, buttons, selection/switchers, rows/disclosures, surfaces/fields/feedback) were reconciled into one orchestrator spec; the rulings below are canonical.

## Rulings

- Keep existing class names (`.button`, `.button-primary`, `.quiet-button`, `.quiet-button--plain`, `.icon-button`, `.dropdown`) as the API; add modifiers.
- Glyphs are inline SVG from `browser-icons.ts` (CSP `img-src 'self'` forbids `data:` masks). One chevron rotates right→down; dropdowns use chevron-down; the brain switcher uses chevrons-up-down.
- Icon buttons are ghost 32px targets (40px touch) with glyph-only hover; one shared pressed/current/expanded state; disabled is .5 opacity with `not-allowed`.
- Dialog actions right-aligned, Cancel first, primary last; destructive confirms use `.button--danger`.
- Floating surfaces use `--line-strong`, `--radius-md`, `--shadow-md`. Errors use `.status-text[data-error="true"]`; warning keeps `--accent`.
- Native onboarding/update windows, writing-surface values, graph geometry and appearance miniatures are out of scope.

## Checklist

- [ ] Foundation: tokens + TS `media`/`motion` exports, palette parity (`--shadow-md`, find fills), shared icons.
- [ ] Primitives: `browser-button.ts`, `browser-list.ts`, `browser-components.ts`, dropdown chevron + `.dropdown--switcher`.
- [ ] Enforcement: `test/design-tokens.test.js` ratchet baseline.
- [ ] Migrate component files onto primitives (sidebar/notes, settings/companion, boards/explorer/attention, graph/dialogs/feedback).
- [ ] Brain switcher: whole-row hover including the dot, shared glyph, aligned 36px row, one tooltip source.
- [ ] Update `docs/design-system.md` and `browser.docs.md` to describe primitives instead of per-component rules.
- [ ] Build and run selected unit and Chromium smoke checks; record results and limits.
