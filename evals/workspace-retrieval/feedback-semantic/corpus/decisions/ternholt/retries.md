---
id: "mem_48390d98-5473-5e1a-898e-19dfaf46ef51"
title: "Ternholt bounded retry budget"
type: "decision"
date: "2026-10-19"
created_at: "2026-10-19"
---
# Ternholt bounded retry budget

The transport review limited reconnect work so that a counter with a long backlog would not monopolize the narrow harbour link. This decision applies to the deployed ferry counter.

Ternholt permits at most three resend attempts per queued batch in one connection window; an unacknowledged batch stays stored for a later window rather than being discarded.

The fourth pending batch waits for the next window if the available transmission time has already been consumed. A retry budget limits effort, not the obligation to retain a record. The counter reports a pending count so that the operator can distinguish deferred delivery from an empty queue.

The reviewer rejected an unlimited immediate loop after watching it prevent the status request from completing. The accepted budget is a local transport choice for this counter and is not presented as a universal networking rule. A new deployment with a different link would need its own evidence before changing the bound.
