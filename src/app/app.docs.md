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

## Note attention

`attention.ts` owns shared bounded canonical list and hash-guarded attention mutations. Local runtime and hosted facades reuse it; server bookkeeping stays in server-memory. Valid creator declarations remain distinct from unknown provenance. This does not track reading or approval.

Attention metadata carries an optional opaque SHA-256 stat-generation token, accepted only when pre/post-read device/inode/size/nanosecond times agree. It is a preview invalidation hint, never a canonical content hash or snapshot guarantee; missing/unstable versions force ordinary refresh.

## Optional semantic setup

`semantic-setup.ts` exposes explicit device-local provisioning separately from indexing and observational lexical/ready/unavailable/incomplete/failed state. Shared status composes that state without downloading or inferring. Markdown writes and selected-root indexing retain their existing owners; no brain registry, default semantic switch or daemon warming is introduced.
