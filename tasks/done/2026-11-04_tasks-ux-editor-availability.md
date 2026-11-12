# Honest live-editor availability

Increment of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md), authorized 2026-11-04.

- [x] Reproduce loaded note being mislabeled unavailable after live capability failure: before fix, availability smoke failed at missing-capabilities with “Connecting…” rather than “Editing unavailable”.
- [x] Preserve canonical loaded content after capabilities/protocol failure, disable editing, offer “Retry editing” and avoid failed-save/recovery controls when there is no draft.
- [x] Align accessible status with visible connection/read-only/availability status; distinguish clean offline content from retained private drafts.
- [x] Verify missing capabilities, incompatible protocol and server error at 1280/390px, then healthy retry; retain actual missing-note behavior (seven browser scenarios).
- [x] Build and 29 feedback/architecture/connection UX tests passed.
- [x] Run neighboring fresh-note and retained-version recovery browser checks.
- [x] Record limits, archive and commit.

Expected effect and protection boundaries were recorded in parent task before editing. Candidate based on `28c41f4`. Canonical bytes remain unchanged and no legacy write fallback is introduced. This addresses a misleading error path; it neither identifies nor fixes the existing VPS transport configuration. Native ratings remain not observed.

Outcome: keep. Seven availability scenarios passed, including clean Home/Back navigation, canonical unchanged/no writes and healthy Retry editing. A first candidate incorrectly retained failed-save state, blocking clean navigation; the Home probe caught that loss. Corrected it to preserve confirmed read status, then all scenarios passed. Fresh-note feedback and all 11 retained-version scenarios also passed before that final clean-status correction; the correction only changes clean setup-failure handling. Native Mac/VPS rerun remains unverified.
