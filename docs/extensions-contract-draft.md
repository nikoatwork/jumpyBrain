# Extension implementation contract

Working contract for the executable-extension implementation. Fold this into the final author/owning docs before finalization.

## Shared boundary

- Public types: `src/extensions/index.ts`. Keep these stable while the parallel slices land; notify the parent of necessary changes. This entry imports no host and must stay safe for browser/type-only authoring.
- Package: `jumpybrain-extension.json` at an explicitly installed local directory, conforming to `ExtensionManifest`. Required `apiVersion:1` is the v1 host/API compatibility gate; version is a numeric package version. TS/JS main and optional TS/JS UI entries are prepared with lazily imported esbuild at install/reload, with package-local dependencies bundled. Runtime code is trusted. Package/cache/state live under `<companion support>/extensions/`, not the brain. Default CLI directory is `~/Library/Application Support/jumpyBrain Companion/extensions` with an explicit `--directory` override for fixtures/nonstandard hosts.
- Local link/install is explicit, records an absolute source directory, and prepares immutable cache revisions; no npm/git fetching in v1. On reload prepare a new cache before activation, clean failed registrations, retain usable prior activation on prepare/factory failure where possible. No automatic background file watcher.
- Main factory receives `ExtensionAPI`; register commands/panels/themes. Command handler receives fresh scoped context, memory methods and cancellation. Event handlers never receive write authorization. Return a `{panel:{id,data}}` result to ask the renderer to open a declared panel. No host callback accesses native UI state.
- The optional UI entry is a default `ExtensionUIFactory`. Its bundle is served as an IIFE script ending in `globalThis.JumpyBrainExtensions.register(extensionId, defaultFactory)`. Browser shell creates this registry and attaches its own CSP nonce to the script tag. Do not use eval/blob script or relax Electron Node isolation. The descriptor's `ui` is a same-origin revisioned asset URL.

## App manager interface (runtime worker owns implementation)

`createExtensionHost({directory, safeMode?})` asynchronously returns a host with:

- `snapshot(): ExtensionSnapshot` (synchronous, already sanitized for renderer; no filesystem source paths).
- `reload(): Promise<ExtensionSnapshot>`; `setEnabled(id, boolean): Promise<ExtensionSnapshot>`; `remove(id): Promise<ExtensionSnapshot>`; `dispose(): Promise<void>`.
- `invoke(extensionId, commandId, input, context: ExtensionContext): Promise<ExtensionCommandResult | void>`; handler context is invocation-owned; validate registration/capabilities and reject after invalidation. Host wraps `context.memory` to enforce manifest `memory.read`/`memory.write`, `allowWrites`, abort and current activation revision. Context memory implementations are supplied by gateway.
- `emit(event: ExtensionEvent, context: ExtensionContext): Promise<void>` (observational, no write authorization).
- `asset(id, revision): Promise<string>` returns only the prepared UI JS matching a current active descriptor revision; errors on unknown/disabled/stale packages.
- Adapter management operations shared with CLI: `installExtension({directory, source})`, `listExtensions({directory})`, `setExtensionEnabled({directory,id,enabled})`, `removeExtension({directory,id})`, `prepareExtensions({directory})` with concrete names/types finalized by runtime worker. CLI may call a focused app barrel re-export/composition rather than adapters directly. No auto-execution on CLI install/list; prepare can compile but factories activate only in desktop host.

## Authenticated desktop protocol (gateway worker owns implementation)

- `GET /companion/extensions`: `ExtensionSnapshot`.
- `POST /companion/extensions/manage`: `{action:"reload"|"enable"|"disable"|"remove", id?}` -> snapshot. Source directory installation belongs to explicit local CLI, never browser arbitrary paths.
- `POST /companion/extensions/invoke`: `{extensionId,commandId,input?,document?:{id,title}|null,allowWrites?:boolean}` -> command result (use `{}` for void).
- `POST /companion/extensions/event`: `{event:ExtensionEvent}` -> `{ok:true}`. Event is UI-observational and never authorizes writes.
- `GET /companion/extensions/assets/<id>/<revision>.js`: prepared UI bundle, immutable revision, no source filesystem paths. Authenticated cookie and exact host/origin apply; script subresource has no custom generation/tab headers so check asset revision/active state separately. Other routes require registered generation/tab; manage/invoke/event participate in coordinator admission/drain. Native CLI management uses the private control bearer, exact Host and current generation.
- Add `extensions` to companion poll/state packets as a tiny `{revision,safeMode}` signal, not the full registry. Renderer refreshes descriptors only on revision changes, using existing companion polling; no new periodic poll loop. Safe mode is explicit host option plus a support-directory `extensions/disabled` marker honored before any extension compiler/factory loading; management remains available for recovery.
- Memory implementation reuses current gateway target/policy: bounded search -> existing search POST; read -> existing document GET; create -> existing notes POST with idempotency key; update -> existing document PUT with If-Match. Validate inputs, normalize search IDs/snippets using existing browser/server contracts. Each operation verifies the captured generation/profile and participates in existing in-flight barriers, including continuation calls from trusted handlers. Fail stale/closing contexts. Read-only is enforced independently of invocation `allowWrites`.

## Renderer integration (UI/examples worker owns implementation)

- Companion-only bootstrap after tab registration. Use the existing authenticated `api(...)` transport/generation headers, current state document metadata and guarded `openNote` callback. Keep ordinary hosted UI extension-free.
- At least existing `search.open` is registered in the same browser command dispatcher used by extension commands and used by its buttons/shortcut. Avoid duplicate existing listeners.
- Named slots: `sidebar.actions` and `note.actions`; contributions ordered by configured IDs. Local shortcut/placement preferences may be device-local browser settings. Never rebuild the editor to add/remove contributions.
- Panels: one accessible contribution area with title/close/focus restoration. Load UI factory by descriptor URL with current CSP nonce; dispose and abort on revision, generation, page teardown, disable and close. UI code can only use the supported context; all code remains trusted same-origin.
- Compact extension controls in companion Settings: enabled/error, enable/disable/reload/remove, themes and command access. Theme overrides mapped to allowlisted existing semantic CSS tokens; cleanup restores built-ins, OS/user theme behavior and graph redraw. No generic CSS injection is required.
- Examples under `examples/extensions/`: a palette registered by an executable theme factory and a Related notes executable command + custom UI entry. Related notes constructs a bounded query on explicit command, excludes active note, displays stale/offline/empty states, allows a user query and guarded opening, and owns all its feature logic. Host has no related-notes special cases.

## Ownership

- Runtime/package worker: `src/adapters/extensions/`, `src/app/extensions/`, their docs, runtime/package tests, package manifest/lock dependency and SDK packaging entries, root SDK re-export if needed. May add API fixes after notifying parent.
- Gateway/CLI worker: `integrations/macos-companion/gateway.mjs`, a focused new extension gateway module if useful, companion/native safe-mode environment forwarding only if needed, `src/cli/{extensions,commands,args,usage}.ts`, CLI/gateway extension tests and owning docs.
- UI/examples worker: extension browser controller/style/bootstrap, `graph-page.ts`, `notes-browser.ts`, `companion-browser.ts`, `browser-entry.ts`, example packages and UI-specific tests/docs. Keep theme changes isolated from unrelated design-system work.
- Parent: integration, this draft/public types coordination, architecture-boundary test updates, e2e/desktop smoke/measurements, final author/glossary/release/task documentation, independent review and finalization. Workers do not commit/archive or edit the canonical task list, changelog or release notes. Everyone is sharing one worktree; do not revert others' work.
