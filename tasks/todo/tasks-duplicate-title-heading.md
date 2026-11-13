# No duplicate title heading in agent-created notes

## Goal

Answer the [November 13](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=0e6ec3e1-0fb5-4fcd-bec3-a8c8415dd1c9) and [November 12](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=b25f0a15-d863-449d-befd-b22e2543eced) feedback ([index](../feedback.md)): notes created by agents show the title twice — the note title, then an H1 with the same text. The Nov 12 report suspected "resaving" adds it; prove or rule that out.

## Known lead

`src/app/writing/local-writer.ts` (remember and wrapup) and `src/app/writing/remote-writer.ts` always prepend `# ${title}` to the stored body. An agent body that already begins with `# <same title>` therefore stores two identical H1s.

## Tasks

- [ ] Reproduce with a disposable brain: `remember`/write with a body starting `# <title>` (local and remote/server path), then open in the browser editor; record what is shown.
- [ ] Check every agent create path (CLI remember, wrapup, remote writer, server-memory write, any page/import writer) and whether editor save/reopen or live publication can add a heading. Record the finding.
- [ ] Fix in one pure core/app writing rule: when the body already starts with an H1 whose text matches the title (trimmed, case/whitespace-insensitive, ignoring trailing `#`s), do not prepend another. Body H1 that differs from the title stays as authored. No rewriting of existing files.
- [ ] Decide on the editor side: if the editor shows a separate title plus the body H1 for existing notes, consider whether duplicate display can be suppressed without changing canonical bytes; only do it if simple and safe, otherwise record as a limit.
- [ ] Adjust agent guidance (CLI help / managed skill text) only if it tells agents to add an H1.
- [ ] Focused tests per `docs/testing.md` (writing tests; one browser check only if editor display changes).
- [ ] Update owning `*.docs.md`, add a short note to `tasks/todo/release-next.md`, finalize per `docs/task-workflow.md`.
