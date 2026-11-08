# App module docs

## Responsibilities

- Compose core domain policy with host filesystem/runtime seams into user-facing use cases.
- Own local and server-side memory workflows that are not pure domain rules, including writing canonical Markdown files, local index/search orchestration, deterministic processing, shared local/remote dream state workflows, and server-memory state/idempotency use cases.
- `creation.ts` composes post-publication saved outcomes with nonpersisting local indexing and saved-ID/scope verification; writing and local-memory modules remain independent. It calls approved core/QMD barrel seams under the existing operation budget, never retries canonical creation.
- Provide stable seams for runtime, CLI transports, server boundaries, and protocol adapters to call without reaching into lower-level policy modules.
- `diagnostics/` composes explicit host snapshot sources with a finite deadline and schema sanitization; it never selects arbitrary filesystem paths or reads/writes canonical memory.

## Non-responsibilities

- Do not parse CLI flags or format command output.
- Do not implement HTTP request routing, authentication, or HTTP status-code selection.
- Do not contain QMD adapter internals; app local-memory and processing modules may call the QMD adapter barrel as a replaceable backend seam.

## Private backend operation agreement

[`adapters/backend-protocol.ts`](../adapters/backend-protocol.ts) owns all private
method names, typed positional arguments/results and admission/signal/deadline/guard
metadata. `backend-rpc.ts` supplies an exhaustive compiler-checked use-case binding;
its one tuple assertion is the untrusted JSON boundary, not a runtime schema.
The protocol imports only erased core/domain types, never app implementations.
The host supplies the
root and request AbortSignal; neither is selected by serialized caller options.
The CLI sends JSON arguments without a root and never automatically retries a
dispatched mutation. A missing reply can follow a successful canonical save.
This is a private coordinated-version interface, not a new public remote API.

| Selected operation | Positional arguments after host root | Outcome / admission |
| --- | --- | --- |
| `readMemoryDocument` | `[id]` | Exact canonical content and hash; no canonical queue. |
| `updateMemoryDocument` | `[id, content, {ifMatch or contentHash, ...}]` | Old/new hash, updated metadata, indexed state; canonical queue and live pre-write/publication hooks. |
| `patchMemoryDocumentAttention` | `[id, {ifMatch, mutation}]` | Full document packet plus old/new hashes and pending indexing, without an ordinary update timestamp; canonical hooks. |
| `deleteMemoryDocument` | `[id, {ifMatch, apply:true}]` | Guarded removal; canonical hooks. |
| `rememberMemory`, `writeSessionWrapup` | `[draft]` | Saved identity independent of indexing; canonical queue. |
| `saveBoard`, `deleteBoard` | `[board, ifMatch?]`, `[id, ifMatch]` | Canonical JSON hash/publication or removal; canonical queue. |
| `indexMemory`, `ensureSavedMemoryIndexed` | `[options?]`, `[saved, options?]` | Derived work has its own admission, outside the canonical queue. |
| `searchMemory`, `compactSearchMemory` | `[query, limit, options?]` | Host signal inserted at options slot 2; no canonical queue. |
| `overviewMemory`, `processMemory` | `[options]` | Host signal at slot 0; process remains conservatively serialized, including preview. |

The protocol table describes every supported signature; app bindings adapt root
and package-version ownership, migrations and dream object calls. The CLI reads
index preflight/deadline metadata and omits trailing undefined arguments. The HTTP
host reads admission and guarded-document preconditions from the same agreement;
legacy third-slot hash precedence remains compatible even with extra arguments.
Process stays conservatively canonical, including preview; derived work never
acquires the typing queue. Adding an operation requires its typed descriptor and
a matching app binding, rather than separate host/caller method lists. Unknown
methods fail `method_not_found`; a non-array or more than eight arguments fails
`invalid_request`. This outer bound is not a complete argument schema: domain
owners validate their inputs. Pending cancellation before dispatch fails
`execution_aborted`; cancellation after publication must not erase a saved
identity. Hash failures retain canonical bytes. The current host maps private
operation errors to HTTP 400 with their domain code; public routes have their own
status mapping. `test/backend-rpc-contracts.test.js` exercises the real caller and
owner, and `test/creation-outcomes.test.js` protects save/index/cancellation
outcomes. `test/backend-operation-agreement.test.js` adds compile-time negative
controls, all three guarded mutations, option serialization, host signal replacement
and private HTTP-to-live publication checks. These remain private contracts; the
public runtime surface does not export the owner protocol.

## Note attention

`attention.ts` owns shared bounded canonical list and hash-guarded attention mutations. Local runtime and hosted facades reuse it; server bookkeeping stays in server-memory. Valid creator declarations remain distinct from unknown provenance. This does not track reading or approval.

Attention metadata carries an optional opaque SHA-256 stat-generation token, accepted only when pre/post-read device/inode/size/nanosecond times agree. It is a preview invalidation hint, never a canonical content hash or snapshot guarantee; missing/unstable versions force ordinary refresh.

## Optional semantic setup

`semantic-setup.ts` exposes explicit device-local provisioning separately from indexing and observational lexical/ready/unavailable/incomplete/failed state. Shared status composes that state without downloading or inferring. Markdown writes and selected-root indexing retain their existing owners; no brain registry, default semantic switch or daemon warming is introduced.
