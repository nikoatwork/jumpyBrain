# M1 candidate: native Lexical/Yjs binding

Status: rejected as wired, 2026-11-01. This is design-gate evidence, not a claim that the library cannot be adapted. No production editor, runtime, dependency manifest or shared dist file was changed.

## Reproduce

The isolated [package](../../prototypes/multiplayer/lexical-native/package.json) pins @lexical/yjs 0.51.0 and Yjs 13.6.33. It uses the released V1 binding, not the experimental V2 or Yjs 14/nightly APIs.

    npm ci --prefix prototypes/multiplayer/lexical-native --ignore-scripts
    npx --package=playwright@1.64.1 node prototypes/multiplayer/lexical-native/verify.mjs

The verifier deliberately exits 1 when the candidate is rejected. A successful browser launch or converged Yjs state does not make the candidate pass. Machine-readable output is .local-pack/multiplayer/M1-lexical-native.json; set JUMPYBRAIN_M1_NATIVE_OUT for a separate evidence file. A non-assertion execution failure is reported as error rather than a design counterexample.

Inputs are the parent's shared [corpus](../../prototypes/multiplayer/corpus.json) and the actual [createNoteEditor](../../src/adapters/http-server/lexical-editor.ts). A missing/invalid corpus fails; there is no fallback to simpler examples.

## What was actually built

[build.mjs](../../prototypes/multiplayer/lexical-native/build.mjs) bundles the production editor and its actual reference, task, fenced-code, table and literal-source nodes. Guarded, prototype-only esbuild instrumentation exposes the internal editor/source map/serializer and disables its local history registration in the generated bundle. Yjs UndoManager then owns collaborative undo. The instrumentation requires exactly one match for each source marker and records both original and instrumented source hashes.

All lexical and @lexical imports other than the isolated yjs package resolve to the existing root installation, including exported subpaths. This prevents two Lexical instances with incompatible node identity. No production source is patched on disk.

[browser.ts](../../prototypes/multiplayer/lexical-native/browser.ts) creates separate editor, Y.Doc, binding, undo manager and outgoing-update queue per logical client. Queued delivery simulates concurrent edits and duplicate frames. Browser contenteditable input is exercised as well as granular Lexical text operations. The test uses page.setContent and in-memory Yjs delivery; it does not establish a WebSocket protocol, a persistent backend or independent browser-context reconnection.

The 12 shared corpus documents are tested twice: exact seed-to-fresh-collaborator load/export, and an unrelated Human-anchor edit. Edited cases compare against the actual unbound production editor performing the same operation. This preserves its existing allowed normalization instead of inventing stricter source guarantees for edited text.

## Result

Thirty-one scenarios executed: 24 passed, seven counterexamples, zero execution errors. The same counterexamples reproduced during development; the final retained report records the exact source, isolated lock, corpus and environment identities.

Passed coverage includes independent concurrent text edits and same-position concurrent inserts retaining both complete text runs; streamed agent chunks with duplicate delivery; local undo preserving another client's edit; actual browser contenteditable input; references, literal unsupported source, source tables, Unicode and repeated paragraphs; and CRLF/no-final-newline/trailing-blank/incomplete-fence load behavior.

Five counterexamples concern source fidelity:

- Fresh native-bound collaborator converts untouched __bold__ delimiters to **bold**.
- Fresh collaborator converts untouched uppercase checked marker [X] to [x].
- Fresh collaborator reduces an untouched four-backtick code fence to three backticks.
- After editing a different Human-anchor line, the fresh collaborator still rewrites the untouched task marker, unlike the unbound production editor.
- The equivalent unrelated edit rewrites the untouched code fence, unlike the unbound production editor.

The current editor's exact original source lives in a per-editor sources map keyed by local Lexical node keys. The native shared node state does not transport that map. Its remote node content can therefore converge while Markdown serialization differs from the source-preserving editor contract. Serializing this source information safely, including its invalidation on concurrent edits, would be additional integration work.

Two counterexamples concern operation semantics:

- Concurrently deleting a block removes a human insertion in that block. Both clients agree on the deletion; the candidate exposes no recovery for the lost human text. This is a failing user-intent contract even though the CRDT converges.
- An agent computes offset 5 from old text same same, then applies that integer directly after a prefix insertion. It produces prefiSECONDme same instead of prefix same SECOND. This is an explicit negative control for a missing read-state/anchor adapter, not an assertion that native Yjs requires stale integer offsets. An adapter that applies edits against the read state could address it.

The rejected implementation is therefore not a drop-in replacement. A later native design would need shared lossless-source metadata, granular structural conflict/recovery semantics, and versioned agent read-state mapping before reevaluation.

## Recorded identities and cost

- Environment: Node v26.7.0, Darwin arm64, Chromium 156.0.8078.4.
- Shared corpus file SHA-256: 86d37b14925e07dd680ab2971d139271ffaa20f5753af8f1a632980b3ae651c5.
- Production editor source SHA-256: 69dc11e16fdec09056a9c85db697d8b17034369fc484983938e2795421f1d52f.
- Instrumented editor source SHA-256: ea7563a2090d04365ec811d0abde4083b1cc1e282d7e2b25bc8d79b1070a5fcb.
- Isolated dependency lock SHA-256: 22524f23e0e42015890559c2e28162f31429dd779d085e0c3e6839bbf21ca99f.
- Native prototype harness: 592,374 minified bytes and 192,693 gzip bytes.
- Same instrumented editor-only control entry: 460,302 minified bytes and 151,135 gzip bytes.
- Difference: 41,558 gzip bytes, including the native binding, Yjs and prototype harness operations. This is not a measured production-app bundle delta.
- Final scenario run: approximately six seconds, excluding install, bundle build and browser launch.

These measurements are not a scale, latency or memory claim. This candidate does not prove canonical publication/crash recovery, raw-file reconciliation, protected-frontmatter admission, process ownership, server roles, real multi-browser IME/accessibility or VPS operation.

## Primary implementation references

- [Pinned binding exports](https://github.com/meta/lexical/blob/v0.51.0/packages/lexical-yjs/src/index.ts).
- [Pinned binding construction](https://github.com/meta/lexical/blob/v0.51.0/packages/lexical-yjs/src/Bindings.ts).
- [Pinned editor synchronization](https://github.com/meta/lexical/blob/v0.51.0/packages/lexical-yjs/src/SyncEditorStates.ts).

The measured scenarios and source code above establish this decision; the references identify the exact upstream API, rather than claiming upstream documentation establishes jumpyBrain's source fidelity.
