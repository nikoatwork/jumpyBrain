import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecentWriteSearch } from '../dist/adapters/http-server/recent-write-search.js';
const hit = (id,title) => ({ provenance: { file:'notes/'+id+'.md', metadata:{id,title} }, snippet:'Old text' });
const note = (id,title,body='New body') => ({id,title,file:'notes/'+id+'.md',body});
test('confirmed writes are immediately discoverable, supersede stale indexed hits and disappear after removal', async () => {
  const cache = createRecentWriteSearch({ scope: () => 'brain-a', fetch: async () => ({results:[hit('one','Old title'),hit('two','Other')],index:{stale:true}}) });
  cache.remember(note('one','New title','Unique body token'));
  let packet = await cache.search('Unique body token',new AbortController().signal);
  assert.equal(packet.results[0].provenance.metadata.title,'New title');
  assert.equal(packet.results.filter(h=>h.provenance.metadata.id==='one').length,1);
  packet = await cache.search('Old title',new AbortController().signal);
  assert.equal(packet.results.some(h=>h.provenance.metadata.id==='one'),false);
  cache.remove('one');
  packet = await cache.search('New title',new AbortController().signal);
  assert.equal(packet.results.some(h=>h.provenance.metadata.id==='one'),false);
});
test('cache is bounded and scoped, and an old in-flight query cannot leak another brain', async () => {
  let scope='a', finish;
  const cache=createRecentWriteSearch({scope:()=>scope,fetch:()=>new Promise(resolve=>finish=resolve)});
  for(let i=0;i<51;i++)cache.remember(note(String(i),'Fixture '+i));
  const pending=cache.search('Fixture',new AbortController().signal);
  finish({results:[]});
  assert.equal((await pending).results.length,24);
  const late=cache.search('Fixture',new AbortController().signal);
  scope='b';finish({results:[hit('private','Private brain A')]});
  await assert.rejects(late,{name:'AbortError'});
  const fresh=cache.search('Fixture',new AbortController().signal);finish({results:[]});
  assert.deepEqual((await fresh).results,[]);
});
test('backend failure has an explicit local-only fallback and never masks cancellation',async()=>{
  const cache=createRecentWriteSearch({scope:()=>'',fetch:async()=>{throw new Error('offline')}});
  cache.remember(note('one','Saved title'));
  const packet=await cache.search('Saved title',new AbortController().signal);
  assert.equal(packet.localOnly,true);assert.equal(packet.index.stale,true);
  await assert.rejects(cache.search('Absent',new AbortController().signal),/offline/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(cache.search('Saved title',controller.signal),{name:'AbortError'});
});


test('exact indexed title navigation precedes body-only matches in local saves', async () => {
  const cache = createRecentWriteSearch({ scope: () => 'a', fetch: async () => ({ results: [hit('target', 'Exact target title')], index: { stale: true } }) });
  cache.remember(note('current', 'New daily note', 'Link to [[Exact target title]]'));
  const packet = await cache.search('Exact target title', new AbortController().signal);
  assert.equal(packet.results[0].provenance.metadata.id, 'target');
  assert.equal(packet.results[1].provenance.metadata.id, 'current');
});


test('verified fresh generations retire the overlay without losing writes during a query', async () => {
  for (const stale of [false, true]) {
    let finish;
    const cache=createRecentWriteSearch({scope:()=> 'a',fetch:()=>new Promise(resolve=>finish=resolve)});
    cache.remember(note('one','Previous local title'));
    let pending=cache.search('title',new AbortController().signal);
    finish({results:[hit('one','New external title')],index:{stale},readiness:{freshness:'fresh'}});
    assert.equal((await pending).results[0].provenance.metadata.title,'New external title');
    pending=cache.search('Newest local title',new AbortController().signal);
    cache.remember(note('one','Newest local title'));
    finish({results:[hit('one','New external title')],index:{stale},readiness:{freshness:'fresh'}});
    assert.equal((await pending).results[0].provenance.metadata.title,'Newest local title');
    pending=cache.search('deleted',new AbortController().signal);
    cache.remove('two');
    finish({results:[hit('two','Deleted title')],index:{stale},readiness:{freshness:'fresh'}});
    assert.equal((await pending).results.length,0,'a deletion during the query must also survive');
  }
});

test('stale or unknown canonical readiness preserves confirmed saves and deletions', async () => {
  for (const readiness of [undefined, { freshness: 'stale' }, { freshness: 'unknown' }]) {
    const cache = createRecentWriteSearch({ scope: () => 'a', fetch: async () => ({
      results: [hit('one', 'Old title'), hit('deleted', 'Old deleted title')], index: { stale: false }, readiness,
    }) });
    cache.remember(note('one', 'Updated title'));
    cache.remove('deleted');
    const packet = await cache.search('title', new AbortController().signal);
    assert.deepEqual(packet.results.map(row => row.provenance.metadata.title), ['Updated title']);
  }
});

test('fresh canonical readiness retires old tab titles even when host indexing bookkeeping lags', async () => {
  for (const cached of ['save', 'deletion']) {
    const cache = createRecentWriteSearch({ scope: () => 'a', fetch: async () => ({
      results: [hit('target', 'Nico'), hit('mention', 'Meeting with Nico')],
      index: { stale: true }, readiness: { freshness: 'fresh' }, recognition: { version: 1 },
    }) });
    if (cached === 'save') cache.remember(note('target', 'Old working title', 'Earlier content'));
    else cache.remove('target'); // An external writer restored it before indexing.
    const packet = await cache.search('nico', new AbortController().signal, 24, { offset: 0 });
    assert.equal(packet.results[0].provenance.metadata.id, 'target');
    assert.equal(packet.results[0].provenance.metadata.title, 'Nico');
    assert.equal(packet.index.stale, true, 'do not rewrite the host bookkeeping claim');
  }
});
