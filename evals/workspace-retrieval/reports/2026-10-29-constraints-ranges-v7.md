# Natural questions and cited-range reads — retain production

Neither mechanism passes the [frozen diagnostic screen](../CONSTRAINT-RANGE-EXPERIMENT.md). Natural-question classification recovers evidence, but raises interaction tokens by **11.98%**, above the 5% cap, and cannot safely distinguish every exclusion or identifier. Cited-range reads lose ten required units with no complete-task gains. The combination retains those losses. Production and default evaluator reads stay unchanged.

The accepted comparison uses **248 fictional documents / 168 tasks**, preserving 152 earlier cases and adding 16 same-author diagnostics. These are source-specific evidence-span scores, not answer accuracy. A single agent authored the policies, new fixture, questions and rubric and reviewed the source evidence. This is not independent confirmation. An excluded attempt exposed malformed fixture IDs; the corrected retry retains identical questions, clauses and source bodies, and all cases are now seen.

| Arm | Initially complete | Complete after reads | New diagnostics complete | Interaction tokens | Reads |
| --- | ---: | ---: | ---: | ---: | ---: |
| unchanged production control | 77/168 | 100/168 | 4/16 | 458,055 | 420 |
| natural-question classifier | 91/168 | 114/168 | 10/16 | 512,951 (+11.985%) | 474 |
| cited-range reads | 77/168 | 90/168 | 4/16 | 436,990 (−4.599%) | 420 |
| combined | 91/168 | 104/168 | 10/16 | 491,319 (+7.262%) | 474 |

All retain five compact results, at most three distinct hash-guarded reads, 8,192 bytes per response and 32,768 response bytes overall. Every request, response and error is included in token accounting. Policies inspect only public query text or returned passages/handles, never gold, rich search or hidden source bodies.

## Natural-language mechanism and limits

The evaluation-only amendment recognizes questions beginning with a listed interrogative/auxiliary and ending with a question mark. It treats lowercase negation as content and splits alphabetic hyphenated words for lexical variants and the constraint probe. Original query text remains in ranking, requests and recall. Other existing constraint checks remain active; no production module or semantic behavior changes.

Eighteen previously empty packets become nonempty. Fourteen become complete: eight retained tasks and all six new natural-question cases. Twenty-nine individual required units are gained with zero lost units. Some repaired packets remain incomplete: Cedar discovery gains no required unit; Juniper multi-source and Orbit rationale/current gain units without satisfying every requirement. The affected orientation/current/multi-source/rationale slice improves 47/88 → 58/88, but the fixed total-token gate fails. Fifty-four additional reads accompany the eighteen repaired packets; the fixed evaluator does not use gold to stop after sufficient snippets.

Same-agent source review checked all gained units. Harbor and Pedalbrook preserve explicitly unknown approvers; a newer proposal is not approval. Orbit historical retrieves the original plan within its date bound, distinct from current approval. Meadow and Selkie retain proposal-versus-approved scope. Patchbay restores both copy integrity and publication consent. Kilnwick preserves coordinator authority and material limits. New seed-library and telescope cases recover the stated reason, scope and limits of a key-holder suggestion. Bellwether's question says “untrained night observers,” while its source specifically governs lending and solo night collection; that broader wording is another reason to treat a span gain as scope-bound evidence rather than independently established answer entailment.

All six new explicit phrase/uppercase `NOT`/leading-minus controls remain byte-identical **and empty** in every arm. Thus they show no changed packet, not successful positive phrase or exclusion retrieval. Compiled-hook tests additionally verify raw syntax preservation for these forms, filters, paths, quotes and mixed alphanumeric identifiers.

Supplemental query-only adversarial probes, recorded separately from quality scores, expose remaining ambiguity. “Which Thistledown notes can I find without picnic material?” is reclassified as unconstrained and generates positive picnic variants. `AB-CD` is split despite potentially being an exact identifier. Uppercase `EXCLUDE` remains constrained but an accompanying alphabetic hyphen is normalized. These probes are not scored answer failures, but rule out treating this heuristic as a proven general natural-language parser. No policy was retuned after outputs.

## Cited ranges, source losses and long documents

The cited arm keeps baseline source order and selects the same first three distinct available handles. Each read starts eight lines before the first visible citation, at minimum line one, with no explicit end line. It follows neither source links nor continuations and adds no reads.

Ten complete tasks lose one unit each; the combination loses the same units. Six are source-specific alias-binding units (`Nightjar`, `Mudlark`, `Glasswing`, `Copperleaf`, `Emberplate`, `Softbell`) whose YAML declarations disappear when a read starts after frontmatter. These are stricter source-binding diagnostics, not independent judgments that every answer would be wrong.

Four losses remove substantive scope restrictions in Meridian, Estuary, Vellum and Quartz ranking cases: training cabinet versus occupied vaccine storage, closed inlet versus public beach, practice sheets versus original manuscripts, and technical rehearsal versus ticketed performance. For example, Meridian's first citation is at lines 50–52; starting at line 42 misses both occurrences of the precise cabinet restriction at lines 12 and 38. The surviving approval ledger still denies public-use approval, but does not restore the specific operating boundary. Generic disclaimers cannot replace every required qualification.

Both new handbooks are about 36.9 KB. Valid guarded reads demonstrate the intended late-document mechanism: Thistledown's first excerpt is lines 203–215; a line-one read returns 1–58 with continuation line 59, while the cited read returns 195–261. Bellwether shows the equivalent late section. All four new long-document tasks already have their required clauses in compact snippets, so wider context yields no additional complete task. The padded neutral records are a mechanism diagnostic, not diverse realistic large-workspace evidence. Automatic continuation consumption remains untested. Token savings from cited reads do not compensate for the ten unit losses.

## Verification and operational record

Two accepted clean controls reproduce all 168 non-timing score/cost/source-selection records, requests and serialized responses exactly: 100 complete packets and 458,055 tokens each. Raw rich search contains the expected per-run absolute root; the audit verifies that root and normalizes only it and timing for full packet comparison. The post-run auditor correction and both hashes are recorded in the [freeze map](2026-10-29-constraints-ranges-v7.freeze.json); it changes no policy, scoring, source or cost. Its root-normalization regression rejects unexpected roots and actual query/evidence drift.

The full audit checks **840 packets, 3,938 excerpts and 2,208 expansions**, with zero range/hash, expansion-error or response-budget failures. All 78 changed unit/arm rows (29 natural gains, ten range losses and their combined counterparts) were reviewed against canonical clauses and shown ranges. This remains same-agent review. The [compact record](2026-10-29-constraints-ranges-v7.json) contains the full changed-unit ledger.

- Accepted full `npm test`: 1,469 tests; 1,468 passed, one opt-in skip, zero failures (202.464 s). Final focused checks: 13/13, including a post-run auditor regression. No product changes followed the full test run.
- Package dry run: 518 paths, all 231 required installable files validated, zero eval assets. No release note because product behavior is unchanged.
- Accepted input freeze: 294 files, digest `fcabd38835737f81a550b129fbeded8734a1154ecd367f68ed6eaba2b1e0348b`; source/compiled runtime: 622 files, digest `98f140de562818f65f7e80b3d73554c7f84b28d0dc47ea8ecabf636ffdbb8f0d`, identical to v6. Every quality process verifies its frozen bytes at completion. QMD 2.8.3 lexical and pinned tokenizer; downloads/native builds blocked. Concurrent quality timings are observational, with no cost-acceptance, semantic, Linux/VPS or answer-agent claim.
- Excluded first attempt: eight new IDs omitted the required `mem_` prefix, so their expansion handles were unavailable. Preserved all original inputs and three completed arm runs, the first control pass and interrupted second control pass. Corrected only ID scalars plus the generator; source bodies, questions, rubrics and policies match exactly. Added production ID validation and pre-index duplicate/invalid-ID checks. No first-attempt metric is used in the table.
- Initial full tests overlapped that attempt and failed an installer copy on a disappearing eval SQLite WAL: 1,466 passed, one failure, one skip. The accepted full rerun ran with all evaluation jobs stopped. Do not overlap installer tests with mutable evaluation roots; no installer fix is included here.

Corpus growth is separate from the arm comparison. At the same runtime, retained-case completeness changes from v6's 95/152 to 96/152: Meadow rationale now displays its research source in the fifth compact slot instead of its brief. No old required unit is lost. The added corpus changes ranking despite unchanged old sources; this is not a product gain and does not justify comparing 114/168 directly with 95/152.

## Reproduction and next boundary

Restore the exact accepted input/runtime maps from the external raw archive for byte-identical historical execution. The committed post-run auditor differs only in the declared root normalization. All policies and scoring remain those frozen before the ID-corrected retry.

```sh
npm run eval:workspace -- --suite constraint-range --arm baseline --runtime-root /absolute/frozen/runtime --repeats 1 --name constraints-v7r-control
npm run eval:workspace -- --suite constraint-range --arm baseline --runtime-root /absolute/frozen/runtime --repeats 1 --name constraints-v7r-replica
npm run eval:workspace -- --suite constraint-range --arm natural-question --runtime-root /absolute/frozen/runtime --repeats 1 --name constraints-v7r-natural
npm run eval:workspace -- --suite constraint-range --arm read-cited --runtime-root /absolute/frozen/runtime --repeats 1 --name constraints-v7r-cited
npm run eval:workspace -- --suite constraint-range --arm natural-question-read-cited --runtime-root /absolute/frozen/runtime --repeats 1 --name constraints-v7r-combined
node evals/workspace-retrieval/audit-constraint-range.mjs /path/to/control /path/to/audit.json /path/to/replica /path/to/natural /path/to/cited /path/to/combined
```

A subsequent separately frozen investigation should distinguish content negation from retrieval exclusions and exact identifiers, include nonempty explicit-syntax controls, and test bounded section/range reads that preserve upstream restrictions. It needs independently authored confirmation and long-document tasks whose snippets are genuinely insufficient. This investigation does not adopt a parser or automatic read policy. No installation, push, version bump or release.

External raw archive: `/Users/monkey/dev/jumpyBrain-retrieval-evaluation/workspace-constraints-ranges-2026-10-29/2026-10-29-constraints-ranges-v7.tar.gz`, 42,987,714 bytes, SHA-256 `f1059576b7f960bff80e61c1dbe8963e2cd987ece55363d1e931837d70a0b35a`. Verified all 1,210 frozen input/runtime files across 6,410 archive members. Retains accepted and excluded runs, exact snapshots, source ledger and verification logs; excludes derived memory roots and private content.
