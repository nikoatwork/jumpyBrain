# Multiplayer editing: architecture and verification proposal

Status: historical architecture proposal from 2026-11-01. The [completed task](../../tasks/done/2026-11-02_tasks-multiplayer-editing-architecture.md), [operating guide](../../docs/collaboration.md) and [production verification](production-verification.md) record the delivered implementation and automated maturity evidence. Planning-seed behavior below is historical.

## Outcome and agreed scope

Humans and agents edit the same Markdown note live, using one backend on the machine that owns the brain. A personal Mac runs that backend locally; a shared VPS runs the same engine for several people and agents. No mandatory remote service or account is needed for personal use.

The user selected:

- Live simultaneous editing, rather than notifications only after saves.
- Agent edits streamed into the note as generated, rather than waiting for a complete patch.
- A recoverable local draft during disconnection; reconnect before publishing.
- Individually revocable reader/writer credentials on the VPS, without per-note permissions.
- One on-demand backend per local brain, usable by the CLI without opening the app. Closing a window keeps the service available.
- Coordinated upgrades of all internal clients are acceptable. Breaking CLI/API/integration changes are allowed with a smooth README upgrade procedure; permanent legacy/mixed-version support is not required.

Direct Markdown writes are a required compatibility case from the user's local app/agent workflow. Filesystem access cannot be made safe by declaring it unsupported. The proposed policy is to ingest observed external changes, merge when the evidence supports it, and preserve conflicting versions for deliberate recovery. Arbitrary overlapping raw writes cannot have the same guarantees as operations participating in the backend protocol.

## Current behavior to preserve

The planning reference is commit 3a63c37715ca277c546e43c0aaf808ecd5663246. It is a seed for measurement, not a claim that all behavior has passed verification. The [behavior inventory](current-behavior-inventory.md) maps existing contracts to evidence.

Today, local CLI calls shared runtime/app operations directly. The desktop renderer uses the browser HTTP API through a local gateway; hosted CLI uses HTTP to the same app on a server-local root. Canonical replacement has hash preconditions and cooperating publication locks.

The browser already refreshes external saves by polling and performs conservative three-way merging for independent edits. It preserves drafts on overlaps and failed/unconfirmed writes, fences old responses by document/brain/credential generation, and protects navigation and brain switching with save barriers. Replacing polling must retain those behaviors.

Existing limits matter: a noncooperating filesystem writer can race final publication; browser drafts do not currently survive every reload/crash; declared actors are not authenticated identities; all accepted server API keys currently have the same server authority. Those limits are not evidence that multiplayer, durable draft recovery, or reader/writer authorization already works.

## What to borrow from T3

Inspect the pinned T3 source, not an evolving description of its latest branch:

- [Ownership boundary](https://github.com/pingdotgg/t3code/blob/82b10d546c1041d8eff40425f076d61f608d518f/docs/internals/overview.md): execution and files stay with the environment's server; desktop follows the remote-ready boundary.
- [Connection ownership](https://github.com/pingdotgg/t3code/blob/82b10d546c1041d8eff40425f076d61f608d518f/docs/internals/connection-runtime.md): one connection supervisor per environment, shared connection state, explicit synchronization, and operation-owned mutation retries.
- [RPC contract](https://github.com/pingdotgg/t3code/blob/82b10d546c1041d8eff40425f076d61f608d518f/packages/contracts/src/rpc.ts) and [client transport](https://github.com/pingdotgg/t3code/blob/82b10d546c1041d8eff40425f076d61f608d518f/packages/client-runtime/src/rpc/session.ts): versioned typed requests and scoped subscriptions.

T3's agent-facing [HTTP MCP server](https://github.com/pingdotgg/t3code/blob/82b10d546c1041d8eff40425f076d61f608d518f/apps/server/src/mcp/McpHttpServer.ts) is a separate interface. Adding MCP is not a prerequisite for this work.

Borrow boundaries, lifecycle, and explicit contracts. T3's canonical orchestration event log is not jumpyBrain's storage model. Do not turn Markdown into an export from a hidden authoritative database, adopt T3's full orchestration machinery, or require Effect merely to use RPC.

## Proposed ownership and data flow

    Human desktop/browser client        Agent through supported CLI
          |                                      |
          +---- shared command / subscription contract ----+
                                                          |
                                     root-owning backend
                                     - authentication and roles
                                     - document sessions / revisions
                                     - streaming edit admission
                                     - canonical publication
                                     - external-file reconciliation
                                     - derived-index maintenance
                                                          |
                                      canonical Markdown on disk
                                                          ^
                                                          |
                                      external editors / raw agents

HTTP and WebSocket are adapters over the same app operations. The internal beta may cut over protocols and update all clients together. Preserve data/use-case behavior, version-fence unsupported clients, and provide the tested README upgrade path before shipping the break. Use authenticated WebSocket RPC for commands/subscriptions where live interaction needs it; one-shot CLI operations may use HTTP against the same backend. Neither transport owns domain policy.

Every supported writer, including any retained whole-document or metadata operation, must enter the same coordinator. A current disk hash does not prove there are no admitted unpublished edits. Reconcile/transform safely or reject while preserving pending content. Obsolete clients may be rejected outright; maintaining their old endpoints is not required. No supported path may write beneath the live model and be overwritten on the next flush.

- Core keeps canonical parsing, identity, protected metadata, source/version semantics, and guarded publication rules.
- App owns document-session policy, operation admission, merge/reconciliation decisions, and publication/index coordination.
- Adapters own WebSocket/HTTP framing, filesystem observation, credential persistence, and connection details.
- A shared client runtime owns connection and subscription lifetime. Browser/editor code and CLI consume it through appropriate platform adapters.
- The backend owns no model provider. Agent generation stays in the user's agent; jumpyBrain receives intended document edits, not private reasoning or raw provider traffic.

Final module names and dependency choices require the M0 inventory and M1 prototypes. Extend source-boundary tests when introducing them; do not move protocols or host discovery into core.

## One service per brain

Use the canonical real root as service identity, not only a configured path, URL, or PID. App and CLI discover or start one authenticated instance. Bind readiness to root identity, instance nonce, supported protocol, and executable/artifact identity. A busy port is not proof of ownership.

Specify simultaneous starts, symlink/path aliases, stale registrations, incompatible installed app/CLI versions, service crash/restart, explicit stop, OS login, window close, and app quit. An explicit host stop must drain or reject pending work and leave draft recovery available. Window close is not service shutdown.

The service must be independently launchable so CLI use needs no Electron window, GUI login, or Keychain dialog. An explicit embedding API may change with the coordinated update; it must participate in or fail clearly against an active root owner rather than quietly become a second live writer.

One owner coordinates cooperating application writers. Files remain writable to their filesystem owner. Raw changes and older tools are external inputs, not proof that single-writer coordination has been achieved. Multi-server active/active access to one root and cross-machine filesystem sync are out of scope.

## Markdown durability and collaboration state

Use three distinct states:

1. A client's recoverable draft or speculative edit.
2. A backend-admitted edit in the current document session.
3. A confirmed revision published as canonical Markdown.

Only the third is Saved. Broadcast or acknowledgement of a live edit must not imply disk durability. Prefer small durable publication batches that still feel live. If a prototype broadcasts speculative changes earlier, label them as provisional, preserve them on failure, and prove recovery before enabling that behavior.

Canonical read/hash/expand and retrieval provenance refer to published Markdown, never an unpublished collaboration buffer. Search indexing is separate and may lag; existing pending/failed/readiness outcomes remain explicit. Do not index every agent token or run embedding inference on the socket event loop.

Preserve the existing local/hosted retrieval distinction when both use a backend: ordinary local recall can repair derived state, hosted observational reads remain nonrepairing, and explicit strict read-only retrieval performs no derived writes. A shared transport must not erase those policies or let an untrusted remote caller claim local privileges.

Collaboration state may retain efficient operation identities while a session exists. It must be dispensable for recovering all Saved content. On restart or lost/stale state, rebuild from Markdown, advance a document epoch, and force stale clients to resynchronize. Never replay an old binary session over newer files.

Recoverable unsaved drafts and conflict copies contain unique user content. They are recovery data, not rebuildable caches. Store them explicitly and privately; provide inspect/export/clear behavior and retention bounds. They must not silently become a second canonical note or enter recall. Do not promise recovery after storage denial, quota exhaustion, or an unobserved raw overwrite.

If a selected collaboration algorithm requires its binary history to be the sole durable content source, it fails this architecture gate. A journal proposal must identify exactly what it stores and prove no Saved content depends solely on it.

## Collaboration algorithm decision

WebSocket does not supply merging. Prototype at least:

- A Lexical collaboration binding with a server-side document model and granular agent operations.
- A source-oriented shared-text/operation model with a lossless binding to our current editor.

Compare existing supported Markdown, unsupported/literal syntax, custom nodes, protected frontmatter, titles, local undo, selection/IME, direct-file ingestion, late agent edits, session rebuild, package/runtime cost, and dependency stability. A plain textarea demo does not establish parity for the current editor.

[Lexical's current collaboration documentation](https://lexicaljs.org/docs/collaboration/y) distinguishes the experimental Yjs 14 binding from the Yjs 13 integration; it also identifies structural merge limits. The repository currently pins Lexical 0.51.0. Verify exact compatible releases and APIs in the prototype rather than copying current nightly examples or assuming all bindings are interchangeable.

[Yjs document updates](https://docs.yjs.dev/api/document-updates) provide mergeable update/state-vector mechanisms. [Its WebSocket provider](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket) separates transport, document synchronization, and awareness. Neither establishes Markdown durability, authorization, preservation of user intent, or compatibility with our source-preserving editor.

Convergence alone is insufficient: two clients agreeing after losing one writer's intended change is a failure where the contract requires preservation. Conflicting structural replacement/delete/move cases need deterministic documented semantics and an explicit recovery path.

## Human and streaming agent edits

An agent starts against a named brain, document identity, epoch, and base revision. Incremental chunks address the document state the agent read through stable ranges/anchors or an equivalent proven mapping. Never apply offsets from an old read directly to the latest document or match an ambiguous repeated phrase arbitrarily.

Define start, append/replace-range, completion, cancellation, and status outcomes before CLI syntax. Include stream ID, monotonic chunk sequence, operation ID, base/epoch checks, byte limits, and committed revision/hash receipts. Duplicate delivery of a chunk must not duplicate its text.

Streaming must:

- Remain visible while humans edit the same note; batch network/disk work without waiting for the complete generated response.
- Preserve incomplete Markdown as literal recoverable source; partial fences/references must not erase text or execute content.
- Keep protected frontmatter and independent metadata operations outside arbitrary token streams.
- Preserve concurrent human work during agent cancel, failure, restart, undo, or range replacement. Cancellation stops future generation; it does not imply rolling back every published chunk.
- Distinguish generated, received, published, conflicted, and unconfirmed output. A dropped connection after commit requires status/resynchronization, not blind replay.
- Reject or expose ambiguous stale edits. Defined conflicts are acceptable; silently retargeted edits are not.

Agent and human presence is ephemeral. Authenticated principal identity, declared contribution metadata, and session/cursor identity remain separate. Raw-file edits do not inherit the last authenticated agent's name.

## Direct-file reconciliation

Filesystem observation is a latency hint. Reconciliation against current bytes and periodic rescans recover missed events; handle atomic-save rename, in-place/partial writes, delete/recreate, missed events, sleep, and restart.

Specify a finite stabilization window, maximum wait and recovery action; quiet bytes are an observation, not proof that a writer has finished. Test intentional empty bodies/files separately from truncate-then-write and a writer paused between chunks. Do not wait indefinitely, discard an intentional empty edit, or publish a temporary truncation as final without the stated recovery policy.

Keep the last canonical base, latest observed stable file snapshot, and pending live changes distinct. Suppress self-echo using revision/hash/identity evidence, not a time window alone. Detect stable external edits before overwriting; merge unambiguous independent changes through the shared session and guarded publisher.

For overlapping edits, missing bases, invalid/duplicate identities, changing files, or unsupported syntax, preserve the observed external bytes plus pending client work, pause the affected publication, and offer scoped recovery. An empty/transient partial file must not be eagerly broadcast as an intentional delete.

An uncooperative writer can race any final check and overwrite another raw writer before observation. There is no portable filesystem compare-and-swap guarantee here. Document that boundary and test detectable races; do not advertise universal lossless raw-write merging. The fully coordinated path is CLI/backend operations.

## Connection, authorization, and failure semantics

- One reconnect owner per brain/environment. Subscription disposal, pagehide, hidden views, explicit removal, credential change, and brain switching cancel old lifetimes.
- Socket open, snapshot synchronized, write authorized, and Markdown saved are distinct states.
- Use a bounded snapshot plus ordered cursor/epoch protocol. A gap or expired cursor forces a fresh snapshot and draft reconciliation. Opening/subscribing cannot leave a gap between snapshot and stream.
- Drop stale-scope events. Same note IDs on different brains must not share subscriptions, draft keys, receipts, or awareness.
- Bound frame size, queues, subscribers, streams, document work, and retained session history. Slow readers resynchronize or disconnect; never grow an unbounded queue.
- Reconnect does not automatically repeat mutations. Define retry/status behavior per operation and the limits of receipt retention after crashes.
- Offline edits remain local recovery drafts. Reconnect, authenticate, fetch current state, and reconcile before publishing. No hidden offline CRDT queue may bypass this policy.
- Server-issued reader/writer credentials are independently revocable and enforced for every HTTP method, RPC command, subscription, and live editing frame. Read-only UI controls alone are insufficient.
- Revocation/role downgrade fences already-open sockets and in-flight streams. Browser authentication must not put long-lived secrets in URLs or persist server keys in renderer storage; retain gateway/native credential boundaries.
- Version admission covers transport, command schemas, editor nodes and collaboration layouts. Obsolete clients receive update guidance before mutation; no permanent old-protocol fallback is required. Never silently downgrade a collaborative write to an unconditional replacement.

No per-note ACL system, full account/billing product, hosted provider, or automatic team-memory write authorization is included.

Credential records are separately durable operational configuration, not derived content or searchable memory. Recovery that deletes collaboration/index caches must not silently delete access policy, board JSON, root configuration, or unsaved recovery material.

## Verifiable maturity

Maturity is a set of passed scenario IDs for an exact source/artifact/environment, not a completion percentage. A level is not earned by writing a module or connecting two sockets.

| Level | Observable state required |
| --- | --- |
| M0: reproducible baseline | Frozen existing-behavior contract and protected assertions run on an exact artifact; failed/missing/skipped evidence is visible; verifier rejects weakened or corrupted baselines. |
| M1: shared ownership | App/CLI discover one root owner, start without a window, preserve HTTP/CLI compatibility, and enforce separate reader/writer credentials. |
| M2: reliable live state | Authenticated scoped subscriptions cover supported writes and observed file changes; snapshots, gaps, reconnect, revocation, and slow consumers behave correctly. Save-notification support alone ends here. |
| M3: human collaboration | Two real editors type concurrently, retain expected changes and source fidelity, and have correct local undo/selection/draft recovery and Markdown durability. |
| M4: agent/file collaboration | Streaming agent edits coexist with humans and direct files; chunks, cancel/retry, stale bases, overlap recovery, and attribution satisfy the same shared contract. |
| M5: rollout readiness | Mac and representative Linux/TLS evidence, coordinated upgrades/version fencing, bounded resources, fault recovery, rollback, and repeated end-to-end scenarios pass on the integration candidate. |

The first implementation gate is M0 only. M1 algorithm/ownership prototypes must pass before broad source movement. Ship readiness requires M5; partial stages must not be presented as finished multiplayer.

## Merge rule and evidence

The initial multiplayer rollout required the protected M0 suite plus the new level's applicable scenarios on the actual proposed integration result. This historical rollout gate is not the default for subsequent feature commits; use [current focused test selection](../../docs/testing.md). Passing a feature branch before another change lands is insufficient when the affected inputs differ.

Freeze the behavioral contract, input corpus, expected canonical results, assertion sources, tool versions, and baseline artifact manifest. Classify implementation-shape assertions separately: a reviewed refactor may replace them with equivalent boundary/behavior checks in a new contract version. Preserve the old contract and the explicit coverage mapping; do not make permanent source-file immutability a substitute for semantic parity. Additive candidate tests are allowed. Normalize only declared nondeterminism such as disposable absolute roots and generated IDs mapped consistently. Never normalize content, missing operations, error outcomes, or permission failures away.

Record source and merge-base commits, tree/artifact digests, baseline/contract/harness digests, environment, scenario results, logs, failures, skips, and untested limits. Reject missing cases and empty success reports. Baseline assertion changes require a separately reviewed contract update with a reason; candidate runs cannot regenerate expectations to accept their own output.

Use real browser/server/CLI/file assertions in addition to deterministic tests. Include negative controls demonstrating lost text, stale overwrite, duplicate chunks, missing checks, and baseline tampering fail. Screenshots supplement assertions; they do not establish durability or convergence.

M0 can freeze a reproducible automated subset with explicit gaps. It must not claim all deployment/platform behavior was reproduced. Later stages cannot enable a changed behavior until its missing evidence is supplied. Existing known defects must be recorded, not blessed as required behavior.

Small staged merges are allowed only with affected parity green and unfinished paths disabled or inaccessible. Do not remove the old guarded path before the replacement's gate passes. An authorized future integration still requires testing; this plan does not authorize a merge, deployment, installation, or release.

## Provisional resource and scale envelope

M0 measures existing cold/warm command latency, editor bundle bytes, idle/active memory, lookup cost, and baseline suite duration where available. Do not invent measured numbers.

The proposed initial concurrency fixture is two human editors plus one streaming agent on one note, then five humans plus three agents across several notes with a reader and one deliberately slow client. Use a stated corpus, note sizes, chunk rate, disk and network profile.

Before M3 implementation, turn those fixtures into numeric limits for remote-visible edit latency, canonical flush latency, reconnect, memory, retained history, CPU, and index backlog, based on M1 prototypes. Proposed targets are p95 remote visibility within 250 ms on loopback and within 750 ms with injected 100 ms RTT, and canonical acknowledgement within 1 s under the declared normal workload. These are design targets, not current measurements; adjust explicitly before freezing the gate. Throughput targets must include streaming publication cost and semantic maintenance separately.

Preserve the actual frozen bundle/package budgets until a justified dependency-size change is reviewed; do not rely on stale prose estimates. Resource-limit tests and a bounded soak must demonstrate cleanup after clients/agents leave. No claim of internet-wide scale, active/active hosting, or real collaborative IME/accessibility support follows from a Chromium loopback fixture.
