# Source architecture docs

Status: adopted as the source-module documentation convention.

## Module docs convention

- Put durable, local module knowledge in a co-located `*docs.md` file inside the module directory.
- Prefer `*docs.md` files over per-module `README.md` files so package/user README files remain reserved for entry-level documentation.
- Keep each module doc short and include `## Responsibilities` and `## Non-responsibilities` sections.
- Update module docs when a boundary, dependency direction, or reusable implementation pattern changes.

## Target dependency direction

The intended source layers flow downward from entrypoints and protocols into app use cases, core domain concepts, and replaceable adapters:

```text
package entrypoint
  -> runtime/app surface

CLI boundary
  -> small executable shim plus CLI command/recipe modules
  -> app/runtime seams
  -> remote HTTP client adapter
  -> public server boundary for the opt-in `serve` bootstrap
  -> CLI-only formatting/target selection, doctor reporting, and usage text

server boundary
  -> app/server-memory seams over a server-local memory root
  -> HTTP server adapter for protocol/auth support
  -> host package metadata injection

runtime/app surface
  -> app use-case seams for writing, local memory index/search, and processing
  -> core canonical Markdown/memory-root/writing/retrieval-policy concepts
  -> host package metadata injection

app use cases
  -> core domain policy plus approved adapters such as QMD for local index/search and processing support
  -> server-memory status/index/search/write/idempotency/auto-index workflows for protocol adapters

core/domain
  -> backend-agnostic core submodules for canonical Markdown memory semantics,
     memory-root setup/status, provenance, pure write policy, retrieval-depth policy,
     and shared public types

adapters/infrastructure
  -> QMD, HTTP client/server protocol details, logging, package metadata,
     and other replaceable host concerns
```

Core must not import CLI, server protocol code, HTTP clients, logging/package metadata adapters, app workflows, or QMD internals. CLI command parsing should call app seams rather than QMD internals directly, and the executable `src/cli.ts` should remain a shim over `src/cli/` command modules. Server protocol code lives under `src/adapters/http-server/`, should call app/server-memory seams, and must not import CLI command parsing. Legacy compatibility source directories were removed after the layered layout stabilized; use core submodules for pure domain concepts and app submodules for workflows.

## Graph ownership chain

Graph behavior follows the layer direction:

```text
core canonical link extraction, normalization, lookup, and target resolution
  -> app/local-memory graph assembly and local overview connection summaries
  -> runtime graphMemory public local API
  -> app/server-memory remote-safe graph packet
  -> HTTP server graph shell and JSON protocol routes
```

Core owns link semantics but not graph presentation. App code assembles document nodes and edges, then removes local-root details for remote packets. Runtime exposes the local operation. The HTTP adapter owns query parsing, authentication, JSON responses, and the content-free browser shell.
