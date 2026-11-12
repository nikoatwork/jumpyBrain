# Usability state and sidebar — completed units 5–11

Parent: [independent feedback increments](2026-11-04_tasks-feedback-independent-increments.md).
Source base: `a7a734696a004b667e570e350aa001c87c18b011` plus the scoped implementation committed with this record. No release, push or personal installation.

## Outcome

- [x] Named-agent CLI remember, guarded update and live stream retain the same declared creator/latest-editor name. External edits invalidate stale latest-editor claims. Session client IDs are not actor IDs; existing canonical/recognition coverage remains intact. No residual attribution implementation was needed.
- [x] Package identity is captured at runtime module load; replacing package.json cannot relabel a running backend. An isolated replacement runtime sees the new version, and hosted health retains the executing old identity. App/backend consumers use the same metadata seam.
- [x] Current clean saved notes keep recovery controls hidden. Scoped older/invalid draft bytes remain protected by existing recovery/store tests. Editor proof/history/epoch/source failures now retain finite diagnostic codes without text, offsets, IDs or operations. No speculative concurrency change.
- [x] Feedback Escape/Close works during collection and sending. Reopening a pending send cannot duplicate it; only a confirmed matching acceptance clears its text. Drafts/retry reports stay tab-local in memory, independent of brain selection, through close/reopen and backend reconnect; reload/restart does not persist them. Diagnostics remain opt-in.
- [x] Real local and hosted CLI remember/wrapup/delete outcomes are already truthful. Local remember indexed immediately; wrapup/delete and hosted writes returned pending. Existing quiet maintenance converged without repeated writes or explicit indexing. Deleted notes were absent as usable evidence; existing failure/interruption/concurrency tests retain saved identity semantics.
- [x] Added attention list/settle/snooze/bring-back through the public local runtime, shared app policy, root backend and existing hosted GET/PATCH. Hash preconditions, reader authorization, canonical content/edit-date preservation, explicit totals/omissions and unknown provenance pass. Lists cap active/settled groups independently at 100; settling is neither read nor approval, and pins remain device-local.
- [x] Existing scoped sidebar previews now use opaque pre/post-stat generation hints. Unchanged previews are reused, raw edits refresh without timestamp metadata changes, failed reads keep a cooldown, and scope/pagehide cancels pending previews. Four concurrent previews and existing list limits remain. Tokens are cache hints, not canonical hashes/snapshot guarantees.

## Verification

- Full `npm test`: 1,883 tests, 1,881 passed, zero failed, two opt-in skips, 89.549 s. This run precedes the final finite recovery callback and additional attribution/reader assertions; the final affected suite below covers those changes.
- Final affected suite: 53 passed across attention CLI, named-agent live writes, collaboration editor, diagnostics/privacy, editor bundle and architecture boundaries. Earlier affected suites also covered creation outcomes, backend maintenance, note attention, sidebar and CLI help/validation.
- `scripts/usability-writes-smoke.mjs`: real supported local/hosted CLI publication, immediate nonrepairing deletion evidence and quiet convergence pass in disposable lexical roots.
- Production Feedback Chromium smoke passes at desktop/390/320 widths, light/dark, fake relay rejection/acceptance, focus/shortcuts, pending-send Escape, offline reconnect and clean recovery controls.
- Built disposable `.local-pack/usability-desktop/jumpyBrain.app`; packaged-resource Electron smoke passes actual renderer crash/reload, safe attachments, collection cancellation, native Escape during pending delivery and retained text/confirmed cleanup. The last added finite recovery callbacks have controller/privacy coverage; their exact final native artifact was not separately rebuilt for this checkpoint.
- Actual CLI tarball manifest: 294 required paths, 637 files; 1,441,985 archive / 4,596,803 unpacked / 3,094,719 runtime bytes. SHA-256 `89e785723cb94c291709a1c68e3f0886287d69d5d5aa97ea73a61ae4a3d86062`. Final shared editor is 221,417 gzip bytes, within unchanged 221,500 ceiling. Owning docs changed after packing; this digest identifies the tested checkpoint rather than later documentation bytes.
- `git diff --check` passes.

## Sidebar evidence

Eight fictional notes, same production shell and machine. Before: cold 10 requests/8 document GETs/8,830 bytes; idle 9/8/7,409; edit 5/2/3,948; reconnect 11/9/9,289. After: cold 10/8/9,558; idle 1/0/2,561; edit 5/2/4,676; reconnect 11/9/10,038. Metadata grows to carry version hints; the measured win is unchanged idle document traffic. A raw edit with a delayed response refreshes exactly the one changed sidebar preview; the open editor retains its separate source-observation read. No latency or memory-benefit claim.

## Feedback evidence and limits

Read-only inbox check 2026-11-03 11:07:01.372 UTC: received/non-spam scope, one complete page, 42 scanned, two explicit delivery tests excluded. Read the November 2 16:37/17:01 UTC report bodies and both diagnostic attachments via authenticated API and signed download, without replies or label changes. Retained raw evidence is private temporary storage, not committed.

Both attachments identify 0.3.17/build `6c0762ec59d5751f`; they contain dropped/coalesced/omitted events and mainly unavailable-search diagnostics. The later attachment has one generic unconfirmed conflict. They do not distinguish source replacement, restart epoch, overlap or local edit proof; no definitive historical cause is claimed. The known native deletion correction is separate evidence. New finite reasons improve the next report. Current draft/recovery controls pass, and unknown historical failures remain unknown.

Only disposable local/localhost roots and a Mac ARM64 packaged fixture were used. No private memory writes, live support delivery, publication, Intel/Linux desktop claim, model download or retrieval-ranking change.
