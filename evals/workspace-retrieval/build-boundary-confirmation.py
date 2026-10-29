#!/usr/bin/env python3
"""Author-only fictional sources; never reads retrieval output or private memory."""
import hashlib
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parent / "boundary-confirmation"
DOCS = {}

def doc(file, title, date, body, kind="note", **metadata):
    DOCS[file] = dict(title=title, date=date, body=body.strip() + "\n", type=kind, **metadata)

doc("notes/kilnwick/handbook.md", "Kilnwick shared kiln handbook", "2026-10-08", """
# Finding your way around the workshop

The shelves beside the entrance are divided by collection week, not by the date a maker brought a piece in. A paper ticket travels with each tray. If a ticket falls off, the tray moves to the holding shelf until its maker identifies it. Similar-looking cups are not interchangeable, and a volunteer should not infer ownership from a familiar glaze colour.

The booking book sits at the dry desk. It records requested shelf space separately from accepted loads. A pencilled request means that someone would like a place; it does not mean the firing coordinator has accepted the material or promised a completion date. Collections usually happen after the building steward has reopened the room, rather than at the moment the controller finishes a programme.

## What the cooperative is for

Kilnwick gives adult hobby potters access to a shared electric kiln when they have no suitable firing space at home. Imani is the firing coordinator; the building steward controls access to the workshop.

Old volunteer-fair signs call the workshop Hub. The cycle depot uses Hub on some signs too, so that short name alone does not identify the workshop or its coordinator.

The cooperative is a shared firing arrangement rather than a course in making tableware. A member can ask another maker about decoration, but advice exchanged at a shelf is not a laboratory assessment. The workshop does not certify a finished mug for food use, and photographs of a shiny surface do not establish a glaze's suitability. Makers remain responsible for the intended use of their own work.

## A normal handover

Before leaving a tray, a maker writes the clay product and the requested firing programme on its ticket. The coordinator compares these declarations with the accepted-material record. Unfamiliar materials wait for a decision instead of being placed in an empty corner of the next load. Available space is not the only condition for acceptance.

During the pilot, members bring work to the desk during a staffed intake session. They do not enter the kiln room to find a spare shelf. The person at the desk can record a request, explain the holding shelf, and contact Imani. Only the coordinator accepts a load under the current decision; a friendly volunteer cannot waive the conditions to avoid disappointing a visitor.

## Keeping the record useful

A load card belongs to the whole firing. It names the programme, identifies the accepted trays, and leaves room for the coordinator's observations after cooling. A maker's collection signature confirms receipt of the named tray; it is not an acknowledgment that every piece survived unchanged. Distorted work and cracked work remain documented rather than quietly discarded.

The review will look at missed handovers, rejected unknown materials, and the clarity of collection messages. Counting completed pieces alone would hide whether the cooperative repeatedly leaves a maker uncertain about the location of their work. A short explanation on the holding ticket is often more useful than an enthusiastic but untraceable verbal promise.

## Questions at the desk

People sometimes use the word ready to mean dry enough to submit, accepted for loading, finished firing, or available for collection. Ask which stage they mean before making a commitment. The current load card and the collection book answer different questions. The workshop has no rule that a requested date automatically becomes an accepted deadline after a few days without a reply.

If the coordinator is absent, the desk can take contact details and a description. It should not leave a personal telephone number on a tray visible to every visitor. A note in the booking book can identify the member number and point to the contact envelope at the dry desk. The envelope and the public shelf label deliberately serve different audiences.

## Joining the next review

Members can bring a specific handover problem to the monthly review. A useful account gives the ticket number, the stage at which the problem arose, and what the maker understood at the time. The group is less able to act on an accusation that a whole batch was mishandled without identifying which load or collection it refers to.

The review does not rewrite the load cards. If the coordinator corrects a mistaken programme entry, the correction carries its date and leaves the original legible. This gives a later reader a way to distinguish the programme that was requested from the one actually used. A tidy replacement card with no explanation would remove that distinction.

The current intake decision is linked from the desk copy of this handbook. This handbook explains the purpose and workflow, while the decision records the accepted limits. A reader who finds the handbook in an old folder should check the decision date rather than assume that the most recently printed cover establishes the operating scope.
""")

doc("decisions/kilnwick/pilot.md", "Kilnwick pilot firing limits", "2026-10-06", """
# Decision entered after the loading review

Imani reviewed the maker declarations and the September test cards with the building steward. The decision below governs the pilot; the room booking describes when the room is occupied and carries no separate permission to change a firing programme.

Kilnwick accepts only identified stoneware bodies for the coordinator's cone-six programme; unknown clay, low-fire earthenware, and member-operated firing remain outside the pilot.

The desk may hold an unidentified piece while the maker obtains its product label. It must not turn the holding entry into an accepted tray merely because there is space on a shelf. Where a maker cannot identify the material, the desk returns the piece unfired with a short explanation.

## Why these limits remain

The test review showed damage from one low-fire sample and inconsistent verbal descriptions of otherwise similar clay. A declared product gives the coordinator something concrete to compare with the programme. This decision does not promise that every declared body will behave identically or that every finished surface is suitable for a particular household use.

## Authority and review

Only Imani can accept a tray into a pilot load. The building steward can close the room because of a building issue, but that role does not approve an alternative kiln programme. A later proposal must receive a replacement decision with a date before the desk changes its explanation to members. The pilot review is scheduled for November and does not itself approve an extension.
""", "decision")

doc("findings/kilnwick/test-load.md", "Kilnwick September witness load", "2026-09-26", """
# Comparing the sample shelves

Three members supplied labelled test tiles. The coordinator also received an unlabelled bowl from a maker who remembered buying clay at a different studio. That recollection was written on the test sheet as uncertain; it was not converted into a product name.

The Kilnwick witness load found that the low-fire sample slumped onto a shelf at the proposed cone-six setting, while the identified stoneware tiles kept their shape.

The damaged shelf was removed from the pilot stock. The cost record identifies that shelf separately from the kiln's ordinary electricity cost. Combining those figures without explanation would make a later load look more expensive for reasons unrelated to the number of pieces it contained.

## What the observation supports

This was a small local loading test, not a survey of all clay bodies. It explains why the group wanted identifiable material before admitting a tray; it does not prove that every stoneware product is suitable or that a short firing will rescue an unknown body. The coordinator retained the labels and photographs with the load card so that a future reviewer can check which samples were actually tested.

An early discussion described the damaged item as a faulty glaze. The retained card instead attributes the deformation to the low-fire sample at the higher setting. That correction matters because rejecting only an unfamiliar glaze would leave the underlying body unidentified. No clinical or food-safety certification was attempted in this workshop observation.
""", "finding")

doc("notes/kilnwick/intake-card.md", "Kilnwick intake and collection card", "2026-10-09", """
# One card, two handovers

The front of the card travels with the tray until loading. The collection signature goes on the back after the coordinator has released the work. A completed intake section must not be shown to a visitor as proof that their tray is already ready to collect.

At Kilnwick intake, record the maker number, clay product, requested programme, and tray count before the coordinator decides whether the load can accept the work.

If a tray moves to holding, keep its original ticket number. Creating a second entry makes it difficult to tell whether two requests refer to the same four cups or to eight different pieces. A note should say why the tray is waiting and what information the maker needs to provide.

## Cooling and release

Kilnwick collection starts only after the coordinator marks the load card released; a completed controller programme is not a collection authorization.

The collection book names the released load and the member's tray count. If a member sends a friend, the desk records that handover against the original ticket. The friend should not be invited into the kiln room to locate missing work. An unresolved mismatch remains on the book for the coordinator rather than being crossed out to keep the queue moving.
""")

doc("notes/kilnwick/first-plan.md", "Kilnwick August open workshop plan", "2026-08-21", """
# Initial sketch for discussion

The August Kilnwick sketch proposed member-operated evening firings and an opening on September 12, subject to a successful witness load and the building steward's agreement.

Several prospective members wanted an evening key because their ordinary working hours overlap the staffed desk. The sketch noted that inconvenience without resolving who would check a load, record the programme, or release the room after cooling. Those were open questions, not delegated responsibilities.

The September witness load had not happened when this sketch was written. References to simple operation described what the group hoped to arrange; they were not evidence that unfamiliar material had already passed a test. No key allocation was attached to the sketch.

## What to preserve in later discussion

The group wanted a record of the original aspiration because it explains why some members still expect evening access. A later operating decision may reduce the scope without making those earlier expectations imaginary. When explaining the change, distinguish an initial proposed opening from the pilot that was actually accepted.

This document remains an August plan even if a volunteer copies it into a new folder in October. Copying or editing its cover should not make the proposal appear to supersede a dated pilot decision.
""")

doc("notes/kilnwick/night-key.md", "Kilnwick evening key proposal", "2026-10-22", """
# Request from the late group

Members who finish work after the desk closes asked whether a rota could cover evening access. Their draft lists four names as possible key holders. The list records willingness to help, rather than an allocation of building keys or authority to run the kiln.

The October 22 Kilnwick evening-key proposal is unapproved and does not replace the coordinator-operated pilot.

No named approver for independent Kilnwick evening firing is recorded in this proposal.

## Conditions still unresolved

The group has not settled how an evening volunteer would check a material declaration or who would release work after cooling. A suggested checklist in the draft is marked for discussion. A person signing up for the rota does not thereby accept duties that the cooperative has yet to define.

The building steward asked for a written description before considering any key request. That request for information is not consent. Imani will bring the proposal to the November review together with the pilot records, and a decision will need to say explicitly whether the operating scope changes.

A trial social evening in the common room can happen without firing. Its room booking must not be used as an implied authorization for the kiln room. The two spaces have separate handover records even though members enter through the same front door.
""")

doc("notes/kilnwick/shelf-damage.md", "Kilnwick shelf repair ledger", "2026-10-11", """
# The replacement shelf

The treasurer's repair entry separates a kiln shelf from the wooden storage shelves by the entrance. A damaged storage shelf would affect where trays wait; the ceramic shelf sits inside a firing load. A short message saying shelf repaired is ambiguous without its ledger number.

Ledger K-17 covers the ceramic shelf damaged during the September witness load. A replacement was purchased on October 8 and the old shelf was retained for the review. The purchase makes a spare available but does not change which bodies the pilot accepts.

## Costs and member questions

The cooperative paid the replacement cost from its pilot reserve. It did not divide that one-off charge across every future tray. The ordinary load fee will be reviewed after enough completed firings exist to compare actual consumption, accepted shelf space, and cancelled loads. A fee proposal is not a promise of unlimited use.

The ledger has no entry assigning blame to the maker who supplied the uncertain sample. The test record explains the physical observation, while the ledger records expenditure. A reader should not turn the repair payment into a disciplinary ruling or use it as evidence that every later piece is insured against damage.
""")

doc("notes/pedalbrook/guide.md", "Pedalbrook cargo-cycle borrowing guide", "2026-10-08", """
# Collecting a bicycle from the depot

The depot is the small brick building beside the market stores. Use the side gate during a staffed session rather than following delivery vehicles through the loading yard. There is no out-of-hours key box. A reservation card can be left in the letter slot, but leaving a card does not book a machine or establish that a borrower has completed an induction.

The fleet consists of two front-box cycles and one longer rear-rack cycle. They have different locks, stands, and load arrangements. Induction is recorded for a specific model, so experience with one does not automatically carry to another. The volunteer checks the borrower record before assigning a cycle and records any visible damage on the outgoing sheet.

## What happens during the handover

The borrower and volunteer look at the outgoing sheet together. It gives the cycle number, the return session, the lock number, and the equipment supplied. A photograph may help explain an existing scratch, but it should not replace a legible note of which cycle was taken. The return sheet needs to be matched with the outgoing entry to close the borrowing record.

The depot has a paper map of the trial area. It shows boundary streets and the agreed collection point. A convenient route drawn by another borrower is advice about navigation, not an extension of the lending area. If the proposed trip would leave the map, the desk refers the request to the coordinator instead of borrowing a pen to redraw the boundary.

## Purpose and responsibility

Pedalbrook lends cargo cycles for adults moving groceries and household loads within the neighborhood trial area. Daria coordinates borrowing, and each borrower needs a recorded model-specific induction before collection.

Some depot volunteers call their meeting point Hub, a short name also used by the workshop at the fair. A booking or instruction using that word alone needs its group identified before the desk treats it as a Pedalbrook record.

The scheme is intended to make an occasional bulky errand possible without a car. It is not a passenger service and does not provide an escort for a school run. The committee chose household loads for the first trial because the current equipment and records were assembled for that use. A family wanting to carry a child should receive a clear explanation of the exclusion rather than a suggestion that a quiet street makes an exception harmless.

## Reserving without overpromising

Reservations are pencilled against a collection session. The volunteer confirms a cycle only after checking induction and whether the machine has returned from its previous loan. A diary entry can therefore show requested, confirmed, collected, or closed. Someone seeing their name under requested has not been promised a working cycle at that hour.

If an expected cycle is unavailable, the coordinator can offer another collection session. The desk should not assign a different model simply because it looks similar. A borrower may choose a later induction, but that is an explicit arrangement. The depot has no policy of silently transferring all future reservations to a replacement cycle after a maintenance problem.

## The return conversation

A returning borrower tells the volunteer about unusual handling, an unexpected noise, or a problem with a lock. The volunteer records the report in the cycle's own log. An oral message passed to another borrower is easy to lose, especially when two machines are parked beside one another and people refer to both as the blue bike.

The desk can close a borrowing entry while also marking the cycle unavailable. A successful return means that the machine and equipment are back; it does not mean a reported fault has been inspected. The next borrower should receive a clear change to their reservation rather than discovering at collection that a volunteer assumed someone else had checked it.

## What the committee will review

The trial review considers completed household trips, cancellations, equipment reports, and the number of requests the scheme could not meet. A high reservation count alone would hide repeated cancellations or a model that spends much of the month waiting for inspection. The group wants a modest dependable service rather than an attractive total that nobody can reconcile with the depot sheets.

People can suggest new uses through the coordinator. A suggestion belongs in the proposal record with its date, expected users, and unanswered questions. Attaching a drawing to the guide does not change the accepted lending scope. When an old printed guide differs from a dated committee decision, the desk should explain the discrepancy and ask for a current copy.

## Handling the paperwork

The public calendar shows available sessions and model names. Borrower contact details stay in the depot file. A volunteer responding to a queue should not leave the full borrowing book on an outdoor table. The committee needs enough information to contact the current borrower without making everyone's telephone number part of the public booking display.

When a borrower disputes a recorded scratch, retain both accounts with their dates. The outgoing note, return note, and later inspection answer different questions. Copying the latest account over the earlier entry would make it harder to distinguish what was observed at collection from what was reported later. The guide asks for a usable record, not for a quick attribution of fault.
""")

doc("decisions/pedalbrook/lending.md", "Pedalbrook household-load trial decision", "2026-10-07", """
# Accepted lending scope

The committee approved a household-load trial after reviewing the equipment inspection and the proposed induction record. The trial begins with the neighborhood boundary shown on the depot map. Changes to that boundary or to permitted uses require a dated decision, rather than a note added to the public calendar.

Pedalbrook permits household cargo only after a model-specific induction; carrying children, paying passengers, or animals is outside the approved trial.

## Why the committee chose a narrower trial

The inspection record did not establish a suitable passenger restraint arrangement. The committee therefore kept passenger carriage outside the trial instead of asking a desk volunteer to judge each family's improvised setup. A small or familiar passenger does not change the accepted scope.

The induction record names both the model and the volunteer who conducted the session. It is not a general cycling qualification. A borrower familiar with an ordinary bicycle still needs the recorded model session before collection, and the desk cannot substitute a signature saying experienced cyclist.

## Review and exceptions

Daria manages bookings under this decision but cannot approve a passenger exception alone. The committee will review equipment and proposed uses in November. A meeting date in the calendar provides a place for discussion; it is not advance approval of the proposal that someone intends to bring.
""", "decision")

doc("findings/pedalbrook/equipment.md", "Pedalbrook carrier inspection record", "2026-09-29", """
# Inspection before the trial

The volunteer team compared the three cycle models with the proposed outgoing sheet. They checked the lock numbering and noted that the two front boxes can look interchangeable from a distance. Each machine therefore keeps its own depot number on the frame and on its borrowing sheet.

The Pedalbrook inspection found no documented passenger restraint specification for the donated front boxes; their padded benches were not evidence of approval for child carriage.

The inspection team photographed a loose cushion because several visitors had described it as a child seat. Their record deliberately keeps the ordinary description separate from a verified equipment specification. It does not certify a configuration that nobody had documented.

## Consequences for the trial

The team recommended a household-load trial while the committee investigated other uses. A written recommendation is not the committee decision, but it supplies the equipment uncertainty behind that decision. A later photograph showing the cushion fastened down would not, by itself, answer the missing specification question.

The workshop also noted that the rear-rack model uses a different stand. That observation supports model-specific induction rather than treating all three cycles as interchangeable. It was a local inspection of donated machines, not a claim about every cargo-cycle design or the rules governing passenger carriage elsewhere.
""", "finding")

doc("notes/pedalbrook/checkout.md", "Pedalbrook checkout and return sheet", "2026-10-10", """
# Matching the outgoing and returning cycle

The sheet remains in the depot file while the borrower carries the small return card. Do not put a person's full contact details on the public calendar. A volunteer can use the borrowing number to find the appropriate record when a return is delayed.

Pedalbrook checkout must record the cycle number, model-specific induction reference, lock number, and agreed return session before the machine leaves the depot.

The return volunteer checks the cycle number rather than closing the first open entry under the borrower's surname. People can borrow more than once, and the same household may have reservations for different models. An unresolved mismatch gets a note for Daria.

## A report is not an inspection

A borrower reporting an unusual noise is asked when it occurred and what the cycle was carrying. The desk writes down the account without diagnosing the cause. A complete form may still leave the machine unavailable until someone inspects it.

Pedalbrook volunteers mark a cycle unavailable after a reported steering fault; closing the borrowing entry does not clear that maintenance hold.

The outgoing calendar should be updated when the hold affects the next session. It is better to send a clear cancellation than to let the next borrower travel to the depot on the assumption that a returned cycle is automatically ready for them.
""")

doc("notes/pedalbrook/initial-idea.md", "Pedalbrook summer family-trip sketch", "2026-08-15", """
# Ideas from the summer fair

The August Pedalbrook sketch proposed lending cycles for family outings, including child carriage, with a hoped-for start on September 5; neither the equipment inspection nor committee approval was complete.

The sketch came from a stall conversation in which parents asked whether one of the donated cycles could replace a car for a weekend trip. Volunteers wrote the idea down so that it would not be lost. They did not inspect a restraint arrangement at the stall or allocate a cycle to a family.

## Questions carried into planning

The group needed to identify which machines were actually available, how borrowers would learn their handling, and who would keep the records. The summer sketch left these as questions. A pencilled route to the park showed a possible destination, rather than an accepted lending boundary.

This record explains why some residents remember a family-outing scheme. It should be read with its August date and pending conditions. Later editing of a spelling mistake would not make the old aspiration a current committee authorization, and the first hoped-for date was never a guarantee to a borrower.

The coordinator retained the sketch alongside the later decision so that explanations of the narrower trial could acknowledge what people had originally been told to expect.
""")

doc("notes/pedalbrook/child-seat.md", "Pedalbrook passenger kit discussion", "2026-10-23", """
# Proposal for the November agenda

A local shop offered to discuss passenger equipment with the committee. Its message included a catalogue picture and a suggested price. The picture does not identify an inspected installation on any depot cycle, and the committee has not placed an order.

The October 23 Pedalbrook passenger-kit discussion remains a proposal and does not authorize child carriage under the household-load trial.

No named approver for a Pedalbrook child-passenger exception is recorded in the passenger-kit discussion.

## What must still be resolved

The committee needs to know which model an offered kit is intended for, how installation would be assessed, and whether the lending terms would change. Daria agreed to collect the questions. That agreement assigns an administrative task; it does not delegate authority to approve a passenger exception.

A volunteer made a sample sign saying family rides for the agenda pack. The sign remains in the proposal envelope. Putting it on the public calendar before a decision would turn an illustration into a misleading invitation, so the depot continues to use the household-load description.

If a decision is made in November, the record must say what changed and when. The group should not silently edit this proposal so that a later reader cannot see that the October request was still pending.
""")

doc("notes/pedalbrook/market-run.md", "Pedalbrook first market borrowing log", "2026-10-14", """
# One ordinary loan

Borrowing entry P-08 concerned the rear-rack cycle and a trip to the neighborhood market. The borrower had completed that model's induction during the previous staffed session. The outgoing sheet listed two empty crates, the frame lock, and the agreed return on Saturday morning.

The borrower returned before the session opened and waited at the side gate rather than leaving a cycle unattended in the loading yard. The return volunteer checked the frame number and crates. No equipment fault was reported in this entry.

## What the log does and does not establish

This completed household trip showed that the handover record could be matched at return. It did not test passenger equipment, approve an out-of-area route, or demonstrate that every borrower could use the same model without induction. The committee can count one completed loan without turning it into evidence for uses the trial excludes.

The borrower suggested a longer Sunday session. Daria added that request to the review agenda rather than changing the staffed hours on the spot. An individual convenience request is worth recording, but the depot needs volunteers for a session before it offers another collection time.

The public review summary will use the borrowing number and aggregate trip information. It will not reproduce the borrower's telephone number or the private note about where their groceries were delivered.
""")

doc("notes/shared/volunteer-handover.md", "Saturday volunteer handover questions", "2026-10-16", """
# Two desks, two coordinators

The neighborhood volunteer fair placed the workshop desk next to the cycle depot desk. Several visitors offered to help both groups. The shared sign-up page records their interests and preferred times, but it does not merge the groups' operating decisions or make one coordinator responsible for both.

For Kilnwick firing questions, contact Imani; for Pedalbrook borrowing questions, contact Daria. A volunteer-fair sign-up does not authorize kiln operation or passenger carriage.

## Avoiding an ambiguous promise

One visitor asked whether a Saturday shift would let them bring a child while collecting a finished bowl. The answer depends on what they intend to do: ordinary attendance at the fair, workshop collection, and riding as a cycle passenger are different activities. A volunteer should ask which activity is meant instead of treating the shared event as a blanket permission.

The fair organiser can correct a session time on the shared sign-up page. They cannot change the accepted firing material or the cargo-only lending scope. Those questions return to the dated decisions of the relevant group.

The two desks agreed to exchange public leaflets. No borrower contact book or workshop member list is shared by that arrangement. A person who wants to help both should give their details to each coordinator separately.
""")

DOCS["notes/kilnwick/handbook.md"]["aliases"] = ["Hub"]
DOCS["notes/pedalbrook/guide.md"]["aliases"] = ["Hub"]

QUERIES = []
RUBRIC = []
def case(id, scenario, journey, query, units, depth="normal", protected=False, temporal=None, unknown=False):
    q = dict(id=id, scenario=scenario, journey=journey, split="reserved", query=query, depth=depth)
    if protected: q["protected"] = True
    if temporal: q["temporal"] = temporal
    QUERIES.append(q)
    rows = [dict(label=label, alternatives=[dict(file=file, required=phrases)]) for label, file, phrases in units]
    RUBRIC.append(dict(id=id, answerability="bounded_unknown" if unknown else "answerable", units=rows,
                       relevant=list(dict.fromkeys(file for _, file, _ in units)),
                       interpretation="Fresh author-separated boundary confirmation; source-bound clauses are mechanical evidence diagnostics, not evaluated answers. Preserve dates, authority and scope qualifications."))

case("kilnwick-orientation", "kilnwick", "orientation", "I am staffing Kilnwick for the first time. Who is it intended to help, who makes the firing decisions, and what can I actually accept from a visitor?", [
    ("purpose and responsibility", "notes/kilnwick/handbook.md", ["Kilnwick gives adult hobby potters access to a shared electric kiln when they have no suitable firing space at home. Imani is the firing coordinator; the building steward controls access to the workshop."]),
    ("accepted material and authority", "decisions/kilnwick/pilot.md", ["Kilnwick accepts only identified stoneware bodies for the coordinator's cone-six programme; unknown clay, low-fire earthenware, and member-operated firing remain outside the pilot."])
], depth="shallow")
case("kilnwick-material-reason", "kilnwick", "rationale", "Why does Kilnwick need the clay product rather than the maker's assurance that a piece will be fine, and which work can go into the pilot?", [
    ("observed damage", "findings/kilnwick/test-load.md", ["The Kilnwick witness load found that the low-fire sample slumped onto a shelf at the proposed cone-six setting, while the identified stoneware tiles kept their shape."]),
    ("current scope", "decisions/kilnwick/pilot.md", ["Kilnwick accepts only identified stoneware bodies for the coordinator's cone-six programme; unknown clay, low-fire earthenware, and member-operated firing remain outside the pilot."])
])
case("kilnwick-handover", "kilnwick", "multi-source", "At Kilnwick, what information must go on the incoming tray card, who can accept it into a load, and when may the maker collect it?", [
    ("intake record", "notes/kilnwick/intake-card.md", ["At Kilnwick intake, record the maker number, clay product, requested programme, and tray count before the coordinator decides whether the load can accept the work."]),
    ("acceptance authority", "decisions/kilnwick/pilot.md", ["Only Imani can accept a tray into a pilot load."]),
    ("collection condition", "notes/kilnwick/intake-card.md", ["Kilnwick collection starts only after the coordinator marks the load card released; a completed controller programme is not a collection authorization."])
])
case("kilnwick-evening", "kilnwick", "current", "Has the new Kilnwick key-holder rota changed who may run an evening firing, or is the current pilot still in force?", [
    ("proposal remains pending", "notes/kilnwick/night-key.md", ["The October 22 Kilnwick evening-key proposal is unapproved and does not replace the coordinator-operated pilot."]),
    ("operative scope", "decisions/kilnwick/pilot.md", ["Kilnwick accepts only identified stoneware bodies for the coordinator's cone-six programme; unknown clay, low-fire earthenware, and member-operated firing remain outside the pilot."])
])
case("kilnwick-historical", "kilnwick", "historical", "Before the witness load, what did Kilnwick hope to offer in the evening and when did it hope to open?", [
    ("conditional original plan", "notes/kilnwick/first-plan.md", ["The August Kilnwick sketch proposed member-operated evening firings and an opening on September 12, subject to a successful witness load and the building steward's agreement."])
], protected=True, temporal={"to":"2026-09-25", "order":"chronological"})
case("kilnwick-navigation", "kilnwick", "navigation", "Kilnwick shelf repair ledger", [
    ("repair identity", "notes/kilnwick/shelf-damage.md", ["Ledger K-17 covers the ceramic shelf damaged during the September witness load."])
], protected=True)
case("pedalbrook-orientation", "pedalbrook", "orientation", "Explain Pedalbrook to a new depot volunteer: whom does borrowing serve, who coordinates it, and what must be true before a cycle leaves?", [
    ("purpose and responsible person", "notes/pedalbrook/guide.md", ["Pedalbrook lends cargo cycles for adults moving groceries and household loads within the neighborhood trial area. Daria coordinates borrowing, and each borrower needs a recorded model-specific induction before collection."]),
    ("permitted use", "decisions/pedalbrook/lending.md", ["Pedalbrook permits household cargo only after a model-specific induction; carrying children, paying passengers, or animals is outside the approved trial."])
], depth="shallow")
case("pedalbrook-passenger-reason", "pedalbrook", "rationale", "Why can a Pedalbrook volunteer not treat the padded front box as enough to permit a child passenger, and what use did the committee actually approve?", [
    ("equipment uncertainty", "findings/pedalbrook/equipment.md", ["The Pedalbrook inspection found no documented passenger restraint specification for the donated front boxes; their padded benches were not evidence of approval for child carriage."]),
    ("decision boundary", "decisions/pedalbrook/lending.md", ["Pedalbrook permits household cargo only after a model-specific induction; carrying children, paying passengers, or animals is outside the approved trial."])
])
case("pedalbrook-return", "pedalbrook", "multi-source", "For Pedalbrook, tell the return volunteer why a closed borrowing entry may still leave the cycle unavailable and what the borrower should have completed before its outgoing handover.", [
    ("maintenance hold", "notes/pedalbrook/checkout.md", ["Pedalbrook volunteers mark a cycle unavailable after a reported steering fault; closing the borrowing entry does not clear that maintenance hold."]),
    ("model qualification", "notes/pedalbrook/guide.md", ["Daria coordinates borrowing, and each borrower needs a recorded model-specific induction before collection."])
])
case("pedalbrook-passenger-unknown", "pedalbrook", "limits", "Who signed off the Pedalbrook child-passenger exception after the shop sent its kit picture?", [
    ("unknown approver", "notes/pedalbrook/child-seat.md", ["No named approver for a Pedalbrook child-passenger exception is recorded in the passenger-kit discussion."]),
    ("proposal qualification", "notes/pedalbrook/child-seat.md", ["The October 23 Pedalbrook passenger-kit discussion remains a proposal and does not authorize child carriage under the household-load trial."])
], protected=True, unknown=True)
case("pedalbrook-phrase", "pedalbrook", "scope", 'Pedalbrook "model-specific induction"', [
    ("literal qualification", "decisions/pedalbrook/lending.md", ["Pedalbrook permits household cargo only after a model-specific induction; carrying children, paying passengers, or animals is outside the approved trial."])
], protected=True)
case("kilnwick-pedalbrook-responsibility", "shared", "multi-source", "For Kilnwick and Pedalbrook respectively, whom should a new volunteer contact, and does signing up at their shared fair authorize either kiln operation or passenger carriage?", [
    ("separate responsibility and scope", "notes/shared/volunteer-handover.md", ["For Kilnwick firing questions, contact Imani; for Pedalbrook borrowing questions, contact Daria. A volunteer-fair sign-up does not authorize kiln operation or passenger carriage."])
], protected=True)

def main():
    ROOT.mkdir(exist_ok=True)
    namespace = uuid.UUID("0c7ad7ec-a144-4759-b34e-12705aa5e692")
    for file, data in DOCS.items():
        destination = ROOT / "corpus" / file
        destination.parent.mkdir(parents=True, exist_ok=True)
        metadata = dict(id="mem_" + str(uuid.uuid5(namespace, file)), title=data["title"], type=data["type"],
                        date=data["date"], created_at=data["date"])
        metadata.update({k: v for k, v in data.items() if k not in {"body", "title", "type", "date"}})
        frontmatter = "---\n" + "\n".join(f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in metadata.items()) + "\n---\n"
        destination.write_text(frontmatter + data["body"], encoding="utf8")
    for name, value in (("queries.json", QUERIES), ("rubric.json", RUBRIC)):
        (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    assert len(DOCS) == 15 and len(QUERIES) == 12
    assert len({q["id"] for q in QUERIES}) == len(QUERIES)
    for row in RUBRIC:
        for unit in row["units"]:
            for alt in unit["alternatives"]:
                text = " ".join(DOCS[alt["file"]]["body"].split())
                for phrase in alt["required"]:
                    assert " ".join(phrase.split()) in text, (row["id"], phrase)
    manifest = [{"path": str(p.relative_to(ROOT)), "bytes": p.stat().st_size,
                 "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
                for p in sorted(ROOT.rglob("*")) if p.is_file() and p.name != "AUTHOR-FREEZE.json"]
    (ROOT / "AUTHOR-FREEZE.json").write_text(json.dumps({"pages":len(DOCS), "queries":len(QUERIES), "files":manifest,
        "digest":hashlib.sha256(json.dumps(manifest, separators=(",", ":")).encode()).hexdigest()}, indent=2) + "\n")

if __name__ == "__main__":
    main()
