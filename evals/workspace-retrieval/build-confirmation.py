from pathlib import Path
import json,hashlib
root=Path('evals/workspace-retrieval/confirmation'); queries=[];rubric=[]
def doc(file,title,body,**meta):
 h=hashlib.sha256(('confirmation-'+file).encode()).hexdigest();ident=f'mem_{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}'
 fm=dict(id=ident,title=title,type='note',date='2026-10-12',created_at='2026-10-12');fm.update(meta)
 p=root/'corpus'/file;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('---\n'+'\n'.join(f'{k}: {json.dumps(v) if not isinstance(v,str) else v}' for k,v in fm.items())+'\n---\n'+body.strip()+'\n');return ident
def case(family,journey,query,units,**options):
 ident=f'{family}-{journey}';queries.append(dict(id=ident,scenario=family,journey=journey,split='reserved',query=query,depth='normal',**options));rubric.append(dict(id=ident,answerability='bounded_unknown' if journey=='protected' else 'answerable',units=[dict(label=label,alternatives=[dict(file=file,required=clauses)]) for label,file,clauses in units],relevant=list(dict.fromkeys(u[1] for u in units)),interpretation='Fresh authored confirmation; names are identity hints, never approval evidence.'))
f='findings/selkie-access.md';d='decisions/selkie-passengers.md';p='notes/selkie-later.md';overview='pages/selkie-overview.md'
fid=doc(f,'Selkie landing inspection','''# Landing inspection

Selkie cannot board wheelchairs at the north landing because the gangway exceeds the safe gradient at low water.

The harbor engineer measured the gradient with the portable gauge at the afternoon low tide. The accessible route must therefore use the south landing until a new gangway has been inspected. This is a restriction on boarding location, not a claim that every wheelchair or every tide is unsafe.

## The rest of the route

The south landing has a level waiting area beside the ticket office. The inspection recorded one loose handrail fixing; maintenance tightened it before the return walk and left the work order with the harbor office. The engineer did not inspect the town bus stop, which belongs to the council. The access coordinator must check that connection independently before publishing a through-route description.

A photograph of the gangway was taken from the side to show the transition onto the boat. It should accompany the measurement rather than replace it. The same photograph can make a sloping surface look flatter when cropped. The inspection notebook retains the meter reading, the tide table, the vessel used, and the engineer's name.

## Conditions and next review

The restriction remains until an inspected replacement is recorded. A timetable change cannot remove it. Crew should tell a passenger which landing is usable and offer the operator's alternative connection instead of promising assistance that the gangway cannot safely support. If the south landing is unavailable, the operator must arrange an alternative or cancel the accessible sailing rather than silently reverting to the north landing.
''')
did=doc(d,'Selkie passenger decision','''# Recorded operating decision

Selkie will use the south landing for accessible sailings on Mondays and Fridays.

The operations manager approved this limited schedule on October 12 after reviewing the landing inspection. It is a two-day service with a staffed transfer, not permission for every advertised sailing to carry passengers through the same route.

## Rationale

The two-day schedule matches the accessible transfer crew's availability. A passenger who cannot use the north landing can request one of these staffed sailings. The booking clerk must explain both the landing and the transfer time before confirming a booking. Staff should retain the original request if a passenger declines, so the operator can see unmet demand rather than treating it as a completed journey.

## Evidence

[Landing inspection](/findings/selkie-access.md)

## Reopening the decision

A wider schedule needs the access coordinator and operations manager to confirm landing access and transfer staffing together. Neither a new poster nor an additional boat crew alone changes this decision.
''',type='decision',sources=[fid])
doc(p,'Selkie daily service idea','''# Later commercial suggestion

A daily accessible Selkie service was proposed on October 19, but it has no operational approval.

The marketing team wanted one simple timetable for the winter leaflet. The meeting did not remeasure the gangway or secure a daily transfer crew. The proposal therefore cannot replace the October 12 passenger decision. Keep this note with the leaflet draft so the printer does not treat the suggested schedule as an instruction.

## Open work

Ask the harbor engineer whether a replacement gangway is feasible. Ask the access coordinator which days could be staffed. A favorable response from one does not establish the other. No passenger should be promised a daily accessible sailing on the strength of this note.
''',conflicts_with=[did],date='2026-10-19',created_at='2026-10-19')
doc(overview,'Selkie service overview','''# Selkie at a glance

Selkie is a small passenger ferry trial. The service overview points staff to the current boarding decision and the physical-access inspection. It is not a booking confirmation.

## Working with the source record

The operations manager owns the sailing schedule, while the harbor engineer owns the landing inspection. Staff must read both for an accessible journey. A ticket tells the passenger when to arrive; it does not certify that a particular gangway can be used. The current process records unresolved accessibility questions before confirming a trip.

## Source route

[Passenger decision](/decisions/selkie-passengers.md) and [landing inspection](/findings/selkie-access.md).

## Unknowns

No approval of daily accessible sailings is recorded for Selkie.
''',type='page',dream=True,sources=[did,fid])
case('selkie','multi-source','Which landing and schedule should Selkie offer wheelchair passengers, and what physical restriction explains the choice?', [('schedule',d,['Selkie will use the south landing for accessible sailings on Mondays and Fridays.']),('physical constraint',f,['Selkie cannot board wheelchairs at the north landing because the gangway exceeds the safe gradient at low water.'])])
case('selkie','current','What Selkie passenger schedule is actually approved, and does the newer daily-service idea replace it?', [('accepted',d,['Selkie will use the south landing for accessible sailings on Mondays and Fridays.']),('proposal',p,['A daily accessible Selkie service was proposed on October 19, but it has no operational approval.'])])
case('selkie','protected','Who approved daily accessible sailings for Selkie?', [('unknown',overview,['No approval of daily accessible sailings is recorded for Selkie.'])])
case('selkie','navigation','Selkie landing inspection',[('known page',f,['Selkie cannot board wheelchairs at the north landing because the gangway exceeds the safe gradient at low water.'])])
f='findings/tamar-pressure.md';d='decisions/tamar-flushing.md';p='notes/tamar-proposal.md';runbook='notes/tamar-operator.md'
fid=doc(f,'Tamar pressure observation','''# Pressure logger review

The Tamar reservoir must retain forty cubic metres for the ridge fire hydrants; a full drain would break that reserve.

The water officer reconciled the level gauge with the recent pump test before writing the operating limit. The reserve is a fire-service requirement, not an estimate of household consumption. The ridge hydrants share the outlet from the small upper reservoir, so a flush that appears convenient at the treatment plant can interrupt a separate emergency function.

## Observations

The logger showed a pressure drop when the second outlet was opened. Staff retained the original trace and the valve sequence instead of reporting only the average pressure for the shift. A flat daily average could hide the short interval that matters to a hydrant crew. The observation does not establish that every household tap experienced the same drop.

## Maintenance responsibilities

The duty water officer may isolate the washout branch for inspection. The fire-service liaison confirms any proposal to change the emergency reserve. These are separate responsibilities. A contractor's availability does not grant authority to use stored water below the limit, and a quiet night is not a reason to assume that no emergency demand will arise.

A later review can revise the limit after a new hydraulic test and written fire-service agreement. Until then, the gauge reading and the reserve calculation remain attached to the flushing plan. Operators record unexplained readings and stop the work rather than treating a noisy sensor as permission to continue.
''')
did=doc(d,'Tamar flushing decision','''# Accepted maintenance window

Tamar flushing is limited to the washout branch between one and three in the morning; the reservoir must stay above the emergency reserve.

The maintenance lead accepted this plan on October 12. The purpose is to clear the branch sediment while preserving supply to the ridge. A full reservoir clean remains a separate job requiring an alternative emergency supply. The night window reduces ordinary demand but does not waive the reserve.

## Before opening the valve

The operator checks the level gauge, confirms the branch identification, and calls the duty water officer. A second person reads the valve label aloud. The crew log the initial level and the planned stop level on the same sheet. If the observed level falls faster than expected, the operator closes the valve and records the time before investigating.

## Evidence

[Pressure observation](/findings/tamar-pressure.md)

## Authorization boundary

No named person is recorded as approving a full drain of Tamar reservoir.
''',type='decision',sources=[fid])
doc(p,'Tamar full-drain suggestion','''# Contractor suggestion

The October 20 suggestion to drain Tamar reservoir completely is unapproved and does not replace the branch-only flushing decision.

The contractor wanted to clean the floor while the pump was being serviced. The meeting did not identify another source for the ridge fire hydrants. The maintenance lead recorded the idea as future work, with the emergency supply question still open. A quotation for the work is a cost estimate, not authority to empty the reservoir.

## Next evidence required

The fire-service liaison needs a documented alternative reserve and a tested isolation plan. The water officer must then review the hydraulic test. Until those records exist, operators retain the branch-only plan and the stop level written on the accepted work sheet.
''',conflicts_with=[did],date='2026-10-20',created_at='2026-10-20')
doc(runbook,'Tamar operator checklist','''# Night work checklist

This checklist routes operators to the accepted branch-flushing decision and the pressure observation. It does not authorize a full drain. The operator reads the reserve limit before leaving the depot and carries the duty water officer's number on paper.

- Check the gauge against the start level.
- Confirm the washout branch label with a second operator.
- Record each valve change and its time.
- Stop if the reservoir approaches the emergency reserve.

## Source route

[Accepted window](/decisions/tamar-flushing.md) and [reserve evidence](/findings/tamar-pressure.md).

A contractor request to go further returns to the maintenance lead. Operators do not add an unsigned instruction to this checklist at the worksite.
''',sources=[did,fid])
case('tamar','multi-source','What work window and drain limit should Tamar use, and why must water stay in the reservoir?', [('accepted window',d,['Tamar flushing is limited to the washout branch between one and three in the morning; the reservoir must stay above the emergency reserve.']),('emergency constraint',f,['The Tamar reservoir must retain forty cubic metres for the ridge fire hydrants; a full drain would break that reserve.'])])
case('tamar','current','Is the Tamar contractor suggestion to empty the reservoir approved, and what maintenance plan still governs?', [('accepted',d,['Tamar flushing is limited to the washout branch between one and three in the morning; the reservoir must stay above the emergency reserve.']),('proposal',p,['The October 20 suggestion to drain Tamar reservoir completely is unapproved and does not replace the branch-only flushing decision.'])])
case('tamar','protected','Who authorized a full drain of Tamar reservoir?', [('unknown',d,['No named person is recorded as approving a full drain of Tamar reservoir.'])])
case('tamar','navigation','Tamar operator checklist',[('known page',runbook,['Stop if the reservoir approaches the emergency reserve.'])])
(root/'queries.json').write_text(json.dumps(queries,indent=2)+'\n');(root/'rubric.json').write_text(json.dumps(rubric,indent=2)+'\n')
