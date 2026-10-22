# Release candidate 0.3.5

## Scope and preparation

- [x] Inspect published releases and reconcile history/version metadata.
- [x] Preserve the original workspace; prepare `/tmp/jumpybrain-release-20261022` as a separate clone on `master`.
- [x] Merge published `v0.3.4` history with local completed changes. The coordinated updater replaces the app-only implementation, retaining cancellation/save barriers through its worker protocol and recovery tests.
- [x] Include the completed browser design system and curate five user-facing bullets in `release-next.md`.
- [x] Full test suite: 1,105 passed, one skipped, zero failed.
- [/] Complete core-flow and applicable change-specific release gates; retain logs and screenshots under `.local-pack/release-qa/`, `.local-pack/update-smoke/`, `.local-pack/update-ui/`.
- [x] Release dry run selects the unused next patch `0.3.4 → 0.3.5`.
- [ ] Obtain explicit same-day publication override.
- [ ] Run full `npm run release`, verify published tag/notes/asset/version/digest, archive exact shipped notes and QA, reset only shipped pending notes, commit/push bookkeeping.

## Snapshot and environment

- Runtime snapshot: `fbdf58f` (merge parent `a84c24d`, original local `9606d74`, published `v0.3.4` / `3bbb0f2`). Subsequent task-report-only commits do not change runtime code.
- macOS 15.7.7 (24G720), arm64; actual Node v26.7.0; QMD 2.8.3 (facd35e); Electron 44.8.0.
- Root dependencies installed with `npm ci`. Electron dependencies reuse the existing matching lockfile installation. All notes/profiles/update installations used by checks are disposable.
- Initial validation was discarded: shared dependency symlinks omitted license metadata, and an overlapping pack build removed files during tests. Repeated with checkout-local root dependencies and sequential builds; the complete suite passed.
- Candidate CLI ↔ browser roundtrip passed: remember, search/open, browser edit/save, compact recall and content-hash-guarded expand; explicit lexical reindex preserved canonical bytes. Disposable hosted CLI checks passed read-only recall/write rejection, invalid key, and offline errors.

## Publication blocker

`v0.3.4` was published 2026-10-22 at 08:30:24 UTC (10:30:24 Europe/Berlin); `v0.3.2` and `v0.3.3` were also published that day. `docs/releases.md` requires an explicit user override for an additional release on the same Europe/Berlin day. No new version bump, tag, push, publication, installed-app update, or memory write has been performed.

## Limits

Intel hardware, physical login/Keychain history, physical clipboard/accessibility/mobile devices and non-Chromium browsers are untested. Installed updater checks use immutable local fixture releases, not a live public-release upgrade. First-iteration scan/graph changes are included; matched RAM-budget acceptance remains a separate unfinished task and no measured savings claim is made in release notes.
