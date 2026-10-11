# Self-maintaining, trustworthy recall

## Goal

Make ordinary remember/recall reliable without requiring users to manage derived indexes. Recover missing/stale indexes incrementally, preserve truthful write outcomes, and avoid empty keyword results caused solely by an absent query term.

## Notes

- Client feedback coverage: 1 (parallel writes), 2 (missing/stale index), 3 (keyword fallback).
- Markdown remains canonical; index repair must not edit memories, initialize guessed roots, change indexing policy, or download models.
- [Incremental indexing](../done/2026-10-10_tasks-semantic-index-reliability.md) already delivered transaction-safe updates, publication recovery, and root locks. Do not reopen those implementations based on older client behavior.
- [Bounded execution](../done/2026-10-11_tasks-bounded-retrieval-execution.md) completed async subprocesses, deadlines, admission, cancellation, and joined index jobs in `1c5f8ad`. Integrate with that seam rather than adding another queue/lock/runner.
- This list owns automatic freshness orchestration, creation-result semantics, and the narrow empty-result fallback. Coordinate fallback effort with bounded execution's query-effort evaluation.
- Keep one engine. No watcher daemon, global cache, job broker, new ranking framework, or automatic whole-memory injection.

## Design direction

- Use one app-owned freshness/ensure-indexed workflow shared by local retrieval and hosted maintenance. Backend locking/publication remain adapter concerns.
- Default ordinary local recall/search to repairing a missing or stale index within a finite operation budget. Offer an explicit no-refresh path for callers that must avoid derived-state writes; status and evidence expansion remain observational.
- Automatic refresh honors existing lexical/semantic policy and provisioned resources without persisting policy or migrating legacy environment settings. The current explicit index operation can write `jumpybrain.json`; add a nonpersisting policy-resolution path for automatic repair. Absent policy means the documented lexical default for that operation only. An incompatible model/policy requiring explicit rebuild is an actionable error/degraded outcome, not permission to rebuild or switch modes silently.
- Hosted freshness is server-local: clients must not issue a mutation command behind a read-only target policy. Reuse the server runner and actual canonical freshness checks.
- Creation and indexing are separate outcomes. Index failure after publication must return the saved document identity and clear pending/failed indexing information, not encourage blind retries.
- Relax keyword matching only after successful strict discovery yields no eligible candidates; report relaxation. Do not use fallback to conceal backend failure or ignore an explicit query constraint.

## Acceptance criteria

- Fresh-clone recall with available supported dependencies builds derived state and finds canonical memories; add/edit/rename/delete after an external change is detected without a manual index command.
- Fresh recall performs no indexing worker/model work. Automatic repairs reuse unchanged content/vectors, never select destructive rebuild by default, and leave canonical Markdown and `jumpybrain.json` byte-for-byte unchanged (or absent), including on failure.
- Repair, query, and fallback share finite deadlines/admission budgets; concurrent changes cannot produce a false fresh result or an unbounded retry loop.
- Read-only filesystems, missing dependencies/models, contention, interrupted repair, and physical corruption yield actionable errors or explicitly partial last-good retrieval, never an apparently complete empty answer.
- A saved memory remains identifiable when indexing fails. Parallel process tests prove no lost/partial canonical writes and no misleading creation failure.
- One-word/short-identifier queries work; a two-word lexical query with one absent term can recover relevant evidence through bounded relaxation. Strict matches retain precedence and temporal/source constraints remain intact.
- Local/runtime/CLI/hosted behavior uses shared seams and preserves compact response caps, provenance, protected-target policy, and existing error compatibility.

## Relevant files

- `src/app/local-memory/{index,freshness,compact}.ts`, `local-memory.docs.md` — freshness and retrieval orchestration.
- `src/app/server-memory/{index,state,auto-index}.ts`, `server-memory.docs.md` — hosted freshness and shared runner.
- `src/adapters/qmd/{qmd-driver,qmd-query,qmd-lifecycle,qmd-execution}.ts`, `qmd.docs.md` — existing lifecycle, query budget, execution controls.
- `src/cli/{memory-write,memory-commands,local-transport,formatting,bounded-reads}.ts`, `src/runtime/index.ts`, `src/types.ts` — write/read contracts.
- `test/{semantic-index-lifecycle,qmd-lock,server-auto-index,memory-cli,recall-fusion,temporal-retrieval}.test.js` — regression seams.

## Automatic-index increment — 2026-10-11

- Implemented `freshness.ts` observational source/policy checks and shared `ensureMemoryIndexed`: validate existing root, recover pending publication, check readiness, then at most one incremental repair. Local runtime/CLI rich/compact recall/search and recipes repair by default; explicit index retains policy persistence/migration. Automatic repair preserves canonical Markdown and `jumpybrain.json` bytes/absence, resolves configured policy or lexical without legacy environment migration, and cannot accept rebuild through extra JS options.
- Repair/query/compact verification share existing search admission/deadline (60 s by default); standalone/hosted ensure uses index budget (600 s). Repair workers use the enclosing deadline, not the query-only 30 s ceiling. Read-only freshness/policy/stat awaits observe cancellation. Source changes during indexing remain partial after inspecting the actual searched generation; no repeated repair loop. Historical failure diagnostics remain visible but do not make successfully recovered sources permanently stale.
- Hosted reads deliberately remain nonrepairing and label stale published evidence. Missing/pending state is an error until maintenance/operator recovery. Automatic ticks inspect actual sources inside the existing joined runner, including external/git-pull changes despite `stale:false`; stop cancels its own joined callers. No hidden client index mutation behind protected remote policy.
- **2.2 remaining contract gap:** runtime `refresh:false` / strict CLI `--no-refresh` disables repair and pending-publication recovery, but retains the existing temporary PID-lock coordination writes. It is **not** a zero-filesystem-write/read-only-filesystem mode. Documented explicitly; do not remove root exclusion to claim the stronger guarantee. Pending nonrepairing reads fail instead of mixing generations.
- **1.1 remaining:** missing/external-change/contention/publication cases covered; saved-before-index-failure semantics belong to 3.0 and are not implemented in this increment. Creation/fallback result contracts remain untouched.
- Regressions cover legacy/empty bootstrap, fresh no-worker/model recall, external add/edit/rename/delete, configured `indexRoot`, semantic vector reuse, policy byte-preservation on success/failure, absent-policy lexical query parity, pending no-refresh preservation, single-attempt concurrent mutation, deadline/lock ownership, blocked readiness and post-discovery policy reads, CLI/recipe opt-out forwarding and compact caps, protected hosted nonrepairing reads, and external hosted changes. Fixed/legacy stale-source tests now explicitly opt out instead of accidentally testing automatic maintenance.
- Verification: `npm test` **766/766 passed**, 0 failures/skips; `git diff --check` passed. Disposable **real provisioned QMD 2.8.3 lexical** smoke passed bootstrap, warm unchanged generation, external edit/rename/delete, compact cap, qualifications, and absent configuration preservation; no installation/download/model inference. macOS POSIX tested. Real semantic inference, Linux/Windows process behavior, permissions/physical corruption, simultaneous creation/repair and broad fallback evaluation remain for 5.0; no global memory write or installed integration update performed.
- Complexity: extracted the existing freshness scan rather than adding persisted state; shared incremental ensure replaces timer reliance on stale flags/manual-index-only local guidance. Reused admission, PID lock, transactional worker and joined runner; no queue, daemon, watcher, cache or ranking change. Retained remote stale fields as compatibility hints and nonrepairing PID-lock writes as explicit debt. Owning docs, CLI recovery/workflow guidance and distributed memory skill updated; task stays active for creation outcomes, keyword relaxation, strict observational mode and remaining stress/platform coverage.

## Tasks

- [/] 1.0 Establish shared freshness behavior
  - [/] 1.1 Read architecture/affected module docs and recheck completed/in-progress work. Reproduce missing-index, external mutation, long contention, and saved-before-index-failure cases with disposable roots.
  - [x] 1.2 Specify automatic versus no-refresh retrieval, operation budgets, failure/partial outcomes, and backward-compatible result fields. Include empty roots, legacy roots, configured `indexRoot`, and semantic policy requiring explicit intervention.
  - [x] 1.3 Extract/reuse actual source/policy freshness checks as an app seam. Avoid a second persisted freshness authority; legacy server stale flags remain hints/compatibility fields, not proof that external files are unchanged.

- [/] 2.0 Ensure derived freshness without new scheduling machinery
  - [x] 2.1 Implement bounded ensure-indexed orchestration using the existing incremental index operation and execution runner. Resolve/validate the root first; index only when needed. Separate read-only policy resolution from explicit policy persistence so automatic repair cannot create/rewrite `jumpybrain.json` or apply environment-driven migration; test absent/legacy policy and failure paths for byte-preservation.
  - [/] 2.2 Integrate ordinary local search/recall, compact reads, and recipes. Keep status/show/expand free of repair side effects and expose no-refresh deliberately, not via undocumented environment behavior.
  - [x] 2.3 Have hosted maintenance inspect actual canonical readiness, including git-pull changes. Reuse the same readiness/repair policy and existing server runner; document whether hosted reads join repair or explicitly serve partial last-good evidence.
  - [x] 2.4 Recheck the searched generation after repair; bound repeated changes and handle cross-process lock contention without adding another lock. Preserve cancellation semantics and pending publication recovery.

- [ ] 3.0 Make successful creation independent of indexing success
  - [ ] 3.1 Audit remember/wrapup and all creation callers; define one shared saved/indexed/pending-or-failed result vocabulary, carrying document ID/path whenever publication succeeded.
  - [ ] 3.2 Return actionable partial-success JSON/text and documented exit behavior on indexing failure. Retrying indexing must not re-create the memory; do not automatically retry an uncertain canonical write.
  - [ ] 3.3 Preserve local/hosted creation differences only where deployment requires them. Let the shared freshness workflow recover later instead of introducing a separate durable indexing queue.

- [ ] 4.0 Add bounded empty-result keyword relaxation
  - [ ] 4.1 Specify which meaningful terms can relax and when; preserve exact identifiers, quoted/negative constraints where supported, and explicit temporal/root/depth scope. Define an honest relaxed-query diagnostic without claiming answer completeness.
  - [ ] 4.2 Reserve capacity within the existing query/deadline budget for demand-driven singleton or equivalent supported lexical fallback. Reuse max fusion and existing candidate/provenance repair; no additive votes, global body scan, or extra mandatory model call.
  - [ ] 4.3 Cover strict-success, strict-empty, absent-token, short-acronym, single-word, stopword-only, unrelated/no-answer, temporal, and backend-failure cases. Use an AND-faithful fixture; current OR-like lifecycle fixtures alone cannot demonstrate this failure.
  - [ ] 4.4 Compare evidence coverage/noise and subprocess cost against the current baseline with frozen query/output budgets. Keep broad/private evaluation outside the product repo; remove fallback variants that do not justify their cost.

- [/] 5.0 Validate recovery and consolidate contracts
  - [/] 5.1 Add deterministic multi-process tests for simultaneous creation/repair/recall, writes during indexing, joined-caller cancellation, publication interruption, external deletion, and permission failures. Reuse bounded-execution fixtures.
  - [/] 5.2 Verify local/hosted/CLI parity, compact budgets, policy protection, no model downloads, and supported real-QMD AND behavior in an explicitly provisioned smoke.
  - [/] 5.3 Update owning module docs, CLI/workflow/recovery guidance, and stable glossary terms only if new vocabulary is necessary. Run `npm test` and record results/platform limits here.
  - [/] 5.4 Remove superseded freshness checks, duplicate retries, and manual-index-only guidance where replaced. Record a short complexity review before completion; no granular planning changelog entry.
