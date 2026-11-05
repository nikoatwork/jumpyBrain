# Read-only manual-copy recovery

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md).

- [x] Reproduce publication affordance after clipboard denial for a real reader.
- [x] Follow known live write capability for reviewed-publication controls and submission.
- [x] Verify selectable copy, writer recovery, capability transitions and canonical preservation.
- [x] Record limits, archive and commit.

Pre-fix real-reader assertion failed: clipboard fallback offered publication.
Source change gates publication controls and submission on the already-known
live write capability. Recovery refresh composes retained and private-draft
controls on live state changes. Saved comparison/copy remain read-only.

Rejected candidate: all reader/revocation checks and 132 focused tests passed,
but the full writing journey could not publish a reviewed writer draft.
`liveCanWrite:false` also describes a recoverable conflict; it is not a role
grant. Preserve `/tmp/jumpybrain-ux-workspace-reader-recovery.log`. Corrected
candidate injects the same explicit note-lock policy used by the body/format
controls, allowing known-writer conflict review while blocking readers and
blocked/unopened sessions. Full writer publication must pass before retention.

Outcome: keep the corrected candidate, build `c29c1197b7314d89`. Four
real-role browser cases pass: reader manual-copy fallback at 1280/390, writer
reconnect and open-dialog writer revocation. Revoked publication cannot dispatch
a mutation; canonical bytes remain unchanged. The full writing journey passes
reviewed publication, failed-save navigation protection, exact copy and all
responsive/theme cases. Ten retained-review neighbors and all 132 focused
browser/controller/recovery/architecture/bundle tests pass. The earlier six
uncertain-save-with-peer cases also passed on the first candidate; their saved
acceptance route is unchanged by the correction, while actual writer publication
was rerun through the full workspace.

The initial “dialog is visible” wait raced its loading message; the final probe
waits for the actual manual-copy instruction. That failed probe is not a product
regression or a pass. Editor: 223,118 gzip bytes, same 15 packages. Package:
1,448,647 compressed bytes, 4,564,831 unpacked, 3,050,845 runtime, 646 files.
All existing ceilings pass; no dependency/budget increase. Native Mac, physical
clipboard/accessibility behavior and public VPS remain unobserved.
