# README refresh

**Completed 2026-11-05.** The README leads with installation, uses shorter benefit-focused copy, and shows the current editor and memory map. Release instructions now require a verified public demo refresh. The separate landing-page redesign is committed in its owning repository; it is not deployed.

## Goal

Put a one-line install command at the top, cut the README by roughly half, and refresh the product screenshots. Use simple, conversational language about what people get from jumpyBrain.

## Scope and decisions

- Keep installation, upgrade and protocol details in their owning guides.
- Capture the current app with disposable fictional Markdown notes; never use personal memory or change the public demo.
- Preserve unrelated editor, smoke-runner and release-note changes already in the workspace.
- Align the separate demo landing page with the editor in its owning repository; keep private checkout/hosting details in ignored `AGENTS.md`.
- Add a public release policy requiring the demo to follow each published release, with live verification and explicit reporting if blocked.

## Tasks

- [x] Rewrite the README around benefits, short paragraphs, a top install command and links to deeper guides (2,263 to 944 whitespace-delimited words).
- [x] Capture and inspect fresh writing and memory-map images from the current app.
- [x] Document per-release public demo upkeep and ignored private operational pointers.
- [x] Check links, installer wording, word-count reduction and image references; record limits.
- [x] Archive this list, add a scoped changelog entry and commit only this task's changes.

## Verification and limits

- README: 2,263 to 944 whitespace-delimited words, a 58.3% reduction. Checked all 24 local links/assets and linked section anchors; the top one-line command matches `docs/install.md`.
- `npm run build` passed. Screenshots use the resulting 0.3.20 workspace build; core HEAD at capture was `ed7ed93`. Later unrelated search edits were not rebuilt into these captures.
- Inspected actual browser captures of the editor and graph at a 1440 × 1100 viewport, then converted to lossless WebP. The disposable lexical-indexed brain has 14 fictional notes and 48 graph connections; no personal memory appears in either image. Browser console diagnostics were empty.
- The fixture index was confirmed fresh by `doctor --check`; the graph's unverified-freshness notification was dismissed through its normal UI before capture. No rendered app content was fabricated.
- The separate demo template uses the editor's warm palette, serif headline and workspace wording. Its existing 7 tests passed; desktop, 390px mobile, 320px expanded commands and both native copy actions passed browser checks without horizontal overflow.
- Public release policy contains no private deployment path or host identity. Operational pointers were added only to the already ignored `AGENTS.md`, confirmed with `git check-ignore`.
- `git diff --check` passed. No release, installation, live deployment or public-demo write was performed. Runtime tests beyond the build were not rerun for this documentation/screenshot task. Unrelated source work and pending release notes remain outside this commit.
