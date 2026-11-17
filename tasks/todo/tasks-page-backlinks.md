# Show the notes that link to a page

Priority: proposed P2, to confirm. Status: planned 2026-11-17 from feedback.

## Goal

From any page in the app, a person can see which notes link to it, including links written before the page existed (for example imported from Logseq), and open each one. Without using the CLI, they can see the connections they are building.

## Evidence

- [Nov 14 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=b7c07f34-534f-4685-9ee1-2c69d0e8b682) (Mac app and CLI 0.3.25): after importing a Logseq graph with `[[P]]` references and later creating page P, the links resolved but nothing on the page showed them. Asked for a list of linking notes with count, titles and a short snippet, or an "Open in graph" button centred on the page.
- Today: the saved-page **Related pages** footer shows map-linked context only for the most recently created or opened graph target, plus up to five search results. The [graph topic preview](../../src/adapters/http-server/browser.docs.md) lists links from the current bounded map packet only. `browser.docs.md` states neither is a complete backlink scan.

## Relevant files

- `src/adapters/http-server/related-pages.ts` - Related pages footer
- `src/adapters/http-server/graph-topic-preview.ts`, `graph-page.ts` - graph and link edges
- `src/adapters/http-server/note-workspace.ts` - page card and footer layout
- `src/core/canonical/` - link resolution policy (title links and relative note links)
- `src/adapters/http-server/routes.ts` - where a read-only backlinks endpoint would sit

## Tasks

- [ ] 1.0 Backlink data
  - [ ] 1.1 Find the existing link-resolution code the graph uses, and add one read-only operation that returns every note linking to a given page (`[[Title]]` and relative `.md` links), with count, title, ID and a short snippet around the link.
  - [ ] 1.2 Keep it derived and cheap: reuse the graph or index data where complete, and record the cost on a few-thousand-note brain.
  - [ ] 1.3 Tests: links written before the page existed, title aliases and case, relative links, self-links excluded, deleted notes excluded.
- [ ] 2.0 Page UI
  - [ ] 2.1 Show "Linked from (N)" on the page with titles and snippets that open the note. Decide placement next to the existing Related pages footer, without duplicating it.
  - [ ] 2.2 Add "Open in graph" that centres the graph on this page.
  - [ ] 2.3 Work on read-only and hosted brains. Navigation saves first, like other links.
- [ ] 3.0 Verify and finalize
  - [ ] 3.1 Chromium smoke with a disposable brain covering the Logseq-style case, 1280/390px, both themes. Run the related graph and Related pages tests.
  - [ ] 3.2 Update `browser.docs.md` (it currently says there is no complete backlink scan). Update the [email index](../feedback.md) row, add a pending release note, and finalize under [task workflow](../../docs/task-workflow.md).
