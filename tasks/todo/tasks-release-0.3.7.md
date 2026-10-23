# Release 0.3.7 — QA and publication

Status: validation passed; preparing publication with the user's explicit same-day override.

## Scope

Release the committed changes through `d3d23a2` since published `v0.3.6`, using the next patch version for CLI/runtime and Mac app together. The checkout is clean on master, three commits ahead of origin/master with no divergence. Preserve unrelated active tasks, personal memory, installed app and CLI.

## Tasks

- [x] Fetch origin/master/tags, review numeric published releases and curate the three pending user-facing bullets against the exact source snapshot.
- [x] Complete required core-flow builds/smokes and applicable graph, semantic-index and hosted-memory gates; reuse equivalent final-snapshot evidence where recorded.
- [ ] Run the release dry run and obtain the explicit same-day override before publication.
- [ ] Run full `npm run release`, keeping all four version files aligned; publish annotated tag and distribution.
- [ ] Verify published tag, exact notes, artifact versions and downloaded SHA-256 digest.
- [ ] Archive exact published notes and QA, reset only shipped bullets, commit and push bookkeeping.

## Snapshot and environment

- Source: `d3d23a2`; source runtime/editor fingerprint recorded by the implementation task: `14598887705f8ca5`.
- macOS 15.7.7 (24G720), arm64; Node v26.7.0; Electron 44.8.0. Local QMD and existing GGUF prerequisites are available; exact QMD compatibility will be checked by the real semantic smoke.
- Evidence: `.local-pack/release-0.3.7/` (ignored machine-local logs/artifacts).
- Final graph task already records 1,197 tests passed, one skipped, zero failures; production graph/editor, graph-warning, topic and companion smokes; both themes at 1280/390/320px; inspected screenshots; and measured graph/model limits. Sidebar task records passing sidebar/theme smokes. No source changes followed except documentation.

## Publication eligibility

- Published `v0.3.6`: 2026-10-22T22:01:24Z = 2026-10-23 00:01:24 Europe/Berlin. The user explicitly supplied the required override in this thread: "Yes, publish v0.3.7 today after validation".

## Limits

- Intel, physical touch/IME/assistive technologies, real OS clipboard/Keychain, other browsers, long semantic soak and a real public-release installed upgrade remain untested. Fixture upgrade coverage is not a claim of live public upgrade coverage. Existing broader task lists remain active.

## Verification in this release operation

- `npm test`: passed, 1,198 tests / 1,197 passed / one optional real-QMD test skipped / zero failures. Log: `npm-test.log`.
- `npm run cli:pack`: passed, 182 required files validated; runtime/editor rebuilt at fingerprint `14598887705f8ca5`. Log: `cli-pack.log`.
- `npm run desktop:pack`: passed, fresh Electron packaging against this runtime; native executable reused only after verified unchanged native build inputs. Log: `desktop-pack.log`.
- `npx --package=playwright node scripts/note-lifecycle-smoke.mjs`: passed capture/search, linked graph navigation, two-tab stale-save recovery, 390/320px layout, delete preview/cancel/apply, byte-identical backlinks and index refresh. Log: `note-lifecycle.log`; screenshot: `lifecycle/delete-preview.png`.
- `npm run smoke:electron`: passed local brain creation/opening/relaunch, sandbox/auth, editing/autosave, close guard and canonical save. Log: `electron.log`; welcome screenshot: `.local-pack/desktop/welcome.png`.
- `npm run smoke:desktop`: passed normal quit, crash and recovery with owned host shutdown. Log: `desktop.log`.
- Implementation checks are reused for the unchanged graph/sidebar screens, including both themes, narrow widths, keyboard, graph/editor/topic/warning and companion gateway behavior. Updater/installer/package resource code is unchanged, so additional fault modes are not change-specific gates for this release.
- `node scripts/desktop-update-smoke.mjs success`: passed the production installed local-artifact update, edit/save preparation, cancel/retry/defer/restart barrier and app/runtime/managed CLI agreement. The fixture intentionally uses synthetic old/new versions (0.3.3 → 0.3.4) with this snapshot's code; all five protected files and source policy survived. Logs: `update-success.log`, `.local-pack/update-smoke/success/result.json`.
- `JUMPYBRAIN_QMD_BIN=/opt/homebrew/bin/qmd JUMPYBRAIN_SMOKE_MODEL=/Users/monkey/.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf npm run smoke:semantic-index`: passed with exact QMD 2.8.3 and the existing EmbeddingGemma model. Covers real semantic-only paraphrase evidence, local/server/HTTP parity, incremental edit/rename/delete, failed-model rollback/recovery, missing-FTS rebuild and explicit lexical/semantic policy restoration. No downloads; disposable roots only; optional SIGKILL mode not requested. Log: `semantic-index.log`.
- Additional ignored release probe `npx --package=playwright node .local-pack/release-0.3.7/cli-app.mjs`: passed candidate CLI remember → same-brain app open/edit/save/reopen → byte-preserving lexical reindex → compact recall with hash-checked expansion. Hosted CLI recall/expand succeeded under read-only target policy; writes were blocked; invalid key and offline errors surfaced with Markdown preserved. Log: `cli-app.log`; screenshot `interop/saved-note.png` visually inspected with readable, unclipped controls and no page errors.
- GitHub CLI is authenticated with repository push permission. No dependency, installer, updater or package-resource changes require additional fault-mode gates. All new verification used disposable roots/profiles/installation paths.
