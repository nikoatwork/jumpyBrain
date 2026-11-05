# Feedback improvements: Markdown, collaboration guidance and updater readiness

Authorized 2026-11-05: use tab agents for a sensible session scope, improve CLI guidance and Markdown rendering, investigate/fix updater-readiness errors where evidence supports a change, and test end to end. No release, installation, push, personal-note edit or demo deployment requested.

- [ ] Reproduce and fix the Markdown rendering report with fictional source; preserve Markdown/canonical bytes and unsupported-syntax fallback.
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
