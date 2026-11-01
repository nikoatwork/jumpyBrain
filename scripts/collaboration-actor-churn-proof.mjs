// Real shipped shell + default short-lived CLI processes. No actor-ID override,
// browser injection, shared personal root, or debug/auth bypass is involved.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import WebSocket from 'ws';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {appendEditorText,undoEditor} from './editor-smoke-helpers.mjs';

export async function runActorChurnProof({browser,errors=[]}){
  const [{startJumpyBrainHttpServer},{AccessStore},{applySourceSplices},{parseFrontmatter}]=await Promise.all([import('../dist/server/index.js'),import('../dist/adapters/access-control/index.js'),import('../dist/core/collaboration/index.js'),import('../dist/core/frontmatter.js')]);
  const root=await mkdtemp(path.join(tmpdir(),'jb-actor-churn-')),id='mem_91111111-1111-4111-8111-111111111116',token='disposable-actor-churn-key';
  const file=path.join(root,'notes/churn.md'),access=new AccessStore(root,{bootstrapKeys:[token]}),sockets=new Set();let server,context,reader;
  async function connect(credential,clientId,actorKind='human'){
    const ws=new WebSocket(server.url.replace(/^http/,'ws')+'/ws');sockets.add(ws);const pending=new Map();let serial=0,events=0;
    ws.on('message',raw=>{const packet=JSON.parse(raw.toString());if(packet.event==='document')events++;const waiter=pending.get(packet.id);if(waiter){clearTimeout(waiter.timer);pending.delete(packet.id);waiter.resolve(packet)}});
    ws.on('close',code=>{for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.resolve({ok:false,closeCode:code,error:{code:'connection_closed'}})}pending.clear()});
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
    const rpc=(method,params={})=>new Promise((resolve,reject)=>{const requestId=String(++serial),timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Actor lifecycle RPC timed out: '+method))},8000);pending.set(requestId,{resolve,timer});ws.send(JSON.stringify({id:requestId,method,params:{documentId:id,clientId,actorKind,...params}}))});
    const hello=await rpc('hello',{token:credential,protocol:2});
    const close=async()=>{if(ws.readyState===WebSocket.CLOSED)return;await new Promise(resolve=>{ws.once('close',resolve);ws.close()})};
    return {ws,rpc,hello,close,get events(){return events}};
  }
  async function cli(operation,extra=[],input='',credential=token){
    const env={...process.env,JUMPYBRAIN_API_KEY:credential};delete env.JUMPYBRAIN_CLIENT_ID;
    return await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['dist/cli.js','collaborate',operation,'--target-url',server.url,'--id',id,'--json',...extra],{env,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('CLI actor process timed out'))},15000);child.on('error',error=>{clearTimeout(timer);reject(error)});child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr,value:code===0?JSON.parse(stdout):undefined})});child.stdin.on('error',()=>{});child.stdin.end(input)});
  }
  const accepted=result=>{assert.equal(result.code,0,result.stderr||result.stdout);return result.value};
  const readVersion=base=>['--start',String(base.body.length),'--delete','0','--epoch',base.epoch,'--base-revision',String(base.revision)];
  try{
    await mkdir(path.join(root,'notes'));await writeFile(file,`---\nid: ${id}\ntype: note\ntitle: Actor churn\ncustom: retained\n---\nseed`);
    const readerCredential=await access.issue({name:'Lifecycle reader',role:'reader'}),agentCredential=await access.issue({name:'Lifecycle agent',role:'writer'});
    server=await startJumpyBrainHttpServer({root,apiKeys:[token],accessStore:access,port:0,autoIndex:false});context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${server.url}/?note=${id}#apiKey=${token}`);await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
    const waitSaved=body=>page.waitForFunction(body=>state.editor.collaboration.state.status==='saved'&&richEditor.getMarkdown()===body,body);
    await appendEditorText(page,'|human-before');assert.equal(await page.evaluate(()=>state.editor.flush()),true);
    let current=accepted(await cli('open')),expected='seed|human-before';assert.equal(current.body,expected);
    reader=await connect(readerCredential.token,'reader-lifecycle');assert.equal(reader.hello.ok,true);assert.equal((await reader.rpc('open')).ok,true);
    const actors=[];
    for(let index=0;index<132;index++){
      // The last confirmed response IS the read used to compute this offset.
      // Never open fresh and attach a revision to a previously calculated edit.
      const inserted=`|${String(index).padStart(3,'0')}`;const outcome=await cli('edit',readVersion(current),inserted);assert.equal(outcome.code,0,`Default CLI actor ${index+1}: ${outcome.stderr||outcome.stdout}`);current=outcome.value;expected+=inserted;actors.push(current.clientId);assert.equal(current.body,expected);await waitSaved(expected);
      if(index===69){await reader.close();reader=await connect(readerCredential.token,'reader-reconnected');assert.equal(reader.hello.ok,true);assert.equal((await reader.rpc('open')).result.body,expected)}
    }
    assert.equal(new Set(actors).size,132,'every ordinary CLI invocation has its own default actor');assert.ok(reader.events>50,'a reconnected reader continues receiving canonical publications');
    const beforeExpired=await readFile(file,'utf8'),expired=await cli('undo',['--client-id',actors[0]]);assert.notEqual(expired.code,0,'retired actor Undo fails explicitly');assert.match(expired.stderr,/history|retained|expired/i);assert.equal(await readFile(file,'utf8'),beforeExpired,'expired Undo cannot change canonical bytes');
    const old=await connect(token,actors[0]);assert.equal(old.hello.ok,true);await old.rpc('open');const expiredPacket=await old.rpc('undo',{epoch:current.epoch,operationId:crypto.randomUUID()});assert.equal(expiredPacket.ok,false);assert.equal(expiredPacket.error.code,'history_expired');await old.close();
    const history=await reader.rpc('history.read',{epoch:current.epoch,fromRevision:current.revision-128,toRevision:current.revision});assert.equal(history.ok,true,JSON.stringify(history));assert.equal(history.result.operations.length,128);assert.equal(history.result.operations.reduce((body,record)=>applySourceSplices(body,record.splices),'seed|human-before'+Array.from({length:4},(_,i)=>`|${String(i).padStart(3,'0')}`).join('')),expected,'authenticated retained history reconstructs exact current source');
    const expiredHistory=await reader.rpc('history.read',{epoch:current.epoch,fromRevision:0,toRevision:1});assert.equal(expiredHistory.ok,false);assert.equal(expiredHistory.error.code,'history_expired');const oversizedHistory=await reader.rpc('history.read',{epoch:current.epoch,fromRevision:0,toRevision:current.revision});assert.equal(oversizedHistory.ok,false);assert.equal(oversizedHistory.error.code,'history_limit');
    const denied=await reader.rpc('edit',{epoch:current.epoch,baseRevision:current.revision,operationId:crypto.randomUUID(),start:0,deleteCount:0,insert:'DENIED'});assert.equal(denied.ok,false);assert.equal((await reader.rpc('open')).result.body,expected);
    // This explicit stable actor disconnects after its command, survives new
    // actors and a new human, then reconnects to selectively Undo its own bytes.
    current=accepted(await cli('edit',[...readVersion(current),'--client-id','recent-stable-agent'],'|stable',agentCredential.token));expected+='|stable';
    for(let index=0;index<4;index++){const inserted=`|late${index}`;current=accepted(await cli('edit',readVersion(current),inserted));expected+=inserted}
    const freshPage=await context.newPage();freshPage.on('pageerror',error=>errors.push(error.message));await freshPage.goto(`${server.url}/?note=${id}`);await freshPage.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
    const beforeFreshUndo=await readFile(file,'utf8');await undoEditor(freshPage);await freshPage.locator('#toast-message').filter({hasText:/Undo history.*unavailable/i}).waitFor({state:'visible'});
    assert.deepEqual(await freshPage.evaluate(()=>({status:state.editor.collaboration.state.status,dirty:state.editor.collaboration.state.dirty,canWrite:state.editor.collaboration.state.canWrite})),{status:'saved',dirty:false,canWrite:true},'expired history informs the fresh human without blocking new work');assert.equal(await readFile(file,'utf8'),beforeFreshUndo,'expired human Undo is not a canonical mutation');
    await appendEditorText(freshPage,'|fresh-human');assert.equal(await freshPage.evaluate(()=>state.editor.flush()),true);expected+='|fresh-human';
    current=accepted(await cli('undo',['--client-id','recent-stable-agent'],'',agentCredential.token));expected=expected.replace('|stable','');assert.equal(current.body,expected,'recent stable CLI actor Undo preserves every other actor');await waitSaved(expected);
    const agent=await connect(agentCredential.token,'revocable-agent','agent');assert.equal(agent.hello.ok,true);assert.equal((await agent.rpc('open')).result.body,expected);await agent.close();const reconnectedAgent=await connect(agentCredential.token,'revocable-agent','agent');assert.equal(reconnectedAgent.hello.ok,true);assert.equal((await reconnectedAgent.rpc('open')).result.body,expected);
    for(const [client,issued]of[[reader,readerCredential],[reconnectedAgent,agentCredential]]){const closed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Revoked actor was not disconnected')),8000);client.ws.once('close',code=>{clearTimeout(timer);resolve(code)})});assert.equal(await access.revoke(issued.credential.id),true);assert.equal(await closed,1008);const rejected=await connect(issued.token,'rejected-reconnect');assert.equal(rejected.hello.ok,false,'revoked credential cannot reconnect');assert.equal(rejected.hello.closeCode,1008,'revoked reconnect is rejected by the authentication boundary');await rejected.close()}
    const replacementReader=await access.issue({name:'Replacement reader',role:'reader'}),replacementAgent=await access.issue({name:'Replacement agent',role:'writer'});reader=await connect(replacementReader.token,'replacement-reader');assert.equal(reader.hello.ok,true);assert.equal((await reader.rpc('open')).result.body,expected);current=accepted(await cli('open',[],'',replacementAgent.token));current=accepted(await cli('edit',readVersion(current),'|replacement-agent',replacementAgent.token));expected+='|replacement-agent';await waitSaved(expected);assert.equal((await reader.rpc('open')).result.body,expected);
    const canonical=parseFrontmatter(await readFile(file,'utf8'));assert.equal(canonical.body,expected);assert.equal(canonical.frontmatter.id,id);assert.equal(canonical.frontmatter.type,'note');assert.equal(canonical.frontmatter.title,'Actor churn');assert.equal(canonical.frontmatter.custom,'retained');assert.deepEqual(errors,[]);
    console.log('Default CLI actor churn: PASS (132 fresh CLI actors, retained-history bounds, expired Undo, fresh human, stable recent Undo, reader/agent reconnect and revocation).');
  }finally{for(const socket of sockets)socket.terminate();await context?.close();await server?.close();access.close();await rm(root,{recursive:true,force:true})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});try{await runActorChurnProof({browser})}finally{await browser.close()}}
