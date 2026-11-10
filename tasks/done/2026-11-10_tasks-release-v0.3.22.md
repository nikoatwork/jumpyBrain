# Release v0.3.22

Status: complete. Published and verified v0.3.22 and refreshed the public demo to the exact release revision. Exceptional second release on 2026-11-10 (Europe/Berlin); the user explicitly overrode the one-release-per-day convention ("cut an exceptional release (2nd of the day)").

## Scope and evidence

- Runtime source: `ace92ef`; latest published numeric release: v0.3.21 (`d4cba37`, published 2026-11-10T08:21:47Z). Local master holds all fetched origin/master history plus five unpushed commits; no uncommitted work.
- Four public bullets in release-next.md match the v0.3.21..HEAD changes: built-in drawings, quiet search maintenance, open-note attention and restart recovery, and the four UI follow-ups.
- Live feedback checked **2026-11-10T12:26:05.772Z**, full available received/non-spam inbox, no date bounds: two pages, complete, 54 scanned, two synthetic tests excluded, 52 genuine reports. Exact-ID reconciliation against the [feedback index](../feedback.md): all 52 already recorded, nothing new to triage. No replies or test sends; bodies and attachments not re-read.
- macOS 15.7.7 ARM64; Node 26.7.0; QMD 2.8.3 (facd35e).
- Local candidate: `npm run dogfood:status` reports `ace92ef` installed 2026-11-10T12:18:15Z on the owner's Mac. The owner asked to release minutes later; no day of personal use is claimed. The first install attempt was blocked by a stale device number in the installation ownership ledger, repaired at the owner's direction; the underlying check is unchanged and remains a follow-up.

## Tasks

- [x] Review history, live feedback and pending notes; record owner override.
- [x] Fresh build and desktop package; disposable core note lifecycle.
- [x] Extra checks for the changed desktop host and the new drawing editor.
- [x] Dry run and full release.
- [x] Verify tag, exact notes, aligned metadata and all three downloaded asset digests.
- [x] Refresh public demo to the exact published revision; verify landing, note opening, search and graph.
- [x] Archive exact notes and QA; reset pending note; archive this task and commit bookkeeping.

## Preparation results

On runtime source `ace92ef`: `npm run build`, `npm run desktop:pack` and `npx --package=playwright node scripts/note-lifecycle-smoke.mjs` passed (capture, immediate search, graph/title navigation, guarded two-tab recovery, 390/320 layouts, deletion cancel/apply, preserved backlinks, index refresh). Because the Electron window policy changed, `npm run smoke:desktop` passed against the fresh package. `node scripts/drawings-electron-smoke.mjs` and `npx --package=playwright node scripts/drawings-smoke.mjs` passed again. Note editor 674,742 minified / 222,922 gzip; drawing editor 3,946,275 bytes on disk. Logs: `/tmp/jumpybrain-v0.3.22-{build,desktop-pack,lifecycle,smoke-desktop,drawings-electron,drawings}.log`.

Not run: `npm run smoke:hosted` (no Docker daemon on this Mac). The container build installs the new build-time dependencies and runs the new build step; the demo deployment is its first real exercise.

## Publication verified

`npm run release` passed 2,007 of 2,009 tests with two optional skips and published [v0.3.22](https://github.com/nikoatwork/jumpyBrain/releases/tag/v0.3.22) at 2026-11-10T12:30:44Z from `3842ebb`. Notes, tag, aligned versions and all three asset digests are verified; the demo runs the exact revision and its landing, note opening, search and graph pass. Details and limits: [QA record](releases/v0.3.22.qa.md); exact notes: [v0.3.22](releases/v0.3.22.md).

Open after this release: drawings are unavailable on the public demo (its gateway does not allow the drawing routes), and the installation ownership ledger's device-number check needs a code fix.
