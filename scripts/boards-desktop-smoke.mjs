// Actual production Mac window/gateway; all brains, credentials and Electron data are disposable.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { initializeMemoryRoot, saveBoard, listBoards } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { randomUUID } from 'node:crypto';

const repo=path.resolve('.'), temporary=await realpath(await mkdtemp(path.join(os.tmpdir(),'jb-native-boards-')));
const root=path.join(temporary,'memory'), remoteRoot=path.join(temporary,'remote-memory'), support=path.join(temporary,'support');
const output=path.join(repo,'.local-pack/boards-native');
const ids=[1,2].map(n=>'mem_00000000-0000-0000-0000-'+String(n).padStart(12,'0'));
let gateway,server,child,timer;
try {
  await mkdir(support,{mode:0o700});await mkdir(output,{recursive:true});
  for(const directory of [root,remoteRoot]){
    await initializeMemoryRoot(directory);
    for(const [i,title] of ['Venue shortlist','Guest list & RSVPs'].entries()) await writeFile(path.join(directory,'notes',i+'.md'),`---\nid: ${ids[i]}\ntitle: ${title}\ntype: note\n---\n# ${title}\nNo date, budget or bookings confirmed.\n`);
  }
  server=await startJumpyBrainHttpServer({root:remoteRoot,apiKeys:['fixture-remote'],host:'127.0.0.1',port:0,autoIndex:false});
  const remoteBoard=await saveBoard(remoteRoot,{schemaVersion:1,id:randomUUID(),name:'Shared wedding QA',archived:false,columns:[{name:'Ideas',pages:[ids[0]]},{name:'Arranging',pages:[]},{name:'Confirmed',pages:[]}]});
  gateway=await startCompanionGateway({runtimeRoot:repo,directory:support,initialRoot:root,port:0,controlKey:'b'.repeat(64),
    localFactory:options=>startJumpyBrainHttpServer({...options,autoIndex:false}),
    credentials:{get:async()=> 'fixture-remote',set:async()=>{},delete:async()=>{}}});
  const localId=gateway.state().activeId;
  await gateway.store.save({kind:'remote',name:'Read-only shared QA',url:server.url,key:'fixture-remote',allowWrites:false},gateway.store.snapshot().revision);
  const remoteId=gateway.store.snapshot().profiles.find(profile=>profile.kind==='remote').id;
  const config={origin:gateway.url,key:'b'.repeat(64),root,remoteRoot,remoteId,localId,remoteBoardId:remoteBoard.board.id,ids,output,
    node:process.execPath,cli:path.join(repo,'dist/cli.js'),userData:path.join(temporary,'electron'),result:path.join(output,'result.json')};
  const file=path.join(temporary,'fixture.json');await writeFile(file,JSON.stringify(config),{mode:0o600});
  const entry=path.join(temporary,'app');await mkdir(entry);await writeFile(path.join(entry,'package.json'),JSON.stringify({name:'jumpybrain-native-board-qa',type:'module',main:path.join(repo,'integrations/electron/smoke-boards.mjs')}));
  const electron=createRequire(new URL('../integrations/electron/package.json',import.meta.url))('electron');
  const env={...process.env,JUMPYBRAIN_BOARDS_FIXTURE:file};delete env.ELECTRON_RUN_AS_NODE;
  child=spawn(electron,[entry],{env,stdio:['ignore','pipe','pipe']});
  let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{const safe=chunk.toString().split(config.key).join('[fixture-key]');logs+=safe;process.stderr.write(safe);});
  timer=setTimeout(()=>child.kill('SIGKILL'),120000);
  const code=await new Promise(resolve=>child.once('exit',resolve));clearTimeout(timer);
  assert.equal(code,0,logs);const result=JSON.parse(await readFile(config.result,'utf8'));assert.equal(result.ok,true,result.error);
  assert.deepEqual((await listBoards(root)).boards,[],'all local QA boards were deleted');
  assert.equal((await listBoards(remoteRoot)).boards.length,1,'read-only remote board was preserved');
  for(const directory of [root,remoteRoot])for(const i of [0,1])assert.match(await readFile(path.join(directory,'notes',i+'.md'),'utf8'),/No date, budget or bookings confirmed/);
  await assert.rejects(readFile(path.join(support,'collections.json')));
  console.log('Native board CLI/UI smoke PASS. Captures and checks: '+output);
} finally {clearTimeout(timer);if(child?.exitCode===null)child.kill('SIGKILL');await gateway?.close();await server?.close();await rm(temporary,{recursive:true,force:true});}
