# Feedback query instructions

Status: completed and archived on 2026-10-23.

Outcome: [the feedback procedure](../../docs/check-feedback.md) records the direct inbox URL, existing Chrome session, working native fallback, scope/pagination rules and synthetic-test distinction. It is linked from feedback delivery docs and local agent instructions.

## Goal

Make AgentMail feedback checks repeatable without rediscovering the inbox, browser access or test-message distinction.

## Tasks

- [x] Document the verified inbox route, Chrome workflow, fallback and reporting rules.
- [x] Link the procedure from feedback delivery docs and local agent instructions.
- [x] Check links and patch hygiene; record verification and limits, archive for the scoped documentation commit.

## Scope

Documentation only. The live inbox was inspected earlier in this conversation on 2026-10-23. No new mail access, credentials or delivery test is needed for this change. Local `AGENTS.md` is ignored and excluded from the commit.

## Verification and limits

- Tested snapshot: documentation changes based on `9753914`; local Markdown link resolution, `git diff --check`, staged whitespace checks and `npm run guard:staged` passed.
- Earlier live check verified signed-in Chrome navigation, two inbox threads, reading the genuine feedback body, and native accessibility fallback after preview/tab automation failed. The guide's refresh, pagination, missing-message search and signed-out branches were reviewed but not newly exercised; no automation tool is guaranteed available in another host.
- Runtime code is unchanged, so runtime tests and release notes are not needed. A short task-finalization changelog entry follows the repository's explicit archive rule.
- No private message bodies, personal sender addresses, credentials or deployment identifiers are copied into the procedure. No push, installation or release is part of this task.
