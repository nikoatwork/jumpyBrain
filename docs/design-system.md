# Browser design system

Keep jumpyBrain calm and compact: Ember colors, system sans-serif interface copy, a serif writing surface, and a small set of repeated dimensions. This is the shared browser UI used by the hosted app and Mac editor. Standalone native onboarding and update windows have separate styles and are not yet migrated.

## Source of truth

[`browser-design-system.ts`](../src/adapters/http-server/browser-design-system.ts) owns type, spacing, control, radius and motion tokens. [`browser-theme.ts`](../src/adapters/http-server/browser-theme.ts) owns semantic colors, shadows and the persisted System/Light/Dark choice. `graph-page.ts` composes both before component styles under the existing CSP nonce. Use these tokens in component rules instead of introducing another nearby pixel value or an override stylesheet.

## Typography

- `--text-ui` (13px): navigation, buttons, selectors and compact controls. Use the same size on desktop and mobile; increase the target size on touch layouts.
- `--text-body` (14px): explanatory paragraphs, primary result titles and Home actions.
- `--text-caption` (12px): dates, shortcuts, section labels, status and supporting metadata. Avoid smaller UI copy.
- `--text-section` (16px): Settings subsections. Search and connection inputs also use this size for comfortable entry on mobile.
- `--text-heading` (20px): page and dialog headings; `--text-display` (24–30px): Home greeting.

Use regular (400) for copy/actions, medium (500) for subtle labels, semibold (600) for headings/emphasis, and bold (700) for strong content. UI line height is 1.5; heading line height is 1.25. Communicate hierarchy with role, weight and color rather than an extra type size.

The document is a separate reading surface: `--font-writing` retains the existing Charter/Georgia stack, 19px desktop / 18px narrow body, 1.8 line height, 30–40px title, and 32/27/23/20px Markdown headings. Its source-line spacing is content behavior, not UI spacing. Do not flatten this hierarchy into the interface scale.

## Spacing and shape

Use the 4px rhythm: `--space-1/2/3/4/5/6/8/10/12/16` = 4/8/12/16/20/24/32/40/48/64px. `--space-0-5` (2px) is reserved for fine alignment. Prefer 4px between adjacent navigation rows, 8px between related controls, 12px inside controls, 16px between compact groups, and 24px around dialogs/content. Responsive reading-column whitespace and graph geometry remain layout-specific.

Use `--radius-sm` (6px) for controls/rows, `--radius-md` (10px) for larger action cards/popovers, and `--radius-lg` (14px) for dialogs. Keep palette-dependent shadows in the theme module.

## Components

- `.nav-item`: 13px text, 36px minimum height, 12px horizontal inset, shared hover/current-page styling. Footer destinations use aligned text labels. The Mac-injected Updates action uses the same class.
- `.sidebar-page-link`: same type/inset/minimum height as navigation; truncate long titles and keep the full tooltip.
- `.quiet-button`: default 13px secondary action, 36px minimum height. `.button` uses the same control height/type with semibold emphasis. `.icon-button` and dedicated utility buttons use 32px targets and 16px glyphs (brand/collapse marks are optical exceptions).
- Theme selector: one full-width native selector with a decorative sun and an accessible **Color theme** name. Its value already names the choice; no visible Appearance heading is needed.
- Narrow navigation (680px and below): preserve the compact top bar/page lists, use 40px navigation/theme targets, and place theme and optional Updates side by side. Keep the same type scale.
- Dialogs: 20px headings, 14px explanatory copy, 24px content padding, shared action gaps and focus rings. Supporting metadata may use the caption role.

## Color and interaction

Reuse `--surface`, `--control-fill`, `--surface-hover`, `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--line-strong`, `--accent` and error tokens. Both Ember palettes retain the existing contrast checks. Keep native select behavior, accessible labels, visible keyboard focus, active-page state, disabled state and reduced-motion handling. A theme change must not recreate the editor or lose a draft.

## Verification

Build, then run the relevant existing browser tests and `scripts/sidebar-smoke.mjs`, `scripts/theme-smoke.mjs`, `scripts/feedback-smoke.mjs`, and `scripts/companion-browser-smoke.mjs` through the repository's Playwright runner. Inspect desktop and 390/320px layouts in both themes, including the Mac-injected Updates button, long page titles, dialogs, and collapsed navigation. No personal memory or installed app needs to be modified.
