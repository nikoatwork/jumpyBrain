# Production collaboration verification

Status: final verification in progress, 2026-11-02. The implementation and its
automated acceptance contract cover one shared backend per brain, browser
collaboration, streamed CLI agents, observed file edits, separate access and
coordinated upgrades. The task remains active until the final recorded gate
passes.

## Evidence and acceptance

The original M0 baseline remains immutable. Its manifest SHA-256 is
`739838b444bbe9525c21b895c1ba3ad10c40a3312a6f82789b334c7d3ec0bff2`;
the original contract SHA-256 is
`27603e7296338f633f73a75f39a255ec2b886602ad92d67ac78d7781e45cee5a`.
The separately reviewed [contract delta](production-contract-delta.json) pins
17 exact old/new assertion or harness changes and their behavioral reasons.
Its SHA-256 is
`891b30e3fa49fa85baadd333a717fd7271c42f87ca8104e785422c1f1c77c4d3`.
The earlier accepted seven-check integration used the prior delta pin
`6da314fd9db7a891750db0f04e7351226b804c090305ee5b3ca585e97177645e`.
An approved transport or timing change does not replace canonical-content,
conflict, actor-undo or no-echo assertions with weaker HTTP request counts.

The [production contract](production-gate-contract.json) and
[verifier](../../scripts/multiplayer-production-verify.mjs) require a clean,
externally expected integration HEAD containing the current target. Every
tracked file, assertion, tested runtime and target must remain unchanged during
verification. Linux receipts need independent digest pins, exact current source
maps, preserved logs, zero-skip TAP and byte-identical built runtimes. The signed
desktop must contain those same runtime bytes and the current shell modules.
The contract additionally pins production scenario assertion files, including
the Astra counterexamples and browser/native drivers. Removing or weakening
them requires a separately reviewed contract and new external pin; a still-high
test count cannot accept that change silently.

The current candidate contract pins 48 assertion/helper files, SHA-256
`932a4fd227f8d6a11d0601ca5d67b02eacd1769f00b1b0c2256ff05e629eb757`.
It additionally protects actual positional-intent and native-gateway cases,
the Linux runner, and package budget/manifest helpers. The measured runtime
artifact ceiling is reviewed separately in [build footprint](../../docs/build-footprint.md);
all canonical latency, memory, history and queue limits remain fixed.

After the original deterministic suite and four protected browser flows, the
production gate requires all of these:

| Check | Required evidence |
| --- | --- |
| Production editor | Two browser contexts, source fidelity, actor undo, presence, streaming, direct writes, IME events, offline body/title recovery and cloned-tab isolation, 132 default CLI actors and fresh-human editing/Undo expiry. |
| Lexical structure | Existing rich editor behavior and source/security assertions at desktop and narrow widths. |
| Hosted session | Cookie authentication, cross-tab credential replacement, reader enforcement and explicit retained-draft recovery. |
| Retained-version UI | Eleven shipped-shell scenarios for notification, compare/copy, guarded restore, roles/revocation, draft preservation, storage failure, copy budgets, discovery and scope changes. |
| Composed local | Two repeated trials with two real browser users, a shipped streaming CLI and a raw file writer. |
| Composed Linux | The same composed actors against a pinned Linux backend; no host-backend fallback. |
| Local workload | Two human protocol actors plus one agent, 20 rounds, 128 seed notes, fixed seed. |
| Shared workload | Five human protocol actors plus three agents, 100 rounds, 256 seed notes, fixed seed. |
| Native input/accessibility | Actual packaged Electron composition and renderer accessibility-tree checks on disposable data; physical IME and assistive-technology usability remain outside the claim. |
| Signed desktop | Actual packaged normal, backend-crash and recovery lifecycles on disposable data. |
| Packaged diagnostics | Actual packaged shell/runtime diagnostics, without checkout module substitution. |
| Packaged upgrade | Frozen old runtime to extracted candidate package on two same-ID roots, exact preservation, interrupted retry and recoverable rollback. |

The workload actors exercise the real source model, canonical publisher and
WebSocket transport. Browser usability is established by the separate real
editor and composed checks. Workload limits are fixed before acceptance:
canonical p95 at most 1,000 ms, peak RSS at most 512 MiB, retained history and
queued payloads each at most 32 MiB, and each RPC at most 10 seconds. These are
measurements on the recorded machine, not universal capacity guarantees.

Each stage is assessed by behavior rather than test count:

| Scenario | Required oracle surfaces |
| --- | --- |
| L01 root ownership | Real competing starts/path aliases, lifecycle and gateway control tests; packaged close/crash/reopen. |
| L02 ordered state | Snapshot handoff, exact bounded operation history, duplicate/gap/epoch tests and browser held-ack/reconnect cases. |
| L03 human intent | Real keyboard ranges in repeated text, next-keystroke caret intent, granular held edits, source fidelity, actor undo and visible cursor geometry. |
| L04 streamed agents | CLI actual read-stamp checks, bounded stream lifecycle and repeated two-browser/CLI composed trials. |
| L05 raw files | Stable/partial/atomic/deleted/recreated file fixtures, publisher failure injection and authenticated retained-version UI. |
| L06 durable Saved | Publication faults/restarts, uncertain-ack browser recovery, retained private versions and packaged native recovery. |
| L07 access/scope | Real authenticated HTTP/WS/TLS, reader/revocation, invalid origins, gateway brain/credential switches and obsolete handshake rejection. |
| L08 bounded work | Frame/queue/history/stream limits, finite Undo-owner retirement, real default-CLI churn, slow consumers, both fixed workload budgets and resource cleanup. |
| L09 upgrade/legacy writes | Serialized guarded HTTP/live races, extracted-package old-to-new preservation/retry/rollback and same-ID root isolation. |

The exact new assertion files are pinned in the production contract. The frozen
M0 corpus covers P01–P12; deliberate internal-beta wire/lifetime changes require
the separately pinned reviewed delta, while canonical outcomes remain protected.

## Intermediate accepted integration

HEAD `23261608811bffbfd0e316b3e1d078a3a0a06924` contains master
`cd3db8612412bb064df88c003228037e78820002`. Its seven-check production gate
passed, including the protected 1,654-test suite and all four original browser
flows with zero failures, cancellations, skips or TODOs. The report is retained
at `.local-pack/multiplayer/production-gate-2326160-second/report.json`, SHA-256
`cb0f88a112283e45a0f5274ad9a04915d2a23dcf86b66ff44a3f55ae33a30cae`.
Its runtime build is `465d57346ea28739`.

The local workload confirmed 60 edits with canonical p95 47.27 ms and peak RSS
217.48 MiB. The shared workload confirmed 800 edits with canonical p95 193.07 ms
and peak RSS 299.97 MiB. Indexing was disabled in these capacity fixtures; they
exercise real canonical publication and staleness markers, not semantic-model
inference cost. Existing CLI/index behavior is checked separately.

This report does not attest later source changes. Final audits found additional
stream-lifecycle, raw-replacement recovery, title normalization and private-draft
version-retention cases. The final gate requires their regression tests plus
the composed actor and extracted-package upgrade demonstrations.

The expanded candidate at `eb5c50925d16b3cb23c26e06324b602043f05ab2`
passed 95 tests on each pinned Linux version and all focused recovery preflights.
Its full macOS suite rejected one import-layer edge (1,672 passes, one failure):
the CLI used the vendor WebSocket module grouped with live-server policy. That
run is retained as failed evidence. The shared transport is being extracted into
its own adapter, with the CLI/server-policy separation kept explicit. The final
required gate also adds actual Electron input/accessibility coverage.

That native proof found an actual runtime defect: the desktop window's network
filter accepted its HTTP gateway origin but rejected the paired WebSocket
origin. Browser and standalone gateway success did not establish desktop live
publication. The final gate requires real packaged-shell connection, IME edits
and publication, alongside explicit network-denial cases.

## Architecture assumptions challenged by Astra

The user requested GPT-6 Astra at high reasoning effort. Its read-only review
and executable probes are retained in `.local-pack/astra-review/`. It agreed
with one root owner, Markdown authority, publication-confirmed Saved, separate
indexing, scoped private drafts and independently revocable access. It rejected
the inference that conservative single-splice convergence and retained recovery
alone establish smooth multiplayer.

The six reproduced P1 blockers are actual CLI read-base loss, repeated actor
undo failure, greedy code selection mapping, false conflicts from broad diff
ranges, missing cursors in ordinary formatted/empty text, and unversioned
presence coordinates. Further requirements cover scroll clipping, stale peers,
stable person appearance versus tab identity, agent activity anchors and
discoverable retained raw-file versions. These are required implementation and
test work; they are not accepted architectural limitations. The final clean
integration gate and follow-up review must include their counterexamples.

The follow-up review at `12f2a6130658a55486076acefc23dab912c0978b`
verified the original read-stamp, fence-selection, undo and presence fixes, but
reproduced two further positional-intent failures in repeated text: deleting
the first character of `aaaa` sent offset 3, and an explicit remote insertion
at offset 0 failed to advance a caret at offset 2. Both could finish Saved with
the wrong intended result. Evidence is retained in `.local-pack/astra-followup/`.
Exact source reconstruction is insufficient: connected editor operations must
retain actual positions through batching, transport and selection updates.
These remain required blockers until their real-browser reproductions pass.

The same candidate's full regression run stopped with 1,720 passes and two
failures out of 1,722 tests, with no skipped/cancelled/TODO cases. One was an
undefined participant CSS default; the other was fixture teardown racing its
new persistent backend. The latter must drain the disposable owner before
removing its brain, preserving the original onboarding assertions. No production
checks ran after these failures. Its successful 139-test Linux receipts on each
Node version do not override the failed full gate.

The subsequent real packaged native input preflight at build
`490497f765e7e1c4` found another integration defect: the companion gateway's
method allowlist rejected the new `history.read` request during IME/CLI
reconciliation. The browser/server proof alone could not cover that native
boundary. Its failed app, log and sanitized report are retained separately in
`.local-pack/astra-followup/`. The fix must classify history and retained-version
reads correctly, keep Redo and conflict-resetting resync writer-only, preserve
generation fences, and pass the matching repackaged native proof. Read-only
client recovery uses a healthy `open` snapshot, never privileged resync, and
retains the private draft when the source is unsafe.

Clean candidate `d5dba0f19274776de69de188872f61eb959fc7cb` then passed
1,773 tests and all four protected M0 browser flows, followed by the production
editor, Lexical and hosted-session checks. The retained-version UI check failed
while a comparison dialog was focused: a stale inactive Lexical caret crossed an
ambiguous source range. Lexical's nonthrowing production error handler rolled
back the attempted update, and the round-trip guard correctly refused the new
view. Canonical peer text remained saved; the browser retained its prior view.
The full run is **failed**, SHA-256
`76d3bcf75409fa79f0877920d8d0afee5ee6a5690328b9a67179821406543c4e`.

The narrow correction preflights selection projection before mutating the tree.
An active ambiguous caret still requires recovery; an inactive unprovable caret
is cleared without changing dialog focus or its read-only selection. Exact
source verification remains mandatory. The regression uses the production-style
nonthrowing error handler and checks both active and inactive behavior, including
a uniquely mappable inactive caret. All eleven retained-version scenarios pass
the isolated source preflight; a new clean candidate must rerun every gate.

Build `e408ae9fdc9b7022` passes all eleven scenarios through the actual built
shell, plus native IME/accessibility and both local/Linux composed preflights.
The expanded cursor proof also exposed a test measurement race: locator handles
could refer to eight detached labels with zero rectangles after a live rerender.
The fixture now ends the live transport before its synthetic geometry phase,
waits for layout, and queries current labels and panel in one browser evaluation.
Strict clipping/nonoverlap checks remain, and repeat after a real viewport
resize. Three consecutive full production-editor runs pass without retries.
These preflights do not replace the required clean-HEAD gate and independent
review.

## Additional actor-lifecycle review

Clean HEAD `01ca65f74c8deaab154ea5d9e4b016a42669ca7f` passed the full
1,773-test suite, four protected browser flows and all twelve production checks.
Its report SHA-256 is
`4433c15e958b9ce5a1116dfd62b1d2bd71d12dc4d57652e4a2fdd6b29e356f8c`.
The third Astra high review independently passed 104 focused checks and actual
shipped positional-intent, recovery, IME and cursor-label scenarios. It then
found an additional P1 outside that oracle: 64 departed default CLI actors filled
the retained Undo-owner cache, so the next agent and a new human could not write.
The previous run remains valid for its recorded scenarios; it did not establish
actor-churn readiness. Review and reproduction are retained under
`.local-pack/astra-final/`.

The correction retires finite combined Undo/Redo owners, preferring inactive
histories, while preserving canonical source, revision history and receipt
safety. Cache pressure cannot impose a lifetime writer quota. Stable recent
identities keep cached Undo across disconnects; expired history is explicit and
the browser permits further typing. Model and Hub fixtures cover bounded caches,
reconnect, leases, revocation and stale connection disposal. The mandatory shipped
proof holds a browser subscription through 132 actual default CLI processes and
checks fresh-human publication, history replay/expiry and recent agent Undo.
Build `fdc67474bfe9d94e` passes 36 focused built tests and actual packaged native
input/accessibility. The new clean-candidate gate and independent re-review
remain required before completion.

## Reproduction prerequisites

Use the retained immutable M0 directory, the exact locked root and Electron
dependencies, QMD 2.8.3, Playwright 1.64.1/its Chromium, and Docker with the
declared pinned Linux images. The final minimum-runtime check targets Node
22.12.0; the other Linux/runtime check targets Node 26.7.0. Build and package
from the frozen source before running the integration gate. Keep generated
evidence outside source/assertion trees.

The first combined run stopped at dependency fingerprinting because a lazily
downloaded Electron app introduced ordinary framework symlinks into the locked
JavaScript package. The verifier was not relaxed. Move that generated binary
into a separate private test-tool cache and set
`ELECTRON_OVERRIDE_DIST_PATH` to its `dist` directory. The accepted run used
`.local-pack/multiplayer/electron-test-runtime/dist`. Its original failed setup
report remains separate from accepted evidence.

Run `node scripts/multiplayer-production-verify.mjs --help` for all required
pins and artifact arguments. The tool runs checks sequentially, refuses dirty
or moving integration inputs, and never installs software, merges or pushes.
Preserve/export the ignored full reports, artifacts and logs before removing
the worktree; committed digests cannot replace missing evidence files.

## Recorded limits

- Linux evidence uses pinned Linux/arm64 containers and real local HTTPS/WSS
  proxy/CA fixtures. Composed browser checks use host Chromium with the Linux
  backend. This establishes neither public DNS/VPS deployment nor every
  production reverse-proxy configuration.
- The supplied Mac app is locally signed and checked with codesign. Publisher
  authenticity, notarization and installation over a person's existing app are
  separate release operations.
- Native app lifecycle fixtures and synthetic composition events do not prove
  physical keyboard/IME, VoiceOver or other assistive-technology interaction.
  Power-loss durability and semantic retrieval/model quality are also outside
  these automated checks.
- Unsupported overlapping transformations require visible recovery. Caret
  projection is limited to unambiguous source mappings. Browser drafts depend
  on available site storage and remain private to that browser profile.
- Observed destructive raw-file replacements retain previous and observed
  versions. No watcher can recover arbitrary bytes overwritten between
  observations or provide filesystem compare-and-swap against a noncooperating
  writer. Normal backups/Git history remain useful.
- Access credentials, recovery copies and private drafts are unique operational
  data. Rebuilding indexes or edit history does not justify deleting them.

The [operating guide](../../docs/collaboration.md) describes live limits,
credentials, drafts, stream behavior and recovery. The README supplies the
coordinated upgrade commands and an instruction an agent can execute.
