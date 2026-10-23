# Feedback release configuration

## Goal

Restore direct Feedback sending in distributed Mac apps and prevent release builds from silently losing the supported relay destination.

## Evidence

The [2026-10-23 installed-app check](../done/2026-10-23_tasks-installed-feedback-e2e.md) reproduced failure in the actual 0.3.6 UI. Installed and retained downloaded 0.3.6/0.3.7 runtime configs have an empty feedback URL. The build defaults to empty when its environment variable is missing. Historical configured-build delivery is not a release gate.

## Tasks

- [ ] Establish the intended publicly distributable feedback hostname; keep private company hostnames out of default packages and tracked docs.
- [ ] Configure the supported distribution path so packaging and subsequent GUI updates retain the intended endpoint, while preserving explicit disable/custom-host behavior.
- [ ] Add a meaningful packaging/release check for the intended delivery configuration and test missing configuration without live mail.
- [ ] Rebuild and repair the installed app when authorized, preserving notes/settings and active drafts; verify an explicitly authorized synthetic submission through its real Feedback UI and confirm it in AgentMail.
- [ ] Update owning docs and pending release notes after implementation; finalize with verification and limits. Publication requires a separate release request.

## Limits

No repair, installation or publication was performed during this diagnostic check. The relay's present health and mail provider were not tested because submission stopped at the unconfigured app forwarder. See [feedback delivery](../../docs/feedback-delivery.md).
