# Canonical JSON boards across CLI, Mac and hosted memory

## Goal

Replace personal app-support collections with `boards/<id>.json` under the selected memory root. Markdown remains canonical for notes; board JSON is durable canonical organization. The same app operations serve local CLI, hosted CLI and the Mac renderer. Breaking changes are authorized; no legacy-store migration or compatibility bridge.

## Tasks

- [x] Implement strict board files, atomic per-board publication and hash-based concurrency across processes.
- [x] Route normal root/target CLI and authenticated server operations through shared app seams; enforce remote write policy.
- [x] Move the Mac UI onto per-board operations; protect read-only brains and preserve scope/draft guards.
- [x] Exercise CLI CRUD, conflicts, malformed/unsafe files and loopback remote operation; manipulate boards in the native Mac UI using a disposable brain.
- [x] Have a subagent review the completed implementation and address findings.
- [x] Update product/module docs, release notes, archive and commit scoped work.

## Decisions

- No live remote deployment exists yet; remote checks use an authenticated loopback server.
- Native checks use source-built production window/gateway with disposable data, not the user's personal notes or installed release.
- Existing app-support collections are ignored and no longer written. No real user data is migrated or deleted.
- Board writes are memory-root writes; shared/read-only destinations retain normal authorization. Card contents remain ordinary notes.

## Outcome

Completed the breaking architecture replacement: one strict `boards/<UUID>.json` per board in the canonical brain, with shared local/runtime/hosted CRUD and bounded Markdown status. The CLI uses explicit `--root` or `--target-url`, works without the Mac app, and remains an optional namespace. The Mac visualization writes the same files through normal brain transport. Board changes require per-board hashes; remote read-only policy applies to every organization write. Removed the app-support collection store, route, native board capability and obsolete CLI flags. Notes and frontmatter are unchanged by board operations.

## Verification

Tested the source tree based on `a6f550b` plus this task's implementation on macOS, 2026-10-30:

- `npm run build` passed (TypeScript and browser bundles).
- `node --test test/boards.test.js test/boards-cli.test.js test/architecture-boundaries.test.js test/companion-browser.test.js test/remote-access-policy.test.js test/http-client.test.js test/server-http.test.js test/runtime-boundary.test.js test/server-boundary.test.js test/extensions-cli.test.js`: **91 passed**, zero failed/skipped. Includes independent CLI-process conflicts, local/hosted CRUD/status, exact note preservation, schema/link/oversize rejection, stale locks/hashes, authentication and read-only write rejection before credentials/files.
- `npx --package=playwright node scripts/boards-smoke.mjs` passed: creation/rename/card actions, search/create/retry, uncertain writes, membership conflicts, editor navigation, settle/restore, two connections sharing one brain, read-only controls, actual scope switching, reload and desktop/mobile light/dark geometry.
- `npx --package=playwright node scripts/board-settings-smoke.mjs` passed: settled recovery, rename/cancel/validation, conflict retention, toggle, confirmed delete/failure retry, note preservation, reload and 1280/390/320px geometry.
- `node scripts/boards-desktop-smoke.mjs` passed in the production sandboxed Electron Mac window/gateway: real CLI create/add/status/settle/delete; native rename, actual Alt+Right card movement, restore, create and confirmed delete; remote read-only card/Settings navigation with all organization writes disabled. Isolated disposable local/remote roots and Electron data were removed afterward; note contents survived board removal and no app-support collections file was created.
- Inspected native local/remote captures and the narrow dark Settings capture. Native results/captures are ignored under `.local-pack/boards-native/`; browser captures are disposable `/tmp/jumpybrain-boards-qa` and `/tmp/jumpybrain-board-settings-qa` artifacts.
- `git diff --check` passed. Updated owning product, module, protocol, CLI and pending release documentation.

Initial harness attempts exposed setup/timing/selector mistakes, corrected before the passing native run. The browser fixture previously expected separate organization for two profiles of one root; it now verifies shared canonical boards.

## Independent review

Requested native subagent `review_canonical_boards` to inspect persistence, transport/policy and UI contracts. Addressed both findings: replaced hard-link publication (which briefly violated single-link reads) with absence recheck and atomic rename under the writer lock; separated Settings navigation from read-only mutation disabling and disabled the note Add-to-board action. Also adopted the review's efficiency suggestion: one canonical corpus discovery per status request, with cancellation propagation.

## Remaining limits

- Remote setup is not live. Authenticated loopback server/client/gateway behavior is verified; deployment, proxy/TLS and real remote connectivity are not.
- This checks a source-built production Mac window, not an installation/release, physical accessibility/IME, or every platform. No installed app, personal brain, global memory, release version or remote deployment was modified. Full repository/release suites were not run; focused changes and relevant transport/boundary regressions passed.
- No legacy importer: old app-support `collections.json` is ignored and retained. Breaking replacement was authorized because there are no existing users.
- Atomic publication/hash checks coordinate cooperating writers, not hostile or arbitrary external filesystem writers. A crash can leave a lock requiring operator inspection. Board lists and separate note reads are not transactional snapshots; status reports bounded evidence and cannot infer completion from column names.
