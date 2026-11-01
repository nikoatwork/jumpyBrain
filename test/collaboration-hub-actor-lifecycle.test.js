import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,realpath,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../dist/index.js';
import {createCollaborationHub} from '../dist/app/collaboration/index.js';
const documentId='mem_12345678-1234-1234-1234-123456789abc';
const human={id:'human',name:'Human',role:'writer'},agent={id:'agent',name:'Agent',role:'writer'};
async function fixture(t,options={}){
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'jumpy-hub-actors-')));await initializeMemoryRoot(root);await writeFile(path.join(root,'notes','actors.md'),`---\nid: ${documentId}\ntype: note\ntitle: Actors\n---\nbase`);
  const hub=createCollaborationHub({root,observeIntervalMs:0,quietMs:0,...options});t.after(async()=>{await hub.close();await rm(root,{recursive:true,force:true});});return hub;
}
const params=(snapshot,clientId)=>({documentId,clientId,epoch:snapshot.epoch,baseRevision:snapshot.revision});
const connect=(hub,principal,clientId)=>hub.openSubscribed(documentId,principal,{clientId,actorKind:principal.id==='agent'?'agent':'human'},()=>{});
test('departed actor churn reclaims bounded Undo owners while a connected human retains recent independent Undo',async t=>{
  const hub=await fixture(t),humanConnection=await connect(hub,human,'human-tab');let current=humanConnection.snapshot;
  current=await hub.dispatch('edit',{...params(current,'human-tab'),operationId:'human-prefix',start:0,deleteCount:0,insert:'H'},human);
  for(let index=0;index<70;index++){
    const clientId='short-agent-'+index,connection=await connect(hub,agent,clientId);
    current=await hub.dispatch('edit',{...params(connection.snapshot,clientId),operationId:'append-'+index,start:connection.snapshot.body.length,deleteCount:0,insert:'x'},agent);
    connection.dispose();hub.leave(agent,clientId,documentId);
    assert.ok(hub.resourceUsage().undoOwners<=64);assert.equal(hub.resourceUsage().activeUndoOwners,1);
  }
  assert.equal(current.body,'Hbase'+'x'.repeat(70));
  const undone=await hub.dispatch('undo',{...params(current,'human-tab'),operationId:'human-undo'},human);assert.equal(undone.body,'base'+'x'.repeat(70));
  const expired=await connect(hub,agent,'short-agent-0');
  await assert.rejects(hub.dispatch('undo',{...params(expired.snapshot,'short-agent-0'),operationId:'expired-agent-undo'},agent),error=>error.code==='history_expired');
  assert.equal((await hub.read(documentId)).body,undone.body);assert.ok(hub.resourceUsage().undoOwners<=64);
  expired.dispose();humanConnection.dispose();
});
test('stable disconnected actors retain Undo/Redo until pressure; readers do not pin old writer histories',async t=>{
  const hub=await fixture(t);let connection=await connect(hub,agent,'stable-agent');
  const saved=await hub.dispatch('edit',{...params(connection.snapshot,'stable-agent'),operationId:'stable-change',start:4,deleteCount:0,insert:'A'},agent);
  connection.dispose();hub.leave(agent,'stable-agent',documentId);assert.equal(hub.resourceUsage().undoOwners,1);assert.equal(hub.resourceUsage().activeUndoOwners,0);
  const reader={...agent,role:'reader'},reading=await connect(hub,reader,'stable-agent');assert.equal(hub.resourceUsage().activeUndoOwners,0);
  await assert.rejects(hub.dispatch('undo',{...params(reading.snapshot,'stable-agent'),operationId:'reader-cannot-undo'},reader),error=>error.code==='forbidden');reading.dispose();
  connection=await connect(hub,agent,'stable-agent');const undone=await hub.dispatch('undo',{...params(saved,'stable-agent'),operationId:'after-reconnect'},agent);assert.equal(undone.body,'base');connection.dispose();
  connection=await connect(hub,agent,'stable-agent');const redone=await hub.dispatch('redo',{...params(connection.snapshot,'stable-agent'),operationId:'redo-after-reconnect'},agent);assert.equal(redone.body,'baseA');connection.dispose();
  assert.equal(hub.resourceUsage().activeUndoOwners,0);
});
test('connection references are idempotent and an old revoked connection cannot unpin a new authorized reconnect',async t=>{
  const hub=await fixture(t),one=await connect(hub,human,'same-tab'),two=await connect(hub,human,'same-tab');
  const saved=await hub.dispatch('edit',{...params(one.snapshot,'same-tab'),operationId:'shared-actor',start:4,deleteCount:0,insert:'H'},human);
  one.dispose();one.dispose();hub.leave(human,'same-tab',documentId);assert.equal(hub.resourceUsage().activeUndoOwners,1);assert.equal((await hub.read(documentId)).presence.length,1);
  await hub.revokePrincipal(human.id);assert.equal(hub.resourceUsage().activeUndoOwners,0);assert.equal(hub.resourceUsage().undoOwners,1);
  const renewed=await connect(hub,human,'same-tab');assert.equal(hub.resourceUsage().activeUndoOwners,1);
  two.dispose();hub.leave(human,'same-tab',documentId);assert.equal(hub.resourceUsage().activeUndoOwners,1,'stale disposal cannot affect the new connection record');
  const undo=await hub.dispatch('undo',{...params(saved,'same-tab'),operationId:'renewed-undo'},human);assert.equal(undo.body,'base');renewed.dispose();assert.equal(hub.resourceUsage().activeUndoOwners,0);
});
test('presence leases and stream leases expire advisory pins without deleting cached Undo',async t=>{
  let clock=1_000_000;t.mock.method(Date,'now',()=>clock);
  const hub=await fixture(t,{presenceLeaseMs:30,streamLeaseMs:60}),connection=await connect(hub,agent,'stream-agent');
  let current=await hub.dispatch('stream.start',{...params(connection.snapshot,'stream-agent'),streamId:'lease',start:4,actorKind:'agent'},agent);
  current=await hub.dispatch('stream.chunk',{...params(current,'stream-agent'),streamId:'lease',sequence:0,insert:'A',actorKind:'agent'},agent);assert.equal(hub.resourceUsage().activeUndoOwners,1);
  clock+=40;await hub.observe();assert.equal(hub.resourceUsage().presence,0);assert.equal(hub.resourceUsage().activeUndoOwners,1,'an active leased producer remains advisory-active after its cursor expires');
  connection.dispose();assert.equal(hub.resourceUsage().activeUndoOwners,1,'brief stream reconnect can preserve its recent Undo');
  clock+=21;await hub.observe();assert.equal(hub.resourceUsage().streams,0);assert.equal(hub.resourceUsage().activeUndoOwners,0);assert.equal(hub.resourceUsage().undoOwners,1);
  const renewed=await connect(hub,agent,'stream-agent');current=await hub.dispatch('stream.start',{...params(renewed.snapshot,'stream-agent'),streamId:'revoke',start:5,actorKind:'agent'},agent);
  await hub.dispatch('stream.chunk',{...params(current,'stream-agent'),streamId:'revoke',sequence:0,insert:'B',actorKind:'agent'},agent);
  await hub.revokePrincipal(agent.id);assert.equal(hub.resourceUsage().streams,0);assert.equal(hub.resourceUsage().activeUndoOwners,0);assert.equal(hub.resourceUsage().undoOwners,1);renewed.dispose();
});
