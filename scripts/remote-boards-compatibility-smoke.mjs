// Production companion shell + gateway against a remote with old-server route
// support. Disposable Markdown/credentials only; no installed Mac app is used.
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeMemoryRoot, saveBoard } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';

const repo=fileURLToPath(new URL('..',import.meta.url));
const temporary=await mkdtemp(path.join(os.tmpdir(),'jb-remote-boards-'));
const root=path.join(temporary,'local'), remoteRoot=path.join(temporary,'remote'), support=path.join(temporary,'support');
const key='remote-boards-fixture', control='c'.repeat(64), id='mem_12345678-1234-4234-8234-123456789012';
let remote, gateway, proxy, browser, mode=404, boardWrites=0, rejectBoardWrite=false;
const boardId='12345678-1234-4234-8234-123456789012',missingId='mem_12345678-1234-4234-8234-123456789013';
try {
  for(const directory of [root,remoteRoot]){
    await initializeMemoryRoot(directory);
    await writeFile(path.join(directory,'notes/fixture.md'),'---\nid: '+id+'\ntype: note\ntitle: Ordinary note\n---\n# Ordinary note\nNotes still work when boards are unavailable.\n');
  }
  await saveBoard(remoteRoot,{schemaVersion:1,id:boardId,name:'Remote fixture board',archived:false,columns:[{name:'To do',pages:[missingId]},{name:'Doing',pages:[]},{name:'Done',pages:[]}]});
  await mkdir(support,{mode:0o700});
  remote=await startJumpyBrainHttpServer({root:remoteRoot,apiKeys:[key],host:'127.0.0.1',port:0,autoIndex:false});
  proxy=createServer((req,res)=>{
    const pathname=new URL(req.url,'http://fixture').pathname;
    if(pathname.startsWith('/memories/all/boards')&&req.method!=='GET'){
      boardWrites++;
      if(rejectBoardWrite){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'not_found',message:'Fixture write failure'}}));return;}
    }
    if(pathname==='/memories/all/boards'&&req.method==='GET'&&mode!==200){
      res.writeHead(mode,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'fixture_response',message:'Fixture response'}}));return;
    }
    const upstream=httpRequest(new URL(req.url,remote.url),{method:req.method,headers:req.headers},answer=>{
      res.writeHead(answer.statusCode,answer.headers);answer.pipe(res);
    });
    upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
  });
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  const proxyUrl='http://127.0.0.1:'+proxy.address().port, keys=new Map();
  gateway=await startCompanionGateway({runtimeRoot:repo,directory:support,initialRoot:root,port:0,controlKey:control,
    localFactory:options=>startJumpyBrainHttpServer({...options,autoIndex:false}),
    credentials:{get:async ref=>keys.get(ref),set:async(ref,value)=>keys.set(ref,value),delete:async ref=>keys.delete(ref)}});
  const localId=gateway.state().activeId;
  await gateway.store.save({kind:'remote',name:'Older remote',url:proxyUrl,key,allowWrites:true},gateway.store.snapshot().revision);
  const remoteId=gateway.store.snapshot().profiles.find(p=>p.kind==='remote').id;
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  const page=await browser.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(gateway.url+'/#companion='+control);
  const ready=async()=>page.waitForFunction(()=>companionRegistered&&!companionFrozen&&!companionActionBusy);
  const select=async profile=>{
    await ready();await page.locator('#companion-brain-switch').selectOption(profile);
    await page.waitForFunction(id=>companionRegistered&&companionState.activeId===id&&!companionFrozen,profile);
    await ready();
  };
  await ready().catch(async error=>{console.error('Startup errors',errors,await page.locator('body').innerText());throw error;});await page.waitForFunction(()=>!document.getElementById('new-board').disabled);
  await select(remoteId);
  const compatibility=page.locator('#sidebar-boards-compatibility');
  await compatibility.waitFor({state:'visible'});
  assert.match(await compatibility.textContent(),/does not support boards.*Update the remote server/);
  assert.equal(await page.locator('#new-board').isDisabled(),true);
  const retry=compatibility.getByRole('button',{name:'Check again'});await retry.focus();await page.evaluate(()=>boardsUI.refresh());
  assert.equal(await retry.evaluate(el=>el===document.activeElement),true,'unsupported refresh retains retry focus');
  assert.equal(await page.locator('#note-add-to-board').isDisabled(),true);
  await page.evaluate(()=>document.getElementById('new-board').onclick());
  assert.equal(boardWrites,0,'unsupported board controls cannot send writes');
  await page.evaluate(id=>navigation.navigate('/?note='+id),id);
  await page.waitForFunction(id=>state.editor?.state.loaded&&state.editor.state.documentId===id,id);
  assert.match(await page.locator('#note-editor').textContent(),/Notes still work/);
  assert.equal(await page.locator('#note-name').isEditable(),true,'ordinary note editing remains available');
  await page.evaluate(()=>navigation.navigate('/settings?section=boards'));
  await page.locator('#settings-boards-list').filter({hasText:'does not support boards'}).waitFor();
  assert.equal(await page.locator('#settings-new-board').isDisabled(),true);
  const settingsRetry=page.locator('#settings-boards-list').getByRole('button',{name:'Check again'});await settingsRetry.focus();await page.evaluate(()=>boardsUI.refresh());
  assert.equal(await settingsRetry.evaluate(el=>el===document.activeElement),true,'Settings retry focus survives unsupported refresh');
  // A supported local destination must not inherit the previous remote state.
  await page.evaluate(()=>navigation.navigate('/'));
  await select(localId);
  await page.waitForFunction(()=>!document.getElementById('new-board').disabled);
  assert.equal(await compatibility.isVisible(),false);
  await select(remoteId);await compatibility.waitFor({state:'visible'});
  // A server update is discoverable from the explicit read-only Check again action.
  mode=200;await compatibility.getByRole('button',{name:'Check again'}).click();
  await page.waitForFunction(()=>!document.getElementById('new-board').disabled);
  assert.equal(await compatibility.isVisible(),false);
  assert.equal(boardWrites,0);
  // Missing individual documents do not imply that boards are unsupported.
  await page.evaluate(id=>navigation.navigate('/?board='+id),boardId);
  await page.locator('.board-card-title').filter({hasText:'Page missing'}).waitFor();
  assert.equal(await compatibility.isVisible(),false);
  // A write404 can be a race/missing resource; only collection reads establish support.
  rejectBoardWrite=true;await page.locator('#new-board').click();
  await page.waitForFunction(()=>!boardsUI.pending());
  assert.equal(boardWrites,1);assert.equal(await compatibility.isVisible(),false);
  rejectBoardWrite=false;
  // A transient failure is not reclassified as missing feature support.
  for(const status of [503,401]){
    mode=status;await page.evaluate(()=>boardsUI.refresh());
    assert.equal(await compatibility.isVisible(),false,'status '+status+' is not unsupported');
  }
  mode=200;await page.evaluate(()=>boardsUI.refresh());
  // A 405 on the collection read is unsupported too, including read-only clients.
  const s=gateway.state(), p=s.profiles.find(p=>p.id===remoteId);
  const changed=fetch(gateway.url+'/companion/profiles',{method:'POST',headers:{Authorization:'Bearer '+control,'Content-Type':'application/json'},body:JSON.stringify({revision:s.revision,profile:{id:p.id,name:p.name,kind:p.kind,url:p.url,allowWrites:false}})});
  assert.equal((await changed).status,200);await page.waitForFunction(()=>companionRegistered&&companionReadOnly());
  mode=405;await page.evaluate(()=>boardsUI.refresh());await compatibility.waitFor({state:'visible'});
  assert.equal(await page.locator('#new-board').isDisabled(),true);
  mode=200;await compatibility.getByRole('button',{name:'Check again'}).click();
  await page.waitForFunction(()=>document.getElementById('sidebar-boards-compatibility').hidden);
  assert.equal(await page.locator('#new-board').isDisabled(),true,'recovering support does not grant write permission');
  assert.equal(boardWrites,1,'read-only refresh never writes a board');
  assert.deepEqual(errors,[]);
  console.log('PASS: old remote 404/405, notes usable, no unsupported writes, update recovery, transient/auth/document/write failure separation, read-only policy, local/remote scope reset.');
} finally {
  await browser?.close();await gateway?.close();
  if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
  await remote?.close();await rm(temporary,{recursive:true,force:true});
}
