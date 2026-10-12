# Recall format trade-offs and selective-read guidance

Completed 2026-10-12: clarified format trade-offs, safe selective reads, and Markdown authoring guidance; integrated verification passed (854 tests, 1 skipped). User approved finalization and archiving.

## Goal

Make agent-facing guidance accurately distinguish bounded recall from smaller recall, and describe workable follow-up reads without weakening source-version checks.

## Notes

- User authorized implementation after reviewing production feedback that compact packets can exceed text output at small result counts.
- Preserve CLI flags, packet V1, canonical Markdown, mandatory expansion hashes, and explicit recall. No automatic format switching or whole-document fallback.
- Compact reuses existing excerpts; increasing its aggregate budget does not enlarge an individual excerpt. Plain text supplies citations but not verified ID/hash expansion handles.
- Domain-specific Do/Say labels are not generic retrieval policy. Recommend ordinary Markdown structure without requiring a particular template.
- Ownership: this task owns user/workflow documentation, distributed skill, glossary, and instruction text/tests only. Other agents own excerpt policy and interaction-cost tests.
- User approved finalization, archiving, and the scoped completion commit on 2026-10-12. No memory writes or integration reinstall authorized. Keep granular progress here, not in the changelog.

## Relevant Files

- `docs/{agent-workflows,cli-commands,memory-format}.md` — supported formats, follow-up workflow and source structure.
- `skills/jumpybrain-memory/SKILL.md` — distributed agent guidance.
- `src/cli/{instructions.ts,cli.docs.md}` — generated agent instructions and owned contract.
- `glossary.md` — bounded recall and guarded expansion language.
- `test/recall-guidance.test.js` — source-based generated/distributed guidance checks without rebuilding shared `dist`.
- `tasks/CHANGELOG.md` — concise completed-result entry required by repository finalization policy.

## Tasks

- [x] 1.0 Verify and clarify existing contracts
  - [x] 1.1 Read architecture/module docs and current guidance; identify misleading economy or text-to-expand claims.
  - [x] 1.2 Explain compact's aggregate byte bound, metadata overhead at small limits, unchanged excerpt size, and byte-versus-token distinction without prescribing a universal best format.
- [x] 2.0 Make follow-up guidance executable and safe
  - [x] 2.1 Distinguish text citations/local range reads from verified compact ID/hash expansion; document prerequisites and same-target behavior without adding a new mode.
  - [x] 2.2 Explain whole-line/section expansion limits and recommend real headings/paragraphs for independently useful qualifications. Do not encode business-specific label preferences.
  - [x] 2.3 Update distributed/generated guidance and glossary only where useful, avoiding repeated contracts.
- [x] 3.0 Verify and record
  - [x] 3.1 Update/run focused instruction or skill tests if needed; review examples against implemented CLI contracts.
  - [x] 3.2 Record changed files, checks, remaining limits, and complexity review. Mark task status accurately; parent runs integrated suite.

## Implementation notes

- Verified `src/architecture.docs.md`, `src/cli/cli.docs.md`, CLI bounded-read parsing/serialization, compact source verification, canonical expansion, and plain formatting before edits. Existing guidance implied compact-first economy and did not distinguish plain citations from guarded expansion prerequisites.
- Clarified format trade-offs without changing flags, packet V1, the 1,000-character per-excerpt bound, source-version hashes, or whole-document fallback policy. Byte budgets include metadata/escaping/LF, not token guarantees.
- Text follow-ups: narrower recall or a local current-file range read after resolving the actual root/indexRoot; not version-verified. Guarded hosted/local follow-ups: reacquire compact evidence on the same target and require available canonical ID/hash handles. Never fabricate hashes or stamp IDs during reads.
- Source structure: real headings, separate independently useful paragraphs/qualifications, manageable lines; no business-label preference or required general template. Whole-line expansion cannot split oversized lines, and bounded section prefixes may not reach anchors.
- Corrected nearby unfiltered-date wording to distinguish supported document-evidence temporal filters from unsupported event-date inference; no temporal behavior change.
- Changed files: `docs/agent-workflows.md`, `docs/cli-commands.md`, `docs/memory-format.md`, `skills/jumpybrain-memory/SKILL.md`, `glossary.md`, `src/cli/instructions.ts`, `src/cli/cli.docs.md`, `test/recall-guidance.test.js`, and this task.

## Verification and limitations

- `node --test test/recall-guidance.test.js` — 10/10 passed; exercises current TypeScript instruction output via in-memory transpilation, distributed skill, workflow/reference/authoring guidance. Initial runs caught over-strict prose regexes (equivalent byte/token wording and lowercase “legacy”); normalized assertions and reran successfully.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — passed. `git diff --check` — passed. No build or broad suite run during shared work; parent owns integrated build/tests. Reviewed command examples against `src/cli/bounded-reads.ts` and `src/core/canonical/expansion.ts`: mandatory SHA-256 precondition, same target, inclusive lines, section/range exclusion, same-hash continuation, and whole-line errors preserved.
- Complexity review: guidance-only runtime change; no new format selection, flags, packet fields, retrieval algorithms, dependencies, or filesystem/transport behavior. Detailed bounds stay in CLI reference; authoring advice has one source-format section linked from workflow/reference; standalone skill/generated instructions repeat essential safety. Word counts grew: workflow 3357→3614, CLI reference 4224→4432, source format 1808→2009, skill 914→1121, generated instruction source 647→848. This adds necessary distinctions, not a claim of reduced guidance context cost.
- Remaining limits: compact can still cost more bytes/tokens than text; no universal format recommendation or token cap. The individual 1,000-character excerpt bound is unchanged; whole-line expansion cannot split a line beyond maximum packet space and a section prefix may miss its anchor. Text/local file reads do not check source versions. Structure does not guarantee complete qualifications or corpus coverage.
- Existing installed skills need integration reinstall/reload; Pi's separate extension and external project instructions remain unchanged. New tests cover repository guidance, not deployment or retrieval quality.
- Other agents' excerpt/interaction work was observed but not edited. No commits, archiving, memory writes, changelog edits, or automatic whole-document fallback.
- End-to-end re-verification: reviewed the existing implementation and reran `npm test` against the current working tree; build succeeded and **854 passed, 1 skipped, 0 failed** (855 total). A fresh independent read-only review checked compact serialization, plain citations, root/pathBasis resolution, CLI hash/range requirements, whole-line expansion and continuation against implementation; no actionable issues found, and focused guidance tests passed **10/10**. `git diff --check` passed. All task requirements are complete; no further implementation changes were necessary. User subsequently approved finalization; archive: `tasks/done/2026-10-12_tasks-recall-format-guidance.md`. Installed integrations were not modified. Repository finalization policy requires a concise changelog entry; granular checks and limits remain in this archive.
