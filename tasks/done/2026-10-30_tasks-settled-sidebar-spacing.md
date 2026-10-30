# Settled sidebar spacing

Completed 2026-10-30: padded Settled summary with a right-aligned count and trailing disclosure chevron.

## Goal

Use the supplied UX inspiration for the existing Settled disclosure: label left, count and chevron right, with more breathing room.

## Tasks

- [x] Replace the leading native marker with a trailing chevron and a padded, aligned row.
- [x] Verify the existing sidebar layout smoke and native disclosure interaction.
- [x] Record verification, update release notes, archive and commit.

## Scope

Presentation only; retain native details/summary semantics, counts and note behavior. No installation, push or release.

## Verification

Tested `7620e9d` plus this scoped presentation change:

- `npm run build` passed.
- `scripts/sidebar-layout-smoke.mjs` passed: 224/280/480px desktop sidebars, short windows, 390/320px narrow layouts, footer alignment and scroll isolation, both schemes and all palettes.
- `scripts/collaborative-sidebar-smoke.mjs` passed: collapsed/expanded Settled, count/list behavior, paging, attention lifecycle, focus preservation and six layouts.
- Visually inspected the 280px Ocean dark companion capture at `/tmp/jumpybrain-sidebar-layout-qa/sidebar-rest-280-dark.png`.
- `git diff --check` passed.

## Limits

Chromium checks use disposable notes and the production companion shell/native update renderer. Full Electron and Safari were not run; native details/summary keyboard semantics are retained, with no custom event handler. No installed app changes.
