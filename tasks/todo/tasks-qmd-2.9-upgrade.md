# Move the local search engine to QMD 2.9.0

## Goal

Clear the 9 runtime-path advisories in the pinned engine (2 critical, 7 high: simple-git via node-llama-cpp, QMD's MCP server, zod, fast-glob/micromatch/picomatch) by moving from `@tobilu/qmd@2.8.3` to `2.9.0`, which fixes all of them, without breaking existing installations.

## Evidence

- Measured 2026-11-18 with `npm audit --omit=dev` on a copy of `scripts/engine` ([build footprint](../../docs/build-footprint.md#2026-11-18-consumer-install-cost-and-advisories)). None of the flagged paths is known to be reachable from jumpyBrain (no MCP server, no llama.cpp git builds at runtime, fixed glob patterns), so this is hygiene, not an incident.
- The exact version `2.8.3` is pinned in `src/adapters/qmd/{qmd-cli,qmd-worker,qmd-graph-worker,qmd-read-only}.ts`, `scripts/qmd-install-check.mjs`, `scripts/engine/package{,-lock}.json`, installer/Desktop engine provisioning, the hosted Dockerfile and docs. Doctor and runtime reject any other version, so existing 2.8.3 engines stop passing the moment the pin moves.

## Tasks

- [ ] 1.0 Check QMD 2.9.0's changelog and SDK surface used by jumpyBrain (transactional SDK, `store.js`, `llm.js`, CLI output formats, index schema). Decide whether 2.8.3 indexes are reused or rebuilt.
- [ ] 2.0 Decide the migration: accept both versions for a transition, or move the pin and have the installer/updater/Desktop provision 2.9.0 automatically before the new CLI requires it. Projects that installed QMD beside jumpyBrain need a clear doctor message.
- [ ] 3.0 Update pins, lockfiles, installer, hosted image and docs together; rerun `npm test`, `npm run smoke:semantic-index`, `npm run smoke:hosted` and the installer/update smokes.
- [ ] 4.0 Re-run the engine audit and record the result; add a release note.
