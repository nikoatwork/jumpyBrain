# Four-hour UX improvement loop

Owner request: “hill climb in a loop for 4h.” Started 2026-11-04 21:21:15 UTC; deadline 2026-11-05 01:21:15 UTC. Base: `577c31e`. Work alone; no delegated agents requested.

Use frozen [experience rubric](../../evals/workspace-experience/rubric.md), [missions](../../evals/workspace-experience/journeys/core.md) and [native baseline](../../evals/workspace-experience/reports/2026-11-03-baseline.md). Record proposed effects and protected neighbors before editing. Keep verified improvements; revert losing candidates. Browser/deterministic evidence is separate from native UX scoring; no composite score.

- [x] Confirm clean checkout, read owning docs and freeze deadline/evaluation boundaries.
- [ ] Reproduce remaining own-edit external feedback, retained-version repetition and live-connection failure messaging.
- [ ] Iterate on reproduced findings with canonical/draft/navigation/access safeguards.
- [ ] Probe core capture, search/handoff, boards, coauthoring and off-note transitions for further concrete friction.
- [ ] Run broader checks on the final retained snapshot, record gains/losses and remaining limits.
- [ ] Archive this list and commit final evidence by the deadline.

No push, product install, release, VPS deployment or remote-memory writes. Disposable localhost fixtures only. Native Mac tooling is unavailable; native checkpoints remain not observed. Existing UX candidate: [2026-11-04](../../evals/workspace-experience/reports/2026-11-04-feedback-candidate.md).

## Iterations

Record each hypothesis, pre-fix evidence, candidate, checks and keep/revert decision below. Completed implementation increments use their own archived task records and scoped commits; this list owns the overall timed loop.

### Iteration 1: own-edit notifications

Hypothesis before editing: title and Undo acknowledgements pass through `accept(snapshot)` without the body flight marker, so their revision changes are labeled remote. Expected gain: quiet own saves/history while a different tab (including the same authenticated principal) still produces external-change feedback. Protect source/history validation, concurrent foreign history and draft rebasing. Add a real-browser reproduction before changing the implementation.

### Iteration 2: loaded note versus live editing failure

Hypothesis before editing: the shared `showNote` catch treats `/capabilities` 404 as a missing document even after the canonical document loaded. Expected gain: preserve visible saved content, identify editing as unavailable, offer a retry and allow safe clean navigation; actual document 404 must still be a missing-note outcome. Neighbor checks: read-only controls, canonical bytes unchanged, no legacy PUT fallback, reconnect, and matching visible/accessibility status. Offline clean notes must not claim a private draft exists.

Iteration 1 retained: own rename reproduced before the fix; 14 browser checkpoints, 33 focused tests and desktop/mobile external-update neighbors passed. [Archived increment](../done/2026-11-04_tasks-ux-own-edit-feedback.md). No native score assigned.
