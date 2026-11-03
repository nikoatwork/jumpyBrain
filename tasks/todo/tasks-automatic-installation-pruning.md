# Automatic pruning of obsolete installations and build files

Priority: P1. Status: planned; implementation not started. Requested 2026-11-03 after the owner's machine accumulated obsolete app/runtime copies across repeated installations.

## Goal

Keep software staging, development candidates and rollback history bounded automatically across supported installation paths. Preserve the current installation, one usable verified rollback, live runtimes and unfinished recovery without requiring routine manual cleanup.

## Evidence and ownership

- The [native experience evaluation and maintenance record](../done/2026-11-03_tasks-workspace-experience-evaluation.md) documents 39 obsolete entries removed: 12,161,957,888 allocated bytes, with an observed 12,216,725,504-byte free-space increase. Canonical Markdown hashes matched before/after cleanup. These are measurements of one Mac, not general installation-size claims.
- `scripts/dogfood-local.mjs` retains candidate trees and previous software without automatic pruning. `integrations/electron/desktop-install.py` creates app/login backup archives without bounded retention. Historical source-install and manually created backup copies formed additional independent stores.
- The existing updater already retains two recent eligible terminal generations and protects active workers, recovery and runtime pins. Source CLI replacement attempts to retire its newly created previous runtime, but retains live/legacy/unknown copies. These protections do not cover every producer or establish safe automatic ownership of older unmarked files.
- [Runtime hygiene](tasks-desktop-runtime-hygiene.md) owns the implemented runtime pins, signed-resource protections, managed integrations and remaining historical launch investigation. This list owns closing retention gaps across installation paths; reuse that implementation and preserve its completed evidence. [Update speed](tasks-desktop-update-30-seconds.md) owns preparation latency, not retention policy.
- This request authorizes creating the task list. It does not itself execute cleanup, install software, delete retained eval evidence, publish a release or enable a scheduled job.

## Retention policy to implement

- Scope retention to each managed installation and its explicitly owned software stores. Keep the installed app/CLI and **one complete, verified rollback generation** for that installation, with consistent references across updater, desktop installer and dogfood workflows. Avoid keeping a separate full rollback indefinitely for each entry point.
- After verified success, remove unreferenced download archives, unpacked source, build output and superseded software backups. Keep compact receipts/diagnostics where useful, with their own bounded retention. Prepared updates and an operation's active worker remain protected until handoff completes.
- Preserve live-pinned runtimes and anything needed for an incomplete transaction or recovery, regardless of age or soft storage budget. Cleanup may defer; it must state why and retry through an existing lifecycle trigger.
- Terminal failed operations may retain a small bounded diagnostic history. Bulky software copies need a live/recovery/reference reason to remain. Choose and document concrete limits after measuring representative fixture sizes; age alone never establishes deletion safety.
- Exclude canonical Markdown, boards, indexes, embeddings/models, credentials, profiles, private drafts, retained note recovery, user-authored source/checkouts, arbitrary backups and saved eval runs/evidence. Unknown ownership is a reportable exception, not automatic permission to delete.
- Use a soft budget for disposable software/history. Protected state can exceed it; report retained bytes/reasons instead of deleting needed recovery or stopping backends to meet a quota. Do not promise a hard total application-size cap.

## Tasks

- [ ] 1.0 Define complete ownership and retention coverage.
  - [ ] 1.1 Inventory every producer and consumer: published updater, combined/source/CLI-only installer, direct desktop setup, dogfood install/rollback, temporary build roots and existing bounded diagnostic logs. Map download/unpack/build/previous-runtime/archive paths and the receipts that authorize their removal.
  - [ ] 1.2 Specify a versioned ownership/reference contract with installation and generation identities, terminal state, rollback role, live runtime/worker references and a bounded cleanup result. Preserve directory-generation checks and protected-path overlap rules.
  - [ ] 1.3 Define how a new verified rollback supersedes the old one across entry points, including switching from dogfood to published installation, partial app/CLI replacement and rollback itself. Publish the new rollback reference before retiring its predecessor.
  - [ ] 1.4 Choose the smallest shared planner/apply seam under installer/update tooling, reusing existing runtime retirement helpers. Keep installer policy outside canonical-memory core; read architecture and relevant co-located docs before changing source modules. Keep Node/Python adapters consistent without forcing a broad rewrite.
  - [ ] 1.5 Document legacy handling: recognize only layouts with sufficient verified ownership/reference evidence. Retain/report unknown historical trees; any optional adoption/migration must be explicit and separately reviewable.

- [ ] 2.0 Implement guarded planning and deletion.
  - [ ] 2.1 Build a bounded, observational inventory with reclaimable/protected/unknown entries, reasons and clearly defined size accounting. Never infer ownership from a filename, mtime, open port or process name alone.
  - [ ] 2.2 Apply plans under coordinated locks, revalidating ownership, path/generation identity, transaction/rollback references and runtime pins immediately before deletion. Define lock ordering so installer-owned cleanup cannot deadlock by reacquiring its own lock.
  - [ ] 2.3 Preserve protection against symlinks, foreign ownership, unsafe hardlinks, path replacement and startup/deletion races. Keep retirement markers/pins outside signed bundles and revalidate the same runtime generation throughout.
  - [ ] 2.4 Make interrupted cleanup recoverable and idempotent. An unknown or partially removed tree must remain inspectable. Report actual removal separately from a proposed reclaim estimate; cleanup failure cannot turn a verified install into a failed installation.
  - [ ] 2.5 Bound compact receipts/logs separately from bulky payloads. Never label unique recovery records as rebuildable cache or let diagnostic retention reintroduce unbounded full app/source copies.

- [ ] 3.0 Wire automatic cleanup into every supported producer.
  - [ ] 3.1 After verified published update/recovery, prune eligible staging and superseded rollback data through the common policy, replacing inconsistent per-path limits where appropriate.
  - [ ] 3.2 After successful direct desktop/combined installation, bound `before-*.tar.gz` app/login backup archives while preserving the selected usable rollback and any ongoing transaction references.
  - [ ] 3.3 After successful source/CLI-only replacement, revisit previously deferred owned runtime backups as well as the just-created predecessor. Preserve independent/custom installation roots and source/ref policies.
  - [ ] 3.4 After successful dogfood installation or rollback, prune obsolete candidate/build trees and repair `current.json`/rollback references atomically. A fresh receipt must never point to a pruned generation.
  - [ ] 3.5 Retry live-reference deferrals using existing backend shutdown/runtime-release hooks where safe, plus bounded app-startup or subsequent installation maintenance. Record pending work when immediate cleanup is unavailable. Do not add an always-on cleanup service or machine-wide folder sweep.
  - [ ] 3.6 Remove transient build/download directories on successful completion and ordinary handled failure when they have no recovery/reference role. Retain a concise reason/location for anything deliberately kept.

- [ ] 4.0 Make retention inspectable.
  - [ ] 4.1 Expose a small supported storage inspection and cleanup-preview entry point, reusing existing CLI/diagnostic conventions. Choose final command names during implementation; do not document proposed commands as available.
  - [ ] 4.2 Report owned software footprint, eligible bytes, protected bytes, active rollback, deferred reasons and last cleanup outcome. Exclude secrets, note contents and arbitrary filesystem scans from output.
  - [ ] 4.3 Set a measured soft budget and visible, bounded over-budget guidance. Explain which live/recovery/unknown references prevent cleanup and when another attempt will occur. Automatic cleanup must not require a confirmation on every successful update.

- [ ] 5.0 Prove that repeated use stays bounded.
  - [ ] 5.1 Add a cheap repeated-cycle fixture (at least 20 cycles) for updater, direct desktop setup, source/CLI replacement and dogfood paths, including mixed entry-point sequences. Use synthetic package trees without repeated downloads/native builds. Assert obsolete generation/archive counts and disposable bytes stop growing once retention is reached.
  - [ ] 5.2 Hold an older runtime live through several replacements: verify it remains usable/protected, then release it and exercise the deferred-cleanup trigger. Preserve the current executable, valid rollback and canonical fixture data byte-for-byte.
  - [ ] 5.3 Cover failed/incomplete install, rollback, lost response, active worker/child, stale/uncertain PID, concurrent install/prune, changed plan/path, unsafe link/foreign tree, damaged ownership metadata and interruption during deletion. Uncertainty must retain data with an explicit reason.
  - [ ] 5.4 Verify a retained rollback still works after repeated pruning and both app/CLI versions stay aligned. Confirm pruning does not change source/ref, integrations, selected brain, credentials, drafts or note recovery.
  - [ ] 5.5 Run focused Node/Python tests and one representative packaged Mac lifecycle check against disposable homes. Record logical/allocated bytes and OS/filesystem limits separately; APFS cloning means removed file sizes are not guaranteed reclaimed free space. Reuse unaffected checks under the lean release workflow.

- [ ] 6.0 Document and finalize the implemented result.
  - [ ] 6.1 Update install/update/dogfood and owning module docs with actual automatic triggers, concrete retention limits, protected exceptions and supported inspection/recovery commands. Update glossary only if a new shared concept is introduced.
  - [ ] 6.2 Record before/after repeated-cycle measurements, tested snapshot/platforms, retained reasons and untested limits. Update the runtime-hygiene cross-reference without claiming its unrelated launch investigation complete.
  - [ ] 6.3 Add concise user-facing pending release notes for the implemented storage behavior and a selective changelog entry when warranted. No version bump or publication is implied by implementation.
  - [ ] 6.4 After required work/checks pass, archive this list and commit the scoped implementation/tests/docs under [task completion](../../docs/task-workflow.md). A local commit does not authorize installation, push or release.

## Acceptance

- Repeated supported installs/updates reach a bounded disposable footprint; no entry point silently accumulates a full new app/source tree or backup archive forever.
- There is one identifiable usable rollback for the current installation, with additional retained software explained by active or unfinished-recovery references.
- Eligible deferred copies become removable after references end, without manual folder hunting.
- Current/live/recovery/user data survive pruning, and unsafe/unknown ownership is retained visibly.
- Automatic cleanup is wired into normal lifecycle operations, is inspectable, and adds no new always-on service or required release matrix.

## Relevant files

- `integrations/electron/{update-retention.py,test_update_retention.py,update-worker.mjs,update-transaction.py,desktop-install.py,test_desktop_install.py,electron.docs.md}` — current updater retirement, journals, app/login archives and native lifecycle.
- `scripts/{dogfood-local.mjs,public-install.mjs,install-local-cli.mjs,install-support.mjs,setup-desktop.mjs}` — candidate/source/combined/CLI-only producers and installer coordination.
- `src/adapters/backend-host/{runtime-pins.ts,backend-host.docs.md}`, `src/app/backend-host/backend-host.docs.md` — generation-bound runtime references and existing lifecycle contracts.
- `test/{runtime-hygiene.test.js,dogfood-local.test.js}` and relevant installer/update tests discovered during implementation — regression starting points; verify exact filenames before editing.
- `docs/{install.md,local-dogfooding.md,release-testing.md}`, `tasks/todo/release-next.md` — supported behavior, selected verification and eventual release notes.
