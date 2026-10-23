# Feedback release configuration

Status: completed and archived on 2026-10-23. The repaired Mac app is installed locally and a synthetic UI submission was verified in AgentMail through its API. Public release publication remains a separate workflow.

## Goal

Restore direct Feedback sending in distributed Mac apps, simplify the dialog, and query AgentMail through its API instead of browser automation.

## Evidence

The [2026-10-23 installed-app check](2026-10-23_tasks-installed-feedback-e2e.md) reproduced failure in the actual 0.3.6 UI. Installed and retained downloaded 0.3.6/0.3.7 runtime configs had an empty feedback URL. The build previously defaulted to empty when its environment variable was missing. Historical configured-build delivery was not a release gate.

## Tasks

- [x] Reduce the dialog to a message field, optional logs checkbox with an information tooltip, Send, and a top-right close icon; remove preview/email alternatives.
- [x] Add a read-only API inbox command and replace browser-first agent instructions; verify real API access with an existing credential.
- [x] Establish the intended publicly distributable feedback hostname; keep private company hostnames out of default packages and tracked docs.
- [x] Configure the supported distribution path so packaging and subsequent GUI updates retain the intended endpoint, while preserving explicit disable/custom-host behavior.
- [x] Add a meaningful packaging/release check for the intended delivery configuration and test missing configuration without live mail.
- [x] Rebuild and repair the installed app, preserving notes/settings; verify an explicitly authorized synthetic submission through its real Feedback UI and confirm it in AgentMail.
- [x] Update owning docs and pending release notes; archive for the scoped implementation commit. Publication requires a separate release request.

## Outcome

- The user supplied an operator key in the ignored root `.env` under `AGENTMAIL`. It was used without echoing it; the file is mode 0600 and remains ignored/untracked. The app build does not load it. The deployed sending-only key was unchanged.
- [API inbox instructions](../../docs/check-feedback.md) now use `npm run --silent feedback:inbox`, not browser automation. The command supports timezone-qualified dates, bounded pagination with continuation/coverage, explicit test inclusion, full-message reads and key files. It performs GET requests only.
- Reused the already-public demo hostname for the support paths; extended the existing relay's proxy rule while retaining its prior hostname. No DNS change or memory-service replacement. Public `/support/health` returned 200 with `deliveryConfigured:true`.
- Build configuration now defaults to public package metadata, supports custom/explicit-empty overrides, and rejects absent defaults. Packing checks the actual tarball configuration and indispensable forwarder files. Official releases reject explicit disablement. The public-URL guard allowance is limited to the support URL in package metadata.
- The compact dialog has no preview or email alternatives. Logs remain bounded/sanitized and are frozen for retry. The information tooltip works by hover/focus, and the close icon is accessible and in the top-right corner.

## Verification

- Isolated tested source: `adcbd33` plus this task's scoped feedback/API/configuration changes; unrelated live note-detail edits were excluded. Node v26.7.0; Electron 44.8.0; macOS 15.7.7 arm64. Root/Electron manifests remain aligned at 0.3.7; no version bump or release publication.
- Full `node --test --test-reporter=dot` passed after a clean isolated `npm ci`. The initial suite's license-notice failure came from symlinked node_modules producing nonlocal esbuild paths; replacing that symlink with real locked dependencies restored the 15-package license file and its test. The initial transient shared-checkout compile failure occurred while unrelated note-attention edits were in progress; no edits to that work were made.
- Browser feedback smoke passed at 1280, 390 and 320px in light/dark layouts: close/focus/shortcuts, hover/focus tooltip bounds, actual payload privacy, failed-send draft retention, immutable retries, logs opt-out, and unconfirmed-save/conflict diagnostics. Reviewed screenshots and the full-suite log are retained in `.local-pack/feedback-verification-20261023/`; the temporary checkout was removed after verification.
- Production Electron/gateway smoke passed, including sandboxing, direct feedback submission, actual logs, editing/autosave and guarded close. Diagnostic Electron smoke passed with renderer crash/reload, prior-session events, frozen actual attachments, opt-out and cancelled collection.
- `npm run cli:pack` passed with 185 required files and configured feedback in its tarball; focused config, package, release-policy, API and guard tests passed. The locally packed tarball was not published.
- Integration against the shared checkout after the unrelated note-detail commit `38a8434`: build, 25 focused feedback/API/config/guard tests, and the desktop/390/320px feedback browser smoke all passed. The installed artifact still corresponds to the isolated feedback snapshot above.
- Built/signed the Mac app with the repository installer, quit normally through the save-protected flow, and transactionally installed with an installer backup. Reopened the actual installed app and verified its compact dialog. Runtime endpoint matches the package default; there is no `.env` in the app. Connection-file hashes matched before/after installation.
- **Live PASS:** entered `[TEST — authorized repaired Mac feedback]` with marker `mac-feedback-e2e-2026-10-23-02`, unchecked logs, clicked Send. UI showed **Feedback sent. Thank you!** and cleared the message. AgentMail API list/get verified the exact body marker at `2026-10-23T09:25:32.838Z` in thread `f945237d-4ee1-4c8b-9a43-63f28e186276`, with zero attachments as expected. Restored the Include logs checkbox and verified the top-right close control.

## Remaining limits

Live submission used synthetic text with session diagnostics excluded; diagnostic attachment delivery was verified with disposable browser/Electron receivers and provider-mapping tests, not by sharing this user's session telemetry. Previously published 0.3.6/0.3.7 artifacts remain unchanged. A future published update must include this implementation; no push or release was performed. See [feedback delivery](../../docs/feedback-delivery.md).
