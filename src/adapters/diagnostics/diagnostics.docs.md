# Diagnostics adapter

## Responsibilities

- `events.ts` is browser-safe schema v1: finite component/operation/code vocabularies, bounded numeric facts, canonical timestamps and opaque correlation. Unknown content is discarded, including messages/stacks/paths and nested objects. Error locations identify only the known shell/bundle and numeric line/column.
- `store.ts` persists only schema events in a private, owned directory: bounded queue, seven-day retention, ten 1 MiB segments, continuous rotation, no-follow file access, bounded reads and shutdown flush. Only its own segment names are cleaned up. Storage failure is reported separately; it never fails application operations.
- Event buffers prioritize failures over repetitive successful polls. Support export remaps session/request identifiers to report-local references. Logs are disposable infrastructure, never canonical memory.
- Stores coalesce matching healthy poll/status/document-read events within thirty seconds and expose the process-local count; failures, unconfirmed outcomes and writes are never sampled. The fixture-volume check retains every failure/write while reducing 100 identical healthy reads to one event per sampling interval. Ten MiB is an aggregate ceiling, not a promise of seven days under every workload.
- A server supplied with a custom logger defaults to memory-only diagnostics, preserving observational/no-filesystem embedding contracts. An explicit `diagnostics` store can opt into persistence separately. Default served/companion servers persist events.

## Non-responsibilities

- No telemetry, mail delivery, arbitrary filesystem/log export, provider calls, HTTP authentication, or memory/index policy.
- Raw legacy server/native logs are not support export sources. OS crash dumps and arbitrary exception text remain excluded.
