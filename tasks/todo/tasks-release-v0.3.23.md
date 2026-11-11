# Release v0.3.23

Status: in progress. Patch release requested by the owner on 2026-11-11 ("cut release"); first release of the Europe/Berlin day (v0.3.22 published 2026-11-10T12:30:44Z).

## Scope and evidence

- Runtime source: `77d1ce8`; latest published numeric release: v0.3.22 (`3842ebb`). Local master holds all fetched origin/master history plus five unpushed commits (live co-editing merges, folder sorting, feedback bookkeeping).
- Released from a clean clone of `77d1ce8`. Uncommitted settings-card work in the owner's checkout (and its pending-note bullet) is excluded and stays pending there.
- Four public bullets in release-next.md match v0.3.22..HEAD: folder sorting, overlapping live edits merge, renames during live editing, fewer shared-brain requests and busy-host recovery.
- Live feedback checked **2026-11-11T07:02:41.561Z**, full available received/non-spam inbox, no date bounds: two pages, complete, 59 scanned, two synthetic tests excluded, 57 genuine reports. Exact-ID reconciliation against the [feedback index](../feedback.md): all 57 already recorded (the five from 2026-11-10 were triaged in `6dd88f9`); nothing new. Open items (nested checkboxes after Obsidian import, CLI update not reaching open editors, rate-limit clarity, legacy git-source upgrades, date/property filters) are deferred to their owning tasks; none blocks this release. No replies or test sends.
- macOS 15.7.7 ARM64; Node 26.7.0; QMD 2.8.3 (facd35e).
- Local candidate: `npm run dogfood:status` reports the recorded candidate (`ace92ef`, v0.3.21) as superseded; this snapshot was not installed as a candidate. The owner asked to cut the release; no personal use of these changes is claimed.

## Preparation results

On `77d1ce8`: `npm run build` and `npm run desktop:pack` passed. The first `scripts/note-lifecycle-smoke.mjs` run failed at its two-tab conflict step, which waited for **Changes need review** after overlapping replacements. That outcome was intentionally removed by `b31d944` (overlapping live edits merge); the runner was not part of that task's verification. Observed behavior was correct: both tabs and the file converged on `Losing draft retained for comparison.Winning edit.`, both Saved. The step now asserts that merge (both replacements kept, shared original removed once, editors equal to the file, both Saved, no review), and `docs/release-testing.md` describes it. Rerun passed (capture, search, graph/title navigation, overlap merge, 390/320 layouts, deletion cancel/apply, preserved backlinks, index refresh). The review/recovery path for raw-file overwrites stays covered by `scripts/external-document-updates-smoke.mjs`, which passed at 1280 and 390 px. Feature evidence for `collaboration-overlap-smoke` and `folder-explorer-smoke` is reused from their task lists (unchanged inputs). Logs: `/tmp/jumpybrain-v0.3.23-{build,desktop-pack,lifecycle,external-updates}.log`.

Not run: `npm run smoke:hosted` (no Docker daemon locally), desktop/updater smokes (no host/updater change).

## Tasks

- [x] Review history, live feedback and pending notes.
- [x] Fresh build and desktop package; disposable core note lifecycle.
- [ ] Dry run and full release.
- [ ] Verify tag, exact notes, aligned metadata and all three downloaded asset digests.
- [ ] Refresh public demo to the exact published revision; verify landing, note opening, search and graph.
- [ ] Archive exact notes and QA; reset pending note; archive this task and commit bookkeeping.
