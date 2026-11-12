# Feedback candidate from the native UX baseline

Date: 2026-11-04. Candidate based on `85512f0d40410f08dbcec75e824fab6cd82f08a8` (v0.3.20), with scoped changes documented in the [completed task](../../../tasks/done/2026-11-04_tasks-ux-feedback-hillclimb.md). Executor: GPT-6.1 Sol, high; same-agent diagnosis and verification, with source exposure. Linux x64, Node 22.23.1. This is a regression-tested candidate, not a new native UX run or scored win.

The [November 3 baseline](2026-11-03-baseline.md) reported ordinary opens showing “Updated elsewhere” and addition-only updates raising a replacement warning. The proposed effects and protected neighbors were recorded before verification; missions, rubric and historical results remain unchanged.

## Changes and evidence

- Initial live hydration used a temporary revision of -1, which was counted as a remote change. The new regression fails on the pre-fix expression with “opening is not another writer's update” and passes with the candidate. It covers matching and stale HTTP bodies, later genuine external additions and repeated snapshots. This establishes one cause of the ordinary-open symptom; own-edit/title/history feedback is not claimed resolved in general.
- Retained-copy guidance now says “An external edit was retained. Compare versions if needed.” It no longer claims that saved text was removed. Conservative retention and the comparison/restore controls remain intact; this does not reclassify append operations or acknowledge/dismiss retained records.
- Build passed. All 89 focused editor, external-update, feedback, comparison, collaboration-history, presence/recovery and architecture tests passed.
- The real Chromium retained-version smoke passed all 11 scenarios: notification, compare/copy, stale comparison, writer restore, reader restrictions, revocation, unique draft, storage failure, scope switch, large-copy fallback and incomplete discovery. Tested editor build: `361bfe1ebcfdd20a`.

- The real Chromium external-update smoke passed at 1280px and 390px: quiet initial hydration; CLI/filesystem/other-editor changes; highlights, caret/scroll/Undo; independent merges; overlapping-edit recovery; disconnect and stale-subscription navigation.

## Limits and next native check

Native Mac computer use and linked-environment tooling were unavailable here. Local/VPS functional checkpoints and all five UX dimensions are **not observed** for this candidate. No numerical improvement is inferred from automated checks. Hosted live transport and finish/cancel distinction remain open baseline findings.

On a Mac, use [RUN.md](../RUN.md) with fresh run names and unchanged mission/rubric/fixture inputs. Compare local feedback and neighboring capture, handoff, off-note update, recovery and cancellation checkpoints. Preserve gained and lost checkpoints, disclose version/executor/source-exposure differences, and retain actual native evidence before assigning ratings. No remote mutation or deployment was performed in this increment.
