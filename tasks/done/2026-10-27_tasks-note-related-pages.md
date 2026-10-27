# Related pages below a note

## Completed outcome — 2026-10-27

Relevance: the optional Related notes extension supplied an explicit panel (eight results without a relevance gate), but the shared note page had no footer. Implemented the remaining built-in flow without changing the extension or retrieval backend.

- Query the saved title (body fallback only when title is absent), one line/240 characters, using shared normal-depth search with 24 candidates. Exclude current/duplicate/invalid IDs; reuse the established full-query lexical or base-score gate (0.75 and 85% of the strongest eligible candidate), then show at most five. Scores are rank-fused display evidence, not calibrated similarity.
- Compact text-only links use existing guarded navigation and brain-scoped URLs. Requests fence saved hash/query, note and credential/brain generation, abort after five seconds and suppress late results through session freezes/navigation/pagehide. Weak, empty, stale, local-only and failed retrieval leave no filler.
- Owning browser docs, pending release notes and the selective changelog are updated. No new glossary concept was needed.

## Verification and remaining limits

- `scripts/related-pages-smoke.mjs`: **PASS**, `/tmp/jb-related-pages-smoke.log`. Real lexical search, strong/weak/duplicate/empty/stale/unavailable response fixtures, safe HTML-like titles, delayed navigation, failed-save retention/Retry and saving before opening, two real read-only remote brains with identical note IDs and an actual brain switch. Automatic discovery issued no write/index requests.
- Both themes at 1280/390/320 pixels; screenshots inspected in `/tmp/jb-feedback-related-qa/related-{light,dark}-{1280,390,320}.png`.
- Discovery describes the saved baseline while typing; hidden stale/unavailable results refresh on reopen or a changed saved baseline, without polling. Candidate coverage is bounded; semantic quality uses deterministic score fixtures rather than a downloaded model. Physical devices, assistive technology and other browsers remain unverified.
- The final ordinary browser bundle is 177,985 bytes gzip, below the existing 178,000-byte gate with only 15 bytes headroom; parent integration must recheck the combined bundle.

## Tested snapshot and shared verification

- Base `56c8fe075508a6392417de275856a5190af29b55` plus this task's scoped commit in the isolated worktree; jumpyBrain 0.3.9, Node 26.7.0, macOS arm64. Final generated runtime/editor build: `23cc2c2dfa532d81`. No version bump, personal installation, live mail, push or release.
- Final focused run: **197 passed, 0 failed**, `/tmp/jb-final-focused.log` (related pages, feedback dialog/delivery/configuration/privacy, shared toasts, notes navigation, installation/preflight/lifecycle/updater and companion gateway tests).
- `node --test test/qmd-execution.test.js`: **15 passed, 0 failed**, `/tmp/jb-qmd-execution-rerun.log`. An earlier unrestricted-concurrency full run had 7 failures in that file; isolated rerun passed.
- `node --test --test-concurrency=4`: **1,397 passed, 0 failed, 1 skipped**, `/tmp/jb-related-feedback-full-final.log`. Reduced concurrency avoids the earlier process/deadline fixture instability.
- `git diff --check`: passed. Browser checks use the repository Playwright runtime and disposable real engines/gateway, never personal notes.

## Goal

Show up to five relevant related pages below the current note as small clickable pills or cards.

## Notes

- Source: [feedback received 2026-10-26](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=ef728ccd-e6d4-4839-962e-d60c11212d89); triaged 2026-10-27.
- Return fewer or none when relevance is insufficient. Reuse bounded shared retrieval and inspect the existing Related notes extension before choosing the smallest integration. A ranking score is not automatically a calibrated semantic similarity.
- Before implementation, read `src/architecture.docs.md` and the affected modules’ co-located docs. Follow [task completion](../../docs/task-workflow.md) when all work and checks are complete.

## Relevant files

`src/adapters/http-server/notes-browser.ts`, existing search app operations, `docs/extensions.md`; [existing extension work](2026-10-24_tasks-executable-extensions.md).

## Tasks

- [x] Define a bounded query from the saved note and a conservative relevance cutoff using the existing retrieval contract; exclude the current note and duplicate results.
- [x] Render at most five compact related-page links at the bottom, with guarded navigation and no irrelevant filler for an empty result.
- [x] Fence late results to the current brain/note revision; handle unavailable or stale search without saving, reindexing or expanding permissions implicitly.
- [x] Check strong, weak, empty and duplicate matches plus fast navigation/brain switching; verify opening a related page respects unsaved-draft guards.
- [x] Record the implemented or verified outcome, checks and limits; update owning docs/release notes where relevant, then archive and commit scoped work.

## Combined verification

See [the integrated feedback result](2026-10-27_tasks-feedback-integration.md) for merged-snapshot testing and the cross-feature fixes found after this group was integrated. The measurements above describe this group’s original tested snapshot.
