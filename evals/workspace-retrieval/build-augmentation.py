from pathlib import Path
import json, hashlib
root=Path(__file__).resolve().parent/'augmentation'
(root/'corpus').mkdir(parents=True,exist_ok=True)
queries=[];rubrics=[]
def doc(file,title,body,**meta):
 p=root/'corpus'/file;p.parent.mkdir(parents=True,exist_ok=True)
 h=hashlib.sha256(file.encode()).hexdigest(); ident=f'mem_{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}'
 fields=dict(id=ident,title=title,type='note',date='2026-10-01',created_at='2026-10-01'); fields.update(meta)
 p.write_text('---\n'+'\n'.join(f'{k}: {json.dumps(v) if not isinstance(v,str) else v}' for k,v in fields.items())+'\n---\n'+body.strip()+'\n')
 return ident
def case(fam,journey,query,units,**opts):
 ident=f'{fam}-{journey}';queries.append(dict(id=ident,scenario=fam,journey=journey,split='development' if fam in ['meridian','estuary'] else 'reserved',query=query,depth='normal',**opts))
 rubrics.append(dict(id=ident,answerability='bounded_unknown' if journey=='protected' else 'answerable',units=[dict(label=label,alternatives=[dict(file=file,required=required)]) for label,file,required in units],relevant=list(dict.fromkeys(u[1] for u in units)),interpretation='Judge subject, governing scope, and applicable time together. A link is only a discovery hint.'))
families=[
('meridian','Meridian cold-chain trial','Nightjar','Only the sealed training cabinet is in scope; occupied vaccine storage must retain its existing alarm policy.',
'Raise the alert after twelve uninterrupted minutes above eight degrees.',
'''## Receiving and custody

The clinic receives insulated boxes at the service door. A courier and a nurse count the seals together, record the arrival time, and place a paper receipt in the tray beside the cabinet. A missing receipt triggers a call to the duty pharmacist rather than an assumption that the shipment was delayed. Staff do not copy patient labels into the temperature log. The exercise uses water packs so that trainees can open the door repeatedly without exposing medicine.

Cabinet temperature and box temperature answer different questions. A box can remain cold after a door opens, while the air sensor briefly registers the room. The trial therefore keeps both readings and the observer's explanation. Replacing either reading with an average would remove the evidence needed to distinguish a door event from a failed compressor. Facilities keeps responsibility for electrical repairs; the nursing team only records the event and isolates the training stock.

### Shift handover

At each handover, the outgoing nurse reads the last recorded maximum aloud. The incoming nurse checks the current display and initials the sheet. Differences are preserved on the paper record, with a correction on a new line. A trainee must not erase a high reading because the next reading returned to normal. The supervisor reviews these discrepancies at the end of the exercise, before any proposal to change a real cabinet is considered.

### Probe placement

The spare probe sits between two water packs on the middle shelf. Placing it against the rear wall exaggerates the effect of the cooling plate, while leaving it beside the door exaggerates brief access events. The observer photographs the placement without staff names. A moved probe starts a new observation interval. Comparison across intervals requires the placement note, otherwise a difference in readings could be caused by setup rather than equipment.

## Roles and escalation

A facilities technician checks the power supply and the door gasket. The pharmacist decides whether the clinic can use an alternative storage cabinet. The exercise coordinator may stop the rehearsal if clinical work needs the room. No participant is authorized to change the occupied cabinet's alarm merely because a training exercise produced fewer interruptions. The review records both missed alerts and unnecessary alerts, because reducing only one can make the other worse.

### Incident record

The form records which cabinet was observed, which clock supplied the timestamp, and whether the door was open. The cabinet clock is compared with the wall clock before the first reading; any offset stays on the form for the rest of that shift. Observers describe visible events instead of diagnosing the compressor. An unsigned form remains an observation, not a maintenance instruction. The pharmacist keeps the original and sends an anonymized copy to the exercise coordinator.''',
'Use the paper fallback overnight.', 'The basement training room has no reliable mobile signal after the steel fire door closes.'),
('estuary','Estuary sediment survey','Mudlark','The following sampling procedure applies to the closed inlet only; the public bathing beach is excluded.',
'Take three sediment cores at each marked station before the tide turns.',
'''## Boat preparation

The field lead checks the forecast, fuel, radio, and return tide before the launch. The coxswain can cancel the trip without waiting for the science team. Sampling targets never override the navigation limit. The group carries a printed station map because the chart tablet may lose its connection behind the headland. The map records the planned route; the field notebook records where the boat actually stopped.

Each jar receives its station and replicate code before leaving shore. Spare labels travel in a dry bag, separated from the permanent markers. If a label gets wet, the recorder copies its text onto a fresh label and retains the damaged original in the notebook. Inventing a station code after returning to the lab would prevent later reviewers from distinguishing a transcription error from an unplanned sample.

## Contamination controls

The crew rinse the corer between stations and collect a blank after the first rinse. A blank that contains sediment is retained and marked as a handling deviation. The laboratory must see this result alongside the station samples. Throwing it away would make a clean-looking dataset at the cost of hiding contamination. Gloves are changed after handling the anchor chain, which often carries sediment from a different part of the inlet.

### Chain of custody

The recorder counts jars with the laboratory technician at delivery. They both sign the transfer sheet, and any broken seal is photographed before opening. Samples stay cold during transport but are not frozen on the boat. The technician records the arrival condition independently of the field notes. A signature confirms receipt of a jar, not the validity of a scientific conclusion about the inlet.

### Interpretation boundary

A station observation is local to the coring point and tide. It is not a declaration that every channel has the same sediment. The report must show the spread among replicates and identify any missing sample. A convenient average cannot replace that spread. Weather and tide notes remain attached to the notebook so that a later survey can assess whether the sampling conditions were comparable.

## Community communications

Residents can watch from the quay, but the crew do not invite visitors onto the workboat. Questions about bathing advice go to the public-health office. The survey team can describe its methods and planned reporting date; it cannot issue a beach reopening notice. Draft maps are marked as working material because station names resemble popular swimming spots even though those spots are outside the permit.

The final map includes a legend distinguishing planned stations, completed stations, and places skipped for safety. Skipped locations remain visible rather than being silently interpolated. A repeat visit needs a new route assessment. The project archivist keeps the permit with the notebook so that future users can see where the team was allowed to work.''',
'Schedule laboratory delivery before sixteen hundred.', 'The receiving laboratory closes its hazardous-material hatch at sixteen thirty.'),
('vellum','Vellum manuscript digitization','Glasswing','These settings are authorized for modern practice sheets only; original manuscripts require the conservator at the cradle.',
'Use the overhead light at thirty percent and capture one calibration frame before each folio.',
'''## Reading-room arrangement

The digitization bench sits beside the supervised reading area so that a conservator can inspect the cradle without carrying an open volume across the room. A trolley carries only one volume at a time. Its shelf is cleared before the archivist brings a new box, and the old box returns to closed storage before the next volume arrives. This avoids putting an unprotected binding beside a stack of loose reference sheets.

Readers reserve the bench through the ordinary reading-room diary. The project cannot displace an appointment with an original object on the strength of a production target. A canceled session stays in the diary with its reason so that throughput estimates include the cost of safe handling. Staff record preparation, capture, inspection, and return separately; total bench time is not the same as camera exposure time.

## File handling

The camera writes to a local capture card. At the end of a session the operator copies files to the accession folder and runs the archive's checksum tool. The card remains untouched until a second staff member confirms the copy. A filename correction creates a new manifest entry rather than rewriting the original manifest. The original capture sequence remains recoverable if the page order is disputed later.

### Calibration and review

The calibration target includes a scale and neutral patches. The operator checks that neither is covered by the cradle straps. A sharp image of the writing is insufficient if the scale is missing, because later readers may use the image for measurements. Color correction recipes are recorded beside the derivatives. The archive preserves the uncorrected original as well as the access copy, allowing a later operator to reproduce or challenge the adjustment.

### Material condition

A leaf that resists opening is left in place. The operator records the obstruction and calls the conservator rather than pressing the binding flat. Marginalia close to the gutter may therefore be partially hidden. The catalog should describe that limitation instead of presenting a cropped image as the whole leaf. Detached fragments remain in their existing envelopes until a conservator decides how to support them.

## Access and rights

Ownership of a physical manuscript does not establish permission to publish every image. The rights officer records the applicable donor terms separately from the capture log. A reading-room access copy may be available while public distribution remains restricted. Staff should route a request for commercial reproduction to the rights officer instead of inferring approval from the presence of an image in the catalog.

The project review compares legibility and handling incidents across sessions. It does not reward operators for forcing a difficult volume to meet a daily page count. A missed image has a visible catalog note and a route to request supervised access. The digitization report retains these gaps because a complete-looking folder can otherwise hide the portions that researchers most need to inspect.''',
'Book two supervised mornings each week.', 'The conservator is assigned to the archive only on Tuesday and Thursday mornings.'),
('bracken','Bracken school transport rehearsal','Copperleaf','The route instructions below cover an empty-bus rehearsal; carrying pupils still requires the council transport authorization.',
'Wait at the west layby for six minutes before entering the narrow lane.',
'''## Route walk

The transport officer walks the lane with the driver before the rehearsal. They mark passing places on a paper plan and photograph overhanging branches. A passing place is useful only if the bus can enter and leave it without reversing onto a blind bend. The plan distinguishes observations from permission: a farmer's open gate does not authorize the bus to use a private yard as a turning circle.

The rehearsal starts after the morning traffic peak. Observers record journey time at the school gate and at the junction, using synchronized watches. They retain waiting time as a separate column. Combining movement and waiting into a single average would hide whether delays came from the road or from the planned hold. An unusually quiet day is recorded as such instead of being treated as a representative service day.

## Vehicle and crew

The depot mechanic checks mirrors, reversing alarm, and the accessible ramp. The ramp test takes place on level depot ground before departure. The route observer sits behind the driver and does not give last-second directions. If the driver misses a turn, the bus continues to the agreed safe stopping point. The observer records the deviation; an improvised turn can create more risk than a delayed rehearsal.

### Communications

The driver uses the depot radio at the two named checkpoints. If the signal fails, the crew use the printed contingency route and return to the depot. The observer handles the log so that the driver never needs to operate a phone while moving. Parents are not sent rehearsal arrival messages because no pupil collection is being tested. The school office receives a completion call after the bus is parked.

### Stop assessment

The team measures sight lines from the waiting area, including the view from a child's height. A shelter does not make a stop suitable if the bus cannot pull clear of traffic. The officer records lighting, drainage, and the route from the footpath. A checklist tick is accompanied by the location photograph so that a later reviewer can understand what was inspected rather than assuming every layby has the same layout.

## Service planning

The council will review the rehearsal log with the school accessibility lead. A proposal for a pupil service must address supervision, passenger capacity, and the needs of children who cannot use the ordinary steps. None of these is established by driving an empty bus along the lane. Cost estimates therefore distinguish the rehearsal vehicle from the eventual service vehicle and include an attendant where required.

The officer publishes a summary of route issues after review. Households can correct location descriptions through the school office, but the summary does not invite informal bookings. The route remains a proposal until the council issues the transport authorization and confirms the collection list. A new map or a driver's availability does not substitute for that recorded decision.''',
'Use a single bus in the lane at a time.', 'The bridge survey permits only one heavy vehicle on the narrow span.'),
('saffron','Saffron community kitchen allergen exercise','Emberplate','The recipe changes in this section concern the staff tasting batch; public meals retain the signed allergen recipe.',
'Replace the nut garnish with toasted pumpkin seeds and label the tray before plating.',
'''## Delivery checks

The receiving cook compares each ingredient with the order and keeps the supplier label. A substitute product goes to the lead cook before entering the preparation area. Similar packaging is not evidence that two products have the same ingredients. The receiving log records the exact substitute and the reason it was accepted or held. Packaging stays available until the batch record has been reviewed.

Dry stores and chilled stores have different checking routines. A damaged dry bag can contaminate neighboring sacks, while a chilled delivery can appear intact after a temperature excursion. Staff record the condition they observe rather than marking every delivery as acceptable because the supplier is familiar. A rejected item stays physically separate with a clear label until collection.

## Preparation sequence

The team clean the demonstration bench before bringing out utensils. Color labels identify the exercise equipment, but color alone is insufficient for an unfamiliar volunteer. Each tray also carries a written description. The lead cook gives a spoken briefing at the start of the session and asks a volunteer to explain the separation rule back. This check catches a misunderstood instruction before food is handled.

### Cleaning evidence

The supervisor signs the cleaning sheet after inspecting the bench. An unsigned sheet triggers a new clean, even if the surface looks tidy. Visible cleanliness and allergen control answer different questions. The team do not infer that an ordinary rinse removes every ingredient. Any contact with the public-meal preparation equipment is recorded as a deviation and escalated to the food-safety lead.

### Participant observations

Participants report taste and texture on a separate sheet from the handling record. A preferred flavor does not establish that the revised recipe can be served safely. The review keeps negative comments and records how many people actually tasted each version. Leaving an untouched sample off the denominator would make a popular-looking result that misrepresents participation.

## Public service boundary

The public menu is printed from the signed recipe register. Volunteers cannot change that register by editing a tasting worksheet. A request for a new public recipe needs the food-safety lead to review ingredients, supplier evidence, cross-contact controls, and the wording on the menu. The exercise can provide observations for that review, but it does not grant permission to serve the revised dish.

The duty manager keeps the exercise leftovers separate from public service and records their disposal. Donating an unapproved tray would bypass the same controls as serving it. The session ends with a count of utensils and a clean-down check. The kitchen records deviations and unanswered questions before planning another tasting, rather than treating a completed session as proof that every issue has been resolved.''',
'Run the tasting after the lunch service has closed.', 'The kitchen has one preparation bench and cannot separate a test batch during public service.'),
('quartz','Quartz accessible theater soundcheck','Softbell','This sound profile is for the closed technical rehearsal; ticketed performances keep the approved access specification.',
'Cap the foyer chime at fifty decibels and leave a ninety-second quiet interval.',
'''## Building walk-through

The stage manager walks the visitor route from the pavement to the auditorium before opening the technical session. The route includes the ticket desk, accessible toilet, lift, and quiet room. A clear route on the seating plan is not sufficient if a delivery trolley blocks the lift lobby. The duty technician records the actual obstruction and who will remove it before the next rehearsal.

The team test the induction loop using the theater's receiver rather than relying on the indicator lamp. A working lamp can show power without proving that a usable signal reaches every seat. Test positions include the balcony edge and the wheelchair spaces. The log retains weak positions alongside successful ones so that an average reading cannot hide a visitor's likely experience.

## Cue sheet

Each technical cue has a caller, a receiver, and a stop instruction. The sound operator repeats the cue number before playback. A missed cue is marked in the log and repeated only after the stage manager confirms the room is ready. The team do not compensate for a missed quiet interval by playing several cues quickly. Timing is part of the observation, not an inconvenience to be erased from the record.

### Measurement placement

The meter sits at the marked listening position away from the loudspeaker cabinet. The operator notes whether the foyer doors were open and whether the ventilation was running. These conditions can change both the level and the character of the sound. A number without its measurement conditions should not be copied into the performance specification as if it were a stable property of the equipment.

### Visitor representation

The access advisor records comments from invited observers separately from engineering measurements. Neither replaces the other. A low meter reading can still accompany a distressing sound, and a comfortable rehearsal for one group does not establish that every audience member will be comfortable. The report retains these differences instead of averaging comments into a single approval score.

## Performance preparation

Front-of-house staff receive the approved visitor information before tickets go on sale. Draft rehearsal notes may be used to prepare questions for the access advisor, but they must not replace the signed access specification on the public page. Any revision needs a recorded review and a check that the ticket desk, venue page, and staff briefing describe the same offer.

The final technical meeting records unresolved points with owners. A ticketing deadline does not convert an unresolved issue into an accepted limitation. If a change cannot be tested before sale, the venue manager decides whether to delay the listing or retain the existing specification. The rehearsal record stays available so that a future team can see which observations supported the choice and which questions remained open.''',
'Keep the technical session within the morning booking.', 'The venue lease reserves the hall for a hearing-support group every afternoon.')]
for fam,title,alias,scope,action,operations,schedule,restriction in families:
 main=f'notes/{fam}/handbook.md'; evidence=f'findings/{fam}/constraint.md'; decision=f'decisions/{fam}/schedule.md'
 constraint_id=doc(evidence,f'{fam.title()} site restriction',f'# Site observation\n\n{restriction}\n\nThe site lead checked this restriction on October 1. It constrains scheduling, but does not authorize a public rollout.\n\n## Evidence quality\n\nThis is an observed operating constraint, not a forecast of future availability. A change needs confirmation from the site lead.\n')
 decision_id=doc(decision,f'{fam.title()} session arrangement',f'# Session arrangement\n\n{schedule}\n\nThe scheduling lead accepted this arrangement on October 2 because of the site restriction. It remains a limited exercise rather than a public service.\n\n## Evidence\n\n[Site restriction](/{evidence})\n\n## Revisit\n\nRevisit after a written change from the site lead. An ordinary calendar invitation cannot change the constraint.\n',type='decision',sources=[constraint_id])
 body=f'# {title}\n\n{scope}\n\n{operations}\n\n## Exercise profile\n\n{scope}\n\n### Operator steps\n\n{action}\n\nThe operator records deviations rather than silently adjusting the setting.\n\n## Evidence\n\n[Scheduling decision](/{decision})\n\n## Approval ledger\n\nNo public-service exception approver is recorded for {fam.title()}. The rehearsal lead can stop the exercise but cannot approve public use.\n'
 doc(main,title,body,aliases=[alias],sources=[decision_id])
 # Lexical hard negatives are real neighboring procedures with matching vocabulary and different scope.
 doc(f'notes/{fam}/proposal.md',f'{fam.title()} public expansion proposal',f'# Unaccepted public expansion proposal\n\nThe team discussed public use of the {title.lower()} after the exercise. This proposal repeats the operator steps for discussion: {action}\n\nThe public expansion is not approved. The exercise profile is still limited by the original handbook.\n\n## Working schedule\n\nA daily public session was suggested. No site-lead confirmation or signed public authorization is attached.\n\n## References\n\n[Handbook](/{main}) and [missing approval](missing-approval.md).\n',conflicts_with=[decision_id])
 case(fam,'scope',f'Under {alias}, what operator setting is allowed and does it apply to public operation?', [('identity',main,[f'aliases: ["{alias}"]']),('governing restriction',main,[scope]),('operator action',main,[action])])
 case(fam,'ranking',f'What preparation and observation controls does the {fam.title()} handbook require before changing the public service?', [('restriction',main,[scope]),('deviation record',main,['The operator records deviations rather than silently adjusting the setting.'])])
 case(fam,'multi-source',f'What session arrangement should {fam.title()} use, and which site restriction explains it?', [('arrangement',decision,[schedule]),('constraint',evidence,[restriction])])
 case(fam,'protected',f'Who approved public use of {fam.title()}?', [('bounded uncertainty',main,[f'No public-service exception approver is recorded for {fam.title()}.','The rehearsal lead can stop the exercise but cannot approve public use.'])])
# Explicit adversaries: cycles, hub, duplicate IDs, broken targets, ordinary-link-only distractions.
doc('notes/relationships/hub.md','Exercise reading-room links','# Reading list\n\n'+ '\n'.join(f'- [{f[0]}](../{f[0]}/handbook.md)' for f in families)+'\n\nThese ordinary links are navigation suggestions, not shared authorization.\n')
doc('notes/relationships/cycle-a.md','Cycle A','# Cycle A\n\nNo approval evidence.\n',sources=['/notes/relationships/cycle-b.md'])
doc('notes/relationships/cycle-b.md','Cycle B','# Cycle B\n\nNo approval evidence.\n',sources=['/notes/relationships/cycle-a.md','missing.md'])
(root/'queries.json').write_text(json.dumps(queries,indent=2)+'\n');(root/'rubric.json').write_text(json.dumps(rubrics,indent=2)+'\n')
