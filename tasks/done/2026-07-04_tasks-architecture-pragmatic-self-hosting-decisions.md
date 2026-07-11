# Architecture Pragmatic Self-Hosting Decisions

## Goal

Close the remaining architecture hardening follow-ups with pragmatic decisions for a lean, source/installer-first, self-hostable package. The layered `cli`/`app`/`core`/`adapters`/`runtime`/`server` layout is validated and should be preserved without over-engineering for npm publication or replaceable retrieval backends.

## Notes

- Deep scan validation on 2026-06-24 covered the earlier CLI/runtime modular refactor.
- Repository architecture cleanup was squash-merged on 2026-07-04 and validated with `npm test` plus `npm run cli:pack`.
- Completed cleanup moved QMD, HTTP client/server, logging, and package metadata under `src/adapters/`; local/server use cases under `src/app/`; canonical Markdown and writing policy under `src/core/`; and CLI command handling under focused `src/cli/` modules with `src/cli.ts` as a shim.
- Avoid broad rewrites. Each task should preserve current CLI/server behavior and deterministic tests.

## Relevant Files

- `src/cli.ts` - Executable shim only; do not add command behavior here.
- `src/cli/commands.ts`, `src/cli/targets.ts`, `src/cli/memory-target.ts`, `src/cli/local-transport.ts` - CLI command routing and target selection seams.
- `src/runtime/index.ts` - Public local runtime surface.
- `src/server/index.ts` - Public server boundary that composes server-memory app operations and re-exports the HTTP adapter surface.
- `src/app/server-memory/` - Server-local memory use cases for status, index, search/recall, writes, idempotency, and auto-index state.
- `src/adapters/qmd/qmd-cli.ts` - QMD binary resolution lives here; app/core/CLI should not import QMD internals directly.
- `package.json` - No `exports` map yet; before publishing, decide what public import surface is intentional.
- `scripts/local-pack-manifest.mjs` - Validates packed files; can be extended to check public exports.
- `test/architecture-boundaries.test.js` - Enforces layer graph, module docs, stale-path guards, and CLI/core/server boundaries.
- `test/server-boundary.test.js` and `test/server-memory-app.test.js` - Server boundary and server-memory app coverage.
- `docs/technical.md` and `src/architecture.docs.md` - Keep public architecture notes and local module-map docs aligned.

## Findings

- **No blocker:** Current local CLI/runtime/server behavior is validated and package contents are coherent.
- **Resolved:** CLI target selection and remote routing are now implemented through CLI target/transport seams rather than local-root-only command parsing.
- **Resolved:** QMD is encapsulated under `src/adapters/qmd/` and binary resolution supports `JUMPYBRAIN_QMD_BIN`, bundled/package binary if available, then PATH `qmd`.
- **Closed by decision:** `createServerMemoryRuntime({ root })` keeps exposing the caller-provided, trimmed root string. Runtime operations already resolve/status roots where needed; adding async canonicalization would add ceremony without improving the self-hosted VPS path. Empty roots remain invalid.
- **Closed by decision:** Do not add a restrictive `package.json` exports map now. jumpyBrain is source/installer-first, not npm-package-first; the CLI, installer scripts, documented server deployment flow, and Markdown format are the supported public surfaces. Internal TypeScript paths are not documented SDK contracts.

## Tasks

- [x] 1.0 Define CLI target selection and remote routing seams
  - [x] 1.1 Add a small target-selection type, e.g. `LocalTarget | RemoteTarget`, in a CLI-owned module such as `src/cli/targets.ts`.
  - [x] 1.2 Refactor CLI command handlers so they resolve a target before requiring `--root` directly.
  - [x] 1.3 Preserve existing local behavior: `--root` remains required for direct local commands, and `run memory:*` still discovers roots.
  - [x] 1.4 Route implemented remote commands through `--target-url`/`--remote-url` and the HTTP client adapter.
  - [x] 1.5 Add deterministic tests proving local and remote command routing remains explicit and does not fall through to QMD/local-root errors.

- [x] 2.0 Harden QMD binary resolution for local and server installs
  - [x] 2.1 Update `src/adapters/qmd/qmd-cli.ts` to resolve QMD in a documented order: `JUMPYBRAIN_QMD_BIN`, bundled/package binary if available, then PATH `qmd`.
  - [x] 2.2 Keep current PATH behavior working for source installs.
  - [x] 2.3 Improve the missing-QMD error to mention local runtime/server install context and the supported override env var.
  - [x] 2.4 Add unit tests for binary resolution that do not require invoking real QMD.
  - [x] 2.5 Update `docs/install.md` and `docs/technical.md` with the final QMD resolution order.

- [x] 3.0 Strengthen server boundary semantics and tests
  - [x] 3.1 Decision: `createServerMemoryRuntime({ root })` exposes the caller-provided, trimmed root string; operations use existing core status/resolution behavior rather than an async canonicalization layer.
  - [x] 3.2 No code change needed; `src/server/index.ts` stays a thin composition boundary.
  - [x] 3.3 Existing tests already cover empty-root rejection through runtime behavior and server-memory/status flows; add more only when a real server-root bug appears.
  - [x] 3.4 Existing `test/server-boundary.test.js` and `test/server-memory-app.test.js` cover representative server boundary and app behavior sufficiently for now.
  - [x] 3.5 HTTP/auth/daemon work remains out of scope for this decision.

- [x] 4.0 Decide the public import/package surface
  - [x] 4.1 Decision: do not publish to npm and do not design around npm package consumers now.
  - [x] 4.2 Do not add a restrictive `package.json` `exports` map; keep source/installer workflows simple and transparent for self-hosters.
  - [x] 4.3 QMD remains a required adapter implementation and is not an existential abstraction to swap out, but CLI/core/HTTP route boundaries still must not bypass app seams.
  - [x] 4.4 Existing local pack validation is enough for the installer/source distribution path.
  - [x] 4.5 Documented the source/installer-first distribution decision in `docs/technical.md`.

## Completion Note

Finalized on 2026-07-04 by decision rather than more refactor work. No major implementation remains here: keep the lean layered architecture, avoid npm-public-surface work until explicitly needed, preserve QMD as the required local retrieval adapter, and optimize for source/installer-based self-hosting on a VPS.

## Non-Tasks

- Do not build the hosted HTTP API here.
- Do not split into multiple published npm packages here.
- Do not replace QMD or add a keyword fallback here.
- Do not change canonical Markdown memory format.
