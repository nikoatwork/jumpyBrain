# Browser design system

Status: completed and archived 2026-10-22. Implementation and verification are recorded below; see the combined sidebar/attention coordination archive for integration evidence.

## Goal

Simplify the sidebar preferences and standardize the existing Ember UI with shared typography, spacing, radii, and control sizes.

## Decisions

- Keep the existing light/dark palette, system sans UI, serif writing surface, and responsive sidebar structure.
- Use 13px for UI actions, 14px for body copy, and 12px for metadata; reserve larger sizes for headings and writing.
- Remove the visible Appearance label while retaining an accessible Color theme selector.
- Keep tokens in one browser presentation module and document their roles for future UI work. Standalone native onboarding/update windows are outside this migration.
- Preserve pre-existing editor, graph, and benchmark changes in the working tree.

## Tasks

- [x] Define shared tokens and document component conventions.
- [x] Apply tokens to browser chrome, dialogs and settings; simplify the footer.
- [x] Verify build, existing UI regressions, desktop/mobile layout and both themes.
- [x] Record verification and a pending release note.

## Verification

- Build passed; 112 targeted tests passed (`browser-theme`, `notes-browser`, `companion-browser`, `daily-notes-browser`, `dream-handoff`, `feedback`).
- Existing sidebar, theme, feedback and companion browser smoke suites all passed.
- Additional layout check used the actual Updates injection from `integrations/electron/window.mjs`: equal footer typography and target heights, no overlap/overflow at 1280/390/320px in both themes.
- Visually inspected desktop dark and 320px light screenshots; earlier editor/sidebar screenshots were inspected too. Screenshots are in `/tmp/jumpybrain-design-qa`.
- Final diff whitespace check passed. Pending release note and structural changelog entry recorded.
- Verification used disposable memory only. No release, install, commit or memory write was performed.
- Standalone native onboarding/update windows, physical devices, assistive technology and non-Chromium browsers remain outside this verification.

## Follow-up: restrict interface typography — 2026-10-22

The completed migration above is the baseline. New user direction is tracked by [sidebar/attention coordination](2026-10-22_tasks-sidebar-attention-refresh.md); implementation and verification follow below.

Ownership: `browser-design-system.ts` type/weight tokens, UI font declarations across component styles, `docs/design-system.md` and focused style verification. Other tracks own markup, behavior and layout; do not revert their concurrent edits. Give browser contract wording to the integrator rather than competing for the same docs hunk.

- [x] Define only regular 400 and semibold 600 for interface copy/emphasis. Retire redundant medium/bold UI roles and audit every UI use so deleted tokens cannot fall back accidentally. Preserve Markdown bold, writing headings and content semantics separately.
- [x] Give Graph, Settings/Connect, Feedback and other ordinary sidebar destinations one shared font family, size, weight and line height; use spacing/color/active state for hierarchy. Match icon controls through shared glyph/target/focus roles.
- [x] Apply the small set of roles across browser controls/dialogs, including Settle/Snooze when integrated. Avoid per-component font-family/weight overrides and one-off nearby sizes. Keep the existing serif writing surface.
- [x] Update the design-system documentation to replace the prior four-weight guidance and full-width theme-selector convention with the implemented two-weight/icon conventions. Keep current versus planned behavior explicit until the sidebar track lands.
- [x] Build and run relevant existing UI checks, then visually inspect equal computed sidebar typography in both themes and narrow layouts. Prefer a focused assertion of the shared navigation role over broad brittle snapshots. Record results here and provide the integrator one consolidated release-note candidate after implementation.

Follow-up implementation: removed the medium/bold interface tokens, retained regular/semibold, introduced a separately scoped `--weight-writing-bold` for Markdown, and preserved writing titles/headings. Global interface `strong`/`b` is semibold; ordinary sidebar destinations use one explicit type role. Documentation now describes icon actions, direct theme toggling and the utility row.

Follow-up verification so far: TypeScript no-emit check, changed-script syntax checks, source theme behavior and whitespace passed. Expanded production theme smoke asserts equal computed navigation typography at 1280/390/320px in both palettes. The coordinated build passed, then all five theme tests and the expanded production theme smoke passed. Computed navigation role equality, accessible glyph actions, 1280/390/320px in both themes, persisted/cross-tab/OS theme behavior, storage failure, and preserved draft/caret/dialog/map behavior are verified. Visually inspected desktop dark and 320px light screenshots under `/tmp/jumpybrain-sidebar-attention-qa`.

Release-note candidate: “A quieter sidebar puts Search and New note together as icons, adds a sun/moon theme toggle, removes empty-Pinned helper text, and gives interface controls consistent typography.”
