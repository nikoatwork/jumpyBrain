# UX verification harness alignment

Part of the [four-hour UX loop](2026-11-05_tasks-ux-four-hour-loop.md). Required to interpret broader checks without inventing product failures or false passes.

- [x] Preserve original workspace premature-Saved and board unfaulted-edit failures in parent notes.
- [x] Wait for actual live confirmation and inject failure through the existing WS transport fixture; verify recovery through visible review UI.
- [x] Confirm updater's Linux lock expectation also fails at pristine `85512f0`; assert the native platform refusal on Linux while retaining lock expectation on macOS.
- [x] Complete writing and board journeys; investigate any actual product findings separately.
- [x] Record results and limits, archive/commit this test-only correction.

No native UX score or product behavior change is established by correcting a harness. Do not weaken current confirmation, source-operation or recovery protections to satisfy obsolete HTTP assumptions.

Outcome: keep the harness corrections. Board journey passed note membership with a genuinely retained failed live edit, followed by explicit reviewed publication. Full writing journey passed using confirmed live waits, scoped save faults, body/title draft-copy checks and visible review UI. Source mutations are counted on both HTTP and WS, so no-save assertions cannot falsely pass by ignoring the current transport. A competing dual-hold copy fixture initially deadlocked; the owned run was stopped, the baseline was awaited first, and title-only holding plus an explicit arrival deadline then passed. This is a test-fixture correction, not a product failure.

Updater unit tests: 28 passed, four Mac-only skips; Linux now asserts the actual platform refusal, while macOS keeps its lock expectation. Expanded real CLI generation checks pass at 1280/390/320px, including viewport fit, two producers with a matching stream ID and reconnect without fabricated completion (eight reported cases). Isolated editor reference/paste/code/Undo/IME-simulation checks passed at 1280/390; these are not full app or physical-device evidence.
