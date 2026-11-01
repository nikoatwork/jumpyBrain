import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { SourceSession } from './source-model/model.mjs';
import { DocumentSession, bodyOf, withBody, contentHash } from './durability/session.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),corpusBytes=await readFile(path.join(root,'prototypes/multiplayer/corpus.json'));
const corpus=JSON.parse(corpusBytes),cases=[];
async function run(id,operation) {
  try {cases.push({id,status:'passed',...await operation()});}
  catch(error) {cases.push({id,status:'error',error:error.stack??String(error)});}
}
async function fixture(operation) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'jumpybrain-m1-composed-'));
  try {await mkdir(path.join(directory,'notes'));await writeFile(path.join(directory,'notes/fixture.md'),corpus.canonical.header+corpus.canonical.body);
    return await operation(directory);}
  finally {await rm(directory,{recursive:true,force:true});}
}
await run('I01-streaming-source-operations-publish-and-rebuild-from-markdown',()=>fixture(async(directory)=>{
  const publication=await DocumentSession.open(directory,corpus.canonical.id);
  const model=new SourceSession(bodyOf(publication.baseline.content),{epoch:publication.epoch});
  model.apply({actor:'alice',id:'a',epoch:model.epoch,baseRevision:0,start:0,deleteCount:0,insert:'Alice '});
  model.apply({actor:'bob',id:'b',epoch:model.epoch,baseRevision:0,start:corpus.canonical.body.length,deleteCount:0,insert:' Bob'});
  model.beginStream('agent','draft',model.body.length);
  let sequence=0;
  for(const chunk of [' streamed',' text','\n'+String.fromCharCode(96).repeat(3)+'js\npartial']) {
    model.chunk('agent','draft',sequence++,chunk);
    const queued=publication.queue({epoch:publication.epoch,baseRevision:publication.revision,id:randomUUID(),
      content:withBody(publication.baseline.content,model.body)});
    assert.equal(queued.saved,false);
    const receipt=await publication.flush();
    const bytes=await readFile(path.join(directory,'notes/fixture.md'));
    assert.equal(receipt.saved,true);assert.equal(receipt.contentHash,contentHash(bytes));
    assert.equal(bodyOf(bytes.toString()),model.body);
  }
  model.cancel('agent','draft');
  const saved=await readFile(path.join(directory,'notes/fixture.md'),'utf8');
  await mkdir(path.join(directory,'.jumpybrain/collaboration'),{recursive:true});
  await writeFile(path.join(directory,'.jumpybrain/collaboration/obsolete.json'),'not required to recover Saved content');
  await rm(path.join(directory,'.jumpybrain/collaboration'),{recursive:true});
  const reopened=await DocumentSession.open(directory,corpus.canonical.id);
  const rebuilt=new SourceSession(bodyOf(reopened.baseline.content),{epoch:reopened.epoch});
  assert.equal(rebuilt.body,model.body);assert.notEqual(rebuilt.epoch,model.epoch);
  assert.throws(()=>rebuilt.apply({actor:'old-agent',id:'old',epoch:model.epoch,baseRevision:0,start:0,deleteCount:0,insert:'replay'}),{code:'epoch_changed'});
  assert.equal(await readFile(path.join(directory,'notes/fixture.md'),'utf8'),saved);
  return {streamChunks:3,humans:2,incompleteMarkdownSaved:true,savedContentRecoveredWithoutBinaryState:true};
}));
await run('I02-legacy-client-cannot-bypass-pending-source-model',()=>fixture(async(directory)=>{
  const publication=await DocumentSession.open(directory,corpus.canonical.id);
  const model=new SourceSession(bodyOf(publication.baseline.content),{epoch:publication.epoch});
  model.beginStream('agent','pending',model.body.length);
  model.chunk('agent','pending',0,' Pending generated text.');
  publication.queue({epoch:publication.epoch,baseRevision:0,id:'pending',content:withBody(publication.baseline.content,model.body)});
  await assert.rejects(publication.legacyReplace({ifMatch:publication.baseline.contentHash,content:corpus.canonical.header+'Old client replacement'}),{code:'live_edits_pending'});
  assert.ok(publication.pending.includes('Pending generated text.'));
  assert.equal(await readFile(path.join(directory,'notes/fixture.md'),'utf8'),corpus.canonical.header+corpus.canonical.body);
  await publication.flush();
  assert.equal(bodyOf(await readFile(path.join(directory,'notes/fixture.md'),'utf8')),model.body);
  return {oldClientRetainsProposal:true,pendingAgentTextPreserved:true};
}));
await run('I03-bounded-source-history-workload',async()=>{
  const model=new SourceSession('a'.repeat(60000)),durations=[];
  for(let index=0;index<1000;index++) {
    const start=performance.now(),offset=index%model.body.length;
    model.apply({actor:'agent',id:String(index),epoch:model.epoch,baseRevision:model.revision,
      start:offset,deleteCount:1,insert:model.body[offset]==='a'?'b':'a'});
    durations.push(performance.now()-start);
  }
  assert.equal(model.history.length,128);assert.equal(model.versions.size,129);
  assert.equal(model.receipts.size,128);assert.equal(model.actorUndo.size,1);
  assert.equal(model.streams.size,0);assert.equal(model.body.length,60000);
  durations.sort((a,b)=>a-b);
  return {operations:1000,documentBytes:60000,history:128,versions:129,receipts:128,
    retainedVersionUtf8Bytes:[...model.versions.values()].reduce((sum,text)=>sum+Buffer.byteLength(text),0),
    observedP95Ms:durations[Math.floor(durations.length*0.95)],timingIsAdvisory:true};
});
const report={version:1,candidate:'integration-v1',status:cases.every(c=>c.status==='passed')?'passed':'error',cases,
  corpusSha256:createHash('sha256').update(corpusBytes).digest('hex'),limits:[
    'Composes the in-memory source model and actual canonical publisher, not a production network/backend.',
    'The full editor still requires a structural binding before newline/format operations can be enabled live.',
  ]};
const out=process.env.JUMPYBRAIN_M1_INTEGRATION_OUT??path.join(root,'.local-pack/multiplayer/M1-integration.json');
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='passed'?0:1;
