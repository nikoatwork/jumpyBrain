# Task Changelog

## 2026-11-27 — v0.3.28 real-use follow-ups closed

- Smart search keeps its model loaded in a per-brain backend worker for 30 idle minutes. On the Mac, repeat searches dropped from about 2 s to under 1 s, with rows identical to before. Old backends now always exit after an update handoff or a lost lease, smoke scripts stop the backends they start, and remote `status` no longer suggests local-only commands. VPS timing is not re-measured. [Outcome, measurements and limits](done/2026-11-27_tasks-v0.3.28-real-use-follow-ups.md)

## 2026-11-27 — Several hosted brains on one hostname

- A hosted brain can run under a path such as `https://brain.example.com/product`: `--public-base-url` with a path scopes the web UI, live editing and sign-in to that prefix, and the CLI and Mac app accept the prefixed URL. Verified with two brains on one origin in Chromium and on the shared VPS behind Traefik. [Outcome and limits](done/2026-11-27_tasks-hosted-brain-path-prefix.md)

## 2026-11-26 — v0.3.30 beta published

- Adds named CLI targets for local and hosted brains and a deployment guide for a second isolated brain on the same VPS. The full release suite passed and all three published assets were verified. [Published notes](done/releases/v0.3.30.md) · [Release verification](done/releases/v0.3.30.qa.md)

## 2026-11-26 — Multi-brain rollout verified

- One CLI selected two isolated HTTPS brains on the shared VPS. The disposable brain survived an owner handoff and rollback. Managed CLI installs and the packaged Mac app preserved profiles, destinations, data and access through upgrade and rollback. [Verification and limits](done/2026-11-26_tasks-multi-brain-upgrade.md)

## 2026-11-26 — Select a brain by name in the CLI

- Named targets work with local folders and hosted origins. Each remote name uses its own destination-bound credential and existing CLI defaults and Mac app selections stay independent. [Outcome and checks](done/2026-11-26_tasks-multi-brain-cli-targets.md)

## 2026-11-26 — Run another brain on the same VPS

- Added systemd and Coolify guides for hosting independent brains behind one proxy. A disposable second brain passed HTTPS, WebSocket, isolation, and restart checks on the shared VPS. Its resources were removed after the drill. [Outcome and limits](done/2026-11-26_tasks-multi-brain-hosting.md)

## 2026-11-25 — v0.3.29 beta published

- A second same-day release at the owner's request. It ships the `jumpybrain update` fix for release-installed Macs, clearer CLI errors, the Linux engine size estimate, and app updates that move Homebrew installs to the stable Node link. All three assets were verified. [Published notes](done/releases/v0.3.29.md) · [Release verification](done/releases/v0.3.29.qa.md)

## 2026-11-25 — Updates move Homebrew installs to the stable Node link

- App updates now rebuild the app with Homebrew's stable `opt/node` link, and the update transaction moves a pinned CLI launcher and its install record to that link with journaled rollback. Background services start through the path they were launched by. An update started by v0.3.28 or older moves the app only; the CLI follows on the next update. [Outcome, checks and limits](done/2026-11-25_tasks-updater-durable-node.md)

## 2026-11-25 — v0.3.28 in real use on the Mac and on Linux

- Updated the owner's Mac to the published v0.3.28 and used it on the real brain. A throwaway Linux install on the VPS covered the installer, a real smart-search model download, browser sessions and invite links on a temporary server, and the hosted Docker image; all of it was removed afterwards. Fixed `jumpybrain update` refusing release-installed Macs, two unclear CLI errors and the Linux engine size estimate. Open: app updates keep the versioned Homebrew Node path, smart search reloads its model per query, and backend processes left behind. [Tests and fixes](done/2026-11-25_tasks-v0.3.28-real-use-fixes.md) · [Follow-ups](done/2026-11-27_tasks-v0.3.28-real-use-follow-ups.md)

## 2026-11-25 — Browsers stay signed in to shared brains

- Hosted browsers use opaque server-side sessions instead of a key-holding cookie: 400 days, renewed on use, ended by sign-out, admin sign-out or key revocation. Admins copy single-use one-click invite links per key and see signed-in browsers; readers see who they are and **View only**. [Outcome, decisions, checks and limits](done/2026-11-25_tasks-web-viewer-access.md)

## 2026-11-25 — Install profiles and optional smart search

- The installer offers profiles (personal memory by default, Mac app, team brain for agents, browse only) with outcome-first explanations, a terminal-only menu and the recorded choice kept by updates. Smart search is an opt-in add-on (`--smart-search`, `jumpybrain smart-search on|off`), and status/doctor name the active search in plain words. The Mac Settings row is deferred. [Verification and limits](done/2026-11-25_tasks-install-profiles.md).

## 2026-11-25 — Homebrew recovery and shared note links

- Managed installs follow a verified Homebrew Node link across typical upgrades. Desktop gives repair guidance when its Node cannot start, and the installer can reclaim a verifiably abandoned app-update lock. Shared note links offer key entry and reopen the requested note using the existing browser session. [Verification and limits](done/2026-11-25_tasks-november-feedback-fixes.md).

## 2026-11-22 — v0.3.27 beta published

- Shipped server-role access, shared-brain migration and CLI setup, headless installer fixes, trusted project memory and the compact sidebar. The editor stayed below its existing size ceiling, and all three release assets were verified. [Published notes](done/releases/v0.3.27.md) · [Release verification](done/releases/v0.3.27.qa.md).

## 2026-11-21 — Compact sidebar with last-editor marks

- Active pages are one line with an agent or person mark (revision-checked last editor from the attention packet) and Pinned/Today/This week/Earlier captions; Settled and Drawings share a quiet header with counts; Drawings gains a header New drawing (+). [Outcome, checks and limits](done/2026-11-21_tasks-sidebar-compact-rows.md).

## 2026-11-20 — Server-role access and headless CLI clarity

- App access follows server roles; Settings and `access whoami` explain permissions. Remote-only installs shrink and report side effects; read-only command mode and empty-search guidance complete the selected feedback. [Verification and limits](done/2026-11-20_tasks-remote-feedback-implementation.md).

## 2026-11-20 — Project memory checked in Claude Code and Codex

- End-to-end run in the priority hosts (Claude Code, also inside T3 Code, and Codex; Pi is nice to have). The skill now tells agents when durable project capture is on, so both hosts save project decisions to the project without asking; an empty rule slot in `instructions` is fixed. Writes from Codex's default sandbox still fail because the sandbox blocks the local backend; the error now says so. [Host check](done/2026-11-18_tasks-portable-installation-project-integration.md#host-check--2026-11-20), [follow-up](todo/tasks-codex-sandbox-writes.md).

## 2026-11-19 — Shared-server migration for agents

- From one agent-written feedback email: `jumpybrain diff` and `migrate remote` compare a local brain with a server and copy missing or newer-local notes and drawings (never deleting or overwriting newer server work; only declared dates order notes); `connections add --url --key-stdin|--key-env` and `connections test`; `status --all`; `show --json` `body`; a Bearer hint on 401; app connections refer to a key already in `.env` instead of copying it; a deleted brain is no longer recreated by its backend's shutdown diagnostics, and missing folders are flagged. [Outcome, checks and limits](done/2026-11-19_tasks-shared-server-migration.md).

## 2026-11-19 — Drawings in the CLI and tree

- Added `jumpybrain drawings list|show|update` (hash-checked, local or `--target-url`, read-only policy aware) and a drawings branch/packet in `tree`, so agents no longer reverse-engineer HTTP routes; drawings remain unindexed. [Implementation, checks and limits](done/2026-11-19_tasks-drawings-cli.md).

## 2026-11-18 — Project memory approval and project-local search engine

- Commands and installed skills inside a project use its memory once the user runs `jumpybrain project trust`; an unapproved project memory stops commands with that exact command instead of silently using the personal brain, and a repository cannot approve itself. Capture without asking needs the project's `"capture": "durable"` plus device `--allow-capture`. A QMD installed beside jumpyBrain in a consuming project is now found (v0.3.26 missed it), and doctor names the engine and its source. The GitHub release tarball is the supported pinned project dependency; footprint measured and kept as one package; QMD 2.9.0 split into [its own task](todo/tasks-qmd-2.9-upgrade.md). [Outcome, review and limits](done/2026-11-18_tasks-portable-installation-project-integration.md).

## 2026-11-18 — Hosted operations and retrieval evaluation closed

- Closed both long-running lists by owner decision. Their open items are recorded as limits, not as completed work. Hosted operations delivered the clean Docker build, the hosted smoke gate and operator guidance; the documented systemd unit was never run under a real systemd manager and remains an operator example. The retrieval evaluation delivered the in-repo baseline, nine frozen reports and one adopted lexical improvement. Long documents, VPS costs, answer judgment and the embedding-removal decision remain unmeasured. [Hosted operations](done/2026-11-18_tasks-hosted-build-and-operations.md), [retrieval evaluation](done/2026-11-18_tasks-workspace-retrieval-evaluation.md).

## 2026-11-18 — Three simplification proposals declined

- After source-checked research, the owner declined extracting the browser shell's inline HTML/CSS/JS into served assets, a shared smoke-test harness, and splitting `src/types.ts`; each cost more churn and risk than its benefit. A lighter rule replaces each: new browser logic goes into typed modules bundled via `browser-entry.ts`, new smokes reuse the existing shared helpers, and new types sit next to their owning module. No source changed. Decisions: [shell assets](done/2026-11-18_tasks-adapter-string-raw-simplify.md), [smoke harness](done/2026-11-18_tasks-smoke-harness-simplify.md), [types](done/2026-11-18_tasks-types-co-location-simplify.md).

## 2026-11-18 — Open-note attention outcomes

- Current-note Settle/Snooze/Bring back already worked through the live owner (since 2026-11-10); this closes the residual gaps. A valid PATCH receipt is reported as saved even when a racing peer revision supersedes it, a lost reply is "possibly saved" and never retried, confirmation waits for an in-flight checkpoint, and readers are refused with a clear message. Verified with extended 1280/390px Chromium smokes. [Reproduction and verification](done/2026-11-18_tasks-live-note-attention.md).

## 2026-11-18 — Page backlinks

- Pages show "Linked from (N)" from one read-only canonical scan that reuses the graph's link resolution, so links written before a page existed count. "Open in graph" focuses the map on the page. Related pages no longer repeats linking notes. Verified with focused tests and Chromium at 1280/390px in both themes, plus a read-only remote profile and the hosted shell. [Outcome, cost and limits](done/2026-11-18_tasks-page-backlinks.md).

## 2026-11-18 — Separate hosted index storage

- `JUMPYBRAIN_INDEX_DIR` moves rebuildable search state to a separate local disk. Real Linux ARM64 Docker/QMD checks passed through index-volume loss, rebuild and fresh recall with canonical notes, access and recovery preserved. Network filesystems remain unsupported; dependency trimming is deferred. [Outcome and verification](done/2026-11-18_tasks-hosted-index-location.md).

## 2026-11-18 — Guarded CLI appends in live editors

- Shared publication evidence lets open editors adopt guarded appends with routine metadata changes while retaining recovery for real source loss. Verified with a real remote CLI against two local Chromium viewers. [Reproduction and verification](done/2026-11-18_tasks-cli-live-note-updates.md).

## 2026-11-18 — Steady hover in large graphs

- Hover keeps graph labels in place and follows nodes beneath overlapping labels. Verified on a 420-note Chromium fixture in both themes at desktop and narrow widths. [Reproduction and verification](done/2026-11-18_tasks-graph-hover-flicker.md).

## 2026-11-17 — First-line cut saves correctly

- The editor captures the selected Markdown range before cutting. The new-note regression verifies canonical saves at desktop and narrow widths and draft recovery after a genuine external change. [Reproduction and verification](done/2026-11-17_tasks-new-note-false-conflict.md).

## 2026-11-17 — Repository root cleanup

- Grouped research and terminology under `docs/` and container definitions under `deploy/`, removing four root entries while preserving public installer and SDK paths. [Outcome and verification](done/2026-11-17_tasks-root-layout.md).

## 2026-11-15 — Pre-existing browser smoke failures fixed

- Fourteen Chromium smokes that had drifted from the product now run to completion. Most assumed PUT saves, a 296px sidebar, a visible narrow sidebar or stored keys; they now inject failures over the live socket and follow the review recovery flow. The companion smoke runs over real disposable backends with live editing, with the obsolete conflict stop replaced by a two-tab merge scenario. One product fix: a wrong access key no longer traps the open note. [Outcome, verification and follow-ups](done/2026-11-15_tasks-pre-existing-smoke-failures.md).

## 2026-11-15 — Browser design system: shared tokens and components

- Browser UI now composes shared tokens and primitives (buttons, list rows and disclosures, dropdowns incl. a `.dropdown--switcher`, dialogs, cards, popovers, fields, status dots, badges, status text) instead of per-view styles. One chevron glyph replaces seven implementations; the brain switcher hover now covers the whole row. `test/design-tokens.test.js` guards against raw literals and primitive re-declaration. Audited by five parallel agents and reviewed by Codex and Mistral. Merged into `master`. [Rulings, verification and limits](done/2026-11-15_tasks-design-system-components.md).

## 2026-11-14 — Public demo retired

- The public writable demo was taken offline and deleted from its host at the owner's request. The README no longer links to it, the release workflow no longer refreshes a demo, and the pre-commit guard now blocks the demo host in the README. The feedback relay keeps its `/support/feedback` route on the same hostname, so in-app feedback from installed versions still works.

## 2026-11-14 — Public sandbox hardening closed (docs only)

- Closed the July plan with an 80/20 audit. The demo gateway already rate-limits per client (429 + `Retry-After`), allowlists the published key's routes, caps bodies and resets hourly. Proxy limits and the CLI's 429 explanation also already exist, so the in-process limiter, no-auth mode, counters and CLI aliases were dropped. Added a short [public writable sandbox](../docs/vps-deploy.md#public-writable-sandbox) posture to the VPS docs. The audit found that bootstrap keys are admin, so the demo's published key relies only on its gateway allowlist; that follow-up belongs to the demo repo. [Audit, outcome and limits](done/2026-11-14_tasks-public-sandbox-hardening.md).

## 2026-11-14 — Sidebar spacing and typography

- Widened the default sidebar to 320px, increased entry spacing and separated title/preview/age type roles while retaining custom widths. [Verification and limits](done/2026-11-14_tasks-sidebar-spacing.md).

## 2026-11-14 — Properties and saved views dropped

- Dropped the unstarted properties/saved-views plan at the owner's request: personal boards already cover organizing notes into views. Deleted the unimplemented list and unlinked its inbound references.

## 2026-11-14 — Sidebar request reduction

- Opening a shared-brain window reads the attention list once instead of three times, and sidebar previews arrive in that response (capped at 160 characters) instead of one whole-note read per row: 17 requests down to 7 per window locally, 32 down to 14 for two windows on the shared test brain. Idle polling and typing traffic are unchanged; older servers keep the per-row fallback.
- Archived the completed task list as `tasks/done/2026-11-14_tasks-sidebar-request-reduction.md`.

## 2026-11-14 — Legacy managed installation upgrades

- Older installer-owned CLIs now have one migration route: `--source release` (plus `--with-app` for the matching Mac app) stages, digest-verifies and checks the release against the existing brain before replacing software, keeps the brain bytes, settings, credentials, profiles and customized integrations, and retains the previous runtime. A plain `--with-app` rerun refuses an incompatible older CLI before any change, with version, missing capability and command. One shared classifier covers installer, Desktop setup and uninstall; absent legacy fields never widen deletion. Installer, verification and Mac app use one engine. The end-to-end run found and fixed never-indexed brains being unable to migrate. [Outcome, checks and limits](done/2026-11-14_tasks-legacy-managed-upgrade.md).

## 2026-11-14 — Shared-brain admission errors

- HTTP 429/503 refusals from a shared brain or its proxy now get a static explanation (`rate_limited`, `execution_overloaded` or `service_unavailable`) and an optional validated `Retry-After` delay, with one attempt and no automatic retry. A parsed `--json` memory, `run memory:*` or `board` command now fails with one `{error:{code,message,status?,retryAfterSeconds?}}` object on stdout; plain failures stay on stderr. The companion forwards only a valid `Retry-After`. Docs separate backend capacity from operator-owned proxy limits and add `limit_req_status 429` to the nginx example. Also verified live against the shared test brain's real Traefik 429 (`Retry-After: 1`) for CLI reads, a refused write and the companion gateway. The November 10 deployment's actual policy remains unverified. [Verification and limits](done/2026-11-14_tasks-shared-brain-admission-errors.md).

## 2026-11-13 — v0.3.25 beta

- Published Settings/drawing navigation improvements, broader exact-byte task checkboxes, remote key diagnostics and heading-free new agent notes; release testing also found and fixed extension notifications starting a later handler after timeout. Full gate passed (2,044 tests, two optional skips), all three public assets verified, and the public demo matches the exact release revision. [Task](done/2026-11-13_tasks-release-v0.3.25.md) · [QA](done/releases/v0.3.25.qa.md) · [Notes](done/releases/v0.3.25.md).

## 2026-11-13 — No title heading in agent-written notes

- New notes from `remember`, `wrapup` and remote/hosted writers no longer get a `# <title>` H1; an agent body that repeats the title as its first H1 has it dropped (one pure core rule). Reference pages and blank notes are frontmatter only; new synthesis maps drop the topic H1. Excerpt selection counts the frontmatter title for heading-less bodies. Resaving was ruled out as a cause; existing files are untouched. [Findings, checks and limits](done/2026-11-13_tasks-duplicate-title-heading.md).

## 2026-11-13 — Diagnosable remote authentication failures

- When a remote server rejects the access key (HTTP 401 or 403), the CLI now names the key's source and a fingerprint (length and last four characters), never the key. It also lists keys it found but did not use, the key order (environment, then the app key for that URL, then the `.env` default) and how to recover. `status --target-url` shows which key was accepted. `collaborate` reports a rejected key the same way, and keys with smart quotes are refused before sending. Server-redeploy key loss remains unproven. [Verification and limits](done/2026-11-13_tasks-remote-auth-diagnostics.md).

## 2026-11-13 — Task checkbox rendering

- Task rows keep their checkbox when the label has unsupported syntax: only the label stays as editable literal source. `*`/`+` tasks, tasks under a bullet, and Obsidian tab or four-space nesting now render. Toggles change only the checkbox byte, including Undo and an uppercase `X`. Verified with focused editor tests, the new `scripts/task-checkbox-smoke.mjs` and the existing task/bullet/link smokes at 1280/390px. The editor stays under its gzip ceiling. [Task](done/2026-11-13_tasks-checkbox-rendering.md).

## 2026-11-13 — Browse drawings before creating

- Drawings now opens a collapsed sidebar browser with a separate creation action, making existing sketches discoverable without accidental files. [Task](done/2026-11-13_tasks-drawings-browser-navigation.md).

## 2026-11-12 — Access keys last in Settings

- Moved Access keys after Extensions in the Settings navigation. Verified with `npm run build`, the rendered navigation order, `scripts/sidebar-layout-smoke.mjs` (including Settings at 1280/320px), and `git diff --check`. Packaged Mac app not checked; no installation or release.

## 2026-11-12 — v0.3.24 beta and worktree consolidation

- Consolidated outstanding work into master and removed three completed worktrees/five stale branches. Published idle recovery, shared credential storage, note-link editing, the smaller editor, Settings card, access-key controls and drawing mention renames. Verified all three assets and the public demo at the exact release revision. [Task](done/2026-11-12_tasks-release-v0.3.24.md) · [QA](done/releases/v0.3.24.qa.md) · [Notes](done/releases/v0.3.24.md).

## 2026-11-12 — Settings card

- Finalized the large Settings card with search, Escape dismissal and responsive layout; background navigation stays inert and sidebar collapse is preserved. [Verification and limits](done/2026-11-12_tasks-settings-card.md).

## 2026-11-12 — Access keys in Settings

- Admins create and revoke per-person access keys (reader, writer or admin) for a shared brain from Settings → Access keys, the hosted browser, or `jumpybrain access --target-url`; the desktop gateway forwards the admin routes and a key cannot revoke itself. [Checks and limits](done/2026-11-12_tasks-access-keys-settings.md).

## 2026-11-12 — Edit link paths in place

- The link at the caret shows its exact Markdown, so its path can be edited in place, and it renders as a label again when the caret leaves; swaps never save or add undo steps. Measured editor cost: +814 gzip bytes. [Behaviour, checks and limits](done/2026-11-12_tasks-link-source-editing.md).

## 2026-11-12 — Editor bundle tree-shakes Lexical

- The editor build resolves Lexical's production files directly, cutting the bundle from 224,239 to 180,765 gzip bytes with no source or dependency change; the gate is lowered to 185,000. [Measured record](../docs/build-footprint.md#2026-11-12-tree-shaken-lexical-in-the-editor-bundle).

## 2026-11-12 — Note links show their label

- Relative `.md` note links now render as just their underlined label, with the path in the hover tooltip; editing, typing and export keep the exact Markdown. [Checks and limits](done/2026-11-12_tasks-note-link-labels.md).

## 2026-11-12 — Clickable relative note links

- Relative `.md` Markdown links (including bare `folder/x.md`) open the resolved note from any rendered line, answering the November 11 link feedback; other relative links stay inert and the source is unchanged. [Checks and limits](done/2026-11-12_tasks-relative-note-links.md).

## 2026-11-12 — Access keys in a shared .env

- By owner decision, remote access keys moved from macOS Keychain to the owner-only `~/.config/jumpybrain/.env`, shared by the Mac app and CLI, so updates no longer lose them; the Swift host dropped its Keychain code. Existing remote connections need one key re-entry. [Design, checks and limits](done/2026-11-12_tasks-env-file-credentials.md).

## 2026-11-12 — Idle session recovery

- A dropped coordinator request (e.g. laptop sleep) now freezes the Mac editor tab and reconnects it automatically instead of ending the session; authorization failures keep the hard fence. Answers the November 12 feedback; real sleep/wake on packaged Electron untested. [Evidence and limits](done/2026-11-12_tasks-idle-session-recovery.md).

## 2026-11-12 — Commit attribution cleanup

- Rewrote history from 2026-10-29 to remove AI-tool co-author trailers (Claude, Mistral Vibe) at the owner's request; trees, authors and dates are unchanged. Force-pushed master and moved tags v0.3.13–v0.3.23 (release assets unchanged). Commit IDs cited in Markdown docs were remapped; code and JSON evidence files keep pre-rewrite IDs. A versioned `commit-msg` hook now strips such trailers.

## 2026-11-11 — v0.3.23 beta

- Published v0.3.23 (folder sorting, merged overlapping live edits, renames during live editing, fewer shared-brain requests) and refreshed the public demo to its exact revision. Release preparation fixed seven master test failures, updated the lifecycle smoke to the merge behavior and raised the editor gzip ceiling to 224,250 with a measured record. [Release task](done/2026-11-11_tasks-release-v0.3.23.md) · [QA](done/releases/v0.3.23.qa.md) · [notes](done/releases/v0.3.23.md).

## 2026-11-10 — Folder explorer sorting

- The Folders panel sorts notes by name, last edited or created date with compact ages, answering the folder-view feedback; folders stay alphabetical and text filtering is unchanged. [Implementation, checks and limits](done/2026-11-10_tasks-folder-explorer-sorting.md).

## 2026-11-10 — Seamless live co-editing

- Overlapping live edits now merge instead of forcing review, same-position typing keeps each writer's run whole, renames are last-writer-wins, and shared brains stop re-reading the note per keystroke; verified with two- and three-writer browser runs locally and on the hosted brain. [Findings, checks and limits](done/2026-11-10_tasks-seamless-live-coediting.md).

## 2026-11-10 — Drawing mentions follow renames

- Drawing renames rewrite note mentions server-side under the live-editing guard and report notes they could not update; the inline `[[`/`@` picker offers drawing names. [Implementation, checks and limits](done/2026-11-10_tasks-drawing-mention-rename.md).

## 2026-11-10 — v0.3.22 beta

- Published built-in drawings with the pending search, attention/recovery and UI fixes as an owner-approved second release of the day; verified all three assets and refreshed the public demo to the exact tagged revision. [Release and checks](done/2026-11-10_tasks-release-v0.3.22.md).

## 2026-11-10 — Built-in Excalidraw drawings

- Added canonical `drawings/<Name>.excalidraw` files with hash-checked HTTP routes, an isolated lazy editor frame in the hosted and Mac shells, file-name search and note mentions; raised the reviewed package ceilings for the bundled editor. [Implementation, checks and limits](done/2026-11-10_tasks-excalidraw-drawings.md).
## 2026-11-10 — Four UI follow-ups

- Added written/edited labels and related-note hover previews; removed the reference button and simplified deletion confirmation. [Implementation and checks](done/2026-11-10_tasks-four-ui-requests.md).

## 2026-11-10 — Single-user attention and recovery

- Fixed clean active-note attention rejection and unnecessary recovery after changed-source backend restarts, retaining private-draft safeguards. [Verification and historical limits](done/2026-11-10_tasks-single-user-recovery-settlement.md).

## 2026-11-10 — Quiet search freshness

- Removed recurring search-maintenance pop-ups while retaining scoped recovery controls and actionable failures. [Verification and limits](done/2026-11-10_tasks-quiet-search-freshness.md).

## 2026-11-10 — v0.3.21 beta

- Published editor/recovery, Markdown, search, semantic graph, concurrent-agent guidance and updater fixes; verified all three assets and refreshed the public demo to the exact tagged revision. [Release and checks](done/2026-11-10_tasks-release-v0.3.21.md).

## 2026-11-08 — Reviewed distribution limits

- Refreshed distribution ceilings for the current supported package with explicit measured headroom; retained size, file-count and required-resource enforcement. [Decision and checks](done/2026-11-08_tasks-distribution-budget-refresh.md).

## 2026-11-08 — Explicit editor sessions

- One live publication owner now serves editor actions, navigation and recovery through an explicit session interface, replacing the disabled HTTP controller and mutable state mirror. [Completion and evidence](done/2026-11-08_tasks-editor-session-contract-refactor.md).

## 2026-11-08 — Private backend operation agreement

- Consolidated all 31 private operations into one typed signature/policy agreement with exhaustive app bindings; preserved canonical/derived admission and the frozen caller/host/editor behavior. [Completion and evidence](done/2026-11-08_tasks-backend-operation-contract-refactor.md).

## 2026-11-08 — Desktop runtime hygiene finalized

- Closed runtime hygiene with focused lifecycle/retention verification and recorded storage/platform limits; the exact historical macOS 26 failure remains unverified. [Completion and evidence](done/2026-11-08_tasks-desktop-runtime-hygiene.md).

## 2026-11-07 — Automatic link evaluation

- A read-only real-corpus test found useful semantic connections alongside metadata-driven false positives, including at very high similarity. Recorded the decision against automatic canonical links from similarity alone and opened input-quality follow-up. [Evidence and limits](done/2026-11-07_tasks-semantic-auto-link-evaluation.md).

## 2026-11-07 — Strong semantic graph connections

- The graph now combines explicit note links with bounded, strong inferred connections from existing local embeddings, with distinct rendering and stale-index fallback. [Implementation, verification and limits](done/2026-11-07_tasks-semantic-graph.md).

## 2026-11-07 — Embedding dependency pilot

- Completed a local agent retrieval comparison: indexed lexical search was the strongest observed baseline, with no demonstrated optional-vector accuracy gain. Retained lexical default and optional embeddings; broader removal evidence remains open. [Evidence and limitations](done/2026-11-07_tasks-locomo-retrieval-pilot.md).

## 2026-11-05 — Reproducible architecture contracts

- Closed unknown-layer and selected HTTP/live receipt validation gaps; froze 165 focused checks and four browser journeys with ten observed checkpoints. An independent unchanged checkout reproduced the runtime bytes and behavior. Added bounded backend/editor refactor plans. [Completion and evidence](done/2026-11-05_tasks-architecture-contract-hardening.md).

## 2026-11-05 — Architecture contract assessment

- Three scoped reviews support retaining the layered architecture, with contract hardening before selective editor-session or backend-RPC cleanup. Added an interactive ownership map and one active plan; no runtime refactor or behavioral baseline is claimed. [Evidence and limits](../docs/deep-dives/architecture-contracts/assessment.md), [contract-hardening plan](done/2026-11-05_tasks-architecture-contract-hardening.md).

## 2026-11-05 — Focused test selection

- Consolidated change-based verification and editor/WebSocket scenario commands, linked agent/task/module entrypoints, and removed duplicate or blanket test instructions. [Verification and limits](done/2026-11-05_tasks-focused-test-guidance.md).

## 2026-11-05 — Updater readiness and feedback integration

- Failed update discovery no longer revives stale preparation offers; the combined guidance/Markdown/updater snapshot passed 1,946 tests plus production browser/Mac/update flows under unchanged budgets. [Session verification](done/2026-11-05_tasks-feedback-session.md), [updater evidence](done/2026-11-05_tasks-feedback-updater-readiness.md).

## 2026-11-05 — Ordinary Markdown bullets

- Top-level bullets render supported formatting/web links, preserve inert relative paths and canonical source through editing/Undo/live updates, with unchanged size caps. [Verification](done/2026-11-05_tasks-feedback-markdown-rendering.md).

## 2026-11-05 — Concurrent-edit agent guidance

- CLI entry/write/help, managed memory skills and recommended agent instructions now prefer authorized live coauthoring with verified read bases and resync; real browser/CLI insertion preserved both authors’ changes. [Verification](done/2026-11-05_tasks-feedback-concurrent-guidance.md).

## 2026-11-05 — Feedback email tracking

- Indexed reviewed emails by stable message ID and linked covered, open, mixed and deferred outcomes to their task owners; future inbox checks reconcile only unprocessed messages. [Index](feedback.md), [setup record](done/2026-11-05_tasks-feedback-index.md).

## 2026-11-05 — Live-update architecture lookup

- Added a subsystem map and co-located WebSocket connection lifecycle with client, desktop bridge and eval links. [Verification and scope](done/2026-11-05_tasks-live-transport-docs.md).

## 2026-11-05 — Task checkbox presentation

- Centered task boxes on the first text line and replaced the partial completion underline with 80% label opacity in the shared editor. [Verification and native probe limit](done/2026-11-05_tasks-checkbox-presentation.md).

## 2026-11-05 — Exact-title search after external edits

- Fresh search results replace older tab saves even when host indexing bookkeeping lags, preventing externally renamed notes from disappearing. [Verification](done/2026-11-05_tasks-exact-title-app-search.md).

## 2026-11-05 — Clearer README and current screenshots

- Put installation at the top, cut the README by 58%, refreshed editor/map screenshots, and made verified public-demo upkeep part of every release. [Verification](done/2026-11-05_tasks-readme-refresh.md).

## 2026-11-05 — Quiet saved agent edits

- Saved external edits need no retained-version acknowledgement; optional history lives under More info, true draft recovery leads with added/removed text and two choices, and ambiguous clean carets retire without a draft conflict. [Verification](done/2026-11-05_tasks-quiet-agent-external-edits.md).

## 2026-11-05 — Stable related pages

- Related-page recommendations survive typing/deletion and stale refreshes, with ten-second saved-content checks and quieter minute refreshes; verified with real lexical/semantic fixtures and the unchanged local brain. [Verification](done/2026-11-05_tasks-stable-related-pages.md).

## 2026-11-05 — Empty page names while renaming

- Deleting the final title character keeps the Mac editor usable and preserves the draft until a replacement saves; native keyboard, live-backend and full-suite checks passed. [Verification and desktop smoke limit](done/2026-11-05_tasks-empty-page-title.md).

## 2026-11-05 — Branch and worktree cleanup

- Removed 25 stale local branches and 17 extra worktrees after integration checks; preserved branch history and dirty validation files in a verified local recovery archive. [Cleanup record](done/2026-11-05_tasks-branch-worktree-cleanup.md).

## 2026-11-05 — Four-hour UX improvement loop

- Retained 12 verified UX increments with unchanged experience inputs, completed snapshot-specific long observations, and preserved failed attempts and native-scoring limits. Latest full suite: 1,902 passed, 17 skipped. [Reviewed report](../evals/workspace-experience/reports/2026-11-05-four-hour-loop.md), [completed task](done/2026-11-05_tasks-ux-four-hour-loop.md).

## 2026-11-05 — Idle uncertain-draft recovery

- A retained human draft survived 132 peer edits and an hour of idle, then passed guarded navigation, exact copy and explicit saved acceptance without replay; the optional runner records exact inputs and runtime hashes. [Evidence and limits](done/2026-11-05_tasks-ux-idle-uncertain-recovery.md).

## 2026-11-05 — Extended UX stability

- Separate immutable 90-minute and latest-candidate hour-long runs passed 119 and 81 accumulated coauthoring/search cycles; exact runtime/input receipts and canonical contributions are retained. The latest full suite passed 1,902 tests with 17 skips. [Snapshot-specific outcomes and limits](done/2026-11-05_tasks-ux-extended-stability.md).

## 2026-11-04 — Narrow note destinations

- Direct note links and entering the narrow breakpoint prioritize the selected note with transient sidebar dismissal; explicit reopen and desktop preference remain intact. [Tradeoff, verification and retained failed attempts](done/2026-11-04_tasks-ux-narrow-note-entry.md).

## 2026-11-04 — Latest peer feedback timing

- Rapid peer edits restart one scoped update-notice interval; older timers no longer erase newer feedback, and the notice still quiets after activity ends. [Reproduction, verification and limits](done/2026-11-04_tasks-ux-peer-notice-timing.md).

## 2026-11-04 — Read-only copy recovery

- Clipboard fallback keeps selectable copy without inviting read-only publication; writer conflict recovery and live capability changes retain their correct controls. [Rejected candidate, corrected verification and limits](done/2026-11-04_tasks-ux-reader-recovery.md).

## 2026-11-04 — Long-lived UX verification

- A frozen-runtime 45-minute coauthoring/search run passed 60 accumulated cycles; uncertain-save peer recovery, nested-board live faults and owned doctor fixture cleanup retain accurate evidence. [Results and limits](done/2026-11-04_tasks-ux-long-stability.md).

## 2026-11-04 — Honest read-only affordances

- Hosted readers no longer see empty-note writing/formatting invitations; denied creation distinguishes missing write access from missing authentication. [Real-role verification and limits](done/2026-11-04_tasks-ux-readonly-affordances.md).

## 2026-11-04 — Abandoned producer feedback

- Confirmed lease expiry/revocation reaches subscribed editors without a diagnostic lookup; metadata-only notices preserve scoped identity and avoid repeating whole notes for retirement batches. [Default-lease reproduction, verification and limits](done/2026-11-04_tasks-ux-generation-interruption.md).

## 2026-11-04 — UX verification alignment

- Writing/board probes now wait for live confirmation, fault actual source edits and recover through reviewed publication. Platform expectations and narrow generation-feedback checks are explicit. [Verification and limits](done/2026-11-04_tasks-ux-validation-harness.md).

## 2026-11-04 — Scoped Escape handling

- A preserved editor selection no longer lets the attribution hint swallow Escape from formatting/search controls; editor dismissal and composition ownership remain intact. [Reproduction and verification](done/2026-11-04_tasks-ux-scoped-escape.md).

## 2026-11-04 — Search warning scope

- Inactive search warnings no longer obscure note confirmations; reentry reports current uncertainty while real save errors retain priority. [Verification and limits](done/2026-11-04_tasks-ux-search-warning-scope.md).

## 2026-11-04 — Retrieval option error precedence

- Invalid retrieval depth explains allowed choices before engine work or remote credentials, across rich/compact search and recall. [Regression and valid-path verification](done/2026-11-04_tasks-ux-retrieval-option-errors.md).

## 2026-11-04 — Confirmed generation outcomes

- Open-note feedback distinguishes confirmed generation finish, explicit stop and interruption with actor-scoped correlation; presence loss/reconnect never fabricates completion. Targeted compaction keeps distribution budgets while a measured 0.27% editor allowance covers the feedback work. [Verification and limits](done/2026-11-04_tasks-ux-generation-feedback.md).

## 2026-11-04 — Retained-review acknowledgment

- Explicit Keep current quiets the compared record in this tab while keeping earlier versions accessible; new records and failed/stale comparisons retain guidance. [Verification and limits](done/2026-11-04_tasks-ux-retained-review.md).

## 2026-11-04 — Honest editing availability

- Live capability failures preserve loaded saved notes with a safe editing retry; clean navigation remains available, and accessible connection status matches visible feedback. [Verification and rejected-candidate correction](done/2026-11-04_tasks-ux-editor-availability.md).

## 2026-11-04 — Own-edit update feedback

- Own title and Undo receipts stay quiet while other tabs and coalesced foreign changes retain external-update notices. [Reproduction and verification](done/2026-11-04_tasks-ux-own-edit-feedback.md).

## 2026-11-04 — UX baseline feedback candidate

- Initial live hydration no longer reports an external update; retained-copy wording avoids an unsupported removal claim. Build, 89 focused tests and both browser smokes passed. Native Mac rerun and UX ratings remain unverified. [Outcome and limits](done/2026-11-04_tasks-ux-feedback-hillclimb.md).

## 2026-11-04 — v0.3.20 beta

- Published editor improvements, bounded installation storage, CLI note attention, explicit semantic setup and native update helpers. [Release verification](done/releases/v0.3.20.qa.md).

## 2026-11-04 — Checklist authoring and page-link dismissal

- Smaller checkboxes support nested task editing with child rows retained; unsuccessful `@` linking dismisses when writing resumes. Existing external-link rendering was reverified. [Verification and limits](done/2026-11-04_tasks-editor-visual-feedback.md).

## 2026-11-04 — Independent semantic search decisions

- Separate agents authored fresh cases and frozen candidates; two matching baselines and both semantic comparisons completed. Broader eligibility exceeded the fixed context budget, and vector-only retrieval lost required evidence. Both remain unadopted; the [completed feedback list](done/2026-11-04_tasks-feedback-independent-increments.md) and [source-checked report](../evals/workspace-retrieval/reports/2026-11-03-feedback-semantic.md) retain results, canceled optional checks and limits.

## 2026-11-03 — Portable semantic setup and bounded indexing

- Added explicit verified local-model setup and actionable readiness while retaining lexical defaults. A bounded Mac ARM64 context pool reduces measured model-active indexing footprint; index deadlines share finite validation and transport headroom. [Setup verification](done/2026-11-03_tasks-portable-semantic-setup.md), [RAM evidence and limits](done/2026-11-03_tasks-desktop-ram-next-improvements.md).

## 2026-11-03 — Release-native Mac updates

- Verified release-built native helpers avoid compilation on current supported updates, retaining source fallback, staged readiness and rollback. Repeated fixture paths meet the approximate 30-second target; historical workers and fallback remain slower. [Verification and limits](done/2026-11-03_tasks-desktop-update-30-seconds.md).

## 2026-11-03 — Usability state and sidebar

- Added guarded note-attention CLI operations, reduced idle sidebar document traffic, fixed executing-build health identity and pending Feedback dismissal, and retained safe editor recovery reasons. [Verification and limits](done/2026-11-03_tasks-usability-state-and-sidebar.md).

## 2026-11-03 — External Markdown links

- Markdown links render clickable labels and open in the browser while preserving source edits and undo. [Implementation](done/2026-11-03_tasks-external-markdown-links.md).

## 2026-11-03 — Sidebar header alignment

- Right-aligned the wordmark and collapse button with flexible clearance from the Mac window controls. [Verification and limits](done/2026-11-03_tasks-sidebar-header-alignment.md).

## 2026-11-03 — Automatic installation retention

- Installers share verified rollback references and prune owned obsolete software, protecting live/recovery copies and exposing a storage preview. [Implementation](done/2026-11-03_tasks-automatic-installation-pruning.md).

## 2026-11-03 — Native workspace experience evaluation

- Added opt-in real Mac/CLI local and VPS journeys, separate UX judgments, guarded fixture cleanup and retained run evidence. The [first diagnostic baseline](../evals/workspace-experience/reports/2026-11-03-baseline.md) records working local flows, hosted live-editor blockers and misleading feedback; [implementation and verification](done/2026-11-03_tasks-workspace-experience-evaluation.md).

## 2026-11-03 — v0.3.19 beta hotfix release

- Published desktop update brain recovery and actionable support diagnostics; all 1,865 tests and public artifact verification passed. [Release QA](done/releases/v0.3.19.qa.md).

## 2026-11-03 — Desktop update brain recovery

- Existing local brains gracefully replace authenticated older background owners after updates; version guidance and precise backend support codes accompany the fix. [Reproduction and verification](done/2026-11-03_tasks-desktop-update-brain-hotfix.md).

## 2026-11-02 — v0.3.18 beta release

- Published editor deletion, Mac recovery/launch, CLI usability and hosted packaging fixes; all 1,851 tests and public artifact verification passed. [Release QA](done/releases/v0.3.18.qa.md).

## 2026-11-02 — Daily-note evidence dates

- New daily notes record their selected local calendar day for temporal recall and dream windows, rejecting conflicting supplied dates before writing. [Verification and limits](done/2026-11-02_tasks-daily-note-evidence-date.md).

## 2026-11-02 — Existing-word and line deletion

- Native word/line keyboard commands capture their exact source range before publication, fixing retained-draft errors without requiring idle time. [Reproduction and verification](done/2026-11-02_tasks-stale-note-editing.md).

## 2026-11-02 — Mac launch from agent shells

- Packaged Mac builds ignore inherited Electron Node-mode, preventing silent startup bypass. Actual executable/Quit/open checks cover disposable loaded/unloaded login-service states. [Verification and remaining editor/report limits](done/2026-11-02_tasks-desktop-shell-launch.md).

## 2026-11-02 — Preserve signed Mac app resources

- Bundled backends keep generation-bound runtime pins and retirement fences outside the signed app, preserving signature verification while retaining live runtimes through moves. [Verification and limits](done/2026-11-02_tasks-signed-bundle-runtime-pins.md).

## 2026-11-02 — Local backend restart recovery

- The Mac gateway rediscovers authenticated replacement backends, fences retired requests/subscriptions and preserves private draft review. [Verification and limits](done/2026-11-02_tasks-backend-restart-recovery.md).

## 2026-11-02 — On-demand agent guidance and lint observation

- Short entry guidance discovers detailed CLI topics; explicit local lint preview returns findings without reports, indexes or backend startup. [Verification and measured limits](done/2026-11-02_tasks-agent-interface-efficiency.md).
## 2026-11-02 — CLI app connection control

- Agents can register and select local app connections through guarded companion control; status and doctor expose independently resolved targets. [Verification](done/2026-11-02_tasks-brain-connections-and-targeting.md).

## 2026-11-02 — Runtime ownership and retention

- Added pin-aware forward update retention, unchanged-file integration refresh and explicit backend inventory; corrected expected shutdown classification. [Remaining launch evidence](done/2026-11-08_tasks-desktop-runtime-hygiene.md), [integration and lifetime review](done/2026-11-02_tasks-feedback-parallel-integration.md).

## 2026-11-02 — Hosted container packaging

- Repaired clean-context Docker builds and locked runtime/search dependencies, with non-root hosting and a real disposable retrieval/rotation/restore gate. [Verification and remaining Linux service gate](done/2026-11-18_tasks-hosted-build-and-operations.md).

## 2026-11-02 — Consistent CLI help

- Command, namespace and recipe help runs without invoking operations; conventional help aliases and stricter argument errors make the CLI easier to discover. [Verification](done/2026-11-02_tasks-cli-help-and-validation.md).

## 2026-11-02 — Fresh-note editing and calm error feedback

- Fixed deleting the daily prompt through empty paragraphs and replaced technical editor errors with dismissible recovery toasts. [Verification](done/2026-11-02_tasks-fresh-note-edit-feedback.md).

## 2026-11-02 — Contextual editor attribution and client naming

- Removed sidebar actor glyphs, added saved-note attribution beside text selections, and shared optional owner names across Mac onboarding/Settings and CLI agent labels. [Verification](done/2026-11-02_tasks-contextual-editor-attribution.md).

## 2026-11-02 — Compact editor section indicators

- Halved heading-rail line widths and added taller H1/H2 marks while retaining pointer targets and navigation. [Verification](done/2026-11-02_tasks-editor-indicator-lines.md).

## 2026-11-01 — Shared backends and live editing

- Humans and streaming agents edit canonical Markdown together through one local/VPS backend, with revocable access, private drafts and coordinated upgrades. [Implementation](done/2026-11-02_tasks-multiplayer-editing-architecture.md).

## 2026-11-01 — File explorer actions

- Added contextual file rename, copy links and guarded deletion, empty-folder creation, and drag-and-drop or keyboard file moves. [Verification](done/2026-11-01_tasks-folder-explorer-actions.md).

## 2026-11-01 — Page card paths and board context

- Page actions copy local absolute file paths, show board memberships, and offer compact Add to board and clearer More info controls. [Task](done/2026-11-01_tasks-page-card-actions.md).

## 2026-11-01 — Icon-only sidebar toolbar

- Removed resting button borders and the Search label while retaining an active Home border and accessible controls. [Verification](done/2026-11-01_tasks-sidebar-toolbar-icons.md).

## 2026-11-01 — Search excludes the current page

- Web and Mac navigation search hide the current page through frontend filtering, preserving shared ranking and reference pickers. [Verification](done/2026-11-01_tasks-search-exclude-current-page.md).

## 2026-11-01 — v0.3.16 beta published

- Shipped folder browsing, verified agent installation, Obsidian folder guidance and default-off board sidebar pages. Public artifact and aligned versions verified. [Release notes](done/releases/v0.3.16.md), [QA](done/releases/v0.3.16.qa.md).

## 2026-11-01 — Board sidebar pages default off

- Unconfigured boards keep sidebar pages hidden; explicit saved choices remain intact. [Verification and limits](done/2026-11-01_tasks-board-sidebar-default-off.md).

## 2026-11-01 — Verified agent installation

- Added one CLI + Mac app + agents operation, verified release inputs, private Node/search provisioning, recoverable setup and actual installed readiness checks. Verified disposable and authorized personal reinstalls with canonical data preserved. Public rollout and native-toolchain removal remain pending. [Implementation and limits](done/2026-11-01_tasks-agent-installation.md).

## 2026-11-01 — Folder explorer

- Browse nested Markdown folders with focused search, compact trees and guarded note opening in a collapsible right sidebar. [Details](done/2026-11-01_tasks-folder-explorer.md).

## 2026-11-01 — Obsidian folder preservation verified

- Clarified existing nested-folder preservation under `notes/` in import guidance and CLI summaries; verified deep folders and distinct same-named notes through import and reruns. [Verification and limits](done/2026-11-01_tasks-obsidian-folder-preservation.md).

## 2026-10-31 — v0.3.15 beta published

- Shipped default-on board navigation and the matching Boards Settings icon, reusing completed tests at the owner’s request. Public tag, versions, notes and artifact digest verified. [Release notes](done/releases/v0.3.15.md), [QA](done/releases/v0.3.15.qa.md) and [completed task](done/2026-10-31_tasks-release-v0.3.15.md).

## 2026-10-31 — Board navigation enabled by default

- Unconfigured boards now expand into columns and pages automatically while preserving explicit opt-outs and saved collapse choices. Added the missing Boards Settings icon. [Verification](done/2026-10-31_tasks-board-sidebar-default.md).

## 2026-10-31 — v0.3.14 beta published

- Shipped optional board sidebar trees, clearer navigation and settling, actionable remote connection guidance and identical-install native identity stability. Full versioned suite and core-flow checks passed; public artifact digest verified. [Release notes](done/releases/v0.3.14.md), [QA](done/releases/v0.3.14.qa.md) and [completed task](done/2026-10-31_tasks-release-v0.3.14.md).

## 2026-10-31 — Clearer board navigation after UX review

- Narrow sidebar selections now reveal the chosen content without changing desktop preferences; board trees distinguish status placeholders from real pages and explain Open board versus Expand/Collapse actions. [Review decisions and verification](done/2026-10-31_tasks-board-sidebar-review-improvements.md).

## 2026-10-31 — Reliable local and remote connection UX

- Clarified editing opt-in and access-key recovery, retained connection-action focus, handled older servers without boards, and removed an unstable packaging input that broke saved-key access on identical installs. Verified real Mac/HTTPS switching, editing, isolation and repeated installation; removed all temporary data. [Verification and remaining signing limits](done/2026-10-31_tasks-remote-switching-ux.md).

## 2026-10-31 — Optional board navigation trees

- Added personal per-board sidebar expansion into columns and pages, preserving direct Kanban access and remembering disclosure state, including on read-only brains. Removed the general page-list heading. [Verification and limits](done/2026-10-31_tasks-board-sidebar-tree.md).

## 2026-10-31 — Clearer sidebar and visible settling

- Unified pinned/active pages, moved board creation into the toolbar, and grouped brain controls in the footer below Settled. Settling now unpins and visibly removes a page, with pin-restoring Undo, concise action tooltips and filled pin indicators. [Verification and limits](done/2026-10-31_tasks-sidebar-hierarchy-and-settle.md).

## 2026-10-30 — v0.3.13 beta published

- Shipped canonical CLI/Mac boards, collaborative sidebar and writing/onboarding improvements. Full suite and packaged core-flow checks passed; public artifact digest verified. [Release notes](done/releases/v0.3.13.md), [QA](done/releases/v0.3.13.qa.md) and [completed release task](done/2026-10-30_tasks-release-v0.3.13.md).

## 2026-10-30 — Canonical boards across CLI and Mac

- Replaced app-support collections with one JSON per board in the brain. Local/hosted CLI and Mac now share board CRUD/status and write permissions, with no running Mac app required by the CLI. [Verification, review and limits](done/2026-10-30_tasks-canonical-boards.md).

## 2026-10-30 — Boards for agents

- Added an optional `board` CLI namespace for personal Mac board organization and initiative status with current note evidence. [Verification and limits](done/2026-10-30_tasks-board-cli.md).

## 2026-10-30 — Playful board names

- New boards get random productivity-themed names that avoid active and settled board names, including conflict retries. [Verification](done/2026-10-30_tasks-playful-board-names.md).

## 2026-10-30 — Clearer column add controls

- Removed board column counts and placed an outlined plus beside each title. [Verification](done/2026-10-30_tasks-board-column-add.md).

## 2026-10-30 — Hidden sidebar scrollbars

- Hid sidebar scrollbar chrome while preserving native scrolling. [Verification](done/2026-10-30_tasks-sidebar-hidden-scrollbars.md).

## 2026-10-30 — Reference sidebar spacing

- Replaced the footer divider with open space, matched the roomy Settled row, and anchored updates right of the left-aligned utility icons. [Verification](done/2026-10-30_tasks-sidebar-reference-spacing.md).

## 2026-10-30 — Quieter sidebar footer

- Extended the footer divider across the sidebar, removed its theme shortcut and softened the clickable update check. [Verification](done/2026-10-30_tasks-sidebar-footer-quiet.md).

## 2026-10-30 — Compact board settings

- Added rename, settle/restore toggles and confirmed board-only deletion in Settings, with a direct recovery link from settled boards. [Verification](done/2026-10-30_tasks-board-settings.md).

## 2026-10-30 — Compact board cards

- Board cards show three-line content previews and compact right-side hover icons, without a redundant status dropdown. [Verification](done/2026-10-30_tasks-board-card-previews.md).

## 2026-10-30 — Quieter hover explanations

- Control labels wait briefly on hover and cancel during quick pointer movement; keyboard focus help stays immediate. [Verification](done/2026-10-30_tasks-hover-label-delay.md).

## 2026-10-30 — Settled disclosure spacing

- Gave Settled a padded row with the count and chevron aligned right. [Verification](done/2026-10-30_tasks-settled-sidebar-spacing.md).

## 2026-10-30 — Faster board creation and entry

- Boards start with one click and offer inline renaming, keyboard search/create and duplicate-safe retries within each column. [Verification](done/2026-10-30_tasks-board-creation-and-inline-notes-followup.md).

## 2026-10-30 — Sidebar age integration review

- Verified the existing sidebar improvements on master and fixed false due labels during preview refresh, preserving compact ages and current layout. [Verification](done/2026-10-30_tasks-sidebar-age-integration-review.md).

## 2026-10-30 — Full-width sidebar entries

- Sidebar hover/selection spans the full entry; titles and previews truncate before a separate age column. [Verification](done/2026-10-30_tasks-sidebar-full-width-rows.md).

## 2026-10-29 — Sidebar layout repair

- Restored section boundaries, a single bottom action bar, and clean hover/focus geometry. [Verification](done/2026-10-29_tasks-sidebar-layout-repair.md).

## 2026-10-29 — CLI feedback and release inbox review

- Agents can send explicit text feedback through the UI support relay, preview it and receive delivery receipts. Release preparation now includes live feedback triage. [Verification](done/2026-10-29_tasks-cli-feedback.md).

## 2026-10-29 — Right-aligned page actions

- Tucked page actions against the right edge, integrated Add to board, and corrected shared hover geometry across page, history and board controls. [Verification](done/2026-10-29_tasks-page-actions-hover.md).

## 2026-10-29 — Subtle search focus

- Softened the search field focus ring across themes. [Verification](done/2026-10-29_tasks-search-focus.md).

## 2026-10-29 — Sidebar text hierarchy

- Clearer titles, quieter previews and compact edit ages make sidebar pages easier to scan. [Verification](done/2026-10-29_tasks-sidebar-copy-hierarchy.md).

## 2026-10-29 — Local candidates before release

- Added a manual committed-build install/status/rollback workflow for testing the Mac app and CLI with the existing brain before publication. [Verification](done/2026-10-29_tasks-local-dogfood-install.md).

## 2026-10-29 — Collaborative attention sidebar

- Pins lead, settled pages fold away, editor icons identify declared contributors, and refreshed edits return pages to attention. [Verification](done/2026-10-29_tasks-collaborative-sidebar.md).

## 2026-10-29 — Markdown heading navigation

- Added a floating section rail with hover previews, keyboard/click jumps and current-section tracking in the Mac/shared editor. [Verification](done/2026-10-29_tasks-markdown-section-rail.md).

## 2026-10-29 — Simpler first launch

- Mac onboarding now suggests a local folder for one-click entry, with an optional remote connection and clearer recovery. [Verification](done/2026-10-29_tasks-simple-onboarding.md).

## 2026-10-29 — Compact slash menu

- Shortened formatting labels, removed repeated slash commands and added styled glyphs in a compact menu. [Task](done/2026-10-29_tasks-compact-slash-menu.md).

## 2026-10-29 — Subtle hover and centered icons

- Softened hover across light/dark themes, kept icon hover on the glyph, and corrected compact button sizing/centering. [Verification](done/2026-10-29_tasks-subtle-hover.md).

## 2026-10-29 — Sidebar context and resizing

- Added note previews, edit ages, quiet row actions and persisted keyboard/pointer resizing. [Verification](done/2026-10-29_tasks-sidebar-context.md).

## 2026-10-29 — Add notes to boards

- Added board/column selection to the note action card and shared-search Add note controls on boards. [Verification](done/2026-10-29_tasks-note-board-actions.md).

## 2026-10-29 — Connection settings cards

- Redesigned Mac connections with individual cards and a compact + control. [Verification](done/2026-10-29_tasks-connection-settings-cards.md).

## 2026-10-29 — Personal boards

- Added personal Kanban boards above sidebar notes, with Settle archiving and restoration in Settings. Organization stays outside Markdown. [Verification](done/2026-10-29_tasks-personal-boards.md).

## 2026-10-29 — Mac Settings indicator

- Removed the duplicate Settings connection dot. [Verification](done/2026-10-29_tasks-mac-settings-indicator.md).

## 2026-10-29 — Focus starter page

- New local Mac onboarding creates a pinned Today page with 10/5/5 focus checkboxes and persistent dismissal. [Verification](done/2026-10-29_tasks-focus-starter.md).

## 2026-10-29 — Sticky page action card

- Moved Copy/Delete and folded saved-version facts into a sticky top-right card, with an in-flow narrow layout. Related notes stay below the page. [Verification](done/2026-10-29_tasks-sticky-page-card.md).

## 2026-10-29 — Restore note context footer

- Restored related pages below the editor, removed chapter navigation and simplified toolbar copy/delete actions with compact metadata details. [Verification](done/2026-10-29_tasks-note-footer-actions.md).

## 2026-10-29 — v0.3.12 beta released

- Published themes, note/navigation improvements, lexical discovery, update controls and leaner packaging. [Exact notes](done/releases/v0.3.12.md); [verification and limits](done/releases/v0.3.12.qa.md).

## 2026-10-29 — Pastel Pride sidebar

- Applied selected concept A: rainbow sidebar wash and a calm lavender editor in light/dark modes, replacing the top stripe. [Verification](done/2026-10-29_tasks-pride-pastel-sidebar.md).

## 2026-10-29 — Pride theme

- Added a light/dark Pride theme with rainbow accents and graph colours. [Verification](done/2026-10-29_tasks-pride-theme.md).

## 2026-10-29 — Lean distribution and dependency maintenance

- Cut the CLI/source download by roughly 61%, enforce package budgets, and patch Electron's compromised-certificate handling. [Measurements and limits](../docs/build-footprint.md).

## 2026-10-29 — Constraint and range-read decisions

- Retained production after natural-question classification exceeded the context cap and cited-range reads lost source qualifications. [Results](../evals/workspace-retrieval/reports/2026-10-29-constraints-ranges-v7.md).

## 2026-10-29 — Retrieval selection decisions

- Retained current retrieval after full-pool ordering failed fresh gates and rank-spread reads lost evidence. [Results](../evals/workspace-retrieval/reports/2026-10-29-selection-v6.md).

## 2026-10-29 — Quiet sweep completion

- Checking a task gives a subtle sweep and leaves a filled tick and success baseline, with theme-aware colors and Reduced Motion support.

## 2026-10-29 — Named-source lexical retrieval

- Adopted bounded metadata discovery with named-source ordering after fresh evidence, quiet cost and exact production-parity checks. [Measured results and limits](../evals/workspace-retrieval/reports/2026-10-29-discovery-v5.md), [task](done/2026-10-29_tasks-retrieval-candidate-discovery.md).

## 2026-10-29 — Checkbox delight exploration

- Compared three animated checkbox completion prototypes across six themes, with interactive replay and real editor screenshots; production selection remains open. [Findings](../docs/deep-dives/checkbox-delight/findings.md).

## 2026-10-28 — Retrieval experiment decisions

- Completed three independent retrieval experiments and a fresh-confirmation follow-up; retained current runtime behavior after quality, token or generalization gates failed. [Paired results](../evals/workspace-retrieval/reports/2026-10-28-experiments-v2.md), [follow-up](../evals/workspace-retrieval/reports/2026-10-28-identity-v4.md).

## 2026-10-28 — Calm note writing

- Folded formatting behind a visible Format control, kept Link directly reachable and made section navigation discoverable from Page details. [Design and verification](done/2026-10-28_tasks-calm-note-journey.md).

## 2026-10-28 — Workspace retrieval baseline

- Added a versioned fictional-workspace retrieval eval and reproducible baseline, with development assets excluded from the installable package. [Scores and limits](../evals/workspace-retrieval/reports/2026-10-28-baseline-v1.md).

## 2026-10-28 — Sidebar polish

- 2026-10-28 — The Mac note workspace adds optional section navigation and saved-version context, visible draft handoff and clearer save feedback.
- Replaced pin/refresh glyphs, styled the jumpyBrain wordmark, and moved the active brain above the footer icons. [Verification](done/2026-10-28_tasks-sidebar-brand-icons.md).

## 2026-10-28 — Workspace navigation history

- Added top-left Back/Forward controls with five previous app destinations, graph return and separate Settings navigation. [Verification](done/2026-10-28_tasks-workspace-history.md).

## 2026-10-28 — Missing graph topics

- Missing graph links open useful topic previews with linked notes and optional page creation. [Verification](done/2026-10-28_tasks-graph-linked-topic-preview.md).

## 2026-10-28 — Reference spacing

- Collapsed page-reference brackets without reading gaps and revealed syntax only in the edited block. [Verification](done/2026-10-28_tasks-reference-bracket-spacing.md).

## 2026-10-28 — Compact empty search

- Collapsed empty search results/footer space and dividers until content is visible. [Verification](done/2026-10-28_tasks-empty-search-section.md).

## 2026-10-28 — Mono theme

- Replaced Grove with a neutral black/white/gray Mono palette in both schemes, preserving saved selections. [Verification](done/2026-10-28_tasks-mono-theme.md).

## 2026-10-28 — Persistent update button

- Kept the Mac sidebar update control in a fixed slot, with quiet manual checks and state-specific download/relaunch actions. [Verification](done/2026-10-28_tasks-persistent-update-button.md).

## 2026-10-28 — Hourly update checks

- Mac release discovery runs hourly while the app stays open, retaining pending updates and quiet network retries. [Verification](done/2026-10-28_tasks-hourly-update-checks.md).

## 2026-10-28 — Latest-release update verification

- Confirmed direct upgrades to the highest published version and added multi-version/pagination regressions. [Verification](done/2026-10-28_tasks-update-latest-release.md).

## 2026-10-28 — v0.3.11 beta

- Published focused Settings, visual themes, and sidebar/formatting refinements. [Release notes](done/releases/v0.3.11.md) and [verification](done/releases/v0.3.11.qa.md).

## 2026-10-28 — Theme visual coverage

- Verified every built-in light/dark theme across writing, search, maps and Settings, retaining a repeatable desktop/narrow visual check. [Review](done/2026-10-28_tasks-theme-visual-review.md).

## 2026-10-28 — Appearance choices

- Appearance adds visual scheme selection and paired Ember, Ocean and Grove themes, with instant application and synced preferences. [Verification](done/2026-10-28_tasks-appearance-settings.md).

## 2026-10-28 — Sidebar action order

- Moved Search to the right of New note, matching visual and keyboard order. [Verification](done/2026-10-28_tasks-sidebar-search-order.md).

## 2026-10-28 — Settings navigation

- Settings replaces note navigation with focused sections and a Back action that restores the app view. [Verification](done/2026-10-28_tasks-settings-sidebar.md).
## 2026-10-28 — Formatting toolbar layout

- Aligned and grouped note formatting actions with equal targets and consistent wrapping. [Verification](done/2026-10-28_tasks-formatting-toolbar-spacing.md).

## 2026-10-27 — Sidebar footer spacing

- Matched footer action sizes and gaps, including native Updates and narrow touch targets. [Verification](done/2026-10-27_tasks-sidebar-footer-spacing.md).

## 2026-10-27 — v0.3.10 beta

- Published Mac window/update improvements and the completed editor, discovery and feedback follow-ups. [Release notes](done/releases/v0.3.10.md) and [verification](done/releases/v0.3.10.qa.md).

## 2026-10-27 — Integrated Mac sidebar

- Mac windows integrate native controls and quiet branding with global Search/compose; update readiness follows its button border. [Verification](done/2026-10-27_tasks-mac-sidebar-window-chrome.md).

## 2026-10-27 — Mac update profiling

- Fresh-helper profiling identifies native compilation as the remaining bottleneck; release-built helpers are the next experiment. [Measurements](done/2026-11-03_tasks-desktop-update-30-seconds.md#measurement-increment--2026-10-27).

## 2026-10-27 — Faster Mac updates

- Mac updates reuse verified native helpers, bringing measured unchanged-helper application below 30 seconds while preserving CLI support and recovery. [Verification](done/2026-10-27_tasks-desktop-update-speed.md).

## 2026-10-27 — Related pages

- Saved notes surface up to five relevant pages through bounded shared search and guarded navigation; [scope and verification](done/2026-10-27_tasks-note-related-pages.md).

## 2026-10-27 — In-note find

- Command-F finds rendered note text with highlighted matches and keyboard navigation while preserving Markdown and editor history; [implementation](done/2026-10-27_tasks-note-find-text.md).

## 2026-10-27 — Editor reading and formatting

- Added source-preserving readable pipe tables, quieter reference brackets and keyboard formatting slash commands; [editor verification](done/2026-10-27_tasks-editor-slash-commands.md) and [combined end-to-end checks](done/2026-10-27_tasks-feedback-integration.md).

## 2026-10-25 — v0.3.9 beta

- Published the completed editor/import, search/Settings and setup/extension changes; reduced routine beta preparation to three commands with targeted extras. [Release verification](done/releases/v0.3.9.qa.md).

## 2026-10-25 — Markdown checkboxes and code

- Added task checkboxes and inert inline/fenced code while preserving untouched Markdown and guarded save/history flows; [implementation and verification](done/2026-10-25_tasks-markdown-checkboxes-code-tables.md). Tables are deferred.

## 2026-10-25 — Obsidian vault import

- Added local byte-preserving Obsidian import with transactional reruns, separate ownership, canonical retrieval/editor visibility and mixed-import guards; [implementation and verification](done/2026-10-25_tasks-obsidian-logseq-imports.md).

## 2026-10-25 — Shared dropdowns

- Settings and brain switching share themed dropdowns with parent-fitting controls and menus; [implementation and verification](done/2026-10-25_tasks-shared-dropdowns.md).

## 2026-10-25 — Simpler search layout

- Matched the search reference with note icons, a separate age column and a wider dialog; removed browser filters and author/creation details. [Implementation and verification](done/2026-10-25_tasks-search-reference-layout.md).

## 2026-10-25 — Structured search results

- Compacted results into title/relative-age headers, one-line previews and path/known-editor metadata; [implementation and verification](done/2026-10-25_tasks-compact-search-results.md).

## 2026-10-25 — Compact memory search

- Removed routine popup copy and replaced the stale-index text action with a named header icon; [implementation and verification](done/2026-10-25_tasks-search-popup-copy.md).

## 2026-10-25 — Update readiness indicator

- Mac download/relaunch readiness gains a rotating glow with a static Reduced Motion presentation; [implementation and verification](done/2026-10-25_tasks-update-attention-halo.md).

## 2026-10-24 — Verified onboarding recovery

- Improved setup diagnostics, Desktop recovery and capture/date guidance after real Claude and native onboarding checks; [results and remaining platform limits](done/2026-10-24_tasks-onboarding-full-validation.md).

## 2026-10-24 — Extension recovery and lifecycle hardening

- Preserved last-working extensions across restart, made corrupt-registry safe mode usable, suppressed current updater probe execution, and clarified author contracts while freeing switch/quit from observers; [recovery verification](done/2026-10-24_tasks-extension-upgrade-recovery.md) and [lifecycle/SDK verification](done/2026-10-24_tasks-extension-contract-followup.md).

## 2026-10-24 — First-time onboarding

- Clarified agent-assisted setup and same-brain Desktop selection, and fixed literal-path installer commands and misleading preview completion; [synthetic journeys and validation](done/2026-10-24_tasks-synthetic-onboarding.md).

## 2026-10-24 — Extension examples and upgrade contracts

- Added Candy Pink and Pomodoro, froze API v1 compatibility checks, and repaired paired-update CLI compilation; [review, evidence and remaining hardening](done/2026-10-24_tasks-extension-examples-contract-review.md).

## 2026-10-24 — v0.3.8 beta

- Published search recognition, executable extensions, living pages, import and Mac interface improvements; [release notes](done/releases/v0.3.8.md) and [verification](done/releases/v0.3.8.qa.md).

## 2026-10-24 — Installed Mac upgrade compatibility

- Incoming Mac releases supply the pinned extension compiler through the existing installed updater; [compatibility fix and verification](done/2026-10-24_tasks-updater-compiler-distribution.md).

## 2026-10-24 — Easier brain switching

- Added direct sidebar brain switching, optional connection names and clearer add/remove behavior, with native Mac flow coverage; [flow review](done/2026-10-24_tasks-connection-usability.md).

## 2026-10-24 — Lean Settings

- Simplified Settings into compact brain rows and extension controls, with one refresh icon and less routine copy; [implementation](done/2026-10-24_tasks-settings-cleanup.md).

## 2026-10-24 — Recognizable note search

- Search shows readable previews, edit dates and declared editors, with date/editor filters and bounded paging; [implementation and verification](done/2026-10-24_tasks-search-result-recognition.md).

## 2026-10-24 — Shared system messages

- Unified Mac/editor system warnings and notifications behind one scoped dispatcher with shared priority, dismissal and lifecycle; [implementation and verification](done/2026-10-24_tasks-shared-system-messages.md).

## 2026-10-24 — Release guidance organization

- Moved recurring [lean beta guidance](../docs/lean-beta-releases.md) into release documentation; archived the superseded planning list with implementation limits preserved.

## 2026-10-24 — Executable desktop extensions

- Added a public extension API for trusted local commands, panels and themes, with CLI management and runnable examples; [implementation and validation](done/2026-10-24_tasks-executable-extensions.md).

## 2026-10-24 — Floating feedback and Settings version

- Moved temporary feedback into compact bottom-left overlays and exposed the installed Mac version in Settings; [implementation and verification](done/2026-10-24_tasks-floating-status-version.md).

## 2026-10-24 — Readable Logseq imports

- Logseq imports convert outer prose outlines into readable Markdown, with exact-preservation mode and safe identity-preserving upgrades; [implementation and verification](done/2026-10-24_tasks-logseq-readable-import.md).

## 2026-10-24 — Living topic evidence

- Dream pages expose bounded [source-version checks](done/2026-10-24_tasks-living-topic-pages.md) through local/hosted CLI and browser, with visible limitations and guarded no-op preservation.

## 2026-10-24 — Contextual indexing evaluation

- Retained existing indexing after [contextual enrichment showed no adoption evidence](done/2026-10-24_tasks-contextual-indexing-evaluation.md); independent review preserves alias/ancestor excerpt gaps.

## 2026-10-24 — Completed task reconciliation

- Archived the completed [original sidebar updater](done/2026-10-24_tasks-sidebar-updates.md) and removed the stale active [browser design-system](done/2026-10-22_tasks-browser-design-system.md) duplicate, preserving verification and successor history.

## 2026-10-23 — Bounded desktop RAM study

- Recorded matched RAM measurements and kept Electron; [closed the bounded study](done/2026-10-23_tasks-desktop-ram-follow-up.md) with default-deadline acceptance and production budgets explicitly unproven.

## 2026-10-23 — Relevance-driven graph results

- Removed the twelve-note display cap while retaining stricter relevance matching; finalized [the graph result-count adjustment](done/2026-10-23_tasks-graph-search-no-display-cap.md).

## 2026-10-23 — Conservative graph search

- Tightened graph search to twelve strong matches without nonmatching neighbor expansion; finalized [selection policy and verification](done/2026-10-23_tasks-graph-search-precision.md).

## 2026-10-23 — Icon-only desktop updates

- Removed sidebar update text/details and added a subtle glow for download/restart readiness; finalized [the updater presentation](done/2026-10-23_tasks-icon-only-updates.md).

## 2026-10-23 — Quieter interface controls

- Moved Home into the icon row, replaced connected text with a muted green dot, and compacted navigation, Settings and graph controls; finalized [the interface pass](done/2026-10-23_tasks-interface-polish.md).

## 2026-10-23 — Feedback delivery and dialog

- Restored packaged Mac feedback delivery, simplified the dialog, and added API inbox checks; [installed-app delivery and verification](done/2026-10-23_tasks-feedback-release-configuration.md).
## 2026-10-23 — Temporary note feedback and compact controls

- Added expiring, dismissible note toasts and simplified note detail actions; finalized [feedback/control cleanup](done/2026-10-23_tasks-mac-detail-feedback.md).

## 2026-10-23 — Installed feedback delivery failure

- The actual Mac feedback test found a missing bundled relay URL; recorded [failed delivery evidence](done/2026-10-23_tasks-installed-feedback-e2e.md) and tracked the release-configuration repair.

## 2026-10-23 — Feedback query instructions

- Documented the AgentMail inbox-checking procedure and linked agent guidance; finalized [access, reporting rules and verification limits](done/2026-10-23_tasks-feedback-query-instructions.md).

## 2026-10-23 — Mac update discovery after installation

- Fixed startup discovery after completed updates so an old success record cannot hide newer releases; finalized [the regression fix](done/2026-10-23_tasks-update-startup-discovery.md).

## 2026-10-23 — v0.3.7 beta release

- Published [v0.3.7](done/releases/v0.3.7.md) with a continuous sidebar list, graph topic exploration and automatic background search-index refresh; [release QA and limits](done/releases/v0.3.7.qa.md).

## 2026-10-23 — Graph topic exploration

- Added linked topic exploration, adaptive titles and dense rendering with automatic background search maintenance; finalized [implementation and measured limits](done/2026-10-23_tasks-graph-topic-exploration.md).

## 2026-10-23 — Continuous sidebar list

- Removed sidebar section headings and unified note spacing, keeping pinned notes first; finalized [the sidebar layout task](done/2026-10-23_tasks-sidebar-continuous-list.md).

## 2026-10-23 — v0.3.6 beta release

- Published [v0.3.6](done/releases/v0.3.6.md) with bounded Mac Back navigation, page-reference creation, shared graph search, note attention, and simpler sidebar/update controls.

## 2026-10-22 — Mac Back navigation

- Mac Back inputs reuse guarded navigation with five previous pages and no duplicate history stack; finalized [implementation and verification](done/2026-10-22_tasks-mac-back-navigation.md).

## 2026-10-22 — Task finalization

- Completed task lists are archived and committed automatically under the [task workflow](../docs/task-workflow.md), preserving unrelated work.

## 2026-10-22 — Missing reference pages

- Mac references create missing pages on activation or after confirmed source saves, preserving drafts, title reuse, write permissions and retry recovery; finalized [implementation and verification](done/2026-10-22_tasks-create-missing-reference-pages.md).

## 2026-10-22 — Mac page-reference shortcut

- The Mac editor accepts `@` for inline page search and inserts canonical `[[Page Title]]` links while retaining the bracket shortcut; finalized [implementation and verification](done/2026-10-22_tasks-mac-at-page-reference-search.md).

## 2026-10-22 — Combined master integration

- Merged graph search, note attention and sidebar/updater work with the published 0.3.5 history on master; finalized [integration verification](done/2026-10-22_tasks-combined-master-integration.md).

## 2026-10-22 — v0.3.5 beta release

- Published [v0.3.5](done/releases/v0.3.5.md) with coordinated app/CLI updates, formatted Markdown paste, configurable feedback, and consistent browser controls.

## 2026-10-22 — Shared graph search

- Graph filtering now reuses app search and recent saves, including body and available semantic matches, with cancellation and bounded graph selection.


## 2026-10-22 — Note attention

- Notes can be settled or snoozed in canonical Markdown and return to the sidebar when due, independently of local visit history.

## 2026-10-22 — Shared Mac/CLI updater

- App and CLI updates share release preparation, coordinated installation and verified restart, with inline progress and all-tab save protection.

## 2026-10-22 — Browser design system

- Browser navigation, settings and dialogs share typography, spacing and control tokens, with compact sidebar utility icons.

## 2026-10-22 — Batched releases

- Completed changes accumulate in one pending Markdown note; verified releases archive their notes, with at most one publication per day by default.

## 2026-10-22 — GUI updates

- Mac app updates now prepare published releases in the background and coordinate safe restart, managed CLI replacement, and recovery through the GUI.

## 2026-10-22 — Completed task archive

- Finalized and archived [direct feedback delivery](done/2026-10-22_tasks-direct-feedback.md) and [local companion QA](done/2026-10-22_tasks-local-companion-qa.md); separate manual-device and cross-browser validation remains tracked.

## 2026-10-22 — Markdown paste

- Pasted Markdown now renders supported headings and emphasis immediately, using the same parser as note loading; selection replacement, undo/redo, code literals, and canonical save/reload remain covered by desktop/mobile browser checks.

## 2026-10-22 — Local installation guidance

- Clarified local privacy boundaries, app/CLI use of one brain, existing-install reuse, and agent-assisted setup in the installation guides and new FAQ.

## 2026-10-22 — Direct feedback delivery

- Feedback now sends directly through a VPS relay, with optional diagnostics, private mail credentials, and drafts retained when delivery cannot be confirmed. Relay URLs and deployment hostnames are explicitly configured; private company hostnames are not bundled by default.

## 2026-10-22 — Release request policy

- Release requests default to a complete patch publication with synchronized CLI/runtime and Mac app versions, verified GitHub release notes, tag, and artifact.

## 2026-10-18 — Completed task archive

- Archived ten completed task lists, including the two superseded Electron stages; retained outstanding implementation and manual QA work in `tasks/todo/`.

## 2026-10-17 — Live graph filtering

- Graph title/tag and connection-focus filters refresh after three typed characters with a short debounce; clearing refreshes too, while Enter remains immediate. Build, 37 graph tests, and desktop/narrow graph browser checks passed.

## 2026-10-17 — Recent activity

- Home shows each file's latest metadata-based activity with explicit refresh and date labels; retained history and contributor tracking are deferred.

## 2026-10-17 — Sidebar page rows

- Removed the decorative empty box before pinned and recent page titles; sidebar browser checks passed in both themes and narrow layouts.

## 2026-10-17 — Memory lifecycle controls

- Added local/hosted historical evidence-date capture, preserved dates through edits, and verified guarded deletion, index reconciliation, and private filesystem-error handling.

## 2026-10-16 — One macOS app

- Consolidated Desktop and the menu-bar companion into one app with background window-close behavior, guarded shutdown, an owned bundled runtime, and reversible installation migration; the CLI remains independent.


## 2026-10-16 — Browser and diagnostics cleanup

- Eliminated unchanged sidebar writes/row replacement and consolidated diagnostic normalization and editor baseline assignment; focused tests and desktop/narrow browser checks passed.

## 2026-10-16 — README landing page

- Reframed the README around “Good thoughts deserve a home” and an open-source, agent-first Notion, with editor-led storytelling, personal/shared brains, clear setup paths, and answers to adoption questions.

## 2026-10-16 — Support diagnostics

- Feedback now includes safe, correlated browser and local host failure reports, with bounded retained history, crash evidence, source availability, and inspectable email attachments.

## 2026-10-16 — Desktop welcome and installation

- Added a branded Mac desktop app with local-folder onboarding and a private Git setup command that reuses the shared memory runtime.

## 2026-10-16 — Page-first sidebar

- Added persistent, brain-scoped pinned pages and recently visited pages in compact sidebar rows, with per-page pin controls and Graph moved to the bottom.

## 2026-10-16 — Beta feedback

- Added Feedback in browser and Electron with user-sent email drafts to the support inbox, optional diagnostic attachments included by default, and an inspectable privacy-limited session log.

## 2026-10-16 — Live external note updates

- Open notes now reflect external edits with a brief highlight, preserving active drafts and stale-write protection while terminal agents work alongside the editor. Independent typing and agent edits merge once interaction settles; overlapping changes retain the draft with a clear review action.

## 2026-10-16 — Clearer app navigation

- Replaced the crowded button row with a desktop sidebar grouping note actions, persistent Home/Graph navigation, and Settings/appearance; narrow screens use top navigation. Moved save/recovery feedback into the workspace and preserved guarded, brain-scoped links. A persistent desktop toggle collapses the sidebar without interrupting the open note; narrow top navigation remains available.

## 2026-10-16 — Local Electron window

- Added an optional Mac desktop prototype displaying the installed companion’s existing UI, with native menus and draft-close protection over the same runtime.

## 2026-10-16 — Subtle page-reference brackets

- Made the brackets around underlined page links much fainter in light and dark mode, preserving literal Markdown and native editing/selection.

## 2026-10-16 — Note lifecycle and recovery

- Unified map title references, added guarded note deletion and draft comparison/reload, made confirmed tab saves discoverable immediately, and improved narrow map and expired-session recovery controls.

## 2026-10-16 — Shared lifecycle and browser ownership

- Centralized native lifecycle safety and browser controllers; canonical indexing and multi-ID recall now reuse request-local work while preserving Markdown publication guards.

## 2026-10-14 — Smaller Mac menu

- Moved brain switching and search-index refresh into browser Settings; grouped native login/update and troubleshooting actions into compact submenus.

## 2026-10-14 — Ember light and dark themes

- Applied Ember's parchment light and graphite dark palettes across notes, editor, map, dialogs, autocomplete, and companion settings. Added a persistent System / Light / Dark selector, live OS/cross-tab updates, pre-paint appearance, and contrast/browser regressions without changing drafts or credentials.

## 2026-10-14 — Ambient memory map

- Added subtle blue/lavender/sage light, shaded category nodes, and rounded connecting strands with highlights and shadows; refreshed the README graph capture and verified navigation, filtering, zoom, and panning in Chrome.

## 2026-10-14 — Quieter companion updates

- Moved menu updates to an independent background job without Terminal and reused verified unchanged native builds; failures retain logs and offer a recovery alert.

## 2026-10-14 — Companion brain connections

- Added companion `/settings`, named local/remote profiles, Keychain credentials, and draft-safe all-tab/menu switching without changing CLI targets; [verification and beta limits](done/2026-10-14_tasks-macos-brain-connections-settings.md).

## 2026-10-14 — Calmer daily writing

- Made daily writing calmer with literary typography, friendlier date titles and prompts, comfortable spacing, wrapping titles, and page-reference suggestions that stay visible while typing.

## 2026-10-12 — Recall format guidance

- Clarified compact/text trade-offs, guarded expansion prerequisites, and selective-read source structure; [completed guidance task](done/2026-10-12_tasks-recall-format-guidance.md).

## 2026-10-11 — Self-maintaining recall completed

- Creation retains saved identity through index/replay failures; empty keyword fallback stays within existing budgets; strict read-only lexical retrieval performs no derived-state writes. Completed/archive: [self-maintaining recall](done/2026-10-11_tasks-self-maintaining-recall.md), with 812 passing tests, provisioned QMD validation and explicit evaluation/platform limits.

## 2026-10-11 — Automatic index freshness

- Local recall/search now repairs derived indexes without rewriting root policy; hosted maintenance checks canonical changes through the shared bounded runner. [Verification and limits](done/2026-10-11_tasks-self-maintaining-recall.md#automatic-index-increment--2026-10-11).

## 2026-10-11 — Responsive bounded retrieval

- Replaced blocking QMD execution with bounded asynchronous admission, cancellation-safe indexing and request-local source reuse; [limits and verification](done/2026-10-11_tasks-bounded-retrieval-execution.md).

## 2026-10-11 — Explicit temporal retrieval

- Added bounded evidence-date filtering and chronological recall across local/hosted CLI, with date provenance, stale-source checks and scope-safe processing; [verification and limits](done/2026-10-11_tasks-temporal-retrieval-correctness.md).

## 2026-10-10 — Budgeted recall and evidence expansion

- Added opt-in byte-bounded recall and hash-guarded line/section expansion across local and hosted CLI workflows, preserving full-document editing; [contracts and verification](done/2026-10-11_tasks-budgeted-recall-and-expansion.md).

## 2026-10-10 — Evidence-safe memory maintenance

- Added source-backed lint candidates, protected extractive-map writes, and bounded dream date diagnostics; [verification and evaluation limits](done/2026-10-10_tasks-consolidation-maintenance-reliability.md).

## 2026-10-10 — Reliable semantic indexing

- Added [incremental transactional indexing](done/2026-10-10_tasks-semantic-index-reliability.md), persistent semantic policy, explicit rebuild/recovery, and honest local/hosted retrieval readiness on pinned QMD 2.8.3.

## 2026-10-10 — Product mission

- Recorded the [product vision](../docs/product-vision.md): lean, semantic, temporally aware agent memory with token-efficient retrieval and first-class local/shared-VPS use.

## 2026-10-08 — Source-backed recall defaults

- Recall now returns distinct-file evidence with bounded, match-centered passages, independent citations, and labeled metadata across local and hosted CLI workflows.

## 2026-10-08 — Page-reference navigation and inline suggestions

- Added draft-safe title-reference navigation and undoable inline suggestions, reusing canonical lookup and indexed search; [manual device/browser validation remains tracked](todo/tasks-page-reference-manual-qa.md).

## 2026-10-07 — Page-reference feasibility finalized

- Finalized [clickable-reference and caret-autocomplete feasibility](done/2026-10-07_tasks-clickable-page-references.md); prototypes remain isolated, with production integration and accessibility validation tracked separately.

## 2026-10-06 — [v0.2.0](../docs/releases/v0.2.0.md): [dreaming from the memory map](done/2026-10-07_tasks-web-dream-handoff.md)

- Added a copyable agent prompt for immediate, bounded dream-page consolidation from the map, keeping credentials and model execution outside the browser.

## 2026-09-30 — Quieter memory map

- Matched the memory map to the home screen, removed depth controls and visual clutter, and anchored zoom while preserving shared note navigation and browser Back.

## 2026-09-27 — Menu-bar application updates

- Added macOS menu-bar updates with visible Terminal progress, automatic successful relaunch, and revision-based update availability checks, while leaving browser tabs open.

## 2026-09-27 — Title-first shared search

- Prioritized exact titles across CLI and Cmd+K search, recovered omitted title matches, and favored newer relevant evidence without treating metadata edits as freshness.

## 2026-09-27 — Clearer quick capture

- Made New note the primary home action, added Cmd/Ctrl+Enter capture, and replaced timestamp titles with readable, server-numbered daily names.

## 2026-09-27 — WYSIWYG Markdown editing

- Added locally bundled Lexical editing for headings, bold, italic, and page references, preserving autosave and unsupported Markdown as visible literal text.

## 2026-09-20 — Recent notes on web home

- Added a compact eight-note home list ordered by last edit with creation-date fallback, opening directly in the editor and reflecting saves without search indexing.

## 2026-09-20 — Stateless dreaming and maps-first retrieval

- Added stateless historical dream windows, a reusable how-to-dream skill, editable dream-marked pages, and relevance-aware retrieval preference while retaining source evidence and legacy APIs.

## 2026-09-19 — Unified installed updates

- Unified the CLI and optional macOS companion on one managed runtime, with quit-before-update migration, paired rollback, serialized installation, and preserved memory/settings; development checkouts remain separate.

## 2026-09-19 — Rerunnable Logseq migration

- Added packaged local `migrate logseq` with dry-run default, lossless Markdown bodies, pages-to-notes/journals-to-sessions mapping, stable identities, source-wins updates, optional conflict rejection, and identity-checked removal reconciliation. Assets/config/backups remain untouched and omitted.
- Added strict path/root/manifest validation, atomic replacement, transactional failure rollback, and private fail-closed recovery receipts. Durable ownership manifests stay outside rebuildable derived state; crash recovery is manual and indexing is explicit.
- Fixed quoted metadata round-tripping and narrowly admitted validated imports through legacy canonical-discovery exclusions without admitting ordinary excluded files.
- Validated 275 tests, package contents, offline-installed CLI reruns, disposable-vault checksum/identity/reconciliation tests, and real-QMD tree/search/recall. Authorized local import created 1,476 documents, preserved five existing memories and the source tree, indexed 1,481 documents, and reran with zero mutations. No private note content retained in repository fixtures or reports.
- Completed task: `tasks/done/2026-09-19_tasks-logseq-to-jumpybrain-migration.md`. Existing frozen companion/global CLI installations were not replaced; they need a runtime refresh for the new command and discovery fix.

## 2026-09-19 — Daily Markdown capture and page references

- Added dated New note creation from home/editor, Cmd/Ctrl+N with Cmd/Ctrl+Shift+Enter fallback, authenticated idempotent retry, duplicate-input suppression, and guarded navigation. Blank remote `note` bodies are supported; other content validation remains unchanged.
- Reused search for literal `[[Exact Page Title]]` insertion with caret preservation, native undo, cancellation, title safety/visible-ambiguity checks, and autosave. Global unique titles, title editing, clickable references, and title-based graph resolution remain deferred.
- Refreshed ordinary UI chrome to neutral cream/charcoal. Fixed failed-creation history restoration and no-op edit save feedback while preserving existing search-click/autosave safeguards.
- Validated 235 passing tests in the isolated commit snapshot (236 with the pre-existing search-click regression), 15 disposable desktop/mobile daily-capture scenarios, existing editor/graph browser regressions, screenshot review, packaging, extracted-package creation/readback, and diff checks. Browser-reserved shortcuts, physical-device/Safari/Firefox QA, offline drafts, and crash-atomic creation receipts remain explicit limitations.
- Completed task: `tasks/done/2026-09-19_tasks-daily-markdown-capture-and-page-references.md`.

## 2026-09-19 — Experimental macOS menu-bar companion

- Added an optional, self-contained `integrations/macos-companion/` prototype: native status/menu controls, Chrome editor launch, user-login startup, owned server lifecycle, and CLI-driven search indexing. No core memory APIs or public installer behavior changed.
- Included local build/install/uninstall scripts, disposable native lifecycle tests, and documentation separating publishable source from machine-specific app bundles and private runtime state.
- Validated native startup/auth/search, duplicate-instance and busy-port refusal, graceful shutdown, orphan cleanup, and unchanged canonical Markdown; existing disposable editor/autosave browser smokes pass. Actual logout/login and broader macOS distribution remain unverified.

## 2026-09-19 — Reliable search-result navigation

- Fixed lost search-result clicks during autosave and kept search visible with feedback when failed saves block navigation.

## 2026-09-12 — Minimal notes web editor task archived

- Archived the completed, validated editor task with user approval as `tasks/done/2026-09-12_tasks-minimal-notes-web-editor.md`.

## 2026-09-10 — Minimal notes web editor implemented and validated

- Added the almost-empty `/` entrance, accessible Cmd/Ctrl+K title/body search, and reloadable full-page raw Markdown note editing at `/?note=<canonical-id>`. `/graph` stays secondary; graph nodes open the same editor. No new runtime dependencies, frontend service, canonical storage model, or search/write APIs.
- Reused authenticated GET/PUT, If-Match, 750 ms/blur autosave, sequential saves, and bounded temporary last-write-wins behavior. Added persistent caret/scroll-safe editing, guarded Back/Forward restoration/replay, modal focus handling, mobile credential/retry flows, and honest search freshness across local writes.
- Independent review and regression checks fixed unconfirmed-save/undo retry deadlock, stale-search response races, connection-dialog/history behavior, unavailable-hit crowding, and modal Tab wrapping. Updated architecture, protocol, and shared-server usage docs.
- Validated with `npm test` (217 pass), real-QMD disposable desktop/mobile Chromium browser smokes plus the graph regression smoke, `npm run cli:pack`, an extracted-package server shell smoke, and `git diff --check`. Browser screenshots reviewed; no live memory was edited. Safari/Firefox and physical-device QA remain unverified.
- Completed task: `tasks/done/2026-09-12_tasks-minimal-notes-web-editor.md` (archived on 2026-09-12).

## 2026-07-22 — Docker build source boundary restored

- Removed the CLI runtime's import of `scripts/remote-target-origin.mjs`, which was available in a full local checkout but absent from the Docker build stage that intentionally copies only `src/`.
- Kept HTTP(S) origin normalization inside `src/cli/remote-access-policy.ts`, documented the boundary, and added parity coverage against the standalone installer helper so the Docker/runtime source graph remains self-contained without behavior drift.
- Reproduced the Docker build context in an isolated directory containing only `package*.json`, `tsconfig.json`, and `src/`; `npm ci` and `npm run build` pass. A direct Docker build was unavailable because the local Docker daemon was not running.

## 2026-07-22 — Graph inline Markdown editing completed

- Added dependency-free, document-level Markdown body editing to the `/graph` slide-in panel with accessible pointer/keyboard activation, read-only collapsed frontmatter, auto-sizing textarea styling, 750 ms and blur autosave, mobile credential access, and explicit `Editing`, `Saving…`, `Saved`, and retryable `Save failed` feedback.
- Reused the existing authenticated whole-document GET/PUT contract with `If-Match`; serialized in-flight/queued saves, guarded selection and reconciliation races, retained failed drafts across blocked navigation, warned on unload, and added one bounded, clearly marked temporary last-write-wins retry for `412` conflicts.
- Kept browser behavior in the HTTP adapter and canonical Markdown/protected-frontmatter policy in existing core/app seams; updated source architecture, co-located HTTP-server docs, protocol/help text, and public-sandbox expectations without adding PATCH, block storage, a frontend framework, or editor dependencies.
- Added deterministic codec/state/transport/error/navigation coverage plus a disposable-root Playwright smoke that persisted edits at desktop and mobile viewports with no console errors; `npm test`, `npm run smoke:graph-editor`, `npm run cli:pack`, and `git diff --check` pass.
- Archived the completed task as `tasks/done/2026-07-22_tasks-graph-inline-markdown-editing.md`.

## 2026-07-11 — Open-source security/docs audit and `0.1.0` release completed

- Revoked the historically published demo credential, verified it returns `401`, and validated authenticated status/tree/recall against the configured production global memory.
- Made public uninstall ownership fail closed, added manifest/path/memory-deletion regressions, and smoke-tested clean install/update/uninstall plus authenticated server recall.
- Split shared-memory onboarding from the protocol/API reference, corrected idempotency and source-boundary docs, and added a runtime `graphMemory` export guard.
- Replaced the public remote with one reviewed clean snapshot, deleted obsolete remote refs, and verified a fresh clone with zero Gitleaks findings, 195 tests, zero npm audit vulnerabilities, a clean `0.1.0` package, resolved documentation links, and the historical credential still invalid.
- Archived the completed audit as `tasks/done/2026-07-11_tasks-open-source-security-docs-audit.md`; retained a permission-restricted offline pre-rewrite bundle because external clones, forks, caches, and archives cannot be recalled.

## 2026-07-11 — Per-target CLI read-only policy completed

- Added strict schema-v1 device-local CLI policy keyed by normalized remote HTTP(S) origin, with an explicit retrieval allowlist and early rejection of canonical, derived-index, and dream-state mutations before credentials, inputs, preflight work, idempotency, or network transport.
- Added reversible installer flags (`--read-only-target` / `--allow-write-target`), managed-rerun and `jumpybrain update` preservation, custom-install shim config selection, fail-safe config updates, manifest ownership metadata, uninstall cleanup, and packed-CLI coverage.
- Added deterministic config, command-matrix, property, installer, architecture, and real loopback integration tests; documented the policy as advisory client safety rather than server authorization.
- Validated a fresh installed shim against two loopback servers: seven protected retrieval flows passed, eight mutation classes were blocked with no request/state changes, the unlisted target remained writable/editable/indexable, update preserved policy, and explicit reversal restored writes. `npm test` (184 tests), `npm run cli:pack`, and `git diff --check` pass.

## 2026-07-11 — Installer rerun ownership hardened

- Preserved recorded refs on managed reruns, made installer manifests fail closed, narrowed the README demo-host guard, and consolidated live credential rotation into the public-sandbox task; `npm test` passes (175 tests).

## 2026-07-10 — Existing installer reruns made app/CLI-only and fail-safe

- Made managed `install.sh` reruns app/CLI-only and fail-safe, preserving memory, configuration, indexes, and integrations while refusing unsafe layouts or setting changes and retaining the working CLI after failed updates.

## 2026-07-10 — Graph visual system overhaul

- Rebuilt `/graph` around a light, professional forest-green and cream visual system with reusable color, typography, spacing, radius, elevation, motion, control, and application-shell primitives.
- Reorganized the page into a product/context top bar, labeled exploration toolbar, calm knowledge canvas, compact legend and metrics, and a responsive reading panel with improved Markdown typography and metadata hierarchy.
- Improved dense-graph readability with a degree-aware elliptical spiral layout, persistent labels for the most connected memories, hover/focus labels for the rest, type-aware node colors, and clearer selected/unresolved states.
- Added explicit zoom/reset controls, Enter-to-search, keyboard-activatable graph nodes, reduced-motion support, responsive panel behavior, accessible status treatment, and cleaner loading/error feedback without adding dependencies.
- Added regression coverage for the design tokens, application hierarchy, graph control surface, and motion preference support; existing graph and Markdown renderer behavior remains covered.
- Validated with `npm test` (164 pass) plus browser QA at desktop and 390px mobile widths, including node selection, the reading panel, resize recentering, and zero browser console errors.

## 2026-07-09 — Graph note slide-in panel implemented

- Added a slide-in note reader to the `/graph` page: clicking a document node opens a 33vw panel (graph flexes to 67vw) and renders the node's `.md` note via an inline, dependency-free Markdown renderer; no new npm dependencies.
- Removed the fixed 20rem `<aside>` Details block entirely; the slide-in is now the only details surface. `#ready`/`#error`/`#status`/stats indicators moved into the header with `data-testid` attributes preserved, and `main` switched from a two-column grid to a flex layout where the graph section takes full width by default.
- Added `<aside id="note-panel">` markup starting closed (`data-closed`), with `data-testid` hooks `graph-note-panel`/`graph-note-close`/`graph-note-title`/`graph-note-content`. CSS uses a `body.panel-open` class to toggle the 33vw slide-in with a smooth transition and dark-theme tokens.
- Implemented `renderMarkdown(md)` in the page script (headings, ordered/unordered lists, fenced/inline code, bold/italic, links, blockquotes, horizontal rules, paragraphs). HTML is escaped before interpretation to prevent injection; fenced/inline code content stays uninterpreted. Frontmatter is rendered as a muted `<details>` metadata block above the body.
- Wired `selectNode` to the slide-in: unresolved nodes do not open the panel and set `#status` to "unresolved link: <title>"; document nodes fetch `GET /memories/all/documents/:id` (reusing the existing Bearer API key), show "loading…", then render `payload.content`. The panel persists across clicks and swaps content without close/reopen animation; a stale-fetch guard (`state.noteToken`) discards out-of-order responses. On non-2xx/fetch failure the panel closes and the error surfaces in `#status`/`#error`.
- Close via close button, Escape key (which also clears the active node selection), or re-clicking the active node. Opening the panel focuses the close button; the note content scrolls independently of the graph.
- Added unit tests in `test/graph.test.js` for the panel markup (fixed aside removed, panel scaffolded and closed by default), the click wiring (unresolved guard, re-click close, document fetch URL, Escape), and the inline renderer (escaping, headings, bold/italic/code, links, lists, fenced blocks, blockquote, hr, frontmatter). Added Playwright smoke coverage in `scripts/graph-ui-smoke.mjs` for open/close, Escape, re-click toggle, content swap while open, and the unresolved guard.
- Validated with `npm test` (163 pass). Frontend-only change; no `src/core`, `src/app`, or HTTP route/protocol changes.
- Archived the completed task list as `tasks/done/2026-07-09_tasks-graph-note-slidein.md`.

## 2026-07-09 — Core graph visualization implemented

- Added an Obsidian/Logseq-style networked-notes graph based on explicit Markdown wiki-links and Markdown links, not embeddings.
- Introduced graph data model in `src/types.ts`: `MemoryGraphNode` (document/unresolved/tag), `MemoryGraphEdge` (directed, resolved flag), `MemoryGraphResult`, and `MemoryGraphOptions` (focus, depth, edgeTypes, tags, type, path, query, includeUnresolved, includeOrphans, limit).
- Moved pure canonical link-target resolution from `src/app/local-memory/overview.ts` into reusable core helpers in `src/core/canonical/links.ts` (`buildCanonicalLinkTargetLookup`, `resolveCanonicalLinkTarget`, `normalizeCanonicalLinkLookupKey`, `canonicalDocumentLinkKeys`); overview now delegates to these.
- Added app-level graph assembly in `src/app/local-memory/graph.ts` (`graphMemory`) with deterministic derived nodes/edges, backlinks via reversed directed edges, unresolved virtual targets, local-graph focus/depth, and filters.
- Added server-memory remote-safe graph packet `graphServerMemory` / `RemoteMemoryGraphPacket` in `src/app/server-memory/index.ts`.
- Added HTTP routes: `GET /graph` (unauthenticated static HTML/JS page with pan/zoom, filters, click details, stable test IDs) and `GET /memories/all/graph.json` (authenticated JSON with query params).
- Added Playwright smoke script `scripts/graph-ui-smoke.mjs` and `npm run smoke:graph` for browser validation against a live server.
- Added unit tests for local graph extraction (aliases/anchors, duplicate basenames, sessions, orphans, backlinks) and HTTP graph JSON (auth, shape, unresolved, remote-safe, empty roots, limit truncation).
- Updated module and cloud-shared-memory docs for graph boundaries and routes.
- Validated against `/Users/monkey/.jumpybrain/memory` with Playwright; `npm test` (159 pass) and `npm run cli:pack` pass.
- Archived the completed task list as `tasks/done/2026-07-09_tasks-core-graph-visualization.md`.

## 2026-07-05 — Local/shared dreaming engine implemented

- Refactored dream internals into shared core/app seams: pure dream cursor/limit/path/truncation policy in `src/core/dream/` and local/remote state workflow in `src/app/dream/`.
- Added local `jumpybrain dream --root <memory-root>` support with status/create/resume/complete/abandon, `--json`, `--out`, force/cap flags, and target-independent `--apply-manifest`.
- Preserved remote dream HTTP/client behavior through a thin server-memory facade while keeping remote responses at `target: "remote"`, `memory: "all"`, and `root: "remote:all"`.
- Added local dream derived state under `.jumpybrain/dream/state.json` and `.jumpybrain/dream/batches/` with metadata-only storage and no AI/model/provider/scheduler behavior.
- Added local app, pure policy, CLI, packaging, and remote regression coverage for shared dreaming, local apply success/failure, unsafe manifest paths, cursor exclusion after completion, and boundary guardrails.
- Updated technical, memory-format, agent-workflow, cloud/shared-memory, and source module docs for the shared local/remote dream architecture.
- Validation passed with `npm run validate`, `npm run cli:pack`, a packed-tarball local dream end-to-end smoke, and a VPS remote dreaming smoke.
- Archived the completed task list as `tasks/done/2026-07-05_tasks-local-dreaming-shared-engine.md`.

## 2026-07-05 — Remote dreaming memory consolidation implemented

- Added remote-only `jumpybrain dream` CLI workflow for hosted/shared memory batch status, creation/resume, JSON/`--out` context export, completion, abandonment, and client-side apply-manifest orchestration.
- Added derived remote dream state under `.jumpybrain/remote/dream-state.json` and `.jumpybrain/remote/dream-batches/` with metadata-only storage, one-open-batch semantics, empty-batch no-op completion, and completion-only cursor advancement.
- Added authenticated dream HTTP routes and client methods for status/create/get/complete/abandon while keeping route logs and status responses free of memory bodies and server absolute paths.
- Added overflow-safe canonical Markdown selection from standard memory buckets with bounded content bytes, content hashes, remote-safe relative paths, and untrusted-context warnings.
- Updated technical, cloud/shared-memory, memory-format, agent-workflow, and module-boundary docs to state that remote dreaming has no server AI/model/provider/scheduler behavior.
- Added server-memory, HTTP, HTTP-client, and CLI coverage for dream batches, cursor behavior, redaction, stale-hash apply failure, and usage contract drift.
- Validation passed with `npm test -- --test-reporter=spec` and `npm run cli:pack`.
- Archived the completed task list as `tasks/done/2026-07-06_tasks-remote-dreaming-memory-consolidation.md`.

## 2026-07-04 — Subagent architecture hardening completed

- Ran isolated subagent reviews across core, app, adapters/server, CLI/runtime, and cross-cutting architecture.
- Tightened core/runtime/app adapter export surfaces and added explicit package entrypoints with package-resolution tests.
- Extracted shared frontmatter parsing, canonical Markdown walking, HTTP protocol route helpers, CLI memory command handlers, and core document ID-stamping policy.
- Split HTTP server routing from the server adapter surface and split processing `ensure-ids` behavior into a focused module.
- Moved remote API-key ownership to the CLI boundary, removed app-layer console logging side effects, and folded orphan target docs into CLI docs.
- Added recursive co-located docs enforcement and updated compact module docs for writing, local-memory overview, QMD, HTTP server, runtime, processing, and CLI seams.
- Validation passed with `npm run validate`, `npm run cli:pack`, local installed-CLI smoke, remote/production smoke, `git diff --check`, and independent subagent review feedback addressed.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-subagent-architecture-hardening-findings.md`.

## 2026-07-04 — Memory document editing completed

- Implemented canonical file-level `mem_<uuid>` IDs for newly written notes, findings, decisions, preferences, sessions, and synthesized pages.
- Added explicit ID-stamping maintenance via `jumpybrain process --mode ensure-ids --apply` for canonical buckets.
- Added exact document read/update contracts, stable `sha256:<hex>` content hashes, protected frontmatter semantics, and optimistic concurrency errors.
- Added local runtime and CLI document editing with `jumpybrain show` and stdin-driven `jumpybrain update --if-match`.
- Added authenticated hosted/global document GET/PUT endpoints and remote CLI/client transports with safe metadata and stale-index behavior.
- Added deterministic unit/integration/smoke coverage for local and in-process remote edit loops plus command-help drift checks.
- Updated public architecture, memory-format, cloud/shared-memory, agent workflow, local build, and CLI usage documentation.
- Validation completed with `npm run validate`, `npm run cli:pack`, real local-memory editing, and deployed/global memory editing through the supported CLI workflow.
- Archived the completed task list as `tasks/done/2026-07-04-tasks-memory-document-editing.md`.

## 2026-07-04 — Memory overview tree completed

- Added local and remote `tree`/`overview` memory summaries for counts, buckets, recent files, tags/types, index freshness, and optional connection stats.
- Added remote overview/tree endpoint with safe metadata and no server absolute path leakage.
- Added CLI rendering and JSON support for overview/tree output.
- Added deterministic tests for overview behavior and remote HTTP coverage.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-memory-overview-tree.md`.

## 2026-07-04 — CLI installer update command completed

- Added installer-backed `jumpybrain update` for public-installer installs.
- Preserved memory root, install root, scope, source/ref, and integration choices from the installer manifest.
- Added safe failure behavior for source/dev installs without an installer manifest.
- Updated install/local-build docs and installer tests.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-cli-installer-update-command.md`.

## 2026-07-04 — Architecture pragmatic self-hosting decisions completed

- Closed remaining post-architecture-hardening follow-ups with pragmatic source/installer-first decisions.
- Kept the layered `cli`/`app`/`core`/`adapters`/`runtime`/`server` layout without adding premature npm/package complexity.
- Decided not to add a restrictive `package.json` exports map yet.
- Documented and preserved current CLI/runtime/server behavior and package validation expectations.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-architecture-pragmatic-self-hosting-decisions.md`.

## 2026-07-04 — General file logging and checklogs completed

- Added compact file-backed server logging under `.jumpybrain/logs/` with secret/body redaction.
- Wired HTTP/server endpoints and auto-index events into reusable logging.
- Added deterministic logger/server tests and deployment docs.
- Added a local ignored checklogs helper for SSH/file inspection.
- Validation passed with `npm test`, `npm run cli:pack`, and a local server smoke test.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-general-file-logging-and-checklogs.md`.

## 2026-07-04 — Repository architecture cleanup completed

- Removed benchmark ownership from the repository.
- Introduced layered architecture documentation and guardrails.
- Moved QMD, HTTP client/server, logging, and package metadata under `src/adapters/`.
- Moved local/server use cases under `src/app/`; kept canonical Markdown and writing policy under `src/core/`.
- Kept `src/cli.ts` as a shim with command behavior in focused `src/cli/` modules.
- Added architecture-boundary tests and package-shape checks.
- Validation passed with `npm test` and `npm run cli:pack`.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-repository-architecture-cleanup.md`.

## 2026-07-04 — Server auto-index scheduler completed

- Added server-local auto-index scheduler enabled by default for `jumpybrain serve`.
- Added stale-only fixed 5-minute ticks, shared manual/scheduled index runner, overlap guards, and write/index race handling.
- Added deterministic tests and updated remote deployment docs.
- Validation passed with `npm test` and `npm run cli:pack`.
- Archived the completed task list as `tasks/done/2026-07-04_tasks-server-auto-index-scheduler.md`.

## 2026-07-03 — Cloud shared memory V1 completed

- Implemented lean self-hostable HTTP server for one shared remote memory namespace.
- Kept remote canonical state as Markdown files on server disk with derived/rebuildable indexing and support state.
- Added API-key authentication, remote status/index/search/recall/write/wrapup flows, idempotent create handling, and CLI remote target support.
- Documented deployment and remote workflow behavior.
- Archived the completed task list as `tasks/done/2026-07-03_tasks-10-cloud-shared-memory-v1.md`.

## 2026-07-03 — CLI/runtime modular refactor completed

- Refactored jumpyBrain toward internal runtime/app/server/CLI boundaries while keeping one source/installer-first package.
- Preserved CLI behavior as the compatibility surface.
- Encapsulated QMD behind adapter/runtime boundaries.
- Completed by Ralph loop and merged after validation.
- Archived the completed task list as `tasks/done/2026-07-03_tasks-monorepo-cli-runtime-split.md`.

## 2026-06-26 — Code quality tightening sprint completed

- Added stronger architecture drift tests, pure CLI arg parsing refactor, deterministic property/error/compatibility/processing tests, canonical Markdown fixtures, local pack manifest tightening, and an advisory quality report.
- Dogfooded manual CLI paths and ran final validation with `npm run validate` and `npm run cli:pack`.
- Archived the completed task list as `tasks/done/2026-06-26_tasks-code-quality-tightening-sprint.md`.

## 2026-06-26 — Architecture edge scan and property testing completed

- Added deterministic `fast-check` setup and bounded property tests for high-value architecture edges.
- Extracted shared source import-graph helpers.
- Documented property-test rules in `test/PROPERTY_TESTING.md`, `docs/technical.md`, and `AGENTS.md`.
- Validation passed with `npm run validate` and `npm run cli:pack`.
- Archived the completed task list as `tasks/done/2026-06-26_tasks-architecture-edges-property-testing.md`.

## 2026-06-26 — Easy installation and agent onboarding completed

- Added installer/uninstaller scripts, portable Codex/Claude skill, Pi extension, QMD binary resolution hardening, `jumpybrain doctor`, installer docs, README install prompt, and deterministic installer tests.
- Validation passed with `npm run validate`.
- Archived the completed task list as `tasks/done/2026-06-26_tasks-easy-installation.md`.

## 2026-06-24 — CLI remember/recall simplification completed

- Renamed write command from `note` to `remember` and centered retrieval docs on `recall`.
- Kept old note commands as migration errors.
- Made `remember` rebuild the derived index after writing.
- Updated docs/tests and validated with `npm test`.
- Archived the completed task list as `tasks/done/2026-06-24_tasks-cli-remember-recall.md`.

## 2026-06-23 — Open source readiness completed

- Prepared jumpyBrain for a public GitHub repository while keeping npm publication as a later follow-up.
- Added public repo hygiene, MIT license, public docs wording, safety scans, and task-history exclusion from public git history.
- Archived the completed task list as `tasks/done/2026-06-23_tasks-open-source-readiness.md`.
