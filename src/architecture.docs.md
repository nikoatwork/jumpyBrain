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
  -> HTTP server browser shell, full-page WYSIWYG Markdown editor, optional graph, and JSON protocol routes
```

Core owns link semantics but not graph presentation. App code assembles document nodes and edges, then removes local-root details for remote packets. Runtime exposes the local operation. The HTTP adapter owns query parsing, authentication, JSON responses, and the content-free browser shell at `/` and `/graph`, including framework-free search, locally bundled vanilla Lexical editing, and guarded navigation state that compose the existing search and document GET/PUT protocols. Browser editing must not move canonical Markdown, protected-frontmatter, or optimistic-concurrency policy out of core/app seams.

## Feedback ownership

`src/adapters/feedback/` owns shared support-report validation and delivery for the CLI and HTTP browser hosts. The CLI calls it without selecting a memory target; HTTP hosts retain their authentication/admission handler. No canonical memory or inbox-reading behavior enters this adapter. AgentMail credentials remain operator-side, and the existing packaged feedback-config path stays compatible.

## Boundary verification

Support diagnostics use a browser-safe event schema and host persistence under `src/adapters/diagnostics/`; `src/app/diagnostics/` composes explicit bounded snapshot sources. HTTP/gateway hosts supply authenticated local scope. Core never imports diagnostics, and no public hosted raw-log transport is introduced.

Deterministic source-boundary and package-entrypoint tests enforce these directions. Pure boundary property tests use fixed `fast-check` settings from `test/property-helpers.js` in normal `npm test`; they must not spawn QMD or depend on paid/model behavior. Integration tests separately verify runtime, canonical publication, and adapter behavior.

For browser changes, follow the [HTTP adapter map](adapters/http-server/http-server.docs.md) to the [browser/editor contract](adapters/http-server/browser.docs.md). For retrieval lifecycle changes, start with [local memory](app/local-memory/local-memory.docs.md), then the [QMD adapter](adapters/qmd/qmd.docs.md); remote deadlines belong to the [HTTP client](adapters/http-client/http-client.docs.md).

## Mac app ownership

The unified Electron bundle owns the desktop window, menu bar, login preference, and lifecycle. An internal Swift helper owns Keychain/folder capabilities and a child gateway over the bundled copy of this same runtime. Closing the window keeps the service available; explicit quit uses the all-tab save barrier before stopping owned children. Parent watchdogs prevent orphan services. CLI-only installation and separately hosted servers remain independent. See [the desktop boundary](../integrations/electron/electron.docs.md).

## Executable extension ownership

`src/extensions/` is the host-independent public contract. `src/adapters/extensions/` owns local package/manifest/state/cache I/O and lazy compilation; `src/app/extensions/` owns executable activation, registration, invocation and disposal. The desktop gateway composes one host and supplies scoped operations through its existing authenticated target transport. Extension code is explicitly installed and trusted; capability declarations do not sandbox same-process Node or same-origin browser code.

CLI extension-management commands use the focused app seam and are loaded only on explicit `extensions` dispatch. Normal runtime imports, CLI memory commands and ordinary hosted servers never construct the desktop extension host. Core imports none of the extension layers. Public contract, app and adapter imports have separate architecture-test classifications, keeping the new boundary explicit rather than widening general app/core dependency rules.

The shared browser owns the action dispatcher, named contribution slots and optional nonce-protected extension UI/panel lifetimes. Its executable-extension presentation bundle is embedded only in companion shells; the ordinary editor bundle keeps its existing size gate. Native capabilities, draft protection, canonical concurrency and remote write approval remain with their existing owners. See [the author guide](../docs/extensions.md) and [extension host docs](app/extensions/extensions.docs.md).

## Board ownership

Canonical `core/boards` owns versioned JSON organization at `boards/<UUID>.json`, safe file access and hash-checked publication. `app/boards` composes layout changes and fresh bounded Markdown status evidence; runtime exports the local seam and `app/server-memory/boards` exposes it to thin authenticated HTTP routes. CLI uses ordinary local/remote transports. The Mac renderer proxies the same routes through its selected brain and write permissions. No database, app-support store, CLI-to-native dependency or board indexing is involved.
