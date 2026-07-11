# Graph Note Slide-in Panel

## Goal

Add a slide-in note reader to the `/graph` page: clicking a document node slides in a panel taking 33% of horizontal width (graph flexes to 67%) and renders the node's `.md` note in a well-formatted way using a tiny inline Markdown renderer. No new npm dependencies.

## Notes

- Single-file HTML lives in `src/adapters/http-server/graph-page.ts`; all UI/JS/CSS is inlined there.
- Existing fixed `aside` (20rem, shows title/file/kind/degree/tags/snippet) is **removed entirely**. The slide-in is now the only details surface.
- Node click already calls `selectNode(node, element)`. Reuse this entry point.
- Unresolved nodes (no backing `.md`) do **not** open the panel — show a small status indicator instead.
- Panel persists across node clicks: clicking a new node swaps content without close/reopen animation.
- Markdown content comes from `GET /memories/all/documents/:id` using the same Bearer API key already in the header input. Response packet has `content` (raw markdown incl. frontmatter), `file`, `id`, `contentHash`.
- Loading state: show "loading…" while fetching. On error: close panel, surface error in header status bar (`#status` / `#error`).
- Open across clicks; close via close button, re-clicking the active node, or pressing Escape.
- Backend routes/protocol already exist; this is a frontend-only change. No `src/core`, `src/app`, or route changes expected.

## Relevant Files

- `src/adapters/http-server/graph-page.ts` - the entire graph UI (HTML, CSS, JS) inlined here; all edits land here.
- `src/adapters/http-protocol.ts` - reference for route shapes (`/memories/all/documents/:id`, `memoryDocumentPath`).
- `src/adapters/http-server/routes.ts` - GET `/memories/all/documents/:id` handler; confirm response body shape, no edits.
- `test/graph.test.js` - existing graph page tests; update/add coverage for slide-in behavior.

## Tasks

- [x] 1.0 Remove fixed aside and restructure layout
  - [x] 1.1 Delete the existing `<aside>` block (Details/stats/ready/error/details) and its CSS.
  - [x] 1.2 Move `#ready`/`#error`/`#status` indicators into the header (keep `data-testid` attributes stable).
  - [x] 1.3 Change `main` grid so the graph `<section>` takes full width by default (no fixed right column).
  - [x] 1.4 Verify existing graph load/pan/zoom still works after layout change.

- [x] 2.0 Add slide-in panel scaffold (closed by default)
  - [x] 2.1 Add `<aside id="note-panel">` markup: close button, title area, content area. Start `hidden` / `data-closed`.
  - [x] 2.2 Add CSS: fixed 33vw width, right-side slide-in transition, dark theme consistent with existing tokens. Graph section flexes to 67vw when panel open (e.g. via a `body.panel-open` class toggling `--graph-width`).
  - [x] 2.3 Add `data-testid` attributes: `graph-note-panel`, `graph-note-close`, `graph-note-title`, `graph-note-content`.
  - [x] 2.4 Close handlers: close button click, Escape key, re-click on currently-active node.

- [x] 3.0 Inline dependency-free Markdown renderer
  - [x] 3.1 Implement `renderMarkdown(md)` in the page script: headings (#–######), unordered/ordered lists, fenced code blocks (```), inline code, bold/italic, links, blockquotes, paragraphs, horizontal rules. Escape HTML first to prevent injection.
  - [x] 3.2 Strip or render frontmatter separately: detect leading `---\n...\n---`, show it as a small muted metadata block above rendered body (or skip — see Clarify 4.1).
  - [x] 3.3 Add CSS for rendered markdown: headings sizing, code block background/scroll, blockquote border, list indentation, link color using `--accent`, word-wrap long lines.

- [x] 4.0 Wire node click to fetch + render note
  - [x] 4.1 In `selectNode`: if `node.nodeKind === "unresolved"`, do not open panel — set `#status` to a short message like "unresolved link: <title>" and return.
  - [x] 4.2 For document nodes: if panel closed, open it (toggle `panel-open`, swap content without animation). If already open for a different node, just swap content (no open animation).
  - [x] 4.3 Build document URL via `"/memories/all/documents/" + encodeURIComponent(node.id)`; reuse existing API key + `Authorization: Bearer` header logic.
  - [x] 4.4 Show "loading…" in content area while fetching; disable re-fetch if clicking the same active node.
  - [x] 4.5 On 2xx: set title (`node.file` / `node.title`), set content innerHTML to `renderMarkdown(payload.content)`, update `#status` to "loaded".
  - [x] 4.6 On non-2xx or fetch failure: close panel, set `#status` to "error", show message in `#error`.

- [x] 5.0 Polish + a11y
  - [x] 5.1 Keyboard: Escape closes panel; focus the close button when panel opens.
  - [x] 5.2 Make panel scroll independently of graph; long notes scroll inside content area.
  - [x] 5.3 Ensure graph SVG resizes correctly when panel opens/closes (recompute `getBoundingClientRect`-based layout if needed on open).
  - [x] 5.4 Visual: smooth transition on open/close; graph width animates alongside panel slide.

- [x] 6.0 Tests
  - [x] 6.1 Update `test/graph.test.js`: assert fixed aside is gone; assert `graph-note-panel` exists and starts closed.
  - [x] 6.2 Add test: clicking a document node opens panel, fetches `/memories/all/documents/:id`, renders markdown content (mock fetch).
  - [x] 6.3 Add test: clicking an unresolved node does NOT open panel; sets status.
  - [x] 6.4 Add test: close button / Escape closes panel; re-click active node closes panel.
  - [x] 6.5 Add test: clicking a second node while panel open swaps content without close/reopen (no `panel-open` toggle flicker).
  - [x] 6.6 Add test: fetch error closes panel and surfaces error in `#error`/`#status`.

- [x] 7.0 **Clarify / Decisions**
  - [x] 7.1 **Clarify:** Frontmatter (`---` block) in the note — render as a muted metadata block above the body, or strip entirely? Default if unanswered: render as muted metadata block. → **Resolved:** render as a muted `<details>` metadata block above the body.
  - [x] 7.2 Update `tasks/CHANGELOG.md` on completion with dated summary.

## Decisions

- Slide-in replaces the fixed aside entirely; it is the only details surface (Q1: a).
- Unresolved nodes do not open the panel — header status only (Q2: b).
- Inline dependency-free Markdown renderer, no new deps (Q3: a).
- Graph flexes to 67vw, panel owns 33vw; closes via close button / re-click / Escape (Q4: a).
- Panel persists across node clicks; content swaps without close/reopen animation (Q5: a).
- Loading → "loading…"; on error panel closes and error shows in header status/error (Q6: b).

## Changelog

- On completion, add dated entry to `tasks/CHANGELOG.md` and archive this list to `tasks/done/`.
