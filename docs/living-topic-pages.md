# Living topic pages

A living topic page is an ordinary Markdown Dream page (`dream: true`). Your external agent chooses and writes the synthesis; jumpyBrain supplies bounded evidence, guarded saves and current-source version checks. No model, scheduler, proposal database or retained revisions are added.

Name a topic or select an existing Dream page explicitly. Use related recall (including older decisions) plus a small Dream window. Several matching pages are an ambiguity to report, not permission to merge/delete or create another overview. The hosted browser Dream handoff accepts a topic or canonical page ID and carries the same bounded scope to your agent. General dreaming still works without that optional selection. Local users use an explicit CLI root; the companion does not invent a local-root handoff. Existing target/write/index authorization and read-only policies apply.

## Canonical page example

Keep an evidence period and a synthesis date separate from source-check time. Preserve prior plans, unresolved disagreements and human commitments. A newer suggestion does not supersede a confirmed decision merely because it is newer.

```markdown
Synthesis date: 2026-10-12. Evidence period: October 1–12 (UTC).

The confirmed launch is October 27. [October 12 decision](mem_<uuid> "sha256:<full 64 lowercase hexadecimal characters>")
The earlier October 20 plan remains historical context.
Human contribution: notify the customer before announcing the release.

## Latest substantive change
October 12 confirmed October 27, replacing the earlier October 20 plan.

## Open questions
Who owns customer notification?
```

Replace placeholders with actual source IDs and full-file `contentHash` values from `show` or Dream evidence. Put references beside the claims they support. Fingerprints identify canonical file bytes, including frontmatter; never hash a truncated packet prefix. Prefer unique canonical IDs. For ID-less sources use an exact canonical root-relative path such as `decisions/launch.md`, or `../decisions/launch.md` relative to the topic file. Do not stamp IDs just to synthesize. No basename/title guessing occurs in version checks. Existing wiki/reference-style/unversioned links remain normal navigation but receive `not_checked` rather than inheriting another citation's fingerprint. The minimal scanner ignores fenced/inline/indented code; it is not a complete CommonMark parser.

## Explicit source checking and publication

Use the same root or explicit hosted target on every command. Remote commands replace `--root "$ROOT"` with `--target-url "$URL"`, with credentials supplied separately through `JUMPYBRAIN_API_KEY`.

```sh
# Read an existing Dream page before drafting; retain its exact content and contentHash.
jumpybrain show --root "$ROOT" --id "$ID" --json
# Check a draft immediately before publishing. Use its actual root-relative file.
jumpybrain dream --root "$ROOT" --check-sources --draft --page-file pages/release.md --json < revised.md
# Existing guarded publication; HASH belongs to the destination, not a source.
jumpybrain update --root "$ROOT" --id "$ID" --if-match "$HASH" --json < revised.md
# On-demand current-version check of an existing dream: true page.
jumpybrain dream --root "$ROOT" --check-sources --id "$ID" --json
```

Creation checks can use body-only stdin with the intended `pages/topic.md` path, followed by ordinary `remember --type page --dream --title ...`. Prefer ID references when the final creation filename is not yet known. Checking reads data; it grants no publishing permission and does not convert non-Dream human pages. It is an explicit workflow step, not a mandatory write ACL. Ordinary whole-page editing remains available; retain human meaning and stop/report ambiguity when reconciliation is unclear. A stale destination hash requires reread and reconciliation; source checks are separate. Skip writes/indexing for a semantic no-op. An exact unchanged-content update also returns `unchanged:true`, preserving bytes/edit time and leaving hosted index bookkeeping alone; it still rejects stale destination hashes. Cosmetic changes are not automatically detected as semantic no-ops.

Check results contain `checkedAt`, the checked page hash/file (ID for a saved page), `coverage`, `sources`, omission/unread counts, limits and warnings. Each reference returns one of:

- `unchanged`: current full-file bytes match the cited fingerprint; the claim may still be wrong.
- `changed`: current bytes differ; reread and reconsider within budget or leave the page unchanged. Change does not automatically refute a claim.
- `missing`: a complete source pass found no matching canonical target. Retain historical claims only with an explicit source limitation.
- `ambiguous`: several matching targets or a duplicate canonical ID prevent safe resolution.
- `not_checked`: no supported fingerprint/target, or incomplete source discovery prevents reliable uniqueness/absence checks.

`coverage: complete` means the returned references were classified in this pass, including changed/missing/ambiguous outcomes. It never means comprehensive topic coverage or verified truth. Empty/unversioned pages and omitted/unread sources are partial. Checks never rewrite Markdown or persist a checked-at timestamp. The companion gateway explicitly allowlists this POST as observational for both local and remote profiles, including read-only profiles; generation/tab/Origin/auth guards still apply. The browser Sources disclosure performs the same authenticated read-only check on the saved page, shows current-source navigation where a unique ID exists, and clears stale results after page/draft/credential changes. Save pending drafts before checking. Latest change and questions remain visible canonical headings in the editor; standard Markdown fingerprint links stay literal and survive edits.

## Bounds and accepted limitations

The version-check pass accepts at most 64 KiB of page text, returns 32 distinct references, attempts 500 canonical source files, accepts at most 256 KiB per source and spends at most 4 MiB on successful/reserved source reads. Failed attempts conservatively consume their reserved byte allowance. The version pass scans canonical files, not only cited targets. Any unreadable/oversized unrelated file, a corpus exceeding 500 files, or exhaustion of 4 MiB makes uniqueness/absence uncertain, so **all versioned references** conservatively become `not_checked`; it cannot silently classify an incomplete scan as current. Large pages are rejected. Directory enumeration and existing saved-page ID discovery reuse canonical lookup and are not a corpus-size, total I/O or elapsed-time bound; the selected-page lookup can read whole files before the bounded version pass. Requests and response processing also retain normal transport limits.

Agent work limits remain ten primary sources, 8,000 bytes each/40,000 total body bytes, five follow-up read commands (checks and verification included), two successful page mutations and ten minutes best effort. Reserve check/verification reads; reduce writes rather than overrun the scope. These are work limits, not a model-token/cost cap. Read omissions and fallback dates explicitly.

Sources may change after checking and before/after saving. No multi-file lock, atomic source/page snapshot or old-version viewer exists. A fingerprint cannot reconstruct deleted or edited bytes. Destination guards have the existing cooperating-writer/filesystem limits and cannot assess semantic preservation. Semantic examples are reviewed in [the bounded walkthrough](../deep-dives/living-topic-pages/review.md); deterministic tests establish policy/transport behavior, not arbitrary agent synthesis quality.
