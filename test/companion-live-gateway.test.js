import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,realpath,writeFile,rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {WebSocket,WebSocketServer} from 'ws';
import {initializeMemoryRoot} from '../dist/index.js';
import {startJumpyBrainHttpServer} from '../dist/adapters/http-server/index.js';
import {startCompanionGateway} from '../integrations/macos-companion/gateway.mjs';
import {attachCompanionLive} from '../integrations/macos-companion/live-gateway.mjs';
import {SwitchCoordinator} from '../integrations/macos-companion/switch-coordinator.mjs';
const documentId='mem_12345678-1234-1234-1234-123456789abc';
const content=body=>`---\nid: ${documentId}\ntype: note\ntitle: Gateway\n---\n${body}`;
async function until(check){for(let i=0;i<300;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Gateway deadline');}
async function socket(url,options={}){
  const ws=new WebSocket(url,options);await once(ws,'open');let serial=0;const pending=new Map(),packets=[];
  ws.on('message',raw=>{const packet=JSON.parse(raw.toString());packets.push(packet);const request=pending.get(packet.id);if(request){pending.delete(packet.id);clearTimeout(request.timer);request.resolve(packet);}});
  ws.on('close',()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Gateway closed'));}pending.clear();});
  const rpc=(method,params={})=>{const id=String(++serial);return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject,timer:setTimeout(()=>{pending.delete(id);reject(new Error('Gateway RPC timeout'));},2000)});ws.send(JSON.stringify({id,method,params}));});};
  return{ws,rpc,packets};
}
async function fullFixture(t,allowWrites){
  const temporary=await realpath(await mkdtemp(path.join(os.tmpdir(),'jb-live-bridge-'))),root=path.join(temporary,'brain'),directory=path.join(temporary,'support');
  await initializeMemoryRoot(root);await mkdir(directory,{mode:0o700});const file=path.join(root,'notes','gateway.md');await writeFile(file,content('base\n'));
  const operator=randomBytes(32).toString('hex'),control=randomBytes(32).toString('hex');
  const backend=await startJumpyBrainHttpServer({root,apiKeys:[operator],port:0,autoIndex:false});
  const credentials={get:async()=>null,set:async()=>{},delete:async()=>{},selectFolder:async()=>root};
  const gateway=await startCompanionGateway({runtimeRoot:process.cwd(),directory,initialRoot:root,port:0,controlKey:control,credentials,localFactory:async()=>({url:backend.url,token:operator,close:async()=>{}}),switchTimeoutMs:500});
  const post=(route,body,headers={})=>fetch(gateway.url+route,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  if(!allowWrites){const state=gateway.store.snapshot(),profile={...state.profiles[0],allowWrites:false};const saved=await post('/companion/profiles',{profile,revision:state.revision},{Authorization:'Bearer '+control});assert.equal(saved.status,200,await saved.text());}
  const session=await post('/companion/session',{token:control},{Origin:gateway.url});assert.equal(session.status,200);const cookie=session.headers.get('set-cookie').split(';')[0],generation=gateway.coordinator.generation;
  assert.equal((await post('/companion/register',{tabId:'tab',generation},{Cookie:cookie,Origin:gateway.url})).status,200);
  const client=await socket(gateway.url.replace(/^http/,'ws')+'/ws',{origin:gateway.url,headers:{Cookie:cookie}});
  const hello=await client.rpc('hello',{protocol:2,token:'companion-session',generation,tabId:'tab'});assert.equal(hello.ok,true);
  t.after(async()=>{client.ws.terminate();await gateway.close();await backend.close();await rm(temporary,{recursive:true,force:true});});
  const rpc=(method,params={})=>client.rpc(method,{documentId,clientId:'editor',...params});
  return{root,file,gateway,client,rpc,hello};
}
test('read-only real companion RPC reads history/recovery while redo, resync and arbitrary methods remain denied',async t=>{
  const f=await fullFixture(t,false);assert.equal(f.hello.result.principal.role,'reader');
  const opened=await f.rpc('open');assert.equal(opened.ok,true);const base=opened.result;
  await writeFile(f.file,content('external replacement\n'));await until(()=>f.client.packets.some(packet=>packet.event==='document'&&packet.snapshot?.recovery));
  const current=f.client.packets.findLast(packet=>packet.event==='document'&&packet.snapshot?.recovery).snapshot;
  const history=await f.rpc('history.read',{epoch:base.epoch,fromRevision:base.revision,toRevision:current.revision});assert.equal(history.ok,true);assert.ok(history.result.operations.length);
  const recovery=current.recovery,read=await f.rpc('recovery.read',{recoveryId:recovery.recoveryId,expectedBaseHash:recovery.baseContentHash,expectedExternalHash:recovery.externalContentHash,format:'editable'});assert.equal(read.ok,true);assert.equal(read.result.base.body,'base\n');assert.equal(read.result.external.body,'external replacement\n');
  for(const method of ['redo','resync','edit','title'])assert.equal((await f.rpc(method,{epoch:current.epoch,baseRevision:current.revision,operationId:'denied'})).error.code,'read_only');
  assert.equal((await f.rpc('admin.read-everything')).error.code,'unknown_method');
  assert.equal((await f.rpc('history.read',{clientId:'different-tab',epoch:base.epoch,fromRevision:0})).error.code,'document_not_open');
  assert.equal(f.gateway.coordinator.inFlight,0);
});
test('writer companion forwards guarded redo and retains actual canonical source',async t=>{
  const f=await fullFixture(t,true),opened=(await f.rpc('open')).result;
  const edited=await f.rpc('edit',{epoch:opened.epoch,baseRevision:opened.revision,operationId:'change',start:0,deleteCount:1,insert:'B'});assert.equal(edited.ok,true);
  const undo=await f.rpc('undo',{epoch:edited.result.epoch,operationId:'undo'});assert.equal(undo.ok,true);assert.equal(undo.result.body,'base\n');
  const redo=await f.rpc('redo',{epoch:undo.result.epoch,operationId:'redo'});assert.equal(redo.ok,true);assert.equal(redo.result.body,'Base\n');assert.equal(f.gateway.coordinator.inFlight,0);
});
async function controlled(t,{holdHello=false,failDestination=false}={}){
  const upstream=createServer((_req,res)=>res.end()),wss=new WebSocketServer({server:upstream}),received=[];
  wss.on('connection',ws=>ws.on('message',raw=>{const packet=JSON.parse(raw.toString());received.push({ws,packet});if(packet.method==='hello'&&!holdHello)ws.send(JSON.stringify({id:packet.id,ok:true,result:{protocol:2,principal:{id:'fixture',role:'writer'}}}));}));
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const coordinator=new SwitchCoordinator({timeoutMs:200}),generation=coordinator.generation;coordinator.register('tab',generation);
  const server=createServer((_req,res)=>res.end());let origin, current=true;
  const dest={url:`http://127.0.0.1:${upstream.address().port}`,key:randomBytes(16).toString('hex')};
  const bridge=attachCompanionLive({server,authenticate:request=>{if(request.headers['x-test-session']!=='authorized')throw new Error('Denied');},coordinator,active:()=>({allowWrites:true}),destination:async()=>{if(failDestination)throw new Error('Injected destination failure');return dest;},destinationCurrent:()=>current,origin:()=>origin});
  server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
  const client=await socket(origin.replace(/^http/,'ws')+'/ws',{origin,headers:{'x-test-session':'authorized'}});
  const hello=()=>client.rpc('hello',{protocol:2,token:'companion-session',generation,tabId:'tab'});
  t.after(async()=>{client.ws.terminate();await bridge.close();coordinator.close();for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);});
  return{coordinator,generation,client,hello,received,retire:()=>{current=false;bridge.retireDestination(dest);}};
}
for(const method of ['history.read','recovery.read'])test(`delayed ${method} is observational and cannot block switch or leak an old-scope reply`,async t=>{
  const f=await controlled(t);assert.equal((await f.hello()).ok,true);const reading=f.client.rpc(method,{documentId,clientId:'editor',epoch:'fixture',fromRevision:0}).catch(()=>null);await until(()=>f.received.some(entry=>entry.packet.method===method));assert.equal(f.coordinator.inFlight,0);
  let activated=false;const switching=f.coordinator.switch('next',async()=>{activated=true;});f.coordinator.acknowledge('tab',f.coordinator.pending.id,true);await switching;assert.equal(activated,true);
  const held=f.received.find(entry=>entry.packet.method===method);held.ws.send(JSON.stringify({id:held.packet.id,ok:true,result:{oldScopeMustNotEscape:true}}));
  await reading;assert.equal(f.client.packets.some(packet=>packet.result?.oldScopeMustNotEscape),false);
});
test('a dispatched write stays in the switch barrier until its acknowledgement',async t=>{
  const f=await controlled(t);assert.equal((await f.hello()).ok,true);const writing=f.client.rpc('redo',{documentId,clientId:'editor',epoch:'fixture',operationId:'redo'});await until(()=>f.received.some(entry=>entry.packet.method==='redo'));assert.equal(f.coordinator.inFlight,1);
  let activated=false;const switching=f.coordinator.switch('next',async()=>{activated=true;});f.coordinator.acknowledge('tab',f.coordinator.pending.id,true);await new Promise(resolve=>setTimeout(resolve,20));assert.equal(activated,false);
  const held=f.received.find(entry=>entry.packet.method==='redo');held.ws.send(JSON.stringify({id:held.packet.id,ok:true,result:{saved:true}}));assert.equal((await writing).ok,true);await switching;assert.equal(activated,true);assert.equal(f.coordinator.inFlight,0);
});
for(const kind of ['lost hello','failed destination'])test(`${kind} cannot leave a permanent mutation admission`,async t=>{
  const f=await controlled(t,{holdHello:kind==='lost hello',failDestination:kind==='failed destination'}),hello=f.hello().catch(()=>null);
  if(kind==='lost hello')await until(()=>f.received.some(entry=>entry.packet.method==='hello'));else await hello;
  assert.equal(f.coordinator.inFlight,0);f.client.ws.close();await hello;
  let activated=false;const switching=f.coordinator.switch('next',async()=>{activated=true;});f.coordinator.acknowledge('tab',f.coordinator.pending.id,true);await switching;assert.equal(activated,true);
});
test('an interrupted dispatched write keeps its uncertain switch barrier',async t=>{
  const f=await controlled(t);assert.equal((await f.hello()).ok,true);
  const writing=f.client.rpc('edit',{documentId,clientId:'editor',epoch:'fixture',operationId:'uncertain',start:0,deleteCount:0,insert:'X'}).catch(()=>null);
  await until(()=>f.received.some(entry=>entry.packet.method==='edit'));const held=f.received.find(entry=>entry.packet.method==='edit');held.ws.terminate();await writing;assert.equal(f.coordinator.inFlight,1);
  let activated=false;const switching=f.coordinator.switch('next',async()=>{activated=true;});f.coordinator.acknowledge('tab',f.coordinator.pending.id,true);
  await assert.rejects(switching,error=>error.code==='save_timeout');assert.equal(activated,false);assert.equal(f.coordinator.inFlight,1);
});
for(const kind of ['unknown tab','stale generation'])test(`${kind} hello never reaches the pinned upstream`,async t=>{
  const f=await controlled(t);const result=await f.client.rpc('hello',{protocol:2,token:'companion-session',generation:f.generation-(kind==='stale generation'?1:0),tabId:kind==='unknown tab'?'unregistered':'tab'});assert.equal(result.error.code,'stale_generation');assert.equal(f.received.length,0);assert.equal(f.coordinator.inFlight,0);
});

test('backend retirement closes its subscription and fences a late same-brain reply',async t=>{
  const f=await controlled(t);assert.equal((await f.hello()).ok,true);
  const reading=f.client.rpc('history.read',{documentId,clientId:'editor',epoch:'old',fromRevision:0}).catch(()=>null);
  await until(()=>f.received.some(entry=>entry.packet.method==='history.read'));
  f.retire();
  const held=f.received.find(entry=>entry.packet.method==='history.read');
  held.ws.send(JSON.stringify({id:held.packet.id,ok:true,result:{retiredBackendMustNotEscape:true}}));
  await reading;
  assert.equal(f.client.packets.some(packet=>packet.result?.retiredBackendMustNotEscape),false);
  assert.equal(f.coordinator.inFlight,0);
});
