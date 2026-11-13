# No duplicate title heading in agent-created notes

Status: done 2026-11-13. First pass (`71cf236c`) stopped repeated H1s; the coordinator then decided that new agent notes get no title H1 at all (second pass).

## Goal

Answer the [November 13](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=0e6ec3e1-0fb5-4fcd-bec3-a8c8415dd1c9) and [November 12](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=b25f0a15-d863-449d-befd-b22e2543eced) feedback ([index](../feedback.md)): notes created by agents show the title twice — the note title, then an H1 with the same text. The Nov 12 report suspected "resaving" adds it; prove or rule that out.

## Known lead

`src/app/writing/local-writer.ts` (remember and wrapup) and `src/app/writing/remote-writer.ts` always prepend `# ${title}` to the stored body. An agent body that already begins with `# <same title>` therefore stores two identical H1s.

## Tasks

- [x] Reproduce with a disposable brain: `remember`/write with a body starting `# <title>` (local and remote/server path), then open in the browser editor; record what is shown.
- [x] Check every agent create path (CLI remember, wrapup, remote writer, server-memory write, any page/import writer) and whether editor save/reopen or live publication can add a heading. Record the finding.
- [x] Fix in one pure core/app writing rule: when the body already starts with an H1 whose text matches the title (trimmed, case/whitespace-insensitive, ignoring trailing `#`s), do not prepend another. Body H1 that differs from the title stays as authored. No rewriting of existing files.
- [x] Decide on the editor side: if the editor shows a separate title plus the body H1 for existing notes, consider whether duplicate display can be suppressed without changing canonical bytes; only do it if simple and safe, otherwise record as a limit. → Not done in the editor (unsafe, see limits). Coordinator decision instead: writers stop adding the title H1 to new notes.
- [x] Adjust agent guidance (CLI help / managed skill text) only if it tells agents to add an H1. → Not needed: CLI help, `instructions` and both skills only ask for real Markdown headings, never a title H1.
- [x] Focused tests per `docs/testing.md` (writing tests; one browser check only if editor display changes).
- [x] Update owning `*.docs.md`, add a short note to `tasks/todo/release-next.md`, finalize per `docs/task-workflow.md`. → Docs updated; the release note and feedback-index update are left to the coordinating thread (see Hand-off).

## Findings

Reproduced on a disposable brain at `811591f2` (CLI `remember` with body `# Deploy checklist\n\nRun tests first.`, then Chromium against `startJumpyBrainHttpServer`):

- The file stored `# Deploy checklist` twice. The editor showed the title field **Deploy checklist** plus two body H1s with the same text, so the title appeared three times.
- Even a plain body (`Plain body without heading.`) showed the title field **and** one identical body H1. Every agent-created note shows the title twice, because the writers always add `# <title>` to the body and the editor already renders the frontmatter title as the page heading.
- **Resaving does not add a heading.** After an editor edit/save and reopen, H1 counts were unchanged for all three cases (double-H1 note, plain note, hand-written note without a heading). The editor split/compose keeps body bytes verbatim; `update`/collaboration edits replace or patch bodies without prepending.
- Creation paths: only `rememberMemory`, `writeSessionWrapup`, `writeRemoteMemoryNote` and `writeRemoteSessionWrapup` prepend a heading. Server-memory note/wrapup POST, ensure-title reference pages and browser daily capture all use the remote writer (daily capture writes the `How is your day?` prompt heading, not the title). `process --mode synthesize` writes its own generated `# <topic>` body (no agent body); the desktop focus starter and imports do not prepend a title heading.

## Outcome

Coordinator decision (after the first pass): the frontmatter `title` is canonical and the editor already shows it as the page heading; editor-made notes have no body H1, so agent writers match that going forward.

- `src/core/writing/markdown-file.ts`: `bodyWithoutTitleHeading(title, body)` replaces the first-pass `bodyWithTitleHeading`. It never adds a heading. If the trimmed body opens with an ATX H1 whose text equals the title (exact-title normalization — NFKC, trim, lowercase — plus collapsed whitespace and optional closing `#`s), that line and the blank lines after it are dropped and the rest is stored verbatim (CRLF and indentation kept). A different H1, `##`, `#Title` without a space, setext headings and prose stay exactly as authored. `opensWithTitleHeading` exposes the match. `renderMarkdownDocument` now renders a blank body as frontmatter only.
- All four writers use it: `remember`, `wrapup`, remote note, remote wrapup — and therefore hosted notes POST/wrapup through server-memory. Browser daily capture keeps its `How is your day?` prompt heading (it is not the title).
- Reference pages (ensure-title, `[[...]]` creation) and blank remote notes are now frontmatter only.
- Synthesis pages: new maps take the topic as their title, so the generated `# <topic>` line is dropped. An existing map that still opens with that heading keeps it, so an unchanged map is not rewritten just to remove it.
- Retrieval: excerpt selection discounted title words partly because the body H1 repeated them. Without that H1, a dream page's opening sentence outranked a rarer requested detail (caught by `memory-cli` "CLI dream overlapping windows…"). `selectEvidenceExcerpt` now accepts the frontmatter `title`, which counts as one mention only when the body has no leading heading; QMD snippet repair and processing excerpts pass it. Notes with a leading heading score exactly as before.
- Unchanged and checked: title for search/QMD/ranking/graph/lint comes from frontmatter (`qmd-worker`, `qmd-ranking`, processing `headingTitle` is only a fallback); `sectionLine` expansion already handles heading-free preambles; wrapup validation runs on the authored body before the rule and still requires the four `##` sections.
- Agent guidance needed no change. Existing files are never rewritten.
- Docs: `src/core/writing/writing.docs.md`, `src/app/writing/writing.docs.md`, `src/app/server-memory/server-memory.docs.md`, `src/app/processing/processing.docs.md`, `src/core/retrieval-policy/retrieval-policy.docs.md`, `docs/memory-format.md`, `docs/shared-memory-protocol.md`, `docs/cloud-shared-memory.md`.

## Verification

Tested snapshot: `71cf236c` plus the second-pass change, built with `npm run build`.

- `test/title-heading.test.js` (6): rule matches/non-matches, CRLF/indentation, heading-only body, frontmatter-only rendering, local remember/wrapup, remote note/wrapup, hosted `writeServerMemoryWithIdempotency`, excerpt title weighting with a control and unchanged weighting for bodies with a leading heading.
- Test files changed for the old `# title` body, each because the old assertion encoded the removed behavior:
  - `test/memory-cli.test.js`: remember/wrapup asserted `# <title>` in the file and wrapup `body`; now assert the frontmatter title, no body H1, and that the wrapup body starts at `## Findings`.
  - `test/remote-blank-note.test.js`: blank remote notes asserted body `# <title>`; now assert an empty body (title in frontmatter, checked by the existing deep-equal).
  - `test/missing-reference-pages.test.js`: reference page asserted body `# <title>`; now asserts the body is empty after the closing fence. The edit/reload assertions are unchanged and pass.
  - `test/processing-safety.test.js`: added a case: new maps have no title H1; a legacy map opening with `# <topic>` is not rewritten on an unchanged rerun.
- Focused regression set: the 72 test files selected with `rg` that touch creation (remember/wrapup/remote/hosted/ensure-title/synthesize/notes POST), excerpts/snippets/expansion, plus `architecture-boundaries`: 723 tests, 721 pass, 0 fail, 2 skipped (real-QMD cases gated on `JUMPYBRAIN_TEST_QMD_BIN`).
- Chromium (disposable brain, scratch script): new CLI notes (body with and without `# <title>`) and a wrapup show the title once — title field, no body H1. Earlier first-pass check: resaving adds no heading.

## Remaining limits

- Existing notes keep their title H1 (and any double H1 from before); files are never rewritten. Users can delete the heading in the editor.
- Semantic retrieval quality was not re-measured (no provisioned real QMD/model run); lexical/mocked tests and the excerpt control are the evidence. Body text no longer repeats the title, so title words rely on the frontmatter title signals (QMD title field, exact-title boost, excerpt weighting).
- Notes opened in other Markdown tools show no title H1 unless that tool displays frontmatter `title`.
- Processing lint and synthesis still fall back to the first body H1 only when frontmatter `title` is missing, which writers always set.

## Hand-off (coordinator)

- `tasks/feedback.md` rows for 11-13 08:20 and 11-12 19:30 still link `todo/tasks-duplicate-title-heading.md`; repoint them to `done/2026-11-13_tasks-duplicate-title-heading.md` and mark them covered.
- Pending release note suggestion: "Notes written by agents no longer repeat their title as a heading at the top of the body; the title appears once."
