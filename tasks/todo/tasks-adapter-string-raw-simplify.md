# Proposal: Simplify how the browser UI is served out of the HTTP adapter

## Goal

Replace the `String.raw` HTML/CSS/JS blocks inside `src/adapters/http-server/` with real, buildable static frontend assets (CSS and client JS files served under the existing nonce policy), so the product's largest code surface becomes lintable, type-checkable, and reviewable. This is a proposal, not a decision: the outcome of task 1.0 decides whether and how this proceeds.

## Notes

- This is a hypothesis to validate, not an agreed refactor. do not start implementation work from this list until 1.0 completes and 2.0 makes an explicit go/no-go and scoping call.
- Evidence collected so far (from the architecture review):
  - `src/adapters/http-server/` is the largest layer in the repo (94 files), and only part of it is a transport adapter; it also owns presentation and the design system.
  - `notes-browser.ts` (1,864 lines) starts with long CSS blocks; `lexical-editor.ts` (1,528 lines), `map-controller.ts` (1,000 lines), `graph-page.ts` (597), `companion-browser.ts` (819), `drawings-view.ts` (494).
  - 57 `String.raw` blocks across 23 adapter files carry CSS/HTML/embedded browser JS that TypeScript, ESLint and Prettier never check, in a shell whose security posture (nonce-protected script execution) is explicitly load-bearing.
  - A precedent already exists: the Lexical editor client is bundled by esbuild in `scripts/build-editor.mjs` instead of living in a string, so an asset pipeline in the build is not a foreign concept to the repo.
- Constraints that must be preserved (from `AGENTS.md`, `src/architecture.docs.md`, module docs):
  - Markdown files are canonical; indexes are derived. This proposal must not touch that boundary.
  - The nonce-protected shell is a security boundary; any change to how scripts/styles are served needs a documented CSP argument.
  - Packaging is deliberately small (`scripts/check-package-size.mjs`, `test/package-footprint.test.js`); new assets change the shipped package.
- Uncertainties (why we are not confident yet):
  - The inlining may be load-bearing for the CSP nonce scheme, single-server simplicity, packaging footprint, or the Electron desktop path in ways the numbers above don't show.
  - Unknown how much of the 57 blocks is shell (genuinely server-composed) vs pure static content that can become assets.
  - Unknown whether the `browser-*` design-system file split is best folded into assets or kept as TS primitives.

## Relevant Files

- `src/adapters/http-server/notes-browser.ts` - largest presentation owner; CSS layout for app shell, sidebar, notes.
- `src/adapters/http-server/lexical-editor.ts` - editor surface; bundled Lexical client boundary.
- `src/adapters/http-server/routes.ts` - serves the pages; would serve asset routes if proposal proceeds.
- `src/adapters/http-server/browser.docs.md` - current presentation architecture and smoke index.
- `scripts/build-editor.mjs` - existing esbuild precedent for client bundles.
- `src/architecture.docs.md` - entry point for subsystem ownership.
- `test/package-footprint.test.js`, `scripts/check-package-size.mjs` - packaging gates that new assets affect.
- `docs/release-testing.md` - distribution-content checks to consider before shipping a changed package.

## Tasks

- [x] 1.0 Research deep dive on the String.raw presentation surface (delegated to a Mistral Large sub-agent; read-only research plus writing its deep-dive doc)
  - [x] 1.1 Map every `String.raw` block: which file, what it contains (CSS / HTML / browser JS), and how `routes.ts` composes it into responses
  - [x] 1.2 Determine why inlining exists: trace the nonce/CSP mechanism (how nonces are generated, applied, and validated) and whether static assets can carry the same guarantees
  - [x] 1.3 Inventory what must not regress: page set (notes, graph, boards, drawings, companion, extensions), Electron desktop loading path, packaging footprint effects
  - [x] 1.4 Propose a slicing plan: first-slice candidate. smallest, most static, lowest-risk block to extract behind the existing build; expected diff shape
  - [x] 1.5 Define the regression-verification plan per slice, referencing `docs/testing.md` selections (browser scenario table, `test/package-footprint.test.js`, `test/package-entrypoints.test.js`)
  - [x] 1.6 Deliverable: `deep-dives/adapter-string-raw-simplify/research.md` and an updated "Deep dive findings" section in this list
- [ ] 2.0 **Clarify:** Go/no-go and scope decision after 1.0 lands — is the first slice approved, and what is the acceptance bar? (owner: user, with research doc in hand)
- [ ] 3.0 Proposal execution phase 1 (only after 2.0 approves): extract the first slice into a built asset served under the nonce policy as a proof of architecture
  - [ ] 3.1 Extend `scripts/build-editor.mjs` or add a sibling build step; keep the npm build sequence coherent for `npm test`
  - [ ] 3.2 Update the owning docs (`browser.docs.md`, `src/architecture.docs.md`) for the new asset boundary
- [ ] 4.0 Verify slice 1 against regression gates and record evidence (tested commit/build, selected commands, material untested limits) in this list
  - [ ] 4.1 Smallest checks from `docs/testing.md` for the affected screens, plus footprint/entrypoint tests
  - [ ] 4.2 Desktop path untouched-but-sampled: one selected electron/desktop check if the served pages are loaded differently there
- [ ] 5.0 Proposal execution phase 2 (only after 4.0 evidence is accepted): decision on roll-out across the remaining blocks, one slice per task list, each with its own verification record

## Blockers

- Research (1.0) is dispatched and in flight; 2.0 cannot proceed until its findings are recorded here.

## Deep Dive

- Delegated research doc (to be written): `deep-dives/adapter-string-raw-simplify/research.md`

### Deep dive findings

Full evidence: [deep-dives/adapter-string-raw-simplify/research.md](/Users/monkey/dev/jumpyBrain/deep-dives/adapter-string-raw-simplify/research.md). Summary:

- Evidence numbers mostly check out with one correction: 57 `String.raw` grep hits in 23 files, but one is a comment (notes-browser.ts:11) and 4 are regex literals (editor-markdown.ts:37-40), so the real surface is 52 presentation blocks / ~4,645 lines (4,649 lines across all 56 template literals). The Lexical bundle is inlined into the nonce'd script, not served externally; the true external-asset precedent is the drawing frame (`drawing-assets.ts`, `script-src 'self'`, allowlisted build output + ETag).
- Composition: `routes.ts:70-79` mints a per-request nonce and CSP; `graph-page.ts` `graphPageHtml()` builds one document with one inline `<style nonce>` (all CSS blocks concatenated) and one inline `<script nonce>` (editor bundle + all JS blocks + a ~370-line orchestration literal). All JS blocks share a single scope, so only CSS/markup extraction is mechanical; JS extraction needs a bundled entry like `browser-entry.ts`. `dream-handoff.ts` even embeds a `Function.toString()`.
- Nonce/CSP: generated per request (`randomBytes(16)` routes.ts:72, `randomBytes(18)` gateway.mjs:384), identical CSP on both hosts, validated in `graphPageHtml`, applied to inline script/style tags, and re-read at runtime (`document.currentScript.nonce`) to nonce dynamically injected extension scripts. Static assets can keep the same guarantee with zero CSP change by putting the nonce attribute on external `<script src>`/`<link>` tags (Option A, recommended for slice 1); adding `'self'` (drawing-frame pattern) is Option B and weakens the nonce-only property. `themeBootstrap` must stay a blocking pre-paint script. Pinned by `test/server-http.test.js:74-140` and `test/lexical-bundle.test.js:11-22` (exactly two nonce-only script tags).
- Why inlining exists: deliberate — content-free nonce shell and single-package "no asset deployment" serving (`docs/shared-memory-protocol.md:322`), readability comment at notes-browser.ts:10-11, pre-paint theme bootstrap, nonce since the initial snapshot; `docs/build-footprint.md:381` already calls moving surfaces out of the inline script "an architecture change". Incidental: the 4 regex literals and the `toString()` trick.
- Electron loads the same gateway-served pages (`window.mjs:143` `loadURL(${origin}/#companion=…)`, `webSecurity: true`); no special file paths. Regression surface: companion shell via `gateway.mjs:383-388`, extension asset nonce injection, drawing frame, plus two Electron smokes and `scripts/companion-browser-smoke.mjs` that serve `graphPageHtml('fixture')` with hand-written CSP and would need the new asset route. Nine test files regex-extract the last inline `<script>` from the shell HTML — CSS-only slices keep them green, JS slices break them.
- Slicing: slice 1 = static shell + design-system CSS (~270 lines: designSystem/button/list/components/systemMessage styles + graph-page's literal CSS) into a hashed `shell-assets/shell-<hash>.css` served via a generalized `drawing-assets.ts` pattern from both `routes.ts` and `gateway.mjs`, referenced as `<link rel="stylesheet" nonce>` (CSP unchanged). Slice 2 = remaining per-view CSS (~1,500 lines, palettes as static per-palette files). Slice 3 = markup blocks (~350 lines). Slice 4 = inline JS (~3,000 lines) via a bundled shell entry — highest risk, do last.
- Verification per slice: `npm run build`, then `node --test test/server-http.test.js test/lexical-bundle.test.js test/architecture-boundaries.test.js test/source-graph-contracts.test.js test/package-footprint.test.js test/package-entrypoints.test.js test/companion-live-gateway.test.js` plus `node scripts/check-package-size.mjs` (budgets 3.3M/9.1M/7.5M/780 frozen in `scripts/package-budget.mjs`; byte-neutral expected, file-count headroom 114); browser smokes per docs/testing.md (`npm run smoke:theme` with `JUMPYBRAIN_SMOKE_SCREENSHOT_DIR` for pixel diff, sidebar/graph-editor/boards/dropdown/note-find/feedback smokes, companion-browser-smoke; editor slices add `smoke:lexical`, `smoke:page-references` and the collaboration scenario table); desktop (`scripts/electron-smoke.mjs`, `window-chrome-smoke.mjs`, `extensions-desktop-smoke.mjs`). Parity oracle: `graphPageHtml` is deterministic for a fixed nonce — diff nonce-normalized HTML before/after (pattern at `test/server-http.test.js:125`) and diff the served CSS against the old inline `<style>` contents.
- Risks/falsifiers recorded in the doc's section 9: shared-scope JS coupling, CSP contract change if Option B is chosen, test-helper breakage on JS slices, cache-semantics change, and concrete falsification criteria (nonce-on-external failing in Electron 44, CSS rule-set mismatch, theme-smoke pixel diffs, footprint gate failures, slice-4 scope ballooning).
