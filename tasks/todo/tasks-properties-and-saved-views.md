# Properties and saved views over Markdown notes

## Goal

Let people and agents organize the same Markdown notes into useful lists and tables: an open-decision register, a research reading list, or a project's related notes. Build a small reusable property/query/view system, with local and hosted behavior sharing the same app operations.

## Scope and decisions

- Requested on 2026-10-24. This is an implementation plan; no feature has been implemented or validated by creating this list.
- Markdown remains canonical for note content and property values. Saved view definitions and any property declarations must be portable, user-owned configuration outside rebuildable index/cache state. Reuse existing root configuration where appropriate; choose the smallest versioned representation before implementation.
- Start with a compact property editor and saved list/table views, including selected columns, filtering, sorting and simple grouping. Agents must be able to query and update the same data through the supported CLI, locally or against an explicitly selected hosted brain.
- Preserve reserved identity/provenance fields and existing evidence-date, review and attention semantics. A project deadline or custom date must not become evidence time. Custom properties must not confer write permission.
- Proposed first property types: text, number, boolean, explicit date and string list; support a simple select only if its option declarations fit the same small contract. Keep the existing tiny frontmatter format rather than introducing general YAML or a schema framework.
- Images, file attachments, asset uploads and binary storage are explicitly excluded at the user's request because of storage growth. Source capture and templates are outside this list.
- Creating an ordinary note through New note or `remember` is already the capture primitive. Do not add a separate inbox, capture state or mandatory triage workflow. Properties and saved views are optional ways to organize the same linked notes; writing a note must not require categorization or custom properties.
- No formulas, rollups, arbitrary query scripts, separate record database, board/calendar/dashboard designer, task dependencies or full project-management subsystem. References can retain existing note IDs/links; a new relationship engine is not required.
- Independent of [checkboxes and code](../done/2026-10-25_tasks-markdown-checkboxes-code-tables.md): that completed list delivers Markdown task/code editing, with body tables deferred; this list owns query results presented as tables.

## Acceptance criteria

- A human and an agent can create/edit supported properties, then obtain equivalent filtered/sorted results from a saved view in local and hosted use.
- Three examples work through the same primitives: decisions with an open/accepted status, research with reading status/topics, and notes selected by a shared project property. These examples are fixtures/documentation, not new built-in product modules or reserved memory types.
- A note's properties survive unrelated body edits, external editor changes and app restarts. Property edits preserve unrelated frontmatter, body bytes and protected metadata; stale hashes fail visibly without overwriting newer data.
- Structured queries enumerate eligible canonical metadata deterministically, with continuation and truthful limits/errors. They do not use bounded semantic top-k hits as an apparently complete table or interpret missing index entries as missing notes. Index deletion/rebuild does not lose values or definitions.
- Missing/invalid properties, mixed legacy values, ambiguous IDs and unsupported configuration have documented behavior; queries do not silently coerce them into valid matching values. Concurrent edits do not imply snapshot isolation.
- Definitions travel with the brain, and existing roots without view/property configuration keep working. Read-only connections can inspect/query without obtaining mutation rights.

## Tasks

- [ ] 1.0 Specify the smallest property and saved-view contract.
  - [ ] 1.1 Read architecture/co-located docs and inspect current frontmatter parsing, protected-field replacement, canonical scanning, root schema compatibility and local/remote document operations. Record what can be reused and any migration requirement before changing code.
  - [ ] 1.2 Define supported field names/types, reserved names, missing/null/empty distinctions, strict date/number handling and existing-value compatibility. Specify safe quoting and preservation of unknown metadata; avoid introducing a second frontmatter parser/writer.
  - [ ] 1.3 Choose and document portable versioned view storage and any necessary type/option declarations. Specify view identity, rename/delete behavior, configuration concurrency and compatibility with older CLIs; configuration must not be mistaken for searchable memory or disposable cache.
  - [ ] 1.4 Define a small declarative query vocabulary: property equality, presence, useful list/range filters, sort order and one-level grouping. Specify tie-breaking, pagination, result/byte limits, malformed/incomplete scan errors and continuation behavior during edits. Exclude arbitrary code execution.

- [ ] 2.0 Implement shared canonical property and query operations.
  - [ ] 2.1 Keep pure field validation/query semantics in core and enumeration/orchestration in app. Reuse canonical scanning/identity and existing guarded update policy; keep QMD/protocol concerns out of core.
  - [ ] 2.2 Add supported property edits through the existing document concurrency seam. Preserve protected metadata, unrelated header lines/body, evidence dates and attention overrides; avoid treating a body-only save as permission to clear omitted properties.
  - [ ] 2.3 Implement deterministic structured enumeration with cancellation, stable ordering, continuation and visible malformed/unreadable/ambiguous-source handling. Reuse a derived projection only if it has explicit freshness/rebuild semantics and never silently excludes unindexed notes.
  - [ ] 2.4 Implement guarded saved-definition operations with safe root-relative storage and validation. Keep definitions and results scoped to the selected brain; do not add a registry, background model or separate service.

- [ ] 3.0 Expose equivalent agent and human workflows.
  - [ ] 3.1 Add focused CLI/JSON operations for property updates and saved/ad hoc view queries through runtime/app and the existing local/remote transport. Add thin authenticated hosted routes and explicit remote read/write classification; query reads must not repair indexes or mutate configuration.
  - [ ] 3.2 Add a compact, accessible property panel and saved list/table views to the existing browser/desktop shell. Support basic view creation/editing, displayed columns, filters, sorting and simple grouping without a new dashboard builder.
  - [ ] 3.3 Reuse document opening, save barriers, failed-draft recovery, read-only behavior and companion generation/brain switching. Prevent late queries or stale configuration from displaying one brain's data in another.
  - [ ] 3.4 Reflect confirmed changes and external edits with documented freshness. Define visible behavior if a note stops matching, changes sort/group or is deleted while open; never discard a draft to refresh a view.

- [ ] 4.0 Verify useful workflows and finalize the delivered scope.
  - [ ] 4.1 Add meaningful regressions for property preservation/types/reserved fields, stale writes, query completeness/pagination, deterministic filters/sorts/groups, malformed sources, root compatibility and local/remote parity. Include a corpus exceeding ordinary search-result limits.
  - [ ] 4.2 Exercise the three acceptance examples in disposable roots through CLI and the real browser/server. Check property editing, view persistence, external updates, read-only use, failed saves and brain switching at desktop/narrow widths; record unsupported platforms and any untested limits.
  - [ ] 4.3 Measure the selected scan/projection approach on a stated representative corpus and review UI bundle/dependency cost. Record limits without claiming unmeasured scale; remove duplicate helpers or unused framework machinery.
  - [ ] 4.4 Run the relevant deterministic/browser checks and required repository validation. Update memory-format, CLI/protocol, browser and affected module docs, glossary terms and pending release notes for actual delivered behavior; reconcile outdated scope statements without promising full databases/project management.
  - [ ] 4.5 Record the tested snapshot, results and remaining limits here. Once required implementation/checks are complete, archive and commit scoped work under [the task workflow](../../docs/task-workflow.md); update `tasks/CHANGELOG.md` for the completed result. This active planning list stays in `tasks/todo/` until then. No push, installation or release is implied.

## Relevant files

- [Product vision](../../docs/product-vision.md), [architecture](../../src/architecture.docs.md), `src/core/core.docs.md` and affected co-located docs — ownership and lean scope.
- `src/core/frontmatter.ts`, `src/core/canonical/`, `src/core/memory-root/`, `src/types.ts` — metadata, guarded edits, scanning and configuration compatibility.
- `src/app/local-memory/`, `src/app/server-memory/`, `src/runtime/`, `src/cli/`, `src/adapters/http-client/` — shared operations and explicit local/remote seams.
- `src/adapters/http-server/`, `integrations/macos-companion/` — thin routes, property/view UI and companion transport/save boundaries.
- `test/canonical-document-update.test.js`, `test/markdown-properties.test.js`, `test/remote-access-policy.test.js`, `test/server-memory-app.test.js`, existing browser tests/smokes — extend relevant contracts rather than duplicating the implementation.
- [Memory format](../../docs/memory-format.md), [CLI reference](../../docs/cli-commands.md), [shared protocol](../../docs/shared-memory-protocol.md) and `glossary.md` — supported behavior once implemented.
