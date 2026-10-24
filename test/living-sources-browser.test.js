import assert from 'node:assert/strict';
import test from 'node:test';
import { installLivingSources } from '../dist/adapters/http-server/living-sources.js';
const id = 'mem_93000000-0000-4000-8000-000000000001';
function deferred() { let resolve; const promise = new Promise(done => resolve = done); return { resolve, promise }; }
function fixture() {
  class Element {
    hidden = false; disabled = false; textContent = ''; children = []; listeners = {}; title = '';
    replaceChildren() { this.children = []; this.textContent = ''; }
    append(...children) { this.children.push(...children); }
    addEventListener(name, handler) { this.listeners[name] = handler; }
  }
  const elements = new Map(['living-sources','check-living-sources','living-sources-status','living-sources-list'].map(name => [name, new Element()]));
  let scope = 'brain-1', enabled = true;
  let editor = { state: { loaded: true, cancelled: false, documentId: id, contentHash: 'page-hash', draftRevision: 0, frontmatterPrefix: '---\ndream: true\n---', dirty: false } };
  const requests = [], navigations = [];
  const controller = installLivingSources({
    document: { getElementById: name => elements.get(name), createElement: () => new Element() },
    editor: () => editor, scope: () => scope, enabled: () => enabled,
    json(url, options) { const request = { url, options, ...deferred() }; requests.push(request); return request.promise; },
    navigate: target => navigations.push(target),
  });
  const result = { page: { contentHash: 'page-hash' }, checkedAt: '2026-10-24T12:00:00Z', coverage: 'partial', omittedReferences: 2, unreadFiles: 1, sources: [{ target: id, title: '<img src=x onerror=alert(1)>', id, status: 'changed', expectedHash: 'old', currentHash: 'new' }] };
  controller.sync();
  return { controller, elements, requests, navigations, result, state: () => editor.state,
    scope(value) { scope = value; }, enabled(value) { enabled = value; }, editor(value) { editor = value; } };
}

test('reader results use text, distinguish version coverage from truth, and source navigation remains guarded', async () => {
  const h = fixture(), pending = h.controller.check();
  assert.equal(h.elements.get('check-living-sources').disabled, true);
  h.requests[0].resolve(h.result); await pending;
  assert.match(h.elements.get('living-sources-status').textContent, /partial reference coverage.*2 references omitted; 1 files unread/);
  assert.match(h.elements.get('living-sources-status').textContent, /does not verify claims/);
  const row = h.elements.get('living-sources-list').children[0];
  assert.match(row.textContent, /<img src=x onerror=alert\(1\)>: changed/);
  assert.equal(row.title, 'Cited version: old\nCurrent version: new');
  const open = row.children[1]; open.listeners.click(); assert.deepEqual(h.navigations, [id]);
  h.scope('brain-2'); open.listeners.click(); assert.deepEqual(h.navigations, [id], 'old source controls cannot navigate another scope');
  assert.deepEqual(h.elements.get('living-sources-list').children, []);
});

for (const reason of ['scope', 'draft', 'page', 'frozen']) test(`late source checks cannot repopulate a changed ${reason}`, async () => {
  const h = fixture(), pending = h.controller.check();
  if (reason === 'scope') h.scope('brain-2');
  if (reason === 'draft') h.state().draftRevision++;
  if (reason === 'page') h.state().documentId = id.replace(/1$/, '2');
  if (reason === 'frozen') h.enabled(false);
  h.requests[0].resolve(h.result); await pending;
  assert.deepEqual(h.elements.get('living-sources-list').children, []);
  assert.doesNotMatch(h.elements.get('living-sources-status').textContent, /Checked at/);
});

test('dirty/unconfirmed drafts and non-Dream pages cannot initiate saved-page checks; changed page hash fails visibly', async () => {
  const h = fixture();
  for (const field of ['dirty', 'unconfirmedSave']) { h.state()[field] = true; await h.controller.check(); h.state()[field] = false; }
  h.state().frontmatterPrefix = '---\ndream: "true"\n---'; await h.controller.check();
  assert.equal(h.requests.length, 0); assert.equal(h.elements.get('living-sources').hidden, true);
  h.state().frontmatterPrefix = '---\ndream: true\n---';
  const pending = h.controller.check(); h.requests[0].resolve({ ...h.result, page: { contentHash: 'changed-page' } }); await pending;
  assert.match(h.elements.get('living-sources-status').textContent, /Could not check.*no source verification/);
  assert.deepEqual(h.elements.get('living-sources-list').children, []);
});
