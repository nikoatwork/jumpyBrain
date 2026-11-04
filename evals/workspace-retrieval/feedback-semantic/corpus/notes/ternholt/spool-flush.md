---
id: "mem_c7095d6e-4acf-5350-8d58-90af1b111c9d"
title: "Ternholt spoolFlush operation"
type: "note"
date: "2026-10-09"
created_at: "2026-10-09"
---
# Ternholt spoolFlush operation

The Ternholt ferry counter records passenger totals during crossings and forwards them when the harbour link becomes available. Its local queue can contain several unacknowledged batches after a radio interruption.

In Ternholt, spoolFlush resends queued counter batches using the original batch key; only a matching shore acknowledgement removes a batch from local storage.

An empty request response is not a matching acknowledgement. The counter retains the batch when the response is missing, malformed or refers to another key. The shore receiver deduplicates by that original key, so a retry should not create another passenger total.

This operation moves records; it does not erase firmware, format a card or update the screen. The similarly named spoolFlash operation belongs to the maintenance display and has a different contract. The release checklist requires the two identifiers to remain distinct in the operator guide.

The queue survives an application restart. Recovery after loss of electrical power was tested separately and is not inferred merely from this interface description.
