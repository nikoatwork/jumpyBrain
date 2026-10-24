# Executable extensions inspired by Pi

## Goal

Give jumpyBrain a small, public extension surface through which users and agents can add executable behavior, commands, shortcuts, UI panels and themes without patching the application. Deliver the runtime with two working examples: a theme package and a functional Related notes extension. Keep canonical memory policy in core and put optional product features in extensions when they can use the public primitives.

## Status and scope

- Planning only; implementation and validation have not started. The user explicitly chose executable extensions after reviewing a smaller theme/layout proposal.
- Mac desktop is the first supported host. Reuse the shared browser/editor code, but ordinary hosted servers and standalone browser clients do not automatically become extension hosts. Desktop extensions must work against either an authorized local or remote brain through the existing desktop transport.
- “Executable” means locally installed TypeScript/JavaScript code, including optional browser UI code. This is broader than theme files or rearranging existing controls. Arbitrary native executables and a general shell-execution API are not required for the first release.
- The core platform owns canonical Markdown, retrieval/write policy, authentication, concurrency and lifecycle barriers. Extensions own optional behavior and presentation, using public operations rather than importing core/app/QMD internals.
- No marketplace, mandatory framework, new memory engine, automatic dependency updates, always-on plugin service or bulk migration of existing features is required. Local packages and a fast development/reload loop are required; npm/git source installation is a separately assessed convenience within this list.
- This task does not authorize publication, installation into the user's live app, global/team memory writes or a release. Use disposable roots and app profiles for implementation checks.

## Starting evidence

- Pi source reviewed at [`f321e5bdd26b3624bfb2ab182a334d0a5edb698a`](https://github.com/earendil-works/pi/tree/f321e5bdd26b3624bfb2ab182a334d0a5edb698a). Its [loader](https://github.com/earendil-works/pi/blob/f321e5bdd26b3624bfb2ab182a334d0a5edb698a/packages/coding-agent/src/core/extensions/loader.ts) loads module factories and collects registrations; its [runner](https://github.com/earendil-works/pi/blob/f321e5bdd26b3624bfb2ab182a334d0a5edb698a/packages/coding-agent/src/core/extensions/runner.ts) binds execution/context; its [types](https://github.com/earendil-works/pi/blob/f321e5bdd26b3624bfb2ab182a334d0a5edb698a/packages/coding-agent/src/core/extensions/types.ts) define the public contracts.
- Pi's [extension guide](https://github.com/earendil-works/pi/blob/f321e5bdd26b3624bfb2ab182a334d0a5edb698a/packages/coding-agent/docs/extensions.md), [TUI integration points](https://github.com/earendil-works/pi/blob/f321e5bdd26b3624bfb2ab182a334d0a5edb698a/packages/coding-agent/docs/tui.md), [themes](https://github.com/earendil-works/pi/blob/f321e5bdd26b3624bfb2ab182a334d0a5edb698a/packages/coding-agent/docs/themes.md) and [packages](https://github.com/earendil-works/pi/blob/f321e5bdd26b3624bfb2ab182a334d0a5edb698a/packages/coding-agent/docs/packages.md) are design references, not APIs jumpyBrain promises to reproduce. Preserve applicable upstream attribution/license notices if code is reused.
- At jumpyBrain planning snapshot `fa8740e`, Electron owns the window/native lifecycle; its sandboxed editor has no preload/Node bridge. An internal Swift helper hosts a Node gateway over the same memory app. Browser theme tokens are already centralized, while navigation markup and action handlers are wired directly.
- Existing desktop RAM work and editor-bundle limits remain relevant. Measure extension overhead against a matched snapshot; no RAM/startup/bundle target is established by this planning document.

## Architecture direction

```text
explicitly installed local extension package
  -> manifest/version/trust validation + prepared module cache
  -> executable factory receives typed ExtensionAPI
  -> commands / events / UI contributions / themes
       -> host command dispatch + current scope + cancellation
       -> renderer panels/widgets using shared UI primitives
  -> existing guarded controller or app operation
  -> existing core policy -> canonical Markdown / rebuildable index
```

- Use Pi's factory/registration/context pattern. Start with one app-side Node extension manager composed by the desktop gateway; renderer contributions have their own mount/dispose lifetime. Do not introduce a process or worker per extension by default. Confirm this ownership with a minimal vertical slice before committing to public signatures.
- Keep the executable loader/configuration in an adapter and lifecycle/use-case composition above it. Proposed homes are `src/adapters/extensions/` and `src/app/extensions/`; exact placement must pass existing dependency-direction checks. Browser rendering belongs with the shared UI; Electron/native access remains host-owned. Core never imports the extension system.
- Default trust model: explicitly installed, trusted local code, like Pi. Same-process Node code can use the user's OS permissions. Manifest capability declarations and API scope checks describe/restrict supported operations; they are not a sandbox against malicious extension code. Same-origin renderer code is also trusted with visible application data. Do not claim package/module isolation provides security isolation.
- Do not auto-execute code found in Markdown, a brain folder, a cloned project, note attachments, or remote server responses. Store installed code, enablement and disposable compiled caches outside canonical/indexed memory and outside the replaceable app bundle. An extension's own persistent state is namespaced and distinct from memory.
- Keep registrations and public operation contracts versioned and small. Expose stable commands, selected events, named UI slots/panels, theme primitives, and bounded memory operations. Avoid raw Electron/Swift/Keychain objects, arbitrary authenticated fetch, internal editor objects or QMD handles in the supported API.
- Ordinary CLI recall/search and public runtime imports must not load installed desktop extensions. Agents manage extensions through explicit CLI commands; extensions access memory inside the app through its supported scoped operations. Hosted executable loading remains off unless an operator explicitly enables a supported future host.

## Acceptance criteria

- A user/agent can create a small local TS/JS extension, enable it, invoke a command, contribute a real UI panel and reload it without rebuilding/forking jumpyBrain. Required authoring/install tools and dependency costs are explicit.
- The two examples install through the same package mechanism. Their implementation imports only public extension contracts; no example-name conditions or private imports appear in the host.
- An existing built-in action uses the same command registry as extensions. Named slots allow contributions and placement of actions while preserving keyboard, focus, responsive behavior and draft state.
- All public memory operations and async results are scoped to the current authorized brain/session; stale contexts cannot silently act on another brain. Writes retain normal explicit authorization, read-only checks, protected metadata, optimistic concurrency and saved/indexed outcome semantics.
- Disable/reload removes owned commands, UI, listeners and pending work. A normal extension error is attributed and recoverable. Same-process crashes, blocking code and unmanaged side effects remain documented limitations; a startup bypass permits recovery without loading extensions.
- With no enabled extensions, no extension code/compiler is eagerly loaded by agent CLI/runtime paths, no extra background process/polling loop is introduced, and packaged/runtime overhead is measured. Report limits rather than inventing a zero-cost claim.

## Tasks

- [ ] 1.0 Prove the host boundary and public contract with a minimal executable slice.
  - [ ] 1.1 Read the product vision, source architecture, affected co-located docs, browser/design-system, desktop and gateway contracts. Record the current source/build baseline and reuse the pinned Pi references above.
  - [ ] 1.2 Specify the host/renderer split, factory activation context, supported API version, command IDs, event payloads, UI contribution ownership and teardown semantics. Mark v1 versus deferred APIs explicitly; do not promise all of Pi's API or editor replacement in v1.
  - [ ] 1.3 Load a disposable local module that registers one command and mounts one renderer contribution through the proposed boundary. Verify actual Electron sandbox/CSP/gateway compatibility without a generic native bridge. Resolve the architecture here before expanding the SDK.
  - [ ] 1.4 Record the trust model and resource-ownership limits. Specify safe startup without extensions, early failure recovery, and why the selected execution model is sufficient for trusted local add-ons.

- [ ] 2.0 Implement local packages, TS/JS loading and explicit management.
  - [ ] 2.1 Define a minimal manifest: stable ID, version, compatible host/API range, executable entry, optional UI/theme resources and declared capabilities. Validate paths, duplicate IDs, missing assets and incompatible versions before activation; reject traversal outside the installed package's allowed resources.
  - [ ] 2.2 Choose the smallest supported TS authoring path using measured distribution constraints: Pi-style runtime transpilation or install/reload-time compilation. Reuse tooling where practical, keep compiler/loading dependencies lazy and document package dependency resolution. Deliver a TS development flow without a manual app rebuild.
  - [ ] 2.3 Implement explicit local-path install/link, list/status, enable, disable, remove and development reload through focused CLI modules and host-management seams. Keep commands/paths illustrative until the owning CLI contract is implemented; removal must preserve user state unless explicitly requested otherwise.
  - [ ] 2.4 Persist registry/enablement in host configuration, with atomic updates, clear diagnostics and rollback to a usable registration set after a failed load. Resolve reload/module caching honestly; require a guarded restart when safe unloading cannot be guaranteed.
  - [ ] 2.5 Assess npm/git installation after the local flow works. Add it only by reusing a bounded explicit install pipeline with pinned source/version and transparent dependency execution. Otherwise record it as deferred; loading and sharing ordinary local packages remains required.

- [ ] 3.0 Build executable activation, commands and lifecycle events.
  - [ ] 3.1 Export typed public contracts through a separate extension SDK surface that does not load the host, CLI parsing or Electron. Implement a default factory receiving registration APIs and runtime callbacks receiving a fresh context.
  - [ ] 3.2 Add namespaced command and shortcut registration with deterministic conflicts/order and disposers. Move at least one existing built-in action, such as Open search, through that registry; buttons and shortcuts must share its guarded implementation.
  - [ ] 3.3 Add only events needed by the examples and host lifecycle: activation/disposal, document identity changes, confirmed saves, theme changes and brain-scope changes. Distinguish observation from transformations/gates; v1 need not expose hooks that override canonical saves or retrieval policy.
  - [ ] 3.4 Track activation-owned subscriptions, tasks and UI handles; provide cancellation and idempotent cleanup for disable, reload, window close, brain switch and quit. Fence stale contexts/results and prevent duplicate activation across windows or reconnects.
  - [ ] 3.5 Isolate ordinary factory/handler failures to the responsible extension, with bounded diagnostics and actionable recovery. Document that a timeout cannot preempt synchronous blocking code in the same process; test recovery rather than claiming full failure isolation.

- [ ] 4.0 Expose scoped memory and application operations.
  - [ ] 4.1 Provide bounded read/search and guarded open-note operations using canonical IDs and existing result/provenance semantics. Give UI code only the current document metadata/content it explicitly requests; define saved versus unsaved draft access rather than silently equating them.
  - [ ] 4.2 Provide a minimal explicit command-driven create/update operation through existing workflows, with validated inputs, expected versions/idempotency where applicable, cancellation, normal outcome reporting and existing write authorization. Test this with a disposable fixture extension even though the functional example is read-only.
  - [ ] 4.3 Route desktop local/remote operations through the existing active-target policy and admission/drain seams. No captured process-global root, remote credential exposure, direct QMD access or bypass of companion generation/read-only checks.
  - [ ] 4.4 Define the bounded host/renderer command protocol: session/Origin authentication, extension/command identity, input validation and request limits, generation/tab fencing and current availability checks. Expose no generic filesystem, shell, native IPC or arbitrary privileged-fetch endpoint.
  - [ ] 4.5 Test brain switches, permission changes, reloads and lost responses during pending reads/writes. An extension cannot turn ambiguous saves into retries on a new brain or infer global/team write authorization from installation/enablement.

- [ ] 5.0 Add composable UI and theme primitives.
  - [ ] 5.1 Implement named action/widget slots and an extension panel primitive with mount/update/dispose, theme tokens, focus restoration, keyboard access and guarded note navigation. Use the existing framework-free browser/editor architecture; a new frontend framework is not a prerequisite.
  - [ ] 5.2 Load optional prepared UI entries as trusted extension code through a reviewed asset/CSP path. Keep renderer Node integration disabled and preserve the narrow native boundary; UI entries call supported extension commands instead of receiving raw host objects.
  - [ ] 5.3 Support ordered action contributions and a small placement/shortcut preference layer keyed by stable IDs. Preserve required save/error/recovery controls and editor identity; avoid a second event-dispatch or navigation implementation.
  - [ ] 5.4 Define theme registration/loading and token validation, including focus/error/selection roles and graph redraw behavior. Apply theme changes without rebuilding the editor or losing drafts; retain existing built-in defaults when a theme is disabled/invalid.
  - [ ] 5.5 Provide compact installed-extension controls/status for enable/disable, errors and development reload. Keep detailed API/build information in documentation; UI should expose the choices a user needs.

- [ ] 6.0 Ship two public-API example packages.
  - [ ] 6.1 Add a small theme package with a selectable palette, manifest and authoring instructions. Exercise install, select, live change/reload, disable and fallback across note/search/graph views.
  - [ ] 6.2 Add a Related notes executable extension: register an Open related notes command/shortcut and a panel; on explicit invocation search the current note's title or a user-edited query through existing bounded retrieval, omit the current note, and open results through guarded navigation.
  - [ ] 6.3 Keep query construction, feature-specific state and result presentation in the extension. Handle missing/unsaved notes, empty results, offline/stale indexes, cancellation and scope changes. No always-on semantic polling, new index/ranker or automatic memory writes are needed.
  - [ ] 6.4 Prove both examples run from ordinary installed/local packages using only the published SDK and shared UI primitives. Uninstalling Related notes removes its functionality without leaving feature-specific code or data structures in core; no plugin-specific host branch is acceptable.

- [ ] 7.0 Verify correctness, recovery and resource cost.
  - [ ] 7.1 Add meaningful deterministic coverage for manifests/compatibility, registration collisions, factory errors, partial activation rollback, cleanup, package resolution, stale contexts and import boundaries. Prove Markdown remains canonical and normal CLI/runtime operations work with no extensions loaded.
  - [ ] 7.2 Exercise real browser and disposable Mac desktop hosts: both examples, command/shortcut dispatch, multiple windows, edit/save/conflict protection, brain switching, read-only remote denial, failed reload, disable/uninstall and safe startup bypass. Verify quit/update save barriers still work with pending extension activity.
  - [ ] 7.3 Inspect both themes and desktop/390/320px browser layouts, keyboard/focus and reduced-motion behavior. Record physical-device/assistive and hosted-browser limits separately; do not imply ordinary hosted servers support executable extensions.
  - [ ] 7.4 Measure matched no-extension baseline versus examples enabled: package/dependency size, editor bundle contribution, startup cost, idle/background work and short repeated open/close/reload resource retention. Account for all processes and extension caches; reuse existing RAM tooling without expanding unrelated experiments.
  - [ ] 7.5 Run `npm test`, architecture/package-entrypoint checks and affected existing browser/desktop smokes. Record the exact tested snapshot, commands, results and remaining limits here. Remove redundant infrastructure or unexercised API surface before calling v1 complete.

- [ ] 8.0 Document the extension contract and finalize the implemented task.
  - [ ] 8.1 Write a small extension-author guide with a minimal TS factory, package manifest, command/event/panel usage, scoped memory operations, development reload and both runnable examples. State compatibility policy, trust limits, dependency execution and unsupported hosts plainly.
  - [ ] 8.2 Update owning `*docs.md`, source architecture, CLI/desktop/install documentation and glossary for the delivered boundaries and the terms extension, package and host. Specify which future optional features should use extensions and which canonical policies remain core-owned.
  - [ ] 8.3 Add concise pending release notes for actual delivered behavior. An implemented executable-extension boundary qualifies for a short architecture/user-capability changelog highlight; creating this plan does not.
  - [ ] 8.4 Record outcomes, validation and remaining limits, then archive this list, repair references and commit scoped implementation/tests/docs under [the task workflow](../../docs/task-workflow.md). Keep unfinished required checks active; no push, live installation or publication is implied.

## Relevant files

- `docs/product-vision.md`, `src/architecture.docs.md`, `src/app/app.docs.md`, `src/adapters/adapters.docs.md` — product and dependency-direction constraints.
- `src/adapters/http-server/{browser.docs.md,browser-entry.ts,graph-page.ts,notes-browser.ts,browser-theme.ts,document-controller.ts}` and `docs/design-system.md` — shared shell, public UI integration points and editor protections.
- `integrations/electron/{electron.docs.md,window.mjs,lifecycle.mjs,application.mjs}` — desktop composition, sandbox, quit and update behavior.
- `integrations/macos-companion/{gateway.docs.md,gateway.mjs,switch-coordinator.mjs}` — scoped desktop transport, authenticated management boundary and target switching.
- `src/app/server-memory/`, `src/runtime/`, `src/cli/`, `test/{architecture-boundaries,package-entrypoints}.test.js` — approved operations, CLI management and import-boundary verification.
- `scripts/build-editor.mjs`, package manifests/exports and local-pack tooling — optional code preparation, assets and SDK distribution.
- `integrations/pi/jumpybrain-memory.ts` — existing integration into the external Pi agent; distinct from the proposed jumpyBrain extension host.
- `tasks/todo/tasks-desktop-ram-next-improvements.md` — independent RAM work; coordinate touched files and reuse evidence without inheriting or spending its experimental budget for this task.

## Verification and execution notes

- Planning verification: checked the current product/architecture, task workflow, glossary, desktop/gateway and browser contracts. No implementation tests or benchmarks have run for this task.
- Open implementation decisions belong to task 1.0 and loader assessment in 2.2: confirm the host/renderer vertical slice and choose the TS loading/dependency path with evidence. Neither is a reason to reduce the agreed scope to themes alone.
