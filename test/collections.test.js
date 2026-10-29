import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCollectionStore } from '../dist/adapters/collections/store.js';
const board = () => ({id:'12345678-1234-1234-1234-123456789012',name:'Launch',archived:false,columns:['To do','Doing','Done'].map(name=>({name,pages:[]}))});
test('boards persist independently, isolate scopes and reject concurrent stale writes',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'jb-boards-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=createCollectionStore(dir);const b=board();b.columns[0].pages.push('mem_12345678-1234-1234-1234-123456789012');
 await store.put('brain-a',0,[b]);assert.deepEqual(await store.get('brain-b'),{revision:0,boards:[]});
 const results=await Promise.allSettled([store.put('brain-a',1,[{...b,archived:true}]),store.put('brain-a',1,[b])]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 const reopened=createCollectionStore(dir);assert.equal((await reopened.get('brain-a')).boards[0].archived,true);await reopened.put('brain-a',2,[b]);assert.equal((await reopened.get('brain-a')).boards[0].columns[0].pages.length,1);
 const bytes=await readFile(path.join(dir,'collections.json'),'utf8');b.columns[1].pages=[...b.columns[0].pages];await assert.rejects(store.put('brain-a',3,[b]));assert.equal(await readFile(path.join(dir,'collections.json'),'utf8'),bytes);
 await writeFile(path.join(dir,'collections.json'),'{bad');await assert.rejects(store.get('brain-a'));await assert.rejects(store.put('brain-a',0,[]));assert.equal(await readFile(path.join(dir,'collections.json'),'utf8'),'{bad');
});

test('gateway keeps personal boards local on a read-only remote profile and fences stale scopes',async t=>{
 const {startCompanionGateway}=await import('../integrations/macos-companion/gateway.mjs');
 const {fileURLToPath}=await import('node:url');
 const dir=await mkdtemp(path.join(os.tmpdir(),'jb-board-gateway-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const gateway=await startCompanionGateway({runtimeRoot:fileURLToPath(new URL('..',import.meta.url)),directory:dir,port:0,controlKey:'c'.repeat(64),fetchImpl:async()=>{throw new Error('offline')},credentials:{get:async()=>null,set:async()=>{},delete:async()=>{}}});t.after(()=>gateway.close());
 const request=async(route,body,extra={})=>{const response=await fetch(gateway.url+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+'c'.repeat(64),...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 const state=(await request('/companion/state')).body;
 const added=await request('/companion/profiles',{revision:state.revision,profile:{name:'Offline shared brain',kind:'remote',url:'https://offline.invalid',key:'fixture-board-key',allowWrites:false}});
 assert.equal(added.status,200,JSON.stringify(added.body));
 const profile=added.body.profiles[0];await request('/companion/switch',{id:profile.id});
 const saved=await request('/companion/collections',{revision:0,boards:[board()]},{'X-Collection-Brain':profile.id});assert.equal(saved.status,200);
 assert.equal((await request('/companion/collections',{revision:0,boards:[]})).status,409);
 assert.equal((await request('/companion/collections',{revision:1,boards:[]},{'X-Collection-Brain':'old-profile'})).status,409);
 assert.equal((await request('/companion/collections')).body.boards.length,1);
 const denied=await fetch(gateway.url+'/companion/collections');assert.equal(denied.status,401);
});
