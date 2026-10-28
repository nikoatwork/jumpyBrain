import assert from 'node:assert/strict';
import test from 'node:test';
import { savedVersionContext } from '../dist/adapters/http-server/note-workspace.js';

const you = { kind: 'human', id: 'browser:local-id' };
test('saved-version context labels only the exact local human identity as You', () => {
  const context = editor => savedVersionContext({ metadataStatus: 'current', editor }, you).editor;
  assert.equal(context({ kind: 'human', id: you.id, name: 'Local writer' }), 'You');
  assert.equal(context({ kind: 'human', id: 'another-browser', name: 'Alex' }), 'Person · Alex');
  assert.equal(context({ kind: 'human' }), 'A person');
  assert.equal(context({ kind: 'agent', id: you.id }), 'An agent', 'same ID does not turn an agent into You');
  assert.equal(savedVersionContext({ metadataStatus: 'current', editor: { kind: 'human' } }, { kind: 'human' }).editor, 'A person');
});

test('unavailable recognition cannot expose stale editor or date', () => {
  const unknown = { editor: 'Editor unknown', edited: 'Date unknown' };
  assert.deepEqual(savedVersionContext(undefined, you), unknown);
  assert.deepEqual(savedVersionContext({ metadataStatus: 'unavailable', editor: { kind: 'agent', name: 'Old name' }, updatedAt: '2026-10-28T12:00:00Z' }, you), unknown);
  assert.deepEqual(savedVersionContext({ metadataStatus: 'current', updatedAt: 'invalid' }, you), unknown);
});

test('declared agent names remain text and exact valid edit dates are formatted', () => {
  const name = '<img src=x onerror=alert(1)> & coworker';
  const date = '2026-10-28T12:00:00.000Z';
  const actual = savedVersionContext({ metadataStatus: 'current', editor: { kind: 'agent', name }, updatedAt: date }, you);
  assert.equal(actual.editor, 'Agent · ' + name);
  assert.equal(actual.edited, new Date(date).toLocaleString(undefined, { timeZoneName: 'short' }));
});


test('saved-version dates preserve date-only evidence and reject invalid calendar values', () => {
  const edited = updatedAt => savedVersionContext({ metadataStatus: 'current', updatedAt }, you).edited;
  assert.equal(edited('2026-10-28'), '2026-10-28', 'date-only values never become a timezone-shifted midnight');
  for (const invalid of ['2026-02-30', '2026-02-30T12:00:00Z', '2026-13-01', '2026-10-28T25:00:00Z', 'October 28, 2026', '2026-10-28T12:00:00']) {
    assert.equal(edited(invalid), 'Date unknown', invalid);
  }
});
