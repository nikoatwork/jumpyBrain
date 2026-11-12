# Idle editor session recovery

## Completed — 2026-11-12

A dropped coordinator request no longer ends the Mac editor session for good. The tab freezes and says "Reconnecting…", then re-registers by itself with backoff and immediately on focus, visibility or regained network. The same tab and page continue with no reload and no draft loss. Authorization rejections (401/403), a generation change with a pending draft, and switch-barrier failures keep the hard fence and recovery path. Not released or installed.

## Goal

A local, single-user Mac editor left open for hours must not end in a permanent "Your session ended" lock. Report: [November 12 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=bee0edf8-50db-4243-b968-0903aeab6ac8) ([index](../feedback.md)).

## Evidence and boundaries

- Starting snapshot: `b8c356d2` (branch `fix/idle-session-recovery` from master).
- Diagnostics attachment (app/host 0.3.23, build `4a1e2d95f7f57a26`, Electron 44): the gateway recorded **no failed poll**. Polls were OK until 08:08:29 UTC, and a fresh `state`/`register` succeeded at 08:14:03, consistent with a manual "Retry companion session". So the failing request never reached the gateway, which matches a client-side network drop such as Chromium suspending in-flight requests on system sleep. Gateway/server events were heavily coalesced (85,714/5,198) and 184 events were omitted, so the exact moment is not proven.
- Code cause: `companionPoll` called `companionFence()` on any failure. The fence set `companionSessionFailed`, which only a manual `startCompanion` cleared. Later successful polls kept the tab locked (`companionLock(companionSessionFailed)`), and the message wrongly pointed to reopening from the app menu.
- The coordinator has no idle tab expiry, so re-registering the same tab and generation is safe and idempotent.
- Kept: no optimistic unfreeze on a lost response (only a fresh `state`+`register` round trip unfreezes); drafts are never moved across generations; 401/403 stays final.

## Tasks

- [x] 1.0 Establish behavior: docs, diagnostics, fence paths, coordinator semantics.
- [x] 2.0 Implement and verify.
  - [x] 2.1 Recoverable failures (no HTTP status or 5xx) retry `startCompanion(true)` with 1–30 s backoff; the stale poll loop stops while failed; registration restarts polling.
  - [x] 2.2 Immediate retry on `focus`, `visibilitychange` (visible) and `online`; the manual retry button is unchanged.
  - [x] 2.3 A "companion restarted while this tab held an unsaved draft" error is now shown verbatim instead of the generic message, and never retried automatically.
  - [x] 2.4 Unit regressions and a production-gateway Chromium runner.
- [x] 3.0 Docs (`gateway.docs.md`), feedback index/follow-up, release note, changelog, archive, commit.

## Verification

- `npm run build`, then `node --test test/companion-browser.test.js test/companion-connection-ux.test.js test/companion-backend-restart.test.js`: 42 pass, 0 fail. Three new cases: dropped/5xx poll schedules recovery while 401 does not; recovery re-registers the same tab, unfreezes and backs off 1 s→2 s; a restart with a draft is reported and not retried.
- New `npx --package=playwright node scripts/companion-idle-recovery-smoke.mjs` (production gateway and shell, disposable root): aborted `poll`/`state`/`register` with `internetdisconnected` → "Reconnecting" and frozen; automatic retries continue; after restore and focus the same `companionTabId` and URL recover; edits before and after are on disk. **PASS** on this branch, **FAIL** on an untouched master build (no "Reconnecting", no recovery).
- `scripts/companion-browser-smoke.mjs` is already broken on master, independent of this change: a closed-`<details>` colour wait at line 173, then Settings startup fetching `/memories/all/boards` at line 179, confirmed on an untouched master build. Its fixture also serves no live editing. It was not changed here; the in-progress Settings-overlay work on master already touches the first issue.

## Limits

- No real macOS sleep/wake or packaged Electron run; the network-drop emulation is Chromium-level. The exact November 12 failure is inferred, not proven.
- If the gateway itself is gone (app relaunched on a new port), the tab keeps showing "Reconnecting…" with Recover draft and Retry visible; reopening from the app menu is still required.
