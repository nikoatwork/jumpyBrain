# Living topic page walkthrough — 2026-10-24

Reviewed synthetic examples for the minimal L1–L5 implementation. These are explicit editorial judgments, not model-quality benchmarks or proof that an arbitrary external agent preserves meaning. Source checking compares file versions; the app never authors these sentences or infers supersession.

## Evidence and review criteria

The fixture seeds separate canonical original-plan, proposal and confirmed-decision source notes with their own claim-adjacent fingerprints. It starts with an October 1 plan for October 20, an October 10 proposal to delay, and an October 12 explicit decision confirming October 27. Evidence date, synthesis date and current edit/check times are distinct. The canonical page retains the human contribution “notify the customer before announcing the release.” Each important claim cites the original canonical ID/path plus its full-file fingerprint, not a hash of the paragraph or packet prefix.

The browser fixture and smoke use real canonical Markdown and the production server/editor. `test/living-topic-pages.test.js` uses the same confirmed-decision/human-contribution scenario through local and hosted read/check/update operations. The examples below review the semantic choices that deterministic checks alone cannot establish.

## Initial synthesis and additional evidence

**Initial:** “The October 1 plan targets October 20. Whether to delay remains unresolved; the October 10 note proposes a delay without approving it.” Keep both dates and the status of the proposal; do not manufacture a confirmed date from recency.

**After the explicit October 12 decision:** “The confirmed launch is October 27. The October 1 plan targeted October 20, and October 10 proposed a delay. The October 12 decision confirms the new date.” Latest substantive change: “October 12 confirmed October 27, replacing the October 20 plan.” Open question: “Who owns customer notification?” Retain the original plan as historical context and the human customer commitment. Judgment: the word *confirmed* is supported by an explicit decision, not merely the newest date. This is the canonical production-browser fixture output.

## Contradictory suggestion

**New evidence:** October 14 says “consider November 1,” without approval.

**Accepted draft:** “The last confirmed launch remains October 27. An October 14 suggestion proposes November 1; approval and customer impact remain unresolved.” Latest change: “Added the November 1 proposal as an open disagreement; no confirmed replacement decision found.” Retain the customer notice requirement.

**Rejected draft:** “The launch is now November 1.” Judgment: this silently turns a suggestion into supersession and drops the status qualification. The browser smoke deliberately appends this suggestion to the cited source and verifies `changed`; the checker does not select either date or rewrite the page.

## Human edit and guarded reconciliation

**Human contribution:** “Do not announce until the customer agrees,” in addition to the existing notice commitment.

**Accepted refresh:** Retain both approval and notice requirements, while changing the open question to “Customer approval remains required; owner of notification is unresolved.” If these requirements conflict with a claimed unconditional release commitment, preserve the conflict and ask for review in the run report instead of silently deleting the human contribution.

Deterministic evidence: the local update test first writes the human sentence outside the stale agent revision, proves that the stale destination hash receives `precondition_failed`, rereads and updates the latest page while retaining both human statements. The real Lexical smoke adds “Human: reserve one week for customer testing” on the citation line and confirms the exact source link/fingerprint survives import, editing, export and guarded autosave. This establishes byte preservation for this supported literal-link example, not general semantic preservation.

## Changed source during drafting and missing evidence

If the source fingerprint changes after drafting, the checker returns `changed`. Reread and reconsider within the authorized budget or leave the page untouched; do not substitute the new hash without reviewing the bytes. A source can still change again after the check and before saving. The saved-page guard checks only the destination.

If the source disappears, `missing` means a complete check pass found no canonical target. Accepted limitation text: “The October 12 decision was cited in the prior synthesis, but its source is unavailable in this check; the original wording cannot be re-opened here.” Keep any useful historical context explicitly qualified; do not claim a source was freshly reviewed. Duplicate identities are `ambiguous`; any unreadable/oversized file (even unrelated), more than 500 canonical files or exhaustion of the 4 MiB version pass makes all versioned references `not_checked`, not a guess that evidence is absent/current. Tests exercise missing/changed/duplicate/partial outcomes and ensure checks leave page bytes and mtime intact.

## No-op and incomplete evidence

If the current page already captures the reviewed evidence, leave its latest-change explanation, bytes and edit time unchanged; do not append a checked-at line or index solely to advertise another run. The exact no-op test confirms unchanged hashes/mtime and continued stale-hash rejection. Hosted no-op updates leave index bookkeeping alone. Cosmetic no-ops depend on the agent deciding to skip the write; the engine's fast path uses exact content equality only.

A page with no versioned references is partial, not implicitly current. Ten primary files and a small date window cannot prove complete topic coverage, particularly when an older governing decision was not selected. Search related older evidence within the five-follow-up-read budget, reserving check and verification reads; stop when any work budget is exhausted. No evaluation dataset, model provider or quality guarantee is implied.

## Browser evidence and limitations

`node scripts/living-topic-pages-fixture.mjs`, then `node scripts/living-topic-pages-smoke.mjs` with an already-installed Playwright package on PATH, exercised unchanged/changed/missing states, source navigation, exact citation survival after a human edit, non-Dream scope, read-only checks and explicit topic handoff. Six screenshots at `/tmp/jumpybrain-living-qa/{light,dark}-{1280,390,320}.png` were inspected; source text/status/navigation fit the viewports without horizontal page overflow. Canonical latest-change and open-question headings remain visible above the disclosure. The reader sees source titles rather than opaque IDs when available.

T3 preview was attempted first: status/open/navigation succeeded, but two consecutive snapshot calls returned `Preview automation snapshot timed out after 15000ms.` The repository Playwright runner was then used without installing packages. These runs do not validate physical devices, assistive technology, Safari/Firefox, native companion folder/Keychain UI, or arbitrary external-agent output quality. Hosted/local parity here is the same local engine behind authenticated HTTP on loopback, not a live VPS deployment.

## Companion integration evidence

Final integration review found the companion gateway's explicit memory-route allowlist omitted the new source-check POST. The implementation adds only that exact operation as read-only. Real gateway tests forward both saved-page and draft checks through local and remote `allowWrites:false` profiles, compare fingerprints/results and unchanged source/page bytes/mtime, and reject unauthenticated/wrong-Origin/stale-generation/unknown-tab requests. GET and nearby operation paths remain unsupported; note writes still fail on both read-only profiles. The focused gateway/connections/browser run passed 61 tests. Native OS capabilities remain outside this evidence.
