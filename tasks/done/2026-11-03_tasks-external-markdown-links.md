# External Markdown links

## Outcome

Completed: supported labeled HTTP(S) Markdown links render in the shared editor and open externally in hosted browsers and the Mac app. Loading, pasting and typing use the same conservative grammar. Label edits, punctuation, deletion, undo and canonical source spelling are verified. Owning docs, measured bundle allowance and pending release notes are updated.

## Scope

Implement the 2026-11-03 frontend feedback requesting labeled external Markdown links. Live AgentMail inspection at 10:29 UTC covered all 42 default received-message records across one page (`complete:true`), excluding two synthetic tests. Read the selected full body; diagnostics were not needed or downloaded. Spam, trash and blocked mail were not inspected. No replies or inbox mutations. [Feedback thread](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=40d1c44c-8378-4a2e-aa76-624d6cdd6523).

## Tasks

- [x] Trace shared editor parsing, source-operation mapping and desktop navigation.
- [x] Render safe labeled HTTP(S) links on load, paste and typing; preserve unsupported source and untouched Markdown.
- [x] Support click/tap and keyboard activation without disrupting selection; open Mac links in the default browser.
- [x] Verify source operations, persistence, undo, code/unsafe literal fallback and host isolation.
- [x] Update owning docs/release notes and archive the scoped work for the completion commit.

## Relevant files

- `src/adapters/http-server/{editor-markdown,lexical-editor,editor-source-map,notes-browser,graph-page}.ts`
- `integrations/electron/{window,host}.mjs`
- `test/{editor-markdown,editor-source-map,electron-live-network,lexical-bundle}.test.js`
- `scripts/{external-links,external-links-electron}-smoke.mjs` and `integrations/electron/smoke-external-links.mjs`
- `package{,-lock}.json`, `docs/build-footprint.md`, owning browser/Electron docs, changelog and pending release notes

## Limits

- Grammar remains intentionally conservative: ordinary unsupported Markdown blocks, relative links, images, unsupported titles/destinations and unsafe schemes stay literal; this is not full CommonMark support.
- Browser checks use desktop/narrow-touch Chromium and the actual Mac Electron host with an injected system opener. Safari, Firefox, physical mobile/IME/assistive technology and launching the user's default browser application were not tested.
- No installation, push, publication, inbox mutation or remote-memory write occurred.

## Verification

- Production build: 668,669 bytes minified / 221,233 bytes gzip, 15 bundled packages. Direct `@lexical/link` declaration matches the existing 0.51.0 transitive pin; production dependencies unchanged. Matched fixed-fingerprint comparison before the final read-only callback was +953 gzip bytes (0.43%); budget review documented in `docs/build-footprint.md` with a 221,500-byte gate.
- Focused parser/source-map/native-host/bundle tests passed (17). Production shared-shell external-link journeys passed at 1280/390px, including real canonical source saves, exact original URL/title and CRLF preservation, formatted and escaped-punctuation label edits, whole-link deletion/undo, selection suppression, read-only navigation, paste, typing and reopen.
- Real Electron production gateway/window test passed: native click reaches injected system opener once, canonical note unchanged, no extra renderer, unsafe protocols and frozen-session activation denied.
- Existing production page-reference editor, canonical formatting/save/refresh/failure/conflict (1280/390/320px) and Lexical preservation/security (1280/390px) smokes passed.
- Initial full suite: 1,877 tests, 1,874 pass, one failure solely at the old 220,250-byte editor ceiling, two skips. Final suite follows the measured budget review and final read-only/escape guards. An intervening run was invalidated by rebuilding `dist` while tests were active (missing-module errors); a final fixed-build run is required below.

- Fixed-build full suite then completed with 1,877 tests: 1,874 passed, two skipped, one backend-host concurrency assertion failed at immediate post-stop status (`starting` instead of `stopped`, `test/backend-host.test.js:54`). The same check passed in the initial suite. No backend implementation changed for this feature; focused rerun and a final full run follow to resolve verification confidence.

## Final verification

- Tested working tree based on `29fd9e9892095f9aa53ae864bd56c2f666ef3666`, product version 0.3.19, compiled source/editor fingerprint `9b56ff0e33724df6`. Scoped implementation, tests and documentation are included together in the completion commit.
- Final `npm test`: 1,877 tests, **1,875 passed, 0 failed, 2 skipped**, 85.810 seconds. The backend-host focused rerun also passed all seven tests; no backend changes were necessary for the observed transient post-stop assertion.
- On that final build, external-link production-shell journeys at 1280/390px and the real Electron gateway/window test passed again. Production page-reference editor, canonical formatting/save/refresh/failure/conflict at 1280/390/320px and Lexical preservation/security at 1280/390px all passed again.
- Build, source-boundary/package/size checks in the suite, JavaScript syntax checks and `git diff --check` passed. Introduced Markdown links, staged whitespace and the repository private-data guard also passed.
