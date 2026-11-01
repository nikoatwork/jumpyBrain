# M1 candidate: source-oriented operations

Status: design prototype passes its limited contract. It is not the production collaboration engine or a complete structural editor binding.

## Reproduce

    npx --package=playwright@1.64.1 node prototypes/multiplayer/source-model/verify.mjs

Set JUMPYBRAIN_M1_SOURCE_OUT to preserve a separate report. The aggregate gate supplies a fresh evidence file automatically. The candidate adds no dependencies to the root or its own package.

## Model and evidence

[SourceSession](../../prototypes/multiplayer/source-model/model.mjs) uses server-ordered source splices with an epoch, base revision and operation identity. It retains a bounded revision history; safely independent changes rebase, same-position insertions follow server order, and overlapping replacements reject explicitly. This is a deliberately small experiment, not a claim to have implemented or proven a general OT/CRDT.

Patch ranges are checked against the actual retained read state before transformation. UTF-16 offsets cannot split surrogate pairs; strings must be well formed. Tuple identities prevent actor/operation delimiter collisions. Duplicate chunks and undo requests do not repeat changes. Expired history/epochs, stream gaps, ambiguous overlaps and resource overflow fail without silently retargeting an edit.

The model checks include 2,304 deterministic independent-splice arrival orders, repeated source text, stale invalid offsets, Unicode, actor-local undo, stream cancellation/deduplication, no-ops and bounded actor/stream/history state.

[The browser binding](../../prototypes/multiplayer/source-model/instrument.mjs) instruments the actual production createNoteEditor only in a generated bundle. It updates unambiguous text leaves and the existing source sidecar, preserving node keys and source spelling. It neither calls setMarkdown for each remote edit nor substitutes a textarea. History registration is disabled only in the generated prototype; actor-local undo is a model command rather than a shipped keyboard binding.

The 12 shared corpus cases cover custom references, tasks, fenced code, source tables, literal unsupported syntax, repeated text, Unicode, CRLF, missing final newlines, trailing blank lines and incomplete fences. The browser checks exact load/export and unrelated-source preservation, plus direct edits inside the four custom node types.

Two independent Chromium contexts exercise actual human keyboard input, granular remote updates, a streamed agent, duplicate chunks, a retained caret in another paragraph, and local undo that keeps the other human/agent text. An empty note accepts its first streamed text without rebuilding the root nodes.

## Hard boundary

The current prototype rejects newline/cross-block/delimiter-only or ambiguous source mappings into recovery, preserving the existing editor and incoming source. It does not deliver smooth structural collaboration. That binding remains an explicit M3 gate; it cannot be silently represented as complete because plain text works.

A post-serialization mismatch restores the pre-edit editor state/source sidecar. A fault-injected browser case proves source, DOM, node keys and the absence of feedback saves are retained. This is prototype instrumentation, not a production rollback implementation.

## Resource envelope

The reviewed experiment caps a document at 65,536 UTF-8 bytes, history/receipts at 128 operations, retained text versions at 129, actors at 32 and active streams at 16. These are prototype limits, not newly imposed product limits. Full snapshots make retention O(history × document size); the production design must justify or improve that cost before increasing them.

The aggregate integration workload executes 1,000 edits over 60,000 bytes and asserts bounded retained state. Timing is recorded as advisory on the stated environment, not as internet latency or VPS capacity evidence.

The prototype bundle is measured by the report; its extra hooks/harness are included. No production bundle budget or dependency manifest was changed. Physical IME/accessibility, other browsers, arbitrary Markdown, offline draft storage, protocol/auth, and a live VPS remain unverified.
