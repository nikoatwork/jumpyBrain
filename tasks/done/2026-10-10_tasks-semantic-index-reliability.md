# 1 — Reliable, incremental semantic indexing

Completed and archived 2026-10-10; all tasks verified below.

## Goal

Keep semantic retrieval available across routine local/server indexing while avoiding unnecessary rebuilds and exposing failures honestly. Preserve canonical Markdown and a recoverable last-good index.

## Notes

- Approved for planning on 2026-10-10. Direction: [product vision](../../docs/product-vision.md); evidence: [retrieval review](../../deep-dives/retrieval-product-review/findings.md#1-make-semantic-retrieval-efficient-and-observable).
- Priority: first foundational ticket. No prerequisite. Coordinate the adapter execution seam with [ticket 4](../todo/tasks-bounded-retrieval-execution.md); this ticket owns indexing lifecycle/readiness, not asynchronous subprocess scheduling.
- Baseline at planning: indexing deleted QMD cache/config, published the manifest before QMD succeeded, and generated embeddings only when the environment enabled them. Search failures could be swallowed as empty results. Replaced by the lifecycle documented below.
- Keep one engine and one server process per memory root. No new vector store, background model service, or automatic model download as a side effect of recall.
- Deployment packaging fixes, browser conflict handling, permissions, and remote Mac-companion support are separate from these five retrieval tickets.

## Bigger picture and simplification

- Optimize the whole local/shared memory system: correct evidence per token, temporal trust, responsiveness, and easy operation—not feature count.
- Give explicit credit for fewer independent code paths, duplicated policies, configuration knobs, dependencies, and maintenance steps. Prefer replacing obsolete machinery to layering another system beside it; no arbitrary lines-deleted target or unrelated cleanup campaign.
- Preserve supported contracts, recovery, security, and useful regression coverage. Remove genuinely dead code and stale docs; do not call a safety check or necessary compatibility path dead without checking callers.

## Acceptance criteria

- Completion includes a short complexity review: what was removed/consolidated, what new machinery remains and why, and any retained compatibility debt. Added complexity must earn its place by meeting the goal; net simplification is a positive outcome alongside correctness and efficiency.
- Routine updates preserve reusable QMD state/vectors; unchanged input performs no unnecessary embedding work. Adds, edits, renames, deletes, and dream-marker changes become searchable correctly.
- Embedding policy survives process restarts and later index commands. A successful lexical update cannot silently claim complete semantic coverage.
- Failed/interrupted updates do not publish a fresh manifest over a failed index or destroy the only recoverable last-good generation. Concurrent writes leave freshness stale until actually covered.
- Local and remote callers distinguish a genuine empty result from backend failure, partial fallback, incomplete embeddings, or stale state; credentials and host paths never leak.
- Full rebuild and deletion of derived state remain supported recovery paths without changing Markdown or losing configured policy.

## Relevant files

- `src/adapters/qmd/{qmd-cli,qmd-driver,qmd-query}.ts`, `qmd.docs.md` — lifecycle, QMD capabilities, candidate errors.
- `src/app/local-memory/index.ts`, `src/app/server-memory/{index,state,auto-index}.ts` — orchestration and freshness.
- `src/core/memory-root/`, `src/types.ts`, `src/runtime/index.ts` — compatible root configuration and public types.
- `src/cli/{doctor,memory-commands,local-transport}.ts`, HTTP client/server adapters — status and failure propagation.
- `test/server-auto-index.test.js`, `test/server-memory-app.test.js`, `test/memory-cli.test.js`, `test/server-http.test.js` — regression seams.

- New lifecycle owners: `src/adapters/qmd/{qmd-lifecycle,qmd-worker}.ts`; shared installer check: `scripts/qmd-install-check.mjs`.
- Deterministic coverage: `test/{semantic-index-lifecycle,semantic-index-seams,qmd-lock}.test.js`, `test/fixtures/fake-qmd-lifecycle/`, and shared `test/fake-qmd-helper.js`.
- Explicit provisioned smoke: `scripts/semantic-index-smoke.mjs` (`npm run smoke:semantic-index`).

## Completion evidence and decisions

- Pinned **@tobilu/qmd 2.8.3 (`facd35e`)** for runtime and supported installer paths. CLI and SDK must belong to the same installation. Read-only package validation gates both indexing and normal search; installer checks do not load models.
- QMD investigation: CLI update/embedding is not a whole-generation transaction; skipped/failed embeddings can exit successfully. Upstream blank-file scans can retain stale text, and pending-hash counts can miss absent vectors. The adapter therefore ingests the exact canonical snapshot through the pinned SDK, verifies vector metadata against actual vector IDs, and uses one SQLite transaction. No routine database/corpus copy or dream-file staging remains.
- Persisted `jumpybrain.json.indexing`: lexical default, or provisioned absolute-local-GGUF semantic policy (`index --semantic-model`); optional SHA-256 pin. Legacy truthy `JUMPYBRAIN_QMD_EMBED` requires local `QMD_EMBED_MODEL` on first migration only. Subsequent runs honor configuration, not transient environment. Remote clients may request rebuild but cannot set host policy/model paths.
- Routine and full rebuild share ingestion/commit/publication. Full rebuild reconstructs documents/content/FTS and embeddings; changing model identity requires it. Generation metadata commits inside SQLite before atomic JSON publication. Pending publication recovers the actual committed manifest, preserving failure diagnostics until successful indexing.
- Root-wide publication/search exclusion has a five-second busy bound; concurrent reads wait or error rather than mixing generations. Dead-owner reclamation has an ownership-safe regression. Canonical writes during indexing leave readiness stale. Server write-freshness mutation now uses one serialized atomic state owner.
- Additive runtime/CLI/HTTP diagnostics distinguish freshness, supported modes, embedding coverage, failures and partial query fallback. Readiness refers to the searched generation while locked. Total backend failure throws before title supplements. `/health` remains content-free liveness-only.

### Baseline and real-QMD verification

Disposable upstream QMD lexical baseline, five notes: initial collection index **113 ms**, no-op **100 ms**, edit **102 ms**, mutation update **105 ms**. Source inspection established that the former app discarded reusable state on every run; default environment-off operation had no semantic coverage. These raw-QMD timings are not directly comparable to the app smoke below. Synthetic vector-storage probes established transaction rollback/locking behavior, not semantic quality.

Final provisioned production-path smoke: **macOS arm64, Node v26.7.0, QMD 2.8.3**, three initial files (two nonblank), local embeddinggemma Q8_0, 333,590,944 bytes, SHA-256 `b5ce9d77a3fc4b3b39ccb5643c36777911cc4eb46a66962eadfa3f5f60490d63`. Network/model downloads were blocked. Selected single-run wall times:

| Operation | Time | Work |
| --- | ---: | --- |
| Initial semantic index | 1,640 ms | 3 added; 2 chunks embedded |
| No-op / authenticated HTTP no-op | 379 / 378 ms | 3 unchanged; 0 embedded |
| One-file edit | 1,519 ms | 1 updated; 1 embedded |
| Rename / deletion | 379 / 377 ms | correct path reconciliation; 0 embedded |
| Dream marker on / off | 1,577 / 388 ms | same-content reuse; 1 / 0 embedded |
| Full rebuild after removed FTS rows | 1,542 ms | 2 reconstructed; 1 embedded; lexical hits restored |
| Failed model rebuild / recovery | 224 / 433 ms | committed SQL and manifest unchanged; retry 0 embedded |
| SIGKILL worker / recovery | 224 / 405 ms | transaction rolled back; retry 0 embedded |

A paraphrase with **zero lexical-control hits** found the cardiac-health note through semantic retrieval. Local runtime, server app, and authenticated HTTP returned the same JSON-normalized evidence/readiness; semantic search took 2,178 / 2,235 / 2,198 ms respectively. The unrelated circuit note also appeared below it: this is availability/parity evidence, **not a relevance benchmark**. HTTP results omitted host/model paths. The full smoke passed in 17,964 ms. No corpus-wide efficiency extrapolation.

Reproduce outside normal tests, after explicitly provisioning dependencies:

```sh
JUMPYBRAIN_QMD_BIN=/absolute/path/to/qmd \
JUMPYBRAIN_SMOKE_MODEL=/absolute/local/embedding.gguf \
JUMPYBRAIN_SMOKE_SIGKILL=1 npm run smoke:semantic-index
```

### Regression results and remaining limits

- Implementation `npm test` after cleanup: **624 passed, 0 failed, 0 skipped**, approximately 20.9 seconds. Archive-time integration rerun against the newly committed maintenance work: **667 passed, 0 failed, 0 skipped**, approximately 22.5 seconds; adapted its two old fake-QMD indexing fixtures to the shared pinned-package helper without changing maintenance behavior. Includes fake-QMD lifecycle/failure/publication/model/version tests; two-reclaimer locking; local/remote/CLI diagnostics; installer/package and existing retrieval regressions.
- Independent focused follow-up review: all five discovered lifecycle issues resolved; 23 focused tests passed. Fixes cover lock reclamation, full lexical rebuild, generation-matched readiness, normal-query version gating and configured model digest compatibility.
- Packaging validation checked 135 required artifacts, including worker/lifecycle and installer helper. `git diff --check` passed. No live VPS or Docker build was run; the pre-existing missing editor-build script in Docker's build stage remains separate deployment work.
- Process SIGKILL rollback was tested on macOS, not power loss, disk exhaustion/corruption, Windows, Linux native inference or network filesystems. SQLite uses FULL synchronization, but JSON publication lacks explicit file/directory fsync. QMD initializes schemas before the generation transaction; pinning avoids untested schema upgrades.
- A crash inside the rare lock-reclaimer claim/unlink window can require manual abandoned-lock removal **after stopping all root operations**. Immutable per-owner reclaim tombstones intentionally remain derived. PID reuse can conservatively cause busy errors.
- Freshness uses canonical/source and model stats, not an adversarial filesystem-integrity proof or an immutable snapshot of external edits. Status performs no inference but scans paths/stats; query latency remains synchronous. Worker input contains a corpus snapshot and its response has a 64 MiB cap. Scheduling/bounded execution remains ticket 4, not hidden background work here.
- Physical SQLite corruption requires stopped-root derived-state deletion, not in-place rebuild. Markdown, root policy and provisioned model survive that deletion; other disposable replay/log state does not. No glossary addition: existing public concepts were sufficient.

### Complexity review

- **Removed/consolidated:** destructive cache/config rebuild per index, dream snapshot copies and their stale-copy reconciliation, repeated CLI collection/update orchestration, per-run environment policy, silent ordinary query failures, duplicate failure recording and racy server freshness read/write logic. Tests now share one fake pinned package rather than pretending standalone scripts support transactional indexing.
- **New machinery earned by the contract:** one isolated, pinned SDK writer for atomic rollback and verified embeddings; one lifecycle/publication/lock owner; persisted policy plus additive safe readiness; narrow installer capability check and deterministic transactional fixture. Routine and rebuild reuse the same ingestion and publication, with no second engine/service or whole-database snapshot per update.
- **Retained debt:** version-specific QMD internal operations/SQL must be retested before upgrading; legacy manifests remain readable with unknown semantic coverage; server `index` freshness fields remain for response compatibility alongside shared readiness. PID recovery limitations and synchronous subprocess/corpus-snapshot costs are explicit above. This is a correctness-driven net addition of code, not a claim of fewer lines.

## Tasks

- [x] 1.0 Establish the supported lifecycle contract
  - [x] 1.1 Read `src/architecture.docs.md` and affected co-located docs; inspect the supported QMD version's update, deletion, embedding reuse, and database-lock behavior in a disposable root.
  - [x] 1.2 Record baseline no-op/edit/full-index work and semantic availability. Use fake-QMD lifecycle fixtures for CI and an explicitly provisioned real-QMD smoke outside normal tests.
  - [x] 1.3 Define routine update versus explicit rebuild and recovery boundaries. Select a pinned QMD version or explicitly tested version range; align supported installation paths and runtime capability checks, rejecting incompatible lifecycle operations clearly. Persist non-secret indexing policy in root configuration, not disposable caches; migrate legacy environment-only behavior explicitly and preserve compatibility checks.

- [x] 2.0 Implement reusable, recoverable indexing
  - [x] 2.1 Reuse QMD collections and unchanged embeddings during routine updates. Handle deletions, renames, retrieval-only `indexRoot`, and derived dream snapshots without indexing excluded files or stale snapshot copies.
  - [x] 2.2 Track embedding policy/model compatibility and incomplete coverage; changing policy or model requires explicit work rather than silently mixing incompatible vectors.
  - [x] 2.3 Implement the smallest safe publication/recovery strategy supported by QMD. Publish manifest/freshness only after success; retain recoverable last-good state across failures. Do not copy/re-embed the whole corpus on every routine update merely to simulate incrementality.
  - [x] 2.4 Serialize conflicting index jobs, preserve writes-during-index freshness semantics, and test concurrent reads against the chosen snapshot/locking policy. Keep explicit full rebuild available.

- [x] 3.0 Expose readiness and failures
  - [x] 3.1 Represent freshness, available retrieval modes, embedding coverage, and last indexing failure separately; lexical-only can be intentional, not necessarily an outage.
  - [x] 3.2 Propagate query execution outcomes through runtime/CLI/HTTP: partial lexical fallback is labeled; total backend failure is an error, not “no memories.” Title supplements must not conceal an outage.
  - [x] 3.3 Make `status`/`doctor` useful without launching expensive model work. Return compact safe diagnostics, retaining existing response compatibility; keep public `/health` content-free and liveness-only.

- [x] 4.0 Validate and document
  - [x] 4.1 Cover no-op updates, all file mutations, failed embedding/update stages, interrupted publication/restart, policy persistence, unsupported versions, and concurrent writes with deterministic tests.
  - [x] 4.2 Verify local/hosted parity and a provisioned real-QMD incremental/semantic recovery smoke against the selected version/range; record actual work and timings without extrapolating general savings.
  - [x] 4.3 Update owning module docs, CLI/protocol/config contracts, and VPS guidance with persistent semantic setup and recovery. Add glossary terms only for newly stable public concepts.
  - [x] 4.4 Run `npm test`; record results and any untested crash/platform limits here before completion.
  - [x] 4.5 Consolidate obsolete rebuild-only orchestration, duplicate readiness bookkeeping, and superseded error-swallowing paths. Keep one owner for lifecycle policy and share mechanisms between routine update/rebuild where safe; remove unused helpers, fixtures, and stale docs after checking callers. Record the complexity review and rerun affected tests after cleanup.
