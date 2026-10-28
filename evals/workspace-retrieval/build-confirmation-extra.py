from pathlib import Path
import hashlib,json
root=Path('evals/workspace-retrieval/confirmation-extra');queries=[];gold=[]
def doc(file,title,body,**meta):
 h=hashlib.sha256(('fresh-extra-'+file).encode()).hexdigest();i=f'mem_{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}'
 fm=dict(id=i,title=title,type='note',date='2026-10-04',created_at='2026-10-04');fm.update(meta)
 p=root/'corpus'/file;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('---\n'+'\n'.join(f'{k}: {json.dumps(v) if not isinstance(v,str) else v}' for k,v in fm.items())+'\n---\n'+body.strip()+'\n');return i
def case(name,journey,question,units):
 i=f'{name}-{journey}';queries.append(dict(id=i,scenario=name,journey=journey,split='reserved',query=question,depth='shallow' if journey=='orientation' else 'normal'))
 gold.append(dict(id=i,answerability='bounded_unknown' if journey=='protected' else 'answerable',units=[dict(label=l,alternatives=[dict(file=f,required=c)]) for l,f,c in units],relevant=list(dict.fromkeys(u[1] for u in units)),interpretation='Second frozen confirmation extension, policy unchanged. Require subject, actual permission, and governing constraints across displayed sources.'))
scenarios=[
('belltower','Belltower aims to let residents repair small household items instead of discarding them. Belltower is coordinated by Inez.',
'Belltower may run a hand-tool repair table for registered adults; mains-powered repairs and drop-in access remain outside approval.',
'Belltower repair sessions must finish before seventeen hundred.',
'The library caretaker locks the side entrance at seventeen fifteen and cannot supervise a later departure.',
'The newer Belltower suggestion to accept plug-in appliances is unapproved.',
'''## How the table works

A resident books a short slot and describes the object before bringing it to the library. The volunteer checks whether the object can be worked on with the listed hand tools. An unsuitable object is declined with an explanation and a route to a specialist repair shop. A booking is not a promise that the item can be repaired. The coordinator keeps a record of declined objects so that the project can learn what residents actually need rather than counting only successful repairs.

The library provides a folding table near the side entrance. Volunteers cover the table with a protective mat and count tools before the first booking. Small parts go in a labeled tray for each resident. A missing screw is recorded immediately; a similar loose screw from another tray is not a valid replacement. The resident remains with the object while the volunteer works, which lets them explain how it failed and see any remaining limitation.

### Recording the outcome

The record separates a completed repair, a temporary adjustment, a referral, and an object left unchanged. Calling every visit a repair would conceal how often volunteers could not help. A temporary adjustment includes the volunteer's explanation of when the resident should seek further work. The team do not invent a warranty from the fact that an object appeared to work on the table.

### Volunteer handover

The incoming volunteer checks the tool count and reads any unresolved incident before accepting a new slot. Volunteers can stop a session if the available equipment or supervision differs from the plan. Inez reviews incidents with the library contact; the next volunteer must not simply repeat an improvised workaround because it was used once before.

## Measures

The project records whether residents can use the item a week later, with an explicit unknown where nobody replies. An unanswered message is not a successful repair. Staff record referrals separately and preserve descriptions of unusual objects. These details can justify a future proposal for different tools, but they do not expand the current approval.
'''),
('copperfin','Copperfin aims to give first-time canal paddlers a short supported outing. Copperfin is coordinated by Dev.',
'Copperfin is approved for the sheltered basin with two qualified leaders; the open river reach remains excluded.',
'Copperfin must launch after ten in the morning and return before the afternoon lock cycle.',
'The lock operator reserves the shared slipway for commercial deliveries until ten in the morning.',
'The newer Copperfin proposal to add the river reach has no safety approval.',
'''## Arrival and equipment

Participants meet on the basin path rather than beside the slipway. A leader checks the attendance list and asks each participant to identify the craft they will use. The group try buoyancy aids on dry ground, with a second check before launching. A participant who cannot obtain a suitable fit stays ashore with a leader; borrowing an unsuitable size to keep the schedule is not an acceptable substitute.

The equipment log identifies each craft, paddle, and buoyancy aid. A damaged item is set aside with a visible label. The team record a missing item before leaving the store so that the next outing does not discover an unexplained gap. The supplier's inspection label and the leader's visible check serve different purposes and both remain on the record.

## On the water

One leader stays at the front of the group and one stays behind the least confident paddler. The planned turnaround is chosen by elapsed time and group condition rather than distance traveled. The leader records why the group turned back early if that happens. Completing a shorter outing together is a valid outcome; the record should not reward distance at the expense of keeping people supported.

### Weather check

The leaders review wind at the basin before launching and retain the observation with the forecast. The basin can be sheltered while the nearby river is rough. A calm local reading cannot establish conditions on an excluded stretch. If the weather changes, the group returns by the agreed basin route rather than taking a faster route through a lock.

### After the return

Participants leave the slipway before the crew count equipment. Dev records any difficulties with fitting, instruction, or the journey to the basin. These observations inform the next booking. A participant's willingness to return is useful feedback, but it is not a safety sign-off for a longer route or a different leader ratio.
'''),
('mothlight','Mothlight aims to help evening visitors explore the insect collection at their own pace. Mothlight is coordinated by Noor.',
'Mothlight approval covers a quiet route through the ground-floor insect gallery; the live-animal room remains closed to evening visitors.',
'Mothlight entry slots must be twenty minutes apart.',
'The front desk has one trained evening host, who must finish each arrival briefing before greeting the next group.',
'The newer Mothlight suggestion to include the live-animal room is a proposal without curatorial approval.',
'''## Visitor route

The route begins at the desk and passes through the dry insect displays before reaching the quiet seating area. The project uses a printed map that shows a short return route. Visitors can stop or leave without completing every display. Staff do not treat a shorter visit as a failure; a visitor may have found what they wanted or needed a quieter place before continuing.

The access host checks lighting and sound before opening the first slot. A screen that was quiet during setup can start an automatic clip later, so the host tests the whole sequence. If a clip cannot be silenced, the map must show an alternative route and the desk must explain it. A note to fix the clip next week does not help a visitor deciding whether to enter tonight.

### Collection interpretation

Labels distinguish a specimen observation from a wider ecological claim. A pinned moth can show wing structure but cannot establish how common that species is in the surrounding district. The curator keeps the collecting record with the case inventory. Staff can route a visitor to that record instead of guessing a location or season from the appearance of the specimen.

## Staff briefing

Noor briefs the host and the gallery attendant together. They agree which person stays with an arriving group and which person can respond to a request in the gallery. A volunteer arriving late must read the current briefing before taking over. A previous visitor's preferred route can be offered as an option but must not become an instruction for everyone.

### Review after each evening

The team record questions, interrupted arrivals, and areas visitors avoided. They retain uncertainty about why someone avoided a display unless the person explains it. Comparing these notes with attendance can identify a scheduling problem that a simple head count would hide. The review can suggest a later program, but changing rooms still requires the curator's recorded approval.
''')]
for name,purpose,scope,timing,constraint,proposal,body in scenarios:
 main=f'notes/{name}/brief.md';decision=f'decisions/{name}/scope.md';evidence=f'findings/{name}/site.md';later=f'notes/{name}/proposal.md';runbook=f'notes/{name}/operation.md'
 doc(main,f'{name.title()} project introduction',f'# Purpose and coordination\n\n{purpose}\n\n'+body)
 eid=doc(evidence,f'{name.title()} host constraint',f'# Host confirmation\n\n{constraint}\n\nThe host supplied this limit for the current trial. A participant suggestion or calendar change does not create extra staffing or access. Confirm a changed arrangement in writing before offering additional sessions.\n\n## Boundary\n\nThe host confirmation concerns availability. It does not itself approve a different audience, activity, equipment set, or route.\n')
 did=doc(decision,f'{name.title()} accepted scope',f'# Accepted operating scope\n\n{scope}\n\nThe responsible coordinator accepted this bounded scope on October 4 after reviewing the host arrangement. A later discussion remains a proposal until the responsible person records a replacement decision.\n\n## Reason for the limit\n\nThe trial tests whether the supported activity can run reliably with the people and facilities already available. Increasing the audience or adding a different activity would answer a different question.\n\n## Evidence\n\n[Host constraint](/{evidence})\n',type='decision',sources=[eid])
 doc(runbook,f'{name.title()} session timing',f'# Operating arrangement\n\n{timing}\n\nThis timing applies to the accepted trial. Check the host confirmation before offering a different timetable. An informal extension can create a commitment that the host cannot cover.\n\n## Before starting\n\nRead the accepted scope, check that the assigned people are present, and keep the stop procedure available. Record an unresolved discrepancy rather than filling it with an assumption from another project.\n\n## Evidence\n\n[Host constraint](/{evidence}) and [scope](/{decision}).\n',sources=[did,eid])
 doc(later,f'{name.title()} expansion suggestion',f'# Later suggestion\n\n{proposal}\n\nThe meeting did not secure the additional staffing, facilities, or specialist review that the suggestion would need. It preserves an idea for investigation, not an operating instruction.\n\n## Exception register\n\nNo named approver for expanding {name.title()} beyond its accepted scope is recorded. Ask the coordinator for a signed record before naming an approver or promising the extension.\n',conflicts_with=[did],date='2026-10-21',created_at='2026-10-21')
 case(name,'orientation',f'Bring a new teammate up to speed on {name.title()}: intended benefit, responsible coordinator, and what the present trial actually allows.', [('purpose and coordinator',main,[purpose]),('approved scope',decision,[scope])])
 case(name,'multi-source',f'What operating timetable should {name.title()} offer participants, and which host limitation makes that timetable necessary?', [('timing',runbook,[timing]),('host constraint',evidence,[constraint])])
 case(name,'current',f'What is the accepted operating scope for {name.title()}, and is the later expansion suggestion approved?', [('accepted scope',decision,[scope]),('later suggestion',later,[proposal])])
 case(name,'protected',f'Who signed the exception expanding {name.title()} beyond its accepted scope?', [('bounded unknown',later,[f'No named approver for expanding {name.title()} beyond its accepted scope is recorded.'])])
(root/'queries.json').write_text(json.dumps(queries,indent=2)+'\n');(root/'rubric.json').write_text(json.dumps(gold,indent=2)+'\n')
