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

- Feedback coordination, 2026-11-02: [brain connections/targeting](../done/2026-11-02_tasks-brain-connections-and-targeting.md) owns app profile management and effective-target diagnostics; task 3 below still owns trusted project discovery/policy. Agree one resolver contract before either implementation. [Runtime hygiene](../done/2026-11-08_tasks-desktop-runtime-hygiene.md) owns staging retention and managed integration drift. This list retains CLI payload trimming (including reported Electron dependencies in CLI-only installs), remaining native-toolchain/platform distribution work and cross-release signing/credential-continuity limits; the review's measured sizes are unverified installation-specific observations. Full [triage/source links](../done/2026-11-02_tasks-feedback-product-discovery.md).

- First reuse the existing versioned GitHub release tarball for managed installs, retaining explicit source/ref development installs. Evaluate npm publication separately for consumer-project dependencies; it is not a prerequisite for an agent completing setup. Support Git dependency installs only with a tested build lifecycle and explicit development-tool requirements; do not advertise an untested path.
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

- [ ] 0.0 Deliver agent installation and remaining platform gates before broadening project discovery or npm publication. Focused implementation and verification: [agent installation](../done/2026-11-01_tasks-agent-installation.md).
  - [x] 0.1 Remove implicit current-directory installer execution; add shared early preflight and a machine-readable plan/result contract.
  - [x] 0.2 Provision a pinned local engine in an installer-owned user directory; align installer, runtime, doctor, Desktop and updater resolution. Keep remote-only CLI use independent of QMD.
  - [x] 0.3 Use verified published artifacts by default and make interrupted fresh installation safely rerunnable. Preserve explicit source/ref and existing ownership policies.
  - [x] 0.4 Add one app + agents setup flow, preserve the selected root, and verify actual local retrieval and Desktop readiness before reporting success.
  - [ ] 0.5 Complete clean-OS, Intel Mac and Linux hardware gates; disposable failure/recovery and Mac arm64 installation are covered by the focused task. Commands, agent guidance and current native limits are documented.

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
  - Coordination (2026-11-02): [connections/targeting](../done/2026-11-02_tasks-brain-connections-and-targeting.md) owns `src/cli/targets.ts` explicit-selector/configured-default resolution and doctor/status source diagnostics. Reuse that resolver when adding trusted project selection; do not create a registry or infer trust from arbitrary repository markers. Current order: one explicit root/URL, nonempty `JUMPYBRAIN_MEMORY_ROOT`, owning managed install manifest; only legacy recipes discover markers, only doctor has a personal fallback. This list retains project discovery/approval, installed instruction changes and revocation. Named remote profiles/Keychain lookup are deferred outside the CLI environment-key contract.
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

## Agent installation proposal — 2026-11-01

Status: investigated and proposed; implementation is not started by this proposal. User intent: make local installation easy for agents to complete end to end. Existing project-targeting and npm-publication work above remains active but should not delay the focused installer increment.

### Confirmed findings

Reviewed the installer, Desktop setup/packaging, release artifact selection, QMD discovery, doctor and existing installation tests at HEAD `17cdcef`, with unrelated folder-explorer work present. This is an inspection of the working checkout, not a clean-release validation.

- `scripts/public-install.mjs` installs missing QMD through `npm install -g @tobilu/qmd@2.8.3`; it does not check global-prefix writability. Its dry run can exit successfully while merely printing that command. A root-owned `/usr/local` prefix therefore remains an installation obstacle.
- The delay is worse for a fresh installation than the feedback describes: runtime publication, shim creation and memory initialization precede QMD setup; the manifest is written afterward. Updates check QMD through `beforePublish`, but still after dependency installation/build. A simulated QMD installation failure left the fresh app/shim present without a manifest, and an identical retry refused the unowned layout.
- `install.sh` executes `scripts/public-install.mjs` from the current working directory whenever that file exists. A disposable fixture confirmed this even with `--dry-run`; no repository identity or explicit local-source choice is required.
- The normal source path clones the default branch and runs `npm install` plus a local build. Bootstrap helpers also default to mutable `master`. The existing Desktop release selector already accepts published beta releases and checks exact asset identity, size and SHA-256; reuse that contract rather than designing a second release channel.
- `scripts/setup-desktop.mjs` has useful combined prerequisite checks, but app + agents remains a second invocation and another root dependency installation/build. Desktop setup is tied to the default managed installation and leaves onboarding to the UI.
- Adding QMD only to root dependencies is insufficient: runtime lookup can find package-local QMD, whereas doctor defaults to PATH and fresh Desktop packaging uses `shutil.which('qmd')`. All consumers need the same selected engine. An unconditional root dependency would also undermine the intended engine-free remote CLI.
- Installer completion currently verifies initialization/index-command success and prints a recall command; it does not itself run the promised doctor + recall handoff checks. The CLI shim depends on `node` remaining on PATH. Generated integrations use absolute CLI/root paths, which is a useful existing foundation.

### Recommended contract

Keep one managed installer. The focused implementation is tracked in [agent installation](../done/2026-11-01_tasks-agent-installation.md); publication and remaining platform/prebuilt gates are separate. Interface:

```sh
bash jumpybrain-install.sh --with-app --integrations auto --json
```

Without `--with-app`, install the local CLI and requested/detected agent integrations on macOS/Linux. With it, install the matching Mac app and CLI together. Retain explicit `--memory-root`, `--install-root`, `--source` and `--ref`; do not quietly convert existing custom or pinned installations. Automatic integration detection remains the default; report undetected hosts and retain the explicit all/none choices.

1. **Inspect and plan once.** Determine requested components, existing ownership/root, OS/architecture, usable Node/npm, destination writability, available storage and required native tools before expensive work. Return all blockers together. The preflight must not depend on Node already existing just to explain that Node is missing. `--dry-run --json` describes a plan and its limits, never installed readiness; write no install state. A network probe is not proof later downloads will succeed.
2. **Resolve one release.** Default new managed installations to one published, verifiable GitHub asset, including the product's published beta releases. Persist release/version/digest and update policy separately from development source/ref. Use its compiled CLI/editor assets instead of rebuilding TypeScript for an ordinary CLI install. Use lockfile-based production dependency installation where needed. Validate archive contents before extraction, fail on integrity errors, and never silently fall back to master. Resolve bootstrap helpers to one immutable installer revision so they cannot mix during download.
3. **Own the local search dependency.** Prefer a versioned QMD prefix under the install root, with a checked-in engine dependency manifest/lockfile and exact CLI/SDK version agreement. Do not require sudo, modify the global npm prefix, or replace unrelated global QMD. Preserve explicitly selected compatible engines; reject incompatible explicit overrides with repair guidance. Share the selected absolute Node/QMD paths across the CLI launcher, doctor, Desktop and updater, with documented override precedence. Keep the engine outside the replaceable app directory so reuse and recovery are possible; bind it to installation ownership for uninstall. Prove native dependency portability before promising a compiler-free installation.
4. **Stage and recover.** Extend existing locking/staging/rollback instead of layering another installer over it. Record bounded installer-owned in-progress state before publication; commit the final manifest after verification. A retry must recognize its own partial install and resume or roll back, without adopting arbitrary pre-existing files. Never delete or roll back canonical notes to recover program installation. If indexing fails, preserve notes and report the exact incomplete step. App failure must leave an explicit recoverable component state, not overall success or an unowned half-install.
5. **Finish the requested setup.** `--with-app` composes setup in the same operation, reuses the selected release and engine, and avoids duplicate builds. For a fresh authorized local setup, initialize Desktop with the exact chosen CLI memory root through a supported configuration path and verify it; do not require a redundant folder-picker roundtrip. Preserve existing app profiles and surface conflicting roots instead of retargeting them. Do not overwrite customized integration files without ownership-aware handling. Host reload or an OS permission dialog may remain an explicit user action, but the agent should complete all independent installation work first.
6. **Verify and report.** Run the installed CLI's `doctor --check --json` and bounded local recall; an empty new brain is valid. For a requested app, check installed component versions, successful launch and the actual local root. Emit JSON on stdout and bounded progress on stderr, including version, root, CLI/app paths, selected engine, installed/skipped integrations, checks, final state and remaining actions. Stable outcomes must distinguish ready, blocked, failed and pending user action. File presence is not host activation; no sample memory or automatic semantic-model download is needed.

The installer should reuse a compatible existing Node installation first. The first increment can still require the documented Node/native toolchain and must say so. Fully unattended setup on a clean Mac requires a later distribution increment: verified prebuilt app/native helpers and a supported private runtime/engine when Node/QMD are absent. Coordinate this with [release-built native helper work](../done/2026-11-03_tasks-desktop-update-30-seconds.md), then address signed/notarized distribution and credential identity. Do not advertise zero-prerequisite installation before supported architectures and native dependencies are tested. Linux support likewise needs a stated, tested platform matrix rather than an all-distributions promise.

### Implementation order and acceptance

- First fix bootstrap source selection, early diagnostics, managed QMD and fresh-install recovery together. Merely checking `/usr/local` permissions leaves the user to repair the environment and does not meet the goal.
- Then deliver verified release installation, one app + agents command, and the JSON verification/handoff contract. Keep npm publication and project auto-discovery outside this critical path; reuse the broader tasks when their dependencies are reached.
- Follow with prebuilt Desktop/private-runtime distribution to remove machine toolchain setup. A wrapper around today's source builds improves orchestration but cannot deliver a prerequisite-free clean-Mac experience.
- Required scenarios: empty home; compatible existing CLI plus app addition; root-owned global npm prefix; missing/outdated Node; missing native tools; wrong QMD override; custom/pinned installations; paths with spaces; unrelated/stale checkout as cwd; interrupted download/build/index/app install; repeat invocation; corrupt asset; and CLI/app root/version disagreement. Test that a remote-only consumer does not acquire QMD.
- Use disposable homes and synthetic notes for failure tests, plus real local-engine retrieval from the exact packaged artifact. Run a clean macOS account/VM without relying on the developer's PATH/caches, supported Mac architectures, and the advertised Linux targets. Record any untested hardware explicitly. Verify no canonical note changes during add-app/update/retry and preservation during uninstall.
- Success means an authorized agent runs one documented operation, reaches verified requested components with a consistent memory root, and receives an accurate bounded handoff. If prerequisites or host permissions prevent that, return the precise remaining action and resume safely afterward.

### Investigation verification and limits

- Disposable fixture: forced npm/QMD failure after a source fixture install; confirmed missing final manifest and refusal on retry. This simulates a permission error; it does not change or exercise the real global npm prefix.
- Disposable fixture: placed a harmless local installer in an unrelated cwd and confirmed the shell bootstrap executed it. No network download or personal installation was performed.
- Six selected existing tests passed: combined Desktop prerequisites, production Desktop `--check`, public installation entrypoint documentation, exact QMD CLI/SDK validation, incompatible override handling, and distribution QMD-check assets. Command: `node --test --test-name-pattern='Desktop|production Desktop|public install docs|installer QMD check|installer rejects shadowing|supported distribution entrypoints' test/install-scripts.test.js test/desktop-prerequisites.test.js`.
- A broader installer/onboarding run was stopped after successful initial checks because it repeatedly copies the working checkout and was unnecessary for this proposal; no full-suite success is claimed. Tests use fixtures and the checkout's existing built output; they do not establish clean-machine release readiness. No build was run over the unrelated work in progress.
- No source implementation, real installation, remote-memory write, release or publication was performed for this proposal.
