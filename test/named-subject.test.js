import test from 'node:test';
import assert from 'node:assert/strict';
import { namedSubjectFor, matchesNamedSubject } from '../dist/core/retrieval-policy/index.js';
import { prioritizeNamedIdentity } from '../evals/workspace-retrieval/identity-policy.mjs';
import { supplementNamedCandidates } from '../evals/workspace-retrieval/discovery-policy.mjs';

const metadata = [
  { title: 'Aspen introduction' },
  { title: 'Aspen decision' },
  { title: 'Host limitation', tags: ['aspen'] },
  { title: 'Workshop handbook', aliases: ['Nightjar'] },
  { title: 'Birch introduction' },
  { title: 'Birch decision' },
];

test('named subjects require one literal canonical name, not lowercase, substrings or mixed subjects', () => {
  assert.equal(namedSubjectFor('What does Aspen permit?', metadata), 'Aspen');
  assert.equal(namedSubjectFor('Under Nightjar, who coordinates the workshop?', metadata), 'Nightjar');
  for (const query of ['What does aspen permit?', 'Aspenwood purpose', 'Compare Aspen and Birch', 'Compare Aspen and Nightjar', 'Unknown project owner', '']) {
    assert.equal(namedSubjectFor(query, metadata), undefined, query);
  }
});

test('duplicate titles and tags alone never establish a subject', () => {
  assert.equal(namedSubjectFor('Field handbook', [{ title: 'Field handbook' }, { title: 'Field handbook' }]), undefined);
  assert.equal(namedSubjectFor('Aspen trial', [{ title: 'Workshop record', tags: ['Aspen'] }]), undefined);
  assert.equal(namedSubjectFor('Nightjar permissions', [{ title: 'Workshop record', aliases: 'Nightjar' }]), 'Nightjar');
  assert.equal(namedSubjectFor('Nightjar permissions', [{ title: 'Workshop record', aliases: ['Nightjar permissions'] }]), undefined);
});

test('named subject matching uses exact title prefixes or aliases and case-insensitive exact tags', () => {
  assert.equal(matchesNamedSubject({ title: 'Aspen introduction' }, 'Aspen'), true);
  assert.equal(matchesNamedSubject({ title: 'The Aspen introduction' }, 'Aspen'), false);
  assert.equal(matchesNamedSubject({ title: 'Aspenwood introduction' }, 'Aspen'), false);
  assert.equal(matchesNamedSubject({ aliases: ['Aspen'] }, 'Aspen'), true);
  assert.equal(matchesNamedSubject({ aliases: ['aspen'] }, 'Aspen'), false);
  assert.equal(matchesNamedSubject({ aliases: 'Aspen' }, 'Aspen'), true);
  assert.equal(matchesNamedSubject({ tags: ['ASPEN'] }, 'Aspen'), true);
  assert.equal(matchesNamedSubject({ tags: ['aspenwood'] }, 'Aspen'), false);
  assert.equal(matchesNamedSubject({ tags: 'Aspen' }, 'Aspen'), false);
  assert.equal(matchesNamedSubject({ title: null, aliases: null, tags: null }, 'Aspen'), false);
});

test('named subject recognition preserves Unicode letters and literal spelling', () => {
  const records = [{ title: 'Érable introduction' }, { title: 'Érable decision' }];
  assert.equal(namedSubjectFor('What does Érable allow?', records), 'Érable');
  assert.equal(namedSubjectFor('What does érable allow?', records), undefined);
  assert.equal(matchesNamedSubject({ tags: ['ÉRABLE'] }, 'Érable'), true);
});

test('production subject helpers reproduce frozen eval discovery and identity membership', () => {
  const documents = new Map(metadata.map((frontmatter, index) => [`note-${index}.md`, { relativePath: `note-${index}.md`, frontmatter }]));
  const rows = [...documents.keys()].reverse().map(file => ({ provenance: { file } }));
  for (const query of ['What does Aspen allow?', 'Nightjar workshop limits', 'Compare Aspen and Birch', 'What does aspen permit?', 'Unknown owner']) {
    const subject = namedSubjectFor(query, [...documents.values()].map(document => document.frontmatter));
    const match = row => subject !== undefined && matchesNamedSubject(documents.get(row.provenance.file).frontmatter, subject);
    const ordered = subject ? [...rows.filter(match), ...rows.filter(row => !match(row))] : rows;
    assert.deepEqual(ordered, prioritizeNamedIdentity(rows, documents, query), query);
    const discovered = supplementNamedCandidates([], documents, query);
    const expectedFiles = subject ? [...documents.values()].filter(document => matchesNamedSubject(document.frontmatter, subject))
      .map(document => document.relativePath).sort().slice(0, 8) : [];
    assert.deepEqual(discovered.added.map(row => row.file), expectedFiles, query);
  }
});
