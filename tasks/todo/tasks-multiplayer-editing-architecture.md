# Shared backend and live multiplayer editing

Status: active, 2026-11-01. Architecture plan and M0 automated baseline are complete; M1–M5 remain unstarted. Dedicated branch: plan/multiplayer-memory-architecture.

## Goal

Deliver smooth live simultaneous editing for humans and streaming agents over one backend per brain, locally or on a VPS. Keep Markdown canonical, direct-file changes recoverable, existing behavior reproducible, and every merge conditional on executable evidence.

## Scope and decisions

- The [architecture and verification proposal](../../deep-dives/multiplayer-editing/architecture-and-verification.md) explains ownership, durability, transports, merging, failure semantics, rollout, and pinned T3 inspiration. It is a proposal, not a claim of implementation.
- User-selected requirements: live simultaneous editing; streaming agent output; recoverable disconnected drafts with reconnect before publishing; separate revocable reader/writer credentials without per-note ACLs; one on-demand local backend usable without the app window.
- Direct writes to Markdown remain a required detection/reconciliation path. Prefer coordinated CLI edits, but do not pretend filesystem writers can be prohibited by a CLI rule. Preserve observed conflicting content; document unavoidable unobserved/raw-writer races.
- Keep one engine for local and hosted roots. Do not add a model provider, mandatory cloud account, synchronization service, authoritative binary content database, MCP prerequisite, or full T3 orchestration framework.
- Existing local runtime embedding, V1 HTTP/CLI operations, guarded updates, retrieval/index policy, extensions, boards, native capabilities, and installation behavior are compatibility surfaces. Proposed backend discovery is an explicit architectural change, not permission to silently retarget existing brains.
- First gate now: M0, the reproducible current-behavior baseline and its verifier. No WebSocket/backend/editor migration is authorized by executing M0.
- Planning seed: 1cc3b4153922935ada80f509cbe3cc227ce4c1ce. Unrelated folder-explorer edits in the original checkout are outside this worktree and outside the frozen seed; incorporate their final supported behavior before a later integration if they land.

## Maturity and merge conditions

| Level | Completion evidence | Current state |
| --- | --- | --- |
| M0 | Protected current-behavior contract, immutable baseline/artifact/environment manifest, reproducible checks, negative verifier tests, explicit coverage gaps. | Passed for the recorded macOS/loopback automated scope; see the evidence record. |
| M1 | One discoverable root owner; compatible app/CLI lifecycle; reader/writer enforcement; proven storage/editor prototype. | Unstarted. |
| M2 | Scoped authenticated live state, external-file invalidation, gap-free snapshots, bounded reconnect and revocation. | Unstarted. |
| M3 | Two humans edit concurrently with correct source preservation, undo, selection, drafts and durable Markdown saves. | Unstarted. |
| M4 | Streaming agents and observed direct-file edits coexist safely with humans, including failures and recovery. | Unstarted. |
| M5 | Repeated integrated Mac/Linux/VPS, compatibility, resource, failure and rollback scenarios pass. | Unstarted. |

A merge requires the frozen M0 assertions plus the new stage's relevant scenarios against the proposed integration snapshot. Missing required evidence is blocked or untested, never passed. A stage's green tests do not authorize enabling unverified later behavior. Feature gating must itself be tested. Record a contract delta separately for intentional behavior changes; do not regenerate a baseline to accept a regression.

## Scenario contract

Freeze executable IDs and expected outcomes in M0. P01–P12 match the [current behavior inventory](../../deep-dives/multiplayer-editing/current-behavior-inventory.md); use it for exact existing test mappings and add scenarios where coverage is absent.

| ID | Scenario and expected result |
| --- | --- |
| P01 | Canonical reads return exact uniquely ID-addressed bytes and hashes; missing/invalid/duplicate or unsafe identities fail explicitly. |
| P02 | Canonical writes preserve protected metadata and path, reject stale/unsafe replacements, enforce current title rules and preserve exact no-ops. |
| P03 | Local/remote creation retain compatible identity/packets, bounded idempotency and separate canonical Saved versus indexing outcomes. |
| P04 | Raw agent file saves refresh a clean editor without feedback saves; metadata-only refresh does not replace body content. |
| P05 | Autosave and conservative independent-edit merges work; overlaps/title conflicts and failed/unconfirmed saves preserve the draft. |
| P06 | Editor/source fidelity, Unicode, references, code/tasks/tables, undo, selection and IME interaction retain current supported behavior. |
| P07 | Current server auth, CLI/gateway read-only policy, remote path privacy and unknown actor attribution remain effective. |
| P08 | Brain/credential switching, same IDs on different roots, navigation, close/quit and late responses preserve scope and save barriers. |
| P09 | CLI/local/hosted retrieval and index outcomes stay truthful; supported reads/saves do not become dependent on indexing. |
| P10 | Compact evidence byte budgets, guarded expansion, citations, temporal/depth policy and incomplete coverage remain intact. |
| P11 | Canonical boards, attention, references, graph and deletion retain current organization/concurrency semantics. |
| P12 | Public runtime/extension compatibility, module boundaries, onboarding, packaging and app/CLI installation/update behavior remain valid for affected paths. |
| L01 | Two clients start concurrently; one root backend wins; path aliases and incompatible instances cannot create a competing supported writer. |
| L02 | Snapshot plus subscription has no missing-edit window; duplicate/out-of-order/gapped events, expired cursors and restart epochs resynchronize correctly. |
| L03 | Two human editors concurrently type in distinct and overlapping text, repeated paragraphs, headings/code/tasks/tables and custom reference nodes. Expected intent and Markdown survive; unsupported cases recover explicitly. |
| L04 | Agent chunks appear while two humans type. Ordered/deduplicated chunks, stale base mapping, range replacement, cancellation and truncated syntax preserve the specified content. |
| L05 | Raw in-place/atomic-save edits, missed watcher events, delete/recreate and external edits during publication are reconciled or retained for recovery without feedback loops. |
| L06 | Socket loss, reload, server kill, disk failure and reconnect distinguish draft/admitted/published states; every Saved revision survives restart from Markdown alone. |
| L07 | Separate reader/writer principals, revocation/downgrade mid-stream, invalid origins, unauthorized room/brain access and old clients fail closed without data leakage. |
| L08 | Slow consumers, agent bursts, large notes, many subscriptions and shutdown have bounded queues/history/memory and release resources after disposal. |
| L09 | Old HTTP PUT/metadata PATCH clients racing pending live edits, mixed app/CLI versions, service discovery and rollback retain a coherent owner and readable Markdown without dropping pending text or replaying stale binary state. |

The minimum final demonstration is two separate human browser contexts, one agent streaming through the CLI, and a raw file writer using disposable roots, repeated locally and against a Linux-hosted backend. Loopback HTTP fixtures do not establish actual VPS TLS/proxy behavior.

## Tasks

- [x] 1.0 M0: freeze and reproduce current behavior before moving architecture.
  - [x] 1.1 Inspect existing source/docs/tests and capture the planning seed, user-selected target, direct-file limitations, and T3 ownership patterns in this worktree.
  - [x] 1.2 Publish the current-behavior inventory mapping P01–P12 to exact assertions and real browser/CLI/server fixtures. Identify known defects, skipped checks and coverage gaps; do not equate test counts with complete behavioral coverage.
  - [x] 1.3 Add a small versioned parity contract and Node verifier with capture/verify commands, machine-readable scenario outcomes and required-check completeness. Protect frozen assertions, fixtures, harness/contract hashes and baseline artifact integrity; candidate verification must not rewrite its baseline.
  - [x] 1.4 Record exact source/tree, dependency locks, tool versions, artifact digest, environment, commands, outputs and limits. Freeze the built baseline outside mutable dist. Reject ambiguous baseline captures with runtime changes outside the declared source.
  - [x] 1.5 Run the existing deterministic suite plus selected real editor/external-file, note-lifecycle, formatting and companion gateway smokes on disposable roots. Surface prerequisites/skips distinctly. Preserve real canonical assertions, existing independent-merge and stale-save protections.
  - [x] 1.6 Test the verifier with deliberate missing/failed/skipped checks, weakened assertions/fixture drift, corrupt artifacts/manifests, dirty runtime sources and timeouts. Demonstrate it rejects false-green evidence.
  - [x] 1.7 Verify the unchanged runtime against the frozen baseline a second time to establish reproducibility. Record exact results and portability limits. Only mark M0 complete for the named automated scope; open required coverage work for unverified future changed paths.

- [ ] 2.0 M1 design gate: prove canonical storage and collaboration fit before broad refactoring.
  - [ ] 2.1 Prototype a Lexical collaboration binding and a source-oriented alternative on the real custom node/source-preservation corpus. Pin compatible released versions; measure any upgrade or experimental dependency cost.
  - [ ] 2.2 Prove canonical Markdown recovery after deleting collaboration/index state and killing the backend around publication. Define epochs, Saved receipts, speculative output, conflict copies and client draft storage; reject hidden binary content authority.
  - [ ] 2.3 Prove granular human and streaming-agent edits preserve concurrent work in repeated/ambiguous text and structural changes. Compare convergence with expected user intent, local undo and source fidelity; document limitations and recovery.
  - [ ] 2.4 Specify and test observed raw-file ingestion, finite stabilization/max-wait recovery, intentional empty edits versus temporary truncation, missed-event reconciliation, self-echo suppression and publication races. Record the noncooperating-writer boundary explicitly.
  - [ ] 2.5 Choose the smallest approach that passes the prototypes. Record an architecture decision, dependency/resource budgets and required module boundaries. A failed prototype blocks broad migration; transport plumbing is not a substitute.
  - [ ] 2.6 Wire the parity/stage commands into the actual integration workflow before the first architecture implementation merge: required checks where supported, or an explicit local pre-merge procedure testing the proposed integration tree and retaining its report. A documented rule or optional script alone is not automatic merge enforcement.

- [ ] 3.0 M1 implementation: one backend owner and real server authorization.
  - [ ] 3.1 Define root-instance discovery/readiness, atomic startup ownership, explicit stop/drain and executable/protocol compatibility. Exercise concurrent starts, stale records, path aliases, foreign ports and crashes.
  - [ ] 3.2 Route local app and CLI operations through the root owner, starting it on demand without a GUI. Preserve explicit root/remote selection and runtime embedding; do not silently create a second writer or switch the CLI to the app's selected brain.
  - [ ] 3.3 Separate window-close lifetime from backend lifetime. Integrate quit, login, update replacement and save barriers; retain scoped native Keychain/folder capabilities without renderer secret access.
  - [ ] 3.4 Add separately revocable reader/writer principals and per-operation server enforcement. Specify local same-user bootstrap, VPS provisioning/rotation, legacy-key migration and safe diagnostic identity. Role downgrade must also stop existing streams.
  - [ ] 3.5 Preserve working V1 HTTP operations and old-client behavior. Add root-owner/credential tests and real local CLI-without-app plus Linux-hosted CLI evidence. Pass P01–P12 and applicable L01/L07/L09 before claiming M1.

- [ ] 4.0 M2: shared contract and reliable live subscriptions.
  - [ ] 4.1 Define versioned command/event/error envelopes, capability negotiation, document epoch/revision versus content hash, request IDs, cancellation and per-operation retry/status semantics. HTTP/WS adapters call the same app policy.
  - [ ] 4.2 Add authenticated WebSocket RPC/subscriptions with snapshot/cursor handoff, gap recovery and bounded frames/queues. Subscribe only to needed brains/documents; enforce roles for every message, not only upgrade.
  - [ ] 4.3 Build one connection supervisor per environment with platform adapters for browser/CLI, bounded jittered reconnect, foreground health checks and separate synchronization states. Dispose old subscriptions on scope/credential changes.
  - [ ] 4.4 Publish confirmed supported writes and stable observed file changes; reconcile periodically. Replace relevant polling only after equivalent refresh/merge protection passes. Keep explicit compatibility fallback without weaker write semantics.
  - [ ] 4.5 Test L02/L05/L07/L08 with injected gaps, disconnects, missed events, stale same-ID brain responses, slow readers and revocation. Run the protected parity gate before enabling this stage.

- [ ] 5.0 M3: live human collaboration with truthful saving and draft recovery.
  - [ ] 5.1 Bind the selected shared model to existing editor nodes without whole-document rehydration on every remote edit. Preserve literal Markdown, custom references, task/code/table editing and unrelated bytes.
  - [ ] 5.2 Integrate scoped cursors/presence, local-only undo, selection mapping, IME, accessible status and read-only views. Remote changes must not create duplicate autosaves or erase another writer through Undo.
  - [ ] 5.3 Implement recoverable client drafts with clear storage/privacy/retention policy and visible unavailable-storage behavior. Reconnect/authenticate/resynchronize before publishing; do not silently replay offline work.
  - [ ] 5.4 Integrate durable publication batches, saved hashes, protected metadata, attention and index scheduling. Coordinate legacy PUT/PATCH with pending live edits; a valid disk hash alone must not authorize overwriting admitted work. A token/frame acknowledgement must never be shown as Saved before canonical publication.
  - [ ] 5.5 Pass L03/L06 and the entire affected baseline in two real browser contexts. Test reload/crash, disk-full/permission failure, overlapping edits and schema mismatch, plus targeted native IME/accessibility checks where affected.

- [ ] 6.0 M4: agents stream into the same document model; files remain usable.
  - [ ] 6.1 Add CLI collaboration operations for opening a base revision, streaming bounded ordered chunks, status, completion and cancellation. Preserve ordinary one-shot memory commands and agent independence.
  - [ ] 6.2 Map agent edits to their read state with stable/proven anchors or equivalent transformations. Reject stale/ambiguous operations; never apply old offsets blindly or replace the whole current document for every token.
  - [ ] 6.3 Make partial streamed Markdown safe and recoverable, deduplicate chunks, bound buffers and expose generated/committed/conflicted/unconfirmed outcomes. Cancellation must not revert concurrent human edits or mislabel partial output as complete.
  - [ ] 6.4 Reconcile external file saves through the session, preserve both sides on unresolved overlaps, and correctly handle invalid IDs, rename/delete/recreate and changing files. Retain unknown attribution for raw edits.
  - [ ] 6.5 Pass L04/L05/L06 and legacy-write L09 with two typing humans, a streaming agent and raw writer. Inject duplicate chunks, disconnect-after-commit, server restart, old-client PUT/PATCH, agent death/cancel and overlapping structural edits; assert exact canonical content and retained recovery material.

- [ ] 7.0 M5: prove the integration candidate can replace the old path.
  - [ ] 7.1 Extend the baseline corpus/gates for new supported behavior without weakening P01–P12. Supply missing Mac/Linux, supported minimum Node/runtime, real TLS/proxy/WS upgrade, version-skew and native service/updater evidence for changed surfaces.
  - [ ] 7.2 Freeze measured latency/resource limits before enabling collaboration. Exercise the declared two-human/one-agent fixture and a five-human/three-agent workload, slow client, large notes and bounded soak; report source, rates, sizes, RTT, disk and semantic-index costs.
  - [ ] 7.3 Verify backward compatibility and rollback from the packaged candidate with existing roots, same-ID brains, old clients and preserved drafts. Rebuild all derived collaboration/index state from Markdown and prevent obsolete clients replaying it.
  - [ ] 7.4 Run required parity and stage checks against the actual proposed integration result. Reject missing, flaky or failed required evidence; record reused evidence only for identical relevant inputs. Do not merge because a branch once passed.
  - [ ] 7.5 Enable in explicit stages, then retire duplicate polling/writer paths only after replacement evidence passes. Document operator recovery, limits and observability without logging note contents or credentials.
  - [ ] 7.6 Update architecture/module, CLI/protocol, memory format, desktop/gateway and installation docs, reusable glossary terms and release notes for delivered behavior. Keep release checks proportional; this refactor gate does not activate the unrelated deferred scale-up release program.
  - [ ] 7.7 Record final maturity evidence and unresolved limits; finalize/archive the implementation task when its required work is actually complete. A partial M0 result leaves this roadmap active. No automatic push, merge, installation or release.

## Evidence protocol

M0 tooling and exact commands are implemented; use the [M0 verification guide and evidence](../../deep-dives/multiplayer-editing/M0-verification.md). Later-stage scenarios describe intended checks, not existing collaboration capability.

Each run must record baseline/contract/harness identity, source/artifact/tree and lockfile hashes, toolchain/platform, declared scenario IDs, command results, canonical output assertions, skips, and untested boundaries. Candidate changes must not replace expected output with observed output. Keep bulky logs/artifacts in ignored local output; commit only the small sanitized manifest/summary needed to reproduce it.

The expected first gate includes npm test and the existing scripts/external-document-updates-smoke.mjs, scripts/note-lifecycle-smoke.mjs, scripts/markdown-formatting-smoke.mjs and scripts/companion-gateway-smoke.mjs with their documented prerequisites. Tests may use controlled dependencies only where declared; fake QMD or loopback success cannot establish real semantic retrieval or deployed VPS behavior.

## Execution record

- 2026-11-01: dedicated clean worktree created from the planning seed. Original checkout's unrelated changes remain untouched.
- 2026-11-01: user authorized subagents and executing the first gate. Responsibilities split across baseline inventory, parity tooling and baseline execution; the parent owns architecture/task integration.
- First exploratory capture: 1,561 tests discovered, 1,560 passed, one failed, zero skipped/TODO. The failure was a missing locked Electron-subproject compiler dependency in the fresh worktree; after installing that subproject's dependencies without install scripts, its focused disposable-home fixture passed 11/11. This run is retained as failed setup evidence, not the authoritative baseline.
- A subsequent capture was deliberately interrupted after 1,563 passing tests so verifier review fixes could land; it is not accepted baseline evidence.
- Reviewed capture: all 1,566 tests passed, as did external-file/editor and formatting smokes. Note-lifecycle search-result discovery and the gateway Settings traffic assertion failed. The runner refused to publish an accepted baseline. Diagnosis and any assertion-preserving fixture correction are required before M0 can pass.
- Live diagnosis established stale smoke assumptions rather than a runtime defect: navigation search intentionally excludes the open note, and Settings legitimately reads board metadata. The lifecycle fixture now asserts current-note exclusion and immediate discovery from Home; the gateway fixture permits only the exact board-list GET while continuing to reject note/search/index/write traffic. Production runtime behavior is unchanged; these explicit initial-contract corrections require a fresh capture.
- A third stale gateway expectation treated legitimate active-brain sidebar previews as old-bookmark activation. The corrected assertion retains rejected-note URL/toast checks and verifies Home, a hidden note panel and no replacement body hydration in the editor. Targeted lifecycle and all 14 gateway cases now pass. The verifier's 17 focused negative/unit checks pass. A scoped setup commit is required before final capture because corrected existing smoke scripts are protected source inputs.
- Authoritative capture and independently pinned repeat verification at be5493ba9a3c5aa796d371043e56d6539d6dabf4 each passed all 1,566 tests and all four real browser flows with zero failures/skips/TODOs. All 438 runtime files were byte-identical. The [M0 evidence record](../../deep-dives/multiplayer-editing/M0-verification.md) pins both manifest digests, source/tree/toolchain, timings and exact scope.
- M0 is complete for the named macOS arm64/loopback lexical scope. Real Linux/VPS HTTPS, semantic models, physical Keychain/IME/accessibility, installed upgrades and the new collaboration capabilities remain explicitly unverified and owned by later tasks. The implementation roadmap remains active rather than archiving unfinished work.
- No production runtime source, installed app, personal/shared brain or live VPS was changed. No merge, push, app installation or release was performed. Locked worktree development dependencies were installed for verification. Changelog/release notes are unchanged because this delivers a refactor plan and internal verification tooling, not the proposed product architecture.

## Relevant existing seams

- [Product intent](../../docs/product-vision.md), [source architecture](../../src/architecture.docs.md), [technical contracts](../../docs/technical.md).
- [Canonical storage](../../src/core/canonical/canonical.docs.md), [server use cases](../../src/app/server-memory/server-memory.docs.md), [runtime](../../src/runtime/runtime.docs.md).
- [Browser/editor](../../src/adapters/http-server/browser.docs.md), [HTTP adapter](../../src/adapters/http-server/http-server.docs.md), [shared protocol](../../docs/shared-memory-protocol.md).
- [Desktop](../../integrations/electron/electron.docs.md), [gateway](../../integrations/macos-companion/gateway.docs.md), [connections](../../integrations/macos-companion/connections.docs.md).
- [Release checks](../../docs/release-testing.md), [lean beta policy](../../docs/lean-beta-releases.md), [task workflow](../../docs/task-workflow.md).
