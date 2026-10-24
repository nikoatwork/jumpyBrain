# Extension contract clarity and lifecycle isolation

## Goal

Resolve concrete review findings while keeping the public API small and host-independent. Preserve existing v1 consumers; add capabilities only when a real extension needs them. See the [completed review](../done/2026-10-24_tasks-extension-examples-contract-review.md).

## Tasks

- [ ] P2: Stop observational callbacks from retaining a brain-switch/quit admission for their entire handler lifetime.
  - Evidence: `integrations/macos-companion/extensions-gateway.mjs:scopeChanged()` holds coordinator admission while awaiting sequential `host.emit()` callbacks in `src/app/extensions/index.ts`. Independent reviewer reproduced `save_timeout` with zero registered tabs and a slow handler using scaled deadlines.
  - Cancel/fence observations on transition while draining actual admitted memory work; do not weaken canonical save barriers or permit writes in events. Bound total notification work, not only each individual handler.
  - Acceptance: slow/never-settling observers cannot exhaust guarded switch/quit with clean tabs; admitted writes still drain, old scopes fail and notifications remain once per generation.
- [ ] P2: Expose stable, discoverable write outcomes through the SDK.
  - Evidence: `ExtensionMemory.create/update` return `Promise<Json>` in `src/extensions/index.ts`; the author guide refers to saved/indexed outcomes that cannot be discovered from types. Preserve current runtime packets and backwards compatibility while defining minimal result types for confirmed save, unchanged update, and indexing partial success.
  - Add one author example that checks a confirmed save/indexing failure and never retries an uncertain creation with a new key. Keep transport-specific canonical paths/credentials out of the public contract.
- [ ] P2: Provide bounded local compilation diagnostics.
  - Evidence: `src/adapters/extensions/prepare.ts` wraps esbuild failures with a generic message, `registry.ts` stores a generic preparation error and the CLI prints the outer error. A syntax error supplies no file/line/actionable reason to an author.
  - Expose bounded file/line diagnostics through explicit local CLI author tooling; retain sanitized browser snapshots and avoid leaking paths through ordinary remote responses.
  - Acceptance: a malformed TS entry and missing local dependency yield useful locations/reasons without running package code or exposing secrets/source text in UI descriptors.
- [ ] P3: Make the accepted theme-role vocabulary discoverable from public types/docs.
  - Evidence: `ExtensionTheme.colors` is `Record<string,string>` while `src/app/extensions/index.ts` owns a private allowlist. Example authors currently copy names from another package or encounter generic activation failure.
  - Prefer one host-independent role list/union consumed by validation and docs over duplicated palettes/validators; retain all accepted v1 roles and optional `--` prefixes.
- [ ] P3: Define compatibility negotiation before adding newer-host-only APIs.
  - Evidence: manifest `apiVersion` is the only author-visible gate; a running custom/older Desktop and independently upgraded CLI can differ. The frozen-v1 tests verify old consumer → candidate host, not every mixed-host management protocol.
  - Keep v1 additions optional and feature-detectable; document unknown-field behavior and add a mixed-host test when changing management envelopes. Avoid a second general-purpose version-range framework without a concrete need.

## Placement decision

Candy Pink and Pomodoro both work through v1 without changing the host. Pomodoro uses `sidebar.actions` plus a panel. Persistent sidebar widgets/top-right detail mounts are not supported; defer a new slot until its visibility, document/scope lifetime and cleanup contract are designed. Never target private shell DOM as a workaround.
