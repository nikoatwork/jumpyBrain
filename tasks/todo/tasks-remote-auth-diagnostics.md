# Diagnosable remote authentication failures

## Goal

Answer the [November 12 feedback](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=a447fe5d-fcd8-412a-8ee4-0ff5ee132edf) ([index](../feedback.md)), owned until now by the P2 item in [follow-ups](tasks-feedback-follow-ups.md): with an API key exported in the shell profile, remote CLI calls failed with an auth error that gave no hint which credential was used or how to recover.

## Tasks

- [ ] Reproduce against a disposable local server: unknown, revoked, malformed and missing keys; env var vs `~/.config/jumpybrain/.env` vs per-target config. Document the actual precedence.
- [ ] Auth-failure messages name the credential *source* (e.g. `JUMPYBRAIN_API_KEY from environment`, `.env`, target config) and a short non-secret fingerprint (length / last 4), never the key; give the recovery step (ask the server admin to reissue, how to set the key).
- [ ] Evaluate a read-only check (e.g. extend an existing status/doctor command) that reports target, credential source and whether the server accepts it. Add only if small and consistent with existing CLI commands.
- [ ] Do not try to prove the reported server-redeploy key loss; record it as a separate unproven limit.
- [ ] Tests: `test/http-client.test.js` / relevant CLI test file; no Mac/browser suites for CLI-only text.
- [ ] Update `docs/cli-commands.md` / shared-memory guide as needed, release note, close the follow-up item, finalize per `docs/task-workflow.md`.
