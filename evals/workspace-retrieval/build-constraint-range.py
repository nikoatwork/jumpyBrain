#!/usr/bin/env python3
"""Same-author diagnostic fixtures. Never reads packets, scores or private data."""
import json
from pathlib import Path
import sys
import uuid

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / 'constraint-range'
queries, rubrics = [], []


def doc(file, title, body, date='2026-10-09', kind='note'):
    target = ROOT / 'corpus' / file
    target.parent.mkdir(parents=True, exist_ok=True)
    identity = uuid.uuid5(uuid.NAMESPACE_URL, 'jumpybrain-constraint-range/' + file)
    target.write_text(f'---\nid: mem_{identity}\ntitle: {title}\ntype: {kind}\ncreated_at: {date}T09:00:00Z\nevidence_date: {date}\n---\n\n{body.strip()}\n')


def case(slug, suffix, text, units, journey='current', protected=False):
    identity = f'{slug}-{suffix}'
    queries.append(dict(id=identity, scenario=slug, journey=journey, split='reserved', query=text,
                        depth='normal', protected=protected))
    rubrics.append(dict(id=identity, answerability='answerable', units=[dict(label=label,
                        alternatives=[dict(file=file, required=clauses)]) for label, file, clauses in units],
                        relevant=list(dict.fromkeys(file for _, file, _ in units)),
                        interpretation='Same-author mechanism diagnostic; exact source-bound clauses, not independent answer judgments.'))


for slug, name, activity, role, member, subject, decision, reason, proposal, signal, action, condition in [
    ('thistledown', 'Thistledown', 'seed lending', 'seed steward', 'Mina', 'unlabelled seed packets',
     'Thistledown lends only labelled vegetable seed to adult plot holders; unidentified seed and commercial resale remain outside the trial.',
     'Thistledown does not lend unlabelled seed because a missing variety record prevents the steward from checking the growing instructions.',
     'The Thistledown key-holder suggestion is unapproved; Mina remains the seed steward and a door key grants no lending authority.',
     'germination tray', 'record the counted shoots on the original batch sheet',
     'A germination tray count is a local observation, not certification of disease freedom; quarantine remains in force until Mina signs the batch sheet.'),
    ('bellwether', 'Bellwether', 'telescope borrowing', 'equipment steward', 'Oren', 'untrained night observers',
     'Bellwether lends small telescopes only to adults who completed the daylight setup check; solo night collection and solar viewing remain outside the trial.',
     'Bellwether does not authorize solo night collection because the dark yard prevents the steward from checking the tripod setup.',
     'The Bellwether key-holder suggestion is unapproved; Oren remains the equipment steward and a door key grants no borrowing authority.',
     'counterweight pin', 'record the pin position on the original equipment sheet',
     'A counterweight pin check is a local observation, not permission for solar viewing; the solar exclusion remains in force until a replacement decision is signed.'),
]:
    approved = f'decisions/{slug}/trial.md'
    proposed = f'notes/{slug}/key.md'
    handbook = f'notes/{slug}/handbook.md'
    doc(approved, f'{name} approved trial', f'# Current {activity} decision\n\n{decision}\n\n## Reason\n\n{reason}\n\n{member} is the {role}. A later suggestion needs a signed replacement decision before scope changes.', kind='decision')
    doc(proposed, f'{name} access suggestion', f'# Proposed access arrangement\n\n{proposal}\n\nThe meeting discussed convenience and collected volunteers. It recorded no replacement approval.', date='2026-10-22')
    # Long neutral operational record, with whole source lines smaller than the
    # packet budget. Evidence occurs well beyond a line-one 8 KiB expansion.
    lines = [f'# {name} field handbook', '', '## Maintaining the room record', '']
    for i in range(95):
        lines.extend([f'Record {i + 1}: Keep the room inventory card with its dated folder. The shelf photograph describes where an item was stored at inspection, rather than whether a later volunteer may lend it. Retain corrections beside the original entry so the next reviewer can distinguish a transcription error from a change in the agreement.', ''])
    lines.extend(['## Detailed observation procedure', '', condition, '',
                  f'For the {name} {signal} inspection, {action}.', '',
                  'A tick beside the observation confirms that this particular check was recorded. It does not waive the separate trial boundaries.', '',
                  f'Only {member}, the {role}, may close an unresolved inspection entry.', ''])
    for i in range(25):
        lines.extend([f'Archive note {i + 1}: Put the dated paper record back in its folder after reviewing it. A clean copy can help someone read an annotation but must retain the link to the signed original and the uncertainty that was recorded there.', ''])
    doc(handbook, f'{name} field handbook', '\n'.join(lines))
    doc(f'notes/{slug}/social.md', f'{name} volunteer picnic', '# Picnic ideas\n\nThe gathering has no operational borrowing or lending authority. Someone mentioned a new key holder and extra evening access, without agreeing to change the current trial.')

    case(slug, 'natural-not', f'Why does {name} not allow {subject}, and what is actually approved?',
         [('reason', approved, [reason]), ('approved scope', approved, [decision])], 'rationale')
    case(slug, 'natural-hyphen', f'Has the {name} key-holder suggestion changed the steward or the current trial?',
         [('proposal and retained authority', proposed, [proposal])])
    case(slug, 'natural-without', f'Can a volunteer at {name} act without the steward after receiving a key?',
         [('no authority from key', proposed, [proposal]), ('retained trial', approved, [decision])])
    case(slug, 'late-procedure', f'For the {name} {signal} inspection, what must be recorded and what qualification still applies?',
         [('inspection action', handbook, [f'For the {name} {signal} inspection, {action}.']),
          ('retained qualification', handbook, [condition])], 'multi-source')
    case(slug, 'late-authority', f'Who may close an unresolved inspection entry in the {name} field handbook and does its observation waive the trial boundaries?',
         [('closing authority', handbook, [f'Only {member}, the {role}, may close an unresolved inspection entry.']),
          ('scope preserved', handbook, ['A tick beside the observation confirms that this particular check was recorded. It does not waive the separate trial boundaries.'])], 'orientation')
    case(slug, 'explicit-phrase', f'What does {name} say about "{signal}"?',
         [('inspection action', handbook, [f'For the {name} {signal} inspection, {action}.'])], 'scope', True)
    case(slug, 'explicit-not', f'What {name} NOT picnic?', [('approved scope', approved, [decision])], 'protected', True)
    case(slug, 'explicit-exclusion', f'What {name} -picnic?', [('approved scope', approved, [decision])], 'protected', True)

ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / 'queries.json').write_text(json.dumps(queries, indent=2) + '\n')
(ROOT / 'rubric.json').write_text(json.dumps(rubrics, indent=2) + '\n')
print(f'{len(queries)} cases, {len(list((ROOT / "corpus").rglob("*.md")))} documents')
