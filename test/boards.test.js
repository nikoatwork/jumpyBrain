import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, link, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initializeMemoryRoot, listBoards, saveBoard, readBoard, deleteBoard, getBoardStatus } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { createRemoteMemoryTransport } from '../dist/adapters/http-client/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';

export const board = (name = 'Wedding planning') => ({schemaVersion:1,id:randomUUID(),name,archived:false,columns:['Plan','Arrange','Confirmed'].map(name=>({name,pages:[]}))});
const noteId = 'mem_00000000-0000-0000-0000-000000000001';
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(),'jb-canonical-board-'));
  await initializeMemoryRoot(directory);
  if (!t.boardResources) { t.boardResources=[];t.boardRoots=[];t.after(async()=>{for(const resource of t.boardResources.reverse())await resource.close();for(const root of t.boardRoots)await rm(root,{recursive:true,force:true});}); }
  t.boardRoots.push(directory);
  return directory;
}
test('one canonical JSON per board survives derived-state removal and independent runtime access',async t=>{
  const root=await fixture(t), value=board();
  assert.deepEqual(await listBoards(root),{boards:[],hashes:{}});
  await assert.rejects(readdir(path.join(root,'boards')));
  value.columns[0].pages=[noteId];const saved=await saveBoard(root,value);
  assert.deepEqual(JSON.parse(await readFile(path.join(root,'boards',value.id+'.json'),'utf8')),value);
  await mkdir(path.join(root,'.jumpybrain'),{recursive:true});await rm(path.join(root,'.jumpybrain'),{recursive:true});
  assert.deepEqual(await readBoard(root,value.id),saved);
  const other=await saveBoard(root,board('Another'));
  const renamed=await saveBoard(root,{...value,name:'Our wedding'},saved.contentHash);
  assert.notEqual(renamed.contentHash,saved.contentHash);
  await assert.rejects(saveBoard(root,value,saved.contentHash),e=>e.code==='board_conflict');
  await assert.rejects(deleteBoard(root,value.id,saved.contentHash),e=>e.code==='board_conflict');
  await assert.rejects(saveBoard(root,value),e=>e.code==='board_conflict');
  assert.equal((await readBoard(root,other.board.id)).contentHash,other.contentHash,'unrelated board never changed');
  assert.deepEqual(await deleteBoard(root,value.id,renamed.contentHash),{id:value.id,deleted:true,notesPreserved:true});
  assert.equal((await listBoards(root)).boards.length,1);
  assert.deepEqual((await readdir(path.join(root,'boards'))).filter(name=>name.startsWith('.')),[]);
});
test('board status reads current notes without indexing, preserves exact lines and reports missing/truncated evidence',async t=>{
  const root=await fixture(t), value=board();
  const content=`---\nid: ${noteId}\ntitle: Venue shortlist\ntype: note\n---\n# Venue\nNo venue booked.\n`;
  await writeFile(path.join(root,'notes/venue.md'),content);
  value.columns[0].pages=[noteId,'mem_00000000-0000-0000-0000-000000000002'];
  const saved=await saveBoard(root,value);
  let status=await getBoardStatus(root,value.id,1);
  assert.equal(status.omittedCards,1);assert.equal(status.partial,true);assert.equal(status.contentHash,saved.contentHash);
  assert.equal(status.columns[0].cards[0].excerpt,'# Venue\nNo venue booked.');assert.equal(status.columns[0].cards[0].startLine,6);
  status=await getBoardStatus(root,value.id);assert.equal(status.unavailableCards,1);assert.equal(status.columns[0].cards[1].availability,'missing');
  await writeFile(path.join(root,'notes/venue.md'),content.replace('No venue booked.','x'.repeat(1100)));
  status=await getBoardStatus(root,value.id);assert.equal(status.truncatedCards,1);
  await deleteBoard(root,value.id,saved.contentHash);assert.match(await readFile(path.join(root,'notes/venue.md'),'utf8'),/# Venue/);
});
test('invalid/schema-mismatched/oversized/linked board files fail closed without reset',async t=>{
  const root=await fixture(t), value=board();await saveBoard(root,value);
  const file=path.join(root,'boards',value.id+'.json'), original=await readFile(file,'utf8');
  for(const bad of ['{broken',JSON.stringify({...value,schemaVersion:2}),JSON.stringify({...value,id:randomUUID()}),' '.repeat(65537)]){
    await writeFile(file,bad);await assert.rejects(listBoards(root));await assert.rejects(saveBoard(root,value,'sha256:'+'0'.repeat(64)));assert.equal(await readFile(file,'utf8'),bad);
  }
  await writeFile(file,original);await link(file,path.join(root,'hardlink'));await assert.rejects(readBoard(root,value.id));await rm(path.join(root,'hardlink'));
  await rm(file);await writeFile(path.join(root,'elsewhere.json'),original);await symlink(path.join(root,'elsewhere.json'),file);await assert.rejects(readBoard(root,value.id));await assert.rejects(saveBoard(root,value));
  await rm(path.join(root,'boards'),{recursive:true});await mkdir(path.join(root,'elsewhere'));await symlink(path.join(root,'elsewhere'),path.join(root,'boards'));
  await assert.rejects(listBoards(root));await assert.rejects(saveBoard(root,value));assert.deepEqual(await readdir(path.join(root,'elsewhere')),[]);
});
test('cooperating concurrent writers cannot both overwrite one prior hash; lock contention preserves bytes',async t=>{
  const root=await fixture(t), value=board(), saved=await saveBoard(root,value);
  const results=await Promise.allSettled([saveBoard(root,{...value,name:'A'},saved.contentHash),saveBoard(root,{...value,name:'B'},saved.contentHash)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const current=await readBoard(root,value.id);
  const lock=path.join(root,'boards/.write.lock');await writeFile(lock,'fixture');
  await assert.rejects(deleteBoard(root,value.id,current.contentHash),e=>e.code==='board_busy');
  assert.equal((await readBoard(root,value.id)).contentHash,current.contentHash);assert.equal(await readFile(lock,'utf8'),'fixture');
});
test('authenticated loopback protocol shares canonical files and enforces hash/method/schema boundaries',async t=>{
  const root=await fixture(t), server=await startJumpyBrainHttpServer({root,apiKeys:['fixture'],port:0,host:'127.0.0.1',autoIndex:false});
  t.boardResources.push(server);const client=createRemoteMemoryTransport({url:server.url,apiKey:'fixture'});
  assert.equal((await fetch(server.url+'/memories/all/boards')).status,401);
  const value=board(), saved=await client.saveBoard(value);
  assert.deepEqual(await readBoard(root,value.id),saved);assert.deepEqual((await client.listBoards()).boards,[value]);
  const renamed=await client.saveBoard({...value,name:'Shared wedding'},saved.contentHash);
  await assert.rejects(client.saveBoard(value,saved.contentHash),e=>e.status===409);
  const noHash=await fetch(server.url+'/memories/all/boards/'+value.id,{method:'DELETE',headers:{Authorization:'Bearer fixture'}});assert.equal(noHash.status,428);
  assert.equal((await client.getBoardStatus(value.id)).name,'Shared wedding');
  await client.deleteBoard(value.id,renamed.contentHash);assert.deepEqual(await listBoards(root),{boards:[],hashes:{}});
  for(const [route,method,body] of [['/memories/all/boards','PUT',value],['/memories/all/boards','POST',{...value,root:'/private/server'}],['/memories/all/boards/../bad','GET',undefined]]){
    const response=await fetch(server.url+route,{method,headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.ok(response.status>=400);assert.equal((await response.text()).includes(root),false);
  }
});
test('Mac gateway uses the selected root and remote writes require profile approval',async t=>{
  const root=await fixture(t), remoteRoot=await fixture(t), support=path.join(root,'support');await mkdir(support,{mode:0o700});
  const server=await startJumpyBrainHttpServer({root:remoteRoot,apiKeys:['fixture'],port:0,host:'127.0.0.1',autoIndex:false});
  t.boardResources.push(server);
  const gateway=await startCompanionGateway({runtimeRoot:path.resolve('.'),directory:support,initialRoot:root,port:0,controlKey:'b'.repeat(64),credentials:{get:async()=> 'fixture',set:async()=>{},delete:async()=>{}}});
  t.boardResources.push(gateway);
  const request=async(route,method='GET',body,extra={})=>fetch(gateway.url+route,{method,headers:{Authorization:'Bearer '+'b'.repeat(64),'X-Companion-Generation':String(gateway.state().generation),'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
  const initial=gateway.state(), value=board();assert.equal((await request('/memories/all/boards','POST',value)).status,200);
  assert.equal((await readBoard(root,value.id)).board.name,value.name);
  assert.equal((await request('/companion/collections')).status,405,'legacy store is removed');
  assert.equal((await request('/memories/all/boards','GET',undefined,{'X-Companion-Generation':String(initial.generation-1)})).status,409);
  const added=await request('/companion/profiles','POST',{revision:initial.revision,profile:{name:'Shared',kind:'remote',url:server.url,key:'fixture',allowWrites:false}});
  const profile=(await added.json()).profiles.find(p=>p.kind==='remote');await request('/companion/switch','POST',{id:profile.id});
  assert.equal((await request('/memories/all/boards','POST',board())).status,403);assert.deepEqual(await listBoards(remoteRoot),{boards:[],hashes:{}});
  const remoteBoard=await saveBoard(remoteRoot,board('Remote board'));
  assert.equal((await (await request('/memories/all/boards')).json()).boards[0].name,'Remote board');
  assert.equal((await request('/memories/all/boards/'+remoteBoard.board.id,'DELETE',undefined,{'If-Match':remoteBoard.contentHash})).status,403);
  await assert.rejects(readFile(path.join(support,'collections.json')));
});
