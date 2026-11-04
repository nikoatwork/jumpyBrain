---
id: "mem_5c8bd7fc-64fd-5cfb-bc17-47685561e5bc"
title: "Ternholt interrupted power replay"
type: "note"
date: "2026-10-21"
created_at: "2026-10-21"
---
# Ternholt interrupted power replay

A technician interrupted the counter supply after its local write and before a shore response. The fixture contained two synthetic batches with distinct original keys. The receiver had accepted one but its response had not reached the counter.

The Ternholt power-cut trial recovered both persisted batches after reboot, but it did not test loss of power during the initial local write; durability at that earlier point remains unverified.

After reboot the transport resent the same keys and the receiver's ledger still held one entry per key. The test log retained the captured acknowledgements. A visible recovery of the status screen alone would not have supplied this evidence.

The result supports that tested interruption point only. It cannot establish that every storage device or every moment of an interrupted write is safe. A future test should cut power at the start of the write, with a recoverable copy of the fixture retained before doing so. No such result is in this workspace.
