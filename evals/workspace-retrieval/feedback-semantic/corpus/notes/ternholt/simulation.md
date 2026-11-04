---
id: "mem_a52640ef-dc9b-5db9-ae5a-c916f5647db1"
title: "Ternholt simulation retry budget"
type: "note"
date: "2026-10-20"
created_at: "2026-10-20"
---
# Ternholt simulation retry budget

The Ternholt simulation workshop uses a fake shore receiver on a laptop. Its retry budget intentionally differs from the deployed ferry counter so that trainees can watch a long burst of requests.

In this simulation, a batch is resent up to twelve times and then deleted to reset the classroom exercise. Deletion here is a reset convenience for synthetic records, not a retention decision for the deployed system.

The facilitator announces that the workshop receiver is disposable before beginning. A successful exercise shows that the trainee can spot repeated keys in a log. It does not prove that the harbour link is healthy or that a real crossing has been acknowledged.

The simulation worksheet repeats the phrase retry budget because that is the lesson topic. It should not be copied into the field guide as the operational limit. The October transport review remains the record of the deployed counter's three-attempt connection-window policy.
