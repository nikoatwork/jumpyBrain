import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseFrontmatter } from '../dist/core/frontmatter.js';
import { mergeMemoryDocumentUpdate } from '../dist/core/document-update.js';
import { resolveMemoryAttention, validateMemoryAttentionAction } from '../dist/core/attention.js';
import { patchCanonicalMemoryDocumentAttention, readCanonicalMarkdownSnapshot, readCanonicalMemoryDocumentById, replaceCanonicalMemoryDocumentById } from '../dist/core/canonical/index.js';
import { createSettledRevisionReader } from '../dist/app/server-memory/attention.js';
import { attentionServerMemory, patchServerMemoryAttention, recentServerMemory } from '../dist/app/server-memory/index.js';
import { routeRequest } from '../dist/adapters/http-server/routes.js';
import { currentMemoryEditor, stampMemoryActor } from '../dist/core/contribution.js';

const id = n => `mem_89000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-attention-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}
async function note(root, file, metadata, body = 'Private body\r\nexact\rbytes\n') {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  const content = ['---', ...Object.entries(metadata).map(([k,v])=>`${k}: ${JSON.stringify(v)}`), '# retain header comment', '---', ''].join('\r\n') + body;
  await writeFile(path.join(root, file), content);
  return content;
}

test('bare null is explicit and quoted null remains a legacy string; attention validation is strict', () => {
  assert.deepEqual(parseFrontmatter('---\na: null\nb: "null"\nc: \'null\'\nd: false\ne: 2\n---\n').frontmatter,
    { a: null, b: 'null', c: 'null', d: false, e: 2 });
  assert.equal(resolveMemoryAttention({ attention_at: null }, 0).state, 'settled');
  for (const attention_at of ['null', '', false, 0, [], '2030-02-30T09:00:00Z', '2030-01-01', '2030-01-01T09:00:00']) {
    assert.deepEqual(resolveMemoryAttention({ attention_at, updated_at: '2026-01-01' }, 0), { state:'active', attentionAt:'2026-01-01', invalid:true });
  }
  assert.deepEqual(resolveMemoryAttention({ updated_at: 'bad', updatedAt: '2026-01-01' }, 0), { state:'active', attentionAt:'2026-01-01' });
  assert.deepEqual(resolveMemoryAttention({}, 0), { state:'active' });
  for (const value of [null, [], {}, {action:'settle',until:'2099-01-01T00:00:00Z'}, {action:'reactivate',extra:true}, {action:'snooze',until:'2026-01-01T00:00:00Z'}, {action:'snooze',until:'2099-01-01T00:00:00Z',content:'overwrite'}, {action:'settle',id:'another'}, {action:'snooze',until:0}]) {
    assert.equal(validateMemoryAttentionAction(value, Date.parse('2026-01-01T00:00:00Z')), undefined);
  }
  assert.deepEqual(validateMemoryAttentionAction({action:'snooze',until:'2099-01-01T01:00:00+01:00'},0), {action:'snooze',until:'2099-01-01T00:00:00.000Z'});
});

test('body/title edits reopen settled notes, preserve snoozes and allow deliberate metadata edits', () => {
  for (const attention_at of [null, '2099-01-01T00:00:00Z']) {
    const existing = `---\nid: ${id(1)}\ntitle: Before\nattention_at: ${JSON.stringify(attention_at)}\n---\nOld`;
    const merged = mergeMemoryDocumentUpdate(existing, '---\ntitle: After\n---\nEdited');
    assert.equal(merged.frontmatter.attention_at, attention_at === null ? undefined : attention_at);
    assert.equal(merged.frontmatter.title, 'After');
    assert.equal(parseFrontmatter(merged.content).frontmatter.attention_at, attention_at === null ? undefined : attention_at);
    const explicit = mergeMemoryDocumentUpdate(existing, '---\nattention_at: "2099-06-01T00:00:00Z"\n---\nEdited');
    assert.equal(explicit.frontmatter.attention_at, '2099-06-01T00:00:00Z');
  }
});

test('attention filters before cap, excludes duplicate and hidden IDs, wakes exactly at due instant independent of recency', async t => {
  const root = await fixture(t), now = Date.parse('2026-10-22T12:00:00Z');
  for(let n=1;n<=10;n++) await note(root, `notes/${n}.md`, {id:id(n),updated_at:`2026-10-${String(n).padStart(2,'0')}`});
  await note(root,'pages/due.md',{id:id(20),updated_at:'2020-01-01',attention_at:'2026-10-22T12:00:00Z'});
  await note(root,'notes/settled.md',{id:id(21),updated_at:'2099-01-01',attention_at:null});
  await note(root,'notes/snoozed.md',{id:id(22),updated_at:'2099-01-01',attention_at:'2026-10-22T12:01:00Z'});
  await note(root,'notes/later.md',{id:id(23),attention_at:'2026-10-23T12:00:00Z'});
  await note(root,'notes/duplicate.md',{id:id(24),updated_at:'2099-01-01'});
  await note(root,'pages/duplicate.md',{id:id(24),attention_at:'2026-10-22T12:00:01Z'});
  await note(root,'notes/.hidden.md',{id:id(25),updated_at:'2099-01-01'});
  const packet = await attentionServerMemory({root,now});
  assert.equal(packet.notes.length,11);
  assert.equal(packet.total,11);
  assert.deepEqual(packet.settled.map(n=>n.id),[id(21)]);
  assert.equal(packet.settledTotal,1);
  assert.deepEqual(packet.notes.map(n=>n.id),[20,10,9,8,7,6,5,4,3,2,1].map(id));
  assert.equal(packet.nextWakeAt,'2026-10-22T12:01:00Z');
  assert.equal((await attentionServerMemory({root,now:now+60000})).notes[0].id,id(22));
  assert.equal(JSON.stringify(packet).includes('Private body'),false);
  assert.equal(JSON.stringify(packet).includes(root),false);
  for (const n of packet.notes) assert.equal((await readCanonicalMemoryDocumentById(root,n.id)).file,n.file);
  assert.equal((await readdir(root)).includes('.jumpybrain'),false);
  assert.equal((await recentServerMemory({root})).notes.some(n=>n.id===id(21)),true,'Home recency remains independent of settled state');
});

test('invalid external metadata falls back with a safe warning and undated ties remain stable', async t => {
  const root = await fixture(t);
  await note(root,'notes/z.md',{id:id(1),attention_at:'null'});
  await note(root,'notes/a.md',{id:id(2)});
  const packet = await attentionServerMemory({root,now:0});
  assert.deepEqual(packet.notes.map(n=>n.id),[id(2),id(1)]);
  assert.deepEqual(packet.warnings,[{code:'invalid_attention_at',id:id(1)}]);
  assert.equal(Object.hasOwn(packet.notes[0],'attentionAt'),false);
});

test('guarded mutations preserve exact body/header/edit date and return confirmed full packet; stale concurrent writes fail', async t => {
  const root = await fixture(t), file='notes/note.md';
  const source = await note(root,file,{id:id(1),type:'note',title:'Note',updated_at:'2026-01-01',custom:'metadata'});
  const original = await readCanonicalMemoryDocumentById(root,id(1));
  const settled = await patchServerMemoryAttention({root,id:id(1),ifMatch:original.contentHash,mutation:{action:'settle'}});
  assert.equal(settled.frontmatter.attention_at,null);
  assert.equal(settled.frontmatter.updated_at,'2026-01-01');
  assert.equal(settled.content.replace(/^attention_(?:at|settled_hash):.*\r\n/gm,''),source);
  assert.equal(settled.contentHash,settled.newContentHash);
  assert.equal(settled.root,'remote:all');
  await assert.rejects(patchServerMemoryAttention({root,id:id(1),ifMatch:original.contentHash,mutation:{action:'reactivate'}}),{code:'precondition_failed'});
  const edited = await replaceCanonicalMemoryDocumentById(root,id(1),'Edited body',{ifMatch:settled.contentHash});
  const current = await readCanonicalMemoryDocumentById(root,id(1));
  assert.equal(current.frontmatter.attention_at,undefined);
  assert.equal(current.contentHash,edited.newContentHash);
  const races = await Promise.allSettled([
    patchCanonicalMemoryDocumentAttention(root,id(1),{ifMatch:current.contentHash,mutation:{action:'snooze',until:'2099-01-01T00:00:00Z'}}),
    replaceCanonicalMemoryDocumentById(root,id(1),'Concurrent body',{ifMatch:current.contentHash}),
  ]);
  assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(races.find(r=>r.status==='rejected').reason.code,'precondition_failed');
  const latest = await readCanonicalMemoryDocumentById(root,id(1));
  const active = await patchCanonicalMemoryDocumentAttention(root,id(1),{ifMatch:latest.contentHash,mutation:{action:'reactivate'}});
  assert.equal(Object.hasOwn(active.frontmatter,'attention_at'),false);
  assert.equal(active.frontmatter.updated_at,latest.frontmatter.updated_at);
  assert.equal(active.content,await readFile(path.join(root,file),'utf8'));
  await rm(path.join(root,file));
  await assert.rejects(patchCanonicalMemoryDocumentAttention(root,id(1),{ifMatch:active.contentHash,mutation:{action:'settle'}}),{code:'missing_id'});
});

test('HTTP attention read and PATCH require authentication, precondition and valid intent', async t => {
  const root = await fixture(t);
  await note(root,'notes/n.md',{id:id(1),updated_at:'2026-01-01'});
  let queued=0;
  const server=createServer((request,response)=>void routeRequest({request,response,root,apiKeys:['secret'],logger:{info(){},warn(){},error(){}},indexRunner:{},enqueueWrite:async op=>{queued++;return op();}}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`,headers={Authorization:'Bearer secret','Content-Type':'application/json'};
  assert.equal((await fetch(url+'/memories/all/attention')).status,401);
  assert.equal((await fetch(url+'/memories/all/documents/'+id(1),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'settle'})})).status,401);
  const attentionResponse = await fetch(url+'/memories/all/attention',{headers});
  assert.equal(attentionResponse.status,200);
  assert.equal(attentionResponse.headers.get('cache-control'),'no-store');
  const route=url+'/memories/all/documents/'+id(1);
  const document=await (await fetch(route,{headers})).json();
  const patch=(body,hash)=>fetch(route,{method:'PATCH',headers:{...headers,...(hash?{'If-Match':hash}:{})},body:JSON.stringify(body)});
  assert.equal((await patch({action:'settle'})).status,428);
  assert.equal((await patch({action:'snooze',until:'2020-01-01T00:00:00Z'},document.contentHash)).status,422);
  const result=await patch({action:'settle'},document.contentHash);
  assert.equal(result.status,200);assert.equal((await result.json()).frontmatter.attention_at,null);
  assert.equal((await patch({action:'reactivate'},document.contentHash)).status,412);
  assert.equal(queued,3);
});

test('settlement fingerprints detect raw edits without timestamp updates or read-side writes', async t => {
  const root = await fixture(t), file = 'notes/collaboration.md';
  const source = await note(root, file, { id: id(1), title: 'Shared page', updated_at: '2026-10-29' }, 'Original body\n');
  await writeFile(path.join(root, file), stampMemoryActor(source, { kind: 'agent', name: 'Mistral' }, true));
  const original = await readCanonicalMemoryDocumentById(root, id(1));
  const settled = await patchCanonicalMemoryDocumentAttention(root, id(1), { ifMatch: original.contentHash, mutation: { action: 'settle' } });
  assert.equal(currentMemoryEditor(settled.content).kind, 'agent', 'settling preserves declared last editor');
  assert.equal(settled.recognition.editor.kind, 'agent', 'the confirmed attention response retains saved-version context');
  assert.deepEqual((await attentionServerMemory({ root })).settled.map(n => n.id), [id(1)]);
  const noop = await replaceCanonicalMemoryDocumentById(root, id(1), settled.content, { ifMatch: settled.contentHash });
  assert.equal(noop.unchanged, true);
  assert.equal((await attentionServerMemory({ root })).notes.length, 0, 'exact no-op stays settled');
  const external = settled.content.replace('Original body', 'Edited directly on disk');
  await writeFile(path.join(root, file), external);
  const packet = await attentionServerMemory({ root });
  assert.deepEqual(packet.notes.map(n => n.id), [id(1)]);
  assert.deepEqual(packet.settled, []);
  assert.equal(await readFile(path.join(root, file), 'utf8'), external, 'reads never repair Markdown');
  assert.equal(currentMemoryEditor(external), undefined, 'untracked edits do not inherit agent attribution');
  const current = await readCanonicalMemoryDocumentById(root, id(1));
  const resettled = await patchCanonicalMemoryDocumentAttention(root, id(1), { ifMatch: current.contentHash, mutation: { action: 'settle' } });
  assert.notEqual(resettled.frontmatter.attention_settled_hash, settled.frontmatter.attention_settled_hash);
  assert.equal((await attentionServerMemory({ root })).notes.length, 0);
  const edited = await replaceCanonicalMemoryDocumentById(root, id(1), resettled.content.replace('Shared page', 'Renamed page'), { ifMatch: resettled.contentHash, actor: { kind: 'human' } });
  const saved = await readCanonicalMemoryDocumentById(root, id(1));
  assert.equal(saved.frontmatter.attention_at, undefined);
  assert.equal(currentMemoryEditor(saved.content).kind, 'human');
});

test('active and settled shelves are independently bounded after eligibility filtering', async t => {
  const root = await fixture(t);
  for (let n = 1; n <= 105; n++) {
    await note(root, `notes/active-${n}.md`, { id: id(n), updated_at: '2026-10-29' });
    await note(root, `notes/settled-${n}.md`, { id: id(n + 200), updated_at: '2026-10-29', attention_at: null });
  }
  const packet = await attentionServerMemory({ root });
  assert.equal(packet.notes.length, 100); assert.equal(packet.total, 105);
  assert.equal(packet.settled.length, 100); assert.equal(packet.settledTotal, 105);
});

test('settled revision cache avoids unchanged body reads, invalidates edits, bounds retention and tolerates racing files', async t => {
  const root = await fixture(t), first = path.join(root, 'notes/first.md'), second = path.join(root, 'notes/second.md');
  await note(root, 'notes/first.md', { id: id(1), attention_at: null }, 'Before');
  await note(root, 'notes/second.md', { id: id(2), attention_at: null }, 'Other');
  let reads = 0, racing = false;
  const reader = createSettledRevisionReader(async (...args) => { reads++; if (racing) throw new Error('changed during read'); return readCanonicalMarkdownSnapshot(...args); }, 1);
  const original = await reader(root, first);
  assert.equal((await reader(root, first)).revision, original.revision); assert.equal(reads, 1);
  await writeFile(first, (await readFile(first, 'utf8')).replace('Before', 'Edited'));
  assert.notEqual((await reader(root, first)).revision, original.revision); assert.equal(reads, 2);
  await reader(root, second); await reader(root, first); assert.equal(reads, 4, 'evicted revisions are safely rebuilt');
  racing = true;
  assert.equal(await reader(root, second), undefined, 'one unstable snapshot falls back instead of failing the list');
  racing = false;
  assert.ok((await reader(root, second)).revision, 'the next read retries a failed file');
  await rm(second); assert.equal(await reader(root, second), undefined);
});
