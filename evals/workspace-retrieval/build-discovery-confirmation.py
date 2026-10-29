"""Reproduce the authored discovery confirmation fixture; never reads run outputs."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parent / 'discovery-confirmation'
queries, rubric = [], []


def doc(file, title, body, **metadata):
    digest = hashlib.sha256(('discovery-confirmation-' + file).encode()).hexdigest()
    ident = f'mem_{digest[:8]}-{digest[8:12]}-{digest[12:16]}-{digest[16:20]}-{digest[20:32]}'
    meta = dict(id=ident, title=title, type='note', date='2026-10-05', created_at='2026-10-05')
    meta.update(metadata)
    path = ROOT / 'corpus' / file
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('---\n' + '\n'.join(f'{key}: {json.dumps(value)}' for key, value in meta.items()) + '\n---\n' + body.strip() + '\n')
    return ident


def case(ident, scenario, journey, question, units, **options):
    query = dict(id=ident, scenario=scenario, journey=journey, split='reserved', query=question, depth='normal')
    query.update(options)
    queries.append(query)
    rubric.append(dict(id=ident, answerability='bounded_unknown' if journey == 'protected' else 'answerable',
        units=[dict(label=label, alternatives=[dict(file=file, required=clauses)]) for label, file, clauses in units],
        relevant=list(dict.fromkeys(unit[1] for unit in units)),
        interpretation='Fresh discovery confirmation. Require the displayed named subject and complete qualification; aliases do not establish shared governance, and writing time does not change evidence time.'))


wbrief = 'notes/wrenfall/charter.md'
wdecision = 'decisions/wrenfall/intake.md'
wtest = 'findings/wrenfall/storage.md'
wold = 'notes/wrenfall/first-plan.md'
wproposal = 'notes/wrenfall/expansion.md'
doc(wbrief, 'Wrenfall neighborhood seed exchange', '''# Why a seed exchange

Wrenfall helps balcony growers exchange locally saved vegetable seed without having to buy a full packet. Asha coordinates the exchange with the community library.

A packet on the shelf is a small gift from another grower rather than a commercial product. The exchange therefore keeps the donor's account of where the seed came from beside it. Asha checks that a donor has named the crop and the harvest season before asking a volunteer to sort the packet. Volunteers do not infer a variety from the photograph on a reused envelope. A library card identifies the visitor for ordinary borrowing; it does not verify the seed's origin or its health.

## What a volunteer actually does

The workbench has one tray for incoming packets and another for packets ready to shelve. An arrival stays in the first tray until the intake record has been checked. Visitors can ask for help reading a label without donating anything. This matters for people who have only a few containers and cannot promise a future harvest. A successful visit can be a useful conversation rather than a packet changing hands.

The library lends a dry drawer and space for a Saturday table. It does not inspect gardens, certify seed, or store packets in its kitchen. Asha keeps the volunteer rota separate from the donor register so that taking a shift does not look like donating a particular crop. When a donor withdraws a packet, the record retains the reason without attributing the remaining packets to that donor.

## What the trial should tell us

The end-of-season review will ask whether visitors found the labels understandable and whether the drawer remained usable through wet weather. Counting the number of envelopes alone would reward accepting material that nobody can identify. The exchange will retain unknown outcomes where a recipient never reports germination. It will not describe silence as a successful crop.
''')
wid = doc(wtest, 'Wrenfall drawer inspection', '''# Moisture check at the library

The Wrenfall drawer has no humidity control, and the inspection found condensation on damp paper envelopes after a wet delivery.

The caretaker put two marked empty envelopes beside the donated packets for three evenings. The damp envelope softened and stuck to its neighbor; the dry control remained separate. This was a practical check of the storage arrangement, not a laboratory estimate of seed viability. Volunteers must not turn the observation into a claim that every packet from that week has failed.

## Handling the result

The incoming tray was moved away from the window. The caretaker can replace a damaged drawer liner but cannot add a heated cabinet on the library circuit. A label saying that material is dry is useful only after someone has checked the packet. It cannot make an envelope dry while the donor is still handing it over.

Record visible moisture and return an affected packet to the donor. Do not quietly open all envelopes and mix their contents on a towel: that would lose identity and move responsibility for handling the seed to a volunteer who has not accepted it. The record should say why a packet was held back even if the donor later dries it and brings it again.
''')
doc(wdecision, 'Wrenfall accepted intake rule', '''# Shelf admission

Wrenfall accepts only dry vegetable seed with the crop and harvest season written on the packet; unidentified seed and ornamental bulbs are outside the trial.

Asha accepted this rule on October 5 after the drawer inspection. Volunteers can help a donor add a missing harvest season when the donor knows it. A volunteer cannot invent a season from the arrival date, and a confident variety guess is not a substitute for a crop label.

## Reason and review

The limit keeps the record legible and avoids storing damp material in a drawer that cannot control humidity. It also gives the review a comparable set of donations. Bulbs need a different storage arrangement and a separate handling plan. A popular request at the Saturday table does not provide either.

If a packet is refused, record the reason and return it rather than discarding someone else's material. Asha will review refusals after six sessions. A new intake category needs a recorded replacement decision; crossing out a line on a volunteer's printed sheet is not enough.

## Source

[Drawer inspection](/findings/wrenfall/storage.md).
''', type='decision', sources=[wid])
doc(wold, 'Wrenfall first collection plan', '''# Planning note, September 8

The September Wrenfall plan allowed sealed seed packets without a harvest-season label and aimed to open the drawer on September 20.

This was the plan before anyone had tested the library drawer. The group expected a short table demonstration to explain what could be exchanged, then proposed leaving packets on a shelf throughout the week. Asha asked the library caretaker to check the available furniture before printing a sign. The note records that request as work still to do, not as a favorable inspection result.

## Questions left for the visit

Would the incoming tray stay dry beside the window? Could a visitor distinguish a donated packet from an empty demonstration envelope? Who would take a packet home if the crop could not be identified? The early plan did not answer these questions. They should remain visible when explaining why the later rule is narrower.

This document was copied into the workspace in October with the other planning papers. Its import time does not make it the latest operating instruction. The September date identifies the plan under discussion; check the accepted intake decision before admitting a packet now.
''', date='2026-09-08', created_at='2026-10-24')
doc(wproposal, 'Wrenfall bulb shelf suggestion', '''# A donor's suggestion

The October 19 suggestion to add ornamental bulbs to Wrenfall has no recorded approval.

A donor offered a crate of surplus bulbs and a volunteer suggested placing it beneath the existing seed drawer. The meeting did not inspect the crate, agree a pest check, or identify someone to take away unsold material. The offer remains useful evidence of demand, but it does not create a storage agreement with the library.

## What remains unresolved

No named person is recorded as approving a bulb exception for Wrenfall.

Asha asked for a separate handling proposal before revisiting the idea. A dated photograph of an attractive display would not resolve the storage questions. Volunteers should explain the present intake rule to a donor instead of accepting a crate on the assumption that approval will follow. Record the request so that the later review can distinguish unmet demand from a category the exchange already supports.
''', date='2026-10-19', created_at='2026-10-19')

pbrief = 'notes/patchbay/collection.md'
pdecision = 'decisions/patchbay/listening.md'
pconsent = 'findings/patchbay/consent.md'
prunbook = 'notes/patchbay/transfer.md'
pproposal = 'notes/patchbay/publicity.md'
doc(pbrief, 'Patchbay oral history collection', '''# Listening before publishing

Patchbay preserves former dock workers' accounts for supervised listening in the local history room. Milo is the collection steward.

The volunteers used Relay as a short name on their first recording boxes. That label identifies this oral history collection only when the box or catalogue also says Patchbay. Another neighborhood group uses the same short name, so the archive does not treat the word alone as a unique accession label.

## The material we keep

A narrator may describe work, family life, migration, or a strike in the same recording. The catalogue gives a visitor a route into those themes without presenting the narrator's memories as a complete account of the docks. A later correction stays beside the recording with a date and the narrator's wording. Removing an uncomfortable sentence merely to make an anniversary display simpler would change the source.

Milo assigns accession numbers and checks that a listening copy can be found without opening the preservation master. The preservation copy and the signed permission form have different access rules. A visitor who can hear a recording does not thereby receive the narrator's contact details or a reusable media licence.

## Success for this collection

The review asks whether narrators recognize their contributions and whether visitors can locate the relevant testimony with its conditions. A large download count would be a misleading success measure for a collection designed around supervised access. Volunteers log an unanswered request rather than assuming the absence of a complaint means the narrator consented.
''', aliases=['Relay'])
pid = doc(pconsent, 'Patchbay narrator permission record', '''# Permission checked with the narrator

The Patchbay narrator forms permit listening inside the history room but do not grant permission to publish recordings on the open web.

The steward reread the signed forms with two narrators after a volunteer prepared a publicity clip. Both forms use the same listening-room clause. One narrator said that family members were comfortable with a local visitor hearing the interview but would not want it searchable by an employer. That explanation gives context to the clause; it does not widen the permission on anyone else's form.

## Check each accession

A narrator can later give a different permission in a new signed record. Until that happens, volunteers follow the form attached to the accession. Do not replace individual forms with a general statement that contributors seemed pleased at the launch. A good conversation is not a media licence.

The catalogue can publish a short factual description without posting the audio itself. If the description discloses a person who asked to remain unnamed, refer it to Milo before publication. Permission to keep a recording, permission to let a visitor hear it, and permission to republish it must remain separate fields.
''')
pdecisionid = doc(pdecision, 'Patchbay listening access decision', '''# Access for the first catalogue

Patchbay listening copies may be played on the history-room workstation by appointment; downloadable audio and promotional clips remain excluded.

The collections committee accepted this arrangement on October 5. The room has a supervised workstation and the steward can check the accession's permission before a visitor arrives. The committee did not authorize a public streaming platform or a general reuse licence.

## The visitor's route

A visitor asks for an accession by number or asks the steward to help identify a topic. The steward checks the attached form and confirms a slot. If a recording has no checked permission form, the visitor receives an explanation of the gap rather than an improvised exception. Accessibility requests return to the steward so that a suitable supervised arrangement can be agreed without silently changing the publication rule.

## Why this boundary matters

The narrator permission record covers listening in the room. Publishing a downloadable clip would make the recording available to people and uses outside that arrangement. A clip being short does not make it exempt. Keep future access ideas in a proposal with the original decision attached.
''', type='decision', sources=[pid], aliases=['Relay'])
doc(prunbook, 'Patchbay transfer bench procedure', '''# Transfer from a donated recorder

Patchbay volunteers must preserve the untouched audio master and verify the listening copy against its checksum before cataloguing the accession.

The volunteer gives the incoming medium a temporary receipt number before connecting the recorder to the transfer workstation. Work on a copy, record the original format, and retain a record of any conversion. If the recorder battery fails halfway through, mark the transfer incomplete instead of cataloguing two fragments as a complete interview.

## Identity through the handover

The checksum establishes that the listening file being catalogued is the one checked at the bench. It does not establish that the speaker's account is true or that the narrator consented to web publication. Attach the permission record separately. A volunteer who cannot identify the narrator should leave the identification field unresolved and ask the steward to investigate.

Milo checks the accession number against the receipt and stores the master on the preservation volume. The public catalogue points to the listening copy's accession record. Do not put the master in the workstation's visitor folder as a convenient shortcut. This separation makes it possible to repair a damaged listening copy while keeping a route back to the original source.
''', sources=[pid, pdecisionid])
doc(pproposal, 'Patchbay anniversary publicity request', '''# A proposed anniversary trailer

The proposed Patchbay anniversary trailer is awaiting narrator permission; the committee has not approved online audio excerpts.

The events team wanted a short sample to accompany a local newspaper story. A volunteer found a vivid sentence and drafted a caption. Neither the sentence's length nor the newspaper's willingness to carry it changes the signed listening-room permission. Milo asked the team to retain the draft and seek a separate permission rather than circulate an unapproved sample.

## What the record can establish

No named approver for a public Patchbay audio trailer is recorded.

The collection can answer a visitor's factual question about catalogue access while the publicity request remains open. It must not describe the proposed trailer as evidence that the collection is already online. Keep this request next to the access decision so that a later volunteer does not treat a ready-to-use media file as a permission record.
''', date='2026-10-22', created_at='2026-10-22', conflicts_with=[pdecisionid])

mbrief = 'notes/millrace/watch.md'
mdecision = 'decisions/millrace/escalation.md'
mgauge = 'findings/millrace/gauge.md'
mrunbook = 'notes/millrace/shift.md'
mproposal = 'notes/millrace/siren.md'
doc(mbrief, 'Millrace neighborhood water watch', '''# A message someone can act on

Millrace helps riverside residents receive a checked water-level update when the footpath gauge rises. Sana coordinates the volunteer watch.

Some old rota cards call the watch Relay. That alias belongs to the watch on those cards, but the history-room volunteers also use Relay for their oral history collection. A message with only that word needs clarification before anyone chooses a procedure.

## The volunteers' role

The watch reads a public gauge and passes a verified observation to the council duty officer. It does not forecast a flood or order residents to evacuate. Sana keeps one phone number for the officer and a paper fallback at the equipment box. The volunteer notes the actual time of an observation so that a late text does not look like a new reading.

Residents helped test whether the update was understandable when received on an ordinary phone. Several people wanted a photograph to accompany the number, while others preferred a short call. The watch retains both requests without assuming that every resident can receive an image. A failed message is logged as a delivery gap; it is not recorded as a resident choosing to ignore the warning.

## Reviewing a shift

The team check whether the observation could be verified and whether the officer received it. They do not measure success by how alarming the wording sounded. A later flood may have several causes beyond what a footpath marker can show. Keep the original reading, weather note, and handover time so that a review can separate a bad measurement from a delayed message.
''', aliases=['Relay'])
mid = doc(mgauge, 'Millrace gauge comparison finding', '''# Why one view was misleading

At Millrace, debris caught beside the footpath marker made one camera view look twelve centimetres higher than the staff-gauge reading.

The council technician compared both views during a dry afternoon inspection. Removing the debris changed the camera image without changing the river level. The finding does not mean the camera is always wrong. It means a camera image alone cannot establish a threshold crossing under these conditions.

## What a volunteer can check

Read the fixed staff gauge from the marked safe position, photograph the number if conditions permit, and retain the time. Do not step onto the lower platform to obtain a cleaner image. If the safe position is inaccessible, report an unverified observation to the officer rather than manufacture a checked number.

The technician owns calibration and maintenance. Volunteers can report damage and attach an observation, but cannot recalibrate the marker with a household ruler. A later inspection may change the comparison; until then, the duty officer needs to know whether the update comes from a direct gauge reading or a camera estimate. Preserve that distinction in the shift log.
''')
mdid = doc(mdecision, 'Millrace checked escalation rule', '''# When the watch sends an alert

Millrace volunteers notify the council duty officer only after two people confirm a staff-gauge reading at or above the red mark; volunteers do not issue evacuation orders.

Sana and the council liaison agreed the rule on October 5. A camera image can prompt a check, but it is not the second confirming person. If only one volunteer is present, the volunteer reports an unverified observation and asks the officer how to proceed.

## Why two readings

The debris comparison showed that an image could appear to cross the threshold when the fixed gauge had not. Requiring a second person reduces a specific reading risk; it does not guarantee that the river will remain safe after the check. The officer decides what further response is needed.

## Boundary of authority

The watch does not activate the town siren. An urgent observation should be passed promptly with its uncertainty instead of being rewritten as an official instruction. A future delegated power would need a recorded council decision and training, not just a louder phone message.
''', type='decision', sources=[mid], aliases=['Relay'])
doc(mrunbook, 'Millrace handover and message sheet', '''# Starting a watch shift

Millrace shift logs must identify both confirming volunteers, the observed gauge mark, and the time sent to the council duty officer.

The incoming pair check the phone charge and read the last unresolved entry before walking to the safe position. A missing earlier reading stays missing; the next pair must not copy a number forward to make a continuous chart. A stable-looking chart built from repeated guesses is less useful than an honest gap.

## Sending and receiving

Write the time of observation separately from the time of the message. If reception fails, use the paper fallback and record when contact succeeds. The officer can then judge whether a delayed update is still useful. A delivery receipt confirms arrival at a phone, not that the officer accepted an evacuation recommendation.

Sana reviews handovers after the shift. The review checks the source of each reading and who received the message. It does not silently repair the original entry. If a number was transposed, retain the correction with the person and time so that a later reviewer can reconstruct what the officer saw at the time.
''', sources=[mdid])
doc(mproposal, 'Millrace automatic siren idea', '''# A future automation suggestion

The Millrace proposal to trigger the town siren from a camera estimate is unapproved and does not replace the two-person gauge rule.

A volunteer suggested connecting the camera feed to an automatic threshold alert after a difficult overnight shift. The proposal did not include a calibrated comparison, a delivery test, or a council decision on authority. The technician asked that the debris finding be read before anyone treated the video feed as an independent measurement.

## Remaining authority gap

No council authorization for Millrace volunteers to activate the town siren is recorded.

The idea may still be worth investigating, but the watch should keep the measurement problem separate from the authority problem. Even an accurate camera would not itself delegate an emergency power. A prototype screen that lights up at the red mark is a demonstration, not an accepted operating procedure.
''', date='2026-10-23', created_at='2026-10-23', conflicts_with=[mdid])

case('wrenfall-orientation', 'wrenfall', 'orientation', 'I am covering Wrenfall next Saturday. Explain whom it serves, who keeps it running, and the boundaries I must explain to somebody bringing a donation.', [('purpose and steward', wbrief, ['Wrenfall helps balcony growers exchange locally saved vegetable seed without having to buy a full packet. Asha coordinates the exchange with the community library.']), ('intake boundary', wdecision, ['Wrenfall accepts only dry vegetable seed with the crop and harvest season written on the packet; unidentified seed and ornamental bulbs are outside the trial.'])], depth='shallow')
case('wrenfall-damp-packet', 'wrenfall', 'multi-source', 'For Wrenfall, why should a volunteer refuse a damp packet even when the donor says the crop is good, and what must the label establish before it goes in the drawer?', [('physical reason', wtest, ['The Wrenfall drawer has no humidity control, and the inspection found condensation on damp paper envelopes after a wet delivery.']), ('admission', wdecision, ['Wrenfall accepts only dry vegetable seed with the crop and harvest season written on the packet; unidentified seed and ornamental bulbs are outside the trial.'])])
case('wrenfall-bulbs', 'wrenfall', 'current', 'Can Wrenfall accept a crate of ornamental bulbs now, or does the donor need a different arrangement?', [('current boundary', wdecision, ['Wrenfall accepts only dry vegetable seed with the crop and harvest season written on the packet; unidentified seed and ornamental bulbs are outside the trial.']), ('proposal status', wproposal, ['The October 19 suggestion to add ornamental bulbs to Wrenfall has no recorded approval.'])])
case('wrenfall-historical', 'wrenfall', 'historical', 'Before the drawer inspection, what Wrenfall labeling requirement and opening date were envisaged?', [('old plan', wold, ['The September Wrenfall plan allowed sealed seed packets without a harvest-season label and aimed to open the drawer on September 20.'])], temporal={'to':'2026-09-30','order':'chronological'})
case('wrenfall-navigation', 'wrenfall', 'navigation', 'Wrenfall drawer inspection', [('known page', wtest, ['The Wrenfall drawer has no humidity control, and the inspection found condensation on damp paper envelopes after a wet delivery.'])])
case('patchbay-orientation', 'patchbay', 'orientation', 'A colleague has offered to help with Patchbay. Give them the point of the collection, the person responsible, and what a member of the public can actually do with a recording.', [('purpose and steward', pbrief, ["Patchbay preserves former dock workers' accounts for supervised listening in the local history room. Milo is the collection steward."]), ('public access', pdecision, ['Patchbay listening copies may be played on the history-room workstation by appointment; downloadable audio and promotional clips remain excluded.'])], depth='shallow')
case('patchbay-master', 'patchbay', 'multi-source', 'When Patchbay receives an interview recorder, what protects the original during cataloguing, and why would a verified copy still not be ready for a public website?', [('copy integrity', prunbook, ['Patchbay volunteers must preserve the untouched audio master and verify the listening copy against its checksum before cataloguing the accession.']), ('permission boundary', pconsent, ['The Patchbay narrator forms permit listening inside the history room but do not grant permission to publish recordings on the open web.'])])
case('patchbay-trailer', 'patchbay', 'protected', 'Who approved the public Patchbay audio trailer, and can the drafted media file be treated as their authorization?', [('unknown', pproposal, ['No named approver for a public Patchbay audio trailer is recorded.']), ('pending', pproposal, ['The proposed Patchbay anniversary trailer is awaiting narrator permission; the committee has not approved online audio excerpts.'])])
case('patchbay-phrase', 'patchbay', 'scope', 'Patchbay "listening copies"', [('phrase constraint', pdecision, ['Patchbay listening copies may be played on the history-room workstation by appointment; downloadable audio and promotional clips remain excluded.'])])
case('patchbay-access-reason', 'patchbay', 'rationale', 'Why does Patchbay require an appointment in the history room instead of letting a visitor download a short extract?', [('decision', pdecision, ['Patchbay listening copies may be played on the history-room workstation by appointment; downloadable audio and promotional clips remain excluded.']), ('consent', pconsent, ['The Patchbay narrator forms permit listening inside the history room but do not grant permission to publish recordings on the open web.'])])
case('millrace-orientation', 'millrace', 'orientation', 'Tomorrow is my first Millrace shift: set out the community benefit, the coordinator, and the limit of a volunteer\'s authority when the river appears to rise.', [('purpose and steward', mbrief, ['Millrace helps riverside residents receive a checked water-level update when the footpath gauge rises. Sana coordinates the volunteer watch.']), ('authority', mdecision, ['Millrace volunteers notify the council duty officer only after two people confirm a staff-gauge reading at or above the red mark; volunteers do not issue evacuation orders.'])], depth='shallow')
case('millrace-camera', 'millrace', 'rationale', 'Why is a dramatic Millrace camera picture insufficient to send a checked threshold alert, and what confirmation is required instead?', [('observation', mgauge, ['At Millrace, debris caught beside the footpath marker made one camera view look twelve centimetres higher than the staff-gauge reading.']), ('confirmation', mdecision, ['Millrace volunteers notify the council duty officer only after two people confirm a staff-gauge reading at or above the red mark; volunteers do not issue evacuation orders.'])])
case('millrace-log', 'millrace', 'multi-source', 'For Millrace, tell the outgoing pair what the next shift needs in the written log and why sending that log does not give volunteers control of the siren.', [('handover', mrunbook, ['Millrace shift logs must identify both confirming volunteers, the observed gauge mark, and the time sent to the council duty officer.']), ('authority gap', mproposal, ['No council authorization for Millrace volunteers to activate the town siren is recorded.'])])
case('millrace-siren', 'millrace', 'current', 'Does the Millrace automation idea supersede the checked escalation process, and may the watch activate the town siren?', [('status', mproposal, ['The Millrace proposal to trigger the town siren from a camera estimate is unapproved and does not replace the two-person gauge rule.']), ('authority', mproposal, ['No council authorization for Millrace volunteers to activate the town siren is recorded.'])])
case('relay-ambiguous', 'relay-ambiguous', 'protected', 'I found a rota card labeled Relay. Does that name alone tell me whether to use the recording procedure or the river-watch procedure?', [('archive ambiguity', pbrief, ['Another neighborhood group uses the same short name, so the archive does not treat the word alone as a unique accession label.']), ('watch ambiguity', mbrief, ['Some old rota cards call the watch Relay. That alias belongs to the watch on those cards, but the history-room volunteers also use Relay for their oral history collection.'])])
case('two-stewards', 'two-stewards', 'multi-source', 'Who should I contact for Patchbay and Millrace respectively, and what different community work is each person looking after?', [('collection', pbrief, ["Patchbay preserves former dock workers' accounts for supervised listening in the local history room. Milo is the collection steward."]), ('watch', mbrief, ['Millrace helps riverside residents receive a checked water-level update when the footpath gauge rises. Sana coordinates the volunteer watch.'])], protected=True)

ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / 'queries.json').write_text(json.dumps(queries, indent=2) + '\n')
(ROOT / 'rubric.json').write_text(json.dumps(rubric, indent=2) + '\n')
