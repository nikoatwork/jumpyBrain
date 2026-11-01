# Shared backend and live multiplayer editing

Status: active, 2026-11-01. M0 and the M1 design gate are complete for their recorded scope. Production M1–M4 are implemented and undergoing the final integrated regression gate; M5 evidence is being collected. Dedicated branch: plan/multiplayer-memory-architecture.

## Goal

Deliver smooth live simultaneous editing for humans and streaming agents over one backend per brain, locally or on a VPS. Keep Markdown canonical, direct-file changes recoverable, existing behavior reproducible, and every merge conditional on executable evidence.

## Scope and decisions

- The [architecture and verification proposal](../../deep-dives/multiplayer-editing/architecture-and-verification.md) explains ownership, durability, transports, merging, failure semantics, rollout, and pinned T3 inspiration. It is a proposal, not a claim of implementation.
- User-selected requirements: live simultaneous editing; streaming agent output; recoverable disconnected drafts with reconnect before publishing; separate revocable reader/writer credentials without per-note ACLs; one on-demand local backend usable without the app window.
- Direct writes to Markdown remain a required detection/reconciliation path. Prefer coordinated CLI edits, but do not pretend filesystem writers can be prohibited by a CLI rule. Preserve observed conflicting content; document unavoidable unobserved/raw-writer races.
- Keep one engine for local and hosted roots. Do not add a model provider, mandatory cloud account, synchronization service, authoritative binary content database, MCP prerequisite, or full T3 orchestration framework.
- Existing guarded updates, retrieval/index behavior, source fidelity, boards, native capabilities and user data are regression surfaces. The user explicitly permits breaking CLI/API/integration contracts during the internal beta and coordinated updates of all clients; long-term V1 or mixed-version compatibility is not a requirement. Changes must have a smooth documented upgrade path and must not silently retarget existing brains.
- Current authorization is the complete implementation and verification roadmap, including all automated gates and subagents in this dedicated worktree. The user permits coordinated breaking changes and requests a runnable README upgrade path.
- Planning seed: 1cc3b4153922935ada80f509cbe3cc227ce4c1ce. Unrelated folder-explorer edits in the original checkout are outside this worktree and outside the frozen seed; incorporate their final supported behavior before a later integration if they land.

## Maturity and merge conditions

| Level | Completion evidence | Current state |
| --- | --- | --- |
| M0 | Protected current-behavior contract, immutable baseline/artifact/environment manifest, reproducible checks, negative verifier tests, explicit coverage gaps. | Passed for the recorded macOS/loopback automated scope; see the evidence record. |
| M1 | One discoverable root owner; coordinated app/CLI lifecycle; reader/writer enforcement; proven storage/editor prototype. | Implemented; root/auth/upgrade and Mac/Linux owner tests pass. Final parity verification remains pending. |
| M2 | Scoped authenticated live state, external-file invalidation, gap-free snapshots, bounded reconnect and revocation. | Implemented; final integrated regression verification pending. |
| M3 | Two humans edit concurrently with correct source preservation, undo, selection, drafts and durable Markdown saves. | Implemented; final integrated regression verification pending. |
| M4 | Streaming agents and observed direct-file edits coexist safely with humans, including failures and recovery. | Implemented; final integrated regression verification pending. |
| M5 | Repeated integrated Mac/Linux hosted/TLS, compatibility, resource, failure and rollback scenarios pass; untested physical/public-deployment boundaries are explicit. | In progress: signed desktop lifecycle and both Linux Node versions pass; final frozen-oracle verification pending. |

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
| L09 | Supported whole-document/metadata writes cannot bypass pending live edits; unsupported client versions fail before mutation. A coordinated upgrade preserves brain paths, readable Markdown, configuration and recoverable drafts, with tested recovery. |

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

- [x] 2.0 M1 design gate: prove canonical storage and collaboration fit before broad refactoring.
  - [x] 2.1 Prototype a Lexical collaboration binding and a source-oriented alternative on the real custom node/source-preservation corpus. Pin compatible released versions; measure any upgrade or experimental dependency cost.
  - [x] 2.2 Prove canonical Markdown recovery after deleting collaboration/index state and killing the backend around publication. Define epochs, Saved receipts, speculative output, conflict copies and client draft storage; reject hidden binary content authority.
  - [x] 2.3 Prove granular human and streaming-agent edits preserve concurrent work in repeated/ambiguous text. Structural/ambiguous binding changes must reject with explicit recovery in this design scope; complete structural collaboration remains required at M3. Compare convergence with expected intent, local undo and source fidelity.
  - [x] 2.4 Specify and test observed raw-file ingestion, finite stabilization/max-wait recovery, intentional empty edits versus temporary truncation, missed-event reconciliation, self-echo suppression and publication races. Record the noncooperating-writer boundary explicitly.
  - [x] 2.5 Select source-operation coordination for the demonstrated conservative scope, record resource/dependency budgets and the remaining structural-binding requirement. Reject the native adapter as wired with its counterexamples retained. Authoritative M1 and protected M0 checks pass; no full M3 or production readiness is implied.
  - [x] 2.6 Provide the executable local integration procedure: prepared clean commit containing the current target, independently pinned M0 and M1 contracts, sequential verification and source/target stability checks. Guard checks cover target movement and the actual advanced master is blocked. This is not installed branch protection; integration must follow the recorded procedure.

- [ ] 3.0 M1 implementation: one backend owner and real server authorization.
  - [ ] 3.1 Define root-instance discovery/readiness, atomic startup ownership, explicit stop/drain and executable/protocol compatibility. Exercise concurrent starts, stale records, path aliases, foreign ports and crashes.
  - [ ] 3.2 Route local app and CLI operations through the root owner, starting it on demand without a GUI. Preserve explicit root/remote selection; update any embedding API to participate in ownership rather than retaining obsolete signatures. Do not silently create a second writer or switch the CLI to the app's selected brain.
  - [ ] 3.3 Separate window-close lifetime from backend lifetime. Integrate quit, login, update replacement and save barriers; retain scoped native Keychain/folder capabilities without renderer secret access.
  - [ ] 3.4 Add separately revocable reader/writer principals and per-operation server enforcement. Specify local same-user bootstrap, VPS provisioning/rotation, legacy-key migration and safe diagnostic identity. Role downgrade must also stop existing streams.
  - [ ] 3.5 Implement an explicit protocol/API cutover with coordinated client updates and useful version-mismatch errors before mutation. Retain data/use-case parity, add root-owner/credential tests and real local CLI-without-app plus Linux-hosted CLI evidence. Intentional approved contract changes may replace structural/wire expectations with reviewed equivalent behavior assertions. Pass the applicable parity and L01/L07/L09 gates before claiming M1.
  - [ ] 3.6 Provide and test the upgrade path before a breaking release: inventory all components/roots, drain saves/streams, back up canonical Markdown/boards/configuration/recovery data, update server/app/CLI/integrations together, migrate only required operational state, reset session epochs, then verify existing notes/search and disposable-copy editing. Document one runnable command or copyable agent instruction in README, exact supported source/target versions, interrupted-upgrade retry and software/data rollback limits. Never delete unique recovery data as cache.

- [ ] 4.0 M2: shared contract and reliable live subscriptions.
  - [ ] 4.1 Define versioned command/event/error envelopes, capability negotiation, document epoch/revision versus content hash, request IDs, cancellation and per-operation retry/status semantics. HTTP/WS adapters call the same app policy.
  - [ ] 4.2 Add authenticated WebSocket RPC/subscriptions with snapshot/cursor handoff, gap recovery and bounded frames/queues. Subscribe only to needed brains/documents; enforce roles for every message, not only upgrade.
  - [ ] 4.3 Build one connection supervisor per environment with platform adapters for browser/CLI, bounded jittered reconnect, foreground health checks and separate synchronization states. Dispose old subscriptions on scope/credential changes.
  - [ ] 4.4 Publish confirmed supported writes and stable observed file changes; reconcile periodically. Replace relevant polling only after equivalent refresh/merge protection passes. Unsupported versions must fail clearly rather than silently fall back to weaker writes.
  - [ ] 4.5 Test L02/L05/L07/L08 with injected gaps, disconnects, missed events, stale same-ID brain responses, slow readers and revocation. Run the protected parity gate before enabling this stage.

- [ ] 5.0 M3: live human collaboration with truthful saving and draft recovery.
  - [ ] 5.1 Bind the selected shared model to existing editor nodes without whole-document rehydration on every remote edit. Preserve literal Markdown, custom references, task/code/table editing and unrelated bytes.
  - [ ] 5.2 Integrate scoped cursors/presence, local-only undo, selection mapping, IME, accessible status and read-only views. Remote changes must not create duplicate autosaves or erase another writer through Undo.
  - [ ] 5.3 Implement recoverable client drafts with clear storage/privacy/retention policy and visible unavailable-storage behavior. Reconnect/authenticate/resynchronize before publishing; do not silently replay offline work.
  - [ ] 5.4 Integrate durable publication batches, saved hashes, protected metadata, attention and index scheduling. Coordinate legacy PUT/PATCH with pending live edits; a valid disk hash alone must not authorize overwriting admitted work. A token/frame acknowledgement must never be shown as Saved before canonical publication.
  - [ ] 5.5 Pass L03/L06 and the entire affected baseline in two real browser contexts. Test reload/crash, disk-full/permission failure, overlapping edits and schema mismatch, plus targeted native IME/accessibility checks where affected.
  - [ ] 5.6 Selecting an older recovery record must retain any unique current body/title/uncertain state. Prove both versions remain recoverable and storage failure cannot discard the current draft.
  - [ ] 5.7 Prove actual packaged Electron can establish its gateway WebSocket and publish an edit. Keep the desktop network allowlist restricted to its gateway HTTP origin and exact paired WebSocket endpoint, with explicit denial tests for other paths/origins and URL credentials.

- [ ] 6.0 M4: agents stream into the same document model; files remain usable.
  - [ ] 6.1 Add CLI collaboration operations for opening a base revision, streaming bounded ordered chunks, status, completion and cancellation. Preserve ordinary one-shot memory commands and agent independence.
  - [ ] 6.2 Map agent edits to their read state with stable/proven anchors or equivalent transformations. Reject stale/ambiguous operations; never apply old offsets blindly or replace the whole current document for every token.
  - [ ] 6.3 Make partial streamed Markdown safe and recoverable, deduplicate chunks, bound buffers and expose generated/committed/conflicted/unconfirmed outcomes. Cancellation must not revert concurrent human edits or mislabel partial output as complete.
  - [ ] 6.4 Reconcile external file saves through the session, preserve both sides on unresolved overlaps, and correctly handle invalid IDs, rename/delete/recreate and changing files. Retain unknown attribution for raw edits.
  - [ ] 6.5 Pass L04/L05/L06 and legacy-write L09 with two typing humans, a streaming agent and raw writer. Inject duplicate chunks, disconnect-after-commit, server restart, old-client PUT/PATCH, agent death/cancel and overlapping structural edits; assert exact canonical content and retained recovery material.
  - [ ] 6.6 Bound abandoned stream lifetime, renew legitimate generation pauses, retire revoked principals, and interrupt CLI streaming with an open stdin producer. Preserve already published chunks and prove stream slots become reusable.
  - [ ] 6.7 Retain the prior saved version when an observed destructive raw-file replacement removes acknowledged content. Raw writers have no base token; do not infer their intent or resurrect deleted text automatically.

- [ ] 7.0 M5: prove the integration candidate can replace the old path.
  - [ ] 7.1 Extend the baseline corpus/gates for new supported behavior while preserving data/use-case assertions; record intentional approved breaking contract deltas separately. Supply missing Mac/Linux, supported minimum Node/runtime, real TLS/proxy/WS upgrade, unsupported-version rejection and coordinated upgrade evidence for changed surfaces.
  - [ ] 7.2 Freeze measured latency/resource limits before enabling collaboration. Exercise the declared two-human/one-agent fixture and a five-human/three-agent workload, slow client, large notes and bounded soak; report source, rates, sizes, RTT, disk and semantic-index costs.
  - [ ] 7.3 Verify the documented old-to-new coordinated upgrade and recovery from the packaged candidate with existing roots, same-ID brains and preserved drafts. Reject obsolete clients; do not build permanent legacy emulation. Rebuild derived collaboration/index state from Markdown and prevent stale sessions replaying it.
  - [ ] 7.4 Run required parity and stage checks against the actual proposed integration result. Reject missing, flaky or failed required evidence; record reused evidence only for identical relevant inputs. Do not merge because a branch once passed.
  - [ ] 7.5 Enable in explicit stages, then retire duplicate polling/writer paths only after replacement evidence passes. Document operator recovery, limits and observability without logging note contents or credentials.
  - [ ] 7.6 Update architecture/module, CLI/protocol, memory format, desktop/gateway and installation docs, reusable glossary terms and release notes for delivered behavior. Keep release checks proportional; this refactor gate does not activate the unrelated deferred scale-up release program.
  - [ ] 7.7 Record final maturity evidence and unresolved limits; finalize/archive the implementation task when its required work is actually complete. A partial M0 result leaves this roadmap active. No automatic push, merge, installation or release.
  - [ ] 7.8 Repeat the composed two-browser-context, shipped streaming CLI and raw-file writer demonstration locally and against a Linux backend. Verify the frozen old runtime's disposable roots through an extracted candidate package, including backup, interrupted retry, exact preservation and rollback recovery.

- [ ] 8.0 Resolve the Astra high review's reproduced multiplayer blockers and meet the visible-cursor UX requirement.
  - [ ] 8.1 Bind CLI positioned edits/streams to the actual read epoch/revision. Reproduce a human prefix insertion between read and edit; transform to the intended text or reject, never relabel old offsets with a fresh open revision.
  - [ ] 8.2 Correct repeated actor undo/redo for replacements, typing/backspace and interleaved other writers. Surface failed history actions visibly without misrepresenting canonical save state.
  - [ ] 8.3 Preserve granular multi-splice intent through local batching, remote rebasing and atomic publication. First/last local changes must merge with an independent middle edit, including held acknowledgements and queued snapshots.
  - [ ] 8.4 Share exact structural source mappings for local selection preservation and remote caret/ranges. Cover code fence-language ambiguity, Unicode, ordinary mixed-format text, empty paragraphs, tasks/tables/references, scroll clipping and layout changes.
  - [ ] 8.5 Version presence coordinates, transform or invalidate them on publication, reject stale epochs/gaps and expire sleeping/disconnected peers. Keep cursors visible during ordinary local typing with correct coordinate mapping.
  - [ ] 8.6 Give people stable visual identity distinct from tab/undo identity, show agent activity anchors, and expose retained external-file versions through authenticated compare/copy/reviewed restore UI.
  - [ ] 8.7 Re-run the review counterexamples and real multiplayer interaction, inspect visible cursors/selections, obtain an Astra high follow-up review, and include the resulting assertions in the final clean-HEAD gate.

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
- No production runtime source, installed app, personal/shared brain or live VPS was changed in M0. No merge, push, app installation or release was performed. Locked worktree development dependencies were installed for verification.
- 2026-11-01 scope update: the user explicitly allows breaking contracts because all current users are internal and all clients can update together. Preserve data and core behavior, version-fence obsolete clients, and provide a smooth README upgrade path (a copyable agent instruction is acceptable). Long-term V1/SDK/mixed-client compatibility is removed from the target.
- M1 design work: isolated native Lexical/Yjs and dependency-free source-operation prototypes use the actual current editor/custom nodes and a shared 12-document source corpus. The native adapter is rejected as wired with retained counterexamples; the source experiment passes its conservative leaf-edit contract. Structural live binding remains explicitly unimplemented and cannot be enabled on this result.
- Publication/reconciliation proof uses the real canonical publisher, six SIGKILL/failure boundaries, raw write/empty/delete/recreate/invalid-byte cases, and composed source-stream-to-disk recovery. M1 guard checks reject incomplete/stale/false-green evidence. No production source or root dependency manifest was changed.
- The [design decision](../../deep-dives/multiplayer-editing/M1-design-decision.md) records scope, upgrade policy, prototype budgets, independent digests and the local pre-merge procedure. Clean-source M1 execution at 42635cceb4dbcff3b715146595aabace9e333b61 passed: source 33 cases, durability 23, composition three; native comparison retains 24 passes and seven rejection counterexamples. The 20 gate and nine integration-guard checks pass.
- Protected M0 parity on the same commit passed all 1,566 tests and all four real browser smokes, with no required skips. All 438 runtime files remain byte-identical to the original baseline. Candidate M0 manifest: 311679498aa887854ba4d957e7041bd54cdfefa7445f53c0c0ccde098effeafd. M1 design report: e7f2452ff66b54bd16ea256d1a6e6fc2b945b2a249f510ae9dc9637335239a62.
- Parent integrity recheck confirmed the design's 712 recorded inputs, original frozen assertions and runtime file map after M0 rebuilt the artifact. This task adds prototypes/documentation only; root dependency manifests and production source are unchanged. The final evidence commit changes documentation only.
- At the M1-design checkpoint, integration was blocked: master had advanced to cd3db8612412bb064df88c003228037e78820002 and was not yet contained here. Its behavior had to be incorporated and verified before a merge. No merge, push, app/VPS update or release was performed. The roadmap remains active for production ownership/auth implementation and later live-editing gates.

## Relevant existing seams

- [Product intent](../../docs/product-vision.md), [source architecture](../../src/architecture.docs.md), [technical contracts](../../docs/technical.md).
- [Canonical storage](../../src/core/canonical/canonical.docs.md), [server use cases](../../src/app/server-memory/server-memory.docs.md), [runtime](../../src/runtime/runtime.docs.md).
- [Browser/editor](../../src/adapters/http-server/browser.docs.md), [HTTP adapter](../../src/adapters/http-server/http-server.docs.md), [shared protocol](../../docs/shared-memory-protocol.md).
- [Desktop](../../integrations/electron/electron.docs.md), [gateway](../../integrations/macos-companion/gateway.docs.md), [connections](../../integrations/macos-companion/connections.docs.md).
- [Release checks](../../docs/release-testing.md), [lean beta policy](../../docs/lean-beta-releases.md), [task workflow](../../docs/task-workflow.md).

### Production implementation in progress

- Master folder-explorer work was incorporated by merge f1d35b49bcc50e98ef95ccb943c1db85bd2b7f0c, containing master cd3db8612412bb064df88c003228037e78820002. Its supported file actions remain in the regression suite. The original checkout remains untouched.
- Production root ownership, persistent revocable roles, live source coordination, editor binding, private drafts, agent CLI streaming and direct-file reconciliation are implemented. A signed packaged desktop passes normal/crash/recovery lifecycle checks; root owners survive window close.
- Linux/arm64 container builds on Node22.23.4 and26.7.0 passed the selected real owner/auth/HTTP/WS/TLS/storage/upgrade suites with no skips; these are representative hosted environments, not a public VPS deployment claim.
- Real browser regressions found and fixed CRLF/caret, quick actor undo, reconnect recovery, metadata/stream continuity, credential replacement, cloned-tab actors and fresh-open boundaries. Final assertions remain mandatory; implementation alone does not complete a gate.
- The original M0 baseline and contract remain immutable. Reviewed exact old/new assertion/harness deltas will bind the approved live-transport changes, explicit single-owner serve setup and measured resource budgets. A new helper cannot silently weaken an old smoke.
- Exact integration HEAD 23261608811bffbfd0e316b3e1d078a3a0a06924 passed the protected original M0 contract with the separately pinned 15-entry reviewed delta: 1,654 tests and all four browser flows, zero failures/skips. All seven production checks passed, including both workload budgets and matching signed desktop lifecycle/diagnostics. Report SHA-256: cb0f88a112283e45a0f5274ad9a04915d2a23dcf86b66ff44a3f55ae33a30cae. This is intermediate accepted evidence, not an attestation for later changes.
- Final independent audits found required gaps before completion: abandoned stream slots and CLI signals with open stdin, preservation of prior saved bytes after destructive external replacements, a normalized-title self-conflict, and composed browser/CLI/raw-writer Linux plus extracted-package upgrade evidence. These are being fixed and added to the final required gate; the task remains active until their checks pass.
- Audit fixes on build 7a6f2d8889daf105 pass 55 lifecycle/CLI/raw-recovery checks and 10 editor checks, plus the real production editor smoke with title and private-version recovery assertions. Composed local and Linux demonstrations each pass two trials with exact runtime-byte attestation, and the extracted candidate package passes old-to-new CLI/search, same-ID root isolation, backup/retry and rollback recovery. These are preflights on the working tree; final clean-HEAD parity and the expanded ten-check production gate remain required.
- Candidate eb5c509 passed both Linux versions (95 checks each) but its full macOS suite failed the CLI/live adapter import boundary: 1,672 passes, one failure. The shared WebSocket vendor was then extracted into an independent transport adapter; CLI-to-live-policy imports remain forbidden. Build 51c58806b920f710 passes 72 focused lifecycle and architecture checks.
- The added actual Electron input/accessibility proof found a desktop runtime defect missed by browser/gateway fixtures: the window's HTTP-origin-only network filter cancelled its matching WebSocket endpoint. The fix must keep a narrow paired-endpoint allowlist, pass explicit denial cases, and demonstrate real native-shell live publication before the final gate can pass.
- The user requested Astra at high reasoning effort to challenge architectural assumptions and test intuitive multiplayer with visible peer cursors. Its read-only review reproduced six P1s (CLI read-base loss, repeated undo, code selection mapping, coarse-diff conflicts, missing basic cursor coverage and unversioned presence) plus cursor lifetime/geometry, hidden raw recovery and identity/agent-awareness gaps. These are required fixes, not accepted limitations; earlier counts and prototype convergence do not establish smooth collaboration. Evidence: `.local-pack/astra-review/REVIEW.md` and retained executable probes.
- Astra fixes on coordinated build 5668a351512fe162 pass 98 affected kernel checks, 16 frontend/map checks, the full real two-context editor/cursor proof, all 11 shipped retained-version scenarios, formatting/lifecycle/external-file preflights and actual packaged Electron IME/accessibility. Additional integration checks pass 101 browser-shell/package/architecture assertions and 22 guidance checks. No counts are combined across overlapping suites. These remain preflights until the clean-HEAD gate and follow-up review pass.
- The final production contract requires twelve checks and independently pins 36 scenario assertion files, protecting new regressions against deletion/weakening as well as in-run drift. Original M0 remains immutable with a separately reviewed 15-entry delta; the new source-map/cursor/recovery payload costs 6.5 KB gzip with unchanged dependencies and a documented 220 KB editor ceiling. Canonical latency, RSS, queue/history and package limits remain enforced.
