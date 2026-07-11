# CLI Remember/Recall Simplification

## Completion Summary

Completed on 2026-06-24. The CLI write verb is now `remember`, retrieval docs center on `recall`, old `note` commands return migration errors, `remember` rebuilds the derived index after writing, and docs/tests were updated. Validation passed with `npm test` (22/22).

## Goal

Make the jumpyBrain CLI language simple and user-centered: `remember` writes durable memory, and `recall` retrieves it. Remove `note` from public commands/docs, keep indexing as an internal or maintenance detail, and collapse/de-emphasize duplicate retrieval language where practical.

## Notes

- Product language decision: **remember writes; recall reads**.
- `remember` should keep the current `note` command behavior and flags: stdin body plus `--root`, `--type`, `--title`, `--tag`, and `--json`.
- User-facing docs should not say “what does jumpyBrain remember about X?” because that blurs write/read semantics; use “recall memory about X.”
- The CLI should stay “simple af”: prefer one user-facing retrieval verb (`recall`) over both `search` and `recall` unless a concrete automation need justifies otherwise.
- Indexing may still exist as a lower-level command for now, but docs should avoid making normal users think about it unless needed after manual Markdown edits.

## Relevant Files

- `src/cli.ts` - Command routing, recipe routing, help text, and agent instructions.
- `src/writing/remember-writer.ts` - Remember-writing implementation and frontmatter source naming.
- `src/writing/index.ts` - Writing module exports.
- `src/index.ts` - Public package exports.
- `test/memory-cli.test.js` - CLI behavior and recipe coverage.
- `README.md` - Public quickstart and product positioning.
- `docs/install.md` - Install and write/recall workflow docs.
- `docs/agent-workflows.md` - Agent-facing memory workflow docs.
- `docs/technical.md` - Command reference and architecture docs.
- `docs/local-cli-builds.md` - Local CLI dogfooding commands.
- `docs/memory-format.md` - May mention note terminology and write examples.
- `docs/dogfood-memory.md` - Dogfood command examples.
- `src/targets/README.md` - Remote/shared-memory design examples that mention note/search.
- `tasks/CHANGELOG.md` - Local task history entry for the completed CLI rename.

## Tasks

- [x] 1.0 Rename write command from `note` to `remember`
  - [x] 1.1 Update `src/cli.ts` so top-level `jumpybrain remember` performs the current `note` write path.
  - [x] 1.2 Update recipe routing from `jumpybrain run memory:note` to `jumpybrain run memory:remember`.
  - [x] 1.3 Remove `note` and `memory:note` from public usage/help text.
  - [x] 1.4 Decide whether old `note` commands should fail with a friendly migration error or be removed outright. Decision: friendly migration errors, no alias behavior.
  - [x] 1.5 Update success messages from “Wrote memory note” to “Remembered memory” or similarly clear wording.

- [x] 2.0 Clarify retrieval around `recall`
  - [x] 2.1 Make `recall` the primary documented retrieval command for both topic-style and specific-question lookups.
  - [x] 2.2 Support or document `jumpybrain recall --query "..."` as the replacement for public `search --query` usage, if needed for specific questions.
  - [x] 2.3 De-emphasize or hide `search` from normal help/docs; keep it only if tests or machine-readable automation still need a compatibility path.
  - [x] 2.4 Update agent instructions to recommend `recall` only, including JSON usage where automation needs structured output.

- [x] 3.0 Treat indexing as internal/maintenance UX
  - [x] 3.1 Remove prominent `index` examples from user quickstarts where the normal `remember` flow can handle or clearly prompt indexing.
  - [x] 3.2 Keep lower-level `index` docs only in technical/maintenance sections for manual Markdown edits and rebuildable derived state.
  - [x] 3.3 Check whether `remember` should trigger index rebuild automatically or print a clear next-step hint. Decision: `remember` indexes after writing.

- [x] 4.0 Update terminology in docs and code comments
  - [x] 4.1 Replace public “note” command examples with `remember` examples.
  - [x] 4.2 Add explicit wording: “remember writes memory; recall reads memory.”
  - [x] 4.3 Remove ambiguous “remember about...” language in favor of “recall memory about...”.
  - [x] 4.4 Update remote/shared-memory design examples to use `remember`/`recall` consistently.

- [x] 5.0 Update tests and compatibility coverage
  - [x] 5.1 Update CLI tests from `note` / `memory:note` to `remember` / `memory:remember`.
  - [x] 5.2 Add a test for `remember` preserving current flags, frontmatter type routing, stdin body behavior, tags, and JSON output.
  - [x] 5.3 Add coverage for any migration error or compatibility behavior chosen for old `note` commands.
  - [x] 5.4 Update tests that assert agent instructions/help output.

- [x] 6.0 Validate and record the change
  - [x] 6.1 Run build and deterministic tests.
  - [x] 6.2 Run a repo-wide grep for stale public `note`, `memory:note`, `search`, and ambiguous remember/recall wording.
  - [x] 6.3 Update `tasks/CHANGELOG.md` when the implementation is finalized or this task list is archived.

## Decisions

- `remember` is the write/store verb.
- `recall` is the read/retrieve verb.
- Keep current write flags for `remember`; do not add a phrase-style positional-memory body in this task.
- Rename recipe shortcut to `memory:remember`.
- Include a docs wording pass to make the remember/recall split explicit.
