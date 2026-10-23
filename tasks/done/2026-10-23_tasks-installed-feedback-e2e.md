# Installed Mac feedback end-to-end check

Status: test completed and archived on 2026-10-23; **delivery failed**. Repair remains open in [feedback release configuration](../todo/tasks-feedback-release-configuration.md).

## Goal

Attempt an explicitly authorized synthetic message through the installed Mac app and confirm receipt in AgentMail, or diagnose the concrete failure. A completed investigation is not a delivery pass.

## Tasks

- [x] Record installed app snapshot and attempt a uniquely labeled test through its actual Feedback UI.
- [x] Refresh the live destination inbox and diagnose the concrete failure.
- [x] Record the failed result and limits in owning docs; archive for the scoped task commit and track repair separately.

## Scope

User authorized a live end-to-end test on 2026-10-23. Use synthetic message text and exclude session diagnostics from the live submission. Preserve personal notes and installation state while diagnosing.

## Verification and result

- Repository snapshot: `8326f2e`; the UI exercised the existing `/Users/monkey/Applications/jumpyBrain.app`, whose Info.plist reports **0.3.6**. No rebuild, update or installation was performed.
- Opened Feedback in the actual Electron window, unchecked **Include diagnostic log**, entered synthetic marker `mac-feedback-e2e-2026-10-23-01`, and clicked **Send feedback**.
- **FAIL:** UI displayed **Direct feedback is not available in this installation yet. Your message is still here; you can use the email alternatives below.** Draft text remained visible and diagnostics remained excluded.
- Installed runtime `feedback-config.json` contains `{"url":""}`. `createFeedbackForwarder` therefore reports `feedback_unavailable` without calling the relay. The gateway uses this default forwarder. This identifies the local failure; it does not establish current relay health.
- Refreshed the signed-in AgentMail inbox through Chrome: **1–2**, Next disabled. Only the October 20 feedback and October 22 synthetic delivery test were present; the new marker was absent. No new email was sent by this failed attempt.
- Inspected the retained downloaded 0.3.6 and 0.3.7 tarballs with Python `tarfile`, without extraction: both bundled feedback URLs are empty. No fresh GitHub artifact download/digest verification was performed, so this evidence describes retained artifacts.
- Static inspection: `scripts/build-editor.mjs` defaults to an empty URL when the environment variable is absent; `scripts/pack-local.mjs` rebuilds; `scripts/release.mjs` runs packaging. No new provider call or diagnostic-attachment delivery was exercised.
- The synthetic failed draft is left in the app for inspection. Personal notes and app installation were untouched. No runtime tests were needed for documentation-only changes; local Markdown links, staged whitespace and the precommit guard are checked before commit.
