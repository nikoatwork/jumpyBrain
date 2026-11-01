import assert from 'node:assert/strict';
import { SourceSession, difference } from './model.mjs';

export function modelCases() {
  const results = [];
  const run = (id, operation) => { const details=operation(); results.push({ id, status: 'passed', ...(details??{}) }); };
  const edit = (session, actor, id, patch, baseRevision = session.revision) =>
    session.apply({ actor, id, epoch: session.epoch, baseRevision, ...patch });
  run('source-concurrent-independent-human-edits', () => {
    const session = new SourceSession('Alpha\nBeta');
    edit(session, 'human-a', 'a', { start: 5, deleteCount: 0, insert: ' A' }, 0);
    edit(session, 'human-b', 'b', { start: 10, deleteCount: 0, insert: ' B' }, 0);
    assert.equal(session.body, 'Alpha A\nBeta B');
  });
  run('source-repeated-text-addresses-read-offset-not-search', () => {
    const session = new SourceSession('same same\nsame same');
    edit(session, 'human', 'h', { start: 0, deleteCount: 0, insert: 'prefix ' }, 0);
    edit(session, 'agent', 'a', { start: 10, deleteCount: 4, insert: 'last' }, 0);
    assert.equal(session.body, 'prefix same same\nlast same');
  });
  run('source-overlap-rejected-with-canonical-and-draft-retained', () => {
    const session = new SourceSession('Original');
    edit(session, 'human-a', 'a', { start: 0, deleteCount: 8, insert: 'Human A' }, 0);
    const draft = 'Human B';
    assert.throws(() => edit(session, 'human-b', 'b', { start: 0, deleteCount: 8, insert: draft }, 0), { code: 'overlapping_edit' });
    assert.equal(session.body, 'Human A'); assert.equal(draft, 'Human B');
  });
  run('source-stream-duplicate-gap-and-cancel-preserve-human', () => {
    const session = new SourceSession('Human\nAgent: ');
    session.beginStream('agent', 'stream', session.body.length);
    session.chunk('agent', 'stream', 0, 'one ');
    edit(session, 'human', 'h', { start: 0, deleteCount: 0, insert: 'Edited ' });
    session.chunk('agent', 'stream', 1, 'two');
    assert.equal(session.chunk('agent', 'stream', 1, 'two').duplicate, true);
    assert.throws(() => session.chunk('agent', 'stream', 3, 'wrong'), { code: 'stream_gap' });
    session.cancel('agent', 'stream');
    assert.throws(() => session.chunk('agent', 'stream', 2, 'late'), { code: 'stream_inactive' });
    assert.equal(session.body, 'Edited Human\nAgent: one two');
  });
  run('source-undo-removes-only-own-edit-or-rejects-overlap', () => {
    const session = new SourceSession('Alpha Beta');
    edit(session, 'a', 'a1', { start: 5, deleteCount: 0, insert: ' A' });
    edit(session, 'b', 'b1', { start: session.body.length, deleteCount: 0, insert: ' B' });
    session.undo('a', 'undo-a');
    assert.equal(session.body, 'Alpha Beta B');
    const shared = new SourceSession('Hi');
    edit(shared, 'a', 'a1', { start: 2, deleteCount: 0, insert: ' there' });
    edit(shared, 'b', 'b1', { start: 4, deleteCount: 0, insert: ' HUMAN ' });
    assert.throws(() => shared.undo('a', 'undo-overlap'), { code: 'overlapping_edit' });
    assert.equal(shared.body, 'Hi t HUMAN here');
  });
  run('source-history-epoch-byte-and-surrogate-limits', () => {
    const session = new SourceSession('😀', { historyLimit: 2, maxBytes: 20 });
    assert.throws(() => edit(session, 'a', 'bad', { start: 1, deleteCount: 0, insert: 'x' }), { code: 'invalid_base_range' });
    for (let index = 0; index < 3; index++) edit(session, 'a', String(index), { start: 0, deleteCount: 0, insert: 'x' });
    assert.equal(session.history.length, 2); assert.equal(session.receipts.size, 2);
    assert.throws(() => edit(session, 'old', 'old', { start: 0, deleteCount: 0, insert: 'x' }, 0), { code: 'history_expired' });
    assert.throws(() => session.apply({ actor: 'a', id: 'epoch', epoch: 'old', baseRevision: 3, start: 0, deleteCount: 0, insert: 'x' }), { code: 'epoch_changed' });
    assert.throws(() => edit(session, 'a', 'huge', { start: 0, deleteCount: 0, insert: 'z'.repeat(30) }), { code: 'invalid_patch' });
    assert.deepEqual(difference('😀', '😁'), { start: 0, deleteCount: 2, insert: '😁' });
  });
  run('source-invalid-base-unicode-and-identity-collisions-reject', () => {
    const session = new SourceSession('A');
    edit(session, 'a', 'new', { start: 1, deleteCount: 0, insert: 'x'.repeat(100) }, 0);
    assert.throws(() => edit(session, 'b', 'invalid-old-offset', { start: 4, deleteCount: 0, insert: 'bad' }, 0), { code: 'invalid_base_range' });
    assert.throws(() => edit(session, 'b', 'bad-unicode', { start: 0, deleteCount: 0, insert: '\uD800' }), { code: 'invalid_patch' });
    edit(session, 'a:b', 'c', { start: 0, deleteCount: 0, insert: 'left ' });
    edit(session, 'a', 'b:c', { start: 0, deleteCount: 0, insert: 'right ' });
    assert.ok(session.body.startsWith('right left '));
  });
  run('source-stream-and-actor-state-stay-bounded', () => {
    const session = new SourceSession('A', { historyLimit: 2, maxActors: 2, maxStreams: 1 });
    session.beginStream('agent', 'idle', 1);
    assert.throws(() => session.beginStream('other', 'overflow', 1), { code: 'stream_limit' });
    session.cancel('agent', 'idle');
    assert.equal(session.streams.size, 0);
    session.beginStream('a:b', 'c', 1);
    session.cancel('a:b', 'c');
    session.beginStream('a', 'b:c', 1);
    edit(session, 'a', 'a', { start: 0, deleteCount: 0, insert: 'x' });
    edit(session, 'b', 'b', { start: 0, deleteCount: 0, insert: 'x' });
    assert.throws(() => edit(session, 'c', 'c', { start: 0, deleteCount: 0, insert: 'x' }), { code: 'actor_limit' });
    edit(session, 'a', 'a2', { start: 0, deleteCount: 0, insert: 'x' });
    assert.equal(session.versions.size, 3);
    assert.equal(session.streams.size, 0, 'idle stream beyond retained base is retired');
    assert.ok([...session.actorUndo.values()].every((stack) => stack.length <= 2));
  });
  run('source-exhaustive-independent-splices-preserve-both-arrival-orders', () => {
    let arrivalOrders=0;
    for (const body of ['abcdef', 'aaaaaa', 'abcabc']) {
      for (let left = 0; left <= body.length; left++) for (let leftDelete = 0; leftDelete <= Math.min(2, body.length-left); leftDelete++) {
        for (let right = left + leftDelete + 1; right <= body.length; right++) for (let rightDelete = 0; rightDelete <= Math.min(2, body.length-right); rightDelete++) {
          for (const leftInsert of ['', 'L']) for (const rightInsert of ['', 'R']) {
            const a = { start:left, deleteCount:leftDelete, insert:leftInsert }, b = { start:right, deleteCount:rightDelete, insert:rightInsert };
            const expected = body.slice(0,left)+leftInsert+body.slice(left+leftDelete,right)+rightInsert+body.slice(right+rightDelete);
            for (const order of [[['a',a],['b',b]],[['b',b],['a',a]]]) {
              const session = new SourceSession(body);
              for (const [actor,patch] of order) edit(session, actor, 'one', patch, 0);
              assert.equal(session.body, expected, JSON.stringify({body,a,b,order:order.map(([name])=>name)}));
              arrivalOrders++;
            }
          }
        }
      }
    }
    return {arrivalOrders};
  });
  run('source-noop-has-stable-identity-without-a-revision', () => {
    const session=new SourceSession('same'),request={actor:'human',id:'noop',epoch:session.epoch,baseRevision:0,start:0,deleteCount:4,insert:'same'};
    assert.equal(session.apply(request).unchanged,true);assert.equal(session.revision,0);
    assert.equal(session.apply(request).duplicate,true);
    assert.throws(()=>session.apply({...request,insert:'different'}),{code:'operation_identity_reused'});
  });
  run('source-undo-retry-is-idempotent-with-current-snapshot', () => {
    const session = new SourceSession('Alpha');
    edit(session, 'a', 'edit-a', {start:5,deleteCount:0,insert:' A'});
    const first = session.undo('a','undo-a');
    edit(session, 'b', 'edit-b', {start:5,deleteCount:0,insert:' B'});
    const second = session.undo('a','undo-a');
    assert.equal(second.duplicate,true);
    assert.equal(second.committedRevision,first.revision);
    assert.equal(second.body,'Alpha B');
    assert.equal(second.revision,session.revision);
  });
  run('source-restart-default-epoch-fences-old-read', () => {
    const old=new SourceSession('same Markdown'),reopened=new SourceSession(old.body);
    assert.notEqual(old.epoch,reopened.epoch);
    assert.throws(()=>reopened.apply({actor:'old',id:'replay',epoch:old.epoch,baseRevision:0,start:0,deleteCount:0,insert:'stale'}),{code:'epoch_changed'});
    assert.equal(reopened.body,'same Markdown');
  });
  return results;
}
if (process.argv[1]?.endsWith('/cases.mjs')) console.log(JSON.stringify(modelCases(), null, 2));
