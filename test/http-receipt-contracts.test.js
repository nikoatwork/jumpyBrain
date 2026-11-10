import assert from 'node:assert/strict';
import test from 'node:test';
import { createRemoteMemoryTransport } from '../dist/adapters/http-client/index.js';
const id='mem_93000000-0000-4000-8000-000000000001', hash='sha256:'+'a'.repeat(64);
const board={schemaVersion:1,id:'93000000-0000-4000-8000-000000000001',name:'Contract',archived:false,columns:['Todo','Doing','Done'].map(name=>({name,pages:[]}))};
const invoke={
  read:t=>t.readMemoryDocument(id),
  update:t=>t.updateMemoryDocument(id,'body',{ifMatch:hash}),
  attention:t=>t.patchMemoryDocumentAttention(id,{ifMatch:hash,mutation:{action:'settle'}}),
  boardRead:t=>t.readBoard(board.id),
  boardSave:t=>t.saveBoard(board),
};
for(const [name,call] of Object.entries(invoke)) test(name+' rejects malformed success without retry or false confirmation',async()=>{
  for(const body of ['not json','null','[]','{}',JSON.stringify({id,contentHash:'wrong'})]) {
    let calls=0;
    const transport=createRemoteMemoryTransport({url:'https://example.invalid',apiKey:'fixture',fetchImpl:async()=>{calls++;return new Response(body);}});
    await assert.rejects(call(transport),e=>e.code==='invalid_response' && /unconfirmed|invalid/i.test(e.message));
    assert.equal(calls,1,'never automatically replay an uncertain mutation');
  }
});
test('critical receipts bind identity and preconditions while retaining additive fields and deferred indexing',async()=>{
  const update={id,file:'notes/contract.md',oldContentHash:hash,newContentHash:'sha256:'+'b'.repeat(64),updatedAt:'2026-11-05T12:00:00.000Z',indexed:false,index:{stale:true},future:{compatible:true}};
  let payload=update;
  const transport=createRemoteMemoryTransport({url:'https://example.invalid',apiKey:'fixture',fetchImpl:async()=>Response.json(payload)});
  assert.deepEqual(await invoke.update(transport),update);
  for(const changes of [{id:'another'},{oldContentHash:'sha256:'+'c'.repeat(64)},{newContentHash:'not-a-hash'},{indexed:'yes'},{updatedAt:undefined}]) {
    payload={...update,...changes};await assert.rejects(invoke.update(transport),e=>e.code==='invalid_response');
  }
  payload={board,contentHash:hash,future:1};assert.deepEqual(await invoke.boardSave(transport),payload);
  payload={board:{...board,id:'93000000-0000-4000-8000-000000000002'},contentHash:hash};
  await assert.rejects(invoke.boardSave(transport),e=>e.code==='invalid_response');
});

test('attention accepts the real metadata-only receipt and rejects invalid identity, hash and indexing evidence without replay',async()=>{
  const next='sha256:'+'b'.repeat(64);
  const saved={id,file:'notes/contract.md',title:'Contract',type:'note',frontmatter:{attention_at:null},content:'---\nattention_at: null\n---\nbody',contentHash:next,oldContentHash:hash,newContentHash:next,indexed:false,indexing:{status:'pending'},future:{compatible:true}};
  let payload=saved,calls=0;
  const transport=createRemoteMemoryTransport({url:'https://example.invalid',apiKey:'fixture',fetchImpl:async()=>{calls++;return Response.json(payload);}});
  assert.deepEqual(await invoke.attention(transport),saved);
  assert.equal(Object.hasOwn(saved,'updatedAt'),false);
  for(const changes of [{id:'another'},{oldContentHash:next},{newContentHash:'not-a-hash'},{contentHash:hash},{content:undefined},{frontmatter:[]},{indexed:true},{indexing:{status:'failed'}}]) {
    payload={...saved,...changes};const before=calls;
    await assert.rejects(invoke.attention(transport),e=>e.code==='invalid_response'&&/unconfirmed/.test(e.message));
    assert.equal(calls,before+1,'never replay an uncertain attention mutation');
  }
});
