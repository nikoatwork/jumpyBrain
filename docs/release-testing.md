# Release testing

Run this on the agreed release snapshot before publishing, following [the release routine](releases.md). Test actual app/CLI behavior and saved Markdown; a successful build or a screenshot alone is not an end-to-end pass.

## Prepare

- Record commit, Node/QMD versions, macOS version and architecture. Use disposable memory, CLI config, app profile, and installation paths; never fault-test personal notes or a live shared brain.
- Use the prerequisites in [Install](install.md), locked root/Electron dependencies, and Playwright Chromium for browser smokes. Build fresh artifacts from this snapshot; do not reuse an older `.local-pack/desktop` build.
- Seed two linked notes with distinctive text, then use the same brain in the test app and CLI. Keep a second brain for switching. Preserve before/after bytes for notes and settings that should not change.

## Every release

Run from the repository root, in order. These are disposable test/build operations; `desktop:pack` does not install over the user's app.

```sh
npm test
npm run cli:pack
npm run desktop:pack
npx --package=playwright node scripts/note-lifecycle-smoke.mjs
npm run smoke:electron
npm run smoke:desktop
node scripts/desktop-update-smoke.mjs success
```

Reuse passing results for the same unchanged snapshot; the release command still runs its own mandatory validation. Then exercise the following routes in the candidate build, reusing equivalent automated coverage where it proves the same behavior. Use the candidate CLI, not an unrelated installed version; command syntax is in [CLI commands](cli-commands.md).

| Flow | Exercise → required result |
| --- | --- |
| Open a brain | Fresh profile: create a local brain, then open an existing one. Reopen the app → same selected folder and notes; no account or remote server needed. |
| Write and reopen | Create a note; paste a heading, emphasis and a page reference; edit and wait for Saved. Navigate away and reopen → matching canonical Markdown, formatting and stable note identity. |
| CLI ↔ app | CLI `remember --root … --json`, then find/open that note in the app. Edit in the app, then CLI `recall --root … --query … --compact` and `expand` using its returned ID/hash → current text with valid provenance. Explicit lexical reindex must preserve Markdown bytes. |
| Find and connect | Search by distinctive text, follow a page reference, filter the map and open its node → correct note, usable navigation, and no duplicate/unresolved node for the existing target. |
| Protect edits | Edit one note in two tabs → stale save shows review/recovery and retains the draft. Simulate a failed save, then try switching brains or restarting → stay open with recoverable text; no silent overwrite. |
| Switch and delete | Switch between two disposable brains → correct notes, no CLI retargeting. Preview deletion of a linked note, cancel, then confirm → only that file disappears; referencing notes remain byte-identical. |
| Quit and update | Close/reopen the window, then explicitly quit/relaunch. Prepare an update while editing, cancel/retry, defer restart, then install → saves precede replacement; app/runtime/managed CLI agree on the new version and notes/settings survive. |

Inspect the changed screens in light/dark mode, at a narrow width, and by keyboard. Capture the actual rendered result; check for clipped controls, unreadable errors, and unexpected console errors. The updater fixture proves an installed local-artifact upgrade, not a live public-release upgrade.

## Extra checks when the area changes

| Changed area | Run / verify |
| --- | --- |
| Updater, installer, lifecycle or package contents | `node scripts/desktop-update-smoke.mjs <mode>` for **each** of `app-only`, `relaunch-failure`, `helper-crash`, `app-crash`. Verify pinned CLI preservation, rollback/recovery, no false success, and retained next-update helpers. |
| Update window | `env -u ELECTRON_RUN_AS_NODE integrations/electron/node_modules/.bin/electron integrations/electron/smoke-updater-ui.mjs` → all phases, keyboard Details, app-only scope and actionable errors. |
| Editor, references, map or Dream | Relevant `npm run smoke:lexical`, `npm run smoke:page-references`, `npm run smoke:graph-editor`; for Dream run `npx --package=playwright node scripts/dream-handoff-smoke.mjs`. Verify the explicit handoff and scope, with no implicit memory write. |
| Logseq import/conversion | `npx --package=playwright node scripts/logseq-import-smoke.mjs` exercises disposable preview/apply, lexical index/recall, ID show, rendered prose, browser edit/save, conflict protection, source-wins rerun and source immutability. Set `JUMPYBRAIN_SMOKE_PACKAGE_DIR` to a temporary unpacked candidate to verify the distribution without installing it. |
| Retrieval/indexing | `npm run smoke:semantic-index` with existing absolute `JUMPYBRAIN_QMD_BIN` and `JUMPYBRAIN_SMOKE_MODEL` paths. Verify real model retrieval and stale-index repair; lexical or mocked tests do not prove semantic behavior. |
| Connections/auth/hosted memory | `npx --package=playwright node scripts/companion-gateway-smoke.mjs`; also use CLI against a disposable local server to recall with a read-only target, reject writes, and expose invalid-key/offline errors without losing local drafts. |
| Feedback/diagnostics | `npm run smoke:diagnostics` → compact dialog, hover/focus logs explanation, success/failure, retry with retained draft, explicit diagnostic choice and actual submitted attachment. `npm run cli:pack` verifies the tarball's feedback configuration against the intended public default/override; official releases must not disable delivery. Use a test receiver for automated checks. A live test requires explicit user authorization and must be matched in the inbox through [the AgentMail API command](check-feedback.md). |

## Record and decide

Keep a short report in the active task: **snapshot/environment; commands + pass/fail; flows exercised; screenshot/log paths; failures or untested gates**. After release, retain it separately as `tasks/done/releases/vX.Y.Z.qa.md`; public release notes stay short. Updater evidence is under `.local-pack/update-smoke/<mode>/` and `.local-pack/update-ui/`.

Fix failures and rerun affected checks; rebuild/revalidate the final changed snapshot. Block shipping on data loss, false Saved/update success, broken core retrieval, or failed applicable gates. Record unavailable prerequisites and device coverage as untested, never passed. Intel, physical login/Keychain history, OS clipboard/accessibility and a real published upgrade need their own evidence when affected; fixture results do not establish them. After publication, verify the GitHub tag, notes, artifact version and SHA-256 digest before reporting shipped.
