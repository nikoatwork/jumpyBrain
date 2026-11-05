# Confirmed generation outcomes

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md), authorized 2026-11-04.

- [x] Reproduce missing terminal feedback with real production shell plus CLI producer.
- [x] Correlate live active/terminal events by opaque actor/stream/epoch, bounded and deduplicated; clear across scope/connection changes.
- [x] Add quiet note-scoped terminal wording, without claiming a completed task or inferring finish from presence loss.
- [x] Test normal finish/cancel, held own-edit acknowledgment, focus preservation and two actors using the same stream ID at desktop/mobile widths.
- [x] Run 39 focused generation/editor/history/hub/live tests; additional sequence guard test passed after the bounded-map change.
- [x] Verify compiled/compacted production snapshot, neighboring journeys and footprint limits.
- [x] Record evidence/limits, archive and commit.

Initial candidate proof mistakenly assumed an explicit external cancel makes the producer exit nonzero. The real CLI can exit successfully with a cancelled receipt; verification now checks the actual receipt state rather than inferring it from exit code. The UI never displayed finished for that cancellation. Older servers lacking opaque stream actor identity show no inferred outcome.

Footprint review in progress: pristine `6d06cb9` editor already exceeds its 222,250-byte guard (222,420 gzip). New feedback candidate measured 223,015 gzip, ~0.27% above pristine, with unchanged 15 editor packages. Distribution must keep its existing 1.45 MB compressed/4.6 MB unpacked/3.1 MB runtime/660-file ceilings. Extend existing whitespace-only artifact compaction to the changed collaboration/recovery modules before considering retention; do not widen distribution budgets.

Outcome: keep. Final compacted production build passed 66 generation/editor/hub/live/bundle/package tests plus 17 architecture tests. Real CLI/browser proof passed six outcome/scope cases at 1280/390px: finish, cancel, held own save, duplicate stream IDs across two actors, focus preservation and a missed finish during reconnect (no inferred cue). Ten retained-review neighbor scenarios passed on the same built artifact. Package: 1,447,611 archive bytes, 4,561,107 unpacked bytes, 3,047,669 runtime bytes, 646 files; unchanged distribution ceilings pass. Editor: 223,015 gzip bytes against the measured/reviewed 223,250 guard; matched pristine/candidate delta is +595 bytes (0.27%), with unchanged dependencies. See [footprint rationale](../../docs/build-footprint.md#2026-11-04-ux-feedback-loop). Native scoring and actual VPS transport remain unverified.
