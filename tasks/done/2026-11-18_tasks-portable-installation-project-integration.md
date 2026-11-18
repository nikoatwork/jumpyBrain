# Portable installation and project-aware integration

## Outcome — 2026-11-18

Completed. A QMD installed beside jumpyBrain in a consuming project is now found automatically (it was missed by v0.3.26, reproduced on the published package), and doctor names the selected engine and its source. Commands and installed skills inside a project use its memory once the user approves it on this device with `jumpybrain project trust`; an unapproved project stops commands with the exact command instead of silently using the personal brain. Agents may save durable project decisions without asking only when the project requests `"capture": "durable"`, the user approves with `--allow-capture`, and that project is the brain selected. The GitHub release CLI tarball is the supported pinned project dependency; npm publication and Git dependency installs are not supported. Footprint was measured (CLI ~21 MiB, engine ~204 MiB, no Electron in CLI installs) and kept as one package; engine advisories are documented and moved to [the QMD 2.9.0 task](../todo/tasks-qmd-2.9-upgrade.md).

New surface and why: `jumpybrain project status|trust|untrust` and device-local `trusted-projects.json` (the only way to approve a project without letting a repository approve itself); optional `capture` in `jumpybrain.json` (the project's side of capture consent).

Remaining limits: untested on a clean macOS account, Intel Mac, Linux hardware/AMD64 and Windows (Linux ARM64 ran in a container); project-local QMD on Linux needs Python and a C/C++ toolchain; Mac app signing/notarization and cross-release credential continuity were not addressed by this list and stay open limits; approval is advisory consent, not a security boundary; a concurrent `trust`/`untrust` race is unhandled. Behavior change: running commands without `--root` inside a folder with an unapproved `jumpybrain.json` (or `memory/jumpybrain.json`) now stops instead of using the personal brain.

## Goal

Make jumpyBrain a reproducible, version-pinnable CLI that works in consumer projects and selects the intended memory without integration-specific workarounds. Minimize installed cost while keeping local and shared-server use first-class.

The November 10 legacy managed git-source upgrade report was resolved by [the focused migration work](../done/2026-11-14_tasks-legacy-managed-upgrade.md), which owns the compatibility repair; this list retains broader distribution, platform, footprint and project-integration work.

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

- `src/adapters/qmd/qmd-cli.ts`, `src/cli/doctor.ts`, `src/adapters/qmd/qmd.docs.md` — engine selection, diagnostics and setup messages.
- `src/cli/{targets,project,project-trust,collaborate,commands,usage,instructions}.ts`, `src/cli/cli.docs.md` — target order, project approval, capture policy, help and agent guidance.
- `src/core/memory-root/index.ts`, `src/core/memory-root/memory-root.docs.md`, `src/types.ts` — shared discovery and the `capture` field.
- `skills/jumpybrain-memory/SKILL.md`, `integrations/pi/jumpybrain-memory.ts` — let the CLI select the brain.
- `docs/{install,cli-commands,local-cli-builds,build-footprint}.md` — supported workflows and measurements.
- `test/{qmd-engine-resolution,project-targeting}.test.js` (new); `test/{cli-error-contracts,cli-target-resolution,memory-cli,onboarding-guidance,onboarding-install}.test.js` (updated).

## Tasks

- [x] 0.0 Deliver agent installation and remaining platform gates before broadening project discovery or npm publication. Focused implementation and verification: [agent installation](../done/2026-11-01_tasks-agent-installation.md).
  - Proof: Linux ARM64 consumer gate in Docker (`node:22`, 2026-11-18): packed CLI + project-local `@tobilu/qmd@2.8.3`, no global qmd → doctor `ok/package`, remember `indexed`, recall returned the note from an approved project without `--root`. `node:22-slim` failed QMD's native build (no Python), now documented.
  - [x] 0.1 Remove implicit current-directory installer execution; add shared early preflight and a machine-readable plan/result contract.
  - [x] 0.2 Provision a pinned local engine in an installer-owned user directory; align installer, runtime, doctor, Desktop and updater resolution. Keep remote-only CLI use independent of QMD.
  - [x] 0.3 Use verified published artifacts by default and make interrupted fresh installation safely rerunnable. Preserve explicit source/ref and existing ownership policies.
  - [x] 0.4 Add one app + agents setup flow, preserve the selected root, and verify actual local retrieval and Desktop readiness before reporting success.
  - [~] 0.5 Complete clean-OS, Intel Mac and Linux hardware gates. Linux ARM64 ran in a container (above), not on hardware. Skipped: clean macOS account/VM, Intel Mac and Linux AMD64/hardware — none available on this machine. Recorded as untested limits.

- [x] 1.0 Establish a reproducible supported distribution
  - Proof: published v0.3.26 release tarball installs from its GitHub URL into a clean consumer (`npm install --save-dev <release .tgz URL> @tobilu/qmd@2.8.3`, 230 MiB with engine); a Git dependency install (`npm install git+file://…#master`) has no `dist/` and no `jumpybrain` binary. A consumer of the current build imports the runtime (181 exports) and runs the CLI.
  - [x] 1.1 Inventory and reproduction: consumer-facing assets are `dist/` (CLI, runtime, served editor/drawing app), installer scripts, `integrations/` (installer + paired Mac update) and `skills/`. Tarball install works without a checkout; Git install is broken by design (no build lifecycle).
  - [x] 1.2 Contract decided: the supported pinned artifact is the CLI tarball attached to each GitHub release (already built, validated and versioned by the release workflow). No npm registry publication (`private: true` stays); Git dependency installs stay explicitly unsupported rather than adding a `prepare` that would run the full editor build with all devDependencies in every consumer.
  - [~] 1.3 Skipped: existing `cli:pack`/`check:package-size`/`local-pack-manifest` already validate the real tarball against required files and budgets; no new build path was added, so there is nothing to consolidate. Clean-consumer install/import was exercised manually (5.1).
  - [~] 1.4 Skipped: no registry publication, so no publish dry-run. Release assets are already produced and checked by `npm run release` (docs/releases.md); the consumer smoke in 5.1 is recorded here rather than adding another release gate.

- [x] 2.0 Resolve the consumer's local engine consistently
  - Proof: `test/qmd-engine-resolution.test.js` (8 tests) — the sibling-package test fails on the old fixed-depth resolver and passes on the new one; published v0.3.26 in a clean consumer with project-local QMD and no global qmd reported the engine missing and failed indexing, while the current build reports `ok/package` and indexes/recalls (macOS arm64 and Linux ARM64 container).
  - [x] 2.1 Order: explicit `JUMPYBRAIN_QMD_BIN` (or authenticated per-operation selection) → nearest `node_modules/@tobilu/qmd` walking up from jumpyBrain's real location (Node package lookup, any depth, never cwd) → `qmd` on PATH. Nearest package wins even when broken or the wrong version, so it fails visibly instead of falling through.
  - [x] 2.2 Runtime, doctor and backend RPC share `selectQmdEngine`; CLI/SDK identity and exact 2.8.3 checks unchanged. Managed installs keep their shim override; installer `qmd-install-check.mjs` validates the same package identity.
  - [x] 2.3 Tests: sibling with spaces in path, nested wrong version, missing SDK, broken metadata, override precedence and bad override, PATH fallback, linked package (incl. `--preserve-symlinks`), remote commands never execute the engine. Windows `.bin/qmd.cmd` path is implemented but untested.
  - [x] 2.4 Doctor shows the selected binary and its source (`JUMPYBRAIN_QMD_BIN`, installed beside jumpyBrain, PATH); setup errors suggest a project-local install. Remote-only consumer (21 MiB, no QMD) ran remote recall to a network error without touching an engine.

- [x] 3.0 Make project targeting and local write approval explicit
  - Coordination (2026-11-02): [connections/targeting](../done/2026-11-02_tasks-brain-connections-and-targeting.md) owns `src/cli/targets.ts` explicit-selector/configured-default resolution and doctor/status source diagnostics. Reuse that resolver when adding trusted project selection; do not create a registry or infer trust from arbitrary repository markers.
  - Proof: `test/project-targeting.test.js` (8 tests) plus 5 updated target tests; real consumer: unapproved project stopped `status` with the trust command, `project trust` switched selection to `trusted-project`, recall without `--root` returned the project note.
  - [x] 3.1 One contract in `targets.ts`, documented in docs/cli-commands.md and taught to agents: `--root/--target-url` → `JUMPYBRAIN_MEMORY_ROOT` → nearest approved project memory from cwd → managed personal root. An unapproved or unreadable nearest project stops commands with the exact trust command; the personal root itself never counts as a project.
  - [x] 3.2 `discoverMemoryRoot` (core, existence-only, shared with recipe discovery) and `jumpybrain project status --json` (effective target, project, approval, capture, personal root). The skill and Pi integration no longer force `--root` for recall/local tools; personal saves keep `--root`.
  - [x] 3.3 `capture: "ask" | "durable"` in the project's `jumpybrain.json` (intent) plus device-local `trust --allow-capture` (approval). Effective `durable` only when both are set and commands here select that project. Never deletion, bulk, personal or remote/team writes.
  - [x] 3.4 `project untrust`; re-trust without `--allow-capture` withdraws capture; approval is keyed by real path (moving needs re-approval); malformed `capture` is rejected by trust and reported by status; malformed approval file fails closed. No credential store or policy framework: one strict JSON file beside the CLI policy config.
  - [x] 3.5 Tested: coexistence with the managed personal brain, explicit flag/env precedence, nested projects (approved outer never covers unapproved inner), recipes (legacy discovery only without a personal brain), collaborate, unreadable folder, malformed files, remote flags rejected. Existing remote read-only policy tests still pass. Claude Code/Codex skill and Pi share the same CLI-side rule.

- [x] 4.0 Reduce installation cost using evidence
  - Proof: measurements in [build footprint](../../docs/build-footprint.md#2026-11-18-consumer-install-cost-and-advisories).
  - [x] 4.1 Measured (macOS arm64): CLI tarball 3.2 MB / 8.9 MB unpacked; consumer `node_modules` 21 MiB (half esbuild); no Electron installed; startup 0.05 s with no QMD/ws/esbuild/browser loading; engine ~204 MiB. Audit: 0 runtime advisories for the CLI, 17 dev-only (Excalidraw), 9 on the engine path fixed by QMD 2.9.0. The client's own audit JSON was not available; reachability assessed from our usage.
  - [~] 4.2 Skipped: no dev/test artifacts are shipped (0 source maps/tests/evals); browser and esbuild already load lazily; engine-free remote install documented and verified. No upstream lightweight QMD variant exists (see 2026-11-17 evaluation).
  - [x] 4.3 Decision: keep one package. The CLI is already ~21 MiB; splitting `integrations/` or making esbuild optional saves little and adds a release matrix. The engine is the real cost and needs an upstream QMD change.
  - [x] 4.4 Residual risk documented: engine advisories (simple-git, MCP server, zod, glob libs) are not on paths jumpyBrain uses. A QMD 2.9.0 move changes the exact pin checked by installer, doctor, Desktop and the hosted image, so it needs its own migration task; no `audit fix --force`.

- [x] 5.0 Validate and simplify the installation experience
  - [x] 5.1 Clean consumer smokes: published v0.3.26 from its GitHub URL (reproduces the missing-engine bug); current build with project-local QMD on macOS arm64 and Linux ARM64 container (doctor, remember, recall, trust); remote-only consumer without QMD. Managed install/update/uninstall paths were not changed; their existing tests (`install-scripts`, `onboarding-install`) pass. Untested: npm registry, Windows, Intel Mac, clean macOS account.
  - [x] 5.2 Updated docs/install.md (project memory, pinned project dependency, project-local QMD, Linux toolchain), docs/cli-commands.md (target order, approval, capture), docs/local-cli-builds.md, docs/build-footprint.md, skill, `instructions --topic recall|write`, Pi prompts, and module docs (cli, qmd, memory-root).
  - [x] 5.3 `npm test`: 2,114 tests, 2,112 passed, 0 failed, 2 skipped (2026-11-18, final working tree); `check:package-size` within budget (3,217,703 B archive, 772 files); `git diff --check` clean. Complexity: one shared discovery helper (`discoverMemoryRoot`, now also behind recipe `findMemoryRoot`), one resolver (`selectQmdEngine`), one small approval file module; no packaging experiments or duplicate helpers added.
- Proof (5.0): consumer smokes and suite results above.
- Review: three rounds with an independent reviewer from another provider. Fixed: collaborate bypassing approval, capture reported for a project the write would not target, unreadable project folders falling through to the personal brain, trusting the personal root, writing approval before a manifest error, `--preserve-symlinks` lookup, a broken nearest QMD package falling through to PATH, recipes quietly using the personal brain next to an unapproved project, `project status` crashing on unreadable folders, legacy recipe discovery becoming strict, and engine errors misnaming the selected engine. Declined: a lock against concurrent `trust`/`untrust` (one-off human command, file stays valid), Pi's explicit `--root` for `JUMPYBRAIN_MEMORY_ROOT` (harmless, unchanged behavior), and treating a `@tobilu/qmd` folder without `package.json` as a package. The last engine-message fix (round 3) was verified by the full suite rather than a fourth round.

## Decisions

- No npm registry publication; the GitHub release CLI tarball is the pinned artifact. Git dependency installs stay unsupported.
- Engine lookup never starts from the current directory, so a cloned repository cannot supply an executable engine.
- An unapproved project memory **stops** commands instead of falling back to the personal brain. This is a visible behavior change for anyone running commands inside a folder holding `jumpybrain.json` or `memory/jumpybrain.json` (including this checkout's ignored root `jumpybrain.json`); they approve it or pass `--root`.
- Approval lives in `trusted-projects.json` beside the CLI policy config, not in `cli-config.json`, so older CLIs reading that strict file are unaffected.
- Approval is advisory consent like the remote read-only guard; agents are told never to run `project trust`. A concurrent trust/untrust race was declined as out of scope for a one-off human command.
- Capture is effective only for the brain actually selected in the current directory.
- The skill stays under its 5,500-byte budget: one line in the skill, details in `instructions --topic recall|write`.
- QMD 2.9.0 is deferred to its own migration task.

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
