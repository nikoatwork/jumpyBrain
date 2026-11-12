# Built-in Excalidraw drawings

Completed 2026-11-10 on branch `feat/excalidraw-drawings`: implemented, checked and committed. Not merged to `master`, pushed, installed or released.

User-authorized scope, 2026-11-10: "do it end to end. test ur own work. build it in." Earlier in the same thread the user asked for editable Excalidraw drawings that notes can mention, with file-name search at most, no embedding in notes and no content search. Reference thread: `ed57559c-fb88-4ee3-b1ec-18431e078b14`.

## Work

- [x] Canonical `drawings/<Name>.excalidraw` storage in `core/drawings`: safe names, envelope validation, 4 MiB cap, locked hash-checked create/save/rename/delete, stale-lock recovery.
- [x] App, runtime and server-memory seams; authenticated HTTP routes with a 5 MiB body allowance for these routes only.
- [x] Excalidraw 0.18.1 bundled as a separate lazy application served from `/drawing-frame` and `/drawing-app/*` with its own CSP; note editor bundle and gate unchanged.
- [x] Shell UI in hosted and Mac shells: New drawing, sidebar list, view with rename/copy mention/delete, autosave, conflict choices, read-only mode, navigation/brain-switch/unload barriers.
- [x] File-name search in Cmd/Ctrl+K, mention insertion, `[[Name.excalidraw]]` activation; mentions never create pages or appear as unresolved map nodes.
- [x] Mac gateway static serving, route allowlist and write approval; Electron permits only the drawing subframe.
- [x] Tests, browser and native smokes, owning docs, release note, changelog, package budget record.

## Verification

Tested on base `0ee8752` plus this task's working changes, v0.3.21, one final build before the recorded runs.

- `npm run build` — passed; note editor 674,742 minified / 222,923 gzip (gate 223,250); drawing editor 3,946,275 bytes on disk, entry 227,665 gzip.
- `node --test test/drawings.test.js` plus `architecture-boundaries`, `source-graph-contracts`, `package-entrypoints`, `package-footprint`, `lexical-bundle`, `notes-browser`, `companion-browser`, `server-http`, `electron-host`, `electron-live-network`, `electron-history-menu`, `boards`, `graph`, `macos-companion-gateway`, `daily-notes-browser`, `note-workspace`, `http-client` — 269 passed.
- `npx --package=playwright node scripts/drawings-smoke.mjs` — passed: hosted shell at 1280 px light and 390 px dark (lazy load, create, draw, autosave, no rewrite on open, rename, invalid name, sidebar, copy mention, save-before-leave, frame release, name search without an index, mention opens the drawing and creates no note, conflict with Load newer version and Keep mine, reload, delete, missing drawing, zero external requests); then the Mac shell on a real gateway (save into a local brain, brain-scoped URL, read-only remote brain creates and writes nothing, another brain's link refused).
- `node scripts/drawings-electron-smoke.mjs` — passed in the real sandboxed Electron window: the drawing frame is the only subframe, has no Node bridge or network, native mouse input draws and saves to the local brain, other frames (app page, query variant, external site) load nothing, leaving releases the frame.
- `npx --package=playwright node scripts/sidebar-layout-smoke.mjs` and `scripts/lexical-editor-smoke.mjs` — passed.
- `npx --package=playwright node scripts/sidebar-smoke.mjs` — fails at line 117 (a stubbed document PUT never produces a failed save state). The same failure reproduces on unmodified `0ee8752`, so it is not counted as a pass or attributed to this task.
- `npm run check:package-size` — passed against the raised ceilings. `git diff --check` passed.

The Mac-shell smoke found and fixed one defect during the task: a drawing link from another brain broke the companion session at startup instead of being refused.

## Decisions

- Isolated same-origin frame rather than loading Excalidraw into the shell: it keeps React and Excalidraw's global styles away from the framework-free editor, gives the editor its own CSP, and frees its memory on leaving. Cost: one narrowly permitted subframe in the Electron window.
- Filename is the identity, so files stay portable and can be dropped in; rename does not rewrite mentions.
- Package ceilings raised to 3,300,000 / 9,100,000 / 7,500,000 bytes and 780 files. Measured growth is about 1.70 MB compressed and 4.08 MB unpacked, above the roughly 3.5 MB on-disk estimate given before the user chose to build it in. See [build footprint](../../docs/build-footprint.md#2026-11-10-built-in-drawing-editor).

## Remaining limits

- No CLI or remote-client commands for drawings; agents on the same machine can write files into `drawings/`, hosted agents cannot yet.
- No content search, indexing, embedding in notes, thumbnails, live multiplayer or merge; concurrent edits resolve by an explicit choice.
- Existing mentions are not updated on rename, and there is no inline `[[` autocomplete for drawings (the search picker and Copy mention insert them).
- English interface only; CJK handwriting font and Mermaid import are not shipped.
- Not exercised: touch/stylus, Safari/Firefox, OS clipboard image paste, export output, very large scenes, assistive technology in the canvas, an installed or packaged Mac app, a hosted container deployment.
- The opt-in multiplayer production contract pins the previous `scripts/package-budget.mjs` digest and was not re-captured.
- Pre-release feedback check, release, installation and demo update were not part of this task.

## Relevant files

- `src/core/drawings/`, `src/app/drawings/`, `src/app/server-memory/drawings.ts`, `src/runtime/drawings.ts`.
- `src/adapters/http-server/{drawing-assets,drawing-frame-entry,drawing-frame-assets,drawings-view,routes,index,graph-page,notes-browser,companion-browser}.ts`, `src/adapters/http-protocol.ts`, `src/app/local-memory/connections.ts`.
- `scripts/build-editor.mjs`, `scripts/package-budget.mjs`, `integrations/macos-companion/gateway.mjs`, `integrations/electron/{host,window,smoke-drawings}.mjs`.
- `test/drawings.test.js`, `scripts/drawings-smoke.mjs`, `scripts/drawings-electron-smoke.mjs`.
