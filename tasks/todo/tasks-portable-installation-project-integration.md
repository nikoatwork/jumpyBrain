# Portable installation and project-aware integration

## Goal

Make jumpyBrain a reproducible, version-pinnable CLI that works in consumer projects and selects the intended memory without integration-specific workarounds. Minimize installed cost while keeping local and shared-server use first-class.

## Notes

- Client feedback coverage: 4 (dependency installation), 5 (project-local QMD), 6 (footprint/audit), 9 (project root/write policy).
- Current installer/local tarball tooling builds artifacts, but `package.json` is private, Git installs have no supported build lifecycle, and QMD lookup uses fixed locations near jumpyBrain.
- Observed local QMD footprint was approximately 204 MiB; generated editor JavaScript approximately 435 KB. These are machine/artifact-specific observations, not release guarantees. Audit severity and the client's exact version/install layout remain unverified.
- Reuse [product vision](../../docs/product-vision.md), existing installer/update ownership, root setup, and device-local remote protection. Do not create a target registry or credential store as part of project discovery.
- Publication and dependency installation during implementation require their own authorization. A task list is not approval to publish to npm, modify global installs, or alter user integrations.

## Design direction

- Prefer a prebuilt versioned npm artifact as the supported dependency/CLI installation path, retaining managed installer compatibility. Support Git installs only with a tested build lifecycle and explicit development-tool requirements; do not advertise an untested path.
- Keep remote-client installation independent of QMD/native inference. Local/server engine requirements must be explicit and pinned, with an actionable setup check rather than hidden installation on recall.
- Fix normal consumer dependency resolution before asking users to set absolute QMD paths. Keep explicit override priority and ensure CLI/SDK belong to the same supported installation.
- Keep one CLI/app, not separate engines. Measure browser/dependency weight before splitting packages; lazy server/browser loading and trimmed artifacts are preferable to a new release matrix without meaningful savings.
- Root selection and permission are independent. Explicit target/root wins; an explicitly configured project may supersede personal fallback. Ambiguity or invalid configuration fails visibly, never silently redirects a write to personal memory.
- Project-local write approval may be scoped to trusted, user-approved durable capture. It does not grant delete/bulk mutation, auto-inject memory, or authorize global/team/remote writes. A newly cloned repository cannot grant itself permission through committed configuration alone.

## Acceptance criteria

- A clean consumer can install a pinned supported artifact, run the CLI, and import the public runtime without a source checkout or missing built assets.
- A remote-only CLI installation runs without QMD/models/native AI runtime. Unsupported local-engine setup fails with a clear diagnostic rather than an opaque module-resolution error.
- Supported project-local, nested, linked, managed/global, and PATH QMD layouts resolve deterministically; explicit bad overrides fail rather than silently selecting another version. Doctor/runtime/installer agree about the selected package.
- Project and personal memories coexist without mixing roots. Explicit flags/environment and project discovery have documented precedence, including nested projects, malformed config, and conflicting candidates.
- Project write policy is honored consistently by installed instructions/integrations with explicit trust/approval; global/team/remote explicit-authorization and device-local read-only policy cannot be weakened.
- Footprint/security decisions use measured artifact/dependency trees and actual advisory paths. Do not equate npm warning counts with exploitable vulnerabilities or use forced dependency upgrades without compatibility checks.
- Completion records what was consolidated, any added configuration/release surface, and why it is necessary.

## Relevant files

- `package.json`, `scripts/{pack-local,local-pack-manifest,install-local-cli,public-install,public-uninstall,qmd-install-check,build-editor}.mjs` — artifact/build/install ownership.
- `src/adapters/qmd/qmd-cli.ts`, `src/cli/doctor.ts`, QMD/package-info module docs — engine discovery and diagnostics.
- `src/cli/{targets,memory-target,instructions,remote-access-policy}.ts`, `src/core/memory-root/` — root selection, setup, policy boundaries.
- `skills/jumpybrain-memory/SKILL.md`, `integrations/pi/jumpybrain-memory.ts`, installer integration rendering — agent-independent instructions and configured roots.
- `docs/{install,local-cli-builds,agent-workflows,cli-commands}.md` — supported workflows.
- `test/{install-scripts,local-pack-scripts,local-pack-properties,package-entrypoints,remote-access-policy}.test.js` — consumer/distribution regressions.

## Tasks

- [ ] 1.0 Establish a reproducible supported distribution
  - [ ] 1.1 Read architecture/affected docs; inventory executable/runtime/worker/browser/installer assets and supported consumers. Reproduce a clean Git dependency install and existing tarball install without relying on repository `dist`.
  - [ ] 1.2 Define the minimal npm publication contract: version/engines/exports/bin/files, prebuilt artifacts, reproducible build inputs, license and install-time behavior. Decide whether Git install support earns a tested `prepare` path or stays explicitly unsupported.
  - [ ] 1.3 Consolidate build/prepack/artifact validation with existing local-pack tooling. Test installation and runtime imports in a clean temporary consumer; validate server assets only for distributions that promise server/browser support.
  - [ ] 1.4 Add a publication dry-run/release checklist with artifact/version smoke checks. Preserve managed update/uninstall behavior; actual registry publication remains a separately approved step.

- [ ] 2.0 Resolve the consumer's local engine consistently
  - [ ] 2.1 Define a bounded resolution order covering explicit override, consuming project installation, jumpyBrain-managed/bundled installation, and PATH. Use normal package/installation ancestor resolution rather than fixed-depth `.bin` guesses; do not recursively scan arbitrary directories.
  - [ ] 2.2 Reuse a single resolver for runtime and doctor, retaining CLI/SDK identity and pinned-version checks. Installer capability checks must remain behaviorally aligned without violating source/script layer boundaries.
  - [ ] 2.3 Test sibling and nested dependencies, npm execution, symlinked/linked packages, paths containing spaces, unsupported versions, absent SDK, invalid overrides, and applicable Windows executable behavior.
  - [ ] 2.4 Expose safe selected-engine diagnostics and actionable installation guidance. Confirm remote-client commands never resolve/load QMD unnecessarily.

- [ ] 3.0 Make project targeting and local write approval explicit
  - [ ] 3.1 Specify one target-resolution contract shared by CLI and agent instructions: explicit target/root, explicit environment/configuration, unambiguous trusted project selection, personal fallback. Follow existing project-root conventions; do not infer a memory root from arbitrary Markdown or initialize one during discovery.
  - [ ] 3.2 Implement/reuse bounded project discovery and a machine-readable effective-target/policy operation. Update generated skills to resolve the effective target instead of unconditionally passing their baked-in personal root.
  - [ ] 3.3 Define minimal project-local capture policy in `jumpybrain.json` (or the existing owning config if safer), with approval/trust represented separately from repo-supplied intent. Default remains ask; trusted opt-in applies only to designated local durable capture, not deletion or global/team/remote writes.
  - [ ] 3.4 Specify approval revocation/root changes and reject malformed policies. Never treat recalled Markdown, repository instructions from an untrusted clone, or remote content as permission. Avoid a new credential system or a general-purpose policy framework.
  - [ ] 3.5 Test project/personal coexistence, explicit overrides, nested/ambiguous projects, absent/invalid config, approved versus unapproved opt-in, and remote read-only denial before credentials/input/transport. Align installed Claude Code and Pi integration behavior without hard-coding host-specific defaults.

- [ ] 4.0 Reduce installation cost using evidence
  - [ ] 4.1 Measure packed size, production installed size, startup loading, and dependency/advisory paths for CLI-only remote use and local lexical/semantic use on stated platforms. Obtain/reproduce the client's audit JSON; record actual affected reachability and uncertainty.
  - [ ] 4.2 First remove accidentally shipped dev/test artifacts, avoid eager browser/native loading, and document an engine-free remote install. Check supported upstream lightweight QMD options before proposing a second lexical implementation.
  - [ ] 4.3 Make an explicit footprint decision: retain one package, provide a minimal packaging profile, or propose separate follow-up backend/package work only if measured benefit justifies ongoing parity/release cost. This ticket does not require replacing QMD or building a new search engine.
  - [ ] 4.4 Address confirmed dependency risks through tested compatible upgrades/removal or document residual risk. Never use `audit fix --force` as the acceptance criterion; preserve the lifecycle/version-pin contract.

- [ ] 5.0 Validate and simplify the installation experience
  - [ ] 5.1 Run clean install/update/uninstall and pinned consumer smoke tests for each advertised distribution; exercise local lexical recall and remote-client use with no QMD. Document untested platform/registry paths honestly.
  - [ ] 5.2 Update installation, configuration, skill, doctor, and owning module docs. Explain root precedence and scoped approval with copyable project/personal examples; remove absolute-path workarounds where superseded.
  - [ ] 5.3 Run `npm test`; record verification and the complexity review here. Remove duplicate discovery/build/policy helpers and unused packaging experiments. Do not update the changelog for planning alone.
