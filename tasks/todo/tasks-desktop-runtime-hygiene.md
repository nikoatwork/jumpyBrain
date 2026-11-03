# Bound desktop update storage and expose runtime ownership

Priority: P1. Status: active; runtime hygiene and signed-resource fixes verified. An inherited Electron Node-mode direct-launch failure is now reproduced/fixed with real packaged launch/Quit/open checks; the reporter's complete macOS 26 launch sequence remains unverified. Reported installation sizes remain observations, not reproduced measurements.

## Goal

Stop obsolete update staging and logs from growing indefinitely, keep live daemons tied to a valid runtime, and make managed integration drift and backend ownership visible.

## Evidence and boundaries

- [Agent review part 3, 2026-11-02](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=a729c03c-d819-4c5f-ad04-a539473ef8c4) reports gigabytes of old update staging, a live daemon executing inside staging, stale managed skill files, an advertised missing CLI config and normal child shutdowns labeled as failures.
- [Second-brain setup report](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=53419d9b-2c42-4686-b20d-d226e2f8dc8a) also reports old app copies and an agent-shell launch exiting before useful diagnostics. A reported code-signing line is not an established launch cause.
- Never prune a running executable, current preparation, required rollback, user data, credentials or drafts. Inventory and dry-run precede deletion; no cleanup of the user's machine is authorized by creation of this plan.
- [Update speed](tasks-desktop-update-30-seconds.md) owns prebuilt-helper latency work. [Portable installation](tasks-portable-installation-project-integration.md) owns CLI-only payload measurement and trimming; reuse those owners instead of adding a package split here.
- Follow-up, 2026-11-03: [automatic installation pruning](tasks-automatic-installation-pruning.md) owns bounded retention across direct desktop backup archives, dogfood candidates and deferred installer copies. The [owner-authorized maintenance run](../done/2026-11-03_tasks-workspace-experience-evaluation.md) reclaimed roughly 12 GB while preserving canonical files. Existing checked updater/pin tasks below describe their implemented scope, not complete cross-installer retention. Preserve this list's separate unresolved launch evidence.

## Relevant files

- `integrations/electron/electron.docs.md`, `integrations/electron/update-worker.mjs`, `integrations/electron/update-transaction.py`, `integrations/electron/diagnostics.mjs` — staging, swap, rollback and host events.
- `src/adapters/backend-host/backend-host.docs.md`, `src/app/backend-host/backend-host.docs.md`, `src/cli/backend-commands.ts` — daemon ownership and inspection.
- `integrations/electron/update-retention.py`, `integrations/electron/managed-integrations.mjs`, `src/adapters/backend-host/runtime-pins.ts`, `test/runtime-hygiene.test.js`, `integrations/electron/test_update_retention.py` — retention, pins, integration refresh and disposable regressions.
- `scripts/public-install.mjs`, `scripts/install-local-cli.mjs`, `src/adapters/logging/logging.docs.md`, `src/adapters/diagnostics/diagnostics.docs.md` — managed files/configuration and bounded logs.

## Tasks

- [x] 1.0 Establish ownership before cleanup.
  - [x] 1.1 Inventory current/legacy update roots, installed and staging runtime references, rollback records, active workers and backend leases in disposable update fixtures. Record executable-path selection across swap/relaunch and CLI/app-owned lifetimes.
  - [x] 1.2 Choose a bounded retention policy and explain which successful verification makes old staging eligible. Account for interrupted updates, locks and active daemons; age alone is insufficient.
- [x] 2.0 Implement safe lifecycle and bounded retention.
  - [x] 2.1 Launch/rebind replacement daemons from durable installed paths, or explicitly pin required staging until the daemon drains. Keep unrelated CLI/server backends alive under their existing ownership rules.
  - [x] 2.2 Prune only validated obsolete owned staging after verified success, preserving required rollback. Provide a preview with reclaimable bytes; decide whether an explicit CLI prune operation adds value beyond automatic bounded cleanup.
  - [x] 2.3 Document and enforce log rotation/retention at the existing logging seam; distinguish disposable logs from unique private drafts and operational credentials.
- [/] 3.0 Make runtime and managed integration state inspectable.
  - [x] 3.1 Add bounded backend enumeration from private owned descriptors, with root, PID/liveness, executable and supported diagnostic fields. Do not infer ownership solely from process names or scan unrelated files.
  - [x] 3.2 Track installed hashes for managed skill files; refresh untouched files through the documented authorized integration-update flow, and report customized/conflicted files without overwriting them. Define migration when no prior hash exists.
  - [x] 3.3 Resolve the missing-config reference by documenting intentional optional absence or creating the minimal file at its proper owner; do not manufacture policy to silence a warning.
  - [/] 3.4 Distinguish expected shutdown from child failure and add a bounded pre-startup failure breadcrumb where feasible. [Packaged follow-up](../done/2026-11-02_tasks-desktop-shell-launch.md) reproduces/fixes inherited Node-mode exit zero and verifies clean direct/LaunchServices/loaded-unloaded service paths. The report's macOS 26 `open` failures and actual environment remain unverified; no signing attribution.
- [/] 4.0 Verify and finalize.
  - [x] 4.1 Test successful/repeated/failed/interrupted updates, rollback, a daemon still using staging, foreign/symlink paths and concurrent cleanup. Assert protected data remains byte-identical and no live runtime is removed.
  - [x] 4.2 Test customized/unmodified/missing integration files and normal/failing shutdown diagnostics; run affected installed-update and backend lifecycle checks.
  - [/] 4.3 Record bounded before/after storage, runtime paths and platform limits; update install/update/module docs and relevant release notes, then archive/commit under [task completion](../../docs/task-workflow.md).
  - [x] 4.4 Move bundled-runtime pins and retirement fences outside signed resources; verify startup/shutdown, relaunch, moves, live retention and startup/cleanup races. [Focused fix and verification](../done/2026-11-02_tasks-signed-bundle-runtime-pins.md). This separate finding is not proof of the reported launch cause; 3.4/4.3 remain open.


## Implementation checkpoint — 2026-11-02

### Parent safety review corrections

Final integration is verified in the [completed integration record](../done/2026-11-02_tasks-feedback-parallel-integration.md): all 1,828 tests passed with real QMD, hosted/gateway/stale-note checks and original package caps passed. Frozen replacement generation is checked before skipping unpinnable runtimes. The agent-shell launch reproduction remains the only required open item here; no personal staging or integration files were modified.

Independent review of `a9c2247` reproduced two gaps: a runtime moved after identity/lease capture could pin the replacement pathname, and legacy companion pair replacement bypassed retirement and deleted a live-pinned backup. Both were corrected during parent integration. Runtime identity captures the directory device/inode generation; pinning validates it before/after publication and verifies the created pin's identity, while detached launch carries its expected generation. Disposable regressions reject both a pre-pin replacement and an exchange/rollback during pin publication. Legacy pair replacement now retains live/legacy/uncertain CLI and bundled GUI runtimes, with explicit eligible-dead cleanup coverage. README's Product vision document remains packaged; new runtime-pin/refresh/retention resources are required by the package manifest guard.

Parent build, 26 focused backend/runtime/help/guidance/lint tests and all 66 companion Python update tests passed after the fixes. An old assertion requiring every previous runtime to be deleted was replaced with exact legacy-backup retention/content assertions. Current combined package check passes unchanged ceilings: 1,439,300 archive / 4,567,074 unpacked / 3,067,363 runtime bytes; 632 files. Emitted-whitespace compaction now covers CLI and backend-ownership modules using existing esbuild; source, declarations, identifiers, syntax and legal notices are retained. Full combined/updater/hosted gates follow the final retrieval merge. These results do not reproduce the reported agent-shell launch failure, so this task remains active.

Base: `fc6f859`; branch `t3/desktop-runtime-hygiene`. This lane does not change
root selection, instruction topic dispatch, skill source content, lint or ranking.
The parent integrates the independent guidance lane at `3065cb7` and reconciles
shared notes/metadata. No installation, service, personal memory or remote source
was used as a test target; there was no push, release, merge or feedback delivery.

### Ownership and decisions

- Supported staged/installed readiness probes now authenticate only the native
gateway. They neither open a brain nor create a detached staging backend; the
probe previously did not require the brain's health to be connected. Normal launch
starts/joins the backend from the installed runtime. Active older-build backends
keep their shared lifetime; ordinary version-mismatch/explicit-stop rules remain.
- Detached and foreground backend claims publish private runtime pins before
readiness, with retirement checks on both sides. Immutable dead pins are reaped
with at most 256 entries inspected per startup. The pin moves with exchanged
runtime bytes; the root descriptor retains its original launch path. A PID still
alive, including conservative PID reuse, retains staging until exit. Frozen or
foreign-owned runtimes can run without pins and cannot be automatically retired.
- After verified update success/recovery, inspect only protocol-1 terminal owned
update generations. Keep two recent dead-worker generations plus the current
worker, live pins, incomplete journals, unknown/legacy runtimes and active children.
`retention-preview.json` records candidate paths/bytes; apply revalidates under a
real exclusive lock and runtime retirement sentinel. Neither mtime nor process
names establish ownership. Interrupted cleanup can retain a partial obsolete tree
for explicit inspection; uncertain state always preserves it. Old unmarked update
trees are not swept, so this is a forward retention bound, not a cleanup claim for
the reported existing gigabytes. A public prune command adds no value until that
legacy ownership migration has evidence.
- CLI-only source updates inspect their own newly created previous runtime before
deleting it. Live/legacy/frozen/unknown backups are retained and reported; absent
Python safely retains the backup rather than provisioning another dependency.
Earlier unknown backup trees stay outside automatic cleanup.
- Existing structured diagnostics and text logger bounds remain. Native gateway
stderr now continuously caps its owned current file at 256 KiB, rather than only
rotating a 5 MB file on launch. Old `.previous` logs stay for explicit inspection.
Updater tails remain 256 KiB per retained generation; drafts/access/profiles/notes
are outside these namespaces.
- Backend inventory is `backend list --root <brain> [--root <another>] [--json]`,
1..32 explicit roots, no registry/process/file scan. It includes PID liveness and
redacted registered runtime identity; invalid state is reported per root. Existing
status packets retain their default shape. Help is resolved before any operation.
- Public installer reruns and paired verified updates refresh only recorded
integration files matching their installed hashes. Complete-file publication
rechecks inode/hash, preserves customized/missing/linked files, and records new
hashes. Unknown prior hashes are adopted only when already equal to the current
rendered template; other legacy files are reported without overwrite. New project
installs record their project owner; unknown legacy project owners stay untouched.
Concurrent arbitrary same-user edits between final comparison and rename are not
a filesystem compare-and-swap guarantee. Content belongs to the other lane.
- CLI policy config absence is intentional: the shim advertises its prospective
path but no file is required until explicit device-local policy is configured.
- Expected native TERM/clean exits record `normal`/success; KILL/nonzero/unexpected
clean exits remain failures. Requested-stop bridge EOF is expected. Electron child
callbacks now distinguish requested stop from failure. A safe existing user-data
directory can retain one bounded content-free pre-host bootstrap breadcrumb.
Pre-Electron process failure cannot produce that breadcrumb, and no code-signing
cause has been established.

### Verification and measurements

- Build passes. Focused Node gate: 126/126 tests, including installer/recovery,
backend/control, updater, CLI help, diagnostics, architecture and entrypoints.
Updater/real-daemon/bootstrap follow-up passed 38/38; after final pin changes,
affected runtime/backend/updater/architecture/package checks passed 69/69. Final
gateway/readiness gate passed 28/28; final real-runtime/installer/bootstrap gate
passed 8/8, including a live backend surviving CLI installer replacement.
- Python retention: 4/4; transaction extraction/publication/rollback/interruption:
6/6; disposable desktop installation/compiler relocation: 11/11. The desktop
compiler tests initially lacked worktree Electron dependencies; after workspace-only
`npm ci --ignore-scripts` (no Electron binary download), all 11 pass.
- Compiled macOS native fixture passes 13 malformed/EOF RPC cases, real menu and
bounded diagnostic checks, expected/failing exit classification, continuous log
bound and symlink-target preservation. Used `--skip-keychain`: no Keychain CRUD,
login changes or actual helper service. Existing compiler deprecation warnings
remain. No user installation was built/replaced or public updater exercised.
- A real detached backend launched from a disposable runtime, stayed authenticated
after that runtime moved, blocked cleanup while live, drained via authenticated
stop, and then allowed its obsolete generation to be removed. Canonical fixture
Markdown remained byte-identical. Backend inventory omitted its capability.
- Synthetic five-generation storage: 5,243,380 regular-file bytes before,
2,097,352 after, 3,146,028 reclaimed; five generations reduced to two. Preview
reported 3,147,690 bytes including directory metadata. Real flock contention,
interrupted inventory, pending rollback, live/dead pins, legacy/frozen trees and
foreign/symlink paths were tested. This is fixture storage, not reported user
installation savings.
- Package/runtime measurements and parent combination limits are recorded below.
All original ceilings remain enforced. Contributor-only product vision, task
workflow and footprint reference docs (18,516 bytes) remain in the repository but
leave the installed artifact; runtime assets and install/operator guides remain.
The feature's retained code cost is reported separately from that document saving.

### Remaining required evidence / why still active

- **3.4 / 4.3:** The actual reported agent-shell launch input/environment and matching
failing packaged app are unavailable. Disposable bootstrap/owned-child evidence
cannot prove the historical launch cause or equivalence to a user launch. Obtain
that reproduction and compare both launch paths before claiming this defect fixed
or attributing signing. Full live installation/public-updater experiments remain
outside this lane's authorization.
- Historical unmarked staging and backup trees need explicit ownership inspection;
no deletion of those trees is implemented or tested. macOS ARM64 fixture coverage
does not establish Intel/Linux native desktop or public signing/Keychain continuity.
- Parent owns combined full-suite/package validation and final footprint decisions;
feature branches are not rebased onto the concurrently completed guidance lane.
Do not archive this list or settle its source thread while required launch evidence
remains missing. The scoped implementation is committed for parent review.


### Final footprint checkpoint and integration choices

- Branch package: **1,438,997 archive / 4,596,284 unpacked / 3,099,334 dist bytes;
629 files**. All unchanged ceilings (1,450,000 / 4,600,000 / 3,100,000 / 660)
pass. Relative to the parent-supplied `fc6f859` baseline: **−89 archive,
+4,926 unpacked, +4,556 runtime bytes; +1 file**. Net unpacked includes the
18,516-byte contributor-doc exclusion; retained additions before that saving are
23,442 bytes (implementation plus installed owning docs), not a zero-cost feature.
- The new pin module is 2,513 JS + 239 declaration bytes, or 2,752 runtime bytes;
the other changed runtime artifacts account for the remaining 1,804 bytes. Public
CLI inventory/help/strict parsing are an optional separable part; updater/native/
integration sources contribute unpacked bytes outside `dist`.
- Guidance lane `3065cb7` reports 3,098,875 runtime bytes. Simple additive runtime
projection is **3,103,431 bytes**, **3,431 over the cap**. This is an estimate until
parent builds the merged tree, not combined-gate success. This branch does not
rebase onto or overwrite that lane and does not relax budgets/assertions.
- Parent options: review bounded pin/helper complexity for shared-code reduction;
defer the separable backend-list capability if its value does not justify its
cost; or measure a deliberate distribution compiler whitespace/comment reduction
without changing behavior. Dropping inventory alone cannot recover the full
projected excess. Any budget policy change requires the parent's explicit measured
decision; this lane makes none. Repository-only docs exclusions provide unpacked
headroom but cannot solve the runtime ceiling.

### Separate signature observation — backend restart verification, 2026-11-02

The [completed restart task](../done/2026-11-02_tasks-backend-restart-recovery.md) initially symlinked a disposable native resource tree to a freshly signed matching runtime. Backend startup added `Contents/Resources/runtime/.backend-pins/<instance>.json` to that input app. Subsequent `/usr/bin/codesign --verify --deep --strict --verbose=4` reported an added sealed resource and failed. The corrected restart harness copies the runtime and passes its independent reconnect/draft checks; that isolated its artifact without repairing installed pin placement. The [subsequent focused fix](../done/2026-11-02_tasks-signed-bundle-runtime-pins.md) completes 4.4 with external generation-bound state and signature/lifetime verification. No historical launch root cause, public-signing behavior or installation repair is claimed.

### Packaged shell-launch follow-up — 2026-11-02

The [focused environment fix](../done/2026-11-02_tasks-desktop-shell-launch.md)
reproduces exit zero before host startup when the actual packaged executable
inherits `ELECTRON_RUN_AS_NODE=1`; this agent shell sets that variable. Disabling
packaged RunAsNode before signing fixes that path. Clean direct launch,
LaunchServices open, AppleScript Quit, a unique disposable LaunchAgent and
second-instance editor opening pass, including after service unload. No installed
app or actual login preference was changed. The secondary-instance test initially
mistook a short state-request timeout during editor startup for service loss;
waiting for actual editor registration and subsequent gateway readiness passes.

This is a proven current-package cause for one reported symptom. The report does
not state its environment and also reports LaunchServices failure on macOS 26;
that part did not reproduce on macOS 15.7.7. Retain this broader task for that
unverified report boundary, with the focused fix committed independently.
