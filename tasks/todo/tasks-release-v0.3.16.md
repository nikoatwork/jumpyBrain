# Release v0.3.16

Requested 2026-11-01: deploy latest / cut a release. Default patch beta publication from clean master, implementation snapshot `fdfffd9`. Latest published numeric release is v0.3.15 (2026-10-31T20:25:44Z); no November 1 Europe/Berlin publication. Fetched origin/master and tags; remote is an ancestor, five commits behind. No unrelated working changes.

- [x] Check live feedback, release history, clean snapshot and pending scope.
- [x] Prepare fresh desktop package and core note-lifecycle smoke; reuse unchanged feature evidence.
- [ ] Run release dry run and full aligned-version release workflow.
- [ ] Verify public tag, versions, exact notes and downloaded artifact digest; archive notes/QA and commit/push bookkeeping.

## Scope and evidence

Ship all four queued changes: default-off board sidebar pages with saved choices preserved; canonical folder explorer; Obsidian nested-folder guidance; verified/recoverable CLI + Mac + agent installation. No additional implementation is planned.

Environment: macOS 15.7.7 (24G720), arm64, Node 26.7.0, QMD 2.8.3. Build and browser board-sidebar smoke plus 28 focused tests passed for `fdfffd9`; reuse them. Folder explorer and agent-installation task records retain passing feature, packaged private-engine/Mac and personal-install evidence with unchanged implementation inputs. Native board smoke local/read-only remote behavior passed, but supplementary capture/relaunch coverage hit Electron UnknownVizError; no complete new native-board pass is claimed.

Earlier this conversation, `553d75e` was installed through the documented source workflow with doctor, read-only recall, aligned components and authenticated shared-root launch verified. The dogfood receipt references an older superseded candidate and reports current=false. No duration/normal-use claim is inferred. The owner requested publication immediately after the later default-only change; this is a shortened testing window, not a day-long real-use claim. Publishing is separate from local or VPS installation.

## Live feedback review

Checked 2026-11-01T08:16:33.587Z: full available received/non-spam inbox, no date restriction, complete one page, 21 scanned, two explicitly labeled delivery tests excluded, 19 genuine reports spanning October 20–31. No new messages since the previous release review. Read full installation-report and original installation-feedback bodies again; no attachments downloaded, replies or synthetic submissions.

Sanitized triage: folder browsing is addressed by this release; private writable search dependencies, early preflight, explicit source trust, one-step app + agents and verified release inputs address the installer report. The public artifact supplies the newly required runtime dependency lock. Public signing/notarization/compiler-free app distribution and clean-OS/Intel/Linux hardware coverage remain deferred. Existing Docker build-context, scoped remote credentials/deployment guidance and small editor requests remain in their existing tasks; they are not claimed fixed here. No private message bodies or operator credentials enter Git.

## Verification and outcome

- Fresh `npm run desktop:pack` passed, including signature verification; verified unchanged native helper reused. Preparation uses the existing passing build with unchanged `fdfffd9` implementation inputs.
- `npx --package=playwright node scripts/note-lifecycle-smoke.mjs` passed: capture, immediate search, canonical graph/title navigation, two-tab conflict recovery, narrow layouts, deletion and index refresh.
- Inspected the board Settings screenshot: fresh checkboxes are off, with labels and layout intact.
- `git diff --check` passed. Logs: `/tmp/jumpybrain-v0.3.16-{desktop,core}.log`.

Pending versioned full suite and publication. Detailed final QA will be archived alongside exact published notes.
