# Folder explorer

## Goal

Browse canonical Markdown folders and open existing notes from a lean, encapsulated right sidebar with focused search and mouse/keyboard navigation.

Completed: added an index-independent canonical metadata read and a dependency-free explorer with separate model, controller and view modules. The right panel supports compact folders, title/path search, keyboard navigation, guarded note opening and responsive overlays. Existing editing and brain transport remain the owners of save protection and authorization.

## Decisions

- Use a collapsible right sidebar, filling the available viewport on narrow screens.
- Reuse existing guarded note navigation and authenticated selected-brain transport.
- Keep canonical file discovery separate from the browser tree model, controller and presentation. No new dependency or index requirement.
- Borrow folders-first natural sorting, compact single-child chains and keyboard tree navigation from [Zed's project panel](https://zed.dev/docs/project-panel). Inline title/path filtering is a jumpyBrain adaptation; [Zed uses a separate finder](https://zed.dev/docs/finding-navigating).
- Browse/open only; no folder creation, rename, move, or deletion in this task.

## Tasks

- [x] Research Zed and inspect existing browser/data boundaries.
- [x] Add canonical file metadata discovery and authenticated hosted/companion transport.
- [x] Build isolated tree/filter/controller/view and minimal shell integration.
- [x] Verify nested paths, no-index discovery, mouse/keyboard/search, guarded note opening, scope changes, errors and narrow/light/dark layouts.
- [x] Update owning docs, pending release notes and changelog; archive with scoped changes for commit.

## Verification and limits

Initial checkout: clean `master` at `97b0ecab5a02bb70f9bf23444fba178860acc442`. Local memory recall returned no matching prior decisions.

- Final `npm run build` passed.
- The initial full `npm test` completed 1,538 tests: 1,535 passed, two failed, one skipped. Findings were the missing default indentation token and the editor bundle size review gate. Both are resolved; final focused reruns passed all 213 tests across explorer data/model, graph/editor, companion/gateway, sidebar navigation, architecture, package footprint and bundle safety. The full installer-heavy suite was not repeated after these focused corrections.
- Initial endpoint tests also identified and corrected the missing `Cache-Control: no-store` response header; auth assertions now match the existing 401 contract.
- `npx --yes --package=playwright node scripts/folder-explorer-smoke.mjs` passed on the final build for hosted and companion fixtures. It covers delayed responses ignored after close/scope change, cached title updates without rescanning, title/path filtering, duplicate basenames, branch restoration, guarded failed saves, refresh/retry, successful narrow/medium navigation and canonical byte preservation.
- Light/dark screenshots were captured at 1280/900/390/320px under `/tmp/jumpybrain-folder-explorer-qa`; representative desktop, medium and narrow captures were inspected. Resize assertions wait for the actual final viewport geometry.
- Same-build bundle comparison: 189,958 gzip bytes without the explorer export, 192,594 with it, a 2,636-byte increase and no added dependencies. Reviewed budget remains tight at 193,000 bytes. Ordinary body autosaves do not rescan the corpus.
- `git diff --check` passed. The optional physical read-only QMD parity test remains skipped because `JUMPYBRAIN_TEST_QMD_BIN` was not provisioned.
- Folder state is tab-local. Only eligible canonical Markdown files contribute folders; empty directories and attachments are omitted. Listing scans the complete corpus without pagination; the companion retains its existing 16 MiB response limit.
- No installed app, personal memory, release or push is part of this task. Native packaged Electron and physical assistive-technology checks remain outside this verification.

## Ownership

- `src/app/server-memory/folder-explorer.ts`: canonical metadata discovery; HTTP/gateway adapters expose the existing authenticated transport boundaries.
- `src/adapters/http-server/folder-explorer-model.ts`: pure tree, sorting, filtering and reveal behavior.
- `src/adapters/http-server/folder-explorer.ts`: scoped panel lifecycle, visible rows and input/navigation behavior.
- `src/adapters/http-server/folder-explorer-view.ts`: markup and shared-token styles.
- Focused data/model tests and `scripts/folder-explorer-smoke.mjs` retain regression coverage; browser/protocol/gateway docs describe boundaries and limits.
