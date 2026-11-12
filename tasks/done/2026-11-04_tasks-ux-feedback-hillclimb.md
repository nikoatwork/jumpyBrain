# UX feedback improvement from the native baseline

Authorized 2026-11-04: pull latest and improve against the existing UX judge.

- [x] Pull master safely; inspect existing experience protocol, rubric and baseline.
- [x] Identify initial live hydration being classified as an external edit; exclude its placeholder revision while retaining later external-change feedback.
- [x] Replace the retained-copy banner's unsupported removal claim with neutral comparison guidance, preserving recovery access and publication safeguards.
- [x] Build and run editor/recovery and architecture regressions.
- [x] Record evidence and native rerun limits; archive the scoped increment for commit.

Expected effect: ordinary note opens avoid false “Updated elsewhere”; retained-copy notices no longer claim saved text was removed. Protect later external updates, repeated-snapshot deduplication, draft recovery, comparison and restore.

Reference: [native baseline](../../evals/workspace-experience/reports/2026-11-03-baseline.md), findings 2–3. Rubric and missions remain unchanged. This is a diagnostic candidate, not a demonstrated score improvement. This Linux environment has no native Mac computer-use tools; the T3 linked-environment tool is unavailable. Native local/VPS reruns remain unverified; no remote writes, deployment, installation or release are included.

## Outcome and verification

Completed the bounded local candidate on base `85512f0d40410f08dbcec75e824fab6cd82f08a8`; editor build `361bfe1ebcfdd20a`. Build, 89 focused tests, 11 real-browser retained-version scenarios and external-update browser journeys at 1280/390px passed. The new hydration regression failed against the pre-fix expression and passed with the fix. `git diff --check` passed. Chromium was initially absent; transient Playwright/browser tooling was prepared outside tracked dependencies and both smokes then passed.

[Candidate evidence and remaining limits](../../evals/workspace-experience/reports/2026-11-04-feedback-candidate.md). No native ratings assigned; a fresh Mac rerun remains required for a scored hill-climb. Own-edit feedback beyond initial hydration, persistent retained-record acknowledgment, hosted live transport and finish/cancel cues are not resolved by this increment.

Commit author blocker resolved: the owner supplied the Git author identity; configured it for this repository and finalized the scoped commit after the staged guard. No push is authorized by this commit.
