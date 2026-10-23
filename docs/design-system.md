# Browser design system

Keep jumpyBrain calm and compact: Ember colors, system sans-serif interface copy, a serif writing surface, and a small set of repeated dimensions. This is the shared browser UI used by the hosted app and Mac editor. Standalone native onboarding and update windows have separate styles and are not yet migrated.

## Source of truth

[`browser-design-system.ts`](../src/adapters/http-server/browser-design-system.ts) owns type, spacing, control, radius and motion tokens. [`browser-theme.ts`](../src/adapters/http-server/browser-theme.ts) owns semantic colors, shadows and the persisted theme preference. `graph-page.ts` composes both before component styles under the existing CSP nonce. Use these tokens in component rules instead of introducing another nearby pixel value or an override stylesheet.

## Typography

- `--text-ui` (13px): navigation, buttons, selectors and compact controls. Use the same size on desktop and mobile; increase the target size on touch layouts.
- `--text-body` (14px): explanatory paragraphs, primary result titles and Home actions.
- `--text-caption` (12px): dates, shortcuts, section labels, status and supporting metadata. Avoid smaller UI copy.
- `--text-section` (16px): Settings subsections. Search and connection inputs also use this size for comfortable entry on mobile.
- `--text-heading` (20px): page and dialog headings; `--text-display` (24–30px): Home greeting.

Use only regular (400) for interface copy/actions and semibold (600) for headings/emphasis, including interface `strong`/`b` content. There is no medium or bold UI token. UI line height is 1.5; heading line height is 1.25. Communicate hierarchy through spacing, semantic type roles and color before adding emphasis.

The document is a separate reading surface: `--font-writing` retains the existing Charter/Georgia stack, 19px desktop / 18px narrow body, 1.8 line height, 30–40px title, and 32/27/23/20px Markdown headings. Its source-line spacing is content behavior, not UI spacing. Markdown bold uses the separate `--weight-writing-bold` (700) token; writing titles retain their 500 weight. These content rules do not introduce extra interface weights. Do not flatten this hierarchy into the interface scale.

## Spacing and shape

Use the 4px rhythm: `--space-1/2/3/4/5/6/8/10/12/16` = 4/8/12/16/20/24/32/40/48/64px. `--space-0-5` (2px) is reserved for fine alignment. Prefer 4px between adjacent navigation rows, 8px between related controls, 12px inside controls, 16px between compact groups, and 24px around dialogs/content. Responsive reading-column whitespace and graph geometry remain layout-specific.

Use `--radius-sm` (6px) for controls/rows, `--radius-md` (10px) for larger action cards/popovers, and `--radius-lg` (14px) for dialogs. Keep palette-dependent shadows in the theme module.

## Components

- `.nav-item`: one shared regular 400, 13px/1.5 system sans navigation role, 36px minimum height, 12px horizontal inset and shared hover/current-page styling. Home, Graph, Settings/Connect and Feedback share this role.
- `.sidebar-page-link`: same type/inset/minimum height as navigation; truncate long titles and keep the full tooltip.
- `.quiet-button`: default 13px secondary action, 36px minimum height. `.button` uses the same control height/type with semibold emphasis. `.icon-button` and dedicated utility buttons use 32px targets and 16px glyphs (brand/collapse marks are optical exceptions).
- `.nav-tools`: Search and New note are icon buttons on one row, with accessible names, keyboard shortcuts and action tooltips. Sidebar pages form one visual list with pinned notes first, no visible Pinned/Attention headings, and 4px between adjacent rows including the pin boundary. Empty Pinned reserves no space; list labels remain accessible.
- Note detail: Copy draft and Delete note use SVG icon buttons with accessible names/tooltips; Insert page reference is a plus icon. Pin/Snooze/Settle remain in sidebar rows. Temporary confirmations use one dismissible bottom-corner toast, four seconds normally or eight seconds with Undo/error feedback; hover/focus pauses expiry. Persistent save/recovery states remain inline.
- Theme: a single sun/moon icon button named for its next action (**Switch to light theme** / **Switch to dark theme**). Preserve System behavior until the first explicit toggle, then persist Light/Dark and synchronize tabs. `.nav-utilities` is the shared footer row for this button and the optional native update icon.
- Narrow navigation (680px and below): preserve the compact top bar/page lists, use 40px navigation/theme targets, and place theme and the optional update icon side by side. Keep the same type scale.
- Dialogs: 20px headings, 14px explanatory copy, 24px content padding, shared action gaps and focus rings. Supporting metadata may use the caption role.

## Color and interaction

Reuse `--surface`, `--control-fill`, `--surface-hover`, `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--line-strong`, `--accent` and error tokens. Both Ember palettes retain the existing contrast checks. Keep accessible labels, visible keyboard focus, active-page state, disabled state and reduced-motion handling. A theme change must not recreate the editor or lose a draft.

## Verification

Build, then run the relevant existing browser tests and `scripts/sidebar-smoke.mjs`, `scripts/theme-smoke.mjs`, `scripts/feedback-smoke.mjs`, and `scripts/companion-browser-smoke.mjs` through the repository's Playwright runner. Inspect desktop and 390/320px layouts in both themes, including the Mac-injected Updates button, long page titles, dialogs, and collapsed navigation. No personal memory or installed app needs to be modified.
