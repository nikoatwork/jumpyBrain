# Release testing

Use a small beta gate on the agreed snapshot before publishing through [the release workflow](releases.md). The owner explicitly reduced routine testing on 2026-10-25: keep core behavior and distribution checks, and select additional tests for the behavior actually changed. Do not run the full browser/updater matrix for every release.

## Prepare

- Record the commit, Node/QMD versions, macOS version and architecture. Use disposable memory, CLI config, app profiles and installation paths; never fault-test personal notes or a live shared brain.
- Review the changes since the latest published release and curate the pending notes. Use locked dependencies and provisioned Playwright/QMD; no model download is implied.
- Reuse passing checks when their relevant implementation and inputs are unchanged. Run builds sequentially with checks that consume their output. Build a fresh outer desktop candidate; its verified unchanged native helper may be reused by the existing packer.

## Routine beta gate

```sh
npm run build
npm run desktop:pack
npx --package=playwright node scripts/note-lifecycle-smoke.mjs
npm run release -- --dry-run
npm run release
```

The full release command already runs **`npm test` and `npm run cli:pack`** against aligned CLI/app versions. Do not run separate full-suite/CLI-pack passes beforehand merely to repeat those same gates. A prior passing implementation suite can support preparation; the release-owned full suite remains mandatory. The script still builds more than once internally; no undocumented lean/thorough flag exists.

The core note smoke checks actual canonical capture, immediate search, graph/title navigation, two-tab stale-save recovery, narrow layouts, deletion cancel/apply, preserved referencing files and index refresh. The deterministic suite covers local/hosted policy, CLI/provenance and the frozen extension contract. Inspect the changed screens using the relevant feature's existing screenshots/checks; do not repeat unrelated theme/device permutations.

Before calling it shipped, verify the public tag, exact release notes, one distribution asset, aligned package/lockfile versions and the downloaded asset's SHA-256 digest. Git push alone is not publication. Publishing does not update the user's installed app.

## Choose extra checks for changed behavior

Start with the smallest relevant check, normally one focused command per changed area. Reuse completed feature evidence when its relevant code is unchanged. Add more only for a concrete unresolved issue, a newly found failure, or an explicit request for broader verification. Packaging a normal release is not by itself a reason to run every installed-updater mode.

| Changed behavior | Targeted check |
| --- | --- |
| Desktop host, quit/switch barriers or native lifecycle | `npm run smoke:desktop` against the fresh package. Use `npm run smoke:electron` instead/also when its window/onboarding/gateway behavior is the change under test. |
| Updater or installer replacement/rollback behavior | One representative `node scripts/desktop-update-smoke.mjs success`, plus the specific failure mode whose behavior changed. Other `app-only`, `relaunch-failure`, `helper-crash`, `app-crash`, `cli-open`, `cli-closed` modes stay available for targeted diagnosis; they are not a routine release matrix. Run `success --client-v0.3.7` only when changing compatibility with that worker. |
| Update dialog/window | `env -u ELECTRON_RUN_AS_NODE integrations/electron/node_modules/.bin/electron integrations/electron/smoke-updater-ui.mjs`. |
| First-use setup/onboarding | Select `node scripts/onboarding-install-smoke.mjs` with an absolute `JUMPYBRAIN_QMD_BIN`, or `node scripts/desktop-onboarding-smoke.mjs .local-pack/desktop/jumpyBrain.app/Contents/Resources`, according to the changed flow. These use provisioned tools and disposable roots; they are not clean-machine/live-GitHub or authenticated-agent tests. |
| Editor, references, map or Dream | Select the relevant direct browser script using the existing build: `scripts/markdown-formatting-smoke.mjs`, `lexical-editor-smoke.mjs`, `page-reference-editor-smoke.mjs`, `reference-autocomplete-smoke.mjs`, `page-reference-smoke.mjs`, `graph-editor-smoke.mjs` or `dream-handoff-smoke.mjs`. Do not run the entire group for a small editor change. |
| Obsidian or Logseq import | `npx --package=playwright node scripts/obsidian-import-smoke.mjs` or `scripts/logseq-import-smoke.mjs`. Set `JUMPYBRAIN_SMOKE_PACKAGE_DIR` for an unpacked distribution when package inclusion is in question. Native Obsidian sample creation is separate manual evidence. |
| Extension API/runtime or executable activation | Frozen v1 compatibility is already in `npm test`. Select one of `scripts/extensions-smoke.mjs`, `extensions-browser-controller-smoke.mjs` or `extensions-desktop-smoke.mjs` for the changed host/presentation path. Use installed-update success when testing state/compiler migration; preserve the frozen package and user preferences. No v1-baseline rewrite to accommodate a breaking candidate. |
| Search presentation or dropdowns | Select `scripts/search-recognition-smoke.mjs` or `scripts/dropdown-smoke.mjs`. Reuse unchanged editor/navigation evidence. |
| Retrieval/index/model behavior | Lexical core checks suffice for unrelated changes. When semantic behavior changes, run `scripts/semantic-index-smoke.mjs` with existing absolute `JUMPYBRAIN_QMD_BIN` and `JUMPYBRAIN_SMOKE_MODEL`. Real model evidence is required for semantic claims; lexical/mocked success does not establish it. |
| Hosted connections/auth | Select `scripts/companion-gateway-smoke.mjs` or the focused transport tests. Verify the changed permission/offline/draft behavior without automatically repeating every connection fixture. |
| Feedback/diagnostics | Select the focused deterministic/browser test with a test receiver. Pack validation checks delivery configuration. A live delivery needs explicit authorization and an API inbox match under [feedback checking](check-feedback.md). |

Browser scripts use `npx --package=playwright node <script>` unless they document another entrypoint. Desktop/semantic/install scripts document their own prerequisites. Existing broader commands remain available; this guide changes release selection, not their assertions or safety guards.

## Record and decide

Keep a concise report: snapshot/environment, reused evidence, commands and results, failures/fixes, screenshot/log paths and untested limits. After publication retain it at `tasks/done/releases/vX.Y.Z.qa.md`, separately from the exact public notes. Fixture update versions and local artifacts are not proof of a live public-release upgrade.

Fix demonstrated data loss, false Saved/update success, broken core retrieval, mismatched distribution or failed selected gates before shipping. Rerun affected checks after a fix; let the full release command validate the final versioned snapshot. Record omitted checks as untested/reused, not passed. Intel, physical IME/accessibility, real OS clipboard/Keychain history and arbitrary personal/plugin data require their own evidence when affected.
