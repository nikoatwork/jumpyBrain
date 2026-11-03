# Experience rubric v1

Functional checkpoints are independent of UX ratings. Data loss, wrong-destination writes, false Saved/completion claims or lost drafts cannot be averaged away by high UX scores.

Rate each observed dimension separately; no composite UX percentage in v1:

| Rating | Anchor |
| --- | --- |
| 0 | Blocked or misleading; cannot complete safely |
| 1 | Substantial confusion, repeated detours or assistance required |
| 2 | Completed with a specific observable friction |
| 3 | Clear unaided completion; expected feedback and continuity observed |
| not_observed | Insufficient evidence, not a zero or a pass |

Dimensions: discoverability; feedback clarity; navigation continuity; writing continuity; recovery clarity. Cite event/evidence IDs and describe the exact friction. Distinguish prior product/source knowledge from UI discovery and distinguish computer-tool limitations from product defects. Record hints, shell repair, retries, restart and diagnostic intervention. Eventual success after assistance remains assisted.

The executor can self-score for diagnosis, but disclose that relationship. Another model instance reviewing the same trace adds review, not independent human usability evidence. Agent-operated editor input is simulated human-side interaction. Agent elapsed time is not human task time. Record disagreements rather than silently picking the nicer score.

For improvement, record expected effect and protected neighboring behaviors before the fix. Compare matched target lanes and unchanged eval inputs. Report lost/gained checkpoints individually. A live shared corpus, changed app/CLI/server versions, changed preferences, missing evidence or learned navigation routes limit comparisons. Do not infer semantic search capability from lexical success or index metadata.
