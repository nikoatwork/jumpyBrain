# Page references — manual device, accessibility, and browser QA

Status: pending validation. Navigation and autocomplete are implemented and enabled; these checks were not performed and are not waived by finalizing the implementation.

## Context

- [Completed implementation and automated evidence](../done/2026-10-08_tasks-page-reference-integration.md).
- [Browser user contract](../../docs/cloud-shared-memory.md) and [adapter ownership](../../src/adapters/http-server/http-server.docs.md).
- Automated coverage is desktop/narrow touch Chromium, synthetic composition and accessible clicks, DOM clipboard events, touch scrolling, and simulated visual-viewport zoom. It does not prove physical-device or browser parity.
- Use disposable memory roots and synthetic credentials only. Record device, OS, browser/assistive-technology versions, reproduction steps, and results. Keep unperformed checks pending rather than treating an implementation commit as validation.

## Relevant files

- `src/adapters/http-server/{lexical-editor,reference-ranges,reference-autocomplete,notes-browser}.ts`
- `scripts/{page-reference-editor,reference-autocomplete,page-reference}-smoke.mjs`
- `docs/{cloud-shared-memory,shared-memory-protocol}.md`

## Tasks

- [ ] 1.0 Complete physical editing and accessibility validation.
  - [ ] 1.1 Check real OS copy/paste, drag selection, undo/redo, and reference title editing in paragraphs/headings/bullets. Confirm literal brackets and canonical Markdown survive save/reload; document normal-click versus double-click selection behavior.
  - [ ] 1.2 Exercise physical IME composition and candidate acceptance/cancellation while typing references. Enter must not accidentally insert a suggestion or navigate during composition.
  - [ ] 1.3 Test real screen-reader/assistive-technology navigation, reference activation, suggestion announcements, active options, Escape, and focus retention. Verify read-only and selection guards.
- [ ] 2.0 Complete mobile and cross-browser validation.
  - [ ] 2.1 Test physical mobile keyboards, tap-versus-scroll, wrapped caret, scroll/edge geometry, visual-viewport resize/panning, and pinch zoom on actual devices.
  - [ ] 2.2 Run navigation, autocomplete, persistence, save-failure/retry, late-response cancellation, and Back/Forward scenarios in Safari and Firefox. Do not infer parity from Chromium automation.
- [ ] 3.0 Record separate navigation/autocomplete validation decisions, fix regressions with automated coverage where possible, and update owning docs with only verified support claims.

## Blockers

- Physical devices, IME/assistive-technology interaction, OS clipboard verification, and Safari/Firefox testing were unavailable in the implementation run.
- No feature-code implementation blocker is known; this list owns the outstanding validation gates formerly tracked as integration tasks 2.3 and 3.4.
