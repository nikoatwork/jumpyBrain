# Feedback semantic fixture

Thirty original fictional Markdown pages, eighteen reserved questions and twenty-eight source-specific evidence units, authored by a separate fixture agent before candidate runs. The four contexts have different workflows: Ashcombe repair queues, Ternholt ferry-counter transport, Dunmere schoolwear collection and Rookfen film presentation. These are invented scenario facts, not practical repair, maritime, software durability or licensing advice.

Only `corpus/` may be indexed. `queries.json` uses the existing public query schema. `rubric.json` uses the existing scoring schema and remains outside indexed and executor inputs. `PROTECTED-UNITS.json` repeats the source-bound units for a predeclared nonregression audit; it is scoring-only too. `CONSTRAINTS.json` specifies manual constraint and misleading-source checks that required-span scoring alone cannot perform. Neither file may choose candidates, expansion order or follow-up reads.

The author read the product vision, baseline protocol, discovery experiment contract, feedback units 2/3 and old fixture/schema examples. The author did not inspect proposed retrieval implementations, model outputs, candidate pools, run artifacts, private reported queries or private memories. No retrieval, model, index, benchmark or GUI workload ran during authorship. Questions, sources and first rubric share one author. Agent separation is process separation in a shared workspace, not a blinded user study or independent human adjudication. Once results are inspected, all these cases become seen controls.

## Case inventory

| Case | Purpose | Required sources / important boundary |
| --- | --- | --- |
| ashcombe-natural-not | Natural lower-case negation | Observation plus accepted replacement; festival practice does not govern Saturday repairs |
| ashcombe-contraction | Same substantive intent with can't and person's | Same complete cause and replacement; punctuation must not erase the question's meaning |
| ashcombe-lowercase-hyphen | Ordinary walk-in and drop-off words | Assessment only, Saturday only, no completed-repair guarantee |
| ashcombe-quoted-phrase | Explicit quoted amber card | Exact phrase plus acknowledgement and limited reservation |
| ternholt-exact-title | Known-title navigation | Canonical release checklist |
| ashcombe-historical | Evidence date versus later edit | September plan, September 26 intention; edited October 29 |
| ashcombe-warranty-unknown | Bounded unknown | Unsigned poster; no named approver in the retained records |
| ternholt-camelcase | Exact spoolFlush identifier | spoolFlash display routine is a near-match distractor |
| ternholt-ticket-id | Exact TRN-418 ticket | TRN-481 is a different ticket; counter reset is not the accepted fix |
| ternholt-literal-path | Literal path navigation | Exact canonical path, with no invented path-field syntax |
| ternholt-minus-exclusion | Explicit -simulation input | Deployed three-attempt retention policy; classroom twelve-attempt deletion is excluded |
| ternholt-uppercase-not | Paired uppercase NOT input | Same source boundary as the minus case; syntax support must be established independently |
| dunmere-unconstrained-paraphrase | Unnamed substantive discovery | Public means-testing barrier; private appointment remedy still depends on stock |
| rookfen-unconstrained-paraphrase | Unnamed substantive discovery | Contrast remedy for captions; audio description remains absent |
| dunmere-current-proposal | Current decision versus newer suggestion | Delivery unapproved; a pending size is no delivery promise |
| rookfen-streaming-unknown | Bounded unknown and narrow permission | Private short-clip permission cannot authorize the feature premiere |
| ternholt-recovery-qualification | Multi-source technical evidence | Tested post-write reboot only; earlier write durability unverified; original batch identity retained |
| ashcombe-natural-without | Natural language without | Queue reservation cannot decide an unassessed repair outcome |

The two discovery questions deliberately omit their project names and syntax controls. Dunmere maps everyday wording about school clothes, discretion and money troubles to schoolwear, public means-testing and individual appointments. Rookfen maps following speech over bright moving images to captions, luminous wardrobe panels and charcoal backing. These are fresh substantive paraphrases, not a query that merely renames a project. They still contain some ordinary lexical overlap; they are not a zero-overlap semantic proof. Each requires a qualification from a second source rather than rewarding a vaguely similar page.

The fixture is modest: mostly 130–200-word notes, not large documents or an independently sampled production corpus. It tests discovering and supplying evidence, not autonomous answer generation, actual abstention or comparative efficiency.

## Reproduction and integration

Run `python3 evals/workspace-retrieval/feedback-semantic/build.py` to reproduce authored corpus/query/rubric bytes, and `python3 evals/workspace-retrieval/feedback-semantic/verify.py` to check the freeze and source contracts. These commands use only Python's standard library and perform no product or model calls. `build.py` does not alter the freeze manifest. A post-freeze regeneration must reproduce its hashes exactly.

The existing runner has a fixed suite allowlist and cumulative input counts, so merely passing a new suite name will not integrate this fixture. Its owner must add the suite's corpus to the disposable input root, append these public queries with duplicate-ID checks, and merge this rubric only in the scoring process. Add every suite file to the run's input hash map and record the unchanged old controls separately from these eighteen fresh cases. Keep the current rich-search/compact-recall/first-three-guarded-expansion policy and response caps from `../PROTOCOL.md`; gold must never select a read.

All nonhistorical questions explicitly use evidence `to: 2026-10-31`. The historical question uses `to: 2026-09-30` with chronological ordering. These dates define a stable fixture snapshot, not claims about later reality. UUIDv5 IDs are stable for the canonical paths and independent of machine paths. Original plans retain their evidence dates after later editing.

See `PROTOCOL.md` for freeze boundaries, protected units and pre-output ambiguities. `AUTHOR-FREEZE.json` identifies the authored bytes before any quality output; a complete experiment additionally needs a separate runtime/runner/policy/backend/model freeze and fixed numeric adoption gates.
