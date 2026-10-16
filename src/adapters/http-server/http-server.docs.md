# HTTP server adapter docs

## Responsibilities

- Own server lifecycle, authentication, request decoding, response encoding, safe error mapping, and the content-free nonce-protected browser shell.
- Generate/validate bounded `X-JumpyBrain-Request` correlation and carry it through async request context. Mirror safe operation/status/duration/code/index-outcome facts to schema diagnostics under `.jumpybrain/logs/diagnostics`. Default persistence is bounded; a custom logger preserves the no-filesystem-write embedding contract unless an explicit store opts in. No public server diagnostics/log route is added. Shutdown drains owned app work and performs bounded diagnostic/text-log flushing.
- Keep routes thin: delegate memory behavior to [server-memory use cases](../../app/server-memory/server-memory.docs.md); share route literals with the HTTP client through `http-protocol.ts`.
- Discriminate JSON parser errors by internal class; untrusted `statusCode`/`body` fields must never become responses or logged error codes.
- Follow the [public protocol](../../../docs/shared-memory-protocol.md) for schemas, auth, CSP, compatibility, and errors; follow the [browser contract](browser.docs.md) for editor/map/companion state and verification.

## Non-responsibilities

- Do not own canonical publication/frontmatter policy, app workflows, CLI parsing, or QMD internals.
- Do not run model providers or turn browser dream instructions into server permissions.

## Companion-only browser contract

See the [owned browser contract](browser.docs.md#companion-only-browser-contract). Ordinary hosted servers do not enable companion controls.

## Index protocol boundary

See the [protocol reference](../../../docs/shared-memory-protocol.md#index-stale-state).

## Execution lifecycle

See the [protocol reference](../../../docs/shared-memory-protocol.md#backend-execution-limits).

## Strict read-only retrieval

See the [protocol reference](../../../docs/shared-memory-protocol.md#creation-outcomes-and-strict-observational-reads).

## Bounded retrieval protocol

See the [protocol reference](../../../docs/shared-memory-protocol.md#post-memoriesallrecallcompact).

## Temporal retrieval protocol

See the [protocol reference](../../../docs/shared-memory-protocol.md#temporal-retrieval-options).
