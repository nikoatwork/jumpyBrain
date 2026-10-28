import assert from 'node:assert/strict';
import test from 'node:test';
import { relatedPageQuery, selectRelatedPages, installRelatedPages } from '../dist/adapters/http-server/related-pages.js';

const id = n => `mem_a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hit = (n, score, title = 'Paraphrase') => ({ provenance: { metadata: { id: id(n), title } }, score: 10, scoreBreakdown: { qmdScore: score } });
test('related pages use saved bounded text and at most five unique strong matches', () => {
  assert.equal(relatedPageQuery('  Sleep\nquality\0 ', 'ignored draft'), 'Sleep quality');
  assert.equal(relatedPageQuery('x'.repeat(1000), '').length, 240);
  assert.equal(relatedPageQuery('', 'First\nbody'), 'First body');
  const strong = Array.from({ length: 7 }, (_, n) => hit(n + 2, .9));
  const result = selectRelatedPages('sleep quality', [hit(1, 1), strong[0], strong[0], ...strong.slice(1), hit(20, .6), hit(21, undefined)], id(1));
  assert.deepEqual(result.map(page => page.id), strong.slice(0, 5).map(h => h.provenance.metadata.id));
  assert.deepEqual(selectRelatedPages('sleep quality', [hit(20, .74), hit(21, NaN), hit(22, Infinity)], id(1)), []);
  assert.deepEqual(selectRelatedPages('sleep quality', [hit(20, .1, 'sleep'), hit(21, 0, 'Sleep quality')], id(1)), [{ id: id(21), title: 'Sleep quality' }]);
  assert.deepEqual(selectRelatedPages('', strong, id(1)), []);
});

function harness(linked = []) {
  class Node extends EventTarget { hidden = true; children = []; append(child) { this.children.push(child); } replaceChildren() { this.children = []; } get childElementCount() { return this.children.length; } }
  const node = () => new Node();
  const panel = node(), list = node(), win = new EventTarget();
  Object.assign(win, { setTimeout, clearTimeout });
  const document = { defaultView: win, getElementById: name => name === 'related-pages' ? panel : list, createElement: node };
  let scope = 'a', enabled = true;
  const editor = { state: { loaded: true, documentId: id(1), contentHash: 'a', savedTitle: 'sleep quality', savedBody: '' } };
  const calls = [], navigation = [];
  const controller = installRelatedPages({ document, editor: () => editor, scope: () => scope, enabled: () => enabled,
    linked: () => linked,
    search(query, signal, limit) { return new Promise((resolve, reject) => calls.push({ query, signal, limit, resolve, reject })); },
    href: id => '/?note=' + id, navigate: url => navigation.push(url) });
  return { controller, editor, calls, panel, list, navigation, win, scope(value) { scope = value; }, enabled(value) { enabled = value; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('explicit map links remain visible during stale or failed search and deduplicate recommendations', async () => {
  for (const packet of [{ index: { stale: true }, results: [hit(2, 1)] }, null, { results: [hit(2, 1), hit(3, .95)] }]) {
    const h = harness([{ id: id(2), title: 'Linked source' }]); h.controller.sync();
    assert.equal(h.panel.hidden, false);
    if (packet) h.calls[0].resolve(packet); else h.calls[0].reject(new Error('offline'));
    await settle();
    assert.equal(h.list.children[0].children[0].textContent, 'Linked source');
    assert.equal(h.list.children.length, packet?.results && !packet.index?.stale ? 2 : 1);
  }
});
test('late search cannot cross brain, note revision, disable or pagehide even when abort is ignored', async () => {
  const h = harness(); h.controller.sync();
  assert.equal(h.calls[0].limit, 24);
  h.scope('b'); h.controller.sync();
  assert.equal(h.calls[0].signal.aborted, true);
  h.calls[0].resolve({ results: [hit(2, .95)] }); await settle();
  assert.equal(h.panel.hidden, true);
  h.editor.state.contentHash = 'b'; h.controller.sync();
  h.calls[1].resolve({ results: [hit(3, .95)] }); await settle();
  assert.equal(h.panel.hidden, true);
  h.calls[2].resolve({ results: [hit(4, .95)] }); await settle();
  assert.equal(h.panel.hidden, false);
  const oldLink = h.list.children[0].children[0];
  h.enabled(false); oldLink.dispatchEvent(new Event('click', { cancelable: true }));
  assert.deepEqual(h.navigation, []); assert.equal(h.panel.hidden, true);
  h.enabled(true); h.controller.sync(); h.win.dispatchEvent(new Event('pagehide'));
  h.calls[3].resolve({ results: [hit(2, 1)] }); await settle();
  assert.equal(h.calls.length, 4); assert.equal(h.panel.hidden, true);
});
test('stale, local-only, empty and failed retrieval abstain without retry loops', async () => {
  for (const packet of [{ index: { stale: true }, results: [hit(2, 1)] }, { localOnly: true, results: [hit(2, 1)] }, { results: [] }, null]) {
    const h = harness(); h.controller.sync();
    if (packet) h.calls[0].resolve(packet); else h.calls[0].reject(new Error('unavailable'));
    await settle(); h.controller.sync();
    assert.equal(h.panel.hidden, true); assert.equal(h.calls.length, 1);
  }
});

test('BFCache restoration resumes discovery without reviving an aborted response', async () => {
  const h = harness(); h.controller.sync();
  h.win.dispatchEvent(new Event('pagehide'));
  assert.equal(h.calls[0].signal.aborted, true);
  h.win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  assert.equal(h.calls.length, 2);
  h.calls[0].resolve({ results: [hit(2, .95)] }); await settle();
  assert.equal(h.panel.hidden, true);
  h.calls[1].resolve({ results: [hit(3, .95)] }); await settle();
  assert.equal(h.panel.hidden, false);
  h.editor.state.contentHash = 'restored'; h.controller.sync();
  assert.equal(h.calls.length, 3);
  h.calls[2].resolve({ results: [hit(4, .95)] }); await settle();
});
