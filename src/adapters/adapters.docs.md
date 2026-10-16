# Adapters docs

## Responsibilities

- Group replaceable infrastructure integrations behind small barrels consumed by app/runtime composition.
- Keep adapter-specific implementation details out of core/domain modules and CLI command parsing.
- Provide stable seams for backend and host integrations such as QMD indexing/search, HTTP client/server protocol code, logging, and package metadata.

## Non-responsibilities

- Do not own canonical Markdown memory semantics or user-facing CLI command behavior.
- Do not import CLI command parsing; protocol adapters may call app/runtime seams but should not own core Markdown semantics.
- Do not make `src/core/index.ts` depend on adapter internals.
