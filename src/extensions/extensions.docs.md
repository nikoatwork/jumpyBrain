# Public extension contracts

## Responsibilities

- Define host-independent TypeScript contracts for explicitly installed, trusted executable extensions, including commands, lifecycle events, UI contributions and bounded scoped memory operations.
- Keep `index.ts` safe to import without loading a desktop host, compiler, CLI parser, Node infrastructure or memory engine.
- Preserve the frozen v1 consumer in `scripts/fixtures/extensions-v1/` across package upgrades; additive API changes must retain its type/runtime behavior. Breaking contracts need a new API version plus a retained v1 path/migration plan. See `docs/extensions.md` and the release gates.
- Expose version 1 of the extension API separately from the normal local-memory runtime. Registration and renderer mounting/disposal are distinct lifetimes.

`ExtensionCreateResult` exposes confirmed save and separate indexing status; `ExtensionUpdateResult` exposes hash, indexed and optional unchanged outcomes without requiring transport paths. Both remain JSON-compatible. `EXTENSION_THEME_ROLES` and `ExtensionThemeRole` are the single semantic role vocabulary consumed by host and renderer. API v1 additions remain optional/feature-detected; requests/manifests reject unknown fields, while responses permit additive fields. See the author guide for mixed-host limits.


## Non-responsibilities

- Do not load packages, select a brain, authorize writes, execute commands or render UI here.
- Do not imply capability declarations sandbox trusted same-process code. Core canonical policy and target authorization remain in their existing owners.
