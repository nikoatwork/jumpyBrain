import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../dist/runtime/index.js';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {AccessStore} from '../dist/adapters/access-control/index.js';

test('readiness stays inference-free while explicit app attachment activates shared maintenance',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'jb-maintenance-activation-'));await initializeMemoryRoot(root);
  const access=new AccessStore(root),reader=await access.issue({name:'Reader',role:'reader'});
  let calls=0;
  const server=await startJumpyBrainHttpServer({root,apiKeys:['disposable-operator'],port:0,autoIndex:false,lazyIndex:true,indexRunner:{isIndexing:()=>false,indexNow:async()=>{calls++;return {result:{readiness:{freshness:'fresh'}},index:{stale:false}};}}});
  t.after(async()=>{await server.close();access.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
  const status=async()=>await(await fetch(server.url+'/memories/all/status',{headers:{Authorization:'Bearer disposable-operator'}})).json();
  assert.equal((await status()).maintenance.enabled,false);assert.equal(calls,0);
  assert.equal((await fetch(server.url+'/_backend/activate',{method:'POST',headers:{Authorization:'Bearer '+reader.token}})).status,403);
  assert.equal((await status()).maintenance.enabled,false);
  assert.equal((await fetch(server.url+'/_backend/activate',{method:'POST',headers:{Authorization:'Bearer disposable-operator'}})).status,200);
  assert.equal((await status()).maintenance.enabled,true);
});
