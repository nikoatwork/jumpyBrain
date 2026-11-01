# M1 publication and external-file proof

Status: design-only fixtures over the existing canonical publisher. No production runtime was changed.

## Reproduce

    node prototypes/multiplayer/durability/verify.mjs --out .local-pack/multiplayer/NEW-durability.json

Use a new output file. The fixture writes only temporary disposable brains, removes its owned children/directories, and requires the built current runtime. Publication fault hooks use Node module-loader instrumentation; the recorded evidence uses Node 26 and does not prove minimum-Node support.

## Publication and restart

The [session seam](../../prototypes/multiplayer/durability/session.mjs) distinguishes admitted pending text from published Markdown. It calls the real runtime's guarded update operation and checks the returned hash against the exact current merge policy. A deferred/failing publisher cannot produce a Saved receipt. An older whole-document request with a valid disk hash still rejects while live text is pending.

The fixtures retain protected identity/source/creation metadata and unknown metadata, reproduce all 12 corpus publications and the current uniform-CRLF publication behavior, and preserve exact observed bytes in conflict copies. The complete pipeline preserves uniform CRLF; inspecting only its internal frontmatter parser would incorrectly suggest otherwise.

Six real child-process probes terminate before the call, immediately before rename, immediately after rename, after the API returns, after a Saved receipt, and after injected rename failure. Guarded hooks require one exact match in the real compiled publisher and record its source digest.

Each process probe asserts complete old or complete new Markdown, appropriate receipt uncertainty, and successful read/rebuild after disposable collaboration state is deleted. A new session gets a new epoch and rejects stale operations. A write can be published without its client receiving a receipt; that remains unconfirmed until resynchronization, never permission to replay blindly.

Saved content needs no binary collaboration history. Unique draft/conflict copies are retained under private recovery storage and are explicitly not disposable cache. Multi-file recovery bundles are not atomic transactions; publication failure can also prevent saving a recovery copy.

## Raw files

The observer uses file events only as a possible trigger; explicit periodic polling detects a missed event. The fixtures cover in-place writes, atomic-save rename, independent merging, overlapping replacements, delete/recreate, duplicate IDs, invalid UTF-8, temporary truncation, intentional empty bodies, empty ID-less files, and a continuously changing writer.

The deterministic test policy uses 20 ms of quiet and a 100 ms maximum wait. Those are fixture values, not production tuning. Quiet bytes do not prove a writer finished. A completed valid empty body is accepted; a truncated or ID-less empty file is held and then preserved for recovery rather than silently recreated or treated as a deliberate deletion.

## Limits

Cooperating file locks are not filesystem compare-and-swap. An unobserved raw overwrite cannot always be recovered. SIGKILL around a fsynced publication is not proof against sudden power loss or filesystem corruption; directory fsync remains best-effort. A killed publisher may leave an owned stale lock/staging file, requiring the later root-owner recovery policy before further writes.

The seam intentionally backpressures writes during publication; callers must retain their drafts. It is not the final shared operation coordinator, browser offline storage, auth service, watcher daemon or multi-machine deployment.

The [composition fixture](../../prototypes/multiplayer/integration-cases.mjs) joins SourceSession with this real publisher: two human operations and incremental agent output reach Markdown with confirmed hashes, including incomplete Markdown, then rebuild after binary state is deleted. It also checks that a whole-document request cannot bypass pending generated text.
