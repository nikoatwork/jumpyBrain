# Release v0.3.20

Status: complete. Published and independently verified v0.3.20 from release commit `6d06cb94eb5fd2df07879323cf35cf0f75db7f14`.

## Scope and feedback

- User requested publication now after reviewing outstanding feedback. Use the shorter automated verification window; no fresh real-brain use is claimed. `npm run dogfood:status` reports no candidate installed through that workflow. Publication does not install the app or change personal notes.
- Live received/non-spam inbox checked at **2026-11-04T21:04:01.486Z**: no date bounds, one complete page, 46 scanned, two labeled delivery tests excluded, 44 non-test reports spanning October 20–November 4. Spam/trash/blocked mail are outside scope. Full recent report bodies and prior investigation records were reviewed; this is not a fresh full historical attachment audit. No replies, sends or label changes.
- November 4 editor requests and November 3 external-link request are implemented in the selected source. November 3 boards report maps to the published 0.3.19 hotfix; build and 41 backend/diagnostics/connection checks were revalidated today.
- November 4 updater-readiness report remains unresolved; full body and attached diagnostics inspected read-only during preparation. Do not claim it fixed. Historical draft/conflict cause and macOS 26 relaunch sequence remain unconfirmed; improved finite diagnostics are included. Related-note hover previews, reference-button removal and deletion-copy simplification remain deferred. Semantic-ranking candidates failed acceptance and are not adopted.
- The updater attachment is bounded/truncated and contains no retained update/install operation events, so it does not establish a network or updater-state cause. A focused inert native updater UI check is selected in addition to the core gate; it cannot reproduce the historical live-update failure.
- Pending notes cover delivered editor/reference/checklist/link behavior, owned-software pruning, CLI attention/sidebar efficiency, resilient feedback/diagnostics, explicit semantic setup/bounded Mac indexing and verified release-native update helpers. No retrieval-ranking/default change.
- Latest public numeric release: v0.3.19, published 2026-11-03T08:06:03Z; no publication on November 4 Europe/Berlin. Fetched origin/master and tags; local master is ahead without divergence. Next patch: 0.3.20.

## Checks

- [x] Live feedback, publication cadence, source scope and clean history reviewed.
- [x] Fresh build, outer desktop package and core note lifecycle.
- [x] Selected changed-area evidence reviewed/reused; publication readiness committed with this record.
- [x] Release dry run and full versioned test/package/native/tag/push/publication workflow.
- [x] Verify public tag, exact notes, component versions, all three assets and downloaded digests.
- [x] Archive exact shipped notes and QA, reset pending notes, finalize task and commit bookkeeping with this archive.

## Environment and limits

macOS 15.7.7 ARM64; Node 26.7.0; provisioned QMD 2.8.3 (facd35e). Disposable fixtures only. No fresh day-long personal-use window, Intel runtime, macOS 26, physical IME/accessibility, notarization or live installed-public-upgrade claim. Reuse unchanged implementation evidence recorded in completed task owners; record fresh commands/results below before publication.

## Reused changed-area evidence

- `00df523` editor closeout: final full suite 1,904 passed/two opt-in skips; nested-checklist journeys at 1280/390/320px, reference dismissal/races, canonical save/undo and external-link browser/native opener checks passed. No subsequent runtime changes.
- `d4c64b3` semantic/native-update closeout: actual provisioned model with blocked network, clone/missing/corrupt/cancellation controls; both helper architectures built/validated; current-worker success/fallback, v0.3.7 migration and relaunch rollback. Final-source packaged preservation trial passed; no ranking adoption. Intel execution and live upstream download remain unverified.
- `243057e` retention closeout: 20-cycle policy/producer fixtures, 42 Electron and 66 legacy Python checks, and packaged update success with executable/signed shared rollback and maintenance retry passed. Later native-update final-source success also preserved protected bytes. This is no claim of cleanup of historical owner installations.
- `125e335` usability closeout: actual local/hosted attention/write operations, idle sidebar traffic, and packaged pending-feedback dismissal/text retention passed. Existing bounded recovery diagnostics do not identify old report causes.

## Fresh preparation results

- Tested runtime snapshot `00df523`; preparation only curates release notes and adds this record. `npm run build` passed; editor 221,984 gzip bytes. `npm run desktop:pack` built/verified a fresh signed outer app at `.local-pack/desktop/jumpyBrain.app` with a freshly compiled native helper.
- `npx --package=playwright node scripts/note-lifecycle-smoke.mjs` passed real disposable capture, immediate search, canonical-title graph navigation, guarded two-tab draft recovery, 390/320px layouts, deletion cancel/apply, preserved backlinks and explicit index refresh.
- Inert real sandboxed updater-window smoke passed all phases, light/dark, compact layout, app-only choice, keyboard disclosure and recovery. It does not verify live GitHub/network state transitions or resolve the historical readiness report.
- GitHub account has push/release permission; Swift/Python/native build prerequisites pass. Whitespace check passes. Logs: `/tmp/jumpybrain-v0.3.20-{build,desktop-pack,lifecycle,updater-ui}.log`.
- Full versioned suite, CLI tarball and both release-native builds are owned by the release command next; no redundant preliminary full-suite run.

## Published outcome

- Preparation committed as `cde89de`. Release dry run passed; the full `npm run release` aligned both manifests/lockfiles at 0.3.20, ran the deterministic suite, validated the CLI distribution, built both release-native architectures, committed/tagged and atomically pushed master/tag, then published the GitHub beta release at **2026-11-04T21:09:06Z**.
- Versioned suite: **1,906 total, 1,904 passed, two optional skips, zero failures**, 88.876 seconds. Distribution: 305 required paths; 644 files; 1,445,906 packed / 4,595,148 unpacked / 3,082,718 runtime bytes. Existing size gates passed.
- Verified the public annotated tag and remote peeled commit, exact published notes, all four version metadata files in the tag/current checkout and the three shipped manifests/lockfiles in the tarball (npm excludes the root package-lock). Downloaded all three assets from public release URLs and matched local bytes, declared size and GitHub SHA-256; decoded native executables also match their inner hashes and declared Mach-O architectures.
- Published [v0.3.20](https://github.com/nikoatwork/jumpyBrain/releases/tag/v0.3.20). Exact shipped notes: [v0.3.20.md](releases/v0.3.20.md); verification/digests: [v0.3.20.qa.md](releases/v0.3.20.qa.md). Pending notes reset; deferred work was not described as shipped. No installation or personal-memory mutation.
- Raw verification and downloaded assets are ignored under `.local-pack/release-v0.3.20-verify/`; release/verification logs are `/tmp/jumpybrain-v0.3.20-{release,verification}.log`. Historical report and platform limits above remain.
