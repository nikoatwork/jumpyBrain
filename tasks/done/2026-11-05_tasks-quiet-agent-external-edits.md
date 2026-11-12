# Quiet agent edits and simpler note recovery

Completed 2026-11-05. Saved agent edits load without review; genuine draft choices show Added/Removed text and two main actions. Final full suite, production recovery/collaboration journeys and unchanged size budgets pass.

Authorized 2026-11-05: fix the requested-agent-edit review report, then simplify recovery for everyday note editing. User requested subagents, automatic normal behavior, readable added/removed text and fewer choices. Preserve canonical Markdown and recoverable private drafts.

- [x] Inspect report diagnostics and reproduce current behavior.
- [x] Adopt clean saved updates without a retained-version acknowledgement or caret-only draft conflict.
- [x] Show Added/Removed summaries and two main choices; tuck full text/copy/older drafts under More options.
- [x] Verify saved adoption, both recovery choices, stale writes, permissions, storage failures, desktop/mobile and package budgets.
- [x] Complete final broad collaboration smoke, archive evidence and commit scoped work.

Source: [November 5 report](https://console.agentmail.to/dashboard/inboxes/jumpybrain%40agentmail.to?thread=4fa21ff2-0b38-41bd-abcc-90f00e1c642e). Private message text/attachments remain outside Git.

## Findings

- Complete retained canonical versions showed a review notice even on a clean Saved note. Guarded CLI/HTTP updates can retain versions after replacing body or metadata; this retention needs no acknowledgement.
- A focused clean caret crossing ambiguous raw-file alignment could separately trigger `unproven_draft`/conflict despite having no unpublished edit. Existing proof expected that unnecessary conflict.
- The report's bounded diagnostics identify app/backend 0.3.20 and an unproven-draft/conflict pair. Dropped/truncated histories prevent establishing its exact historical cause. The implementation fixes reproducible current paths without claiming that the original sequence is fully reconstructed.

## Delivered behavior

- Ordinary clean saved agent/HTTP/file edits load automatically. Optional history lives under More info → Earlier versions. Incomplete history discovery still warns visibly.
- Only a confirmed clean source with no pending body/title/history write, uncertain receipt, composition or source mismatch may retire an unprovable caret. Permission is checked after asynchronous history reads. Exact source replay/round-trip remain mandatory, captured input remains protected, and both native/Lexical carets clear with editor blur rather than a guessed next insertion position.
- Genuine private-draft recovery shows the changed lines and Keep my changes / Use saved version. Optional history shows Keep current note / Use earlier version. Successful choices return to the note. Full copies, copying and older-draft/version controls stay under collapsed More options; icon close preserves the current draft.
- The shared text-only summary uses bounded line alignment: at most 100,000 source units per side and 100,000 matrix cells, six changed groups, bounded Unicode/CRLF-safe excerpts. Large/complex summaries disclose shortening and point to complete copies. Preview excerpts never enter publication.
- Current-hash restoration, uncertain-write protections, protected frontmatter, durable private-draft retention, readers/revocation, storage-denial handling and credential/brain fences remain intact. Loading/busy states disable choices; Use saved version retains blocked-session reconnect recovery independently of publication permission.
- Existing smoke fixtures open More options before using their original full-copy/selector controls; content/permission/restore assertions remain intact.

## Final verification

Tested production source: base `f37af63` plus this scoped change; final build `8789151cf555c385`. No runtime source changed after this build.

- `npm run build`: passed; editor **672,561 minified / 222,243 gzip bytes**, below unchanged 223,250-byte cap.
- Final `node --test`: **1,926 total, 1,924 passed, two optional skips, zero failures** (88.0 seconds). Includes six shared-summary regressions and clean-source eligibility safeguards.
- Final production simple-recovery smoke: **10 scenarios** at 1280/390px: readable changes, two choices, busy-save guards, close/draft retention, saved acceptance, stale hashes, failed reads, live draft summary refresh, full-copy fallback and reader restrictions.
- Final saved-update/history UX smoke: **14 checkpoints** at 1280/390px: actual CLI show/guarded update, continued typing, raw replacement, optional comparisons, navigation/reload/scope changes, failed/stale comparisons, active ambiguous-caret retirement and fresh repositioned typing.
- Final broad production collaboration smoke passed: two-context source convergence, exact positional intent, clean-caret adoption, genuine unpublished-overlap recovery/presence, shipped shell, IME, offline body/title draft versions, storage failure, restart protection and 132 fresh CLI actors.
- Final earlier-version smoke: **11 scenarios**, including successful auto-close, stale restore rejection, protected metadata, reader/revocation, private draft archival, storage denial, scope privacy, 1.6 MB copy fallback and incomplete discovery.
- Expanded lifecycle smoke passed capture/immediate search/graph, guarded two-tab recovery, 390/320 layouts, deletion/backlinks/index refresh. Reader-affordance smoke passed desktop/mobile copy/search/back, writer reconnect and revoked-writer recovery. Their source flows remained unchanged by the final preview-only optimization.
- Existing-note smoke on the unchanged final collaboration/lexical runtime passed **40 input cases** across idle/reconnect/restart/disjoint external updates, including a real 35-second idle, exact persistence/reload/Undo, and a held overlapping raw edit that retains the private draft and canonical external bytes.
- Final package budgets passed: **1,446,801 archive / 4,573,925 unpacked / 3,059,626 runtime bytes**, 648 files. No budget was raised.
- Final light/dark production-shell screenshots at 1280/390 were inspected; changes, two choices and collapsed options fit without clipping/overlap. Independent source review found no concrete correctness bug; extra helper probes covered leading blanks, prepended/interior bullets, newline changes and line joins.

Final editor bundle SHA-256 `23ba1c36e4b7088ad28b64a67935b917ad3b27ea6e771bb0e3a9c67185a74f7a`; collaboration editor `c4095afec84d9a037f46cc8ee537811b0d584814cab41493f937491e3ed1c0f3`; Lexical editor `717be13b9bb8b375cbba8f887c2a46b59503ee56c21219e273b21df227cbce9c`.

## Failed attempts retained

- New CLI review-notice regression failed against original compiled source; clean-caret eligibility regression also failed before its fix.
- Early broad smoke expected the former caret-only conflict. Updated that expectation and added a held unpublished-overlap case. A second fixture failure selected a legitimate pre-conflict presence frame; its observation boundary now starts after confirmed conflict. The subsequent complete first-increment production smoke passed without weakening source/caret checks.
- First expanded full suite passed all functional cases but failed editor size (223,683 gzip versus fixed 223,250). Replacing the preview-only generic character diff with bounded line alignment removed over 1.4 KB gzip; the final suite passes the original cap.
- One expanded broad run stopped at an early existing bold-text peer-caret marker assertion before changed dialogs. Its failed log remains `/tmp/jb-simple-recovery-collaboration-first.log`; the final serial run passed those unchanged marker assertions. That run then reached an old read-error wording wait; updating only its literal to the new copy allowed the complete final run to pass (`/tmp/jb-simple-recovery-collaboration-before-copy-fixture.log`).

## Evidence and limits

Logs: `/tmp/jb-quiet-edits-{before,build,full,stale,package}.log`, `/tmp/jb-quiet-edits-collaboration-{focused,smoke,smoke-before-fixture,smoke-presence-fixture}.log`, and `/tmp/jb-simple-recovery-{build,build-final,full,full-final,draft-final,ux-final,retained-final,package-final,lifecycle,readonly}.log`. Final collaboration log: `/tmp/jb-simple-recovery-collaboration-final.log`. Native AX fixture labels/disclosure expectations were updated and syntax-checked, without claiming native execution. Final fixture screenshots: `/tmp/jb-simple-recovery-qa/`.

Disposable local Chromium fixtures only. No installed-app replacement, personal-note mutation, release, push, live VPS validation, native accessibility/physical IME audit or remote-memory write. Historical report cause remains unproven. Large summaries may include unchanged text, explicitly disclosed; full versions remain available.
