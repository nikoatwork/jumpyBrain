# Automatic pruning of obsolete installations and build files

Priority: P1. Status: complete (2026-11-03). Requested 2026-11-03 after the owner's machine accumulated obsolete app/runtime copies across repeated installations. End-to-end implementation authorized 2026-11-03.

## Goal

Keep software staging, development candidates and rollback history bounded automatically across supported installation paths. Preserve the current installation, one usable verified rollback, live runtimes and unfinished recovery without requiring routine manual cleanup.

## Evidence and ownership

- The [native experience evaluation and maintenance record](../done/2026-11-03_tasks-workspace-experience-evaluation.md) documents 39 obsolete entries removed: 12,161,957,888 allocated bytes, with an observed 12,216,725,504-byte free-space increase. Canonical Markdown hashes matched before/after cleanup. These are measurements of one Mac, not general installation-size claims.
- The initial inventory found `scripts/dogfood-local.mjs` retaining candidate trees and previous software without automatic pruning. `integrations/electron/desktop-install.py` likewise created app/login backup archives without bounded retention. Historical source-install and manually created backup copies formed additional independent stores.
- The existing updater already retains two recent eligible terminal generations and protects active workers, recovery and runtime pins. Source CLI replacement attempts to retire its newly created previous runtime, but retains live/legacy/unknown copies. These protections do not cover every producer or establish safe automatic ownership of older unmarked files.
- [Runtime hygiene](2026-11-08_tasks-desktop-runtime-hygiene.md) owns the implemented runtime pins, signed-resource protections, managed integrations and remaining historical launch investigation. This list owns closing retention gaps across installation paths; reuse that implementation and preserve its completed evidence. [Update speed](2026-11-03_tasks-desktop-update-30-seconds.md) owns preparation latency, not retention policy.
- The implementation request authorizes code, tests and disposable installation fixtures. It does not authorize cleanup of the owner's historical installations, installation into the owner's home, deletion of retained eval evidence, publication or a scheduled job.

## Implementation decisions

- A shared Python policy under installation tooling owns a versioned, installation-scoped ledger. Node entry points use a small adapter; canonical-memory source layers remain independent.
- Rollback references are per replaced component (CLI/desktop), so partial replacements preserve the untouched component. A combined transaction publishes both references together; mixed producers supersede the same references instead of retaining independent histories.
- Only newly registered, identity-bound payloads in explicit producer namespaces are eligible. Legacy unmarked stores are reported; no automatic adoption or machine-wide sweep.
- Lock order: existing installer directory lock, then retention advisory lock. A validated live owner handoff avoids reacquiring a caller's installer lock. Preview is observational; apply always replans under locks.

## Implemented retention policy

- Scope retention to each managed installation and its explicitly owned software stores. Keep the installed app/CLI and **one complete, verified rollback generation** for that installation, with consistent references across updater, desktop installer and dogfood workflows. Avoid keeping a separate full rollback indefinitely for each entry point.
- After verified success, remove unreferenced download archives, unpacked source, build output and superseded software backups. Keep compact receipts/diagnostics where useful, with their own bounded retention. Prepared updates and an operation's active worker remain protected until handoff completes.
- Preserve live-pinned runtimes and anything needed for an incomplete transaction or recovery, regardless of age or soft storage budget. Cleanup may defer; it must state why and retry through an existing lifecycle trigger.
- Terminal failed operations may retain a small bounded diagnostic history. Bulky software copies need a live/recovery/reference reason to remain. Choose and document concrete limits after measuring representative fixture sizes; age alone never establishes deletion safety.
- Exclude canonical Markdown, boards, indexes, embeddings/models, credentials, profiles, private drafts, retained note recovery, user-authored source/checkouts, arbitrary backups and saved eval runs/evidence. Unknown ownership is a reportable exception, not automatic permission to delete.
- Use a soft budget for disposable software/history. Protected state can exceed it; report retained bytes/reasons instead of deleting needed recovery or stopping backends to meet a quota. Do not promise a hard total application-size cap.

## Tasks

- [x] 1.0 Define complete ownership and retention coverage.
  - [x] 1.1 Inventory every producer and consumer: published updater, combined/source/CLI-only installer, direct desktop setup, dogfood install/rollback, temporary build roots and existing bounded diagnostic logs. Map download/unpack/build/previous-runtime/archive paths and the receipts that authorize their removal.
  - [x] 1.2 Specify a versioned ownership/reference contract with installation and generation identities, terminal state, rollback role, live runtime/worker references and a bounded cleanup result. Preserve directory-generation checks and protected-path overlap rules.
  - [x] 1.3 Define how a new verified rollback supersedes the old one across entry points, including switching from dogfood to published installation, partial app/CLI replacement and rollback itself. Publish the new rollback reference before retiring its predecessor.
  - [x] 1.4 Choose the smallest shared planner/apply seam under installer/update tooling, reusing existing runtime retirement helpers. Keep installer policy outside canonical-memory core; read architecture and relevant co-located docs before changing source modules. Keep Node/Python adapters consistent without forcing a broad rewrite.
  - [x] 1.5 Document legacy handling: recognize only layouts with sufficient verified ownership/reference evidence. Retain/report unknown historical trees; any optional adoption/migration must be explicit and separately reviewable.

- [x] 2.0 Implement guarded planning and deletion.
  - [x] 2.1 Build a bounded, observational inventory with reclaimable/protected/unknown entries, reasons and clearly defined size accounting. Never infer ownership from a filename, mtime, open port or process name alone.
  - [x] 2.2 Apply plans under coordinated locks, revalidating ownership, path/generation identity, transaction/rollback references and runtime pins immediately before deletion. Define lock ordering so installer-owned cleanup cannot deadlock by reacquiring its own lock.
  - [x] 2.3 Preserve protection against symlinks, foreign ownership, unsafe hardlinks, path replacement and startup/deletion races. Keep retirement markers/pins outside signed bundles and revalidate the same runtime generation throughout.
  - [x] 2.4 Make interrupted cleanup recoverable and idempotent. An unknown or partially removed tree must remain inspectable. Report actual removal separately from a proposed reclaim estimate; cleanup failure cannot turn a verified install into a failed installation.
  - [x] 2.5 Bound compact receipts/logs separately from bulky payloads. Never label unique recovery records as rebuildable cache or let diagnostic retention reintroduce unbounded full app/source copies.

- [x] 3.0 Wire automatic cleanup into every supported producer.
  - [x] 3.1 After verified published update/recovery, prune eligible staging and superseded rollback data through the common policy, replacing inconsistent per-path limits where appropriate.
  - [x] 3.2 After successful direct desktop/combined installation, bound `before-*.tar.gz` app/login backup archives while preserving the selected usable rollback and any ongoing transaction references.
  - [x] 3.3 After successful source/CLI-only replacement, revisit previously deferred owned runtime backups as well as the just-created predecessor. Preserve independent/custom installation roots and source/ref policies.
  - [x] 3.4 After successful dogfood installation or rollback, prune obsolete candidate/build trees and repair `current.json`/rollback references atomically. A fresh receipt must never point to a pruned generation.
  - [x] 3.5 Retry live-reference deferrals using existing backend shutdown/runtime-release hooks where safe, plus bounded app-startup or subsequent installation maintenance. Record pending work when immediate cleanup is unavailable. Do not add an always-on cleanup service or machine-wide folder sweep.
  - [x] 3.6 Remove transient build/download directories on successful completion and ordinary handled failure when they have no recovery/reference role. Retain a concise reason/location for anything deliberately kept.

- [x] 4.0 Make retention inspectable.
  - [x] 4.1 Expose a small supported storage inspection and cleanup-preview entry point, reusing existing CLI/diagnostic conventions. Choose final command names during implementation; do not document proposed commands as available.
  - [x] 4.2 Report owned software footprint, eligible bytes, protected bytes, active rollback, deferred reasons and last cleanup outcome. Exclude secrets, note contents and arbitrary filesystem scans from output.
  - [x] 4.3 Set a measured soft budget and visible, bounded over-budget guidance. Explain which live/recovery/unknown references prevent cleanup and when another attempt will occur. Automatic cleanup must not require a confirmation on every successful update.

- [x] 5.0 Prove that repeated use stays bounded.
  - [x] 5.1 Add a cheap repeated-cycle fixture (at least 20 cycles) for updater, direct desktop setup, source/CLI replacement and dogfood paths, including mixed entry-point sequences. Use synthetic package trees without repeated downloads/native builds. Assert obsolete generation/archive counts and disposable bytes stop growing once retention is reached.
  - [x] 5.2 Hold an older runtime live through several replacements: verify it remains usable/protected, then release it and exercise the deferred-cleanup trigger. Preserve the current executable, valid rollback and canonical fixture data byte-for-byte.
  - [x] 5.3 Cover failed/incomplete install, rollback, lost response, active worker/child, stale/uncertain PID, concurrent install/prune, changed plan/path, unsafe link/foreign tree, damaged ownership metadata and interruption during deletion. Uncertainty must retain data with an explicit reason.
  - [x] 5.4 Verify a retained rollback still works after repeated pruning and both app/CLI versions stay aligned. Confirm pruning does not change source/ref, integrations, selected brain, credentials, drafts or note recovery.
  - [x] 5.5 Run focused Node/Python tests and one representative packaged Mac lifecycle check against disposable homes. Record logical/allocated bytes and OS/filesystem limits separately; APFS cloning means removed file sizes are not guaranteed reclaimed free space. Reuse unaffected checks under the lean release workflow.

- [x] 6.0 Document and finalize the implemented result.
  - [x] 6.1 Update install/update/dogfood and owning module docs with actual automatic triggers, concrete retention limits, protected exceptions and supported inspection/recovery commands. Update glossary only if a new shared concept is introduced.
  - [x] 6.2 Record before/after repeated-cycle measurements, tested snapshot/platforms, retained reasons and untested limits. Update the runtime-hygiene cross-reference without claiming its unrelated launch investigation complete.
  - [x] 6.3 Add concise user-facing pending release notes for the implemented storage behavior and a selective changelog entry when warranted. No version bump or publication is implied by implementation.
  - [x] 6.4 After required work/checks pass, archive this list and commit the scoped implementation/tests/docs under [task completion](../../docs/task-workflow.md). A local commit does not authorize installation, push or release.

## Acceptance

- Repeated supported installs/updates reach a bounded disposable footprint; no entry point silently accumulates a full new app/source tree or backup archive forever.
- There is one identifiable usable rollback for the current installation, with additional retained software explained by active or unfinished-recovery references.
- Eligible deferred copies become removable after references end, without manual folder hunting.
- Current/live/recovery/user data survive pruning, and unsafe/unknown ownership is retained visibly.
- Automatic cleanup is wired into normal lifecycle operations, is inspectable, and adds no new always-on service or required release matrix.

## Relevant files

- `integrations/electron/{installation-retention.py,software-maintenance.mjs,test_installation_retention.py,install.mjs,test_native_identity.py}` — shared ledger/planner/apply, packaged retry, build artifact guard and regressions.
- `scripts/installation-storage.mjs`, `test/installation-storage.test.js` — supported storage command, real CLI/updater repeated cycles and startup adapter.
- `docs/installation-storage.md`, integration `.npmignore` files, `test/package-footprint.test.js` — actual maintenance contract and unchanged distribution limits.

- `integrations/electron/{update-retention.py,test_update_retention.py,update-worker.mjs,update-transaction.py,desktop-install.py,test_desktop_install.py,electron.docs.md}` — current updater retirement, journals, app/login archives and native lifecycle.
- `scripts/{dogfood-local.mjs,public-install.mjs,install-local-cli.mjs,install-support.mjs,setup-desktop.mjs}` — candidate/source/combined/CLI-only producers and installer coordination.
- `src/adapters/backend-host/{runtime-pins.ts,backend-host.docs.md}`, `src/app/backend-host/backend-host.docs.md` — generation-bound runtime references and existing lifecycle contracts.
- `test/{runtime-hygiene.test.js,dogfood-local.test.js}` and relevant installer/update tests discovered during implementation — regression starting points; verify exact filenames before editing.
- `docs/{install.md,local-dogfooding.md,release-testing.md}`, `tasks/todo/release-next.md` — supported behavior, selected verification and eventual release notes.

## Coverage and validation notes (2026-11-03)

- Source/combined/CLI-only public installation, updater, direct desktop setup and dogfood now share the ledger. Source predecessor publication waits for outer verification; app and CLI references can be split only for partial component replacement. New references are durable before pruning previous ones.
- Managed legacy companion replacement joins the outer installer through a pending completion receipt. Historical direct private-helper calls keep their old conservative behavior; old unmarked copies are not adopted. Local npm developer installs (`install-local-cli.mjs`) leave package replacement/cache ownership to npm and create no independent retained backup store.
- Invocation build/download scratch already has finally cleanup. Completed Electron build dependencies are now removed from prepared updater/dogfood CLI trees, retaining the exact lazy compiler; root source development dependencies are pruned after build. Fixed `.local-pack/desktop` output stays caller-owned, bounded to one artifact, with a separate nonblocking build lock and generation/pin checks before replacement. Explicit output, package archives, evaluation trials and evidence remain caller-owned.
- CLI-only deferred work retries on subsequent installation or explicit apply. Managed Mac startup also retries. No backend shutdown hook or service is needed; stopping a backend alone does not initiate cleanup. Protected/unknown entries can exceed the 2 GiB guidance budget. Missing Python defers maintenance rather than provisioning it.
- Diagnostics retain their existing seven-day/ten-segment policy and per-job 256 KiB logs. Retired software jobs leave at most 20 compact outcome receipts, not full failed software/log trees. Unfinished recovery is unique operational state and has no age expiry.
- Deterministic suite: `node --test --test-concurrency=4` — 1,874 tests, 1,872 passed, two platform/optional skips, no failures. A prior default-concurrency run hit the unrelated extension observer deadline assertion; its isolated file passed 22/22 and the complete four-worker rerun passed unchanged.
- Python Electron suite: 42/42; legacy companion suite: 66/66. The broader Electron run exposed an already-stale native-identity fixture missing `live-gateway.mjs`; it now models the current runtime and new packaged helper resources.
- Policy repeated controls (logical `lstat` bytes, 20 copies with cleanup withheld → one retained): source CLI 341,160 → 17,058; updater/dogfood 343,080 → 17,154; mixed 342,408 → 17,154. Separate per-cycle apply runs stay bounded throughout. These are tiny synthetic fixtures, not published installation sizes or reclaimed free space. Direct desktop calls retain one readable archive after 20 cycles (roughly 884 compressed fixture bytes); 20 actual CLI replacements retain one executable predecessor. Twenty handled updater failures leave zero payload trees and 20 compact outcomes after worker exit.
- Packaged Mac success has verified aligned app/runtime/CLI 0.3.3 → 0.3.4, nine protected files, unchanged source/ref/settings, signed and executable retained rollback, pinned extension preparation after removing build dependencies, and a maintenance retry through the actual packaged Python helpers. The final code/artifact match and measurements are recorded below.

## Remaining limits

- No owner's installation, historical backups, personal Markdown, version, remote memory or release was changed. No push/install/publication is authorized by this implementation.
- Automatic ownership begins with new receipts. Historical or damaged metadata, foreign/linked/legacy/frozen software and uncertain live/recovery references remain explicit exceptions, not a hard size cap.
- Tests use macOS arm64 15.7.7, Node 26.7.0, Python 3.14.7 and synthetic package trees. Intel, Linux filesystem behavior, physical power loss, malicious code running as the filesystem owner, notarized/live-GitHub delivery and every arbitrary historical installation layout are not certified. Descriptor-relative deletion and interruption fixtures do not promise crash consistency against all hardware/filesystem failures.
- The independent runtime-hygiene historical launch investigation remains open. A new universal automatic software restore command is not introduced; existing GUI recovery, dogfood rollback and explicit inspected archive/runtime recovery remain the supported routes.

## Completed result and final verification

- Implemented shared installation/generation ownership, component rollback publication, guarded resumable pruning, storage preview/apply, all supported producer hooks and managed-startup retry. Updated operator/module docs, pending release notes and cross-references; no version bump or publication.
- Tested source: base `dfaa49140ceca939ac41f1a4a22a3e3cc5b35d58` plus this task's scoped changes. The final native source package SHA-256 is `1a2a0a2d9f95f5cd8376709de95a483bfebda83afa88a05f825756a2bfd6d1e1`; all eleven changed/new packaged production installer/helper files match the final working tree byte-for-byte. Repository-only dogfood and smoke adapters are covered by focused tests/fixture execution.
- Final focused Node run: 11/11. Final Electron Python run: 42/42, including 19 shared-policy tests. Legacy Python: 66/66. Complete Node suite: 1,872 passes, two skips, no failures at concurrency four. `git diff --check` passes. Package-size assertions retain all original ceilings.
- Final packaged native trial: `.local-pack/update-smoke/success/2026-11-03T10-22-53.009Z-JyyxGL/` (`result.json`, `storage.json`, trial/package digests and bounded logs). One shared verified app/CLI rollback survives; its CLI executes and app signature verifies. Terminal release archive and Electron build dependencies are absent. Packaged retry removes its stale fixture payload while preserving rollback and protected data.
- Native logical bytes: retained rollback/history **332,830,984**; current app plus CLI **332,718,435**; combined measured owned software **665,549,419**. Allocated-file accounting is **353,513,472** rollback bytes and **336,707,584** current bytes. Footprint coverage is complete for the owned fixture. These are one Mac's fixture file metrics, not reclaimed free-space or a universal install-size promise; external engine/models, user data and small runtime-pin state are excluded.
- Final npm package measurement: **1,435,887** compressed bytes, **4,576,189** unpacked bytes, **3,075,643** runtime bytes, **633** files. These remain below unchanged 1.45 MB / 4.6 MB / 3.1 MB / 660 ceilings. The final package check passes with all retained installer and maintenance assets.
- Archived under the repository task workflow; the implementing commit is reported in the completion response. Separate runtime-hygiene launch work remains active.
