# Browser design system

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
