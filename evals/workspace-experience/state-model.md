# Observable state model v1

Use these dimensions at checkpoints; do not execute their full Cartesian product.

| Dimension | Values/examples | Evidence boundary |
| --- | --- | --- |
| Location | current note / other note / search / board | Exact selected destination and run-owned note ID |
| Publication | pending / confirmed / failed / uncertain | Canonical receipt/hash; visible Saved is a claim to check |
| Draft | absent / private / durably retained / durability unknown | A saved baseline can coexist with an unsaved draft |
| Recovery | unnecessary / review required / comparing / resolved | Dismissal does not discard the draft or remove recovery access |
| Activity | viewing / editing / generating / absent / unknown | Presence describes current scoped awareness, not task completion |
| Agent work | running / finished / interrupted / unknown | Successful CLI EOF/finish or explicit cancel; absence is not finish |
| Connection/access | connected / reconnecting / offline / read-only | Auth/connectivity and write consent are different |
| Index | fresh / pending / stale / failed / unobserved | Canonical save, recent-save UI cache and indexed search differ |

## Selected transitions

- Typing → pending → confirmed → reopen. Verify title/body and actor-specific Undo/Redo.
- Agent starts → visible generating → confirmed chunks while active → successful finish. Observe activity termination independently of canonical content.
- Agent cancellation → retained partial output → no completed-work claim. This does not establish uncertain human-save recovery.
- Agent updates another note while human searches/edits → current destination/focus/content stable → updated note discoverable → Back returns correctly.
- Disjoint human/agent edits → both survive → human Undo leaves agent text. Preserve selection/scroll during same-note reconciliation; do not require exact caret restoration across different documents.
- Confirmed note/index pending → eventually discoverable or honest degraded state. Capture before any assisted index repair; local reads may repair, hosted reads do not.
- If safely induced: unconfirmed draft → attempted navigation blocked → dismiss repeated error → recovery still reachable → explicit comparison/choice → confirmed publication. Never simulate this by resetting shared infrastructure.
- Brain switch → no stale status/actions from previous scope. If a save is unconfirmed, the navigation barrier preserves it.

For messages inspect onset, continuation, finish/interruption, note switching, return and dismissal. Check visible and accessible wording when available. A notice must identify the correct scope, avoid focus theft and avoid replaying dismissed identical errors. Missing desired completion discoverability is a UX finding, not proof that a workspace-wide completion feature already exists.
