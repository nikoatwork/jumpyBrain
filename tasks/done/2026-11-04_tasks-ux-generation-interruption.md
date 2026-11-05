# Deliver confirmed abandoned generation outcomes

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md), authorized 2026-11-04.

- [x] Reproduce with real CLI, one saved chunk, SIGKILL of only the fixture producer, and the actual 60-second lease. UI had no cue before diagnostic status; status confirmed cancelled/lease_expired and only then caused an assisted cue.
- [x] Deliver expiry/revocation outcomes through existing scoped subscriptions as small metadata events, with one canonical source observation per batch.
- [x] Verify 32 retirements, reader delivery, deduplication, unchanged Markdown, frame size and document/epoch/disposal fences.
- [x] Verify actual production-lease UI cue before diagnosis and retained saved text/focus.
- [x] Run normal generation/coauthoring, live/recovery and footprint neighbors.
- [x] Record limits, archive and commit.

Initial evidence: ignored `.local-pack/ux-soak/abandoned-before-435f9cb.json`; `unassistedCue:false`, saved text retained, canonical stream cancelled/lease_expired, `afterDiagnostic:Generation interrupted`. Do not relabel this attempt. The existing 45-minute soak uses a frozen older artifact and remains an independent stability run, not proof of this fix. Native Mac/public VPS evidence remains unobserved.

Outcome: keep. Fixed build `101fa59e8c553a2d` passed the real default-lease probe: “Generation interrupted” appeared before diagnosis, then canonical status independently confirmed cancelled/lease_expired. Human baseline and the single acknowledged agent chunk survived, and focus stayed unchanged. Eight normal generation cases passed at 1280/390/320px, including matching stream IDs across actors and no fabricated completion on reconnect. All 72 focused live/recovery/editor/architecture/bundle/package checks passed; the strengthened metadata test also proves a saved stream notice cannot mark a private human draft saved.

The 32-stream wire case delivers one source snapshot plus 32 metadata frames under 1 KiB each, rather than duplicating the large body. Existing 3 MiB frame and buffer budgets stay unchanged. Package: 1,448,487 compressed bytes, 4,564,229 unpacked, 3,050,243 runtime, 646 files; editor 223,089 gzip bytes. All existing distribution ceilings and the already reviewed editor ceiling pass. Native/public VPS/physical accessibility claims remain unverified.
