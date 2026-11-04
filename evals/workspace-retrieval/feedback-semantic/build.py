#!/usr/bin/env python3
"""Reproduce authored fixture bytes; never read runtime, candidates or run outputs."""
import json
from pathlib import Path
import uuid

HERE = Path(__file__).resolve().parent
NAMESPACE = uuid.UUID("1d274ad6-c1cf-42b3-ad17-cdb0b2957f26")
PAGES = {}


def page(path, title, date, body, *, created=None, updated=None):
    PAGES[path] = (title, date, created or date, updated, body.strip())


page("notes/ashcombe/service.md", "Ashcombe repair mornings", "2026-10-02", """
Ashcombe offers a Saturday repair table for small household items at the former ticket office. Eleni manages the queue; the bench volunteers decide whether they have the equipment and skill to examine an item. The service aims to save a useful object, rather than promise a repair for everything brought through the door.

Visitors register at the entrance before carrying an item to a bench. The registration slip describes the symptom in the visitor's words. A volunteer can help write it, but should keep an uncertain account uncertain. An intermittent fault witnessed only at home is different from a fault reproduced on the table.

The first month is a trial with two benches. The closing review will count people who left before an assessment as well as completed examinations. A shorter queue could mean that people gave up, so waiting time alone is a poor success measure. Eleni keeps the service log separate from publicity photographs.
""")
page("findings/ashcombe/queue-audit.md", "Ashcombe waiting area observations", "2026-10-05", """
Eleni observed the waiting area during two repair mornings. Visitors could sit behind the coat rack while a bench became free. The machine nearest that rack was louder during stitching than during the volunteer briefing.

At Ashcombe, the sewing machine masked spoken names and the coat rack hid the bench entrance; three seated visitors missed a turn despite remaining in the building.

The observer checked the departure slips before describing these as missed turns. Two other visitors had intentionally left to collect a replacement cable and were not counted. The sample describes those mornings and does not estimate how often this happens throughout the year.

Staff tried moving a chair but it narrowed the entrance. A visible acknowledgement seemed worth testing because a louder announcement could still fail while the machine was running. The observation itself does not approve a permanent queue design; that choice belongs in the dated queue decision.
""")
page("decisions/ashcombe/queue.md", "Ashcombe visible turn decision", "2026-10-08", """
The service review accepted Eleni's proposal after the waiting area observations and a short rehearsal. This is the queue decision for ordinary Saturday repair mornings.

Ashcombe gives each waiting visitor an amber card, displays the matching number at the bench, and waits for a visible acknowledgement before passing that turn.

The walk-in trial covers small household repairs on Saturday mornings only; an amber card reserves an assessment turn, not a successful repair or a place at another event.

A bench volunteer can ask Eleni to pause the queue when an examination overruns. The card stays with the visitor until the volunteer has acknowledged it. If somebody has stepped outside, Eleni records a missed turn and offers the next free slot rather than silently counting the visit as served.

This arrangement starts on October 10. It replaces the spoken-name-only plan, while leaving the technical assessment with the bench volunteer. The trial review may recommend another method, but a recommendation would need a new decision.
""")
page("notes/ashcombe/first-plan.md", "Ashcombe original waiting plan", "2026-09-18", """
The September Ashcombe plan used spoken names alone and aimed to open on September 26; no numbered card or visible acknowledgement was planned.

This was written before the machine and coat rack arrived. The room sketch put all waiting chairs in direct view of the benches. Eleni expected one volunteer at the entrance to hear a name and guide the visitor across the room.

The September 26 opening did not happen because the keys arrived late. The plan remains useful evidence of the original intention, rather than instructions for the October trial. An October spelling correction changed the room label but did not revise the September proposal or its evidence date.

The draft also suggested a paper tally of completed repairs. It did not define how to record a person who left before anyone inspected the item. That gap was one reason to observe actual waiting rather than treat the room sketch as a tested service design.
""", updated="2026-10-29")
page("findings/ashcombe/trial.md", "Ashcombe October trial notes", "2026-10-17", """
The second October morning used the visible card arrangement. Eleni saw seven acknowledged turns and one visitor return after leaving to buy a fuse. Two items were assessed and returned unrepaired because the volunteers lacked the necessary parts.

The Ashcombe October check retained the Saturday walk-in assessment trial; it did not authorize weekday drop-offs or guarantee completed repairs.

The small count cannot establish that the queue problem has disappeared. A visitor who leaves without handing in a departure slip may still be missing from the figures. Volunteers will retain a blank outcome where the later fate of an item is unknown.

One request asked for a collection box at the library. The review recorded that request but did not allocate someone to supervise such a box. The next practical step is a further Saturday observation, not advertising continuous acceptance of household objects.
""")
page("notes/ashcombe/warranty.md", "Ashcombe proposed repair warranty", "2026-10-24", """
An enthusiastic supporter drafted a poster offering a thirty-day warranty after a repair. Eleni put the poster in the proposals folder rather than on the entrance board. No budget for replacement parts accompanied it.

The Ashcombe records name no approver for the proposed thirty-day repair warranty; the poster remains an unsigned draft awaiting the service committee's decision.

The bench log records what was examined and what work was attempted. It is not a guarantee that a fault will stay fixed. A successful demonstration before collection does not establish the future reliability of a donated part.

These records bound what can be answered from this workspace. They do not prove that no private conversation occurred. Anyone who needs an authoritative warranty decision should obtain the committee's signed record rather than treat the existence of the poster as approval.
""")
page("notes/ashcombe/festival.md", "Ashcombe festival demonstration queue", "2026-10-22", """
The Ashcombe festival demonstration is a separate event in the sports hall. Its stage has an amplified announcer and no working sewing machine beside the audience. The organizer uses spoken names because a steward escorts each participant from the front row.

For the festival demonstration only, Ashcombe calls names through the loudspeaker and lets the next volunteer on stage after the steward signals readiness. This arrangement was accepted by the festival organizer for the stage rehearsal, not by the Saturday service review.

The demonstration uses preselected objects and does not accept walk-in repairs. A spectator's festival wristband is an admission token for the hall, not an assessment card for the repair table. The poster says the two activities share a name because the service volunteers will demonstrate their work.

Do not copy the stage timetable onto the ticket-office door. The door remains governed by the ordinary Saturday queue decision.
""")
page("notes/ashcombe/bench-check.md", "Ashcombe assessment before promises", "2026-10-11", """
At registration, a visitor sometimes asks whether an item will certainly be fixed if they wait. A queue volunteer can explain the assessment process but has not yet examined the object.

Ashcombe cannot promise a repair without a bench assessment; the queue volunteer may describe a turn as reserved but must leave the repair outcome undecided.

Eleni asks volunteers to retain the distinction even when the reported symptom sounds familiar. A damaged plug and a failed internal component may produce similar descriptions. The symptom line can quote the visitor without converting the account into a diagnosis.

When a bench declines an item, the log should give the reason that the bench actually supplied. Lack of a part is different from a judgement that an item is beyond repair. An assessment record remains useful even when no repair occurs, and the visitor should receive that explanation when collecting the object.
""")

page("notes/ternholt/spool-flush.md", "Ternholt spoolFlush operation", "2026-10-09", """
The Ternholt ferry counter records passenger totals during crossings and forwards them when the harbour link becomes available. Its local queue can contain several unacknowledged batches after a radio interruption.

In Ternholt, spoolFlush resends queued counter batches using the original batch key; only a matching shore acknowledgement removes a batch from local storage.

An empty request response is not a matching acknowledgement. The counter retains the batch when the response is missing, malformed or refers to another key. The shore receiver deduplicates by that original key, so a retry should not create another passenger total.

This operation moves records; it does not erase firmware, format a card or update the screen. The similarly named spoolFlash operation belongs to the maintenance display and has a different contract. The release checklist requires the two identifiers to remain distinct in the operator guide.

The queue survives an application restart. Recovery after loss of electrical power was tested separately and is not inferred merely from this interface description.
""")
page("notes/ternholt/spool-flash.md", "Ternholt spoolFlash display operation", "2026-10-10", """
Ternholt's maintenance display has a diagnostic operation called spoolFlash. The capital letters are part of its identifier and distinguish it from spoolFlush.

spoolFlash cycles the queue-status lamp through three colours for a technician standing at the counter. It neither resends passenger batches nor waits for a shore acknowledgement. Completing the lamp cycle permits the display test to end; it says nothing about successful delivery of records.

The operator guide once put the display paragraph beside a transport diagram. Reviewers asked for separate headings after a technician assumed that a flashing green lamp meant the queue had drained. The indicator can be green while an old batch is still awaiting a response.

The display routine is available in maintenance mode only. It is safe to repeat the lamp exercise during a disconnected workshop demonstration because no transport records are created by that operation. Its apparent visual success must not be substituted for a checked batch key in a transport report.
""")
page("findings/ternholt/TRN-418.md", "TRN-418 duplicate totals investigation", "2026-10-14", """
TRN-418 was opened after a repeated harbour reconnect appeared to increase the recorded count for one crossing. The technician retained the outgoing packet log and matched its keys to the shore ledger.

TRN-418 in Ternholt traced duplicate totals to a retry that generated a new batch key; the accepted fix retains the original key until acknowledgement and does not reset the passenger counter.

The reproduction used a dropped response after a successful shore write. Sending the same key again produced one ledger entry; sending a replacement key produced two. The fix therefore changes retry identity rather than the numeric value recorded during the crossing.

The investigation is not TRN-481, the display ticket. A display restart may make a lamp look normal while leaving the delivery fault untouched. The verification log records both the key sent and the acknowledgement received, so the observed outcome can be checked without inferring success from the screen.
""")
page("findings/ternholt/TRN-481.md", "TRN-481 stale lamp investigation", "2026-10-15", """
TRN-481 concerns the Ternholt maintenance screen, which sometimes leaves its queue-status lamp red after the lamp exercise ends. The accepted display workaround restarts the screen controller and repeats spoolFlash.

This ticket does not concern duplicate passenger totals. No passenger counter is reset, and no queued batch is removed by the display workaround. The shore ledger remained unchanged during the screen reproduction.

The ticket number differs from TRN-418 by transposed digits. A technician pasted the latter number into an early report, then corrected the heading before the October 15 review. The body of this note records the display finding, not an alternative transport fix.

A green lamp can be useful when checking wiring, but it cannot establish that a matching shore acknowledgement exists. Transport acceptance still requires the release checklist's key-based replay test. The display team has not claimed that a lamp restart solves the retry identity problem.
""")
page("notes/ternholt/release-checklist.md", "Ternholt counter release checklist", "2026-10-18", """
This is the working release checklist for the October counter build. The technician records a result beside each crossing fixture and leaves failures open rather than changing a check into a general sign-off.

The Ternholt release check replays one acknowledged batch and one unacknowledged batch, then verifies that the shore ledger contains exactly one entry for each original key.

Repeat the check after restarting the counter application. Keep the packet capture beside the release note so that an apparently correct screen does not replace the ledger check. A lamp cycle is a separate display check.

The release note should include the tested build identity and the two batch keys. It must not include a real passenger's details. The synthetic crossing labels are sufficient to distinguish the two records during replay.

The checklist governs the counter software acceptance in this fictional workspace. It does not establish harbour approval for deployment on an additional route; that would require a route decision from the operator.
""")
page("decisions/ternholt/retries.md", "Ternholt bounded retry budget", "2026-10-19", """
The transport review limited reconnect work so that a counter with a long backlog would not monopolize the narrow harbour link. This decision applies to the deployed ferry counter.

Ternholt permits at most three resend attempts per queued batch in one connection window; an unacknowledged batch stays stored for a later window rather than being discarded.

The fourth pending batch waits for the next window if the available transmission time has already been consumed. A retry budget limits effort, not the obligation to retain a record. The counter reports a pending count so that the operator can distinguish deferred delivery from an empty queue.

The reviewer rejected an unlimited immediate loop after watching it prevent the status request from completing. The accepted budget is a local transport choice for this counter and is not presented as a universal networking rule. A new deployment with a different link would need its own evidence before changing the bound.
""")
page("notes/ternholt/simulation.md", "Ternholt simulation retry budget", "2026-10-20", """
The Ternholt simulation workshop uses a fake shore receiver on a laptop. Its retry budget intentionally differs from the deployed ferry counter so that trainees can watch a long burst of requests.

In this simulation, a batch is resent up to twelve times and then deleted to reset the classroom exercise. Deletion here is a reset convenience for synthetic records, not a retention decision for the deployed system.

The facilitator announces that the workshop receiver is disposable before beginning. A successful exercise shows that the trainee can spot repeated keys in a log. It does not prove that the harbour link is healthy or that a real crossing has been acknowledged.

The simulation worksheet repeats the phrase retry budget because that is the lesson topic. It should not be copied into the field guide as the operational limit. The October transport review remains the record of the deployed counter's three-attempt connection-window policy.
""")
page("findings/ternholt/power-cut.md", "Ternholt interrupted power replay", "2026-10-21", """
A technician interrupted the counter supply after its local write and before a shore response. The fixture contained two synthetic batches with distinct original keys. The receiver had accepted one but its response had not reached the counter.

The Ternholt power-cut trial recovered both persisted batches after reboot, but it did not test loss of power during the initial local write; durability at that earlier point remains unverified.

After reboot the transport resent the same keys and the receiver's ledger still held one entry per key. The test log retained the captured acknowledgements. A visible recovery of the status screen alone would not have supplied this evidence.

The result supports that tested interruption point only. It cannot establish that every storage device or every moment of an interrupted write is safe. A future test should cut power at the start of the write, with a recoverable copy of the fixture retained before doing so. No such result is in this workspace.
""")

page("notes/dunmere/service.md", "Dunmere schoolwear cupboard", "2026-10-03", """
Dunmere redistributes donated schoolwear through the community hall. Priya coordinates collection slots with two volunteers who sort sizes. The cupboard is open to local households regardless of whether they have previously donated anything.

Families can request a size range by telephone or on paper. The request record avoids comments about income. When an item is unavailable, volunteers may offer to keep the request open, but should not imply that the next donation will contain the right garment.

The hall hosts several unrelated groups. A sewing club works there on Tuesdays and a general second-hand sale takes place once a month. They share the building, not the cupboard's request list or collection procedure. A member of either group has no automatic reason to see who requested clothing.

Priya reviews unmet size requests at the end of the month. Counting only garments handed out would conceal families whose sizes never arrived, so unresolved requests remain in the review.
""")
page("findings/dunmere/privacy.md", "Dunmere collection interview findings", "2026-10-07", """
Priya interviewed six households that had requested schoolwear but never attended the open collection table. Four described the public means-testing conversation as humiliating. They wanted to collect a garment, not discuss household income within earshot of other hall users.

Dunmere's interviews found that the public means-testing conversation deterred families from collecting schoolwear even when suitable sizes were available.

Two other households had transport problems and are not evidence for that particular finding. The interview note separates their accounts so that a private appointment is not presented as solving every missed collection. It also leaves open whether households that never made a request experience the same barrier.

The size list was not the cause identified by those four households. Extra stock might help an unmet request, but it would not by itself change the public conversation that the interviewees described. This note recommends a different handover procedure; it does not record its approval.
""")
page("decisions/dunmere/collection.md", "Dunmere private collection decision", "2026-10-12", """
The cupboard review accepted a change to the handover procedure after Priya's interviews. The decision starts on October 16 and covers schoolwear from the cupboard.

Dunmere now offers individual collection appointments without an income declaration; a requested size is held only after Priya confirms that a matching garment is actually in stock.

The volunteer confirms the slot directly with the household instead of posting a named list in the hall. An unfilled size request stays pending. Appointment availability is not a promise that a garment will arrive by a particular school day.

The decision does not change the general second-hand sale or the sewing club. Those activities have different organizers. The cupboard will review collection attendance after four weeks, while preserving the distinction between privacy problems, transport problems and unavailable sizes.

No income information needs to be inferred from a family's choice of appointment. The point is to remove a public explanation, rather than create a new label for people who use the cupboard.
""")
page("notes/dunmere/extension.md", "Dunmere delivery extension proposal", "2026-10-26", """
A volunteer suggested delivering requested garments after evening work shifts. Priya recorded the idea because the interview file includes two households that had transport problems. No driver rota or insurance arrangement accompanied the suggestion.

The Dunmere home-delivery suggestion is unapproved as of October 26; confirmed individual collection appointments remain the accepted service, and an unfilled size request is still pending.

The proposal does not cancel appointments already confirmed with families. Volunteers should not mark a request delivered merely because a household says a doorstep handover would be useful. A delivery record would need an actual agreed slot and a completed handover.

The next review can compare the cost of a delivery trial with other ways of addressing transport difficulty. Until a decision is recorded, the existence of this proposal supplies neither a driver nor a delivery promise. The original interviews remain evidence of several different barriers rather than a mandate for one solution.
""")
page("notes/dunmere/old-survey.md", "Dunmere public sale survey", "2026-09-22", """
The monthly second-hand sale surveyed visitors at its cash desk. Most respondents liked browsing a mixed rail and making a small contribution at the end. Several asked for clearer prices on adult coats.

The sale organizer proposed asking each visitor publicly which price band suited their household. The survey did not ask households who stayed away, and no schoolwear cupboard collections occurred at that sale.

This is an earlier record from a different activity in the hall. A positive response to browsing adult coats cannot answer why a family avoided collecting reserved schoolwear. The organizer kept the sale's payment tally separate from Priya's request list.

Later editors added a link to the cupboard decision so that volunteers would not treat this survey as a shared access policy. Its evidence date remains September 22. Updating that link did not turn an earlier sale preference into a current cupboard instruction.
""", updated="2026-10-28")
page("notes/dunmere/stock.md", "Dunmere size inventory", "2026-10-20", """
Priya counted the schoolwear cupboard after the October donations were sorted. There were several small jumpers and no coats in the largest requested size. A box of unmeasured trousers remained in the sorting area.

An item in the building is not necessarily available for a confirmed request. A volunteer must check its size and condition before Priya offers it to a household. An uncertain label should remain uncertain until somebody measures the garment.

The inventory sheet lists quantities by garment and size. It contains neither household income nor a public ranking of requests. Where two households request the same scarce size, Priya contacts them directly using the order already recorded on their request slips.

The count is a snapshot, not a delivery forecast. Unpromised donations should not be added to the available total. The collection decision governs appointments, while the inventory establishes whether a particular size can actually be held.
""")
page("notes/dunmere/laundry.md", "Dunmere donated garment preparation", "2026-10-21", """
Volunteers check each donated garment for a readable size label, missing fasteners and visible damage. An item needing further preparation stays in the sorting box and does not appear in the available inventory.

The laundry rota records who took a bag and when it returned. It does not contain the names of households requesting clothes. The volunteer doing the washing has no need to know who might later collect a jumper.

A completed laundry entry establishes that the bag returned after the agreed preparation step. It does not certify every garment as new or promise that a stain will disappear. Priya can reject an item from the available stock if its condition is unsuitable.

The cupboard does not ask a family to wait in the public hall while clothing is prepared. A collection appointment is confirmed after a suitable item is available, so an unfinished laundry bag cannot justify promising a particular size for tomorrow.
""")

page("notes/rookfen/sessions.md", "Rookfen subtitled film evenings", "2026-10-01", """
Rookfen holds monthly subtitled film evenings in the village hall. Tomas selects films for the local club and Leila checks the projection setup. The club borrows a projector rather than owning a cinema installation.

Each session has a named licensed title and a paper attendance sheet. Permission to show one title in the hall does not cover another title or an online screening. The club keeps programme decisions separate from technical checks because a legible picture cannot establish exhibition rights.

People may ask for a seat near the screen when booking. Leila uses those requests to arrange chairs but does not infer a person's diagnosis from where they want to sit. The access review records requested arrangements and any unresolved need.

The programme welcomes viewers learning another language as well as people who prefer reading dialogue. The club has not claimed that subtitles supply every form of access, and it retains that qualification in the session introduction.
""")
page("findings/rookfen/subtitle-test.md", "Rookfen caption contrast rehearsal", "2026-10-06", """
Leila rehearsed two scenes using the hall projector. The first scene had dark walls behind the actors and the second placed pale wardrobes beneath the caption area. The same subtitle file was used for both scenes.

At Rookfen, white captions disappeared against luminous wardrobe panels; an opaque charcoal rectangle behind the lettering restored contrast during the rehearsal.

The trial used the actual hall wall rather than a laptop display. A monitor's appearance would not establish what people seated at the rear could read. Leila checked from three rows and retained notes about the worst case rather than averaging away an unreadable line.

This was a local contrast check, not a survey of every viewer's needs or a measurement for all projectors. It also did not test a version with audio description. The projection decision records which part of the rehearsal was accepted for the next licensed hall session.
""")
page("decisions/rookfen/projection.md", "Rookfen caption backing decision", "2026-10-10", """
The programme meeting accepted Leila's caption setting after the hall rehearsal. The licensed copy supports the setting without replacing the subtitle text.

Rookfen adopted the charcoal caption backing for licensed hall showings; this improves text contrast but supplies no audio description of visual action.

Leila saves the setting with the projector checklist and tests it again when the borrowed equipment changes. A setting that worked on one device is a starting point for the next check, not a guarantee about a replacement projector.

The club will continue to state the access arrangements for each title before booking. Someone requesting a narrated account of movement or setting needs a different provision from the caption backing. The programme currently has no verified described version of the next title.

This decision changes presentation inside the hall. It grants no distribution rights and says nothing about permission to stream a feature film beyond the room.
""")
page("notes/rookfen/premiere.md", "Rookfen proposed online premiere", "2026-10-25", """
Tomas drafted an online premiere announcement after members asked whether they could join from home. The club's existing licence names a hall showing, and the distributor has not supplied a streaming amendment in the records retained here.

No streaming-rights approver for the Rookfen feature premiere is named in this workspace; the online announcement is a proposal awaiting written distributor permission.

A booking form mockup and an encoded test clip exist. Neither is the permission record. The club can use them to check a future workflow while leaving the premiere date unconfirmed.

This is bounded uncertainty about the retained workspace, not proof about every conversation Tomas might have had. The next person checking the proposal should seek the written distributor response and identify the title it covers. Permission for a short demonstration clip, if present, cannot silently authorize the feature.
""")
page("notes/rookfen/remote-demo.md", "Rookfen licensed remote demonstration clip", "2026-10-23", """
The distributor permitted Rookfen to use a ninety-second demonstration clip in a closed connection test with four committee members. Tomas recorded the email reference beside the clip title.

The permission applies to that short clip and that private technical test only. It does not license the feature film for a public online premiere. The committee ended the connection after checking sound delay and did not invite paying viewers.

Leila retained the encoding settings because they may help diagnose a future connection. A working stream demonstrates technical delivery, not the extent of an exhibition licence. The file's presence in the shared folder is therefore not an approval signal for another use.

The proposal for a feature premiere remains in its own note. It needs the distributor's written permission naming that feature and the intended audience before the club can advertise a confirmed online event.
""")
page("notes/rookfen/colour-workshop.md", "Rookfen photography colour workshop", "2026-10-16", """
The photography group ran a colour workshop in the same hall used for Rookfen film evenings. Participants adjusted exposure in still photographs of bright costumes and printed comparison sheets.

The tutor recommended reducing highlights when a pale shirt lost its folds in a photograph. That exercise restored detail in the garment; it did not add captions, change a film licence or provide dialogue to an audience.

The hall calendar groups activities under the building's name, so a calendar search can place this workshop beside the film rehearsal. They share a room and a reference to bright clothing, but the problem and accepted remedies differ.

Participants took their own printed pictures home. The workshop sign-up sheet should not be used as a film-club booking list, and a photograph permission form cannot authorize a public showing of someone else's feature. Leila keeps the projector settings in the film folder rather than beside these exposure examples.
""")
page("notes/rookfen/access-review.md", "Rookfen unresolved access requests", "2026-10-27", """
The programme review recorded one request for a step-free route from the rear car park and another for a described version of the next film. Tomas has asked the hall manager about the route and the distributor about available versions.

An enquiry sent is not an arrangement confirmed. The review leaves both requests open and avoids describing the next event as fully accessible. The caption backing setting addresses a particular contrast problem and cannot close unrelated requests.

The committee can tell members what is known now: the current hall showing has captions with the accepted backing setting. It should state the limits alongside that fact. A person can then decide whether the provision meets their needs rather than discover an unmet need on arrival.

The review preserves the exact request wording and the destination of each enquiry. When a response arrives, the next note should distinguish the date of the response from the date the request was first recorded.
""")

QUERIES = []
RUBRIC = []


def case(id, scenario, journey, query, units, *, protected=False, temporal=None, answerability="answerable"):
    row = dict(id=id, scenario=scenario, journey=journey, split="reserved", query=query, depth="normal", protected=protected)
    row["temporal"] = temporal or dict(to="2026-10-31")
    QUERIES.append(row)
    RUBRIC.append(dict(id=id, answerability=answerability,
        units=[dict(label=label, alternatives=[dict(file=file, required=clauses)]) for label, file, clauses in units],
        relevant=list(dict.fromkeys(file for _, file, _ in units)),
        interpretation="Pre-output independent fixture author; exact clauses from the named source are required. Preserve scope, identifiers, evidence date and uncertainty. Mechanical span coverage is not answer accuracy."))


REASON = ("observed cause", "findings/ashcombe/queue-audit.md", ["At Ashcombe, the sewing machine masked spoken names and the coat rack hid the bench entrance; three seated visitors missed a turn despite remaining in the building."])
QUEUE = ("accepted replacement", "decisions/ashcombe/queue.md", ["Ashcombe gives each waiting visitor an amber card, displays the matching number at the bench, and waits for a visible acknowledgement before passing that turn."])
SCOPE = ("assessment and event boundary", "decisions/ashcombe/queue.md", ["The walk-in trial covers small household repairs on Saturday mornings only; an amber card reserves an assessment turn, not a successful repair or a place at another event."])
RETRY = ("retention within retry bound", "decisions/ternholt/retries.md", ["Ternholt permits at most three resend attempts per queued batch in one connection window; an unacknowledged batch stays stored for a later window rather than being discarded."])
FLUSH = ("exact operation and acknowledgement boundary", "notes/ternholt/spool-flush.md", ["In Ternholt, spoolFlush resends queued counter batches using the original batch key; only a matching shore acknowledgement removes a batch from local storage."])
CHECK = ("canonical release check", "notes/ternholt/release-checklist.md", ["The Ternholt release check replays one acknowledged batch and one unacknowledged batch, then verifies that the shore ledger contains exactly one entry for each original key."])

case("ashcombe-natural-not", "ashcombe", "rationale", "For Saturday repairs, why does Ashcombe not rely on calling names over the loudspeaker, and what replaced that approach?", [REASON, QUEUE])
case("ashcombe-contraction", "ashcombe", "rationale", "For ordinary repair mornings, why can't Ashcombe simply announce the next person's name and carry on repairing? What should happen instead?", [REASON, QUEUE])
case("ashcombe-lowercase-hyphen", "ashcombe", "current", "What does the walk-in repair arrangement at Ashcombe actually reserve, and is it also a weekday drop-off service?", [SCOPE, ("reviewed current limits", "findings/ashcombe/trial.md", ["The Ashcombe October check retained the Saturday walk-in assessment trial; it did not authorize weekday drop-offs or guarantee completed repairs."])])
case("ashcombe-quoted-phrase", "ashcombe", "scope", 'Ashcombe "amber card" what does this reserve and how is a turn acknowledged?', [QUEUE, SCOPE], protected=True)
case("ternholt-exact-title", "ternholt", "navigation", "Ternholt counter release checklist", [CHECK], protected=True)
case("ashcombe-historical", "ashcombe", "historical", "Before October, how did Ashcombe intend to call people forward and when did it intend to open?", [("September intention despite later edit", "notes/ashcombe/first-plan.md", ["The September Ashcombe plan used spoken names alone and aimed to open on September 26; no numbered card or visible acknowledgement was planned."])], protected=True, temporal=dict(to="2026-09-30", order="chronological"))
case("ashcombe-warranty-unknown", "ashcombe", "limits", "Who approved Ashcombe's thirty-day repair warranty? Does the poster establish approval?", [("unrecorded approver and unsigned status", "notes/ashcombe/warranty.md", ["The Ashcombe records name no approver for the proposed thirty-day repair warranty; the poster remains an unsigned draft awaiting the service committee's decision."])], protected=True, answerability="bounded_unknown")
case("ternholt-camelcase", "ternholt", "protected", "What does spoolFlush do in Ternholt, and when may it remove a queued batch?", [FLUSH], protected=True)
case("ternholt-ticket-id", "ternholt", "protected", "What caused TRN-418 in Ternholt, and does its accepted fix reset the passenger counter?", [("exact ticket and fix boundary", "findings/ternholt/TRN-418.md", ["TRN-418 in Ternholt traced duplicate totals to a retry that generated a new batch key; the accepted fix retains the original key until acknowledgement and does not reset the passenger counter."])], protected=True)
case("ternholt-literal-path", "ternholt", "navigation", "notes/ternholt/release-checklist.md", [CHECK], protected=True)
case("ternholt-minus-exclusion", "ternholt", "protected", "Ternholt retry budget -simulation", [RETRY], protected=True)
case("ternholt-uppercase-not", "ternholt", "protected", "Ternholt retry budget NOT simulation", [RETRY], protected=True)
case("dunmere-unconstrained-paraphrase", "dunmere", "discovery", "Which service lets families collect school clothes discreetly instead of explaining money troubles to a crowd?", [("substantive barrier", "findings/dunmere/privacy.md", ["Dunmere's interviews found that the public means-testing conversation deterred families from collecting schoolwear even when suitable sizes were available."]), ("accepted remedy with stock qualification", "decisions/dunmere/collection.md", ["Dunmere now offers individual collection appointments without an income declaration; a requested size is held only after Priya confirms that a matching garment is actually in stock."])])
case("rookfen-unconstrained-paraphrase", "rookfen", "discovery", "Which screening adjustment helps an audience follow speech over bright moving images, and which accessibility need remains unmet?", [("physical contrast finding", "findings/rookfen/subtitle-test.md", ["At Rookfen, white captions disappeared against luminous wardrobe panels; an opaque charcoal rectangle behind the lettering restored contrast during the rehearsal."]), ("accepted remedy and missing provision", "decisions/rookfen/projection.md", ["Rookfen adopted the charcoal caption backing for licensed hall showings; this improves text contrast but supplies no audio description of visual action."])])
case("dunmere-current-proposal", "dunmere", "current", "Has Dunmere agreed to bring garments to people's homes now, and can an outstanding size request be treated as a delivery promise?", [("proposal remains unapproved", "notes/dunmere/extension.md", ["The Dunmere home-delivery suggestion is unapproved as of October 26; confirmed individual collection appointments remain the accepted service, and an unfilled size request is still pending."]), ("actual stock condition", "decisions/dunmere/collection.md", ["Dunmere now offers individual collection appointments without an income declaration; a requested size is held only after Priya confirms that a matching garment is actually in stock."])], protected=True)
case("rookfen-streaming-unknown", "rookfen", "limits", "Who granted Rookfen streaming rights for the feature premiere, and does the remote clip test establish that permission?", [("bounded unknown feature rights", "notes/rookfen/premiere.md", ["No streaming-rights approver for the Rookfen feature premiere is named in this workspace; the online announcement is a proposal awaiting written distributor permission."]), ("clip permission has narrower scope", "notes/rookfen/remote-demo.md", ["The permission applies to that short clip and that private technical test only. It does not license the feature film for a public online premiere."])], protected=True, answerability="bounded_unknown")
case("ternholt-recovery-qualification", "ternholt", "multi-source", "After a Ternholt power interruption, what survived the tested reboot, what write-stage risk remains unknown, and which operation should retry the recovered batches?", [("tested interruption and untested boundary", "findings/ternholt/power-cut.md", ["The Ternholt power-cut trial recovered both persisted batches after reboot, but it did not test loss of power during the initial local write; durability at that earlier point remains unverified."]), FLUSH], protected=True)
case("ashcombe-natural-without", "ashcombe", "current", "Can someone at the Ashcombe entrance promise a repair without sending the item to a bench first?", [("unassessed outcome remains undecided", "notes/ashcombe/bench-check.md", ["Ashcombe cannot promise a repair without a bench assessment; the queue volunteer may describe a turn as reserved but must leave the repair outcome undecided."]), SCOPE])


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    assert len(PAGES) == 30 and len(QUERIES) == 18
    assert len({q["id"] for q in QUERIES}) == len(QUERIES)
    assert {q["id"] for q in QUERIES} == {g["id"] for g in RUBRIC}
    for path, (title, date, created, updated, body) in PAGES.items():
        dest = HERE / "corpus" / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        fields = dict(id="mem_" + str(uuid.uuid5(NAMESPACE, path)), title=title, type="decision" if path.startswith("decisions/") else "note", date=date, created_at=created)
        if updated:
            fields["updated_at"] = updated
        frontmatter = "---\n" + "\n".join(f"{key}: {json.dumps(value)}" for key, value in fields.items()) + "\n---\n"
        dest.write_text(frontmatter + f"# {title}\n\n" + body + "\n")
    for row in RUBRIC:
        for unit in row["units"]:
            for alt in unit["alternatives"]:
                text = (HERE / "corpus" / alt["file"]).read_text()
                for clause in alt["required"]:
                    assert clause in text, (row["id"], unit["label"], alt["file"])
    write_json(HERE / "queries.json", QUERIES)
    write_json(HERE / "rubric.json", RUBRIC)
    write_json(HERE / "PROTECTED-UNITS.json", dict(
        policy="Zero source-specific unit losses on any case; the explicitly protected cases additionally protect navigation, constraints, identifiers, dates and bounded unknowns. This policy is fixed before evaluation and cannot be relaxed after outputs.",
        units=[dict(case=row["id"], label=unit["label"], alternatives=unit["alternatives"]) for row in RUBRIC for unit in row["units"]],
        protectedCases=[q["id"] for q in QUERIES if q["protected"]],
        unconstrainedParaphraseCases=["dunmere-unconstrained-paraphrase", "rookfen-unconstrained-paraphrase"]))
    print(f"Validated {len(PAGES)} pages, {len(QUERIES)} questions, {sum(len(g['units']) for g in RUBRIC)} exact source-specific units; no retrieval executed.")


if __name__ == "__main__":
    main()
