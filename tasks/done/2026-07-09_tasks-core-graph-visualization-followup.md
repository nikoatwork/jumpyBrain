# Core Graph Visualization Followup

## Completion Summary

All six tasks completed. Reduced duplication and complexity in the graph-visualization code path and hardened the unauthenticated `/graph` HTML shell with a per-response nonce CSP. `npm test` (159 pass) and `npm run cli:pack` pass.

Key changes:
- New shared module `src/app/local-memory/document-fields.ts` for frontmatter/bucket field helpers used by both `overview.ts` and `graph.ts`.
- `src/core/canonical/links.ts` now uses `node:path` posix helpers instead of hand-rolled reimplementations.
- `buildGraph` reads each Markdown file + `stat` once (previously read twice plus stat).
- Removed speculative `"tag"` member from `MemoryGraphNodeKind`; `kindRank` simplified.
- Documented `npm run smoke:graph` in `docs/cloud-shared-memory.md`.
- `/graph` route now sets `X-Content-Type-Options: nosniff` and a strict per-response nonce CSP; `graphPageHtml(nonce)` tags inline `<style>`/`<script>` with the nonce. Test asserts the headers and attributes.

## Goal

Reduce bloat, dead code, and a documentation gap introduced by the graph-visualization commit (`feat: core graph visualization for explicit wiki/Markdown links`, HEAD), plus one defense-in-depth security hardening for the unauthenticated `/graph` HTML shell. No behavior changes to the graph data model unless explicitly noted.

## Notes

- The commit added `src/app/local-memory/graph.ts` (373 LOC), a core link-helper extraction in `src/core/canonical/links.ts`, an HTTP HTML page in `src/adapters/http-server/graph-page.ts`, routes, types, a Playwright smoke script, and tests. Docs (module + cloud-shared-memory) were updated.
- Observed issues are localized and low-risk; none are blocking bugs. `npm test` (159 pass) and `npm run cli:pack` pass at HEAD.
- Per repo convention, do not update `tasks/CHANGELOG.md` for this review-generated todo list.
- Do not modify implementation code during this review; the tasks below are for later execution.

## Relevant Files

- `src/app/local-memory/graph.ts` - New graph assembly; now reads each file once and imports shared helpers.
- `src/app/local-memory/document-fields.ts` - NEW shared module for `bucketFor`, `tagsValue`, `firstString`, `stringValue`, `tryLoadManifest`.
- `src/app/local-memory/overview.ts` - Now imports the shared helpers; local copies removed.
- `src/core/canonical/links.ts` - Reuses `node:path` posix helpers instead of hand-rolled ones.
- `src/core/canonical/markdown-store.ts`, `src/core/memory-root/index.ts` - Existing core modules that already import `node:path`, confirming the dependency is allowed in core.
- `src/types.ts` - `MemoryGraphNodeKind` reduced to `document`/`unresolved`.
- `src/adapters/http-server/graph-page.ts` - Inline HTML/JS page now accepts a nonce and tags `<style>`/`<script>` with it.
- `src/adapters/http-server/routes.ts` - `writeHtml` now sets `nosniff` + per-response nonce CSP.
- `docs/cloud-shared-memory.md` - Documents `npm run smoke:graph` and its env vars.
- `test/server-http.test.js` - Asserts CSP/nonce headers and attributes for `/graph`.

## Tasks

- [x] 1.0 De-duplicate `overview.ts` / `graph.ts` shared helpers
  - [x] 1.1 Extract the identical helpers `bucketFor`, `tagsValue`, `firstString`, `stringValue`, and `tryLoadManifest` (now defined in both `src/app/local-memory/overview.ts` and `src/app/local-memory/graph.ts`) into a shared module under `src/app/local-memory/` (e.g. `markdown-nodes.ts` or extend an existing local helper file).
  - [x] 1.2 Have both `overview.ts` and `graph.ts` import the shared versions; delete the per-file copies. Keep `titleFor`/`bucketType`/`snippetFor` where their behavior differs or move them too if identical.
  - [x] 1.3 Confirm `npm test` and `npm run cli:pack` still pass; verify no overview/graph snapshot drift.
- [x] 2.0 Replace hand-rolled posix path helpers in `src/core/canonical/links.ts` with `node:path`
  - [x] 2.1 Remove `posixNormalize`, `posixBasename`, `posixDirname` and use `path.posix.normalize`, `path.posix.basename`, `path.posix.dirname` from `node:path` (already imported by other core modules such as `src/core/canonical/markdown-store.ts`).
  - [x] 2.2 Preserve existing normalization semantics (leading-slash handling, backslash→slash, trailing `.md` stripping happens in `normalizeCanonicalLinkLookupKey`, not in the path helpers — keep that separation). Add/adjust unit tests only if behavior changes.
- [x] 3.0 Read each Markdown file once in `buildGraph`
  - [x] 3.1 In `src/app/local-memory/graph.ts`, `buildGraph` currently calls `readFile` in `documentNode` (for snippet) and again in the link-extraction loop, plus a `stat` per document. Read the file content a single time and pass it to both `documentNode` and the link extractor.
  - [x] 3.2 Keep the `stat` for `updatedAt` mtime unless the document already carries usable mtime; note any change in warnings behavior.
- [x] 4.0 Remove speculative `"tag"` node kind (extra credit: reduces LOC/branches)
  - [x] 4.1 No code path produces a node with `nodeKind: "tag"`; `kindRank` only needs `document`/`unresolved`. Either (a) remove `"tag"` from `MemoryGraphNodeKind` in `src/types.ts` and simplify `kindRank` to a boolean check, or (b) if tag nodes are planned soon, add a one-line comment documenting the intent and a test exercising the path. Prefer (a) unless a concrete follow-up is filed.
  - [x] 4.2 Update any graph tests/types that reference `"tag"` if removed.
- [x] 5.0 Document the graph UI smoke validation
  - [x] 5.1 Add a short "Validation" note in `docs/cloud-shared-memory.md` (under the graph routes section) describing `npm run smoke:graph`, the required env vars (`JUMPYBRAIN_GRAPH_SMOKE_URL`, `JUMPYBRAIN_GRAPH_SMOKE_API_KEY`), and that Playwright must be installed (`npx playwright install chromium`). Reference the script header in `scripts/graph-ui-smoke.mjs`.
- [x] 6.0 Add defense-in-depth security headers to `/graph` HTML
  - [x] 6.1 In `src/adapters/http-server/routes.ts` `writeHtml`, set `X-Content-Type-Options: nosniff` (cheap, no downside).
  - [x] 6.2 Add a `Content-Security-Policy` for the `/graph` page. Because the page uses inline `<script>` and `<style>`, either serve the script/style from a static asset route and use a strict CSP, or use a per-response nonce/hash and allow `script-src 'self'`/`'nonce-...'`. At minimum block `object-src`, `frame-ancestors`, and external origins for `connect-src`/`img-src`. The page renders server-controlled memory data via `innerHTML` (escaped), so CSP is a defense-in-depth backstop, not the primary XSS control.
  - [x] 6.3 Verify the Playwright smoke script still passes with the CSP in place.
