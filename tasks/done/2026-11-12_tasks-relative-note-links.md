# Clickable relative note links

## Completed — 2026-11-12

Markdown links to other notes by file path, like `[ICP segmentation](../pages/icp.md)`, are now clickable in the editor in any rendered line, including agent-written metadata lines. Bare paths ending in `.md` (`[x](pages/x.md)`) count too. Clicking, or Tab then Enter, saves first and opens the note the path resolves to from the linking note's folder. Missing targets or paths that leave the brain show a message and keep the draft. Other relative links (images, non-`.md`) stay plain text. The Markdown source is unchanged. Owner chose option 1 of three. Not released or installed.

## Goal

Answer the [November 11 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=294aedfe-5b1f-45fd-b3fc-212ae3f2a44f) ([index](../feedback.md)): an agent-written `[label](../pages/x.md)` in a metadata line did not show as a link, and it was unclear when links work.

## Findings

- The November 5 work kept relative links as non-interactive literal source (`InertLinkNode`, code-formatted), deliberately. The reported shape renders as a normal line; the link was the non-interactive part. The original note was not available, so other syntax in it that could still force whole-line raw fallback cannot be ruled out.
- `/memories/all/files` already maps canonical relative paths to IDs and is allowed by the companion gateway, so no server or protocol change was needed.

## Changes

- `editor-markdown.ts`: `relativeLinkPattern` also accepts bare destinations ending in `.md` (optional `#fragment`, no colon/scheme, not `/` or `#` first).
- `note-link.ts` (new, editor bundle): `noteLinkDestination`. `lexical-editor.ts`: `.md` relative links get `markdown-note-link`, `role=link`, `tabindex`, `data-note-link` and join click/Tab+Enter activation via the new `onActivateNoteLink` option, behind the existing `canActivateReference` gate for read-only/companion states. Source spelling and code-format semantics (no emphasis parsing inside paths) are unchanged.
- `notes-browser.ts`: `resolveNoteLinkFile`, `noteLinkTargetId` and `activateNoteLink` (save-first guarded navigation, abort/staleness checks, specific messages). They live in the page script, so the editor bundle stays under its gzip ceiling. Link styling matches page references, without code font.
- `browser.docs.md` documents grammar, resolution and limits.

## Verification

Snapshot: branch `feat/relative-note-links` from `cd2491eb`; `npm run build` with a real (cloned) `node_modules`: editor 678,578 minified / **224,156 gzip** (ceiling 224,250; 94 bytes headroom), 15 bundled packages with license notices.

- `node --test test/editor-markdown.test.js test/notes-browser.test.js test/editor-source-map.test.js test/lexical-bundle.test.js test/reference-ranges.test.js test/collaboration-editor.test.js test/editor-markdown-nodes.test.js`: **158 pass, 0 fail**, including new grammar/destination cases and resolver cases (percent-decoding, `./`, bare, root escape, absolute, non-`.md`, malformed escapes, case fallback, ID-less duplicates, unknown current note).
- New `npx --package=playwright node scripts/note-link-smoke.mjs` on a production host at 1280 and 390px: the reported metadata-line shape renders (no raw fallback) with three note links (`../`, bare with `..` and `#fragment`, missing); the `.png` link stays inert; the link isn't code-styled; source and file are untouched on load; click opens the resolved note; a missing target shows "No note exists at pages/missing.md" and stays; Tab then Enter opens the bare-path target; typing inside a link label saves the exact edited source and Backspace restores the body; no horizontal overflow or page errors. **PASS.** Screenshot inspected.
- Existing `markdown-bullets-smoke`, `lexical-editor-smoke` and `page-reference-editor-smoke`: **PASS** at both widths.
- `npm run check:package-size`: pass.

## Limits

- The full `[label](path)` source stays visible, as `[[Title]]` references do; there's no label-only rendering.
- Each activation reads the full canonical file listing (one request, which reads note metadata server-side); fine for normal brains and unmeasured for very large ones.
- Absolute (`/x.md`) and root-relative links are not supported. The graph, backlinks and search don't resolve these links, which is unchanged. No packaged Mac app, Safari/Firefox, or assistive-technology run.
