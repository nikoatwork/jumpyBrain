# Keychain access keys across app updates

## Goal

A saved remote-connection access key must remain readable after a normal app update. Report: [November 11 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=40a4d331-9fb9-4855-9027-b3b88776b351) ([index](../feedback.md)).

## Evidence and boundaries

- `integrations/macos-companion/Companion.swift` disables Security-agent interaction and expects an ad-hoc rebuild to return "unavailable". Hypothesis: the Keychain item's legacy ACL is bound to the previous build's signature/cdhash, so every re-signed update is refused silently.
- Keep: no plaintext fallback, no login-time prompt, no different credential store without a decision, explicit failure when access is denied.
- Scope: confirm the release signing identity and ACL behavior, choose the fix, verify across a real update, docs, archive and local commit. No release or push.

## Tasks

- [ ] 1.0 Confirm cause.
  - [ ] 1.1 Read gateway/desktop docs, the November 11 diagnostics attachment, and how release builds are signed (Developer ID vs ad-hoc; designated requirement stability).
  - [ ] 1.2 Reproduce: save a key with build A, update to a re-signed build B, read it.
- [ ] 2.0 Fix: stable designated requirement, data-protection keychain/access group, or requirement-based ACL; migrate existing items without exposing the key.
- [ ] 3.0 Verify across a packaged update; docs, feedback outcome, release note, archive, commit.
