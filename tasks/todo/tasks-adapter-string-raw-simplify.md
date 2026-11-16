# Proposal: Simplify how the browser UI is served out of the HTTP adapter

## Goal

Replace the `String.raw` HTML/CSS/JS blocks inside `src/adapters/http-server/` with real, buildable static frontend assets (CSS and client JS files served under the existing nonce policy), so the product's largest code surface becomes lintable, type-checkable, and reviewable. This is a proposal, not a decision: the outcome of task 1.0 decides whether and how this proceeds.

## Notes

- This is a hypothesis to validate, not an agreed refactor. do not start implementation work from this list until 1.0 completes and 2.0 makes an explicit go/no-go and scoping call.
- Evidence collected so far (from the architecture review):
  - `src/adapters/http-server/` is the largest layer in the repo (94 files), and only part of it is a transport adapter; it also owns presentation and the design system.
  - `notes-browser.ts` (1,864 lines) starts with long CSS blocks; `lexical-editor.ts` (1,528 lines), `map-controller.ts` (1,000 lines), `graph-page.ts` (597), `companion-browser.ts` (819), `drawings-view.ts` (494).
  - 57 `String.raw` blocks across 23 adapter files carry CSS/HTML/embedded browser JS that TypeScript never checks, in a shell whose security posture (nonce-protected script execution) is explicitly load-bearing. (Correction 2026-11-16: the repo has no ESLint, Prettier or stylelint configured at all, so "lintable" means new tooling, not existing coverage. The only CSS lint today is `test/design-tokens.test.js`, and it works *because* CSS lives in TS templates.)
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
  - [x] 1.7 Review of the research against the source (2026-11-16): corrections recorded in research.md section 10 and summarized under "Review corrections" below; slice 1 narrowed accordingly
- [ ] 2.0 **Clarify:** Go/no-go and scope decision (owner: user, with research doc in hand). Decide:
  - [ ] 2.1 Approve the narrowed slice 1 ("delivery-path proof", see 3.0), which deliberately adds **no** lintability and exists to prove nonce'd external CSS through server, gateway, Electron and packaging — or decline it
  - [ ] 2.2 Decide whether the lintability goal is still the driver. If yes, the payoff is slice 4 (inline JS) plus new tooling (a linter would be a new devDependency); compare against the cheaper existing direction of moving logic into typed modules bundled via `browser-entry.ts`. If no, consider stopping after slice 1 or not starting at all
  - [ ] 2.3 Acceptance bar for slice 1: CSP string byte-unchanged (Option A), nonce-normalized HTML diff explained line by line, served CSS rule-set equal to the removed inline CSS in the same cascade order, no `smoke:theme` pixel diffs beyond noise, packaging gates green without a budget change
- [ ] 3.0 Proposal execution phase 1 (only after 2.0 approves): narrowed slice 1, serve **build-generated** shell CSS as a nonce'd external asset
  - [ ] 3.1 Keep the TS constants (`designSystemStyles`, `buttonStyles`, `listStyles`, `componentStyles`, `systemMessageStyles`, graph-page shell CSS) as the source; extend `scripts/build-editor.mjs` (it runs after `tsc`, so it can import `dist/`) to write them to a content-hashed `dist/adapters/http-server/shell-assets/` file. This keeps `designTokens` as the single token source, keeps `test/design-tokens.test.js` scanning the CSS, and keeps `scripts/dropdown-smoke.mjs` working. Moving the graph-page literal CSS into an exported constant is the only source move
  - [ ] 3.2 Preserve cascade order: the extracted blocks are not contiguous (`themeStyles` sits between `designSystemStyles` and `buttonStyles`; companion-only `extensionStyles` sits before the shell literal CSS). Either emit ordered assets with one `<link nonce>` per contiguous run, or move the boundary so a single asset covers a contiguous prefix; record which and why
  - [ ] 3.3 Generalize the `drawing-assets.ts` serving pattern (build-output allowlist, sha256 ETag, immutable for hashed names, `nosniff`, GET/HEAD only) and serve `/shell-assets/*` from both `routes.ts` and `integrations/macos-companion/gateway.mjs`
  - [ ] 3.4 Update consumers that render the shell without the server: `integrations/electron/smoke-inline-updates.mjs`, `integrations/electron/smoke-updater-readiness.mjs`, `scripts/companion-browser-smoke.mjs`, `scripts/reference-autocomplete-smoke.mjs` (check whether it needs the shell CSS at all)
  - [ ] 3.5 Update `test/graph.test.js` "all browser views share Ember surfaces and semantic controls" (it reads the first inline `<style>` and asserts the `body`/`#graph-header`/`#graph-wrap`/button rules that slice 1 moves) to read the served CSS plus the inline style, without weakening its assertions
  - [ ] 3.6 Update the owning docs (`browser.docs.md`, `src/architecture.docs.md`, `docs/shared-memory-protocol.md:322` "no asset deployment" wording) for the new asset boundary
- [ ] 4.0 Verify slice 1 against regression gates and record evidence (tested commit/build, selected commands, material untested limits) in this list
  - [ ] 4.1 `npm run build`, then `node --test test/server-http.test.js test/lexical-bundle.test.js test/browser-theme.test.js test/graph.test.js test/design-tokens.test.js test/architecture-boundaries.test.js test/source-graph-contracts.test.js test/package-footprint.test.js test/package-entrypoints.test.js test/companion-live-gateway.test.js`, plus `node scripts/check-package-size.mjs`
  - [ ] 4.2 Parity oracle (research.md 7.3): nonce-normalized `graphPageHtml` diff before/after for home/graph/settings and `{ companion: true }`; rule-set and order equality of served CSS vs removed inline CSS
  - [ ] 4.3 Browser: `npm run smoke:theme` with `JUMPYBRAIN_SMOKE_SCREENSHOT_DIR` on both builds and pixel-diff; `npm run smoke:sidebar`, `npm run smoke:graph-editor`, `scripts/dropdown-smoke.mjs`, `scripts/companion-browser-smoke.mjs`
  - [ ] 4.4 Desktop (Electron 44.10.0 loads the gateway-served shell, so the new asset route is on its path): `scripts/electron-smoke.mjs` (confirms nonce on an external `<link>` applies), `scripts/window-chrome-smoke.mjs`, and the two updated Electron fixture smokes
- [ ] 5.0 Proposal execution phase 2 (only after 4.0 evidence is accepted): decision on roll-out across the remaining blocks, one slice per task list, each with its own verification record

## Blockers

- 2.0 is waiting on the user's go/no-go. 1.0 research and its 1.7 review are recorded; no implementation has started.

## Deep Dive

- Research doc: `deep-dives/adapter-string-raw-simplify/research.md` (section 10 records the review corrections)

### Deep dive findings

Full evidence: [deep-dives/adapter-string-raw-simplify/research.md](/Users/monkey/dev/jumpyBrain/deep-dives/adapter-string-raw-simplify/research.md). Summary:

- Evidence numbers mostly check out with one correction: 57 `String.raw` grep hits in 23 files, but one is a comment (notes-browser.ts:11) and 4 are regex literals (editor-markdown.ts:37-40), so the real surface is 52 presentation blocks / ~4,645 lines (4,649 lines across all 56 template literals). The Lexical bundle is inlined into the nonce'd script, not served externally; the true external-asset precedent is the drawing frame (`drawing-assets.ts`, `script-src 'self'`, allowlisted build output + ETag).
- Composition: `routes.ts:70-79` mints a per-request nonce and CSP; `graph-page.ts` `graphPageHtml()` builds one document with one inline `<style nonce>` (all CSS blocks concatenated) and one inline `<script nonce>` (editor bundle + all JS blocks + a ~370-line orchestration literal). All JS blocks share a single scope, so only CSS/markup extraction is mechanical; JS extraction needs a bundled entry like `browser-entry.ts`. `dream-handoff.ts` even embeds a `Function.toString()`.
- Nonce/CSP: generated per request (`randomBytes(16)` routes.ts:72, `randomBytes(18)` gateway.mjs:384), identical CSP on both hosts, validated in `graphPageHtml`, applied to inline script/style tags, and re-read at runtime (`document.currentScript.nonce`) to nonce dynamically injected extension scripts. Static assets can keep the same guarantee with zero CSP change by putting the nonce attribute on external `<script src>`/`<link>` tags (Option A, recommended for slice 1); adding `'self'` (drawing-frame pattern) is Option B and weakens the nonce-only property. `themeBootstrap` must stay a blocking pre-paint script. Pinned by `test/server-http.test.js:74-140` and `test/lexical-bundle.test.js:11-22` (exactly two nonce-only script tags).
- Why inlining exists: deliberate — content-free nonce shell and single-package "no asset deployment" serving (`docs/shared-memory-protocol.md:322`), readability comment at notes-browser.ts:10-11, pre-paint theme bootstrap, nonce since the initial snapshot; `docs/build-footprint.md:381` already calls moving surfaces out of the inline script "an architecture change". Incidental: the 4 regex literals and the `toString()` trick.
- Electron loads the same gateway-served pages (`window.mjs:143` `loadURL(${origin}/#companion=…)`, `webSecurity: true`); no special file paths. Regression surface: companion shell via `gateway.mjs:383-388`, extension asset nonce injection, drawing frame, plus two Electron smokes and `scripts/companion-browser-smoke.mjs` that serve `graphPageHtml('fixture')` with hand-written CSP and would need the new asset route. Nine test files regex-extract the last inline `<script>` from the shell HTML — CSS-only slices keep those green, JS slices break them (but see review correction 1: one test reads the inline `<style>`).
- Slicing: slice 1 = static shell + design-system CSS (~270 lines: designSystem/button/list/components/systemMessage styles + graph-page's literal CSS) into a hashed `shell-assets/shell-<hash>.css` served via a generalized `drawing-assets.ts` pattern from both `routes.ts` and `gateway.mjs`, referenced as `<link rel="stylesheet" nonce>` (CSP unchanged). Slice 2 = remaining per-view CSS (~1,500 lines, palettes as static per-palette files). Slice 3 = markup blocks (~350 lines). Slice 4 = inline JS (~3,000 lines) via a bundled shell entry — highest risk, do last.
- Verification per slice: `npm run build`, then `node --test test/server-http.test.js test/lexical-bundle.test.js test/architecture-boundaries.test.js test/source-graph-contracts.test.js test/package-footprint.test.js test/package-entrypoints.test.js test/companion-live-gateway.test.js` plus `node scripts/check-package-size.mjs` (budgets 3.3M/9.1M/7.5M/780 frozen in `scripts/package-budget.mjs`; byte-neutral expected, file-count headroom 114); browser smokes per docs/testing.md (`npm run smoke:theme` with `JUMPYBRAIN_SMOKE_SCREENSHOT_DIR` for pixel diff, sidebar/graph-editor/boards/dropdown/note-find/feedback smokes, companion-browser-smoke; editor slices add `smoke:lexical`, `smoke:page-references` and the collaboration scenario table); desktop (`scripts/electron-smoke.mjs`, `window-chrome-smoke.mjs`, `extensions-desktop-smoke.mjs`). Parity oracle: `graphPageHtml` is deterministic for a fixed nonce — diff nonce-normalized HTML before/after (pattern at `test/server-http.test.js:125`) and diff the served CSS against the old inline `<style>` contents.
- Risks/falsifiers recorded in the doc's section 9: shared-scope JS coupling, CSP contract change if Option B is chosen, test-helper breakage on JS slices, cache-semantics change, and concrete falsification criteria (nonce-on-external failing in Electron 44, CSS rule-set mismatch, theme-smoke pixel diffs, footprint gate failures, slice-4 scope ballooning).

### Review corrections (2026-11-16)

Source-checked review of the research; details and evidence in research.md section 10. Verified correct: block counts, nonce/CSP mechanism, `graphPageHtml` consumer list, Electron 44.10.0 loading the gateway-served shell.

1. "CSS-only slices keep tests green" is false for slice 1: `test/graph.test.js:491-510` reads the first inline `<style>` and asserts the `body`, `#graph-header`, `#graph-wrap` and button-primitive rules that slice 1 moves.
2. Missed gate: `test/design-tokens.test.js` is the repo's only CSS lint; it scans style templates in `src/adapters/http-server/*.ts` and carries `graph-page.ts`-specific allowlist entries. Static `.css` files would drop out of it, so the original slice 1 would reduce lint coverage.
3. No ESLint, Prettier or stylelint is configured in the repo, so slice 1 makes nothing newly lintable; that benefit needs new tooling.
4. `designSystemStyles` is generated from `designTokens`/`narrowDesignTokens` (`browser-design-system.ts:137-149`), which tests import; a hand-written `.css` copy forks the token source.
5. The slice-1 blocks are not contiguous in the `<style>` (`themeStyles`, companion-only `extensionStyles` sit between them), so one `<link>` reorders the cascade; this must be designed for, not only listed as a falsifier.
6. Missed consumer: `scripts/dropdown-smoke.mjs` imports `designSystemStyles` and builds its page with `setContent`.

Consequence: slice 1 is narrowed to a delivery-path proof (build generates the CSS from the existing TS sources) and 2.0 now asks explicitly whether lintability is still the driver.
