# Page-reference bracket spacing

## Outcome — 2026-10-28

Replaced transparent bracket highlights with an original bracket-only font whose empty glyphs have zero advance. `[[kilian]]` reads as `kilian` without extra spacing or wrapping. Focused editable blocks reveal ordinary brackets; other blocks, blur and read-only views remain collapsed. Pointer gestures finish before widths change, preserving native drag selection. A font-load failure retains ordinary visible syntax.

The same literal Lexical text leaf remains canonical for editing, selection, copy, history, completion and Markdown export. The font loads once per document from embedded bytes without a network request or CSP change; title characters use the writing font. Its optional reproducible Python generator adds no build/runtime dependency.

## Goal

Render `[[kilian]]` as `kilian` without reserved bracket space while reading. Reveal literal brackets only in the block being edited; preserve canonical Markdown, selection, copy, navigation and history.

## Tasks

- [x] Inspect current transparent-marker implementation and editor contracts.
- [x] Collapse bracket glyphs without changing the editor's text or selection model; reveal the active editing block.
- [x] Verify actual glyph widths, block focus, wrapping, editing, copy, navigation and Markdown round trips on desktop/narrow layouts.
- [x] Record results/limits, update owning docs and pending notes, archive and commit scoped work.

## Scope

Shared browser/Mac editor presentation only. No personal memory writes, installation, release or push. Prior memory recall found no matches; current repository docs and earlier quiet-reference task establish the existing behavior.

## Relevant files

`editor-reference-presentation.ts`, generated `reference-marker-font.ts`, `lexical-editor.ts`, `notes-browser.ts`, owning `browser.docs.md`, optional `scripts/build-reference-marker-font.py`, existing reference-editor and editor-feedback smoke scripts, pending release notes and task changelog.

## Verification

- Base `77f96e1` plus scoped task changes, version `0.3.11`; final build fingerprint `b2b62a3a00bf4cbb`. `npm run build` passes; editor bundle is below the existing 183 KB gzip gate.
- Focused editor/source-preservation/reference-policy/browser/architecture suite: **149 passed, 0 failed**. Log `/tmp/jumpybrain-bracket-focused-final.log`.
- Production reference-editor smoke: **72 checks passed** at 1280/390px, including zero bracket width, active/cross-block selection, read-only/blur, font-load failure, unchanged title metrics/wrapping, heading/task/code/inert contexts, click/touch/Tab+Enter, native drag selection, copy, editing/history and completion. Uses the actual shared presentation CSS. Log `/tmp/jumpybrain-bracket-references-final.log`.
- Reference autocomplete: **36 checks passed** at 1280/390px. Log `/tmp/jumpybrain-bracket-autocomplete-final.log`.
- Real-server editor-feedback smoke: **PASS at 1280/390/320px**, light/dark, exact canonical CRLF/no-final-newline round trips, reference edits/reopen, tables/slash/save guards. Log `/tmp/jumpybrain-bracket-feedback-current.log`; inspected `/tmp/jumpybrain-editor-feedback-qa/{1280-light,390-light,320-dark}-reading.png`.
- Lexical WYSIWYG/preservation/security smoke: **PASS at 1280/390px**. Log `/tmp/jumpybrain-bracket-lexical-final.log`.
- Canonical formatting/save/refresh/failure/conflict smoke: **PASS at 1280/390/320px**. Log `/tmp/jumpybrain-bracket-formatting.log`.
- Marker-font regeneration is byte-identical. `git diff --check` passes.
- `npm run validate`: **1,411 tests, 1,410 passed, 0 failed, 1 skipped**. Log `/tmp/jumpybrain-bracket-validate.log`.
- External-document-update smoke: **PASS at 1280/390px**, including caret/scroll/history, independent/concurrent edits, conflict/recovery, deletion and navigation. Log `/tmp/jumpybrain-bracket-external.log`.
- Companion-browser smoke: **PASS**, including reference/Search/Dream survival, two-tab flush/freeze, read-only/session/conflict guards and draft recovery. Log `/tmp/jumpybrain-bracket-companion.log`.
- Initial formatting/external/companion launches overlapped validation's `dist` rebuild and failed with missing generated modules; all three reruns passed against the completed build.

## Limits

Chromium automation and disposable notes only; no installed-app upgrade, physical Mac/IME, OS clipboard, assistive-technology or Safari/Firefox verification. Font-load failure fallback is exercised synthetically. No release is claimed.
