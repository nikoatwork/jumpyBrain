import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {initializeMemoryRoot} from '../dist/runtime/index.js';
import {createCollaborationHub} from '../dist/app/collaboration/index.js';
import {validSnapshot,validStreamSnapshot} from '../dist/adapters/http-server/collaboration-client.js';
const id='mem_12345678-1234-1234-1234-123456789abc';
test('serialized app snapshots satisfy browser consumers and preserve publication/operation identity',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'jb-wire-contract-'));
  await initializeMemoryRoot(root);
  const file=path.join(root,'notes','wire.md');
  await writeFile(file,`---\nid: ${id}\ntype: note\ntitle: Wire\n---\nabc\n`);
  const hub=createCollaborationHub({root,observeIntervalMs:0,quietMs:0});
  t.after(async()=>{await hub.close();await rm(root,{recursive:true,force:true});});
  const principal={id:'writer',role:'writer'},opened=await hub.open(id,principal,{clientId:'tab'});
  const edited=await hub.dispatch('edit',{documentId:id,clientId:'tab',epoch:opened.epoch,baseRevision:opened.revision,operationId:'edit-1',start:1,deleteCount:0,insert:'H'},principal);
  for(const snapshot of [opened,edited]) assert.equal(validSnapshot(JSON.parse(JSON.stringify({...snapshot,futureOptional:{compatible:true}}))),true);
  assert.equal(edited.body,'aHbc\n');assert.equal(edited.operation.operationId,'edit-1');assert.equal(edited.revision,opened.revision+1);assert.equal(edited.epoch,opened.epoch);
  assert.equal(edited.contentHash,'sha256:'+createHash('sha256').update(await readFile(file)).digest('hex'));assert.equal(edited.saved,true);
  for(const changes of [{protocol:99},{operation:{...edited.operation,start:-1}},{operation:{...edited.operation,splices:[{start:0,deleteCount:1,insert:42}]}},{stream:{streamId:'s',sequence:-1,state:'cancelled'}}]) {
    assert.equal(validSnapshot({...edited,...changes}),false,JSON.stringify(changes));
  }
  // Older optional fields stay optional; large inserts may omit text and use a full snapshot.
  assert.equal(validSnapshot({...edited,operation:{...edited.operation,insert:undefined,splices:undefined,snapshotOnly:true}}),true);
});
test('terminal notices require scope and sequenced stream identity, preserving additive fields',()=>{
  const notice={documentId:id,epoch:'epoch',saved:true,stream:{streamId:'stream',sequence:2,state:'cancelled',reason:'lease_expired'},future:true};
  assert.equal(validStreamSnapshot(notice),true);
  for(const changed of [{epoch:null},{saved:'yes'},{stream:null},{stream:{...notice.stream,sequence:NaN}},{stream:{state:'finished'}}])assert.equal(validStreamSnapshot({...notice,...changed}),false);
});
