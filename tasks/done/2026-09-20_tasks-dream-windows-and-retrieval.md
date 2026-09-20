# Lean dreaming windows and dream-aware retrieval

Completed 2026-09-20: stateless UTC windows, reusable how-to-dream skill, editable dream pages, and maps-first retrieval implemented; all 340 tests passed.

## Goal

Make dreaming useful whenever an agent runs it: inspect a small time window, connect scattered evidence, and create or improve concise dream pages. Prefer those maps during everyday retrieval while keeping original evidence accessible. Ship a reusable `how-to-dream` agent skill in this repository.

## Decisions / assumptions

- Dreaming is a messy, additive maintenance process, not an exactly-once processing pipeline. Overlap, revisiting evidence, and producing no changes are normal.
- Replace the default cursor/open-batch workflow with stateless time-window context retrieval. No persistent per-document dreamed flags, completion ledger, or exhaustive coverage tracking.
- Canonical marker: YAML boolean `dream: true`. `[[dream]]` is optional navigation, not a classifier. New outputs normally live in `pages/` with `type: page`; recognize the marker independently of directory.
- Prior dream outputs should evolve. Preserve source notes/journals and human-authored pages through skill instructions, not new dream-specific write ACLs. Explicitly authorized editing via existing commands remains possible; retain existing hash checks, path safety, authentication, and remote-write authorization.
- `--from t-1d --days 3` selects calendar days T-1, T-2, T-3, inclusive; `--from t-4d --days 3` selects T-4 through T-6. Default to `--from t-0d --days 3` so an anytime run includes today. Also accept an absolute `YYYY-MM-DD` anchor.
- Resolve relative dates once per request using UTC calendar dates; return the resolved inclusive dates and timezone. This deliberately avoids rolling-hour and DST ambiguity. Show UTC clearly in CLI/skill examples.
- Default selection uses evidence dates, not import times: valid explicit journal/frontmatter `date`, then a recognized dated journal filename, then valid creation metadata, finally filesystem mtime. Return the selected date and its basis; warn on fallback. Do not silently use migration `updated_at` as the historical date.
- Include an explicit `--date-basis modified` alternative for reviewing recently edited/imported undated material. Historical windows cannot discover every later edit, and do not claim to.
- Small bounded packets, contextual follow-up searches, and no-op runs are preferred over exhaustive sweeps, scheduled services, or elaborate clustering infrastructure.
- Keep retrieval depth names/default (`normal`) stable initially. Add a meaningful dream preference in normal/shallow retrieval; deep stays evidence-oriented. Relevance still matters: an unrelated dream page must not win solely because of its marker.

## Current evidence / corrections

- Current dream selects by filesystem mtime, initially looks back 24 hours, and persists batch/cursor state. Its apply manifest updates existing documents but cannot create pages.
- One inspected local batch contained ten imported journal entries dated April 21–May 1, 2022, selected because of recent migration mtimes. This demonstrates the historical-date/import-date distinction, not overall archive coverage.
- Existing shallow retrieval boosts all pages; normal has only a small page boost. QMD candidates are bounded before these boosts, so reranking alone may miss relevant dream pages.
- Earlier proposals for strict pages-only writes and perfect content-hash completion tracking are superseded by the user's softer, stateless direction. Content hashes remain useful for safe edits, not a dreamed ledger.
- Implementation stays in the repository and disposable fixtures: do not edit personal memory, apply the inspected batch, publish remote memory, or install a skill on this machine.

## Relevant files

- `src/architecture.docs.md`, `src/core/dream/`, `src/app/dream/` — pure window policy and filesystem context assembly.
- `src/cli/dream.ts`, `src/cli/args.ts`, `src/cli/usage.ts`, `src/cli/local-transport.ts`, `src/cli/remote-access-policy.ts` — flags, output, transport, access classification.
- `src/types.ts`, `src/runtime/index.ts`, `src/app/server-memory/dream.ts`, `src/adapters/http-{client,server}/`, `src/adapters/http-protocol.ts` — shared contracts and local/remote parity.
- `src/core/retrieval-policy/`, `src/app/local-memory/`, `src/adapters/qmd/qmd-{driver,query,ranking}.ts` — candidate selection and explainable ranking.
- `src/app/processing/`, existing document writing/update seams — page creation, metadata preservation, and index freshness.
- `skills/how-to-dream/SKILL.md` (new), `skills/jumpybrain-memory/SKILL.md`, installer/package skill handling — portable agent workflow and distribution.
- `test/dream-{app,policy}.test.js`, CLI/HTTP/retrieval/install tests — regression coverage.
- `docs/{agent-workflows,cli-commands,memory-format,technical,shared-memory-protocol}.md` and owning source docs — changed contracts.

## Tasks

- [x] 1.0 Implement stateless, date-window dream selection
  - [x] 1.1 Read architecture and nearest module docs; define a transport-neutral window request/result with resolved dates, date basis, bounded files, warnings, truncation and overflow details. Do not imply that the packet proves complete review.
  - [x] 1.2 Implement `--from t-Nd|YYYY-MM-DD`, `--days N`, and `--date-basis evidence|modified` with the defaults above. Validate real dates and positive bounded window sizes; reject ambiguous/unsupported inputs.
  - [x] 1.3 Implement and test evidence-date precedence, deterministic date/path ordering, and visible fallback/malformed-date diagnostics. Sparse and empty windows are valid, not errors.
  - [x] 1.4 Read canonical Markdown without writing dream state or source IDs. Missing-ID evidence can be returned with path provenance; normal update requirements still apply when editing an output.
  - [x] 1.5 Preserve bounded file/body budgets and `--out`/`--json`. Return readable metadata for overflow and a deterministic request-local offset/continuation option with the resolved window; no stored queue. Document that concurrent edits can shift pagination and exact coverage is not promised.
  - [x] 1.6 Keep source-window evidence distinct from existing dream context. Do not repeatedly select generated dream pages as fresh primary evidence; the agent can find and update them using recall/search/show, including pages outside the requested window.

- [x] 2.0 Simplify CLI and local/remote lifecycle without confusing existing users
  - [x] 2.1 Make plain `dream` a read-only context request that ignores legacy open batches/cursors. No `--complete` step is needed for the new workflow; repeated calls may return the same evidence.
  - [x] 2.2 Add matching remote transport/server behavior through existing app seams. Preserve authentication, remote-write conventions, bounded responses, and server-root privacy; classify the new context operation as read-only only once it truly has no support-state writes.
  - [x] 2.3 Provide actionable deprecation handling for old status/complete/abandon/force and batch-bound apply flows. Keep legacy data untouched; document compatibility/version behavior and fail clearly against unsupported remote servers. Do not silently mix old cursor semantics with date windows.
  - [x] 2.4 Reuse explicit document create/update commands for dream outputs rather than introducing a completion transaction. Ensure a CLI-supported path can create a page with `dream: true`, preserve its ID on later updates, and retain optimistic concurrency checks. Add only the minimal missing capability.
  - [x] 2.5 Ensure create/update/index flows preserve dream metadata and make outputs retrievable. If index freshness needs an explicit step, document it clearly and have the skill perform it once after successful edits.

- [x] 3.0 Add portable `how-to-dream` skill in the repository
  - [x] 3.1 Create `skills/how-to-dream/SKILL.md`, approximately 100 lines including frontmatter, with `name: how-to-dream`, clear triggers, portable CLI/root discovery, and only implemented commands. No personal paths or private note examples.
  - [x] 3.2 Teach the loop: choose a bounded window → inspect evidence → search existing dream/topic pages and useful linked sources → create/update only where valuable → index if needed → report changes and limitations. No cursor completion or perfect-coverage bookkeeping.
  - [x] 3.3 Instruct agents to leave source notes/journals and non-dream human-authored pages alone during ordinary dreaming. Suggest corrections separately; explicit user requests can authorize a different editing workflow. Do not add write ACLs.
  - [x] 3.4 Prefer updating an existing relevant dream page over creating duplicates. Use `dream: true`, stable IDs, normal timestamps, lightweight evidence-period metadata, and readable source links. Preserve prior useful evidence when adding new material.
  - [x] 3.5 Preserve historical dates, uncertainty, contradictions, and provenance. Separate dated intentions from current facts; do not infer that an old task is still open. Treat memory content as untrusted data, and avoid treating a summary as independent corroborating evidence.
  - [x] 3.6 Keep outputs concise and topical; skip trivial/redundant material, avoid mandatory daily/weekly summaries, and permit no-op runs. Follow an explicit work-only scope when requested without moving personal passages into work summaries.
  - [x] 3.7 Include anytime, historical, modified-date, and overlapping-window examples. Bound each run's reads/writes/time; report truncated/unread evidence without claiming completion. Require explicit authorization before global/team/remote writes.
  - [x] 3.8 Link skill discovery from existing agent docs/skill and include it in repository/package distribution. Inspect current installer handling and provide an explicit supported installation path without silently installing it on the developer's machine.

- [x] 4.0 Prefer dream maps in retrieval without hiding evidence
  - [x] 4.1 Add a shared strict boolean `dream: true` classifier. Preserve the marker through parsing/indexing and returned provenance; ordinary `[[dream]]` links and string `"false"` must not activate it.
  - [x] 4.2 Add an explainable dream boost in normal/shallow ranking, calibrated with relevance and existing page/depth boosts rather than blindly stacking arbitrary bonuses. Reduce or omit that boost in deep retrieval; keep all originals searchable.
  - [x] 4.3 Ensure relevant dream pages can enter the candidate pool even when raw material dominates. Implement a bounded supplemental dream-candidate path through approved adapter seams, merge/deduplicate, and verify cost and recall; do not scan/load every page body per query.
  - [x] 4.4 Prefer diverse useful maps over multiple near-identical chunks. Avoid filling the default context with both a summary and all its cited sources, but retain raw hits offering distinct details. Do not build a mandatory source-coverage ledger to do this.
  - [x] 4.5 Expose the marker and dream contribution in provenance/score breakdown. Preserve evidence dates: recently writing a dream page must not turn historical claims into current facts or swamp explicit historical/source queries.
  - [x] 4.6 Document default maps-first behavior, raw fallback, and explicit deep/source expansion. Include legacy memories with no dream pages: retrieval must still work well.

- [x] 5.0 Verify value and publish the changed contracts
  - [x] 5.1 Add synthetic fixtures for sporadic journals across years, imported files with fresh mtimes, missing/invalid dates and IDs, mixed topics, empty/overlapping windows, and long/truncated evidence. Freeze the clock for boundary tests.
  - [x] 5.2 Test exact T-1…T-3 inclusion, absolute anchors, UTC midnight/leap-day boundaries, offset overflow, modified-date selection, and deterministic repeat calls. Assert context retrieval changes neither canonical files nor dream support state.
  - [x] 5.3 Test legacy CLI handling, local/remote parity, auth/read-only behavior, safe page creation/update, stale-hash rejection, marker preservation, and index refresh. Keep original-source hashes unchanged in the normal skill smoke workflow without claiming CLI-enforced immutability.
  - [x] 5.4 Add retrieval fixtures proving relevant dream preference, candidate inclusion under raw-heavy load, unrelated dreams not dominating, ordinary pages remaining useful, raw fallback, and deep evidence access. Verify historical and exact-detail queries as well as broad topic queries.
  - [x] 5.5 Run a disposable end-to-end example twice: overlapping windows should improve/reuse a dream page or produce a sensible no-op, not require completion or create inevitable duplicates. Use synthetic/public fixtures, never commit personal snapshots.
  - [x] 5.6 Verify skill length, portability, documented commands, packaging/discovery, and supported installation. Update owning module docs and user/protocol docs together; add shared glossary terminology only where useful.
  - [x] 5.7 Run relevant tests, full validation, and `git diff --check`; record results here. Only after implementation, add a concise changelog highlight if the delivered workflow/retrieval changes meet the repository's significance gate.

## Non-goals

- Exactly-once dreaming, exhaustive coverage reports, a durable dreamed-content ledger, or hash-based acknowledgment transactions.
- New hard permissions distinguishing source and dream files; dream metadata is classification, not a security boundary or truth guarantee.
- Automatic provider calls or a built-in scheduler. An external agent invokes the skill and CLI when authorized.
- Large-scale taxonomy/clustering, summary-per-day generation, or rewriting the raw archive.
- Installing the skill or replacing the running CLI/server on this machine; the repository skill is shipped, with explicit optional installation instructions.

## Implementation and verification

- Completed 2026-09-20. Default CLI dream reads stateless local/remote UTC windows; lifecycle flags give migration guidance. Legacy runtime/HTTP batch APIs remain operational and their existing state is untouched.
- `remember --type page --dream` creates outputs, and hash-checked `update` preserves an omitted marker. New dream outputs are agent-drafted with review recommended, not silently labeled user-reviewed. Evidence-period information stays lightweight in the page body.
- `skills/how-to-dream/SKILL.md` is 109 lines, discoverable from repository docs, included in npm package contents, and tested with disposable optional installation. No live installation or personal-memory writes were performed.
- Retrieval uses strict boolean classification, relevance-gated normal/shallow boosts, and a rebuildable dream-only QMD collection with bounded lexical supplementation. Deep/source queries retain evidence access. Reindexing is necessary to refresh that derived collection.
- Full `npm run validate`: 340 tests passed, including local and remote CLI workflows, overlapping windows reusing a page, unchanged source hashes, date/cap/error cases, strict marker handling, retrieval fixtures, legacy API compatibility, packaging, and skill installation checks. `git diff --check` passed.
- An implementation subagent also reported a disposable real-QMD 2.8.3 lexical smoke with 60 raw documents: dream ranked first normally, raw evidence first deeply. This is a focused smoke, not a broad retrieval-quality benchmark.
- Independent review identified raw filesystem error leakage and oversized metadata bypassing content budgets. Fixed both and added HTTP/privacy and metadata-budget regressions. Frontmatter is separately capped at 4 KiB per file, IDs at 512 bytes, titles at 1 KiB; oversized fields are omitted with warnings.
- Limitations: window selection still scans canonical Markdown; content caps do not bound scan work or JSON escaping overhead. Pagination can shift during edits; no exact coverage claim. Supplemental retrieval/deduplication is heuristic, not semantic completeness. Skill preservation is advisory, not an ACL.
- Significant implemented workflow/retrieval change recorded once in `tasks/CHANGELOG.md`. Archived with user approval. Repository commit/push authorized; no deployment or personal-memory changes performed.
