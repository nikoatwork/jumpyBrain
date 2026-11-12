# Note links show their label

## Completed — 2026-11-12

Relative `.md` note links (`[ICP segmentation](../pages/icp.md)`) now render as just the underlined label, like web links, and show their path in the hover tooltip. Click or Tab then Enter still opens the resolved note. Editing the label, typing a new link, undo and export keep the exact Markdown. Non-`.md` relative links stay literal. Owner request after [clickable note links](2026-11-12_tasks-relative-note-links.md). Not released or installed.

## Changes

- `editor-markdown.ts`: shared fragments build `noteLinkPattern` (`.md`, no colon), `inertLinkPattern` (other `./`/`../`, explicitly excluding note links) and the union `relativeLinkPattern` used by the raw-line fallback check. `noteLinkMatch` exposes label, URL and offsets.
- `lexical-editor.ts`: a `noteLinks` transformer (before `relativeLinks`) creates an `ExternalLinkNode` with the relative URL, so rendering, focus, source mapping and the generic `[label](url)` export are shared with web links. For a URL without `:`, `createDOM` removes `href` and sets `role=link`, `data-note-link` and `title` to the path. `follow` sends colon-free link URLs to `onActivateNoteLink` behind the reference gate. The previous inert-node note code and `note-link.ts` were removed.
- `editor-source-map.ts`: a link at the current position may be a web or a note link. Whichever starts there is used, so a later web link cannot hide an earlier note link.
- Page CSS: the separate note-link rules were dropped, since note links use the external-link style.

## Verification

Snapshot: branch `feat/note-link-labels` from `3a6c7d66`; `npm run build` with a real `node_modules`: editor 678,655 minified / **224,238 gzip** (ceiling 224,250; **12 bytes headroom**), 15 bundled packages.

- `node --test` over every editor/browser/reference/markdown/lexical/collaboration-editor/paste test file: **296 pass, 0 fail**. New cases: disjoint note/inert grammars and `noteLinkMatch` offsets; a source map for label-only note links with a `_`/`#fragment` path beside a web link (label edits never map into the path; hidden syntax requires model link evidence; an earlier note link beside a later web link).
- `scripts/note-link-smoke.mjs` (production host, 1280/390px): labels only (`ICP segmentation`, `sibling`, `gone`); hover titles are the exact paths; no `href`; raw paths absent from visible text; `.png` link literal; click opens the target; missing target message; Tab then Enter; editing inside a label saves `[ICP segmentXation](../pages/icp-segmentation.md)` and Backspace restores the body; typing `[Sib](../pages/sibling.md)` converts on `)`, saves the exact Markdown and opens on click. **PASS.** Screenshot inspected.
- `markdown-bullets-smoke`: assertions updated (web anchors counted by `a[href]`; the note link shows `Decision` with its path title; the path-edit step became a label edit). **PASS** at both widths. `lexical-editor-smoke` and `page-reference-editor-smoke` (73 checks): **PASS**.

## Limits

- Electron is Chromium, but the tooltip was only checked as the `title` attribute in Chromium, not visually in the packaged Mac app.
- The editor bundle has 12 bytes of gzip headroom. The next editor feature needs a measured budget review per `docs/build-footprint.md`.
- As with web links, the hidden `](path)` can't be edited in place. Change the path by editing the Markdown source (the CLI or another editor), or delete and retype the link.
