import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,realpath,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {initializeMemoryRoot} from '../dist/index.js';
import {createCollaborationHub} from '../dist/app/collaboration/index.js';
import {applySourceSplices} from '../dist/core/collaboration/index.js';
import {createLiveServer} from '../dist/adapters/live/index.js';
import {AccessStore} from '../dist/adapters/access-control/index.js';
const documentId='mem_12345678-1234-1234-1234-123456789abc';
const writer={id:'writer',name:'Writer',role:'writer'},reader={id:'reader',name:'Reader',role:'reader'};
async function fixture(t,options={}){
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'jumpy-history-')));await initializeMemoryRoot(root);
  await writeFile(path.join(root,'notes','history.md'),`---\nid: ${documentId}\ntype: note\ntitle: History\n---\naaaa`);
  let hub=createCollaborationHub({root,observeIntervalMs:0,quietMs:0,...options});
  t.after(async()=>{await hub.close();await rm(root,{recursive:true,force:true});});
  return{root,get hub(){return hub;},async restart(){await hub.close();hub=createCollaborationHub({root,observeIntervalMs:0,quietMs:0,...options});}};
}
const params=s=>({documentId,clientId:'tab',epoch:s.epoch,baseRevision:s.revision});
const replay=(body,history)=>history.operations.reduce((body,operation)=>applySourceSplices(body,operation.splices),body);
test('contiguous public history preserves actual repeated-source positions and redacts removed text',async t=>{
  const {hub}=await fixture(t),base=await hub.open(documentId,writer,{clientId:'tab'});
  const deleted=await hub.dispatch('edit',{...params(base),operationId:'actual-first-character',start:0,deleteCount:1,insert:''},writer);
  assert.deepEqual(deleted.operation.splices,[{start:0,deleteCount:1,insert:''}]);
  const peer=await hub.dispatch('edit',{...params(base),clientId:'peer',operationId:'actual-middle',start:2,deleteCount:0,insert:'X'},writer);
  assert.equal(peer.body,'aXaa');
  const history=await hub.readHistory({documentId,epoch:base.epoch,fromRevision:0,toRevision:peer.revision},reader);
  assert.deepEqual(history.operations.map(operation=>operation.revision),[1,2]);
  assert.equal(history.operations[0].splices[0].start,0);
  assert.equal(history.operations[1].splices[0].start,1);
  assert.equal(replay(base.body,history),peer.body);
  assert.equal(JSON.stringify(history).includes('removed'),false);
  const bounded=await hub.readHistory({documentId,epoch:base.epoch,fromRevision:0,toRevision:1},reader);
  assert.equal(bounded.toRevision,1);assert.equal(replay(base.body,bounded),'aaa');
});
test('byte-identical source intent and metadata checkpoints remain distinct public revisions',async t=>{
  const {hub}=await fixture(t),base=await hub.open(documentId,writer,{clientId:'tab'});
  const same=await hub.dispatch('edit',{...params(base),operationId:'same-bytes-real-position',start:0,deleteCount:1,insert:'a'},writer);
  assert.equal(same.body,base.body);assert.equal(same.revision,base.revision+1);
  assert.equal(same.operation.inverseOf,undefined);
  assert.deepEqual(same.operation.splices,[{start:0,deleteCount:1,insert:'a'}]);
  const titled=await hub.dispatch('title',{...params(same),operationId:'title',title:'Renamed'},writer);
  assert.equal(titled.operation.revision,titled.revision);
  const history=await hub.readHistory({documentId,epoch:base.epoch,fromRevision:0,toRevision:titled.revision},reader);
  assert.deepEqual(history.operations.map(operation=>operation.revision),[1,2]);assert.equal(replay(base.body,history),base.body);
  assert.deepEqual(history.operations[1].splices,[]);
});
test('public history preserves verified inverse ancestry without inventing it from equal bytes',async t=>{
  const {hub}=await fixture(t),base=await hub.open(documentId,writer,{clientId:'tab'});
  const edited=await hub.dispatch('edit',{...params(base),operationId:'original-replacement',start:0,deleteCount:1,insert:'A'},writer);
  const undone=await hub.dispatch('undo',{...params(edited),operationId:'verified-undo'},writer);
  assert.equal(undone.body,base.body);
  assert.deepEqual(undone.operation.inverseOf,{actor:edited.operation.actor,operationId:edited.operation.operationId,revision:edited.operation.revision});
  const redone=await hub.dispatch('redo',{...params(undone),operationId:'verified-redo'},writer);
  assert.deepEqual(redone.operation.inverseOf,{actor:undone.operation.actor,operationId:undone.operation.operationId,revision:undone.operation.revision});
  const history=await hub.readHistory({documentId,epoch:base.epoch,fromRevision:0,toRevision:redone.revision},reader);
  assert.equal(history.operations[0].inverseOf,undefined);
  assert.deepEqual(history.operations[1].inverseOf,undone.operation.inverseOf);
  assert.deepEqual(history.operations[2].inverseOf,redone.operation.inverseOf);
  assert.equal(replay(base.body,history),redone.body);assert.equal(JSON.stringify(history).includes('removed'),false);
});
test('a raw body plus metadata change exposes the complete two-revision history gap',async t=>{
  const f=await fixture(t),base=await f.hub.open(documentId,writer,{clientId:'tab'});
  let emitted;f.hub.subscribe(documentId,snapshot=>emitted=snapshot);
  await writeFile(path.join(f.root,'notes','history.md'),`---\nid: ${documentId}\ntype: note\ntitle: Raw metadata title\n---\naaXaa`);await f.hub.observe();
  const current=await f.hub.read(documentId);assert.equal(current.revision,base.revision+2);assert.equal(emitted.operation.revision,base.revision+1);assert.notEqual(emitted.operation.revision,emitted.revision);
  const history=await f.hub.readHistory({documentId,epoch:base.epoch,fromRevision:base.revision,toRevision:current.revision},reader);
  assert.deepEqual(history.operations.map(operation=>operation.revision),[1,2]);assert.deepEqual(history.operations[1].splices,[]);assert.equal(replay(base.body,history),current.body);
});
test('snapshot-only large receipts have a bounded exact history fallback rather than guessed positions',async t=>{
  const {hub}=await fixture(t),base=await hub.open(documentId,writer,{clientId:'tab'}),insert='X'.repeat(9000);
  const current=await hub.dispatch('edit',{...params(base),operationId:'large-receipt',start:0,deleteCount:0,insert},writer);
  assert.equal(current.operation.snapshotOnly,true);assert.equal(current.operation.splices,undefined);
  const history=await hub.readHistory({documentId,epoch:base.epoch,fromRevision:0,toRevision:current.revision},reader);
  assert.deepEqual(history.operations[0].splices,[{start:0,deleteCount:0,insert}]);assert.equal(replay(base.body,history),current.body);
});
test('ambiguous raw repeated-source insertion invalidates uncertain origins without claiming content was removed',async t=>{
  const f=await fixture(t),base=await f.hub.open(documentId,writer,{clientId:'tab'});
  await f.hub.dispatch('presence',{...params(base),selection:{anchor:2,focus:2}},writer);
  const lower={id:'lower',name:'Lower',role:'reader'},upper={id:'upper',name:'Upper',role:'reader'};
  await f.hub.dispatch('presence',{...params(base),clientId:'lower',selection:{anchor:0,focus:0}},lower);
  await f.hub.dispatch('presence',{...params(base),clientId:'upper',selection:{anchor:4,focus:4}},upper);
  await writeFile(path.join(f.root,'notes','history.md'),`---\nid: ${documentId}\ntype: note\ntitle: History\n---\naaaaa`);await f.hub.observe();
  const current=await f.hub.read(documentId);assert.equal(current.body,'aaaaa');assert.equal(current.epoch,base.epoch);
  assert.equal(current.presence.find(peer=>peer.principalId===writer.id).anchor,undefined);
  assert.equal(current.presence.find(peer=>peer.principalId===lower.id).anchor,0,'a caret before the uncertain range stays before it');
  assert.equal(current.presence.find(peer=>peer.principalId===upper.id).anchor,5,'right-associated EOF maps identically across equivalent raw alignments');
  const history=await f.hub.readHistory({documentId,epoch:base.epoch,fromRevision:0},reader),splices=history.operations[0].splices;
  assert.ok(splices.some(splice=>splice.ambiguous===true&&splice.start===0&&splice.deleteCount>=4));assert.equal(replay(base.body,history),'aaaaa');
  for(const start of [0,2])await assert.rejects(f.hub.dispatch('edit',{...params(base),operationId:'unprovable-origin-'+start,start,deleteCount:0,insert:'Q'},writer),error=>['ambiguous_source','overlapping_edit'].includes(error.code));
  assert.equal((await f.hub.read(documentId)).body,'aaaaa');assert.equal(current.recovery,undefined,'an inferred positional envelope does not remove acknowledged content from a pure raw insertion');
  const clear=await f.hub.dispatch('presence',{...params(current),clientId:'upper'},upper);assert.equal(clear.presence.find(peer=>peer.principalId===upper.id).anchor,undefined,'missing selection is explicit viewing, not a stale caret renewal');
});
test('ambiguous destructive raw deletion retains actual prior and observed content',async t=>{
  const f=await fixture(t),base=await f.hub.open(documentId,writer,{clientId:'tab'});
  await f.hub.dispatch('presence',{...params(base),selection:{anchor:2,focus:2}},writer);
  await writeFile(path.join(f.root,'notes','history.md'),`---\nid: ${documentId}\ntype: note\ntitle: History\n---\naaa`);await f.hub.observe();
  const current=await f.hub.read(documentId);assert.equal(current.body,'aaa');assert.equal(current.presence.find(peer=>peer.principalId===writer.id).anchor,undefined);assert.ok(current.recovery);
  const history=await f.hub.readHistory({documentId,epoch:base.epoch,fromRevision:0},reader);assert.ok(history.operations[0].splices.some(splice=>splice.ambiguous));
  const recovery=current.recovery,copies=await f.hub.readRecovery({documentId,recoveryId:recovery.recoveryId,expectedBaseHash:recovery.baseContentHash,expectedExternalHash:recovery.externalContentHash,format:'editable'},reader);
  assert.equal(copies.base.body,'aaaa');assert.equal(copies.external.body,'aaa');
});
test('safe outside origins and newline EOF appends remain usable after conservative raw alignment',async t=>{
  const f=await fixture(t),file=path.join(f.root,'notes','history.md'),before='line\n';
  await writeFile(file,`---\nid: ${documentId}\ntype: note\ntitle: History\n---\n${before}`);
  const base=await f.hub.open(documentId,writer,{clientId:'tab'});await f.hub.dispatch('presence',{...params(base),selection:{anchor:before.length,focus:before.length}},writer);
  await writeFile(file,`---\nid: ${documentId}\ntype: note\ntitle: History\n---\n${before}next\n`);await f.hub.observe();
  const current=await f.hub.read(documentId);assert.equal(current.presence.find(peer=>peer.principalId===writer.id).anchor,current.body.length);
  const saved=await f.hub.dispatch('edit',{...params(base),operationId:'safe-old-eof',start:before.length,deleteCount:0,insert:'Q'},writer);assert.equal(saved.body,'line\nnext\nQ');
});
test('client-declared ambiguity and inverse identities cannot forge server provenance',async t=>{
  const {hub}=await fixture(t),base=await hub.open(documentId,writer,{clientId:'tab'});
  const saved=await hub.dispatch('edit',{...params(base),operationId:'ordinary-client-edit',inverseOf:{actor:'forged',operationId:'forged',revision:0},operations:[{start:1,deleteCount:0,insert:'X',ambiguous:true}]},writer);
  assert.equal(saved.operation.inverseOf,undefined);assert.equal(saved.operation.splices[0].ambiguous,undefined);
  const history=await hub.readHistory({documentId,epoch:base.epoch,fromRevision:0},reader);assert.equal(history.operations[0].splices[0].ambiguous,undefined);assert.equal(history.operations[0].inverseOf,undefined);
});
test('ambiguous raw runs preserve provably unique source outside their envelope',async t=>{
  const f=await fixture(t),before='left\naaaa\nright',file=path.join(f.root,'notes','history.md');
  await writeFile(file,`---\nid: ${documentId}\ntype: note\ntitle: History\n---\n${before}`);
  const base=await f.hub.open(documentId,writer,{clientId:'tab'});await f.hub.dispatch('presence',{...params(base),selection:{anchor:0,focus:0}},writer);
  await writeFile(file,`---\nid: ${documentId}\ntype: note\ntitle: History\n---\nleft\naaaaa\nright`);await f.hub.observe();
  const current=await f.hub.read(documentId);assert.equal(current.epoch,base.epoch);assert.equal(current.presence.find(peer=>peer.principalId===writer.id).anchor,0);
  const history=await f.hub.readHistory({documentId,epoch:base.epoch,fromRevision:0},reader);assert.ok(history.operations[0].splices.every(splice=>splice.start>0&&splice.start+splice.deleteCount<before.length));
  const saved=await f.hub.dispatch('edit',{...params(base),operationId:'unique-prefix-edit',start:0,deleteCount:0,insert:'Q'},writer);assert.equal(saved.body,'Qleft\naaaaa\nright');
});
test('expired epochs/history, future revisions, and oversized exact history fail explicitly',async t=>{
  const f=await fixture(t,{maxHistoryBytes:256}),base=await f.hub.open(documentId,writer,{clientId:'tab'});
  const now=await f.hub.dispatch('edit',{...params(base),operationId:'prune',start:0,deleteCount:0,insert:'x'.repeat(500)},writer);
  await assert.rejects(f.hub.readHistory({documentId,epoch:base.epoch,fromRevision:0},reader),e=>e.code==='history_expired');
  await assert.rejects(f.hub.readHistory({documentId,epoch:base.epoch,fromRevision:now.revision,toRevision:now.revision+1},reader),e=>e.code==='invalid_revision');
  await f.restart();await assert.rejects(f.hub.readHistory({documentId,epoch:base.epoch,fromRevision:0},reader),e=>e.code==='epoch_changed');
  const bounded=await fixture(t,{maxSnapshotBytes:10000});let current=await bounded.hub.open(documentId,writer,{clientId:'tab'}),epoch=current.epoch;
  for(let i=0;i<40;i++)current=await bounded.hub.dispatch('edit',{...params(current),operationId:'history-budget-'+i,start:0,deleteCount:current.body.length,insert:(i%2?'a':'b').repeat(100)},writer);
  await assert.rejects(bounded.hub.readHistory({documentId,epoch,fromRevision:0},reader),e=>e.code==='history_limit');
});
test('real reader reconnect fetches missed canonical operations; subscription scope and revocation remain enforced',async t=>{
  const f=await fixture(t),access=new AccessStore(f.root),issuedWriter=await access.issue({name:'History writer',role:'writer'}),issuedReader=await access.issue({name:'History reader',role:'reader'});
  const server=createServer((_req,res)=>res.end()),live=createLiveServer({server,hub:f.hub,authenticate:credential=>access.authenticate(credential),revalidateIntervalMs:15}),clients=[];
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{for(const ws of clients)ws.terminate();await live.close();await new Promise(resolve=>server.close(resolve));access.close();});
  async function connect(issued,clientId){
    const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);clients.push(ws);await once(ws,'open');let serial=0;const pending=new Map();
    ws.on('message',raw=>{const packet=JSON.parse(raw.toString()),request=pending.get(packet.id);if(request){clearTimeout(request.timer);pending.delete(packet.id);request.resolve(packet);}});
    const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=String(++serial);pending.set(id,{resolve,timer:setTimeout(()=>{pending.delete(id);reject(new Error('History RPC deadline'));},1500)});ws.send(JSON.stringify({id,method,params:{documentId,clientId,...params}}));});
    assert.equal((await rpc('hello',{protocol:2,token:issued.token})).ok,true);return{ws,rpc};
  }
  const human=await connect(issuedWriter,'human'),reading=await connect(issuedReader,'reader');
  const base=(await human.rpc('open')).result;assert.equal((await reading.rpc('open')).ok,true);const dropped=once(reading.ws,'close');reading.ws.close();await dropped;
  const first=await human.rpc('edit',{epoch:base.epoch,baseRevision:base.revision,operationId:'while-offline-delete-first',start:0,deleteCount:1,insert:''});assert.equal(first.ok,true);
  const second=await human.rpc('edit',{epoch:base.epoch,baseRevision:base.revision,operationId:'while-offline-insert-middle',start:2,deleteCount:0,insert:'X'});assert.equal(second.ok,true);
  const reconnected=await connect(issuedReader,'reader-new');
  assert.equal((await reconnected.rpc('history.read',{epoch:base.epoch,fromRevision:0})).error.code,'document_not_open');
  assert.equal((await reconnected.rpc('open')).ok,true);
  const history=await reconnected.rpc('history.read',{epoch:base.epoch,fromRevision:base.revision,toRevision:second.result.revision});assert.equal(history.ok,true);
  assert.equal(replay(base.body,history.result),'aXaa');
  assert.equal((await reconnected.rpc('history.read',{epoch:base.epoch,fromRevision:0,clientId:'other-tab'})).error.code,'document_not_open');
  const closed=once(reconnected.ws,'close');await access.revoke(issuedReader.credential.id);assert.equal((await closed)[0],1008);
});
