import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {initializeMemoryRoot} from '../dist/runtime/index.js';
import {ensureRootBackend,stopRootBackend} from '../dist/app/backend-host/index.js';
import {backendCallMutates} from '../dist/app/backend-rpc.js';
import {localBackendCall} from '../dist/cli/local-transport.js';
const id='mem_12345678-1234-1234-1234-123456789abc';
test('private operation admission distinguishes canonical publication from derived work',()=>{
  for(const method of ['readMemoryDocument','previewMemoryDocumentDeletion','searchMemory','compactSearchMemory','expandMemoryDocument','indexMemory','ensureSavedMemoryIndexed','memoryRootStatus','overviewMemory','listMemoryAttention','listBoards','readBoard','getBoardStatus','getDreamWindow','getDreamStatus','getDreamBatch','checkDreamSources'])assert.equal(backendCallMutates(method),false,method);
  for(const method of ['rememberMemory','writeSessionWrapup','updateMemoryDocument','patchMemoryDocumentAttention','deleteMemoryDocument','saveBoard','deleteBoard','processMemory','initializeMemoryRoot','migrateLogseq','migrateObsidian','createDreamBatch','completeDreamBatch','abandonDreamBatch','unknown'])assert.equal(backendCallMutates(method),true,method);
});
test('real caller/owner dispatch preserves hash guards, cancellation, root ownership and uncertain outcomes', {timeout:20000},async t=>{
  const root=await realpath(await mkdtemp(path.join(tmpdir(),'jb-rpc-contract-')));
  await initializeMemoryRoot(root);
  t.after(async()=>{await stopRootBackend(root);await rm(root,{recursive:true,force:true});});
  const file=path.join(root,'notes','contract.md');
  await writeFile(file,`---\nid: ${id}\ntype: note\ntitle: Contract\n---\nbase\n`);
  const owner=await ensureRootBackend(root);
  const post=async (route,body,operationId)=>{
    const response=await fetch(owner.url+route,{method:'POST',headers:{Authorization:'Bearer '+owner.token,'content-type':'application/json',...(operationId?{'x-jumpybrain-operation':operationId}:{})},body:JSON.stringify(body)});
    return {status:response.status,packet:await response.json()};
  };
  const before=await localBackendCall(root,'readMemoryDocument',[id]);
  const saved=await localBackendCall(root,'updateMemoryDocument',[id,before.content+'first\n',{ifMatch:before.contentHash}]);
  assert.equal(saved.oldContentHash,before.contentHash);assert.notEqual(saved.newContentHash,before.contentHash);
  const published=await readFile(file,'utf8');assert.ok(published.endsWith('---\nbase\nfirst\n'));assert.equal(saved.newContentHash,'sha256:'+createHash('sha256').update(published).digest('hex'));
  await assert.rejects(localBackendCall(root,'updateMemoryDocument',[id,'stale',{ifMatch:before.contentHash}]),e=>e.code==='precondition_failed');
  for(const [body,code] of [[{method:'unknown',args:[]},'method_not_found'],[{method:'readMemoryDocument',args:'not-array'},'invalid_request'],[{method:'readMemoryDocument',args:Array(9).fill(null)},'invalid_request']]) {
    const result=await post('/_backend/call',body);assert.equal(result.status,400);assert.equal(result.packet.error.code,code);
  }
  const status=await post('/_backend/call',{method:'memoryRootStatus',args:[],root:'/must-not-select'});
  assert.equal(status.status,200);assert.equal(status.packet.result.root,root);
  const operationId=randomUUID();await post('/_backend/cancel',{id:operationId});
  const cancelled=await post('/_backend/call',{method:'updateMemoryDocument',args:[id,'cancelled',{ifMatch:saved.newContentHash}]},operationId);
  assert.equal(cancelled.packet.error.code,'execution_aborted');assert.equal(await readFile(file,'utf8'),published);
  const originalFetch=globalThis.fetch;let dispatches=0;
  globalThis.fetch=async(url,init)=>{
    const response=await originalFetch(url,init);
    if(String(url).endsWith('/_backend/call')){dispatches++;await response.arrayBuffer();throw new Error('Fixture lost reply after dispatch');}
    return response;
  };
  try {await assert.rejects(localBackendCall(root,'updateMemoryDocument',[id,before.content+'confirmed once\n',{ifMatch:saved.newContentHash}]),/lost reply/);}
  finally {globalThis.fetch=originalFetch;}
  assert.equal(dispatches,1);assert.ok((await readFile(file,'utf8')).endsWith('---\nbase\nconfirmed once\n'));const after=await localBackendCall(root,'readMemoryDocument',[id]);assert.equal(after.frontmatter.id,id);assert.equal(after.title,'Contract');assert.equal(after.contentHash,'sha256:'+createHash('sha256').update(await readFile(file)).digest('hex'));
});
