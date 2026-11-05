# Focused test selection for feature work

Completed 2026-11-05. Added one shared guide for ordinary feature checks and collaboration failure scenarios, routed agent/task/module entrypoints to it, removed duplicated release feature selection, and scoped historical rollout gates to their original work.

Owner request: keep verification lean, route plain-prompt and task-list work to the right checks, and consolidate existing instructions without running full suites for every change. Chromium is the normal shared-editor test surface; native checks follow native boundary changes.

## Tasks

- [x] Review active repository agent, architecture/module, task completion, release and eval instructions and existing collaboration fault controls.
- [x] Consolidate change-based selection and replayable collaboration scenario entrypoints; remove duplicated or unconditional broad instructions.
- [x] Validate links, commands and instruction consistency; record outcome/limits and archive scoped docs for the task commit.

## Review scope

- Local ignored `AGENTS.md`; `docs/task-workflow.md`; `src/architecture.docs.md` and editor/CLI/live/gateway/desktop module docs.
- `docs/release-testing.md`, `docs/lean-beta-releases.md`, collaboration/design guidance, native experience routine, property-test guidance and multiplayer verification proposal.
- Existing scripts/tests, package commands and deferred `tasks-release-testing-at-scale.md`. No tracked CI or contributor guide is present. Historical completed tasks/reports remain evidence, not current test mandates. Installed memory integrations describe product use, not repository development gates; leave them alone.

## Boundaries

Documentation and local agent routing only; no runtime, test assertions, release script or eval rubric changes. Release publication keeps its existing full-suite gate; the deferred broad-release plan stays deferred. No agent delegation requested. Bounded local memory recall returned no relevant passages.

## Decisions

- `docs/testing.md` owns ordinary change-based selection, concrete WebSocket/editor scenario commands, build reuse and short finalization evidence. Chromium is the normal shared-editor surface; native checks follow native boundary changes or native-only failures.
- Local ignored `AGENTS.md` and tracked task/architecture/module/README entrypoints route plain prompts as well as task lists to that guide. The private instruction file remains untracked.
- Release testing retains publication/distribution gates and links to common feature selection. Co-located feature inventories remain available; no test code or assertions were removed. Initial multiplayer proposal/production evidence is explicitly historical rather than an unconditional future merge gate.
- No pending release note: product behavior and release tooling are unchanged.

## Relevant files

- `docs/testing.md`, `docs/task-workflow.md`, local ignored `AGENTS.md` — selection and finalization.
- `README.md`, `src/architecture.docs.md`, CLI/live/browser/gateway/Electron module docs, `docs/collaboration.md` — discovery.
- `docs/{release-testing,lean-beta-releases,design-system}.md`, `test/PROPERTY_TESTING.md`, native eval `RUN.md` — consistent scope and reduced duplication.
- `deep-dives/multiplayer-editing/{architecture-and-verification,production-verification}.md` — historical gate scope.

## Verification and limits

Tested snapshot: base `f2ddfc7` plus this documentation-only change. Validated all 38 added relative links/anchors and 38 referenced script/test paths, checked uncertain-save kind/width/options and the actual intent/restart smoke entrypoint against source, reviewed instruction consistency, and passed `git diff --check`, `git diff --cached --check` and `npm run --silent guard:staged`. No build, runtime suite, browser suite or eval was needed for this documentation change. The command review establishes available entrypoints, not a fresh passing claim for those suites. No automatic test selector, new scenario runner, hooks, install, push or release.
