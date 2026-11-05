# Feedback improvements: Markdown, collaboration guidance and updater readiness

Authorized 2026-11-05: use tab agents for a sensible session scope, improve CLI guidance and Markdown rendering, investigate/fix updater-readiness errors where evidence supports a change, and test end to end. No release, installation, push, personal-note edit or demo deployment requested.

- [x] Reproduce and fix the Markdown rendering report with fictional source; preserve Markdown/canonical bytes and unsupported-syntax fallback.
- [x] Align CLI, shipped skill and generated/recommended agent instructions for authorized concurrent editing, with actual read-base and uncertain-write safeguards; verify real CLI collaboration.
- [ ] Investigate updater check/install state transitions, retain a concrete fix with controlled end-to-end verification if reproduced; leave historical uncertainty explicit.
- [ ] Integrate isolated lane commits, inspect scope, verify the combined snapshot with build/full suite/package caps and relevant production journeys.
- [ ] Update per-email outcomes, remaining follow-ups, pending notes/changelog; archive and commit scoped final records.

Each isolated tab owns its implementation/tests/module docs and one focused lane record. Parent owns this integration record and shared feedback index/follow-ups/release-next/changelog. Shared bookkeeping is completed during integration, avoiding competing checklists. No broader retrieval, historical conflict, OS relaunch, signing or platform work is included by default.

Evidence: [residual follow-ups](tasks-feedback-follow-ups.md), [email index](../feedback.md). Three selected messages were already reviewed; selected full bodies are read again only as implementation evidence. No replies, tests or inbox label changes.

## Guidance integration

- Child commit `9f5a67efecd85b1575d9f0f702351f6b032bb808` integrated as `a4c532f`; exact equality checked for all 11 changed paths.
- [Completed lane](../done/2026-11-05_tasks-feedback-concurrent-guidance.md): initial/write/help/managed/recommended instructions prefer authorized source operations, with actual UTF-16 read-base, stable client ID, resync and uncertain-write rules. Corrected obsolete wait/handover/reload advice. No user-authored instructions or installed integrations overwritten.
- Lane validation: 21 unique focused tests; production browser typing plus CLI insertion from revision 0 rebased over typing, continued through resync, and matched exact canonical source at revision 4. Build and original package budgets passed. Parent rebuilt the integrated root successfully (editor 222,231 gzip bytes); parent focused instruction/help/read-base checks passed **13/13** after integration (`/tmp/jb-feedback-session-guidance-checks.log`). Combined full suite remains pending the other lane results.

## Markdown integration

- Child commit `3b49dc82e952b91b2022b05820df291c6744cc96` integrated as `b282f6c`; exact equality checked for all 13 changed paths.
- [Completed lane](../done/2026-11-05_tasks-feedback-markdown-rendering.md): ordinary top-level bullets use supported rich inline labels; simple relative Markdown paths stay visible/editable/inert instead of forcing the whole line literal. Structural Enter/Backspace and hidden-list fence context preserve source intent.
- Parent reviewed parser/node/map changes and rebuilt the combined Markdown+guidance snapshot: **222,776 editor gzip bytes** under the unchanged 223,250 cap. Parent focused set **84/84 passed**; production actual CLI creation/update plus shell edit/Undo/live caret/reopen/paste passed at **1280/390px** (`/tmp/jb-feedback-session-markdown-{build,checks,smoke}.log`).
- Combined pre-doc package checkpoint passed: 1,448,021 archive / 4,579,641 unpacked / 3,068,602 runtime bytes, 648 files. Original ceilings unchanged; final shared-doc/combined snapshot package verification remains parent-owned.
- Parent clarified normal Markdown display limits in `docs/memory-format.md` without discouraging ordinary authoring, and scoped the old whole-document contract/raw-writer pause language to intentional replacement and raw-file maintenance. No runtime policy changes from these doc corrections. Parent broad production collaboration regression passed, including two-context convergence, source/actor Undo, streams, IME, offline drafts/storage, exact positional history, visible carets and 132 CLI actors (`/tmp/jb-feedback-session-collaboration.log`). Full combined suite waits for updater integration.
