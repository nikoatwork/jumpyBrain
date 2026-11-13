# No duplicate title heading in agent-created notes

Status: done 2026-11-13 (mixed outcome — see Remaining limits).

## Goal

Answer the [November 13](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=0e6ec3e1-0fb5-4fcd-bec3-a8c8415dd1c9) and [November 12](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=b25f0a15-d863-449d-befd-b22e2543eced) feedback ([index](../feedback.md)): notes created by agents show the title twice — the note title, then an H1 with the same text. The Nov 12 report suspected "resaving" adds it; prove or rule that out.

## Known lead

`src/app/writing/local-writer.ts` (remember and wrapup) and `src/app/writing/remote-writer.ts` always prepend `# ${title}` to the stored body. An agent body that already begins with `# <same title>` therefore stores two identical H1s.

## Tasks

- [x] Reproduce with a disposable brain: `remember`/write with a body starting `# <title>` (local and remote/server path), then open in the browser editor; record what is shown.
- [x] Check every agent create path (CLI remember, wrapup, remote writer, server-memory write, any page/import writer) and whether editor save/reopen or live publication can add a heading. Record the finding.
- [x] Fix in one pure core/app writing rule: when the body already starts with an H1 whose text matches the title (trimmed, case/whitespace-insensitive, ignoring trailing `#`s), do not prepend another. Body H1 that differs from the title stays as authored. No rewriting of existing files.
- [x] Decide on the editor side: if the editor shows a separate title plus the body H1 for existing notes, consider whether duplicate display can be suppressed without changing canonical bytes; only do it if simple and safe, otherwise record as a limit. → Recorded as a limit (below).
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

- New pure rule `bodyWithTitleHeading(heading, body)` in `src/core/writing/markdown-file.ts`: if the trimmed body opens with an ATX H1 whose text equals the heading (exact-title normalization — NFKC, trim, lowercase — plus collapsed whitespace and optional closing `#`s), the body is stored as authored; otherwise the writer heading is prepended exactly as before. Different leading H1s, `##` headings, `#Title` without a space and setext headings still get the writer heading.
- Local `remember`/`wrapup` and remote/hosted note/wrapup writers use it. Output for every other body is byte-identical to before. Existing files are not touched.
- Docs: `src/core/writing/writing.docs.md`, `src/app/writing/writing.docs.md`.

## Verification

Tested snapshot: `811591f2` plus this change, built with `npm run build`.

- New `node --test test/title-heading.test.js`: 4/4 pass (pure rule matches/non-matches; local remember + wrapup; remote note + wrapup; hosted `writeServerMemoryWithIdempotency`).
- `node --test test/remote-blank-note.test.js test/server-daily-note.test.js test/missing-reference-pages.test.js test/architecture-boundaries.test.js test/core-boundary.test.js test/dream-writing.test.js test/creation-outcomes.test.js`: 59/59 pass.
- `node --test test/memory-cli.test.js`: 30/30 pass.
- Chromium (disposable brains, scratch script, not committed): before the fix the matching-H1 note showed title + two H1s; after the fix it shows title + one H1. Save/reopen added no heading. No editor code changed, so no committed browser scenario was added.

## Remaining limits

- **The reported symptom is only partly fixed.** Agent notes still show the title twice in the editor (title field, then the writer's `# <title>` H1) — this is the normal case, not only when the agent repeats the title. Removing it needs a product decision: either stop writing a title H1 into new note bodies (a canonical-format change that also alters the documented ensure-title page content, heading-section excerpts/expansion, and many writer assertions), or a display-only treatment in the editor.
- Editor-side suppression was not done: hiding a matching leading H1 in the live Lexical editor is not simple or safe. A hidden node remains caret/selection-reachable, live collaboration operations address body positions that would shift if the heading moved into a non-editable prefix, and a later rename would leave the hidden heading stale.
- Existing notes with two identical H1s are not repaired (no rewriting of existing files); users can delete the extra heading in the editor.

## Hand-off (coordinator)

- `tasks/feedback.md` rows for 11-13 08:20 and 11-12 19:30 still link `todo/tasks-duplicate-title-heading.md`; repoint them to `done/2026-11-13_tasks-duplicate-title-heading.md` and mark them mixed.
- Pending release note suggestion: "Agent-written notes that already start with their title as a heading no longer get a second identical heading."
