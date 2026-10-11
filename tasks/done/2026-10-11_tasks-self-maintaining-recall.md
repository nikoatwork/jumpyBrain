# Self-maintaining, trustworthy recall

## Goal

Make ordinary remember/recall reliable without requiring users to manage derived indexes. Recover missing/stale indexes incrementally, preserve truthful write outcomes, and avoid empty keyword results caused solely by an absent query term.

## Completion — 2026-10-11

Completed automatic freshness, truthful saved/indexing outcomes, constrained bounded keyword relaxation, and opt-in strict no-derived-write lexical reads. Finalization/archive was approved in the user request. Existing `--no-refresh` compatibility retains lock coordination; new `--read-only` supplies the stricter observational path instead of weakening root exclusion.

## Final results, decisions and verification

- Creation preserves ID/path and returns `saved:true`, compatibility `indexed`, and `indexing.status: indexed | pending | failed`. Local remember invokes nonpersisting shared freshness after publication and verifies the saved ID/path is covered; concurrent stale or unrelated/excluding `indexRoot` generations remain pending, not false indexed success. Runtime/wrapup/hosted writes defer indexing. Post-save indexing, derived bookkeeping, or late replay persistence failure returns explicit exit-zero/HTTP-success partial outcomes, with safe recovery guidance and no canonical retry. Pre-save validation/publication/replay lookup failures still throw. Abrupt crashes/lost responses remain uncertain; Markdown and idempotency storage are not a transaction.
- Strict `readOnly:true` / `--read-only` works across runtime, rich/compact CLI/recipes and hosted reads. It uses pinned QMD lexical APIs on immutable readonly SQLite, never locks/reaps/publishes/migrates/schema-initializes/caches/models. Reject nonempty WAL rather than ignoring committed data; require matching DB/published generations and unchanged file signatures, no locks or pending publication. This is optimistic change detection, not a cross-process snapshot. Semantic omission is explicit. Remote clients preflight observational capability within the same deadline before querying legacy servers; no unsafe ordinary-read downgrade.
- Relaxation spends at most two **unused** slots in the existing eight lexical calls after all successful strict/semantic discovery yields no eligible candidates. All original strict variants remain. Constraints, failures, empty temporal scopes and exact-title navigation suppress relaxation; no additional model call/queue/cache/body scan/ranking framework. `keyword_query_relaxed` means partial topic discovery, not a complete answer. Constrained temporal backfill and excluded exact-title supplements cannot bypass backend rejections; exclusion-word detection is case-safe. Constrained queries omit vector discovery (which cannot enforce lexical exclusions/phrases/identifiers) with an explicit `query_constraints_lexical_only` diagnostic.
- Frozen AND-faithful eight-query, limit-three ablation: supporting hits **2→5**, noise **0→2**, calls **9→20**, corroborated with real provisioned QMD 2.8.3. Partial-topic hits (including the piano-only no-answer distractor) are explicitly noise, not supporting answers; empty fallback costs more, with no latency-efficiency claim. Removed the initially proposed long-query slot reservation because it could lose strict evidence.
- Independent external frozen fourteen-query comparison against **446ebe2**: **28/28 supporting labels, 14/14 decisions, 4/4 explicit no-answer judgments** in both arms; all **22 responses byte-identical**, **31 searches, 8 expansions, 21,695 bytes / 6,536 tokens**, zero cap violations. Noise unchanged (4 adjacent-topic passages, 2 title distractors, 2 qualified abandoned proposals). No query relaxed: strict preservation only, not broad fallback efficacy. Fixed depth/limit/candidate/8192-byte budgets. Report: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/keyword-relaxation-446ebe2.GuXjMX/REPORT.md`; freeze SHA-256 `cec657647d27353faec733e3e3cde8d40b54f449fe25b1c6c1fe01cc3c3d02d1`. Compiled comparison preceded final temporal-exclusion/read-only protocol review fixes; those were independently regression-tested afterward. Broad/private corpus and harness remain outside this repo.
- Final verification: **`JUMPYBRAIN_TEST_QMD_BIN=/opt/homebrew/bin/qmd npm test`: 812/812 passed, 0 failures/skips**; `git diff --check` passed. Ordinary `npm test` skips the explicit provisioned-package smoke when unset. Real QMD **2.8.3 (`facd35e`)**, macOS 15.7.7 arm64, M3 Pro, Node 26.7.0; no installs/downloads or real semantic inference. Native immutable reads matched CLI lexical rows, worked with files `0444`/directories `0555` and absent WAL/SHM, and changed no content/mtime/ctime/directory inventory. Ordinary repair permission denial, nonempty committed WAL and physically corrupt SQLite failed safely. Real temporal quoted/excluded reads retained constraints.
- Deterministic fixtures cover eight concurrent complete canonical saves through failed indexing, simultaneous process creation/indexing/recall with worker barriers, mutation during indexing, joined cancellation, interrupted publication, external deletion, opt-out/readonly HTTP/CLI parity and caps, generation/WAL/lock changes, and actual SIGTERM after save preserving identity and joining child/lock cleanup. Saved memories recovered later without recreation or policy rewriting. Final review found no critical blockers.
- Limits: Linux/Windows descendants/permissions, network filesystems/power loss, real semantic inference under saturation, adversarial external DB writers and corpus-wide fallback quality remain unproven. SQLite immutable mode is intentionally refused when WAL-active; semantic strict reads are deliberately unsupported/degraded, not silently promised. Source-body input/heap and OS-uninterruptible work retain the existing bounded-execution caveats. No global memory write or installed integration change.
- Complexity: reused incremental indexing, one bounded runner, PID exclusion and joined maintenance. Removed stale-flag-only authority, creation failure coupling, duplicate/manual-index-only local guidance and constrained token-backfill bypass. New code is one shared creation outcome helper and post-publication app composition (keeping writing/retrieval modules independent), plus narrowly opt-in immutable QMD worker gates, using the same backend/query fusion, not another engine/index/scheduler. Existing nonrepairing coordination remains compatibility; no watcher, job queue/broker, durable index queue, alternate ranker, cross-request cache, or dependency added. Owning contracts, recovery/workflow/protocol guidance and glossary consolidated.

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
- `src/adapters/qmd/{qmd-driver,qmd-query,qmd-lifecycle,qmd-execution,qmd-worker,qmd-read-only}.ts`, `qmd.docs.md` — existing lifecycle, query budget, execution controls.
- `src/cli/{memory-write,memory-commands,local-transport,formatting,bounded-reads}.ts`, `src/runtime/index.ts`, `src/types.ts` — write/read contracts.
- `src/app/creation.ts`, `src/app/writing/{creation-outcome,local-writer,remote-writer}.ts`, `src/app/server-memory/idempotency.ts` — saved identity and post-save outcomes.
- `test/{creation-outcomes,keyword-relaxation,qmd-read-only,qmd-read-only-real,semantic-index-lifecycle,qmd-lock,server-auto-index,memory-cli,recall-fusion,temporal-retrieval}.test.js` — regression seams.

## Automatic-index increment — 2026-10-11

Historical checkpoint from 446ebe2; all remaining items below were closed by the final results above.

- Implemented `freshness.ts` observational source/policy checks and shared `ensureMemoryIndexed`: validate existing root, recover pending publication, check readiness, then at most one incremental repair. Local runtime/CLI rich/compact recall/search and recipes repair by default; explicit index retains policy persistence/migration. Automatic repair preserves canonical Markdown and `jumpybrain.json` bytes/absence, resolves configured policy or lexical without legacy environment migration, and cannot accept rebuild through extra JS options.
- Repair/query/compact verification share existing search admission/deadline (60 s by default); standalone/hosted ensure uses index budget (600 s). Repair workers use the enclosing deadline, not the query-only 30 s ceiling. Read-only freshness/policy/stat awaits observe cancellation. Source changes during indexing remain partial after inspecting the actual searched generation; no repeated repair loop. Historical failure diagnostics remain visible but do not make successfully recovered sources permanently stale.
- Hosted reads deliberately remain nonrepairing and label stale published evidence. Missing/pending state is an error until maintenance/operator recovery. Automatic ticks inspect actual sources inside the existing joined runner, including external/git-pull changes despite `stale:false`; stop cancels its own joined callers. No hidden client index mutation behind protected remote policy.
- **2.2 remaining contract gap:** runtime `refresh:false` / strict CLI `--no-refresh` disables repair and pending-publication recovery, but retains the existing temporary PID-lock coordination writes. It is **not** a zero-filesystem-write/read-only-filesystem mode. Documented explicitly; do not remove root exclusion to claim the stronger guarantee. Pending nonrepairing reads fail instead of mixing generations.
- **1.1 remaining:** missing/external-change/contention/publication cases covered; saved-before-index-failure semantics belong to 3.0 and are not implemented in this increment. Creation/fallback result contracts remain untouched.
- Regressions cover legacy/empty bootstrap, fresh no-worker/model recall, external add/edit/rename/delete, configured `indexRoot`, semantic vector reuse, policy byte-preservation on success/failure, absent-policy lexical query parity, pending no-refresh preservation, single-attempt concurrent mutation, deadline/lock ownership, blocked readiness and post-discovery policy reads, CLI/recipe opt-out forwarding and compact caps, protected hosted nonrepairing reads, and external hosted changes. Fixed/legacy stale-source tests now explicitly opt out instead of accidentally testing automatic maintenance.
- Verification: `npm test` **766/766 passed**, 0 failures/skips; `git diff --check` passed. Disposable **real provisioned QMD 2.8.3 lexical** smoke passed bootstrap, warm unchanged generation, external edit/rename/delete, compact cap, qualifications, and absent configuration preservation; no installation/download/model inference. macOS POSIX tested. Real semantic inference, Linux/Windows process behavior, permissions/physical corruption, simultaneous creation/repair and broad fallback evaluation remain for 5.0; no global memory write or installed integration update performed.
- Complexity: extracted the existing freshness scan rather than adding persisted state; shared incremental ensure replaces timer reliance on stale flags/manual-index-only local guidance. Reused admission, PID lock, transactional worker and joined runner; no queue, daemon, watcher, cache or ranking change. Retained remote stale fields as compatibility hints and nonrepairing PID-lock writes as explicit debt. Owning docs, CLI recovery/workflow guidance and distributed memory skill updated; task stays active for creation outcomes, keyword relaxation, strict observational mode and remaining stress/platform coverage.

## Tasks

- [x] 1.0 Establish shared freshness behavior
  - [x] 1.1 Read architecture/affected module docs and recheck completed/in-progress work. Reproduce missing-index, external mutation, long contention, and saved-before-index-failure cases with disposable roots.
  - [x] 1.2 Specify automatic versus no-refresh retrieval, operation budgets, failure/partial outcomes, and backward-compatible result fields. Include empty roots, legacy roots, configured `indexRoot`, and semantic policy requiring explicit intervention.
  - [x] 1.3 Extract/reuse actual source/policy freshness checks as an app seam. Avoid a second persisted freshness authority; legacy server stale flags remain hints/compatibility fields, not proof that external files are unchanged.

- [x] 2.0 Ensure derived freshness without new scheduling machinery
  - [x] 2.1 Implement bounded ensure-indexed orchestration using the existing incremental index operation and execution runner. Resolve/validate the root first; index only when needed. Separate read-only policy resolution from explicit policy persistence so automatic repair cannot create/rewrite `jumpybrain.json` or apply environment-driven migration; test absent/legacy policy and failure paths for byte-preservation.
  - [x] 2.2 Integrate ordinary local search/recall, compact reads, and recipes. Keep status/show/expand free of repair side effects and expose no-refresh deliberately, not via undocumented environment behavior.
  - [x] 2.3 Have hosted maintenance inspect actual canonical readiness, including git-pull changes. Reuse the same readiness/repair policy and existing server runner; document whether hosted reads join repair or explicitly serve partial last-good evidence.
  - [x] 2.4 Recheck the searched generation after repair; bound repeated changes and handle cross-process lock contention without adding another lock. Preserve cancellation semantics and pending publication recovery.

- [x] 3.0 Make successful creation independent of indexing success
  - [x] 3.1 Audit remember/wrapup and all creation callers; define one shared saved/indexed/pending-or-failed result vocabulary, carrying document ID/path whenever publication succeeded.
  - [x] 3.2 Return actionable partial-success JSON/text and documented exit behavior on indexing failure. Retrying indexing must not re-create the memory; do not automatically retry an uncertain canonical write.
  - [x] 3.3 Preserve local/hosted creation differences only where deployment requires them. Let the shared freshness workflow recover later instead of introducing a separate durable indexing queue.

- [x] 4.0 Add bounded empty-result keyword relaxation
  - [x] 4.1 Specify which meaningful terms can relax and when; preserve exact identifiers, quoted/negative constraints where supported, and explicit temporal/root/depth scope. Define an honest relaxed-query diagnostic without claiming answer completeness.
  - [x] 4.2 Use spare capacity within the existing query/deadline budget for demand-driven singleton or equivalent supported lexical fallback. Reuse max fusion and existing candidate/provenance repair; no additive votes, global body scan, or extra mandatory model call.
  - [x] 4.3 Cover strict-success, strict-empty, absent-token, short-acronym, single-word, stopword-only, unrelated/no-answer, temporal, and backend-failure cases. Use an AND-faithful fixture; current OR-like lifecycle fixtures alone cannot demonstrate this failure.
  - [x] 4.4 Compare evidence coverage/noise and subprocess cost against the current baseline with frozen query/output budgets. Keep broad/private evaluation outside the product repo; remove fallback variants that do not justify their cost.

- [x] 5.0 Validate recovery and consolidate contracts
  - [x] 5.1 Add deterministic multi-process tests for simultaneous creation/repair/recall, writes during indexing, joined-caller cancellation, publication interruption, external deletion, and permission failures. Reuse bounded-execution fixtures.
  - [x] 5.2 Verify local/hosted/CLI parity, compact budgets, policy protection, no model downloads, and supported real-QMD AND behavior in an explicitly provisioned smoke.
  - [x] 5.3 Update owning module docs, CLI/workflow/recovery guidance, and stable glossary terms only if new vocabulary is necessary. Run `npm test` and record results/platform limits here.
  - [x] 5.4 Remove superseded freshness checks, duplicate retries, and manual-index-only guidance where replaced. Record a short complexity review before completion; no granular planning changelog entry.
