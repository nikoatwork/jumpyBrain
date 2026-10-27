# Feedback integration and end-to-end verification

Completed 2026-10-27. All twelve feedback tickets were checked for relevance, implemented or verified as resolved, tested and archived. Five cross-feature issues found during integration were reproduced and fixed.

## Scope

Complete the twelve feedback follow-ups from the 2026-10-27 inbox review. Each group checked current relevance before implementing gaps. The historical direct-feedback flow was already resolved; installation review corrected outdated update-screen guidance. Standard bold already worked; ambiguous spaced delimiters remain literal. Tables now have readable previews and editable Markdown source, without cell editing.

Three isolated subagents implemented and tested their groups. Integrated commits: `b0a108d` (related pages/feedback), `f535ef4` (navigation/find/labels), `fec89d2` (editor). Original child commits: `87304f4`, `cb1eaa3`, `4a0b601`. Unrelated updater commits `06dd8ed` and `d94ec36` were preserved.

## Tasks

- [x] Check relevance and implement the twelve assigned tickets in parallel; integrate scoped commits and retain all release notes/task history.
- [x] Independently review the integrated browser behavior and reproduce concrete findings.
- [x] Fix Find counting collapsed table-source text, stale Find selection restoration after body replacement, related-page BFCache resumption and obsolete dynamic action labels and duplicate feedback-help tooltips; add regression checks.
- [x] Run the final combined build, deterministic suite and changed-flow end-to-end checks; inspect screenshots and record remaining limits.
- [x] Repair local references, record final outcomes and verification, archive this list and commit all scoped integration changes.

## Integration findings

- Find counted a table preview and its hidden source twice. A production UI regression reproduced `1 of 2` for a single visible cell. Search now excludes invisible text and observes disclosure visibility changes; opening the source makes its text searchable too.
- Independent review reproduced Lexical error #20 when Find restored captured keys after user/external body replacement. Body text/tree changes now invalidate that captured range while preserving normal Escape focus behavior.
- Related-page requests were aborted permanently on pagehide. A persisted pageshow now resumes discovery with the existing brain/revision/abort fences.
- A hovered native update action retained the old tooltip through the available-to-ready transition. Active labels now dismiss on title/accessibility changes or removal; reopening reads the current action.
- Final feedback smoke exposed a second generic label on the existing diagnostic-help tooltip. Shared labels now defer to dedicated tooltip descriptions; the production feedback runner asserts exactly one visible tooltip.
- Combined feature weight was 181,557 bytes gzip before these fixes. Reviewed the approximately 6 KB increase over the pre-feedback bundle, retained the same 15 bundled packages and no new dependencies, and set the review gate to 183,000 bytes. Final measured size is recorded with verification below.

## Verification

Tested base: `fec89d2` plus the scoped integration fixes in this task; package 0.3.9 unchanged, Node 26.7.0, macOS arm64. All checks use disposable data and existing tool installations; no personal installation, live mail, push or release.

- Combined deterministic suite: `node --test --test-concurrency=4` — **1,399 passed, 0 failed, 1 skipped** (251 seconds), `/tmp/jumpybrain-feedback-final-tests.log`. This used integrated build `b225a8b7caf0bc5c`; both broad editor-group failures were absent with the repository's Electron-local dependencies and bounded concurrency.
- Final tooltip corrections avoid dismissing a label on unchanged polling and defer to existing dedicated help. Final build `522daeb550eb5086`: **PASS**, 550,539 bytes minified / **181,733 bytes gzip**, 15 bundled packages, 183,000-byte reviewed gate; `/tmp/jumpybrain-feedback-final-build.log`.
- Final-artifact focused tests (related pages/BFCache, feedback lifecycle, bundle, navigation, companion, Markdown and architecture): **122 passed, 0 failed**, `/tmp/jumpybrain-feedback-final-focused.log`.
- Final-artifact `scripts/feedback-integration-smoke.mjs`: **PASS**, including real Chrome `pageshow.persisted`, safe Find after body replacement, changed native action labels, unchanged polling and removed controls; `/tmp/jumpybrain-feedback-final-integration.log`.
- Final-artifact Find/labels/delete smoke: **PASS at 1280/390/320px**, both themes, including visible table cells, collapsed/open source counts, caret/history, Unicode, search-modal isolation and unchanged canonical reads; `/tmp/jumpybrain-feedback-final-find.log`. Inspected final narrow light-theme Find/table screenshot under `/tmp/jumpybrain-note-find-qa/`.
- `npm run desktop:pack`: **PASS**, signed/verified artifact under `.local-pack/desktop/jumpyBrain.app`; `/tmp/jumpybrain-feedback-final-desktop-pack.log`. Its bundled runtime fingerprint matches final build `522daeb550eb5086`. This is a local build artifact, not a personal app installation or release.
- Final production sandboxed Electron smoke on build `522daeb550eb5086`: **PASS**, real disposable gateway, native Find menu/Command-F and keyboard navigation, unchanged find Markdown, 1200/480px both themes, feedback fixture delivery/diagnostics, autosave, close guards and tab cleanup; `/tmp/jumpybrain-feedback-final-electron.log`.

- Combined editor smoke: **PASS at 1280/390/320px**, both themes, tables/source preservation, quieter references, all slash actions, guarded failed saves and retry; `/tmp/jumpybrain-feedback-final-editor.log`. Inspected final reading/slash screenshots in `/tmp/jumpybrain-editor-feedback-qa/`.
- Combined related-page smoke: **PASS**, real lexical discovery and brain switching, weak/stale/unavailable/late-response fixtures, guarded navigation, both themes at desktop/narrow widths; `/tmp/jumpybrain-feedback-final-related.log`.
- Core note lifecycle smoke: **PASS**, canonical capture/immediate search, title/graph navigation, two-tab stale-save recovery, delete cancel/apply, preserved backlink files and index refresh; `/tmp/jumpybrain-feedback-final-lifecycle.log`.
- Command-K search smoke: **PASS at 1280/390/320px**, both themes, bounded initial results, empty/error/retry/stale states, keyboard opening, safe previews and confirmed-save freshness; `/tmp/jumpybrain-feedback-final-search.log`.
- Those editor/related/lifecycle/search runs used integrated build `a16a0fb8e2c247d9`. Their relevant behavior was unchanged by the final dedicated-tooltip correction; final feedback/Find/integration/focused checks validate that correction separately.

- Final feedback UI smoke: **PASS at desktop/390/320px**, light/dark, exactly one diagnostic-help tooltip, confirmed-success close/toast, retry draft retention, diagnostics consent/privacy and unconfirmed/conflicting saves; `/tmp/jumpybrain-feedback-final-feedback.log`.
- Scoped link checking verified 120 existing local targets across 13 completed archives and related docs, with no new missing links. One unchanged historical changelog link to `tasks-page-reference-manual-qa.md` remains outside this work. `git diff --check` and the staged guard passed. All twelve ticket archives link to this merged verification record; the active updater follow-up points to the archived installation review.

## Limits

Tables provide a readable preview plus Markdown source editing, without cell editing or rich inline cell rendering. Standard bold was already supported; spaced delimiters remain literal. Related-page relevance uses existing bounded retrieval and a heuristic score gate, not calibrated semantic similarity or a new model-quality benchmark. Find covers the rendered body with at most 2,000 decorations, excluding title/frontmatter.

The editor group's optional full missing-page smoke recorded tab-unregister/409 failures; baseline equivalence was not established and that full runner is not claimed green. Its isolated activation/edit/reload and broader reference-editor/autocomplete checks passed. Physical assistive technology/IME, Safari/Firefox, Intel hardware, large-table performance and a live public-release install remain unverified. No live test email, installation into personal Applications, push, version bump or release was performed.
