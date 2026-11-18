# Show the notes that link to a page

Priority: P2, confirmed by the owner 2026-11-18. Status: completed 2026-11-18 from feedback.

## Goal

From any page in the app, a person can see which notes link to it, including links written before the page existed (for example imported from Logseq), and open each one. Without using the CLI, they can see the connections they are building.

## Evidence

- [Nov 14 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=b7c07f34-534f-4685-9ee1-2c69d0e8b682) (Mac app and CLI 0.3.25): after importing a Logseq graph with `[[P]]` references and later creating page P, the links resolved but nothing on the page showed them. Asked for a list of linking notes with count, titles and a short snippet, or an "Open in graph" button centred on the page.
- Before this change: the saved-page **Related pages** footer showed map-linked context only for the most recently created or opened graph target, plus up to five search results. The [graph topic preview](../../src/adapters/http-server/browser.docs.md) listed links from the current bounded map packet only. Neither was a complete backlink scan.

## Relevant files

- `src/app/local-memory/backlinks.ts` - the read-only backlink operation (new)
- `src/app/server-memory/index.ts`, `src/adapters/http-server/routes.ts` - remote-safe wrapper and `?backlinks=1` on the document GET
- `src/adapters/http-server/page-backlinks.ts` - "Linked from" controller (new)
- `src/adapters/http-server/notes-browser.ts` - markup, page card "Open in graph", graph focus URL
- `src/adapters/http-server/related-pages.ts`, `graph-topic-preview.ts` - Related pages deduplication; transient linked context removed
- `src/core/canonical/links.ts` - link resolution policy (reused, unchanged)

## Tasks

- [x] 1.0 Backlink data
  - [x] 1.1 One read-only operation, `memoryDocumentBacklinks(root, id)`, returns every note linking to a page (`[[Title]]` and relative `.md` links) with count, title, ID and a short snippet around the link. It uses the core lookup/resolution the graph uses (`buildCanonicalLinkTargetLookup`, `extractCanonicalLinks`, `resolveCanonicalLinkTarget`).
  - [x] 1.2 Derived and cheap: a fresh scan of the editor root's canonical buckets, with no index, cache or writes. The graph keeps no reusable server-side edge data, so the operation shares its resolution code rather than its output. Cost below.
  - [x] 1.3 Tests: links written before the page existed, `|alias`/`#heading` and case, relative links, self-links excluded, deleted notes excluded, ID-less sources, limits, duplicate/missing/invalid IDs and the hosted route.
- [x] 2.0 Page UI
  - [x] 2.1 "Linked from (N)" sits directly above Related pages, below the writing surface. Rows show the title and a two-line snippet and open the note. Five show first, then "Show all". Related pages filters out notes already listed there. The graph preview's transient linked-page context, which fed Related pages, is removed because Linked from replaces it.
  - [x] 2.2 The page card has an "Open in graph" icon action. It opens `/graph?focus=<file>`, the existing "Show connections around" filter, with the page selected near the centre. A plain map visit clears a focus that the link set.
  - [x] 2.3 Works on read-only and hosted brains: it is a document GET, which companion gateways already treat as a read. Navigation uses the save-first guard.
- [x] 3.0 Verify and finalize
  - [x] 3.1 Chromium smoke with a disposable Logseq-style brain at 1280/390px in both themes. The related graph and Related pages tests and smokes pass.
  - [x] 3.2 Updated `browser.docs.md`, the protocol, the module docs, the email index row, the pending release note and the footprint record.

## Outcome

Pages show **Linked from (N)** when other notes link to them. The list includes links written before the page existed, such as Logseq `[[P]]` imports, because resolution runs fresh against current titles. **Open in graph** in the page card centres the map on the page's connections.

Design by layer:

- **Core** is unchanged. Link extraction and resolution are reused as they are.
- **App** has `src/app/local-memory/backlinks.ts`, exported through `src/runtime/index.ts`. It scans the editor root's canonical buckets, not `indexRoot`. This matches ID reads and delete previews, so every listed ID can be opened. The operation returns a distinct-note `count`, total `links`, and records sorted by title (default 100, maximum 500, with `truncated`). Each record has `id?`, file, title, count, kinds and a plain-text snippet of about 160 characters. Snippets are computed only for returned records. `backlinksServerMemory` adds remote-safe fields.
- **HTTP**: `GET /memories/all/documents/:id?backlinks=1` uses the same error mapping as document reads. No companion gateway route change was needed. Older servers ignore the parameter and return a plain read, and the UI then keeps the section hidden.
- **UI**: `page-backlinks.ts` is fenced by scope and note identity. It reloads on rename and when a tab returns after more than 30 seconds hidden. Failures keep the last list. ID-less notes are listed but disabled.

## Measured cost

Measured on a disposable brain of 3,001 notes (each about 1.8 KB, three wiki links, 300 linking to one hub). The machine was macOS ARM64 with Node 26.7.0, using the built `dist`. Five runs after a warm-up:

- Hub page backlinks (300 sources, 100 returned): median 505 ms (429-565).
- Ordinary page: median 493 ms (464-520).
- Lean graph call on the same brain, for comparison: median 526 ms.

A phase breakdown shows the time is sequential file I/O. The metadata pass took about 270-340 ms and the full-content pass about 190-340 ms. Link extraction and resolution took about 20-30 ms. The UI makes one request per note open or rename. The browser bundle grows by a net 731 gzip bytes (185,577). The reviewed ceiling rose to 186,000; see [build footprint](../../docs/build-footprint.md).

## Verification

Tested snapshot: base `3a1f42c2` plus this change, built once with `npm run build` and reused for every check. Engines were installed with `npm ci` and `npm --prefix scripts/engine ci`.

- `node --test test/page-backlinks.test.js test/related-pages.test.js test/graph-topic-preview.test.js test/lexical-bundle.test.js`: 24/24 pass.
- `node --test test/architecture-boundaries.test.js test/source-graph-contracts.test.js test/graph.test.js test/package-entrypoints.test.js test/macos-companion-gateway.test.js`: 96/96 pass. The gateway test now also lists backlinks on read-only local and remote profiles.
- `node --test test/notes-browser.test.js`: 78/78 pass. Its shell stub gained `pageBacklinks`.
- `node --test test/graph-topic.test.js test/missing-reference-pages.test.js test/server-http.test.js`: 33/33 pass.
- `npx --package=playwright node scripts/page-backlinks-smoke.mjs` passes on a companion local brain at 1280 and 390px, light and dark. It checks:
  - Linked from (7) with snippets and an ID-less row.
  - "Show all", no Related pages duplicate and no horizontal overflow.
  - Save-first navigation, at 1280 light.
  - Open in graph: URL focus, selected node within 25% of the centre, and a plain map visit clears the focus.
  - A read-only remote companion profile (390px) and the hosted shell.

  Screenshots were checked visually. They are local only, in `/private/tmp/claude-501/-Users-monkey-dev-jumpyBrain/6a3c89b0-b153-4a37-9e9b-1bea1a305c61/scratchpad/shots`.
- `npx --package=playwright node scripts/graph-linked-topic-smoke.mjs` passes at 1280/390/320px in both themes. It now asserts that the created page's Linked from list replaces the removed Related pages context. The smoke's stale `# fasting` H1 assertion was updated to match `ac2e3fcf`, which stopped adding an H1; it failed before this change too.
- `npx --package=playwright node scripts/related-pages-smoke.mjs` passes with real lexical QMD retrieval, both themes, 1280/390/320px and read-only brain switching.
- `git diff --check` is clean.

## Remaining limits

- Each request scans every canonical note, about 0.17 ms per small note on this machine. There is no persistent cache. Very large or slow-disk brains will show the list later; the note itself is not blocked.
- Resolution matches the graph. Frontmatter `alias::`/`aliases` properties are not link targets. Notes outside the canonical buckets are not scanned. The focus filter uses the file path, so a retrieval-only `indexRoot` subroot could fail to focus.
- The list is not live. It refreshes on open, on rename and when the tab returns after 30 seconds, not when another note gains a link while you watch.
- Only the first 100 linking notes are returned. The count stays exact.
- No CLI command was added; the runtime exports the operation.
- The bundle has 423 gzip bytes left under the raised ceiling, and parallel browser work may need another reviewed raise.
- Not tested: native Mac app window, assistive technology, other browsers and physical devices.
