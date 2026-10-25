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

- `.nav-item`: one shared regular 400, 13px/1.5 system sans navigation role, 36px minimum height, 12px horizontal inset and shared hover/current-page styling. Graph, Settings/Connect and Feedback use named icon targets in one compact footer row; Home uses the same target in the top action row.
- `.sidebar-page-link`: same type/inset/minimum height as navigation; truncate long titles and keep the full tooltip.
- `.quiet-button`: default 13px secondary action, 36px minimum height. `.button` uses the same control height/type with semibold emphasis. `.icon-button` and dedicated utility buttons use 32px targets and 16px glyphs (brand/collapse marks are optical exceptions).
- `.nav-tools`: Home (house), New note and Search are icons on one row, with accessible names, keyboard shortcuts and action tooltips. Sidebar pages form one visual list with pinned notes first, no visible Pinned/Attention headings, and 4px between adjacent rows including the pin boundary. Empty Pinned reserves no space; list labels remain accessible.
- Note detail: Copy draft and Delete note use SVG icon buttons with accessible names/tooltips; Insert page reference is a plus icon. Pin/Snooze/Settle remain in sidebar rows. App-wide feedback uses the shared system-message component: one compact, bordered bottom-left overlay (360px maximum, 16px workspace inset), prioritizing errors/warnings while retaining other sources. Ordinary messages expire after four visible seconds, actions/errors after eight; warnings remain until dismissed/resolved. Hover/focus pauses expiry. Persistent save/recovery states remain inline. Settings has a quiet caption-sized version footer; the sidebar has no version row.
- Theme: a single sun/moon icon button named for its next action (**Switch to light theme** / **Switch to dark theme**). Preserve System behavior until the first explicit toggle, then persist Light/Dark and synchronize tabs. `.nav-utilities` is the shared footer row for this button and the optional native update icon.
- Narrow navigation (680px and below): preserve the compact top bar/page lists, use 40px navigation/theme targets, and place theme and the optional update icon side by side in the compact utility row. The native update icon glows subtly for an available download or prepared restart, spins during work, and hides after success. It adds no text or details row; accessible names and tooltips explain its action and failures. Keep the same type scale.
- Connection health: show a plain status/name for one brain; with two or more, use one compact native sidebar selector so switching works from Home, notes and graph. Preserve the selector/options across healthy polls and route selection through the existing all-tab save barrier. Keep failure/read-only status below the selector to avoid cramped wrapping. Use `--status-connected` for a muted green dot beside the selected brain name; expose the full health and read-only state through an accessible name and tooltip. Keep connection failures visible. Settings rows use the same quiet health dots; active state is also exposed by the row and dot accessible names. Untested connections stay neutral.
- Settings: show brains first as a compact list, with muted health dots, one-line paths (full tooltip) and named icon actions. Keep failure/read-only captions visible even when a path truncates. Refresh lives beside the Settings heading; it has no dedicated heading, paragraph or text action. Extensions follows connections, with its reload icon beside the heading and a single palette row when custom themes are available. Keep Add connection collapsed until needed; Edit opens it and Cancel/Save clears and collapses it. Ask for the destination first and make Name optional (infer the folder basename or server hostname). Validate only visible fields, keep server errors beside the form, preserve entered fields on a failed save, and clear secrets on success/cancel/pagehide. Save leaves selection unchanged and offers an explicit Switch action. Cancel/Save restores focus to Add connection. Disable active-brain removal and explain how to enable it in the tooltip. Keep field labels, explicit remote-write approval and recovery explanations. Search-index refresh retains its accessible busy state, target and disabled reason. Keep routine copy out of Settings; put action explanations in accessible names/tooltips and show actual outcomes through system messages.
- Home and graph: prefer named refresh icons, an icon search-close control, and compact graph Dream/Filters actions. Remove repeated descriptive subtitles before removing meaningful content or error states. Shared glyphs live in `browser-icons.ts`; add an accessible name and tooltip at the control.
- Search results: title and compact relative edit age on one baseline, with the age fixed at the right edge. Use one ellipsized preview line, then caption-sized path and known editor; omit unknown-editor placeholders. Truncate long titles/paths with full tooltips and retain exact edit dates in accessible age details.
- Dialogs: 20px headings, 14px explanatory copy, 24px content padding, shared action gaps and focus rings. Supporting metadata may use the caption role.

## Color and interaction

Reuse `--surface`, `--control-fill`, `--surface-hover`, `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--line-strong`, `--accent` and error tokens. Both Ember palettes retain the existing contrast checks. Keep accessible labels, visible keyboard focus, active-page state, disabled state and reduced-motion handling. A theme change must not recreate the editor or lose a draft.

## Verification

Build, then run the relevant existing browser tests and `scripts/sidebar-smoke.mjs`, `scripts/theme-smoke.mjs`, `scripts/feedback-smoke.mjs`, and `scripts/companion-browser-smoke.mjs` through the repository's Playwright runner. Inspect desktop and 390/320px layouts in both themes, including the Mac-injected Updates button, long page titles, dialogs, and collapsed navigation. No personal memory or installed app needs to be modified.
